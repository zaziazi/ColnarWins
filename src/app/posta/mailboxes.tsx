"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { pollInboxNow } from "./actions";

export interface MailboxRow {
  id: string;
  label: string;
  username: string;
  active: boolean;
  lastCheckedAt: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  total: number;
  backfillFrom: string;
}

const when = new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Ljubljana" });

export function Mailboxes({ rows, unread }: { rows: MailboxRow[]; unread: number }) {
  const router = useRouter();
  const [busy, start] = React.useTransition();
  const [note, setNote] = React.useState<string | null>(null);

  return (
    <Card className="p-3.5 mb-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          {rows.length === 0 ? (
            <p className="text-[13px] text-ink-muted">Noben nabiralnik ni povezan.</p>
          ) : (
            rows.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-semibold">{b.label}</span>
                {b.lastError ? <Badge tone="danger">Napaka</Badge> : b.lastOkAt ? <Badge tone="good">Povezan</Badge> : <Badge tone="warn">Še ni preverjen</Badge>}
                <span className="text-[12px] text-ink-subtle">
                  {b.lastOkAt ? `zadnjič ${when.format(new Date(b.lastOkAt))} · ` : ""}
                  {b.total} sporočil od {new Date(`${b.backfillFrom}T12:00:00`).toLocaleDateString("sl-SI")}
                </span>
                {b.lastError && <span className="text-[12px] text-danger w-full">{b.lastError}</span>}
              </div>
            ))
          )}
          {unread > 0 && <p className="text-[12px] text-ink-subtle">{unread} sporočil še čaka na branje pomočnika.</p>}
          {note && <p className="text-[12px] text-ink-muted">{note}</p>}
        </div>
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          onClick={() =>
            start(async () => {
              setNote(null);
              const r = await pollInboxNow();
              if (r.ok) setNote(r.text);
              else toast.error(r.error);
              router.refresh();
            })
          }
        >
          <RefreshCw className="size-4" /> Preveri pošto zdaj
        </Button>
      </div>
    </Card>
  );
}
