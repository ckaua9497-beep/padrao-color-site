// Camiseta vestida no busto (cm). O tecido veste o corpo de body.ts: justo nos ombros, cai a partir do
// peito e, onde a peça tem mais pano que o corpo, a sobra vira folga e dobras verticais (mais nas laterais
// e nas costas, quase nada no peito, onde fica a estampa). Mangas montadas na cava, gola canelada ou viés,
// barra dobrada, costuras e a área da estampa como uma "pele" que acompanha o tecido.
// TS puro (three só para a geometria): roda nos testes do node.

import * as THREE from "three";
import { clamp, fixOutward, gridIndex, gridNormals, samplePolar, smoothstep, type BodyModel, type PolarTable } from "./body.ts";

const TAU = Math.PI * 2;

export type SleeveKind = "short" | "long" | "none";
export type NeckKind = "crew" | "v" | "scoop" | "polo";
export type EdgeKind = "rib" | "binding";

export type GarmentCut = {
  /** Largura (meio tórax com a peça deitada) e comprimento (do ombro à barra), cm. */
  W: number;
  L: number;
  sleeve: SleeveKind;
  neck: NeckKind;
  edge: EdgeKind;
  /** Meia largura de ombro a ombro (costura da manga). Sem manga: largura da alça. */
  shoulderHalf: number;
  strap: number;
  /** Profundidade da cava (do ombro até a axila da peça). */
  armholeDepth: number;
  /** Meia largura e decotes da gola (frente e costas). */
  neckHalf: number;
  dropFront: number;
  dropBack: number;
  sleeveLen: number;
  openingCirc: number;
  /** Meia abertura da cava em φ (rad). */
  armholeSpread: number;
  rib: number;
};

/** Modelagem pela largura e comprimento da Tabela de Medidas (proporções de uma camiseta adulta M). */
export function garmentCut(o: { W: number; L: number; sleeve: SleeveKind; neck: NeckKind; edge?: EdgeKind }): GarmentCut {
  const { W, L } = o;
  const k = W / 54;
  const sk = Math.sqrt(k);
  const sleeveless = o.sleeve === "none";
  const neckHalf = (o.neck === "scoop" ? 10.6 : o.neck === "v" ? 8.8 : o.neck === "polo" ? 7.8 : 8.3) * sk;
  return {
    W,
    L,
    sleeve: o.sleeve,
    neck: o.neck,
    edge: o.edge ?? (o.neck === "scoop" || sleeveless ? "binding" : "rib"),
    shoulderHalf: 0.425 * W,
    strap: (o.neck === "scoop" ? 5.6 : 6.4) * sk,
    armholeDepth: (sleeveless ? 0.53 : 0.42) * W,
    neckHalf,
    dropFront: (o.neck === "v" ? 13.5 : o.neck === "scoop" ? 12.5 : o.neck === "polo" ? 6.8 : 8.6) * sk,
    dropBack: 2.1 * sk,
    sleeveLen: o.sleeve === "long" ? 1.14 * W : 0.37 * W,
    openingCirc: o.sleeve === "long" ? 0.4 * W : 0.66 * W,
    armholeSpread: sleeveless ? 0.6 : 0.43 * Math.pow(k, 0.3),
    rib: o.neck === "polo" ? 0 : 1.9 * sk,
  };
}

export type GarmentShape = {
  cut: GarmentCut;
  body: BodyModel;
  /** Raio do tecido R(φ, y) e o deslocamento das dobras (para a sombra nas dobras). */
  table: PolarTable;
  fold: PolarTable;
  /** Comprimento de arco (cm) ao longo de cada linha, de φ = 0 (frente) a φ. */
  arc: PolarTable;
  /** Perímetro de cada linha. */
  perimeter: Float32Array;
  yHem: number;
  yTop: number;
  /** Altura do decote em φ. */
  neckline: (phi: number) => number;
  /** Cava do lado +x como polígono fechado em (φ, y); o lado −x é o espelho (φ → 2π − φ). */
  armhole: { phi: number; y: number }[];
  /** Ponto do ombro (topo da cava) e axila, em (φ, y). */
  shoulderPoint: { phi: number; y: number };
  armpit: { phi: number; y: number };
  /** Ponto do tecido. */
  point: (phi: number, y: number, out?: THREE.Vector3) => THREE.Vector3;
  /** Normal do tecido (para fora). */
  normal: (phi: number, y: number, out?: THREE.Vector3) => THREE.Vector3;
};

const EASE_TOP = 0.42;
const UNIFORM_SHARE = 0.48;
const MAX_FOLD = 2.3;

/** Peso das dobras em volta do corpo: pouco na frente (estampa), mais nas laterais e nas costas. */
function foldWeight(phi: number) {
  const side = Math.sin(phi) ** 2;
  const back = ((1 - Math.cos(phi)) / 2) ** 2;
  return 0.12 + 0.62 * side + 0.34 * back;
}

/** Gerador pseudoaleatório com semente (as dobras saem iguais a cada montagem). */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type FoldLine = { phi: number; sigma: number; amp: number; top: number; fadeIn: number; slant: number };

/**
 * Dobras do caimento: cristas verticais com posição, largura, força e começo próprios, distribuídas
 * pelo peso (laterais e costas) e abrindo em leque a partir das axilas.
 */
function foldLines(yAb: number, radius: number): FoldLine[] {
  const rand = seeded(20251007);
  const lines: FoldLine[] = [];
  // Amostragem pelo peso: CDF discreta de foldWeight.
  const n = 512;
  const cdf = new Float64Array(n + 1);
  for (let i = 0; i < n; i += 1) cdf[i + 1] = cdf[i] + foldWeight((i / n) * TAU);
  const pick = (u: number) => {
    const target = u * cdf[n];
    let lo = 0;
    let hi = n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] <= target) lo = mid;
      else hi = mid;
    }
    return ((lo + 0.5) / n) * TAU;
  };
  const count = 15;
  for (let i = 0; i < count; i += 1) {
    // Estratificado: uma dobra por fatia da CDF (sem amontoar).
    const phi = pick((i + 0.15 + 0.7 * rand()) / count);
    const widthCm = 2.6 + 2.6 * rand();
    const sideness = Math.abs(Math.sin(phi));
    lines.push({
      phi,
      sigma: widthCm / radius,
      amp: 0.55 + 0.45 * rand(),
      top: yAb - 1 - (1 - sideness) * 6 - 7 * rand(),
      fadeIn: 7 + 6 * rand(),
      // Em leque: as dobras das laterais se afastam da axila descendo.
      slant: (Math.sin(phi) >= 0 ? 1 : -1) * Math.cos(phi) * 0.004 + (rand() - 0.5) * 0.004,
    });
  }
  return lines;
}

/** Soma das cristas das dobras em (φ, y): 0 longe delas, perto de amp no alto de uma crista. */
function foldField(lines: FoldLine[], phi: number, y: number) {
  let sum = 0;
  for (const l of lines) {
    if (y > l.top) continue;
    const center = l.phi + l.slant * (l.top - y);
    let dphi = phi - center;
    dphi -= TAU * Math.round(dphi / TAU);
    const t = dphi / l.sigma;
    if (t * t > 9) continue;
    sum += l.amp * Math.exp(-t * t) * smoothstep(l.top, l.top - l.fadeIn, y);
  }
  return sum;
}

/** Desfoque gaussiano de uma coluna de valores (bordas presas). */
function gaussian1d(values: Float64Array, sigma: number, out: Float64Array) {
  const radius = Math.ceil(sigma * 3);
  const weights = Float64Array.from({ length: 2 * radius + 1 }, (_, i) => Math.exp(-(((i - radius) / sigma) ** 2) / 2));
  const n = values.length;
  for (let i = 0; i < n; i += 1) {
    let sum = 0;
    let w = 0;
    for (let j = -radius; j <= radius; j += 1) {
      const ii = Math.min(n - 1, Math.max(0, i + j));
      sum += values[ii] * weights[j + radius];
      w += weights[j + radius];
    }
    out[i] = sum / w;
  }
}

function ringPerimeterPolar(radii: ArrayLike<number>, cols: number) {
  let sum = 0;
  let px = 0;
  let pz = radii[0];
  for (let k = 1; k <= cols; k += 1) {
    const phi = (k / cols) * TAU;
    const r = radii[k % cols];
    const x = r * Math.sin(phi);
    const z = r * Math.cos(phi);
    sum += Math.hypot(x - px, z - pz);
    px = x;
    pz = z;
  }
  return sum;
}

/** Veste o corpo com a peça: tabela R(φ, y) do tecido, dobras, arco, decote e cava. */
export function dressShape(body: BodyModel, cut: GarmentCut): GarmentShape {
  const cols = body.table.cols;
  const dy = 0.25;
  const yHem = -cut.L;
  const y0 = yHem - 0.75;
  const yTop = Math.min(body.y.neckTop - 1, 2.5 * body.hs);
  const rows = Math.ceil((yTop - y0) / dy) + 1;
  const R = new Float32Array(rows * cols);
  const F = new Float32Array(rows * cols);
  const rowY = (i: number) => y0 + i * dy;
  const yAb = -cut.armholeDepth;
  const iAb = clamp(Math.round((yAb - y0) / dy), 1, rows - 2);
  const phis = Float64Array.from({ length: cols }, (_, k) => (k / cols) * TAU);

  // 1) Caimento. Em cima o tecido veste o corpo (ombros, peito, omoplatas); abaixo do ponto de apoio de
  //    cada direção (peito e omoplatas na frente e atrás, axila nas laterais) ele pende do ponto mais
  //    largo acima (envelope). Abaixo da cava, a sobra de pano (circunferência da peça menos a do
  //    envelope) vira folga uniforme e dobras.
  const lines = foldLines(yAb, Math.max(10, (2 * cut.W) / TAU));
  const support = Float64Array.from(phis, (phi) => yAb - 1 + 10 * Math.cos(phi) ** 2);
  const env = new Float64Array(cols);
  const base = new Float64Array(cols);
  const ring = new Float64Array(cols);
  const pattern = new Float64Array(cols);
  let deltaAb = -1;
  for (let i = rows - 1; i >= 0; i -= 1) {
    const yy = rowY(i);
    for (let k = 0; k < cols; k += 1) {
      const rb = body.radius(phis[k], yy);
      env[k] = yy > support[k] ? rb : Math.max(env[k], rb);
      base[k] = env[k] + EASE_TOP;
      pattern[k] = foldField(lines, phis[k], yy);
    }
    if (yy > yAb) {
      for (let k = 0; k < cols; k += 1) R[i * cols + k] = base[k];
      continue;
    }
    const flare = 2.4 * smoothstep(yHem + 7, yHem, yy);
    const target = 2 * cut.W + flare;
    const P0 = ringPerimeterPolar(base, cols);
    let delta = 0;
    let A = 0;
    if (target > P0) {
      const extra = target - P0;
      delta = (extra * UNIFORM_SHARE) / TAU;
      for (let k = 0; k < cols; k += 1) ring[k] = base[k] + delta;
      const P1 = ringPerimeterPolar(ring, cols);
      const want = target - P1;
      // Amplitude das dobras por bisseção (o arco ganho cresce com A ao quadrado).
      const gain = (amp: number) => {
        for (let k = 0; k < cols; k += 1) ring[k] = base[k] + delta + amp * pattern[k];
        return ringPerimeterPolar(ring, cols) - P1;
      };
      if (want > 0) {
        if (gain(MAX_FOLD) <= want) A = MAX_FOLD;
        else {
          let lo = 0;
          let hi = MAX_FOLD;
          for (let it = 0; it < 18; it += 1) {
            const mid = (lo + hi) / 2;
            if (gain(mid) < want) lo = mid;
            else hi = mid;
          }
          A = (lo + hi) / 2;
        }
      }
      // O que as dobras não absorveram vira folga uniforme.
      const left = want - (A > 0 ? gain(A) : 0);
      if (left > 0) delta += left / TAU;
    }
    if (deltaAb < 0) deltaAb = delta;
    const hemFlare = 0.45 * smoothstep(yHem + 5, yHem, yy);
    for (let k = 0; k < cols; k += 1) R[i * cols + k] = base[k] + delta + A * pattern[k] + hemFlare;
  }
  // Acima do fim da cava: a folga do corpo da peça some aos poucos subindo (mais devagar onde o
  // tecido ainda pende, na frente e nas costas).
  deltaAb = Math.max(0, deltaAb);
  for (let i = iAb + 1; i < rows; i += 1) {
    const yy = rowY(i);
    for (let k = 0; k < cols; k += 1) {
      const span = yy > support[k] ? 7 : 12;
      R[i * cols + k] += deltaAb * (1 - smoothstep(yAb, yAb + span, yy));
    }
  }

  // 2) Suaviza ao longo da altura (o envelope tem quinas onde o tecido passa a pender) e em volta, e
  //    garante a folga mínima sobre o corpo.
  const col = new Float64Array(rows);
  const tmp = new Float64Array(rows);
  for (let k = 0; k < cols; k += 1) {
    for (let i = 0; i < rows; i += 1) col[i] = R[i * cols + k];
    gaussian1d(col, 2.2 / dy, tmp);
    for (let i = 0; i < rows; i += 1) R[i * cols + k] = tmp[i];
  }
  const rowVals = new Float64Array(cols);
  for (let i = 0; i < rows; i += 1) {
    for (let k = 0; k < cols; k += 1) rowVals[k] = R[i * cols + k];
    const yy = rowY(i);
    for (let k = 0; k < cols; k += 1) {
      // Desfoque circular leve em φ: três vizinhos de cada lado com pesos gaussianos.
      let sum = 0;
      let w = 0;
      for (let j = -3; j <= 3; j += 1) {
        const ww = Math.exp(-(j * j) / 4);
        sum += rowVals[(k + j + cols) % cols] * ww;
        w += ww;
      }
      const min = body.radius(phis[k], yy) + (yy > yAb ? EASE_TOP * 0.8 : 0.3);
      R[i * cols + k] = Math.max(sum / w, min);
    }
  }

  // 3) Relevo das dobras (para a sombra): o raio menos a sua média local em volta (cerca de 4 cm).
  for (let i = 0; i < rows; i += 1) {
    const ring0 = i * cols;
    for (let k = 0; k < cols; k += 1) {
      let sum = 0;
      let w = 0;
      for (let j = -12; j <= 12; j += 1) {
        const ww = Math.exp(-(j * j) / 72);
        sum += R[ring0 + ((k + j + cols) % cols)] * ww;
        w += ww;
      }
      F[ring0 + k] = R[ring0 + k] - sum / w;
    }
  }

  // 3b) Rugas finas do tecido (até ~1,5 mm): linhas verticais de caimento e as rugas que saem das
  //     axilas em leque. Entram no próprio raio, então estampa, costuras e acabamentos acompanham.
  const armpitY = yAb + 1.5;
  const sides = [Math.PI / 2, (3 * Math.PI) / 2];
  for (let i = 0; i < rows; i += 1) {
    const yy = rowY(i);
    if (yy > yAb + 10 || yy < yHem + 1) continue;
    const below = smoothstep(yAb + 3, yAb - 8, yy);
    for (let k = 0; k < cols; k += 1) {
      const phi = phis[k];
      const r = R[i * cols + k];
      // Linhas de caimento: frequência inteira em φ (sem emenda), fase variando devagar na altura.
      let w = 0.05 * below * foldWeight(phi) * Math.sin(82 * phi + 2.2 * Math.sin(yy / 16 + 3 * phi));
      for (const side of sides) {
        let dphi = phi - side;
        dphi -= TAU * Math.round(dphi / TAU);
        const dx = dphi * r;
        const dyy = yy - armpitY;
        const dist = Math.hypot(dx, dyy * 1.25);
        if (dist > 16 || dist < 0.5) continue;
        // Raios a partir da axila: cristas ao longo das retas que saem dela (mais para baixo e para a frente/trás).
        const ang = Math.atan2(-dyy, Math.abs(dx));
        const reach = Math.exp(-dist / 6.5) * smoothstep(0.8, 3, dist);
        w += 0.15 * reach * Math.sin(ang * 10 + 0.6) * (dyy < 2 ? 1 : 0.4);
      }
      R[i * cols + k] = r + w;
    }
  }

  const table: PolarTable = { y0, dy, rows, cols, data: R };
  const fold: PolarTable = { y0, dy, rows, cols, data: F };

  // 4) Arco ao longo de cada linha (para a estampa sem distorção e as texturas em cm).
  const arcData = new Float32Array(rows * cols);
  const perimeter = new Float32Array(rows);
  for (let i = 0; i < rows; i += 1) {
    let s = 0;
    let px = 0;
    let pz = R[i * cols];
    arcData[i * cols] = 0;
    for (let k = 1; k <= cols; k += 1) {
      const phi = (k / cols) * TAU;
      const r = R[i * cols + (k % cols)];
      const x = r * Math.sin(phi);
      const z = r * Math.cos(phi);
      s += Math.hypot(x - px, z - pz);
      px = x;
      pz = z;
      if (k < cols) arcData[i * cols + k] = s;
    }
    perimeter[i] = s;
  }
  const arc: PolarTable = { y0, dy, rows, cols, data: arcData };

  const point = (phi: number, yy: number, out = new THREE.Vector3()) => {
    const r = samplePolar(table, phi, yy);
    return out.set(r * Math.sin(phi), yy, r * Math.cos(phi));
  };
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const pc = new THREE.Vector3();
  const pd = new THREE.Vector3();
  const normal = (phi: number, yy: number, out = new THREE.Vector3()) => {
    const e = 0.004;
    point(phi - e, yy, pa);
    point(phi + e, yy, pb);
    point(phi, yy - 0.12, pc);
    point(phi, yy + 0.12, pd);
    pb.sub(pa);
    pd.sub(pc);
    out.crossVectors(pb, pd);
    if (out.lengthSq() < 1e-12) out.set(Math.sin(phi), 0, Math.cos(phi));
    return out.normalize();
  };

  // 5) Decote: em cada φ, a altura onde o tecido sai da abertura da gola (elipse; V reto na frente).
  const neckX = (yy: number, front: boolean) => {
    const d = front ? cut.dropFront : cut.dropBack;
    const t = clamp(-yy / d, 0, 1);
    if (cut.neck === "v" && front) return cut.neckHalf * (1 - t) ** 0.92;
    return cut.neckHalf * Math.sqrt(Math.max(0, 1 - t * t));
  };
  const necklineAt = (phi: number) => {
    const front = Math.cos(phi) >= 0;
    const s = Math.abs(Math.sin(phi));
    const top = yTop - 0.05;
    const bottom = -(front ? cut.dropFront : cut.dropBack) - 0.6;
    let prevY = top;
    let prevF = samplePolar(table, phi, top) * s - neckX(top, front);
    for (let yy = top - 0.04; yy >= bottom; yy -= 0.04) {
      const f = samplePolar(table, phi, yy) * s - neckX(yy, front);
      if (f >= 0) {
        const t = prevF < f ? -prevF / (f - prevF) : 0;
        return prevY + (yy - prevY) * clamp(t, 0, 1);
      }
      prevY = yy;
      prevF = f;
    }
    return bottom;
  };
  const NECK_SAMPLES = 512;
  const rawNeck = Float64Array.from({ length: NECK_SAMPLES }, (_, i) => Math.min(necklineAt((i / NECK_SAMPLES) * TAU), -0.5 * body.hs));
  // Frente e costas são elipses diferentes que se encontram num bico na lateral: arredonda em volta.
  const neckTable = new Float64Array(NECK_SAMPLES);
  const neckKernel = Array.from({ length: 41 }, (_, j) => Math.exp(-(((j - 20) / 9) ** 2) / 2));
  const neckWeight = neckKernel.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < NECK_SAMPLES; i += 1) {
    let sum = 0;
    for (let j = -20; j <= 20; j += 1) sum += rawNeck[(i + j + NECK_SAMPLES) % NECK_SAMPLES] * neckKernel[j + 20];
    // No meio da frente do decote V o bico é intencional: suaviza menos ali.
    const vFront = cut.neck === "v" ? Math.exp(-((Math.min(i, NECK_SAMPLES - i) / 10) ** 2)) : 0;
    neckTable[i] = (sum / neckWeight) * (1 - vFront) + rawNeck[i] * vFront;
  }
  const neckline = (phi: number) => {
    let u = (phi / TAU) * NECK_SAMPLES;
    u = ((u % NECK_SAMPLES) + NECK_SAMPLES) % NECK_SAMPLES;
    const i0 = Math.floor(u);
    const f = u - i0;
    return neckTable[i0] * (1 - f) + neckTable[(i0 + 1) % NECK_SAMPLES] * f;
  };

  // 6) Cava do lado +x: o topo fica a "costura do ombro" do decote para fora (manga) ou na largura
  //    da alça (sem manga); o fundo na profundidade da cava.
  const phiC = Math.PI / 2 + 0.05;
  const seam = cut.sleeve === "none" ? cut.strap : Math.max(4, cut.shoulderHalf - cut.neckHalf);
  let yy = neckline(phiC) - 0.05;
  let walked = 0;
  point(phiC, yy, pa);
  while (walked < seam && yy > yAb + 4) {
    yy -= 0.05;
    point(phiC, yy, pb);
    walked += pa.distanceTo(pb);
    pa.copy(pb);
  }
  const yT = yy;
  const yB = yAb;
  const h = yT - yB;
  const sp = cut.armholeSpread;
  const control: [number, number][] = [
    [phiC, yT],
    [phiC - 0.62 * sp, yT - 0.2 * h],
    [phiC - sp, yB + 0.5 * h],
    [phiC - 0.66 * sp, yB + 0.12 * h],
    [phiC, yB],
    [phiC + 0.66 * sp, yB + 0.12 * h],
    [phiC + sp, yB + 0.5 * h],
    [phiC + 0.62 * sp, yT - 0.2 * h],
  ];
  const armhole = closedSpline(control, 160).map(([phi, y]) => ({ phi, y }));

  return {
    cut,
    body,
    table,
    fold,
    arc,
    perimeter,
    yHem,
    yTop,
    neckline,
    armhole,
    shoulderPoint: { phi: phiC, y: yT },
    armpit: { phi: phiC, y: yB },
    point,
    normal,
  };
}

/** Catmull-Rom centrípeta fechada por pontos 2D. */
export function closedSpline(points: [number, number][], samples: number): [number, number][] {
  const n = points.length;
  const out: [number, number][] = [];
  const per = Math.ceil(samples / n);
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const t0 = 0;
    const t1 = t0 + Math.pow(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + 1e-6, 0.5);
    const t2 = t1 + Math.pow(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + 1e-6, 0.5);
    const t3 = t2 + Math.pow(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]) + 1e-6, 0.5);
    for (let j = 0; j < per; j += 1) {
      const t = t1 + ((t2 - t1) * j) / per;
      const a1 = lerp2(p0, p1, (t - t0) / (t1 - t0));
      const a2 = lerp2(p1, p2, (t - t1) / (t2 - t1));
      const a3 = lerp2(p2, p3, (t - t2) / (t3 - t2));
      const b1 = lerp2(a1, a2, (t - t0) / (t2 - t0));
      const b2 = lerp2(a2, a3, (t - t1) / (t3 - t1));
      out.push(lerp2(b1, b2, (t - t1) / (t2 - t1)));
    }
  }
  return out;
}

function lerp2(a: [number, number], b: [number, number], t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Ponto em (φ, y) dentro do polígono da cava (+x ou espelhada)? */
export function insideArmhole(shape: GarmentShape, phi: number, y: number): boolean {
  let p = ((phi % TAU) + TAU) % TAU;
  if (p > Math.PI) p = TAU - p;
  const poly = shape.armhole;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && p < ((b.phi - a.phi) * (y - a.y)) / (b.y - a.y) + a.phi) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------- malhas da peça

export type Piece = { geometry: THREE.BufferGeometry; ao: Float32Array };

/** Comprimento de arco da linha y (cm) entre φ = 0 e φ. */
export function arcAt(shape: GarmentShape, phi: number, y: number): number {
  const { arc, perimeter } = shape;
  const v = clamp((y - arc.y0) / arc.dy, 0, arc.rows - 1);
  const i0 = Math.min(arc.rows - 2, Math.floor(v));
  const fv = v - i0;
  const at = (i: number) => {
    let u = (phi / TAU) * arc.cols;
    u = ((u % arc.cols) + arc.cols) % arc.cols;
    const k0 = Math.floor(u);
    const f = u - k0;
    const a = arc.data[i * arc.cols + k0];
    const b = k0 + 1 < arc.cols ? arc.data[i * arc.cols + k0 + 1] : perimeter[i];
    return a + (b - a) * f;
  };
  return at(i0) * (1 - fv) + at(i0 + 1) * fv;
}

/** φ na linha y em que o arco a partir da frente vale `s` (negativo = para o lado −x). */
export function phiAtArc(shape: GarmentShape, s: number, y: number): number {
  const { arc, perimeter } = shape;
  const v = clamp((y - arc.y0) / arc.dy, 0, arc.rows - 1);
  const i0 = Math.min(arc.rows - 2, Math.floor(v));
  const fv = v - i0;
  const solve = (i: number) => {
    const P = perimeter[i];
    let target = s;
    while (target < 0) target += P;
    while (target >= P) target -= P;
    let lo = 0;
    let hi = arc.cols;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (arc.data[i * arc.cols + mid] <= target) lo = mid;
      else hi = mid;
    }
    const a = arc.data[i * arc.cols + lo];
    const b = lo + 1 < arc.cols ? arc.data[i * arc.cols + lo + 1] : P;
    const f = b > a ? (target - a) / (b - a) : 0;
    return ((lo + f) / arc.cols) * TAU;
  };
  const p0 = solve(i0);
  let p1 = solve(i0 + 1);
  if (Math.abs(p1 - p0) > Math.PI) p1 += p1 < p0 ? TAU : -TAU;
  return p0 * (1 - fv) + p1 * fv;
}

/**
 * Corpo da peça (frente e costas numa malha só): colunas em volta do corpo com a emenda nas costas,
 * cada coluna da barra até o decote. uv = (volta, altura) normalizados — a máscara das cavas e as
 * estampas de padrão usam essa; uv1 = cm (malha do tecido).
 */
export function torsoPiece(shape: GarmentShape, cols = 220, rows = 150): Piece {
  const { yHem, yTop } = shape;
  const NC = cols;
  const total = (NC + 1) * rows;
  const pos = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const uv1 = new Float32Array(total * 2);
  const ao = new Float32Array(total);
  const chestY = -shape.cut.armholeDepth - 6;
  const backArc = arcAt(shape, Math.PI, chestY);
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const fine = 240;
  const ys = new Float64Array(fine + 1);
  const acc = new Float64Array(fine + 1);
  for (let c = 0; c <= NC; c += 1) {
    const phi = Math.PI + (c / NC) * TAU;
    const top = shape.neckline(phi);
    // Linhas distribuídas pelo comprimento da coluna (densas no ombro, onde a coluna dobra).
    shape.point(phi, yHem, q);
    acc[0] = 0;
    ys[0] = yHem;
    for (let i = 1; i <= fine; i += 1) {
      const yy = yHem + ((top - yHem) * i) / fine;
      shape.point(phi, yy, p);
      acc[i] = acc[i - 1] + p.distanceTo(q);
      ys[i] = yy;
      q.copy(p);
    }
    let s0 = arcAt(shape, phi, chestY) - backArc;
    if (s0 < 0) s0 += shape.perimeter[Math.round((chestY - shape.arc.y0) / shape.arc.dy)];
    let k = 0;
    for (let r = 0; r < rows; r += 1) {
      const target = (acc[fine] * r) / (rows - 1);
      while (k < fine - 1 && acc[k + 1] < target) k += 1;
      const t = (target - acc[k]) / Math.max(1e-9, acc[k + 1] - acc[k]);
      const yy = ys[k] + (ys[k + 1] - ys[k]) * clamp(t, 0, 1);
      shape.point(phi, yy, p);
      const o = r * (NC + 1) + c;
      pos.set([p.x, p.y, p.z], o * 3);
      uv[o * 2] = c / NC;
      uv[o * 2 + 1] = (yy - yHem) / (yTop - yHem);
      uv1[o * 2] = s0;
      uv1[o * 2 + 1] = yy;
      ao[o] = 1;
    }
  }
  // Emenda: a última coluna repete a primeira com o arco somado do perímetro (a malha do tecido continua).
  const chestRow = Math.round((chestY - shape.arc.y0) / shape.arc.dy);
  for (let r = 0; r < rows; r += 1) {
    const o = r * (NC + 1) + NC;
    uv1[o * 2] = shape.perimeter[chestRow];
  }
  const normals = gridNormals(pos, NC + 1, rows, false);
  // A emenda das costas: a média das normais das duas colunas iguais (sem vinco).
  for (let r = 0; r < rows; r += 1) {
    const a = (r * (NC + 1)) * 3;
    const b = (r * (NC + 1) + NC) * 3;
    for (let j = 0; j < 3; j += 1) {
      const m = (normals[a + j] + normals[b + j]) / 2;
      normals[a + j] = m;
      normals[b + j] = m;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setAttribute("uv1", new THREE.BufferAttribute(uv1, 2));
  g.setIndex(gridIndex(NC + 1, rows, false));
  fixOutward(g, (i, out) => out.set(pos[i * 3], 0, pos[i * 3 + 2]));
  return { geometry: g, ao };
}
