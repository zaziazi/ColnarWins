import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { PushToggle } from "@/app/dostava/push-toggle";
import { getCurrentStaff } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const staff = await getCurrentStaff();
  if (!staff) {
    return (
      <AppShell title="Obvestila" who="Prijava potrebna" section="dashboard">
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted">Prijavi se, da nastaviš obvestila.</p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Obvestila"
      subtitle="Sporočila na telefon"
      who={staff.fullName}
      role={staff.role}
      seesAc={staff.seesAc}
      isAdmin={staff.isAdmin}
      denied={staff.denied}
      section="dashboard"
    >
      <PushToggle onText="Obvestila so vklopljena na tej napravi" offText="Vklopi obvestila na tej napravi" />

      <Card className="p-4 mt-4 space-y-2.5 text-[13.5px] leading-relaxed">
        <p className="font-semibold">Kaj lahko dobiš</p>
        <ul className="space-y-2 text-ink-muted list-disc pl-5">
          <li>
            <strong className="text-ink">Degustacija:</strong> ko ti jo dodelijo, prestavijo ali prekličejo.
          </li>
          <li>
            <strong className="text-ink">Dostava:</strong> ob 17:00 načrt za jutri (samo če dostavljaš).
          </li>
          <li>
            <strong className="text-ink">Tisk:</strong> ko je dan potrjen in pripravljen za tisk (če te je skrbnik vpisal).
          </li>
          <li>
            <strong className="text-ink">Prodaja:</strong> zjutraj obiski za danes, ob ponedeljkih pa kdo že 30+ dni čaka na obisk.
          </li>
        </ul>
        <p className="text-[12px] text-ink-subtle">
          Na iPhonu najprej dodaj aplikacijo na začetni zaslon (Deli → Dodaj na začetni zaslon), nato odpri obvestila od tam.
          Obvestilo vklopiš na vsaki napravi posebej.
        </p>
      </Card>
    </AppShell>
  );
}
