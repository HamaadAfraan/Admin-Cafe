import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  buildStations,
  calculateSessionCost,
  DEFAULT_BRIDGE_URL,
  sendControl,
  type Session,
  type Station,
  type StationKind,
} from "@/lib/stations";

const LS_BRIDGE = "nexus.bridgeUrl";
const LS_HISTORY = "nexus.session_history";
const LS_WALKINS = "nexus.walkin_slots";
const LS_BOOKINGS = "nexus.cached_bookings";

export interface SessionRecord {
  id: string;
  stationId: string;
  kind: StationKind;
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
  category?: string;
  screen?: string;
  slot_time?: string;
  slot?: string;
  date?: string;
  bookingDate?: string;
  duration?: string;
  duration_minutes?: number;
  team?: string;
  price?: number;
  utr?: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | string;
  timestamp?: number;
}

export interface WalkInSlot {
  id: string;
  stationId: string;
  name: string;
  startTime: string;
  durationMinutes: number;
  rawDate: string;
}

export function useStationManager() {
  const [stations] = useState<Station[]>(() => buildStations());
  const [bridgeUrl, setBridgeUrl] = useState(DEFAULT_BRIDGE_URL);
  const [sessions, setSessions] = useState<Record<string, Session>>({});

  // 1. INITIALIZE BOOKINGS DIRECTLY FROM LOCALSTORAGE
  const [bookings, setBookings] = useState<BookingRequest[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(LS_BOOKINGS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 2. INITIALIZE WALKINS DIRECTLY FROM LOCALSTORAGE
  const [walkInSlots, setWalkInSlots] = useState<WalkInSlot[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(LS_WALKINS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const processedSessionsRef = useRef<Set<string>>(new Set());

  const [history, setHistory] = useState<SessionRecord[]>(() => {
    if (typeof window === "undefined") return [];
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

  const getCleanBridgeUrl = useCallback(() => {
    let url = bridgeRef.current || "http://localhost:5000";
    if (!url.startsWith("http")) url = `http://${url}`;
    return url.replace(/\/+$/, "");
  }, []);

  useEffect(() => {
    try {
      const b = localStorage.getItem(LS_BRIDGE);
      if (b) setBridgeUrl(b);
    } catch {
      /* ignore */
    }
  }, []);

  // PERSISTENCE EFFECT: Save to LocalStorage instantly on state change
  useEffect(() => {
    try {
      localStorage.setItem(LS_BOOKINGS, JSON.stringify(bookings));
    } catch {
      /* ignore */
    }
  }, [bookings]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_WALKINS, JSON.stringify(walkInSlots));
    } catch {
      /* ignore */
    }
  }, [walkInSlots]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_HISTORY, JSON.stringify(history));
    } catch {
      /* ignore */
    }
  }, [history]);

  const fire = useCallback(
    (stationId: string, action: string, minutes?: number) => {
      const station = stationsRef.current.find((s) => s.id === stationId);
      // Note: We bypass return if station is PC because PC stations still receive bridge network commands (e.g., LOCK via ADB/IP)
      if (!station || !station.ip) return;

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

  const start = useCallback(
    (stationId: string, minutes: number, customer: string, playerCount: number = 1) => {
      const now = Date.now();
      const totalMs = minutes * 60_000;
      setSessions((prev) => ({
        ...prev,
        [stationId]: {
          stationId,
          customer: customer.trim() || "Walk-in Player",
          totalMs,
          remainingMs: totalMs,
          startedAt: now,
          startTime: now,
          paused: false,
          playerCount,
        } as Session,
      }));

      fire(stationId, "START", minutes);
      toast.success(`${stationId} started for ${minutes} mins`);
    },
    [fire]
  );

  // 3. SMART FETCH: MERGES SERVER DATA WITHOUT ERASING LOCAL STATE
  const fetchBookings = useCallback(async () => {
    if (!bridgeRef.current) return;
    try {
      const baseUrl = getCleanBridgeUrl();
      const res = await fetch(`${baseUrl}/api/bookings`);
      if (res.ok) {
        const data = await res.json();
        let serverList: BookingRequest[] = [];

        if (Array.isArray(data)) {
          serverList = data;
        } else if (data && Array.isArray(data.bookings)) {
          serverList = data.bookings;
        }

        const formattedServerList: BookingRequest[] = serverList.map((b: any) => ({
          ...b,
          customer_name: b.customer_name || b.name || "Customer",
          station_id: b.station_id || b.category || "General",
          slot_time: b.slot_time || b.slot || "Immediate",
          status: String(b.status || "PENDING").trim().toUpperCase(),
        }));

        setBookings((prev) => {
          const map = new Map<string, BookingRequest>();
          prev.forEach((item) => map.set(item.id, item));
          formattedServerList.forEach((item) => map.set(item.id, item));
          return Array.from(map.values());
        });

        const serverWalkIns: WalkInSlot[] = formattedServerList
          .filter((b) => String(b.id).startsWith("WALKIN-"))
          .map((b) => ({
            id: b.id,
            stationId: b.station_id,
            name: b.customer_name,
            startTime: b.slot_time || "",
            durationMinutes: parseInt(String(b.duration || "30")) || 30,
            rawDate: b.date || b.bookingDate || "Today",
          }));

        if (serverWalkIns.length > 0) {
          setWalkInSlots((prev) => {
            const map = new Map<string, WalkInSlot>();
            prev.forEach((item) => map.set(item.id, item));
            serverWalkIns.forEach((item) => map.set(item.id, item));
            return Array.from(map.values());
          });
        }
      }
    } catch (err) {
      /* Silent catch: Local storage remains intact */
    }
  }, [getCleanBridgeUrl]);

  useEffect(() => {
    fetchBookings();
    const interval = setInterval(fetchBookings, 3000);
    return () => clearInterval(interval);
  }, [fetchBookings]);

  const approveBooking = useCallback(
    async (booking: BookingRequest) => {
      setBookings((prev) =>
        prev.map((b) => (b.id === booking.id ? { ...b, status: "APPROVED" } : b))
      );

      try {
        const baseUrl = getCleanBridgeUrl();
        await fetch(`${baseUrl}/api/bookings/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: booking.id, action: "APPROVE" }),
        });
        toast.success(`Booking approved for ${booking.customer_name}`);
      } catch (err) {
        toast.error("Failed to sync approval with server");
      } finally {
        fetchBookings();
      }
    },
    [fetchBookings, getCleanBridgeUrl]
  );

  const addWalkInReservation = useCallback(
    async (stationId: string, name: string, startTime: string, durationMinutes: number) => {
      const todayStr = "Today";
      const newSlotId = `WALKIN-${Date.now()}`;

      const newSlot: WalkInSlot = {
        id: newSlotId,
        stationId,
        name: name || "Walk-In Customer",
        startTime,
        durationMinutes,
        rawDate: todayStr,
      };

      const newBookingObj: BookingRequest = {
        id: newSlotId,
        customer_name: newSlot.name,
        phone: "0000000000",
        station_id: stationId,
        category: stationId,
        screen: "",
        slot_time: startTime,
        slot: startTime,
        duration: `${durationMinutes} mins`,
        price: 0,
        status: "APPROVED",
        team: "1 Player",
        utr: "WALKIN-CASH",
        bookingDate: todayStr,
        date: todayStr,
      };

      setWalkInSlots((prev) => [...prev, newSlot]);
      setBookings((prev) => [...prev, newBookingObj]);

      try {
        const baseUrl = getCleanBridgeUrl();
        await fetch(`${baseUrl}/api/bookings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newBookingObj),
        });
        toast.success(`Walk-In reserved: ${stationId} (${startTime})`);
      } catch (err) {
        toast.info("Saved locally (Server sync pending)");
      }
    },
    [getCleanBridgeUrl]
  );

  const removeWalkInReservation = useCallback(
    async (slotId: string) => {
      setWalkInSlots((prev) => prev.filter((s) => s.id !== slotId));
      setBookings((prev) => prev.filter((b) => b.id !== slotId));

      try {
        const baseUrl = getCleanBridgeUrl();
        await fetch(`${baseUrl}/api/bookings/${slotId}`, {
          method: "DELETE",
        });
        toast.info("Walk-In slot removed");
      } catch (err) {
        /* silent catch */
      }
    },
    [getCleanBridgeUrl]
  );

  const rejectBooking = useCallback(
    async (bookingId: string) => {
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: "REJECTED" } : b))
      );

      try {
        const baseUrl = getCleanBridgeUrl();
        await fetch(`${baseUrl}/api/bookings/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: bookingId, action: "REJECT" }),
        });
        toast.info("Booking request rejected");
      } catch (err) {
        toast.error("Failed to sync rejection with server");
      } finally {
        fetchBookings();
      }
    },
    [fetchBookings, getCleanBridgeUrl]
  );

  const deleteSessionHistory = useCallback((recordId: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== recordId));
    toast.success("Record deleted");
  }, []);

  const logSessionHistory = useCallback((session: Session) => {
    const startTimestamp = session.startedAt || session.startTime || Date.now();
    const sessionKey = `${session.stationId}-${startTimestamp}`;
    if (processedSessionsRef.current.has(sessionKey)) return;
    processedSessionsRef.current.add(sessionKey);

    const station = stationsRef.current.find((s) => s.id === session.stationId);
    const stationKind = station?.kind || "ps5";

    const playedMs = Math.max(0, session.totalMs - session.remainingMs);
    const playedMinutes = Math.max(1, Math.round(playedMs / 60_000));
    
    // Pass stationId & stationK gets Simulator pricing accurately
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
      startTime: new Date(startTimestamp).toLocaleTimeString([], {
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

  const pendingCount = bookings.filter(
    (b) => String(b.status || "").trim().toUpperCase() === "PENDING"
  ).length;

  return {
    stations,
    bridgeUrl,
    sessions,
    history,
    bookings,
    walkInSlots,
    pendingCount,
    fetchBookings,
    approveBooking,
    addWalkInReservation,
    removeWalkInReservation,
    rejectBooking,
    setBridgeUrl: setBridgeUrlCallback,
    start,
    extend,
    togglePause,
    forceLock,
    deleteSessionHistory,
  };
}