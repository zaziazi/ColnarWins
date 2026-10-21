import { clubPublicUrl, getClubSettings, qrSvg } from "@/lib/club";
import { requireClubManager } from "../gate";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

/** A4 sign for the Vinoteka counter: scan to join. */
export default async function PosterPage() {
  const gate = await requireClubManager();
  if ("denied" in gate) return gate.denied;

  const settings = await getClubSettings();
  const url = `${clubPublicUrl()}/`;
  const qr = await qrSvg(url, "#231a1c");

  return (
    <div className="min-h-dvh bg-canvas print:bg-white">
      <div className="print:hidden flex justify-center gap-3 py-4">
        <PrintButton />
      </div>
      <div className="mx-auto w-[min(100%,560px)] bg-white px-10 py-12 text-center print:w-full print:p-0 print:pt-16">
        <div className="text-[15px] font-bold tracking-[0.18em] uppercase text-wine">Vinoteka Colnar</div>
        <h1 className="mt-4 text-[40px] font-bold leading-[1.05] tracking-[-0.02em]">{settings.clubName}</h1>
        <p className="mt-4 text-[19px] text-ink-muted leading-snug">
          Ob vsakem obisku žig.
          <br />
          Pri <b className="text-ink">{settings.stampsNeeded}</b> žigih vas čaka <b className="text-ink">{settings.reward}</b>.
        </p>
        <div className="mx-auto mt-8 w-[300px] [&_svg]:w-full [&_svg]:h-auto" dangerouslySetInnerHTML={{ __html: qr }} />
        <p className="mt-6 text-[20px] font-semibold">Skenirajte s kamero telefona</p>
        <p className="mt-1 text-[14px] text-ink-subtle">Brez aplikacije · kartica je v vašem telefonu</p>
        <p className="mt-6 text-[12px] text-ink-subtle">{url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</p>
      </div>
    </div>
  );
}
