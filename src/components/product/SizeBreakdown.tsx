"use client";

import QtyStepper from "@/components/ui/QtyStepper";
import { cx } from "@/components/ui/cx";
import type { SizeChartRow } from "@/lib/catalog";
import type { SizeCounts } from "@/lib/pricing";

// "6 Anos" (grade) × "6 anos" (tabela de medidas).
const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

type Props = {
  sizes: string[];
  counts: SizeCounts;
  onChange: (counts: SizeCounts) => void;
  sizeChart?: SizeChartRow[] | null;
  minQty: number;
  maxQty: number;
  total: number;
  /** Mensagem de mínimo/máximo (sizeError); null = pedido válido. */
  error: string | null;
  /** Mostra o erro mesmo com total zero (depois da tentativa de compra). */
  showError?: boolean;
};

/** Faixa do pedido para o cliente: "De 11 a 100 peças", "A partir de 101 peças"… */
function rangeLabel(min: number, max: number): string {
  const fmt = (n: number) => n.toLocaleString("pt-BR");
  const open = !max || max >= 99_999;
  if (min > 1 && open) return `Pedido a partir de ${fmt(min)} peças`;
  if (min > 1) return `Pedido de ${fmt(min)} a ${fmt(max)} peças`;
  if (!open) return `Até ${fmt(max)} peças por pedido`;
  return "Escolha quantas peças de cada tamanho";
}

/** Grade de vestuário: quantidade por tamanho (P, M, G…), total somado e mínimo/máximo do produto. */
export default function SizeBreakdown({ sizes, counts, onChange, sizeChart, minQty, maxQty, total, error, showError = false }: Props) {
  const perSizeMax = Math.min(maxQty && maxQty < 99_999 ? maxQty : 9_999, 9_999);
  const measures = new Map((sizeChart ?? []).map((row) => [normalize(row.size), row]));
  const visibleError = error && (showError || total > 0) ? error : null;

  return (
    <div className={cx("rounded-card bg-white p-4 ring-1", visibleError ? "ring-coral-700" : "ring-line")}>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {sizes.map((size) => {
          const row = measures.get(normalize(size));
          const value = counts[size] ?? 0;
          return (
            <li key={size} className={cx("flex flex-col gap-2 rounded-control p-3 transition-colors", value > 0 ? "bg-mist" : "bg-white ring-1 ring-line")}>
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[15px] font-bold">{size}</span>
                {row && (
                  <span className="text-micro text-muted" title="Largura × comprimento da peça">
                    {row.widthCm} × {row.lengthCm} cm
                  </span>
                )}
              </span>
              <QtyStepper size="sm" min={0} max={perSizeMax} value={value} onChange={(next) => onChange({ ...counts, [size]: next })} label={`Quantidade no tamanho ${size}`} />
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 text-[15px]">
        <p aria-live="polite" className="tabular-nums">
          Total: <strong>{total.toLocaleString("pt-BR")}</strong> {total === 1 ? "peça" : "peças"}
        </p>
        <p className="text-caption text-muted">{rangeLabel(minQty, maxQty)}</p>
      </div>
      {visibleError && (
        <p role="alert" className="mt-2 text-caption font-semibold text-coral-700">
          {visibleError}
        </p>
      )}
    </div>
  );
}
