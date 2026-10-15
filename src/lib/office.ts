import type { StaffRole } from "@/lib/types";

/** Pošta and Finance are for management and the office; other roles never see them. */
export function canUseOffice(role?: StaffRole | null): boolean {
  return role === "manager" || role === "office";
}

export function canUseFinance(role: StaffRole | undefined | null, denied: string[] | undefined): boolean {
  return canUseOffice(role) && !denied?.includes("finance");
}
