import { analyzeImage, contentBox, focusInside, hasWhiteBackground, previewScale, removeBorderBackground, worthTrimming, type FracBox, type ImageAnalysis } from "@/lib/image-prep";

/*
 * Núcleo de canvas do tratador automático: roda num Worker (OffscreenCanvas, sem travar a página) e, onde não
 * há suporte, na thread principal com os mesmos passos. Recebe a imagem já decodificada e em pé (EXIF).
 * As decisões (foto × arte, margem, fundo, encaixe) ficam em src/lib/image-prep.ts.
 */

export type Drawable = ImageBitmap | HTMLCanvasElement | HTMLImageElement | OffscreenCanvas;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type CanvasLimits = { pixels: number; side: number };

export type ProcessOptions = {
  /** Tirar o fundo branco ligado à borda (peça cujo fundo não é impresso: camisa, sacola). */
  removeWhite: boolean;
  /** Cortar a margem vazia (false: arquivo feito no gabarito, ou "usar a imagem original"). */
  trim: boolean;
  /** Teto de canvas do aparelho (iPhone: 16,7 MP). */
  limits: CanvasLimits;
  /** SVG: o arquivo de impressão continua vetor (recortado pelo viewBox), sem PNG. */
  vector: boolean;
};

export type ProcessResult = {
  /** Prévia tratada (até ~4 MP): PNG com transparência ou arte; JPEG para foto opaca. */
  preview: Blob;
  /** A análise valendo para a imagem tratada (sem margem, foco no recorte, borda transparente sem o fundo). */
  analysis: ImageAnalysis;
  crop: FracBox | null;
  removed: boolean;
  alpha: boolean;
  /** Arquivo de impressão tratado (PNG em resolução cheia, ou reduzido ao teto do canvas); null = o original. */
  print: Blob | null;
  /** Pixels do que vai para a impressão (o arquivo tratado, ou o recorte útil do original). */
  useful: { w: number; h: number };
};

const SAMPLE = 256;
/** Lado da cópia em que a margem é medida (a amostra de 256 px apagaria traço fino e texto claro). */
const MEASURE = 1024;
/** Teto de pixels para tratar o original em resolução cheia para a impressão. */
const MAX_FULL_PIXELS = 36_000_000;

function makeCanvas(w: number, h: number): AnyCanvas {
  const cw = Math.max(1, Math.round(w));
  const ch = Math.max(1, Math.round(h));
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(cw, ch);
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  return canvas;
}

/** Contexto 2D; `readable` só vale no primeiro pedido (canvas na CPU, leitura de pixels sem copiar da GPU). */
function context(canvas: AnyCanvas, readable = false): Ctx {
  const ctx = (canvas as HTMLCanvasElement).getContext("2d", { willReadFrequently: readable }) as Ctx | null;
  if (!ctx) throw new Error("canvas indisponível");
  return ctx;
}

/** Libera a memória do canvas na hora (o coletor demora). */
function release(canvas: AnyCanvas) {
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * Redução em etapas (metades, sem passar do teto do canvas do aparelho) com suavização alta: sem serrilhado nem
 * moiré em reduções grandes. `readable`: o canvas de saída vai ter os pixels lidos.
 */
function resample(source: Drawable, sx: number, sy: number, sw: number, sh: number, w: number, h: number, limits: CanvasLimits, readable = false): AnyCanvas {
  const tw = Math.max(1, Math.round(w));
  const th = Math.max(1, Math.round(h));
  let current: Drawable = source;
  let owned: AnyCanvas | null = null;
  let cx = sx;
  let cy = sy;
  let cw = sw;
  let ch = sh;
  while (cw / 2 >= tw * 1.0001 && ch / 2 >= th * 1.0001) {
    const fit = Math.min(0.5, Math.sqrt(limits.pixels / Math.max(1, cw * ch)), limits.side / Math.max(cw, ch));
    const nw = Math.max(tw, Math.round(cw * fit));
    const nh = Math.max(th, Math.round(ch * fit));
    const step = makeCanvas(nw, nh);
    const ctx = context(step);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(current, cx, cy, cw, ch, 0, 0, nw, nh);
    if (owned) release(owned);
    owned = step;
    current = step;
    cx = 0;
    cy = 0;
    cw = nw;
    ch = nh;
  }
  const out = makeCanvas(tw, th);
  const ctx = context(out, readable);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(current, cx, cy, cw, ch, 0, 0, tw, th);
  if (owned) release(owned);
  return out;
}

function pixelsOf(canvas: AnyCanvas) {
  const ctx = context(canvas, true);
  return { ctx, image: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}

function encode(canvas: AnyCanvas, type: string, quality?: number): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("prévia"))), type, quality));
}

/** Tira o fundo branco ligado à borda do canvas inteiro. */
function removeWhite(canvas: AnyCanvas, rgb: readonly number[]) {
  const { ctx, image } = pixelsOf(canvas);
  removeBorderBackground({ data: image.data, width: canvas.width, height: canvas.height }, rgb);
  ctx.putImageData(image, 0, 0);
}

/**
 * Trata a imagem: prévia (até ~4 MP), análise numa amostra de 256 px, margem medida em 1024 px com tolerância
 * apertada, fundo branco tirado quando pedido e o arquivo de impressão tratado em resolução cheia.
 */
export async function processImage(source: Drawable, W: number, H: number, options: ProcessOptions): Promise<ProcessResult> {
  const { limits } = options;

  // 1. Prévia e amostra para a análise.
  const k = previewScale(W, H, Math.min(4_194_304, limits.pixels), Math.min(8192, limits.side));
  let preview = resample(source, 0, 0, W, H, W * k, H * k, limits);
  const ks = Math.min(1, SAMPLE / Math.max(preview.width, preview.height));
  const sample = resample(preview, 0, 0, preview.width, preview.height, preview.width * ks, preview.height * ks, limits, true);
  const sampleData = pixelsOf(sample).image.data;
  const analysis = analyzeImage({ data: sampleData, width: sample.width, height: sample.height });
  release(sample);

  // 2. Margem vazia: medida numa cópia maior, com tolerância apertada (traço fino e tagline clara ficam).
  let crop: FracBox | null = null;
  if (options.trim && worthTrimming(analysis)) {
    const km = Math.min(1, MEASURE / Math.max(preview.width, preview.height));
    const measure = resample(preview, 0, 0, preview.width, preview.height, preview.width * km, preview.height * km, limits, true);
    const box = contentBox({ data: pixelsOf(measure).image.data, width: measure.width, height: measure.height }, analysis.border);
    release(measure);
    if (box.w * box.h < 0.94) crop = box;
  }
  const removing = options.removeWhite && hasWhiteBackground(analysis);
  if (crop) {
    const x = Math.floor(crop.x * preview.width);
    const y = Math.floor(crop.y * preview.height);
    const w = Math.max(1, Math.min(preview.width - x, Math.ceil(crop.w * preview.width)));
    const h = Math.max(1, Math.min(preview.height - y, Math.ceil(crop.h * preview.height)));
    const cut = resample(preview, x, y, w, h, w, h, limits, removing);
    release(preview);
    preview = cut;
  }
  if (removing) removeWhite(preview, analysis.border.rgb);
  // Qualquer transparência (até 1 px de canto arredondado) sai em PNG.
  const alpha = removing || Boolean(analysis.alpha) || analysis.transparent > 0;

  // 3. Prévia: PNG com transparência ou arte (bordas limpas); JPEG para foto opaca, sobre branco (um resto de
  // transparência que a amostra não viu não vira preto).
  let previewBlob: Blob;
  if (alpha || analysis.kind === "graphic") previewBlob = await encode(preview, "image/png");
  else {
    const flat = makeCanvas(preview.width, preview.height);
    const ctx = context(flat);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, flat.width, flat.height);
    ctx.drawImage(preview, 0, 0);
    previewBlob = await encode(flat, "image/jpeg", 0.92);
    release(flat);
  }
  release(preview);

  // 4. Arquivo de impressão: o original quando nada mudou; senão o original cortado/sem fundo em resolução cheia
  // (PNG, sem perda), reduzido ao teto do canvas do aparelho quando passa dele (e registrado no tamanho gravado).
  let useful = crop ? { w: Math.max(1, Math.round(W * crop.w)), h: Math.max(1, Math.round(H * crop.h)) } : { w: W, h: H };
  let print: Blob | null = null;
  if (!options.vector && (crop || removing)) {
    const x = Math.floor((crop?.x ?? 0) * W);
    const y = Math.floor((crop?.y ?? 0) * H);
    const cap = Math.min(MAX_FULL_PIXELS, limits.pixels);
    const s = Math.min(1, Math.sqrt(cap / (useful.w * useful.h)), limits.side / Math.max(useful.w, useful.h));
    const out = { w: Math.max(1, Math.round(useful.w * s)), h: Math.max(1, Math.round(useful.h * s)) };
    const cut = resample(source, x, y, Math.min(useful.w, W - x), Math.min(useful.h, H - y), out.w, out.h, limits, removing);
    if (removing) removeWhite(cut, analysis.border.rgb);
    print = await encode(cut, "image/png");
    release(cut);
    useful = out;
  }

  const treated: ImageAnalysis = {
    ...analysis,
    content: { x: 0, y: 0, w: 1, h: 1 },
    focus: crop ? focusInside(analysis.focus, crop) : analysis.focus,
    border: removing ? { ...analysis.border, transparent: true } : analysis.border,
    transparent: removing ? Math.max(analysis.transparent, 0.02) : analysis.transparent,
    alpha,
  };
  return { preview: previewBlob, analysis: treated, crop, removed: removing, alpha, print, useful };
}
