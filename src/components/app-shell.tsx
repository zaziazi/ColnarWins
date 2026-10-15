"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ClipboardList, Plus, MapPin, Truck, Menu, FlaskConical, Warehouse, Upload, Map as MapIcon, CalendarDays, Footprints, Wine, MessageSquareReply, CalendarPlus, UserCog, CalendarCheck, Printer, History, Banknote, FileText, ReceiptText, ArrowLeftRight, RefreshCw, LogOut, Bell, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StaffRole } from "@/lib/types";
import { Drawer, visibleSections } from "./drawer";
import { createClient } from "@/lib/supabase/client";

export type SectionKey = "dashboard" | "narocila" | "narocilaAc" | "prodaja" | "degustacije" | "admin" | "klet" | "zaloge" | "finance" | "posta";

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
    { href: "/dostava",      label: "Dostava",    icon: Truck },
    { href: "/tisk",         label: "Tisk",       icon: Printer },
  ],
  // The advanced flow (route planner, loading lists, signature + documents).
  // Only for staff with sees_ac - Novo and Naročila are shared with "narocila".
  narocilaAc: [
    { href: "/nacrt",        label: "Načrt",      icon: MapPin },
    { href: "/voznik",       label: "Voznik",     icon: Truck },
  ],
  prodaja: [
    { href: "/prodaja",        label: "Zemljevid",   icon: MapIcon, exact: true },
    { href: "/prodaja/teden",  label: "Načrt",       icon: CalendarDays },
    { href: "/prodaja/danes",  label: "Na terenu",    icon: Footprints },
    { href: "/prodaja/zaloga", label: "Vino v avtu", icon: Wine },
  ],
  degustacije: [
    { href: "/degustacije",            label: "Odgovori",          icon: MessageSquareReply, exact: true },
    { href: "/degustacije/koledar",    label: "Koledar",           icon: CalendarDays },
    { href: "/degustacije/nova",       label: "Nova degustacija",  icon: CalendarPlus },
  ],
  admin: [
    { href: "/admin",             label: "Uporabniki in vloge", icon: UserCog, exact: true },
    { href: "/admin/degustacije", label: "Degustacije",         icon: CalendarCheck },
    { href: "/admin/dnevnik",     label: "Dnevnik",             icon: History },
  ],
  finance: [
    { href: "/finance",            label: "Pregled denarja",     icon: Banknote, exact: true },
    { href: "/finance/racuni",     label: "Računi kupcev",       icon: FileText },
    { href: "/finance/dobavitelji", label: "Računi dobaviteljev", icon: ReceiptText },
    { href: "/finance/placila",    label: "Plačila",             icon: ArrowLeftRight },
  ],
  klet: [
    { href: "/klet",             label: "Vina",         icon: FlaskConical, exact: true },
    { href: "/klet/rezervoarji", label: "Rezervoarji",  icon: Warehouse },
    { href: "/klet/uvoz",        label: "Uvoz",         icon: Upload },
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
  seesAc,
  isAdmin,
  denied,
  section,
  wide = false,
  children,
}: {
  title: string;
  subtitle?: string;
  who?: string;
  role?: StaffRole;
  seesAc?: boolean;
  isAdmin?: boolean;
  denied?: string[];
  section: SectionKey;
  /** Use the full width on a laptop (tables, maps). Phones are unaffected. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [refreshing, startRefresh] = React.useTransition();
  // Prodaja users only deliver from the Naročila section: Novo, Naročila and Tisk are not for them.
  const allTabs = SECTION_TABS[section];
  const tabs =
    section === "narocila" && role === "sales"
      ? allTabs?.filter((t) => t.href === "/dostava")
      : section === "finance" && !isAdmin
        ? undefined // the new Finance tools are for the admin only for now
        : allTabs;

  const sections = visibleSections(role, seesAc, isAdmin, denied);

  async function signOut() {
    await createClient().auth.signOut();
    window.location.href = "/prijava";
  }

  return (
    <div className="min-h-dvh bg-canvas min-[900px]:flex">
      {/* ---------------------------------------------- web face: sidebar */}
      <aside className="hidden min-[900px]:flex flex-col w-[248px] shrink-0 sticky top-0 h-dvh bg-surface border-r border-line px-3 py-5">
        <div className="px-2 pb-4">
          <span className="font-bold text-lg tracking-[-0.01em]">
            Colnix<span className="text-wine">.</span>
          </span>
          {who && <p className="text-[12px] text-ink-subtle mt-0.5">{who}</p>}
        </div>
        <nav className="flex-1 overflow-y-auto -mx-1 px-1 space-y-0.5">
          {sections.map(({ key, href, label, icon: Icon }) => {
            const active = key === section;
            const subs = active ? tabs : undefined;
            return (
              <div key={key}>
                <Link
                  href={key === "narocila" && role === "sales" ? "/dostava" : href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-[10px] text-[14px] font-semibold transition-colors",
                    active ? "text-wine bg-wine-soft" : "text-ink-muted hover:bg-surface-muted hover:text-ink",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="size-[18px]" strokeWidth={1.8} />
                  {label}
                </Link>
                {subs && (
                  <div className="ml-5 mt-0.5 mb-1.5 pl-3 border-l border-line space-y-0.5">
                    {subs.map(({ href: h, label: l, exact }) => {
                      const on = exact ? pathname === h : pathname.startsWith(h);
                      return (
                        <Link
                          key={h}
                          href={h}
                          className={cn(
                            "block px-3 py-1.5 rounded-[8px] text-[13px] font-medium transition-colors",
                            on ? "text-wine font-semibold" : "text-ink-subtle hover:text-ink",
                          )}
                        >
                          {l}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="border-t border-line pt-3 mt-3 space-y-0.5">
          <Link href="/obvestila" className="flex items-center gap-3 px-3 py-1.5 rounded-[8px] text-[13px] font-medium text-ink-muted hover:bg-surface-muted">
            <Bell className="size-4" strokeWidth={1.8} /> Obvestila
          </Link>
          <Link href="/spremeni-geslo" className="flex items-center gap-3 px-3 py-1.5 rounded-[8px] text-[13px] font-medium text-ink-muted hover:bg-surface-muted">
            <KeyRound className="size-4" strokeWidth={1.8} /> Geslo
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="w-full flex items-center gap-3 px-3 py-1.5 rounded-[8px] text-[13px] font-semibold text-wine hover:bg-wine-soft"
          >
            <LogOut className="size-4" strokeWidth={1.8} /> Odjava
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col mx-auto w-full max-w-[520px] min-[900px]:max-w-none min-[900px]:mx-0">
        <header className="sticky top-0 z-20 bg-surface border-b border-line px-4 pt-4 pb-3 min-[900px]:px-8 min-[900px]:pt-5 min-[900px]:pb-4">
          <div className="flex items-center justify-between gap-3 min-[900px]:hidden">
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
            <div className="flex items-center gap-2">
              {who && <span className="text-xs text-ink-subtle">{who}</span>}
              <button
                type="button"
                aria-label="Osveži"
                title="Osveži podatke"
                disabled={refreshing}
                onClick={() => startRefresh(() => router.refresh())}
                className="h-8 w-8 grid place-items-center rounded-[8px] text-ink-subtle
                           hover:bg-surface-muted hover:text-ink transition-colors disabled:opacity-60"
              >
                <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
              </button>
            </div>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="mt-2.5 min-[900px]:mt-0 text-xl min-[900px]:text-2xl font-bold tracking-[-0.02em]">{title}</h1>
              {subtitle && <p className="text-[12.5px] min-[900px]:text-[13.5px] text-ink-muted mt-0.5">{subtitle}</p>}
            </div>
            <button
              type="button"
              aria-label="Osveži"
              title="Osveži podatke"
              disabled={refreshing}
              onClick={() => startRefresh(() => router.refresh())}
              className="hidden min-[900px]:grid h-9 w-9 place-items-center rounded-[8px] text-ink-subtle
                         hover:bg-surface-muted hover:text-ink transition-colors disabled:opacity-60"
            >
              <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            </button>
          </div>
        </header>

        <main
          className={cn(
            "flex-1 px-4 py-4 min-[900px]:px-8 min-[900px]:py-6 w-full",
            tabs ? "pb-24 min-[900px]:pb-8" : "pb-6",
            wide ? "min-[900px]:max-w-[1280px]" : "min-[900px]:max-w-[820px]",
          )}
        >
          {children}
        </main>

        {tabs && (
          <nav className="min-[900px]:hidden fixed bottom-0 inset-x-0 mx-auto w-full max-w-[520px] bg-surface border-t border-line flex">
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

        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} section={section} role={role} seesAc={seesAc} isAdmin={isAdmin} denied={denied} />
      </div>
    </div>
  );
}
