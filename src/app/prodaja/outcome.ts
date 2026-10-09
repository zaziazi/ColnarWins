import type { VisitOutcome } from "@/lib/types";

export const OUTCOME_LABEL: Record<VisitOutcome, string> = {
  ordered: "Naročilo",
  thinking: "Razmislili bodo",
  no_interest: "Ne zanima",
  not_there: "Ni bilo nikogar",
};

export const OUTCOME_TONE: Record<VisitOutcome, "good" | "warn" | "neutral" | "danger"> = {
  ordered: "good",
  thinking: "warn",
  no_interest: "danger",
  not_there: "neutral",
};
