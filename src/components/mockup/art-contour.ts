import { contornoDaArte, type V2 } from "@/lib/contorno";
import { paintArt, type ArtRender } from "./art";

/**
 * Contorno automático da arte (src/lib/contorno.ts) a partir do canvas: o 3D (lona recortada, LED do quadro) e o
 * arquivo da produção (product/contorno-arquivo.ts) usam o mesmo traçado, em resoluções diferentes.
 */

export type ArtContour = {
  /** Laços em pixels do canvas (o ponto inteiro é o centro do pixel). */
  loops: V2[][];
  /** Arte sem transparência: o contorno é a borda da peça. */
  cheio: boolean;
  W: number;
  H: number;
};

/**
 * Pinta a arte (sem fundo: a cor de fundo já vem transparente) e traça a borda a `marginCm` do desenho, a no mínimo
 * `edgeCm` da borda da peça.
 */
export function traceArtContour(canvas: HTMLCanvasElement, art: ArtRender, image: HTMLImageElement | null, label: string, widthCm: number, marginCm: number, edgeCm = 0): ArtContour | null {
  const { width: W, height: H } = canvas;
  paintArt(canvas, "front", art.aspect ? art : { ...art, aspect: W / H }, image, label);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, W, H).data;
  } catch {
    // Imagem de outra origem (canvas "contaminado"): sem contorno.
    return null;
  }
  const pxPerCm = W / Math.max(widthCm, 1);
  const traced = contornoDaArte(data, W, H, marginCm * pxPerCm, edgeCm * pxPerCm);
  return traced ? { ...traced, W, H } : null;
}

/** Laços em frações da área: x para a direita e y para cima, de -0,5 a 0,5. */
export function normalizedLoops(contour: ArtContour): V2[][] {
  return contour.loops.map((loop) => loop.map(([x, y]): V2 => [(x + 0.5) / contour.W - 0.5, 0.5 - (y + 0.5) / contour.H]));
}

/** Máscara do recorte (branco dentro dos laços, preto fora), no tamanho do canvas do contorno. */
export function paintContourMask(contour: ArtContour): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = contour.W;
  canvas.height = contour.H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, contour.W, contour.H);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  for (const loop of contour.loops) {
    loop.forEach(([x, y], i) => (i ? ctx.lineTo(x + 0.5, y + 0.5) : ctx.moveTo(x + 0.5, y + 0.5)));
    ctx.closePath();
  }
  ctx.fill("nonzero");
  return canvas;
}
