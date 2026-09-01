import { useState } from "react";
import { 
  CalendarClock, 
  CheckCircle2, 
  XCircle, 
  User, 
  Phone, 
  Gamepad2, 
  Clock, 
  Search,
  Tag
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
  customer_name: string;
  phone: string;
  station_id: string;
  screen?: string | null;
  duration?: string;
  team?: string;
  slot_time?: string;
  slot?: string;
  price?: number;
  utr?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookings: BookingRequest[];
  onApprove: (booking: BookingRequest) => void;
  onReject: (bookingId: string) => void;
}

export function BookingsModal({ open, onOpenChange, bookings, onApprove, onReject }: Props) {
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("ALL");
  const [search, setSearch] = useState("");

  const filteredBookings = bookings.filter((b) => {
    const matchesFilter = filter === "ALL" ? true : b.status === filter;
    const searchLower = search.toLowerCase();
    const matchesSearch = 
      (b.customer_name && b.customer_name.toLowerCase().includes(searchLower)) ||
      (b.phone && b.phone.includes(search)) ||
      (b.station_id && b.station_id.toLowerCase().includes(searchLower)) ||
      (b.id && b.id.toLowerCase().includes(searchLower));
    return matchesFilter && matchesSearch;
  });

  const pendingCount = bookings.filter((b) => b.status === "PENDING").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-slate-950 text-white border-slate-800 max-h-[85vh] flex flex-col p-6">
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
          </div>
        </DialogHeader>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row gap-3 py-3 border-b border-slate-800">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
            <Input
              placeholder="Search by name, phone, station, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-slate-900 border-slate-700 text-xs text-white placeholder:text-slate-500"
            />
          </div>
          <div className="flex gap-1.5">
            {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((st) => (
              <Button
                key={st}
                size="sm"
                variant={filter === st ? "default" : "outline"}
                className={`text-xs font-bold ${
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
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-2">
          {filteredBookings.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              No booking records found.
            </div>
          ) : (
            filteredBookings.map((b) => {
              const displaySlot = b.slot_time || b.slot || "Immediate";
              const displayStation = b.screen ? `${b.station_id} (${b.screen})` : b.station_id;

              return (
                <div
                  key={b.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60 hover:border-slate-700 transition-all"
                >
                  <div className="space-y-1.5">
                    {/* Customer Info & Status Badge */}
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base text-white flex items-center gap-1.5">
                        <User className="size-4 text-amber-400" />
                        {b.customer_name}
                      </span>
                      <Badge
                        className={`text-[10px] font-black uppercase ${
                          b.status === "PENDING"
                            ? "bg-purple-950 border-purple-500 text-purple-300 animate-pulse"
                            : b.status === "APPROVED"
                            ? "bg-emerald-950 border-emerald-500 text-emerald-300"
                            : "bg-red-950 border-red-500 text-red-300"
                        }`}
                      >
                        {b.status}
                      </Badge>

                      {/* Explicit Booking ID */}
                      <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/50 ml-auto sm:ml-2">
                        ID: {b.id}
                      </span>
                    </div>

                    {/* Booking Details */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Phone className="size-3.5 text-sky-400" />
                        {b.phone || "No phone provided"}
                      </span>

                      <span className="flex items-center gap-1">
                        <Gamepad2 className="size-3.5 text-amber-400" />
                        <strong className="text-amber-300">{displayStation}</strong>
                      </span>

                      {/* Slot Timing */}
                      <span className="flex items-center gap-1 text-cyan-400 font-semibold bg-cyan-950/30 px-2 py-0.5 rounded">
                        <Clock className="size-3.5 text-cyan-400" />
                        {displaySlot}
                      </span>

                      {/* Setup Info (Duration / Team / Price) */}
                      {(b.duration || b.team || b.price) && (
                        <span className="flex items-center gap-1 text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded font-mono text-[11px]">
                          <Tag className="size-3 text-emerald-400" />
                          {[b.duration, b.team, b.price ? `₹${b.price}` : null].filter(Boolean).join(" • ")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions / Status */}
                  {b.status === "PENDING" ? (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                        onClick={() => onApprove(b)}
                      >
                        <CheckCircle2 className="size-4 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-500/60 text-red-400 hover:bg-red-950 text-xs font-bold"
                        onClick={() => onReject(b.id)}
                      >
                        <XCircle className="size-4 mr-1" /> Reject
                      </Button>
                    </div>
                  ) : (
                    <div className="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">
                      {b.status}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}