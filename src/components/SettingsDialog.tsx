import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KIND_LABEL, type Station } from "@/lib/stations";

type Props = {
  stations: Station[];
  bridgeUrl: string;
  onSave: (stations: Station[], bridgeUrl: string) => void;
};

export function SettingsDialog({ stations, bridgeUrl, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(stations);
  const [url, setUrl] = useState(bridgeUrl);

  useEffect(() => {
    if (open) {
      setDraft(stations);
      setUrl(bridgeUrl);
    }
  }, [open, stations, bridgeUrl]);

  const update = (id: string, patch: Partial<Station>) =>
    setDraft((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="size-4" /> Network Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display tracking-widest">SYSTEM &amp; NETWORK</DialogTitle>
          <DialogDescription>
            Configure station endpoints and the local bridge used for lock/unlock automation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="bridge">Local Bridge URL</Label>
          <Input id="bridge" value={url} onChange={(e) => setUrl(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Control endpoint: {url.replace(/\/$/, "")}/api/control
          </p>
        </div>

        <ScrollArea className="h-[45vh] pr-3">
          <div className="space-y-3">
            {draft.map((s) => (
              <div
                key={s.id}
                className="grid grid-cols-[110px_1fr_1fr] items-center gap-3 rounded-lg border border-border/70 p-3"
              >
                <div>
                  <p className="font-display text-xs font-bold tracking-widest">{s.id}</p>
                  <p className="text-[10px] uppercase text-muted-foreground">
                    {KIND_LABEL[s.kind]}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">
                    {s.kind === "pc" ? "PC Local IP" : "TV Static IP"}
                  </Label>
                  <Input
                    value={s.ip}
                    onChange={(e) => update(s.id, { ip: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  {s.kind === "pc" ? (
                    <>
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        Hostname
                      </Label>
                      <Input
                        value={s.hostname ?? ""}
                        onChange={(e) => update(s.id, { hostname: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </>
                  ) : (
                    <p className="pt-4 text-[10px] uppercase text-muted-foreground">
                      CEC / IR over network
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="hero"
            onClick={() => {
              onSave(draft, url);
              setOpen(false);
            }}
          >
            Save Configuration
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
