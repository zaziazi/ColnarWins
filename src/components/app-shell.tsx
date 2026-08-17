"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Plus, MapPin, Truck, Briefcase, LayoutDashboard, Warehouse } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StaffRole } from "@/lib/types";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Plus;
  exact?: boolean;
};

const NAV: NavItem[] = [
  { href: "/pisarna/novo", label: "Novo",       icon: Plus },
  { href: "/pisarna",      label: "Naro\u010dila",   icon: ClipboardList, exact: true },
  { href: "/nacrt",        label: "Na\u010drt",      icon: MapPin },
  { href: "/dostava",      label: "Voznik",     icon: Truck },
  { href: "/komerciala",   label: "Komerciala", icon: Briefcase },
];

const MANAGER_NAV_ITEMS: NavItem[] = [
  { href: "/pregled", label: "Pregled", icon: LayoutDashboard },
  { href: "/zaloge",  label: "Zaloge",  icon: Warehouse },
];

/**
 * One shell for the whole field app.
 *
 * Bottom navigation, not a sidebar: this is used one-handed on a phone by
 * people who are standing up. On desktop the same bar sits under a centred
 * column so the office and the van see an identical interface.
 */
export function AppShell({
  title,
  subtitle,
  who,
  role,
  children,
}: {
  title: string;
  subtitle?: string;
  who?: string;
  role?: StaffRole;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const nav = role === "manager" ? [...NAV, ...MANAGER_NAV_ITEMS] : NAV;

  return (
    <div className="min-h-dvh flex flex-col mx-auto w-full max-w-[520px] bg-canvas">
      <header className="sticky top-0 z-20 bg-surface border-b border-line px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-bold tracking-[-0.01em]">
            Colnix<span className="text-wine">.</span>
          </span>
          {who && <span className="text-xs text-ink-subtle">{who}</span>}
        </div>
        <h1 className="mt-2.5 text-xl font-bold tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="text-[12.5px] text-ink-muted mt-0.5">{subtitle}</p>}
      </header>

      <main className="flex-1 px-4 py-4 pb-24">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 mx-auto w-full max-w-[520px] bg-surface border-t border-line flex">
        {nav.map(({ href, label, icon: Icon, exact }) => {
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
    </div>
  );
}
