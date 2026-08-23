"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { bulkRecordReadings } from "../actions";
import { parseFossCsv, type ParseResult, type ReadingValueKey } from "./parse-foss-csv";
import type { WineLot } from "@/lib/types";

const STAGE_LABEL: Record<string, string> = { grozdje: "Grozdje", vrenje: "Vrenje", vino: "Vino" };

const VALUE_LABEL: Record<ReadingValueKey, { label: string; unit: string }> = {
  sugarGl: { label: "sladkor", unit: "g/l" },
  density: { label: "gostota", unit: "" },
  ph: { label: "pH", unit: "" },
  so2: { label: "SO2", unit: "mg/l" },
  malicAcid: { label: "jabolčna", unit: "g/l" },
  tartaricAcid: { label: "vinska", unit: "g/l" },
  lacticAcid: { label: "mlečna", unit: "g/l" },
  totalAcid: { label: "skupna", unit: "g/l" },
  volatileAcid: { label: "hlapna", unit: "g/l" },
  co2: { label: "CO2", unit: "g/l" },
  alcohol: { label: "alk.", unit: "%" },
  yan: { label: "YAN", unit: "mg/l" },
};

interface Row {
  key: string;
  fileName: string;
  parse: ParseResult;
  lotId: string | null;
  included: boolean;
}

function valuesSummary(values: Partial<Record<ReadingValueKey, number>>): string {
  return (Object.keys(values) as ReadingValueKey[])
    .map((k) => `${VALUE_LABEL[k].label} ${values[k]}${VALUE_LABEL[k].unit ? ` ${VALUE_LABEL[k].unit}` : ""}`)
    .join(" · ");
}

function formatMeasuredAt(iso: string): string {
  // iso is a naive "YYYY-MM-DDTHH:MM:SS" — parse the parts directly rather
  // than via `new Date(iso)`, which would apply the browser's local
  // timezone to what is meant to be a plain wall-clock timestamp.
  const [datePart, timePart] = iso.split("T");
  const [y, m, d] = datePart.split("-");
  return `${d}. ${m}. ${y} · ${timePart?.slice(0, 5) ?? ""}`;
}

export function ImportShell({ lots }: { lots: WineLot[] }) {
  const router = useRouter();
  const [rows, setRows] = React.useState<Row[]>([]);
  const [pending, startTransition] = React.useTransition();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const lotOptions: ComboboxOption[] = lots.map((l) => ({
    value: l.id,
    label: `${l.lotNumber} · ${l.name}`,
    hint: STAGE_LABEL[l.stage],
  }));

  const lotById = new Map(lots.map((l) => [l.id, l]));
  const lotByNumber = new Map(lots.map((l) => [l.lotNumber.trim().toLowerCase(), l]));

  async function handleFiles(fileList: FileList) {
    const files = Array.from(fileList);
    const newRows: Row[] = await Promise.all(
      files.map(async (file, i) => {
        const text = await file.text();
        const parse = parseFossCsv(file.name, text);
        const matchedLot =
          parse.ok ? lotByNumber.get(parse.reading.sampleId.trim().toLowerCase()) ?? null : null;
        return {
          key: `${file.name}-${i}-${Date.now()}`,
          fileName: file.name,
          parse,
          lotId: matchedLot?.id ?? null,
          included: parse.ok && !!matchedLot,
        };
      }),
    );
    setRows((prev) => [...prev, ...newRows]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function setLotId(key: string, lotId: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, lotId, included: true } : r)));
  }

  function setIncluded(key: string, included: boolean) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, included } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  // (lotId, measuredAt) collisions among resolved rows — likely an accidental
  // double-upload of the same measurement. Flagged, not auto-excluded — the
  // person reviewing decides, same as everywhere else consequential in this app.
  const duplicateKeys = new Set<string>();
  {
    const seen = new Map<string, number>();
    for (const r of rows) {
      if (!r.parse.ok || !r.lotId) continue;
      const dupeKey = `${r.lotId}|${r.parse.reading.measuredAt}`;
      seen.set(dupeKey, (seen.get(dupeKey) ?? 0) + 1);
    }
    for (const r of rows) {
      if (!r.parse.ok || !r.lotId) continue;
      const dupeKey = `${r.lotId}|${r.parse.reading.measuredAt}`;
      if ((seen.get(dupeKey) ?? 0) > 1) duplicateKeys.add(r.key);
    }
  }

  function isImportable(
    r: Row,
  ): r is Row & { parse: Extract<ParseResult, { ok: true }>; lotId: string } {
    return r.included && r.parse.ok && r.lotId !== null;
  }

  const includedCount = rows.filter(isImportable).length;

  function submit() {
    const toImport = rows.filter(isImportable);
    if (toImport.length === 0) return;

    startTransition(async () => {
      const result = await bulkRecordReadings({
        rows: toImport.map((r) => ({
          lotId: r.lotId,
          measuredAt: r.parse.reading.measuredAt,
          ...r.parse.reading.values,
        })),
      });
      if (!result.ok) {
        toast.error(result.error ?? "Uvoz ni uspel");
        return;
      }
      toast.success(`Uvoženih meritev: ${toImport.length}`);
      const importedKeys = new Set(toImport.map((r) => r.key));
      setRows((prev) => prev.filter((r) => !importedKeys.has(r.key)));
      router.refresh();
    });
  }

  return (
    <div>
      <Card className="p-3.5 mb-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          multiple
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          className="hidden"
          id="foss-file-input"
        />
        <label htmlFor="foss-file-input">
          <Button asChild size="lg" variant="secondary">
            <span>
              <Upload /> Izberi datoteke ({rows.length} naloženih)
            </span>
          </Button>
        </label>
        <p className="text-[12px] text-ink-subtle mt-2 leading-relaxed">
          Izberi vse .csv datoteke iz naprave naenkrat. Vsaka predstavlja eno meritev — ujemanje
          poteka po interni številki vina (npr. 26-008), ki mora biti vnesena kot ID vzorca na
          napravi.
        </p>
      </Card>

      {rows.length === 0 ? (
        <Card className="p-7 text-center">
          <p className="text-[13px] text-ink-muted">Še ni naloženih datotek.</p>
        </Card>
      ) : (
        <>
          <div className="space-y-2.5 mb-4">
            {rows.map((r) => {
              if (!r.parse.ok) {
                return (
                  <Card key={r.key} className="p-3.5 border-danger/30 bg-danger-soft/20">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-semibold truncate">{r.fileName}</p>
                        <p className="text-[12.5px] text-danger mt-0.5 inline-flex items-center gap-1">
                          <TriangleAlert className="size-3.5 shrink-0" /> {r.parse.error}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRow(r.key)}
                        className="text-[11.5px] text-ink-subtle hover:text-ink shrink-0"
                      >
                        Odstrani
                      </button>
                    </div>
                  </Card>
                );
              }

              const { reading } = r.parse;
              const matchedLot = r.lotId ? lotById.get(r.lotId) ?? null : null;
              const isDuplicate = duplicateKeys.has(r.key);
              const stageMismatch =
                matchedLot && reading.inferredStage && reading.inferredStage !== matchedLot.stage;

              return (
                <Card key={r.key} className="p-3.5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-[11px] text-ink-subtle truncate">{r.fileName}</p>
                      <p className="text-[12.5px] text-ink-muted mt-0.5">
                        ID v datoteki: <span className="font-medium">{reading.sampleId}</span> ·{" "}
                        {formatMeasuredAt(reading.measuredAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isDuplicate && <Badge tone="warn">Podvojeno</Badge>}
                      {matchedLot ? (
                        <Badge tone="good">Ujema se</Badge>
                      ) : (
                        <Badge tone="danger">Ni najdeno</Badge>
                      )}
                    </div>
                  </div>

                  <Combobox
                    options={lotOptions}
                    value={r.lotId}
                    onChange={(v) => setLotId(r.key, v)}
                    placeholder="Izberi vino…"
                    searchPlaceholder="Številka ali ime…"
                  />

                  {stageMismatch && (
                    <p className="text-[11.5px] text-warn mt-1.5 inline-flex items-center gap-1">
                      <TriangleAlert className="size-3.5 shrink-0" />
                      Datoteka: {STAGE_LABEL[reading.inferredStage!]} · vino je trenutno v fazi{" "}
                      {STAGE_LABEL[matchedLot!.stage]}
                    </p>
                  )}

                  <p className="text-[12.5px] text-ink-muted mt-2">{valuesSummary(reading.values)}</p>

                  <label className="flex items-center gap-2 mt-3 text-[12.5px] text-ink-muted">
                    <input
                      type="checkbox"
                      checked={r.included && !!r.lotId}
                      disabled={!r.lotId}
                      onChange={(e) => setIncluded(r.key, e.target.checked)}
                    />
                    Vključi v uvoz
                  </label>
                </Card>
              );
            })}
          </div>

          <Button size="lg" onClick={submit} loading={pending} disabled={includedCount === 0}>
            Uvozi izbrane ({includedCount})
          </Button>
        </>
      )}
    </div>
  );
}
