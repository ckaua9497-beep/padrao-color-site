import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

/*
 * Peças do admin da multiloja ("mesa de produção" da Padrão): folhas brancas sobre o fundo cinza-papel, com um anel
 * de 1px e sombra quase invisível (`shadow-sheet`; a única estratégia de profundidade do admin). Hierarquia por peso
 * e cor antes de tamanho: rótulo 12/600 cinza, valor 24/800 preto, título de página 28/900.
 */

/** Cabeçalho de cada página: grupo do menu, título, explicação curta e ações à direita. */
export function PageHeader({ group, title, description, actions, back }: { group?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0 max-w-3xl">
        {back ? (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-[13px] font-semibold text-muted underline-offset-4 hover:text-ink hover:underline">
            <span aria-hidden>←</span> {back.label}
          </Link>
        ) : (
          group && <p className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-muted">{group}</p>
        )}
        <h1 className="text-[28px] font-black leading-[1.15] tracking-[-0.015em] text-balance">{title}</h1>
        {description && <div className="mt-1.5 text-[15px] text-muted text-pretty">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Folha (bloco de conteúdo). Com `flush`, o conteúdo encosta nas bordas (tabelas e listas). */
export function Sheet({ title, description, actions, children, flush = false, id, className }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; id?: string; className?: string }) {
  const heading = title ? (
    <div className={cx("flex flex-wrap items-start justify-between gap-x-4 gap-y-2", flush ? "border-b border-line px-5 py-4" : "mb-4")}>
      <div className="min-w-0">
        <h2 id={id} className="text-[16px] font-bold leading-snug">
          {title}
        </h2>
        {description && <div className="mt-0.5 text-[13px] leading-snug text-muted text-pretty">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 text-[14px]">{actions}</div>}
    </div>
  ) : null;
  return (
    <section aria-labelledby={title ? id : undefined} className={cx("rounded-card bg-white shadow-sheet", !flush && "p-5", className)}>
      {heading}
      {children}
    </section>
  );
}

export type Kpi = { label: string; value: string; hint?: ReactNode; hero?: boolean };

const KPI_COLS = { 4: "md:grid-cols-4", 6: "md:grid-cols-3 xl:grid-cols-6" } as const;

/**
 * Faixa de indicadores numa folha só, separados por linhas finas (não uma grade de cartões iguais). `cols` é o total
 * de colunas na tela larga (o destaque ocupa duas): os itens devem preencher a linha.
 */
export function KpiStrip({ items, cols = 6, className }: { items: Kpi[]; cols?: keyof typeof KPI_COLS; className?: string }) {
  return (
    <dl className={cx("grid grid-cols-2 gap-px overflow-hidden rounded-card bg-line shadow-sheet", KPI_COLS[cols], className)}>
      {items.map((k) => (
        <div key={k.label} className={cx("bg-white px-5 py-4", k.hero && "col-span-2")}>
          <dt className="text-[12px] font-semibold text-muted">{k.label}</dt>
          <dd className={cx("mt-1 font-extrabold leading-none tracking-[-0.01em] tabular-nums", k.hero ? "text-[32px]" : "text-[24px]")}>{k.value}</dd>
          {k.hint && <dd className="mt-1.5 text-[12px] leading-snug text-muted">{k.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Estado vazio dentro de uma folha. */
export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("px-5 py-8 text-center text-[14px] text-muted", className)}>{children}</p>;
}

/** Ponto de situação (com texto ao lado: a cor nunca vai sozinha). */
export function Dot({ tone }: { tone: "ok" | "warn" | "off" }) {
  return <span aria-hidden className={cx("inline-block size-2 shrink-0 rounded-full", tone === "ok" ? "bg-lime-700" : tone === "warn" ? "bg-coral" : "bg-line-strong")} />;
}

/** Selo pequeno de situação (loja fora do ar, bloqueada, domínio…). */
export function Tag({ tone = "neutral", children }: { tone?: "neutral" | "warn" | "ok"; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold", tone === "warn" ? "bg-coral-50 text-coral-700" : tone === "ok" ? "bg-lime-50 text-ink" : "bg-mist text-muted")}>
      {children}
    </span>
  );
}

/** Classes da tabela do admin (cabeçalho discreto, linhas com respiro, números alinhados). */
export const table = {
  wrap: "relative overflow-x-auto",
  table: "w-full text-left text-[14px]",
  head: "border-b border-line text-[12px] font-semibold text-muted",
  th: "px-5 py-2.5 font-semibold whitespace-nowrap",
  body: "divide-y divide-line",
  row: "transition-colors hover:bg-page-checkout",
  td: "px-5 py-3 align-middle",
  num: "px-5 py-3 text-right align-middle tabular-nums whitespace-nowrap",
};

/** Campo dos filtros (busca, selects) no tamanho do admin. */
export const control = "h-10 rounded-control border border-line bg-white px-3.5 text-[14px] outline-none transition-colors focus-visible:border-ink";
