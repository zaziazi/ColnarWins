import type { BookingStatus, GroupBooking } from "@/lib/types";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? null : String(v));
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function mapBooking(b: Row): GroupBooking {
  const d = b.drustvo as unknown as { name: string } | null;
  return {
    id: b.id as string,
    drustvoId: s(b.drustvo_id),
    groupName: (s(b.group_name) ?? d?.name ?? "Skupina") as string,
    source: (b.source as GroupBooking["source"]) ?? "manual",
    visitDate: b.visit_date as string,
    startTime: s(b.arrival_time)?.slice(0, 5) ?? null,
    endTime: s(b.end_time)?.slice(0, 5) ?? null,
    peoplePlanned: n(b.people_planned),
    peopleActual: n(b.people_actual),
    wines: ((b.wines as string[] | null) ?? []).filter(Boolean),
    food: b.food !== false,
    foodNotes: s(b.food_notes),
    contactName: s(b.contact_name),
    contactPhone: s(b.contact_phone),
    contactEmail: s(b.contact_email),
    presenterId: s(b.presenter_id),
    kitchenId: s(b.kitchen_id),
    presenterNotifiedAt: s(b.presenter_notified_at),
    kitchenNotifiedAt: s(b.kitchen_notified_at),
    status: b.status as BookingStatus,
    wineSalesEur: n(b.wine_sales_eur),
    notes: s(b.notes),
    webReservationId: s(b.web_reservation_id),
  };
}
