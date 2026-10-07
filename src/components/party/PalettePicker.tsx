"use client";

import { useRef, type KeyboardEvent } from "react";
import { IconCheck } from "@/components/icons";
import { cx } from "@/components/ui/cx";
import type { PartyPalette } from "@/lib/party";

type Props = {
  palettes: readonly PartyPalette[];
  value: string;
  onChange: (id: string) => void;
  /** Nome acessível do grupo. */
  label?: string;
};

/** Paletas da festa como radiogroup (foco itinerante: Tab entra no grupo, setas trocam). */
export function PalettePicker({ palettes, value, onChange, label = "Paleta de cores" }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = Math.max(
    0,
    palettes.findIndex((p) => p.id === value),
  );

  const select = (index: number) => {
    const next = (index + palettes.length) % palettes.length;
    onChange(palettes[next].id);
    refs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const keys: Record<string, number> = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: palettes.length - 1 };
    if (!(event.key in keys)) return;
    event.preventDefault();
    select(keys[event.key]);
  };

  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {palettes.map((palette, index) => {
        const active = palette.id === value;
        return (
          <button
            key={palette.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={index === selectedIndex ? 0 : -1}
            onClick={() => onChange(palette.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cx(
              "relative flex min-h-12 items-center gap-2.5 rounded-control bg-white p-2 text-left text-[13px] font-semibold leading-tight transition-shadow duration-200",
              active ? "ring-2 ring-ink" : "ring-1 ring-line-strong hover:ring-ink/50",
            )}
          >
            <span aria-hidden className="flex h-8 w-11 shrink-0 overflow-hidden rounded-thumb ring-1 ring-black/10 ring-inset">
              {palette.colors.map((color) => (
                <span key={color} className="h-full flex-1" style={{ background: color }} />
              ))}
            </span>
            {palette.label}
            {active && (
              <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-ink text-white">
                <IconCheck className="size-3.5" strokeWidth={2.6} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
