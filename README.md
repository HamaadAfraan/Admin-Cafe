# Nexus Command Center

Build a modern, dark-themed Gaming Cafe Management Admin Dashboard for a shop with 14 gaming stations.

### Station Configuration:

- 8 PS5 Stations (labeled PS5-01 through PS5-08)

- 3 Gaming PCs (labeled PC-01 through PC-03)

- 3 Racing Simulators (labeled SIM-01 through SIM-03)

### Key UI Features:

1. Header Bar:

   - Cafe Logo / Title: "NEXUS GAMING LOUNGE"

   - Quick Summary Counters: Total Stations (14), Active Sessions, Idle Stations, Total Revenue Today.

   - Filter Tabs: [All Stations] [PS5s] [PCs] [Simulators]

2. Station Cards Grid:

   - Display each station as a sleek card.

   - Status Badge: 

     - GREEN when IDLE ("Available")

     - RED/ORANGE when ACTIVE ("In Session")

     - FLASHING RED when less than 5 minutes remain ("Expiring Soon")

   - For IDLE Stations:

     - Input field for Customer Name / Phone (Optional).

     - Quick Start Buttons: [+30 Mins], [+1 Hour], [+2 Hours], [Custom Time].

     - "START SESSION" button.

   - For ACTIVE Stations:

     - Large live counting down timer (MM:SS or HH:MM:SS).

     - Progress bar showing elapsed vs. total time.

     - Quick Action Buttons: [+15 Mins], [+30 Mins], [+1 Hour], [PAUSE], and a red [FORCE LOCK NOW] button.

3. System & Network Settings Drawer / Modal:

   - A settings tab to configure IP addresses for each station:

     - For PS5/Sims: TV Static IP address (e.g., 192.168.1.101).

     - For PCs: PC Local IP / Hostname.

   - Local Bridge URL setting field (Default: `http://localhost:5000`).

4. Webhook Automation Logic:

   - When a session starts or time expires, trigger an HTTP POST request to the Local Bridge URL (`http://localhost:5000/api/control`):

     - `POST /api/control` with JSON payload:

       `{ "station_id": "PS5-01", "action": "START", "ip": "192.168.1.101", "duration_minutes": 60 }`

     - When a session timer hits 00:00 or [FORCE LOCK NOW] is clicked:

       `{ "station_id": "PS5-01", "action": "LOCK", "ip": "192.168.1.101" }`

5. Design Style:

   - Cyberpunk / Modern Esports aesthetic (Dark slate background #0F172A, Neon Green #22C55E for active/available, Red #EF4444 for locked/expired, Cyan/Purple accents).

   - Card layout optimized for standard 1080p laptop screen scannability.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://strangersgamingcafe.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/824a3491-5977-41f4-af21-396172c9aed6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
# Admin-Cafe
