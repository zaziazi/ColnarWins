import type { StaffRole } from "@/lib/types";

/** Pošta and Finance are for management and the office; other roles never see them. */
export function canUseOffice(role?: StaffRole | null): boolean {
  return role === "manager" || role === "office";
}

/**
 * Pošta and the new Finance tools (bills, payments, invoices, money overview) are
 * for the admin only (Aljaž) for now. Other managers keep the old Finance page.
 */
export function canUseOfficeTools(isAdmin: boolean | undefined, role?: StaffRole | null): boolean {
  return isAdmin === true && canUseOffice(role);
}

export function canUseFinance(role: StaffRole | undefined | null, denied: string[] | undefined): boolean {
  return canUseOffice(role) && !denied?.includes("finance");
}
