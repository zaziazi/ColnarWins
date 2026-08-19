import type { VesselCategory } from "@/lib/types";

export const CATEGORY_LABEL: Record<VesselCategory, string> = {
  cisterne: "Cisterne",
  inox: "Inox",
  sodi_225: "225l sodi",
  sodi_500: "500l sodi",
};

export const CATEGORY_ORDER: VesselCategory[] = ["cisterne", "inox", "sodi_225", "sodi_500"];
