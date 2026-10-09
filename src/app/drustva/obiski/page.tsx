import { AppShell } from "@/components/app-shell";
import { getCurrentStaff } from "@/lib/data";
import { getBookings, getDrustva, getDrustvaSettings } from "@/lib/drustva/data";
import { addDays, todayIso } from "@/lib/sales/dates";
import { canUseDrustva } from "../constants";
import { NoAccess } from "../gate";
import { Bookings } from "./bookings";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const staff = await getCurrentStaff();
  if (!staff || !canUseDrustva(staff.role)) return <NoAccess />;

  const today = todayIso();
  const [bookings, settings, drustva] = await Promise.all([getBookings(addDays(today, -45)), getDrustvaSettings(), getDrustva()]);

  return (
    <AppShell title="Obiski" subtitle="Skupine, ki prihajajo na obisk" who={staff.fullName} role={staff.role} section="drustva">
      <Bookings
        today={today}
        bookings={bookings}
        settings={settings}
        drustva={drustva.map((d) => ({ id: d.id, name: d.name, town: d.town }))}
      />
    </AppShell>
  );
}
