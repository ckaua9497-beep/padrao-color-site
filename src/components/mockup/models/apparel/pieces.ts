// Malhas da camiseta além do corpo da peça: mangas, acabamentos (barra, gola canelada, viés),
// costuras, a "pele" da estampa e a sombra de contato por vértice.
// TS puro (three só para a geometria): roda nos testes do node.

import * as THREE from "three";
import { clamp, fixOutward, gridIndex, gridNormals, lerp, samplePolar, smoothstep } from "./body.ts";
import { arcAt, phiAtArc, type GarmentShape, type Piece } from "./garment.ts";

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------- manga

export type SleevePiece = Piece & {
  /** Boca da manga (anel) e a direção para fora do eixo em cada ponto. */
  hem: THREE.Vector3[];
  hemOut: THREE.Vector3[];
  /** Direção do braço (para fora da manga, na boca). */
  axis: THREE.Vector3;
  /** Distância da boca até a articulação, ao longo do braço. */
  hemS: number;
  /** Cava (raiz da manga) em 3D. */
  root: THREE.Vector3[];
};

function hermite(p0: THREE.Vector3, m0: THREE.Vector3, p1: THREE.Vector3, m1: THREE.Vector3, u: number, out: THREE.Vector3) {
  const u2 = u * u;
  const u3 = u2 * u;
  return out
    .copy(p0)
    .multiplyScalar(2 * u3 - 3 * u2 + 1)
    .addScaledVector(m0, u3 - 2 * u2 + u)
    .addScaledVector(p1, -2 * u3 + 3 * u2)
    .addScaledVector(m1, u3 - u2);
}

/**
 * Manga do lado +x (o −x é o espelho): sai da cava do tecido, veste o braço com folga e termina na boca
 * a `sleeveLen` cm do ponto do ombro. A emenda da malha fica embaixo do braço (onde está a costura).
 */
export function sleevePiece(shape: GarmentShape, ns = 112, nr = 44): SleevePiece {
  const { body, cut } = shape;
  if (cut.sleeve === "none") throw new Error("sleevePiece: peça sem manga");
  const J = body.arm.joint;
  const d = body.arm.dir;
  const e1 = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), d).normalize();
  const e2 = new THREE.Vector3().crossVectors(d, e1).normalize();
  const v = new THREE.Vector3();
  const psiOf = (p: THREE.Vector3) => {
    v.copy(p).sub(J);
    v.addScaledVector(d, -v.dot(d));
    return Math.atan2(v.dot(e2), v.dot(e1));
  };

  // Cava em 3D, começando na axila, com o ângulo em volta do braço desembrulhado.
  const loop = shape.armhole.map(({ phi, y }) => shape.point(phi, y));
  const start = loop.reduce((best, p, i) => (p.y < loop[best].y ? i : best), 0);
  const ordered = [...loop.slice(start), ...loop.slice(0, start), loop[start]];
  const psis: number[] = [psiOf(ordered[0])];
  for (let i = 1; i < ordered.length; i += 1) {
    let dpsi = psiOf(ordered[i]) - psiOf(ordered[i - 1]);
    while (dpsi > Math.PI) dpsi -= TAU;
    while (dpsi < -Math.PI) dpsi += TAU;
    psis.push(psis[i - 1] + dpsi);
  }
  const sign = psis[psis.length - 1] >= psis[0] ? 1 : -1;
  const psi0 = psis[0];
  const span = Math.abs(psis[psis.length - 1] - psi0) || TAU;
  const rootAt = (t: number, out: THREE.Vector3) => {
    const target = psi0 + sign * t * span;
    let i = 0;
    while (i < psis.length - 2 && sign * (psis[i + 1] - target) < 0) i += 1;
    const a = psis[i];
    const b = psis[i + 1];
    const f = clamp((target - a) / (b - a || 1), 0, 1);
    return out.copy(ordered[i]).lerp(ordered[i + 1], f);
  };

  // Boca da manga: elipse em volta do braço, a sleeveLen do ponto do ombro pela costura de cima.
  const top = shape.point(shape.shoulderPoint.phi, shape.shoulderPoint.y);
  const Rh = cut.openingCirc / TAU;
  const rx = Rh * 1.04;
  const rz = Rh * 0.95;
  const outerAt = (s: number) => J.clone().addScaledVector(d, s).addScaledVector(e1, rx);
  let lo = 2;
  let hi = body.arm.wrist + 4;
  for (let it = 0; it < 40; it += 1) {
    const mid = (lo + hi) / 2;
    if (outerAt(mid).distanceTo(top) < cut.sleeveLen) lo = mid;
    else hi = mid;
  }
  const hemS = cut.sleeve === "long" ? Math.min((lo + hi) / 2, body.arm.wrist - 0.5) : (lo + hi) / 2;
  const hemCenter = J.clone().addScaledVector(d, hemS).addScaledVector(e1, cut.sleeve === "long" ? 0 : 0.35);

  const cols = ns + 1;
  const total = cols * nr;
  const pos = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const uv1 = new Float32Array(total * 2);
  const ao = new Float32Array(total).fill(1);
  const root: THREE.Vector3[] = [];
  const hem: THREE.Vector3[] = [];
  const hemOut: THREE.Vector3[] = [];
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const m0 = new THREE.Vector3();
  const m1 = new THREE.Vector3();
  const p = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const radial = new THREE.Vector3();

  for (let c = 0; c < cols; c += 1) {
    const t = (c % ns) / ns;
    rootAt(t, p0);
    const psi = psiOf(p0);
    p1.copy(hemCenter)
      .addScaledVector(e1, Math.cos(psi) * rx)
      .addScaledVector(e2, Math.sin(psi) * rz);
    const len = p0.distanceTo(p1);
    // Saída da cava: ao longo do braço, abaulando por cima (cabeça da manga).
    radial.copy(p0).sub(J);
    radial.addScaledVector(d, -radial.dot(d)).normalize();
    const cap = 0.34 * Math.max(0, Math.cos(psi));
    m0.copy(d).addScaledVector(radial, cap).normalize().multiplyScalar(len * 1.05);
    m1.copy(d).multiplyScalar(len * 0.8);
    if (c < ns) root.push(p0.clone());
    let rowArc = 0;
    for (let r = 0; r < nr; r += 1) {
      const u = (r / (nr - 1)) ** 1.12;
      hermite(p0, m0, p1, m1, u, p);
      // Folga do braço (o manequim fica sempre por dentro).
      v.copy(p).sub(J);
      const s = v.dot(d);
      v.addScaledVector(d, -s);
      const dist = v.length();
      const cosA = dist > 1e-6 ? v.dot(e1) / dist : 1;
      const ellipse = 0.92 + 0.08 * cosA * cosA;
      const minR = body.arm.radius(clamp(s, 0, body.arm.wrist)) * ellipse + 0.5 + 0.35 * u;
      if (u > 0.02 && dist < minR && dist > 1e-6) {
        v.multiplyScalar(minR / dist);
        p.copy(J).addScaledVector(d, s).add(v);
      }
      // Folga no meio da manga, dobras suaves perto da boca e embaixo; na manga longa, sanfona perto do
      // punho e vincos na dobra do cotovelo.
      const under = (1 - Math.cos(psi)) / 2;
      const long = cut.sleeve === "long";
      let ripple = (long ? 0.85 : 0.22) * Math.sin(Math.PI * u ** 0.8) * (1 - smoothstep(0.86, 1, u) * (long ? 0.85 : 0));
      ripple += 0.2 * u ** 1.4 * (0.4 + 0.6 * under) * Math.sin(5 * psi + 0.8 + 2 * u);
      if (long) {
        ripple += 0.5 * smoothstep(0.66, 0.9, u) * (1 - smoothstep(0.96, 1, u)) * Math.sin((s / 3.2) * TAU + psi * 0.6);
        const inner = Math.max(0, Math.sin(psi + 0.6));
        ripple += 0.38 * Math.exp(-(((s - body.arm.elbow) / 4.5) ** 2)) * inner * Math.sin((s / 2.4) * TAU);
      }
      v.copy(p).sub(J);
      v.addScaledVector(d, -v.dot(d));
      if (v.lengthSq() > 1e-12) p.addScaledVector(v.normalize(), ripple);
      // A manga nunca entra no corpo da camiseta: embaixo ela encosta na lateral; em cima a cabeça da
      // manga passa por cima do ombro do tecido (cobre a cava recortada no corpo da peça).
      if (u > 0.004 && p.y > shape.yHem) {
        const phiP = Math.atan2(p.x, p.z);
        const lift = p.y < shape.armpit.y + 3 ? 0.22 : 0.06 + 0.3 * smoothstep(0, 0.35, u);
        const rg = samplePolar(shape.table, phiP, p.y) + lift;
        const rp = Math.hypot(p.x, p.z);
        if (rp < rg && rp > 1e-6) {
          p.x *= rg / rp;
          p.z *= rg / rp;
        }
      }
      if (r > 0) rowArc += p.distanceTo(prev);
      prev.copy(p);
      const o = r * cols + c;
      pos[o * 3] = p.x;
      pos[o * 3 + 1] = p.y;
      pos[o * 3 + 2] = p.z;
      uv[o * 2] = c / ns;
      uv[o * 2 + 1] = r / (nr - 1);
      uv1[o * 2] = (c / ns) * lerp(cut.openingCirc * 1.25, cut.openingCirc, u);
      uv1[o * 2 + 1] = -rowArc;
    }
  }
  // Boca da manga: a última linha (com a folga e as dobras), e a direção para fora do eixo.
  for (let c = 0; c < ns; c += 1) {
    const o = ((nr - 1) * cols + c) * 3;
    const q = new THREE.Vector3(pos[o], pos[o + 1], pos[o + 2]);
    hem.push(q);
    const out = q.clone().sub(J);
    out.addScaledVector(d, -out.dot(d));
    hemOut.push(out.normalize());
  }
  const normals = gridNormals(pos, cols, nr, false);
  for (let r = 0; r < nr; r += 1) {
    const a = r * cols * 3;
    const b = (r * cols + ns) * 3;
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
  g.setIndex(gridIndex(cols, nr, false));
  fixOutward(g, (i, out) => {
    out.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).sub(J);
    out.addScaledVector(d, -out.dot(d));
  });
  return { geometry: g, ao, hem, hemOut, axis: d.clone(), hemS, root };
}

// ---------------------------------------------------------------------------- acabamentos

/** Perfil 2D de um acabamento: (h para fora da peça / para cima da faixa, n para fora do tecido), cm. */
export type Profile = [number, number][];

/** Barra dobrada (2,3 cm) com espessura na dobra. */
export const HEM_PROFILE: Profile = [
  [-2.3, 0.012],
  [-2.1, 0.03],
  [-1.2, 0.04],
  [-0.25, 0.042],
  [-0.06, 0.03],
  [0.0, -0.03],
  [-0.06, -0.085],
  [-0.25, -0.1],
  [-1.2, -0.1],
  [-2.1, -0.09],
  [-2.3, -0.07],
];

/** Viés que abraça a borda (decote cavado e cavas sem manga). */
export const BINDING_PROFILE: Profile = [
  [-1.15, 0.06],
  [-0.9, 0.14],
  [-0.3, 0.16],
  [-0.04, 0.13],
  [0.07, 0.02],
  [0.04, -0.1],
  [-0.2, -0.15],
  [-0.9, -0.13],
  [-1.1, -0.08],
];

/** Gola canelada: sobe da costura (h = 0) até `height`, com espessura e a borda de cima arredondada. */
export function ribProfile(height: number): Profile {
  return [
    [-0.32, 0.05],
    [-0.08, 0.2],
    [0.25, 0.29],
    [height * 0.5, 0.31],
    [height - 0.18, 0.28],
    [height - 0.04, 0.2],
    [height, 0.12],
    [height - 0.04, 0.03],
    [height - 0.18, -0.04],
    [height * 0.5, -0.06],
    [0.15, -0.06],
    [-0.32, -0.03],
  ];
}

/** Punho canelado da manga longa (faixa em volta do pulso). */
export function cuffProfile(length: number): Profile {
  return [
    [-length, 0.04],
    [-length + 0.3, 0.26],
    [-0.25, 0.3],
    [-0.04, 0.22],
    [0.02, 0.1],
    [-0.04, -0.02],
    [-0.3, -0.06],
    [-length + 0.3, -0.05],
  ];
}

export type Frame = { p: THREE.Vector3; h: THREE.Vector3; n: THREE.Vector3 };

/**
 * Varre um perfil fechado ao longo de uma curva (fechada ou não). uv1 = (cm ao longo da curva,
 * cm ao longo do perfil): a malha canelada/lisa do tecido usa essa coordenada.
 */
export function sweepPiece(frames: Frame[], profile: Profile, closedCurve: boolean): Piece {
  const nc = frames.length + (closedCurve ? 1 : 0);
  const np = profile.length + 1;
  const pos = new Float32Array(nc * np * 3);
  const uv = new Float32Array(nc * np * 2);
  const uv1 = new Float32Array(nc * np * 2);
  const ao = new Float32Array(nc * np).fill(1);
  const plen: number[] = [0];
  for (let j = 1; j < np; j += 1) {
    const a = profile[j - 1];
    const b = profile[j % profile.length];
    plen.push(plen[j - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  let along = 0;
  const p = new THREE.Vector3();
  for (let i = 0; i < nc; i += 1) {
    const f = frames[i % frames.length];
    if (i > 0) along += f.p.distanceTo(frames[(i - 1) % frames.length].p);
    for (let j = 0; j < np; j += 1) {
      const [h, n] = profile[j % profile.length];
      p.copy(f.p).addScaledVector(f.h, h).addScaledVector(f.n, n);
      const o = j * nc + i;
      pos[o * 3] = p.x;
      pos[o * 3 + 1] = p.y;
      pos[o * 3 + 2] = p.z;
      uv[o * 2] = i / (nc - 1);
      uv[o * 2 + 1] = j / (np - 1);
      uv1[o * 2] = along;
      uv1[o * 2 + 1] = plen[j];
    }
  }
  const normals = gridNormals(pos, nc, np, false);
  const avg = (a: number, b: number) => {
    for (let k = 0; k < 3; k += 1) {
      const m = (normals[a * 3 + k] + normals[b * 3 + k]) / 2;
      normals[a * 3 + k] = m;
      normals[b * 3 + k] = m;
    }
  };
  if (closedCurve) for (let j = 0; j < np; j += 1) avg(j * nc, j * nc + nc - 1);
  for (let i = 0; i < nc; i += 1) avg(i, (np - 1) * nc + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setAttribute("uv1", new THREE.BufferAttribute(uv1, 2));
  g.setIndex(gridIndex(nc, np, false));
  // Normais para fora da seção (do centro do perfil para a borda).
  const ch = profile.reduce((s, q) => s + q[0], 0) / profile.length;
  const cn = profile.reduce((s, q) => s + q[1], 0) / profile.length;
  fixOutward(g, (i, out) => {
    const f = frames[(i % nc) % frames.length];
    out.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).sub(f.p).addScaledVector(f.h, -ch).addScaledVector(f.n, -cn);
  });
  return { geometry: g, ao };
}

/** Molduras ao longo de uma curva da superfície em (φ, y): h aponta para `away` (para fora da peça). */
export function surfaceFrames(shape: GarmentShape, curve: { phi: number; y: number }[], closed: boolean, away: (p: THREE.Vector3, i: number) => THREE.Vector3): Frame[] {
  const pts = curve.map(({ phi, y }) => shape.point(phi, y));
  const n = pts.length;
  const frames: Frame[] = [];
  const t = new THREE.Vector3();
  for (let i = 0; i < n; i += 1) {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    t.copy(b).sub(a).normalize();
    const nrm = shape.normal(curve[i].phi, curve[i].y);
    const h = new THREE.Vector3().crossVectors(t, nrm).normalize();
    if (h.dot(away(pts[i], i)) < 0) h.negate();
    frames.push({ p: pts[i], h, n: nrm });
  }
  return frames;
}

/** Curva do decote em volta do pescoço (fechada), com φ da frente para o lado +x. */
export function necklineCurve(shape: GarmentShape, samples = 220): { phi: number; y: number }[] {
  return Array.from({ length: samples }, (_, i) => {
    const phi = (i / samples) * TAU;
    return { phi, y: shape.neckline(phi) };
  });
}

/**
 * Molduras da gola canelada: a faixa sobe junto do pescoço (não deita no ombro) e nunca encosta no
 * manequim; n = espessura para fora.
 */
export function ribFrames(shape: GarmentShape, curve: { phi: number; y: number }[], height: number, closed = true): Frame[] {
  const base = surfaceFrames(shape, curve, closed, (p) => new THREE.Vector3(-p.x, 0.6, -p.z));
  const body = shape.body;
  const t = new THREE.Vector3();
  const topP = new THREE.Vector3();
  const n0 = base.length;
  return base.map((f, i) => {
    const a = base[closed ? (i - 1 + n0) % n0 : Math.max(0, i - 1)].p;
    const b = base[closed ? (i + 1) % n0 : Math.min(n0 - 1, i + 1)].p;
    t.copy(b).sub(a).normalize();
    // Mais em pé que a superfície: mistura a direção da abertura com a vertical. Nas laterais do
    // pescoço a faixa inclina para dentro e fica um pouco mais baixa (sem "orelhas").
    const sideness = Math.abs(f.p.x) / Math.max(1e-6, Math.hypot(f.p.x, f.p.z));
    const up = f.h.clone().multiplyScalar(0.42 + 0.5 * sideness ** 2).add(new THREE.Vector3(0, 0.9, 0)).normalize();
    topP.copy(f.p).addScaledVector(up, height);
    const min = body.radius(Math.atan2(topP.x, topP.z), topP.y) + 0.38;
    const rT = Math.hypot(topP.x, topP.z);
    if (rT < min && rT > 1e-6) {
      topP.x *= min / rT;
      topP.z *= min / rT;
      up.copy(topP).sub(f.p).normalize();
    }
    const n = new THREE.Vector3().crossVectors(t, up).normalize();
    if (n.x * f.p.x + n.z * f.p.z < 0) n.negate();
    return { p: f.p, h: up.multiplyScalar(1 - 0.22 * sideness ** 2), n };
  });
}

/** Anel da barra (y fixo), com h para baixo. */
export function hemFrames(shape: GarmentShape, samples = 260): Frame[] {
  const curve = Array.from({ length: samples }, (_, i) => ({ phi: (i / samples) * TAU, y: shape.yHem }));
  return surfaceFrames(shape, curve, true, () => new THREE.Vector3(0, -1, 0));
}

/** Cava sem manga (lado +x): h aponta para dentro do buraco. */
export function armholeFrames(shape: GarmentShape): Frame[] {
  const pts = shape.armhole.map(({ phi, y }) => shape.point(phi, y));
  const center = pts.reduce((s, q) => s.add(q), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  return surfaceFrames(shape, shape.armhole, true, (p) => center.clone().sub(p));
}

/** Boca da manga: h ao longo do braço (para fora da manga), n para fora do eixo. */
export function sleeveHemFrames(sleeve: SleevePiece): Frame[] {
  return sleeve.hem.map((p, i) => ({ p, h: sleeve.axis.clone(), n: sleeve.hemOut[i].clone() }));
}

/** Costura (filete fino) ao longo de pontos já na superfície, levemente para fora. */
export function seamGeometry(points: THREE.Vector3[], normals: THREE.Vector3[], radius = 0.07, lift = 0.05, closed = false): THREE.BufferGeometry {
  const lifted = points.map((p, i) => p.clone().addScaledVector(normals[i], lift));
  const curve = new THREE.CatmullRomCurve3(lifted, closed, "centripetal");
  const length = curve.getLength();
  return new THREE.TubeGeometry(curve, Math.max(8, Math.ceil(length / 0.4)), radius, 6, closed);
}

/** Pontos de uma coluna φ entre duas alturas (costura do ombro e lateral). */
export function columnSeam(shape: GarmentShape, phi: number, yA: number, yB: number, step = 0.3): { points: THREE.Vector3[]; normals: THREE.Vector3[] } {
  const n = Math.max(2, Math.ceil(Math.abs(yB - yA) / step));
  const points: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i += 1) {
    const yy = yA + ((yB - yA) * i) / n;
    points.push(shape.point(phi, yy));
    normals.push(shape.normal(phi, yy));
  }
  return { points, normals };
}

// ---------------------------------------------------------------------------- estampa

export type PrintRect = { s: number; y: number; w: number; h: number };

/**
 * "Pele" da estampa sobre o tecido: a arte é medida em cm ao longo do tecido (arco da linha), então
 * fica sem distorção e acompanha dobras e curvas. `back`: mede o arco a partir do meio das costas.
 */
export function printPatch(shape: GarmentShape, rect: PrintRect, back: boolean, nx = 56, ny = 64): THREE.BufferGeometry {
  const cols = nx + 1;
  const rows = ny + 1;
  const pos = new Float32Array(cols * rows * 3);
  const uv = new Float32Array(cols * rows * 2);
  const uv1 = new Float32Array(cols * rows * 2);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let j = 0; j < rows; j += 1) {
    const yy = rect.y - rect.h / 2 + (rect.h * j) / ny;
    const origin = back ? arcAt(shape, Math.PI, yy) : 0;
    for (let i = 0; i < cols; i += 1) {
      const s = rect.s - rect.w / 2 + (rect.w * i) / nx;
      const phi = phiAtArc(shape, origin + s, yy);
      shape.point(phi, yy, p);
      shape.normal(phi, yy, n);
      p.addScaledVector(n, 0.045);
      const o = j * cols + i;
      pos[o * 3] = p.x;
      pos[o * 3 + 1] = p.y;
      pos[o * 3 + 2] = p.z;
      uv[o * 2] = i / nx;
      uv[o * 2 + 1] = j / ny;
      uv1[o * 2] = s;
      uv1[o * 2 + 1] = yy;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(gridNormals(pos, cols, rows, false), 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setAttribute("uv1", new THREE.BufferAttribute(uv1, 2));
  g.setIndex(gridIndex(cols, rows, false));
  return fixOutward(g, (i, out) => out.set(pos[i * 3], 0, pos[i * 3 + 2]));
}

// ---------------------------------------------------------------------------- sombra de contato (AO)

/** Sombra suave nas dobras, sob a gola e onde o braço encosta (cor por vértice). */
export function bakeTorsoAO(shape: GarmentShape, geometry: THREE.BufferGeometry, sleeves: boolean) {
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const { joint: J, dir: d, radius } = shape.body.arm;
  const Jm = new THREE.Vector3(-J.x, J.y, J.z);
  const dm = new THREE.Vector3(-d.x, d.y, d.z);
  const p = new THREE.Vector3();
  const v = new THREE.Vector3();
  const armDist = (joint: THREE.Vector3, dir: THREE.Vector3) => {
    v.copy(p).sub(joint);
    const s = clamp(v.dot(dir), 0, 40);
    v.addScaledVector(dir, -s);
    return v.length() - radius(s);
  };
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    p.fromBufferAttribute(pos, i);
    const phi = Math.atan2(p.x, p.z);
    let ao = 1;
    const fold = samplePolar(shape.fold, phi, p.y);
    ao *= 1 - 0.3 * clamp(-fold / 0.7, 0, 1);
    ao *= 1 + 0.04 * clamp(fold / 0.7, 0, 1);
    const below = shape.neckline(phi) - p.y;
    ao *= 1 - 0.12 * (1 - smoothstep(0, 2.2, below));
    if (sleeves) {
      const near = Math.min(armDist(J, d), armDist(Jm, dm));
      ao *= 1 - 0.3 * (1 - smoothstep(1, 7.5, near)) * smoothstep(shape.armpit.y + 4, shape.armpit.y - 2, p.y);
    }
    ao = clamp(ao, 0.55, 1.05);
    colors[i * 3] = ao;
    colors[i * 3 + 1] = ao;
    colors[i * 3 + 2] = ao;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/** Sombra da manga: embaixo, perto do corpo da camiseta. */
export function bakeSleeveAO(shape: GarmentShape, geometry: THREE.BufferGeometry) {
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    p.fromBufferAttribute(pos, i);
    const phi = Math.atan2(p.x, p.z);
    const gap = Math.hypot(p.x, p.z) - samplePolar(shape.table, phi, p.y);
    const ao = clamp(1 - 0.28 * (1 - smoothstep(0.2, 4.5, gap)), 0.6, 1);
    colors[i * 3] = ao;
    colors[i * 3 + 1] = ao;
    colors[i * 3 + 2] = ao;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/** Cor por vértice uniforme (acabamentos e estampa). */
export function flatColor(geometry: THREE.BufferGeometry, value = 1) {
  const count = (geometry.getAttribute("position") as THREE.BufferAttribute).count;
  geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3).fill(value), 3));
  return geometry;
}
