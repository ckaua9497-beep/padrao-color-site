/*
 * Tratador automático da imagem que o cliente envia (núcleo puro, sem DOM; testado com node --test).
 * Recebe os pixels RGBA de uma AMOSTRA reduzida da imagem (~256 px no lado maior) e decide:
 * - a margem vazia a cortar (transparente ou de cor chapada);
 * - o tipo (foto × arte/logo) e o centro de interesse da foto;
 * - o encaixe na área de impressão: foto cobre a área recortando pelo centro de interesse (se o corte for
 *   pequeno); arte/logo fica inteira, centrada e com respiro, sem passar da resolução que imprime nítido;
 * - a resolução mínima por tamanho da peça, o tamanho da cópia de prévia e da textura do 3D.
 * A parte do navegador (decodificar, girar pelo EXIF, SVG, recortar, gerar a prévia) está em
 * src/components/mockup/image-intake.ts.
 */

export type Pixels = { data: Uint8Array | Uint8ClampedArray; width: number; height: number };
/** Caixa em frações da imagem (0..1). */
export type FracBox = { x: number; y: number; w: number; h: number };
export type ImageKind = "photo" | "graphic";

export type ImageAnalysis = {
  /** Fração de pixels transparentes (alpha < 128). */
  transparent: number;
  /** Algum pixel com transparência (alpha < 255), por menor que seja: a prévia sai em PNG. */
  alpha?: boolean;
  /** Borda da imagem: cor mediana, se é transparente e se é uniforme (margem a cortar / cor de fundo). */
  border: { rgb: [number, number, number]; transparent: boolean; uniform: boolean };
  /** Conteúdo sem a margem uniforme (branca, de cor chapada ou transparente). */
  content: FracBox;
  /** Cores distintas relevantes no conteúdo (4 bits por canal). Logo/arte chapada tem poucas. */
  colors: number;
  /** Fração do conteúdo nas 6 cores mais frequentes: arte chapada fica perto de 1, foto bem abaixo. */
  flat?: number;
  /** Fração do conteúdo com variação suave de luz (sombreamento, dobra, degradê): alta em foto, baixa em logo. */
  soft?: number;
  kind: ImageKind;
  /** Centro de interesse (fração da imagem): onde o recorte "cobrir" se apoia. */
  focus: { x: number; y: number };
};

const TOL = 26; // diferença máxima por canal para "mesma cor" na borda (ruído de JPEG)
/** Tolerância apertada do corte de margem e da remoção do fundo: traço fino e texto claro não somem. */
export const TIGHT_TOL = 12;
const CLEAR = 8; // alfa abaixo disso: fundo transparente (o antialias do logo conta como conteúdo)
const SOLID = 250; // alfa a partir disso: opaco (pixel semitransparente não dá a cor da borda)

function px(p: Pixels, x: number, y: number): [number, number, number, number] {
  const i = (y * p.width + x) * 4;
  return [p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]];
}

const near = (a: readonly number[], b: readonly number[], tol = TOL) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

/** Anel entre `from` e `to` px da borda: fração sem alfa, cor mediana dos opacos e fração perto dela. */
function ringStats(p: Pixels, from: number, to: number) {
  const { data, width: w, height: h } = p;
  let total = 0;
  let clear = 0;
  const solid: number[] = [];
  const visit = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    total += 1;
    if (data[i + 3] < 16) clear += 1;
    else if (data[i + 3] >= SOLID) solid.push(i);
  };
  for (let y = from; y < h - from; y += 1) {
    if (y < to || y >= h - to) {
      for (let x = from; x < w - from; x += 1) visit(x, y);
      continue;
    }
    for (let x = from; x < Math.min(to, w - from); x += 1) visit(x, y);
    for (let x = Math.max(to, w - to); x < w - from; x += 1) visit(x, y);
  }
  const rgb: [number, number, number] = solid.length ? [median(solid.map((i) => data[i])), median(solid.map((i) => data[i + 1])), median(solid.map((i) => data[i + 2]))] : [255, 255, 255];
  const same = solid.filter((i) => near([data[i], data[i + 1], data[i + 2]], rgb)).length;
  const n = Math.max(1, total);
  return { rgb, clear: clear / n, same: same / n, total };
}

/**
 * Borda: uma faixa de ~3% de cada lado (mín. 2 px), não só o anel de 1 px — o antialias da redução não decide
 * sozinho. Transparente: >90% da faixa sem alfa. Uniforme: >92% da faixa opaca e perto da mediana. Pixel
 * semitransparente não conta como cor. Faixa misturada por um filete de moldura (1–2% do lado): vale o anel de
 * dentro (3–6%), se ele for liso — o fundo da arte é o de dentro, não a cor do filete.
 */
export function borderOf(p: Pixels): ImageAnalysis["border"] {
  const depth = Math.max(2, Math.round(Math.min(p.width, p.height) * 0.03));
  const outer = ringStats(p, 0, depth);
  if (outer.clear > 0.9) return { rgb: outer.rgb, transparent: true, uniform: true };
  if (outer.same > 0.92) return { rgb: outer.rgb, transparent: false, uniform: true };
  if (Math.min(p.width, p.height) > depth * 6) {
    const inner = ringStats(p, depth, depth * 2);
    if (inner.clear > 0.9) return { rgb: inner.rgb, transparent: true, uniform: true };
    if (inner.same > 0.92) return { rgb: inner.rgb, transparent: false, uniform: true };
  }
  return { rgb: outer.rgb, transparent: false, uniform: false };
}

/**
 * Caixa do conteúdo: descarta linhas/colunas inteiras de fundo (transparente ou da cor da borda). Qualquer pixel
 * fora do fundo conta (traço fino, tagline clara, antialias), com tolerância apertada, e sobra uma folga de 1% do
 * lado. Imagem só de fundo (chapada) ou com conteúdo minúsculo: não corta.
 */
export function contentBox(p: Pixels, border: ImageAnalysis["border"], tol = TIGHT_TOL): FracBox {
  const full: FracBox = { x: 0, y: 0, w: 1, h: 1 };
  if (!border.uniform) return full;
  const { data, width: w, height: h } = p;
  const [r, g, b] = border.rgb;
  const isBg = border.transparent
    ? (i: number) => data[i + 3] < CLEAR
    : (i: number) => data[i + 3] >= SOLID && Math.abs(data[i] - r) <= tol && Math.abs(data[i + 1] - g) <= tol && Math.abs(data[i + 2] - b) <= tol;
  const rowBg = (y: number) => {
    for (let x = 0, i = y * w * 4; x < w; x += 1, i += 4) if (!isBg(i)) return false;
    return true;
  };
  const colBg = (x: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y += 1) if (!isBg((y * w + x) * 4)) return false;
    return true;
  };
  let top = 0;
  while (top < h && rowBg(top)) top += 1;
  if (top === h) return full;
  let bottom = h - 1;
  while (bottom > top && rowBg(bottom)) bottom -= 1;
  let left = 0;
  while (left < w - 1 && colBg(left, top, bottom)) left += 1;
  let right = w - 1;
  while (right > left && colBg(right, top, bottom)) right -= 1;
  if ((right - left + 1) * (bottom - top + 1) < w * h * 0.0004) return full;
  const pad = Math.max(1, Math.round(Math.max(w, h) * 0.01));
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  right = Math.min(w - 1, right + pad);
  bottom = Math.min(h - 1, bottom + pad);
  return { x: left / w, y: top / h, w: (right - left + 1) / w, h: (bottom - top + 1) / h };
}

/**
 * Cores relevantes (≥0,1% dos pixels opacos, 4 bits por canal) e a fração do conteúdo nas 6 mais frequentes
 * (`flat`): logo/arte chapada concentra quase tudo em poucas cores, mesmo com o antialias das bordas.
 */
export function colorStats(p: Pixels, box: FracBox): { colors: number; flat: number } {
  const bins = new Map<number, number>();
  let total = 0;
  const x0 = Math.floor(box.x * p.width);
  const y0 = Math.floor(box.y * p.height);
  const x1 = Math.min(p.width, Math.ceil((box.x + box.w) * p.width));
  const y1 = Math.min(p.height, Math.ceil((box.y + box.h) * p.height));
  for (let y = y0; y < y1; y += 1)
    for (let x = x0; x < x1; x += 1) {
      const c = px(p, x, y);
      if (c[3] < 128) continue;
      const key = ((c[0] >> 4) << 8) | ((c[1] >> 4) << 4) | (c[2] >> 4);
      bins.set(key, (bins.get(key) ?? 0) + 1);
      total += 1;
    }
  let colors = 0;
  for (const count of bins.values()) if (count >= total * 0.001) colors += 1;
  const top = [...bins.values()].sort((a, b) => b - a).slice(0, 6).reduce((sum, n) => sum + n, 0);
  return { colors, flat: total ? top / total : 1 };
}

/**
 * Fração dos pixels do conteúdo cuja vizinhança 3×3 varia pouco mas não nada (3 a 24 níveis de luz): o
 * sombreamento de volume, as dobras e os degradês de uma foto. Logo/arte é feito de áreas lisas e bordas fortes.
 */
export function softShading(p: Pixels, box: FracBox): number {
  const { data, width: w, height: h } = p;
  const luma = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) luma[i] = data[i * 4 + 3] < 128 ? -1 : 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  const x0 = Math.max(1, Math.floor(box.x * w));
  const y0 = Math.max(1, Math.floor(box.y * h));
  const x1 = Math.min(w - 1, Math.ceil((box.x + box.w) * w));
  const y1 = Math.min(h - 1, Math.ceil((box.y + box.h) * h));
  let total = 0;
  let soft = 0;
  for (let y = y0; y < y1; y += 1)
    for (let x = x0; x < x1; x += 1) {
      const c = luma[y * w + x];
      if (c < 0) continue;
      let lo = c;
      let hi = c;
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          const v = luma[(y + dy) * w + x + dx];
          if (v < 0) continue;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      total += 1;
      if (hi - lo > 2 && hi - lo <= 24) soft += 1;
    }
  return total ? soft / total : 0;
}

/** Cores relevantes no conteúdo (ver colorStats). */
export function colorCount(p: Pixels, box: FracBox): number {
  return colorStats(p, box).colors;
}

/**
 * Centro de interesse: energia de borda (gradiente de luma) + saturação numa grade 24×24, com leve
 * preferência pelo centro. Barato e determinístico.
 */
export function focusPoint(p: Pixels, box: FracBox): { x: number; y: number } {
  const G = 24;
  const energy = new Float64Array(G * G);
  const luma = (c: number[]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  for (let y = 1; y < p.height - 1; y += 1)
    for (let x = 1; x < p.width - 1; x += 1) {
      const c = px(p, x, y);
      if (c[3] < 128) continue;
      const gx = luma(px(p, x + 1, y)) - luma(px(p, x - 1, y));
      const gy = luma(px(p, x, y + 1)) - luma(px(p, x, y - 1));
      const sat = Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
      const cell = Math.min(G - 1, Math.floor((y / p.height) * G)) * G + Math.min(G - 1, Math.floor((x / p.width) * G));
      energy[cell] += Math.hypot(gx, gy) + sat * 0.15;
    }
  const sorted = [...energy].sort((a, b) => a - b);
  const cut = sorted[Math.floor(sorted.length * 0.8)];
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (let i = 0; i < energy.length; i += 1) {
    if (energy[i] < cut || energy[i] <= 0) continue;
    const cx = ((i % G) + 0.5) / G;
    const cy = (Math.floor(i / G) + 0.5) / G;
    const prior = Math.exp(-((cx - 0.5) ** 2 + (cy - 0.5) ** 2) / (2 * 0.4 ** 2));
    const wgt = energy[i] * prior;
    sx += cx * wgt;
    sy += cy * wgt;
    sw += wgt;
  }
  if (!sw) return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  return { x: sx / sw, y: sy / sw };
}

/** Borda lisa conta como arte com até tantas cores relevantes, ou com tanto do conteúdo nas 6 principais. */
const GRAPHIC_COLORS = 64;
const GRAPHIC_FLAT = 0.8;
/** Acima disso de sombreamento suave é foto, mesmo com poucas cores e fundo liso (foto de estúdio em branco). */
const PHOTO_SOFT = 0.35;

export function analyzeImage(p: Pixels): ImageAnalysis {
  let clear = 0;
  let alpha = false;
  for (let i = 3; i < p.data.length; i += 4) {
    if (p.data[i] < 255) alpha = true;
    if (p.data[i] < 128) clear += 1;
  }
  const transparent = clear / Math.max(1, p.width * p.height);
  const border = borderOf(p);
  const content = contentBox(p, border);
  const { colors, flat } = colorStats(p, content);
  const soft = softShading(p, content);
  // Arte/logo: tem transparência de verdade; ou, sem o sombreamento suave de foto, é chapada de ponta a ponta
  // (≤ 12 cores) ou tem a borda de uma cor só com poucas cores dominando. Borda lisa sozinha não basta: foto de
  // estúdio em fundo branco, céu e degradê também têm, mas com luz variando aos poucos. Arte "sangrada" (flyer
  // com degradê até a borda) cai em foto: preencher é o certo para ela também.
  const flatArt = soft < PHOTO_SOFT && (colors <= 12 || (border.uniform && (colors <= GRAPHIC_COLORS || flat >= GRAPHIC_FLAT)));
  const graphic = transparent >= 0.02 || flatArt;
  return { transparent, alpha, border, content, colors, flat, soft, kind: graphic ? "graphic" : "photo", focus: focusPoint(p, content) };
}

/** Vale cortar a margem? Só se ela for de verdade (sobra mais de 3% em algum lado). */
export function worthTrimming(a: ImageAnalysis): boolean {
  return a.kind === "graphic" && a.border.uniform && a.content.w * a.content.h < 0.94;
}

/** Fundo branco (ou quase) de logo opaco: candidato a sair em peça cujo fundo não é impresso (camisa, sacola). */
export function hasWhiteBackground(a: ImageAnalysis): boolean {
  return a.kind === "graphic" && a.border.uniform && !a.border.transparent && a.border.rgb.every((v) => v >= 232);
}

/**
 * Tira o fundo ligado à borda (preenchimento a partir das bordas, na cor `rgb` com tolerância): só o fundo
 * "de fora" vira transparente; o branco DENTRO do logo (letras vazadas fechadas) fica. A faixa de transição
 * ganha alfa parcial para a borda do logo não serrilhar. Altera `p.data` e devolve quantos pixels saíram.
 */
export function removeBorderBackground(p: Pixels, rgb: readonly number[], tol = 10): number {
  const { width: w, height: h, data } = p;
  const dist = (i: number) => Math.max(Math.abs(data[i] - rgb[0]), Math.abs(data[i + 1] - rgb[1]), Math.abs(data[i + 2] - rgb[2]));
  const seen = new Uint8Array(w * h);
  // Pilha em Int32Array que cresce sob demanda (imagem em resolução cheia: dezenas de milhões de pixels).
  let stack = new Int32Array(Math.min(w * h, 1 << 16));
  let size = 0;
  const push = (x: number, y: number) => {
    const k = y * w + x;
    if (seen[k]) return;
    seen[k] = 1;
    if (data[k * 4 + 3] === 0 || dist(k * 4) > tol * 1.6) return;
    if (size === stack.length) {
      const grown = new Int32Array(Math.min(w * h, stack.length * 2));
      grown.set(stack);
      stack = grown;
    }
    stack[size] = k;
    size += 1;
  };
  for (let x = 0; x < w; x += 1) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y += 1) {
    push(0, y);
    push(w - 1, y);
  }
  let removed = 0;
  while (size) {
    size -= 1;
    const k = stack[size];
    const i = k * 4;
    const d = dist(i);
    if (d <= tol) {
      data[i + 3] = 0;
      removed += 1;
    } else {
      // Transição (antialias): alfa proporcional à distância da cor do fundo; não se espalha a partir daqui.
      data[i + 3] = Math.min(data[i + 3], Math.round(255 * Math.min(1, (d - tol) / (tol * 0.6))));
      continue;
    }
    const x = k % w;
    const y = (k - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  return removed;
}

/** O foco recalculado dentro do recorte (a prévia já sai cortada). */
export function focusInside(focus: { x: number; y: number }, crop: FracBox): { x: number; y: number } {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { x: clamp((focus.x - crop.x) / Math.max(1e-6, crop.w)), y: clamp((focus.y - crop.y) / Math.max(1e-6, crop.h)) };
}

// ------------------------------------------------------------------------------------- encaixe

export const hexOf = (rgb: readonly number[]) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;

/** Resolução mínima e boa pelo tamanho da peça (lado maior em cm): de longe, menos pontos bastam. */
export function dpiTargets(longCm: number): { min: number; good: number } {
  if (longCm >= 100) return { min: 50, good: 100 }; // lona, faixa, painel
  if (longCm >= 40) return { min: 100, good: 150 }; // banner, quadro, almofada grande
  return { min: 150, good: 300 }; // cartão, caneca, adesivo, embalagem: visto de perto
}

/** Qualidade da impressão pela resolução efetiva e pelo tamanho da peça (meio ponto de folga no arredondamento). */
export function printQuality(dpi: number, longCm = 0): "baixa" | "ok" | "ótima" {
  const { min, good } = dpiTargets(longCm);
  if (dpi + 0.5 >= good) return "ótima";
  if (dpi + 0.5 >= min) return "ok";
  return "baixa";
}

/** O encaixe automático para 2% acima da resolução mínima (nunca no limite exato, que viraria "baixa"). */
export const DPI_MARGIN = 1.02;

/** Teto de canvas do navegador: Safari no iPhone/iPad recusa canvas acima de 4096 × 4096 (16,7 MP). */
export function canvasLimitsFor(userAgent: string, maxTouchPoints = 0): { pixels: number; side: number } {
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  return ios ? { pixels: 16_000_000, side: 4096 } : { pixels: 40_000_000, side: 12_000 };
}

/** Posição da imagem na área (frações da área; escala relativa à imagem inteira "contida"). */
export type AreaPlacement = { x: number; y: number; scale: number; rotation: number };

export type FitMode = "fill" | "whole";

export type AutoFit = {
  mode: FitMode;
  placement: AreaPlacement;
  /** A imagem pode passar da área (preencher): o que passar fica cortado. */
  overflow: boolean;
  /** Fundo atrás da imagem: a cor da borda da arte (fica contínuo) ou null (mantém o atual). */
  background: string | null;
  /** Fração da imagem que fica fora da área ao preencher (0 = nada). */
  cropLoss: number;
  /** A escala foi limitada para não imprimir abaixo da resolução mínima. */
  limitedByDpi: boolean;
  /** Resolução efetiva (pontos por polegada) na medida colocada; null se a medida da peça não é conhecida. */
  dpi: number | null;
};

export type FitContext = {
  /** Largura ÷ altura da área de impressão. */
  areaAspect: number;
  /** Medida física da área (cm), para a resolução; null = desconhecida. */
  areaCm?: { w: number; h: number } | null;
  /** Pixels úteis da imagem (já sem a margem cortada). */
  px: { w: number; h: number };
  /** Peça de volta (caneca, copo, garrafa): fração da largura que fica de frente; o logo vai nela. */
  frontWindow?: number;
  /** Peça em que o fundo da arte não é impresso (estampa de tecido, sacola plástica): sem fundo de cor. */
  transparentBase?: boolean;
  /** Vetor (SVG): imprime nítido em qualquer tamanho. */
  vector?: boolean;
  /** Corte máximo aceitável ao preencher (fração da imagem); acima disso a foto entra inteira. */
  maxLoss?: number;
};

/** Caixa "contida" da imagem na área (frações da área): a base de AreaPlacement.scale = 1. */
export function containFraction(imageAspect: number, areaAspect: number): { w: number; h: number } {
  return imageAspect > areaAspect ? { w: 1, h: areaAspect / imageAspect } : { w: imageAspect / areaAspect, h: 1 };
}

/** Quanto da imagem fica fora da área ao preencher (cobrir). */
export function coverLoss(imageAspect: number, areaAspect: number): number {
  return imageAspect > areaAspect ? 1 - areaAspect / imageAspect : 1 - imageAspect / areaAspect;
}

/**
 * Encaixe automático na área de impressão:
 * - `fill` (foto): cobre a área inteira, centrada no foco e sem deixar faixa vazia;
 * - `whole` (arte/logo, ou foto que perderia demais): inteira, centrada, com respiro (logo) e sem passar
 *   da escala em que imprime abaixo da resolução mínima; o fundo vira a cor da borda da arte.
 * `mode` força um dos dois (botões "Preencher a área" / "Imagem inteira").
 */
export function autoFit(a: ImageAnalysis, ctx: FitContext, mode?: FitMode): AutoFit {
  const imageAspect = ctx.px.w / Math.max(1, ctx.px.h);
  const base = containFraction(imageAspect, ctx.areaAspect);
  const loss = coverLoss(imageAspect, ctx.areaAspect);
  const maxLoss = ctx.maxLoss ?? 0.45;
  const chosen: FitMode = mode ?? (a.kind === "photo" && loss <= maxLoss ? "fill" : "whole");
  // Fundo da cor da borda só em imagem opaca: com transparência, ele pintaria os vazados (logo com contorno vira
  // um retângulo da cor do contorno).
  const opaque = a.transparent < 0.02;
  const borderColor = !ctx.transparentBase && opaque && a.border.uniform && !a.border.transparent ? hexOf(a.border.rgb) : null;
  const longCm = ctx.areaCm ? Math.max(ctx.areaCm.w, ctx.areaCm.h) : 0;
  const dpiAt = (scale: number) => (ctx.areaCm && ctx.areaCm.w > 0 ? ctx.px.w / ((ctx.areaCm.w * base.w * scale) / 2.54) : null);

  if (chosen === "fill") {
    const scale = Math.max(1 / base.w, 1 / base.h) * 1.001;
    const dw = base.w * scale;
    const dh = base.h * scale;
    // O foco vai para o centro da área (ou da janela frontal), sem abrir faixa vazia nas bordas.
    const shift = (focus: number, size: number) => Math.min(size / 2, Math.max(1 - size / 2, 0.5 - (focus - 0.5) * size));
    return {
      mode: "fill",
      placement: { x: shift(a.focus.x, dw), y: shift(a.focus.y, dh), scale, rotation: 0 },
      overflow: true,
      background: null,
      cropLoss: loss,
      limitedByDpi: false,
      dpi: dpiAt(scale),
    };
  }

  // Inteira: logo/arte com respiro de 8%; foto inteira sem respiro (o fundo da borda completa a área).
  const graphic = a.kind === "graphic";
  let scale = graphic ? 0.84 : 1;
  // Caneca, copo, garrafa: o logo fica na parte da volta que aparece de frente.
  const window = ctx.frontWindow && ctx.frontWindow > 0 && ctx.frontWindow < 1 ? ctx.frontWindow : 1;
  if (graphic && window < 1) scale = Math.min(scale, (window * 0.9) / base.w);
  let limitedByDpi = false;
  if (!ctx.vector && ctx.areaCm && ctx.areaCm.w > 0) {
    const { min } = dpiTargets(longCm);
    const cap = (ctx.px.w * 2.54) / (min * DPI_MARGIN * ctx.areaCm.w * base.w);
    if (cap < scale) {
      // Nunca some: abaixo de 30% da área a nitidez perde para a visibilidade (o aviso de resolução aparece).
      scale = Math.max(Math.min(cap, scale), Math.min(scale, 0.3));
      limitedByDpi = true;
    }
  }
  return {
    mode: "whole",
    placement: { x: 0.5, y: 0.5, scale, rotation: 0 },
    overflow: false,
    background: borderColor ?? (graphic || ctx.transparentBase || !opaque ? null : hexOf(a.border.rgb)),
    cropLoss: 0,
    limitedByDpi,
    dpi: ctx.vector ? null : dpiAt(scale),
  };
}

/** Frase curta do que o tratador fez, para o cliente (abaixo do nome do arquivo). */
export function describeFit(fit: AutoFit, extras: { trimmed?: boolean; vector?: boolean; backgroundRemoved?: boolean } = {}): string {
  const parts: string[] = [];
  if (extras.trimmed) parts.push("margens vazias cortadas");
  if (extras.backgroundRemoved) parts.push("fundo branco removido");
  if (fit.mode === "fill") parts.push(fit.cropLoss > 0.02 ? `preenchendo a área (${Math.round(fit.cropLoss * 100)}% das bordas fica de fora)` : "preenchendo a área");
  else parts.push("inteira e centralizada");
  if (fit.limitedByDpi) parts.push("no maior tamanho que imprime nítido");
  if (extras.vector) parts.push("vetor: nítido em qualquer tamanho");
  const text = parts.join(" · ");
  return `Ajustada automaticamente: ${text}.`;
}

// ------------------------------------------------------------------------------- resolução

/** Lado maior da textura do 3D: o lado menor nunca abaixo de `minShort`, dentro do teto da GPU. */
export function textureLongSide(aspect: number, gpu: { maxTexture: number; mobile: boolean }): number {
  const a = Math.max(aspect, 1 / Math.max(aspect, 1e-6));
  const base = gpu.mobile ? 1536 : 2048;
  const minShort = gpu.mobile ? 256 : 384;
  const ceiling = Math.min(gpu.maxTexture || 4096, gpu.mobile ? 4096 : 8192);
  return Math.round(Math.min(ceiling, Math.max(base, minShort * a)));
}

/** Escala da cópia de prévia: até ~4 MP e lado maior ≤ 8192, sem esmagar o lado menor de panorâmicas. */
export function previewScale(w: number, h: number, maxPixels = 4_194_304, maxSide = 8192): number {
  return Math.min(1, Math.sqrt(maxPixels / Math.max(1, w * h)), maxSide / Math.max(w, h));
}

// --------------------------------------------------------------------------------- formatos

export type FormatPlan = { ok: true; decode: "bitmap" | "svg" | "pdf" | "heic" } | { ok: false; reason: string };

const extOf = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase() ?? "";

/** Como abrir o arquivo, pelo tipo E pela extensão (o Windows manda HEIC com type ""). */
export function formatPlan(name: string, type: string, attachable = true): FormatPlan {
  const ext = extOf(name);
  const t = type.toLowerCase();
  if (t === "application/pdf" || ext === "pdf") return { ok: true, decode: "pdf" };
  if (t === "image/svg+xml" || ext === "svg") return { ok: true, decode: "svg" };
  if (/hei[cf]/.test(t) || ext === "heic" || ext === "heif") return { ok: true, decode: "heic" };
  if (["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "image/bmp"].includes(t) || ["jpg", "jpeg", "jfif", "png", "webp", "avif", "gif", "bmp"].includes(ext)) return { ok: true, decode: "bitmap" };
  // Verso (`attachable` = false): não há anexo do verso no pedido, então a mensagem pede outro formato.
  if (!attachable) return { ok: false, reason: "Esse formato não abre no navegador. Para o verso, envie PNG, JPG, WEBP, SVG ou PDF." };
  if (t === "image/tiff" || ext === "tif" || ext === "tiff") return { ok: false, reason: "TIFF não abre no navegador: exporte em PNG, JPG ou PDF para ver no 3D. O TIFF vai anexado ao pedido." };
  return { ok: false, reason: "Este formato não tem prévia (AI, CDR, PSD…): ele vai anexado ao pedido. Para ver no 3D, envie PNG, JPG, WEBP, SVG ou PDF." };
}

/** Tipos aceitos pelo campo de envio (o mesmo filtro do arrastar e soltar). */
export const ART_ACCEPT = "image/png,image/jpeg,image/webp,image/avif,image/gif,image/svg+xml,image/heic,image/heif,.heic,.heif,application/pdf";
