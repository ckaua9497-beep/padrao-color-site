"use client";

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import { cx } from "@/components/ui/cx";

type RailProps = {
  children: ReactNode;
  itemClassName?: string;
  className?: string;
  arrows?: "overlay" | "none";
  dots?: boolean;
  autoplay?: number;
  label: string;
  gapClassName?: string;
};

export function Arrow({ dir, onClick, className = "", hidden = false }: { dir: "prev" | "next"; onClick: () => void; className?: string; hidden?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === "prev" ? "Anterior" : "Próximo"}
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      className={cx("grid size-11 place-items-center rounded-full bg-white text-ink shadow-float transition-transform duration-300 ease-button hover:scale-110", className)}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {dir === "prev" ? <path d="M19 12H5m6-6-6 6 6 6" /> : <path d="M5 12h14m-6-6 6 6-6 6" />}
      </svg>
    </button>
  );
}

/** Botão de pausar/retomar o autoplay (carrossel que anda sozinho precisa de controle — WCAG 2.2.2). */
export function PauseButton({ paused, onToggle, className }: { paused: boolean; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={paused ? "Retomar rotação automática" : "Pausar rotação automática"}
      className={cx("grid size-8 place-items-center rounded-full bg-white/80 text-ink transition-colors hover:bg-white", className)}
    >
      <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
        {paused ? <path d="M7 5v14l12-7z" /> : <path d="M7 5h3v14H7zM14 5h3v14h-3z" />}
      </svg>
    </button>
  );
}

/** Bolinha de navegação com área de toque de 24 px. */
export function Dot({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} aria-current={active || undefined} onClick={onClick} className="grid size-6 place-items-center">
      <span className={cx("block rounded-full transition-all duration-300", active ? "size-2.5 scale-125 border-2 border-ink" : "size-2.5 bg-ink/30")} />
    </button>
  );
}

export default function Rail({ children, itemClassName = "", className = "", arrows = "overlay", dots = false, autoplay, label, gapClassName = "gap-4" }: RailProps) {
  const track = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [stopped, setStopped] = useState(false);
  const hovering = useRef(false);
  const focused = useRef(false);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const items = Children.toArray(children);
  const autoplays = Boolean(autoplay) && !reducedMotion;

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const total = Math.max(1, Math.ceil(el.scrollWidth / el.clientWidth - 0.05));
    setPages(total);
    setPage(Math.round(el.scrollLeft / el.clientWidth));
    setAtStart(el.scrollLeft < 8);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    measure();
    const el = track.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, items.length]);

  const behavior: ScrollBehavior = reducedMotion ? "auto" : "smooth";

  const go = useCallback(
    (dir: 1 | -1) => {
      const el = track.current;
      if (!el) return;
      const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
      if (dir === 1 && end) el.scrollTo({ left: 0, behavior });
      else el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior });
    },
    [behavior],
  );

  useEffect(() => {
    if (!autoplays || stopped) return;
    const id = window.setInterval(() => {
      if (!hovering.current && !focused.current && document.visibilityState === "visible") go(1);
    }, autoplay);
    return () => window.clearInterval(id);
  }, [autoplays, autoplay, stopped, go]);

  return (
    <div
      className={cx("relative", className)}
      role="region"
      aria-roledescription="carrossel"
      aria-label={label}
      onPointerEnter={() => (hovering.current = true)}
      onPointerLeave={() => (hovering.current = false)}
      onFocusCapture={() => (focused.current = true)}
      onBlurCapture={(event) => {
        // Retoma quando o foco sai do carrossel.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) focused.current = false;
      }}
    >
      <div ref={track} onScroll={measure} className={cx("no-scrollbar flex snap-x snap-mandatory overflow-x-auto py-2 motion-safe:scroll-smooth", gapClassName)}>
        {items.map((child, i) => (
          <div key={i} className={cx("shrink-0 snap-start", itemClassName)}>
            {child}
          </div>
        ))}
      </div>
      {arrows === "overlay" && pages > 1 && (
        <>
          <Arrow dir="prev" hidden={atStart} onClick={() => go(-1)} className={cx("absolute left-2 top-1/2 z-10 -translate-y-1/2 transition-opacity", atStart ? "pointer-events-none opacity-0" : "opacity-100")} />
          <Arrow
            dir="next"
            hidden={atEnd && !autoplays}
            onClick={() => go(1)}
            className={cx("absolute right-2 top-1/2 z-10 -translate-y-1/2 transition-opacity", atEnd && !autoplays ? "pointer-events-none opacity-0" : "opacity-100")}
          />
        </>
      )}
      {dots && pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-1">
          {Array.from({ length: pages }, (_, i) => (
            <Dot key={i} active={i === page} label={`Ir para o grupo ${i + 1}`} onClick={() => track.current?.scrollTo({ left: i * (track.current?.clientWidth ?? 0), behavior })} />
          ))}
          {autoplays && <PauseButton paused={stopped} onToggle={() => setStopped((v) => !v)} className="ml-2 bg-transparent ring-1 ring-line-strong" />}
        </div>
      )}
    </div>
  );
}
