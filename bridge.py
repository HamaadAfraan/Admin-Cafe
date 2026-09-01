os import
import time
import json
import logging
import subprocess
from flask import Flask, request, jsonify
from flask_cors import CORS

# --- CONFIGURATION & LOGGING SETUP ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)

app = Flask(__name__)
CORS(app)  # Enable Cross-Origin requests for local & web dashboard

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BOOKINGS_FILE = os.path.join(BASE_DIR, "bookings.json")

# Persistent State Management
PC_STATES = {}       # Traces PC unlocks/locks
ACTIVE_SESSIONS = {} # Live session tracker for TVs and Simulators

# --- HELPER FUNCTIONS FOR BOOKINGS FILE ---
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

# --- ADB EXECUTION WRAPPER ---
def run_adb_command(ip, command):
    """Executes ADB shell commands to target TV IP safely"""
    try:
        # Step 1: Ensure connected
        subprocess.run(["adb", "connect", f"{ip}:5555"], timeout=3, capture_output=True)
        # Step 2: Execute command
        full_cmd = f"adb -s {ip}:5555 {command}"
        result = subprocess.run(full_cmd, shell=True, timeout=5, capture_output=True, text=True)
        logging.info(f"ADB output [{ip}]: {result.stdout.strip()}")
        return True
    except Exception as e:
        logging.error(f"ADB Error on {ip}: {e}")
        return False

# --- API ROUTES ---

@app.route('/health', methods=['GET'])
def health_check():
    """Simple ping check for backend availability"""
    return jsonify({"status": "online", "timestamp": time.time()}), 200

# 1. PUBLIC STATUS API (Customer Website Realtime Sync)
@app.route('/api/public-status', methods=['GET'])
def get_public_status():
    """Returns status of all stations (BUSY vs AVAILABLE) for customer app"""
    status_map = {}
    now = time.time()
    
    # Active TV/Sim sessions check
    for station_id, session in list(ACTIVE_SESSIONS.items()):
        if session.get("end_time", 0) > now:
            status_map[station_id] = "BUSY"
        else:
            del ACTIVE_SESSIONS[station_id]
            
    # Active PC state check
    for pc_id, state in PC_STATES.items():
        if state == "UNLOCKED":
            status_map[pc_id] = "BUSY"

    return jsonify({
        "status": "success", 
        "busy_stations": status_map
    }), 200

# 2. HARDWARE CONTROL API (StationCard & Manager execution)
@app.route('/api/control', methods=['POST', 'OPTIONS'])
def control_station():
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    data = request.json or {}
    station_id = data.get("station_id")
    action = data.get("action")
    ip = data.get("ip")
    minutes = int(data.get("minutes", 60))

    if not station_id or not action:
        return jsonify({"status": "error", "message": "Missing station_id or action"}), 400

    logging.info(f"[CONTROL COMMAND] Station: {station_id} | Action: {action} | IP: {ip}")

    # Session Time Tracking Updates
    if action in ["START", "PLAY", "RESUME", "INIT"]:
        ACTIVE_SESSIONS[station_id] = {
            "start_time": time.time(),
            "end_time": time.time() + (minutes * 60)
        }
    elif action in ["LOCK", "EXPIRE", "STOP", "END", "POWER_OFF"]:
        if station_id in ACTIVE_SESSIONS:
            del ACTIVE_SESSIONS[station_id]

    # Handle ADB actions for TV display management
    if ip:
        if action == "POWER_ON":
            run_adb_command(ip, "shell input keyevent 26") # KEYCODE_POWER / WAKEUP
        elif action == "POWER_OFF":
            run_adb_command(ip, "shell input keyevent 223") # KEYCODE_SLEEP
        elif action == "HDMI":
            run_adb_command(ip, "shell input keyevent 243") # KEYCODE_TV_INPUT_HDMI_1
        elif action == "HDMI2":
            run_adb_command(ip, "shell input keyevent 244") # KEYCODE_TV_INPUT_HDMI_2
        elif action == "LOCK":
            run_adb_command(ip, "shell am start -a android.intent.action.MAIN -c android.intent.category.HOME")
        elif action == "UP":
            run_adb_command(ip, "shell input keyevent 19")
        elif action == "DOWN":
            run_adb_command(ip, "shell input keyevent 20")
        elif action == "LEFT":
            run_adb_command(ip, "shell input keyevent 21")
        elif action == "RIGHT":
            run_adb_command(ip, "shell input keyevent 22")
        elif action == "OK":
            run_adb_command(ip, "shell input keyevent 66")
        elif action == "HOME":
            run_adb_command(ip, "shell input keyevent 3")
        elif action == "BACK":
            run_adb_command(ip, "shell input keyevent 4")
        elif action == "MUTE":
            run_adb_command(ip, "shell input keyevent 164")
        elif action == "VOL_UP":
            run_adb_command(ip, "shell input keyevent 24")
        elif action == "VOL_DOWN":
            run_adb_command(ip, "shell input keyevent 25")

    return jsonify({"status": "success", "station_id": station_id, "action": action}), 200

# 3. ONLINE BOOKINGS API (Customer Website & Admin Dashboard)
@app.route('/api/bookings', methods=['GET', 'POST', 'OPTIONS'])
def handle_bookings():
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    # Booking Creation (Called by Customer Website)
    if request.method == 'POST':
        data = request.json or {}

        # Fix ID Mismatch: Prioritize Frontend Booking ID (e.g. STR-4010)
        booking_id = data.get("id") or f"BK-{int(time.time())}"
        
        # Support both naming formats (customer site vs admin dashboard)
        customer_name = data.get("customer_name") or data.get("name") or "Guest"
        station_id = data.get("station_id") or data.get("category") or "General"
        slot_time = data.get("slot_time") or data.get("slot") or "Immediate"

        new_booking = {
            "id": booking_id,
            "customer_name": customer_name,
            "phone": data.get("phone", ""),
            "station_id": station_id,
            "screen": data.get("screen"),
            "duration": data.get("duration", "1 Hour"),
            "team": data.get("team", "1 Player"),
            "slot_time": slot_time,
            "price": data.get("price", 0),
            "utr": data.get("utr", "N/A"),
            "date": data.get("date", ""),
            "status": "PENDING",  # PENDING, APPROVED, REJECTED
            "timestamp": time.time()
        }
        
        bookings = load_bookings()
        bookings.append(new_booking)
        save_bookings(bookings)
        
        logging.info(f"[ONLINE BOOKING RECEIVED] ID: {booking_id} | Name: {customer_name} | Slot: {slot_time}")
        return jsonify({"status": "success", "booking": new_booking}), 201

    # Get All Bookings (Called by Dashboard)
    bookings = load_bookings()
    return jsonify({"status": "success", "bookings": bookings}), 200

# 4. ADMIN BOOKING ACTION API (Approve/Reject)
@app.route('/api/bookings/action', methods=['POST', 'OPTIONS'])
def action_booking():
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    data = request.json or {}
    booking_id = data.get("id")
    action = data.get("action")  # "APPROVE" or "REJECT"

    bookings = load_bookings()
    updated = False
    for b in bookings:
        if b["id"] == booking_id:
            b["status"] = "APPROVED" if action == "APPROVE" else "REJECTED"
            updated = True
            break
            
    if updated:
        save_bookings(bookings)
        return jsonify({"status": "success", "id": booking_id, "action": action}), 200
    
    return jsonify({"status": "error", "message": "Booking not found"}), 404


if __name__ == '__main__':
    logging.info("Starting Stranger's Gaming Cafe Bridge Server on Port 5000...")
    app.run(host='0.0.0.0', port=5000, debug=False)