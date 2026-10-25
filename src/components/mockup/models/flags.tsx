"use client";

// Bandeiras, wind banners, wind ball e as bases/hastes vendidas avulsas.

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { formatSize, type FlagStyle } from "@/lib/mockup";
import type { ArtRender } from "../art";
import { useAnimate } from "../viewer-hooks";
import { useGeometriesCleanup } from "./fabric";
import { inflatedSurface } from "./inflate";
import { backArtOf, makeShape, useArtTexture, type ModelProps } from "./shared";
import { lathe, smoothProfile, type Pt } from "./vessel";

/*
 * Escala real: 1 unidade de cena = 1 m. O tecido é uma malha plana recortada no contorno do modelo
 * (inflatedSurface com altura zero) e com UV na mesma proporção da arte. Bainha da haste, costuras,
 * bainha da borda e elástico de baixo são malhas próprias que recebem o MESMO deslocamento de vento
 * do tecido (função da distância até a haste), então tudo ondula junto sem descolar.
 */
const CM = 0.01;
const TAU = Math.PI * 2;
const SLEEVE_COLOR = "#141416";
/** Haste de alumínio do wind banner (Ø 21 mm). */
const POLE_R = 0.0105;
/** Passo do pesponto (ponto + intervalo). */
const STITCH_PITCH = 0.011;
const THREAD = 0.0011;

type Vec3 = [number, number, number];

function clamp(value: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Number.isFinite(value) ? value : lo));
}

// ---------------------------------------------------------------------------- contornos

/**
 * Contornos dos wind banners tirados dos gabaritos oficiais da Padrão (src/data/templates.json, "wind-banner"):
 * a faixa da bainha mais o corpo, em fração da caixa (u da haste para a ponta, v de baixo para cima), no sentido
 * horário a partir do pé da haste. Os `pole` primeiros pontos são a linha da haste (bainha). `w`/`h` = tecido em cm.
 * "g" = grande (2,2 m de bandeira, 3 m montado), "p" = pequeno (1,5 m, 1,8 m montado). A gota só tem o grande; o
 * gabarito dela vem inclinado e foi girado para a haste ficar em pé.
 */
const WIND_OUTLINES: Record<string, { w: number; h: number; pole: number; pts: number[] }> = {
  "faca-g": { w: 73.5, h: 230, pole: 23, pts: [0.001, 0, 0.003, 0.331, 0.009, 0.487, 0.016, 0.569, 0.025, 0.616, 0.046, 0.673, 0.067, 0.711, 0.096, 0.748, 0.124, 0.775, 0.157, 0.801, 0.172, 0.812, 0.222, 0.842, 0.298, 0.878, 0.34, 0.894, 0.408, 0.916, 0.48, 0.935, 0.564, 0.953, 0.684, 0.973, 0.747, 0.981, 0.845, 0.991, 0.947, 0.998, 0.982, 1, 1, 1, 1, 0] },
  "faca-p": { w: 73.2, h: 145.3, pole: 19, pts: [0, 0, 0.01, 0.302, 0.021, 0.392, 0.037, 0.468, 0.063, 0.542, 0.092, 0.601, 0.141, 0.671, 0.184, 0.718, 0.237, 0.765, 0.275, 0.793, 0.337, 0.832, 0.429, 0.877, 0.506, 0.907, 0.621, 0.942, 0.714, 0.963, 0.778, 0.975, 0.844, 0.985, 0.947, 0.997, 1, 1, 1, 0] },
  "gota-g": { w: 95.3, h: 201.1, pole: 24, pts: [0.016, 0, 0, 0, 0, 0.745, 0.007, 0.771, 0.018, 0.797, 0.035, 0.821, 0.056, 0.845, 0.097, 0.878, 0.131, 0.898, 0.169, 0.918, 0.211, 0.935, 0.276, 0.956, 0.323, 0.968, 0.371, 0.978, 0.447, 0.99, 0.473, 0.993, 0.578, 1, 0.63, 1, 0.684, 0.998, 0.739, 0.994, 0.794, 0.988, 0.875, 0.976, 0.927, 0.965, 1, 0.946, 0.093, 0] },
  "pena-g": { w: 73.5, h: 230, pole: 21, pts: [0.001, 0, 0.003, 0.331, 0.009, 0.487, 0.016, 0.569, 0.025, 0.616, 0.046, 0.673, 0.067, 0.711, 0.096, 0.748, 0.124, 0.775, 0.157, 0.801, 0.172, 0.812, 0.222, 0.842, 0.298, 0.878, 0.34, 0.894, 0.408, 0.916, 0.48, 0.935, 0.564, 0.953, 0.684, 0.973, 0.747, 0.981, 0.845, 0.991, 0.982, 1, 1, 0.761, 0.995, 0.55, 0.988, 0.417, 0.982, 0.371, 0.968, 0.317, 0.948, 0.273, 0.925, 0.239, 0.903, 0.214, 0.877, 0.19, 0.815, 0.147, 0.751, 0.115, 0.716, 0.101, 0.659, 0.081, 0.597, 0.063, 0.527, 0.047, 0.475, 0.037, 0.338, 0.017, 0.279, 0.011, 0.158, 0.002] },
  "pena-p": { w: 73.2, h: 144.9, pole: 18, pts: [0, 0, 0.01, 0.3, 0.021, 0.391, 0.033, 0.451, 0.057, 0.526, 0.084, 0.585, 0.13, 0.656, 0.184, 0.718, 0.237, 0.764, 0.316, 0.819, 0.405, 0.866, 0.453, 0.887, 0.506, 0.907, 0.621, 0.942, 0.714, 0.963, 0.778, 0.975, 0.844, 0.985, 0.982, 1, 1, 0.621, 0.998, 0.424, 0.991, 0.308, 0.98, 0.274, 0.964, 0.241, 0.941, 0.21, 0.912, 0.18, 0.878, 0.151, 0.839, 0.125, 0.795, 0.101, 0.747, 0.079, 0.694, 0.059, 0.638, 0.042, 0.579, 0.027, 0.517, 0.015, 0.452, 0.007, 0.384, 0.002, 0.315, 0] },
  "vela-g": { w: 73.5, h: 230, pole: 23, pts: [0.001, 0, 0.003, 0.331, 0.009, 0.487, 0.016, 0.569, 0.025, 0.616, 0.046, 0.673, 0.067, 0.711, 0.096, 0.748, 0.124, 0.775, 0.157, 0.801, 0.172, 0.812, 0.222, 0.842, 0.298, 0.878, 0.34, 0.894, 0.408, 0.916, 0.48, 0.935, 0.564, 0.953, 0.684, 0.973, 0.747, 0.981, 0.845, 0.991, 0.947, 0.998, 0.982, 1, 1, 1, 1, 0.251, 0.917, 0.246, 0.837, 0.239, 0.761, 0.231, 0.688, 0.221, 0.554, 0.198, 0.493, 0.184, 0.436, 0.169, 0.383, 0.152, 0.334, 0.134, 0.29, 0.115, 0.25, 0.095, 0.215, 0.073, 0.184, 0.05, 0.158, 0.026, 0.137, 0] },
  "vela-p": { w: 74.2, h: 140.3, pole: 22, pts: [0, 0, 0.004, 0.114, 0.019, 0.279, 0.031, 0.357, 0.05, 0.448, 0.082, 0.541, 0.113, 0.601, 0.164, 0.674, 0.195, 0.708, 0.229, 0.741, 0.266, 0.771, 0.346, 0.826, 0.413, 0.861, 0.461, 0.883, 0.512, 0.903, 0.568, 0.923, 0.627, 0.94, 0.718, 0.962, 0.781, 0.974, 0.88, 0.989, 0.947, 0.997, 1, 1, 1, 0.162, 0.916, 0.159, 0.684, 0.143, 0.614, 0.136, 0.486, 0.119, 0.374, 0.098, 0.324, 0.087, 0.279, 0.074, 0.203, 0.047, 0.146, 0.017] },
  // Retangular (gabarito "wind-banner-retangular"): haste em L, subindo pela esquerda e seguindo pelo topo, com o canto chanfrado.
  "rect-g": { w: 70, h: 258, pole: 4, pts: [0, 0, 0, 0.952, 0.207, 1, 1, 1, 1, 0] },
};

type Outline = {
  /** Contorno normalizado (u da haste para a ponta, v de baixo para cima), em sentido horário. */
  points: Pt[];
  /** Quantos pontos do começo formam a linha da haste (bainha). */
  pole: number;
  /** Canto livre preso à haste pelo elástico. */
  tie: Pt | null;
  /** Tecido em cm. */
  widthCm: number;
  heightCm: number;
};

/** Contorno do modelo no tamanho mais próximo (grande a partir de 1,6 m de bandeira). */
function outlineOf(style: FlagStyle, heightCm: number): Outline {
  const size = heightCm >= 160 ? "g" : "p";
  const data = WIND_OUTLINES[`${style}-${size}`] ?? WIND_OUTLINES[`${style}-g`] ?? WIND_OUTLINES["pena-g"];
  const points: Pt[] = [];
  for (let i = 0; i + 1 < data.pts.length; i += 2) points.push([data.pts[i], data.pts[i + 1]]);
  // Tamanho sem gabarito próprio (gota pequena): o desenho do grande na altura do pequeno.
  const own = Boolean(WIND_OUTLINES[`${style}-${size}`]);
  const heightOf = own ? data.h : size === "p" ? 145 : data.h;
  const widthOf = own ? data.w : (data.w * heightOf) / data.h;
  // Faca, vela e retangular têm um canto livre embaixo, preso pelo elástico; gota e pena terminam na haste.
  let tie: Pt | null = null;
  if (style === "faca" || style === "rect") tie = [1, 0];
  if (style === "vela") tie = points.filter(([u]) => u > 0.99).reduce((low, p) => (p[1] < low[1] ? p : low), [1, 1] as Pt);
  return { points, pole: data.pole, tie, widthCm: widthOf, heightCm: heightOf };
}

/** Pontos do contorno em metros; com `poleOnly`, só a linha da haste. */
function outlinePoints(outline: Outline, W: number, H: number, poleOnly = false): THREE.Vector2[] {
  const list = poleOnly ? outline.points.slice(0, outline.pole) : outline.points;
  return list.map(([u, v]) => new THREE.Vector2(u * W, v * H));
}

/** Reamostra uma polilinha em passos iguais de comprimento. */
function resample(points: THREE.Vector2[], step: number): THREE.Vector2[] {
  if (points.length < 2) return [points[0]?.clone() ?? new THREE.Vector2(), points[0]?.clone() ?? new THREE.Vector2()];
  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) cumulative.push(cumulative[i - 1] + points[i].distanceTo(points[i - 1]));
  const total = cumulative[cumulative.length - 1];
  if (total <= 1e-6) return [points[0].clone(), points[points.length - 1].clone()];
  const count = Math.max(2, Math.ceil(total / step) + 1);
  const out: THREE.Vector2[] = [];
  let seg = 1;
  for (let k = 0; k < count; k += 1) {
    const s = (k / (count - 1)) * total;
    while (seg < points.length - 1 && cumulative[seg] < s) seg += 1;
    const span = cumulative[seg] - cumulative[seg - 1] || 1;
    const t = Math.min(1, Math.max(0, (s - cumulative[seg - 1]) / span));
    out.push(points[seg - 1].clone().lerp(points[seg], t));
  }
  return out;
}

function resampleClosed(polygon: THREE.Vector2[], step: number) {
  const ring = resample([...polygon, polygon[0]], step);
  ring.pop();
  return ring;
}

/** Trecho da polilinha sem `start` metros do começo e `end` metros do fim. */
function trimPath(path: THREE.Vector2[], start: number, end: number) {
  const cumulative = [0];
  for (let i = 1; i < path.length; i += 1) cumulative.push(cumulative[i - 1] + path[i].distanceTo(path[i - 1]));
  const total = cumulative[cumulative.length - 1];
  return path.filter((_, i) => cumulative[i] >= start && cumulative[i] <= total - end);
}

/** Normal no plano apontando para dentro do tecido (contorno horário: direita da tangente). */
function inwardNormal(path: THREE.Vector2[], i: number) {
  const a = path[Math.max(0, i - 2)];
  const b = path[Math.min(path.length - 1, i + 2)];
  const tx = b.x - a.x;
  const ty = b.y - a.y;
  const length = Math.hypot(tx, ty) || 1;
  return new THREE.Vector2(ty / length, -tx / length);
}

function distanceToPath(path: THREE.Vector2[], x: number, y: number) {
  let best = Infinity;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSq));
    best = Math.min(best, Math.hypot(x - a.x - dx * t, y - a.y - dy * t));
  }
  return Number.isFinite(best) ? best : 0;
}

// ---------------------------------------------------------------------------- vento

type Wind = { reach: number; amp: number; wavelength: number; speed: number; billow: number; droop: number };

type Deformable = { geometry: THREE.BufferGeometry; base: Float32Array; dist: Float32Array };

function deformable(geometry: THREE.BufferGeometry, path: THREE.Vector2[]): Deformable {
  const position = geometry.getAttribute("position");
  const base = new Float32Array(position.count * 3);
  const dist = new Float32Array(position.count);
  for (let i = 0; i < position.count; i += 1) {
    base[i * 3] = position.getX(i);
    base[i * 3 + 1] = position.getY(i);
    base[i * 3 + 2] = position.getZ(i);
    dist[i] = distanceToPath(path, base[i * 3], base[i * 3 + 1]);
  }
  return { geometry, base, dist };
}

/** Normais de malha indexada sem alocar (roda a cada quadro enquanto a bandeira ondula). */
function refreshNormals(geometry: THREE.BufferGeometry) {
  const index = geometry.index;
  const normal = geometry.getAttribute("normal") as THREE.BufferAttribute | undefined;
  if (!index || !normal) return;
  const p = (geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
  const n = normal.array as Float32Array;
  const ids = index.array;
  n.fill(0);
  for (let f = 0; f < ids.length; f += 3) {
    const a = ids[f] * 3;
    const b = ids[f + 1] * 3;
    const c = ids[f + 2] * 3;
    const cbx = p[c] - p[b];
    const cby = p[c + 1] - p[b + 1];
    const cbz = p[c + 2] - p[b + 2];
    const abx = p[a] - p[b];
    const aby = p[a + 1] - p[b + 1];
    const abz = p[a + 2] - p[b + 2];
    const nx = cby * abz - cbz * aby;
    const ny = cbz * abx - cbx * abz;
    const nz = cbx * aby - cby * abx;
    n[a] += nx;
    n[a + 1] += ny;
    n[a + 2] += nz;
    n[b] += nx;
    n[b + 1] += ny;
    n[b + 2] += nz;
    n[c] += nx;
    n[c + 1] += ny;
    n[c + 2] += nz;
  }
  for (let i = 0; i < n.length; i += 3) {
    const length = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= length;
    n[i + 1] /= length;
    n[i + 2] /= length;
  }
  normal.needsUpdate = true;
}

/** Ondulação crescente a partir da haste, curvatura para trás (vento) e leve caída da ponta. */
function blow(item: Deformable, wind: Wind, time: number) {
  const attribute = item.geometry.getAttribute("position") as THREE.BufferAttribute;
  const out = attribute.array as Float32Array;
  const { base, dist } = item;
  const k = TAU / wind.wavelength;
  for (let i = 0; i < dist.length; i += 1) {
    const o = i * 3;
    const y = base[o + 1];
    const d = dist[i];
    const w = Math.min(1.15, d / wind.reach);
    const ripple = 0.72 * Math.sin(d * k - time * wind.speed + y * k * 0.32) + 0.28 * Math.sin(d * k * 1.9 - time * wind.speed * 1.55 - y * k * 0.5 + 1.3);
    out[o] = base[o];
    out[o + 1] = y - wind.droop * w * w;
    out[o + 2] = base[o + 2] + wind.amp * Math.pow(w, 1.3) * ripple - wind.billow * w * w;
  }
  attribute.needsUpdate = true;
  refreshNormals(item.geometry);
  item.geometry.computeBoundingSphere();
}

function useWind(items: Deformable[], wind: Wind) {
  const animate = useAnimate();
  const time = useRef(0);
  useFrame((state, delta) => {
    if (!animate) return;
    time.current += Math.min(delta, 0.1);
    for (let i = 0; i < items.length; i += 1) blow(items[i], wind, time.current);
    state.invalidate();
  });
}

// ---------------------------------------------------------------------------- malhas do tecido

/**
 * Bainha (túnel) da haste: seção em gota — redonda do lado da haste e achatada até a costura,
 * `flap` metros para dentro do tecido. As pontas afinam e fecham (a haste entra pela de baixo).
 */
function sleeveGeometry(path: THREE.Vector2[], radius: number, flap: number, taper: [number, number], radial = 16) {
  const count = path.length;
  const cumulative = [0];
  for (let i = 1; i < count; i += 1) cumulative.push(cumulative[i - 1] + path[i].distanceTo(path[i - 1]));
  const total = cumulative[count - 1];
  const positions = new Float32Array(count * (radial + 1) * 3);
  for (let i = 0; i < count; i += 1) {
    const p = path[i];
    const normal = inwardNormal(path, i);
    const s = cumulative[i];
    let k = 1;
    if (taper[0] > 0 && s < taper[0]) k = Math.sqrt(Math.max(0, 1 - (1 - s / taper[0]) ** 2));
    if (taper[1] > 0 && total - s < taper[1]) k = Math.min(k, Math.sqrt(Math.max(0, 1 - (1 - (total - s) / taper[1]) ** 2)));
    for (let j = 0; j <= radial; j += 1) {
      const a = (j / radial) * TAU;
      const c = Math.cos(a);
      const offset = (c >= 0 ? flap * c : radius * c) * k;
      const z = radius * Math.sin(a) * (c >= 0 ? 1 - 0.6 * c * c : 1) * k;
      const o = (i * (radial + 1) + j) * 3;
      positions[o] = p.x + normal.x * offset;
      positions[o + 1] = p.y + normal.y * offset;
      positions[o + 2] = z;
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < count - 1; i += 1) {
    for (let j = 0; j < radial; j += 1) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Pesponto: tubo fino paralelo à haste, tracejado pela textura (UV em passos de STITCH_PITCH). */
function stitchGeometry(path: THREE.Vector2[], offset: number, z: number) {
  const points = path.map((p, i) => {
    const normal = inwardNormal(path, i);
    return new THREE.Vector3(p.x + normal.x * offset, p.y + normal.y * offset, z);
  });
  const curve = new THREE.CatmullRomCurve3(points);
  const length = Math.max(curve.getLength(), 1e-3);
  const geometry = new THREE.TubeGeometry(curve, Math.max(8, Math.round(length / 0.015)), THREAD, 4, false);
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i += 1) uv.setX(i, (uv.getX(i) * length) / STITCH_PITCH);
  return geometry;
}

function hemGeometry(polygon: THREE.Vector2[], radius: number) {
  const ring = resampleClosed(polygon, 0.012);
  const curve = new THREE.CatmullRomCurve3(
    ring.map((p) => new THREE.Vector3(p.x, p.y, 0)),
    true,
  );
  return new THREE.TubeGeometry(curve, Math.max(32, ring.length), radius, 5, true);
}

type FlagPlan = {
  W: number;
  H: number;
  /** Contorno fechado em metros (0..W, 0..H). */
  polygon: THREE.Vector2[];
  /** Linha da haste/bainha (reamostrada): referência do vento. */
  path: THREE.Vector2[];
  /** Arte deitada (texto subindo pelo mastro, como nos wind banners de verdade). */
  vertical: boolean;
  /** Arte do verso (dupla face) deitada; a do verso decide sozinha (pode ter imagem e a da frente não). */
  backVertical: boolean;
  resolution: number;
  sleeve: { radius: number; flap: number; taper: [number, number] };
  hem: number;
  tie: { corner: THREE.Vector2; anchor: THREE.Vector3 } | null;
  wind: Omit<Wind, "reach">;
};

type FlagParts = {
  cloth: THREE.BufferGeometry;
  /** O mesmo tecido (posição, normal e índices compartilhados: ondula junto) com a UV do verso lida de trás. */
  clothBack: THREE.BufferGeometry;
  sleeve: THREE.BufferGeometry;
  stitches: THREE.BufferGeometry[];
  hem: THREE.BufferGeometry;
  tie: { cord: THREE.BufferGeometry; grommet: THREE.BufferGeometry; anchor: THREE.Vector3 } | null;
  items: Deformable[];
  wind: Wind;
  all: THREE.BufferGeometry[];
};

function buildFlag(plan: FlagPlan): FlagParts {
  const { W, H, polygon, path, sleeve: s } = plan;
  const cloth = inflatedSurface(polygon, { height: 0, resolution: plan.resolution, side: 1 });
  const position = cloth.getAttribute("position");
  const uv = cloth.getAttribute("uv");
  for (let i = 0; i < position.count; i += 1) {
    const u = position.getX(i) / W;
    const v = position.getY(i) / H;
    // Na arte deitada, o comprimento do canvas corre ao longo da haste e o topo das letras aponta para ela.
    if (plan.vertical) uv.setXY(i, v, 1 - u);
    else uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
  // Verso dupla face: visto de trás a haste fica à direita, então o u corre da ponta para a haste (texto sem
  // espelhar). Deitada, o texto sobe pela haste como na frente e o topo das letras aponta para a ponta.
  const backUv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const u = position.getX(i) / W;
    const v = position.getY(i) / H;
    backUv[i * 2] = plan.backVertical ? v : 1 - u;
    backUv[i * 2 + 1] = plan.backVertical ? u : v;
  }
  const clothBack = new THREE.BufferGeometry();
  clothBack.setIndex(cloth.getIndex());
  clothBack.setAttribute("position", position);
  clothBack.setAttribute("normal", cloth.getAttribute("normal"));
  clothBack.setAttribute("uv", new THREE.BufferAttribute(backUv, 2));

  const sleeve = sleeveGeometry(path, s.radius, s.flap, s.taper);
  // Costura no ponto em que a seção da bainha está a 72% da aba (altura = 0,478 × raio).
  const zStitch = s.radius * 0.478 + THREAD * 0.3;
  const seam = trimPath(path, s.taper[0] + 0.004, s.taper[1] + 0.004);
  const stitches = seam.length >= 2 ? [zStitch, -zStitch].map((z) => stitchGeometry(seam, s.flap * 0.72, z)) : [];
  const hem = hemGeometry(polygon, plan.hem);

  let tie: FlagParts["tie"] = null;
  if (plan.tie) {
    const centroid = polygon.reduce((acc, p) => acc.add(p), new THREE.Vector2()).divideScalar(Math.max(1, polygon.length));
    const eye = plan.tie.corner.clone().add(centroid.sub(plan.tie.corner).setLength(0.024));
    const grommet = new THREE.TorusGeometry(0.0065, 0.0022, 8, 20);
    grommet.scale(1, 1, 1.8);
    grommet.translate(eye.x, eye.y, 0);
    const anchor = plan.tie.anchor;
    const cordCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(eye.x, eye.y, 0),
      new THREE.Vector3((eye.x + anchor.x) / 2, Math.min(eye.y, anchor.y) - 0.035, 0.004),
      anchor.clone(),
    ]);
    const cord = new THREE.TubeGeometry(cordCurve, 32, 0.0022, 6, false);
    tie = { cord, grommet, anchor };
  }

  const moving = [cloth, sleeve, ...stitches, hem, ...(tie ? [tie.cord, tie.grommet] : [])];
  // Distância até a haste medida numa cópia mais grossa da linha (erro < 1 mm, ~3× mais rápido).
  const reference = resample(path, 0.03);
  const items = moving.map((geometry) => deformable(geometry, reference));
  let reach = 0.05;
  items[0].dist.forEach((d) => {
    reach = Math.max(reach, d);
  });
  const wind = { ...plan.wind, reach };
  items.forEach((item) => blow(item, wind, 0));
  // O verso não entra no vento (os atributos já são os do tecido); a esfera de recorte é a mesma, atualizada no lugar.
  clothBack.boundingSphere = cloth.boundingSphere;
  return { cloth, clothBack, sleeve, stitches, hem, tie, items, wind, all: [...moving, clothBack] };
}

/** Tracejado do pesponto (alpha) — uma textura por bandeira. */
function useStitchTexture() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 4;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 21, 4);
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    return map;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** Cor sólida válida (o fundo da arte) ou branco. */
function solidColor(color: string | undefined) {
  return color && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : "#f1f1f1";
}

/** Arte do passo "Verso" (art.back) e o aspecto do canvas dela. */
type FlagBack = { art: ArtRender; aspect: number; label: string };

/** Verso dupla face: a arte do verso no lado de trás do tecido, com o mesmo material do verso vazado. */
function FlagBackFace({ geometry, back }: { geometry: THREE.BufferGeometry; back: FlagBack }) {
  const texture = useArtTexture(back.aspect, "front", back.art, back.label);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial map={texture} roughness={0.86} emissive="#ffffff" emissiveIntensity={0.09} side={THREE.BackSide} />
    </mesh>
  );
}

/**
 * Tecido sublimado (frente nítida, verso com a arte vazada), bainhas, pesponto e elástico. Com `back` (o cliente
 * montou um verso), o lado de trás mostra essa arte em vez da frente vazada.
 */
function FlagCloth({ parts, texture, sleeveColor, threadColor, hemColor, back, printedBack = false }: { parts: FlagParts; texture: THREE.Texture; sleeveColor: string; threadColor: string; hemColor?: string; back?: FlagBack | null; printedBack?: boolean }) {
  useWind(parts.items, parts.wind);
  const stitch = useStitchTexture();
  // Bainha dobrada na cor do fundo da arte (a estampa vira junto com o tecido); cor inválida cai no branco.
  const hem = solidColor(hemColor);
  return (
    <group>
      <mesh geometry={parts.cloth}>
        <meshPhysicalMaterial map={texture} roughness={0.72} sheen={0.45} sheenRoughness={0.55} sheenColor="#ffffff" side={THREE.FrontSide} />
      </mesh>
      {back ? (
        <FlagBackFace geometry={parts.clothBack} back={back} />
      ) : printedBack ? (
        // Dupla face sem verso próprio: a mesma arte impressa atrás, legível (a UV do verso já lê de trás).
        <mesh geometry={parts.clothBack}>
          <meshPhysicalMaterial map={texture} roughness={0.72} sheen={0.45} sheenRoughness={0.55} sheenColor="#ffffff" side={THREE.BackSide} />
        </mesh>
      ) : (
        <mesh geometry={parts.cloth}>
          <meshStandardMaterial map={texture} roughness={0.86} emissive="#ffffff" emissiveIntensity={0.09} side={THREE.BackSide} />
        </mesh>
      )}
      <mesh geometry={parts.sleeve}>
        <meshPhysicalMaterial color={sleeveColor} roughness={0.88} sheen={0.6} sheenRoughness={0.6} sheenColor="#ffffff" />
      </mesh>
      {parts.stitches.map((geometry, i) => (
        <mesh key={i} geometry={geometry}>
          <meshStandardMaterial color={threadColor} map={stitch} alphaTest={0.5} roughness={0.8} />
        </mesh>
      ))}
      <mesh geometry={parts.hem}>
        <meshPhysicalMaterial color={hem} roughness={0.85} sheen={0.4} sheenRoughness={0.6} sheenColor="#ffffff" />
      </mesh>
      {parts.tie && (
        <>
          <mesh geometry={parts.tie.cord}>
            <meshStandardMaterial color="#141414" roughness={0.75} />
          </mesh>
          <mesh geometry={parts.tie.grommet}>
            <Steel />
          </mesh>
          <mesh position={[0, parts.tie.anchor.y, 0]} rotation-x={Math.PI / 2}>
            <torusGeometry args={[POLE_R + 0.0025, 0.003, 8, 24]} />
            <Plastic />
          </mesh>
        </>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------- materiais

function Aluminium() {
  return <meshStandardMaterial color="#cdd1d6" metalness={1} roughness={0.3} />;
}

function Steel() {
  return <meshStandardMaterial color="#b9bdc3" metalness={1} roughness={0.38} />;
}

function PowderCoat() {
  return <meshStandardMaterial color="#26272b" metalness={0.35} roughness={0.55} />;
}

function Plastic({ color = "#1b1c1f", roughness = 0.6 }: { color?: string; roughness?: number }) {
  return <meshStandardMaterial color={color} roughness={roughness} />;
}

function Fibreglass() {
  return <meshPhysicalMaterial color="#17181a" roughness={0.3} clearcoat={0.6} clearcoatRoughness={0.2} />;
}

// ---------------------------------------------------------------------------- bases

/** Altura do topo do eixo giratório da base em cruz. */
const CROSS_TOP = 0.2;
const BAG_R = 0.2;
const BAG_TUBE = 0.062;
const BAG_FLAT = 0.6;

/** Base em cruz: quatro pés de aço chato, cubo com eixo giratório e bolsa d'água de PVC em anel. */
function CrossBase({ position, rotationY = 0 }: { position?: Vec3; rotationY?: number }) {
  const parts = useMemo(() => {
    const legLength = 0.42;
    const leg = new THREE.ExtrudeGeometry(makeShape("rect", legLength, 0.034, 0.012), { depth: 0.01, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 6 });
    leg.rotateX(-Math.PI / 2);
    leg.translate(legLength / 2 + 0.03, 0.002, 0);
    const bag = new THREE.TorusGeometry(BAG_R, BAG_TUBE, 20, 72);
    bag.rotateX(Math.PI / 2);
    bag.scale(1, BAG_FLAT, 1);
    const seam = new THREE.TorusGeometry(BAG_R + BAG_TUBE, 0.0024, 6, 96);
    seam.rotateX(Math.PI / 2);
    return { leg, bag, seam, list: [leg, bag, seam] };
  }, []);
  useGeometriesCleanup(parts.list);
  const bagY = 0.014 + BAG_TUBE * BAG_FLAT;
  const bagTop = bagY + BAG_TUBE * BAG_FLAT;
  const valve = 0.55;
  return (
    <group position={position} rotation-y={rotationY}>
      {[0, 1, 2, 3].map((i) => {
        const angle = Math.PI / 4 + (i * Math.PI) / 2;
        return (
          <group key={i} rotation-y={angle}>
            <mesh geometry={parts.leg}>
              <PowderCoat />
            </mesh>
            <mesh position={[0.452, 0.008, 0]}>
              <cylinderGeometry args={[0.019, 0.021, 0.016, 20]} />
              <Plastic color="#111113" roughness={0.95} />
            </mesh>
          </group>
        );
      })}
      <mesh geometry={parts.bag} position-y={bagY}>
        <meshPhysicalMaterial color="#25282d" roughness={0.32} clearcoat={0.6} clearcoatRoughness={0.15} />
      </mesh>
      <mesh geometry={parts.seam} position-y={bagY}>
        <Plastic color="#1a1c20" roughness={0.5} />
      </mesh>
      <group position={[Math.sin(valve) * BAG_R, bagTop - 0.004, Math.cos(valve) * BAG_R]}>
        <mesh position-y={0.006}>
          <cylinderGeometry args={[0.018, 0.019, 0.012, 24]} />
          <Plastic color="#3a3d43" roughness={0.45} />
        </mesh>
        <mesh position-y={0.014}>
          <cylinderGeometry args={[0.012, 0.014, 0.008, 6]} />
          <Plastic color="#e8e8e8" roughness={0.4} />
        </mesh>
      </group>
      <mesh position-y={0.04}>
        <cylinderGeometry args={[0.042, 0.046, 0.05, 32]} />
        <Steel />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[Math.cos(i * (Math.PI / 2)) * 0.03, 0.068, Math.sin(i * (Math.PI / 2)) * 0.03]}>
          <cylinderGeometry args={[0.0055, 0.0055, 0.006, 6]} />
          <Steel />
        </mesh>
      ))}
      <mesh position-y={0.13}>
        <cylinderGeometry args={[0.0125, 0.0125, 0.13, 20]} />
        <Steel />
      </mesh>
      <mesh position-y={0.172}>
        <cylinderGeometry args={[0.018, 0.018, 0.045, 24]} />
        <Plastic color="#0f0f11" roughness={0.45} />
      </mesh>
    </group>
  );
}

/** Altura do topo do encaixe metálico da base redonda. */
const ROUND_TOP = 0.15;

const ROUND_PROFILE: Pt[] = [
  [0, 0],
  [0.165, 0],
  [0.18, 0.003],
  [0.185, 0.012],
  [0.185, 0.03],
  [0.18, 0.042],
  [0.165, 0.05],
  [0.13, 0.058],
  [0.09, 0.064],
  [0.06, 0.069],
  [0.05, 0.075],
  [0.047, 0.09],
  [0.046, 0.104],
  [0.042, 0.11],
  [0, 0.11],
];

/** Base redonda de 37 cm: plástico rotomoldado para encher com água, nervuras, tampa de rosca e encaixe com manípulo. */
function RoundBase({ position, rotationY = 0 }: { position?: Vec3; rotationY?: number }) {
  const parts = useMemo(() => {
    const body = lathe(smoothProfile(ROUND_PROFILE, 96), 72);
    // Nervuras concêntricas da cúpula (raio, altura sobre o perfil).
    const ribs = (
      [
        [0.172, 0.0475],
        [0.148, 0.0545],
      ] as Pt[]
    ).map(([r, y]) => {
      const rib = new THREE.TorusGeometry(r, 0.0028, 6, 96);
      rib.rotateX(Math.PI / 2);
      rib.translate(0, y, 0);
      return rib;
    });
    return { body, ribs, list: [body, ...ribs] };
  }, []);
  useGeometriesCleanup(parts.list);
  return (
    <group position={position} rotation-y={rotationY}>
      <mesh geometry={parts.body}>
        <meshPhysicalMaterial color="#1c1d20" roughness={0.62} clearcoat={0.15} clearcoatRoughness={0.6} />
      </mesh>
      {parts.ribs.map((rib, i) => (
        <mesh key={i} geometry={rib}>
          <Plastic color="#18191c" roughness={0.55} />
        </mesh>
      ))}
      {/* Tampa de rosca do enchimento, inclinada com a cúpula. */}
      <group rotation-y={0.55}>
        <group position={[0, 0.062, 0.105]} rotation-x={0.15}>
          <mesh position-y={0.007}>
            <cylinderGeometry args={[0.024, 0.025, 0.014, 32]} />
            <Plastic color="#2c2f34" roughness={0.5} />
          </mesh>
          <mesh position-y={0.012} rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.0245, 0.0018, 6, 32]} />
            <Plastic color="#24262a" roughness={0.6} />
          </mesh>
          <mesh position-y={0.0145}>
            <boxGeometry args={[0.03, 0.004, 0.006]} />
            <Plastic color="#2c2f34" roughness={0.5} />
          </mesh>
        </group>
      </group>
      <mesh position-y={0.125}>
        <cylinderGeometry args={[0.02, 0.021, 0.05, 28]} />
        <Steel />
      </mesh>
      <mesh position={[0.026, 0.132, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.003, 0.003, 0.016, 10]} />
        <Steel />
      </mesh>
      <mesh position={[0.037, 0.132, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.009, 0.009, 0.01, 8]} />
        <Plastic color="#101012" roughness={0.5} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------- hastes soltas

function springGeometry(radius: number, wire: number, length: number, turns: number) {
  const steps = turns * 24;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const a = t * turns * TAU;
    points.push(new THREE.Vector3(-length / 2 + length * t, Math.cos(a) * radius, Math.sin(a) * radius));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), steps, wire, 6, false);
}

function Section({ length, radius, kind, position }: { length: number; radius: number; kind: "alu" | "glass"; position: Vec3 }) {
  return (
    <group position={position} rotation-z={Math.PI / 2}>
      <mesh>
        <cylinderGeometry args={[radius, radius, length, 24]} />
        {kind === "alu" ? <Aluminium /> : <Fibreglass />}
      </mesh>
      {kind === "alu" ? (
        <>
          <mesh position-y={length / 2 + 0.035}>
            <cylinderGeometry args={[radius * 0.8, radius * 0.8, 0.07, 20]} />
            <Aluminium />
          </mesh>
          <mesh position-y={length / 2 + 0.002}>
            <cylinderGeometry args={[radius * 1.02, radius * 0.86, 0.008, 20]} />
            <Aluminium />
          </mesh>
          <mesh position-y={-length / 2 - 0.004}>
            <cylinderGeometry args={[radius * 1.12, radius * 1.12, 0.014, 20]} />
            <Plastic color="#111113" roughness={0.8} />
          </mesh>
        </>
      ) : (
        <>
          <mesh position-y={length / 2}>
            <sphereGeometry args={[radius * 1.25, 16, 12]} />
            <Plastic color="#0d0d0f" roughness={0.9} />
          </mesh>
          <mesh position-y={-length / 2 + 0.025}>
            <cylinderGeometry args={[radius * 1.3, radius * 1.3, 0.05, 20]} />
            <Aluminium />
          </mesh>
        </>
      )}
    </group>
  );
}

/** Jogo de hastes deitado lado a lado: dois tubos de alumínio com luva, a ponta de fibra flexível e o eixo com mola. */
function PoleSet({ lengthCm, diameterCm, position, rotationY = 0 }: { lengthCm: number; diameterCm: number; position?: Vec3; rotationY?: number }) {
  const L = clamp(lengthCm, 60, 160) * CM;
  // O catálogo arredonda a bitola para "0,01 m"; tubo de wind banner de 3 m tem no mínimo ~16 mm.
  const r = clamp(diameterCm, 1.6, 3) * CM * 0.5;
  const coil = r * 0.9 + 0.0035;
  const spring = useMemo(() => springGeometry(coil, 0.0017, 0.09, 9), [coil]);
  const springs = useMemo(() => [spring], [spring]);
  useGeometriesCleanup(springs);
  const gap = Math.max(0.045, r * 5);
  return (
    <group position={position} rotation-y={rotationY}>
      <Section length={L} radius={r} kind="alu" position={[0, r * 1.12, 0]} />
      <Section length={L} radius={r} kind="alu" position={[0.05, r * 1.12, gap]} />
      <Section length={L * 1.05} radius={r * 0.72} kind="glass" position={[-0.02, r * 0.94, gap * 2]} />
      <group position={[L * 0.18, coil + 0.0017, gap * 3]}>
        <mesh rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[r * 0.9, r * 0.9, 0.22, 20]} />
          <Steel />
        </mesh>
        <mesh geometry={spring}>
          <Steel />
        </mesh>
        {[-0.05, 0.05].map((x) => (
          <mesh key={x} position-x={x} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[coil + 0.002, coil + 0.002, 0.008, 20]} />
            <Steel />
          </mesh>
        ))}
        <mesh position-x={-0.115} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[r * 1.15, r * 1.15, 0.016, 20]} />
          <Plastic color="#0f0f11" roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- wind banner montado

type BannerProps = {
  style: FlagStyle;
  /** Altura do tecido em cm: escolhe o gabarito grande ou o pequeno. */
  heightCm: number;
  art: ArtRender;
  label: string;
  /** Base da montagem; null = só a bandeira ("Somente Bandeira"): o tecido com a bainha, sem haste nem base. */
  base: "cross" | "round" | null;
  sleeveColor: string;
  position?: Vec3;
  rotationY?: number;
};

/**
 * Wind banner: o tecido no contorno do gabarito, impresso dos dois lados (o verso lê de trás, com a arte do passo
 * "Verso" quando houver), a bainha acompanhando a curva da fibra e, montado, a haste de alumínio na base.
 */
function WindBanner({ style, heightCm, art, label, base, sleeveColor, position, rotationY = 0 }: BannerProps) {
  const outline = useMemo(() => outlineOf(style, heightCm), [style, heightCm]);
  const W = outline.widthCm * CM;
  const H = outline.heightCm * CM;
  const vertical = !art.src && H / W > 1.8;
  const texture = useArtTexture(vertical ? H / W : W / H, "front", art, label);
  const backArt = useMemo(() => backArtOf(art), [art]);
  // Sem verso próprio vale o mesmo da frente (a malha não é refeita à toa).
  const backVertical = !(backArt ?? art).src && H / W > 1.8;
  const back = backArt ? { art: backArt, aspect: backVertical ? H / W : W / H, label } : null;
  const mounted = base !== null;
  const parts = useMemo(() => {
    const polygon = outlinePoints(outline, W, H);
    const path = resample(outlinePoints(outline, W, H, true), 0.012);
    return buildFlag({
      W,
      H,
      polygon,
      path,
      vertical,
      backVertical,
      resolution: 110,
      sleeve: { radius: 0.014, flap: 0.045, taper: [0.012, 0.03] },
      hem: 0.0028,
      tie: outline.tie && mounted ? { corner: new THREE.Vector2(outline.tie[0] * W, outline.tie[1] * H), anchor: new THREE.Vector3(POLE_R + 0.002, -0.1, 0) } : null,
      // Sem a haste o tecido fica quase parado, só com o caimento.
      wind: { amp: (mounted ? 0.07 : 0.025) * W, wavelength: Math.max(0.45, W * 0.95), speed: 2.1, billow: (mounted ? 0.07 : 0.02) * W, droop: 0 },
    });
  }, [outline, W, H, vertical, backVertical, mounted]);
  useGeometriesCleanup(parts.all);
  const baseTop = base === "round" ? ROUND_TOP : CROSS_TOP;
  const clothY = mounted ? baseTop + 0.32 : 0;
  const low = baseTop - 0.04;
  const high = clothY + 0.08;
  return (
    <group position={position} rotation-y={rotationY}>
      {base === "round" && <RoundBase />}
      {base === "cross" && <CrossBase />}
      {mounted && (
        <>
          <mesh position-y={(low + high) / 2}>
            <cylinderGeometry args={[POLE_R, POLE_R, high - low, 20]} />
            <Aluminium />
          </mesh>
          <mesh position-y={baseTop + 0.13}>
            <cylinderGeometry args={[POLE_R * 1.2, POLE_R * 1.2, 0.03, 20]} />
            <Aluminium />
          </mesh>
        </>
      )}
      <group position-y={clothY}>
        <FlagCloth parts={parts} texture={texture} sleeveColor={sleeveColor} threadColor="#d9d9d9" hemColor={art.background} back={back} printedBack />
      </group>
    </group>
  );
}

/** A variação vende só o tecido ("Somente Bandeira"): sem haste nem base no 3D. */
function onlyFabric(spec: ModelProps["spec"]) {
  return /\bsomente bandeira\b/.test(spec.details ?? "");
}

function WindBannerModel({ spec, art, label }: ModelProps) {
  // Kit completo: base em cruz com bolsa d'água; o retangular "Completo para Piso" vai na base redonda, como na foto.
  const base = onlyFabric(spec) ? null : spec.flagStyle === "rect" ? "round" : "cross";
  return (
    <group rotation-y={-0.3}>
      <WindBanner style={spec.flagStyle} heightCm={spec.heightCm} art={art} label={label} base={base} sleeveColor={spec.accentColor ?? SLEEVE_COLOR} />
    </group>
  );
}

// ---------------------------------------------------------------------------- bandeira de mão

function hoistPlan(W: number, H: number, options: Pick<FlagPlan, "resolution" | "sleeve" | "hem" | "wind">): FlagPlan {
  return {
    W,
    H,
    polygon: [new THREE.Vector2(0, 0), new THREE.Vector2(0, H), new THREE.Vector2(W, H), new THREE.Vector2(W, 0)],
    path: resample([new THREE.Vector2(0, 0), new THREE.Vector2(0, H)], 0.015),
    vertical: false,
    backVertical: false,
    tie: null,
    ...options,
  };
}

/** Mastro de mão: tubo de alumínio Ø 22 mm que passa pela luva e sobra embaixo para segurar. */
const HAND_POLE = { r: 0.011, grip: 0.55, top: 0.05 };

/**
 * Bandeira de mão, como na foto do produto: tafetá sublimado com a luva (na cor do fundo da arte) vestindo um mastro
 * de alumínio levemente inclinado, com o pomo cromado em cima e a ponteira de borracha embaixo, sem pedestal.
 */
function HandFlagModel({ spec, art, label }: ModelProps) {
  const W = clamp(spec.widthCm, 20, 400) * CM;
  const H = clamp(spec.heightCm, 15, 300) * CM;
  const texture = useArtTexture(W / H, "front", art, label);
  const backArt = useMemo(() => backArtOf(art), [art]);
  const back = backArt ? { art: backArt, aspect: W / H, label } : null;
  const parts = useMemo(
    () =>
      buildFlag(
        hoistPlan(W, H, {
          resolution: 84,
          sleeve: { radius: HAND_POLE.r + 0.0025, flap: 0.045, taper: [0.006, 0.006] },
          hem: 0.0028,
          wind: { amp: 0.07 * Math.min(1, H), wavelength: Math.max(0.4, W * 0.55), speed: 2.6, billow: 0.012 * W, droop: 0.045 * H },
        }),
      ),
    [W, H],
  );
  useGeometriesCleanup(parts.all);
  const poleH = HAND_POLE.grip + H + HAND_POLE.top;
  const sleeve = solidColor(art.background);
  return (
    <group rotation-y={-0.25}>
      <group rotation-z={0.1}>
        <mesh position-y={poleH / 2}>
          <cylinderGeometry args={[HAND_POLE.r, HAND_POLE.r, poleH, 24]} />
          <meshStandardMaterial color="#d9dce0" metalness={1} roughness={0.26} />
        </mesh>
        <mesh position-y={0.018}>
          <cylinderGeometry args={[HAND_POLE.r * 1.25, HAND_POLE.r * 1.15, 0.036, 20]} />
          <Plastic color="#141416" roughness={0.85} />
        </mesh>
        <mesh position-y={poleH + 0.008}>
          <cylinderGeometry args={[0.006, HAND_POLE.r, 0.016, 20]} />
          <meshStandardMaterial color="#e6e8eb" metalness={1} roughness={0.18} />
        </mesh>
        <mesh position-y={poleH + 0.034}>
          <sphereGeometry args={[0.024, 28, 20]} />
          <meshStandardMaterial color="#e6e8eb" metalness={1} roughness={0.14} />
        </mesh>
        <group position-y={HAND_POLE.grip}>
          <FlagCloth parts={parts} texture={texture} sleeveColor={sleeve} threadColor="#cfcabd" hemColor={art.background} back={back} />
        </group>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- bandeira de carro

/**
 * Bandeira de carro como na foto do produto: o tafetá com a bolsa do mastro (na cor do fundo da arte) numa haste de
 * plástico preto, que encaixa na presilha preta do vidro (U invertido que abraça a borda do vidro).
 */
function CarFlagModel({ spec, art, label }: ModelProps) {
  const W = clamp(spec.widthCm, 15, 80) * CM;
  const H = clamp(spec.heightCm, 10, 60) * CM;
  const texture = useArtTexture(W / H, "front", art, label);
  const backArt = useMemo(() => backArtOf(art), [art]);
  const back = backArt ? { art: backArt, aspect: W / H, label } : null;
  const parts = useMemo(
    () =>
      buildFlag(
        hoistPlan(W, H, {
          resolution: 64,
          sleeve: { radius: 0.0075, flap: 0.022, taper: [0.004, 0.006] },
          hem: 0.0018,
          wind: { amp: 0.07 * W, wavelength: Math.max(0.12, W * 0.45), speed: 8, billow: 0.03 * W, droop: 0.03 * H },
        }),
      ),
    [W, H],
  );
  useGeometriesCleanup(parts.all);

  const clip = useMemo(() => {
    // Presilha em U invertido: as pernas descem dos dois lados do vidro.
    const shape = new THREE.Shape();
    shape.moveTo(-0.011, -0.04);
    shape.lineTo(-0.0035, -0.04);
    shape.lineTo(-0.0035, 0);
    shape.lineTo(0.0035, 0);
    shape.lineTo(0.0035, -0.04);
    shape.lineTo(0.011, -0.04);
    shape.lineTo(0.011, 0.01);
    shape.quadraticCurveTo(0.011, 0.014, 0.007, 0.014);
    shape.lineTo(-0.007, 0.014);
    shape.quadraticCurveTo(-0.011, 0.014, -0.011, 0.01);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0012, bevelSegments: 2, curveSegments: 6 });
    geometry.translate(0, 0, -0.0175);
    geometry.rotateY(Math.PI / 2);
    return geometry;
  }, []);
  const clips = useMemo(() => [clip], [clip]);
  useGeometriesCleanup(clips);

  const tilt = 0.1;
  const poleLength = H + 0.2;
  const sleeve = solidColor(art.background);
  return (
    <group rotation-y={-0.25} userData={{ view: { elevation: 0.16 } }}>
      <mesh geometry={clip}>
        <Plastic color="#151517" roughness={0.45} />
      </mesh>
      {/* Soquete encostado na perna externa da presilha (face externa em z = 0,011). */}
      <group position={[0, -0.035, 0.0195]} rotation-z={-tilt}>
        <mesh position-y={0.02}>
          <cylinderGeometry args={[0.0085, 0.0085, 0.05, 20]} />
          <Plastic color="#151517" roughness={0.45} />
        </mesh>
        <mesh position-y={0.01 + poleLength / 2}>
          <cylinderGeometry args={[0.0055, 0.0055, poleLength, 16]} />
          <Plastic color="#18191b" roughness={0.4} />
        </mesh>
        <mesh position-y={0.01 + poleLength}>
          <sphereGeometry args={[0.008, 16, 12]} />
          <Plastic color="#18191b" roughness={0.4} />
        </mesh>
        <group position-y={0.12}>
          <FlagCloth parts={parts} texture={texture} sleeveColor={sleeve} threadColor="#d0d0d0" hemColor={art.background} back={back} />
        </group>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- wind ball

/** Gomos da wind ball (gabarito "windball": 4 gomos iguais, todos com a mesma arte). */
const BALL_GORES = 4;
/** Expoente da seção: faces mais retas que uma esfera, cantos arredondados nas costuras. */
const BALL_SQUARE = 3.6;
/** Espessura (frente–verso) em fração da largura: o disco achatado da foto do produto. */
const BALL_DEPTH = 0.5;

/**
 * Um gomo: a seção horizontal é um quadrado de cantos arredondados (superelipse) com uma face por gomo, achatada
 * de frente para trás (disco), e o perfil vertical é redondo. A UV corta a arte como o recorte em lente do gabarito: largura cheia no meio, afinando nos polos.
 */
function goreGeometry(R: number, index: number) {
  const across = 28;
  const down = 40;
  const span = (Math.PI * 2) / BALL_GORES;
  const center = index * span;
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let j = 0; j <= down; j += 1) {
    const theta = 0.03 + (j / down) * (Math.PI - 0.06);
    const ring = Math.sin(theta);
    for (let i = 0; i <= across; i += 1) {
      const local = (i / across - 0.5) * span;
      const phi = center + local;
      const c = Math.cos(local);
      const s = Math.sin(local);
      const r = R / Math.pow(Math.pow(Math.abs(c), BALL_SQUARE) + Math.pow(Math.abs(s), BALL_SQUARE), 1 / BALL_SQUARE);
      positions.push(r * ring * Math.sin(phi), R * Math.cos(theta), r * ring * Math.cos(phi) * BALL_DEPTH);
      uvs.push(0.5 + (local / span) * ring, 1 - theta / Math.PI);
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < down; j += 1) {
    for (let i = 0; i < across; i += 1) {
      const a = j * (across + 1) + i;
      const b = a + across + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Costura entre dois gomos: tubo fino ao longo do meridiano do canto. */
function seamGeometry(R: number, phi: number) {
  const points: THREE.Vector3[] = [];
  const corner = R / Math.pow(2 * Math.pow(Math.SQRT1_2, BALL_SQUARE), 1 / BALL_SQUARE);
  for (let j = 0; j <= 48; j += 1) {
    const theta = 0.03 + (j / 48) * (Math.PI - 0.06);
    points.push(new THREE.Vector3(corner * Math.sin(theta) * Math.sin(phi), R * Math.cos(theta), corner * Math.sin(theta) * Math.cos(phi) * BALL_DEPTH));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, 0.004, 6, false);
}

/** Base cônica cromada da foto do produto. */
const BALL_BASE: Pt[] = [
  [0, 0],
  [0.23, 0],
  [0.236, 0.006],
  [0.232, 0.016],
  [0.17, 0.045],
  [0.09, 0.075],
  [0.05, 0.09],
  [0.032, 0.1],
  [0.028, 0.13],
  [0, 0.13],
];

/** Gomo de trás com a arte do passo "Verso" (a UV dele já lê de trás). */
function GoreBack({ geometry, art, label }: { geometry: THREE.BufferGeometry; art: ArtRender; label: string }) {
  const texture = useArtTexture(1, "front", art, label);
  return (
    <mesh geometry={geometry}>
      <meshPhysicalMaterial map={texture} roughness={0.6} sheen={0.6} sheenRoughness={0.5} sheenColor="#ffffff" />
    </mesh>
  );
}

/**
 * Wind ball como na foto do produto: disco achatado de quatro gomos de helanca costurados (a mesma arte em todos;
 * o de trás leva o verso quando há), com os cubos pretos nos polos, num mastro de alumínio sobre a base cônica
 * cromada. "Somente Bandeira" mostra só a bola.
 */
function WindBallModel({ spec, art, label }: ModelProps) {
  // Formato "1,0 × 3,0 m": largura da bola × altura montada.
  const D = clamp(spec.widthCm, 30, 150) * CM;
  const R = D / 2;
  const mounted = !onlyFabric(spec);
  const total = Math.max(clamp(spec.heightCm, 60, 400) * CM, D * 1.8);
  const center = mounted ? total - R - 0.08 : R + 0.03;
  const texture = useArtTexture(1, "front", art, label);
  const backArt = useMemo(() => backArtOf(art), [art]);
  const ball = useMemo(() => {
    const gores = Array.from({ length: BALL_GORES }, (_, i) => goreGeometry(R, i));
    const seams = Array.from({ length: BALL_GORES }, (_, i) => seamGeometry(R, (i + 0.5) * ((Math.PI * 2) / BALL_GORES)));
    const base = lathe(smoothProfile(BALL_BASE, 64), 64);
    return { gores, seams, base, list: [...gores, ...seams, base] };
  }, [R]);
  useGeometriesCleanup(ball.list);
  const low = 0.1;
  return (
    <group rotation-y={-0.2}>
      {mounted && (
        <>
          <mesh geometry={ball.base}>
            <meshStandardMaterial color="#d7dadf" metalness={1} roughness={0.16} />
          </mesh>
          <mesh position-y={(low + center) / 2}>
            <cylinderGeometry args={[POLE_R, POLE_R, center - low, 20]} />
            <Aluminium />
          </mesh>
        </>
      )}
      <group position-y={center}>
        {ball.gores.map((geometry, i) =>
          i === 2 && backArt ? (
            <GoreBack key={i} geometry={geometry} art={backArt} label={label} />
          ) : (
            <mesh key={i} geometry={geometry}>
              <meshPhysicalMaterial map={texture} roughness={0.6} sheen={0.6} sheenRoughness={0.5} sheenColor="#ffffff" />
            </mesh>
          ),
        )}
        {ball.seams.map((geometry, i) => (
          <mesh key={i} geometry={geometry}>
            <meshStandardMaterial color={solidColor(art.background)} roughness={0.8} />
          </mesh>
        ))}
        {[1, -1].map((side) => (
          <mesh key={side} position-y={side * (R - 0.006)}>
            <cylinderGeometry args={[0.028, 0.032, 0.03, 24]} />
            <Plastic color="#151517" roughness={0.45} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- exports

/**
 * Bandeiras sublimadas. Wind banners (pena, faca, gota, vela, retangular): tecido no contorno do gabarito, impresso
 * dos dois lados, bainha preta seguindo a curva da haste de fibra, pesponto, elástico no canto e, no kit completo, a
 * base; "Somente Bandeira" mostra só o tecido. "Bandeira" (paisagem) é a de mão, no mastro sem pedestal; {car} na
 * haste preta com a presilha de vidro; {ball} é a wind ball de quatro gomos. O tecido ondula ao vento quando a
 * animação está liberada.
 */
export function FlagModel(props: ModelProps) {
  const { spec } = props;
  if (spec.variant === "ball") return <WindBallModel {...props} />;
  if (spec.variant === "car") return <CarFlagModel {...props} />;
  if (spec.flagStyle === "rect" && spec.widthCm >= spec.heightCm) return <HandFlagModel {...props} />;
  return <WindBannerModel {...props} />;
}

/**
 * Base e haste vendidas sem bandeira: a peça avulsa em destaque na frente, em escala real e com detalhe
 * (base redonda de 37 cm, base em cruz com bolsa d'água ou o jogo de hastes deitado com a mola), e atrás um
 * wind banner montado com a arte do cliente como simulação.
 */
export function HardwareModel({ spec, art }: ModelProps) {
  const style: FlagStyle = spec.flagStyle === "rect" ? "pena" : spec.flagStyle;
  const sleeve = spec.accentColor ?? SLEEVE_COLOR;
  // Câmera um pouco mais alta: as peças avulsas no chão, em primeiro plano, aparecem inteiras.
  const view = { view: { elevation: 0.38 } };
  if (spec.variant === "round-base") {
    return (
      <group rotation-y={-0.25} userData={view}>
        <WindBanner style={style} heightCm={145} art={art} label={formatSize(73, 145)} base="round" sleeveColor={sleeve} position={[-0.3, 0, -0.42]} />
        <RoundBase position={[0.34, 0, 0.3]} rotationY={-0.5} />
      </group>
    );
  }
  if (spec.variant === "pole") {
    return (
      <group rotation-y={-0.2} userData={view}>
        <WindBanner style={style} heightCm={230} art={art} label={formatSize(73.5, 230)} base="cross" sleeveColor={sleeve} position={[-0.25, 0, -0.5]} />
        <PoleSet lengthCm={spec.heightCm} diameterCm={spec.widthCm} position={[0.05, 0, 0.42]} rotationY={0.06} />
      </group>
    );
  }
  return (
    <group rotation-y={-0.2} userData={view}>
      <WindBanner style={style} heightCm={230} art={art} label={formatSize(73.5, 230)} base="cross" sleeveColor={sleeve} position={[-0.45, 0, -0.6]} />
      <CrossBase position={[0.58, 0, 0.22]} rotationY={0.2} />
      <PoleSet lengthCm={110} diameterCm={2.1} position={[-0.2, 0, 0.92]} rotationY={0.06} />
    </group>
  );
}
