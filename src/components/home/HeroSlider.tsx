"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Arrow } from "@/components/Rail";
import { IconClock, IconCube, IconLayers } from "@/components/icons";
import { imageUrl } from "@/lib/format";

export type HeroSlide = {
  light: string;
  bold: string;
  tail: string;
  text: string;
  cta: string;
  href: string;
  tone: string;
  accent: string;
  images: string[];
};

export default function HeroSlider({ slides, stats }: { slides: HeroSlide[]; stats: { products: number; minLeadDays: number } }) {
  const FEATURES = [
    { Icon: IconCube, title: "Mockup 3D", text: "antes de imprimir" },
    { Icon: IconClock, title: "Produção ágil", text: `a partir de ${stats.minLeadDays} ${stats.minLeadDays === 1 ? "dia" : "dias"}` },
    { Icon: IconLayers, title: `${stats.products} produtos`, text: "para a sua marca" },
  ];
  const [index, setIndex] = useState(0);
  const paused = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!paused.current && document.visibilityState === "visible") setIndex((i) => (i + 1) % slides.length);
    }, 7000);
    return () => window.clearInterval(id);
  }, [slides.length]);

  const go = (dir: 1 | -1) => setIndex((i) => (i + dir + slides.length) % slides.length);

  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Destaques"
      className="relative h-[620px] overflow-hidden md:h-[640px]"
      onPointerEnter={() => (paused.current = true)}
      onPointerLeave={() => (paused.current = false)}
    >
      {slides.map((slide, i) => {
        const active = i === index;
        return (
          <div
            key={slide.bold}
            aria-hidden={!active}
            className={`absolute inset-0 transition-all duration-[1200ms] ease-reveal ${active ? "visible scale-100 opacity-100" : "invisible scale-[1.04] opacity-0"}`}
            style={{ background: slide.tone }}
          >
            <div className="mx-auto grid h-full max-w-[1440px] grid-cols-1 items-center gap-6 px-6 pb-36 pt-10 md:grid-cols-[1.05fr_1fr] md:px-16 md:pb-40 xl:px-[110px]">
              <div className={`transition-all delay-200 duration-1000 ease-reveal ${active ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}>
                <h1 className="leading-[0.95]">
                  <span className="block text-[clamp(40px,6vw,76px)] font-light tracking-[-0.02em] text-ink/80">{slide.light}</span>
                  <span className="block text-[clamp(48px,7.4vw,96px)] font-black uppercase tracking-[-0.03em]" style={{ color: slide.accent }}>
                    {slide.bold}
                  </span>
                  <span className="block text-[clamp(36px,5.2vw,68px)] font-semibold uppercase tracking-[-0.02em]">{slide.tail}</span>
                </h1>
                <p className="mt-5 max-w-md text-lg text-ink/75 md:text-xl">{slide.text}</p>
                <div className="mt-7 hidden gap-5 md:flex">
                  {FEATURES.map(({ Icon, title, text }) => (
                    <div key={title} className="flex items-center gap-3">
                      <span className="grid size-13 place-items-center rounded-full bg-white shadow-card">
                        <Icon className="size-6" />
                      </span>
                      <span className="text-[13px] leading-tight">
                        <span className="block font-bold">{title}</span>
                        {text}
                      </span>
                    </div>
                  ))}
                </div>
                <Link href={slide.href} tabIndex={active ? 0 : -1} className="mt-8 inline-flex h-13 items-center rounded-full bg-ink px-8 text-base font-bold text-white transition-colors duration-300 ease-button hover:bg-coral">
                  {slide.cta}
                </Link>
              </div>
              <div className="relative hidden h-full md:block">
                {slide.images.map((src, k) => (
                  <div
                    key={src}
                    className={`absolute transition-all duration-[1400ms] ease-reveal ${active ? "translate-y-0 opacity-100" : "translate-y-16 opacity-0"}`}
                    style={{
                      transitionDelay: `${250 + k * 140}ms`,
                      ...[
                        { right: "4%", top: "2%", width: "62%" },
                        { left: "2%", bottom: "4%", width: "44%" },
                        { right: "0%", bottom: "0%", width: "38%" },
                      ][k],
                    }}
                  >
                    <Image src={imageUrl(src)} alt="" width={600} height={600} priority={i === 0} className="h-auto w-full object-contain drop-shadow-[0_30px_40px_rgba(0,0,0,0.18)]" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
      <Arrow dir="prev" onClick={() => go(-1)} className="absolute left-4 top-[42%] z-10 md:left-8" />
      <Arrow dir="next" onClick={() => go(1)} className="absolute right-4 top-[42%] z-10 md:right-8" />
      <div className="absolute bottom-32 left-1/2 z-10 flex -translate-x-1/2 gap-2 md:bottom-36">
        {slides.map((s, i) => (
          <button
            key={s.bold}
            type="button"
            aria-label={`Destaque ${i + 1}`}
            onClick={() => setIndex(i)}
            className={`h-2 rounded-full transition-all duration-500 ${i === index ? "w-8 bg-ink" : "w-2 bg-ink/25"}`}
          />
        ))}
      </div>
    </section>
  );
}
