import Link from "next/link";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, statusLabel, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { getOrders } from "@/lib/data";
import { isDemoMode } from "@/lib/demo";
import { dateShort, eur, narocila } from "@/lib/format";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  phone: "telefon",
  email: "e-pošta",
  standing: "stalno naročilo",
  field: "teren",
  manual: "ročno",
  webshop: "spletna trgovina",
};

export default async function OrdersPage() {
  const orders = await getOrders();
  const drafts = orders.filter((o) => o.status === "draft");
  const rest = orders.filter((o) => o.status !== "draft");

  return (
    <AppShell
      title="Naročila"
      subtitle={`${narocila(orders.length)} · zadnjih 50`}
      who="Marija · pisarna"
    >
      {isDemoMode && (
        <Callout tone="wine" className="mb-4">
          <strong>Demo način.</strong> Supabase še ni nastavljen, zato vidiš vzorčne podatke.
          Izpolni <code className="font-mono text-xs">.env.local</code> in podatki bodo pravi.
        </Callout>
      )}

      <Button asChild size="lg" className="mb-5">
        <Link href="/pisarna/novo">
          <Plus /> Novo naročilo
        </Link>
      </Button>

      {drafts.length > 0 && (
        <>
          <SectionHeading>Čaka na potrditev</SectionHeading>
          <div className="space-y-2.5 mb-6">
            {drafts.map((o) => (
              <OrderCard key={o.id} order={o} highlight />
            ))}
          </div>
        </>
      )}

      <SectionHeading>Vsa naročila</SectionHeading>
      <div className="space-y-2.5">
        {rest.map((o) => (
          <OrderCard key={o.id} order={o} />
        ))}
      </div>
    </AppShell>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle mb-2.5 px-0.5">
      {children}
    </h2>
  );
}

function OrderCard({
  order,
  highlight,
}: {
  order: Awaited<ReturnType<typeof getOrders>>[number];
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-warn/30 bg-warn-soft/30" : undefined}>
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-[15px] truncate">{order.customerName}</h3>
            <p className="text-[11.5px] text-ink-subtle mt-0.5">
              #{order.orderNumber} · {SOURCE_LABEL[order.source] ?? order.source}
              {order.deliveryDate && ` · dostava ${dateShort(order.deliveryDate)}`}
            </p>
          </div>
          <Badge tone={statusTone[order.status]}>{statusLabel[order.status]}</Badge>
        </div>

        <p className="text-[12.5px] text-ink-muted mt-2.5 leading-relaxed">{order.lineSummary}</p>
        <p className="text-[13px] font-semibold tabular mt-1.5">{eur(order.totalGross)}</p>
      </div>
    </Card>
  );
}
