import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { 
  Activity, 
  CircleDot, 
  MonitorSmartphone, 
  FileText, 
  Search, 
  X, 
  IndianRupee, 
  Calendar,
  CalendarClock
} from "lucide-react";
import { StationCard } from "@/components/StationCard";
import { SettingsDialog } from "@/components/SettingsDialog";
import { BookingsModal } from "@/components/BookingsModal";
import { useStationManager, type SessionRecord, type BookingRequest } from "@/hooks/useStationManager";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Station, StationKind } from "@/lib/stations";

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

// Dynamic Date Formatter: Today / Yesterday / Actual Date
function formatDisplayDate(record: SessionRecord): string {
  const recordTimestamp = record.timestamp;
  if (!recordTimestamp) return record.date || "Today";

  const recordDate = new Date(recordTimestamp);
  const now = new Date();

  // Reset hours to compare only calendar days
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(recordDate.getFullYear(), recordDate.getMonth(), recordDate.getDate());

  const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  
  return record.date || recordDate.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// DIRECT STATIONS (11 Stations: 2 SIM, 4 PS5, 1 PS4, 4 PC)
const CAFE_STATIONS: Station[] = [
  // 1. SIM Simulators (2)
  { id: "SIM-01", kind: "sim", ip: "192.168.1.150" },
  { id: "SIM-02", kind: "sim", ip: "192.168.1.151" },

  // 2. PS5 Consoles (4)
  { id: "PS5-01", kind: "ps5", ip: "192.168.1.153" },
  { id: "PS5-02", kind: "ps5", ip: "192.168.1.154" },
  { id: "PS5-03", kind: "ps5", ip: "192.168.1.155" },
  { id: "PS5-04", kind: "ps5", ip: "192.168.1.156" },

  // 3. PS4 Console (1)
  { id: "PS4-01", kind: "ps4", ip: "192.168.1.157" },

  // 4. Gaming PCs (01 to 04)
  { id: "PC-01", kind: "pc", ip: "192.168.1.50", hostname: "stranger-pc-1" },
  { id: "PC-02", kind: "pc", ip: "192.168.1.51", hostname: "stranger-pc-2" },
  { id: "PC-03", kind: "pc", ip: "192.168.1.52", hostname: "stranger-pc-3" },
  { id: "PC-04", kind: "pc", ip: "192.168.1.53", hostname: "stranger-pc-4" },
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
  const [filter, setFilter] = useState<"all" | StationKind>("all");

  // Customer Records Modal State
  const [showRecords, setShowRecords] = useState(false);
  const [recordSearch, setRecordSearch] = useState("");
  const [recordCategory, setRecordCategory] = useState("all");

  // Online Bookings Modal State
  const [showBookings, setShowBookings] = useState(false);

  const stations = CAFE_STATIONS;

  const visible = useMemo(
    () => (filter === "all" ? stations : stations.filter((s) => s.kind === filter)),
    [stations, filter]
  );

  const active = Object.keys(mgr.sessions).length;
  const pendingBookingsCount = (mgr.bookings || []).filter((b) => b.status === "PENDING").length;

  const stats = [
    { label: "Total Stations", value: String(stations.length), icon: MonitorSmartphone },
    { label: "Active Sessions", value: String(active), icon: Activity, tone: "warning" },
    {
      label: "Idle Stations",
      value: String(stations.length - active),
      icon: CircleDot,
      tone: "primary",
    },
  ] as const;

  // ACCURATE CATEGORY-WISE FILTERING FOR RECORDS MODAL
  const historyLogs: SessionRecord[] = mgr.history || [];

  const filteredRecords = historyLogs.filter((log) => {
    const searchLower = recordSearch.toLowerCase();
    const stId = (log.stationId || "").toUpperCase();
    const custName = (log.customer || "").toLowerCase();
    const logDate = (log.date || "").toLowerCase();
    const displayDateStr = formatDisplayDate(log).toLowerCase();

    const matchesSearch =
      custName.includes(searchLower) ||
      stId.toLowerCase().includes(searchLower) ||
      logDate.includes(searchLower) ||
      displayDateStr.includes(searchLower);

    if (!matchesSearch) return false;

    const cat = recordCategory;
    const logKind = log.kind || (stId.startsWith("PS5") ? "ps5" : stId.startsWith("PS4") ? "ps4" : stId.startsWith("PC") ? "pc" : "sim");

    if (cat === "all") return true;

    // VIP PS5s (PS5-01 & PS5-02)
    if (cat === "vip") return stId === "PS5-01" || stId === "PS5-02";

    // Standard PS5s (PS5-03, PS5-04)
    if (cat === "ps5") return logKind === "ps5" && stId !== "PS5-01" && stId !== "PS5-02";

    // PS4, PC, Simulators
    if (cat === "ps4") return logKind === "ps4";
    if (cat === "pc") return logKind === "pc";
    if (cat === "sim") return logKind === "sim";

    return true;
  });

  const totalFilteredEarnings = filteredRecords.reduce((acc, curr) => acc + (curr.amount || 0), 0);

  const handleControl = async (stationId: string, action: string, ip: string) => {
    if (!mgr.bridgeUrl) {
      console.warn("Bridge URL not configured in Settings.");
      return;
    }

    const baseUrl = mgr.bridgeUrl.startsWith("http")
      ? mgr.bridgeUrl
      : `http://${mgr.bridgeUrl}`;

    try {
      const response = await fetch(`${baseUrl}/api/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          station_id: stationId,
          action: action,
          ip: ip,
        }),
      });

      if (!response.ok) {
        throw new Error(`Bridge returned HTTP ${response.status}`);
      }

      console.log(`[REMOTE] Sent ${action} to ${stationId} (${ip})`);
    } catch (err) {
      console.error("Bridge Connection Error:", err);
    }
  };

  return (
    <main className="min-h-screen bg-background bg-grid">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto max-w-[1500px] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-lg bg-gradient-primary text-primary-foreground shadow-glow-primary">
                <span className="font-display text-lg font-black">S</span>
              </div>
              <div>
                <h1 className="font-display text-xl font-black tracking-[0.2em] text-foreground">
                  STRANGER'S GAMING CAFE
                </h1>

                <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                  ADMIN MANAGEMENT PANEL
                </p>
              </div>
            </div>

            {/* TOP HEADER BUTTONS */}
            <div className="flex items-center gap-2">
              {/* 1. ONLINE BOOKINGS BUTTON WITH BADGE */}
              <Button
                variant="outline"
                size="sm"
                className="relative border-purple-500/60 bg-purple-950/40 text-purple-300 hover:bg-purple-600 hover:text-white font-bold h-9 text-xs transition-all shadow-md"
                onClick={() => setShowBookings(true)}
              >
                <CalendarClock className="size-4 mr-1.5 text-purple-400" />
                Bookings
                {pendingBookingsCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-purple-500 px-1.5 py-0.2 text-[10px] font-black text-white animate-pulse">
                    {pendingBookingsCount}
                  </span>
                )}
              </Button>

              {/* 2. RECORDS BUTTON */}
              <Button
                variant="outline"
                size="sm"
                className="border-red-600/60 bg-red-950/40 text-red-400 hover:bg-red-600 hover:text-white font-bold h-9 text-xs transition-all shadow-md"
                onClick={() => setShowRecords(true)}
              >
                <FileText className="size-4 mr-1.5" /> Records
              </Button>

              {/* 3. EXISTING NETWORK SETTINGS DIALOG */}
              <SettingsDialog
                stations={stations}
                bridgeUrl={mgr.bridgeUrl}
                onSave={(_, url) => {
                  mgr.setBridgeUrl(url);
                }}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-3 rounded-lg border border-border/70 bg-card/60 px-4 py-3"
              >
                <s.icon
                  className={cn(
                    "size-5",
                    !("tone" in s)
                      ? "text-muted-foreground"
                      : s.tone === "warning"
                        ? "text-warning"
                        : "text-primary"
                  )}
                />

                <div>
                  <p className="font-display text-xl font-bold tabular-nums">{s.value}</p>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {s.label}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "cursor-pointer rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors",
                  filter === f.key
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1500px] px-5 py-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((station) => {
            // Find if there is a pending booking for this specific station
            const pendingForStation = (mgr.bookings || []).find(
              (b) => b.station_id === station.id && b.status === "PENDING"
            );

            return (
              <StationCard
                key={station.id}
                station={station}
                session={mgr.sessions[station.id]}
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

      {/* --- MASTER ONLINE BOOKINGS MODAL --- */}
      <BookingsModal
        open={showBookings}
        onOpenChange={setShowBookings}
        bookings={mgr.bookings || []}
        onApprove={(b) => mgr.approveBooking(b)}
        onReject={(bId) => mgr.rejectBooking(bId)}
      />

      {/* --- MASTER CUSTOMER RECORDS MODAL --- */}
      {showRecords && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-xl border border-red-900/60 bg-card p-5 shadow-2xl">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="grid size-9 place-items-center rounded-lg border border-red-500/40 bg-red-500/10 text-red-500">
                  <FileText className="size-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground tracking-wide">
                    Customer Session Records
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    All completed gaming history & session logs
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-400">
                  <IndianRupee className="size-3.5" /> Revenue: ₹{totalFilteredEarnings}
                </div>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setShowRecords(false)}>
                  <X className="size-5" />
                </Button>
              </div>
            </div>

            {/* Search & Category Tabs */}
            <div className="my-3 space-y-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  value={recordSearch}
                  onChange={(e) => setRecordSearch(e.target.value)}
                  placeholder="Search Player Name, Date, or Station ID..."
                  className="pl-9 h-9 text-xs border-border/80 focus:border-red-500"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: "all", label: "All Stations" },
                  { id: "vip", label: "PS5 VIP (55″)" },
                  { id: "ps5", label: "PS5 Standard" },
                  { id: "ps4", label: "PS4 Zone" },
                  { id: "pc", label: "PC Arena" },
                  { id: "sim", label: "Racing Sim" },
                ].map((cat) => (
                  <Button
                    key={cat.id}
                    size="sm"
                    variant={recordCategory === cat.id ? "default" : "outline"}
                    className={
                      recordCategory === cat.id
                        ? "bg-red-600 hover:bg-red-700 text-white font-bold h-7 text-xs"
                        : "h-7 text-xs border-border/70 hover:border-red-500/50"
                    }
                    onClick={() => setRecordCategory(cat.id)}
                  >
                    {cat.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Session Records List */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[45vh]">
              {filteredRecords.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  No records found matching your selection.
                </div>
              ) : (
                filteredRecords.map((log) => {
                  const displayDate = formatDisplayDate(log);
                  return (
                    <div
                      key={log.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border border-border/70 bg-muted/20 hover:border-red-500/40 transition-all gap-2 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[11px] font-bold px-2.5 py-1 rounded border border-primary/40 bg-primary/10 text-primary">
                          {log.stationId}
                        </span>
                        <div>
                          <p className="font-bold text-foreground">
                            {log.customer}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Played: <strong className="text-foreground">{log.minutes} mins</strong> ({log.startTime} - {log.endTime})
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-2.5 text-right">
                        {/* Dynamic Date Badge */}
                        <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-secondary/40 px-2 py-0.5 rounded border border-border/50">
                          <Calendar className="size-3 text-red-400" />
                          <span>{displayDate}</span>
                        </div>

                        {/* Revenue Badge */}
                        <span className="text-xs font-black text-emerald-400 bg-emerald-950/30 border border-emerald-800/40 px-2.5 py-1 rounded-md">
                          ₹{log.amount}
                        </span>

                        {/* DELETE RECORD CROSS (X) BUTTON */}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:bg-red-950/50 hover:text-red-400 border border-transparent hover:border-red-500/40 transition-all ml-1"
                          title="Delete Record"
                          onClick={() => mgr.deleteSessionHistory(log.id)}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <Button
              size="sm"
              variant="secondary"
              className="w-full mt-3 font-semibold"
              onClick={() => setShowRecords(false)}
            >
              Close Records
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}