import type { MockupKind } from "@/lib/mockup-kinds";
import { ART_FONTS, canvasFont, fontFamilyOf, type ArtFont } from "./fonts";

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
};

/** Contexto de render que o visualizador acrescenta à arte (tipo da peça e cores do LED). */
export type ArtRender = ArtSettings & { kind?: MockupKind; ledColors?: string[] };

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
  return kind ? FAMILY[kind] : "sign";
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

export const TEXT_COLORS = [
  { value: "#000000", label: "Preto" },
  { value: "#ffffff", label: "Branco" },
  { value: "#ff463a", label: "Coral" },
  { value: "#0888c8", label: "Azul" },
  { value: "#f8e028", label: "Amarelo" },
  { value: "#b0c818", label: "Verde" },
  { value: "#e02888", label: "Magenta" },
];

const SPECTRUM = ["#e02018", "#f0a000", "#f8e028", "#b0c818", "#18b0e8", "#0888c8", "#e02888"];

export function fontFamily(): string {
  return fontFamilyOf("figtree");
}

export type ArtVariant = "front" | "gray" | "blank" | "neon";

function canvasFor(aspect: number, longSide = 1024) {
  const canvas = document.createElement("canvas");
  if (aspect >= 1) {
    canvas.width = longSide;
    canvas.height = Math.max(64, Math.round(longSide / aspect));
  } else {
    canvas.height = longSide;
    canvas.width = Math.max(64, Math.round(longSide * aspect));
  }
  return canvas;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Os quatro cartões coloridos do símbolo da Padrão, usados como "logo de exemplo". */
function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const cardW = size;
  const cardH = size * 0.62;
  ["#e02018", "#f8e028", "#18b0e8", "#b0c818"].forEach((color, i) => {
    ctx.save();
    ctx.translate(x + i * cardW * 0.08, y + i * cardH * 0.12);
    ctx.rotate((-8 + i * 4) * (Math.PI / 180));
    ctx.fillStyle = color;
    roundRect(ctx, 0, 0, cardW, cardH, cardH * 0.18);
    ctx.fill();
    ctx.restore();
  });
}

function spectrumBand(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  SPECTRUM.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + (w / SPECTRUM.length) * i, y, w / SPECTRUM.length + 1, h);
  });
}

/** Quebra o texto em até `maxLines` linhas e acha o maior corpo que cabe na caixa. */
function layoutText(ctx: CanvasRenderingContext2D, text: string, font: ArtFont, boxW: number, boxH: number, maxSize: number, maxLines = 2) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  let best = { size: 8, lines: [text] };
  for (let size = Math.round(maxSize); size >= 8; size -= Math.max(1, Math.round(size * 0.06))) {
    ctx.font = canvasFont(font, size);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const attempt = current ? `${current} ${word}` : word;
      if (ctx.measureText(attempt).width <= boxW || !current) current = attempt;
      else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const lineHeight = size * 1.12;
    if (lines.length <= maxLines && widest <= boxW && lines.length * lineHeight <= boxH) return { size, lines };
    best = { size, lines };
  }
  return best;
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: ArtFont,
  color: string,
  cx: number,
  cy: number,
  boxW: number,
  boxH: number,
  maxSize: number,
  maxLines = 2,
) {
  const { size, lines } = layoutText(ctx, text, font, boxW, boxH, maxSize, maxLines);
  ctx.font = canvasFont(font, size);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lineHeight = size * 1.12;
  lines.forEach((line, i) => ctx.fillText(line, cx, cy + (i - (lines.length - 1) / 2) * lineHeight, boxW));
}

/** Arte de exemplo de cada família, já com o texto do cliente. */
function drawTemplate(ctx: CanvasRenderingContext2D, w: number, h: number, art: ArtRender, label: string) {
  const family = artFamily(art.kind);
  const text = art.text.trim() || SAMPLE_TEXT[family];
  const unit = Math.min(w, h);
  const ink = art.textColor;
  const transparentBg = family === "apparel";

  if (!transparentBg) {
    ctx.fillStyle = art.background;
    ctx.fillRect(0, 0, w, h);
  }

  switch (family) {
    case "card": {
      const pad = unit * 0.1;
      drawMark(ctx, pad, h / 2 - unit * 0.22, unit * 0.32);
      const textX = pad + unit * 0.5;
      const boxW = w - textX - pad;
      drawText(ctx, text, art.font, ink, textX + boxW / 2, h * 0.42, boxW, h * 0.32, unit * 0.2, 2);
      ctx.font = canvasFont("figtree", unit * 0.065);
      ctx.fillStyle = "#606060";
      ctx.textAlign = "center";
      ctx.fillText("Cargo · (21) 99999-0000", textX + boxW / 2, h * 0.66, boxW);
      spectrumBand(ctx, 0, h - unit * 0.06, w, unit * 0.06);
      break;
    }
    case "wrap": {
      // Caneca e copo: frase no centro, cartões dos dois lados, faixa colorida embaixo.
      drawMark(ctx, w * 0.06, h * 0.32, unit * 0.32);
      drawMark(ctx, w * 0.82, h * 0.32, unit * 0.32);
      drawText(ctx, text, art.font, ink, w / 2, h * 0.45, w * 0.58, h * 0.62, unit * 0.36, 2);
      spectrumBand(ctx, 0, h - unit * 0.07, w, unit * 0.07);
      break;
    }
    case "apparel": {
      // Estampa sobre o tecido: fundo transparente, selo redondo.
      const r = unit * 0.44;
      ctx.lineWidth = unit * 0.035;
      ctx.strokeStyle = ink;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      ctx.stroke();
      drawText(ctx, text, art.font, ink, w / 2, h / 2, r * 1.5, r * 1.1, unit * 0.22, 2);
      spectrumBand(ctx, w / 2 - r * 0.6, h / 2 + r * 0.62, r * 1.2, unit * 0.035);
      break;
    }
    case "badge": {
      const inset = unit * 0.07;
      ctx.lineWidth = unit * 0.025;
      ctx.strokeStyle = ink;
      roundRect(ctx, inset, inset, w - inset * 2, h - inset * 2, unit * 0.12);
      ctx.stroke();
      drawText(ctx, text, art.font, ink, w / 2, h * 0.47, w * 0.74, h * 0.5, unit * 0.26, 2);
      spectrumBand(ctx, w * 0.3, h * 0.74, w * 0.4, unit * 0.04);
      break;
    }
    case "home": {
      // Confete colorido em posições fixas + nome no centro.
      for (let i = 0; i < 26; i += 1) {
        const x = ((i * 137) % 100) / 100;
        const y = ((i * 71) % 100) / 100;
        ctx.fillStyle = SPECTRUM[i % SPECTRUM.length];
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(x * w, y * h, unit * 0.025, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      drawText(ctx, text, art.font, ink, w / 2, h / 2, w * 0.78, h * 0.5, unit * 0.24, 2);
      break;
    }
    default: {
      // Banner, placa, impresso: marca, título e faixa de cor.
      const pad = unit * 0.08;
      drawMark(ctx, pad, pad, unit * 0.22);
      drawText(ctx, text, art.font, ink, w / 2, h * 0.47, w * 0.84, h * 0.46, unit * 0.2, 3);
      ctx.font = canvasFont("figtree", unit * 0.05);
      ctx.fillStyle = "#606060";
      ctx.textAlign = "center";
      ctx.fillText(label, w / 2, h * 0.47 + unit * 0.22, w * 0.84);
      spectrumBand(ctx, 0, h - unit * 0.06, w, unit * 0.06);
    }
  }
}

function drawImage(ctx: CanvasRenderingContext2D, w: number, h: number, image: HTMLImageElement, art: ArtSettings) {
  ctx.fillStyle = art.background;
  ctx.fillRect(0, 0, w, h);
  const rotated = art.rotation === 90 || art.rotation === 270;
  const iw = rotated ? image.naturalHeight : image.naturalWidth;
  const ih = rotated ? image.naturalWidth : image.naturalHeight;
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

/** Texto do cliente por cima da imagem enviada, na faixa de baixo, com sombra para ler em qualquer fundo. */
function drawCaption(ctx: CanvasRenderingContext2D, w: number, h: number, art: ArtSettings) {
  const unit = Math.min(w, h);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = unit * 0.02;
  drawText(ctx, art.text.trim(), art.font, art.textColor, w / 2, h * 0.84, w * 0.86, h * 0.2, unit * 0.14, 1);
  ctx.restore();
}

function drawNeon(ctx: CanvasRenderingContext2D, w: number, h: number, image: HTMLImageElement | null, art: ArtRender) {
  ctx.clearRect(0, 0, w, h);
  const unit = Math.min(w, h);
  const colors = art.ledColors?.length ? art.ledColors : ["#ff4fd8", "#38e1ff"];
  if (image) {
    const scale = Math.min((w * 0.86) / image.naturalWidth, (h * 0.8) / image.naturalHeight);
    const dw = image.naturalWidth * scale;
    const dh = image.naturalHeight * scale;
    ctx.shadowColor = colors[0];
    ctx.shadowBlur = unit * 0.06;
    for (let i = 0; i < 3; i += 1) ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.globalCompositeOperation = "source-over";
    return;
  }
  const text = art.text.trim() || SAMPLE_TEXT.neon;
  const font: ArtFont = art.font === "figtree" ? "neon" : art.font;
  const { size, lines } = layoutText(ctx, text, font, w * 0.88, h * 0.82, unit * 0.34, 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = canvasFont(font, size);
  const lineHeight = size * 1.12;
  lines.forEach((line, i) => {
    const color = colors[i % colors.length];
    const y = h / 2 + (i - (lines.length - 1) / 2) * lineHeight;
    // Tubo: brilho colorido em camadas e núcleo branco por cima.
    ctx.lineWidth = size * 0.085;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    for (const blur of [unit * 0.12, unit * 0.06, unit * 0.02]) {
      ctx.shadowBlur = blur;
      ctx.strokeText(line, w / 2, y, w * 0.92);
    }
    ctx.shadowBlur = 0;
    ctx.lineWidth = size * 0.03;
    ctx.strokeStyle = "#ffffff";
    ctx.strokeText(line, w / 2, y, w * 0.92);
  });
}

export function paintArt(canvas: HTMLCanvasElement, variant: ArtVariant, art: ArtRender, image: HTMLImageElement | null, label: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  ctx.filter = "none";
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
    if (art.text.trim()) drawCaption(ctx, w, h, art);
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

/** Garante que a fonte da arte está carregada antes de pintar no canvas. */
export async function loadArtFont(art: Pick<ArtSettings, "font" | "text">): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const sample = art.text.trim() || "Aa";
  await Promise.all([document.fonts.load(canvasFont(art.font, 64), sample), document.fonts.load(canvasFont("neon", 64), sample)]).catch(() => undefined);
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
