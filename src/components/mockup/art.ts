import type { MockupKind } from "@/lib/mockup-kinds";
import { ART_FONTS, canvasFont, fontFamilyOf, isScriptFont, type ArtFont } from "./fonts";

/** Estilos de layout dos templates de texto. */
export type ArtStyle = "classico" | "moderno" | "retro" | "minimal" | "vibrante" | "elegante";

/** O que o cliente configura no passo "Sua arte". */
export type ArtSettings = {
  /** Imagem enviada (data URL), ou null para usar o template. */
  src: string | null;
  fit: "cover" | "contain";
  rotation: 0 | 90 | 180 | 270;
  /** 1 = tamanho do encaixe; até 2,5. */
  zoom: number;
  /** Deslocamento da imagem em fração da área (-0,5 a 0,5). */
  offsetX: number;
  offsetY: number;
  background: string;
  /** Texto da arte (aparece no mockup). */
  text: string;
  font: ArtFont;
  textColor: string;
  /** Layout do template (hierarquia, ornamentos e paleta). */
  style: ArtStyle;
  /** Linha secundária opcional: cargo, contato, @perfil, data. */
  subtext: string;
  /**
   * Posição livre (web-to-print): onde o cliente colocou o texto e a imagem na área de impressão.
   * null/ausente = layout automático do template.
   */
  layout?: ArtLayout | null;
  /** Arte do verso (camisas: logo nas costas; almofadas: verso). null/ausente = sem arte própria no verso. */
  back?: ArtSettings | null;
  /** Cores de LED escolhidas pelo cliente no neon (sobrepõem a cor da opção do produto). */
  ledColors?: string[] | null;
  /** Chinelo: região personalizada ("inteira", "dedos", "meio", "calcanhar"). */
  region?: string | null;
  /** Camisa: manequim no tamanho escolhido e no tipo de corpo (medidas em cm da tabela da API). */
  mannequin?: MannequinSettings | null;
};

/** Posição de um elemento em fração da área de impressão (x/y = centro, 0..1; scale 1 = encaixe máximo). */
export type LayerPlacement = { x: number; y: number; scale: number; rotation: number };

export type ArtLayout = { text?: LayerPlacement | null; image?: LayerPlacement | null };

export type BodyType = "magro" | "medio" | "cheio";

export type MannequinSettings = {
  size: string;
  body: BodyType;
  /** Medidas da peça no tamanho escolhido (Tabela de Medidas da API), quando houver. */
  widthCm?: number | null;
  lengthCm?: number | null;
};

export const DEFAULT_ART: ArtSettings = {
  src: null,
  fit: "cover",
  rotation: 0,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  background: "#ffffff",
  text: "",
  font: "figtree",
  textColor: "#000000",
  style: "classico",
  subtext: "",
};

/** Contexto de render que o visualizador acrescenta à arte (tipo da peça e cores do LED). */
/**
 * `surface`: cor da peça por baixo da estampa (tecido escuro pede texto claro).
 * `opaque`: estampa que cobre o painel inteiro (sublimação de ponta a ponta) — o modelo de vestuário
 * pinta o fundo em vez de deixá-lo transparente para o tecido aparecer.
 */
export type ArtRender = ArtSettings & { kind?: MockupKind; ledColors?: string[]; surface?: string; opaque?: boolean };

export type ArtFamily = "card" | "wrap" | "apparel" | "sign" | "badge" | "neon" | "home";

const FAMILY: Record<MockupKind, ArtFamily> = {
  card: "card",
  sheet: "sign",
  folded: "sign",
  sticker: "badge",
  panel: "sign",
  acrylic: "sign",
  keychain: "badge",
  neon: "neon",
  canvas: "sign",
  mat: "home",
  rug: "home",
  coaster: "badge",
  board: "badge",
  banner: "sign",
  lightbox: "sign",
  rollup: "sign",
  flag: "sign",
  hardware: "sign",
  cloth: "home",
  mug: "wrap",
  tumbler: "wrap",
  bottle: "wrap",
  tshirt: "apparel",
  cap: "apparel",
  apron: "apparel",
  bandana: "apparel",
  cushion: "home",
  petbed: "home",
  book: "sign",
  tent: "sign",
  bag: "apparel",
  box: "sign",
  paperpack: "sign",
  wallcalendar: "sign",
  passport: "badge",
  hangtag: "badge",
  bookmark: "sign",
  puzzle: "home",
  ruler: "wrap",
  phonestand: "badge",
  wobbler: "badge",
  sock: "home",
  shorts: "apparel",
  swimsuit: "home",
  flipflop: "home",
  pen: "wrap",
  fan: "sign",
  lanyard: "wrap",
  badge: "card",
  wristband: "wrap",
  backpack: "apparel",
  drawstring: "apparel",
  cooler: "apparel",
  duffel: "apparel",
  sleepmask: "home",
  neckpillow: "home",
  lapdesk: "home",
  towel: "home",
  curtain: "home",
  bedding: "home",
  tablecloth: "home",
  wallpaper: "home",
  magnet: "badge",
  cylinder: "sign",
};

export function artFamily(kind: MockupKind | undefined): ArtFamily {
  return kind ? (FAMILY[kind] ?? "sign") : "sign";
}

/** Texto de exemplo de cada família, enquanto o cliente não escreve o dele. */
export const SAMPLE_TEXT: Record<ArtFamily, string> = {
  card: "Seu Nome",
  wrap: "Sua frase aqui",
  apparel: "Sua marca",
  sign: "Sua marca aqui",
  badge: "Sua marca",
  neon: "Sua frase",
  home: "Seu nome",
};

/** Subtexto de exemplo (só aparece enquanto o cliente não escreveu nada). */
export const SAMPLE_SUBTEXT: Record<ArtFamily, string> = {
  card: "Cargo · (21) 99999-0000",
  wrap: "@seuperfil",
  apparel: "Desde 2026",
  sign: "(21) 99999-0000 · @suamarca",
  badge: "@suamarca",
  neon: "",
  home: "Lar doce lar",
};

/** Limite de caracteres do "Texto da arte" por família. */
export const TEXT_LIMIT: Record<ArtFamily, number> = {
  card: 32,
  wrap: 40,
  apparel: 24,
  sign: 48,
  badge: 22,
  neon: 28,
  home: 24,
};

/** Limite de caracteres do subtexto por família. */
export const SUBTEXT_LIMIT: Record<ArtFamily, number> = {
  card: 40,
  wrap: 32,
  apparel: 24,
  sign: 48,
  badge: 24,
  neon: 24,
  home: 28,
};

export const TEXT_COLORS = [
  { value: "#000000", label: "Preto" },
  { value: "#ffffff", label: "Branco" },
  { value: "#ff463a", label: "Coral" },
  { value: "#0888c8", label: "Azul" },
  { value: "#f8e028", label: "Amarelo" },
  { value: "#b0c818", label: "Verde" },
  { value: "#e02888", label: "Magenta" },
  { value: "#e02018", label: "Vermelho" },
  { value: "#f0a000", label: "Âmbar" },
  { value: "#18b0e8", label: "Ciano" },
  { value: "#282e34", label: "Grafite" },
  { value: "#b8862b", label: "Dourado" },
  { value: "#f6f1e7", label: "Creme" },
];

/** Fundos curados do template, cada um com a cor de texto que combina (contraste bom). */
export const ART_BACKGROUNDS = [
  { value: "#ffffff", label: "Branco", ink: "#000000" },
  { value: "#f6f1e7", label: "Papel", ink: "#000000" },
  { value: "#fef8d4", label: "Sol claro", ink: "#000000" },
  { value: "#def3fc", label: "Céu", ink: "#0888c8" },
  { value: "#fce4f0", label: "Rosa", ink: "#e02888" },
  { value: "#f8e028", label: "Amarelo", ink: "#000000" },
  { value: "#f0a000", label: "Âmbar", ink: "#000000" },
  { value: "#ff463a", label: "Coral", ink: "#ffffff" },
  { value: "#e02018", label: "Vermelho", ink: "#ffffff" },
  { value: "#e02888", label: "Magenta", ink: "#ffffff" },
  { value: "#18b0e8", label: "Ciano", ink: "#000000" },
  { value: "#0888c8", label: "Azul", ink: "#ffffff" },
  { value: "#b0c818", label: "Lima", ink: "#000000" },
  { value: "#282e34", label: "Grafite", ink: "#f6f1e7" },
  { value: "#17171c", label: "Noite", ink: "#b8862b" },
  { value: "#000000", label: "Preto", ink: "#ffffff" },
];

/** Estilos do template: nome, descrição curta e a fonte sugerida ao escolher o estilo. */
export const ART_STYLES: readonly { value: ArtStyle; label: string; hint: string; font: ArtFont }[] = [
  { value: "classico", label: "Clássico", hint: "Centralizado, filete coral e faixa de cores", font: "figtree" },
  { value: "moderno", label: "Moderno", hint: "Grade suíça e blocos geométricos", font: "unbounded" },
  { value: "retro", label: "Retrô", hint: "Raios de sol, letra com volume e faixas anos 70", font: "fraunces" },
  { value: "minimal", label: "Minimal", hint: "Muito respiro e traço fino", font: "figtree" },
  { value: "vibrante", label: "Vibrante", hint: "Adesivo, confete e todas as cores", font: "righteous" },
  { value: "elegante", label: "Elegante", hint: "Moldura fina, dourado e ornamentos", font: "playfair" },
];

const STYLE_KEYS = new Set<string>(ART_STYLES.map((s) => s.value));

/** Estilo válido (artes antigas sem o campo caem no clássico). */
export function styleOf(style: string | undefined): ArtStyle {
  return style && STYLE_KEYS.has(style) ? (style as ArtStyle) : "classico";
}

export function styleLabel(style: string | undefined): string {
  const key = styleOf(style);
  return ART_STYLES.find((s) => s.value === key)?.label ?? "Clássico";
}

const C = {
  red: "#e02018",
  amber: "#f0a000",
  sun: "#f8e028",
  lime: "#b0c818",
  cyan: "#18b0e8",
  blue: "#0888c8",
  magenta: "#e02888",
  coral: "#ff463a",
  ink: "#000000",
  gold: "#b8862b",
  paleGold: "#d9b45a",
} as const;

const SPECTRUM = [C.red, C.amber, C.sun, C.lime, C.cyan, C.blue, C.magenta];

export function fontFamily(): string {
  return fontFamilyOf("figtree");
}

export type ArtVariant = "front" | "gray" | "blank" | "neon";

function canvasFor(aspect: number, longSide = 1024) {
  const canvas = document.createElement("canvas");
  const safe = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  if (safe >= 1) {
    canvas.width = longSide;
    canvas.height = Math.max(64, Math.round(longSide / safe));
  } else {
    canvas.height = longSide;
    canvas.width = Math.max(64, Math.round(longSide * safe));
  }
  return canvas;
}

// ---------------------------------------------------------------------------
// Cor

function parseHex(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(color: string): number {
  const [r, g, b] = (parseHex(color) ?? [128, 128, 128]).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG entre duas cores hex (1 a 21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Preto ou branco, o que lê melhor sobre o fundo. */
export function readableInk(bg: string): string {
  return contrastRatio("#000000", bg) >= contrastRatio("#ffffff", bg) ? "#000000" : "#ffffff";
}

function rgba(color: string, a: number): string {
  const rgb = parseHex(color);
  return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})` : color;
}

function mix(a: string, b: string, t: number): string {
  const x = parseHex(a) ?? [128, 128, 128];
  const y = parseHex(b) ?? [128, 128, 128];
  const out = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Primeira cor da lista com contraste mínimo contra todas as referências; senão a de maior contraste. */
function pick(candidates: readonly string[], against: readonly string[], min: number): string {
  let best = candidates[0];
  let bestScore = -1;
  for (const color of candidates) {
    const score = Math.min(...against.map((ref) => contrastRatio(color, ref)));
    if (score >= min) return color;
    if (score > bestScore) {
      best = color;
      bestScore = score;
    }
  }
  return best;
}

/** Aleatório determinístico (mesma peça = mesmo confete a cada repintura). */
function seeded(seedText: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let t = h >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Tipografia

type Type = {
  font: ArtFont;
  /** Peso nas fontes variáveis. */
  weight?: number;
  italic?: boolean;
  /** Espaçamento entre letras, em em. */
  tracking?: number;
  caps?: boolean;
  lineHeight?: number;
};

type Fit = { lines: string[]; size: number; lh: number; type: Type };

type Paint = {
  fill: string;
  /** Contorno por fora (adesivo). */
  stroke?: string;
  strokeW?: number;
  /** Volume: cópias deslocadas na diagonal, em em. */
  extrude?: string;
  depth?: number;
  /** Sombra projetada sólida (deslocada), em em. */
  drop?: string;
  dropOffset?: number;
  /** Sombra suave. */
  shadow?: string;
  shadowBlur?: number;
};

const NO_FIT: Fit = { lines: [], size: 0, lh: 1, type: { font: "figtree" } };

function trackingPx(type: Type, size: number): number {
  return isScriptFont(type.font) ? 0 : (type.tracking ?? 0) * size;
}

function setType(ctx: CanvasRenderingContext2D, type: Type, size: number) {
  ctx.font = canvasFont(type.font, size, type.italic, type.weight);
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${Math.round(trackingPx(type, size) * 10) / 10}px`;
}

function wrapWords(ctx: CanvasRenderingContext2D, words: string[], maxW: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (!current || ctx.measureText(attempt).width <= maxW) current = attempt;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function widest(ctx: CanvasRenderingContext2D, lines: string[]): number {
  let max = 0;
  for (const line of lines) max = Math.max(max, ctx.measureText(line).width);
  return max;
}

/** Quebra o texto em até `maxLines` linhas equilibradas e acha o maior corpo que cabe na caixa. */
function fitText(ctx: CanvasRenderingContext2D, raw: string, type: Type, boxW: number, boxH: number, maxSize: number, maxLines: number): Fit {
  const text = type.caps && !isScriptFont(type.font) ? raw.toLocaleUpperCase("pt-BR") : raw;
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lh = type.lineHeight ?? 1.08;
  if (!words.length || !(boxW > 2) || !(boxH > 2) || !(maxSize > 1)) return { ...NO_FIT, lh, type };
  let size = Math.max(4, Math.min(maxSize, boxH / (lh * 0.92)));
  let lines = [words.join(" ")];
  for (;;) {
    setType(ctx, type, size);
    lines = wrapWords(ctx, words, boxW);
    const height = (lines.length - 1) * size * lh + size * 0.92;
    if (lines.length <= Math.max(1, maxLines) && widest(ctx, lines) <= boxW && height <= boxH) break;
    if (size <= 4) {
      if (lines.length > maxLines) lines = [...lines.slice(0, Math.max(1, maxLines) - 1), lines.slice(Math.max(1, maxLines) - 1).join(" ")];
      break;
    }
    size = Math.max(4, size - Math.max(0.5, size * 0.06));
  }
  // Equilibra as linhas: estreita a caixa enquanto o número de linhas não muda.
  if (lines.length > 1) {
    let narrow = widest(ctx, lines);
    for (let i = 0; i < 8; i += 1) {
      const tryW = narrow * 0.93;
      const next = wrapWords(ctx, words, tryW);
      const nextW = widest(ctx, next);
      if (next.length !== lines.length || nextW > tryW + 0.5) break;
      lines = next;
      narrow = nextW;
    }
  }
  return { lines, size, lh, type };
}

function blockHeight(fit: Fit): number {
  return fit.lines.length ? (fit.lines.length - 1) * fit.size * fit.lh + fit.size * 0.92 : 0;
}

function fitWidth(ctx: CanvasRenderingContext2D, fit: Fit): number {
  if (!fit.lines.length) return 0;
  setType(ctx, fit.type, fit.size);
  return widest(ctx, fit.lines) - trackingPx(fit.type, fit.size);
}

type Align = "left" | "center" | "right";

function drawFit(ctx: CanvasRenderingContext2D, fit: Fit, x: number, cy: number, align: Align, paint: Paint) {
  if (!fit.lines.length) return;
  ctx.save();
  setType(ctx, fit.type, fit.size);
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  // O espaçamento entra depois da última letra: compensa para centralizar de verdade.
  const track = trackingPx(fit.type, fit.size);
  const ax = x + (align === "center" ? track / 2 : align === "right" ? track : 0);
  const step = fit.size * fit.lh;
  const size = fit.size;
  fit.lines.forEach((line, i) => {
    const y = cy + (i - (fit.lines.length - 1) / 2) * step;
    if (paint.drop) {
      const d = (paint.dropOffset ?? 0.07) * size;
      ctx.fillStyle = paint.drop;
      ctx.strokeStyle = paint.drop;
      if (paint.stroke) {
        ctx.lineWidth = (paint.strokeW ?? 0.14) * size;
        ctx.strokeText(line, ax + d, y + d);
      }
      ctx.fillText(line, ax + d, y + d);
    }
    if (paint.extrude) {
      const depth = (paint.depth ?? 0.07) * size;
      const steps = Math.min(12, Math.max(2, Math.ceil(depth / Math.max(1, size * 0.012))));
      ctx.fillStyle = paint.extrude;
      for (let k = steps; k >= 1; k -= 1) ctx.fillText(line, ax + (depth * k) / steps, y + (depth * k) / steps);
    }
    if (paint.stroke) {
      ctx.strokeStyle = paint.stroke;
      ctx.lineWidth = (paint.strokeW ?? 0.14) * size;
      ctx.strokeText(line, ax, y);
    }
    if (paint.shadow) {
      ctx.shadowColor = paint.shadow;
      ctx.shadowBlur = (paint.shadowBlur ?? 0.1) * size;
      ctx.shadowOffsetY = size * 0.03;
    }
    ctx.fillStyle = paint.fill;
    ctx.fillText(line, ax, y);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  });
  ctx.restore();
}

/** Texto em arco (selos): `bottom` lê da esquerda para a direita por baixo, com as letras em pé. */
function arcText(ctx: CanvasRenderingContext2D, raw: string, cx: number, cy: number, r: number, maxSize: number, maxSpan: number, type: Type, color: string, bottom: boolean) {
  const text = type.caps && !isScriptFont(type.font) ? raw.toLocaleUpperCase("pt-BR") : raw;
  const chars = [...text.trim()];
  if (!chars.length || r <= 0) return;
  ctx.save();
  let size = maxSize;
  ctx.font = canvasFont(type.font, size, type.italic, type.weight);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  const measure = () => {
    const gap = trackingPx(type, size);
    const widths = chars.map((c) => ctx.measureText(c).width + gap);
    return { widths, total: widths.reduce((a, b) => a + b, 0) - gap };
  };
  let { widths, total } = measure();
  if (total / r > maxSpan) {
    size = Math.max(4, size * ((maxSpan * r) / total));
    ctx.font = canvasFont(type.font, size, type.italic, type.weight);
    ({ widths, total } = measure());
  }
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const center = bottom ? Math.PI / 2 : -Math.PI / 2;
  let angle = bottom ? center + total / r / 2 : center - total / r / 2;
  chars.forEach((char, i) => {
    const half = (widths[i] - trackingPx(type, size)) / 2 / r;
    const theta = bottom ? angle - half : angle + half;
    ctx.save();
    ctx.translate(cx + r * Math.cos(theta), cy + r * Math.sin(theta));
    ctx.rotate(bottom ? theta - Math.PI / 2 : theta + Math.PI / 2);
    ctx.fillText(char, 0, 0);
    ctx.restore();
    angle = bottom ? angle - widths[i] / r : angle + widths[i] / r;
  });
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Cena: tudo o que um estilo precisa para desenhar

type Shape = "strip" | "wide" | "square" | "tall" | "pole";
type Box = { x: number; y: number; w: number; h: number };

type Scene = {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  unit: number;
  shape: Shape;
  family: ArtFamily;
  text: string;
  sub: string;
  font: ArtFont;
  ink: string;
  /** Cor do fundo (ou a de contraste com o texto, quando o fundo é o tecido). */
  bg: string;
  /** Contorno e placas: a cor que mais contrasta com o texto. */
  paper: string;
  accent: string;
  accent2: string;
  transparent: boolean;
  rng: () => number;
};

function shapeOf(aspect: number): Shape {
  if (aspect >= 3) return "strip";
  if (aspect >= 1.35) return "wide";
  if (aspect > 0.74) return "square";
  if (aspect >= 0.4) return "tall";
  return "pole";
}

const MAX_LINES: Record<Shape, number> = { strip: 1, wide: 2, square: 3, tall: 4, pole: 5 };

const ACCENTS: Record<ArtStyle, { primary: readonly string[]; secondary: readonly string[] }> = {
  classico: { primary: [C.coral, C.red, C.amber, C.sun], secondary: [C.ink, "#ffffff"] },
  moderno: { primary: [C.blue, C.cyan, C.magenta, C.sun], secondary: [C.cyan, C.sun, C.magenta, C.blue] },
  retro: { primary: [C.amber, C.sun, C.red], secondary: [C.red, C.magenta, C.amber, C.blue] },
  minimal: { primary: [C.coral, C.red, C.sun], secondary: [C.ink, "#ffffff"] },
  vibrante: { primary: [C.magenta, C.cyan, C.sun], secondary: [C.magenta, C.blue, C.red, C.cyan] },
  elegante: { primary: [C.gold, C.paleGold, C.amber], secondary: [C.ink, "#ffffff"] },
};

function makeScene(ctx: CanvasRenderingContext2D, w: number, h: number, art: ArtRender, label: string, opts: { transparent: boolean; sample: boolean; surface?: string }): Scene {
  const family = artFamily(art.kind);
  const style = styleOf(art.style);
  let text = art.text.trim();
  let sub = (art.subtext ?? "").trim();
  // Só o subtexto escrito: ele vira o texto principal (nunca mistura com o texto de exemplo).
  if (!text && sub) {
    text = sub;
    sub = "";
  }
  if (!text && opts.sample) {
    text = SAMPLE_TEXT[family];
    sub = SAMPLE_SUBTEXT[family];
  }
  let ink = art.textColor;
  // Estampa direto no tecido: texto escuro em peça escura (ou claro em clara) troca para o que aparece.
  if (opts.transparent && opts.surface && contrastRatio(ink, opts.surface) < 2.2) ink = readableInk(opts.surface);
  const bg = opts.transparent ? (opts.surface ?? readableInk(ink)) : art.background;
  // Texto invisível (mesma cor do fundo) vira preto ou branco.
  if (!opts.transparent && contrastRatio(ink, bg) < 1.35) ink = readableInk(bg);
  const accents = ACCENTS[style];
  const accent = pick(accents.primary, [bg], 1.7);
  const accent2 = pick(accents.secondary, [bg, ink, accent], 1.3);
  return {
    ctx,
    w,
    h,
    unit: Math.min(w, h),
    shape: shapeOf(w / h),
    family,
    text,
    sub,
    font: ART_FONTS[art.font] ? art.font : "figtree",
    ink,
    bg,
    paper: readableInk(ink),
    accent,
    accent2,
    transparent: opts.transparent,
    rng: seeded(`${label}|${style}|${family}`),
  };
}

type StackOpts = {
  box: Box;
  main: Type;
  sub: Type;
  mainMax: number;
  maxLines: number;
  mainPaint: Paint;
  subPaint: Paint;
  align?: Align;
  valign?: "top" | "center" | "bottom";
  /** Corpo máximo do subtexto em relação ao texto principal. */
  subRatio?: number;
  subLines?: number;
  /** Espaço entre os blocos, em em do texto principal. */
  gap?: number;
  /** Ornamento entre o texto e o subtexto (altura em px). */
  dividerH?: number;
  divider?: (x: number, y: number, mainW: number) => void;
  /** Placa atrás do subtexto (fita, pílula, bloco); recebe também a largura do texto principal. */
  subPlate?: (x: number, y: number, w: number, h: number, mainW: number) => void;
  /** O estilo desenha o subtexto em outro lugar (arco do selo). */
  noSub?: boolean;
};

type Placed = { top: number; bottom: number; mainBottom: number; mainW: number; size: number; left: number; right: number };

/** Texto principal + ornamento + subtexto empilhados e centralizados na caixa. */
function stack(s: Scene, o: StackOpts): Placed {
  const { ctx } = s;
  const { box } = o;
  const align = o.align ?? "center";
  const subText = o.noSub ? "" : s.sub;
  const dividerH = o.divider ? (o.dividerH ?? 0) : 0;
  const subShare = subText ? 0.3 : 0;
  const mainF = fitText(ctx, s.text, o.main, box.w, Math.max(4, box.h * (1 - subShare) - dividerH), o.mainMax, o.maxLines);
  const mainH = blockHeight(mainF);
  const plate = Boolean(o.subPlate);
  let subF = NO_FIT;
  if (subText) {
    const subMax = Math.max(4, Math.max(mainF.size, 12) * (o.subRatio ?? 0.34));
    subF = fitText(ctx, subText, o.sub, box.w * (plate ? 0.8 : 1), Math.max(4, box.h * subShare * (plate ? 0.6 : 1)), subMax, o.subLines ?? 1);
  }
  const gap = Math.max(mainF.size, 12) * (o.gap ?? 0.3);
  const subH = subF.lines.length ? blockHeight(subF) + (plate ? subF.size * 0.95 : 0) : 0;
  const total = mainH + (dividerH ? gap + dividerH : 0) + (subH ? gap + subH : 0);
  const top = o.valign === "top" ? box.y : o.valign === "bottom" ? box.y + box.h - total : box.y + (box.h - total) / 2;
  const anchor = align === "left" ? box.x : align === "right" ? box.x + box.w : box.x + box.w / 2;
  const mainW = fitWidth(ctx, mainF);
  drawFit(ctx, mainF, anchor, top + mainH / 2, align, o.mainPaint);
  let y = top + mainH;
  if (dividerH && o.divider) {
    y += gap;
    o.divider(anchor, y + dividerH / 2, mainW);
    y += dividerH;
  }
  if (subH) {
    y += gap;
    const cy = y + subH / 2;
    if (o.subPlate) {
      const pad = subF.size * 0.85;
      const sw = fitWidth(ctx, subF) + pad * 2;
      const sx = align === "left" ? anchor : align === "right" ? anchor - sw : anchor - sw / 2;
      o.subPlate(sx, y, sw, subH, mainW);
      drawFit(ctx, subF, align === "left" ? anchor + pad : align === "right" ? anchor - pad : anchor, cy, align, o.subPaint);
    } else {
      drawFit(ctx, subF, anchor, cy, align, o.subPaint);
    }
    y += subH;
  }
  const left = align === "left" ? anchor : align === "right" ? anchor - mainW : anchor - mainW / 2;
  return { top, bottom: y, mainBottom: top + mainH, mainW, size: mainF.size, left, right: left + mainW };
}

type InlineOpts = {
  box: Box;
  main: Type;
  sub: Type;
  mainPaint: Paint;
  subPaint: Paint;
  /** "spread": texto à esquerda, subtexto encostado à direita. */
  align?: "center" | "left" | "spread";
  /** Separador entre os dois: largura em em e o desenho no espaço reservado. */
  sep?: { width: number; draw: (x0: number, x1: number, cy: number, size: number) => void };
  subPlate?: (x: number, y: number, w: number, h: number) => void;
  mainMax?: number;
};

/** Faixas compridas (caneta, régua, pulseira, cordão): tudo numa linha só. */
function inline(s: Scene, o: InlineOpts): { left: number; right: number; cy: number; size: number } {
  const { ctx } = s;
  const { box } = o;
  const hasSub = Boolean(s.sub);
  const mainMax = Math.min(o.mainMax ?? box.h * 0.7, box.h * 0.8);
  // Divide a largura pela proporção natural dos dois textos (subtexto longo não vira miniatura).
  let share = 1;
  if (hasSub) {
    setType(ctx, o.main, 100);
    const mainNat = ctx.measureText(s.text).width;
    setType(ctx, o.sub, 46);
    const subNat = ctx.measureText(s.sub).width;
    share = Math.min(0.8, Math.max(0.5, mainNat / Math.max(1, mainNat + subNat)));
  }
  const mainF = fitText(ctx, s.text, o.main, box.w * (hasSub ? share - 0.06 : 1), box.h, mainMax, 1);
  const subF = hasSub ? fitText(ctx, s.sub, o.sub, box.w * (1 - share - 0.06), box.h * 0.6, Math.max(4, mainF.size * 0.46), 1) : NO_FIT;
  const mainW = fitWidth(ctx, mainF);
  const pad = subF.size * 0.85;
  const subW = subF.lines.length ? fitWidth(ctx, subF) + (o.subPlate ? pad * 2 : 0) : 0;
  const gap = mainF.size * 0.42;
  const sepW = subW && o.sep ? o.sep.width * mainF.size : 0;
  const cy = box.y + box.h / 2;
  const total = mainW + (subW ? gap + sepW + (sepW ? gap : 0) + subW : 0);
  const spread = o.align === "spread" && subW > 0;
  const x0 = o.align === "left" || spread ? box.x : box.x + (box.w - total) / 2;
  drawFit(ctx, mainF, x0, cy, "left", o.mainPaint);
  let x = x0 + mainW;
  if (subW) {
    const subX = spread ? box.x + box.w - subW : x + gap + sepW + (sepW ? gap : 0);
    if (o.sep) o.sep.draw(x + gap, subX - (sepW ? gap : 0), cy, mainF.size);
    if (o.subPlate) {
      const ph = blockHeight(subF) + subF.size * 0.95;
      o.subPlate(subX, cy - ph / 2, subW, ph);
      drawFit(ctx, subF, subX + pad, cy, "left", o.subPaint);
    } else {
      drawFit(ctx, subF, subX, cy, "left", o.subPaint);
    }
    x = subX + subW;
  }
  return { left: x0, right: x, cy, size: mainF.size };
}

// ---------------------------------------------------------------------------
// Ornamentos

/** Os quatro cartões coloridos do símbolo da Padrão, usados como "logo de exemplo". */
function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const cardW = size;
  const cardH = size * 0.62;
  ["#e02018", "#f8e028", "#18b0e8", "#b0c818"].forEach((color, i) => {
    ctx.save();
    ctx.translate(x + i * cardW * 0.08, y + i * cardH * 0.12);
    ctx.rotate((-8 + i * 4) * (Math.PI / 180));
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(0, 0, cardW, cardH, cardH * 0.18);
    ctx.fill();
    ctx.restore();
  });
}

/** Largura e altura aproximadas do símbolo desenhado com `size`. */
const MARK_W = 1.3;
const MARK_H = 1.15;

function spectrumBand(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  SPECTRUM.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + (w / SPECTRUM.length) * i, y, w / SPECTRUM.length + 1, h);
  });
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.7, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.7, y);
  ctx.closePath();
  ctx.fill();
}

function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number, points: number, rotation = 0) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 ? inner : outer;
    const a = rotation - Math.PI / 2 + (i * Math.PI) / points;
    ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
  }
  ctx.closePath();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  starPath(ctx, x, y, r, r * 0.45, 5);
  ctx.fill();
}

/** Raios de sol alternados a partir de um ponto. */
function sunburst(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, rays: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < rays; i += 1) {
    const a0 = (i * Math.PI * 2) / rays;
    const a1 = a0 + Math.PI / rays;
    ctx.moveTo(x, y);
    ctx.lineTo(x + radius * Math.cos(a0), y + radius * Math.sin(a0));
    ctx.lineTo(x + radius * Math.cos(a1), y + radius * Math.sin(a1));
    ctx.closePath();
  }
  ctx.fill();
}

/** Três faixas finas paralelas (vermelho, âmbar, amarelo) — o "anos 70". */
function retroStripes(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, vertical = false) {
  const colors = [C.red, C.amber, C.sun];
  const band = (vertical ? w : h) / 3.4;
  colors.forEach((color, i) => {
    ctx.fillStyle = color;
    if (vertical) ctx.fillRect(x + i * band * 1.2, y, band, h);
    else ctx.fillRect(x, y + i * band * 1.2, w, band);
  });
}

/** Fita com pontas recortadas (subtexto do retrô). */
function ribbon(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  const tail = h * 0.7;
  const dark = mix(color, "#000000", 0.28);
  ctx.fillStyle = dark;
  for (const side of [-1, 1]) {
    const edge = side < 0 ? x : x + w;
    ctx.beginPath();
    ctx.moveTo(edge, y + h * 0.22);
    ctx.lineTo(edge + side * tail, y + h * 0.22);
    ctx.lineTo(edge + side * tail * 0.62, y + h * 0.72);
    ctx.lineTo(edge + side * tail, y + h * 1.22);
    ctx.lineTo(edge - side * h * 0.2, y + h * 1.22);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Pílula sólida (subtexto do vibrante). */
function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
}

/** Ramo de louro ao longo de um arco (de `from` a `to`, em radianos). */
function laurel(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, from: number, to: number, leaf: number, color: string) {
  const n = Math.max(4, Math.round((Math.abs(to - from) * r) / (leaf * 1.25)));
  const dir = Math.sign(to - from) || 1;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = leaf * 0.14;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r, from, to, dir < 0);
  ctx.stroke();
  for (let i = 1; i <= n; i += 1) {
    const theta = from + ((to - from) * i) / n;
    const px = cx + r * Math.cos(theta);
    const py = cy + r * Math.sin(theta);
    const tangent = theta + (dir * Math.PI) / 2;
    const scale = 0.55 + 0.45 * Math.sin((Math.PI * i) / (n + 1));
    for (const side of [-1, 1]) {
      const a = tangent + side * 0.62;
      ctx.beginPath();
      ctx.ellipse(px + Math.cos(a) * leaf * 0.5 * scale, py + Math.sin(a) * leaf * 0.5 * scale, leaf * 0.55 * scale, leaf * 0.2 * scale, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Arabesco em S com ponto na ponta (elegante). */
function flourish(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, dir: 1 | -1, color: string, lw: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x + dir * len * 0.3, y - len * 0.2, x + dir * len * 0.55, y + len * 0.2, x + dir * len * 0.82, y);
  ctx.quadraticCurveTo(x + dir * len * 0.95, y - len * 0.1, x + dir * len, y - len * 0.02);
  ctx.stroke();
  circle(ctx, x + dir * len, y - len * 0.02, lw * 1.6);
  ctx.fillStyle = color;
  ctx.fill();
  diamond(ctx, x, y, lw * 2.4, color);
}

/** Linha — losango — linha (divisor do elegante). */
function diamondRule(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, color: string, lw: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x - width / 2, y);
  ctx.lineTo(x - lw * 4, y);
  ctx.moveTo(x + lw * 4, y);
  ctx.lineTo(x + width / 2, y);
  ctx.stroke();
  diamond(ctx, x, y, lw * 2.6, color);
}

/** Moldura dupla fina com losangos nos cantos. */
function doubleFrame(ctx: CanvasRenderingContext2D, box: Box, gap: number, lw: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.lineWidth = lw * 0.45;
  ctx.strokeRect(box.x + gap, box.y + gap, box.w - gap * 2, box.h - gap * 2);
  for (const [px, py] of [
    [box.x + gap, box.y + gap],
    [box.x + box.w - gap, box.y + gap],
    [box.x + gap, box.y + box.h - gap],
    [box.x + box.w - gap, box.y + box.h - gap],
  ]) {
    diamond(ctx, px, py, gap * 0.75, color);
  }
}

function squiggle(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, angle: number, color: string, lw: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i <= 12; i += 1) {
    const t = i / 12;
    ctx.lineTo(-len / 2 + t * len, Math.sin(t * Math.PI * 3) * len * 0.12);
  }
  ctx.stroke();
  ctx.restore();
}

/** Ponto dentro da elipse central (onde fica o texto)? */
function inCenter(x: number, y: number, w: number, h: number, rx: number, ry: number) {
  const dx = (x - w / 2) / (w * rx);
  const dy = (y - h / 2) / (h * ry);
  return dx * dx + dy * dy < 1;
}

/** Placa central dos padrões "home": proporção que funciona em toalha, almofada, meia ou passadeira. */
function plateBox(s: Scene): Box {
  const { w, h, shape } = s;
  const size: Record<Shape, [number, number]> = { strip: [0.56, 0.7], wide: [0.6, 0.52], square: [0.74, 0.46], tall: [0.84, 0.32], pole: [0.86, 0.3] };
  const [fw, fh] = size[shape];
  return { x: (w * (1 - fw)) / 2, y: (h * (1 - fh)) / 2, w: w * fw, h: h * fh };
}

function inset(box: Box, px: number, py = px): Box {
  return { x: box.x + px, y: box.y + py, w: Math.max(4, box.w - px * 2), h: Math.max(4, box.h - py * 2) };
}

// ---------------------------------------------------------------------------
// Estilos

function paintClassico(s: Scene) {
  const { ctx, w, h, unit, shape, family } = s;
  const main: Type = { font: s.font, lineHeight: 1.04 };
  const sub: Type = { font: "figtree", weight: 700, caps: true, tracking: 0.16 };
  const mainPaint: Paint = { fill: s.ink };
  const subPaint: Paint = { fill: rgba(s.ink, 0.72) };
  const ruleW = unit * 0.11;
  const centerRule = (x: number, y: number) => {
    ctx.fillStyle = s.accent;
    ctx.fillRect(x - ruleW / 2, y - unit * 0.006, ruleW, unit * 0.012);
  };
  const leftRule = (x: number, y: number) => {
    ctx.fillStyle = s.accent;
    ctx.fillRect(x, y - unit * 0.006, ruleW, unit * 0.012);
  };
  const lines = MAX_LINES[shape];

  if (family === "apparel" || (family === "badge" && shape === "square")) {
    // Selo: aro duplo, texto no miolo, subtexto em arco embaixo e estrelas em cima.
    const cx = w / 2;
    const cy = h / 2;
    const r = unit * (family === "badge" ? 0.42 : 0.46);
    ctx.strokeStyle = s.ink;
    ctx.lineWidth = unit * 0.022;
    circle(ctx, cx, cy, r);
    ctx.stroke();
    ctx.strokeStyle = family === "badge" ? s.accent : s.ink;
    ctx.lineWidth = unit * 0.008;
    circle(ctx, cx, cy, r * 0.8);
    ctx.stroke();
    const placed = stack(s, { box: { x: cx - r * 0.66, y: cy - r * 0.52, w: r * 1.32, h: r * 0.96 }, main, sub, mainMax: r * 0.44, maxLines: 3, mainPaint, subPaint, noSub: true });
    spectrumBand(ctx, cx - r * 0.3, Math.min(cy + r * 0.62, placed.bottom + r * 0.08), r * 0.6, unit * 0.018);
    for (const k of [-1, 0, 1]) {
      const a = -Math.PI / 2 + k * 0.32;
      star(ctx, cx + r * 0.9 * Math.cos(a), cy + r * 0.9 * Math.sin(a), r * (k ? 0.04 : 0.055), s.accent);
    }
    if (s.sub) arcText(ctx, s.sub, cx, cy, r * 0.9, r * 0.11, Math.PI * 0.82, sub, s.ink, true);
    else for (const k of [-1, 1]) star(ctx, cx + r * 0.9 * Math.cos(Math.PI / 2 + k * 0.2), cy + r * 0.9 * Math.sin(Math.PI / 2 + k * 0.2), r * 0.04, s.ink);
    return;
  }

  if (family === "home") {
    // Confete do espectro espalhado e uma placa com o nome.
    const count = Math.min(140, Math.round((w * h) / (unit * unit * 0.012)));
    for (let i = 0; i < count; i += 1) {
      const x = s.rng() * w;
      const y = s.rng() * h;
      ctx.fillStyle = rgba(SPECTRUM[i % SPECTRUM.length], 0.55);
      circle(ctx, x, y, unit * (0.01 + s.rng() * 0.022));
      ctx.fill();
    }
    const plate = plateBox(s);
    ctx.fillStyle = s.bg;
    ctx.strokeStyle = s.ink;
    ctx.lineWidth = unit * 0.006;
    ctx.beginPath();
    ctx.roundRect(plate.x, plate.y, plate.w, plate.h, unit * 0.04);
    ctx.fill();
    ctx.stroke();
    stack(s, { box: inset(plate, plate.w * 0.08, plate.h * 0.14), main, sub, mainMax: unit * 0.24, maxLines: Math.max(2, lines), mainPaint, subPaint, divider: centerRule, dividerH: unit * 0.012 });
    return;
  }

  const pad = unit * 0.09;
  const band = unit * 0.055;
  if (shape === "strip") {
    spectrumBand(ctx, 0, h - h * 0.09, w, h * 0.09);
    const size = h * 0.42;
    drawMark(ctx, pad, (h - size * MARK_H) / 2 - h * 0.04, size);
    if (family === "wrap") drawMark(ctx, w - pad - size * MARK_W, (h - size * MARK_H) / 2 - h * 0.04, size);
    const left = pad * 2 + size * MARK_W;
    const right = family === "wrap" ? left : pad;
    inline(s, {
      box: { x: left, y: h * 0.08, w: w - left - right, h: h * 0.76 },
      main,
      sub,
      mainPaint,
      subPaint,
      align: family === "wrap" ? "center" : "left",
      sep: { width: 0.35, draw: (x0, x1, cy, sz) => {
        ctx.fillStyle = s.accent;
        ctx.fillRect(x0, cy - sz * 0.03, Math.max(1, x1 - x0), sz * 0.06);
      } },
    });
    return;
  }

  if (family === "card" && shape !== "tall" && shape !== "pole") {
    // Cartão deitado: símbolo à esquerda, nome alinhado à esquerda, filete e contato.
    const size = Math.min(unit * 0.3, w * 0.18);
    drawMark(ctx, pad, (h - size * MARK_H) / 2 - band / 2, size);
    const textX = pad * 2 + size * MARK_W;
    stack(s, { box: { x: textX, y: pad, w: w - textX - pad, h: h - pad * 2 - band }, main, sub, mainMax: unit * 0.22, maxLines: 2, mainPaint, subPaint, align: "left", divider: leftRule, dividerH: unit * 0.012, subLines: 2 });
    spectrumBand(ctx, 0, h - band, w, band);
    return;
  }

  if (family === "badge") {
    // Chaveiro, ímã, tag: moldura arredondada fina.
    const frame = inset({ x: 0, y: 0, w, h }, unit * 0.07);
    ctx.strokeStyle = s.ink;
    ctx.lineWidth = unit * 0.02;
    ctx.beginPath();
    ctx.roundRect(frame.x, frame.y, frame.w, frame.h, unit * 0.1);
    ctx.stroke();
    const placed = stack(s, { box: inset(frame, unit * 0.08), main, sub, mainMax: unit * 0.26, maxLines: lines, mainPaint, subPaint, divider: centerRule, dividerH: unit * 0.012, subLines: 2 });
    spectrumBand(ctx, w / 2 - unit * 0.15, Math.min(frame.y + frame.h - unit * 0.06, placed.bottom + unit * 0.05), unit * 0.3, unit * 0.025);
    return;
  }

  // Placa, banner, impresso, caneca, crachá em pé: símbolo, título, filete, subtexto e faixa.
  spectrumBand(ctx, 0, h - band, w, band);
  let top = pad;
  if (family === "wrap" && shape === "wide") {
    const size = unit * 0.28;
    drawMark(ctx, w * 0.05, h * 0.36, size);
    drawMark(ctx, w * 0.95 - size * MARK_W, h * 0.36, size);
    stack(s, { box: { x: w * 0.05 + size * MARK_W + pad, y: pad, w: w * 0.9 - (size * MARK_W + pad) * 2, h: h - pad * 2 - band }, main, sub, mainMax: unit * 0.34, maxLines: 2, mainPaint, subPaint, divider: centerRule, dividerH: unit * 0.012 });
    return;
  }
  const size = shape === "pole" ? w * 0.4 : unit * 0.17;
  drawMark(ctx, w / 2 - (size * MARK_W) / 2, top, size);
  top += size * MARK_H + pad * 0.5;
  stack(s, { box: { x: pad, y: top, w: w - pad * 2, h: h - top - pad - band }, main, sub, mainMax: unit * 0.24, maxLines: lines, mainPaint, subPaint, divider: centerRule, dividerH: unit * 0.012, subLines: shape === "tall" || shape === "pole" ? 2 : 1 });
}

function paintModerno(s: Scene) {
  const { ctx, w, h, unit, shape, family } = s;
  const main: Type = { font: s.font, tracking: -0.01, lineHeight: 1.0 };
  const sub: Type = { font: "figtree", weight: 600, caps: true, tracking: 0.22 };
  const mainPaint: Paint = { fill: s.ink };
  const subPaint: Paint = { fill: rgba(s.ink, 0.7) };
  const a1 = s.accent;
  const a2 = s.accent2;
  const pad = unit * 0.1;
  const bar = unit * 0.022;
  const lines = MAX_LINES[shape];
  const squares = (x: number, y: number, size: number) => {
    [a1, a2, s.ink].forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(x + i * size * 1.45, y, size, size);
    });
  };
  const sideBar = (placed: Placed) => {
    ctx.fillStyle = a1;
    ctx.fillRect(placed.left - bar * 2.6, placed.top, bar, placed.bottom - placed.top);
  };

  if (shape === "strip" && family !== "home") {
    // Bloco inclinado na ponta, texto alinhado à esquerda e subtexto encostado à direita.
    ctx.fillStyle = a1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(h * 1.15, 0);
    ctx.lineTo(h * 0.8, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = a2;
    ctx.fillRect(h * 0.28, h * 0.36, h * 0.28, h * 0.28);
    ctx.fillStyle = a1;
    ctx.fillRect(w - h * 0.16, h * 0.18, h * 0.06, h * 0.64);
    const x = h * 1.35;
    inline(s, {
      box: { x, y: h * 0.1, w: w - x - h * 0.4, h: h * 0.8 },
      main,
      sub,
      mainPaint,
      subPaint,
      align: "spread",
      sep: { width: 0.8, draw: (x0, x1, cy) => {
        ctx.fillStyle = rgba(s.ink, 0.25);
        ctx.fillRect(x0, cy, Math.max(1, x1 - x0), Math.max(1, h * 0.012));
      } },
    });
    return;
  }

  if (family === "apparel") {
    // Etiqueta: texto empilhado à esquerda e o subtexto vazado num bloco de cor.
    const box = { x: w * 0.1, y: h * 0.12, w: w * 0.8, h: h * 0.76 };
    const placed = stack(s, {
      box,
      main,
      sub: { ...sub, weight: 700 },
      mainMax: unit * 0.3,
      maxLines: Math.max(3, lines),
      mainPaint,
      subPaint: { fill: readableInk(a1) },
      align: "left",
      subRatio: 0.3,
      gap: 0.2,
      subPlate: (x, y, pw, ph, mainW) => {
        ctx.fillStyle = a1;
        ctx.fillRect(x, y, Math.max(pw, mainW * 0.6), ph);
      },
    });
    ctx.fillStyle = a2;
    circle(ctx, placed.right + placed.size * 0.18, placed.top + placed.size * 0.12, placed.size * 0.11);
    ctx.fill();
    if (!s.sub) {
      ctx.fillStyle = a1;
      ctx.fillRect(placed.left, placed.mainBottom + placed.size * 0.18, placed.mainW * 0.45, placed.size * 0.12);
    }
    return;
  }

  if (family === "badge") {
    // Faixa de cor embaixo com o subtexto vazado; ponto e fio em cima.
    const split = s.sub ? h * 0.7 : h * 0.8;
    ctx.fillStyle = a1;
    ctx.fillRect(0, split, w, h - split);
    ctx.fillStyle = a2;
    circle(ctx, w * 0.5, h * 0.17, unit * 0.04);
    ctx.fill();
    stack(s, { box: { x: w * 0.14, y: h * 0.24, w: w * 0.72, h: split - h * 0.3 }, main, sub, mainMax: unit * 0.28, maxLines: lines, mainPaint, subPaint, noSub: true });
    if (s.sub) {
      const f = fitText(ctx, s.sub, sub, w * 0.66, (h - split) * 0.4, unit * 0.07, 1);
      drawFit(ctx, f, w / 2, split + (h - split) * 0.42, "center", { fill: readableInk(a1) });
    }
    return;
  }

  if (family === "home") {
    // Grade geométrica (círculos, meias-luas, quadrados) e placa reta com o nome.
    const cell = unit * 0.2;
    const cols = Math.min(40, Math.ceil(w / cell));
    const rows = Math.min(40, Math.ceil(h / cell));
    const colors = [a1, a2, s.ink];
    for (let i = 0; i < cols; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        const kind = Math.floor(s.rng() * 5);
        const color = colors[(i + j) % colors.length];
        const x = i * cell;
        const y = j * cell;
        ctx.fillStyle = rgba(color, 0.16);
        ctx.beginPath();
        if (kind === 0) ctx.arc(x + cell / 2, y + cell / 2, cell * 0.38, 0, Math.PI * 2);
        else if (kind === 1) ctx.arc(x + cell / 2, y + cell / 2, cell * 0.4, Math.PI * Math.floor(s.rng() * 4) * 0.5, Math.PI * Math.floor(s.rng() * 4) * 0.5 + Math.PI);
        else if (kind === 2) {
          ctx.moveTo(x, y);
          ctx.arc(x, y, cell * 0.9, 0, Math.PI / 2);
        } else if (kind === 3) ctx.rect(x + cell * 0.3, y + cell * 0.3, cell * 0.4, cell * 0.4);
        ctx.fill();
      }
    }
    const plate = plateBox(s);
    ctx.fillStyle = s.bg;
    ctx.fillRect(plate.x, plate.y, plate.w, plate.h);
    ctx.fillStyle = a1;
    ctx.fillRect(plate.x, plate.y + plate.h - unit * 0.018, plate.w, unit * 0.018);
    const placed = stack(s, { box: inset(plate, plate.w * 0.1, plate.h * 0.14), main, sub, mainMax: unit * 0.24, maxLines: Math.max(2, lines), mainPaint, subPaint, align: "left" });
    sideBar(placed);
    return;
  }

  if (family === "wrap" && shape === "wide") {
    // Caneca e copo: formas nas laterais, texto centralizado de frente para a câmera.
    ctx.fillStyle = a1;
    circle(ctx, 0, h * 0.5, h * 0.36);
    ctx.fill();
    ctx.fillStyle = a2;
    ctx.save();
    ctx.translate(w, h * 0.5);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-h * 0.22, -h * 0.22, h * 0.44, h * 0.44);
    ctx.restore();
    const placed = stack(s, { box: { x: h * 0.5, y: pad, w: w - h, h: h - pad * 2 }, main, sub, mainMax: unit * 0.34, maxLines: 2, mainPaint, subPaint, divider: (x, y) => {
      ctx.fillStyle = a1;
      ctx.fillRect(x - unit * 0.07, y - unit * 0.008, unit * 0.14, unit * 0.016);
    }, dividerH: unit * 0.016 });
    squares(placed.right - unit * 0.12, Math.min(h - pad * 0.6, placed.bottom + unit * 0.06), unit * 0.03);
    return;
  }

  if (shape === "wide") {
    // Grade suíça: texto à esquerda, círculo grande cortado no canto direito.
    ctx.fillStyle = a1;
    circle(ctx, w - unit * 0.08, unit * 0.1, unit * (family === "card" ? 0.46 : 0.5));
    ctx.fill();
    ctx.fillStyle = a2;
    circle(ctx, w - unit * 0.5, unit * 0.62, unit * 0.1);
    ctx.fill();
    const left = pad + bar * 2.6;
    const placed = stack(s, { box: { x: left, y: pad, w: w * 0.6 - left, h: h - pad * 2 }, main, sub, mainMax: unit * 0.26, maxLines: 2, mainPaint, subPaint, align: "left", valign: family === "card" ? "center" : "bottom", subLines: 2 });
    sideBar(placed);
    squares(w - pad - unit * 0.13, h - pad - unit * 0.03, unit * 0.03);
    return;
  }

  // Quadrado e em pé: círculo no alto à direita, texto na metade de baixo, alinhado à esquerda.
  const r = shape === "square" ? unit * 0.34 : w * 0.44;
  ctx.fillStyle = a1;
  circle(ctx, w - r * 0.35, r * 0.4, r);
  ctx.fill();
  ctx.fillStyle = a2;
  circle(ctx, w - r * 1.25, r * 1.2, r * 0.18);
  ctx.fill();
  squares(pad, pad, unit * 0.035);
  // O texto começa abaixo do círculo: frase longa não invade a forma.
  const top = shape === "square" ? r * 1.45 : r * 1.6;
  const left = pad + bar * 2.6;
  const placed = stack(s, { box: { x: left, y: top, w: w - left - pad, h: h - top - pad }, main, sub, mainMax: unit * 0.26, maxLines: lines, mainPaint, subPaint, align: "left", valign: "bottom", subLines: 2 });
  sideBar(placed);
}

function paintRetro(s: Scene) {
  const { ctx, w, h, unit, shape, family } = s;
  const main: Type = { font: s.font, caps: true, tracking: 0.02, lineHeight: 0.98 };
  const sub: Type = { font: "figtree", weight: 800, caps: true, tracking: 0.12 };
  const extrude = pick([s.accent2, C.red, C.magenta, C.amber], [s.ink], 1.4);
  const mainPaint: Paint = { fill: s.ink, extrude, depth: 0.075 };
  const ribbonColor = pick([C.amber, C.red, C.sun], [s.bg], 1.3);
  const subPaint: Paint = { fill: readableInk(ribbonColor) };
  const plate = (x: number, y: number, pw: number, ph: number) => ribbon(ctx, x, y, pw, ph, ribbonColor);
  const dark = luminance(s.bg) < 0.25;
  const rays = rgba(s.accent, dark ? 0.22 : 0.16);
  const pad = unit * 0.1;
  const lines = MAX_LINES[shape];

  if (shape === "strip" && family !== "home") {
    retroStripes(ctx, 0, 0, w, h * 0.16);
    retroStripes(ctx, 0, h * 0.84, w, h * 0.16);
    inline(s, {
      box: { x: h * 0.5, y: h * 0.2, w: w - h, h: h * 0.6 },
      main,
      sub,
      mainPaint,
      subPaint: { fill: s.ink },
      sep: { width: 0.6, draw: (x0, x1, cy, size) => star(ctx, (x0 + x1) / 2, cy, size * 0.2, extrude) },
    });
    return;
  }

  if (family === "apparel") {
    // Pôr do sol listrado (as listas vazadas mostram o tecido), letra com volume e fita.
    const cx = w / 2;
    const r = unit * 0.34;
    const cy = h * 0.4;
    ctx.save();
    circle(ctx, cx, cy, r);
    ctx.clip();
    const zones = [C.sun, C.amber, C.red];
    zones.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(cx - r, cy - r + (i * 2 * r) / 3, r * 2, (2 * r) / 3 + 1);
    });
    ctx.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 4; i += 1) {
      const y = cy + r * (0.12 + i * 0.22);
      ctx.fillRect(cx - r, y, r * 2, r * (0.05 + i * 0.025));
    }
    ctx.restore();
    stack(s, { box: { x: w * 0.06, y: h * 0.5, w: w * 0.88, h: h * 0.46 }, main, sub, mainMax: unit * 0.24, maxLines: 2, mainPaint, subPaint, subPlate: plate, subRatio: 0.32 });
    return;
  }

  if (family === "badge" && shape === "square") {
    const cx = w / 2;
    const cy = h / 2;
    const r = unit * 0.44;
    ctx.save();
    circle(ctx, cx, cy, r);
    ctx.clip();
    sunburst(ctx, cx, cy, r, 24, rays);
    ctx.restore();
    ctx.strokeStyle = s.ink;
    ctx.lineWidth = unit * 0.02;
    circle(ctx, cx, cy, r);
    ctx.stroke();
    for (const k of [-1, 0, 1]) star(ctx, cx + k * r * 0.26, cy - r * 0.68 + Math.abs(k) * r * 0.05, r * 0.06, extrude);
    stack(s, { box: { x: cx - r * 0.78, y: cy - r * 0.5, w: r * 1.56, h: r * 1.15 }, main, sub, mainMax: r * 0.42, maxLines: 3, mainPaint, subPaint, subPlate: plate, subRatio: 0.32 });
    return;
  }

  if (family === "home") {
    // Ondas quentes em faixas e uma placa-pílula com o nome.
    const colors = [C.red, C.amber, C.sun];
    const step = unit * 0.09;
    const rowsN = Math.min(48, Math.ceil(h / step) + 1);
    const wave = unit * 0.25;
    const segs = Math.min(120, Math.ceil(w / (unit * 0.02)));
    ctx.lineWidth = unit * 0.035;
    ctx.lineCap = "round";
    for (let j = 0; j < rowsN; j += 1) {
      ctx.strokeStyle = rgba(colors[j % 3], 0.32);
      ctx.beginPath();
      for (let i = 0; i <= segs; i += 1) {
        const x = (i / segs) * w;
        ctx.lineTo(x, j * step + Math.sin((x / wave) * Math.PI * 2 + j * 0.8) * unit * 0.02);
      }
      ctx.stroke();
    }
    const box = plateBox(s);
    ctx.fillStyle = s.bg;
    ctx.strokeStyle = s.ink;
    ctx.lineWidth = unit * 0.008;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, Math.min(box.h, box.w) / 2);
    ctx.fill();
    ctx.stroke();
    stack(s, { box: inset(box, box.w * 0.12, box.h * 0.16), main, sub, mainMax: unit * 0.22, maxLines: Math.max(2, lines), mainPaint, subPaint: { fill: rgba(s.ink, 0.75) } });
    return;
  }

  if (family === "card" && shape === "wide") {
    // Cartão: listras verticais na esquerda e raios saindo do canto.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    sunburst(ctx, 0, h, Math.hypot(w, h), 30, rays);
    ctx.restore();
    retroStripes(ctx, pad * 0.7, 0, unit * 0.12, h, true);
    const left = pad * 0.7 + unit * 0.2;
    stack(s, { box: { x: left, y: pad, w: w - left - pad, h: h - pad * 2 }, main, sub, mainMax: unit * 0.26, maxLines: 2, mainPaint, subPaint, subPlate: plate, subRatio: 0.3 });
    return;
  }

  // Placa, caneca, crachá, chaveiro em pé: raios de sol, listras em cima e embaixo, estrelas.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  sunburst(ctx, w / 2, h * 0.56, Math.hypot(w, h), 28, rays);
  ctx.restore();
  const stripeH = unit * 0.07;
  retroStripes(ctx, 0, unit * 0.04, w, stripeH);
  retroStripes(ctx, 0, h - unit * 0.04 - stripeH, w, stripeH);
  const box = { x: pad, y: unit * 0.04 + stripeH + pad * 0.6, w: w - pad * 2, h: h - (unit * 0.04 + stripeH + pad * 0.6) * 2 };
  const placed = stack(s, { box: shape === "wide" ? inset(box, unit * 0.12, 0) : box, main, sub, mainMax: unit * 0.26, maxLines: lines, mainPaint, subPaint, subPlate: plate, subRatio: 0.3, subLines: 1 });
  // Estrelas ladeando o título só quando cabem inteiras na arte.
  const starR = placed.size * 0.16;
  if ((shape === "wide" || shape === "square") && placed.left - placed.size * 0.45 - starR > 0 && placed.right + placed.size * 0.5 + starR < w) {
    const y = placed.top + placed.size * 0.45;
    star(ctx, placed.left - placed.size * 0.45, y, starR, extrude);
    star(ctx, placed.right + placed.size * 0.5, y, starR, extrude);
  }
}

function paintMinimal(s: Scene) {
  const { ctx, w, h, unit, shape, family } = s;
  const main: Type = { font: s.font, weight: 500, tracking: 0.02, lineHeight: 1.12 };
  const sub: Type = { font: "figtree", weight: 500, caps: true, tracking: 0.32 };
  const mainPaint: Paint = { fill: s.ink };
  const subPaint: Paint = { fill: rgba(s.ink, 0.6) };
  const hair = Math.max(1, unit * 0.004);
  const dot = (x: number, y: number, r = unit * 0.014) => {
    ctx.fillStyle = s.accent;
    circle(ctx, x, y, r);
    ctx.fill();
  };
  const hairline = (x: number, y: number) => {
    ctx.fillStyle = rgba(s.ink, 0.5);
    ctx.fillRect(x - unit * 0.04, y - hair / 2, unit * 0.08, hair);
  };
  const lines = MAX_LINES[shape];
  const pad = unit * 0.16;

  if (shape === "strip" && family !== "home") {
    dot(h * 0.45, h / 2, h * 0.07);
    inline(s, {
      box: { x: h * 0.8, y: h * 0.18, w: w - h * 1.25, h: h * 0.64 },
      main,
      sub,
      mainPaint,
      subPaint,
      mainMax: h * 0.48,
      align: "spread",
      sep: { width: 1, draw: (x0, x1, cy) => {
        ctx.fillStyle = rgba(s.ink, 0.35);
        ctx.fillRect(x0, cy - hair / 2, Math.max(1, x1 - x0), hair);
      } },
    });
    return;
  }

  if (family === "home") {
    // Fios diagonais quase invisíveis e o nome num respiro liso.
    ctx.strokeStyle = rgba(s.ink, 0.07);
    ctx.lineWidth = hair;
    const step = unit * 0.08;
    const count = Math.min(160, Math.ceil((w + h) / step));
    ctx.beginPath();
    for (let i = 0; i < count; i += 1) {
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step - h, h);
    }
    ctx.stroke();
    const box = plateBox(s);
    ctx.fillStyle = s.bg;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    const placed = stack(s, { box: inset(box, box.w * 0.1, box.h * 0.16), main, sub, mainMax: unit * 0.18, maxLines: Math.max(2, lines), mainPaint, subPaint, divider: hairline, dividerH: hair, gap: 0.45 });
    dot(w / 2, placed.top - unit * 0.05);
    return;
  }

  if (family === "badge") {
    ctx.strokeStyle = rgba(s.ink, 0.5);
    ctx.lineWidth = hair;
    ctx.beginPath();
    if (shape === "square") ctx.ellipse(w / 2, h / 2, w * 0.43, h * 0.43, 0, 0, Math.PI * 2);
    else ctx.roundRect(unit * 0.07, unit * 0.07, w - unit * 0.14, h - unit * 0.14, unit * 0.08);
    ctx.stroke();
    const placed = stack(s, { box: inset({ x: 0, y: 0, w, h }, unit * 0.2), main, sub, mainMax: unit * 0.2, maxLines: lines, mainPaint, subPaint, divider: hairline, dividerH: hair, gap: 0.45 });
    dot(w / 2, placed.top - unit * 0.06);
    return;
  }

  if (family === "card") {
    // Cartão: nome embaixo à esquerda, ponto coral no canto oposto.
    dot(w - pad * 0.7, pad * 0.7, unit * 0.022);
    ctx.fillStyle = rgba(s.ink, 0.35);
    ctx.fillRect(pad * 0.7, pad * 0.7, unit * 0.12, hair);
    stack(s, { box: { x: pad * 0.7, y: h * 0.3, w: w * 0.8, h: h * 0.7 - pad * 0.7 }, main, sub, mainMax: unit * 0.18, maxLines: lines, mainPaint, subPaint, align: "left", valign: "bottom", gap: 0.5, subLines: 2 });
    return;
  }

  // Placa, caneca, estampa: tudo centralizado com muito respiro.
  const box = family === "apparel" ? inset({ x: 0, y: 0, w, h }, unit * 0.1) : inset({ x: 0, y: 0, w, h }, Math.max(pad, w * 0.14), pad);
  const placed = stack(s, { box, main, sub, mainMax: unit * (family === "apparel" ? 0.22 : 0.2), maxLines: lines, mainPaint, subPaint, divider: hairline, dividerH: hair, gap: 0.5, subLines: shape === "tall" || shape === "pole" ? 2 : 1 });
  dot(w / 2, placed.top - unit * 0.06);
}

function paintVibrante(s: Scene) {
  const { ctx, w, h, unit, shape, family } = s;
  const main: Type = { font: s.font, weight: 900, lineHeight: 1.0 };
  const sub: Type = { font: "figtree", weight: 800, tracking: 0.04 };
  const mainPaint: Paint = { fill: s.ink, stroke: s.paper, strokeW: 0.16, drop: s.accent2, dropOffset: 0.07 };
  const subPaint: Paint = { fill: s.paper };
  const plate = (x: number, y: number, pw: number, ph: number) => pill(ctx, x, y, pw, ph, s.ink);
  const lines = MAX_LINES[shape];
  const tilted = (angle: number, draw: () => void) => {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angle);
    ctx.translate(-w / 2, -h / 2);
    draw();
    ctx.restore();
  };
  const blobs = (count: number, rMin: number, rMax: number) => {
    for (let i = 0; i < count; i += 1) {
      const t = s.rng();
      const per = 2 * (w + h);
      const d = t * per;
      const x = d < w ? d : d < w + h ? w : d < 2 * w + h ? 2 * w + h - d : 0;
      const y = d < w ? 0 : d < w + h ? d - w : d < 2 * w + h ? h : per - d;
      ctx.fillStyle = SPECTRUM[(i * 3) % SPECTRUM.length];
      circle(ctx, x, y, unit * (rMin + s.rng() * (rMax - rMin)));
      ctx.fill();
    }
  };
  const confetti = (count: number, avoidX: number, avoidY: number, alpha = 1) => {
    for (let i = 0; i < count; i += 1) {
      const x = s.rng() * w;
      const y = s.rng() * h;
      if (inCenter(x, y, w, h, avoidX, avoidY)) continue;
      const color = rgba(SPECTRUM[i % SPECTRUM.length], alpha);
      const kind = i % 4;
      const size = unit * (0.02 + s.rng() * 0.025);
      if (kind === 0) {
        ctx.fillStyle = color;
        circle(ctx, x, y, size * 0.6);
        ctx.fill();
      } else if (kind === 1) squiggle(ctx, x, y, size * 3, s.rng() * Math.PI, color, unit * 0.012);
      else if (kind === 2) {
        ctx.fillStyle = color;
        starPath(ctx, x, y, size, size * 0.5, 3, s.rng() * Math.PI);
        ctx.fill();
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = unit * 0.01;
        circle(ctx, x, y, size * 0.7);
        ctx.stroke();
      }
    }
  };

  if (shape === "strip" && family !== "home") {
    // Listras diagonais do espectro nas duas pontas.
    const end = Math.min(w * 0.16, h * 2.2);
    for (const x0 of [0, w - end]) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, 0, end, h);
      ctx.clip();
      const bandW = h * 0.32;
      for (let i = -Math.ceil(h / bandW); i * bandW < end + h; i += 1) {
        ctx.fillStyle = SPECTRUM[(i + 70) % SPECTRUM.length];
        ctx.beginPath();
        ctx.moveTo(x0 + i * bandW, h);
        ctx.lineTo(x0 + i * bandW + h, 0);
        ctx.lineTo(x0 + (i + 1) * bandW + h, 0);
        ctx.lineTo(x0 + (i + 1) * bandW, h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    inline(s, { box: { x: end + h * 0.25, y: h * 0.1, w: w - end * 2 - h * 0.5, h: h * 0.8 }, main, sub, mainPaint, subPaint, subPlate: plate });
    return;
  }

  if (family === "apparel") {
    // Bolhas de cor sobrepostas atrás do texto-adesivo.
    const cx = w / 2;
    const cy = h * 0.46;
    const r = unit * 0.36;
    [
      [C.magenta, -0.5, -0.2],
      [C.sun, 0.48, -0.32],
      [C.cyan, 0.05, 0.38],
    ].forEach(([color, dx, dy]) => {
      ctx.fillStyle = color as string;
      circle(ctx, cx + (dx as number) * r, cy + (dy as number) * r, r * 0.56);
      ctx.fill();
    });
    tilted(-0.06, () => stack(s, { box: { x: w * 0.06, y: h * 0.18, w: w * 0.88, h: h * 0.7 }, main, sub, mainMax: unit * 0.3, maxLines: 3, mainPaint, subPaint, subPlate: plate, subRatio: 0.3 }));
    return;
  }

  if (family === "badge") {
    // Estrela de adesivo em duas camadas atrás do texto.
    const cx = w / 2;
    const cy = h / 2;
    const r = unit * 0.46;
    const front = pick([C.sun, C.cyan, C.lime, C.amber, C.magenta], [s.ink], 3);
    ctx.fillStyle = s.accent === front ? C.magenta : s.accent;
    starPath(ctx, cx, cy, r, r * 0.84, 18, 0.09);
    ctx.fill();
    ctx.fillStyle = front;
    starPath(ctx, cx, cy, r * 0.92, r * 0.78, 18);
    ctx.fill();
    tilted(-0.07, () => stack(s, { box: { x: cx - r * 0.66, y: cy - r * 0.55, w: r * 1.32, h: r * 1.1 }, main, sub, mainMax: r * 0.46, maxLines: Math.max(2, Math.min(3, lines)), mainPaint, subPaint, subPlate: plate, subRatio: 0.32 }));
    return;
  }

  if (family === "home") {
    confetti(Math.min(170, Math.round((w * h) / (unit * unit * 0.01))), 0.3, 0.22, 0.85);
    tilted(-0.04, () => stack(s, { box: inset(plateBox(s), unit * 0.02), main, sub, mainMax: unit * 0.26, maxLines: Math.max(2, lines), mainPaint, subPaint, subPlate: plate, subRatio: 0.3 }));
    return;
  }

  // Placa, caneca, cartão: bolhas nas bordas, confete e o texto-adesivo levemente inclinado.
  blobs(family === "card" ? 6 : 9, 0.1, family === "card" ? 0.2 : 0.24);
  confetti(family === "card" ? 10 : 18, 0.42, 0.38);
  const pad = unit * 0.14;
  const box = family === "wrap" && shape === "wide" ? { x: w * 0.18, y: pad, w: w * 0.64, h: h - pad * 2 } : inset({ x: 0, y: 0, w, h }, pad);
  tilted(shape === "pole" ? -0.02 : -0.05, () => stack(s, { box, main, sub, mainMax: unit * 0.3, maxLines: lines, mainPaint, subPaint, subPlate: plate, subRatio: 0.3 }));
}

function paintElegante(s: Scene) {
  const { ctx, w, h, unit, shape, family } = s;
  const main: Type = { font: s.font, tracking: 0.01, lineHeight: 1.1 };
  const sub: Type = { font: "playfair", weight: 400, italic: true, tracking: 0.02 };
  const gold = s.accent;
  const mainPaint: Paint = { fill: s.ink };
  const subPaint: Paint = { fill: rgba(s.ink, 0.78) };
  const lw = Math.max(1, unit * 0.006);
  const divider = (x: number, y: number) => diamondRule(ctx, x, y, unit * 0.24, gold, lw * 0.7);
  const lines = MAX_LINES[shape];

  if (shape === "strip" && family !== "home") {
    // Fios duplos dourados em cima e embaixo, losangos nas pontas.
    for (const y of [h * 0.1, h * 0.86]) {
      ctx.fillStyle = gold;
      ctx.fillRect(h * 0.3, y, w - h * 0.6, Math.max(1, h * 0.018));
      ctx.fillRect(h * 0.3, y + h * 0.04, w - h * 0.6, Math.max(1, h * 0.008));
    }
    diamond(ctx, h * 0.3, h / 2, h * 0.12, gold);
    diamond(ctx, w - h * 0.3, h / 2, h * 0.12, gold);
    inline(s, { box: { x: h * 0.65, y: h * 0.2, w: w - h * 1.3, h: h * 0.6 }, main, sub, mainPaint, subPaint, sep: { width: 0.4, draw: (x0, x1, cy, size) => diamond(ctx, (x0 + x1) / 2, cy, size * 0.12, gold) } });
    return;
  }

  if (family === "apparel" || (family === "badge" && shape === "square")) {
    // Brasão: coroa de louros dourada, losango no alto, texto no miolo.
    const cx = w / 2;
    const cy = h / 2;
    const r = unit * (family === "badge" ? 0.38 : 0.42);
    if (family === "badge") {
      ctx.strokeStyle = gold;
      ctx.lineWidth = lw * 1.4;
      circle(ctx, cx, cy, unit * 0.46);
      ctx.stroke();
      ctx.lineWidth = lw * 0.5;
      circle(ctx, cx, cy, unit * 0.43);
      ctx.stroke();
    }
    const leaf = r * 0.16;
    laurel(ctx, cx, cy, r, Math.PI * 0.6, Math.PI * 1.32, leaf, gold);
    laurel(ctx, cx, cy, r, Math.PI * 0.4, -Math.PI * 0.32, leaf, gold);
    diamond(ctx, cx, cy - r, r * 0.07, gold);
    stack(s, { box: { x: cx - r * 0.7, y: cy - r * 0.62, w: r * 1.4, h: r * 1.24 }, main, sub, mainMax: r * 0.42, maxLines: 3, mainPaint, subPaint, divider, dividerH: lw * 4, subRatio: 0.36 });
    return;
  }

  if (family === "home") {
    // Treliça de losangos com pontos e placa com moldura dupla.
    const step = unit * 0.14;
    ctx.strokeStyle = rgba(gold, 0.3);
    ctx.lineWidth = lw * 0.6;
    const count = Math.min(120, Math.ceil((w + h) / step) + 1);
    ctx.beginPath();
    for (let i = -count; i <= count; i += 1) {
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step + h, h);
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step - h, h);
    }
    ctx.stroke();
    const box = plateBox(s);
    ctx.fillStyle = s.bg;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    doubleFrame(ctx, inset(box, unit * 0.02), unit * 0.018, lw, gold);
    stack(s, { box: inset(box, box.w * 0.1, box.h * 0.16), main, sub, mainMax: unit * 0.22, maxLines: Math.max(2, lines), mainPaint, subPaint, divider, dividerH: lw * 4 });
    return;
  }

  if (family === "wrap" && shape === "wide") {
    // Caneca: fios no alto e embaixo, arabescos dos dois lados do texto.
    for (const y of [h * 0.08, h * 0.9]) {
      ctx.fillStyle = gold;
      ctx.fillRect(0, y, w, lw);
      ctx.fillRect(0, y + lw * 2.2, w, lw * 0.5);
    }
    const placed = stack(s, { box: { x: w * 0.2, y: h * 0.16, w: w * 0.6, h: h * 0.68 }, main, sub, mainMax: unit * 0.32, maxLines: 2, mainPaint, subPaint, divider, dividerH: lw * 4 });
    const y = placed.top + placed.size * 0.5;
    const len = Math.min(w * 0.16, unit * 0.36);
    flourish(ctx, placed.left - placed.size * 0.25, y, len, -1, gold, lw);
    flourish(ctx, placed.right + placed.size * 0.25, y, len, 1, gold, lw);
    return;
  }

  // Placa, cartão, chaveiro: moldura dupla com losangos; monograma quando a peça é em pé.
  const frame = inset({ x: 0, y: 0, w, h }, unit * 0.05);
  doubleFrame(ctx, frame, unit * 0.02, lw, gold);
  let top = frame.y + unit * 0.1;
  if ((shape === "tall" || shape === "pole") && family !== "badge") {
    const r = Math.min(unit * 0.14, h * 0.07);
    const cx = w / 2;
    const cy = top + r;
    ctx.strokeStyle = gold;
    ctx.lineWidth = lw;
    circle(ctx, cx, cy, r);
    ctx.stroke();
    const letter = [...s.text.trim()][0] ?? "";
    const f = fitText(ctx, letter, { font: s.font }, r * 1.2, r * 1.2, r * 1.15, 1);
    drawFit(ctx, f, cx, cy + r * 0.04, "center", { fill: gold });
    top = cy + r + unit * 0.08;
  }
  const box = { x: frame.x + unit * 0.1, y: top, w: frame.w - unit * 0.2, h: frame.y + frame.h - unit * 0.1 - top };
  stack(s, { box, main, sub, mainMax: unit * 0.24, maxLines: lines, mainPaint, subPaint, divider, dividerH: lw * 4, subLines: shape === "tall" || shape === "pole" ? 2 : 1 });
}

const PAINTERS: Record<ArtStyle, (s: Scene) => void> = {
  classico: paintClassico,
  moderno: paintModerno,
  retro: paintRetro,
  minimal: paintMinimal,
  vibrante: paintVibrante,
  elegante: paintElegante,
};

/**
 * Caneca, copo e garrafa: a faixa dá quase a volta toda, mas só ~120° ficam de frente para a câmera.
 * O desenho vai nessa janela central (fração da largura da faixa); o resto fica com o fundo.
 */
const FRONT_WINDOW: Partial<Record<MockupKind, number>> = { mug: 0.38, tumbler: 0.38, bottle: 0.38 };

/** Pinta só na janela frontal das peças cilíndricas; nas demais, na área toda. */
function inFrontWindow(ctx: CanvasRenderingContext2D, w: number, h: number, kind: MockupKind | undefined, paint: (w: number) => void) {
  const share = kind ? FRONT_WINDOW[kind] : undefined;
  if (!share) {
    paint(w);
    return;
  }
  const ww = Math.round(w * share);
  ctx.save();
  ctx.translate(Math.round((w - ww) / 2), 0);
  ctx.beginPath();
  ctx.rect(0, 0, ww, h);
  ctx.clip();
  paint(ww);
  ctx.restore();
}

/** Arte de exemplo de cada família no estilo escolhido, já com o texto do cliente. */
function drawTemplate(ctx: CanvasRenderingContext2D, w: number, h: number, art: ArtRender, label: string) {
  const family = artFamily(art.kind);
  // Estampa de tecido: fundo transparente (o tecido aparece).
  const transparent = family === "apparel" && !art.opaque;
  const surface = transparent ? art.surface : undefined;
  if (!transparent) {
    ctx.fillStyle = makeScene(ctx, w, h, art, label, { transparent, sample: true }).bg;
    ctx.fillRect(0, 0, w, h);
  }
  inFrontWindow(ctx, w, h, art.kind, (width) => {
    const scene = makeScene(ctx, width, h, art, label, { transparent, sample: true, surface });
    ctx.save();
    PAINTERS[styleOf(art.style)](scene);
    ctx.restore();
  });
}

function drawImage(ctx: CanvasRenderingContext2D, w: number, h: number, image: HTMLImageElement, art: ArtSettings) {
  ctx.fillStyle = art.background;
  ctx.fillRect(0, 0, w, h);
  const rotated = art.rotation === 90 || art.rotation === 270;
  const iw = Math.max(1, rotated ? image.naturalHeight : image.naturalWidth);
  const ih = Math.max(1, rotated ? image.naturalWidth : image.naturalHeight);
  const base = art.fit === "cover" ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  const scale = base * art.zoom;
  ctx.save();
  ctx.translate(w / 2 + art.offsetX * w, h / 2 + art.offsetY * h);
  ctx.rotate((art.rotation * Math.PI) / 180);
  const dw = image.naturalWidth * scale;
  const dh = image.naturalHeight * scale;
  ctx.drawImage(image, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

/** Texto do cliente por cima da imagem enviada, no tratamento do estilo escolhido. */
function drawCaption(ctx: CanvasRenderingContext2D, w: number, h: number, art: ArtRender, label: string) {
  const s = makeScene(ctx, w, h, art, label, { transparent: true, sample: false });
  if (!s.text && !s.sub) return;
  if (!s.text) s.text = s.sub;
  if (s.text === s.sub) s.sub = "";
  const strip = s.shape === "strip";
  const box: Box = strip ? { x: w * 0.52, y: h * 0.12, w: w * 0.44, h: h * 0.76 } : { x: w * 0.07, y: h * 0.68, w: w * 0.86, h: h * 0.26 };
  const style = styleOf(art.style);
  const main: Type = { font: s.font, caps: style === "retro", lineHeight: 1.02 };
  const sub: Type = style === "elegante" ? { font: "playfair", italic: true } : { font: "figtree", weight: 700, caps: true, tracking: 0.14 };
  const soft: Paint = { fill: s.ink, shadow: "rgba(0,0,0,0.38)", shadowBlur: 0.14 };
  const base = { box, main, sub, mainMax: s.unit * 0.16, maxLines: strip ? 1 : 2, subRatio: 0.38 };
  ctx.save();
  switch (style) {
    case "moderno": {
      ctx.fillStyle = rgba(s.accent, 0.94);
      ctx.fillRect(box.x - s.unit * 0.03, box.y, box.w + s.unit * 0.06, box.h);
      const ink = readableInk(s.accent);
      stack(s, { ...base, box: inset(box, s.unit * 0.02), align: "left", mainPaint: { fill: ink }, subPaint: { fill: rgba(ink, 0.8) } });
      break;
    }
    case "retro": {
      const color = pick([C.amber, C.red, C.sun], [s.ink], 1.6);
      stack(s, { ...base, mainPaint: { fill: s.ink, extrude: pick([C.red, C.magenta], [s.ink], 1.4), depth: 0.07 }, subPaint: { fill: readableInk(color) }, subPlate: (x, y, pw, ph) => ribbon(ctx, x, y, pw, ph, color) });
      break;
    }
    case "vibrante":
      stack(s, { ...base, mainPaint: { fill: s.ink, stroke: s.paper, strokeW: 0.18, drop: s.accent2, dropOffset: 0.06 }, subPaint: { fill: s.paper }, subPlate: (x, y, pw, ph) => pill(ctx, x, y, pw, ph, s.ink) });
      break;
    case "minimal":
      stack(s, { ...base, mainMax: s.unit * 0.12, main: { ...main, weight: 500 }, mainPaint: { fill: s.ink, shadow: "rgba(0,0,0,0.25)", shadowBlur: 0.1 }, subPaint: { fill: s.ink, shadow: "rgba(0,0,0,0.25)", shadowBlur: 0.2 }, gap: 0.4 });
      break;
    case "elegante":
      stack(s, { ...base, mainPaint: soft, subPaint: soft, divider: (x, y) => diamondRule(ctx, x, y, s.unit * 0.2, s.accent, Math.max(1, s.unit * 0.004)), dividerH: s.unit * 0.02 });
      break;
    default:
      stack(s, { ...base, mainPaint: soft, subPaint: soft });
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Neon

type NeonLook = {
  font: ArtFont;
  weight?: number;
  caps?: boolean;
  tracking?: number;
  /** Espessura do tubo e do núcleo branco (em em) e força do brilho. */
  tube: number;
  core: number;
  glow: number;
  extra?: "frame" | "double" | "swash" | "underline";
  /** Uma cor por palavra (vibrante). */
  perWord?: boolean;
};

/** Cada estilo muda a letra do tubo, a espessura e o brilho; as cores vêm do LED escolhido. */
const NEON_LOOK: Record<ArtStyle, NeonLook> = {
  classico: { font: "neon", tube: 0.085, core: 0.03, glow: 1 },
  moderno: { font: "unbounded", weight: 500, tube: 0.05, core: 0.018, glow: 0.75, tracking: 0.02, extra: "frame" },
  retro: { font: "righteous", caps: true, tube: 0.075, core: 0.026, glow: 1.1, extra: "double" },
  minimal: { font: "neon", tube: 0.045, core: 0.016, glow: 0.55, tracking: 0.06, extra: "underline" },
  vibrante: { font: "pacifico", tube: 0.09, core: 0.032, glow: 1.35, perWord: true },
  elegante: { font: "greatvibes", tube: 0.055, core: 0.02, glow: 0.8, extra: "swash" },
};

function neonStroke(ctx: CanvasRenderingContext2D, draw: () => void, color: string, width: number, core: number, glow: number, unit: number) {
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  for (const blur of [0.12, 0.06, 0.02]) {
    ctx.shadowBlur = unit * blur * glow;
    draw();
  }
  ctx.shadowBlur = 0;
  ctx.lineWidth = core;
  ctx.strokeStyle = "#ffffff";
  draw();
}

function drawNeon(ctx: CanvasRenderingContext2D, w: number, h: number, image: HTMLImageElement | null, art: ArtRender) {
  ctx.clearRect(0, 0, w, h);
  const unit = Math.min(w, h);
  const colors = art.ledColors?.length ? art.ledColors : ["#ff4fd8", "#38e1ff"];
  const look = NEON_LOOK[styleOf(art.style)];
  if (image) {
    const scale = Math.min((w * 0.86) / Math.max(1, image.naturalWidth), (h * 0.8) / Math.max(1, image.naturalHeight));
    const dw = image.naturalWidth * scale;
    const dh = image.naturalHeight * scale;
    ctx.shadowColor = colors[0];
    ctx.shadowBlur = unit * 0.06 * look.glow;
    for (let i = 0; i < 3; i += 1) ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.globalCompositeOperation = "source-over";
    return;
  }
  const typed = art.text.trim();
  const typedSub = (art.subtext ?? "").trim();
  // Só o subtexto escrito: ele vira o tubo principal.
  const text = typed || typedSub || SAMPLE_TEXT.neon;
  const subText = typed ? typedSub : "";
  // Fonte "Moderna" (padrão) vira a letra de tubo do estilo; as demais são escolha do cliente.
  const font: ArtFont = art.font === "figtree" ? look.font : art.font;
  const type: Type = { font, weight: font === look.font ? look.weight : undefined, caps: look.caps, tracking: look.tracking, lineHeight: 1.12 };
  const mainF = fitText(ctx, text, type, w * (look.extra === "frame" ? 0.76 : 0.86), h * (subText ? 0.56 : look.extra ? 0.68 : 0.8), unit * 0.34, 2);
  const subF = subText ? fitText(ctx, subText, { font: "neon", caps: true, tracking: 0.18 }, w * 0.74, h * 0.16, Math.max(4, mainF.size * 0.4), 1) : NO_FIT;
  const mainH = blockHeight(mainF);
  const subH = blockHeight(subF);
  const gap = mainF.size * 0.32;
  const total = mainH + (subH ? gap + subH : 0);
  const top = (h - total) / 2;
  const step = mainF.size * mainF.lh;
  const size = mainF.size;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  setType(ctx, type, size);
  const track = trackingPx(type, size);
  const mainW = widest(ctx, mainF.lines) - track;
  let wordIndex = 0;
  mainF.lines.forEach((line, i) => {
    const y = top + mainH / 2 + (i - (mainF.lines.length - 1) / 2) * step;
    const color = colors[i % colors.length];
    if (look.extra === "double") {
      // Contorno deslocado em outra cor, como letreiro de lanchonete.
      const second = colors[(i + 1) % colors.length];
      neonStroke(ctx, () => ctx.strokeText(line, w / 2 + track / 2 + size * 0.06, y + size * 0.06), second, size * look.tube * 0.6, size * look.core * 0.6, look.glow * 0.6, unit);
    }
    if (look.perWord) {
      const words = line.split(" ");
      const lineW = ctx.measureText(line).width;
      const space = ctx.measureText(" ").width;
      let x = w / 2 - lineW / 2;
      ctx.textAlign = "left";
      for (const word of words) {
        const ww = ctx.measureText(word).width;
        const wordColor = colors[wordIndex % colors.length];
        const at = x;
        neonStroke(ctx, () => ctx.strokeText(word, at, y), wordColor, size * look.tube, size * look.core, look.glow, unit);
        x += ww + space;
        wordIndex += 1;
      }
      ctx.textAlign = "center";
    } else {
      neonStroke(ctx, () => ctx.strokeText(line, w / 2 + track / 2, y, w * 0.94), color, size * look.tube, size * look.core, look.glow, unit);
    }
  });

  const accent = colors[1 % colors.length];
  const below = top + mainH + gap * 0.5;
  if (look.extra === "frame") {
    const fw = Math.min(w * 0.94, mainW + size * 0.9);
    const fh = Math.min(h * 0.94, total + size * 0.7);
    neonStroke(
      ctx,
      () => {
        ctx.beginPath();
        ctx.roundRect(w / 2 - fw / 2, h / 2 - fh / 2, fw, fh, size * 0.25);
        ctx.stroke();
      },
      accent,
      size * look.tube,
      size * look.core,
      look.glow,
      unit,
    );
  } else if (look.extra === "underline" && !subH) {
    neonStroke(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(w / 2 - mainW * 0.3, below + size * 0.12);
        ctx.lineTo(w / 2 + mainW * 0.3, below + size * 0.12);
        ctx.stroke();
      },
      accent,
      size * look.tube,
      size * look.core,
      look.glow,
      unit,
    );
  } else if (look.extra === "swash" && !subH) {
    neonStroke(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(w / 2 - mainW * 0.45, below + size * 0.1);
        ctx.bezierCurveTo(w / 2 - mainW * 0.1, below + size * 0.38, w / 2 + mainW * 0.15, below - size * 0.08, w / 2 + mainW * 0.45, below + size * 0.14);
        ctx.stroke();
      },
      colors[0],
      size * look.tube,
      size * look.core,
      look.glow,
      unit,
    );
  } else if (look.extra === "double" && !subH) {
    neonStroke(
      ctx,
      () => {
        ctx.beginPath();
        ctx.arc(w / 2, below - size * 1.4, size * 1.7, Math.PI * 0.36, Math.PI * 0.64);
        ctx.stroke();
      },
      accent,
      size * look.tube * 0.7,
      size * look.core * 0.7,
      look.glow,
      unit,
    );
  }
  if (subH) {
    setType(ctx, subF.type, subF.size);
    const y = top + mainH + gap + subH / 2;
    const line = subF.lines[0] ?? "";
    const subTrack = trackingPx(subF.type, subF.size);
    neonStroke(ctx, () => ctx.strokeText(line, w / 2 + subTrack / 2, y, w * 0.9), accent, subF.size * 0.09, subF.size * 0.035, look.glow * 0.7, unit);
  }
  ctx.restore();
}

export function paintArt(canvas: HTMLCanvasElement, variant: ArtVariant, art: ArtRender, image: HTMLImageElement | null, label: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  if (!w || !h) return;
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  ctx.clearRect(0, 0, w, h);
  if (variant === "neon") {
    drawNeon(ctx, w, h, image, art);
    return;
  }
  if (variant === "blank") {
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, w, h);
    return;
  }
  if (image) {
    drawImage(ctx, w, h, image, art);
    if (art.text.trim() || (art.subtext ?? "").trim()) inFrontWindow(ctx, w, h, art.kind, (width) => drawCaption(ctx, width, h, art, label));
  } else {
    drawTemplate(ctx, w, h, art, label);
  }
  if (variant === "gray") {
    const data = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < data.data.length; i += 4) {
      const lum = data.data[i] * 0.299 + data.data[i + 1] * 0.587 + data.data[i + 2] * 0.114;
      data.data[i] = data.data[i + 1] = data.data[i + 2] = lum;
    }
    ctx.putImageData(data, 0, 0);
  }
}

/** Fontes que um estilo usa além da escolhida pelo cliente (subtexto e letra do neon). */
function styleFonts(style: ArtStyle, kind: MockupKind | undefined): { font: ArtFont; italic?: boolean }[] {
  const list: { font: ArtFont; italic?: boolean }[] = [];
  if (style === "elegante") list.push({ font: "playfair", italic: true });
  if (!kind || artFamily(kind) === "neon") list.push({ font: NEON_LOOK[style].font });
  return list;
}

/** Garante que a fonte da arte (e as do estilo) estão carregadas antes de pintar no canvas. */
export async function loadArtFont(art: Pick<ArtSettings, "font" | "text"> & Partial<Pick<ArtRender, "style" | "subtext" | "kind">>): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const sample = `${art.text.trim()} ${(art.subtext ?? "").trim()}`.trim() || "Aa";
  const style = styleOf(art.style);
  const fonts = [{ font: art.font }, { font: "neon" as ArtFont }, ...styleFonts(style, art.kind)];
  await Promise.all(fonts.map((f) => document.fonts.load(canvasFont(f.font, 64, f.italic), sample))).catch(() => undefined);
}

export function shapeMask(canvas: HTMLCanvasElement, path: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = "#000";
  path(ctx, canvas.width, canvas.height);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

export function featherPath(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.08);
  ctx.quadraticCurveTo(w * 0.05, 0, w * 0.45, 0);
  ctx.bezierCurveTo(w * 1.05, h * 0.02, w * 1.02, h * 0.45, w * 0.82, h * 0.78);
  ctx.quadraticCurveTo(w * 0.7, h * 0.96, w * 0.42, h);
  ctx.closePath();
}

/** Wind banner modelo faca: topo inclinado e borda de fuga reta. */
export function knifePath(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.14);
  ctx.lineTo(w * 0.72, 0);
  ctx.quadraticCurveTo(w, 0, w, h * 0.1);
  ctx.lineTo(w * 0.86, h);
  ctx.closePath();
}

/** Wind banner modelo gota: bulbo arredondado em cima, afinando para baixo. */
export function dropPath(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.3);
  ctx.bezierCurveTo(0, -h * 0.05, w * 1.05, -h * 0.02, w * 0.92, h * 0.36);
  ctx.quadraticCurveTo(w * 0.8, h * 0.75, w * 0.32, h);
  ctx.closePath();
}

/** Wind banner modelo vela: borda de ataque curva, base reta. */
export function sailPath(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, 0);
  ctx.quadraticCurveTo(w * 0.95, h * 0.12, w, h);
  ctx.closePath();
}

export function roundPath(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
}

export function heartPath(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(w / 2, h * 0.95);
  ctx.bezierCurveTo(w * -0.1, h * 0.55, w * 0.1, h * -0.05, w / 2, h * 0.25);
  ctx.bezierCurveTo(w * 0.9, h * -0.05, w * 1.1, h * 0.55, w / 2, h * 0.95);
  ctx.closePath();
}

export { canvasFor, ART_FONTS };

export async function fileToDataUrl(file: File, maxSide = 2048): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export async function thumbnailOf(src: string, maxSide = 320): Promise<string> {
  const image = await loadImage(src);
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}
