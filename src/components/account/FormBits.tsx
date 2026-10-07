"use client";

import { useId, type ReactNode } from "react";
import { TextField } from "@/components/ui/TextField";
import { cx } from "@/components/ui/cx";
import { UFS } from "@/lib/api/validation";

/** Mensagem do formulário: erro (role=alert), sucesso ou aviso (role=status). */
export function FormAlert({ tone = "error", children, className }: { tone?: "error" | "success" | "info"; children: ReactNode; className?: string }) {
  const tones = {
    error: "bg-coral-50 text-coral-700",
    success: "bg-lime-50 text-ink",
    info: "bg-sun-50 text-ink",
  } as const;
  return (
    <p role={tone === "error" ? "alert" : "status"} className={cx("rounded-thumb p-3 text-sm font-semibold", tones[tone], className)}>
      {children}
    </p>
  );
}

/** Campo de senha com "Mostrar senha" (checkbox acessível, sem ícone escondido). */
export function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  hint,
  error,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle?: (show: boolean) => void;
  autoComplete: "current-password" | "new-password";
  hint?: string;
  error?: string | null;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <TextField label={label} type={show ? "text" : "password"} value={value} onChange={onChange} autoComplete={autoComplete} hint={hint} error={error} spellCheck={false} autoCapitalize="none" />
      {onToggle && (
        <label htmlFor={id} className="mt-2 inline-flex items-center gap-2 text-caption">
          <input id={id} type="checkbox" checked={show} onChange={(event) => onToggle(event.target.checked)} className="size-4 accent-ink" />
          Mostrar senha
        </label>
      )}
    </div>
  );
}

/** UF em lista (mesma altura do TextField). */
export function UfSelect({ value, onChange, error, className }: { value: string; onChange: (value: string) => void; error?: string | null; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[15px] font-bold">
        UF
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="address-level1"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-erro` : undefined}
        className={cx("h-[62px] w-full rounded-control border bg-white px-4 text-body transition-colors focus:border-ink", error ? "border-coral-700" : "border-line")}
      >
        <option value="">—</option>
        {UFS.map((uf) => (
          <option key={uf} value={uf}>
            {uf}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${id}-erro`} role="alert" className="mt-1.5 text-caption font-semibold text-coral-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** Bloco de formulário com título (seções do cadastro e da conta). */
export function FormSection({ title, description, children, className }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cx("min-w-0", className)}>
      <legend className="text-lg font-bold">{title}</legend>
      {description && <p className="mt-1 text-caption text-muted">{description}</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-2">{children}</div>
    </fieldset>
  );
}
