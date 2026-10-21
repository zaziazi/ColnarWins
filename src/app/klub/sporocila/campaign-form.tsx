"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { countAudience, sendCampaign, type Audience } from "../actions";

const AUDIENCES: { key: Audience; label: string; hint: string }[] = [
  { key: "all", label: "Vsi", hint: "vsi s soglasjem za novice" },
  { key: "inactive", label: "Neaktivni", hint: "brez obiska zadnjih 45 dni" },
  { key: "reward", label: "Z nagrado", hint: "nagrada jih čaka" },
];

export function CampaignForm() {
  const router = useRouter();
  const [audience, setAudience] = React.useState<Audience>("all");
  const [count, setCount] = React.useState<number | null>(null);
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("Pozdravljeni, {ime}!\n\n");
  const [busy, setBusy] = React.useState<"test" | "send" | null>(null);

  React.useEffect(() => {
    let live = true;
    setCount(null);
    countAudience(audience).then((n) => live && setCount(n));
    return () => {
      live = false;
    };
  }, [audience]);

  async function go(test: boolean) {
    if (!test && !confirm(`Pošljem sporočilo ${count ?? ""} članom? Tega ni mogoče preklicati.`)) return;
    setBusy(test ? "test" : "send");
    const r = await sendCampaign({ subject, body, audience, test });
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    if (r.note) toast.success(r.note);
    else toast.success(`Poslano: ${r.sent}${r.failed ? ` · neuspešnih: ${r.failed}` : ""}`);
    if (!test) {
      setSubject("");
      setBody("Pozdravljeni, {ime}!\n\n");
      router.refresh();
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div>
        <div className="text-[12.5px] font-semibold text-ink-muted mb-1.5">Komu</div>
        <div className="grid grid-cols-3 gap-2">
          {AUDIENCES.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => setAudience(a.key)}
              className={cn(
                "rounded-[var(--radius-control)] border px-2 py-2 text-left",
                audience === a.key ? "border-wine bg-wine-soft" : "border-line bg-surface",
              )}
            >
              <div className="text-[13.5px] font-semibold">{a.label}</div>
              <div className="text-[11px] text-ink-subtle leading-tight">{a.hint}</div>
            </button>
          ))}
        </div>
        <p className="text-[12px] text-ink-muted mt-1.5">{count === null ? "Štejem…" : `${count} prejemnikov`}</p>
      </div>
      <label className="block">
        <span className="text-[12.5px] font-semibold text-ink-muted">Zadeva</span>
        <Input className="mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Nov letnik cvička je tu 🍷" />
      </label>
      <label className="block">
        <span className="text-[12.5px] font-semibold text-ink-muted">Sporočilo</span>
        <Textarea className="mt-1 min-h-[180px]" value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <p className="text-[12px] text-ink-subtle">
        {"{ime}"} se zamenja z imenom člana. Vsako sporočilo ima gumb do kartice in povezavo za odjavo.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void go(true)} loading={busy === "test"} disabled={busy !== null}>
          Pošlji testno meni
        </Button>
        <Button onClick={() => void go(false)} loading={busy === "send"} disabled={busy !== null || !count}>
          <Send /> Pošlji {count ? `(${count})` : ""}
        </Button>
      </div>
    </Card>
  );
}
