"use client";

import { canvasLimitsFor, formatPlan, type FracBox, type ImageAnalysis } from "@/lib/image-prep";
import { loadImage, registerSource } from "./art";
import { processImage, type CanvasLimits, type Drawable, type ProcessOptions, type ProcessResult } from "./image-process";

/*
 * Entrada da imagem que o cliente envia para a arte (tratador automático, parte do navegador):
 * 1. abre o arquivo sem travar a página (createImageBitmap decodifica fora da thread principal), já em pé
 *    pela orientação do EXIF; SVG é rasterizado no tamanho da prévia a partir do viewBox (vetor);
 * 2. arquivo já feito no gabarito da peça (folha, sangria, tamanho final, pelos pixels do original): entra como
 *    veio, sem corte nem remoção de fundo;
 * 3. o resto do trabalho (amostra e análise, margem, fundo branco em camisa/sacola, prévia e arquivo de
 *    impressão) roda num Worker (image-process.ts); sem suporte a Worker/OffscreenCanvas, roda aqui mesmo;
 * 4. a prévia vira uma URL blob: (curta) e o original tratado fica registrado para o arquivo de impressão.
 */

export class IntakeError extends Error {
  /** O arquivo segue anexado ao pedido (sem prévia), em vez de ser recusado. */
  readonly attach: boolean;
  constructor(message: string, attach = false) {
    super(message);
    this.name = "IntakeError";
    this.attach = attach;
  }
}

export type IntakeResult = {
  /** URL blob: da prévia tratada (o que o 3D, o editor e a miniatura usam). */
  src: string;
  /** Pixels do que vai para a impressão (sem a margem cortada); no SVG, o tamanho da prévia. */
  px: { w: number; h: number };
  analysis: ImageAnalysis;
  trimmed: boolean;
  backgroundRemoved: boolean;
  vector: boolean;
  alpha: boolean;
};

export type IntakeOptions = {
  /** Peça cujo fundo não é impresso (camisa, sacola plástica): o fundo branco ligado à borda de um logo sai. */
  removeWhite?: boolean;
  /** false: sem corte de margem nem remoção de fundo ("usar a imagem original"). */
  treat?: boolean;
  /** O arquivo (pixels do original) já está no tamanho do gabarito da peça: entra como veio. */
  madeForTemplate?: ((px: { w: number; h: number }, vector: boolean) => boolean) | null;
  /** false (verso): formatos sem prévia não são anexados ao pedido; a mensagem pede outro formato. */
  attachable?: boolean;
};

/** Teto do canvas do aparelho (iPhone/iPad: 16,7 MP; os demais aguentam bem mais). */
export function canvasLimits(): CanvasLimits {
  if (typeof navigator === "undefined") return canvasLimitsFor("");
  return canvasLimitsFor(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

function canvasOf(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  return canvas;
}

// ------------------------------------------------------------------------------------- SVG

export type SvgSource = { text: string; viewBox: { x: number; y: number; w: number; h: number } };

/** Lê o SVG e o viewBox (ou width/height); sem medida nenhuma, considera 1000 × 1000. */
async function readSvg(file: File): Promise<SvgSource> {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== "svg") throw new IntakeError("Esse SVG não abriu. Exporte de novo ou envie em PNG ou PDF.");
  const num = (v: string | null) => {
    const n = Number.parseFloat(v ?? "");
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const vb = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  const viewBox =
    vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0
      ? { x: vb[0], y: vb[1], w: vb[2], h: vb[3] }
      : { x: 0, y: 0, w: num(svg.getAttribute("width")) ?? 1000, h: num(svg.getAttribute("height")) ?? 1000 };
  return { text, viewBox };
}

/** O SVG com outro viewBox (recorte da margem) e com largura × altura explícitas (o navegador rasteriza nesse tamanho). */
export function svgSized(source: SvgSource, w: number, h: number, crop?: FracBox | null): string {
  const doc = new DOMParser().parseFromString(source.text, "image/svg+xml");
  const svg = doc.documentElement;
  const vb = source.viewBox;
  const box = crop ? { x: vb.x + crop.x * vb.w, y: vb.y + crop.y * vb.h, w: crop.w * vb.w, h: crop.h * vb.h } : vb;
  svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.w} ${box.h}`);
  svg.setAttribute("width", String(Math.round(w)));
  svg.setAttribute("height", String(Math.round(h)));
  svg.setAttribute("preserveAspectRatio", "none");
  return new XMLSerializer().serializeToString(svg);
}

/** Rasteriza um SVG (texto) em w × h com fundo transparente. */
export async function rasterSvg(text: string, w: number, h: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  try {
    const image = await loadImage(url);
    const canvas = canvasOf(w, h);
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ------------------------------------------------------------------------------------- bitmap

const HEIC_MESSAGE = "Fotos HEIC do iPhone não abrem neste navegador. No iPhone, use Ajustes › Câmera › Formatos › Mais compatível, ou envie em JPG.";

async function decodeBitmap(file: File, heic: boolean, attachable: boolean): Promise<Drawable> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Navegador sem createImageBitmap para esse formato: o <img> também aplica o EXIF.
    const url = URL.createObjectURL(file);
    try {
      return await loadImage(url);
    } catch {
      if (heic) throw attachable ? new IntakeError(HEIC_MESSAGE, true) : new IntakeError("Fotos HEIC do iPhone não abrem neste navegador. Para o verso, envie em JPG ou PNG.");
      throw new IntakeError("Não conseguimos ler essa imagem. Tente PNG, JPG, WEBP ou SVG.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

const sizeOf = (d: Drawable) => ("naturalWidth" in d ? { w: d.naturalWidth, h: d.naturalHeight } : { w: d.width, h: d.height });

// ------------------------------------------------------------------------------------- worker

type Pending = { resolve: (result: ProcessResult) => void; reject: (error: Error) => void };
/** undefined = ainda não tentou; null = sem suporte (ou falhou uma vez): trata na thread principal. */
let worker: Worker | null | undefined;
let nextId = 0;
const pending = new Map<number, Pending>();

function dropWorker() {
  worker?.terminate();
  worker = null;
  pending.forEach((p) => p.reject(new Error("worker")));
  pending.clear();
}

function intakeWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  try {
    const created = new Worker(new URL("./image-intake.worker.ts", import.meta.url), { type: "module" });
    created.onmessage = (event: MessageEvent<{ id: number; ok: boolean; result?: ProcessResult; message?: string }>) => {
      const { id, ok, result, message } = event.data;
      const waiting = pending.get(id);
      if (!waiting) return;
      pending.delete(id);
      if (ok && result) waiting.resolve(result);
      else waiting.reject(new Error(message ?? "worker"));
    };
    created.onerror = () => dropWorker();
    worker = created;
  } catch {
    worker = null;
  }
  return worker;
}

/** Trata no Worker (o bitmap é transferido, sem cópia). */
function inWorker(bitmap: ImageBitmap, options: ProcessOptions): Promise<ProcessResult> {
  const target = intakeWorker();
  if (!target) return Promise.reject(new Error("sem worker"));
  return new Promise((resolve, reject) => {
    nextId += 1;
    pending.set(nextId, { resolve, reject });
    target.postMessage({ id: nextId, bitmap, options }, [bitmap]);
  });
}

// ------------------------------------------------------------------------------------- entrada

/** Trata a imagem enviada (ver o topo do arquivo). */
export async function intakeImage(file: File, { removeWhite = false, treat = true, madeForTemplate = null, attachable = true }: IntakeOptions = {}): Promise<IntakeResult> {
  const plan = formatPlan(file.name, file.type, attachable);
  if (!plan.ok) throw new IntakeError(plan.reason, attachable);
  if (plan.decode === "pdf") throw new IntakeError("PDF segue pelo leitor de PDF.");
  const limits = canvasLimits();

  // 1. Abre (SVG no tamanho da prévia; bitmap no tamanho original, já em pé).
  let svg: SvgSource | null = null;
  let source: Drawable;
  let W: number;
  let H: number;
  if (plan.decode === "svg") {
    svg = await readSvg(file);
    const k = 2048 / Math.max(svg.viewBox.w, svg.viewBox.h);
    W = Math.max(1, Math.round(svg.viewBox.w * k));
    H = Math.max(1, Math.round(svg.viewBox.h * k));
    source = await rasterSvg(svgSized(svg, W, H), W, H);
  } else {
    source = await decodeBitmap(file, plan.decode === "heic", attachable);
    ({ w: W, h: H } = sizeOf(source));
  }
  if (!W || !H) throw new IntakeError("Essa imagem está vazia ou corrompida.");

  // 2. Feito no gabarito (pelos pixels do original, antes de qualquer corte): entra como veio.
  const asIs = !treat || Boolean(madeForTemplate?.({ w: W, h: H }, Boolean(svg)));
  const options: ProcessOptions = { removeWhite: removeWhite && !asIs, trim: !asIs, limits, vector: Boolean(svg) };

  // 3. Tratamento no Worker; sem ele (ou se ele falhar), aqui mesmo com os mesmos passos.
  let result: ProcessResult;
  try {
    if (svg || !(typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) || !intakeWorker()) throw new Error("sem worker");
    result = await inWorker(source, options);
  } catch {
    if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap && source.width === 0) {
      // O bitmap foi para o Worker, que falhou: abre de novo.
      source = await decodeBitmap(file, plan.decode === "heic", attachable);
    }
    try {
      result = await processImage(source, W, H, options);
    } catch {
      throw new IntakeError("Não conseguimos preparar a prévia da imagem. Tente PNG, JPG ou WEBP.");
    }
  } finally {
    if ("close" in source) source.close();
  }

  const src = URL.createObjectURL(result.preview);
  // Arquivo de impressão: o SVG sempre com o mesmo viewBox da prévia (recortado se a margem saiu), para a
  // impressão e o 3D terem a mesma escala; senão o tratado ou o original intacto.
  const printFile: Blob = svg ? new Blob([svgSized(svg, result.useful.w, result.useful.h, result.crop)], { type: "image/svg+xml" }) : (result.print ?? file);
  registerSource(src, {
    w: result.useful.w,
    h: result.useful.h,
    file: printFile,
    kind: svg ? "svg" : "image",
    alpha: result.alpha,
    vector: Boolean(svg),
    analysis: result.analysis,
    treatment: { trimmed: Boolean(result.crop), backgroundRemoved: result.removed },
    original: file,
  });
  return { src, px: result.useful, analysis: result.analysis, trimmed: Boolean(result.crop), backgroundRemoved: result.removed, vector: Boolean(svg), alpha: result.alpha };
}
