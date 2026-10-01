import type { ReactNode } from "react";
import { cx } from "./cx";

type Props<T extends string> = {
  /** Nome acessível do grupo. */
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  tone?: "light" | "dark";
  className?: string;
};

/** Botões alternáveis (aria-pressed) dentro de uma pílula: abas de visualização, filtros curtos. */
export function SegmentedControl<T extends string>({ label, value, onChange, options, tone = "light", className }: Props<T>) {
  const dark = tone === "dark";
  return (
    <div role="group" aria-label={label} className={cx("inline-flex flex-wrap gap-1 rounded-full p-1", dark ? "bg-white/10 on-dark" : "bg-mist", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cx(
              "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-200",
              active ? (dark ? "bg-white text-ink" : "bg-ink text-white") : dark ? "text-white/80 hover:text-white" : "text-ink/70 hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
