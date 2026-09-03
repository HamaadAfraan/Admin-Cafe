import os
import platform
import shutil
import socket
import subprocess
import time
import json
import logging
import threading
from datetime import datetime
import requests
from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS

# --- CONFIGURATION FOR CLOUD & LOCAL MODE ---
CLOUD_URL = "https://strangers-gaming-backend.onrender.com"

# --- LOGGING SETUP ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler()]
)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(BASE_DIR, ".output", "public")
LOCK_IMAGE_PATH = os.path.join(BASE_DIR, "assets", "lock.jpg")
BOOKINGS_FILE = os.path.join(BASE_DIR, "bookings.json")

LAST_REQUEST_TIMES = {}

PC_STATES = {
    "PC-1": "LOCKED",
    "PC-2": "LOCKED"
}
ACTIVE_SESSIONS = {}

# --- UPDATED STATION CAPACITIES ---
STATION_CAPACITIES = {
    "PS5_55": 2,
    "PS5_43": 2,
    "PS5": 2,
    "PS4": 1,
    "RC WHEEL": 1,
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

def get_adb_binary():
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
    try:
        subprocess.run(f'"{ADB_BIN}" connect {ip}:5555', shell=True, capture_output=True, timeout=2)
    except Exception:
        pass

def run_adb(ip, command, fast=True):
    try:
        ensure_adb_connected(ip)
        timeout_sec = 2 if fast else 5
        full_cmd = f'"{ADB_BIN}" -s {ip}:5555 {command}'
        result = subprocess.run(full_cmd, shell=True, capture_output=True, text=True, timeout=timeout_sec)
        return result.stdout.strip()
    except Exception as e:
        return str(e)

def run_adb_async(ip, command, fast=True):
    thread = threading.Thread(target=run_adb, args=(ip, command, fast))
    thread.daemon = True
    thread.start()

def switch_to_hdmi1(ip):
    run_adb_async(ip, "shell am force-stop com.mobisystems.fileman", fast=True)
    google_intent = 'shell am start -a android.intent.action.VIEW -d "content://android.media.tv/passthrough/com.google.android.tvinput%2F.hardware.HardwareInputService%2FHW0" -f 0x10000000'
    run_adb_async(ip, google_intent, fast=True)

def apply_lock(ip):
    logging.info(f"[EXECUTING LOCK] Target IP: {ip}")
    def _lock_task():
        run_adb(ip, "shell input keyevent 224", fast=True)
        tv_sdcard_dir = "/sdcard/lock.jpg"
        if os.path.exists(LOCK_IMAGE_PATH):
            run_adb(ip, f'push "{LOCK_IMAGE_PATH}" {tv_sdcard_dir}', fast=False)
            intent_cmd = f'shell am start -a android.intent.action.VIEW -d "file://{tv_sdcard_dir}" -t "image/*" -f 0x10000000'
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
    if os.path.exists(BOOKINGS_FILE):
        try:
            with open(BOOKINGS_FILE, "r") as f:
                return json.load(f)
        except Exception as e:
            logging.error(f"Error reading bookings file: {e}")
            return []
    return []

def save_bookings(bookings):
    try:
        with open(BOOKINGS_FILE, "w") as f:
            json.dump(bookings, f, indent=2)
    except Exception as e:
        logging.error(f"Error saving bookings file: {e}")

@app.after_request
def add_cors_and_ngrok_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS, PUT'
    response.headers['ngrok-skip-browser-warning'] = 'true'
    return response

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

    if action in ["START", "PLAY", "RESUME", "INIT"]:
        ACTIVE_SESSIONS[station_id] = {"start_time": now, "end_time": now + (minutes * 60)}
    elif action in ["LOCK", "EXPIRE", "SESSION_EXPIRE", "EXPIRE_LOCK", "STOP", "END"]:
        ACTIVE_SESSIONS.pop(station_id, None)

    if "PC" in station_id:
        if action in ["START", "PLAY", "RESUME", "INIT", "UNLOCK"]:
            PC_STATES[station_id] = "UNLOCKED"
            return {"status": "success", "message": f"{station_id} UNLOCKED"}
        elif action in ["LOCK", "EXPIRE", "SESSION_EXPIRE", "EXPIRE_LOCK", "STOP", "END"]:
            PC_STATES[station_id] = "LOCKED"
            return {"status": "success", "message": f"{station_id} LOCKED"}

    if ip:
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
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    data = request.json or {}
    ip = data.get('ip', '')
    action = str(data.get('action', '')).upper().strip()
    station_id = str(data.get('station_id', 'Unknown')).upper()
    minutes = int(data.get("minutes", 60))

    res = process_control_logic(ip, action, station_id, minutes)
    return jsonify(res), 200

# --- ONLINE BOOKINGS API ---
@app.route('/api/bookings', methods=['GET', 'POST', 'OPTIONS'])
def handle_bookings():
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    if request.method == 'POST':
        data = request.json or {}
        logging.info(f"[INCOMING BOOKING DATA]: {data}")

        utr = str(
            data.get("utr") or 
            data.get("transactionId") or 
            data.get("transaction_id") or 
            data.get("utrNumber") or 
            ""
        ).strip()

        if not utr or utr.upper() in ["N/A", "NONE", ""] or len(utr) < 3:
            logging.error(f"[REJECTED BOOKING] Invalid or missing UTR in payload: {data}")
            return jsonify({"status": "error", "message": "Valid Transaction ID / UTR is required!"}), 400

        booking_id = str(data.get("id") or f"BK-{int(time.time())}")
        customer_name = str(data.get("customer_name") or data.get("name") or data.get("fullName") or "Guest")
        station_id = str(data.get("station_id") or data.get("category") or data.get("platform") or "General")
        slot_time = str(data.get("slot_time") or data.get("slot") or data.get("selectedTimeSlot") or "Immediate")
        screen_val = str(data.get("screen") or "")

        phone_val = str(data.get("phone") or data.get("mobileNumber") or data.get("mobile") or "")
        price_val = data.get("price") or data.get("totalAmount") or data.get("amount") or 0

        raw_date = str(data.get("bookingDate") or data.get("booking_date") or data.get("date") or "Today").strip()
        extracted_date = "Today" if raw_date.lower() in ["today", ""] else raw_date

        created_time = str(data.get("created_time") or datetime.now().strftime("%I:%M %p"))

        bookings = load_bookings()

        cap_key = f"{station_id.upper()}_{'55' if '55' in str(screen_val) else ('43' if '43' in str(screen_val) else '')}".strip("_")
        max_cap = STATION_CAPACITIES.get(cap_key, STATION_CAPACITIES.get(station_id.upper(), 2))

        current_occupied_count = 0
        for b in bookings:
            if str(b.get("status")).upper() not in ["REJECTED", "CANCELLED"]:
                b_date = str(b.get("bookingDate") or b.get("booking_date") or b.get("date") or "Today").strip()
                b_slot = str(b.get("slot_time") or b.get("slot") or "").strip()
                b_station = str(b.get("station_id") or b.get("category") or "").strip().lower()

                if b_date.lower() == extracted_date.lower() and b_slot == slot_time.strip() and b_station == station_id.strip().lower():
                    current_occupied_count += 1

        if current_occupied_count >= max_cap:
            return jsonify({
                "status": "error", 
                "message": "All screens/units are already booked for this slot!"
            }), 400

        new_booking = {
            "id": booking_id,
            "customer_name": customer_name,
            "name": customer_name,
            "phone": phone_val,
            "station_id": station_id,
            "category": station_id,
            "screen": screen_val,
            "duration": str(data.get("duration", "1 Hour")),
            "team": str(data.get("team") or data.get("players") or "1 Player"),
            "slot_time": slot_time,
            "slot": slot_time,
            "price": price_val,
            "utr": utr,
            "bookingDate": extracted_date,
            "booking_date": extracted_date,
            "date": extracted_date,
            "created_time": created_time,
            "status": "PENDING",
            "timestamp": time.time()
        }

        bookings.append(new_booking)
        save_bookings(bookings)

        logging.info(f"[ONLINE BOOKING SUCCESS] ID: {booking_id} | Name: {customer_name} | Booked @: {created_time}")
        return jsonify({"status": "success", "booking": new_booking}), 201

    bookings = load_bookings()
    return jsonify(bookings), 200

@app.route('/api/bookings/<booking_id>', methods=['DELETE', 'OPTIONS'])
def delete_booking(booking_id):
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    bookings = load_bookings()
    filtered_bookings = [b for b in bookings if str(b.get("id")) != str(booking_id)]

    if len(filtered_bookings) < len(bookings):
        save_bookings(filtered_bookings)
        return jsonify({"status": "success", "message": f"Booking {booking_id} deleted"}), 200

    return jsonify({"status": "error", "message": "Booking ID not found"}), 404

@app.route('/api/bookings/action', methods=['POST', 'OPTIONS'])
def action_booking():
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    data = request.json or {}
    booking_id = data.get("id")
    action = data.get("action")

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

# --- BACKGROUND CLOUD SYNC AGENT ---
def cloud_polling_agent():
    """Jab backend Cloud (Render) par active hoga, tab local bridge yahan se commands pull karega"""
    if not CLOUD_URL:
        return

    logging.info(f"[CLOUD SYNC ACTIVE] Polling cloud commands from: {CLOUD_URL}")
    while True:
        try:
            resp = requests.get(f"{CLOUD_URL}/api/pending-commands", timeout=5)
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
    local_ip = get_local_ip()
    
    if CLOUD_URL:
        t = threading.Thread(target=cloud_polling_agent)
        t.daemon = True
        t.start()

    print("==================================================")
    print("    STRANGERS GAMING CAFE - LOCAL BACKEND BRIDGE   ")
    print("==================================================")
    print(f" * Server Local IP: http://{local_ip}:5000")
    if CLOUD_URL:
        print(f" * Cloud Bridge Connected to: {CLOUD_URL}")
    print("==================================================")
    app.run(host='0.0.0.0', port=5000, debug=False)