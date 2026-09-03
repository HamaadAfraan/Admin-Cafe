import { useState, useEffect, useRef } from "react";
import { 
  Gamepad2, 
  Monitor, 
  Car, 
  Pause, 
  Play, 
  Lock, 
  User, 
  Users,
  Home, 
  ArrowLeft, 
  Tv, 
  Power,
  ChevronUp, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight, 
  Crown,
  Phone,
  Volume1,
  Volume2,
  VolumeX,
  CircleDot,
  CalendarClock,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDuration, KIND_LABEL, type Session, type Station } from "@/lib/stations";
import { cn } from "@/lib/utils";
import type { BookingRequest } from "@/hooks/useStationManager";

const ICONS = { ps5: Gamepad2, ps4: Gamepad2, pc: Monitor, sim: Car } as const;

// UPDATED: Presets set to 10m, 30m, and 60m (1h)
const PRESETS = [10, 30, 60];

function formatPlayedTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;

  if (hours > 0) {
    return remMins > 0 ? `${hours} hr ${remMins} min` : `${hours} hr`;
  }
  return `${mins || 1} min`;
}

function getCategorySpecificTheme(kind: string, stationId: string, isVip: boolean) {
  let isRed = false;

  if (kind === "sim" || kind === "ps4") {
    isRed = false;
  } else if (kind === "pc") {
    isRed = true;
  } else {
    const match = stationId.match(/\d+/);
    const num = match ? parseInt(match[0], 10) : 1;
    isRed = num % 2 !== 0;
  }

  if (isRed) {
    return {
      cardBg: "bg-gradient-to-b from-red-950/80 via-red-950/20 to-black border-red-500/80 shadow-red-900/40 hover:border-red-400",
      iconBg: "border-red-400 bg-red-600/30 text-red-300 shadow-sm shadow-red-500/50",
      accentText: "text-red-400 font-bold",
      startBtn: "bg-red-600 hover:bg-red-500 text-white shadow-red-950/60 font-black",
      tagBg: isVip ? "bg-red-500/30 border-red-400/80 text-amber-300 font-extrabold" : "bg-red-500/30 border-red-400/80 text-red-200 font-bold",
    };
  } else {
    return {
      cardBg: "bg-gradient-to-b from-blue-950/80 via-blue-950/20 to-black border-blue-500/80 shadow-blue-900/40 hover:border-blue-400",
      iconBg: "border-blue-400 bg-blue-600/30 text-blue-300 shadow-sm shadow-blue-500/50",
      accentText: "text-sky-400 font-bold",
      startBtn: "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-950/60 font-black",
      tagBg: "bg-blue-500/30 border-blue-400/80 text-blue-200 font-bold",
    };
  }
}

type Props = {
  station: Station;
  session?: Session | undefined;
  pendingBooking?: BookingRequest | undefined;
  onApproveBooking?: (booking: BookingRequest) => void;
  onRejectBooking?: (bookingId: string) => void;
  onStart: (minutes: number, customer: string, playerCount?: number) => void;
  onExtend: (minutes: number) => void;
  onTogglePause: () => void;
  onForceLock: () => void;
  onControl?: (stationId: string, action: string, ip: string, minutes?: number) => void;
};

export function StationCard({
  station,
  session,
  pendingBooking,
  onApproveBooking,
  onRejectBooking,
  onStart,
  onExtend,
  onTogglePause,
  onForceLock,
  onControl,
}: Props) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [minutes, setMinutes] = useState(10);
  const [custom, setCustom] = useState(false);
  const [playerCount, setPlayerCount] = useState<number>(2);

  const lockTriggeredRef = useRef(false);

  const Icon = ICONS[station.kind] || Gamepad2;
  const expiring = !!session && session.remainingMs <= 5 * 60_000;
  const pct = session ? ((session.totalMs - session.remainingMs) / session.totalMs) * 100 : 0;

  const isVip = station.id === "PS5-01" || station.id === "PS5-02";
  const isPs5 = station.kind === "ps5";
  const isConsole = station.kind === "ps5" || station.kind === "ps4";
  const maxPlayers = (kind: string, vip: boolean) => (kind === "ps5" && !vip ? 3 : 4);

  const theme = getCategorySpecificTheme(station.kind, station.id, isVip);

  // Auto-fill customer info if pending booking exists
  useEffect(() => {
    if (pendingBooking && !session) {
      setCustomerName(pendingBooking.customer_name);
      setCustomerPhone(pendingBooking.phone);
    }
  }, [pendingBooking, session]);

  useEffect(() => {
    if (session) {
      lockTriggeredRef.current = false;
    }
  }, [session?.startTime]);

  useEffect(() => {
    if (session && session.remainingMs <= 0 && !lockTriggeredRef.current) {
      lockTriggeredRef.current = true;
      if (onControl && station.ip) {
        onControl(station.id, "LOCK", station.ip);
      }
      onForceLock();
    }
  }, [session?.remainingMs]);

  return (
    <div
      className={cn(
        "relative flex flex-col justify-between overflow-hidden rounded-xl border p-4 backdrop-blur transition-all shadow-xl min-h-[360px]",
        !session && theme.cardBg,
        session && !expiring && "border-amber-500/80 bg-gradient-to-b from-amber-950/40 via-amber-950/10 to-black shadow-amber-950/40",
        expiring && "border-red-600 bg-gradient-to-b from-red-950/60 via-red-950/20 to-black animate-pulse shadow-red-950/80",
      )}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "grid size-10 place-items-center rounded-lg border",
                session ? "border-amber-400 bg-amber-500/30 text-amber-300" : theme.iconBg,
              )}
            >
              <Icon className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="font-display text-base font-black tracking-widest text-white drop-shadow">
                  {station.id}
                </p>
                {isPs5 && isVip && (
                  <span className="flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-300 bg-red-950/90 border-red-500 shadow-sm shadow-red-900/50">
                    <Crown className="size-3 text-amber-400 fill-amber-400/20" /> VIP (55″)
                  </span>
                )}
                {isPs5 && !isVip && (
                  <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase", theme.tagBg)}>
                    43″ TV
                  </span>
                )}
                {station.kind === "ps4" && (
                  <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase", theme.tagBg)}>
                    PS4 Console
                  </span>
                )}
                {station.kind === "pc" && (
                  <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase", theme.tagBg)}>
                    Gaming Rig
                  </span>
                )}
                {station.kind === "sim" && (
                  <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase", theme.tagBg)}>
                    Simulator
                  </span>
                )}
              </div>
              <p className={cn("text-[11px] uppercase tracking-wider font-semibold", theme.accentText)}>
                {KIND_LABEL[station.kind]}
              </p>
            </div>
          </div>

          <span
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider shadow-sm",
              !session && !pendingBooking && "border-emerald-500/60 bg-emerald-950/80 text-emerald-300",
              !session && pendingBooking && "border-purple-500/80 bg-purple-950/90 text-purple-300 animate-pulse",
              session && !expiring && "border-amber-500/60 bg-amber-950/80 text-amber-300",
              expiring && "border-red-500/80 bg-red-950/90 text-red-300",
            )}
          >
            {!session ? (pendingBooking ? "Booking Req" : "Available") : expiring ? "Expiring" : "In Session"}
          </span>
        </div>

        {/* ONLINE BOOKING NOTIFICATION OVERLAY */}
        {!session && pendingBooking && (
          <div className="mt-3 p-2.5 rounded-lg border border-purple-500/50 bg-purple-950/40 backdrop-blur space-y-2">
            <div className="flex items-center justify-between text-xs text-purple-200 font-bold">
              <span className="flex items-center gap-1">
                <CalendarClock className="size-3.5 text-purple-400" />
                Online Booking Requested
              </span>
              <span className="text-[10px] text-purple-300 bg-purple-900/60 px-1.5 py-0.5 rounded">
                {pendingBooking.slot_time || "Today"}
              </span>
            </div>
            <div className="text-xs text-white">
              <p className="font-black text-amber-300">{pendingBooking.customer_name}</p>
              <p className="text-[11px] text-slate-300 flex items-center gap-1">
                <Phone className="size-3" /> {pendingBooking.phone || "No phone provided"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <Button
                size="sm"
                className="h-7 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                onClick={() => {
                  if (onApproveBooking) onApproveBooking(pendingBooking);
                }}
              >
                <CheckCircle2 className="size-3 mr-1" /> Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs font-bold border-red-500/60 text-red-400 hover:bg-red-950"
                onClick={() => {
                  if (onRejectBooking) onRejectBooking(pendingBooking.id);
                }}
              >
                <XCircle className="size-3 mr-1" /> Reject
              </Button>
            </div>
          </div>
        )}

        {session ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <p
                  className={cn(
                    "font-display text-4xl font-black tabular-nums tracking-tight drop-shadow",
                    expiring ? "text-red-400" : "text-amber-300",
                  )}
                >
                  {formatDuration(session.remainingMs)}
                </p>
                <p className="text-[11px] font-semibold text-muted-foreground mt-0.5">
                  Played so far: <span className="text-white font-bold">{formatPlayedTime(session.totalMs - session.remainingMs)}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="flex items-center justify-end gap-1 text-xs font-bold text-slate-200">
                  <User className="size-3 text-amber-400" />
                  {session.customer || "Guest Player"}
                </p>
                {isConsole && (
                  <span className="text-[10px] font-black text-amber-300 uppercase tracking-wide">
                    {session.playerCount || 1} {session.playerCount === 1 ? "Player" : "Players"}
                  </span>
                )}
              </div>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-900 border border-slate-800">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-1000",
                  expiring ? "bg-red-500 shadow-red-500/50 shadow-md" : "bg-amber-400 shadow-amber-400/50 shadow-md",
                )}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {[15, 30, 60].map((m) => (
                <Button key={m} variant="outline" size="sm" className="border-amber-500/40 bg-amber-950/30 text-amber-200 hover:bg-amber-500 hover:text-black font-bold" onClick={() => onExtend(m)}>
                  +{m}m
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <Button variant="outline" size="sm" className="border-slate-700 bg-slate-900/80 text-white hover:bg-slate-800" onClick={onTogglePause}>
                {session.paused ? <Play className="size-3.5 mr-1 text-emerald-400" /> : <Pause className="size-3.5 mr-1 text-amber-400" />}
                {session.paused ? "Resume" : "Pause"}
              </Button>

              <Button variant="destructive" size="sm" className="font-bold bg-red-600 hover:bg-red-700" onClick={() => {
                if (!lockTriggeredRef.current) {
                  lockTriggeredRef.current = true;
                  if (onControl && station.ip) {
                    onControl(station.id, "LOCK", station.ip);
                  }
                  onForceLock();
                }
              }}>
                <Lock className="size-3.5 mr-1" /> Lock Now
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <User className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Player Name"
                  className="h-8 pl-8 text-xs bg-black/50 border-slate-700/80 text-white placeholder:text-slate-500 focus:border-white"
                />
              </div>
              <div className="relative">
                <Phone className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Phone Number"
                  className="h-8 pl-8 text-xs bg-black/50 border-slate-700/80 text-white placeholder:text-slate-500 focus:border-white"
                />
              </div>
            </div>

            {isConsole ? (
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1">
                  <Users className={cn("size-3", theme.accentText)} /> Select Players
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  {Array.from({ length: maxPlayers(station.kind, isVip) }, (_, i) => i + 1).map((p) => (
                    <Button
                      key={p}
                      type="button"
                      variant={playerCount === p ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "h-8 text-xs font-extrabold transition-all",
                        playerCount === p 
                          ? cn(theme.startBtn, "border-transparent shadow-md") 
                          : "bg-black/40 border-slate-800 text-slate-300 hover:border-slate-600"
                      )}
                      onClick={() => setPlayerCount(p)}
                    >
                      {p === 1 ? <User className="size-3 mr-1" /> : <Users className="size-3 mr-1" />}
                      {p}P
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1">
                  <User className={cn("size-3", theme.accentText)} /> Solo Station
                </span>
                <div className="h-8 rounded-md bg-black/40 border border-slate-800/80 px-3 flex items-center text-xs font-semibold text-slate-400">
                  Single Player Gaming
                </div>
              </div>
            )}

            {/* PRESETS: 10m, 30m, 1h + Custom */}
            <div className="grid grid-cols-4 gap-1.5">
              {PRESETS.map((m) => (
                <Button
                  key={m}
                  variant={!custom && minutes === m ? "default" : "outline"}
                  size="sm"
                  className={!custom && minutes === m ? cn(theme.startBtn, "font-black") : "bg-black/40 border-slate-800 text-slate-300"}
                  onClick={() => {
                    setCustom(false);
                    setMinutes(m);
                  }}
                >
                  {m >= 60 ? `${m / 60}h` : `${m}m`}
                </Button>
              ))}
              <Button
                variant={custom ? "default" : "outline"}
                size="sm"
                className={custom ? cn(theme.startBtn, "font-black") : "bg-black/40 border-slate-800 text-slate-300"}
                onClick={() => setCustom(true)}
              >
                Custom
              </Button>
            </div>
            {custom && (
              <Input
                type="number"
                min={1}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value ? Number(e.target.value) : 1)}
                placeholder="Minutes"
                className="h-8 text-xs bg-black/50 border-slate-700/80 text-white"
              />
            )}

            <Button
              className={cn("w-full font-black tracking-wider shadow-lg transition-all py-2", theme.startBtn)}
              onClick={() => {
                const displayName = customerName.trim() 
                  ? customerPhone.trim() 
                    ? `${customerName} (${customerPhone})` 
                    : customerName 
                  : "Guest Player";

                lockTriggeredRef.current = false;
                onStart(minutes, displayName, isConsole ? playerCount : 1);
              }}
            >
              START SESSION
            </Button>
          </div>
        )}
      </div>

      {onControl && station.ip && station.kind !== "pc" && (
        <div className="mt-4 border-t border-slate-800/80 pt-3 w-full">
          <div className="flex items-center justify-between mb-2">
            <span className={cn("text-[10px] font-black uppercase tracking-widest", theme.accentText)}>
              TV Remote Control
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px] border-red-800/80 bg-red-950/90 text-red-300 hover:bg-red-600 hover:text-white font-bold transition-all shadow-sm active:scale-95"
              title="Turn TV Off"
              onClick={() => onControl(station.id, "POWER_OFF", station.ip!)}
            >
              <Power className="size-3 mr-1 text-red-400 fill-red-400/20" /> TV OFF
            </Button>
          </div>

          <div className="grid grid-cols-4 gap-1 mb-2 w-full">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-1 text-[10px] border-emerald-800/80 bg-emerald-950/80 text-emerald-300 hover:bg-emerald-600 hover:text-white font-bold w-full"
              title="Turn TV On (Wakeup)"
              onClick={() => onControl(station.id, "POWER_ON", station.ip!)}
            >
              <Power className="size-3 mr-1 text-emerald-400" /> TV ON
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="h-7 px-1 text-[10px] border-amber-800/80 bg-amber-950/80 text-amber-300 hover:bg-amber-600 hover:text-white font-bold w-full"
              title="Lock TV Screen Image"
              onClick={() => {
                if (onControl && station.ip) {
                  onControl(station.id, "LOCK", station.ip);
                }
              }}
            >
              <Lock className="size-3 mr-1" /> Lock
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="h-7 px-1 text-[10px] border-slate-800 bg-black/60 text-slate-200 hover:bg-slate-700 hover:text-white w-full"
              title="Input Source (HDMI 1)"
              onClick={() => onControl(station.id, "HDMI", station.ip!)}
            >
              <Tv className="size-3 mr-1" /> HDMI 1
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="h-7 px-1 text-[10px] border-slate-800 bg-black/60 text-slate-200 hover:bg-slate-700 hover:text-white w-full"
              title="Input Source (HDMI 2)"
              onClick={() => onControl(station.id, "HDMI2", station.ip!)}
            >
              <Tv className="size-3 mr-1" /> HDMI 2
            </Button>
          </div>

          <div className="grid grid-cols-5 gap-1 bg-black/60 p-1.5 rounded-lg border border-slate-800 w-full items-center justify-items-center">
            <Button size="sm" variant="ghost" className="h-8 w-full p-0 text-slate-400 hover:bg-slate-800 hover:text-white" onClick={() => onControl(station.id, "LEFT", station.ip!)}>
              <ChevronLeft className="size-4 mx-auto" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-full p-0 text-slate-400 hover:bg-slate-800 hover:text-white" onClick={() => onControl(station.id, "UP", station.ip!)}>
              <ChevronUp className="size-4 mx-auto" />
            </Button>
            <Button size="sm" variant="default" className={cn("h-8 w-full p-0 font-bold text-white", theme.startBtn)} onClick={() => onControl(station.id, "OK", station.ip!)}>
              <CircleDot className="size-4 mx-auto" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-full p-0 text-slate-400 hover:bg-slate-800 hover:text-white" onClick={() => onControl(station.id, "DOWN", station.ip!)}>
              <ChevronDown className="size-4 mx-auto" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-full p-0 text-slate-400 hover:bg-slate-800 hover:text-white" onClick={() => onControl(station.id, "RIGHT", station.ip!)}>
              <ChevronRight className="size-4 mx-auto" />
            </Button>
          </div>

          <div className="grid grid-cols-5 gap-1 mt-1.5 w-full">
            <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-400 hover:text-white bg-black/40 hover:bg-slate-800 w-full" onClick={() => onControl(station.id, "HOME", station.ip!)}>
              <Home className="size-3 mr-1" /> Home
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-400 hover:text-white bg-black/40 hover:bg-slate-800 w-full" onClick={() => onControl(station.id, "BACK", station.ip!)}>
              <ArrowLeft className="size-3 mr-1" /> Back
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-red-400 hover:text-red-300 bg-red-950/40 hover:bg-red-900/60 w-full" onClick={() => onControl(station.id, "MUTE", station.ip!)}>
              <VolumeX className="size-3" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-300 hover:text-white bg-black/40 hover:bg-slate-800 w-full" onClick={() => onControl(station.id, "VOL_DOWN", station.ip!)}>
              <Volume1 className="size-3" /> -
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-300 hover:text-white bg-black/40 hover:bg-slate-800 w-full" onClick={() => onControl(station.id, "VOL_UP", station.ip!)}>
              <Volume2 className="size-3" /> +
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}