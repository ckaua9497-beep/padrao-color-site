"use client";

import Image from "next/image";
import { useId, useRef, useState, type ReactNode } from "react";
import { enviarImagemTema } from "@/app/(painel)/painel/tema-actions";
import { IconClose, IconUpload } from "@/components/icons";
import { cx } from "@/components/ui/cx";

/*
 * Campos do editor "Personalizar loja": compactos (o painel lateral tem 360 px), rótulo em cima, valor controlado.
 * Toda mudança vai direto para o tema (a prévia atualiza na hora; o rascunho salva sozinho).
 */

const input = "w-full rounded-control border border-line bg-white px-3 text-[14px] outline-none transition-colors placeholder:text-subtle focus:border-ink";

export function Rotulo({ htmlFor, children, extra }: { htmlFor?: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className="text-[13px] font-bold">
        {children}
      </label>
      {extra && <span className="text-[12px] text-muted">{extra}</span>}
    </div>
  );
}

export function Texto({ label, value, onChange, max, placeholder, multiline = false, rows = 3, hint }: { label: string; value: string; onChange: (v: string) => void; max: number; placeholder?: string; multiline?: boolean; rows?: number; hint?: string }) {
  const id = useId();
  return (
    <div>
      <Rotulo htmlFor={id} extra={value.length > max * 0.8 ? `${value.length}/${max}` : undefined}>
        {label}
      </Rotulo>
      {multiline ? (
        <textarea id={id} value={value} maxLength={max} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cx(input, "resize-y py-2 leading-relaxed")} />
      ) : (
        <input id={id} value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cx(input, "h-10")} />
      )}
      {hint && <p className="mt-1 text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

export type Opcao<T extends string | number> = { value: T; label: string; icon?: ReactNode };

/** Botões de escolha (até 4 opções curtas); com mais, use Lista. */
export function Escolha<T extends string | number>({ label, value, options, onChange, columns }: { label: string; value: T; options: Opcao<T>[]; onChange: (v: T) => void; columns?: number }) {
  const id = useId();
  return (
    <div role="radiogroup" aria-labelledby={id}>
      <p id={id} className="mb-1.5 text-[13px] font-bold">
        {label}
      </p>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns ?? Math.min(options.length, 4)}, minmax(0, 1fr))` }}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={cx(
                "flex min-h-10 flex-col items-center justify-center gap-1 rounded-control border px-2 py-1.5 text-center text-[12px] font-semibold leading-tight transition-colors",
                active ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink",
              )}
            >
              {o.icon}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Lista<T extends string>({ label, value, options, onChange, hint }: { label: string; value: T; options: Opcao<T>[]; onChange: (v: T) => void; hint?: string }) {
  const id = useId();
  return (
    <div>
      <Rotulo htmlFor={id}>{label}</Rotulo>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} className={cx(input, "h-10")}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="mt-1 text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

export function Chave({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3">
      <label htmlFor={id} className="text-[13px] font-bold leading-snug">
        {label}
        {hint && <span className="block text-[12px] font-normal text-muted">{hint}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx("relative h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-ink" : "bg-line-strong")}
      >
        <span aria-hidden className={cx("absolute top-0.5 size-5 rounded-full bg-white shadow-card transition-[left]", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </div>
  );
}

/** Imagem do tema: envia para o banco e devolve o endereço; mostra a miniatura e deixa remover. */
export function CampoImagem({ label, value, onChange, hint, aspect = "aspect-[16/9]", contain = false }: { label: string; value: string | null; onChange: (url: string | null) => void; hint?: string; aspect?: string; contain?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const send = async (file: File) => {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("imagem", file);
    const res = await enviarImagemTema(form);
    setBusy(false);
    if (res.ok) onChange(res.url);
    else setError(res.message);
  };
  return (
    <div>
      <Rotulo htmlFor={id}>{label}</Rotulo>
      {value ? (
        <div className={cx("group relative overflow-hidden rounded-control border border-line bg-mist", aspect)}>
          <Image src={value} alt="" fill unoptimized className={contain ? "object-contain p-4 pb-12" : "object-cover"} />
          <div className="absolute inset-x-2 bottom-2 flex gap-1.5">
            <button type="button" onClick={() => fileRef.current?.click()} className="h-8 flex-1 rounded-full bg-white/95 text-[12px] font-bold shadow-card hover:bg-white">
              {busy ? "Enviando…" : "Trocar"}
            </button>
            <button type="button" onClick={() => onChange(null)} aria-label="Remover imagem" className="grid size-8 place-items-center rounded-full bg-white/95 shadow-card hover:bg-white">
              <IconClose className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className={cx("flex w-full flex-col items-center justify-center gap-1.5 rounded-control border-2 border-dashed border-line-strong bg-white text-[13px] font-semibold text-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-60", aspect)}
        >
          <IconUpload className="size-5" />
          {busy ? "Enviando…" : "Enviar imagem"}
          <span className="text-[11px] font-normal">PNG, JPG ou WebP, até 5 MB</span>
        </button>
      )}
      <input
        id={id}
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void send(file);
        }}
      />
      {error && <p className="mt-1 text-[12px] font-semibold text-coral-700">{error}</p>}
      {hint && !error && <p className="mt-1 text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

/** Grupo de campos com título (dentro do painel lateral). */
export function Grupo({ titulo, children, acao }: { titulo: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <section className="space-y-3 border-b border-line px-4 py-4 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Itens repetidos (vantagens, depoimentos, perguntas, banners): mover, remover e adicionar. */
export function Itens<T>({ itens, onChange, max, novo, render, rotulo, nomeItem }: { itens: T[]; onChange: (v: T[]) => void; max: number; novo?: () => T; render: (item: T, set: (v: T) => void, i: number) => ReactNode; rotulo: (item: T, i: number) => string; nomeItem: string }) {
  const [open, setOpen] = useState<number | null>(itens.length ? 0 : null);
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= itens.length) return;
    const next = [...itens];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    setOpen(j);
  };
  return (
    <div className="space-y-2">
      {itens.map((item, i) => (
        <div key={i} className="rounded-control border border-line bg-white">
          <div className="flex items-center gap-1 pl-3 pr-1">
            <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="min-w-0 flex-1 truncate py-2.5 text-left text-[13px] font-semibold">
              {rotulo(item, i) || `${nomeItem} ${i + 1}`}
            </button>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Mover para cima" className="grid size-8 place-items-center rounded-full text-muted hover:bg-mist hover:text-ink disabled:opacity-30">
              ↑
            </button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === itens.length - 1} aria-label="Mover para baixo" className="grid size-8 place-items-center rounded-full text-muted hover:bg-mist hover:text-ink disabled:opacity-30">
              ↓
            </button>
            <button type="button" onClick={() => onChange(itens.filter((_, k) => k !== i))} aria-label={`Remover ${nomeItem.toLowerCase()}`} className="grid size-8 place-items-center rounded-full text-muted hover:bg-coral-50 hover:text-coral-700">
              <IconClose className="size-4" />
            </button>
          </div>
          {open === i && <div className="space-y-3 border-t border-line p-3">{render(item, (v) => onChange(itens.map((x, k) => (k === i ? v : x))), i)}</div>}
        </div>
      ))}
      {novo && itens.length < max && (
        <button
          type="button"
          onClick={() => {
            onChange([...itens, novo()]);
            setOpen(itens.length);
          }}
          className="h-9 w-full rounded-control border border-dashed border-line-strong text-[13px] font-bold text-muted hover:border-ink hover:text-ink"
        >
          + Adicionar {nomeItem.toLowerCase()}
        </button>
      )}
    </div>
  );
}
