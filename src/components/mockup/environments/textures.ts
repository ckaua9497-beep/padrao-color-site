"use client";

// Texturas procedurais das salas (canvas 2D): piso, revestimentos, relevo de reboco e de trama,
// sombras assadas, céu da janela, folha das plantas e o quadro decorativo. Tudo com semente fixa
// (a sala é a mesma a cada montagem) e liberado junto com a sala.

import * as THREE from "three";
import type { FloorStyle, RoomId } from "./presets";

type Paint = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/** Gerador pseudoaleatório com semente (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(width: number, height: number, paint: Paint, color: boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) paint(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  // Relevo e máscaras são dados: só as texturas de cor ficam em sRGB.
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function repeating<T extends THREE.Texture>(texture: T): T {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/* ------------------------------------------------------------------------------------------ piso */

const WOOD: Record<"oak" | "ash" | "walnut", { h: number; s: number; l: number; grain: [number, number, number] }> = {
  oak: { h: 31, s: 36, l: 60, grain: [96, 60, 32] },
  ash: { h: 35, s: 22, l: 73, grain: [120, 94, 66] },
  walnut: { h: 24, s: 30, l: 39, grain: [46, 28, 16] },
};

/**
 * Tábuas corridas de 18 cm no sentido da profundidade (2 × 2 m por textura, emenda sem costura):
 * tom por tábua, veios ondulados, emendas de topo e juntas escuras.
 */
function paintPlanks(style: "oak" | "ash" | "walnut"): Paint {
  return (ctx, w, h) => {
    const tone = WOOD[style];
    const random = rng(style === "oak" ? 11 : style === "ash" ? 23 : 37);
    const columns = 11;
    const pw = w / columns;
    const [gr, gg, gb] = tone.grain;
    for (let c = 0; c < columns; c += 1) {
      const x0 = c * pw;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, 0, pw, h);
      ctx.clip();
      // Sequência de tábuas com período h (a textura repete no comprimento sem costura).
      const start = random() * h;
      const boards: [number, number][] = [];
      let y = start;
      while (y < start + h - 1) {
        const length = Math.min((0.45 + random() * 0.55) * h, start + h - y);
        boards.push([y, length]);
        y += length;
      }
      for (const [by, length] of boards) {
        const l = tone.l + (random() - 0.5) * 9;
        const s = tone.s + (random() - 0.5) * 8;
        const hue = tone.h + (random() - 0.5) * 4;
        const lines = 16;
        const grains = Array.from({ length: lines }, () => ({ x: x0 + random() * pw, amp: 0.6 + random() * 2.6, freq: 0.006 + random() * 0.02, phase: random() * 6.3, alpha: 0.04 + random() * 0.12, width: 0.5 + random() * 1.6 }));
        for (const offset of [-h, 0, h]) {
          const top = by + offset;
          if (top > h || top + length < 0) continue;
          ctx.fillStyle = `hsl(${hue}, ${s}%, ${l}%)`;
          ctx.fillRect(x0, top, pw, length);
          for (const g of grains) {
            ctx.strokeStyle = `rgba(${gr},${gg},${gb},${g.alpha})`;
            ctx.lineWidth = g.width;
            ctx.beginPath();
            for (let yy = 0; yy <= length; yy += 10) {
              const px = g.x + Math.sin((top + yy) * g.freq + g.phase) * g.amp;
              if (yy === 0) ctx.moveTo(px, top + yy);
              else ctx.lineTo(px, top + yy);
            }
            ctx.stroke();
          }
          // Emenda de topo.
          ctx.fillStyle = `rgba(${gr * 0.5},${gg * 0.5},${gb * 0.5},0.55)`;
          ctx.fillRect(x0, top, pw, 1.6);
        }
      }
      ctx.restore();
      // Junta entre tábuas.
      ctx.fillStyle = `rgba(${gr * 0.45},${gg * 0.45},${gb * 0.45},0.6)`;
      ctx.fillRect(x0, 0, 1.6, h);
    }
  };
}

/** Cimento queimado: manchas suaves e pó fino (2 × 2 m por textura). */
const paintConcrete: Paint = (ctx, w, h) => {
  const random = rng(5);
  ctx.fillStyle = "#b9b5ae";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i += 1) {
    const x = random() * w;
    const y = random() * h;
    const r = (0.08 + random() * 0.3) * w;
    const dark = random() < 0.5;
    const alpha = 0.04 + random() * 0.07;
    for (const ox of [-w, 0, w]) {
      for (const oy of [-h, 0, h]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, dark ? `rgba(70,66,60,${alpha})` : `rgba(235,232,226,${alpha})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
  for (let i = 0; i < 9000; i += 1) {
    const l = random() < 0.5 ? 60 : 230;
    ctx.fillStyle = `rgba(${l},${l},${l},${0.04 + random() * 0.06})`;
    ctx.fillRect(random() * w, random() * h, 1.2, 1.2);
  }
};

type TileLook = { cols: number; rows: number; base: [number, number, number]; vary: number; grout: string; groutPx: number; stagger?: boolean };

/** Revestimento: placas com variação de tom, rejunte e um brilho leve no alto de cada placa. */
function paintTiles(look: TileLook, seed: number): Paint {
  return (ctx, w, h) => {
    const random = rng(seed);
    ctx.fillStyle = look.grout;
    ctx.fillRect(0, 0, w, h);
    const tw = w / look.cols;
    const th = h / look.rows;
    const g = look.groutPx;
    for (let r = 0; r < look.rows; r += 1) {
      const shift = look.stagger && r % 2 ? tw / 2 : 0;
      for (let c = -1; c < look.cols; c += 1) {
        const x = c * tw + shift;
        const k = (random() - 0.5) * look.vary;
        const [br, bg, bb] = look.base.map((v) => Math.round(Math.max(0, Math.min(255, v + k))));
        const grad = ctx.createLinearGradient(x, r * th, x + tw, r * th + th);
        grad.addColorStop(0, `rgb(${Math.min(255, br + 6)},${Math.min(255, bg + 6)},${Math.min(255, bb + 6)})`);
        grad.addColorStop(1, `rgb(${br},${bg},${bb})`);
        ctx.fillStyle = grad;
        ctx.fillRect(x + g / 2, r * th + g / 2, tw - g, th - g);
      }
    }
  };
}

/* ---------------------------------------------------------------------------------- relevos */

/** Ruído de valor periódico (várias oitavas): relevo de reboco pintado. */
function paintPlaster(seed: number): Paint {
  return (ctx, w, h) => {
    const random = rng(seed);
    const image = ctx.createImageData(w, h);
    const octaves = [8, 16, 32, 64].map((n) => ({ n, values: Float32Array.from({ length: n * n }, () => random()) }));
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let v = 0;
        let amp = 0.5;
        for (const { n, values } of octaves) {
          const fx = (x / w) * n;
          const fy = (y / h) * n;
          const x0 = Math.floor(fx) % n;
          const y0 = Math.floor(fy) % n;
          const x1 = (x0 + 1) % n;
          const y1 = (y0 + 1) % n;
          const tx = fx - Math.floor(fx);
          const ty = fy - Math.floor(fy);
          const sx = tx * tx * (3 - 2 * tx);
          const sy = ty * ty * (3 - 2 * ty);
          const a = values[y0 * n + x0] + (values[y0 * n + x1] - values[y0 * n + x0]) * sx;
          const b = values[y1 * n + x0] + (values[y1 * n + x1] - values[y1 * n + x0]) * sx;
          v += (a + (b - a) * sy) * amp;
          amp *= 0.5;
        }
        const value = Math.round(Math.max(0, Math.min(255, v * 255 * 1.05)));
        const i = (y * w + x) * 4;
        image.data[i] = value;
        image.data[i + 1] = value;
        image.data[i + 2] = value;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  };
}

/** Trama de tecido de estofado: fios por cima e por baixo. */
const paintWeave: Paint = (ctx, w, h) => {
  const cell = w / 8;
  const image = ctx.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const tx = ((x % cell) + 0.5) / cell;
      const ty = ((y % cell) + 0.5) / cell;
      const warp = Math.sin(Math.PI * tx);
      const weft = Math.sin(Math.PI * ty);
      const over = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      const height = over ? Math.max(warp * (0.65 + 0.35 * weft), weft * 0.45) : Math.max(weft * (0.65 + 0.35 * warp), warp * 0.45);
      const value = Math.round(50 + height * 190);
      const i = (y * w + x) * 4;
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
};

/* --------------------------------------------------------------------------------- sombras */

/** Sombra de contato redonda (preta, alfa no canal de cor para usar como alphaMap). */
const paintBlob: Paint = (ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.45, "#9a9a9a");
  g.addColorStop(1, "#000000");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
};

/** Quanto o plano da sombra macia é maior que a peça. */
export const SOFT_SPREAD = 1.6;

/** Retângulo desfocado (sombra de quadro na parede e pegada de móvel), como máscara branca. */
const paintSoftRect: Paint = (ctx, w, h) => {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  const inset = (1 - 1 / SOFT_SPREAD) / 2;
  const off = w * 4;
  ctx.save();
  ctx.shadowColor = "#ffffff";
  ctx.shadowBlur = w * inset * 0.62;
  ctx.shadowOffsetX = off;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(w * inset - off, h * inset, w * (1 - 2 * inset), h * (1 - 2 * inset));
  ctx.restore();
};

/** Degradê de oclusão (branco no canto, preto longe): cantos e rodapé. */
const paintFade: Paint = (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.3, "#6a6a6a");
  g.addColorStop(1, "#000000");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
};

/* ---------------------------------------------------------------------------------- janela */

/** Céu visto da janela: de dia, azul claro com prédios distantes em tom de névoa; à noite, azul fundo com janelas acesas. */
function paintSky(night: boolean): Paint {
  return (ctx, w, h) => {
    const random = rng(night ? 41 : 43);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (night) {
      g.addColorStop(0, "#0b1224");
      g.addColorStop(0.65, "#1b2442");
      g.addColorStop(1, "#2a2a3c");
    } else {
      g.addColorStop(0, "#bcd6ee");
      g.addColorStop(0.6, "#e6f0f5");
      g.addColorStop(1, "#f3efe7");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Silhueta de prédios ao longe, bem lavada pela distância.
    let x = 0;
    while (x < w) {
      const bw = w * (0.08 + random() * 0.14);
      const bh = h * (0.12 + random() * 0.3);
      ctx.fillStyle = night ? "#141a2c" : `rgba(176,188,198,${0.35 + random() * 0.2})`;
      ctx.fillRect(x, h - bh, bw - 2, bh);
      if (night) {
        for (let wy = h - bh + 6; wy < h - 4; wy += 9) {
          for (let wx = x + 4; wx < x + bw - 6; wx += 8) {
            if (random() < 0.32) {
              ctx.fillStyle = random() < 0.7 ? "rgba(255,206,130,0.85)" : "rgba(190,220,255,0.7)";
              ctx.fillRect(wx, wy, 3, 4);
            }
          }
        }
      }
      x += bw;
    }
  };
}

/* ---------------------------------------------------------------------------------- plantas */

/** Folha larga (figueira-lira): limbo com nervura central, alfa fora do contorno. */
const paintLeaf: Paint = (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, "#3f6b38");
  g.addColorStop(0.5, "#5b8a4a");
  g.addColorStop(1, "#365f31");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(w / 2, h);
  ctx.bezierCurveTo(w * 0.02, h * 0.78, w * 0.02, h * 0.22, w / 2, 0);
  ctx.bezierCurveTo(w * 0.98, h * 0.22, w * 0.98, h * 0.78, w / 2, h);
  ctx.fill();
  ctx.strokeStyle = "rgba(210,226,170,0.55)";
  ctx.lineWidth = w * 0.03;
  ctx.beginPath();
  ctx.moveTo(w / 2, h);
  ctx.lineTo(w / 2, h * 0.06);
  ctx.stroke();
  ctx.lineWidth = w * 0.012;
  for (let i = 1; i < 7; i += 1) {
    const y = h * (0.15 + i * 0.11);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(w / 2, y);
      ctx.quadraticCurveTo(w / 2 + side * w * 0.2, y - h * 0.05, w / 2 + side * w * 0.36, y - h * 0.1);
      ctx.stroke();
    }
  }
};

/* ------------------------------------------------------------------------------- decoração */

/** Quadro decorativo neutro (formas orgânicas em tons terrosos): só aparece quando a parede é livre. */
const paintArt: Paint = (ctx, w, h) => {
  ctx.fillStyle = "#efe7da";
  ctx.fillRect(0, 0, w, h);
  const shapes: [number, number, number, string][] = [
    [0.32, 0.58, 0.3, "#c97e5a"],
    [0.66, 0.4, 0.24, "#8fa08a"],
    [0.55, 0.72, 0.16, "#d8b46a"],
    [0.22, 0.28, 0.12, "#3e4a52"],
  ];
  for (const [x, y, r, color] of shapes) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x * w, y * h, r * w, r * w * 0.82, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "#3e4a52";
  ctx.lineWidth = w * 0.008;
  ctx.beginPath();
  ctx.moveTo(w * 0.1, h * 0.86);
  ctx.bezierCurveTo(w * 0.35, h * 0.7, w * 0.6, h * 0.95, w * 0.9, h * 0.78);
  ctx.stroke();
};

/** Tapete decorativo: trama creme com borda e losangos discretos. */
const paintRug: Paint = (ctx, w, h) => {
  const random = rng(17);
  ctx.fillStyle = "#e6ddcf";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 12000; i += 1) {
    const l = 190 + Math.floor(random() * 50);
    ctx.fillStyle = `rgba(${l},${l - 8},${l - 20},0.35)`;
    ctx.fillRect(random() * w, random() * h, 2, 1);
  }
  ctx.strokeStyle = "rgba(70,62,54,0.75)";
  ctx.lineWidth = w * 0.012;
  ctx.strokeRect(w * 0.05, h * 0.05, w * 0.9, h * 0.9);
  ctx.lineWidth = w * 0.004;
  ctx.strokeRect(w * 0.075, h * 0.075, w * 0.85, h * 0.85);
  ctx.strokeStyle = "rgba(70,62,54,0.25)";
  const step = w / 8;
  for (let x = step; x < w - step / 2; x += step) {
    for (let y = step; y < h - step / 2; y += step) {
      ctx.beginPath();
      ctx.moveTo(x, y - step * 0.3);
      ctx.lineTo(x + step * 0.3, y);
      ctx.lineTo(x, y + step * 0.3);
      ctx.lineTo(x - step * 0.3, y);
      ctx.closePath();
      ctx.stroke();
    }
  }
};

/** Painel de ripas de madeira (recepção): ripas de 4 cm com frestas escuras. */
const paintSlats: Paint = (ctx, w, h) => {
  const random = rng(29);
  const count = 16;
  const sw = w / count;
  ctx.fillStyle = "#2c2118";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i += 1) {
    const l = 46 + (random() - 0.5) * 8;
    ctx.fillStyle = `hsl(28, 38%, ${l}%)`;
    ctx.fillRect(i * sw + sw * 0.14, 0, sw * 0.72, h);
    for (let k = 0; k < 6; k += 1) {
      ctx.strokeStyle = `rgba(70,40,18,${0.08 + random() * 0.12})`;
      ctx.lineWidth = 1;
      const x = i * sw + sw * (0.2 + random() * 0.6);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (random() - 0.5) * 4, h);
      ctx.stroke();
    }
  }
};

/** Veio de madeira dos móveis (tampo, pés, cabeceira), no sentido do comprimento (u). */
function paintGrain(color: string): Paint {
  return (ctx, w, h) => {
    const random = rng(53);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i += 1) {
      const y0 = random() * h;
      const amp = 1 + random() * 5;
      const phase = random() * 6.3;
      ctx.strokeStyle = `rgba(60,36,18,${0.05 + random() * 0.14})`;
      ctx.lineWidth = 0.6 + random() * 2;
      for (const offset of [-h, 0, h]) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const y = y0 + offset + Math.sin((x / w) * Math.PI * 2 * (1 + (i % 3)) + phase) * amp;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
  };
}

/* ----------------------------------------------------------------------------- conjunto */

export type RoomTextures = {
  floor: THREE.CanvasTexture;
  /** Tamanho (m) que uma repetição do piso cobre. */
  floorTile: number;
  plaster: THREE.CanvasTexture;
  weave: THREE.CanvasTexture;
  blob: THREE.CanvasTexture;
  softRect: THREE.CanvasTexture;
  fade: THREE.CanvasTexture;
  sky: THREE.CanvasTexture;
  leaf: THREE.CanvasTexture;
  art: THREE.CanvasTexture;
  rug: THREE.CanvasTexture;
  grain: THREE.CanvasTexture;
  /** Azulejo da parede (banheiro, cozinha) e ripas (recepção), quando a sala usa. */
  wallTile: THREE.CanvasTexture | null;
  slats: THREE.CanvasTexture | null;
  list: THREE.Texture[];
};

function floorTexture(style: FloorStyle, room: RoomId): { texture: THREE.CanvasTexture; tile: number } {
  if (style === "concrete") return { texture: repeating(canvasTexture(512, 512, paintConcrete, true)), tile: 2.4 };
  if (style === "tile") {
    const look: TileLook =
      room === "bathroom"
        ? { cols: 2, rows: 2, base: [214, 208, 199], vary: 10, grout: "#b9b2a7", groutPx: 3 }
        : { cols: 2, rows: 2, base: [200, 192, 180], vary: 12, grout: "#a39a8c", groutPx: 3 };
    return { texture: repeating(canvasTexture(512, 512, paintTiles(look, 7), true)), tile: 1.2 };
  }
  return { texture: repeating(canvasTexture(1024, 1024, paintPlanks(style), true)), tile: 2 };
}

/** Cria as texturas de uma sala. Quem chama libera com `disposeRoomTextures`. */
export function makeRoomTextures(room: RoomId, style: FloorStyle, wood: string, night: boolean): RoomTextures {
  const { texture: floor, tile: floorTile } = floorTexture(style, room);
  const plaster = repeating(canvasTexture(256, 256, paintPlaster(3), false));
  // Os móveis têm UV em metros: trama de ~3 mm por fio e veio de madeira em faixas de ~30 cm.
  const weave = repeating(canvasTexture(64, 64, paintWeave, false));
  weave.repeat.set(42, 42);
  const blob = canvasTexture(128, 128, paintBlob, false);
  const softRect = canvasTexture(256, 256, paintSoftRect, false);
  const fade = canvasTexture(8, 128, paintFade, false);
  const sky = canvasTexture(256, 256, paintSky(night), true);
  const leaf = canvasTexture(128, 256, paintLeaf, true);
  const art = canvasTexture(512, 384, paintArt, true);
  const rug = canvasTexture(512, 512, paintRug, true);
  const grain = repeating(canvasTexture(512, 128, paintGrain(wood), true));
  grain.repeat.set(1, 3.4);
  let wallTile: THREE.CanvasTexture | null = null;
  if (room === "bathroom") wallTile = repeating(canvasTexture(512, 512, paintTiles({ cols: 2, rows: 4, base: [238, 236, 232], vary: 6, grout: "#d3cec6", groutPx: 3 }, 13), true));
  if (room === "kitchen") wallTile = repeating(canvasTexture(512, 512, paintTiles({ cols: 4, rows: 8, base: [232, 236, 232], vary: 8, grout: "#c9c6bf", groutPx: 3, stagger: true }, 19), true));
  const slats = room === "store" ? repeating(canvasTexture(512, 256, paintSlats, true)) : null;
  const list: THREE.Texture[] = [floor, plaster, weave, blob, softRect, fade, sky, leaf, art, rug, grain];
  if (wallTile) list.push(wallTile);
  if (slats) list.push(slats);
  return { floor, floorTile, plaster, weave, blob, softRect, fade, sky, leaf, art, rug, grain, wallTile, slats, list };
}

export function disposeRoomTextures(textures: RoomTextures) {
  for (const texture of textures.list) texture.dispose();
}
