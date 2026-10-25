import { useEffect, useMemo, useState } from "react";
import { canvasFor, loadArtFont, type ArtRender } from "../art";
import { traceArtContour, type ArtContour } from "../art-contour";
import { useArtImage } from "./shared";

/**
 * Contorno da arte para o modelo (spec.contour): pinta a arte num canvas de 512 px e traça a borda a `marginCm` do
 * desenho, a no mínimo `edgeCm` da borda da peça. Repinta no próximo quadro (como useArtTexture) e quando a fonte
 * carrega. null quando desligado ou sem arte.
 */
export function useArtContour(aspect: number, art: ArtRender, label: string, widthCm: number, marginCm: number, edgeCm: number, enabled: boolean): ArtContour | null {
  const image = useArtImage(enabled ? art.src : null);
  const canvas = useMemo(() => (enabled ? canvasFor(aspect, 512) : null), [enabled, aspect]);
  const [contour, setContour] = useState<ArtContour | null>(null);
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
    const frame = requestAnimationFrame(() => setContour(traceArtContour(canvas, art, image, label, widthCm, marginCm, edgeCm)));
    return () => cancelAnimationFrame(frame);
  }, [canvas, art, image, label, widthCm, marginCm, edgeCm, fontsLoaded]);
  return enabled ? contour : null;
}
