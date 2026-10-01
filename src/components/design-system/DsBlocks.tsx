import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { formatRatio, grade, type Grade } from "./tokens";

/** Seção numerada da página do design system, com âncora para a navegação fixa. */
export function DsSection({ id, index, eyebrow, title, intro, children, className }: { id: string; index: number; eyebrow: string; title: string; intro?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className={cx("scroll-mt-20 border-t border-line pt-14 pb-6 first:border-0 first:pt-0 lg:scroll-mt-8", className)}>
      <div className="flex items-baseline gap-4">
        <span aria-hidden className="text-sm font-bold tabular-nums text-subtle">
          {String(index).padStart(2, "0")}
        </span>
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral-700">{eyebrow}</p>
      </div>
      <h2 id={`${id}-titulo`} className="mt-3 text-section font-bold">
        {title}
      </h2>
      {intro && <div className="mt-3 max-w-3xl text-lead text-muted">{intro}</div>}
      <div className="mt-10">{children}</div>
    </section>
  );
}

/** Cartão de amostra de componente: nome, import, demo e notas de uso. */
export function Specimen({ name, source, children, notes, tone = "light", className }: { name: string; source: string; children: ReactNode; notes?: ReactNode; tone?: "light" | "mist" | "dark"; className?: string }) {
  return (
    <article className={cx("overflow-hidden rounded-panel border border-line bg-white", className)}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-3.5">
        <h3 className="text-lg font-bold">{name}</h3>
        <code className="text-caption text-muted">{source}</code>
      </header>
      <div className={cx("p-5 md:p-7", tone === "mist" && "bg-mist", tone === "dark" && "on-dark bg-ink text-white")}>{children}</div>
      {notes && <div className="border-t border-line bg-page-cart px-5 py-3 text-caption text-muted">{notes}</div>}
    </article>
  );
}

const GRADE_TONE: Record<Grade, string> = {
  AAA: "bg-ink text-white",
  AA: "bg-ink text-white",
  "AA grande": "bg-sun-50 text-ink ring-1 ring-amber/60 ring-inset",
  Falha: "bg-coral-50 text-coral-700 ring-1 ring-coral-700/30 ring-inset",
};

/** Selo com a razão de contraste e o nível WCAG atingido. */
export function ContrastBadge({ ratio, compact = false }: { ratio: number; compact?: boolean }) {
  const level = grade(ratio);
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full font-bold tabular-nums", compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-micro", GRADE_TONE[level])}>
      {formatRatio(ratio)}
      <span className="font-semibold opacity-80">{level}</span>
    </span>
  );
}

/** Etiqueta de token em fonte mono. */
export function TokenName({ children, className }: { children: ReactNode; className?: string }) {
  return <code className={cx("rounded-md bg-mist px-1.5 py-0.5 text-[12px] font-semibold text-ink", className)}>{children}</code>;
}
