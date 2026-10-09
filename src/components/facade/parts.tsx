"use client";

import { useId, type ReactNode } from "react";
import { IconCheck } from "@/components/icons";
import { cx } from "@/components/ui/cx";
import { IconAlert } from "./icons";

/** Título numerado de cada passo do simulador. */
export function StepTitle({ n, id, hint, children }: { n: number; id?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <h3 id={id} className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[17px] font-bold">
      <span aria-hidden className="grid size-6 place-items-center rounded-full bg-ink text-[12px] text-white">
        {n}
      </span>
      {children}
      {hint && (
        <span className="w-full pl-8 text-caption font-normal text-muted sm:w-auto sm:pl-0">
          <span aria-hidden className="hidden sm:inline">· </span>
          {hint}
        </span>
      )}
    </h3>
  );
}

type NoticeTone = "info" | "ok" | "warn" | "error";

const TONES: Record<NoticeTone, string> = {
  info: "bg-mist text-ink",
  ok: "bg-lime-50 text-ink",
  warn: "bg-sun-50 text-ink",
  error: "bg-coral-50 font-semibold text-coral-700",
};

/** Aviso curto dentro de um passo. `role` = "alert" para erros que o leitor de tela deve anunciar. */
export function Notice({ tone = "info", role, className, children }: { tone?: NoticeTone; role?: "alert" | "status"; className?: string; children: ReactNode }) {
  return (
    <div role={role} className={cx("flex items-start gap-2.5 rounded-control px-3.5 py-3 text-sm leading-snug", TONES[tone], className)}>
      {tone === "ok" ? (
        <IconCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-lime-700" strokeWidth={2.4} />
      ) : tone === "info" ? null : (
        <IconAlert aria-hidden className={cx("mt-0.5 size-4 shrink-0", tone === "error" ? "text-coral-700" : "text-ink")} />
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Controle deslizante com rótulo e valor; a faixa tem 44 px de altura para o toque. */
export function RangeField({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="grid">
      <label htmlFor={id} className="flex items-baseline justify-between gap-3 text-sm font-semibold">
        {label}
        <span className="font-normal tabular-nums text-muted">{format(value)}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 w-full accent-ink"
      />
    </div>
  );
}
