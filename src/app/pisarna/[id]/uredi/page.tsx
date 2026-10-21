import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { OrderForm } from "@/components/order-form";
import {
  getCurrentStaff,
  getCustomers,
  getDrivers,
  getOrderForEdit,
  getProducts,
  getStandingOrders,
} from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * Offers the next few delivery days, skipping Sundays.
 * Replace with the real delivery calendar per region once it exists.
 */
function nextDeliveryDates(count = 6): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  while (out.length < count) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [customers, products, standingOrders, drivers, order, staff] = await Promise.all([
    getCustomers(),
    getProducts(),
    getStandingOrders(),
    getDrivers(),
    getOrderForEdit(id),
    getCurrentStaff(),
  ]);

  if (staff?.role === "sales") redirect("/dostava");

  const editable = order && (order.status === "draft" || order.status === "confirmed");

  if (!editable) {
    return (
      <AppShell title="Uredi naročilo" who={staff?.fullName ?? "Prijava potrebna"} role={staff?.role} seesAc={staff?.seesAc} isAdmin={staff?.isAdmin} denied={staff?.denied} section="narocila">
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted leading-relaxed">
            {order ? "Tega naročila ni več mogoče urejati." : "Naročilo ne obstaja."}
          </p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Uredi naročilo"
      subtitle={order.customerName}
      who={staff?.fullName ?? "Prijava potrebna"}
      role={staff?.role} seesAc={staff?.seesAc} isAdmin={staff?.isAdmin} denied={staff?.denied}
      section="narocila"
    >
      <OrderForm
        customers={customers}
        products={products}
        standingOrders={standingOrders}
        deliveryDates={nextDeliveryDates()}
        drivers={drivers}
        editOrder={{
          id: order.id,
          customerId: order.customerId,
          deliveryDate: order.deliveryDate,
          note: order.note,
          driverId: order.driverId,
          driverName: order.driverName,
          priceList: order.priceList,
          paymentMethod: order.paymentMethod,
          lines: order.lines,
        }}
      />
    </AppShell>
  );
}
