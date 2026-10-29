"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Briefcase,
  Building2,
  CalendarCheck,
  ShieldCheck,
  ClipboardList,
  ClipboardCheck,
  Landmark,
  LayoutDashboard,
  LogOut,
  Mail,
  Warehouse,
  Wine,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { canUseFinance, canUseOfficeTools } from "@/lib/office";
import { ViewAsPicker } from "@/components/view-as";
import type { StaffRole } from "@/lib/types";
import type { SectionKey } from "./app-shell";

export const SECTIONS: {
  key: SectionKey;
  href: string;
  label: string;
  icon: typeof ClipboardList;
  visible: (role?: StaffRole, seesAc?: boolean, isAdmin?: boolean, denied?: string[]) => boolean;
}[] = [
  { key: "dashboard", href: "/pregled",  label: "Pregled",  icon: LayoutDashboard, visible: () => true },
  { key: "narocila",  href: "/pisarna",  label: "Naročila", icon: ClipboardList,   visible: () => true },
  { key: "narocilaAc", href: "/nacrt", label: "Naročila AC", icon: ClipboardCheck, visible: (_r, ac) => ac === true },
  { key: "posta",     href: "/posta",    label: "Pošta",    icon: Mail,            visible: (r, _a, admin) => canUseOfficeTools(admin, r) },
  { key: "prodaja",   href: "/prodaja",  label: "Prodaja",  icon: Briefcase,       visible: (r) => r === "sales" || r === "manager" },
  { key: "degustacije", href: "/degustacije", label: "Degustacije", icon: CalendarCheck, visible: (r) => r === "manager" || r === "events" || r === "sales" },
  { key: "admin",     href: "/admin",    label: "Admin",    icon: ShieldCheck,     visible: (r, _ac, admin) => r === "manager" && admin === true },
  { key: "klet",      href: "/klet",     label: "Klet",     icon: Warehouse,       visible: (r, _a, _m, d) => r === "manager" && !d?.includes("klet") },
  { key: "zaloge",    href: "/zaloge",   label: "Zaloge",   icon: Wine,            visible: (r, _a, _m, d) => r === "manager" && !d?.includes("zaloge") },
  { key: "finance",   href: "/finance",  label: "Finance",  icon: Landmark,        visible: (r, _a, _m, d) => canUseFinance(r, d) },
];

export function visibleSections(role?: StaffRole, seesAc?: boolean, isAdmin?: boolean, denied?: string[]) {
  return SECTIONS.filter((s) => s.visible(role, seesAc, isAdmin, denied));
}

export interface NavGroup {
  key: string;
  label: string;
  icon: typeof ClipboardList;
  /** Sections of this group the person may open; labels can differ inside a group. */
  sections: { key: SectionKey; href: string; label: string; icon: typeof ClipboardList }[];
}

const GROUPS: { key: string; label: string; icon: typeof ClipboardList; sections: SectionKey[]; inner?: Partial<Record<SectionKey, string>> }[] = [
  { key: "prodaja", label: "Prodaja", icon: Briefcase, sections: ["prodaja", "narocila", "narocilaAc"], inner: { prodaja: "Zemljevid in obiski" } },
  { key: "pisarna", label: "Pisarna", icon: Building2, sections: ["posta", "finance", "admin"] },
  { key: "klet", label: "Klet", icon: Warehouse, sections: ["klet", "zaloge"], inner: { klet: "Klet", zaloge: "Zaloge" } },
  { key: "degustacije", label: "Degustacije", icon: CalendarCheck, sections: ["degustacije"] },
];

/** Pregled stands alone on top; everything else sits in four groups. Empty groups disappear. */
export function visibleGroups(role?: StaffRole, seesAc?: boolean, isAdmin?: boolean, denied?: string[]): { home: (typeof SECTIONS)[number] | null; groups: NavGroup[] } {
  const ok = visibleSections(role, seesAc, isAdmin, denied);
  const byKey = new Map(ok.map((s) => [s.key, s]));
  const groups: NavGroup[] = [];
  for (const g of GROUPS) {
    const sections = g.sections
      .map((k) => byKey.get(k))
      .filter((x): x is (typeof SECTIONS)[number] => Boolean(x))
      .map((x) => ({
        key: x.key,
        // a salesperson only has the Dostava tab in Naročila
        href: x.key === "narocila" && role === "sales" ? "/prodaja/narocila" : x.href,
        label: g.inner?.[x.key] ?? x.label,
        icon: x.icon,
      }));
    if (sections.length > 0) groups.push({ key: g.key, label: g.label, icon: g.icon, sections });
  }
  return { home: byKey.get("dashboard") ?? null, groups };
}

export function Drawer({
  open,
  onClose,
  section,
  role,
  seesAc,
  isAdmin,
  denied,
}: {
  open: boolean;
  onClose: () => void;
  section: SectionKey;
  role?: StaffRole;
  seesAc?: boolean;
  isAdmin?: boolean;
  denied?: string[];
}) {
  if (!open) return null;

  const { home, groups } = visibleGroups(role, seesAc, isAdmin, denied);

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-y-0 left-0 z-40 w-72 max-w-[80%] bg-surface border-r border-line flex flex-col">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-line">
          <span className="font-bold tracking-[-0.01em]">
            Colnix<span className="text-wine">.</span>
          </span>
          <button
            type="button"
            aria-label="Zapri meni"
            onClick={onClose}
            className="h-9 w-9 grid place-items-center rounded-[8px] text-ink-subtle
                       hover:bg-surface-muted hover:text-ink transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {home && (
            <Link
              href={home.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-4 py-3 text-[14.5px] font-semibold transition-colors",
                section === "dashboard" ? "text-wine bg-wine-soft" : "text-ink-muted hover:bg-surface-muted hover:text-ink",
              )}
              aria-current={section === "dashboard" ? "page" : undefined}
            >
              <home.icon className="size-5" strokeWidth={1.8} />
              {home.label}
            </Link>
          )}
          {groups.map((g) => {
            const open = g.sections.some((x) => x.key === section);
            const Icon = g.icon;
            return (
              <div key={g.key}>
                <Link
                  href={g.sections[0].href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 text-[14.5px] font-semibold transition-colors",
                    open ? "text-wine bg-wine-soft" : "text-ink-muted hover:bg-surface-muted hover:text-ink",
                  )}
                  aria-current={open && g.sections.length === 1 ? "page" : undefined}
                >
                  <Icon className="size-5" strokeWidth={1.8} />
                  {g.label}
                </Link>
                {open && g.sections.length > 1 && (
                  <div className="bg-surface-muted/50 py-1">
                    {g.sections.map((x) => (
                      <Link
                        key={x.key}
                        href={x.href}
                        onClick={onClose}
                        className={cn(
                          "block pl-12 pr-4 py-2.5 text-[14px] font-semibold transition-colors",
                          x.key === section ? "text-wine" : "text-ink-muted hover:text-ink",
                        )}
                        aria-current={x.key === section ? "page" : undefined}
                      >
                        {x.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <ViewAsPicker className="block border-t border-line px-4 pt-3" />
        <div className="border-t border-line px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link href="/obvestila" onClick={onClose} className="text-[13px] font-semibold text-ink-muted hover:text-ink">
              Obvestila
            </Link>
            <Link href="/spremeni-geslo" onClick={onClose} className="text-[13px] font-semibold text-ink-muted hover:text-ink">
              Geslo
            </Link>
          </div>
          <button
            type="button"
            onClick={async () => {
              await createClient().auth.signOut();
              // full reload so no signed-in page state is left behind
              window.location.href = "/prijava";
            }}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-wine hover:underline"
          >
            <LogOut className="size-4" /> Odjava
          </button>
        </div>
      </div>
    </>
  );
}
