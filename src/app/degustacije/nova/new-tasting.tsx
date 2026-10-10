"use client";

import { useRouter } from "next/navigation";
import type { DegustacijaPerson } from "@/lib/types";
import { BookingForm, emptyDraft, type BookingDraft } from "../booking-form";

export function NewTasting({
  persons,
  wineOptions,
  initial,
}: {
  persons: DegustacijaPerson[];
  wineOptions: string[];
  initial: Partial<BookingDraft>;
}) {
  const router = useRouter();
  const kitchen = persons.find((p) => p.active && p.isDefaultKitchen)?.id ?? null;
  const draft = emptyDraft(
    { ...initial, endTime: initial.startTime ? plus2(initial.startTime) : "" },
    kitchen,
  );
  return (
    <BookingForm
      draft={draft}
      persons={persons}
      wineOptions={wineOptions}
      onSaved={(_id, d) => router.push(`/degustacije/koledar?d=${d.visitDate}`)}
    />
  );
}

function plus2(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${String(Math.min(23, h + 2)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
