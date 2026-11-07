import { useState, useEffect } from "react";
import {
  Activity,
  Search,
  Gamepad2,
  Monitor,
  Car,
  Clock,
  User,
  RefreshCw
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, deleteDoc } from "firebase/firestore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Category & Station ID ke hisab se Icon, Label aur Theme select karne ka helper
function getStationConfig(stationId: string, category: string, screen: string) {
  const upperId = stationId.toUpperCase();
  const upperCat = (category || "").toUpperCase();

  if (upperCat.includes("SIMULATOR") || upperId.includes("SIM")) {
    return {
      icon: Car,
      label: screen ? `Simulator (${screen})` : "Racing Simulator",
      color: "text-amber-400 border-amber-400/40 bg-amber-500/20",
    };
  }
  if (upperCat.includes("PC") || upperId.includes("PC")) {
    return {
      icon: Monitor,
      label: "Gaming PC Arena",
      color: "text-cyan-400 border-cyan-400/40 bg-cyan-500/20",
    };
  }
  if (upperCat.includes("PS5") || upperId.includes("PS5")) {
    return {
      icon: Gamepad2,
      label: screen ? `PS5 (${screen})` : "PlayStation 5",
      color: "text-red-400 border-red-400/40 bg-red-500/20",
    };
  }
  if (upperCat.includes("PS4") || upperId.includes("PS4")) {
    return {
      icon: Gamepad2,
      label: "PlayStation 4",
      color: "text-blue-400 border-blue-400/40 bg-blue-500/20",
    };
  }
  return {
    icon: Gamepad2,
    label: "Gaming Station",
    color: "text-purple-400 border-purple-400/40 bg-purple-500/20",
  };
}

export function LiveSessionsModal({ open, onOpenChange }: Props) {
  const [search, setSearch] = useState("");
  const [dbLiveBookings, setDbLiveBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // 🔴 Firebase Firestore Realtime Listener & Auto-Expiry Cleaner
  useEffect(() => {
    if (!open) return;

    setLoading(true);
    const unsubscribe = onSnapshot(collection(db, "bookings"), async (snapshot) => {
      const liveList: any[] = [];
      const now = new Date().getTime();

      for (const docSnap of snapshot.docs) {
        const docId = docSnap.id;
        const idStr = docId.toUpperCase();
        const data = docSnap.data();

        if (idStr.startsWith("LIVE_SESSION_") || String(data?.id || "").toUpperCase().startsWith("LIVE_SESSION_")) {
          const slotStr = data.slot_time || data.slot || "";
          let isExpired = false;

          // Check if session slot time has finished
          if (slotStr && slotStr.includes("-")) {
            try {
              const parts = slotStr.split("-");
              const endTimeStr = parts[1]?.trim() || "";

              const match = endTimeStr.match(/(\d+):?(\d+)?\s*(AM|PM)/i);
              if (match && match[1]) {
                let hours = parseInt(match[1], 10);
                const minutes = match[2] ? parseInt(match[2], 10) : 0;
                const modifier = (match[3] || "").toUpperCase();

                if (modifier === "PM" && hours < 12) hours += 12;
                if (modifier === "AM" && hours === 12) hours = 0;

                const slotEndTime = new Date();
                slotEndTime.setHours(hours, minutes, 0, 0);

                if (now >= slotEndTime.getTime()) {
                  isExpired = true;
                }
              }
            } catch (e) {
              // Parsing fallback
            }
          }

          if (isExpired) {
            try {
              await deleteDoc(doc(db, "bookings", docId));
            } catch (err) {
              console.error("Error auto-removing expired live session:", err);
            }
          } else {
            // Extract Station ID directly from Document ID (e.g., LIVE_SESSION_PS5-02 -> PS5-02)
            const rawId = data.id || docId;
            const extractedStationId = rawId.replace(/^LIVE_SESSION_/i, "").trim();

            liveList.push({
              dbId: docId,
              stationId: extractedStationId || "STATION",
              ...data,
            });
          }
        }
      }

      setDbLiveBookings(liveList);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [open]);

  // Search filter
  const filteredSessions = dbLiveBookings.filter((b) => {
    const searchLower = search.toLowerCase();
    const stId = (b.stationId || "").toLowerCase();
    const cust = (b.customer_name || b.name || "").toLowerCase();
    const phone = (b.phone || "").toLowerCase();
    const cat = (b.category || "").toLowerCase();
    return (
      stId.includes(searchLower) ||
      cust.includes(searchLower) ||
      phone.includes(searchLower) ||
      cat.includes(searchLower)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-slate-950 text-white border-slate-800 max-h-[85vh] flex flex-col p-6">
        <DialogHeader className="border-b border-slate-800 pb-3">
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="flex items-center gap-2 font-display text-lg font-black text-amber-400">
              <Activity className="size-5 text-amber-400 animate-pulse" />
              Live Running Cafe Sessions
              <Badge className="bg-amber-500 text-black font-extrabold ml-2">
                {dbLiveBookings.length} Active
              </Badge>
            </DialogTitle>
            <div className="flex items-center gap-2">
              {loading && <RefreshCw className="size-4 animate-spin text-amber-400" />}
            </div>
          </div>
        </DialogHeader>

        {/* Search Bar */}
        <div className="py-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
            <Input
              placeholder="Search live sessions by Station (PS5-02, SIM-03), Customer or Category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-slate-900 border-slate-700 text-xs text-white placeholder:text-slate-500"
            />
          </div>
        </div>

        {/* Read-Only Clean Sessions List */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 py-1">
          {filteredSessions.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              No active live sessions running right now.
            </div>
          ) : (
            filteredSessions.map((b) => {
              const customerName = b.customer_name || b.name || "Guest Player";
              const slotTime = b.slot_time || b.slot || "Current Session";
              const duration = b.duration || "N/A";
              const stationId = b.stationId;
              const category = b.category || "";
              const screen = b.screen || "";

              const { icon: StationIcon, label: stationTypeLabel, color: iconTheme } = getStationConfig(
                stationId,
                category,
                screen
              );

              return (
                <div
                  key={b.dbId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-amber-500/30 bg-slate-900/80 transition-all gap-3 text-xs"
                >
                  <div className="flex items-center gap-3.5">
                    <div className={`grid size-10 place-items-center rounded-lg border ${iconTheme} font-bold shrink-0`}>
                      <StationIcon className="size-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-slate-300 font-semibold bg-slate-800/80 px-2.5 py-1 rounded border border-slate-700 flex items-center gap-1">
                          {stationTypeLabel}
                        </span>
                        <span className="text-xs text-slate-200 flex items-center gap-1 font-bold">
                          <User className="size-3 text-amber-400" /> {customerName}
                        </span>
                        {b.team && (
                          <span className="bg-purple-950 border border-purple-500/40 text-purple-300 text-[10px] px-1.5 py-0.2 rounded font-bold">
                            {b.team}
                          </span>
                        )}
                        <span className="bg-emerald-950 border border-emerald-500/40 text-emerald-300 text-[10px] px-1.5 py-0.2 rounded font-bold uppercase animate-pulse">
                          LIVE
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                        <span className="flex items-center gap-1 text-cyan-300">
                          <Clock className="size-3.5 text-cyan-400" /> Slot: {slotTime}
                        </span>
                        <span>• Duration: <strong className="text-slate-200">{duration}</strong></span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}