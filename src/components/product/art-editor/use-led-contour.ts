"use client";

import { useEffect, useMemo, useState } from "react";
import { LED_BORDA_CM, LED_MARGEM_CM, type V2 } from "@/lib/contorno";
import { canvasFor, loadArtFont, type ArtRender } from "@/components/mockup/art";
import { fractionLoops, traceArtContour } from "@/components/mockup/art-contour";
import { useLoadedImage } from "./useLoadedImage";

/** Contorno automático do LED em fração da área (do maior laço para o menor); `cheio` = arte sem transparência. */
export type LedContour = { lacos: V2[][]; cheio: boolean };

/**
 * Contorno automático do LED (src/lib/contorno.ts) para o editor 2D e o painel das linhas: o mesmo traçado do 3D
 * (use-art-contour.ts), num canvas de 512 px. Traça 150 ms depois da última mudança, para o arraste da imagem não
 * traçar a cada quadro, e de novo quando a fonte termina de carregar. `art` já vem sem fundo e com o tipo da peça.
 * null quando desligado ou sem nada pintado.
 */
export function useLedContour(art: ArtRender, label: string, aspect: number, widthCm: number, enabled: boolean): LedContour | null {
  const image = useLoadedImage(enabled ? art.src : null);
  const canvas = useMemo(() => (enabled && typeof document !== "undefined" ? canvasFor(aspect, 512) : null), [enabled, aspect]);
  const [contour, setContour] = useState<LedContour | null>(null);
  const [fontsLoaded, setFontsLoaded] = useState("");
  const fontKey = `${art.font}:${art.text}:${art.style ?? ""}:${art.subtext ?? ""}`;
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadArtFont(art).then(() => alive && setFontsLoaded(fontKey));
    return () => {
      alive = false;
    };
  }, [enabled, art, fontKey]);
  useEffect(() => {
    if (!canvas) return;
    // Imagem ainda carregando: espera (sem ela o contorno sairia só do texto).
    if (art.src && !image) return;
    const timer = window.setTimeout(() => {
      const traced = traceArtContour(canvas, art, image, label, widthCm, LED_MARGEM_CM, LED_BORDA_CM);
      setContour(traced ? { lacos: fractionLoops(traced), cheio: traced.cheio } : null);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [canvas, art, image, label, widthCm, fontsLoaded]);
  return enabled ? contour : null;
}
