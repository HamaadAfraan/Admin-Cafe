import os

TVS = [
    {"ip": "192.168.1.150", "name": "TV 1 (SIM-1)"},
    {"ip": "192.168.1.151", "name": "TV 2 (SIM-2)"},
    {"ip": "192.168.1.155", "name": "TV 3 (PS5-3)"},
    {"ip": "192.168.1.156", "name": "TV 4 (PS5-4)"},
    {"ip": "192.168.1.157", "name": "TV 5 (PS4)"},
]

def run_morning_setup():
    print("==========================================")
    print("☀️  STRANGERS GAMING CAFE - MORNING SYNC")
    print("==========================================\n")
    
    for tv in TVS:
        port = input(f"Enter Wireless Debugging Port for {tv['name']}: ").strip()
        if port:
            os.system(f"adb connect {tv['ip']}:{port}")
            os.system(f"adb -s {tv['ip']}:{port} tcpip 5555")

    print("\n🔄 Locking all TVs to Port 5555...")
    os.system("adb disconnect")

    for tv in TVS:
        os.system(f"adb connect {tv['ip']}:5555")

    print("\n✅ ALL TVs LOCKED & CONNECTED TO 5555!")
    os.system("adb devices")

if __name__ == "__main__":
    run_morning_setup()