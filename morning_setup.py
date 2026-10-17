import os
import subprocess

TVS = [
    {"ip": "192.168.1.150", "name": "TV 1 (SIM-1)"},
    {"ip": "192.168.1.151", "name": "TV 2 (SIM-2)"},
    {"ip": "192.168.1.155", "name": "TV 3 (PS5-3)"},
    {"ip": "192.168.1.156", "name": "TV 4 (PS5-4)"},
    {"ip": "192.168.1.157", "name": "TV 5 (PS4)"},
    {"ip": "192.168.1.153", "name": "TV 6 (Direct-1)"},
    {"ip": "192.168.1.154", "name": "TV 7 (Direct-2)"},
]

def check_connection(ip):
    """TV pehle se 5555 par connect ho raha hai ya nahi check karega"""
    result = subprocess.run(f"adb connect {ip}:5555", shell=True, capture_output=True, text=True)
    if "connected to" in result.stdout.lower() and "failed" not in result.stdout.lower():
        return True
    return False

def run_morning_setup():
    print("==========================================")
    print("☀️  STRANGERS GAMING CAFE - MORNING SYNC")
    print("==========================================\n")

    failed_tvs = []

    print("🔍 Checking connection status for all 7 TVs on port 5555...\n")
    for tv in TVS:
        connected = check_connection(tv["ip"])
        if connected:
            print(f"✅ {tv['name']} ({tv['ip']}) - Connected successfully on 5555")
        else:
            print(f"❌ {tv['name']} ({tv['ip']}) - Failed to connect on 5555")
            failed_tvs.append(tv)

    # Agar koi TV 5555 par connect nahi hua, toh sirf unka port maangega
    if failed_tvs:
        print("\n------------------------------------------")
        print("⚠️ Some TVs need Wireless Debugging Port Sync:")
        print("------------------------------------------")
        for tv in failed_tvs:
            port = input(f"Enter Wireless Debugging Port for {tv['name']} ({tv['ip']}): ").strip()
            if port:
                os.system(f"adb connect {tv['ip']}:{port}")
                os.system(f"adb -s {tv['ip']}:{port} tcpip 5555")
        
        print("\n🔄 Refreshing ADB connections...")
        os.system("adb disconnect")

    print("\n🔗 Finalizing connection for all 7 TVs...")
    for tv in TVS:
        os.system(f"adb connect {tv['ip']}:5555")

    print("\n==========================================")
    print("✅ ALL 7 TVs SYNC PROCESS COMPLETED!")
    print("==========================================")
    os.system("adb devices")

if __name__ == "__main__":
    run_morning_setup()