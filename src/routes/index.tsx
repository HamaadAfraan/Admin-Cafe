import { useMemo, useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  CircleDot,
  MonitorSmartphone,
  FileText,
  Search,
  X,
  IndianRupee,
  CalendarClock,
  Gamepad2,
  History,
  Download,
  Clock,
  Save,
  Users,
  Calendar
} from "lucide-react";
import { StationCard } from "@/components/StationCard";
import { SettingsDialog } from "@/components/SettingsDialog";
import { BookingsModal } from "@/components/BookingsModal";
import { ConsoleScheduleModal } from "@/components/ConsoleScheduleModal";
import { UserProfilesModal } from "@/components/UserProfilesModal";
import { useStationManager, type SessionRecord } from "@/hooks/useStationManager";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Station, StationKind } from "@/lib/stations";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import viteConfig from "../../vite.config";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "STRANGER'S GAMING CAFE" },
      {
        name: "description",
        content:
          "Live admin dashboard to start, extend and lock gaming stations — PS5 consoles, PS4, gaming PCs and racing simulators.",
      },
      { property: "og:title", content: "Stranger's Gaming Cafe — Control Dashboard" },
      {
        property: "og:description",
        content: "Real-time session timers and network lock automation for your gaming cafe.",
      },
    ],
  }),
  component: Dashboard,
});

const getApiBaseUrl = () => {
  if (typeof window !== "undefined") {
    const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;
    if (envUrl) return envUrl.replace(/\/+$/, "");
    return `${window.location.protocol}//${window.location.hostname}:5000`;
  }
  return 'https://strangers-gaming-backend.onrender.com';
};

const STATION_NAMES: Record<string, string> = {
  "SIM-01": "Car-Sim-1",
  "SIM-02": "Car-Sim-2",
  "PS5-01": "PS5-01",
  "PS5-02": "PS5-02",
  "PS5-03": "PS5-03",
  "PS5-04": "PS5-04",
  "PS4-01": "PS4-01",
  "SIM-03": "Truck-Sim-1",
  "PC-01": "PC-01",
  "PC-02": "PC-02",
};

function formatExactDate(record: SessionRecord): string {
  if (record.timestamp) {
    const d = new Date(record.timestamp);
    const day = String(d.getDate()).padStart(2, '0');
    const month = d.toLocaleString('en-IN', { month: 'short' });
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }

  if (record.date) {
    return record.date;
  }

  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-IN', { month: 'short' });
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

const CAFE_STATIONS: Station[] = [
  { id: "SIM-01", name: "Car-Sim-1", kind: "sim", ip: "192.168.1.150" },
  { id: "SIM-02", name: "Car-Sim-2", kind: "sim", ip: "192.168.1.151" },
  { id: "PS5-01", name: "PS5-01", kind: "ps5", ip: "192.168.1.153" },
  { id: "PS5-02", name: "PS5-02", kind: "ps5", ip: "192.168.1.154" },
  { id: "PS5-03", name: "PS5-03", kind: "ps5", ip: "192.168.1.155" },
  { id: "PS5-04", name: "PS5-04", kind: "ps5", ip: "192.168.1.156" },
  { id: "PS4-01", name: "PS4-01", kind: "ps4", ip: "192.168.1.157" },
  { id: "SIM-03", name: "Truck-Sim-1", kind: "pc", ip: "192.168.1.52", hostname: "stranger-pc-3" },
  { id: "PC-01", name: "PC-01", kind: "pc", ip: "192.168.1.50", hostname: "stranger-pc-1" },
  { id: "PC-02", name: "PC-02", kind: "pc", ip: "192.168.1.51", hostname: "stranger-pc-2" },
];

const FILTERS: { key: "all" | StationKind; label: string }[] = [
  { key: "all", label: "All Stations" },
  { key: "sim", label: "Simulators" },
  { key: "ps5", label: "PS5s" },
  { key: "ps4", label: "PS4s" },
  { key: "pc", label: "PCs" },
];

function Dashboard() {
  const mgr = useStationManager();
  const [isMounted, setIsMounted] = useState(false);

  const [filter, setFilter] = useState<"all" | StationKind>("all");
  const [showRecords, setShowRecords] = useState(false);
  const [recordSearch, setRecordSearch] = useState("");
  const [recordCategory, setRecordCategory] = useState("all");

  const [dateFilterMode, setDateFilterMode] = useState<"all" | "today" | "yesterday" | "custom">("all");
  const [customDate, setCustomDate] = useState("");

  const [showBookings, setShowBookings] = useState(false);
  const [showUserProfiles, setShowUserProfiles] = useState(false);

  const [showTimingModal, setShowTimingModal] = useState(false);
  const [timingTab, setTimingTab] = useState<"regular" | "friday">("regular");

  // Regular (Sat-Thu) Timings
  const [openTimeReg, setOpenTimeReg] = useState("11:00");
  const [closeTimeReg, setCloseTimeReg] = useState("23:00");

  // Friday Timings
  const [openTimeFri, setOpenTimeFri] = useState("14:00");
  const [closeTimeFri, setCloseTimeFri] = useState("23:00");

  const [showAdminPasswordModal, setShowAdminPasswordModal] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);


useEffect(() => {
    setIsMounted(true);

    const fetchCafeTiming = async () => {
      try {
        // Fetch Regular (Sat-Thu) -> doc id: "1"
        const regSnap = await getDoc(doc(db, "cafe_settings", "1"));
        if (regSnap.exists()) {
          const regData = regSnap.data() as any;
          if (regData?.["open_time"]) setOpenTimeReg(regData["open_time"]);
          if (regData?.["close_time"]) setCloseTimeReg(regData["close_time"]);
        }

        // Fetch Friday -> doc id: "2"
        const friSnap = await getDoc(doc(db, "cafe_settings", "2"));
        if (friSnap.exists()) {
          const friData = friSnap.data() as any;
          if (friData?.["open_time"]) setOpenTimeFri(friData["open_time"]);
          if (friData?.["close_time"]) setCloseTimeFri(friData["close_time"]);
        }
      } catch (e) {
        console.log("Error fetching settings from Firebase:", e);
      }
    };
    fetchCafeTiming();
  }, []);

const handleSaveTiming = async () => {
  const targetId = timingTab === "regular" ? "1" : "2";
  const currentOpen = timingTab === "regular" ? openTimeReg : openTimeFri;
  const currentClose = timingTab === "regular" ? closeTimeReg : closeTimeFri;

  try {
    // Firebase mein setDoc with merge: true se update aur insert dono ek saath handle ho jaate hain
    await setDoc(doc(db, "cafe_settings", targetId), {
      open_time: currentOpen,
      close_time: currentClose,
      updated_at: new Date().toISOString()
    }, { merge: true });

    if (targetId === "1" && (mgr as any).updateCafeTiming) {
      (mgr as any).updateCafeTiming(currentOpen, currentClose);
    }
  } catch (e) {
    console.error("Error saving timing to Firebase:", e);
  }

  setShowTimingModal(false);
};

  const stations = CAFE_STATIONS;

  const visible = useMemo(() => {
    if (filter === "all") return stations;
    if (filter === "sim") {
      return stations.filter((s) => s.kind === "sim" || s.id.startsWith("SIM-"));
    }
    if (filter === "pc") {
      return stations.filter((s) => s.kind === "pc" && !s.id.startsWith("SIM-"));
    }
    return stations.filter((s) => s.kind === filter);
  }, [stations, filter]);

  const active = isMounted ? Object.keys(mgr.sessions || {}).length : 0;

const pendingBookingsCount = useMemo(() => {
    if (!isMounted) return 0;
    const list = Array.isArray(mgr.bookings) ? mgr.bookings : [];
    return list.filter((b) => {
      const statusStr = String(b?.status || "").trim().toUpperCase();
      const custName = String(b?.customer_name || "").toLowerCase(); // <-- yahan se `b?.customer` hata diya
      const bId = String(b?.id || "").toUpperCase();

      const isPending = statusStr === "PENDING";
      const isNotAdminBlock = !custName.includes("walk-in") && !custName.includes("reserved") && !custName.includes("admin block");
      const isNotSettings = bId !== "CAFE_OPERATING_HOURS" && !custName.includes("cafe_operating_hours");

      return isPending && isNotAdminBlock && isNotSettings;
    }).length;
  }, [mgr.bookings, isMounted]);

  const stats = [
    { label: "Total", value: String(stations.length), icon: MonitorSmartphone },
    { label: "Active", value: String(active), icon: Activity, tone: "warning" },
    {
      label: "Idle",
      value: String(stations.length - active),
      icon: CircleDot,
      tone: "primary",
    },
  ] as const;

  const historyLogs: SessionRecord[] = isMounted
    ? (mgr.history || (mgr as any).sessionHistory || [])
    : [];

  const filteredRecords = historyLogs.filter((log) => {
    const searchLower = recordSearch.toLowerCase();
    const stId = (log.stationId || "").toUpperCase();
    const stDisplayName = (STATION_NAMES[log.stationId] || log.stationId).toLowerCase();
    const custName = (log.customer || "").toLowerCase();
    const logDate = (log.date || "").toLowerCase();
    const displayDateStr = formatExactDate(log).toLowerCase();

    const matchesSearch =
      custName.includes(searchLower) ||
      stId.toLowerCase().includes(searchLower) ||
      stDisplayName.includes(searchLower) ||
      logDate.includes(searchLower) ||
      displayDateStr.includes(searchLower) ||
      (stId.startsWith("SIM") && "simulator".includes(searchLower));

    if (!matchesSearch) return false;

    if (dateFilterMode !== "all") {
      const logTime = log.timestamp ? new Date(log.timestamp) : new Date();
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      const isSameDate = (d1: Date, d2: Date) =>
        d1.getDate() === d2.getDate() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getFullYear() === d2.getFullYear();

      if (dateFilterMode === "today" && !isSameDate(logTime, today)) {
        return false;
      }
      if (dateFilterMode === "yesterday" && !isSameDate(logTime, yesterday)) {
        return false;
      }
      if (dateFilterMode === "custom" && customDate) {
        const customD = new Date(customDate);
        if (!isSameDate(logTime, customD)) {
          return false;
        }
      }
    }

    const cat = recordCategory;
    const logKind = log.kind || (stId.startsWith("PS5") ? "ps5" : stId.startsWith("PS4") ? "ps4" : stId.startsWith("PC") ? "pc" : "sim");

    if (cat === "all") return true;
    if (cat === "vip") return stId === "PS5-01" || stId === "PS5-02";
    if (cat === "ps5") return logKind === "ps5" && stId !== "PS5-01" && stId !== "PS5-02";
    if (cat === "ps4") return logKind === "ps4";
    if (cat === "pc") return logKind === "pc" && !stId.startsWith("SIM-");
    if (cat === "sim") return logKind === "sim" || stId.startsWith("SIM-");

    return true;
  });

  const totalFilteredEarnings = filteredRecords.reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const totalCompletedSessions = filteredRecords.length;

  const handleDownloadPDF = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const rows = filteredRecords
      .map(
        (log, idx) => {
          const exactDate = formatExactDate(log);
          const displayName = STATION_NAMES[log.stationId] || log.stationId;
          const timeDetails = log.startTime ? `${log.startTime}${log.endTime ? ' - ' + log.endTime : ''}` : 'N/A';
          return `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${idx + 1}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">${log.customer || "Walk-In"}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center; font-family: monospace;">${displayName}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${timeDetails}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${log.minutes} Mins</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: 600;">${exactDate}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #047857;">₹${log.amount || 0}</td>
      </tr>
    `;
        }
      )
      .join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Session_Records_Report</title>
          <style>
            body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 25px; color: #0f172a; }
            .header-title { font-size: 20px; font-weight: 800; color: #dc2626; text-transform: uppercase; margin: 0; }
            .header-sub { font-size: 12px; color: #64748b; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
            th { background: #0f172a; color: #fff; padding: 12px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
            .summary-box { margin-top: 25px; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; display: flex; justify-between: space-between; font-size: 14px; font-weight: 600; }
          </style>
        </head>
        <body>
          <div style="border-bottom: 2px solid #dc2626; pb-3; padding-bottom: 10px;">
            <div class="header-title">STRANGER'S GAMING CAFE — SESSION RECORDS</div>
            <div class="header-sub">Report Generated: ${new Date().toLocaleString("en-IN")}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="text-align: center;">#</th>
                <th>Player / Customer</th>
                <th style="text-align: center;">Station</th>
                <th style="text-align: center;">Start - End Time</th>
                <th style="text-align: center;">Duration</th>
                <th style="text-align: center;">Date Played</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">No Records Found</td></tr>'}
            </tbody>
          </table>
          <div class="summary-box">
            <div>Total Sessions Played: <span style="color:#0f172a;">${totalCompletedSessions}</span></div>
            <div>Total Revenue Generated: <span style="color:#047857; font-size:16px;">₹${totalFilteredEarnings}</span></div>
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleControl = async (stationId: string, action: string, ip: string) => {
    if (!mgr.bridgeUrl || mgr.bridgeUrl.includes("localhost:5000")) {
      return;
    }

    const baseUrl = mgr.bridgeUrl.startsWith("http")
      ? mgr.bridgeUrl
      : `http://${mgr.bridgeUrl}`;

    try {
      await fetch(`${baseUrl.replace(/\/+$/, "")}/api/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          station_id: stationId,
          action: action,
          ip: ip,
        }),
      });
    } catch (err) {
      // Silent catch
    }
  };

  return (
    <main className="h-screen w-screen bg-slate-950 text-slate-100 font-sans flex flex-col overflow-hidden">
      {/* Top Header */}
      <header className="bg-gradient-to-r from-red-700 via-red-600 to-red-800 px-6 py-4 min-h-[76px] flex items-center justify-between border-b border-red-900 shadow-xl shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex size-11 items-center justify-center rounded-lg bg-slate-950 text-red-500 font-black shadow-inner border border-red-500/30">
            <Gamepad2 className="size-6" />
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="font-display text-lg font-black tracking-widest text-white uppercase leading-tight">
              STRANGER'S GAMING CAFE — ADMIN PANEL
            </h1>
            <p className="text-xs font-semibold tracking-wider text-red-100 uppercase mt-1">
              Live Station Control & Billing System
            </p>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex items-center gap-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-2.5 rounded-lg bg-slate-950/90 px-3.5 py-1.5 border border-red-800/80 shadow-inner"
            >
              <s.icon
                className={cn(
                  "size-4",
                  !("tone" in s)
                    ? "text-slate-400"
                    : s.tone === "warning"
                      ? "text-amber-400"
                      : "text-emerald-400"
                )}
              />
              <span className="text-xs font-bold text-slate-300 uppercase">{s.label}:</span>
              <span className="font-mono text-sm font-bold text-white tabular-nums">{s.value}</span>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="border-gray-800 bg-black text-gray-300 hover:bg-gray-900 hover:text-gray-100 font-bold h-9 text-xs justify-start px-3 shadow-sm transition-all"
            onClick={() => setShowTimingModal(true)}
          >
            <Clock className="size-4 mr-1 text-amber-400" /> Operating Hours
          </Button>
        </div>
      </header>

      {/* Main Container Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* CENTER COLUMN: Stations Cards */}
        <section className="flex-1 bg-slate-950 p-5 overflow-y-auto flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 p-1.5 rounded-lg border border-slate-800 shrink-0">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "cursor-pointer rounded px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all",
                  filter === f.key
                    ? "bg-red-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="m-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 auto-rows-fr pb-4">
            {visible.map((station) => {
              const pendingForStation = isMounted ? (mgr.bookings || []).find((b) => {
                if (b.station_id !== station.id) return false;

                const statusStr = String(b?.status || "").trim().toUpperCase();
                const custName = String(b?.customer_name || "").toLowerCase(); // <-- yahan se `|| b?.customer` hata diya

                const isPending = statusStr === "PENDING";
                const isNotAdminBlock = !custName.includes("walk-in") && !custName.includes("reserved") && !custName.includes("admin block");

                return isPending && isNotAdminBlock;
              }) : undefined;

              return (
                <StationCard
                  key={station.id}
                  station={station}
                  session={isMounted ? mgr.sessions[station.id] : undefined}
                  pendingBooking={pendingForStation}
                  onApproveBooking={(b) => mgr.approveBooking(b)}
                  onRejectBooking={(bId) => mgr.rejectBooking(bId)}
                  onStart={(minutes, customer, playerCount) => {
                    mgr.start(station.id, minutes, customer, playerCount);
                  }}
                  onExtend={(minutes) => mgr.extend(station.id, minutes)}
                  onTogglePause={() => mgr.togglePause(station.id)}
                  onForceLock={() => {
                    mgr.forceLock(station.id);
                    if (station.ip) {
                      handleControl(station.id, "LOCK", station.ip);
                    }
                  }}
                  onControl={(stId, action, ip) => handleControl(stId, action, ip)}
                />
              );
            })}
          </div>
        </section>

        {/* SIDEBAR */}
        <aside className="w-64 bg-slate-900 border-r border-slate-800 p-4 flex flex-col gap-3 shrink-0 overflow-y-auto">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
            Admin Control
          </div>

          <Button
            variant="outline"
            size="sm"
            className={cn(
              "relative border-purple-400/40 bg-purple-900/40 text-purple-200 hover:bg-purple-600 hover:text-white font-bold h-11 text-xs justify-start px-3 shadow-sm transition-all",
              pendingBookingsCount > 0 && "border-purple-300 bg-purple-600 text-white ring-2 ring-purple-300"
            )}
            onClick={() => setShowBookings(true)}
          >
            <CalendarClock className="size-4 mr-2.5 text-purple-300" />
            Online Bookings
            {pendingBookingsCount > 0 && (
              <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white shadow-md animate-pulse">
                {pendingBookingsCount}
              </span>
            )}
          </Button>

<ConsoleScheduleModal
            stations={stations}
            sessions={isMounted ? mgr.sessions || {} : {}}
            cafeHours={{
              openTime: openTimeReg,   // Database se fetched open time yahan aayega
              closeTime: closeTimeReg, // Database se fetched close time yahan aayega
            }}
          />

          {/* Admin Password Verification Modal */}
          {showAdminPasswordModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
              <div className="relative w-full max-w-sm flex flex-col rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="grid size-8 place-items-center rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-400">
                      <Users className="size-4" />
                    </div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Admin Verification
                    </h3>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-slate-400 hover:text-white"
                    onClick={() => setShowAdminPasswordModal(false)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>

                <div className="space-y-3">
                  <p className="text-xs text-slate-300">
                    Enter admin password to access User Profiles & Diamond Recharges:
                  </p>
                  <Input
                    type="password"
                    placeholder="Enter password..."
                    value={adminPasswordInput}
                    onChange={(e) => {
                      setAdminPasswordInput(e.target.value);
                      setPasswordError(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (adminPasswordInput === "Stranger@4ever") {
                          setShowAdminPasswordModal(false);
                          setShowUserProfiles(true);
                        } else {
                          setPasswordError(true);
                        }
                      }
                    }}
                    className="bg-slate-950 border-slate-800 text-white text-xs h-10"
                  />
                  {passwordError && (
                    <p className="text-xs font-bold text-red-500 animate-shake">
                      ❌ Wrong Password! Try again.
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-slate-400 hover:text-white"
                    onClick={() => setShowAdminPasswordModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs h-9 px-4"
                    onClick={() => {
                      if (adminPasswordInput === "Stranger@4ever") {
                        setShowAdminPasswordModal(false);
                        setShowUserProfiles(true);
                      } else {
                        setPasswordError(true);
                      }
                    }}
                  >
                    Verify & Open
                  </Button>
                </div>
              </div>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="border-slate-800 bg-slate-950/80 text-slate-200 hover:bg-red-600 hover:text-white font-bold h-11 text-xs justify-start px-3 shadow-sm transition-all"
            onClick={() => setShowRecords(true)}
          >
            <FileText className="size-4 mr-2.5 text-red-400" /> Detailed Records
          </Button>

          <div className="border-t border-slate-800 my-1"></div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
            User Data
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-purple-500/40 bg-purple-950/40 text-purple-200 hover:bg-purple-600 hover:text-white font-bold h-11 text-xs justify-start px-3 shadow-sm transition-all"
            onClick={() => {
              setAdminPasswordInput("");
              setPasswordError(false);
              setShowAdminPasswordModal(true);
            }}
          >
            <Users className="size-4 mr-2.5 text-purple-400" /> User Profiles Management
          </Button>
        </aside>
      </div>

      {/* Bookings Modal */}
{/* Bookings Modal */}
      <BookingsModal
        open={showBookings}
        onOpenChange={setShowBookings}
        bookings={isMounted ? mgr.bookings || [] : []}
        onApprove={(b: any) => mgr.approveBooking(b)}
        onReject={(bId) => mgr.rejectBooking(bId)}
      />

      {/* User Profiles & Booking History Modal */}
      <UserProfilesModal
        open={showUserProfiles}
        onOpenChange={setShowUserProfiles}
      />

      {/* Dynamic Cafe Timings Modal */}
      {showTimingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md flex flex-col rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="grid size-9 place-items-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400">
                  <Clock className="size-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white tracking-wide">
                    Cafe Operating Hours
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Set separate hours for Friday & Regular days
                  </p>
                </div>
              </div>

              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                onClick={() => setShowTimingModal(false)}
              >
                <X className="size-5" />
              </Button>
            </div>

            {/* Tab Switcher */}
            <div className="grid grid-cols-2 gap-2 my-4 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <Button
                size="sm"
                variant={timingTab === "regular" ? "default" : "ghost"}
                className={`text-xs font-bold cursor-pointer ${timingTab === "regular" ? "bg-amber-600 text-white hover:bg-amber-500" : "text-slate-400 hover:text-white"}`}
                onClick={() => setTimingTab("regular")}
              >
                Saturday – Thursday
              </Button>
              <Button
                size="sm"
                variant={timingTab === "friday" ? "default" : "ghost"}
                className={`text-xs font-bold cursor-pointer ${timingTab === "friday" ? "bg-amber-600 text-white hover:bg-amber-500" : "text-slate-400 hover:text-white"}`}
                onClick={() => setTimingTab("friday")}
              >
                Friday (Special)
              </Button>
            </div>

            <div className="space-y-4 mb-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  {timingTab === "regular" ? "Saturday - Thursday Opening Time" : "Friday Opening Time"}
                </label>
                <Input
                  type="time"
                  value={timingTab === "regular" ? openTimeReg : openTimeFri}
                  onChange={(e) => timingTab === "regular" ? setOpenTimeReg(e.target.value) : setOpenTimeFri(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white focus:border-amber-500 h-10 text-sm font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  {timingTab === "regular" ? "Saturday - Thursday Closing Time" : "Friday Closing Time"}
                </label>
                <Input
                  type="time"
                  value={timingTab === "regular" ? closeTimeReg : closeTimeFri}
                  onChange={(e) => timingTab === "regular" ? setCloseTimeReg(e.target.value) : setCloseTimeFri(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white focus:border-amber-500 h-10 text-sm font-mono"
                />
              </div>

              
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
                onClick={() => setShowTimingModal(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-9 px-4 shadow-md cursor-pointer"
                onClick={handleSaveTiming}
              >
                <Save className="size-3.5 mr-1.5" /> Save {timingTab === "regular" ? "Regular" : "Friday"} Hours
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Session History Modal */}
      {showRecords && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="grid size-9 place-items-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-500">
                  <FileText className="size-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white tracking-wide">
                    Customer Session History
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Live session logs and billing summary
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs font-bold border-red-800 bg-red-950/50 text-red-300 hover:bg-red-600 hover:text-white cursor-pointer"
                  onClick={handleDownloadPDF}
                >
                  <Download className="size-3.5 mr-1.5" /> PDF
                </Button>
                <div className="flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-400">
                  <IndianRupee className="size-3.5" /> Revenue: ₹{totalFilteredEarnings}
                </div>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-white cursor-pointer" onClick={() => setShowRecords(false)}>
                  <X className="size-5" />
                </Button>
              </div>
            </div>

            {/* SEARCH, CATEGORY & DATE FILTER CONTROLS */}
            <div className="my-3 space-y-2.5">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
                  <Input
                    value={recordSearch}
                    onChange={(e) => setRecordSearch(e.target.value)}
                    placeholder="Search Player Name, Date, or Station ID..."
                    className="pl-9 h-9 text-xs bg-slate-950 border-slate-800 text-white focus:border-red-600 focus:ring-1 focus:ring-red-600"
                  />
                </div>

                <div className="relative w-40">
                  <Calendar className="absolute left-2.5 top-2.5 size-4 text-amber-400 pointer-events-none" />
                  <Input
                    type="date"
                    value={customDate}
                    onChange={(e) => {
                      setCustomDate(e.target.value);
                      if (e.target.value) setDateFilterMode("custom");
                    }}
                    className="pl-8 h-9 text-xs bg-slate-950 border-slate-800 text-white focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between bg-slate-950 p-1.5 rounded-lg border border-slate-800">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1 mr-1">Date:</span>
                  {[
                    { id: "all", label: "All Time" },
                    { id: "today", label: "Today" },
                    { id: "yesterday", label: "Yesterday" },
                  ].map((dt) => (
                    <Button
                      key={dt.id}
                      size="sm"
                      variant={dateFilterMode === dt.id ? "default" : "outline"}
                      className={
                        dateFilterMode === dt.id
                          ? "bg-amber-600 hover:bg-amber-700 text-white font-bold h-7 text-xs border-0 cursor-pointer"
                          : "h-7 text-xs border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 cursor-pointer"
                      }
                      onClick={() => {
                        setDateFilterMode(dt.id as any);
                        if (dt.id !== "custom") setCustomDate("");
                      }}
                    >
                      {dt.label}
                    </Button>
                  ))}
                </div>

                {dateFilterMode === "custom" && customDate && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-950/40 cursor-pointer"
                    onClick={() => {
                      setDateFilterMode("all");
                      setCustomDate("");
                    }}
                  >
                    Clear Date ({customDate})
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: "all", label: "All Stations" },
                  { id: "vip", label: "PS5 VIP (55″)" },
                  { id: "ps5", label: "PS5 Standard" },
                  { id: "ps4", label: "PS4 Zone" },
                  { id: "pc", label: "PC Arena" },
                  { id: "sim", label: "Simulators" },
                ].map((cat) => (
                  <Button
                    key={cat.id}
                    size="sm"
                    variant={recordCategory === cat.id ? "default" : "outline"}
                    className={
                      recordCategory === cat.id
                        ? "bg-red-600 hover:bg-red-700 text-white font-bold h-7 text-xs border-0 cursor-pointer"
                        : "h-7 text-xs border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800 cursor-pointer"
                    }
                    onClick={() => setRecordCategory(cat.id)}
                  >
                    {cat.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[40vh]">
              {filteredRecords.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  No records found matching your selection.
                </div>
              ) : (
                filteredRecords.map((log) => {
                  const displayDate = formatExactDate(log);
                  const displayName = STATION_NAMES[log.stationId] || log.stationId;
                  return (
                    <div
                      key={log.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded border border-slate-800 bg-slate-950/70 hover:border-slate-700 transition-all gap-2 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded border border-slate-700 bg-slate-900 text-red-400">
                          {displayName}
                        </span>
                        <div>
                          <p className="font-bold text-white">
                            {log.customer}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Played: <strong className="text-slate-200">{log.minutes} mins</strong> {log.startTime ? `(${log.startTime}${log.endTime ? ' - ' + log.endTime : ''})` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-4">
                        <span className="text-[11px] text-slate-400 font-mono">
                          {displayDate}
                        </span>
                        <span className="font-bold text-emerald-400 text-sm">
                          ₹{log.amount}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
