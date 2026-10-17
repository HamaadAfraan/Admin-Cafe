import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
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

  // 3. HISTORY STATE & SUPABASE SYNC
  const [history, setHistory] = useState<SessionRecord[]>([]);

  const fetchSessionHistory = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("cafe_record_station")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Supabase fetch session history error:", error);
        return;
      }

      if (data) {
        const formatted: SessionRecord[] = data.map((item: any) => ({
          id: String(item.id),
          stationId: item.station_id,
          kind: item.kind || "ps5",
          customer: item.customer_name || "Walk-in",
          minutes: item.played_mins || 0,
          amount: Number(item.amount || 0),
          date: item.date || "",
          rawDate: item.date || "",
          startTime: item.time || "",
          endTime: "",
          timestamp: new Date(item.created_at).getTime() || Date.now(),
        }));
        setHistory(formatted);
      }
    } catch (err) {
      console.error("Failed to load session history from Supabase:", err);
    }
  }, []);

  const stationsRef = useRef(stations);
  const bridgeRef = useRef(bridgeUrl);
  stationsRef.current = stations;
  bridgeRef.current = bridgeUrl;

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

  // Initial fetch for history and bookings
  useEffect(() => {
    fetchSessionHistory();
  }, [fetchSessionHistory]);

  const fire = useCallback(
    (stationId: string, action: string, minutes?: number) => {
      const station = stationsRef.current.find((s) => s.id === stationId);
      if (!station || !station.ip) return;

      sendControl(bridgeRef.current, {
        station_id: station.id,
        action: action as any,
        ip: station.ip,
        ...(minutes ? { minutes } : {}),
      }).catch((err) => {
        console.warn(`Bridge command bypassed (Local server offline):`, err);
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

  // DIRECT SUPABASE FETCH FOR BOOKINGS
  const fetchBookings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Supabase fetch bookings error:", error);
        return;
      }

      if (data) {
        const formattedServerList: BookingRequest[] = data.map((b: any) => ({
          ...b,
          id: String(b.id),
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
      console.error("Failed to load bookings from Supabase:", err);
    }
  }, []);


// REALTIME & AUTO-POLLING SYNC FOR BOOKINGS
  useEffect(() => {
    fetchBookings();

    const channel = supabase
      .channel("public:bookings_live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => {
          fetchBookings();
        }
      )
      .subscribe();

    // Fallback Polling: Har 4 second mein automatic sync karega taaki refresh ki zaroorat na pade
    const pollingInterval = setInterval(() => {
      fetchBookings();
    }, 4000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollingInterval);
    };
  }, [fetchBookings]);

  const approveBooking = useCallback(
    async (booking: BookingRequest) => {
      setBookings((prev) =>
        prev.map((b) => (b.id === booking.id ? { ...b, status: "APPROVED" } : b))
      );

      try {
        const { error } = await supabase
          .from("bookings")
          .update({ status: "APPROVED" })
          .eq("id", booking.id);

        if (error) throw error;
        toast.success(`Booking approved for ${booking.customer_name}`);
      } catch (err) {
        toast.error("Failed to sync approval with Supabase");
      } finally {
        fetchBookings();
      }
    },
    [fetchBookings]
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
        const { error } = await supabase.from("bookings").insert([newBookingObj]);
        if (error) throw error;
        toast.success(`Walk-In reserved: ${stationId} (${startTime})`);
      } catch (err) {
        toast.info("Saved locally (Supabase sync pending)");
      }
    },
    []
  );

  const removeWalkInReservation = useCallback(
    async (slotId: string) => {
      setWalkInSlots((prev) => prev.filter((s) => s.id !== slotId));
      setBookings((prev) => prev.filter((b) => b.id !== slotId));

      try {
        await supabase.from("bookings").delete().eq("id", slotId);
        toast.info("Walk-In slot removed");
      } catch (err) {
        /* silent catch */
      }
    },
    []
  );

  const rejectBooking = useCallback(
    async (bookingId: string) => {
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: "REJECTED" } : b))
      );

      try {
        const { error } = await supabase
          .from("bookings")
          .update({ status: "REJECTED" })
          .eq("id", bookingId);

        if (error) throw error;
        toast.info("Booking request rejected");
      } catch (err) {
        toast.error("Failed to sync rejection with Supabase");
      } finally {
        fetchBookings();
      }
    },
    [fetchBookings]
  );

  const deleteSessionHistory = useCallback(async (recordId: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== recordId));
    try {
      await supabase.from("cafe_record_station").delete().eq("id", recordId);
      toast.success("Record deleted");
    } catch (err) {
      toast.error("Failed to delete record from Supabase");
    }
  }, []);

  const logSessionHistory = useCallback(async (session: Session) => {
    const startTimestamp = session.startedAt || session.startTime || Date.now();
    const sessionKey = `${session.stationId}-${startTimestamp}`;
    if (processedSessionsRef.current.has(sessionKey)) return;
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
    const dateStr = now.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const timeStr = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
// Station ID map fix taaki database mein hamesha correct ID save ho
    const rawStationId = session.stationId;
    const correctedStationId = rawStationId === "Truck-03" || rawStationId === "Truck-Sim-1" ? "SIM-03" : rawStationId;

    const recordPayload = {
      station_id: correctedStationId, // <-- Yahan corrected ID pass hogi
      kind: stationKind,
      customer_name: session.customer || "Walk-in",
      customer_phone: "0000000000",
      played_mins: playedMinutes,
      players: session.playerCount || 1,
      amount: sessionCost,
      date: dateStr,
      time: timeStr,
    };

    try {
      const { data, error } = await supabase
        .from("cafe_record_station")
        .insert([recordPayload])
        .select()
        .single();

      if (error) throw error;

      if (data) {
        const newRecord: SessionRecord = {
          id: String(data.id),
          stationId: data.station_id,
          kind: data.kind || "ps5",
          customer: data.customer_name,
          minutes: data.played_mins,
          amount: Number(data.amount),
          date: data.date,
          rawDate: now.toISOString().split("T")[0],
          startTime: data.time,
          endTime: timeStr,
          timestamp: Date.now(),
        };
        setHistory((prev) => [newRecord, ...prev]);
      }
    } catch (err) {
      console.error("Failed to save session history to Supabase:", err);
    }
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