import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { COMPANY, isCompanyConfigured } from "./company";
import { eur } from "@/lib/format";
import { renderDobavnica } from "./dobavnica";
import { mailConfigured, sendMail } from "./email";
import { renderRacun } from "./racun";
import type { DeliveryDocData } from "./types";

const BUCKET = "delivery-documents";

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

type OutboxStatus = "queued" | "sent" | "failed" | "no_recipient";

export interface RenderedDocuments {
  orderNumber: number;
  customerName: string;
  customerEmail: string | null;
  invoiceNumber: string;
  dueDate: string;
  totalGross: number;
  dobavnicaPath: string;
  racunPath: string;
  dobavnica: Uint8Array;
  racun: Uint8Array;
}

/**
 * Creates the receipt if it doesn't exist yet (idempotent — this is what
 * starts the overdue clock), renders both PDFs from the current data and
 * company details, and stores them. Safe to call again: it overwrites.
 */
export async function renderAndStoreDocuments(orderId: string): Promise<RenderedDocuments> {
  const supabase = await createClient();

  const { data: invoice, error: invError } = await supabase.rpc("create_invoice_for_delivery", {
    p_order_id: orderId,
  });
  if (invError || !invoice) throw new Error(invError?.message ?? "Račun ni bil ustvarjen.");
  const inv = invoice as {
    invoice_number: string;
    issued_on: string;
    due_date: string;
    total_net: number | string;
    total_gross: number | string;
  };

  const { data: order, error: orderError } = await supabase
    .from("sales_order")
    .select(
      "order_number,customer(name,address,city,post_code,vat_id,email),order_line(quantity_ordered,quantity_delivered,unit_price_net,vat_rate,discount_pct,product(name)),delivery_proof(signature_image,signer_name,note,signed_at,hash)",
    )
    .eq("id", orderId)
    .single();
  if (orderError || !order) throw new Error(orderError?.message ?? "Naročilo ne obstaja.");

  const customer = one(order.customer as unknown as {
    name: string;
    address: string | null;
    city: string | null;
    post_code: string | null;
    vat_id: string | null;
    email: string | null;
  });
  const proof = one(order.delivery_proof as unknown as {
    signature_image: string;
    signer_name: string;
    note: string | null;
    signed_at: string;
    hash: string;
  });
  if (!customer || !proof) throw new Error("Manjkajo podatki o kupcu ali podpisu.");

  const admin = createAdminClient();

  let signaturePng: Uint8Array | null = null;
  const sig = await admin.storage.from("delivery-signatures").download(proof.signature_image);
  if (sig.data) signaturePng = new Uint8Array(await sig.data.arrayBuffer());

  const lines = (
    order.order_line as unknown as {
      quantity_ordered: number;
      quantity_delivered: number | null;
      unit_price_net: string;
      vat_rate: string;
      discount_pct: string;
      product: { name: string } | { name: string }[] | null;
    }[]
  ).map((l) => ({
    name: one(l.product)?.name ?? "—",
    ordered: l.quantity_ordered,
    delivered: l.quantity_delivered ?? l.quantity_ordered,
    unitNet: Number(l.unit_price_net),
    vatRate: Number(l.vat_rate),
    discountPct: Number(l.discount_pct),
  }));

  const data: DeliveryDocData = {
    orderNumber: order.order_number,
    customer: {
      name: customer.name,
      address: customer.address,
      city: customer.city,
      postCode: customer.post_code,
      vatId: customer.vat_id,
    },
    signedAt: new Date(proof.signed_at),
    lines,
    signerName: proof.signer_name,
    note: proof.note,
    signaturePng,
    proofHash: proof.hash,
    invoice: {
      number: inv.invoice_number,
      issuedOn: inv.issued_on,
      dueDate: inv.due_date,
      totalNet: Number(inv.total_net),
      totalGross: Number(inv.total_gross),
    },
  };

  const [dobavnica, racun] = await Promise.all([renderDobavnica(data), renderRacun(data)]);
  const dobavnicaPath = `${orderId}/dobavnica.pdf`;
  const racunPath = `${orderId}/racun.pdf`;
  const opts = { contentType: "application/pdf", upsert: true };
  const [u1, u2] = await Promise.all([
    admin.storage.from(BUCKET).upload(dobavnicaPath, dobavnica, opts),
    admin.storage.from(BUCKET).upload(racunPath, racun, opts),
  ]);
  if (u1.error || u2.error) throw new Error((u1.error ?? u2.error)?.message ?? "Shranjevanje ni uspelo.");

  return {
    orderNumber: order.order_number,
    customerName: customer.name,
    customerEmail: customer.email?.trim() || null,
    invoiceNumber: inv.invoice_number,
    dueDate: inv.due_date,
    totalGross: Number(inv.total_gross),
    dobavnicaPath,
    racunPath,
    dobavnica,
    racun,
  };
}

function mailSubject(doc: RenderedDocuments): string {
  return `Dobavnica in račun ${doc.invoiceNumber} – ${COMPANY.name}`;
}

function mailBody(doc: RenderedDocuments): string {
  const due = new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "numeric", year: "numeric" }).format(
    new Date(`${doc.dueDate}T12:00:00`),
  );
  return [
    "Pozdravljeni,",
    "",
    `v priponki prejmete podpisano dobavnico in račun ${doc.invoiceNumber} za današnjo dostavo (naročilo #${doc.orderNumber}).`,
    "",
    `Znesek za plačilo: ${eur(doc.totalGross)}`,
    `Rok plačila: ${due}`,
    `Nakazilo na IBAN: ${COMPANY.iban}, sklic: ${doc.invoiceNumber}`,
    "",
    "Hvala za naročilo.",
    "",
    "Lep pozdrav,",
    COMPANY.name,
    `${COMPANY.phone} · ${COMPANY.email}`,
  ].join("\n");
}

/**
 * Runs right after a delivery lands on the server: create the receipt,
 * render and store both documents, and e-mail them. Never throws — a
 * failure here must not undo or block a confirmed delivery; it is recorded
 * on the outbox row for the office to see and retry.
 */
export async function finalizeDelivery(orderId: string, recipientHint: string): Promise<void> {
  try {
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("outbound_email")
      .select("status")
      .eq("order_id", orderId)
      .maybeSingle();
    if (existing?.status === "sent") return; // retried sync — never mail twice

    const doc = await renderAndStoreDocuments(orderId);
    const recipient = recipientHint.trim() || doc.customerEmail;

    await supabase.from("outbound_email").upsert(
      {
        order_id: orderId,
        recipient,
        subject: mailSubject(doc),
        dobavnica_path: doc.dobavnicaPath,
        racun_path: doc.racunPath,
        status: recipient ? "queued" : "no_recipient",
        error: null,
      },
      { onConflict: "order_id" },
    );

    if (recipient) await sendStoredDocuments(orderId);
  } catch (e) {
    console.error("finalizeDelivery failed", orderId, e);
    try {
      const supabase = await createClient();
      await supabase.from("outbound_email").upsert(
        {
          order_id: orderId,
          subject: "Dobavnica in račun",
          status: "failed",
          error: e instanceof Error ? e.message.slice(0, 300) : "Neznana napaka",
        },
        { onConflict: "order_id" },
      );
    } catch {
      /* nothing more we can do; the delivery itself is already confirmed */
    }
  }
}

/**
 * Sends the documents for an order. Used by finalize and by the office's
 * "Pošlji" button. The PDFs are re-rendered at send time so a delivery
 * signed before the company details were filled in never goes out with
 * placeholders on it.
 */
export async function sendStoredDocuments(
  orderId: string,
  recipientOverride?: string,
): Promise<{ status: OutboxStatus; error: string | null }> {
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("outbound_email")
    .select("recipient,attempts")
    .eq("order_id", orderId)
    .single();
  if (!row) return { status: "failed", error: "Dokumenti še niso ustvarjeni." };

  const recipient = (recipientOverride ?? row.recipient ?? "").trim();
  const finish = async (status: OutboxStatus, error: string | null, extra: Record<string, unknown> = {}) => {
    await supabase
      .from("outbound_email")
      .update({
        recipient: recipient || null,
        status,
        error,
        attempts: (row.attempts ?? 0) + 1,
        sent_at: status === "sent" ? new Date().toISOString() : null,
        ...extra,
      })
      .eq("order_id", orderId);
    return { status, error };
  };

  if (!recipient) return finish("no_recipient", null);
  if (!isCompanyConfigured()) {
    return finish("queued", "Podatki podjetja še niso izpolnjeni — dokumenta sta pripravljena, a nista poslana.");
  }
  if (!mailConfigured()) {
    return finish("queued", "Pošiljanje e-pošte še ni nastavljeno — dokumenta sta pripravljena, a nista poslana.");
  }

  let doc: RenderedDocuments;
  try {
    doc = await renderAndStoreDocuments(orderId);
  } catch (e) {
    return finish("failed", e instanceof Error ? e.message.slice(0, 250) : "Priprava dokumentov ni uspela.");
  }

  const result = await sendMail({
    to: recipient,
    subject: mailSubject(doc),
    text: mailBody(doc),
    attachments: [
      { filename: `dobavnica-${doc.orderNumber}.pdf`, content: doc.dobavnica },
      { filename: `racun-${doc.invoiceNumber}.pdf`, content: doc.racun },
    ],
  });

  const extra = { subject: mailSubject(doc), dobavnica_path: doc.dobavnicaPath, racun_path: doc.racunPath };
  return result.ok ? finish("sent", null, extra) : finish("failed", result.error, extra);
}
