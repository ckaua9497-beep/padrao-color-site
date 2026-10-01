"use client";

import { useState } from "react";
import { AccordionItem } from "@/components/ui/Accordion";
import { cx } from "@/components/ui/cx";

export default function Faq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="divide-y divide-line">
      {items.map((item, i) => {
        const active = open === i;
        return (
          <AccordionItem
            key={item.q}
            title={<span className="text-xl font-medium md:text-2xl">{item.q}</span>}
            open={active}
            onToggle={() => setOpen(active ? -1 : i)}
            icon="plus"
            buttonClassName="px-7 py-6"
            className={cx("rounded-card transition-[background-color,box-shadow] duration-500 ease-button", active && "bg-white shadow-panel")}
          >
            <p className="px-7 pb-7 text-[15px] leading-relaxed text-ink/75">{item.a}</p>
          </AccordionItem>
        );
      })}
    </div>
  );
}
