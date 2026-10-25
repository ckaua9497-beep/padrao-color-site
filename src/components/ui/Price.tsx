import { formatBRL } from "@/lib/format";
import { PIX_DISCOUNT, pixPrice } from "@/lib/pricing";
import { cx } from "./cx";

type Size = "card" | "pdp" | "total";

// Coral só em texto ≥ 19px bold; abaixo disso o preço usa o coral escuro.
const AMOUNT: Record<Size, string> = {
  card: "text-[19px] font-bold leading-tight text-price",
  pdp: "text-amount text-price",
  total: "text-2xl font-black leading-none text-ink",
};

type Props = {
  value: number;
  /** Mostra "a partir de" (preço mínimo, combinação ainda incompleta). */
  from?: boolean;
  /** "por unidade", "por 1.000 un." */
  unit?: string;
  size?: Size;
  /** Linha com o preço no PIX: só nas lojas da multiloja (a loja principal não dá desconto no PIX). */
  pix?: boolean;
  /** Anuncia mudanças de preço para leitores de tela (página de produto). */
  live?: boolean;
  className?: string;
};

export function Price({ value, from = false, unit, size = "card", pix = false, live = false, className }: Props) {
  return (
    <div className={cx("tabular-nums", className)} aria-live={live ? "polite" : undefined}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {from && <span className="text-caption text-muted">a partir de</span>}
        <span className={AMOUNT[size]}>{formatBRL(value)}</span>
        {unit && <span className="text-caption text-muted">{unit}</span>}
      </div>
      {pix && (
        <p className={cx("font-semibold text-price-sm", size === "card" ? "mt-0.5 text-micro" : "mt-1 text-caption")}>
          {formatBRL(pixPrice(value))} no PIX
          <span className="font-normal text-muted"> · {Math.round(PIX_DISCOUNT * 100)}% de desconto</span>
        </p>
      )}
    </div>
  );
}
