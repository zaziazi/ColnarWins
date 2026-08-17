"use client";

import Link from "next/link";
import {
  Briefcase,
  ClipboardList,
  Landmark,
  LayoutDashboard,
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
  visible: (role?: StaffRole) => boolean;
}[] = [
  { key: "dashboard", href: "/pregled",  label: "Pregled",  icon: LayoutDashboard, visible: (r) => r === "manager" },
  { key: "narocila",  href: "/pisarna",  label: "Naročila", icon: ClipboardList,   visible: () => true },
  { key: "prodaja",   href: "/prodaja",  label: "Prodaja",  icon: Briefcase,       visible: (r) => r === "sales" || r === "manager" },
  { key: "klet",      href: "/klet",     label: "Klet",     icon: Warehouse,       visible: (r) => r === "manager" },
  { key: "zaloge",    href: "/zaloge",   label: "Zaloge",   icon: Wine,            visible: (r) => r === "manager" },
  { key: "finance",   href: "/finance",  label: "Finance",  icon: Landmark,        visible: (r) => r === "manager" },
];

export function Drawer({
  open,
  onClose,
  section,
  role,
}: {
  open: boolean;
  onClose: () => void;
  section: SectionKey;
  role?: StaffRole;
}) {
  if (!open) return null;

  const visibleSections = SECTIONS.filter((s) => s.visible(role));

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
          {visibleSections.map(({ key, href, label, icon: Icon }) => {
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
      </div>
    </>
  );
}
