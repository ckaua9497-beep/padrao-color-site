export type ArtSettings = {
  src: string | null;
  fit: "cover" | "contain";
  rotation: 0 | 90 | 180 | 270;
  background: string;
};

export const DEFAULT_ART: ArtSettings = { src: null, fit: "cover", rotation: 0, background: "#ffffff" };

const SPECTRUM = ["#e02018", "#f0a000", "#f8e028", "#b0c818", "#18b0e8", "#0888c8", "#e02888"];

export function fontFamily(): string {
  if (typeof document === "undefined") return "Arial, sans-serif";
  return getComputedStyle(document.body).fontFamily || "Arial, sans-serif";
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

function drawPlaceholder(ctx: CanvasRenderingContext2D, w: number, h: number, label: string, background: string) {
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  const unit = Math.min(w, h);

  const bandH = unit * 0.06;
  SPECTRUM.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect((w / SPECTRUM.length) * i, h - bandH, w / SPECTRUM.length + 1, bandH);
  });

  const cardW = unit * 0.34;
  const cardH = cardW * 0.62;
  const originX = w / 2 - cardW * 0.62;
  const originY = h * 0.5 - cardH * 1.05;
  ["#e02018", "#f8e028", "#18b0e8", "#b0c818"].forEach((color, i) => {
    ctx.save();
    ctx.translate(originX + i * cardW * 0.08, originY + i * cardH * 0.12);
    ctx.rotate((-8 + i * 4) * (Math.PI / 180));
    ctx.fillStyle = color;
    roundRect(ctx, 0, 0, cardW, cardH, cardH * 0.18);
    ctx.fill();
    ctx.restore();
  });

  ctx.fillStyle = "#0a0a0a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${Math.round(unit * 0.11)}px ${fontFamily()}`;
  ctx.fillText("SUA ARTE AQUI", w / 2, h * 0.62, w * 0.9);
  ctx.font = `500 ${Math.round(unit * 0.05)}px ${fontFamily()}`;
  ctx.fillStyle = "#525252";
  ctx.fillText(label, w / 2, h * 0.62 + unit * 0.1, w * 0.86);

  ctx.setLineDash([unit * 0.025, unit * 0.018]);
  ctx.lineWidth = Math.max(2, unit * 0.006);
  ctx.strokeStyle = "rgba(10,10,10,0.25)";
  const inset = unit * 0.05;
  roundRect(ctx, inset, inset, w - inset * 2, h - inset * 2 - bandH, unit * 0.03);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawImage(ctx: CanvasRenderingContext2D, w: number, h: number, image: HTMLImageElement, art: ArtSettings) {
  ctx.fillStyle = art.background;
  ctx.fillRect(0, 0, w, h);
  const rotated = art.rotation === 90 || art.rotation === 270;
  const iw = rotated ? image.naturalHeight : image.naturalWidth;
  const ih = rotated ? image.naturalWidth : image.naturalHeight;
  const scale = art.fit === "cover" ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((art.rotation * Math.PI) / 180);
  const dw = image.naturalWidth * scale;
  const dh = image.naturalHeight * scale;
  ctx.drawImage(image, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

function drawNeon(ctx: CanvasRenderingContext2D, w: number, h: number, image: HTMLImageElement | null, art: ArtSettings) {
  ctx.clearRect(0, 0, w, h);
  const unit = Math.min(w, h);
  if (image) {
    const scale = Math.min((w * 0.86) / image.naturalWidth, (h * 0.8) / image.naturalHeight);
    const dw = image.naturalWidth * scale;
    const dh = image.naturalHeight * scale;
    ctx.shadowColor = "#ff5fd2";
    ctx.shadowBlur = unit * 0.06;
    for (let i = 0; i < 3; i += 1) ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.globalCompositeOperation = "source-over";
    return;
  }
  const lines = ["Sua frase", "em neon"];
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `italic 700 ${Math.round(unit * 0.26)}px ${fontFamily()}`;
  const colors = [art.background === "#ffffff" ? "#ff4fd8" : art.background, "#38e1ff"];
  lines.forEach((line, i) => {
    const y = h / 2 + (i - 0.5) * unit * 0.3;
    ctx.lineWidth = unit * 0.022;
    ctx.strokeStyle = colors[i];
    ctx.shadowColor = colors[i];
    for (const blur of [unit * 0.12, unit * 0.06, unit * 0.02]) {
      ctx.shadowBlur = blur;
      ctx.strokeText(line, w / 2, y, w * 0.92);
    }
    ctx.shadowBlur = 0;
    ctx.lineWidth = unit * 0.008;
    ctx.strokeStyle = "#ffffff";
    ctx.strokeText(line, w / 2, y, w * 0.92);
  });
}

export function paintArt(
  canvas: HTMLCanvasElement,
  variant: ArtVariant,
  art: ArtSettings,
  image: HTMLImageElement | null,
  label: string,
) {
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
  if (image) drawImage(ctx, w, h, image, art);
  else drawPlaceholder(ctx, w, h, label, art.background);
  if (variant === "gray") {
    const data = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < data.data.length; i += 4) {
      const lum = data.data[i] * 0.299 + data.data[i + 1] * 0.587 + data.data[i + 2] * 0.114;
      data.data[i] = data.data[i + 1] = data.data[i + 2] = lum;
    }
    ctx.putImageData(data, 0, 0);
  }
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

export { canvasFor };

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
