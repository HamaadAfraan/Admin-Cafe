import os
import platform
import shutil
import socket
import subprocess
import time
import logging
import threading
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler()]
)

app = Flask(__name__)

# Complete CORS Support across all routes
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOCK_IMAGE_PATH = os.path.join(BASE_DIR, "assets", "lock.jpg")

LAST_REQUEST_TIMES = {}

PC_STATES = {
    "PC-1": "LOCKED",
    "PC-2": "LOCKED"
}

# --- Specific SSH Scheduled Task Lock Mapping ---
PC_SSH_CONFIGS = {
    "192.168.1.50": 'ssh -o BatchMode=yes stranger-main@192.168.1.50 "schtasks /run /tn LockStrangerMain"',
    "192.168.1.51": 'ssh -o BatchMode=yes stranger@192.168.1.51 "schtasks /run /tn LockMyPC"',
    "192.168.1.53": 'ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "truck simulator"@192.168.1.53 "schtasks /run /tn LockTruckSimulator"'
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
    if not ip:
        return
    
    def _pc_task():
        try:
            logging.info(f"[PC CONTROL] Target IP: {ip} | Action: {action}")
            if action in ["LOCK", "EXPIRE", "STOP", "SESSION_EXPIRE", "EXPIRE_LOCK", "END", "POWER_OFF"]:
                cmd = PC_SSH_CONFIGS.get(ip)
                if cmd:
                    subprocess.run(cmd, shell=True, capture_output=True, timeout=3)
                else:
                    if ip in ["127.0.0.1", "localhost", get_local_ip()]:
                        if platform.system() == "Windows":
                            subprocess.run(["rundll32.exe", "user32.dll,LockWorkStation"], shell=False)
        except Exception as e:
            logging.error(f"[PC CONTROL ERROR] Failed to send {action} to PC at {ip}: {e}")

    threading.Thread(target=_pc_task, daemon=True).start()

def get_adb_binary():
    if platform.system() == "Windows":
        win_adb = os.path.join(BASE_DIR, "bin", "adb.exe")
        return win_adb if os.path.exists(win_adb) else "adb"
    else:
        mac_bin_adb = os.path.join(BASE_DIR, "bin", "adb")
        system_adb = shutil.which("adb")
        if os.path.exists(mac_bin_adb): return mac_bin_adb
        elif system_adb: return system_adb
        return "adb"

ADB_BIN = get_adb_binary()

def ensure_adb_connected(ip):
    if not ip: return
    try:
        subprocess.run([ADB_BIN, "connect", f"{ip}:5555"], capture_output=True, timeout=1)
    except Exception:
        pass

def run_adb(ip, args_list, fast=True):
    if not ip:
        return "Bypassed"
    try:
        ensure_adb_connected(ip)
        timeout_sec = 1.5 if fast else 3
        full_cmd = [ADB_BIN, "-s", f"{ip}:5555"] + args_list
        result = subprocess.run(full_cmd, capture_output=True, text=True, timeout=timeout_sec)
        return result.stdout.strip()
    except Exception as e:
        return str(e)

def run_adb_async(ip, args_list, fast=True):
    if not ip: return
    threading.Thread(target=run_adb, args=(ip, args_list, fast), daemon=True).start()

def switch_to_hdmi1(ip):
    if not ip: return
    run_adb_async(ip, ["shell", "am", "force-stop", "com.mobisystems.fileman"], fast=True)
    google_uri = "content://android.media.tv/passthrough/com.google.android.tvinput%2F.hardware.HardwareInputService%2FHW0"
    google_intent = ["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", google_uri, "-f", "0x10000000"]
    run_adb_async(ip, google_intent, fast=True)

def apply_lock(ip):
    logging.info(f"[EXECUTING TV INSTANT LOCK] Target IP: {ip}")
    if not ip: return

    def _lock_task():
        # Wake up screen instantly
        run_adb(ip, ["shell", "input", "keyevent", "224"], fast=True)
        tv_sdcard_dir = "/sdcard/lock.jpg"
        
        # Open existing lock image directly from TV storage without pushing every time (Super Fast)
        intent_cmd = ["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", f"file://{tv_sdcard_dir}", "-t", "image/*", "--grant-read-uri-permission", "-f", "0x10000000"]
        run_adb(ip, intent_cmd, fast=True)

    threading.Thread(target=_lock_task, daemon=True).start()

KEY_EVENTS = {
    "HOME": ["shell", "input", "keyevent", "3"],
    "BACK": ["shell", "input", "keyevent", "4"],
    "UP": ["shell", "input", "keyevent", "19"],
    "DOWN": ["shell", "input", "keyevent", "20"],
    "LEFT": ["shell", "input", "keyevent", "21"],
    "RIGHT": ["shell", "input", "keyevent", "22"],
    "OK": ["shell", "input", "keyevent", "23"],
    "VOL_UP": ["shell", "input", "keyevent", "24"],
    "VOL_DOWN": ["shell", "input", "keyevent", "25"],
    "MUTE": ["shell", "input", "keyevent", "164"],
    "SLEEP": ["shell", "input", "keyevent", "223"],
    "POWER_OFF": ["shell", "input", "keyevent", "223"],
    "WAKE": ["shell", "input", "keyevent", "224"],
    "WAKEUP": ["shell", "input", "keyevent", "224"],
    "POWER_ON": ["shell", "input", "keyevent", "224"],
    "UNLOCK": ["shell", "input", "keyevent", "224"]
}

@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        response = app.make_default_options_response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, ngrok-skip-browser-warning'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response.headers['ngrok-skip-browser-warning'] = 'true'
        return response

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['ngrok-skip-browser-warning'] = 'true'
    return response

@app.route('/health', methods=['GET'], strict_slashes=False)
def health_check():
    return jsonify({"status": "healthy", "timestamp": time.time()}), 200

# Dummy bookings endpoint to prevent 404 spam from frontend polling
@app.route('/api/bookings', methods=['GET', 'OPTIONS'], strict_slashes=False)
def handle_dummy_bookings():
    return jsonify([]), 200

@app.route('/lock.jpg', methods=['GET'], strict_slashes=False)
def get_lock_image():
    if os.path.exists(LOCK_IMAGE_PATH):
        return send_file(LOCK_IMAGE_PATH, mimetype='image/jpeg')
    return "Image not found", 404

@app.route('/api/pc-status', methods=['GET'], strict_slashes=False)
def get_pc_status():
    station_id = request.args.get('station_id', 'PC-1').upper()
    return jsonify({"status": PC_STATES.get(station_id, "LOCKED")})

@app.route('/api/control', methods=['POST', 'OPTIONS'], strict_slashes=False)
def handle_control():
    data = request.get_json(silent=True) or {}
    ip = data.get('ip', '')
    action = str(data.get('action', '')).upper().strip()
    station_id = str(data.get('station_id', 'Unknown')).upper()

    now = time.time()
    req_key = f"{station_id}_{action}"
    if req_key in LAST_REQUEST_TIMES and (now - LAST_REQUEST_TIMES[req_key]) < 0.2:
        return jsonify({"status": "success", "message": "Ignored fast duplicate"}), 200

    LAST_REQUEST_TIMES[req_key] = now
    logging.info(f"[EXECUTING] Station: {station_id} | Action: {action} | IP: {ip}")

    # Handle PC / SSH Control
    if "PC" in station_id or "TRUCK" in station_id or ip in PC_SSH_CONFIGS:
        if action in ["START", "PLAY", "RESUME", "INIT", "UNLOCK", "POWER_ON"]:
            PC_STATES[station_id] = "UNLOCKED"
            execute_pc_command(ip, "UNLOCK")
            return jsonify({"status": "success", "message": f"{station_id} UNLOCKED"}), 200
        elif action in ["LOCK", "EXPIRE", "SESSION_EXPIRE", "EXPIRE_LOCK", "STOP", "END", "POWER_OFF"]:
            PC_STATES[setup_id := station_id] = "LOCKED" # safe fallback
            PC_STATES[station_id] = "LOCKED"
            execute_pc_command(ip, "LOCK")
            return jsonify({"status": "success", "message": f"{station_id} LOCKED"}), 200

    # Handle ADB / TV Control
    if ip:
        if action in ["START", "PLAY", "RESUME", "INIT", "POWER_ON"]:
            run_adb_async(ip, ["shell", "input", "keyevent", "224"], fast=True)
            run_adb_async(ip, ["shell", "am", "force-stop", "com.mobisystems.fileman"], fast=True)
            return jsonify({"status": "success", "message": f"{station_id} Session Started"}), 200
        elif action in ["HDMI", "HDMI1"]:
            switch_to_hdmi1(ip)
            return jsonify({"status": "success", "message": f"{station_id} SWITCHED TO HDMI 1"}), 200
        elif action in ["LOCK", "EXPIRE", "SESSION_EXPIRE", "EXPIRE_LOCK"]:
            apply_lock(ip)
            return jsonify({"status": "success", "message": f"{station_id} LOCKED"}), 200
        elif action in ["STOP", "END", "POWER_OFF"]:
            run_adb_async(ip, ["shell", "input", "keyevent", "223"], fast=True)
            return jsonify({"status": "success", "message": f"{station_id} Powered Off"}), 200
        elif action in KEY_EVENTS:
            run_adb_async(ip, KEY_EVENTS[action], fast=True)
            return jsonify({"status": "success", "message": f"{station_id} Key: {action}"}), 200

    return jsonify({"status": "success", "message": f"{station_id} Processed"}), 200

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    local_ip = get_local_ip()

    print("==================================================")
    print("    STRANGERS GAMING CAFE - FAST WAITRESS BRIDGE  ")
    print("==================================================")
    print(f" * Server Host Port: {port}")
    print(f" * Server Local IP: http://{local_ip}:{port}")
    print("==================================================")
    
    try:
        from waitress import serve
        serve(app, host='0.0.0.0', port=port, threads=8)
    except ImportError:
        app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
