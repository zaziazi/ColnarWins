import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { getCurrentStaff } from "@/lib/data";
import { canUseOfficeTools } from "@/lib/office";
import { createClient } from "@/lib/supabase/server";
import { Inbox, type InboxItem } from "./inbox";
import { Mailboxes, type MailboxRow } from "./mailboxes";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // "Preveri pošto zdaj" runs inside this route

export default async function PostaPage() {
  const staff = await getCurrentStaff();
  if (!staff || !canUseOfficeTools(staff.isAdmin, staff.role)) {
    return (
      <AppShell title="Pošta" who="Prijava potrebna" section="posta">
        <Card className="p-7 text-center">
          <p className="text-[13.5px] text-ink-muted leading-relaxed">Ta stran še ni na voljo.</p>
        </Card>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const [open, closed, people, boxes, pending] = await Promise.all([
    supabase.from("inbox_email").select("*").in("status", ["new", "needs_decision"]).order("received_at", { ascending: false }).limit(100),
    supabase.from("inbox_email").select("*").in("status", ["done", "ignored"]).order("received_at", { ascending: false }).limit(40),
    supabase.from("staff").select("id,full_name").in("role", ["manager", "office"]).order("full_name"),
    supabase.from("mail_account").select("id,label,username,active,last_checked_at,last_ok_at,last_error,total_ingested,backfill_from").order("label"),
    supabase.from("inbox_email").select("id", { count: "exact", head: true }).eq("status", "new").eq("label_confirmed", false),
  ]);

  const toItem = (r: Record<string, unknown>): InboxItem => ({
    id: r.id as string,
    fromEmail: (r.from_email as string | null) ?? null,
    fromName: (r.from_name as string | null) ?? null,
    subject: (r.subject as string | null) ?? null,
    body: (r.body_text as string | null) ?? "",
    receivedAt: r.received_at as string,
    label: r.label as InboxItem["label"],
    labelConfirmed: Boolean(r.label_confirmed),
    summary: (r.summary as string | null) ?? null,
    nextStep: (r.next_step as string | null) ?? null,
    draftReply: (r.draft_reply as string | null) ?? null,
    extracted: (r.extracted as InboxItem["extracted"]) ?? null,
    status: r.status as InboxItem["status"],
    assignedTo: (r.assigned_to as string | null) ?? null,
    linkedKind: (r.linked_kind as string | null) ?? null,
    attachments: ((r.attachments as InboxItem["attachments"]) ?? []).filter((a) => a?.path),
    aiError: (r.ai_error as string | null) ?? null,
    replySentAt: (r.reply_sent_at as string | null) ?? null,
  });

  return (
    <AppShell
      title="Pošta"
      subtitle="Sporočila pisarne"
      who={staff.fullName}
      role={staff.role} seesAc={staff.seesAc} isAdmin={staff.isAdmin} denied={staff.denied}
      section="posta"
      wide
    >
      <Mailboxes
        rows={((boxes.data ?? []) as Record<string, unknown>[]).map((b): MailboxRow => ({
          id: b.id as string,
          label: b.label as string,
          username: b.username as string,
          active: Boolean(b.active),
          lastCheckedAt: (b.last_checked_at as string | null) ?? null,
          lastOkAt: (b.last_ok_at as string | null) ?? null,
          lastError: (b.last_error as string | null) ?? null,
          total: Number(b.total_ingested ?? 0),
          backfillFrom: b.backfill_from as string,
        }))}
        unread={pending.count ?? 0}
      />
      <Inbox
        open={((open.data ?? []) as Record<string, unknown>[]).map(toItem)}
        closed={((closed.data ?? []) as Record<string, unknown>[]).map(toItem)}
        people={((people.data ?? []) as { id: string; full_name: string }[]).map((p) => ({ id: p.id, name: p.full_name }))}
        meId={staff.id}
      />
    </AppShell>
  );
}
