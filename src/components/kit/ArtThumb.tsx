"use client";

import { useEffect, useRef } from "react";
import { THERMAL_WINDOW, artFamily, loadArtFont, loadImage, paintArt, type ArtRender, type ArtSettings } from "@/components/mockup/art";
import { cx } from "@/components/ui/cx";
import type { MockupSpec } from "@/lib/mockup";
import { artAspect } from "@/lib/mockup-kinds";

/** Lado maior do canvas da miniatura (px). */
const SIDE = 240;
/** Proporção da moldura onde a miniatura fica (5:3, a do card). */
const FRAME = 5 / 3;
const FILL = 86;

/**
 * Miniatura da arte na área de impressão do item, com o mesmo paintArt do 3D e do editor e no formato real da
 * peça: a faixa comprida da caneca, o cartão, a estampa da camiseta sobre a cor do tecido.
 */
export function ArtThumb({ art, spec, label, className }: { art: ArtSettings; spec: MockupSpec; label: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const raw = artAspect(spec);
  const aspect = Number.isFinite(raw) && raw > 0 ? Math.min(12, Math.max(1 / 12, raw)) : 1;
  const width = aspect >= 1 ? SIDE : Math.max(16, Math.round(SIDE * aspect));
  const height = aspect >= 1 ? Math.max(16, Math.round(SIDE / aspect)) : SIDE;
  // Largura e altura explícitas (em % da moldura): a peça cabe inteira, deitada ou em pé.
  const box = aspect >= FRAME ? { width: `${FILL}%`, height: `${(FILL * FRAME) / aspect}%` } : { width: `${(FILL * aspect) / FRAME}%`, height: `${FILL}%` };
  const family = artFamily(spec.kind);
  // Estampa de tecido: a imagem sai sem fundo e o tecido aparece em volta (como no 3D).
  const fabric = family === "apparel";
  const neon = family === "neon";

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let alive = true;
    const render: ArtRender = {
      ...art,
      back: null,
      region: null,
      background: fabric && art.src ? "rgba(0,0,0,0)" : art.background,
      kind: spec.kind,
      ledColors: spec.ledColors?.length ? spec.ledColors : undefined,
      surface: spec.baseColor,
      frontWindow: spec.thermal ? THERMAL_WINDOW : undefined,
      aspect,
    };
    // Atraso curto: digitar o nome não repinta a cada tecla.
    const timer = window.setTimeout(async () => {
      try {
        await loadArtFont(render);
        const image = art.src ? await loadImage(art.src).catch(() => null) : null;
        if (alive) paintArt(canvas, neon ? "neon" : "front", render, image, label);
      } catch {
        /* sem miniatura: fica a moldura */
      }
    }, 60);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [art, spec, label, fabric, neon, aspect]);

  return (
    <span
      className={cx("relative block aspect-[5/3] overflow-hidden rounded-thumb", neon ? "bg-night" : "bg-mist", className)}
      style={fabric && spec.baseColor ? { background: spec.baseColor } : undefined}
    >
      <canvas
        ref={ref}
        width={width}
        height={height}
        aria-hidden
        style={box}
        className={cx("absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2", !fabric && !neon && "shadow-sm")}
      />
    </span>
  );
}
