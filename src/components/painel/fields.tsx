import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { cx } from "@/components/ui/cx";

/*
 * Campos dos formulários do painel (Server Actions: não controlados, com name e defaultValue). Mesmo visual
 * do TextField do site, com rótulo, dica e erro ligados por aria-describedby.
 */

type Common = { label: string; name: string; hint?: ReactNode; error?: string; className?: string };

const control = "w-full rounded-control border bg-white px-4 text-body transition-colors placeholder:text-muted focus:border-ink";

function Described({ id, hint, error }: { id: string; hint?: ReactNode; error?: string }) {
  return (
    <>
      {hint && (
        <p id={`${id}-dica`} className="mt-1.5 text-caption text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-erro`} className="mt-1.5 text-caption font-semibold text-coral-700">
          {error}
        </p>
      )}
    </>
  );
}

const describedBy = (id: string, hint?: ReactNode, error?: string) => [hint && `${id}-dica`, error && `${id}-erro`].filter(Boolean).join(" ") || undefined;

export function Field({ label, name, hint, error, className, id, ...rest }: Common & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "className">) {
  const fieldId = id ?? `campo-${name}`;
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="mb-1.5 block text-[15px] font-bold">
        {label}
      </label>
      <input {...rest} id={fieldId} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy(fieldId, hint, error)} className={cx(control, "h-12", error ? "border-coral-700" : "border-line")} />
      <Described id={fieldId} hint={hint} error={error} />
    </div>
  );
}

export function TextArea({ label, name, hint, error, className, id, ...rest }: Common & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "name" | "className">) {
  const fieldId = id ?? `campo-${name}`;
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="mb-1.5 block text-[15px] font-bold">
        {label}
      </label>
      <textarea {...rest} id={fieldId} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy(fieldId, hint, error)} className={cx(control, "py-3", error ? "border-coral-700" : "border-line")} />
      <Described id={fieldId} hint={hint} error={error} />
    </div>
  );
}

/** Mensagem de retorno do formulário (sucesso ou erro), anunciada para leitores de tela. */
export function FormMessage({ state }: { state: { ok?: boolean; message?: string } | null }) {
  if (!state?.message) return <p role="status" className="sr-only" />;
  return (
    <p role={state.ok ? "status" : "alert"} className={cx("rounded-control px-4 py-3 text-[15px] font-semibold", state.ok ? "bg-lime-50 text-ink" : "bg-coral-50 text-coral-700")}>
      {state.message}
    </p>
  );
}

/** Bloco com título do painel. */
export function Panel({ title, description, children, className, id }: { title: string; description?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={id} className={cx("rounded-panel bg-white p-5 shadow-card md:p-7", className)}>
      <h2 id={id} className="text-xl font-bold">
        {title}
      </h2>
      {description && <p className="mt-1 text-[15px] text-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
