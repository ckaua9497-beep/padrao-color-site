"use client";

import { useId, useMemo } from "react";
import type { ArtSettings, BodyType } from "@/components/mockup/art";
import { Button } from "@/components/ui/Button";
import { OptionGroup } from "@/components/ui/OptionGroup";
import { cx } from "@/components/ui/cx";
import type { SizeChartRow } from "@/lib/catalog";
import { BODY_TYPES, dressFor, easeOf, fitOf, mannequinFor, rowOf, sizeKey, sizeRows, suggestSize, type Fit } from "./mannequin";

type Props = {
  art: ArtSettings;
  onArt: (update: (art: ArtSettings) => ArtSettings) => void;
  sizes?: string[] | null;
  sizeChart?: SizeChartRow[] | null;
};

const FIT_TONE: Record<Fit, string> = {
  justa: "bg-coral-50 text-coral-700",
  ideal: "bg-lime-50 text-ink",
  folgada: "bg-amber-50 text-ink",
};

function formatCm(v: number) {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/**
 * Manequim da camisa no 3D: tamanho (medidas da Tabela de Medidas) e corpo em três opções, com o
 * caimento (justa, ideal, folgada) e o tamanho sugerido para o corpo escolhido. Grava art.mannequin.
 */
export function MannequinPanel({ art, onArt, sizes, sizeChart }: Props) {
  const headingId = useId();
  const rows = useMemo(() => sizeRows(sizes, sizeChart), [sizes, sizeChart]);
  // undefined = manequim padrão (M, intermediário), o mesmo que o 3D mostra; null = escondido.
  const shown = art.mannequin !== null;
  const value = art.mannequin ?? { size: rowOf(rows, "M")?.size ?? "M", body: "medio" as BodyType, widthCm: null, lengthCm: null };
  // As mesmas medidas que o modelo 3D usa (dressFor), para o caimento bater com o que aparece.
  const dress = dressFor(value.size, value.body, value.widthCm, value.lengthCm);
  const row = { size: value.size, widthCm: dress.widthCm, lengthCm: dress.lengthCm };
  const body = dress.body;
  const ease = easeOf(row.widthCm, body);
  const fit = fitOf(ease);
  const suggestion = suggestSize(rows, body);
  const set = (size: string, bodyType: BodyType) => onArt((a) => ({ ...a, mannequin: mannequinFor(rows, size, bodyType) }));

  return (
    <section aria-labelledby={headingId} className="mt-4 rounded-card bg-mist p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={headingId} className="text-[15px] font-bold">
          Manequim <span className="font-normal text-muted">· proporcional ao tamanho</span>
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={shown}
            onChange={(event) => onArt((a) => ({ ...a, mannequin: event.target.checked ? mannequinFor(rows, value.size, value.body) : null }))}
            className="size-4 accent-coral-700"
          />
          Mostrar no 3D
        </label>
      </div>

      {shown && (
        <div className="mt-4 grid gap-4">
          <div>
            <p className="mb-2 text-sm font-semibold">Tamanho da camisa</p>
            <OptionGroup label="Tamanho da camisa no manequim" value={value.size} onChange={(size) => set(size, value.body)} options={rows.map((r) => ({ value: r.size, label: r.size }))} />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Corpo</p>
            <OptionGroup label="Corpo do manequim" value={value.body} onChange={(bodyType) => set(value.size, bodyType as BodyType)} options={BODY_TYPES.map((b) => ({ value: b.value, label: b.label }))} />
          </div>
          <div role="status" className="grid gap-1.5 rounded-control bg-white p-3 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              <span className={cx("rounded-full px-2.5 py-0.5 text-micro font-bold uppercase tracking-wide", FIT_TONE[fit])}>Caimento {fit}</span>
              <span className="text-muted">{ease >= 0 ? `folga de ${formatCm(ease)} cm no peito` : `${formatCm(-ease)} cm menor que o peito`}</span>
            </p>
            {suggestion && sizeKey(suggestion) !== sizeKey(value.size) ? (
              <p className="flex flex-wrap items-center gap-x-2">
                Para esse corpo, sugerimos o tamanho <strong>{suggestion}</strong>.
                <Button variant="link" size="sm" className="min-h-6" onClick={() => set(suggestion, value.body)}>
                  Usar {suggestion}
                </Button>
              </p>
            ) : (
              <p>Tamanho indicado para esse corpo.</p>
            )}
            <p className="text-caption text-muted">
              Camisa {row.size}: {formatCm(row.widthCm)} × {formatCm(row.lengthCm)} cm (largura × comprimento) · manequim {body.kid ? `infantil de ${formatCm(body.heightCm)} cm` : "adulto de 1,75 m"}.
            </p>
          </div>
          <p className="text-caption text-muted">Simulação de caimento no 3D: o tamanho do pedido segue a grade escolhida na compra.</p>
        </div>
      )}
    </section>
  );
}
