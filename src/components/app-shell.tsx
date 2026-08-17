"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Plus, MapPin, Truck, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StaffRole } from "@/lib/types";
import { Drawer } from "./drawer";

export type SectionKey = "dashboard" | "narocila" | "prodaja" | "klet" | "zaloge" | "finance";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Plus;
  exact?: boolean;
};

const SECTION_TABS: Partial<Record<SectionKey, NavItem[]>> = {
  narocila: [
    { href: "/pisarna/novo", label: "Novo",       icon: Plus },
    { href: "/pisarna",      label: "Naročila",   icon: ClipboardList, exact: true },
    { href: "/nacrt",        label: "Načrt",      icon: MapPin },
    { href: "/dostava",      label: "Voznik",     icon: Truck },
  ],
};

/**
 * One shell for the whole field app.
 *
 * A side drawer switches between the app's top-level business areas; the
 * bottom bar (when a section has sub-pages) navigates within the current
 * one. Used one-handed on a phone by people who are standing up. On desktop
 * the same shell sits under a centred column so the office and the van see
 * an identical interface.
 */
export function AppShell({
  title,
  subtitle,
  who,
  role,
  section,
  children,
}: {
  title: string;
  subtitle?: string;
  who?: string;
  role?: StaffRole;
  section: SectionKey;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const tabs = SECTION_TABS[section];

  return (
    <div className="min-h-dvh flex flex-col mx-auto w-full max-w-[520px] bg-canvas">
      <header className="sticky top-0 z-20 bg-surface border-b border-line px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Odpri meni"
              onClick={() => setDrawerOpen(true)}
              className="h-8 w-8 -ml-1.5 grid place-items-center rounded-[8px] text-ink-subtle
                         hover:bg-surface-muted hover:text-ink transition-colors"
            >
              <Menu className="size-5" />
            </button>
            <span className="font-bold tracking-[-0.01em]">
              Colnix<span className="text-wine">.</span>
            </span>
          </div>
          {who && <span className="text-xs text-ink-subtle">{who}</span>}
        </div>
        <h1 className="mt-2.5 text-xl font-bold tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="text-[12.5px] text-ink-muted mt-0.5">{subtitle}</p>}
      </header>

      <main className={cn("flex-1 px-4 py-4", tabs ? "pb-24" : "pb-6")}>{children}</main>

      {tabs && (
        <nav className="fixed bottom-0 inset-x-0 mx-auto w-full max-w-[520px] bg-surface border-t border-line flex">
          {tabs.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex-1 flex flex-col items-center gap-0.5 pt-2 pb-2.5 text-[10.5px] font-semibold transition-colors",
                  active ? "text-wine" : "text-ink-subtle hover:text-ink-muted",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-5" strokeWidth={1.8} />
                {label}
              </Link>
            );
          })}
        </nav>
      )}

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} section={section} role={role} />
    </div>
  );
}
