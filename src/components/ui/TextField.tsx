"use client";

import { useId, type InputHTMLAttributes } from "react";
import { cx } from "./cx";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className"> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Dica abaixo do campo. */
  hint?: string;
  error?: string | null;
  className?: string;
};

/** Campo de texto com contador "(usados|máximo)" quando há maxLength, como no personalizador da Tapz. */
export function TextField({ label, value, onChange, hint, error, maxLength, id, className, ...rest }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-dica`;
  const errorId = `${inputId}-erro`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1.5 flex items-baseline justify-between gap-3 text-[15px] font-bold">
        <span>{label}</span>
        {maxLength ? (
          <span className="text-caption font-normal tabular-nums text-muted" aria-hidden>
            ({value.length}|{maxLength})
          </span>
        ) : null}
      </label>
      <input
        {...rest}
        id={inputId}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          "h-[62px] w-full rounded-control border bg-white px-[18px] text-body transition-colors placeholder:text-muted focus:border-ink",
          error ? "border-coral-700" : "border-line",
        )}
      />
      {hint && (
        <p id={hintId} className="mt-1.5 text-caption text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-caption font-semibold text-coral-700">
          {error}
        </p>
      )}
    </div>
  );
}
