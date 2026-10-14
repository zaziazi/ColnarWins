"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Briefcase,
  CalendarCheck,
  ShieldCheck,
  ClipboardList,
  ClipboardCheck,
  Landmark,
  LayoutDashboard,
  LogOut,
  Warehouse,
  Wine,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StaffRole } from "@/lib/types";
import type { SectionKey } from "./app-shell";

const SECTIONS: {
  key: SectionKey;
  href: string;
  label: string;
  icon: typeof ClipboardList;
  visible: (role?: StaffRole, seesAc?: boolean, isAdmin?: boolean, denied?: string[]) => boolean;
}[] = [
  { key: "dashboard", href: "/pregled",  label: "Pregled",  icon: LayoutDashboard, visible: (r) => r === "manager" },
  { key: "narocila",  href: "/pisarna",  label: "Naročila", icon: ClipboardList,   visible: () => true },
  { key: "narocilaAc", href: "/nacrt", label: "Naročila AC", icon: ClipboardCheck, visible: (_r, ac) => ac === true },
  { key: "prodaja",   href: "/prodaja",  label: "Prodaja",  icon: Briefcase,       visible: (r) => r === "sales" || r === "manager" },
  { key: "degustacije", href: "/degustacije", label: "Degustacije", icon: CalendarCheck, visible: (r) => r === "manager" || r === "events" || r === "sales" },
  { key: "admin",     href: "/admin",    label: "Admin",    icon: ShieldCheck,     visible: (r, _ac, admin) => r === "manager" && admin === true },
  { key: "klet",      href: "/klet",     label: "Klet",     icon: Warehouse,       visible: (r, _a, _m, d) => r === "manager" && !d?.includes("klet") },
  { key: "zaloge",    href: "/zaloge",   label: "Zaloge",   icon: Wine,            visible: (r, _a, _m, d) => r === "manager" && !d?.includes("zaloge") },
  { key: "finance",   href: "/finance",  label: "Finance",  icon: Landmark,        visible: (r, _a, _m, d) => r === "manager" && !d?.includes("finance") },
];

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

  const visibleSections = SECTIONS.filter((s) => s.visible(role, seesAc, isAdmin, denied));

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

        <nav className="flex-1 py-2">
          {visibleSections.map(({ key, href: baseHref, label, icon: Icon }) => {
            // A salesperson only has the Dostava tab in Naročila.
            const href = key === "narocila" && role === "sales" ? "/dostava" : baseHref;
            const active = key === section;
            return (
              <Link
                key={key}
                href={href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 text-[14.5px] font-semibold transition-colors",
                  active ? "text-wine bg-wine-soft" : "text-ink-muted hover:bg-surface-muted hover:text-ink",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-5" strokeWidth={1.8} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/spremeni-geslo" onClick={onClose} className="text-[13px] font-semibold text-ink-muted hover:text-ink">
            Spremeni geslo
          </Link>
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
