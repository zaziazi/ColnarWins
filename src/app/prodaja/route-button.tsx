"use client";

import { Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { routeLinks } from "@/lib/sales/config";
import type { PlannedVisit } from "@/lib/types";

/** One tap: the whole day's route, in visit order, in Google Maps. */
export function RouteButton({ stops, className }: { stops: PlannedVisit[]; className?: string }) {
  const links = routeLinks(stops);
  if (links.length === 0) return null;
  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      {links.map((l) => (
        <Button key={l.href} asChild>
          <a href={l.href} target="_blank" rel="noreferrer">
            <Route className="size-4" />
            {links.length === 1 ? "Odpri pot v Google Zemljevidih" : `Pot v Google Zemljevidih (${l.from}–${l.to})`}
          </a>
        </Button>
      ))}
    </div>
  );
}
