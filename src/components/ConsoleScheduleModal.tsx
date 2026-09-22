import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Clock,
  Gamepad2,
  Monitor,
  Car,
  Truck,
  Plus,
  Trash2,
  CheckCircle2,
  Filter,
  UserCheck,
  RefreshCw,
  AlertCircle,
  Globe
} from "lucide-react";
import { cn } from "@/lib/utils";

type ReservationSlot = {
  id: string;
  customerName: string;
  phone?: string;
  startTime: string;
  endTime: string;
  status: string;
  isOnlineBooking: boolean;
  utr?: string;
  bookingDate?: string;
};

type Props = {
  stations?: any[];
  sessions?: Record<string, any>;
};

const CATEGORIES = [
  { id: "ALL", label: "All Stations" },
  { id: "ps5", label: "PS5 Consoles" },
  { id: "ps4", label: "PS4 Consoles" },
  { id: "sim", label: "Simulators (Car/Truck)" },
  { id: "pc", label: "Gaming PCs" },
];

const CAFE_START_HOUR = 11; // 11 AM
const CAFE_END_HOUR = 22;   // 10 PM
const TOTAL_CAFE_MINUTES = (CAFE_END_HOUR - CAFE_START_HOUR) * 60;

const getApiBaseUrl = () => {
  if (typeof window !== "undefined") {
    const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;
    if (envUrl) return envUrl;
    return `${window.location.protocol}//${window.location.hostname}:5000`;
  }
  return 'http://localhost:5000';
};

// Date Formatter: Formats a Date object to "22-Sept-2026"
const formatDateToReadable = (d: Date = new Date()): string => {
  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

function getCurrentSystemTime() {
  const now = new Date();
  return {
    hour: now.getHours(),
    minute: now.getMinutes()
  };
}

function getValidHoursOptions() {
  const { hour, minute } = getCurrentSystemTime();
  const validHours = [];

  for (let h = CAFE_START_HOUR; h <= CAFE_END_HOUR; h++) {
    if (h < hour) continue;
    if (h === hour && minute >= 59) continue;

    let displayHour = h > 12 ? h - 12 : h;
    if (displayHour === 0) displayHour = 12;
    const ampm = h >= 12 ? "PM" : "AM";
    validHours.push({
      value: h.toString().padStart(2, "0"),
      label: `${displayHour} ${ampm}`
    });
  }

  return validHours;
}

function getValidMinutesOptions(selectedHourStr: string) {
  const { hour, minute } = getCurrentSystemTime();
  const selectedHour = parseInt(selectedHourStr, 10);

  const minutes = [];
  for (let m = 0; m < 60; m += 1) {
    if (selectedHour < hour) continue;
    if (selectedHour === hour && m <= minute) continue;

    const val = m.toString().padStart(2, "0");
    minutes.push({ value: val, label: val });
  }

  return minutes;
}

const SIM_DURATIONS = [
  { mins: 10, label: "+10 Mins" },
  { mins: 20, label: "+20 Mins" },
  { mins: 30, label: "+30 Mins" },
  { mins: 40, label: "+40 Mins" },
  { mins: 50, label: "+50 Mins" },
  { mins: 60, label: "+1 Hour" },
  { mins: 90, label: "+1.5 Hours" },
  { mins: 120, label: "+2 Hours" },
];

const CONSOLE_DURATIONS = [
  { mins: 30, label: "+30 Mins" },
  { mins: 60, label: "+1 Hour" },
  { mins: 90, label: "+1.5 Hours" },
  { mins: 120, label: "+2 Hours" },
  { mins: 150, label: "+2.5 Hours" },
  { mins: 180, label: "+3 Hours" },
];

function parseTimeToMinutes(timeStr: string | number): number {
  if (typeof timeStr === "number") {
    const d = new Date(timeStr);
    return d.getHours() * 60 + d.getMinutes();
  }
  if (!timeStr) return 0;

  const cleaned = timeStr.trim().toUpperCase();
  const match = cleaned.match(/(\d+):(\d+)\s*(AM|PM)?/);

  if (!match) return 0;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3];

  if (period) {
    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
  }

  return hours * 60 + minutes;
}

function isTimeSlotOverlapping(
  newStartStr: string,
  newEndStr: string,
  existStartStr: string,
  existEndStr: string
): boolean {
  const newStart = parseTimeToMinutes(newStartStr);
  let newEnd = parseTimeToMinutes(newEndStr);
  const existStart = parseTimeToMinutes(existStartStr);
  let existEnd = parseTimeToMinutes(existEndStr);

  if (newEnd <= newStart) newEnd += 24 * 60;
  if (existEnd <= existStart) existEnd += 24 * 60;

  return newStart < existEnd && newEnd > existStart;
}

function formatTimeOnly(timestampMs?: number) {
  if (!timestampMs || isNaN(timestampMs)) return "--:--";
  try {
    return new Date(timestampMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return "--:--";
  }
}

function getSlotTimelineStyles(startTimeVal: string | number, endTimeVal: string | number) {
  const startMins = parseTimeToMinutes(startTimeVal);
  const endMins = parseTimeToMinutes(endTimeVal);

  const startOffset = Math.max(0, startMins - (CAFE_START_HOUR * 60));
  const endOffset = Math.min(TOTAL_CAFE_MINUTES, (endMins <= startMins ? endMins + 24 * 60 : endMins) - (CAFE_START_HOUR * 60));

  const left = (startOffset / TOTAL_CAFE_MINUTES) * 100;
  const width = Math.max(1.5, ((endOffset - startOffset) / TOTAL_CAFE_MINUTES) * 100);

  return {
    left: `${Math.min(98, Math.max(0, left))}%`,
    width: `${Math.min(100 - left, width)}%`
  };
}

function format12HourDisplay(time24?: string) {
  if (!time24) return "--:--";
  try {
    const parts = time24.split(" - ");
    const startPart = parts[0];

    if (/AM|PM/i.test(startPart)) return time24;

    const [h, m] = startPart.split(":").map(Number);
    let displayHour = h > 12 ? h - 12 : h;
    if (displayHour === 0) displayHour = 12;
    const ampm = h >= 12 ? "PM" : "AM";

    const formattedHour = displayHour.toString().padStart(2, "0");
    const formattedMin = (m || 0).toString().padStart(2, "0");
    return `${formattedHour}:${formattedMin} ${ampm}`;
  } catch {
    return time24;
  }
}

function calculateEndTime(startHourStr: string, startMinStr: string, durationMins: number) {
  const sH = parseInt(startHourStr, 10) || 11;
  const sM = parseInt(startMinStr, 10) || 0;

  const totalEndMins = sH * 60 + sM + (durationMins || 10);
  const eH = Math.min(CAFE_END_HOUR, Math.floor(totalEndMins / 60));
  const eM = totalEndMins % 60;

  const eHStr = eH.toString().padStart(2, "0");
  const eMStr = eM.toString().padStart(2, "0");

  return {
    raw: `${eHStr}:${eMStr}`,
    display: format12HourDisplay(`${eHStr}:${eMStr}`)
  };
}

function isStationSimulator(station: any): boolean {
  if (!station) return false;
  const k = (station.kind || "").toLowerCase();
  const id = (station.id || "").toLowerCase();
  const name = (station.name || "").toLowerCase();

  return k === "sim" || k === "simulator" || id.includes("sim") || name.includes("sim") || name.includes("truck");
}

function isStationPS4(station: any): boolean {
  if (!station) return false;
  const k = (station.kind || "").toLowerCase();
  const id = (station.id || "").toLowerCase();
  const name = (station.name || "").toLowerCase();

  return k === "ps4" || id.includes("ps4") || name.includes("ps4");
}

function isStationPS5(station: any): boolean {
  if (!station) return false;
  const k = (station.kind || "").toLowerCase();
  const id = (station.id || "").toLowerCase();
  const name = (station.name || "").toLowerCase();

  return k === "ps5" || id.includes("ps5") || name.includes("ps5");
}

function getStationDisplayName(station: any): string {
  if (!station) return "";
  const id = (station.id || "").toLowerCase();
  const name = (station.name || "").toLowerCase();

  if (id.includes("ps5-01") || id.includes("ps5_01") || name.includes("ps5-01") || name.includes("ps5 01")) {
    return "PS5-01 (55\" VIP)";
  }
  if (id.includes("ps5-02") || id.includes("ps5_02") || name.includes("ps5-02") || name.includes("ps5 02")) {
    return "PS5-02 (55\" VIP)";
  }
  if (id.includes("ps5-03") || id.includes("ps5_03") || name.includes("ps5-03") || name.includes("ps5 03")) {
    return "PS5-03 (43\" Reg)";
  }
  if (id.includes("ps5-04") || id.includes("ps5_04") || name.includes("ps5-04") || name.includes("ps5 04")) {
    return "PS5-04 (43\" Reg)";
  }

  if (isStationPS4(station)) {
    return station.name || "PS4 Console";
  }

  if (id.includes("truck") || name.includes("truck")) {
    return station.name || "Truck Simulator";
  }

  return station.name || station.id;
}

export function ConsoleScheduleModal({ stations = [], sessions = {} }: Props) {
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [reservations, setReservations] = useState<Record<string, ReservationSlot[]>>({});
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<{ stationId: string; text: string } | null>(null);
  const [, setCurrentTimeTick] = useState(Date.now());

  const [inputState, setInputState] = useState<Record<string, {
    customer: string;
    startHour: string;
    startMin: string;
    durationMins: number;
  }>>({});

  useEffect(() => {
    const timer = setInterval(() => setCurrentTimeTick(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const fetchBackendReservations = async () => {
    setLoading(true);
    try {
      let records: any[] = [];

      const res = await fetch(`${getApiBaseUrl()}/api/bookings?t=${Date.now()}`, {
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      if (res.ok) {
        const data = await res.json();
        records = Array.isArray(data) ? data : (data.bookings || []);
      }

      if (records.length === 0 && typeof localStorage !== 'undefined') {
        const localData = localStorage.getItem('strangers_bookings') || localStorage.getItem('stranger_cafe_bookings');
        if (localData) {
          try { records = JSON.parse(localData); } catch { }
        }
      }

      const grouped: Record<string, ReservationSlot[]> = {};

      records.forEach((b: any) => {
        const statusStr = String(b.status || "APPROVED").toUpperCase();
        if (statusStr === "REJECTED" || statusStr === "CANCELLED") return;

        let rawStId = String(b.station_id || b.stationId || b.platform || b.category || "").toLowerCase();
        const platformKind = String(b.platform || b.kind || b.category || "").toLowerCase();
        const slotStr = b.slot_time || b.slotTime || b.slot || b.time_slot || b.timeSlot || "";
        const parts = slotStr.split(" - ");
        const startStr = parts[0] || "11:00 AM";
        const endStr = parts[1] || "12:00 PM";

        // Extract Date or Fallback to formatted current date
        const bDateStr = b.bookingDate || b.booking_date || b.date || formatDateToReadable();
        const formattedDate = (bDateStr.toLowerCase() === "today") ? formatDateToReadable() : bDateStr;

        let targetStationId = "";

        const exactMatch = stations.find(s => String(s.id).toLowerCase() === rawStId);
        if (exactMatch) {
          targetStationId = exactMatch.id;
        } else {
          const candidateStations = stations.filter(s => {
            const sId = String(s.id).toLowerCase();
            const sKind = String(s.kind || "").toLowerCase();
            const sName = String(s.name || "").toLowerCase();

            const bookingScreen = String(b.screen || "").toLowerCase();

            if (rawStId.includes("ps5_vip") || rawStId.includes("ps5-vip") || platformKind.includes("ps5_vip")) {
              return sId.includes("ps5-01") || sId.includes("ps5-02") || sName.includes("vip");
            }
            if (rawStId.includes("ps5_reg") || rawStId.includes("ps5-reg") || platformKind.includes("ps5_reg")) {
              return sId.includes("ps5-03") || sId.includes("ps5-04") || sName.includes("reg");
            }

            if (bookingScreen.includes("truck") || rawStId.includes("truck")) {
              return sId.includes("truck") || sName.includes("truck");
            }

            if (bookingScreen.includes("car") || rawStId.includes("car") || platformKind === "simulator") {
              return (sId.includes("sim") || sKind.includes("sim")) && !sId.includes("truck") && !sName.includes("truck");
            }

            if (rawStId.includes("pc") || platformKind.includes("pc")) {
              return sKind === "pc" || sKind === "pc_gaming";
            }
            if (rawStId.includes("ps4") || platformKind.includes("ps4")) {
              return sKind === "ps4" || sId.includes("ps4");
            }

            return sId === rawStId || sKind === platformKind;
          });

          for (const candidate of candidateStations) {
            const existingSlots = grouped[candidate.id] || [];
            const hasConflict = existingSlots.some(slot =>
              isTimeSlotOverlapping(startStr, endStr, slot.startTime, slot.endTime)
            );
            if (!hasConflict) {
              targetStationId = candidate.id;
              break;
            }
          }

          if (!targetStationId && candidateStations.length > 0) {
            targetStationId = candidateStations[candidateStations.length - 1].id;
          }
        }

        if (!targetStationId) return;

        const isOnline = !String(b.id || "").toUpperCase().startsWith("WALKIN") &&
          !String(b.id || "").toUpperCase().startsWith("WLK") &&
          !String(b.customer_name || b.customer || "").toLowerCase().includes("walk-in");

        if (!grouped[targetStationId]) grouped[targetStationId] = [];
        grouped[targetStationId].push({
          id: String(b.id),
          customerName: b.customer_name || b.customerName || b.customer || b.name || (isOnline ? "Online Booking" : "Walk-In"),
          phone: b.phone || "",
          startTime: startStr,
          endTime: endStr,
          status: statusStr,
          isOnlineBooking: isOnline,
          utr: b.utr,
          bookingDate: formattedDate
        });
      });

      setReservations(grouped);
    } catch (e) {
      console.error("Failed to fetch slots from DB:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackendReservations();
    const interval = setInterval(fetchBackendReservations, 3000);
    return () => clearInterval(interval);
  }, [stations]);

  const filteredStations = (stations || []).filter(station => {
    if (selectedCategory === "ALL") return true;

    const stationKind = (station?.kind || "").toLowerCase();
    const isSim = isStationSimulator(station);
    const isPs4 = isStationPS4(station);
    const isPs5 = isStationPS5(station);

    if (selectedCategory === "sim") return isSim;
    if (selectedCategory === "ps4") return isPs4;
    if (selectedCategory === "ps5") return isPs5;
    if (selectedCategory === "pc") return (stationKind === "pc" || stationKind === "pc_gaming") && !isSim;

    return stationKind === selectedCategory;
  });

  const getInitialValidTime = () => {
    const validHours = getValidHoursOptions();
    if (validHours.length === 0) return { hour: "22", min: "00" };

    const firstHour = validHours[0].value;
    const validMins = getValidMinutesOptions(firstHour);
    const firstMin = validMins.length > 0 ? validMins[0].value : "00";

    return { hour: firstHour, min: firstMin };
  };

  const handleInputChange = (stationId: string, field: string, value: any) => {
    if (errorMessage?.stationId === stationId) setErrorMessage(null);
    setInputState(prev => {
      const station = stations.find(s => s.id === stationId);
      const isSim = isStationSimulator(station);
      const defaultDuration = isSim ? 10 : 30;
      const initialTime = getInitialValidTime();

      const current = prev[stationId] || {
        customer: "",
        startHour: initialTime.hour,
        startMin: initialTime.min,
        durationMins: defaultDuration
      };

      const updated = { ...current, [field]: value };

      if (field === "startHour") {
        const validMins = getValidMinutesOptions(updated.startHour);
        if (!validMins.some(m => m.value === updated.startMin)) {
          updated.startMin = validMins.length > 0 ? validMins[0].value : "00";
        }
      }

      return { ...prev, [stationId]: updated };
    });
  };

  const handleAddReservation = async (stationId: string, stationKind: string) => {
    setErrorMessage(null);
    const station = stations.find(s => s.id === stationId);
    const isSim = isStationSimulator(station);
    const isPs4 = isStationPS4(station);
    const isPs5 = isStationPS5(station);
    const isTruck = (station.id || "").toLowerCase().includes("truck") || (station.name || "").toLowerCase().includes("truck");

    const defaultDuration = isSim ? 10 : 30;
    const initialTime = getInitialValidTime();

    const current = inputState[stationId] || {
      customer: "",
      startHour: initialTime.hour,
      startMin: initialTime.min,
      durationMins: defaultDuration
    };

    const startTimeFormatted = format12HourDisplay(`${current.startHour}:${current.startMin}`);
    const endObj = calculateEndTime(current.startHour, current.startMin, current.durationMins);

    const formatTimeWithZero = (tStr: string) => tStr.replace(/\b(\d):/g, "0$1:");
    const slotTimeFormatted = `${formatTimeWithZero(startTimeFormatted)} - ${formatTimeWithZero(endObj.display)}`;

    const { hour: curHour, minute: curMin } = getCurrentSystemTime();
    const selectedStartMins = parseInt(current.startHour, 10) * 60 + parseInt(current.startMin, 10);
    const currentClockMins = curHour * 60 + curMin;

    if (selectedStartMins <= currentClockMins) {
      setErrorMessage({
        stationId,
        text: `⚠️ Time Passed: ${startTimeFormatted} nikalke chuka hai. Agla time choose karein.`
      });
      return;
    }

    const currentResList = reservations[stationId] || [];
    const conflictBooking = currentResList.find((res) =>
      isTimeSlotOverlapping(startTimeFormatted, endObj.display, res.startTime, res.endTime)
    );

    if (conflictBooking) {
      setErrorMessage({
        stationId,
        text: `❌ Slot Occupied by ${conflictBooking.customerName} (${conflictBooking.startTime} - ${conflictBooking.endTime}).`
      });
      return;
    }

    const targetCategory = isPs5 ? "PS5" : isPs4 ? "PS4" : isSim ? "Simulator" : "PC";
    const stIdLower = (station.id || "").toLowerCase();
    const targetScreen = stIdLower.includes("ps5-01") || stIdLower.includes("ps5-02")
      ? '55" VIP'
      : stIdLower.includes("ps5-03") || stIdLower.includes("ps5-04")
        ? '43" Standard'
        : isSim ? (isTruck ? "Truck" : "Car") : "";

    const now = new Date();
    const createdTimeString = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const currentDateFormatted = formatDateToReadable(now);

    const newBooking = {
      id: `WALKIN_${Date.now()}`,
      name: current.customer.trim() || "Walk-In Blocked",
      customer_name: current.customer.trim() || "Walk-In Blocked",
      customerName: current.customer.trim() || "Walk-In Blocked",
      phone: "0000000000",
      category: targetCategory,
      station_id: targetCategory,
      stationId: targetCategory,
      screen: targetScreen,
      team: "1 Player",
      platform: isSim ? "sim" : stationKind,
      slot: slotTimeFormatted,
      slot_time: slotTimeFormatted,
      slotTime: slotTimeFormatted,
      bookingDate: currentDateFormatted,
      booking_date: currentDateFormatted,
      date: currentDateFormatted,
      duration: `${current.durationMins} mins`,
      created_time: createdTimeString,
      status: "APPROVED",
      price: 0,
      utr: "OFFLINE-ADMIN-BLOCK"
    };

    try {
      await fetch(`${getApiBaseUrl()}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify(newBooking)
      });
      fetchBackendReservations();
    } catch (e) {
      console.error("Error saving slot to server:", e);
    }

    const resetTime = getInitialValidTime();
    setInputState(prev => ({
      ...prev,
      [stationId]: {
        customer: "",
        startHour: resetTime.hour,
        startMin: resetTime.min,
        durationMins: current.durationMins
      }
    }));
  };

  const handleRemoveReservation = async (slotId: string) => {
    try {
      await fetch(`${getApiBaseUrl()}/api/bookings/${slotId}`, {
        method: 'DELETE',
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      fetchBackendReservations();
    } catch (e) {
      console.error("Error removing slot:", e);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 border-purple-500/50 bg-purple-950/40 text-purple-200 hover:bg-purple-900/60 font-bold h-9 text-xs">
          <Calendar className="size-4 text-purple-400" />
          Slot Manager
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-5xl border-slate-800 bg-slate-950 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b border-slate-800 pb-3 flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2 text-xl font-black text-purple-400">
            <Clock className="size-5" /> Live Console Schedule & Real-Time Slot Checker
          </DialogTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchBackendReservations}
            className="text-xs text-slate-400 hover:text-white cursor-pointer"
          >
            <RefreshCw className={`size-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Sync DB
          </Button>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 my-2">
          {CATEGORIES.map(cat => (
            <Button
              key={cat.id}
              size="sm"
              variant={selectedCategory === cat.id ? "default" : "outline"}
              className={cn(
                "h-8 text-xs font-bold cursor-pointer",
                selectedCategory === cat.id
                  ? "bg-purple-600 text-white hover:bg-purple-500"
                  : "border-slate-800 bg-black/40 text-slate-300"
              )}
              onClick={() => setSelectedCategory(cat.id)}
            >
              <Filter className="size-3 mr-1" />
              {cat.label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          {filteredStations.map((station) => {
            const activeSession = sessions?.[station.id];
            const isLiveBusy = !!activeSession;
            const stationResList = reservations[station.id] || [];

            const startTimeFormatted = isLiveBusy ? formatTimeOnly(activeSession?.startTime) : null;
            const endTimeFormatted = isLiveBusy && activeSession?.startTime && activeSession?.totalMs
              ? formatTimeOnly(activeSession.startTime + activeSession.totalMs)
              : null;

            const isSim = isStationSimulator(station);
            const isTruck = (station.id || "").toLowerCase().includes("truck") || (station.name || "").toLowerCase().includes("truck");
            const isPs4 = isStationPS4(station);
            const isPs5 = isStationPS5(station);
            const durationOptions = isSim ? SIM_DURATIONS : CONSOLE_DURATIONS;

            const validHours = getValidHoursOptions();
            const defaultTime = getInitialValidTime();

            const rawInput = inputState[station.id];
            let currentSelectedHour = rawInput?.startHour || defaultTime.hour;

            if (!validHours.some(h => h.value === currentSelectedHour)) {
              currentSelectedHour = validHours.length > 0 ? validHours[0].value : "22";
            }

            const validMinutes = getValidMinutesOptions(currentSelectedHour);
            let currentSelectedMin = rawInput?.startMin || defaultTime.min;
            if (!validMinutes.some(m => m.value === currentSelectedMin)) {
              currentSelectedMin = validMinutes.length > 0 ? validMinutes[0].value : "00";
            }

            const currentInputs = {
              customer: rawInput?.customer || "",
              startHour: currentSelectedHour,
              startMin: currentSelectedMin,
              durationMins: rawInput?.durationMins || (isSim ? 10 : 30)
            };

            const selectedStartStr = format12HourDisplay(`${currentInputs.startHour}:${currentInputs.startMin}`);
            const calculatedEnd = calculateEndTime(currentInputs.startHour, currentInputs.startMin, currentInputs.durationMins);

            const currentSelectedConflict = stationResList.find((res) =>
              isTimeSlotOverlapping(selectedStartStr, calculatedEnd.display, res.startTime, res.endTime)
            );

            return (
              <div
                key={station.id}
                className={cn(
                  "p-3.5 rounded-xl border space-y-3 bg-slate-900/50 transition-all",
                  isLiveBusy
                    ? "border-red-500/50 shadow-md shadow-red-950/20"
                    : stationResList.length > 0
                      ? "border-amber-500/50"
                      : "border-slate-800"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isTruck ? (
                      <Truck className="size-4 text-amber-400" />
                    ) : isSim ? (
                      <Car className="size-4 text-sky-400" />
                    ) : isPs5 ? (
                      <Gamepad2 className="size-4 text-indigo-400" />
                    ) : isPs4 ? (
                      <Gamepad2 className="size-4 text-blue-400" />
                    ) : (
                      <Monitor className="size-4 text-red-400" />
                    )}

                    <span className="font-extrabold text-sm tracking-wide text-white">
                      {getStationDisplayName(station)}
                    </span>
                  </div>

                  <Badge
                    className={cn(
                      "font-black text-[10px] tracking-wider uppercase",
                      isLiveBusy
                        ? "bg-red-600 text-white animate-pulse"
                        : stationResList.length > 0
                          ? "bg-amber-600 text-white"
                          : "bg-emerald-600 text-white"
                    )}
                  >
                    {isLiveBusy ? "BUSY NOW" : stationResList.length > 0 ? "RESERVED" : "AVAILABLE"}
                  </Badge>
                </div>

                {errorMessage?.stationId === station.id && (
                  <div className="flex items-center gap-1.5 p-2 rounded bg-red-950/80 border border-red-500/80 text-xs text-red-200 font-bold">
                    <AlertCircle className="size-4 text-red-400 shrink-0" />
                    <span>{errorMessage.text}</span>
                  </div>
                )}

                {/* ACCURATE DYNAMIC TIMELINE BAR */}
                <div className="space-y-1 bg-black/40 p-2 rounded-lg border border-slate-800/80">
                  <div className="flex justify-between text-[9px] text-slate-400 font-mono tracking-wider">
                    <span>11 AM</span>
                    <span>2 PM</span>
                    <span>6 PM</span>
                    <span>10 PM</span>
                  </div>

                  <div className="relative h-3.5 w-full bg-emerald-500/20 rounded-full overflow-hidden border border-emerald-500/30">
                    {/* Live running session block */}
                    {isLiveBusy && activeSession?.startTime && activeSession?.totalMs && (() => {
                      const liveStyles = getSlotTimelineStyles(activeSession.startTime, activeSession.startTime + activeSession.totalMs);
                      return (
                        <div
                          className="absolute top-0 bottom-0 bg-red-600 rounded animate-pulse z-10"
                          style={liveStyles}
                          title="Live Running Session"
                        />
                      );
                    })()}

                    {/* Booked slots accurately positioned */}
                    {stationResList.map((res) => {
                      const slotStyles = getSlotTimelineStyles(res.startTime, res.endTime);
                      return (
                        <div
                          key={res.id}
                          className={cn(
                            "absolute top-0 bottom-0 rounded border border-black/40",
                            res.isOnlineBooking
                              ? "bg-red-500/90 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                              : "bg-amber-500"
                          )}
                          style={slotStyles}
                          title={`${res.customerName} (${res.startTime} - ${res.endTime}) [${res.bookingDate || ''}]`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* CURRENT LIVE SESSION STATUS */}
                {isLiveBusy && activeSession ? (
                  <div className="px-2.5 py-1.5 rounded bg-red-950/40 border border-red-800/60 text-xs flex items-center justify-between">
                    <span className="font-bold text-red-200 flex items-center gap-1.5">
                      <UserCheck className="size-3.5 text-red-400" /> {activeSession.customer || "Walk-In Player"}
                    </span>
                    <span className="text-amber-300 font-mono font-bold text-[11px]">
                      {startTimeFormatted} - {endTimeFormatted}
                    </span>
                  </div>
                ) : (
                  <div className="px-2 py-1 rounded bg-black/30 text-[11px] text-slate-400 flex items-center gap-1">
                    <CheckCircle2 className="size-3 text-emerald-400" /> Ready for immediate walk-in.
                  </div>
                )}

                {/* UPCOMING RESERVED LIST */}
                {stationResList.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Booked Slots:</div>
                    {stationResList.map((res) => (
                      <div
                        key={res.id}
                        className={cn(
                          "flex items-center justify-between px-2.5 py-1 rounded border text-[11px]",
                          res.isOnlineBooking
                            ? "bg-red-950/40 border-red-800/60 text-red-100"
                            : "bg-amber-950/30 border-amber-800/40"
                        )}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {res.isOnlineBooking ? (
                            <Globe className="size-3.5 text-red-400 shrink-0" />
                          ) : (
                            <UserCheck className="size-3.5 text-amber-400 shrink-0" />
                          )}
                          <span className="font-semibold text-white truncate">
                            {res.customerName} {res.phone ? `(${res.phone})` : ""}
                          </span>
                          {res.isOnlineBooking && (
                            <Badge className="bg-red-600 text-white text-[8px] px-1 py-0 h-3.5 font-bold">ONLINE</Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className={cn("font-mono font-bold text-[10px] px-1.5 py-0.5 rounded", res.isOnlineBooking ? "bg-red-900/80 text-red-200" : "bg-amber-900/80 text-amber-200")}>
                            {res.bookingDate ? `${res.bookingDate} | ` : ""}{format12HourDisplay(res.startTime)} - {format12HourDisplay(res.endTime)}
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-5 w-5 text-red-400 hover:text-white hover:bg-red-600 cursor-pointer"
                            onClick={() => handleRemoveReservation(res.id)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* FORM INPUTS */}
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  {currentSelectedConflict && (
                    <div className="p-1.5 rounded bg-red-950/90 border border-red-500 text-[11px] text-red-200 font-bold flex items-center justify-between animate-fadeIn">
                      <span className="flex items-center gap-1">
                        <AlertCircle className="size-3.5 text-red-400 shrink-0" />
                        SLOT OCCUPIED by {currentSelectedConflict.customerName} ({currentSelectedConflict.startTime} - {currentSelectedConflict.endTime})
                      </span>
                      <Badge className="bg-red-600 text-white text-[9px]">FULL</Badge>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Input
                      type="text"
                      placeholder="Customer / Walk-In Name"
                      value={currentInputs.customer}
                      onChange={(e) => handleInputChange(station.id, "customer", e.target.value)}
                      className="h-8 text-xs bg-black/50 border-slate-800 focus:border-purple-500 flex-1 min-w-[120px]"
                    />

                    {/* Hour Select */}
                    <select
                      value={currentInputs.startHour}
                      onChange={(e) => handleInputChange(station.id, "startHour", e.target.value)}
                      className="h-8 text-xs bg-black/50 border border-slate-800 rounded px-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
                    >
                      {validHours.map(h => (
                        <option key={h.value} value={h.value} className="bg-slate-900 text-white">
                          {h.label}
                        </option>
                      ))}
                    </select>

                    <span className="text-slate-500 font-bold">:</span>

                    {/* Minute Select */}
                    <select
                      value={currentInputs.startMin}
                      onChange={(e) => handleInputChange(station.id, "startMin", e.target.value)}
                      className="h-8 text-xs bg-black/50 border border-slate-800 rounded px-1.5 text-slate-200 focus:outline-none focus:border-purple-500"
                    >
                      {validMinutes.map(m => (
                        <option key={m.value} value={m.value} className="bg-slate-900 text-white">
                          {m.label}
                        </option>
                      ))}
                    </select>

                    {/* Duration Select */}
                    <select
                      value={currentInputs.durationMins}
                      onChange={(e) => handleInputChange(station.id, "durationMins", Number(e.target.value))}
                      className="h-8 text-xs bg-black/50 border border-slate-800 rounded px-1.5 text-purple-300 font-semibold focus:outline-none focus:border-purple-500"
                    >
                      {durationOptions.map(d => (
                        <option key={d.mins} value={d.mins} className="bg-slate-900 text-white">
                          {d.label}
                        </option>
                      ))}
                    </select>

                    <Button
                      size="sm"
                      onClick={() => handleAddReservation(station.id, station.kind || "console")}
                      disabled={!!currentSelectedConflict}
                      className={cn(
                        "h-8 text-xs font-bold gap-1 cursor-pointer transition-all",
                        currentSelectedConflict
                          ? "bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed"
                          : "bg-purple-600 hover:bg-purple-500 text-white"
                      )}
                    >
                      <Plus className="size-3.5" /> Block
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}