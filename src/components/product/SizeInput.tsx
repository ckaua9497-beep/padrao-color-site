"use client";

import { OptionGroup } from "@/components/ui/OptionGroup";
import { TextField } from "@/components/ui/TextField";
import { cx } from "@/components/ui/cx";
import type { CustomSize } from "@/lib/catalog";
import { formatBRL } from "@/lib/format";
import { formatArea, limitsHint, parseMeasure, type AreaQuote } from "@/lib/pricing";

export type SizeText = { width: string; height: string };

type Props = {
  value: SizeText;
  onChange: (value: SizeText) => void;
  /** Limites do produto em metros (0 = sem limite). */
  limits: CustomSize;
  presets: [number, number][];
  /** Cálculo da medida atual (preço por peça = preço por m² × área cobrada). */
  quote: AreaQuote;
  pricePerM2: number;
  /** Mostra os erros mesmo antes de a pessoa mexer (tentou comprar com medida inválida). */
  showErrors?: boolean;
};

const fmtM = (m: number) => `${m.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m`;
const clean = (text: string) => text.replace(/[^\d.,]/g, "").slice(0, 7);

function fieldError(cm: number, min: number, max: number, label: string): string | null {
  if (!cm) return `Informe a ${label}.`;
  if (max && cm > max * 100 + 1e-9) return `Máximo de ${fmtM(max)}.`;
  if (min && cm < min * 100 - 1e-9) return `Mínimo de ${fmtM(min)}.`;
  return null;
}

/** Medida livre (preço por m²): largura × altura em cm, medidas rápidas, área e preço por peça ao vivo. */
export default function SizeInput({ value, onChange, limits, presets, quote, pricePerM2, showErrors = false }: Props) {
  const width = parseMeasure(value.width);
  const height = parseMeasure(value.height);
  const widthError = fieldError(width, limits.minWidth, limits.maxWidth, "largura");
  const heightError = fieldError(height, limits.minHeight, limits.maxHeight, "altura");
  // O erro de área (máxima) não pertence a um campo só: aparece no resumo.
  const areaError = !widthError && !heightError ? quote.error : null;
  const hint = limitsHint(limits);
  const current = presets.find(([w, h]) => w === width && h === height);
  // Campo vazio só acusa erro depois da tentativa de compra; com valor, os limites aparecem na hora.
  const visible = (error: string | null, text: string) => (showErrors || text.trim() !== "" ? error : null);

  return (
    <div className="rounded-card bg-white p-4 ring-1 ring-line">
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
        <TextField
          label="Largura (cm)"
          value={value.width}
          onChange={(text) => onChange({ ...value, width: clean(text) })}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="next"
          error={visible(widthError, value.width)}
        />
        <button
          type="button"
          onClick={() => onChange({ width: value.height, height: value.width })}
          aria-label="Inverter largura e altura"
          title="Inverter largura e altura"
          className="mt-9 grid size-11 place-items-center rounded-full text-muted transition-colors hover:bg-mist hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M7 7h12m0 0-3.5-3.5M19 7l-3.5 3.5M17 17H5m0 0 3.5-3.5M5 17l3.5 3.5" />
          </svg>
        </button>
        <TextField
          label="Altura (cm)"
          value={value.height}
          onChange={(text) => onChange({ ...value, height: clean(text) })}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          error={visible(heightError, value.height)}
        />
      </div>
      {hint && <p className="mt-2 text-caption text-muted">{hint}.</p>}

      {presets.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[15px] font-bold">Medidas rápidas</p>
          <OptionGroup
            label="Medidas rápidas"
            value={current ? `${current[0]}x${current[1]}` : undefined}
            onChange={(key) => {
              const [w, h] = key.split("x");
              onChange({ width: w, height: h });
            }}
            options={presets.map(([w, h]) => ({ value: `${w}x${h}`, label: `${w} × ${h} cm` }))}
          />
        </div>
      )}

      <div className={cx("mt-4 rounded-control px-4 py-3 text-[15px] tabular-nums", areaError ? "bg-coral-50" : "bg-mist")}>
        {areaError ? (
          <p role="alert" className="font-semibold text-coral-700">
            {areaError}
          </p>
        ) : widthError || heightError ? (
          <p className="text-muted">Informe uma medida dentro dos limites para calcular o preço.</p>
        ) : (
          <p aria-live="polite">
            Área <strong>{formatArea(quote.area)}</strong>
            {quote.billedArea > quote.area && <span className="text-muted"> · cobrança mínima de {formatArea(quote.billedArea)}</span>}
            <span className="text-muted"> · {formatBRL(pricePerM2)} por m²</span>
            <span className="mt-0.5 block font-bold">
              {formatBRL(quote.price)} por peça de {value.width || 0} × {value.height || 0} cm
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
