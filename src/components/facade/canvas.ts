/*
 * Desenho do simulador de fachadas em canvas 2D: leitura das imagens, textura da arte, malha em
 * perspectiva, luz da foto, lupa e exportação. Só roda no navegador (efeitos e eventos); a matemática
 * fica em lib/facade.ts, com testes.
 */
import {
  affineFromTriangles,
  applyHomography,
  boxBlur,
  clamp,
  fitRect,
  inflateTriangle,
  isConvexQuad,
  luminance,
  meshDivisions,
  percentile,
  perspectiveMesh,
  pointInQuad,
  shadeFactor,
  squareToQuad,
  textureSide,
  toPixels,
  type FitMode,
  type Quad,
} from "@/lib/facade";

export type LoadedImage = { url: string; width: number; height: number; naturalWidth: number; naturalHeight: number };

/** O que define a textura da arte e a luz aplicada sobre ela. */
export type SceneArt = {
  /** Imagem do design já decodificada; null = arte de exemplo ("Sua arte aqui"). */
  design: CanvasImageSource | null;
  /** Muda quando o design muda (chave do cache da textura). */
  designKey: string;
  designW: number;
  designH: number;
  /** Largura ÷ altura da fachada. */
  aspect: number;
  fit: FitMode;
  /** Cor das faixas do "Ajustar" e das áreas transparentes da arte. */
  background: string;
  light: number;
  brightness: number;
  edges: number;
  /** Textos da arte de exemplo. */
  title: string;
  subtitle: string;
};

export type PhotoLuma = { w: number; h: number; values: Float32Array };

/** Canvases reaproveitados entre quadros (camada da arte e máscara da luz). */
export type Scratch = { layer: HTMLCanvasElement | null; mask: HTMLCanvasElement | null };

export type StageCache = {
  textureKey: string;
  texture: HTMLCanvasElement | null;
  lumaKey: string;
  luma: PhotoLuma | null;
  lightKey: string;
  light: HTMLCanvasElement | null;
  scratch: Scratch;
};

export function createStageCache(): StageCache {
  return { textureKey: "", texture: null, lumaKey: "", luma: null, lightKey: "", light: null, scratch: { layer: null, mask: null } };
}

// ------------------------------------------------------------------------------------ utilidades

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/** Libera a memória do canvas na hora (o Safari do iPhone tem teto baixo para canvas). */
export function release(canvas: HTMLCanvasElement | null | undefined): void {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

function sized(canvas: HTMLCanvasElement | null, width: number, height: number): HTMLCanvasElement {
  const target = canvas ?? document.createElement("canvas");
  if (target.width !== width) target.width = width;
  if (target.height !== height) target.height = height;
  return target;
}

export function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob"))), type, quality));
}

/** Token de cor do design system (globals.css), lido na hora do desenho. */
function token(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function fontStack(): string {
  return getComputedStyle(document.body).fontFamily || "sans-serif";
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("imagem inválida"));
    image.src = src;
  });
}

/**
 * Abre a imagem no navegador (nada sai do aparelho) e reduz para `maxSide` no lado maior.
 * Devolve uma URL blob: quem chama revoga quando a imagem sai de uso.
 */
export async function readImageFile(file: File, maxSide: number, keepAlpha: boolean): Promise<LoadedImage> {
  const source = URL.createObjectURL(file);
  let image: HTMLImageElement;
  try {
    image = await loadImageElement(source);
  } catch (error) {
    URL.revokeObjectURL(source);
    throw error;
  }
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;
  if (!naturalWidth || !naturalHeight) {
    URL.revokeObjectURL(source);
    throw new Error("imagem vazia");
  }
  const scale = Math.min(1, maxSide / Math.max(naturalWidth, naturalHeight));
  if (scale === 1) return { url: source, width: naturalWidth, height: naturalHeight, naturalWidth, naturalHeight };
  const canvas = createCanvas(naturalWidth * scale, naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(source);
    throw new Error("canvas indisponível");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(source);
  try {
    const blob = await toBlob(canvas, keepAlpha ? "image/png" : "image/jpeg", 0.92);
    return { url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height, naturalWidth, naturalHeight };
  } finally {
    release(canvas);
  }
}

// ------------------------------------------------------------------------------------ textura da arte

function textureKey(art: SceneArt, side: number): string {
  return [art.designKey, art.aspect.toFixed(4), art.fit, art.background, art.brightness.toFixed(2), art.edges.toFixed(2), art.title, art.subtitle, side].join("|");
}

/** A arte no formato da fachada (largura ÷ altura), com encaixe, brilho e bordas, antes da perspectiva. */
export function buildTexture(art: SceneArt, longSide: number): HTMLCanvasElement {
  const aspect = clamp(Number.isFinite(art.aspect) && art.aspect > 0 ? art.aspect : 3, 0.02, 50);
  const width = aspect >= 1 ? longSide : Math.max(8, Math.round(longSide * aspect));
  const height = aspect >= 1 ? Math.max(8, Math.round(longSide / aspect)) : longSide;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = art.background;
  ctx.fillRect(0, 0, width, height);
  if (art.design && art.designW > 0 && art.designH > 0) {
    const rect = fitRect(art.designW, art.designH, width, height, art.fit);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(art.design, rect.x, rect.y, rect.w, rect.h);
  } else {
    paintPlaceholder(ctx, width, height, art.title, art.subtitle);
  }
  if (art.brightness !== 0) {
    // Clarear: "screen" com branco; escurecer: véu preto.
    const level = clamp(Math.abs(art.brightness), 0, 1);
    ctx.globalCompositeOperation = art.brightness > 0 ? "screen" : "source-over";
    ctx.fillStyle = art.brightness > 0 ? `rgba(255,255,255,${level})` : `rgba(0,0,0,${level})`;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
  }
  if (art.edges > 0) paintEdgeShade(ctx, width, height, art.edges);
  return canvas;
}

/** Bordas um pouco mais escuras (moldura, dobra da lona): desenhadas antes da perspectiva, entram em escorço. */
function paintEdgeShade(ctx: CanvasRenderingContext2D, width: number, height: number, strength: number) {
  const band = Math.max(2, Math.min(width, height) * 0.14);
  const alpha = 0.5 * clamp(strength, 0, 1);
  const sides: [number, number, number, number, number, number, number, number][] = [
    [0, 0, 0, band, 0, 0, width, band],
    [0, height, 0, height - band, 0, height - band, width, band],
    [0, 0, band, 0, 0, 0, band, height],
    [width, 0, width - band, 0, width - band, 0, band, height],
  ];
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of sides) {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, `rgba(0,0,0,${alpha})`);
    gradient.addColorStop(0.35, `rgba(0,0,0,${alpha * 0.35})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(rx, ry, rw, rh);
  }
}

/** Arte de exemplo enquanto o design não chega: listras, moldura tracejada e a medida da fachada. */
function paintPlaceholder(ctx: CanvasRenderingContext2D, width: number, height: number, title: string, subtitle: string) {
  const short = Math.min(width, height);
  ctx.fillStyle = token("--color-coral-50", "mistyrose");
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.strokeStyle = token("--color-coral-100", "pink");
  ctx.lineWidth = Math.max(3, short * 0.05);
  const step = ctx.lineWidth * 3;
  for (let x = -height; x < width + height; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, height);
    ctx.lineTo(x + height, 0);
    ctx.stroke();
  }
  ctx.restore();
  const inset = short * 0.07;
  ctx.setLineDash([short * 0.06, short * 0.04]);
  ctx.lineWidth = Math.max(2, short * 0.018);
  ctx.strokeStyle = token("--color-coral-700", "firebrick");
  ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
  ctx.setLineDash([]);

  const font = fontStack();
  let size = Math.min(height * 0.26, width * 0.1);
  ctx.font = `800 ${size}px ${font}`;
  const measured = ctx.measureText(title).width;
  const room = width * 0.8;
  if (measured > room) {
    size *= room / measured;
    ctx.font = `800 ${size}px ${font}`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = token("--color-coral-700", "firebrick");
  ctx.fillText(title, width / 2, height / 2 - (subtitle ? size * 0.32 : 0));
  if (subtitle) {
    ctx.font = `600 ${size * 0.42}px ${font}`;
    ctx.fillStyle = token("--color-ink", "black");
    ctx.fillText(subtitle, width / 2, height / 2 + size * 0.5, room);
  }
}

// ------------------------------------------------------------------------------------ luz da foto

/** Luminância da foto em baixa resolução (já é um desfoque). null se a foto não puder ser lida. */
export function photoLuma(photo: CanvasImageSource, photoW: number, photoH: number, size = 64): PhotoLuma | null {
  const w = size;
  const h = Math.max(1, Math.round((size * photoH) / photoW));
  const canvas = createCanvas(w, h);
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(photo, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const values = new Float32Array(w * h);
    for (let i = 0; i < values.length; i++) values[i] = luminance(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    return { w, h, values };
  } catch {
    // Imagem de outra origem (canvas "contaminado"): segue sem a luz da foto.
    return null;
  } finally {
    release(canvas);
  }
}

/**
 * Mapa de luz (cinza) para multiplicar a arte: a luz local da foto, desfocada na escala da área marcada,
 * dividida pelas partes mais claras da área. Sombras e degradês passam; letras do letreiro antigo, quase não.
 */
export function buildLightMap(luma: PhotoLuma, quad: Quad, strength: number): HTMLCanvasElement {
  const { w, h } = luma;
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const span = Math.min((Math.max(...xs) - Math.min(...xs)) * w, (Math.max(...ys) - Math.min(...ys)) * h);
  const blurred = boxBlur(luma.values, w, h, clamp(Math.round(span / 3), 1, 6));
  const inside: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (pointInQuad({ x: (x + 0.5) / w, y: (y + 0.5) / h }, quad)) inside.push(blurred[y * w + x]);
  }
  const reference = percentile(inside.length >= 4 ? inside : blurred, 0.9);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const image = ctx.createImageData(w, h);
  for (let i = 0; i < blurred.length; i++) {
    const v = Math.round(clamp(shadeFactor(blurred[i], reference, strength), 0, 1) * 255);
    image.data[i * 4] = v;
    image.data[i * 4 + 1] = v;
    image.data[i * 4 + 2] = v;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// ------------------------------------------------------------------------------------ perspectiva

/** Folga (px da textura) em volta de cada triângulo: cobre a borda inflada do recorte. */
const SOURCE_PAD = 4;

/**
 * Desenha a textura no quadrilátero com uma malha de triângulos afins: cada vértice está no ponto exato
 * da homografia, então o resultado acompanha a perspectiva (o erro fica abaixo de meio pixel).
 */
export function drawWarped(ctx: CanvasRenderingContext2D, texture: HTMLCanvasElement, quadPx: Quad, divisions: number, quality: ImageSmoothingQuality): void {
  const tw = texture.width;
  const th = texture.height;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = quality;
  for (const tri of perspectiveMesh(quadPx, tw, th, divisions)) {
    const m = affineFromTriangles(tri.src, tri.dst);
    if (!m) continue;
    const sx = Math.max(0, Math.floor(Math.min(tri.src[0].x, tri.src[1].x, tri.src[2].x)) - SOURCE_PAD);
    const sy = Math.max(0, Math.floor(Math.min(tri.src[0].y, tri.src[1].y, tri.src[2].y)) - SOURCE_PAD);
    const sw = Math.min(tw, Math.ceil(Math.max(tri.src[0].x, tri.src[1].x, tri.src[2].x)) + SOURCE_PAD) - sx;
    const sh = Math.min(th, Math.ceil(Math.max(tri.src[0].y, tri.src[1].y, tri.src[2].y)) + SOURCE_PAD) - sy;
    if (sw <= 0 || sh <= 0) continue;
    // Recorte um pouco maior que o triângulo: sem frestas de antisserrilhado entre vizinhos.
    const clip = inflateTriangle(tri.dst, 0.6);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(clip[0].x, clip[0].y);
    ctx.lineTo(clip[1].x, clip[1].y);
    ctx.lineTo(clip[2].x, clip[2].y);
    ctx.closePath();
    ctx.clip();
    ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    ctx.drawImage(texture, sx, sy, sw, sh, sx, sy, sw, sh);
    ctx.restore();
  }
}

type CompositeInput = {
  photo: CanvasImageSource;
  texture: HTMLCanvasElement | null;
  light: HTMLCanvasElement | null;
  quadPx: Quad;
  divisions: number;
  quality: ImageSmoothingQuality;
};

/** Foto + arte em perspectiva multiplicada pela luz da foto (só dentro da arte). */
function composite(target: HTMLCanvasElement, input: CompositeInput, scratch: Scratch): void {
  const ctx = target.getContext("2d");
  if (!ctx) return;
  const { width, height } = target;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(input.photo, 0, 0, width, height);
  if (!input.texture) return;

  const layer = sized(scratch.layer, width, height);
  scratch.layer = layer;
  const lctx = layer.getContext("2d");
  if (!lctx) return;
  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.globalCompositeOperation = "source-over";
  lctx.clearRect(0, 0, width, height);
  drawWarped(lctx, input.texture, input.quadPx, meshDivisions(input.quadPx, input.divisions), input.quality);

  if (input.light) {
    // A luz passa pela máscara da arte antes do "multiply": fora dela, nada muda.
    const mask = sized(scratch.mask, width, height);
    scratch.mask = mask;
    const mctx = mask.getContext("2d");
    if (mctx) {
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.globalCompositeOperation = "source-over";
      mctx.clearRect(0, 0, width, height);
      mctx.imageSmoothingEnabled = true;
      mctx.imageSmoothingQuality = "high";
      mctx.drawImage(input.light, 0, 0, width, height);
      mctx.globalCompositeOperation = "destination-in";
      mctx.drawImage(layer, 0, 0);
      mctx.globalCompositeOperation = "source-over";
      lctx.globalCompositeOperation = "multiply";
      lctx.drawImage(mask, 0, 0);
      lctx.globalCompositeOperation = "source-over";
    }
  }
  ctx.drawImage(layer, 0, 0);
}

// ------------------------------------------------------------------------------------ palco (prévia ao vivo)

export type StageInput = {
  photo: CanvasImageSource;
  photoW: number;
  photoH: number;
  /** Muda quando a foto muda (cache da luz). */
  photoKey: string;
  art: SceneArt;
  /** Marcação em coordenadas 0–1 da foto. */
  quad: Quad;
  showDesign: boolean;
  /** Largura do palco na tela (px CSS). */
  cssWidth: number;
  /** Arrastando: malha mais leve, qualidade menor. */
  draft: boolean;
};

function cachedLight(cache: StageCache, input: StageInput): HTMLCanvasElement | null {
  if (input.art.light <= 0) return null;
  if (!cache.luma || cache.lumaKey !== input.photoKey) {
    cache.luma = photoLuma(input.photo, input.photoW, input.photoH);
    cache.lumaKey = input.photoKey;
  }
  if (!cache.luma) return null;
  const key = [input.photoKey, input.art.light.toFixed(2), ...input.quad.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`)].join("|");
  if (!cache.light || cache.lightKey !== key) {
    release(cache.light);
    cache.light = buildLightMap(cache.luma, input.quad, input.art.light);
    cache.lightKey = key;
  }
  return cache.light;
}

/** Desenha a prévia no canvas do palco, na resolução da tela (até a da foto). */
export function renderStage(canvas: HTMLCanvasElement, cache: StageCache, input: StageInput): void {
  const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
  const width = Math.max(1, Math.round(Math.min(input.cssWidth * dpr, input.photoW)));
  const height = Math.max(1, Math.round((width * input.photoH) / input.photoW));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const quadPx = toPixels(input.quad, width, height);
  let texture: HTMLCanvasElement | null = null;
  let light: HTMLCanvasElement | null = null;
  if (input.showDesign && isConvexQuad(quadPx)) {
    const side = textureSide(quadPx, 2048);
    const key = textureKey(input.art, side);
    if (!cache.texture || cache.textureKey !== key) {
      release(cache.texture);
      cache.texture = buildTexture(input.art, side);
      cache.textureKey = key;
    }
    texture = cache.texture;
    light = cachedLight(cache, input);
  }
  composite(canvas, { photo: input.photo, texture, light, quadPx, divisions: input.draft ? 10 : 24, quality: input.draft ? "low" : "medium" }, cache.scratch);
}

/** Solta a memória dos canvases guardados no cache (ao sair da página). */
export function releaseStageCache(cache: StageCache): void {
  release(cache.texture);
  release(cache.light);
  release(cache.scratch.layer);
  release(cache.scratch.mask);
  cache.texture = null;
  cache.light = null;
  cache.luma = null;
  cache.textureKey = "";
  cache.lightKey = "";
  cache.lumaKey = "";
  cache.scratch.layer = null;
  cache.scratch.mask = null;
}

// ------------------------------------------------------------------------------------ exportação

export type SimulationInput = {
  photo: CanvasImageSource;
  photoW: number;
  photoH: number;
  art: SceneArt;
  quad: Quad;
  showDesign: boolean;
};

/** A simulação inteira num canvas novo, com malha fina e qualidade máxima. */
export function renderSimulation(input: SimulationInput, width: number, height: number): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const quadPx = toPixels(input.quad, canvas.width, canvas.height);
  const scratch: Scratch = { layer: null, mask: null };
  let texture: HTMLCanvasElement | null = null;
  let light: HTMLCanvasElement | null = null;
  if (input.showDesign && isConvexQuad(quadPx)) {
    texture = buildTexture(input.art, textureSide(quadPx, 4096));
    if (input.art.light > 0) {
      const luma = photoLuma(input.photo, input.photoW, input.photoH);
      if (luma) light = buildLightMap(luma, input.quad, input.art.light);
    }
  }
  composite(canvas, { photo: input.photo, texture, light, quadPx, divisions: 48, quality: "high" }, scratch);
  release(texture);
  release(light);
  release(scratch.layer);
  release(scratch.mask);
  return canvas;
}

/** PNG na resolução da foto (a de edição, até 2400 px no lado maior). */
export async function exportSimulation(input: SimulationInput): Promise<Blob> {
  const canvas = renderSimulation(input, input.photoW, input.photoH);
  try {
    return await toBlob(canvas, "image/png");
  } finally {
    release(canvas);
  }
}

/** Miniatura JPEG (até `maxSide` px) para o carrinho: a simulação ou, sem foto, só a arte. */
export function simulationThumbnail(input: SimulationInput | null, art: SceneArt, maxSide = 360): string {
  if (input) {
    const scale = Math.min(1, maxSide / Math.max(input.photoW, input.photoH));
    const canvas = renderSimulation(input, input.photoW * scale, input.photoH * scale);
    try {
      return canvas.toDataURL("image/jpeg", 0.82);
    } finally {
      release(canvas);
    }
  }
  const canvas = createCanvas(maxSide, Math.round(maxSide * 0.75));
  const texture = buildTexture(art, maxSide);
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return texture.toDataURL("image/jpeg", 0.82);
    ctx.fillStyle = token("--color-mist", "whitesmoke");
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const rect = fitRect(texture.width, texture.height, canvas.width * 0.88, canvas.height * 0.88, "contain");
    ctx.drawImage(texture, rect.x + canvas.width * 0.06, rect.y + canvas.height * 0.06, rect.w, rect.h);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    release(texture);
    release(canvas);
  }
}

// ------------------------------------------------------------------------------------ lupa

/** Lupa redonda em volta do canto arrastado: a foto ampliada, o contorno da marcação e a mira. */
export function drawLoupe(
  canvas: HTMLCanvasElement,
  photo: CanvasImageSource,
  photoW: number,
  photoH: number,
  quad: Quad,
  corner: number,
  stageWidth: number,
  cssSize: number,
  zoom = 3,
): void {
  const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
  const size = Math.round(cssSize * dpr);
  if (canvas.width !== size) canvas.width = size;
  if (canvas.height !== size) canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx || stageWidth <= 0) return;
  const span = (cssSize / zoom) * (photoW / stageWidth);
  const k = size / span;
  const sx = quad[corner].x * photoW - span / 2;
  const sy = quad[corner].y * photoH - span / 2;
  const c = size / 2;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = token("--color-graphite", "dimgray");
  ctx.fillRect(0, 0, size, size);
  // Recorte manual: a parte da lupa fora da foto fica no fundo escuro.
  const x0 = Math.max(0, sx);
  const y0 = Math.max(0, sy);
  const x1 = Math.min(photoW, sx + span);
  const y1 = Math.min(photoH, sy + span);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (x1 > x0 && y1 > y0) ctx.drawImage(photo, x0, y0, x1 - x0, y1 - y0, (x0 - sx) * k, (y0 - sy) * k, (x1 - x0) * k, (y1 - y0) * k);

  ctx.beginPath();
  quad.forEach((p, i) => {
    const x = (p.x * photoW - sx) * k;
    const y = (p.y * photoH - sy) * k;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.lineWidth = 3 * dpr;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.stroke();
  ctx.lineWidth = 1.5 * dpr;
  ctx.strokeStyle = "white";
  ctx.stroke();

  const arm = size * 0.14;
  ctx.strokeStyle = token("--color-coral", "red");
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath();
  ctx.moveTo(c - arm, c);
  ctx.lineTo(c + arm, c);
  ctx.moveTo(c, c - arm);
  ctx.lineTo(c, c + arm);
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(c, c, c - 1.5 * dpr, 0, Math.PI * 2);
  ctx.lineWidth = 3 * dpr;
  ctx.strokeStyle = "white";
  ctx.stroke();
}

// ------------------------------------------------------------------------------------ foto de exemplo

/** Faixa do letreiro na fachada desenhada (0–1): vira a marcação inicial da foto de exemplo. */
const DEMO_BAND = { x0: 0.08, y0: 0.08, x1: 0.92, y1: 0.3 };

/** Frente de loja vista de frente: parede, faixa do letreiro em branco, vitrine e porta. */
function paintStorefront(w: number, h: number): HTMLCanvasElement {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  let gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, "#ddd3c6");
  gradient.addColorStop(1, "#c6b8a6");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(0,0,0,0.035)";
  for (let y = 18; y < h; y += 36) ctx.fillRect(0, y, w, 2);

  const bx = w * DEMO_BAND.x0;
  const by = h * DEMO_BAND.y0;
  const bw = w * (DEMO_BAND.x1 - DEMO_BAND.x0);
  const bh = h * (DEMO_BAND.y1 - DEMO_BAND.y0);
  gradient = ctx.createLinearGradient(0, by + bh + 5, 0, by + bh + 55);
  gradient.addColorStop(0, "rgba(0,0,0,0.3)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(bx, by + bh + 5, bw, 50);
  gradient = ctx.createLinearGradient(0, by, 0, by + bh);
  gradient.addColorStop(0, "#f2efea");
  gradient.addColorStop(1, "#d9d3ca");
  ctx.fillStyle = gradient;
  ctx.fillRect(bx, by, bw, bh);
  ctx.lineWidth = 10;
  ctx.strokeStyle = "#8f8a83";
  ctx.strokeRect(bx, by, bw, bh);

  const gx = w * 0.12;
  const gy = h * 0.4;
  const gw = w * 0.76;
  const gh = h * 0.52;
  gradient = ctx.createLinearGradient(0, gy, 0, gy + gh);
  gradient.addColorStop(0, "#344453");
  gradient.addColorStop(1, "#141c24");
  ctx.fillStyle = gradient;
  ctx.fillRect(gx, gy, gw, gh);
  ctx.save();
  ctx.beginPath();
  ctx.rect(gx, gy, gw, gh);
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (const start of [0.05, 0.42, 0.7]) {
    ctx.beginPath();
    ctx.moveTo(gx + gw * start, gy);
    ctx.lineTo(gx + gw * (start + 0.16), gy);
    ctx.lineTo(gx + gw * (start + 0.02), gy + gh);
    ctx.lineTo(gx + gw * (start - 0.14), gy + gh);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = "#c3c8cc";
  ctx.fillRect(gx - 8, gy - 8, gw + 16, 14);
  ctx.fillRect(gx - 8, gy, 14, gh);
  ctx.fillRect(gx + gw - 6, gy, 14, gh);
  for (const at of [1 / 3, 2 / 3]) ctx.fillRect(gx + gw * at - 6, gy, 12, gh);
  ctx.fillRect(gx, gy + gh * 0.14, gw, 10);
  ctx.fillStyle = "#e3e6e8";
  ctx.fillRect(gx + gw * 0.5 - 30, gy + gh * 0.5, 8, 90);
  ctx.fillRect(gx + gw * 0.5 + 22, gy + gh * 0.5, 8, 90);

  ctx.fillStyle = "#9a958e";
  ctx.fillRect(0, gy + gh, w, h - (gy + gh));
  gradient = ctx.createLinearGradient(0, 0, w, 0);
  gradient.addColorStop(0, "rgba(255,248,235,0.06)");
  gradient.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  return canvas;
}

/**
 * Foto de exemplo para testar sem foto própria: a frente de loja desenhada e vista em perspectiva,
 * com a marcação já na faixa do letreiro.
 */
export async function createDemoPhoto(): Promise<{ blob: Blob; width: number; height: number; quad: Quad }> {
  const width = 1600;
  const height = 1100;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível");
  let gradient = ctx.createLinearGradient(0, 0, 0, height * 0.6);
  gradient.addColorStop(0, "#b9d3e6");
  gradient.addColorStop(1, "#eaf1f5");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#a9a39b";
  ctx.fillRect(0, 30, 210, height);
  ctx.fillStyle = "#cbc4b8";
  ctx.fillRect(1410, 130, width - 1410, height);
  ctx.fillStyle = "#8e8a85";
  ctx.fillRect(0, 990, width, height - 990);
  gradient = ctx.createLinearGradient(0, 1045, 0, height);
  gradient.addColorStop(0, "#6c6a68");
  gradient.addColorStop(1, "#555351");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 1045, width, height - 1045);

  // Lado esquerdo mais perto da câmera: maior; o direito some em perspectiva.
  const front = paintStorefront(1400, 1000);
  const target: Quad = [
    { x: 210, y: 60 },
    { x: 1410, y: 175 },
    { x: 1410, y: 985 },
    { x: 210, y: 1060 },
  ];
  drawWarped(ctx, front, target, 32, "high");
  release(front);

  const m = squareToQuad(target);
  const band: Quad = [
    { x: DEMO_BAND.x0, y: DEMO_BAND.y0 },
    { x: DEMO_BAND.x1, y: DEMO_BAND.y0 },
    { x: DEMO_BAND.x1, y: DEMO_BAND.y1 },
    { x: DEMO_BAND.x0, y: DEMO_BAND.y1 },
  ];
  const quad = band.map((p) => {
    const at = m ? applyHomography(m, p) : { x: p.x * width, y: p.y * height };
    return { x: at.x / width, y: at.y / height };
  }) as Quad;
  try {
    const blob = await toBlob(canvas, "image/jpeg", 0.9);
    return { blob, width, height, quad };
  } finally {
    release(canvas);
  }
}
