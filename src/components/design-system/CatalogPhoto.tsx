"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Mockup3D from "@/components/mockup/Mockup3D";
import type { CaptureFn } from "@/components/mockup/MockupViewer";
import { DEFAULT_ART, type ArtSettings } from "@/components/mockup/art";
import { brandArtDataUrl, brandColor, type BrandArtOptions } from "@/components/mockup/brand-art";
import { artImagesPending } from "@/components/mockup/models/shared";
import { mockupSpec, type MockupProduct } from "@/lib/mockup";

export type CatalogPhotoProps = {
  product: MockupProduct & { slug: string; image?: string };
  selection: Record<string, string>;
  /** Estampa da marca: cor (token) e modo ("pattern" chapado ou "mark" de 1 cor). */
  brand: BrandArtOptions;
  /** Giro da câmera em graus a partir do 3/4 do carrinho. */
  turn: number;
  /** Lado da foto final (px) e margem em volta da peça (fração do lado). */
  size: number;
  margin: number;
  /**
   * Conferência das superfícies (src/lib/superficies.ts): "back" e os ids das extras ganham a estampa em outras cores,
   * e `face` é a superfície "em edição" (o modelo mostra ela, como no passo da arte).
   */
  faces?: string[];
  face?: string | null;
};

/** Cores das superfícies extras na conferência, em ordem. */
const FACE_COLORS = ["blue", "lime", "sun", "magenta", "cyan", "red", "amber", "ink"];

/** Espera do modelo pronto até a foto: cobre a animação de entrada e o carregamento das texturas. */
const SETTLE_MS = 2500;
const TIMEOUT_MS = 90_000;

/** Recorta a peça pela caixa do alfa e centraliza num quadrado `size` com margem (fundo transparente). */
async function catalogFrame(png: string, size: number, margin: number): Promise<string> {
  const image = new Image();
  image.src = png;
  await image.decode();
  const source = document.createElement("canvas");
  source.width = image.naturalWidth;
  source.height = image.naturalHeight;
  const sctx = source.getContext("2d", { willReadFrequently: true });
  if (!sctx) return png;
  sctx.drawImage(image, 0, 0);
  const { data, width, height } = sctx.getImageData(0, 0, source.width, source.height);
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return png;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const room = size * (1 - margin * 2);
  const scale = Math.min(room / w, room / h);
  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const ctx = out.getContext("2d");
  if (!ctx) return png;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, x0, y0, w, h, (size - w * scale) / 2, (size - h * scale) / 2, w * scale, h * scale);
  return out.toDataURL("image/webp", 0.92);
}

/**
 * Foto de catálogo de um produto: o mockup 3D com a estampa da marca, fotografado no 3/4 do carrinho com fundo
 * transparente e enquadrado num quadrado de `size` px (600 na página; 1200 pelo fotos:novos). O resultado fica em `window.__foto`
 * (WebP em data URL) para o scripts/fotos-produtos.mjs gravar em public/.
 */
export default function CatalogPhoto({ product, selection, brand, turn, size, margin, faces = [], face = null }: CatalogPhotoProps) {
  const captureRef = useRef<CaptureFn | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [photo, setPhoto] = useState<{ src: string | null; error?: string } | null>(null);
  const spec = useMemo(() => mockupSpec(product, selection), [product, selection]);
  const facesKey = faces.join(",");
  const art = useMemo<ArtSettings>(() => {
    // Modo "mark" (serigrafia de 1 cor): sem fundo, a tinta sobre a peça.
    const paint = (options: typeof brand): ArtSettings => ({
      ...DEFAULT_ART,
      src: brandArtDataUrl(options),
      fit: "cover",
      background: options.mode === "mark" ? "rgba(0,0,0,0)" : brandColor(options.color),
    });
    const main = paint(brand);
    const extras = facesKey ? facesKey.split(",") : [];
    const seed = brand.seed ?? 7;
    const other = (i: number) => paint({ ...brand, color: FACE_COLORS[i % FACE_COLORS.length], seed: seed + i + 1 });
    const back = extras.includes("back") ? other(extras.indexOf("back")) : null;
    const own = Object.fromEntries(extras.flatMap((id, i) => (id === "back" ? [] : [[id, other(i)]])));
    return { ...main, back, faces: Object.keys(own).length ? own : null };
  }, [brand, facesKey]);

  useEffect(() => {
    const started = performance.now();
    let readyAt = 0;
    let done = false;
    const timer = window.setInterval(() => {
      const root = stage.current?.querySelector<HTMLElement>("[data-kind]");
      // Pronto = modelo montado E a estampa já decodificada em todas as texturas (senão sai a arte de exemplo).
      const ready = root?.dataset.kind === spec.kind && root.dataset.ready === "true" && artImagesPending() === 0;
      const now = performance.now();
      if (!ready) readyAt = 0;
      else if (!readyAt) readyAt = now;
      const timedOut = now - started > TIMEOUT_MS;
      if (done || !((readyAt && now - readyAt > SETTLE_MS) || timedOut)) return;
      done = true;
      window.clearInterval(timer);
      const png = timedOut ? null : (captureRef.current?.({ transparent: true, turn: (turn * Math.PI) / 180 }) ?? null);
      if (!png) {
        setPhoto({ src: null, error: timedOut ? "o 3D não ficou pronto" : "sem captura" });
        return;
      }
      catalogFrame(png, size, margin)
        .then((src) => {
          (window as unknown as { __foto?: string }).__foto = src;
          setPhoto({ src });
        })
        .catch((error: unknown) => setPhoto({ src: null, error: error instanceof Error ? error.message : "falhou" }));
    }, 200);
    return () => window.clearInterval(timer);
  }, [spec, turn, size, margin]);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div ref={stage} className="w-full max-w-[900px]">
        <Mockup3D spec={spec} art={art} label={product.name} fallbackImage={product.image} captureRef={captureRef} face={face} className="aspect-square w-full" />
      </div>
      <div>
        <p role="status" className="text-sm text-muted" data-foto={photo ? (photo.src ? "pronta" : "falhou") : "aguardando"}>
          {photo ? (photo.src ? `Foto ${size}×${size} pronta` : `Falhou: ${photo.error}`) : "Fotografando…"}
        </p>
        {photo?.src && (
          // Fundo xadrez para conferir a transparência.
          <div className="mt-3 inline-block bg-[length:24px_24px] bg-[linear-gradient(45deg,var(--color-fog)_25%,transparent_25%,transparent_75%,var(--color-fog)_75%),linear-gradient(45deg,var(--color-fog)_25%,transparent_25%,transparent_75%,var(--color-fog)_75%)] bg-[position:0_0,12px_12px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.src} alt={`Foto de catálogo: ${product.name}`} width={size} height={size} className="block max-w-full" />
          </div>
        )}
      </div>
    </div>
  );
}
