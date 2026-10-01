"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui/cx";

export type DsSectionLink = { id: string; label: string; count?: number };

/**
 * Navegação da página do design system: `rail` é a coluna fixa ao lado do conteúdo (desktop) e `bar`,
 * a faixa fixa no topo com rolagem horizontal (celular). Marca a seção visível com `aria-current`.
 */
export function DsNav({ sections, variant }: { sections: DsSectionLink[]; variant: "bar" | "rail" }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sections.length === 0) return;
    let frame = 0;
    // A seção ativa é a última cujo topo já passou de 30% da tela; no fim da página, a última seção.
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.3;
      let current = sections[0].id;
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= line) current = s.id;
      }
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atEnd && window.scrollY > 0) current = sections[sections.length - 1].id;
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [sections]);

  // Na faixa do celular, mantém o chip ativo à vista (rolagem só horizontal, sem mexer na página).
  useEffect(() => {
    const el = track.current;
    if (variant !== "bar" || !el) return;
    const chip = el.querySelector<HTMLElement>('[aria-current="location"]');
    if (!chip) return;
    const left = chip.offsetLeft - (el.clientWidth - chip.offsetWidth) / 2;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: Math.max(0, left), behavior: reduced ? "auto" : "smooth" });
  }, [active, variant]);

  const link = (s: DsSectionLink, compact: boolean) => {
    const current = s.id === active;
    return (
      <a
        key={s.id}
        href={`#${s.id}`}
        aria-current={current ? "location" : undefined}
        className={cx(
          "group flex items-center justify-between gap-3 rounded-full font-semibold transition-colors duration-200 motion-reduce:transition-none",
          compact ? "min-h-9 shrink-0 px-3.5 text-sm" : "min-h-10 px-4 text-[15px]",
          current ? "bg-ink text-white" : "text-ink/70 hover:bg-mist hover:text-ink",
        )}
      >
        <span>{s.label}</span>
        {!compact && s.count !== undefined && (
          <span className={cx("text-micro tabular-nums", current ? "text-white/70" : "text-muted")}>{s.count}</span>
        )}
      </a>
    );
  };

  if (variant === "bar") {
    return (
      <nav aria-label="Seções do design system" className="sticky top-0 z-float -mx-5 mb-8 border-b border-line bg-white/90 px-5 py-2.5 backdrop-blur md:-mx-10 md:px-10 lg:hidden">
        <div ref={track} className="no-scrollbar flex gap-1 overflow-x-auto">
          {sections.map((s) => link(s, true))}
        </div>
      </nav>
    );
  }
  return (
    <nav aria-label="Seções do design system" className="sticky top-8 hidden self-start lg:block">
      <p className="mb-3 px-4 text-micro font-bold uppercase tracking-[0.2em] text-muted">Nesta página</p>
      <div className="flex flex-col gap-0.5">{sections.map((s) => link(s, false))}</div>
    </nav>
  );
}
