"use client";

import { OptionGroup } from "@/components/ui/OptionGroup";
import { TextField } from "@/components/ui/TextField";
import { cx } from "@/components/ui/cx";
import type { CustomSize } from "@/lib/catalog";
import { formatBRL } from "@/lib/format";
import { NEON_FRASE, NEON_MIN_AREA_M2, formatArea, neonFraseMinHeightCm, parseMeasure, type AreaQuote } from "@/lib/pricing";

type Props = {
  /** Largura digitada (cm). */
  width: string;
  onWidth: (value: string) => void;
  /** Altura que sai da proporção do texto (cm). */
  heightCm: number;
  /** Largura ÷ altura do letreiro com o texto atual. */
  aspect: number;
  /** Linhas de tubo (texto + subtexto): a altura mínima é 15 cm por linha. */
  lines: number;
  /** Limites do formato escolhido ("Até 50cm" / "Acima de 50cm"), em metros. */
  limits: CustomSize;
  quote: AreaQuote;
  pricePerM2: number;
  showErrors?: boolean;
};

const fmtCm = (cm: number) => cm.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const clean = (text: string) => text.replace(/[^\d.,]/g, "").slice(0, 6);

/**
 * Tamanho do "Crie sua Frase em Led Neon" (290). O cliente escreve o texto e escolhe a largura; a altura segue a proporção
 * do texto, como no site atual (o sistema mede a caixa do texto). Regras do site atual: largura de 15 a 198 cm, altura de
 * 15 cm por linha (+3 cm com mais de uma) e abaixo de 98 cm, a faixa da opção Formato e, acima de 175 cm de largura,
 * retirada só na loja de São João de Meriti. Preço: área × preço do m², com o mínimo de 0,25 m².
 */
export default function NeonSizeStep({ width, onWidth, heightCm, aspect, lines, limits, quote, pricePerM2, showErrors = false }: Props) {
  const widthCm = parseMeasure(width);
  const minWidth = Math.round(limits.minWidth * 100);
  const maxWidth = Math.round(limits.maxWidth * 100);
  const minHeight = neonFraseMinHeightCm(lines);
  // Medidas rápidas dentro do formato escolhido.
  const presets = [20, 30, 40, 50, 60, 80, 100, 120, 150].filter((w) => w >= minWidth && w <= maxWidth);
  // Altura abaixo do mínimo: diz a largura que resolve (a altura acompanha a proporção do texto).
  const needWidth = Math.ceil(minHeight * aspect);
  const error = !widthCm
    ? showErrors
      ? "Informe a largura do letreiro."
      : null
    : heightCm < minHeight - 1e-9
      ? needWidth <= maxWidth
        ? `Com ${lines === 1 ? "1 linha" : `${lines} linhas`}, a altura mínima é de ${minHeight} cm: aumente a largura para ${needWidth} cm.`
        : `Com ${lines === 1 ? "1 linha" : `${lines} linhas`}, a altura mínima é de ${minHeight} cm e não cabe neste formato: encurte o texto ou escolha o outro formato.`
      : quote.error;
  // No campo, só o que é da largura; a altura (que segue o texto) fica no resumo.
  const fieldError = !widthCm ? (showErrors ? error : null) : quote.error && /largura/i.test(quote.error) ? quote.error : null;
  const pickupOnly = widthCm > NEON_FRASE.pickupOnlyAboveCm;

  return (
    <div className="rounded-card bg-white p-4 ring-1 ring-line">
      <div className="grid grid-cols-2 items-start gap-3">
        <TextField label="Largura (cm)" value={width} onChange={(text) => onWidth(clean(text))} inputMode="decimal" autoComplete="off" enterKeyHint="done" error={fieldError} />
        <div>
          <p className="mb-1.5 text-sm font-semibold">Altura</p>
          <p className="flex h-12 items-center rounded-control bg-mist px-3 text-[15px] tabular-nums">{heightCm ? `${fmtCm(heightCm)} cm` : "—"}</p>
        </div>
      </div>
      <p className="mt-2 text-caption text-muted">
        A altura acompanha a proporção do texto. Largura de {minWidth} a {maxWidth} cm · altura mínima de {minHeight} cm ({lines === 1 ? "1 linha" : `${lines} linhas`}) e máxima de {NEON_FRASE.maxHeightCm} cm · cobrança mínima de {formatArea(NEON_MIN_AREA_M2)}.
      </p>

      {presets.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[15px] font-bold">Larguras rápidas</p>
          <OptionGroup label="Larguras rápidas" value={presets.includes(widthCm) ? String(widthCm) : undefined} onChange={onWidth} options={presets.map((w) => ({ value: String(w), label: `${w} cm` }))} />
        </div>
      )}

      {pickupOnly && (
        <p role="note" className="mt-4 rounded-control bg-coral-50 px-3 py-2 text-sm font-semibold text-coral-700">
          Acima de {NEON_FRASE.pickupOnlyAboveCm} cm de largura, o letreiro só pode ser retirado na loja de São João de Meriti (sem rota nem frete).
        </p>
      )}

      <div className={cx("mt-4 rounded-control px-4 py-3 text-[15px] tabular-nums", error ? "bg-coral-50" : "bg-mist")}>
        {error ? (
          <p role="alert" className="font-semibold text-coral-700">
            {error}
          </p>
        ) : (
          <p aria-live="polite">
            Letreiro de <strong>{fmtCm(widthCm)} × {fmtCm(heightCm)} cm</strong> · área {formatArea(quote.area)}
            {quote.billedArea > quote.area && <span className="text-muted"> · cobrança mínima de {formatArea(quote.billedArea)}</span>}
            <span className="text-muted"> · {formatBRL(pricePerM2)} por m²</span>
            <span className="mt-0.5 block font-bold">{formatBRL(quote.total)} pelo letreiro</span>
          </p>
        )}
      </div>
    </div>
  );
}
