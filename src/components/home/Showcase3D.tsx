"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import Mockup3D from "@/components/mockup/Mockup3D";
import { DEFAULT_ART, fileToDataUrl, type ArtSettings } from "@/components/mockup/art";
import { IconArrow, IconUpload } from "@/components/icons";
import { mockupSpec } from "@/lib/mockup";
import { Marker, Reveal } from "@/components/motion";

export type DemoProduct = {
  tab: string;
  slug: string;
  name: string;
  category: string;
  categorySlug: string;
  options: Record<string, string[]>;
};

export default function Showcase3D({ demos }: { demos: DemoProduct[] }) {
  const [active, setActive] = useState(0);
  const [art, setArt] = useState<ArtSettings>(DEFAULT_ART);
  const [fileName, setFileName] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const demo = demos[active];
  const spec = useMemo(() => mockupSpec(demo, {}), [demo]);

  return (
    <section id="mockup-3d" className="scroll-mt-28 bg-ink py-20 text-white md:py-28">
      <div className="mx-auto grid max-w-[1440px] items-center gap-12 px-5 md:px-10 lg:grid-cols-[0.9fr_1.1fr] xl:px-[70px]">
        <Reveal>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral">Novo · Mockup 3D</p>
          <h2 className="mt-4 text-[clamp(36px,4.6vw,56px)] font-bold leading-[1.02] tracking-[-0.02em]">
            Veja o seu produto <Marker>em 3D</Marker> antes de imprimir.
          </h2>
          <p className="mt-6 max-w-lg text-lg text-white/70">
            Envie o seu logo e gire o produto em todos os ângulos. As medidas, o acabamento e o verso acompanham as opções que você escolher.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {demos.map((d, i) => (
              <button
                key={d.slug}
                type="button"
                onClick={() => setActive(i)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-300 ${i === active ? "bg-white text-ink" : "bg-white/10 text-white hover:bg-white/20"}`}
              >
                {d.tab}
              </button>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="inline-flex h-13 items-center gap-2 rounded-full bg-coral px-7 font-bold transition-colors duration-300 hover:bg-coral-600"
            >
              <IconUpload className="size-5" /> {fileName ? "Trocar imagem" : "Testar com o meu logo"}
            </button>
            <Link href={`/produto/${demo.slug}`} className="inline-flex h-13 items-center gap-2 rounded-full border border-white/25 px-7 font-bold transition-colors hover:border-white">
              Configurar {demo.tab.toLowerCase()} <IconArrow className="size-5" />
            </Link>
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const src = await fileToDataUrl(file);
                setArt({ ...DEFAULT_ART, src, fit: "contain" });
                setFileName(file.name);
              }}
            />
          </div>
          {fileName && <p className="mt-3 text-sm text-white/55">Usando: {fileName}. A imagem fica só no seu navegador.</p>}
        </Reveal>
        <Reveal delay={150}>
          <Mockup3D lazy spec={spec} art={art} label={demo.name} className="aspect-square w-full" />
        </Reveal>
      </div>
    </section>
  );
}
