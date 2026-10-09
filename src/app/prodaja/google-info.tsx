"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import type { GoogleLookup } from "@/lib/google-places";
import { getGoogleInfo, setVenueIgnored } from "./actions";
import { cachedGoogle, rememberGoogle } from "./google-cache";

const PRICE = ["Brezplačno", "€", "€€", "€€€", "€€€€"];

/** Google rating, review count and price level — fetched on request, never stored (Google's terms). */
export function GoogleInfo({ venueId }: { venueId: string }) {
  const router = useRouter();
  const [res, setRes] = React.useState<GoogleLookup | null>(cachedGoogle(venueId) ?? null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => setRes(cachedGoogle(venueId) ?? null), [venueId]);

  async function load() {
    setBusy(true);
    const r = await getGoogleInfo(venueId);
    setBusy(false);
    rememberGoogle(venueId, r);
    setRes(r);
  }

  if (res?.status === "unconfigured") return null;

  if (!res) {
    return (
      <div>
        <Button size="sm" variant="secondary" onClick={() => void load()} loading={busy}>
          <Star className="size-4" /> Google ocena
        </Button>
      </div>
    );
  }

  if (res.status === "notfound") return <p className="text-[12.5px] text-ink-subtle">Na Googlu tega lokala nismo našli.</p>;
  if (res.status === "limit") {
    return <p className="text-[12.5px] text-warn">Mesečna omejitev Google iskanj je dosežena. Ponovno od 1. v mesecu.</p>;
  }
  if (res.status === "error") {
    return <p className="text-[12.5px] text-danger">Google iskanje ni uspelo{res.message ? ` (${res.message})` : ""}.</p>;
  }

  if (res.status !== "ok") return null;
  const g = res.info;
  return (
    <div className="space-y-2">
      <div className="rounded-[12px] border border-line bg-surface-muted p-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          {g.rating !== null ? (
            <div className="flex items-baseline gap-1.5">
              <Star className="size-4 text-warn fill-warn self-center" />
              <span className="text-[20px] font-bold tabular leading-none">{g.rating.toFixed(1).replace(".", ",")}</span>
              <span className="text-[12.5px] text-ink-muted">
                {g.ratingCount !== null && `${g.ratingCount} ocen`}
                {g.priceLevel !== null && ` · ${PRICE[g.priceLevel]}`}
              </span>
            </div>
          ) : (
            <span className="text-[13px] text-ink-muted">Brez ocen na Googlu</span>
          )}
          <div className="text-[11px] text-ink-subtle mt-1">Vir: Google</div>
        </div>
        {g.mapsUrl && (
          <a href={g.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-wine shrink-0">
            Odpri <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
      {g.closed && (
        <Callout tone="warn">
          <p className="font-semibold">
            {g.closed === "permanently" ? "Google: trajno zaprto" : "Google: začasno zaprto"}
          </p>
          {g.closed === "permanently" && (
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={async () => {
                const r = await setVenueIgnored(venueId, true);
                if (!r.ok) return void toast.error(r.error);
                toast.success("Skrito");
                router.refresh();
              }}
            >
              Skrij lokal
            </Button>
          )}
        </Callout>
      )}
    </div>
  );
}
