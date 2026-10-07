// Busto de vitrine paramétrico (cm): tronco com ombros e pescoço, braços e base com haste.
// O tronco é um "loft" de seções horizontais (superelipses com frente e costas de profundidades
// diferentes), interpoladas sem ondular (PCHIP) entre marcos do corpo. A tabela polar r(φ, y) do
// tronco é o que a camiseta usa para vestir o corpo (garment.ts).
// TS puro (three só para a geometria): roda nos testes do node.

import * as THREE from "three";
import type { MannequinBody } from "../../../product/art-editor/mannequin.ts";

const TAU = Math.PI * 2;

/** Seção horizontal do tronco: superelipse (expoente n) com frente (bf) e costas (bb) diferentes. */
export type Ring = { a: number; bf: number; bb: number; cz: number; n: number };

/** Alturas (cm) a partir do ponto alto do ombro (y = 0, de onde se mede a camiseta). */
export type Landmarks = {
  neckTop: number;
  neck: number;
  hps: number;
  trap: number;
  acromion: number;
  deltoid: number;
  axilla: number;
  chest: number;
  ribs: number;
  waist: number;
  belly: number;
  hip: number;
  bottom: number;
};

export type ArmModel = {
  /** Centro da articulação do ombro (lado +x). */
  joint: THREE.Vector3;
  /** Direção do braço (unitária), do ombro para a mão (lado +x). */
  dir: THREE.Vector3;
  /** Raio do braço a `s` cm da articulação. */
  radius: (s: number) => number;
  /** Distâncias do cotovelo e do punho até a articulação. */
  elbow: number;
  wrist: number;
};

export type PolarTable = { y0: number; dy: number; rows: number; cols: number; data: Float32Array };

export type BodyModel = {
  body: MannequinBody;
  /** Escala vertical (altura / 175 cm). */
  hs: number;
  y: Landmarks;
  ring: (y: number) => Ring;
  /** Raio polar do tronco no ângulo φ (0 = frente, π/2 = lado +x) e altura y, em volta do eixo x = z = 0. */
  radius: (phi: number, y: number) => number;
  table: PolarTable;
  neckRadius: number;
  /** Meia largura no acrômio (ponta do ombro). */
  shoulderHalf: number;
  arm: ArmModel;
};

// ---------------------------------------------------------------------------- utilidades

export function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Interpolação cúbica monótona (Fritsch–Carlson): passa pelos marcos sem ondular entre eles. */
export function pchip(xs: readonly number[], ys: readonly number[]): (x: number) => number {
  const n = xs.length;
  const h: number[] = [];
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    h.push(xs[i + 1] - xs[i]);
    delta.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  }
  const m: number[] = new Array(n).fill(0);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i += 1) {
    if (delta[i - 1] * delta[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid;
      else hi = mid;
    }
    const t = (x - xs[lo]) / h[lo];
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h[lo] * m[lo] + (-2 * t3 + 3 * t2) * ys[lo + 1] + (t3 - t2) * h[lo] * m[lo + 1];
  };
}

/** Ponto da superelipse no parâmetro t (0 = frente, π/2 = lado +x). */
export function ringPoint(r: Ring, t: number): [number, number] {
  const s = Math.sin(t);
  const c = Math.cos(t);
  const e = 2 / r.n;
  const x = r.a * Math.sign(s) * Math.abs(s) ** e;
  const z = r.cz + (c >= 0 ? r.bf : r.bb) * Math.sign(c) * Math.abs(c) ** e;
  return [x, z];
}

/** Perímetro da seção (cm), por amostragem. */
export function ringPerimeter(r: Ring, steps = 256): number {
  let sum = 0;
  let [px, pz] = ringPoint(r, 0);
  for (let i = 1; i <= steps; i += 1) {
    const [x, z] = ringPoint(r, (i / steps) * TAU);
    sum += Math.hypot(x - px, z - pz);
    px = x;
    pz = z;
  }
  return sum;
}

/** Seção com o formato `shape` (proporções) escalada para ter a circunferência pedida. */
function ringWithGirth(shape: Omit<Ring, "cz">, girth: number, cz = 0): Ring {
  const p = ringPerimeter({ ...shape, cz: 0 });
  const k = girth / p;
  return { a: shape.a * k, bf: shape.bf * k, bb: shape.bb * k, n: shape.n, cz };
}

// ---------------------------------------------------------------------------- corpo

type Key = Ring & { y: number };

/** Pescoço por tipo de corpo (circunferência adulta, cm). */
const NECK_GIRTH = { magro: 36, medio: 38.5, cheio: 42.5 } as const;
/** Fator da largura dos ombros e dos braços por tipo de corpo. */
const BUILD = { magro: { shoulder: 0.965, arm: 0.9 }, medio: { shoulder: 1, arm: 1 }, cheio: { shoulder: 1.05, arm: 1.16 } } as const;

/** Marcos verticais (cm a partir do ponto alto do ombro) de um adulto de 175 cm, escalados pela altura. */
export function landmarks(hs: number): Landmarks {
  return {
    neckTop: 9 * hs,
    neck: 3.2 * hs,
    hps: 0,
    trap: -2.5 * hs,
    acromion: -5.4 * hs,
    deltoid: -10.5 * hs,
    axilla: -18.5 * hs,
    chest: -24.5 * hs,
    ribs: -33 * hs,
    waist: -44 * hs,
    belly: -51.5 * hs,
    hip: -61 * hs,
    bottom: -81 * hs,
  };
}

export type BodyOptions = {
  /** Com braços (peças com manga) ou busto de ombro liso, sem braços (regata, abadá, colete). */
  arms?: boolean;
  /** Afastamento do braço em relação ao corpo (graus). */
  abduction?: number;
};

/** Busto do manequim nas medidas do corpo (tórax, cintura, quadril) e na altura dele. */
export function bodyModel(body: MannequinBody, options: BodyOptions = {}): BodyModel {
  const arms = options.arms ?? true;
  const hs = body.heightCm / 175;
  const y = landmarks(hs);
  const build = BUILD[body.body];
  // Criança: pescoço e ombros acompanham o tórax.
  const girthScale = body.kid ? Math.sqrt(body.chest / 96) * (0.75 + 0.25 * hs) : 1;
  const neckGirth = NECK_GIRTH[body.body] * (body.kid ? girthScale * 0.92 : 1);
  const neckR = neckGirth / TAU;
  const shoulderHalf = 20.4 * hs * build.shoulder * (body.kid ? Math.min(1.1, Math.max(0.9, body.chest / (96 * hs * 0.92))) : 1);
  const deltoidHalf = shoulderHalf + 2.9 * hs * build.arm;

  const chest = ringWithGirth({ a: 1, bf: 0.66, bb: 0.6, n: 2.5 }, body.chest, 0.4);
  const ribs = ringWithGirth({ a: 0.98, bf: 0.66, bb: 0.6, n: 2.4 }, lerp(body.chest, body.waist, 0.45), 0.3);
  // Mais cheio: barriga para a frente (a cintura cresce mais na frente que atrás).
  const bellyFront = body.body === "cheio" ? 0.9 : body.body === "medio" ? 0.74 : 0.68;
  const waist = ringWithGirth({ a: 1, bf: bellyFront, bb: 0.63, n: 2.3 }, body.waist, 0);
  const belly = ringWithGirth({ a: 1, bf: bellyFront * 1.04, bb: 0.68, n: 2.3 }, lerp(body.waist, body.hip, 0.45), -0.2);
  const hip = ringWithGirth({ a: 1, bf: 0.6, bb: 0.74, n: 2.4 }, body.hip, -0.6);
  const bottom = ringWithGirth({ a: 1, bf: 0.6, bb: 0.68, n: 2.2 }, body.hip * 0.95, -0.5);
  const axilla: Ring = { a: chest.a * 1.04, bf: chest.bf * 0.97, bb: chest.bb * 1.04, cz: 0.2, n: 2.6 };
  // Sem braços: ombro arredondado de busto de costura (sem o volume do deltoide).
  const deltoid: Ring = arms
    ? { a: deltoidHalf, bf: chest.bf * 0.86, bb: chest.bb * 0.92, cz: -0.3, n: 3.1 }
    : { a: shoulderHalf + 0.4 * hs, bf: chest.bf * 0.84, bb: chest.bb * 0.92, cz: -0.3, n: 2.75 };
  const acromion: Ring = arms
    ? { a: shoulderHalf, bf: chest.bf * 0.6, bb: chest.bb * 0.74, cz: -0.9, n: 3.4 }
    : { a: shoulderHalf - 1.1 * hs, bf: chest.bf * 0.58, bb: chest.bb * 0.72, cz: -0.9, n: 2.9 };
  const trap: Ring = { a: lerp(neckR * 1.3, shoulderHalf, 0.52), bf: neckR * 0.95, bb: neckR * 1.12, cz: -1.3, n: 2.7 };
  const hps: Ring = { a: neckR * 1.24, bf: neckR * 1.04, bb: neckR * 1.1, cz: -1.6, n: 2.15 };
  const neck: Ring = { a: neckR * 1.02, bf: neckR, bb: neckR * 0.98, cz: -1.5, n: 2 };
  const neckTop: Ring = { a: neckR * 0.98, bf: neckR * 0.96, bb: neckR * 0.96, cz: -0.7, n: 2 };

  const keys: Key[] = [
    { y: y.bottom, ...bottom },
    { y: y.hip, ...hip },
    { y: y.belly, ...belly },
    { y: y.waist, ...waist },
    { y: y.ribs, ...ribs },
    { y: y.chest, ...chest },
    { y: y.axilla, ...axilla },
    { y: y.deltoid, ...deltoid },
    { y: y.acromion, ...acromion },
    { y: y.trap, ...trap },
    { y: y.hps, ...hps },
    { y: y.neck, ...neck },
    { y: y.neckTop, ...neckTop },
  ];
  const ys = keys.map((k) => k.y);
  const fa = pchip(ys, keys.map((k) => k.a));
  const fbf = pchip(ys, keys.map((k) => k.bf));
  const fbb = pchip(ys, keys.map((k) => k.bb));
  const fcz = pchip(ys, keys.map((k) => k.cz));
  const fn = pchip(ys, keys.map((k) => k.n));
  const ring = (yy: number): Ring => ({ a: fa(yy), bf: fbf(yy), bb: fbb(yy), cz: fcz(yy), n: fn(yy) });

  const table = polarTable(ring, y.bottom, y.neckTop, 0.25, 256);
  const radius = (phi: number, yy: number) => samplePolar(table, phi, yy);

  // Braço: pende do ombro afastado do corpo (21° por padrão) e um pouco para a frente.
  const abduction = THREE.MathUtils.degToRad(options.abduction ?? 21);
  const dir = new THREE.Vector3(Math.sin(abduction), -Math.cos(abduction), 0.07).normalize();
  const joint = new THREE.Vector3(shoulderHalf - 3.4 * hs * build.arm, y.deltoid + 0.2 * hs, -0.6 * hs);
  const armScale = hs * build.arm * (body.kid ? 0.9 : 1);
  const armS = [-6, 0, 6, 14, 22, 28.5, 34, 44, 52, 56].map((s) => s * hs);
  const armR = [5.7, 5.6, 5.25, 4.85, 4.4, 3.95, 4.15, 3.55, 2.9, 2.75].map((r) => r * armScale);
  const radiusArm = pchip(armS, armR);

  return {
    body,
    hs,
    y,
    ring,
    radius,
    table,
    neckRadius: neckR,
    shoulderHalf,
    arm: { joint, dir, radius: radiusArm, elbow: 28.5 * hs, wrist: 54 * hs },
  };
}

// ---------------------------------------------------------------------------- tabela polar

/** Tabela r(φ, y): para cada altura, o raio da seção em `cols` ângulos uniformes (0 = frente). */
export function polarTable(ring: (y: number) => Ring, y0: number, y1: number, dy: number, cols: number): PolarTable {
  const rows = Math.ceil((y1 - y0) / dy) + 1;
  const data = new Float32Array(rows * cols);
  const steps = 720;
  const phis = new Float64Array(steps + 1);
  const rhos = new Float64Array(steps + 1);
  for (let i = 0; i < rows; i += 1) {
    const r = ring(Math.min(y1, y0 + i * dy));
    // A seção é estrelada em volta do eixo: φ cresce com t; reamostra em φ uniforme.
    for (let k = 0; k <= steps; k += 1) {
      const [x, z] = ringPoint(r, (k / steps) * TAU);
      let phi = Math.atan2(x, z);
      if (phi < 0) phi += TAU;
      if (k === steps) phi = TAU;
      else if (k === 0) phi = 0;
      phis[k] = phi;
      rhos[k] = Math.hypot(x, z);
    }
    let p = 0;
    for (let j = 0; j < cols; j += 1) {
      const target = (j / cols) * TAU;
      while (p < steps - 1 && phis[p + 1] < target) p += 1;
      const span = phis[p + 1] - phis[p];
      const t = span > 1e-9 ? (target - phis[p]) / span : 0;
      data[i * cols + j] = rhos[p] + (rhos[p + 1] - rhos[p]) * clamp(t, 0, 1);
    }
  }
  return { y0, dy, rows, cols, data };
}

/** Raio interpolado (bilinear) da tabela polar. */
export function samplePolar(table: PolarTable, phi: number, y: number): number {
  const { y0, dy, rows, cols, data } = table;
  let u = (phi / TAU) * cols;
  u = ((u % cols) + cols) % cols;
  const j0 = Math.floor(u);
  const j1 = (j0 + 1) % cols;
  const fu = u - j0;
  const v = clamp((y - y0) / dy, 0, rows - 1);
  const i0 = Math.min(rows - 2, Math.floor(v));
  const fv = v - i0;
  const a = data[i0 * cols + j0] * (1 - fu) + data[i0 * cols + j1] * fu;
  const b = data[(i0 + 1) * cols + j0] * (1 - fu) + data[(i0 + 1) * cols + j1] * fu;
  return a * (1 - fv) + b * fv;
}

// ---------------------------------------------------------------------------- malhas do manequim

/** Normais suaves de uma grade (colunas × linhas), fechada em u se `wrapU`. */
export function gridNormals(pos: Float32Array, cols: number, rows: number, wrapU: boolean, flip = false): Float32Array {
  const normals = new Float32Array(pos.length);
  const at = (c: number, r: number) => (r * cols + c) * 3;
  const tu = new THREE.Vector3();
  const tv = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cPrev = wrapU ? (c - 1 + cols) % cols : Math.max(0, c - 1);
      const cNext = wrapU ? (c + 1) % cols : Math.min(cols - 1, c + 1);
      const rPrev = Math.max(0, r - 1);
      const rNext = Math.min(rows - 1, r + 1);
      const a = at(cPrev, r);
      const b = at(cNext, r);
      const d = at(c, rPrev);
      const e = at(c, rNext);
      tu.set(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]);
      tv.set(pos[e] - pos[d], pos[e + 1] - pos[d + 1], pos[e + 2] - pos[d + 2]);
      // Mesma orientação do triângulo (a, b, d) de gridIndex: (b − a) × (d − a).
      n.crossVectors(tu, tv);
      if (flip) n.negate();
      if (n.lengthSq() < 1e-12) n.set(0, 1, 0);
      n.normalize();
      const o = at(c, r);
      normals[o] = n.x;
      normals[o + 1] = n.y;
      normals[o + 2] = n.z;
    }
  }
  return normals;
}

/** Índices de uma grade colunas × linhas (fechada em u se `wrapU`). */
export function gridIndex(cols: number, rows: number, wrapU: boolean): number[] {
  const index: number[] = [];
  const lastC = wrapU ? cols : cols - 1;
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < lastC; c += 1) {
      const c1 = (c + 1) % cols;
      const a = r * cols + c;
      const b = r * cols + c1;
      const d = (r + 1) * cols + c;
      const e = (r + 1) * cols + c1;
      index.push(a, b, d, b, e, d);
    }
  }
  return index;
}

/**
 * Alturas das linhas do loft: mais densas onde a seção muda depressa com a altura (ombros, pescoço),
 * para a curva do ombro ficar lisa.
 */
function adaptiveRows(ring: (y: number) => Ring, y0: number, y1: number, step: number): number[] {
  const fine = 0.1;
  const n = Math.ceil((y1 - y0) / fine);
  const acc: number[] = [0];
  let prev = ring(y0);
  for (let i = 1; i <= n; i += 1) {
    const yy = Math.min(y1, y0 + i * fine);
    const r = ring(yy);
    const d = Math.max(Math.abs(r.a - prev.a), Math.abs(r.bf - prev.bf), Math.abs(r.bb - prev.bb));
    acc.push(acc[i - 1] + Math.hypot(fine, d));
    prev = r;
  }
  const total = acc[n];
  const count = Math.max(2, Math.ceil(total / step));
  const out: number[] = [];
  let k = 0;
  for (let i = 0; i <= count; i += 1) {
    const target = (i / count) * total;
    while (k < n - 1 && acc[k + 1] < target) k += 1;
    const t = (target - acc[k]) / Math.max(1e-9, acc[k + 1] - acc[k]);
    out.push(Math.min(y1, y0 + (k + clamp(t, 0, 1)) * fine));
  }
  return out;
}

/** Recuo de uma seção (cm) em todas as direções, para os chanfros arredondados das tampas. */
function insetRing(r: Ring, d: number): Ring {
  return { a: Math.max(0.2, r.a - d), bf: Math.max(0.2, r.bf - d), bb: Math.max(0.2, r.bb - d), cz: r.cz, n: r.n };
}

/**
 * Tronco do manequim: loft das seções do quadril (corte reto) até o topo do pescoço (tampa lisa),
 * com as bordas das duas tampas arredondadas.
 */
export function torsoGeometry(model: BodyModel, cols = 144): THREE.BufferGeometry {
  const { y, ring } = model;
  const bevelTop = 0.9 * model.hs;
  const bevelBottom = 1.6 * model.hs;
  const rows: { y: number; ring: Ring }[] = [];
  const bevelSteps = 6;
  for (let k = bevelSteps; k >= 1; k -= 1) {
    const a = (k / bevelSteps) * (Math.PI / 2);
    rows.push({ y: y.bottom + bevelBottom - bevelBottom * Math.sin(a), ring: insetRing(ring(y.bottom + bevelBottom), bevelBottom * (1 - Math.cos(a))) });
  }
  for (const yy of adaptiveRows(ring, y.bottom + bevelBottom, y.neckTop - bevelTop, 0.6)) rows.push({ y: yy, ring: ring(yy) });
  for (let k = 1; k <= bevelSteps; k += 1) {
    const a = (k / bevelSteps) * (Math.PI / 2);
    rows.push({ y: y.neckTop - bevelTop + bevelTop * Math.sin(a), ring: insetRing(ring(y.neckTop - bevelTop), bevelTop * (1 - Math.cos(a))) });
  }
  const nRows = rows.length;
  const pos = new Float32Array((nRows * cols + 2) * 3);
  for (let r = 0; r < nRows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const [x, z] = ringPoint(rows[r].ring, (c / cols) * TAU);
      const o = (r * cols + c) * 3;
      pos[o] = x;
      pos[o + 1] = rows[r].y;
      pos[o + 2] = z;
    }
  }
  const grid = gridNormals(pos.subarray(0, nRows * cols * 3), cols, nRows, true);
  const normals = new Float32Array(pos.length);
  normals.set(grid);
  const index = gridIndex(cols, nRows, true);
  // Centros das tampas (embaixo e em cima).
  const bottomC = nRows * cols;
  const topC = bottomC + 1;
  const bRing = rows[0].ring;
  const tRing = rows[nRows - 1].ring;
  pos.set([0, rows[0].y, bRing.cz], bottomC * 3);
  pos.set([0, rows[nRows - 1].y, tRing.cz], topC * 3);
  normals.set([0, -1, 0], bottomC * 3);
  normals.set([0, 1, 0], topC * 3);
  for (let c = 0; c < cols; c += 1) {
    const c1 = (c + 1) % cols;
    index.push(bottomC, c1, c);
    const last = (nRows - 1) * cols;
    index.push(topC, last + c, last + c1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  g.setIndex(index);
  return g;
}

/**
 * Braço do manequim (lado +x; o -x é espelhado pelo modelo): tubo levemente achatado que nasce dentro
 * do ombro e termina num corte reto com a borda arredondada a `end` cm da articulação.
 */
export function armGeometry(model: BodyModel, end: number, cols = 56): THREE.BufferGeometry {
  const { joint, dir, radius } = model.arm;
  const e1 = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), dir).normalize();
  const e2 = new THREE.Vector3().crossVectors(dir, e1).normalize();
  const bevel = 1.3 * model.hs;
  const start = -5 * model.hs;
  const samples: { s: number; r: number }[] = [];
  const steps = Math.max(8, Math.ceil((end - bevel - start) / 0.9));
  for (let i = 0; i <= steps; i += 1) {
    const s = start + ((end - bevel - start) * i) / steps;
    samples.push({ s, r: radius(s) });
  }
  const rEnd = radius(end - bevel);
  for (let k = 1; k <= 5; k += 1) {
    const a = (k / 5) * (Math.PI / 2);
    samples.push({ s: end - bevel + bevel * Math.sin(a), r: Math.max(0.2, rEnd - bevel * (1 - Math.cos(a))) });
  }
  const nRows = samples.length;
  const pos = new Float32Array((nRows * cols + 1) * 3);
  const p = new THREE.Vector3();
  const rootZone = 9 * model.hs;
  for (let r = 0; r < nRows; r += 1) {
    const { s, r: rad } = samples[r];
    for (let c = 0; c < cols; c += 1) {
      const t = (c / cols) * TAU;
      p.copy(joint)
        .addScaledVector(dir, s)
        .addScaledVector(e1, Math.cos(t) * rad)
        .addScaledVector(e2, Math.sin(t) * rad * 0.9);
      // Perto da raiz, o que sairia por cima do ombro fica por dentro do tronco: o braço nasce do ombro.
      if (s < rootZone) {
        const phi = Math.atan2(p.x, p.z);
        const limit = model.radius(phi, p.y) - 0.25 * model.hs;
        const rr = Math.hypot(p.x, p.z);
        const w = 1 - smoothstep(rootZone * 0.45, rootZone, s);
        if (rr > limit && rr > 1e-6 && p.y > model.y.axilla) {
          const k = 1 + (limit / rr - 1) * w;
          p.x *= k;
          p.z *= k;
        }
      }
      pos.set([p.x, p.y, p.z], (r * cols + c) * 3);
    }
  }
  const grid = gridNormals(pos.subarray(0, nRows * cols * 3), cols, nRows, true);
  const normals = new Float32Array(pos.length);
  normals.set(grid);
  const index = gridIndex(cols, nRows, true);
  const tip = nRows * cols;
  p.copy(joint).addScaledVector(dir, end);
  pos.set([p.x, p.y, p.z], tip * 3);
  normals.set([dir.x, dir.y, dir.z], tip * 3);
  const last = (nRows - 1) * cols;
  for (let c = 0; c < cols; c += 1) index.push(tip, last + c, last + ((c + 1) % cols));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  g.setIndex(index);
  // Orientação: a grade foi montada com t crescendo de e1 para e2 ao longo de dir; garante normais para fora.
  return fixOutward(g, (i, out) => {
    const o = i * 3;
    out.set(pos[o], pos[o + 1], pos[o + 2]).sub(joint);
    const s = out.dot(dir);
    out.addScaledVector(dir, -s);
  });
}

/** Inverte normais (e a ordem dos triângulos) se a maioria aponta para dentro. */
export function fixOutward(g: THREE.BufferGeometry, outwardOf: (i: number, out: THREE.Vector3) => void): THREE.BufferGeometry {
  const normal = g.getAttribute("normal") as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  let score = 0;
  for (let i = 0; i < normal.count; i += 7) {
    outwardOf(i, v);
    score += Math.sign(v.x * normal.getX(i) + v.y * normal.getY(i) + v.z * normal.getZ(i));
  }
  if (score >= 0) return g;
  const arr = normal.array as Float32Array;
  for (let i = 0; i < arr.length; i += 1) arr[i] = -arr[i];
  const index = g.getIndex();
  if (index) {
    const ix = index.array as Uint16Array | Uint32Array;
    for (let i = 0; i < ix.length; i += 3) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
  }
  return g;
}

/** Base do manequim: haste de metal saindo do fundo do tronco até um disco com a borda arredondada. */
export function standGeometry(model: BodyModel): { pole: THREE.BufferGeometry; base: THREE.BufferGeometry; floor: number } {
  const hs = model.hs;
  const top = model.y.bottom + 0.5;
  const poleLength = 15 * hs;
  const baseH = 2.2 * hs;
  const floor = top - poleLength - baseH;
  const pole = new THREE.CylinderGeometry(1.1 * hs, 1.25 * hs, poleLength + 1, 32, 1, false);
  pole.translate(0, top - (poleLength + 1) / 2 + 0.5, model.ring(model.y.bottom).cz);
  const R = 16 * hs;
  const profile: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  const bevel = 0.8 * hs;
  profile.push(new THREE.Vector2(R - bevel, 0));
  for (let k = 1; k <= 6; k += 1) {
    const a = (k / 6) * (Math.PI / 2);
    profile.push(new THREE.Vector2(R - bevel + bevel * Math.sin(a), bevel - bevel * Math.cos(a)));
  }
  profile.push(new THREE.Vector2(R, baseH - bevel));
  for (let k = 1; k <= 6; k += 1) {
    const a = (k / 6) * (Math.PI / 2);
    profile.push(new THREE.Vector2(R - bevel + bevel * Math.cos(a), baseH - bevel + bevel * Math.sin(a)));
  }
  profile.push(new THREE.Vector2(0, baseH));
  const base = new THREE.LatheGeometry(profile, 72);
  base.translate(0, floor, model.ring(model.y.bottom).cz);
  return { pole, base, floor };
}
