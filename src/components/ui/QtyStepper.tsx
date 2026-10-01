"use client";

import { useState } from "react";
import { IconMinus, IconPlus } from "@/components/icons";
import { cx } from "./cx";

type Props = {
  value: number;
  onChange: (value: number) => void;
  size?: "sm" | "md";
  label?: string;
  min?: number;
  max?: number;
};

/** Stepper − 1 +. O campo aceita apagar e redigitar; o valor vale ao sair do campo ou com Enter. */
export default function QtyStepper({ value, onChange, size = "md", label = "Quantidade", min = 1, max = 99 }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (text: string) => {
    const next = Number(text.replace(/\D/g, ""));
    onChange(Math.min(max, Math.max(min, next || min)));
    setDraft(null);
  };
  const button = "grid h-full w-10 place-items-center text-muted transition-colors duration-200 hover:text-ink disabled:opacity-40";

  return (
    <div className={cx("inline-flex items-center rounded-control border border-line-strong bg-white", size === "sm" ? "h-9" : "h-13")}>
      <button type="button" aria-label="Diminuir" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} className={button}>
        <IconMinus className="size-4" />
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        value={draft ?? String(value)}
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, "").slice(0, String(max).length))}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit(event.currentTarget.value);
        }}
        className="w-9 bg-transparent text-center text-sm font-semibold tabular-nums"
      />
      <button type="button" aria-label="Aumentar" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} className={button}>
        <IconPlus className="size-4" />
      </button>
    </div>
  );
}
