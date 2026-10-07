// Texturas procedurais do tecido (canvas, só no navegador): relevo da malha (jersey, piquet, dry fit,
// tela furadinha), canelado da gola e a máscara das cavas no corpo da peça.

import * as THREE from "three";
import type { GarmentShape } from "./garment.ts";

const TAU = Math.PI * 2;

export type Knit = "jersey" | "pique" | "dryfit" | "mesh";

/** Tamanho (cm) de um ladrilho de cada malha: a uv1 da peça está em cm. */
export const KNIT_TILE: Record<Knit, number> = { jersey: 1.6, pique: 1.6, dryfit: 1.2, mesh: 1.2 };
export const RIB_TILE = 1.2;

const cache = new Map<string, THREE.Texture>();

/** Ruído de valor periódico (ladrilha sem emenda) em [0, 1]. */
function periodicNoise(size: number, cells: number, seed: number) {
  const grid = new Float32Array(cells * cells);
  let s = seed;
  for (let i = 0; i < grid.length; i += 1) {
    s = (s * 1664525 + 1013904223) >>> 0;
    grid[i] = s / 4294967296;
  }
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    const gy = (y / size) * cells;
    const y0 = Math.floor(gy);
    const fy = gy - y0;
    const sy = fy * fy * (3 - 2 * fy);
    for (let x = 0; x < size; x += 1) {
      const gx = (x / size) * cells;
      const x0 = Math.floor(gx);
      const fx = gx - x0;
      const sx = fx * fx * (3 - 2 * fx);
      const a = grid[(y0 % cells) * cells + (x0 % cells)];
      const b = grid[(y0 % cells) * cells + ((x0 + 1) % cells)];
      const c = grid[((y0 + 1) % cells) * cells + (x0 % cells)];
      const d = grid[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
      out[y * size + x] = (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
    }
  }
  return out;
}

/** Mapa de normais a partir de um mapa de altura periódico. */
function normalTexture(height: Float32Array, size: number, strength: number, key: string): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d indisponível");
  const img = ctx.createImageData(size, size);
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      img.data[o] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      // Canvas cresce para baixo e a textura (flipY) para cima: inverte o verde.
      img.data[o + 1] = Math.round(((dy / len) * 0.5 + 0.5) * 255);
      img.data[o + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.colorSpace = THREE.NoColorSpace;
  texture.name = key;
  return texture;
}

/** Relevo da malha do corpo da peça (ladrilho de KNIT_TILE cm, lido pela uv1 em cm). */
export function knitNormalMap(knit: Knit): THREE.Texture {
  const key = `knit:${knit}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const size = 512;
  const h = new Float32Array(size * size);
  const tile = KNIT_TILE[knit];
  const coarse = periodicNoise(size, 4, 7);
  const fine = periodicNoise(size, 24, 11);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Posição no ladrilho (0–1); contagens inteiras por ladrilho para emendar sem costura.
      const tx = x / size;
      const ty = y / size;
      let v = 0;
      if (knit === "jersey") {
        // Jersey: colunas de pontos em "V" (14 colunas e 18 carreiras por ladrilho de 1,6 cm).
        const u = (tx * 14) % 1;
        const w = (ty * 18) % 1;
        const legL = Math.exp(-(((u - (0.3 + 0.16 * w)) / 0.13) ** 2));
        const legR = Math.exp(-(((u - (0.7 - 0.16 * w)) / 0.13) ** 2));
        v = Math.max(legL, legR) * (0.75 + 0.25 * Math.sin(w * Math.PI));
      } else if (knit === "pique") {
        // Piquet: favos em relevo (8 por ladrilho de 1,6 cm, alternados).
        const u = (tx * 8) % 1;
        const w = (ty * 8 + (Math.floor(tx * 8) % 2) * 0.5) % 1;
        v = Math.sin(u * Math.PI) * Math.sin(w * Math.PI);
        v = v ** 0.6;
      } else if (knit === "dryfit") {
        // Dry fit: microfuros em grade (14 por ladrilho de 1,2 cm).
        const u = (tx * 14) % 1;
        const w = (ty * 14 + (Math.floor(tx * 14) % 2) * 0.5) % 1;
        v = 1 - Math.exp(-(((u - 0.5) ** 2 + (w - 0.5) ** 2) / 0.035));
      } else {
        // Tela furadinha (colete): furos maiores (6 por ladrilho de 1,2 cm).
        const u = (tx * 6) % 1;
        const w = (ty * 6 + (Math.floor(tx * 6) % 2) * 0.5) % 1;
        v = 1 - Math.exp(-(((u - 0.5) ** 2 + (w - 0.5) ** 2) / 0.05));
      }
      h[y * size + x] = v * (knit === "jersey" ? 0.18 : 0.4) + coarse[y * size + x] * 0.9 + fine[y * size + x] * 0.3;
    }
  }
  const texture = normalTexture(h, size, knit === "jersey" ? 2.2 : 2.8, key);
  texture.repeat.set(1 / tile, 1 / tile);
  texture.channel = 1;
  cache.set(key, texture);
  return texture;
}

/** Canelado da gola e do punho: nervuras ao longo da faixa (uv1: cm ao longo da curva). */
export function ribNormalMap(): THREE.Texture {
  const key = "rib";
  const hit = cache.get(key);
  if (hit) return hit;
  const size = 256;
  const h = new Float32Array(size * size);
  const noise = periodicNoise(size, 6, 3);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // 5 nervuras por ladrilho de 1,2 cm (≈ 4 por cm).
      const u = ((x / size) * 5) % 1;
      h[y * size + x] = Math.abs(Math.sin(u * Math.PI)) ** 0.7 + noise[y * size + x] * 0.2;
    }
  }
  const texture = normalTexture(h, size, 3.2, key);
  texture.repeat.set(1 / RIB_TILE, 1 / RIB_TILE);
  texture.channel = 1;
  cache.set(key, texture);
  return texture;
}

/**
 * Máscara do corpo da peça (uv: volta a partir das costas × altura): branco = tecido, preto = cavas.
 * O canto das cavas fica sob a manga costurada ou sob o viés.
 */
export function armholeMask(shape: GarmentShape): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d indisponível");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000";
  const toPx = (phi: number, y: number): [number, number] => {
    let u = (phi - Math.PI) / TAU;
    u = ((u % 1) + 1) % 1;
    const v = (y - shape.yHem) / (shape.yTop - shape.yHem);
    return [u * size, (1 - v) * size];
  };
  for (const mirror of [false, true]) {
    ctx.beginPath();
    shape.armhole.forEach(({ phi, y }, i) => {
      const [px, py] = toPx(mirror ? TAU - phi : phi, y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.channel = 0;
  return texture;
}
