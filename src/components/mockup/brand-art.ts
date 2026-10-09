/*
 * Estampa da marca Padrão Color para as fotos de catálogo dos produtos (a mesma linguagem das fotos do site
 * oficial): fundo chapado numa cor do espectro do logo, contornos brancos finos de retângulos arredondados
 * sangrando nas bordas e, no meio, o "símbolo desmontado" — peças brancas do logo (quadrados quebrados,
 * seta, coração quadriculado e o "@" num quadrado).
 *
 * `mode: "mark"` é a versão de 1 cor para serigrafia (sacola plástica, saco kraft): só o símbolo e um contorno,
 * na cor pedida, com fundo transparente.
 * As cores vêm dos tokens (--color-*), lidas do documento; sem documento, `color` é usado como veio.
 */

export type BrandArtOptions = {
  /** Cor de fundo (modo "pattern") ou da tinta (modo "mark"): token ("coral", "blue"…) ou CSS. */
  color: string;
  mode?: "pattern" | "mark";
  /** Variação do desenho (posição e giro dos contornos). */
  seed?: number;
  /** Proporção largura/altura da arte. */
  aspect?: number;
};

const TOKENS = new Set(["coral", "sun", "amber", "cyan", "lime", "red", "magenta", "blue", "ink"]);

/** Token → valor da variável CSS (--color-<token>); outro texto vai como cor CSS. */
export function brandColor(color: string, root: Element | null = typeof document === "undefined" ? null : document.documentElement): string {
  if (!TOKENS.has(color) || !root) return color;
  const value = getComputedStyle(root).getPropertyValue(`--color-${color}`).trim();
  return value || color;
}

/** Gerador determinístico (mulberry32): o mesmo seed dá sempre a mesma estampa. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Em volta de (cx, cy), girado em graus. */
function at(ctx: CanvasRenderingContext2D, cx: number, cy: number, degrees: number, draw: () => void) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((degrees * Math.PI) / 180);
  draw();
  ctx.restore();
}

/**
 * As quatro peças do símbolo, cada uma num quadrado de lado `s` centrado na origem. `ink` = cor da peça,
 * `cut` = cor dos recortes (o fundo; no modo "mark", recorta de verdade).
 */
function glyphs(ctx: CanvasRenderingContext2D, s: number, ink: string, cut: string | null) {
  const carve = (path: () => void) => {
    ctx.save();
    if (cut) ctx.fillStyle = cut;
    else ctx.globalCompositeOperation = "destination-out";
    path();
    ctx.fill();
    ctx.restore();
  };
  const r = s * 0.14;
  return [
    // 1. Quadrado quebrado: dois cartões sobrepostos, o de trás deslocado, com a diagonal recortada.
    () => {
      ctx.fillStyle = ink;
      roundRect(ctx, -s * 0.5, -s * 0.42, s * 0.78, s * 0.8, r);
      ctx.fill();
      at(ctx, s * 0.12, s * 0.06, 12, () => {
        roundRect(ctx, -s * 0.3, -s * 0.36, s * 0.66, s * 0.68, r);
        ctx.fill();
      });
      carve(() => {
        ctx.beginPath();
        ctx.moveTo(-s * 0.1, s * 0.42);
        ctx.lineTo(s * 0.34, -s * 0.06);
        ctx.lineTo(s * 0.4, s * 0.02);
        ctx.lineTo(-s * 0.02, s * 0.46);
        ctx.closePath();
      });
    },
    // 2. "@": quadrado arredondado com o anel e a abertura recortados.
    () => {
      ctx.fillStyle = ink;
      roundRect(ctx, -s * 0.48, -s * 0.36, s * 0.96, s * 0.72, r * 1.3);
      ctx.fill();
      carve(() => {
        ctx.beginPath();
        ctx.arc(-s * 0.08, -s * 0.02, s * 0.25, 0, Math.PI * 2);
        ctx.arc(-s * 0.08, -s * 0.02, s * 0.12, 0, Math.PI * 2, true);
      });
      carve(() => {
        ctx.beginPath();
        ctx.rect(-s * 0.08, -s * 0.02, s * 0.3, s * 0.06);
      });
    },
    // 3. Seta para cima e à direita com a base quadriculada.
    () => {
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.moveTo(-s * 0.05, -s * 0.48);
      ctx.lineTo(s * 0.32, -s * 0.12);
      ctx.lineTo(s * 0.08, -s * 0.12);
      ctx.lineTo(s * 0.08, s * 0.1);
      ctx.lineTo(-s * 0.18, s * 0.1);
      ctx.lineTo(-s * 0.18, -s * 0.12);
      ctx.lineTo(-s * 0.42, -s * 0.12);
      ctx.closePath();
      ctx.fill();
      const cell = s * 0.13;
      for (let i = 0; i < 3; i += 1) {
        for (let j = 0; j < 2; j += 1) {
          if ((i + j) % 2) continue;
          ctx.fillRect(-s * 0.18 + j * cell, s * 0.12 + i * cell, cell, cell);
        }
      }
      ctx.beginPath();
      ctx.moveTo(s * 0.12, s * 0.2);
      ctx.lineTo(s * 0.5, s * 0.32);
      ctx.lineTo(s * 0.12, s * 0.44);
      ctx.closePath();
      ctx.fill();
    },
    // 4. Coração quadriculado (dois quadrados girados).
    () => {
      ctx.fillStyle = ink;
      at(ctx, 0, s * 0.02, 45, () => {
        roundRect(ctx, -s * 0.28, -s * 0.28, s * 0.56, s * 0.56, r * 0.6);
        ctx.fill();
      });
      ctx.beginPath();
      ctx.arc(-s * 0.18, -s * 0.18, s * 0.2, 0, Math.PI * 2);
      ctx.arc(s * 0.18, -s * 0.18, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
      const cell = s * 0.12;
      carve(() => {
        ctx.beginPath();
        for (let i = 0; i < 4; i += 1) {
          for (let j = 0; j < 4; j += 1) {
            if ((i + j) % 2 === 0 && i + j > 2) ctx.rect(-s * 0.24 + j * cell, -s * 0.06 + i * cell * 0.75, cell * 0.9, cell * 0.68);
          }
        }
      });
    },
  ];
}

/** Pinta a estampa da marca em (0, 0, w, h). */
export function paintBrandArt(ctx: CanvasRenderingContext2D, w: number, h: number, options: BrandArtOptions, root?: Element | null) {
  const mode = options.mode ?? "pattern";
  const color = brandColor(options.color, root);
  const rand = random(options.seed ?? 7);
  const m = Math.min(w, h);
  const white = "#ffffff";
  const ink = mode === "pattern" ? white : color;

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  if (mode === "pattern") {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
  }

  // Contornos grandes sangrando nas bordas (no "mark", um só, mais discreto).
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(2, m * (mode === "pattern" ? 0.012 : 0.014));
  ctx.lineJoin = "round";
  const outlines = mode === "pattern" ? 5 : 1;
  for (let i = 0; i < outlines; i += 1) {
    const big = mode === "pattern" ? 0.45 + rand() * 0.5 : 0.92;
    const bw = m * big * (0.9 + rand() * 0.5);
    const bh = m * big * (0.7 + rand() * 0.5);
    const corner = [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
      [w * 0.5, h * 1.02],
    ][i % 5];
    const cx = mode === "pattern" ? corner[0] + (rand() - 0.5) * m * 0.3 : w / 2;
    const cy = mode === "pattern" ? corner[1] + (rand() - 0.5) * m * 0.3 : h / 2;
    at(ctx, cx, cy, mode === "pattern" ? (rand() - 0.5) * 50 : 0, () => {
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, Math.min(bw, bh) * (0.12 + rand() * 0.18));
      ctx.stroke();
    });
  }
  if (mode === "pattern") {
    // Um arco grande, como os cantos de cartão das fotos do site oficial.
    ctx.beginPath();
    ctx.arc(w * (0.78 + rand() * 0.2), h * (0.72 + rand() * 0.2), m * (0.28 + rand() * 0.12), Math.PI * 0.95, Math.PI * 1.9);
    ctx.stroke();
  }

  // O símbolo desmontado: 2 × 2 peças brancas, levemente giradas, no centro.
  const s = m * (mode === "pattern" ? 0.17 : 0.2);
  const gap = s * 1.18;
  const pieces = glyphs(ctx, s, ink, mode === "pattern" ? color : null);
  const spots = [
    [-0.5, -0.5, -8],
    [0.5, -0.5, 4],
    [-0.5, 0.5, 0],
    [0.5, 0.5, -6],
  ];
  pieces.forEach((draw, i) => {
    const [dx, dy, deg] = spots[i];
    at(ctx, w / 2 + dx * gap, h / 2 + dy * gap, deg, draw);
  });
  ctx.restore();
}

/** Data URL (PNG) da estampa, para usar como `art.src`. */
export function brandArtDataUrl(options: BrandArtOptions, size = 1600): string {
  const aspect = options.aspect && options.aspect > 0 ? options.aspect : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(aspect >= 1 ? size : size * aspect);
  canvas.height = Math.round(aspect >= 1 ? size / aspect : size);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  paintBrandArt(ctx, canvas.width, canvas.height, options);
  return canvas.toDataURL("image/png");
}
