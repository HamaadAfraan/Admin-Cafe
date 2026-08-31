export type StationKind = "ps5" | "ps4" | "pc" | "sim";

export type Station = {
  id: string;
  kind: StationKind;
  ip: string;
  hostname?: string;
};

export type Session = {
  stationId: string;
  customer: string;
  totalMs: number;
  remainingMs: number;
  startedAt: number;
  paused: boolean;
  playerCount?: number;
};

export const KIND_LABEL: Record<StationKind, string> = {
  sim: "Racing Sim",
  ps5: "PS5 Console",
  ps4: "PS4 Console",
  pc: "Gaming PC",
};

export const DEFAULT_BRIDGE_URL = "http://localhost:5000";

export const RATE_PER_HOUR: Record<StationKind, number> = {
  sim: 250,
  ps5: 150,
  ps4: 100,
  pc: 120,
};

export const PRICING_TABLE: Record<string, Record<number, { p30: number; p60: number }>> = {
  ps5_vip: {
    1: { p30: 100, p60: 180 },
    2: { p30: 160, p60: 300 },
    3: { p30: 210, p60: 400 },
    4: { p30: 260, p60: 500 },
  },
  ps5: {
    1: { p30: 80, p60: 150 },
    2: { p30: 100, p60: 200 },
    3: { p30: 150, p60: 300 },
  },
  ps4: {
    1: { p30: 50, p60: 100 },
    2: { p30: 100, p60: 160 },
    3: { p30: 150, p60: 250 },
    4: { p30: 180, p60: 300 },
  },
  pc: {
    1: { p30: 70, p60: 120 },
  },
  sim: {
    1: { p30: 150, p60: 250 },
  },
};

export function calculateDynamicPrice(
  kind: StationKind,
  stationId: string = "",
  players: number = 1,
  totalPlayedMinutes: number = 0
): { amount: number; rateType: string } {
  if (totalPlayedMinutes <= 0) return { amount: 0, rateType: "30m Rate" };

  const isVip = stationId === "PS5-01" || stationId === "PS5-02";
  const categoryKey = kind === "ps5" && isVip ? "ps5_vip" : kind;

  const category = PRICING_TABLE[categoryKey] ?? PRICING_TABLE["ps5"] ?? {};
  const rates = category[players] ?? category[1] ?? { p30: 0, p60: 0 };

  let amount = 0;
  let rateType = "";

  if (totalPlayedMinutes <= 30) {
    const perMinuteRate = rates.p30 / 30;
    amount = totalPlayedMinutes * perMinuteRate;
    rateType = "30m Rate";
  } else {
    const perMinuteRate = rates.p60 / 60;
    amount = totalPlayedMinutes * perMinuteRate;
    rateType = "1h Rate";
  }

  return {
    amount: Math.round(amount),
    rateType,
  };
}

export function calculateSessionCost(
  kind: StationKind,
  playedMinutes: number,
  stationId: string = "",
  players: number = 1
): number {
  return calculateDynamicPrice(kind, stationId, players, playedMinutes).amount;
}

export function buildStations(): Station[] {
  return [
    { id: "SIM-01", kind: "sim", ip: "192.168.1.150" },
    { id: "SIM-02", kind: "sim", ip: "192.168.1.151" },
    { id: "PS5-01", kind: "ps5", ip: "192.168.1.153" },
    { id: "PS5-02", kind: "ps5", ip: "192.168.1.154" },
    { id: "PS5-03", kind: "ps5", ip: "192.168.1.155" },
    { id: "PS5-04", kind: "ps5", ip: "192.168.1.156" },
    { id: "PS4-01", kind: "ps4", ip: "192.168.1.157" },
    { id: "PC-01", kind: "pc", ip: "192.168.1.50", hostname: "stranger-pc-1" },
    { id: "PC-02", kind: "pc", ip: "192.168.1.51", hostname: "stranger-pc-2" },
    { id: "PC-03", kind: "pc", ip: "192.168.1.52", hostname: "stranger-pc-3" },
    { id: "PC-04", kind: "pc", ip: "192.168.1.53", hostname: "stranger-pc-4" },
  ];
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export type ControlPayload = {
  station_id: string;
  action: 
    | "START" 
    | "LOCK" 
    | "EXPIRE"
    | "HOME" 
    | "BACK" 
    | "HDMI" 
    | "HDMI2" 
    | "UP" 
    | "DOWN" 
    | "LEFT" 
    | "RIGHT" 
    | "OK" 
    | "SLEEP" 
    | "WAKE" 
    | "POWER_OFF" 
    | "POWER_ON"
    | "VOL_UP"
    | "VOL_DOWN"
    | "MUTE";
  ip: string;
  minutes?: number;
};

export async function sendControl(bridgeUrl: string, payload: ControlPayload) {
  const url = `${bridgeUrl.replace(/\/$/, "")}/api/control`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Bridge responded ${res.status}`);
  return res;
}