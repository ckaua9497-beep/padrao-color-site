"use client";

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

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

export function Arrow({ dir, onClick, className = "" }: { dir: "prev" | "next"; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === "prev" ? "Anterior" : "Próximo"}
      className={`grid size-11 place-items-center rounded-full bg-white text-ink shadow-float transition-transform duration-300 ease-button hover:scale-110 ${className}`}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {dir === "prev" ? <path d="M19 12H5m6-6-6 6 6 6" /> : <path d="M5 12h14m-6-6 6 6-6 6" />}
      </svg>
    </button>
  );
}

export default function Rail({ children, itemClassName = "", className = "", arrows = "overlay", dots = false, autoplay, label, gapClassName = "gap-4" }: RailProps) {
  const track = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const paused = useRef(false);
  const items = Children.toArray(children);

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

  const go = useCallback((dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
    if (dir === 1 && end) el.scrollTo({ left: 0, behavior: "smooth" });
    else el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!autoplay) return;
    const id = window.setInterval(() => {
      if (!paused.current && document.visibilityState === "visible") go(1);
    }, autoplay);
    return () => window.clearInterval(id);
  }, [autoplay, go]);

  return (
    <div
      className={`relative ${className}`}
      role="region"
      aria-roledescription="carrossel"
      aria-label={label}
      onPointerEnter={() => (paused.current = true)}
      onPointerLeave={() => (paused.current = false)}
      onFocusCapture={() => (paused.current = true)}
    >
      <div ref={track} onScroll={measure} className={`no-scrollbar flex snap-x snap-mandatory overflow-x-auto scroll-smooth py-2 ${gapClassName}`}>
        {items.map((child, i) => (
          <div key={i} className={`shrink-0 snap-start ${itemClassName}`}>
            {child}
          </div>
        ))}
      </div>
      {arrows === "overlay" && pages > 1 && (
        <>
          <Arrow dir="prev" onClick={() => go(-1)} className={`absolute left-2 top-1/2 z-10 -translate-y-1/2 transition-opacity ${atStart ? "pointer-events-none opacity-0" : "opacity-100"}`} />
          <Arrow dir="next" onClick={() => go(1)} className={`absolute right-2 top-1/2 z-10 -translate-y-1/2 transition-opacity ${atEnd && !autoplay ? "pointer-events-none opacity-0" : "opacity-100"}`} />
        </>
      )}
      {dots && pages > 1 && (
        <div className="mt-5 flex justify-center gap-2.5">
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ir para o grupo ${i + 1}`}
              onClick={() => track.current?.scrollTo({ left: i * (track.current?.clientWidth ?? 0), behavior: "smooth" })}
              className={`size-2.5 rounded-full border-2 transition-all duration-300 ${i === page ? "scale-125 border-ink bg-transparent" : "border-transparent bg-ink/30"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
