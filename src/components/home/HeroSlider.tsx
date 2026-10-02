"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Arrow, Dot, PauseButton } from "@/components/Rail";
import { IconClock, IconCube, IconLayers } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { usePrefersReducedMotion } from "@/components/ui/useMediaQuery";
import { imageUrl } from "@/lib/format";

export type HeroSlide = {
  light: string;
  bold: string;
  tail: string;
  text: string;
  cta: string;
  href: string;
  /** Fundo do slide (token do espectro, ex.: var(--color-peach-50)). */
  tone: string;
  /** Cor da palavra em destaque; precisa de 3:1 sobre o fundo (texto grande). */
  accent: string;
  images: string[];
};

const AUTOPLAY_MS = 7000;

export default function HeroSlider({ slides, stats }: { slides: HeroSlide[]; stats: { products: number; minLeadDays: number } }) {
  const FEATURES = [
    { Icon: IconCube, title: "Mockup 3D", text: "antes de imprimir" },
    { Icon: IconClock, title: "Produção ágil", text: `a partir de ${stats.minLeadDays} ${stats.minLeadDays === 1 ? "dia" : "dias"}` },
    { Icon: IconLayers, title: `${stats.products} produtos`, text: "para a sua marca" },
  ];
  const [index, setIndex] = useState(0);
  const [stopped, setStopped] = useState(false);
  const hovering = useRef(false);
  const focused = useRef(false);
  const reducedMotion = usePrefersReducedMotion();
  const autoplays = !reducedMotion && !stopped && slides.length > 1;

  useEffect(() => {
    if (!autoplays) return;
    const id = window.setInterval(() => {
      if (!hovering.current && !focused.current && document.visibilityState === "visible") setIndex((i) => (i + 1) % slides.length);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [autoplays, slides.length]);

  const go = (dir: 1 | -1) => setIndex((i) => (i + dir + slides.length) % slides.length);

  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Destaques"
      className="relative grid min-h-[620px] overflow-hidden md:min-h-[640px]"
      onPointerEnter={() => (hovering.current = true)}
      onPointerLeave={() => (hovering.current = false)}
      onFocusCapture={() => (focused.current = true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) focused.current = false;
      }}
    >
      {slides.map((slide, i) => {
        const active = i === index;
        // Um único h1 na página: o primeiro slide; os outros são h2.
        const Title = i === 0 ? "h1" : "h2";
        return (
          <div
            key={slide.bold}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} de ${slides.length}`}
            aria-hidden={!active}
            inert={!active}
            className={cx(
              "[grid-area:1/1] transition-all duration-[1200ms] ease-reveal motion-reduce:transition-none",
              active ? "visible scale-100 opacity-100" : "invisible scale-[1.04] opacity-0",
            )}
            style={{ background: slide.tone }}
          >
            <div className="container-site grid h-full grid-cols-1 items-center gap-6 pb-44 pt-10 md:grid-cols-[1.05fr_1fr] md:pb-48">
              <div className={cx("transition-all delay-200 duration-1000 ease-reveal motion-reduce:transition-none", active ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0")}>
                <Title className="leading-[0.95]">
                  <span className="block text-[clamp(40px,6vw,76px)] font-light tracking-[-0.02em] text-ink/80">{slide.light}</span>
                  <span className="block text-[clamp(48px,7.4vw,96px)] font-black uppercase tracking-[-0.03em]" style={{ color: slide.accent }}>
                    {slide.bold}
                  </span>
                  <span className="block text-[clamp(36px,5.2vw,68px)] font-semibold uppercase tracking-[-0.02em]">{slide.tail}</span>
                </Title>
                <p className="mt-5 max-w-md text-lead text-ink/80 md:text-xl">{slide.text}</p>
                <div className="mt-7 hidden gap-5 md:flex">
                  {FEATURES.map(({ Icon, title, text }) => (
                    <div key={title} className="flex items-center gap-3">
                      <span className="grid size-13 place-items-center rounded-full bg-white shadow-card">
                        <Icon aria-hidden className="size-6" />
                      </span>
                      <span className="text-caption leading-tight">
                        <span className="block font-bold">{title}</span>
                        {text}
                      </span>
                    </div>
                  ))}
                </div>
                <Button href={slide.href} variant="dark" size="md" className="mt-8">
                  {slide.cta}
                </Button>
              </div>
              <div className="relative hidden h-full md:block">
                {slide.images.map((src, k) => (
                  <div
                    key={src}
                    className={cx("absolute transition-all duration-[1400ms] ease-reveal motion-reduce:transition-none", active ? "translate-y-0 opacity-100" : "translate-y-16 opacity-0")}
                    style={{
                      transitionDelay: `${250 + k * 140}ms`,
                      ...[
                        { right: "4%", top: "2%", width: "62%" },
                        { left: "2%", bottom: "4%", width: "44%" },
                        { right: "0%", bottom: "0%", width: "38%" },
                      ][k],
                    }}
                  >
                    <Image
                      src={imageUrl(src)}
                      alt=""
                      width={600}
                      height={600}
                      loading={i === 0 ? "eager" : "lazy"}
                      fetchPriority={i === 0 && k === 0 ? "high" : undefined}
                      className="h-auto w-full object-contain drop-shadow-pop"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
      <Arrow dir="prev" onClick={() => go(-1)} className="absolute left-3 top-[42%] z-10 hidden xl:grid" />
      <Arrow dir="next" onClick={() => go(1)} className="absolute right-3 top-[42%] z-10 hidden xl:grid" />
      <div className="absolute bottom-32 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 md:bottom-36">
        {slides.map((s, i) => (
          <Dot key={s.bold} active={i === index} label={`Destaque ${i + 1}`} onClick={() => setIndex(i)} />
        ))}
        {!reducedMotion && slides.length > 1 && <PauseButton paused={stopped} onToggle={() => setStopped((v) => !v)} className="ml-2" />}
      </div>
    </section>
  );
}
