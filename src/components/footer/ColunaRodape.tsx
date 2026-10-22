"use client";

import { useId, useState, type ReactNode } from "react";
import { IconChevron } from "@/components/icons";
import { cx } from "@/components/ui/cx";

/**
 * Coluna de links do rodapé. Do tablet para cima, título e lista sempre à vista (como no Figma); no celular vira
 * sanfona, com o título num botão de 48 px, para o rodapé não virar uma lista de 20 links empilhados.
 * A lista começa recolhida só no celular, resolvido por CSS (sem salto na hidratação).
 */
export default function ColunaRodape({ titulo, children }: { titulo: string; children: ReactNode }) {
  const [aberta, setAberta] = useState(false);
  const id = useId();
  return (
    <nav aria-label={titulo} className="border-b border-line md:border-0">
      <h2 className="text-[15px] font-semibold leading-5 text-ink">
        <span className="hidden md:block">{titulo}</span>
        <button
          type="button"
          aria-expanded={aberta}
          aria-controls={id}
          onClick={() => setAberta((v) => !v)}
          className="flex min-h-12 w-full items-center justify-between gap-3 text-left md:hidden"
        >
          {titulo}
          <IconChevron aria-hidden className={cx("size-5 text-muted transition-transform duration-300 motion-reduce:transition-none", aberta && "rotate-180")} />
        </button>
      </h2>
      <div id={id} className={cx(aberta ? "block pb-3" : "hidden", "md:mt-3 md:block md:pb-0")}>
        {children}
      </div>
    </nav>
  );
}
