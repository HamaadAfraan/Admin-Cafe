import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  buildStations,
  calculateSessionCost,
  DEFAULT_BRIDGE_URL,
  sendControl,
  type Session,
  type Station,
} from "@/lib/stations";

const LS_BRIDGE = "nexus.bridgeUrl";
const LS_HISTORY = "nexus.session_history";

export interface SessionRecord {
  id: string;
  stationId: string;
  kind: "ps5" | "ps4" | "pc" | "sim";
  customer: string;
  minutes: number;
  amount: number;
  date: string;
  rawDate: string;
  startTime: string;
  endTime: string;
  timestamp: number;
}

export interface BookingRequest {
  id: string;
  customer_name: string;
  phone: string;
  station_id: string;
  slot_time?: string;
  date?: string;
  duration_minutes?: number;
  players_count?: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | string;
  timestamp?: number;
}

export function useStationManager() {
  const [stations] = useState<Station[]>(() => buildStations());
  const [bridgeUrl, setBridgeUrl] = useState(DEFAULT_BRIDGE_URL);
  const [sessions, setSessions] = useState<Record<string, Session>>({});
  const [bookings, setBookings] = useState<BookingRequest[]>([]);

  // Track previous pending count for audio alert trigger
  const prevPendingCountRef = useRef<number>(0);
  const processedSessionsRef = useRef<Set<string>>(new Set());

  const [history, setHistory] = useState<SessionRecord[]>(() => {
    try {
      const saved = localStorage.getItem(LS_HISTORY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const stationsRef = useRef(stations);
  const bridgeRef = useRef(bridgeUrl);
  stationsRef.current = stations;
  bridgeRef.current = bridgeUrl;

  // Helper function to format Bridge URL cleanly
  const getCleanBridgeUrl = useCallback(() => {
    let url = bridgeRef.current || "http://localhost:5000";
    if (!url.startsWith("http")) url = `http://${url}`;
    return url.replace(/\/+$/, ""); // Remove trailing slash
  }, []);

  // Web Audio API Beep Sound Generator
  const playNotificationSound = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      
      const ctx = new AudioCtx();
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); // Pitch (880Hz)
      gain.gain.setValueAtTime(0.15, ctx.currentTime);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.4); // 0.4 seconds beep
    } catch (e) {
      console.log("Audio alert playback blocked or unsupported:", e);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.removeItem("nexus.stations");
      localStorage.removeItem("nexus.stations_v2");
      const b = localStorage.getItem(LS_BRIDGE);
      if (b) setBridgeUrl(b);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_HISTORY, JSON.stringify(history));
    } catch {
      /* ignore */
    }
  }, [history]);

  // CONTROL COMMAND FUNCTION
  const fire = useCallback(
    (stationId: string, action: string, minutes?: number) => {
      const station = stationsRef.current.find((s) => s.id === stationId);
      if (!station || !station.ip || station.kind === "pc") return;

      sendControl(bridgeRef.current, {
        station_id: station.id,
        action: action as any,
        ip: station.ip,
        ...(minutes ? { minutes } : {}),
      }).catch((err) => {
        console.error(`Bridge command error:`, err);
      });
    },
    []
  );

  // START SESSION
  const start = useCallback(
    (stationId: string, minutes: number, customer: string, playerCount: number = 1) => {
      const totalMs = minutes * 60_000;
      setSessions((prev) => ({
        ...prev,
        [stationId]: {
          stationId,
          customer: customer.trim() || "Walk-in Player",
          totalMs,
          remainingMs: totalMs,
          startedAt: Date.now(),
          paused: false,
          playerCount,
        },
      }));

      fire(stationId, "START", minutes);
      toast.success(`${stationId} started for ${minutes} mins`);
    },
    [fire]
  );

  // REAL-TIME ONLINE BOOKINGS SYNC & AUDIO ALERT
  const fetchBookings = useCallback(async () => {
    if (!bridgeRef.current) return;
    try {
      const baseUrl = getCleanBridgeUrl();
      const res = await fetch(`${baseUrl}/api/bookings`);
      if (res.ok) {
        const data = await res.json();

        let list: BookingRequest[] = [];
        if (Array.isArray(data)) {
          list = data;
        } else if (data && Array.isArray(data.bookings)) {
          list = data.bookings;
        }

        const formattedList = list.map((b) => ({
          ...b,
          status: String(b.status || "PENDING").toUpperCase(),
        }));

        setBookings(formattedList);

        // Calculate current pending count
        const currentPendingCount = formattedList.filter(
          (b) => b.status === "PENDING"
        ).length;

        // Trigger Audio Alert when a NEW booking arrives
        if (
          currentPendingCount > prevPendingCountRef.current &&
          prevPendingCountRef.current !== 0
        ) {
          playNotificationSound();
          toast.info("🎮 New Online Booking Received!");
        }

        prevPendingCountRef.current = currentPendingCount;
      }
    } catch (err) {
      // Bridge server unreachable silently handled
    }
  }, [getCleanBridgeUrl, playNotificationSound]);

  // Poll online bookings every 3 seconds
  useEffect(() => {
    fetchBookings();
    const interval = setInterval(fetchBookings, 3000);
    return () => clearInterval(interval);
  }, [fetchBookings]);

  // APPROVE BOOKING
  const approveBooking = useCallback(async (booking: BookingRequest) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === booking.id ? { ...b, status: "APPROVED" } : b))
    );

    try {
      const baseUrl = getCleanBridgeUrl();
      const res = await fetch(`${baseUrl}/api/bookings/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: booking.id, action: "APPROVE" }),
      });

      if (res.ok) {
        toast.success(`Booking approved for ${booking.customer_name}`);
      }
    } catch (err) {
      toast.error("Failed to approve booking via Bridge");
    } finally {
      fetchBookings();
    }

    // Auto-Start station session upon approval
    if (booking.station_id) {
      start(
        booking.station_id,
        booking.duration_minutes || 60,
        booking.customer_name || "Online Guest",
        booking.players_count || 1
      );
    }
  }, [fetchBookings, getCleanBridgeUrl, start]);

  // REJECT BOOKING
  const rejectBooking = useCallback(async (bookingId: string) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, status: "REJECTED" } : b))
    );

    try {
      const baseUrl = getCleanBridgeUrl();
      const res = await fetch(`${baseUrl}/api/bookings/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: bookingId, action: "REJECT" }),
      });

      if (res.ok) {
        toast.info("Booking request rejected");
      }
    } catch (err) {
      toast.error("Failed to reject booking via Bridge");
    } finally {
      fetchBookings();
    }
  }, [fetchBookings, getCleanBridgeUrl]);

  const deleteSessionHistory = useCallback((recordId: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== recordId));
    toast.success("Record deleted successfully");
  }, []);

  const logSessionHistory = useCallback((session: Session) => {
    const sessionKey = `${session.stationId}-${session.startedAt}`;

    if (processedSessionsRef.current.has(sessionKey)) {
      return;
    }

    processedSessionsRef.current.add(sessionKey);

    const station = stationsRef.current.find((s) => s.id === session.stationId);
    const stationKind = station?.kind || "ps5";

    const playedMs = Math.max(0, session.totalMs - session.remainingMs);
    const playedMinutes = Math.max(1, Math.round(playedMs / 60_000));
    const sessionCost = calculateSessionCost(
      stationKind,
      playedMinutes,
      session.stationId,
      session.playerCount || 1
    );

    const now = new Date();

    const record: SessionRecord = {
      id: `${session.stationId}-${Date.now()}`,
      stationId: session.stationId,
      kind: stationKind,
      customer: session.customer || "Walk-in",
      minutes: playedMinutes,
      amount: sessionCost,
      rawDate: now.toISOString().split("T")[0],
      date: now.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      startTime: new Date(session.startedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      endTime: now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      timestamp: Date.now(),
    };

    setHistory((prev) => [record, ...prev]);
  }, []);

  const lock = useCallback(
    (stationId: string, reason: "expired" | "forced") => {
      setSessions((prev) => {
        const sessionToLock = prev[stationId];
        if (!sessionToLock) return prev;

        logSessionHistory(sessionToLock);

        const next = { ...prev };
        delete next[stationId];
        return next;
      });

      fire(stationId, "LOCK");
      toast[reason === "expired" ? "warning" : "error"](
        reason === "expired"
          ? `${stationId} expired — TV Locked`
          : `${stationId} manually locked`
      );
    },
    [fire, logSessionHistory]
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setSessions((prev) => {
        const keys = Object.keys(prev);
        if (keys.length === 0) return prev;

        let changed = false;
        const next = { ...prev };

        for (const id of keys) {
          const s = next[id];
          if (s.paused) continue;

          const rem = s.remainingMs - 1000;
          if (rem <= 0) {
            logSessionHistory(s);
            delete next[id];
            changed = true;
            fire(id, "LOCK");
            toast.warning(`${id} session ended — TV Locked`);
          } else {
            next[id] = { ...s, remainingMs: rem };
            changed = true;
          }
        }

        return changed ? next : prev;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [fire, logSessionHistory]);

  const extend = useCallback((stationId: string, extraMins: number) => {
    setSessions((prev) => {
      const existing = prev[stationId];
      if (!existing) return prev;

      const addMs = extraMins * 60_000;
      return {
        ...prev,
        [stationId]: {
          ...existing,
          totalMs: existing.totalMs + addMs,
          remainingMs: existing.remainingMs + addMs,
        },
      };
    });
    toast.info(`${stationId} extended by ${extraMins} mins`);
  }, []);

  const togglePause = useCallback((stationId: string) => {
    setSessions((prev) => {
      const existing = prev[stationId];
      if (!existing) return prev;
      return {
        ...prev,
        [stationId]: {
          ...existing,
          paused: !existing.paused,
        },
      };
    });
  }, []);

  const forceLock = useCallback(
    (stationId: string) => {
      lock(stationId, "forced");
    },
    [lock]
  );

  const setBridgeUrlCallback = useCallback((url: string) => {
    setBridgeUrl(url);
    try {
      localStorage.setItem(LS_BRIDGE, url);
    } catch {
      /* ignore */
    }
  }, []);

  // Pending count variable for Badge UI
  const pendingCount = bookings.filter((b) => b.status === "PENDING").length;

  return {
    stations,
    bridgeUrl,
    sessions,
    history,
    bookings,
    pendingCount,
    fetchBookings,
    approveBooking,
    rejectBooking,
    setBridgeUrl: setBridgeUrlCallback,
    start,
    extend,
    togglePause,
    forceLock,
    deleteSessionHistory,
  };
}