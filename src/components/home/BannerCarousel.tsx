"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevron } from "@/components/icons";
import { cx } from "@/components/ui/cx";
import type { Banner } from "@/lib/midia";
import { BannerImagem, BannerLink, proporcoes, type Tela } from "./BannerImagem";

/*
 * Carrossel de banners do topo da página inicial (admin → Site → Banners; sem banner salvo, os 5 do Figma). Trilho com
 * rolagem que "encaixa" em cada banner (arrasta no celular), passa sozinho a cada 5 s (como o componente do Figma) e
 * para com o mouse em cima, com foco no teclado, no botão de pausa ou com "reduzir movimento" ligado no sistema.
 * A altura vem da proporção do primeiro banner (16:5 no computador e 4:5 no celular nos banners padrão).
 * Setas brancas nas laterais e bolinhas embaixo, a ativa em laranja, como no Figma; no celular os alvos têm 44 px.
 * As setas só aparecem em aparelhos com mouse e só com o ponteiro em cima do carrossel ou o foco dentro dele: paradas,
 * elas cobriam o título do 1º banner de 768 a 1280 px. No toque elas não existem (arrasta-se o banner).
 * As bolinhas inativas são brancas com contorno escuro translúcido (shadow-ponto): somem menos nos banners claros.
 */

const INTERVALO = 5000;

export default function BannerCarousel({ banners, forcar, className }: { banners: Banner[]; forcar?: Tela; className?: string }) {
  const trilho = useRef<HTMLDivElement>(null);
  const [atual, setAtual] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [parado, setParado] = useState(false);
  const total = banners.length;

  const ir = (i: number) => {
    const el = trilho.current;
    if (el) el.scrollTo({ left: ((i + total) % total) * el.clientWidth, behavior: "smooth" });
  };

  useEffect(() => {
    if (total < 2 || pausado || parado || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      const el = trilho.current;
      if (el) el.scrollTo({ left: ((Math.round(el.scrollLeft / el.clientWidth) + 1) % total) * el.clientWidth, behavior: "smooth" });
    }, INTERVALO);
    return () => window.clearInterval(id);
  }, [total, pausado, parado]);

  if (!total) return null;
  const seta = cx(
    "absolute top-1/2 z-10 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-float hover:bg-white md:[@media(hover:hover)]:grid",
    "opacity-0 transition-[opacity,background-color] group-focus-within/carrossel:opacity-100 group-hover/carrossel:opacity-100 motion-reduce:transition-none",
  );
  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Banners da Padrão Color"
      className={cx("group/carrossel relative", className)}
      onMouseEnter={() => setParado(true)}
      onMouseLeave={() => setParado(false)}
      onFocusCapture={() => setParado(true)}
      onBlurCapture={() => setParado(false)}
    >
      <div
        ref={trilho}
        onScroll={(e) => setAtual(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
        className="flex aspect-(--ar-m) snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] md:aspect-(--ar-d) [&::-webkit-scrollbar]:hidden"
        style={proporcoes(banners[0], forcar)}
      >
        {banners.map((b, i) => (
          <div key={b.id} role="group" aria-roledescription="slide" aria-label={`${i + 1} de ${total}`} inert={i !== atual ? true : undefined} className="relative h-full w-full shrink-0 snap-start">
            <BannerLink banner={b} className="absolute inset-0 block">
              <BannerImagem banner={b} forcar={forcar} sizes="100vw" prioridade={i === 0} className="absolute inset-0 size-full object-cover" />
            </BannerLink>
          </div>
        ))}
      </div>

      {total > 1 && (
        <>
          {forcar !== "mobile" && (
            <>
              <button type="button" onClick={() => ir(atual - 1)} aria-label="Banner anterior" className={cx(seta, "left-3")}>
                <IconChevron className="size-5 rotate-90" />
              </button>
              <button type="button" onClick={() => ir(atual + 1)} aria-label="Próximo banner" className={cx(seta, "right-3")}>
                <IconChevron className="size-5 -rotate-90" />
              </button>
            </>
          )}
          <div className="absolute bottom-0 left-1/2 z-10 flex -translate-x-1/2 items-center md:bottom-1.5">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                onClick={() => ir(i)}
                aria-label={`Banner ${i + 1}: ${b.alt}`}
                aria-current={i === atual ? "true" : undefined}
                className="group grid h-11 w-6 place-items-center md:h-6"
              >
                <span
                  className={cx(
                    "block size-2.5 rounded-full shadow-ponto transition-colors",
                    i === atual ? "bg-coral" : "bg-white group-hover:bg-coral-100",
                  )}
                />
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPausado((v) => !v)}
              aria-label={pausado ? "Continuar a passar os banners" : "Pausar os banners"}
              className="ml-1 grid size-11 place-items-center text-ink md:size-6"
            >
              <span className="grid size-6 place-items-center rounded-full bg-white/90 shadow-ponto md:size-5">
                {pausado ? (
                  <svg viewBox="0 0 24 24" className="size-3" fill="currentColor" aria-hidden>
                    <path d="M8 5.5v13l10-6.5z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="size-3" fill="currentColor" aria-hidden>
                    <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
                  </svg>
                )}
              </span>
            </button>
          </div>
        </>
      )}
    </section>
  );
}
