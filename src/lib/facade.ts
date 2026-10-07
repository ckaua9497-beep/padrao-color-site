/*
 * Simulador de fachadas: regras dos arquivos aceitos, medidas, preço por m² e a geometria do encaixe
 * em perspectiva (homografia + malha de triângulos). TS puro, sem React e sem DOM, para rodar no
 * `node --test`; o desenho em canvas fica em components/facade/canvas.ts.
 */
import type { CustomSize, Variation } from "./catalog";
import { areaQuote, cleanOptionLabel, optionKeys, type AreaQuote, type Selection } from "./pricing.ts";

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const decimal = (value: number, digits: number, grouping = false) => value.toLocaleString("pt-BR", { maximumFractionDigits: digits, useGrouping: grouping });

// ------------------------------------------------------------------------------------ arquivos aceitos

export const MB = 1024 * 1024;
/** Tamanho máximo de cada foto ou design (igual ao passo de arte dos produtos). */
export const MAX_FILE_MB = 25;
/** Fotos da loja por simulação. */
export const MAX_PHOTOS = 8;
/** Lado maior das imagens na edição: fotos e design são reduzidos no navegador. */
export const EDIT_MAX_SIDE = 2400;
/** Abaixo disso a foto ainda serve, mas a simulação perde nitidez. */
export const MIN_PHOTO_SIDE = 800;

/** Formatos que abrem no simulador (foto da loja e design). */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
/** Arquivos de produção: não abrem no simulador e seguem depois do pedido (WhatsApp ou reenvio de arte). */
export const PRODUCTION_EXTENSIONS = ["pdf", "ai", "cdr", "eps", "svg"] as const;
const PRODUCTION_TYPES = ["application/pdf", "application/postscript", "application/illustrator", "image/svg+xml", "application/vnd.corel-draw", "application/cdr"];

export type DesignKind = "image" | "production" | "unsupported";

export function fileExtension(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : "";
}

/** Tipos vagos ou antigos que alguns sistemas informam: aí vale a extensão. */
const LOOSE_TYPES = ["", "application/octet-stream", "image/jpg", "image/pjpeg", "image/x-png"];

/** JPG, PNG ou WEBP pelo tipo; com tipo vago (ou sem tipo), pela extensão. */
export function isImageFile(name: string, type: string): boolean {
  if ((IMAGE_TYPES as readonly string[]).includes(type)) return true;
  return LOOSE_TYPES.includes(type) && IMAGE_EXTENSIONS.includes(fileExtension(name));
}

export function classifyDesign(name: string, type: string): DesignKind {
  if (isImageFile(name, type)) return "image";
  if ((PRODUCTION_EXTENSIONS as readonly string[]).includes(fileExtension(name)) || PRODUCTION_TYPES.includes(type)) return "production";
  return "unsupported";
}

type FileInfo = { name: string; type: string; size: number };

const isHeic = (file: FileInfo) => /hei[cf]/i.test(file.type) || /^hei[cf]$/.test(fileExtension(file.name));

export function photoFileError(file: FileInfo): string | null {
  if (!isImageFile(file.name, file.type)) {
    if (isHeic(file)) return `“${file.name}” está em HEIC. Envie em JPG: no iPhone, use Ajustes › Câmera › Formatos › Mais compatível.`;
    return `“${file.name}” não é uma foto aceita. Use JPG, PNG ou WEBP.`;
  }
  if (file.size > MAX_FILE_MB * MB) return `“${file.name}” tem mais de ${MAX_FILE_MB} MB. Envie uma foto menor.`;
  return null;
}

/** Erro do design; arquivo de produção (PDF, AI, CDR…) não é erro: só não abre no simulador. */
export function designFileError(file: FileInfo): string | null {
  const kind = classifyDesign(file.name, file.type);
  if (kind === "unsupported") {
    if (isHeic(file)) return `“${file.name}” está em HEIC. Exporte o design em PNG ou JPG.`;
    return `“${file.name}” não é aceito. Para simular, use PNG, JPG ou WEBP; para produção, PDF, AI, CDR, EPS ou SVG.`;
  }
  if (kind === "image" && file.size > MAX_FILE_MB * MB) return `“${file.name}” tem mais de ${MAX_FILE_MB} MB. Envie uma versão menor para simular e mande o arquivo final depois.`;
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes >= MB) return `${decimal(bytes / MB, 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatPixels(width: number, height: number): string {
  return `${decimal(width, 0, true)} × ${decimal(height, 0, true)} px`;
}

// ------------------------------------------------------------------------------------ medidas

export type Unit = "m" | "cm";
export const MEASURE_MIN_CM = 10;
export const MEASURE_MAX_CM = 5000;

/** "3,5" (m) → 350 cm; "350" (cm) → 350. Aceita vírgula ou ponto e a unidade escrita ("3,5 m", "350cm"). null = inválido. */
export function parseMeasure(text: string, unit: Unit): number | null {
  const clean = text.trim().toLowerCase().replace(/\s+/g, "");
  const match = /^(\d+(?:[.,]\d*)?|[.,]\d+)(cm|m)?$/.exec(clean);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  const cm = ((match[2] as Unit | undefined) ?? unit) === "m" ? value * 100 : value;
  if (!Number.isFinite(cm) || cm <= 0) return null;
  return Math.round(cm * 10) / 10;
}

export function measureError(text: string, unit: Unit): string | null {
  if (!text.trim()) return "Informe a medida.";
  const cm = parseMeasure(text, unit);
  if (cm === null) return unit === "m" ? "Use só números, ex.: 3,5" : "Use só números, ex.: 350";
  if (cm < MEASURE_MIN_CM) return `Mínimo de ${MEASURE_MIN_CM} cm.`;
  if (cm > MEASURE_MAX_CM) return `Máximo de ${MEASURE_MAX_CM / 100} m.`;
  return null;
}

/** Largura e altura válidas, em cm; null enquanto alguma das duas falta ou está fora dos limites. */
export function facadeSize(widthText: string, heightText: string, unit: Unit): { w: number; h: number } | null {
  if (measureError(widthText, unit) || measureError(heightText, unit)) return null;
  const w = parseMeasure(widthText, unit);
  const h = parseMeasure(heightText, unit);
  return w !== null && h !== null ? { w, h } : null;
}

/** Valor do campo na unidade escolhida (sem a unidade), para trocar m ⇄ cm sem perder o que foi digitado. */
export function formatMeasureInput(cm: number, unit: Unit): string {
  return unit === "m" ? decimal(cm / 100, 3) : decimal(cm, 1);
}

/** "4 × 1,2 m" */
export function facadeLabel(widthCm: number, heightCm: number): string {
  return `${decimal(widthCm / 100, 2)} × ${decimal(heightCm / 100, 2)} m`;
}

export function formatArea(m2: number): string {
  return `${decimal(m2, 2)} m²`;
}

// ------------------------------------------------------------------------------------ resolução

/** 1 m = 39,37 polegadas. */
export const INCHES_PER_METRE = 39.37;
/** Mínimo na medida final para fachada vista a mais de 3 m. */
export const DPI_MIN = 50;
/** Recomendado: nitidez boa também de perto. */
export const DPI_RECOMMENDED = 100;

export type ResolutionLevel = "otima" | "boa" | "baixa";

/** DPI = pixels ÷ (metros × 39,37). */
export function dpiAt(pixels: number, metres: number): number {
  return metres > 0 && pixels > 0 ? pixels / (metres * INCHES_PER_METRE) : 0;
}

export type FitMode = "cover" | "contain";

/**
 * DPI que a arte terá impressa na fachada. "Preencher" (cover) amplia até cobrir os dois lados:
 * vale o eixo mais fraco. "Ajustar" (contain) amplia até encostar no primeiro lado: vale o mais forte.
 */
export function effectiveDpi(designW: number, designH: number, widthM: number, heightM: number, fit: FitMode): number {
  const x = dpiAt(designW, widthM);
  const y = dpiAt(designH, heightM);
  return fit === "cover" ? Math.min(x, y) : Math.max(x, y);
}

export function resolutionLevel(dpi: number): ResolutionLevel {
  if (dpi >= DPI_RECOMMENDED) return "otima";
  if (dpi >= DPI_MIN) return "boa";
  return "baixa";
}

/** Pixels necessários para a medida (em metros) numa resolução. */
export function requiredPixels(widthM: number, heightM: number, dpi: number): { w: number; h: number } {
  // A folga evita que 7874,000000001 vire 7875.
  return { w: Math.ceil(widthM * INCHES_PER_METRE * dpi - 1e-6), h: Math.ceil(heightM * INCHES_PER_METRE * dpi - 1e-6) };
}

/** Medidas comuns para a tabela de pixels da página (largura × altura, em metros). */
export const EXAMPLE_SIZES: readonly [number, number][] = [
  [2, 0.5],
  [3, 1],
  [4, 1],
  [5, 1.2],
  [6, 1.5],
  [8, 2],
];

// ------------------------------------------------------------------------------------ proporção

/** Diferença de proporção tolerada entre a arte e a fachada (2%). */
export const ASPECT_TOLERANCE = 0.02;

export type AspectCheck = {
  /** Largura ÷ altura da arte e da fachada. */
  design: number;
  facade: number;
  /** 0 = proporções iguais; 0,25 = um quarto de diferença. */
  diff: number;
  matches: boolean;
  /** No "Preencher", o lado da arte que perde um pedaço (null quando as proporções batem). */
  cropSide: "laterais" | "topo e base" | null;
};

/** Mesmo valor nos dois encaixes: fração da arte cortada (Preencher) ou da fachada com fundo (Ajustar). */
export function aspectCheck(designW: number, designH: number, facadeW: number, facadeH: number): AspectCheck {
  const design = designW / designH;
  const facade = facadeW / facadeH;
  const diff = 1 - Math.min(design, facade) / Math.max(design, facade);
  const matches = diff <= ASPECT_TOLERANCE;
  return { design, facade, diff, matches, cropSide: matches ? null : design > facade ? "laterais" : "topo e base" };
}

/** "3:1", "1,33:1" */
export function ratioLabel(ratio: number): string {
  return ratio >= 1 ? `${decimal(ratio, 2)}:1` : `1:${decimal(1 / ratio, 2)}`;
}

export type Rect = { x: number; y: number; w: number; h: number };

/** Onde desenhar a imagem inteira dentro da caixa: cobrindo (corta) ou contida (sobra fundo), centralizada. */
export function fitRect(srcW: number, srcH: number, boxW: number, boxH: number, fit: FitMode): Rect {
  const scale = fit === "cover" ? Math.max(boxW / srcW, boxH / srcH) : Math.min(boxW / srcW, boxH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

// ------------------------------------------------------------------------------------ geometria

export type Point = { x: number; y: number };
/** Quadrilátero no sentido horário a partir do canto superior esquerdo: [SE, SD, ID, IE]. */
export type Quad = [Point, Point, Point, Point];
/** Matriz 3×3 por linhas. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];
/** Transformação afim na ordem do canvas: x' = a·x + c·y + e; y' = b·x + d·y + f. */
export type Affine = { a: number; b: number; c: number; d: number; e: number; f: number };
export type Tri = [Point, Point, Point];
export type Triangle = { src: Tri; dst: Tri };

export const CORNER_NAMES = ["superior esquerdo", "superior direito", "inferior direito", "inferior esquerdo"] as const;

/**
 * Homografia do quadrado unitário (0,0)(1,0)(1,1)(0,1) para o quadrilátero (Heckbert, 1989).
 * null quando três cantos ficam alinhados.
 */
export function squareToQuad(q: Quad): Mat3 | null {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  const den = dx1 * dy2 - dx2 * dy1;
  if (!Number.isFinite(den) || Math.abs(den) < 1e-12) return null;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const h = (dx1 * dy3 - dx3 * dy1) / den;
  const m: Mat3 = [p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x, p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y, g, h, 1];
  // Outros três cantos alinhados dão matriz singular: achata tudo numa reta.
  return Math.abs(determinant(m)) < 1e-12 ? null : m;
}

function determinant(m: Mat3): number {
  return m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
}

export function applyHomography(m: Mat3, p: Point): Point {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  return { x: (m[0] * p.x + m[1] * p.y + m[2]) / w, y: (m[3] * p.x + m[4] * p.y + m[5]) / w };
}

export function multiply3(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      out[row * 3 + col] = a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col];
    }
  }
  return out as Mat3;
}

export function invert3(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = determinant(m);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;
  return [A / det, D / det, G / det, B / det, E / det, H / det, C / det, F / det, I / det];
}

export function quadToSquare(q: Quad): Mat3 | null {
  const m = squareToQuad(q);
  return m ? invert3(m) : null;
}

/** Homografia que leva os cantos de `from` aos de `to` (de quadrilátero para quadrilátero). */
export function homography(from: Quad, to: Quad): Mat3 | null {
  const inverse = quadToSquare(from);
  const forward = squareToQuad(to);
  return inverse && forward ? multiply3(forward, inverse) : null;
}

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Convexo e sem cantos alinhados: só assim a perspectiva não passa pelo infinito. */
export function isConvexQuad(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const turn = cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4]);
    if (!Number.isFinite(turn) || Math.abs(turn) < 1e-12) return false;
    if (sign === 0) sign = Math.sign(turn);
    else if (Math.sign(turn) !== sign) return false;
  }
  return true;
}

/** Área com sinal (fórmula do laço). Positiva no sentido horário da tela (y para baixo). */
export function signedArea(q: Quad): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Cantos trocados de lado: a arte sairia espelhada. */
export function isMirrored(q: Quad): boolean {
  return signedArea(q) < 0;
}

export function pointInQuad(p: Point, q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const turn = cross(q[i], q[(i + 1) % 4], p);
    if (turn === 0) continue;
    if (sign === 0) sign = Math.sign(turn);
    else if (Math.sign(turn) !== sign) return false;
  }
  return true;
}

export function maxEdge(q: Quad): number {
  let longest = 0;
  for (let i = 0; i < 4; i++) longest = Math.max(longest, Math.hypot(q[(i + 1) % 4].x - q[i].x, q[(i + 1) % 4].y - q[i].y));
  return longest;
}

/** Centro em perspectiva (cruzamento das diagonais): onde cai o meio da arte. */
export function quadCenter(q: Quad): Point {
  const m = squareToQuad(q);
  if (m && isConvexQuad(q)) return applyHomography(m, { x: 0.5, y: 0.5 });
  return { x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4 };
}

export function toPixels(q: Quad, width: number, height: number): Quad {
  return q.map((p) => ({ x: p.x * width, y: p.y * height })) as Quad;
}

/**
 * Marcação inicial: retângulo centrado com a proporção da fachada (largura ÷ altura, em metros),
 * ocupando até `coverage` da foto. Coordenadas de 0 a 1.
 */
export function defaultQuad(photoAspect: number, facadeAspect: number, coverage = 0.7): Quad {
  const photo = photoAspect > 0 && Number.isFinite(photoAspect) ? photoAspect : 1;
  const facade = facadeAspect > 0 && Number.isFinite(facadeAspect) ? facadeAspect : 3;
  let w = coverage;
  let h = (w * photo) / facade;
  if (h > coverage) {
    h = coverage;
    w = (h * facade) / photo;
  }
  const x = (1 - w) / 2;
  const y = (1 - h) / 2;
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

/** Move um canto, sem sair da foto. */
export function setCorner(q: Quad, index: number, p: Point): Quad {
  return q.map((corner, i) => (i === index ? { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) } : { ...corner })) as Quad;
}

/** Move a área inteira; para na borda da foto sem deformar. */
export function moveQuad(q: Quad, dx: number, dy: number): Quad {
  const xs = q.map((p) => p.x);
  const ys = q.map((p) => p.y);
  const mx = clamp(dx, -Math.min(...xs), 1 - Math.max(...xs));
  const my = clamp(dy, -Math.min(...ys), 1 - Math.max(...ys));
  return q.map((p) => ({ x: p.x + mx, y: p.y + my })) as Quad;
}

// ------------------------------------------------------------------------------------ malha

/** Afim que leva o triângulo `src` ao `dst`; null quando o de origem não tem área. */
export function affineFromTriangles(src: Tri, dst: Tri): Affine | null {
  const [s0, s1, s2] = src;
  const [d0, d1, d2] = dst;
  const x1 = s1.x - s0.x;
  const y1 = s1.y - s0.y;
  const x2 = s2.x - s0.x;
  const y2 = s2.y - s0.y;
  const det = x1 * y2 - x2 * y1;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const u1 = d1.x - d0.x;
  const v1 = d1.y - d0.y;
  const u2 = d2.x - d0.x;
  const v2 = d2.y - d0.y;
  const a = (u1 * y2 - u2 * y1) / det;
  const c = (u2 * x1 - u1 * x2) / det;
  const b = (v1 * y2 - v2 * y1) / det;
  const d = (v2 * x1 - v1 * x2) / det;
  return { a, b, c, d, e: d0.x - a * s0.x - c * s0.y, f: d0.y - b * s0.x - d * s0.y };
}

export function applyAffine(m: Affine, p: Point): Point {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

/** Afasta os vértices do centro: cobre a fresta de antisserrilhado entre triângulos vizinhos. */
export function inflateTriangle(tri: Tri, amount: number): Tri {
  const cx = (tri[0].x + tri[1].x + tri[2].x) / 3;
  const cy = (tri[0].y + tri[1].y + tri[2].y) / 3;
  return tri.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const length = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / length) * amount, y: p.y + (dy / length) * amount };
  }) as Tri;
}

/**
 * Divisões da malha para o erro da aproximação afim ficar abaixo de ~0,5 px: paralelogramo pede 1,
 * perspectiva forte e área grande pedem mais (até `max`).
 */
export function meshDivisions(quadPx: Quad, max = 24): number {
  const m = squareToQuad(quadPx);
  if (!m) return 1;
  const strength = Math.abs(m[6]) + Math.abs(m[7]);
  return clamp(Math.ceil(Math.sqrt((maxEdge(quadPx) * strength) / 2)), 1, Math.max(1, max));
}

/**
 * Malha n×n que leva a textura (texW × texH) ao quadrilátero: cada vértice cai no ponto exato da
 * homografia e cada célula vira dois triângulos afins.
 */
export function perspectiveMesh(quad: Quad, texW: number, texH: number, n: number): Triangle[] {
  const m = squareToQuad(quad);
  if (!m) return [];
  const steps = Math.max(1, Math.floor(n));
  const grid: Point[] = [];
  for (let j = 0; j <= steps; j++) {
    for (let i = 0; i <= steps; i++) grid.push(applyHomography(m, { x: i / steps, y: j / steps }));
  }
  const at = (i: number, j: number) => grid[j * (steps + 1) + i];
  const tex = (i: number, j: number): Point => ({ x: (i / steps) * texW, y: (j / steps) * texH });
  const triangles: Triangle[] = [];
  for (let j = 0; j < steps; j++) {
    for (let i = 0; i < steps; i++) {
      triangles.push({ src: [tex(i, j), tex(i + 1, j), tex(i + 1, j + 1)], dst: [at(i, j), at(i + 1, j), at(i + 1, j + 1)] });
      triangles.push({ src: [tex(i, j), tex(i + 1, j + 1), tex(i, j + 1)], dst: [at(i, j), at(i + 1, j + 1), at(i, j + 1)] });
    }
  }
  return triangles;
}

/** Lado maior da textura: potência de 2 perto do tamanho da área na tela (menos serrilhado ao reduzir). */
export function textureSide(quadPx: Quad, max: number, min = 256): number {
  const edge = maxEdge(quadPx);
  let side = min;
  while (side < edge && side < max) side *= 2;
  return Math.min(side, max);
}

// ------------------------------------------------------------------------------------ luz da foto

export type Realism = {
  /** Quanto da luz e da sombra da foto passa para a arte (0 a 1). */
  light: number;
  /** Brilho da arte (−0,4 a 0,4). */
  brightness: number;
  /** Escurecimento leve das bordas (0 a 1). */
  edges: number;
};

export const DEFAULT_REALISM: Realism = { light: 0.5, brightness: 0, edges: 0.3 };

/** Luminância relativa (0 a 1) de um pixel sRGB 0–255. */
export function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function percentile(values: ArrayLike<number>, p: number): number {
  if (values.length === 0) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  return sorted[clamp(Math.round(p * (sorted.length - 1)), 0, sorted.length - 1)];
}

/** Desfoque de caixa 3×3 repetido `passes` vezes (bordas usam só os vizinhos que existem). */
export function boxBlur(values: ArrayLike<number>, w: number, h: number, passes = 1): Float32Array {
  let source = Float32Array.from(values);
  for (let pass = 0; pass < passes; pass++) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        let count = 0;
        for (let j = Math.max(0, y - 1); j <= Math.min(h - 1, y + 1); j++) {
          for (let i = Math.max(0, x - 1); i <= Math.min(w - 1, x + 1); i++) {
            sum += source[j * w + i];
            count += 1;
          }
        }
        out[y * w + x] = sum / count;
      }
    }
    source = out;
  }
  return source;
}

/**
 * Fator que multiplica a arte num ponto: a luz local dividida pela luz de referência (as partes mais
 * claras da área marcada), limitada a `floor`, e misturada com 1 conforme a força.
 */
export function shadeFactor(l: number, ref: number, strength: number, floor = 0.45): number {
  if (!(ref > 0)) return 1;
  return 1 - clamp(strength, 0, 1) * (1 - clamp(l / ref, floor, 1));
}

// ------------------------------------------------------------------------------------ materiais e preço

export type FacadePreset = {
  /** Grupo da API (estável) e slug de reserva. */
  groupId: number;
  slug: string;
  /** Nome curto no seletor. */
  label: string;
  /** Onde o material funciona melhor. */
  use: string;
  /** Opções preferidas para fachada (rótulo limpo → valor): definem a variação inicial. */
  prefer: Record<string, string>;
  /** Trechos de valores fora de uso em fachada (formatos pequenos, meio corte…). */
  exclude?: string[];
};

/** Produtos vendidos por m² que servem de fachada, na ordem do seletor. */
export const FACADE_PRESETS: readonly FacadePreset[] = [
  {
    groupId: 33,
    slug: "33-lona-c-bainha-e-ilhos",
    label: "Lona com bainha e ilhós",
    use: "A fachada clássica: lona presa na estrutura pelos ilhós.",
    prefer: { "Tipo de Serviço": "Solvente", Mídia: "Lona Fosca", Gramatura: "440g", Acabamento: "Bainha e Ilhós", Cobertura: "Sem Verniz" },
  },
  {
    groupId: 38,
    slug: "38-lona-s-acabamento",
    label: "Lona para esticar",
    use: "Sem acabamento, para esticar em quadro de metalon ou moldura.",
    prefer: { "Tipo de Serviço": "Solvente", Mídia: "Lona Fosca", Gramatura: "440g", Acabamento: "Sem Acabamento", Cobertura: "Sem Verniz" },
  },
  {
    groupId: 334,
    slug: "334-lona-backlight",
    label: "Lona backlight",
    use: "Translúcida: para letreiro luminoso, iluminado por dentro.",
    prefer: { "Tipo de Serviço": "Solvente", Acabamento: "Sem Acabamento", Cobertura: "Sem Verniz" },
  },
  {
    groupId: 271,
    slug: "271-adesivo-em-vinil",
    label: "Adesivo em vinil",
    use: "Aplicado sobre ACM, chapa ou parede lisa.",
    prefer: { Impressão: "Solvente", Mídia: "Vinil Brilho", "Tipo de Finalização": "Grandes Formatos c/ Refile" },
    exclude: ["Pequenos Formatos", "Meio Corte"],
  },
  {
    groupId: 263,
    slug: "263-adesivo-em-vinil-microperfurado",
    label: "Adesivo microperfurado",
    use: "Vitrine e porta de vidro: de dentro, a rua continua visível.",
    prefer: { Impressão: "Solvente", "Tipo de Finalização": "Grandes Formatos c/ Refile" },
  },
  {
    groupId: 89,
    slug: "89-impressao-em-pvc-expandido",
    label: "Placa de PVC expandido",
    use: "Placa rígida de 5 ou 10 mm com impressão UV direta.",
    prefer: { Mídia: "PVC 5mm", Acabamento: "Corte Reto" },
  },
  {
    groupId: 273,
    slug: "273-ps-c-adesivo-aplicado",
    label: "Placa de PS com adesivo",
    use: "Placa leve de 2 ou 3 mm com o adesivo já aplicado.",
    prefer: { "Tipo de Serviço": "Solvente", Mídia: "Vinil Brilho", Espessura: "PS 2mm", Acabamento: "Corte Reto", Modelo: "Grandes Formatos" },
    exclude: ["Pequenos Formatos"],
  },
];

/** O que o simulador lê de um produto do catálogo (o servidor monta a lista; o cliente não carrega o catálogo). */
export type FacadeSource = {
  id?: string;
  slug: string;
  name: string;
  image: string;
  groupId?: number;
  category: string;
  categorySlug?: string;
  customSize?: CustomSize | null;
  options: Record<string, string[]>;
  variations: Variation[];
  leadDays: number | null;
};

export type FacadeMaterial = {
  slug: string;
  name: string;
  label: string;
  use: string;
  image: string;
  groupId?: number;
  category: string;
  /** Segmento do desconto de revenda (useCustomerVariations), como na página do produto. */
  categorySlug?: string;
  customSize: CustomSize | null;
  /** Opções e variações sem os valores fora de uso em fachada. */
  options: Record<string, string[]>;
  variations: Variation[];
  /** Seleção inicial (variação preferida para fachada). */
  selection: Selection;
  /** Preço por m² da seleção inicial. */
  price: number;
  leadDays: number | null;
};

/** Variação que atende mais opções preferidas; no empate, a mais barata. */
export function preferredVariation(variations: Variation[], prefer: Record<string, string>): Variation | null {
  let best: Variation | null = null;
  let bestScore = -1;
  for (const variation of variations) {
    let score = 0;
    for (const [key, value] of Object.entries(variation.v)) if (prefer[cleanOptionLabel(key)] === value) score += 1;
    if (score > bestScore || (score === bestScore && best && variation.p < best.p)) {
      best = variation;
      bestScore = score;
    }
  }
  return best;
}

export function buildFacadeMaterials(products: FacadeSource[], presets: readonly FacadePreset[] = FACADE_PRESETS): FacadeMaterial[] {
  const materials: FacadeMaterial[] = [];
  for (const preset of presets) {
    const product =
      products.find((p) => p.groupId === preset.groupId && (p.id === undefined || p.id === String(preset.groupId))) ?? products.find((p) => p.slug === preset.slug);
    if (!product || !product.customSize || product.variations.length === 0) continue;
    const excluded = (value: string) => (preset.exclude ?? []).some((word) => value.includes(word));
    const kept = product.variations.filter((v) => !Object.values(v.v).some(excluded));
    const variations = kept.length > 0 ? kept : product.variations;
    const options: Record<string, string[]> = {};
    for (const [key, values] of Object.entries(product.options)) {
      const usable = values.filter((value) => !excluded(value) && variations.some((v) => v.v[key] === value));
      if (usable.length > 0) options[key] = usable;
    }
    const chosen = preferredVariation(variations, preset.prefer);
    const selection: Selection = {};
    for (const key of optionKeys(options)) selection[key] = chosen?.v[key] ?? options[key][0];
    materials.push({
      slug: product.slug,
      name: product.name,
      label: preset.label,
      use: preset.use,
      image: product.image,
      groupId: product.groupId,
      category: product.category,
      categorySlug: product.categorySlug,
      customSize: product.customSize,
      options,
      variations,
      selection,
      price: chosen?.p ?? Math.min(...variations.map((v) => v.p)),
      leadDays: chosen?.d ?? product.leadDays,
    });
  }
  return materials;
}

export type FacadeQuote = AreaQuote & {
  /** A peça só cabe no material girada 90° (a largura vira a altura na produção). */
  rotated: boolean;
};

/**
 * areaQuote com a peça girada quando só assim ela cabe nos limites do material (largura do rolo ou da
 * chapa). A área e o preço não mudam; a medida da fachada continua a mesma.
 */
export function facadeQuote(pricePerM2: number, widthCm: number, heightCm: number, limits?: CustomSize | null): FacadeQuote {
  const direct = areaQuote(pricePerM2, widthCm, heightCm, limits);
  if (!direct.error || !(widthCm > 0) || !(heightCm > 0)) return { ...direct, rotated: false };
  const turned = areaQuote(pricePerM2, heightCm, widthCm, limits);
  return turned.error ? { ...direct, rotated: false } : { ...turned, rotated: true };
}

/**
 * Medida da peça no sentido do material, para o carrinho e o pedido: girada, a largura vira a altura.
 * Assim o preço refeito no checkout (areaQuote, sem giro) aceita a mesma peça, com a mesma área.
 */
export function printSize(widthCm: number, heightCm: number, rotated: boolean): { widthCm: number; heightCm: number } {
  return rotated ? { widthCm: heightCm, heightCm: widthCm } : { widthCm, heightCm };
}

export type CartOptionsInput = {
  widthCm: number;
  heightCm: number;
  material: string;
  /** Opções do material (chave da API → valor). */
  selection: Selection;
  billedArea: number;
  rotated: boolean;
  /** Arte de imagem usada na simulação. */
  design: { name: string; dpi: number | null; fit: FitMode; background: string; matches: boolean } | null;
  /** Arquivo de produção (PDF, AI, CDR…) que segue depois do pedido. */
  productionFile: string | null;
  artLater: boolean;
};

/** Opções do item no carrinho: medida e material primeiro, depois o que a produção precisa saber. */
export function facadeCartOptions(input: CartOptionsInput): Record<string, string> {
  const options: Record<string, string> = { Fachada: facadeLabel(input.widthCm, input.heightCm), Material: input.material };
  // optionKeys põe as chaves numeradas da API ("1 - Acabamento", "2 - Mídia") na ordem certa.
  const keys = optionKeys(Object.fromEntries(Object.keys(input.selection).map((key) => [key, [] as string[]])));
  for (const key of keys) {
    const label = cleanOptionLabel(key);
    if (!(label in options)) options[label] = input.selection[key];
  }
  // Avisos para a produção nunca sobrescrevem uma opção da API ("Impressão" já é opção dos adesivos).
  const note = (key: string, value: string) => {
    if (!(key in options)) options[key] = value;
  };
  note("Área cobrada", formatArea(input.billedArea));
  if (input.rotated) note("Produção", "Impressa girada 90° para caber no material");
  if (input.design) {
    if (!input.design.matches) note("Encaixe", input.design.fit === "cover" ? "Preencher (corta o excedente)" : `Ajustar (fundo ${input.design.background})`);
    if (input.design.dpi !== null) note("Resolução", `${Math.round(input.design.dpi)} DPI na medida final`);
    if (input.artLater) note("Simulação", input.design.name);
  }
  if (input.productionFile) note("Arte final", `${input.productionFile} (enviar depois)`);
  return options;
}
