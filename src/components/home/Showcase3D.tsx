"use client";

import { useMemo, useRef, useState } from "react";
import Mockup3D from "@/components/mockup/Mockup3D";
import { ART_STYLES, DEFAULT_ART, artFamily, fileToDataUrl, type ArtSettings, type ArtStyle } from "@/components/mockup/art";
import { IconArrow, IconUpload } from "@/components/icons";
import { Marker, Reveal } from "@/components/motion";
import { StylePicker } from "@/components/product/ArtStep";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { mockupSpec } from "@/lib/mockup";
import { artAspect } from "@/lib/mockup-kinds";

export type DemoProduct = {
  tab: string;
  slug: string;
  name: string;
  category: string;
  categorySlug: string;
  image: string;
  options: Record<string, string[]>;
};

/** Fonte sugerida de cada estilo (a vitrine não tem seletor de fonte). */
function styleFont(style: ArtStyle) {
  return ART_STYLES.find((s) => s.value === style)?.font ?? DEFAULT_ART.font;
}

export default function Showcase3D({ demos }: { demos: DemoProduct[] }) {
  const [active, setActive] = useState(demos[0]?.slug ?? "");
  const [art, setArt] = useState<ArtSettings>(DEFAULT_ART);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const demo = demos.find((d) => d.slug === active) ?? demos[0];
  const spec = useMemo(() => mockupSpec(demo, {}), [demo]);
  const family = artFamily(spec.kind);

  return (
    <section id="mockup-3d" className="on-dark scroll-mt-28 bg-ink py-20 text-white md:py-28">
      <div className="container-site grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <Reveal>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral">Novo · Mockup 3D</p>
          <h2 className="mt-4 text-display">
            Veja o seu produto <Marker>em 3D</Marker> antes de imprimir.
          </h2>
          <p className="mt-6 max-w-lg text-lead text-white/75">
            Escreva o seu texto ou envie o seu logo, escolha um estilo e gire o produto em todos os ângulos. As medidas, o acabamento e o verso acompanham as opções que você escolher.
          </p>
          <SegmentedControl
            label="Produto do mockup"
            tone="dark"
            className="mt-8"
            value={demo.slug}
            onChange={setActive}
            options={demos.map((d) => ({ value: d.slug, label: d.tab }))}
          />
          <label className="mt-6 block max-w-md">
            <span className="mb-1.5 block text-sm font-bold">Escreva seu texto</span>
            <input
              value={art.text}
              maxLength={40}
              onChange={(event) => setArt((a) => ({ ...a, text: event.target.value }))}
              placeholder="Ex.: Café da Maria"
              className="h-13 w-full rounded-control border border-white/25 bg-white/5 px-4 text-white placeholder:text-white/55 focus:border-white"
            />
          </label>
          <div className="mt-5 max-w-xl">
            <p className="mb-2 text-sm font-bold">Estilo</p>
            <StylePicker
              compact
              art={art}
              family={family}
              kind={spec.kind}
              aspect={artAspect(spec)}
              ledColors={spec.ledColors}
              label={demo.name}
              fontFor={styleFont}
              onPick={(style) => setArt((a) => ({ ...a, style, font: styleFont(style) }))}
            />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button variant="buy" size="md" icon={<IconUpload className="size-5" />} onClick={() => input.current?.click()}>
              {fileName ? "Trocar imagem" : "Testar com o meu logo"}
            </Button>
            <Button href={`/produto/${demo.slug}`} variant="outline" size="md" className="border-white/30 text-white hover:border-white" iconEnd={<IconArrow className="size-5" />}>
              Configurar {demo.tab.toLowerCase()}
            </Button>
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              tabIndex={-1}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                try {
                  const src = await fileToDataUrl(file);
                  setArt((a) => ({ ...a, src, fit: "contain" }));
                  setFileName(file.name);
                  setUploadError(null);
                } catch {
                  setUploadError("Não conseguimos ler essa imagem. Tente PNG, JPG ou WEBP.");
                }
              }}
            />
          </div>
          {fileName && <p className="mt-3 text-sm text-white/70">Usando: {fileName}. A imagem fica só no seu navegador.</p>}
          {uploadError && (
            <p role="alert" className="mt-3 text-sm font-semibold text-coral">
              {uploadError}
            </p>
          )}
        </Reveal>
        <Reveal delay={150}>
          <Mockup3D lazy spec={spec} art={art} label={demo.name} fallbackImage={demo.image} className="aspect-square w-full" />
        </Reveal>
      </div>
    </section>
  );
}
