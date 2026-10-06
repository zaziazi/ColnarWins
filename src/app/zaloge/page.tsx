import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { getCurrentStaff, getStockLevels, getStockMovements } from "@/lib/data";
import { dateShort } from "@/lib/format";
import { StockRow } from "./stock-row";

export const dynamic = "force-dynamic";

const STOCK_MOVEMENT_LABEL: Record<string, string> = {
  bottling: "Stekleničenje",
  adjustment: "Popravek",
};

export default async function InventoryPage() {
  const staff = await getCurrentStaff();
  if (!staff || staff.role !== "manager") {
    return (
      <AppShell title="Zaloge" who="Marija · pisarna" section="zaloge">
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted leading-relaxed">
            Ta stran je na voljo samo vodstvu.
          </p>
        </Card>
      </AppShell>
    );
  }

  const [stockLevels, stockMovements] = await Promise.all([
    getStockLevels(),
    getStockMovements(10),
  ]);

  return (
    <AppShell
      title="Zaloge"
      subtitle="Stanje steklenic"
      who={staff.fullName}
      role={staff.role}
      section="zaloge"
    >
      <SectionHeading>Steklenice</SectionHeading>
      <Card className="mb-6">
        {stockLevels.length === 0 ? (
          <p className="p-3.5 text-[13px] text-ink-muted">Ni izdelkov.</p>
        ) : (
          stockLevels.map((level) => <StockRow key={level.productId} level={level} />)
        )}
      </Card>

      <SectionHeading>Nedavno</SectionHeading>
      <Card className="mb-2.5">
        {stockMovements.length === 0 ? (
          <p className="p-3.5 text-[13px] text-ink-muted">Ni nedavnih sprememb.</p>
        ) : (
          stockMovements.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-line last:border-b-0"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-medium truncate">
                  {STOCK_MOVEMENT_LABEL[m.movementType] ?? m.movementType} · {m.productName}
                </p>
                <p className="text-[11px] text-ink-subtle mt-0.5">
                  {dateShort(m.createdAt)}
                  {m.createdByName && ` · ${m.createdByName}`}
                </p>
              </div>
              <span className="text-[13px] font-semibold tabular shrink-0">
                {m.quantityDelta > 0 ? "+" : ""}
                {m.quantityDelta}
              </span>
            </div>
          ))
        )}
      </Card>
    </AppShell>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5">{children}</h2>;
}
