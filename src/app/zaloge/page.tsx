import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import {
  getBulkMovements,
  getCurrentStaff,
  getProducts,
  getStockLevels,
  getStockMovements,
  getVessels,
} from "@/lib/data";
import { dateShort } from "@/lib/format";
import { NewVesselForm } from "./new-vessel-form";
import { StockRow } from "./stock-row";
import { VesselCard } from "./vessel-card";

export const dynamic = "force-dynamic";

const STOCK_MOVEMENT_LABEL: Record<string, string> = {
  bottling: "Stekleničenje",
  adjustment: "Popravek",
};

const BULK_MOVEMENT_LABEL: Record<string, string> = {
  harvest_intake: "Sprejem",
  bottling_out: "Stekleničenje",
  adjustment: "Popravek",
};

export default async function InventoryPage() {
  const staff = await getCurrentStaff();
  if (!staff || staff.role !== "manager") {
    return (
      <AppShell title="Zaloge" who="Marija · pisarna">
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted leading-relaxed">
            Ta stran je na voljo samo vodstvu.
          </p>
        </Card>
      </AppShell>
    );
  }

  const [stockLevels, vessels, stockMovements, bulkMovements, products] = await Promise.all([
    getStockLevels(),
    getVessels(),
    getStockMovements(10),
    getBulkMovements(10),
    getProducts(),
  ]);

  return (
    <AppShell
      title="Zaloge"
      subtitle="Steklenice in kletni rezervoarji"
      who={`${staff.fullName} · vodstvo`}
      role={staff.role}
    >
      <SectionHeading>Steklenice</SectionHeading>
      <Card className="mb-6">
        {stockLevels.length === 0 ? (
          <p className="p-3.5 text-[13px] text-ink-muted">Ni izdelkov.</p>
        ) : (
          stockLevels.map((level) => <StockRow key={level.productId} level={level} />)
        )}
      </Card>

      <div className="flex items-center justify-between mb-2.5 px-0.5">
        <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle">
          Kletni rezervoarji
        </h2>
        <NewVesselForm />
      </div>

      {vessels.length === 0 ? (
        <Card className="p-5 text-center mb-6">
          <p className="text-[13px] text-ink-muted">Še ni rezervoarjev.</p>
        </Card>
      ) : (
        <div className="space-y-2.5 mb-6">
          {vessels.map((vessel) => (
            <VesselCard key={vessel.id} vessel={vessel} products={products} />
          ))}
        </div>
      )}

      <SectionHeading>Nedavno</SectionHeading>
      <Card className="mb-2.5">
        {stockMovements.length === 0 && bulkMovements.length === 0 ? (
          <p className="p-3.5 text-[13px] text-ink-muted">Ni nedavnih sprememb.</p>
        ) : (
          <>
            {stockMovements.map((m) => (
              <div key={`s-${m.id}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-line last:border-b-0">
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
            ))}
            {bulkMovements.map((m) => (
              <div key={`b-${m.id}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-line last:border-b-0">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium truncate">
                    {BULK_MOVEMENT_LABEL[m.movementType] ?? m.movementType} · {m.vesselName}
                    {m.productName && ` · ${m.productName}`}
                  </p>
                  <p className="text-[11px] text-ink-subtle mt-0.5">
                    {dateShort(m.createdAt)}
                    {m.createdByName && ` · ${m.createdByName}`}
                  </p>
                </div>
                <span className="text-[13px] font-semibold tabular shrink-0">
                  {m.volumeL > 0 ? "+" : ""}
                  {m.volumeL.toLocaleString("sl-SI")} l
                </span>
              </div>
            ))}
          </>
        )}
      </Card>
    </AppShell>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5">{children}</h2>;
}
