import { AppShell } from "@/components/app-shell";
import { OrderForm } from "@/components/order-form";
import { getCurrentStaff, getCustomers, getProducts, getStandingOrders } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * Offers the next few delivery days, skipping Sundays.
 * Replace with the real delivery calendar per region once it exists.
 */
function nextDeliveryDates(count = 7): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  while (out.length < count) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export default async function NewOrderPage() {
  const [customers, products, standingOrders, staff] = await Promise.all([
    getCustomers(),
    getProducts(),
    getStandingOrders(),
    getCurrentStaff(),
  ]);

  return (
    <AppShell
      title="Novo naročilo"
      subtitle="Vnos med telefonskim klicem"
      who="Marija · pisarna"
      role={staff?.role}
      section="narocila"
    >
      <OrderForm
        customers={customers}
        products={products}
        standingOrders={standingOrders}
        deliveryDates={nextDeliveryDates()}
      />
    </AppShell>
  );
}
