"use client";

import { useId } from "react";
import { LED_COLORS, LED_MAX, ledColorName } from "@/components/mockup/art";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";

type Props = {
  /** Cores em uso (as do cliente ou, sem escolha, as da opção do produto). */
  value: readonly string[];
  /** true quando as cores vieram do cliente (art.ledColors). */
  custom: boolean;
  onChange: (colors: string[] | null) => void;
};

const ORDINAL = ["1ª", "2ª", "3ª"];

/**
 * Cores do LED do neon: até três, na ordem das linhas do texto (a seguinte acende o subtexto e os extras
 * do estilo). Botões alternáveis com o número da linha; com três escolhidas, a nova troca a última.
 */
export function LedColorPicker({ value, custom, onChange }: Props) {
  const hintId = useId();
  const selected = value.map((c) => c.toLowerCase());

  const toggle = (color: string) => {
    const index = selected.indexOf(color);
    if (index >= 0) {
      // Sempre fica pelo menos uma cor acesa.
      if (selected.length > 1) onChange(selected.filter((c) => c !== color));
      return;
    }
    onChange(selected.length >= LED_MAX ? [...selected.slice(0, LED_MAX - 1), color] : [...selected, color]);
  };

  return (
    <div>
      <p className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 text-[15px] font-bold">
        Cores do LED
        <span className="text-caption font-normal text-muted">{selected.map((c, i) => `${ORDINAL[i] ?? `${i + 1}ª`} ${ledColorName(c).toLowerCase()}`).join(" · ")}</span>
      </p>
      <div role="group" aria-label="Cores do LED" aria-describedby={hintId} className="flex flex-wrap gap-2">
        {LED_COLORS.map((led) => {
          const order = selected.indexOf(led.value);
          const on = order >= 0;
          return (
            <button
              key={led.value}
              type="button"
              aria-pressed={on}
              aria-label={on ? `${led.label} (${ORDINAL[order] ?? order + 1} cor)` : led.label}
              title={led.label}
              onClick={() => toggle(led.value)}
              className={cx("relative grid size-swatch place-items-center rounded-control bg-night p-1 transition-shadow duration-200", on ? "ring-2 ring-ink" : "ring-1 ring-line hover:ring-ink/40")}
            >
              <span className="size-6 rounded-full ring-2 ring-white/70" style={{ background: led.value, boxShadow: `0 0 12px 2px ${led.value}` }} aria-hidden />
              {on && (
                <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-ink text-[10px] font-bold text-white" aria-hidden>
                  {order + 1}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p id={hintId} className="mt-2 flex flex-wrap items-center gap-x-2 text-caption text-muted">
        Até {LED_MAX} cores: uma por linha do texto; a seguinte acende o subtexto e a moldura do estilo. Toque de novo para tirar.
        {custom && (
          <Button variant="link" size="sm" className="min-h-6 text-caption" onClick={() => onChange(null)}>
            Usar as cores da opção do produto
          </Button>
        )}
      </p>
    </div>
  );
}
