"use client";

import { Children, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { usePrefersReducedMotion } from "@/components/ui/useMediaQuery";
import { IconeSeta } from "./icones";

/*
 * Trilho de produtos do "Mais vendidos" (Figma): cinco cards por vez no computador e a seta ">" do Figma (quadrado
 * arredondado de 34 px) logo depois do último card, centrada na altura da foto; depois de avançar aparece a seta de
 * voltar do outro lado. Rolagem nativa com encaixe, sem rolar sozinho. Abaixo de 768 px e em telas de toque o trilho
 * mostra um pedaço do card seguinte e as setas somem (arrasta com o dedo), como no carrossel do topo.
 * O meio da foto vem da largura do trilho (unidade cqw): card = (100% − vãos) ÷ n, foto 3:4, meio = card × 2/3, mais
 * os 4 px do p-1 (folga para o contorno de foco não ser cortado pela rolagem; o -mx-1 devolve a largura).
 */

export default function TrilhoProdutos({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  const trilho = useRef<HTMLUListElement>(null);
  const anterior = useRef<HTMLButtonElement>(null);
  const proximo = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [inicio, setInicio] = useState(true);
  const [fim, setFim] = useState(false);
  const reduzir = usePrefersReducedMotion();
  const itens = Children.toArray(children);

  const medir = (el: HTMLElement) => {
    const noInicio = el.scrollLeft < 8;
    const noFim = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
    // A seta que chega ao fim some (aria-hidden + tabindex -1): antes disso o foco passa para a seta do outro lado
    // (ou para a lista, se as duas somem), para nunca ficar num elemento escondido.
    const foco = document.activeElement;
    if (noFim && foco === proximo.current) (noInicio ? el : anterior.current)?.focus({ preventScroll: true });
    if (noInicio && foco === anterior.current) (noFim ? el : proximo.current)?.focus({ preventScroll: true });
    setInicio(noInicio);
    setFim(noFim);
  };

  // O ResizeObserver avisa assim que começa a observar e a cada mudança de largura.
  useEffect(() => {
    const el = trilho.current;
    if (!el) return;
    const observador = new ResizeObserver(() => medir(el));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const andar = (sentido: 1 | -1) => {
    const el = trilho.current;
    if (el) el.scrollBy({ left: sentido * el.clientWidth, behavior: reduzir ? "auto" : "smooth" });
  };

  const seta = cx(
    "absolute z-10 hidden size-11 -translate-y-1/2 place-items-center rounded-[14px] bg-white/85 text-subtle transition-[opacity,color] hover:text-muted md:[@media(hover:hover)]:grid xl:bg-transparent",
    "md:top-[calc((100cqw-42px)/4*2/3+4px)] lg:top-[calc((100cqw-56px)/5*2/3+4px)]",
  );

  return (
    <div className="@container relative">
      <ul
        id={id}
        ref={trilho}
        aria-label={rotulo}
        tabIndex={-1}
        onScroll={(e) => medir(e.currentTarget)}
        className="no-scrollbar -mx-1 flex snap-x snap-mandatory scroll-px-1 gap-[14px] overflow-x-auto overscroll-x-contain p-1 motion-safe:scroll-smooth"
      >
        {itens.map((item, i) => (
          <li key={i} className="w-[44%] shrink-0 snap-start sm:w-[30%] md:w-[calc((100%-42px)/4)] lg:w-[calc((100%-56px)/5)]">
            {item}
          </li>
        ))}
      </ul>
      <button
        ref={anterior}
        type="button"
        onClick={() => andar(-1)}
        aria-label="Produtos anteriores"
        aria-controls={id}
        aria-hidden={inicio || undefined}
        tabIndex={inicio ? -1 : undefined}
        className={cx(seta, "left-1 xl:-left-[45px]", inicio ? "pointer-events-none opacity-0" : "opacity-100")}
      >
        <IconeSeta className="size-[34px] rotate-180" />
      </button>
      <button
        ref={proximo}
        type="button"
        onClick={() => andar(1)}
        aria-label="Próximos produtos"
        aria-controls={id}
        aria-hidden={fim || undefined}
        tabIndex={fim ? -1 : undefined}
        className={cx(seta, "right-1 xl:-right-[45px]", fim ? "pointer-events-none opacity-0" : "opacity-100")}
      >
        <IconeSeta className="size-[34px]" />
      </button>
    </div>
  );
}
