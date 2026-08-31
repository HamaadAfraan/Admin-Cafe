import os
import platform
import shutil
import socket
import subprocess
import time
from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(BASE_DIR, ".output", "public")
LOCK_IMAGE_PATH = os.path.join(BASE_DIR, "assets", "lock.jpg")

LAST_REQUEST_TIMES = {}

# PC States Tracking Memory
PC_STATES = {
    "PC-1": "LOCKED",
    "PC-2": "LOCKED",
    "PC-3": "LOCKED",
    "PC-4": "LOCKED"
}

def get_local_ip():
    """Dynamically get the local LAN IP address of this Mac."""
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

def run_adb(ip, command, fast=True):
    try:
        timeout_sec = 2 if fast else 4
        full_cmd = f'"{ADB_BIN}" -s {ip}:5555 {command}'
        result = subprocess.run(full_cmd, shell=True, capture_output=True, text=True, timeout=timeout_sec)
        return result.stdout.strip()
    except Exception as e:
        return str(e)

def switch_to_hdmi1(ip):
    run_adb(ip, "shell am force-stop com.mobisystems.fileman", fast=True)
    google_intent = 'shell am start -a android.intent.action.VIEW -d "content://android.media.tv/passthrough/com.google.android.tvinput%2F.hardware.HardwareInputService%2FHW0" -f 0x10000000'
    run_adb(ip, google_intent, fast=True)

def apply_lock(ip):
    print(f"[EXECUTING LOCK] Target IP: {ip}")
    run_adb(ip, "shell input keyevent 224", fast=True)
    
    tv_sdcard_dir = "/sdcard/lock.jpg"

    if os.path.exists(LOCK_IMAGE_PATH):
        run_adb(ip, f'push "{LOCK_IMAGE_PATH}" {tv_sdcard_dir}', fast=False)
        intent_cmd = f'shell am start -a android.intent.action.VIEW -d "file://{tv_sdcard_dir}" -t "image/*" -f 0x10000000'
        run_adb(ip, intent_cmd, fast=True)

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

# --- STATIC FRONTEND DASHBOARD ROUTE ---
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    target_file = os.path.join(DIST_DIR, path)
    if path != "" and os.path.exists(target_file):
        return send_from_directory(DIST_DIR, path)
    
    index_path = os.path.join(DIST_DIR, 'index.html')
    if os.path.exists(index_path):
        return send_from_directory(DIST_DIR, 'index.html')
    
    return "Frontend Build Not Found! Please ensure index.html exists in .output/public.", 404

# --- API ENDPOINTS ---
@app.route('/lock.jpg', methods=['GET'])
def get_lock_image():
    if os.path.exists(LOCK_IMAGE_PATH):
        return send_file(LOCK_IMAGE_PATH, mimetype='image/jpeg')
    return "Image not found", 404

@app.route('/api/pc-status', methods=['GET'])
def get_pc_status():
    station_id = request.args.get('station_id', 'PC-1').upper()
    return jsonify({"status": PC_STATES.get(station_id, "LOCKED")})

@app.route('/api/control', methods=['POST', 'OPTIONS'])
def handle_control():
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    data = request.json or {}
    ip = data.get('ip', '')
    action = str(data.get('action', '')).upper().strip()
    station_id = str(data.get('station_id', 'Unknown')).upper()

    req_key = f"{station_id}_{action}"
    now = time.time()
    if req_key in LAST_REQUEST_TIMES and (now - LAST_REQUEST_TIMES[req_key]) < 0.5:
        return jsonify({"status": "success", "message": "Ignored fast duplicate"}), 200
    
    LAST_REQUEST_TIMES[req_key] = now

    print(f"[REQUEST] Station: {station_id} | Action: {action} | IP: {ip}")

    # PC Control Logic
    if "PC" in station_id:
        if action in ["START", "PLAY", "RESUME", "INIT", "UNLOCK"]:
            PC_STATES[station_id] = "UNLOCKED"
            return jsonify({"status": "success", "message": f"{station_id} UNLOCKED"}), 200
        elif action in ["LOCK", "EXPIRE", "SESSION_EXPIRE", "EXPIRE_LOCK", "STOP", "END"]:
            PC_STATES[station_id] = "LOCKED"
            return jsonify({"status": "success", "message": f"{station_id} LOCKED"}), 200

    # Android TV Control Logic
    if ip:
        if action in ["START", "PLAY", "RESUME", "INIT"]:
            run_adb(ip, "shell input keyevent 224", fast=True)
            run_adb(ip, "shell am force-stop com.mobisystems.fileman", fast=True)
            return jsonify({"status": "success", "message": f"{station_id} Session Started"}), 200

        elif action in ["HDMI", "HDMI1"]:
            switch_to_hdmi1(ip)
            return jsonify({"status": "success", "message": f"{station_id} SWITCHED TO HDMI 1"}), 200

        elif action in ["LOCK", "EXPIRE", "SESSION_EXPIRE", "EXPIRE_LOCK", "STOP", "END"]:
            apply_lock(ip)
            return jsonify({"status": "success", "message": f"{station_id} LOCKED"}), 200

        elif action in KEY_EVENTS:
            run_adb(ip, KEY_EVENTS[action], fast=True)
            return jsonify({"status": "success", "message": f"{station_id} Key: {action}"}), 200

    return jsonify({"status": "success", "message": f"{station_id} Processed"}), 200

if __name__ == '__main__':
    local_ip = get_local_ip()
    print("==================================================")
    print("    STRANGERS GAMING CAFE - LOCAL BACKEND BRIDGE   ")
    print("==================================================")
    print(f" * Server Local IP: http://{local_ip}:5000")
    print(f" * ADB Binary Path: {ADB_BIN}")
    print("==================================================")
    app.run(host='0.0.0.0', port=5000, debug=False)