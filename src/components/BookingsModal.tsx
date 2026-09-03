import { useState, useEffect } from "react";
import { 
  CalendarClock, 
  CheckCircle2, 
  XCircle, 
  User, 
  Phone, 
  Gamepad2, 
  Clock, 
  Search,
  Tag,
  Trash2,
  Calendar,
  Eraser,
  RefreshCw,
  Eye,
  Receipt,
  IndianRupee
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface BookingRequest {
  id: string;
  customer_name?: string;
  customer?: string;
  name?: string;
  phone?: string;
  station_id?: string;
  platform?: string;
  category?: string;
  screen?: string | null;
  duration?: string;
  team?: string;
  slot_time?: string;
  slot?: string;
  time_slot?: string;
  timeSlot?: string;
  price?: number;
  amount?: number;
  utr?: string;
  bookingDate?: string;
  bookingdate?: string;
  booking_date?: string;
  date?: string;
  day?: string;
  createdAt?: string;
  created_at?: string;
  created_time?: string;
  createdTime?: string;
  bookedAt?: string;
  booked_at?: string;
  bookedTime?: string;
  booked_time?: string;
  time?: string;
  booking_time?: string;
  timestamp?: number | string;
  status: "PENDING" | "APPROVED" | "REJECTED" | string;
}

const getApiBaseUrl = () => {
  if (typeof window !== "undefined") {
    const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;
    if (envUrl) return envUrl;
    return `${window.location.protocol}//${window.location.hostname}:5000`;
  }
  return 'http://localhost:5000';
};

const extractBookingDay = (bookingObj: any): string => {
  if (!bookingObj || typeof bookingObj !== 'object') return "Today";

  const possibleVal = 
    bookingObj.bookingDate || 
    bookingObj.booking_date || 
    bookingObj.bookingdate || 
    bookingObj.date || 
    bookingObj.day || 
    bookingObj.slotDate;

  if (possibleVal && typeof possibleVal === 'string') {
    return possibleVal;
  }

  return "Today";
};

// Robust function to extract exact time per unique booking matching backend created_time
const extractTimeFromBooking = (b: any): string => {
  if (!b) return "N/A";

  const rawTime = 
    b.created_time || 
    b.createdTime || 
    b.bookedTime || 
    b.booked_time || 
    b.bookedAt || 
    b.booked_at || 
    b.time || 
    b.booking_time || 
    b.createdAt || 
    b.created_at || 
    b.timestamp;

  if (!rawTime) return "N/A";

  const strVal = String(rawTime).trim();

  // 1. If string is already formatted (e.g., "02:41 PM")
  if (/am|pm/i.test(strVal)) {
    return strVal;
  }

  // 2. HH:MM 24-hour string format (e.g. "14:41")
  if (/^\d{1,2}:\d{2}$/.test(strVal)) {
    const [h, m] = strVal.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
  }

  // 3. Unix epoch timestamp or ISO string dynamic parsing
  try {
    const numTs = typeof rawTime === 'number' ? (rawTime < 1e11 ? rawTime * 1000 : rawTime) : Number(strVal);
    const d = !isNaN(numTs) ? new Date(numTs) : new Date(strVal);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    }
  } catch (e) {
    // Fallback below
  }

  return strVal || "N/A";
};

// Helper to check if an approved booking slot has ended
const isBookingSlotExpired = (booking: BookingRequest): boolean => {
  try {
    const slotStr = booking.slot_time || booking.slot || booking.time_slot || booking.timeSlot || "";
    if (!slotStr) return false;

    const day = extractBookingDay(booking).toLowerCase();
    if (day.includes("tomorrow")) return false; 

    const parts = slotStr.split("-");
    const endTimeStr = (parts.length > 1 ? parts[1] : parts[0]).trim();

    const match = endTimeStr.match(/(\d+):?(\d+)?\s*(AM|PM)/i);
    if (!match) return false;

    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const modifier = match[3].toUpperCase();

    if (modifier === "PM" && hours < 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;

    const now = new Date();
    const slotEndTime = new Date();
    slotEndTime.setHours(hours, minutes, 0, 0);

    return now.getTime() > slotEndTime.getTime();
  } catch {
    return false;
  }
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookings?: BookingRequest[];
  onApprove: (booking: BookingRequest) => void;
  onReject: (bookingId: string) => void;
  onDeleteBooking?: (bookingId: string) => void;
  onClearOldRecords?: () => void;
}

export function BookingsModal({ 
  open, 
  onOpenChange, 
  bookings: initialBookings = [], 
  onApprove, 
  onReject,
  onDeleteBooking,
  onClearOldRecords
}: Props) {
  const [localBookings, setLocalBookings] = useState<BookingRequest[]>([]);
  const [filter, setFilter] = useState<"ALL" | "TODAY" | "TOMORROW" | "PENDING" | "APPROVED" | "REJECTED">("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<BookingRequest | null>(null);

  const fetchBackendBookings = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/bookings?t=${Date.now()}`, {
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data) ? data : (data.bookings || []);
    } catch (e) {
      return null;
    }
  };

  const syncBookingsData = async () => {
    setLoading(true);
    const apiData = await fetchBackendBookings();

    if (apiData && Array.isArray(apiData) && apiData.length > 0) {
      setLocalBookings(apiData);
      localStorage.setItem('strangers_bookings', JSON.stringify(apiData));
      setLoading(false);
      return;
    }

    const sourceData = initialBookings || [];
    setLocalBookings(sourceData);
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      syncBookingsData();
    }
    const interval = setInterval(() => {
      if (open) syncBookingsData();
    }, 2500);

    return () => clearInterval(interval);
  }, [open]);

  const saveAndSetBookings = (updatedList: BookingRequest[]) => {
    setLocalBookings(updatedList);
    try {
      localStorage.setItem('strangers_bookings', JSON.stringify(updatedList));
      localStorage.setItem('stranger_cafe_bookings', JSON.stringify(updatedList));
    } catch (e) {
      console.error("Storage error:", e);
    }
  };

  const triggerBackendAction = async (id: string, action: "APPROVE" | "REJECT") => {
    try {
      await fetch(`${getApiBaseUrl()}/api/bookings/action`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ id, action })
      });
    } catch (e) {
      console.error("Failed sync:", e);
    }
  };

  const handleApprove = (b: BookingRequest) => {
    onApprove(b);
    triggerBackendAction(b.id, "APPROVE");
    const updated = localBookings.map(item => item.id === b.id ? { ...item, status: 'APPROVED' as const } : item);
    saveAndSetBookings(updated);
    if (selectedBooking?.id === b.id) {
      setSelectedBooking(prev => prev ? { ...prev, status: 'APPROVED' } : null);
    }
  };

  const handleReject = (id: string) => {
    onReject(id);
    triggerBackendAction(id, "REJECT");
    const updated = localBookings.map(item => item.id === id ? { ...item, status: 'REJECTED' as const } : item);
    saveAndSetBookings(updated);
    if (selectedBooking?.id === id) {
      setSelectedBooking(prev => prev ? { ...prev, status: 'REJECTED' } : null);
    }
  };

  const handleDelete = async (id: string) => {
    const updated = localBookings.filter(b => b.id !== id);
    saveAndSetBookings(updated);

    if (selectedBooking?.id === id) {
      setSelectedBooking(null);
    }

    if (onDeleteBooking) {
      onDeleteBooking(id);
    }

    try {
      await fetch(`${getApiBaseUrl()}/api/bookings/${id}`, { 
        method: 'DELETE',
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
    } catch (e) {
      // Ignored
    }
  };

  const handleClearCompleted = async () => {
    const toKeep: BookingRequest[] = [];
    const toDelete: BookingRequest[] = [];

    localBookings.forEach((b) => {
      const st = String(b.status).toUpperCase();
      if (st === "PENDING") {
        toKeep.push(b);
      } else if (st === "REJECTED") {
        toDelete.push(b);
      } else if (st === "APPROVED") {
        if (isBookingSlotExpired(b)) {
          toDelete.push(b);
        } else {
          toKeep.push(b);
        }
      } else {
        toKeep.push(b);
      }
    });

    saveAndSetBookings(toKeep);
    if (onClearOldRecords) onClearOldRecords();

    for (const record of toDelete) {
      try {
        await fetch(`${getApiBaseUrl()}/api/bookings/${record.id}`, { 
          method: 'DELETE',
          headers: { 'ngrok-skip-browser-warning': 'true' }
        });
      } catch (e) {
        // Ignored
      }
    }
  };

  const safeBookings = Array.isArray(localBookings) ? localBookings : [];

  const filteredBookings = safeBookings.filter((b) => {
    if (!b) return false;
    let matchesFilter = true;

    const bDateNormalized = extractBookingDay(b).toLowerCase().trim();
    
    if (filter === "TODAY") {
      matchesFilter = bDateNormalized === "today";
    } else if (filter === "TOMORROW") {
      matchesFilter = bDateNormalized === "tomorrow";
    } else if (filter !== "ALL") {
      matchesFilter = String(b.status).toUpperCase() === filter;
    }

    const name = b.customer_name || b.customer || b.name || "";
    const station = b.station_id || b.platform || b.category || "";
    const searchLower = search.toLowerCase();

    const matchesSearch = 
      name.toLowerCase().includes(searchLower) ||
      (b.phone && b.phone.includes(search)) ||
      (b.utr && b.utr.toLowerCase().includes(searchLower)) ||
      station.toLowerCase().includes(searchLower) ||
      (b.id && b.id.toLowerCase().includes(searchLower));

    return matchesFilter && matchesSearch;
  });

  const sortedBookings = [...filteredBookings].sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (timeA && timeB) return timeB - timeA;
    return (b.id || "").localeCompare(a.id || "");
  });

  const pendingCount = safeBookings.filter((b) => String(b?.status).toUpperCase() === "PENDING").length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl bg-slate-950 text-white border-slate-800 max-h-[85vh] flex flex-col p-6">
          <DialogHeader className="border-b border-slate-800 pb-4">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 font-display text-xl font-black text-amber-400">
                <CalendarClock className="size-6 text-purple-400" />
                Online Bookings Manager
                {pendingCount > 0 && (
                  <Badge className="bg-purple-600 text-white font-bold ml-2">
                    {pendingCount} Pending
                  </Badge>
                )}
              </DialogTitle>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white text-xs gap-1 cursor-pointer"
                  onClick={syncBookingsData}
                >
                  <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-300 text-xs font-bold gap-1 cursor-pointer"
                  onClick={handleClearCompleted}
                >
                  <Eraser className="size-3.5" /> Clear Completed & Rejected
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 py-3 border-b border-slate-800">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
              <Input
                placeholder="Search by name, phone, UTR, station, or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-slate-900 border-slate-700 text-xs text-white placeholder:text-slate-500"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["ALL", "TODAY", "TOMORROW", "PENDING", "APPROVED", "REJECTED"] as const).map((st) => (
                <Button
                  key={st}
                  size="sm"
                  variant={filter === st ? "default" : "outline"}
                  className={`text-xs font-bold cursor-pointer ${
                    filter === st
                      ? "bg-amber-500 text-black hover:bg-amber-400"
                      : "bg-slate-900 border-slate-700 text-slate-300"
                  }`}
                  onClick={() => setFilter(st)}
                >
                  {st}
                </Button>
              ))}
            </div>
          </div>

          {/* Bookings List */}
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 py-2">
            {sortedBookings.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                No booking records found.
              </div>
            ) : (
              sortedBookings.map((b) => {
                const displaySlot = b.slot_time || b.slot || b.time_slot || b.timeSlot || "Immediate";
                const station = b.station_id || b.platform || b.category || "";
                const displayStation = b.screen ? `${station} (${b.screen})` : station;
                const customerName = b.customer_name || b.customer || b.name || "Customer";
                const bookingDay = extractBookingDay(b);
                const isExpired = String(b.status).toUpperCase() === "APPROVED" && isBookingSlotExpired(b);

                return (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBooking(b)}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-800/80 bg-slate-900/70 hover:border-amber-500/50 hover:bg-slate-900 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-3.5 flex-1 min-w-0">
                      <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-amber-400 group-hover:scale-105 transition-transform shrink-0">
                        <Gamepad2 className="size-5" />
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-white truncate">
                            {customerName}
                          </span>

                          <span className="text-[11px] font-mono font-bold text-cyan-400 bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-800/50">
                            ID: {b.id}
                          </span>

                          <Badge
                            className={`text-[9px] font-black uppercase px-1.5 py-0.5 ${
                              b.status === "PENDING"
                                ? "bg-purple-950 border-purple-500 text-purple-300 animate-pulse"
                                : b.status === "APPROVED"
                                ? isExpired 
                                  ? "bg-slate-800 border-slate-600 text-slate-400"
                                  : "bg-emerald-950 border-emerald-500 text-emerald-300"
                                : "bg-red-950 border-red-500 text-red-300"
                            }`}
                          >
                            {b.status === "APPROVED" && isExpired ? "COMPLETED" : b.status}
                          </Badge>

                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold flex items-center gap-1 border ${
                            bookingDay.toLowerCase() === 'tomorrow'
                              ? 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                              : 'bg-purple-950/80 border-purple-500/50 text-purple-300'
                          }`}>
                            <Calendar className="size-3" /> {bookingDay}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-400">
                          <span className="flex items-center gap-1 font-semibold text-amber-300">
                            <Gamepad2 className="size-3.5 text-amber-400" />
                            {displayStation}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-cyan-300 font-medium">
                            <Clock className="size-3.5 text-cyan-400" />
                            {displaySlot}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedBooking(b)}
                        className="text-slate-400 hover:text-white hover:bg-slate-800 h-8 px-2"
                        title="View Full Details"
                      >
                        <Eye className="size-4" />
                      </Button>

                      {b.status === "PENDING" && (
                        <>
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer h-8 px-2.5"
                            onClick={() => handleApprove(b)}
                          >
                            <CheckCircle2 className="size-3.5 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-500/60 text-red-400 hover:bg-red-950 text-xs font-bold cursor-pointer h-8 px-2.5"
                            onClick={() => handleReject(b.id)}
                          >
                            <XCircle className="size-3.5 mr-1" /> Reject
                          </Button>
                        </>
                      )}

                      <Button
                        size="icon"
                        variant="ghost"
                        title="Delete Record"
                        className="text-slate-500 hover:text-red-400 hover:bg-red-950/40 size-8 cursor-pointer rounded-lg border border-transparent hover:border-red-500/30"
                        onClick={() => handleDelete(b.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* RECEIPT DIALOG WITH ACCURATE CREATED_TIME FIX */}
      <Dialog open={!!selectedBooking} onOpenChange={() => setSelectedBooking(null)}>
        <DialogContent className="max-w-md bg-slate-950 border-slate-800 text-white p-5">
          <DialogHeader className="text-center pb-3 border-b border-slate-800">
            <div className="mx-auto w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-1.5">
              <Receipt className="size-5" />
            </div>
            <DialogTitle className="text-lg font-black tracking-wider uppercase text-amber-400">
              BOOKING DETAILS RECEIPT
            </DialogTitle>
            <p className="text-[11px] text-slate-400">Client-Side Reservation Information</p>
            {selectedBooking && (
              <div className="mt-2 inline-block px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full font-mono text-amber-300 font-bold text-xs">
                BOOKING ID: {selectedBooking.id}
              </div>
            )}
          </DialogHeader>

          {selectedBooking && (
            <div className="space-y-2.5 py-1 text-xs">
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-amber-400" /> Booking Date:
                </span>
                <span className="font-semibold text-slate-200">
                  {extractBookingDay(selectedBooking)}
                </span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Clock className="size-3.5 text-emerald-400" /> Booked At (Time):
                </span>
                <span className="font-mono font-bold text-emerald-300">
                  {extractTimeFromBooking(selectedBooking)}
                </span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <User className="size-3.5 text-sky-400" /> Customer Name:
                </span>
                <span className="font-bold text-white">
                  {selectedBooking.customer_name || selectedBooking.customer || selectedBooking.name || "N/A"}
                </span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Phone className="size-3.5 text-sky-400" /> Phone Number:
                </span>
                <span className="font-mono text-slate-300">{selectedBooking.phone || "N/A"}</span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Gamepad2 className="size-3.5 text-amber-400" /> Station / Platform:
                </span>
                <span className="font-bold text-amber-300">
                  {selectedBooking.station_id || selectedBooking.platform || selectedBooking.category || "N/A"}
                  {selectedBooking.screen ? ` (${selectedBooking.screen})` : ""}
                </span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Clock className="size-3.5 text-cyan-400" /> Reserved Slot Time:
                </span>
                <span className="font-semibold text-cyan-300">
                  {selectedBooking.slot_time || selectedBooking.slot || selectedBooking.time_slot || selectedBooking.timeSlot || "N/A"}
                </span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Tag className="size-3.5 text-purple-400" /> Duration / Team:
                </span>
                <span className="font-medium text-slate-300">
                  {[selectedBooking.duration, selectedBooking.team].filter(Boolean).join(" • ") || "Standard Slot"}
                </span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Receipt className="size-3.5 text-amber-400" /> Transaction UTR / Ref:
                </span>
                <span className="font-mono text-amber-300">{selectedBooking.utr || "N/A"}</span>
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="text-slate-300 font-bold flex items-center gap-1">
                  <IndianRupee className="size-3.5 text-emerald-400" /> Total Amount Paid:
                </span>
                <span className="text-base font-black text-emerald-400">
                  ₹{selectedBooking.price || selectedBooking.amount || "0"}
                </span>
              </div>
            </div>
          )}

          <div className="pt-3 flex gap-2">
            {selectedBooking?.status === "PENDING" && (
              <>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                  onClick={() => handleApprove(selectedBooking)}
                >
                  <CheckCircle2 className="size-4 mr-1" /> Approve
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-red-500/60 text-red-400 hover:bg-red-950 font-bold text-xs"
                  onClick={() => handleReject(selectedBooking.id)}
                >
                  <XCircle className="size-4 mr-1" /> Reject
                </Button>
              </>
            )}
            
            <Button
              variant="destructive"
              className="bg-red-950 hover:bg-red-900 border border-red-500/40 text-red-300 text-xs font-bold"
              onClick={() => selectedBooking && handleDelete(selectedBooking.id)}
            >
              <Trash2 className="size-4" />
            </Button>

            <Button
              className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 flex-1"
              onClick={() => setSelectedBooking(null)}
            >
              CLOSE
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}