import os
import platform
import shutil
import socket
import subprocess
import time
import json
import logging
import threading
from queue import Queue
from datetime import datetime
import requests
from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS

CLOUD_URL = "https://strangers-gaming-backend.onrender.com"
IS_CLOUD = os.environ.get("RENDER") is not None  # Automatically detect Render execution environment

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler()]
)

app = Flask(__name__)

# Complete CORS Support
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(BASE_DIR, ".output", "public")
LOCK_IMAGE_PATH = os.path.join(BASE_DIR, "assets", "lock.jpg")
BOOKINGS_FILE = os.path.join(BASE_DIR, "bookings.json")
CONFIG_FILE = os.path.join(BASE_DIR, "config.json")

LAST_REQUEST_TIMES = {}
PENDING_COMMANDS_QUEUE = Queue()  # Thread-safe queue for Cloud-to-Local bridge polling

# In-memory storage fallback
MEM_BOOKINGS_CACHE = []

PC_STATES = {
    "PC-1": "LOCKED",
    "PC-2": "LOCKED"
}
ACTIVE_SESSIONS = {}

DEFAULT_CAPACITIES = {
    "PS5_55": 2,
    "PS5_43": 2,
    "PS4": 1,
    "RC WHEEL": 2,
    "PC": 2
}

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

# --- SSH / Remote PC Lock Execution Helper ---
def execute_pc_command(ip, action):
    """Executes SSH / System Commands to Lock/Unlock Remote PCs."""
    if IS_CLOUD or not ip:
        return
    
    def _pc_task():
        try:
            logging.info(f"[PC CONTROL] Target IP: {ip} | Action: {action}")
            # If bridge runs directly on the local Windows PC
            if ip in ["127.0.0.1", "localhost", get_local_ip()]:
                if action in ["LOCK", "EXPIRE", "STOP", "SESSION_EXPIRE", "EXPIRE_LOCK", "END"]:
                    if platform.system() == "Windows":
                        subprocess.run("rundll32.exe user32.dll,LockWorkStation", shell=True)
                return

            # Remote PC execution over SSH
            ssh_user = "Administrator" # Adjust as needed for local client PCs
            if action in ["LOCK", "EXPIRE", "STOP", "SESSION_EXPIRE", "EXPIRE_LOCK", "END"]:
                cmd = f'ssh -o StrictHostKeyChecking=no -o ConnectTimeout=2 {ssh_user}@{ip} "rundll32.exe user32.dll,LockWorkStation"'
            elif action in ["UNLOCK", "WAKE", "START", "PLAY"]:
                cmd = f'ssh -o StrictHostKeyChecking=no -o ConnectTimeout=2 {ssh_user}@{ip} "powershell -command (New-Object -ComObject WScript.Shell).SendKeys(\'{{ESC}}\')"'
            else:
                return

            subprocess.run(cmd, shell=True, capture_output=True, timeout=3)
        except Exception as e:
            logging.error(f"[PC CONTROL ERROR] Failed to send {action} to PC at {ip}: {e}")

    thread = threading.Thread(target=_pc_task)
    thread.daemon = True
    thread.start()

# --- Time Parsing & Overlap Helper Functions ---
def parse_time_to_minutes(time_str):
    try:
        parts = time_str.strip().split(' ')
        time_parts = parts[0].split(':')
        hours = int(time_parts[0])
        minutes = int(time_parts[1])
        modifier = parts[1].upper() if len(parts) > 1 else 'AM'

        if modifier == 'PM' and hours < 12:
            hours += 12
        if modifier == 'AM' and hours == 12:
            hours = 0

        return hours * 60 + minutes
    except Exception:
        return 0

def is_slot_overlapping(slot_a, slot_b):
    try:
        if not slot_a or not slot_b or '-' not in slot_a or '-' not in slot_b:
            return slot_a.strip().lower() == slot_b.strip().lower()

        start_a_str, end_a_str = slot_a.split('-')
        start_b_str, end_b_str = slot_b.split('-')

        start_a = parse_time_to_minutes(start_a_str)
        end_a = parse_time_to_minutes(end_a_str)
        start_b = parse_time_to_minutes(start_b_str)
        end_b = parse_time_to_minutes(end_b_str)

        return start_a < end_b and end_a > start_b
    except Exception:
        return slot_a.strip().lower() == slot_b.strip().lower()

def load_station_capacities():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        except Exception as e:
            logging.error(f"[CONFIG ERROR] Could not read config.json: {e}")
    return DEFAULT_CAPACITIES

def get_adb_binary():
    if IS_CLOUD:
        return "adb"

    if platform.system() == "Windows":
        win_adb = os.path.join(BASE_DIR, "bin", "adb.exe")
        return win_adb if os.path.exists(win_adb) else "adb"
    else:
        mac_bin_adb = os.path.join(BASE_DIR, "bin", "adb")
        brew_adb = "/opt/homebrew/bin/adb"
        usr_adb = "/usr/local/bin/adb"
        system_adb = shutil.which("adb")

        if os.path.exists(mac_bin_adb): return mac_bin_adb
        elif os.path.exists(brew_adb): return brew_adb
        elif os.path.exists(usr_adb): return usr_adb
        elif system_adb: return system_adb
        return "adb"

ADB_BIN = get_adb_binary()

def ensure_adb_connected(ip):
    if IS_CLOUD or not ip: return
    try:
        subprocess.run(f'"{ADB_BIN}" connect {ip}:5555', shell=True, capture_output=True, timeout=2)
    except Exception:
        pass

def run_adb(ip, command, fast=True):
    if IS_CLOUD or not ip:
        return "Bypassed on Cloud"
    try:
        ensure_adb_connected(ip)
        timeout_sec = 2 if fast else 5
        full_cmd = f'"{ADB_BIN}" -s {ip}:5555 {command}'
        result = subprocess.run(full_cmd, shell=True, capture_output=True, text=True, timeout=timeout_sec)
        return result.stdout.strip()
    except Exception as e:
        return str(e)

def run_adb_async(ip, command, fast=True):
    if IS_CLOUD or not ip: return
    thread = threading.Thread(target=run_adb, args=(ip, command, fast))
    thread.daemon = True
    thread.start()

def switch_to_hdmi1(ip):
    if IS_CLOUD or not ip: return
    run_adb_async(ip, "shell am force-stop com.mobisystems.fileman", fast=True)
    google_intent = 'shell am start -a android.intent.action.VIEW -d "content://android.media.tv/passthrough/com.google.android.tvinput%2F.hardware.HardwareInputService%2FHW0" -f 0x10000000'
    run_adb_async(ip, google_intent, fast=True)

def apply_lock(ip):
    logging.info(f"[EXECUTING TV LOCK] Target IP: {ip}")
    if IS_CLOUD or not ip: return

    def _lock_task():
        run_adb(ip, "shell input keyevent 224", fast=True)
        tv_sdcard_dir = "/sdcard/lock.jpg"
        if os.path.exists(LOCK_IMAGE_PATH):
            run_adb(ip, f'push "{LOCK_IMAGE_PATH}" {tv_sdcard_dir}', fast=False)
            intent_cmd = f'shell am start -a android.intent.action.VIEW -d "file://{tv_sdcard_dir}" -t "image/*" --grant-read-uri-permission -f 0x10000000'
            run_adb(ip, intent_cmd, fast=True)

    thread = threading.Thread(target=_lock_task)
    thread.daemon = True
    thread.start()

KEY_EVENTS = {
    "HOME": "shell input keyevent 3",
    "BACK": "shell input keyevent 4",
    "UP": "shell input keyevent 19",
    "DOWN": "shell input keyevent 20",
    "LEFT": "shell input keyevent 21",
    "RIGHT": "shell input keyevent 22",
    "OK": "shell input keyevent 23",
    "VOL_UP": "shell input keyevent 24",
    "VOL_DOWN": "shell input keyevent 25",
    "MUTE": "shell input keyevent 164",
    "SLEEP": "shell input keyevent 223",
    "POWER_OFF": "shell input keyevent 223",
    "WAKE": "shell input keyevent 224",
    "WAKEUP": "shell input keyevent 224",
    "POWER_ON": "shell input keyevent 224",
    "UNLOCK": "shell input keyevent 224"
}

def load_bookings():
    global MEM_BOOKINGS_CACHE
    if CLOUD_URL and not IS_CLOUD:
        try:
            resp = requests.get(f"{CLOUD_URL}/api/bookings", timeout=3)
            if resp.status_code == 200:
                cloud_bookings = resp.json()
                if isinstance(cloud_bookings, list):
                    return cloud_bookings
        except Exception as e:
            logging.error(f"[CLOUD FETCH FAILED] Falling back to local state: {e}")

    if os.path.exists(BOOKINGS_FILE):
        try:
            with open(BOOKINGS_FILE, "r") as f:
                data = json.load(f)
                MEM_BOOKINGS_CACHE = data
                return data
        except Exception as e:
            logging.error(f"Error reading local bookings file: {e}")
    
    return MEM_BOOKINGS_CACHE

def save_bookings(bookings):
    global MEM_BOOKINGS_CACHE
    MEM_BOOKINGS_CACHE = bookings
    try:
        with open(BOOKINGS_FILE, "w") as f:
            json.dump(bookings, f, indent=2)
    except Exception as e:
        logging.error(f"Error writing bookings file (Cloud/Permission Warning): {e}")

@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        response = app.make_default_options_response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, ngrok-skip-browser-warning'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS, PUT'
        response.headers['ngrok-skip-browser-warning'] = 'true'
        return response

@app.after_request
def add_cors_and_ngrok_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS, PUT'
    response.headers['ngrok-skip-browser-warning'] = 'true'
    return response

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "cloud": IS_CLOUD, "timestamp": time.time()}), 200

@app.route('/api/pending-commands', methods=['GET', 'OPTIONS'])
def get_pending_commands():
    commands_to_send = []
    while not PENDING_COMMANDS_QUEUE.empty():
        commands_to_send.append(PENDING_COMMANDS_QUEUE.get())

    return jsonify({"status": "success", "commands": commands_to_send}), 200

@app.route('/lock.jpg', methods=['GET'])
def get_lock_image():
    if os.path.exists(LOCK_IMAGE_PATH):
        return send_file(LOCK_IMAGE_PATH, mimetype='image/jpeg')
    return "Image not found", 404

@app.route('/api/pc-status', methods=['GET'])
def get_pc_status():
    station_id = request.args.get('station_id', 'PC-1').upper()
    return jsonify({"status": PC_STATES.get(station_id, "LOCKED")})

@app.route('/api/public-status', methods=['GET'])
def get_public_status():
    status_map = {}
    now = time.time()
    for station_id, session in list(ACTIVE_SESSIONS.items()):
        if session.get("end_time", 0) > now:
            status_map[station_id] = "BUSY"
        else:
            ACTIVE_SESSIONS.pop(station_id, None)

    for pc_id, state in PC_STATES.items():
        if state == "UNLOCKED":
            status_map[pc_id] = "BUSY"

    return jsonify({"status": "success", "busy_stations": status_map}), 200

def process_control_logic(ip, action, station_id, minutes=60):
    now = time.time()
    req_key = f"{station_id}_{action}"
    if req_key in LAST_REQUEST_TIMES and (now - LAST_REQUEST_TIMES[req_key]) < 0.5:
        return {"status": "success", "message": "Ignored fast duplicate"}

    LAST_REQUEST_TIMES[req_key] = now
    logging.info(f"[EXECUTING] Station: {station_id} | Action: {action} | IP: {ip}")

    # Track active sessions
    if action in ["START", "PLAY", "RESUME", "INIT"]:
        ACTIVE_SESSIONS[station_id] = {"start_time": now, "end_time": now + (minutes * 60)}
    elif action in ["LOCK", "EXPIRE", "SESSION_EXPIRE", "EXPIRE_LOCK", "STOP", "END"]:
        ACTIVE_SESSIONS.pop(station_id, None)

    # --- SPECIFIC PC LOGIC ---
    if "PC" in station_id:
        if action in ["START", "PLAY", "RESUME", "INIT", "UNLOCK"]:
            PC_STATES[station_id] = "UNLOCKED"
            execute_pc_command(ip, "UNLOCK")
            return {"status": "success", "message": f"{station_id} UNLOCKED"}
        elif action in ["LOCK", "EXPIRE", "SESSION_EXPIRE", "EXPIRE_LOCK", "STOP", "END"]:
            PC_STATES[station_id] = "LOCKED"
            execute_pc_command(ip, "LOCK")
            return {"status": "success", "message": f"{station_id} LOCKED"}

    # --- SPECIFIC TV / CONSOLE ADB LOGIC ---
    if ip and not IS_CLOUD:
        if action in ["START", "PLAY", "RESUME", "INIT"]:
            run_adb_async(ip, "shell input keyevent 224", fast=True)
            run_adb_async(ip, "shell am force-stop com.mobisystems.fileman", fast=True)
            return {"status": "success", "message": f"{station_id} Session Started"}
        elif action in ["HDMI", "HDMI1"]:
            switch_to_hdmi1(ip)
            return {"status": "success", "message": f"{station_id} SWITCHED TO HDMI 1"}
        elif action in ["LOCK", "EXPIRE", "SESSION_EXPIRE", "EXPIRE_LOCK", "STOP", "END"]:
            apply_lock(ip)
            return {"status": "success", "message": f"{station_id} LOCKED"}
        elif action in KEY_EVENTS:
            run_adb_async(ip, KEY_EVENTS[action], fast=True)
            return {"status": "success", "message": f"{station_id} Key: {action}"}

    return {"status": "success", "message": f"{station_id} Processed"}

@app.route('/api/control', methods=['POST', 'OPTIONS'])
def handle_control():
    data = request.json or {}
    ip = data.get('ip', '')
    action = str(data.get('action', '')).upper().strip()
    station_id = str(data.get('station_id', 'Unknown')).upper()
    minutes = int(data.get("minutes", 60))

    res = process_control_logic(ip, action, station_id, minutes)
    
    if IS_CLOUD:
        PENDING_COMMANDS_QUEUE.put({
            "ip": ip,
            "action": action,
            "station_id": station_id,
            "minutes": minutes,
            "timestamp": time.time()
        })

    return jsonify(res), 200

def resolve_capacity_key(station_id, screen_val):
    s_id = str(station_id).upper().strip()
    scr = str(screen_val).strip()

    if "PS5" in s_id:
        if "55" in scr or "VIP" in scr:
            return "PS5_55"
        elif "43" in scr:
            return "PS5_43"
        return "PS5_55"
    elif "PS4" in s_id:
        return "PS4"
    elif "RC" in s_id or "WHEEL" in s_id or "SIMULATOR" in s_id:
        return "RC WHEEL"
    elif "PC" in s_id:
        return "PC"
    return s_id

@app.route('/api/bookings', methods=['GET', 'POST', 'OPTIONS'])
def handle_bookings():
    if request.method == 'POST':
        data = request.json or {}
        logging.info(f"[INCOMING BOOKING DATA]: {data}")

        if CLOUD_URL and not IS_CLOUD:
            try:
                requests.post(f"{CLOUD_URL}/api/bookings", json=data, timeout=3)
            except Exception as e:
                logging.error(f"[CLOUD SYNC FAILED ON POST]: {e}")

        booking_id = str(data.get("id") or f"STR-{int(time.time() % 10000)}")
        is_walkin = booking_id.startswith("WALKIN-")

        utr = str(
            data.get("utr") or 
            data.get("transactionId") or 
            data.get("transaction_id") or 
            data.get("utrNumber") or 
            ""
        ).strip()

        if not is_walkin and (not utr or utr.upper() in ["N/A", "NONE", ""] or len(utr) < 3):
            logging.error(f"[REJECTED BOOKING] Invalid or missing UTR in payload: {data}")
            return jsonify({"status": "error", "message": "Valid Transaction ID / UTR is required!"}), 400

        customer_name = str(data.get("customer_name") or data.get("name") or data.get("fullName") or "Guest")
        station_id = str(data.get("station_id") or data.get("category") or data.get("platform") or "General").strip()
        slot_time = str(data.get("slot_time") or data.get("slot") or data.get("selectedTimeSlot") or "Immediate").strip()
        screen_val = str(data.get("screen") or "").strip()

        phone_val = str(data.get("phone") or data.get("mobileNumber") or data.get("mobile") or "")
        price_val = data.get("price") or data.get("totalAmount") or data.get("amount") or 0

        raw_date = str(data.get("bookingDate") or data.get("booking_date") or data.get("date") or "Today").strip()
        extracted_date = "Today" if raw_date.lower() in ["today", ""] else raw_date

        created_time = str(data.get("created_time") or datetime.now().strftime("%I:%M %p"))

        bookings = load_bookings()

        station_capacities = load_station_capacities()
        target_cap_key = resolve_capacity_key(station_id, screen_val)
        max_cap = station_capacities.get(target_cap_key, DEFAULT_CAPACITIES.get(target_cap_key, 2))

        current_occupied_count = 0
        for b in bookings:
            if str(b.get("status")).upper() not in ["REJECTED", "CANCELLED"]:
                b_date = str(b.get("bookingDate") or b.get("booking_date") or b.get("date") or "Today").strip()
                b_slot = str(b.get("slot_time") or b.get("slot") or "").strip()
                b_station = str(b.get("station_id") or b.get("category") or "").strip()
                b_screen = str(b.get("screen") or "").strip()

                b_cap_key = resolve_capacity_key(b_station, b_screen)

                if (b_date.lower() == extracted_date.lower() and 
                    b_cap_key == target_cap_key and 
                    is_slot_overlapping(b_slot, slot_time)):
                    current_occupied_count += 1

        if current_occupied_count >= max_cap:
            logging.warning(f"[SLOT FULL REJECTION] {target_cap_key} is full for slot {slot_time} on {extracted_date} ({current_occupied_count}/{max_cap})")
            return jsonify({
                "status": "error", 
                "message": f"All units for {target_cap_key} are already booked for slot ({slot_time})!"
            }), 400

        new_booking = {
            "bookingDate": extracted_date,
            "booking_date": extracted_date,
            "category": station_id,
            "created_time": created_time,
            "customer_name": customer_name,
            "date": extracted_date,
            "duration": str(data.get("duration") or "1 hr"),
            "id": booking_id,
            "name": customer_name,
            "phone": phone_val,
            "price": price_val,
            "screen": screen_val,
            "slot": slot_time,
            "slot_time": slot_time,
            "station_id": station_id,
            "status": str(data.get("status") or ("APPROVED" if is_walkin else "PENDING")).upper(),
            "team": str(data.get("team") or data.get("players") or "1 Player"),
            "timestamp": time.time(),
            "utr": utr if utr else "WALKIN-CASH"
        }

        bookings.append(new_booking)
        save_bookings(bookings)

        logging.info(f"[BOOKING SUCCESS] ID: {booking_id} | Name: {customer_name} | Station: {target_cap_key}")
        return jsonify({"status": "success", "booking": new_booking}), 201

    bookings = load_bookings()
    return jsonify(bookings), 200

@app.route('/api/bookings/<booking_id>', methods=['DELETE', 'OPTIONS'])
def delete_booking(booking_id):
    if CLOUD_URL and not IS_CLOUD:
        try:
            requests.delete(f"{CLOUD_URL}/api/bookings/{booking_id}", timeout=3)
        except Exception as e:
            logging.error(f"[CLOUD DELETE FAILED]: {e}")

    bookings = load_bookings()
    filtered_bookings = [b for b in bookings if str(b.get("id")) != str(booking_id)]

    save_bookings(filtered_bookings)
    return jsonify({"status": "success", "message": f"Booking {booking_id} deleted"}), 200

@app.route('/api/bookings/action', methods=['POST', 'OPTIONS'])
def action_booking():
    data = request.json or {}
    booking_id = data.get("id")
    action = data.get("action")

    if CLOUD_URL and not IS_CLOUD:
        try:
            requests.post(f"{CLOUD_URL}/api/bookings/action", json=data, timeout=3)
        except Exception as e:
            logging.error(f"[CLOUD ACTION FAILED]: {e}")

    bookings = load_bookings()
    updated = False
    for b in bookings:
        if str(b.get("id")) == str(booking_id):
            b["status"] = "APPROVED" if action == "APPROVE" else "REJECTED"
            updated = True
            break

    if updated:
        save_bookings(bookings)
        return jsonify({"status": "success", "id": booking_id, "action": action}), 200

    return jsonify({"status": "error", "message": "Booking not found"}), 404

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    target_file = os.path.join(DIST_DIR, path)
    if path != "" and os.path.exists(target_file):
        return send_from_directory(DIST_DIR, path)
    index_path = os.path.join(DIST_DIR, 'index.html')
    if os.path.exists(index_path):
        return send_from_directory(DIST_DIR, 'index.html')
    return "Frontend Build Not Found!", 404

def cloud_polling_agent():
    if not CLOUD_URL or IS_CLOUD:
        return

    logging.info(f"[CLOUD SYNC ACTIVE] Polling cloud commands from: {CLOUD_URL}")
    while True:
        try:
            resp = requests.get(f"{CLOUD_URL}/api/pending-commands", timeout=3)
            if resp.status_code == 200:
                commands = resp.json().get("commands", [])
                for cmd in commands:
                    ip = cmd.get("ip")
                    action = cmd.get("action")
                    station_id = cmd.get("station_id")
                    minutes = cmd.get("minutes", 60)
                    process_control_logic(ip, action, station_id, minutes)
        except Exception:
            pass
        time.sleep(3)

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    local_ip = get_local_ip()
    
    if CLOUD_URL and not IS_CLOUD:
        t = threading.Thread(target=cloud_polling_agent)
        t.daemon = True
        t.start()

    print("==================================================")
    print("    STRANGERS GAMING CAFE - BACKEND BRIDGE         ")
    print("==================================================")
    print(f" * Server Host Port: {port}")
    if IS_CLOUD:
        print(" * Mode: CLOUD (Render Instance)")
    else:
        print(f" * Server Local IP: http://{local_ip}:{port}")
        if CLOUD_URL:
            print(f" * Cloud Bridge Connected to: {CLOUD_URL}")
    print("==================================================")
    
    app.run(host='0.0.0.0', port=port, debug=False)