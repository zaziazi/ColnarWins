import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eur } from "@/lib/format";
import { SALES_BRAND } from "@/lib/sales/config";
import { createAnonClient } from "@/lib/supabase/anon";
import { OpenBeacon } from "./open-beacon";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: `Ponudba vin · ${SALES_BRAND}`,
  robots: { index: false, follow: false },
};

interface Offer {
  venue: string | null;
  rep_name: string;
  rep_phone: string | null;
  rep_email: string | null;
  products: { name: string; vintage: number | null; volume_l: number | null; price: number; vat: number; case_size: number | null }[];
}

export default async function OfferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{16,64}$/.test(token)) notFound();

  const { data, error } = await createAnonClient().rpc("public_offer", { p_token: token });
  const offer = data as Offer | null;
  if (error || !offer) notFound();

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto max-w-[640px] px-4 py-8">
        <header className="mb-6">
          <div className="text-[13px] font-bold tracking-[-0.01em]">
            {SALES_BRAND}
            <span className="text-wine">.</span>
          </div>
          <h1 className="mt-3 text-[26px] font-bold tracking-[-0.02em] leading-tight">Ponudba vin</h1>
          {offer.venue && <p className="mt-1 text-[14px] text-ink-muted">Pripravljeno za: {offer.venue}</p>}
        </header>

        <div className="bg-surface border border-line rounded-[var(--radius-card)] overflow-hidden">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="bg-surface-muted text-[11px] uppercase tracking-[0.06em] text-ink-subtle text-left">
                <th className="px-3.5 py-2.5 font-bold">Vino</th>
                <th className="px-3.5 py-2.5 font-bold text-right">Cena brez DDV</th>
                <th className="px-3.5 py-2.5 font-bold text-right hidden sm:table-cell">z DDV</th>
              </tr>
            </thead>
            <tbody>
              {offer.products.map((p) => (
                <tr key={p.name} className="border-t border-line">
                  <td className="px-3.5 py-2.5">
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-[11.5px] text-ink-subtle">
                      {[p.vintage ? `letnik ${p.vintage}` : null, p.case_size ? `karton ${p.case_size} steklenic` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5 text-right tabular font-semibold">{eur(Number(p.price))}</td>
                  <td className="px-3.5 py-2.5 text-right tabular text-ink-muted hidden sm:table-cell">
                    {eur(Number(p.price) * (1 + Number(p.vat)))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11.5px] text-ink-subtle mt-2">Cene so za steklenico. Stalne cene, DDV je obračunan posebej.</p>

        <section className="mt-6 bg-surface border border-line rounded-[var(--radius-card)] p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle mb-1.5">Vaš kontakt</div>
          <div className="text-[15px] font-bold">{offer.rep_name}</div>
          {offer.rep_phone && (
            <a href={`tel:${offer.rep_phone}`} className="block mt-1 text-[14px] text-wine font-semibold">
              {offer.rep_phone}
            </a>
          )}
          {offer.rep_email && (
            <a href={`mailto:${offer.rep_email}`} className="block text-[13.5px] text-wine">
              {offer.rep_email}
            </a>
          )}
          <p className="text-[12.5px] text-ink-muted mt-2 leading-relaxed">
            Z veseljem pridem mimo s pokušino. Naročilo vam dostavimo na dogovorjeni datum.
          </p>
        </section>
      </div>
      <OpenBeacon token={token} />
    </div>
  );
}
