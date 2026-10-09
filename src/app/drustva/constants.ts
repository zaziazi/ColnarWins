import type { BookingStatus, DrustvoIntent, DrustvoStage, DrustvoTier } from "@/lib/types";

export const STAGE_LABEL: Record<DrustvoStage, string> = {
  not_contacted: "Še ni kontaktirano",
  in_sequence: "V zaporedju",
  replied: "Odgovorili",
  interested: "Zainteresirani",
  later: "Kasneje",
  booked: "Rezervirano",
  visited: "Obiskali",
  not_interested: "Ne zanima",
  unsubscribed: "Odjavljeni",
  bounced: "Napačen naslov",
};

export const STAGE_TONE: Record<DrustvoStage, "neutral" | "info" | "wine" | "good" | "warn" | "danger"> = {
  not_contacted: "neutral",
  in_sequence: "info",
  replied: "wine",
  interested: "good",
  later: "warn",
  booked: "good",
  visited: "good",
  not_interested: "danger",
  unsubscribed: "danger",
  bounced: "danger",
};

export const TIER_LABEL: Record<DrustvoTier, string> = { focus: "Fokus", fifty_fifty: "50/50", not_chosen: "Ni izbrano" };

export const INTENT_LABEL: Record<DrustvoIntent, string> = {
  interested: "Zainteresirani",
  question: "Vprašanje",
  later: "Kasneje",
  not_interested: "Ne zanima",
  unsubscribe: "Odjava",
  wrong_contact: "Napačen kontakt",
  out_of_office: "Odsotnost",
  other: "Drugo",
};

export const INTENT_TONE: Record<DrustvoIntent, "neutral" | "info" | "wine" | "good" | "warn" | "danger"> = {
  interested: "good",
  question: "info",
  later: "warn",
  not_interested: "danger",
  unsubscribe: "danger",
  wrong_contact: "warn",
  out_of_office: "neutral",
  other: "neutral",
};

export const BOOKING_LABEL: Record<BookingStatus, string> = {
  tentative: "Okvirno",
  confirmed: "Potrjeno",
  visited: "Obiskali",
  cancelled: "Preklicano",
};

export const ACTIVITY_LABEL: Record<string, string> = { high: "Visoka", medium: "Srednja", low: "Nizka", unknown: "Neznana" };
export const EMAIL_CHECK_LABEL: Record<string, string> = {
  confirmed: "Potrjen",
  confirmed_own_site: "Potrjen (tudi spletna stran)",
  updated: "Posodobljen",
  not_sure: "Ni gotovo",
  probably_wrong: "Verjetno napačen",
};

export const WEEKDAYS = ["Pon", "Tor", "Sre", "Čet", "Pet", "Sob", "Ned"];

/** Who may use the module: managers and the new "events" role. */
export function canUseDrustva(role?: string | null): boolean {
  return role === "manager" || role === "events";
}
