export const INBOX_LABELS = ["order", "bill", "reservation", "drustvo", "complaint", "newsletter", "unclear"] as const;
export type InboxLabel = (typeof INBOX_LABELS)[number];

export const LABEL_TEXT: Record<InboxLabel, string> = {
  order: "Naročilo",
  bill: "Račun",
  reservation: "Rezervacija",
  drustvo: "Društvo",
  complaint: "Pritožba",
  newsletter: "Reklama / obvestilo",
  unclear: "Nejasno",
};
