"use client";

import { useState } from "react";

export default function Faq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="divide-y divide-line">
      {items.map((item, i) => {
        const active = open === i;
        return (
          <div key={item.q} className={`rounded-card transition-all duration-500 ease-button ${active ? "border-transparent bg-white shadow-[0_3px_45px_rgba(0,0,0,0.08)]" : ""}`}>
            <button type="button" aria-expanded={active} onClick={() => setOpen(active ? -1 : i)} className="flex w-full items-center justify-between gap-6 px-7 py-6 text-left">
              <span className="text-xl font-medium md:text-2xl">{item.q}</span>
              <span className={`grid size-8 shrink-0 place-items-center rounded-full border-2 border-ink transition-transform duration-300 ${active ? "rotate-180" : ""}`}>
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.6} aria-hidden>
                  <path d="M5 12h14" />
                  {!active && <path d="M12 5v14" />}
                </svg>
              </span>
            </button>
            <div className={`grid transition-all duration-500 ease-button ${active ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <p className="overflow-hidden px-7 text-[15px] leading-relaxed text-ink/75">
                <span className="block pb-7">{item.a}</span>
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
