"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { IconCheck } from "@/components/icons";
import { cx } from "./cx";

export type OptionItem = {
  value: string;
  label?: ReactNode;
  /** false = combinação sem preço de tabela; continua escolhível, mas aparece esmaecida. */
  available?: boolean;
  /** Swatch de cor (variante "swatch"). */
  color?: string;
};

type Props = {
  /** Nome acessível do grupo. */
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  options: OptionItem[];
  variant?: "chip" | "swatch";
  className?: string;
};

/** Radiogroup com foco itinerante: Tab entra no grupo, setas trocam a opção (como radio nativo). */
export function OptionGroup({ label, value, onChange, options, variant = "chip", className }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const tabStop = selectedIndex >= 0 ? selectedIndex : 0;

  const select = (index: number) => {
    const next = (index + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const keys: Record<string, number> = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: options.length - 1 };
    if (!(event.key in keys)) return;
    event.preventDefault();
    select(keys[event.key]);
  };

  return (
    <div role="radiogroup" aria-label={label} className={cx("flex flex-wrap gap-2", className)}>
      {options.map((option, index) => {
        const selected = option.value === value;
        const dim = option.available === false && !selected;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={index === tabStop ? 0 : -1}
            title={variant === "swatch" ? option.value : undefined}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={
              variant === "swatch"
                ? cx(
                    "relative grid size-swatch place-items-center rounded-control bg-white p-1 transition-shadow duration-200",
                    selected ? "ring-2 ring-ink" : "ring-1 ring-line hover:ring-ink/40",
                    dim && "opacity-60",
                  )
                : cx(
                    "min-h-11 rounded-control px-3.5 py-2 text-left text-[14px] leading-snug transition-shadow duration-200",
                    selected ? "bg-white font-semibold ring-2 ring-ink" : "ring-1 ring-line-strong hover:ring-ink/50",
                    dim ? "bg-mist text-muted" : !selected && "bg-white",
                  )
            }
          >
            {variant === "swatch" ? (
              <>
                <span className="size-full rounded-thumb ring-1 ring-black/10 ring-inset" style={{ background: option.color }} />
                <span className="sr-only">{option.label ?? option.value}</span>
                {selected && (
                  <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-ink text-white">
                    <IconCheck className="size-3.5" strokeWidth={2.6} />
                  </span>
                )}
              </>
            ) : (
              (option.label ?? option.value)
            )}
          </button>
        );
      })}
    </div>
  );
}
