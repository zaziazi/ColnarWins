import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { mailConfigured } from "@/lib/documents/email";
import { createClient } from "@/lib/supabase/server";
import { requireClubManager } from "../gate";
import { CampaignForm } from "./campaign-form";

export const dynamic = "force-dynamic";
// sending goes one e-mail at a time; give a few hundred members room to finish
export const maxDuration = 300;

const AUDIENCE: Record<string, string> = { all: "vsi", inactive: "neaktivni", reward: "z nagrado" };
const dayFmt = new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Ljubljana" });

export default async function CampaignsPage() {
  const gate = await requireClubManager();
  if ("denied" in gate) return gate.denied;
  const { staff } = gate;

  const supabase = await createClient();
  const { data: past } = await supabase
    .from("club_campaign")
    .select("id,subject,audience,recipients,sent,failed,created_at,staff(full_name)")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <AppShell title="Sporočila članom" subtitle="E-pošta članom s soglasjem" who={staff.fullName} role={staff.role} seesAc={staff.seesAc} isAdmin={staff.isAdmin} denied={staff.denied} section="klub">
      <div className="space-y-5">
        {!mailConfigured() && (
          <Card className="p-4 text-[13px] bg-warn-soft text-warn border-transparent">
            Pošiljanje e-pošte ni nastavljeno (MAIL_FROM + SMTP_*). Sporočila ne bodo odšla.
          </Card>
        )}
        <CampaignForm />

        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle mb-2">Poslano</h2>
          {(past ?? []).length === 0 ? (
            <Card className="p-4 text-[13px] text-ink-subtle">Še nobeno sporočilo.</Card>
          ) : (
            <Card className="divide-y divide-line">
              {(past ?? []).map((c) => (
                <div key={c.id} className="px-4 py-3">
                  <div className="font-semibold text-[14px]">{c.subject}</div>
                  <div className="text-[12px] text-ink-subtle">
                    {dayFmt.format(new Date(c.created_at))} · {AUDIENCE[c.audience]} · poslano {c.sent}/{c.recipients}
                    {c.failed ? ` · ${c.failed} neuspešnih` : ""}
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(c.staff as any)?.full_name ? ` · ${(c.staff as any).full_name}` : ""}
                  </div>
                </div>
              ))}
            </Card>
          )}
        </section>
      </div>
    </AppShell>
  );
}
