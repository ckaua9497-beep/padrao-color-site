"use client";

import { useId, type ReactNode } from "react";
import { IconChevron } from "@/components/icons";
import { cx } from "./cx";

type Props = {
  title: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** Classes do botão (tamanho e peso do título). */
  buttonClassName?: string;
  /** Ícone à direita: seta (padrão) ou + / − como no FAQ da Tapz. */
  icon?: "chevron" | "plus";
  className?: string;
};

/**
 * Item de acordeão. Fechado, o conteúdo fica `inert`: some do Tab e dos leitores de tela,
 * mas continua no DOM para animar a altura.
 */
export function AccordionItem({ title, open, onToggle, children, buttonClassName, icon = "chevron", className }: Props) {
  const id = useId();
  return (
    <div className={className}>
      <button type="button" id={`${id}-botao`} aria-expanded={open} aria-controls={`${id}-painel`} onClick={onToggle} className={cx("flex w-full items-center justify-between gap-4 text-left", buttonClassName)}>
        <span>{title}</span>
        {icon === "chevron" ? (
          <IconChevron aria-hidden className={cx("size-5 shrink-0 transition-transform duration-300", open && "rotate-180")} />
        ) : (
          <span aria-hidden className="relative grid size-8 shrink-0 place-items-center rounded-full bg-current/10">
            <span className="absolute h-0.5 w-3 rounded-full bg-current" />
            <span className={cx("absolute h-3 w-0.5 rounded-full bg-current transition-transform duration-150", open && "scale-y-0")} />
          </span>
        )}
      </button>
      <div
        id={`${id}-painel`}
        role="region"
        aria-labelledby={`${id}-botao`}
        inert={!open}
        className={cx("grid transition-[grid-template-rows] duration-500 ease-button motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
