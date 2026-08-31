import { useState } from "react";
import { X, Search, FileText, Gamepad2, Monitor, Car, Crown, IndianRupee } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { GlobalHistoryLog } from "./StationCard";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  logs: GlobalHistoryLog[];
};

export function CustomerRecordsModal({ isOpen, onClose, logs }: Props) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  if (!isOpen) return null;

  const filteredLogs = logs.filter((log) => {
    const matchesSearch = 
      log.customerName.toLowerCase().includes(search.toLowerCase()) ||
      log.customerPhone.includes(search) ||
      log.stationId.toLowerCase().includes(search.toLowerCase());

    if (selectedCategory === "all") return matchesSearch;
    if (selectedCategory === "vip") return matchesSearch && (log.stationId === "PS5-01" || log.stationId === "PS5-02");
    if (selectedCategory === "ps5") return matchesSearch && log.kind === "ps5" && log.stationId !== "PS5-01" && log.stationId !== "PS5-02";
    if (selectedCategory === "ps4") return matchesSearch && log.kind === "ps4";
    if (selectedCategory === "pc") return matchesSearch && log.kind === "pc";
    if (selectedCategory === "sim") return matchesSearch && log.kind === "sim";

    return matchesSearch;
  });

  const totalEarnings = filteredLogs.reduce((acc, curr) => acc + curr.amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-4xl max-h-[85vh] flex flex-col rounded-xl border border-red-900/50 bg-card p-6 shadow-2xl">
        
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg border border-red-500/40 bg-red-500/10 text-red-500">
              <FileText className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground tracking-wide">
                Customer Session Records
              </h2>
              <p className="text-xs text-muted-foreground">
                All recorded gaming sessions & bill history
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-400">
              <IndianRupee className="size-3.5" /> Total: ₹{totalEarnings}
            </div>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onClose}>
              <X className="size-5" />
            </Button>
          </div>
        </div>

        {/* SEARCH & FILTERS */}
        <div className="my-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Player Name, Phone, or Station ID..."
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
                variant={selectedCategory === cat.id ? "default" : "outline"}
                className={
                  selectedCategory === cat.id 
                    ? "bg-red-600 hover:bg-red-700 text-white font-bold h-7 text-xs" 
                    : "h-7 text-xs border-border/70 hover:border-red-500/50"
                }
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.label}
              </Button>
            ))}
          </div>
        </div>

        {/* RECORDS TABLE / LIST */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[50vh]">
          {filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No matching records found.
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border border-border/70 bg-muted/20 hover:border-red-500/40 transition-all gap-2"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold px-2 py-1 rounded border border-primary/40 bg-primary/10 text-primary">
                    {log.stationId}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-foreground flex items-center gap-2">
                      {log.customerName}
                      <span className="text-[10px] text-muted-foreground font-normal">
                        ({log.customerPhone})
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Played: <strong className="text-foreground">{log.playedMins} mins</strong> ({log.players} Player{log.players > 1 ? 's' : ''})
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 text-right">
                  <div className="text-[10px] text-muted-foreground">
                    <p>{log.date}</p>
                    <p>{log.time}</p>
                  </div>
                  <span className="text-sm font-black text-emerald-400 bg-emerald-950/30 border border-emerald-800/40 px-2.5 py-1 rounded-md">
                    ₹{log.amount}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}