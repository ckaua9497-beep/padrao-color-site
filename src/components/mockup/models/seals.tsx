"use client";

/**
 * Produtos novos de adesivo de fechamento, modelados a partir das fotos do produto:
 * - bag-seal (Adesivo para Fechar Sacola): recorte especial em "halter", dois quadrados de cantos arredondados
 *   ligados por um pescoço estreito, que é a dobra. Vai colado dobrado sobre a boca fechada de uma sacola kraft
 *   de alça de papel torcido: a metade de baixo da arte fica na frente, a de cima passa por cima da borda para as
 *   costas. Ao lado, uma unidade solta em pé mostra a peça inteira (no liner da bobina ou recortada no contorno).
 * - seal (Lacre de Segurança Adesivo): etiqueta retangular alongada de cantos arredondados com cortes de segurança
 *   em losango (picote quase invisível). Colada na vertical sobre a boca dobrada de um saco kraft de delivery
 *   (fundo quadrado, boca dobrada uma vez para a frente): metade na aba, metade no corpo. Rolo de lacres ao lado.
 * Tudo em centímetros num grupo com escala, frente para +z.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import { Dimensions, PrintMaterial, faceGeometry, sizeLabels, useArtTexture, useGeometryCleanup, type MaskPath, type ModelProps } from "./shared";
import { useGeometriesCleanup } from "./fabric";
import { lathe, type Pt } from "./vessel";

const TARGET = 2.4;
const smooth = THREE.MathUtils.smoothstep;

/** Pardo natural do kraft (o mesmo tom do saco kraft). */
const KRAFT = "#c49a6c";
/** Lado do ladrilho da textura de fibra (cm): as UVs do papel estão em cm. */
const FIBER_TILE = 12;
/** Liner (papel siliconado) branco da bobina. */
const LINER = "#f6f5f1";

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Lacre de offset sem laminação: papel sem revestimento, fosco. Couché e laminados seguem o acabamento escolhido. */
function paperSpec(spec: MockupSpec): MockupSpec {
  const details = spec.details ?? "";
  if (/\boffset\b/.test(details) && !/laminacao/.test(details)) return { ...spec, finish: "matte", clearcoat: 0 };
  return spec;
}

// ---------------------------------------------------------------------------- malhas

type Grid = {
  nu: number;
  nv: number;
  at: (u: number, v: number, out: THREE.Vector3) => void;
  /** UV em cm (papel kraft em ladrilho) ou 0..1 (arte); padrão 0..1. */
  uv?: (u: number, v: number) => [number, number];
  /** Para onde a face da frente deve olhar; sem ele vale a ordem natural (∂u × ∂v). */
  outward?: THREE.Vector3;
};

/** Grade (nu × nv) dobrada por uma função de superfície, com a face da frente virada para `outward`. */
function gridGeometry({ nu, nv, at, uv, outward }: Grid) {
  const count = (nu + 1) * (nv + 1);
  const pos = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const p = new THREE.Vector3();
  for (let j = 0; j <= nv; j += 1) {
    for (let i = 0; i <= nu; i += 1) {
      const k = j * (nu + 1) + i;
      const u = i / nu;
      const v = j / nv;
      at(u, v, p);
      pos.set([p.x, p.y, p.z], k * 3);
      uvs.set(uv ? uv(u, v) : [u, v], k * 2);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < nv; j += 1) {
    for (let i = 0; i < nu; i += 1) {
      const a = j * (nu + 1) + i;
      const b = a + 1;
      const c = a + nu + 2;
      const d = a + nu + 1;
      index.push(a, b, d, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  if (outward) {
    const normals = geometry.attributes.normal;
    let facing = 0;
    for (let k = 0; k < normals.count; k += 1) facing += normals.getX(k) * outward.x + normals.getY(k) * outward.y + normals.getZ(k) * outward.z;
    if (facing < 0) {
      for (let t = 0; t < index.length; t += 3) [index[t + 1], index[t + 2]] = [index[t + 2], index[t + 1]];
      geometry.setIndex(index);
      geometry.computeVertexNormals();
    }
  }
  return geometry;
}

/** Anel de seção retangular (tubete de papelão) centrado em y. */
function ringLathe(inner: number, outer: number, length: number, segments = 64) {
  const y = length / 2;
  const profile: Pt[] = [
    [inner, -y],
    [outer, -y],
    [outer, y],
    [inner, y],
    [inner, -y],
  ];
  return lathe(profile, segments);
}

// ---------------------------------------------------------------------------- contornos e máscaras

/** Arco amostrado (ângulos em radianos, do primeiro ao segundo, no sentido que vier). */
function arcPoints(out: Pt[], cx: number, cy: number, r: number, a0: number, a1: number, steps = 10) {
  for (let s = 0; s <= steps; s += 1) {
    const a = a0 + ((a1 - a0) * s) / steps;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
}

/**
 * Contorno "halter" do adesivo de sacola (cm, centrado, anti-horário): dois quadrados de cantos bem arredondados
 * ligados por um pescoço estreito no meio, com concordância côncava nas quinas do pescoço. `m` engorda o contorno
 * (o liner recortado em volta da peça).
 */
function halterOutline(w: number, h: number, m = 0): Pt[] {
  const W = w + m * 2;
  const H = h + m * 2;
  const nw = w * 0.42 + m * 2;
  const r = w * 0.2 + m;
  const rn = w * 0.12 + m;
  const rf = Math.max(w * 0.06 - m, 0.01);
  const nl = Math.max(Math.min(w * 0.18, h * 0.12) - m * 2, rf * 2 + 0.01);
  const x = W / 2;
  const y = H / 2;
  const n = nl / 2;
  const q = nw / 2;
  const pts: Pt[] = [];
  const P = Math.PI;
  arcPoints(pts, -x + r, -y + r, r, P, 1.5 * P);
  arcPoints(pts, x - r, -y + r, r, 1.5 * P, 2 * P);
  arcPoints(pts, x - rn, -n - rn, rn, 0, 0.5 * P, 6);
  arcPoints(pts, q + rf, -n + rf, rf, 1.5 * P, P, 5);
  arcPoints(pts, q + rf, n - rf, rf, P, 0.5 * P, 5);
  arcPoints(pts, x - rn, n + rn, rn, -0.5 * P, 0, 6);
  arcPoints(pts, x - r, y - r, r, 0, 0.5 * P);
  arcPoints(pts, -x + r, y - r, r, 0.5 * P, P);
  arcPoints(pts, -x + rn, n + rn, rn, P, 1.5 * P, 6);
  arcPoints(pts, -q - rf, n - rf, rf, 0.5 * P, 0, 5);
  arcPoints(pts, -q - rf, -n + rf, rf, 0, -0.5 * P, 5);
  arcPoints(pts, -x + rn, -n - rn, rn, 0.5 * P, P, 6);
  return pts;
}

/** Retângulo de cantos arredondados (cm, centrado, anti-horário). */
function roundRectOutline(w: number, h: number, r: number): Pt[] {
  const rr = Math.min(r, w / 2, h / 2);
  const x = w / 2;
  const y = h / 2;
  const pts: Pt[] = [];
  const P = Math.PI;
  arcPoints(pts, x - rr, -y + rr, rr, -0.5 * P, 0);
  arcPoints(pts, x - rr, y - rr, rr, 0, 0.5 * P);
  arcPoints(pts, -x + rr, y - rr, rr, 0.5 * P, P);
  arcPoints(pts, -x + rr, -y + rr, rr, P, 1.5 * P);
  return pts;
}

/** Máscara do canvas da arte a partir do contorno em cm (a arte cobre w × h; y do canvas para baixo). */
function outlineMask(outline: Pt[], w: number, h: number): MaskPath {
  return (ctx, cw, ch) => {
    ctx.beginPath();
    outline.forEach(([x, y], i) => {
      const px = (x / w + 0.5) * cw;
      const py = (0.5 - y / h) * ch;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
  };
}

function shapeOf(outline: Pt[]) {
  return new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
}

// ---------------------------------------------------------------------------- texturas

function useCanvasTexture(make: () => HTMLCanvasElement, setup?: (t: THREE.CanvasTexture) => void) {
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(make());
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    setup?.(t);
    return t;
    // A textura é fixa: `make` e `setup` são funções de módulo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** Papel kraft: pardo com manchas largas da polpa, fibras curtas claras e escuras e pontinhos de impureza. */
function kraftCanvas() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const rand = seeded(29);
  ctx.fillStyle = KRAFT;
  ctx.fillRect(0, 0, size, size);
  // Repete o traço nas cópias vizinhas quando ele encosta na borda: o ladrilho emenda sem costura.
  const tiled = (x: number, y: number, reach: number, draw: (ox: number, oy: number) => void) => {
    for (const ox of [-size, 0, size]) {
      if (x + ox < -reach || x + ox > size + reach) continue;
      for (const oy of [-size, 0, size]) {
        if (y + oy < -reach || y + oy > size + reach) continue;
        draw(x + ox, y + oy);
      }
    }
  };
  for (let k = 0; k < 100; k += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 18 + rand() * 70;
    const alpha = 0.03 + rand() * 0.045;
    const rgb = rand() > 0.5 ? "236,206,162" : "112,72,36";
    tiled(x, y, r, (cx, cy) => {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${rgb},${alpha})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    });
  }
  for (let k = 0; k < 2600; k += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const a = rand() * Math.PI;
    const l = 3 + rand() * 13;
    const bend = (rand() - 0.5) * l * 0.5;
    ctx.strokeStyle = rand() > 0.45 ? `rgba(92,58,26,${0.07 + rand() * 0.12})` : `rgba(242,216,172,${0.08 + rand() * 0.14})`;
    ctx.lineWidth = 0.6 + rand() * 0.9;
    tiled(x, y, l, (cx, cy) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(cx + Math.cos(a) * l * 0.5 - Math.sin(a) * bend, cy + Math.sin(a) * l * 0.5 + Math.cos(a) * bend, cx + Math.cos(a) * l, cy + Math.sin(a) * l);
      ctx.stroke();
    });
  }
  for (let k = 0; k < 140; k += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.4 + rand() * 1.1;
    ctx.fillStyle = `rgba(64,38,16,${0.18 + rand() * 0.25})`;
    tiled(x, y, r, (cx, cy) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  return canvas;
}

function kraftRepeat(t: THREE.CanvasTexture) {
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / FIBER_TILE, 1 / FIBER_TILE);
}

/**
 * Cordão de papel torcido: três fios em hélice ao longo do comprimento (x = comprimento, um passo da torção;
 * y = volta do cordão). Serve de cor e de relevo.
 */
function cordCanvas() {
  const cw = 128;
  const ch = 64;
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const img = ctx.createImageData(cw, ch);
  const rand = seeded(7);
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      // Fase da hélice: três fios por volta, um passo por ladrilho.
      const phase = (3 * (y / ch - x / cw)) % 1;
      const ridge = Math.sin(Math.PI * ((phase + 1) % 1));
      const shade = 0.62 + 0.38 * Math.pow(ridge, 0.6) + (rand() - 0.5) * 0.08;
      const k = (y * cw + x) * 4;
      img.data[k] = Math.min(255, 186 * shade);
      img.data[k + 1] = Math.min(255, 142 * shade);
      img.data[k + 2] = Math.min(255, 94 * shade);
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function cordRepeat(t: THREE.CanvasTexture) {
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
}

/** Topo do rolo: voltas do liner branco em anéis finos (UV planar do RingGeometry). */
function rollEndCanvas() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const c = size / 2;
  ctx.fillStyle = "#f3f2ee";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(160,160,152,0.35)";
  ctx.lineWidth = 0.8;
  for (let r = c * 0.84; r < c; r += 1.6) {
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  return canvas;
}

/**
 * Cortes de segurança do lacre (faca própria): losangos tracejados ocupando a peça inteira e um talho vertical no
 * meio de cada losango. São linhas finas quase invisíveis: o branco do papel aparecendo no corte.
 */
function sealCutsCanvas(w: number, h: number) {
  const ch = 1024;
  const cw = Math.max(64, Math.round((ch * w) / h));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const k = ch / h;
  const inset = 0.16 * k;
  ctx.clearRect(0, 0, cw, ch);
  ctx.save();
  ctx.beginPath();
  ctx.rect(inset, inset, cw - inset * 2, ch - inset * 2);
  ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,0.78)";
  ctx.lineWidth = Math.max(1.4, 0.02 * k);
  ctx.lineCap = "round";
  ctx.setLineDash([0.5 * k, 0.11 * k]);
  // Período vertical do losango: pouco mais alto que a largura da peça, como na faca de lacre.
  const period = w * 1.15;
  for (let top = -period / 2 + 0.55; top < h + period; top += period) {
    ctx.beginPath();
    ctx.moveTo((w / 2) * k, top * k);
    ctx.lineTo(w * k, (top + period / 2) * k);
    ctx.lineTo((w / 2) * k, (top + period) * k);
    ctx.lineTo(0, (top + period / 2) * k);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo((w / 2) * k, (top + period / 2 - 0.32) * k);
    ctx.lineTo((w / 2) * k, (top + period / 2 + 0.32) * k);
    ctx.stroke();
  }
  ctx.restore();
  return canvas;
}

function useSealCuts(w: number, h: number) {
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(sealCutsCanvas(w, h));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [w, h]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

// ---------------------------------------------------------------------------- materiais

function KraftMaterial({ map }: { map: THREE.Texture }) {
  return <meshStandardMaterial map={map} bumpMap={map} bumpScale={0.35} roughness={0.93} side={THREE.DoubleSide} />;
}

/** Camada dos cortes de segurança por cima da arte (mesma malha, empurrada para a frente no depth). */
function CutsMaterial({ map }: { map: THREE.Texture }) {
  return <meshStandardMaterial map={map} transparent depthWrite={false} roughness={0.6} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />;
}

// ============================================================================ adesivo para fechar sacola

/** Sacola kraft pequena de alça torcida, de boca fechada (frente e costas se encostam no alto). */
const BAG = { W: 13, H: 16, D: 6.5, gap: 0.45 };
/** Raio do cordão da alça (cm). */
const CORD = 0.19;
/** Afastamento do adesivo sobre o papel (cm). */
const STICK = 0.025;

/** z da frente da sacola na altura y: embaixo aberta na profundidade toda, no alto encostada nas costas. */
function bagFrontZ(y: number) {
  const { H, D, gap } = BAG;
  return gap + (D / 2 - gap) * (1 - smooth(y, H - 4.4, H - 1.1));
}

/** Quanto o vinco do fole entra para dentro na altura y (o fole dobra para dentro quando a boca fecha). */
function bagCrease(y: number) {
  const half = BAG.D / 2;
  const z = bagFrontZ(y);
  return Math.sqrt(Math.max(0, half * half - z * z));
}

/**
 * Ponto do adesivo dobrado sobre a boca: t = distância (cm) ao meio da dobra ao longo da peça, positiva descendo
 * pela frente e negativa descendo pelas costas. A peça atravessa a boca reta, com quinas de raio pequeno.
 */
function overRim(x: number, t: number, out: THREE.Vector3) {
  const G = BAG.gap + STICK;
  const T = BAG.H + STICK;
  const rc = 0.14;
  const flat = G - rc;
  const bend = (Math.PI / 2) * rc;
  const d = Math.abs(t);
  const side = t < 0 ? -1 : 1;
  if (d <= flat) {
    out.set(x, T, side * d);
    return;
  }
  if (d <= flat + bend) {
    const a = (d - flat) / rc;
    out.set(x, T - rc + rc * Math.cos(a), side * (flat + rc * Math.sin(a)));
    return;
  }
  const y = yAlongFront(T - rc, d - flat - bend);
  out.set(x, y, side * (bagFrontZ(y) + STICK));
}

/** Perfil da frente da sacola em comprimento de arco, do alto para baixo (o adesivo assenta sem esticar a arte). */
const FRONT_ARC = (() => {
  const step = 0.02;
  const ys: number[] = [BAG.H + STICK];
  const len: number[] = [0];
  for (let y = BAG.H + STICK - step; y > 0; y -= step) {
    const prev = ys[ys.length - 1];
    len.push(len[len.length - 1] + Math.hypot(prev - y, bagFrontZ(prev) - bagFrontZ(y)));
    ys.push(y);
  }
  return { ys, len };
})();

/** Altura do ponto que fica `s` cm abaixo de `y0` medindo ao longo do papel da frente. */
function yAlongFront(y0: number, s: number) {
  const { ys, len } = FRONT_ARC;
  const at = (target: number) => {
    let lo = 0;
    let hi = len.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (len[mid] < target) lo = mid;
      else hi = mid;
    }
    const f = len[hi] > len[lo] ? (target - len[lo]) / (len[hi] - len[lo]) : 0;
    return ys[lo] + (ys[hi] - ys[lo]) * Math.min(1, Math.max(0, f));
  };
  // Comprimento de arco do topo até y0 (por busca na tabela), mais s.
  let lo = 0;
  let hi = ys.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ys[mid] > y0) lo = mid;
    else hi = mid;
  }
  return at(len[lo] + s);
}

function useBagGeometries() {
  return useMemo(() => {
    const { W, H } = BAG;
    const nv = 64;
    const front = gridGeometry({
      nu: 6,
      nv,
      at: (u, v, o) => o.set((u - 0.5) * W, v * H, bagFrontZ(v * H)),
      uv: (u, v) => [(u - 0.5) * W, v * H],
      outward: new THREE.Vector3(0, 0, 1),
    });
    const back = gridGeometry({
      nu: 6,
      nv,
      at: (u, v, o) => o.set((0.5 - u) * W, v * H, -bagFrontZ(v * H)),
      uv: (u, v) => [(0.5 - u) * W + 40, v * H],
      outward: new THREE.Vector3(0, 0, -1),
    });
    // Fole: duas meias-faces por lado, do canto da frente ao vinco e do vinco ao canto das costas.
    const gussets: THREE.BufferGeometry[] = [];
    for (const sx of [1, -1]) {
      for (const half of [0, 1]) {
        gussets.push(
          gridGeometry({
            nu: 4,
            nv,
            at: (u, v, o) => {
              const y = v * H;
              const z = bagFrontZ(y);
              const c = bagCrease(y);
              const s = half === 0 ? u : 1 - u;
              o.set(sx * (W / 2 - c * s), y, half === 0 ? z * (1 - u) : -z * u);
            },
            uv: (u, v) => [20 + sx * 7 + half * (BAG.D / 2) + u * (BAG.D / 2), v * H],
            outward: new THREE.Vector3(sx, 0, 0),
          }),
        );
      }
    }
    return [front, back, ...gussets];
  }, []);
}

/** Alça de papel torcido: pernas coladas por dentro do painel, arco subindo da boca e levemente inclinado. */
function useHandles() {
  return useMemo(() => {
    const { H, gap } = BAG;
    const a = 2.8;
    return ([1, -1] as const).map((side) => {
      const rise = side === 1 ? 7.6 : 7.2;
      const z0 = side * (gap - CORD - 0.02);
      const tilt = side * 0.2;
      const ctrl: Pt[] = [
        [-a, H - 3.2],
        [-a, H - 1.2],
        [-a * 1.01, H + rise * 0.3],
        [-a * 0.86, H + rise * 0.72],
        [-a * 0.42, H + rise * 0.96],
        [0, H + rise],
      ];
      const pts = [...ctrl, ...ctrl.slice(0, -1).reverse().map(([x, y]): Pt => [-x, y])].map(
        ([x, y]) => new THREE.Vector3(x, y, z0 + Math.max(0, y - H) * tilt),
      );
      const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
      const geometry = new THREE.TubeGeometry(curve, 180, CORD, 10, false);
      // Um passo da torção a cada 0,9 cm de cordão.
      const turns = curve.getLength() / 0.9;
      const uv = geometry.attributes.uv;
      for (let k = 0; k < uv.count; k += 1) uv.setX(k, uv.getX(k) * turns);
      uv.needsUpdate = true;
      return geometry;
    });
  }, []);
}

function TwistBag() {
  const paper = useCanvasTexture(kraftCanvas, kraftRepeat);
  const cord = useCanvasTexture(cordCanvas, cordRepeat);
  const panels = useBagGeometries();
  const handles = useHandles();
  useGeometriesCleanup(panels);
  useGeometriesCleanup(handles);
  return (
    <group>
      {panels.map((g, i) => (
        <mesh key={i} geometry={g} castShadow receiveShadow>
          <KraftMaterial map={paper} />
        </mesh>
      ))}
      {handles.map((g, i) => (
        <mesh key={i} geometry={g} castShadow receiveShadow>
          <meshStandardMaterial map={cord} bumpMap={cord} bumpScale={1.2} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** Peça solta em pé: a arte no recorte halter sobre o liner (retângulo da bobina ou recortado no contorno). */
function LooseHalter({ w, h, outline, texture, spec, roll }: { w: number; h: number; outline: Pt[]; texture: THREE.Texture; spec: MockupSpec; roll: boolean }) {
  const t = 0.018;
  const lt = 0.012;
  const face = useMemo(() => faceGeometry(shapeOf(outline), w, h), [outline, w, h]);
  const edge = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shapeOf(outline), { depth: t, bevelEnabled: false, curveSegments: 4 });
    g.translate(0, 0, -t);
    return g;
  }, [outline]);
  const liner = useMemo(() => {
    const shape = shapeOf(roll ? roundRectOutline(w + 0.26, h + 0.26, 0.06) : halterOutline(w, h, 0.09));
    const g = new THREE.ExtrudeGeometry(shape, { depth: lt, bevelEnabled: false, curveSegments: 4 });
    g.translate(0, 0, -t - lt);
    return g;
  }, [roll, w, h]);
  useGeometryCleanup(face);
  useGeometryCleanup(edge);
  useGeometryCleanup(liner);
  return (
    <group>
      <mesh geometry={face} position-z={0.004} castShadow receiveShadow>
        <PrintMaterial map={texture} spec={spec} transparent />
      </mesh>
      <mesh geometry={edge} castShadow>
        <meshStandardMaterial color="#f1efe9" roughness={0.8} />
      </mesh>
      <mesh geometry={liner} castShadow receiveShadow>
        <meshStandardMaterial color={LINER} roughness={0.45} />
      </mesh>
    </group>
  );
}

/**
 * Adesivo para fechar sacola: peça em halter dobrada sobre a boca de uma sacola kraft de alça torcida
 * (metade de baixo da arte na frente, metade de cima nas costas) e uma unidade solta em pé ao lado.
 */
export function BagSealSticker({ spec, art, label, showDims }: ModelProps) {
  const w = THREE.MathUtils.clamp(Math.min(spec.widthCm, spec.heightCm) || 3, 1.5, 8);
  const h = THREE.MathUtils.clamp(Math.max(spec.widthCm, spec.heightCm) || 6.5, w * 1.4, 16);
  const outline = useMemo(() => halterOutline(w, h), [w, h]);
  const mask = useMemo(() => outlineMask(outline, w, h), [outline, w, h]);
  const texture = useArtTexture(w / h, "front", art, label, mask);
  const look = useMemo(() => paperSpec(spec), [spec]);
  const roll = !/individual/.test(spec.details ?? "");
  const folded = useMemo(
    () =>
      gridGeometry({
        nu: 8,
        nv: 96,
        at: (u, v, o) => overRim((u - 0.5) * w, (0.5 - v) * h, o),
      }),
    [w, h],
  );
  useGeometryCleanup(folded);
  const { W, H, D } = BAG;
  const S = TARGET / (H + 8);
  // Unidade solta à esquerda, à frente da sacola, virada para a câmera (3/4 pela direita).
  const loose: [number, number, number] = [-W / 2 + w * 0.2, h / 2 + 0.13, D / 2 + 2.4];
  const looseTurn = 0.5;
  const [labelW, labelH] = sizeLabels(spec);
  return (
    <group userData={{ view: { elevation: 0.24, azimuth: 0.38 } }}>
      <group scale={S}>
        <TwistBag />
        <mesh geometry={folded} receiveShadow>
          <PrintMaterial map={texture} spec={look} transparent />
        </mesh>
        <group position={loose} rotation-y={looseTurn}>
          <LooseHalter w={w} h={h} outline={outline} texture={texture} spec={look} roll={roll} />
        </group>
      </group>
      {showDims && (
        <group position={[loose[0] * S, loose[1] * S, loose[2] * S]} rotation-y={looseTurn}>
          <Dimensions w={w * S} h={h * S} z={0.01} labelW={labelW} labelH={labelH} />
        </group>
      )}
    </group>
  );
}

// ============================================================================ lacre de segurança

/** Saco kraft de delivery (fundo quadrado) com a boca dobrada uma vez para a frente. */
const SACK = { W: 21, H: 20, D: 12, flap: 5.4 };
/** Espessura da aba dobrada (várias camadas de papel com o fole recolhido). */
const FLAP_T = 0.28;
/** z das costas no alto, já encostadas na frente (a boca achatada antes da dobra). */
const SACK_TOP_BACK = SACK.D / 2 - 0.5;
const TOOTH = 0.3;
const PITCH = 0.62;
/** A aba não assenta chapada: o papel dobrado desgruda um pouco e a ponta serrilhada fica afastada do corpo (cm). */
const FLAP_LIFT = 0.32;

/** z da face da aba na altura y (da dobra, no alto, até a ponta serrilhada). */
function flapZ(y: number) {
  return SACK.D / 2 + FLAP_T + (FLAP_LIFT * (SACK.H - y)) / SACK.flap;
}

/** z das costas do saco na altura y: no alto elas vêm para a frente e encostam no painel da frente. */
function sackBackZ(y: number) {
  const { H, D } = SACK;
  return -D / 2 + (SACK_TOP_BACK + D / 2) * smooth(y, H - 4.5, H);
}

/** Frente do saco: plana, com o vinco horizontal do fundo dobrado (marca de quando o saco veio achatado). */
function sackFrontZ(y: number) {
  const { D } = SACK;
  return D / 2 - 0.1 * Math.exp(-(((y - D / 2) / 0.35) ** 2));
}

/** Aba dobrada: a boca do saco com o serrilhado da faca embaixo (zigue-zague). Coordenadas a partir da dobra. */
function flapShape() {
  const { W, flap } = SACK;
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2, 0);
  shape.lineTo(W / 2, 0);
  shape.lineTo(W / 2, -flap);
  const teeth = Math.round(W / PITCH);
  const step = W / teeth;
  for (let k = 0; k < teeth; k += 1) {
    const x = W / 2 - k * step;
    shape.lineTo(x - step / 2, -flap - TOOTH);
    shape.lineTo(x - step, -flap);
  }
  shape.closePath();
  return shape;
}

function useSackGeometries() {
  return useMemo(() => {
    const { W, H, D } = SACK;
    const nv = 72;
    const front = gridGeometry({
      nu: 6,
      nv,
      at: (u, v, o) => o.set((u - 0.5) * W, v * H, sackFrontZ(v * H)),
      uv: (u, v) => [(u - 0.5) * W, v * H],
      outward: new THREE.Vector3(0, 0, 1),
    });
    const back = gridGeometry({
      nu: 6,
      nv,
      at: (u, v, o) => o.set((0.5 - u) * W, v * H, sackBackZ(v * H)),
      uv: (u, v) => [(0.5 - u) * W + 40, v * H],
      outward: new THREE.Vector3(0, 0.2, -1),
    });
    const gussets: THREE.BufferGeometry[] = [];
    for (const sx of [1, -1]) {
      for (const half of [0, 1]) {
        gussets.push(
          gridGeometry({
            nu: 4,
            nv,
            at: (u, v, o) => {
              const y = v * H;
              const zf = sackFrontZ(y);
              const zb = sackBackZ(y);
              const zm = (zf + zb) / 2;
              const d = (zf - zb) / 2;
              const c = Math.sqrt(Math.max(0, (D / 2) ** 2 - d * d));
              if (half === 0) o.set(sx * (W / 2 - c * u), y, zf + (zm - zf) * u);
              else o.set(sx * (W / 2 - c * (1 - u)), y, zm + (zb - zm) * u);
            },
            uv: (u, v) => [60 + sx * 9 + half * (D / 2) + u * (D / 2), v * H],
            outward: new THREE.Vector3(sx, 0, 0),
          }),
        );
      }
    }
    // Fundo quadrado (só aparece de baixo; fecha a silhueta).
    const bottom = new THREE.PlaneGeometry(W, D);
    bottom.rotateX(Math.PI / 2);
    // Dobra da boca: meio cilindro das costas (encostadas) até a aba, por cima.
    const crestR = (D / 2 + FLAP_T - SACK_TOP_BACK) / 2;
    const crest = new THREE.CylinderGeometry(crestR, crestR, W, 20, 1, true, 0, Math.PI);
    crest.rotateZ(Math.PI / 2);
    crest.translate(0, H, SACK_TOP_BACK + crestR);
    const flapGeo = new THREE.ShapeGeometry(flapShape(), 4);
    flapGeo.translate(0, H, 0);
    // UV em cm para a fibra em ladrilho; a aba se afasta do corpo em direção à ponta (plano inclinado).
    const fuv = flapGeo.attributes.uv;
    const fpos = flapGeo.attributes.position;
    for (let k = 0; k < fuv.count; k += 1) {
      fuv.setXY(k, fpos.getX(k) + 7, fpos.getY(k) + 3);
      fpos.setZ(k, flapZ(fpos.getY(k)));
    }
    fuv.needsUpdate = true;
    fpos.needsUpdate = true;
    flapGeo.computeVertexNormals();
    return { panels: [front, back, ...gussets, bottom, crest], flap: flapGeo };
  }, []);
}

/** Sombra de contato sob a ponta da aba (escurece de cima para baixo), como a sombra do serrilhado na foto. */
function flapShadeCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, "rgba(58,34,14,0.42)");
  g.addColorStop(0.35, "rgba(58,34,14,0.16)");
  g.addColorStop(1, "rgba(58,34,14,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  return canvas;
}

function DeliverySack() {
  const paper = useCanvasTexture(kraftCanvas, kraftRepeat);
  const shade = useCanvasTexture(flapShadeCanvas);
  const { panels, flap } = useSackGeometries();
  useGeometriesCleanup(panels);
  useGeometryCleanup(flap);
  const { W, H, D } = SACK;
  const shadeH = 1.1;
  return (
    <group>
      {panels.map((g, i) => (
        <mesh key={i} geometry={g} castShadow receiveShadow>
          <KraftMaterial map={paper} />
        </mesh>
      ))}
      <mesh geometry={flap} castShadow receiveShadow>
        <KraftMaterial map={paper} />
      </mesh>
      <mesh position={[0, H - SACK.flap - TOOTH * 0.6 - shadeH / 2, D / 2 + 0.008]}>
        <planeGeometry args={[W - 0.06, shadeH]} />
        <meshBasicMaterial map={shade} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * Rolo de lacres: tubete de papelão, voltas de liner branco com as etiquetas lado a lado (três colunas) e a ponta
 * desenrolada no chão com uma fileira inteira. As etiquetas sobem pela frente do rolo com a arte de pé.
 */
/** Rolo de lacres (cm): colunas de etiquetas, folgas, raio externo, tubete e ângulo onde a fileira da frente começa. */
const ROLL = { cols: 3, gapX: 0.3, margin: 0.35, gapY: 0.45, R: 4.4, coreOut: 3.8, coreIn: 3.55, phi0: -1.05 };

function LabelRoll({ w, h, texture, cuts, spec }: { w: number; h: number; texture: THREE.Texture; cuts: THREE.Texture; spec: MockupSpec }) {
  const { cols, gapX, margin, R, coreOut } = ROLL;
  const Wr = cols * w + (cols - 1) * gapX + margin * 2;
  const zs = R + 0.4;
  const tail = zs + h + 0.9;
  const colX = (c: number) => -Wr / 2 + margin + w / 2 + c * (w + gapX);
  const labels = useMemo(() => {
    const { cols, gapX, margin, gapY, R, phi0 } = ROLL;
    const list: THREE.BufferGeometry[] = [];
    const rr = R + 0.012;
    for (let row = 0; row < 2; row += 1) {
      const s0 = row * (h + gapY);
      for (let c = 0; c < cols; c += 1) {
        const xc = -Wr / 2 + margin + w / 2 + c * (w + gapX);
        list.push(
          gridGeometry({
            nu: 4,
            nv: 48,
            at: (u, v, o) => {
              const phi = phi0 + (s0 + v * h) / rr;
              o.set(xc + (u - 0.5) * w, rr * Math.sin(phi), rr * Math.cos(phi));
            },
          }),
        );
      }
    }
    return list;
  }, [w, h, Wr]);
  useGeometriesCleanup(labels);
  const core = useMemo(() => ringLathe(ROLL.coreIn, ROLL.coreOut, Wr + 0.06), [Wr]);
  useGeometryCleanup(core);
  const ends = useCanvasTexture(rollEndCanvas);
  return (
    <group>
      <group rotation-z={Math.PI / 2}>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[R, R, Wr, 72, 1, true]} />
          <meshStandardMaterial color={LINER} roughness={0.4} />
        </mesh>
        <mesh geometry={core} castShadow receiveShadow>
          <meshStandardMaterial color="#b08a5e" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
        {[1, -1].map((s) => (
          <mesh key={s} position-y={(s * Wr) / 2} rotation-x={-s * (Math.PI / 2)} receiveShadow>
            <ringGeometry args={[coreOut, R, 72, 1]} />
            <meshStandardMaterial map={ends} roughness={0.5} />
          </mesh>
        ))}
      </group>
      {labels.map((g, i) => (
        <group key={i}>
          <mesh geometry={g} receiveShadow>
            <PrintMaterial map={texture} spec={spec} transparent />
          </mesh>
          <mesh geometry={g}>
            <CutsMaterial map={cuts} />
          </mesh>
        </group>
      ))}
      {/* Ponta desenrolada no chão: a arte de pé para quem olha de frente (topo da etiqueta virado para o rolo). */}
      <group position={[0, -R, 0]} rotation-x={-Math.PI / 2}>
        <mesh position={[0, -tail / 2 + 0.6, 0.01]} receiveShadow castShadow>
          <planeGeometry args={[Wr, tail]} />
          <meshStandardMaterial color={LINER} roughness={0.4} />
        </mesh>
        {Array.from({ length: cols }, (_, c) => (
          <group key={c} position={[colX(c), -(zs + h / 2), 0.022]}>
            <mesh receiveShadow>
              <planeGeometry args={[w, h]} />
              <PrintMaterial map={texture} spec={spec} transparent />
            </mesh>
            <mesh>
              <planeGeometry args={[w, h]} />
              <CutsMaterial map={cuts} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/**
 * Lacre de segurança: etiqueta alongada colada na vertical sobre a dobra da boca de um saco kraft de delivery
 * (metade na aba, metade no corpo, vencendo o degrau do serrilhado) e o rolo de lacres ao lado.
 */
export function SecuritySeal({ spec, art, label, showDims }: ModelProps) {
  const w = THREE.MathUtils.clamp(Math.min(spec.widthCm, spec.heightCm) || 4, 2, 10);
  const h = THREE.MathUtils.clamp(Math.max(spec.widthCm, spec.heightCm) || 10, w, 20);
  const round = spec.shape === "round";
  const outline = useMemo(() => roundRectOutline(w, h, round ? w / 2 : w * 0.085), [w, h, round]);
  const mask = useMemo(() => outlineMask(outline, w, h), [outline, w, h]);
  const texture = useArtTexture(w / h, "front", art, label, mask);
  const cuts = useSealCuts(w, h);
  const look = useMemo(() => paperSpec(spec), [spec]);
  const { W, H, D, flap } = SACK;
  const x0 = W * 0.06;
  const top = H - 0.45;
  const edgeY = H - flap;
  const sealGeo = useMemo(
    () =>
      gridGeometry({
        nu: 10,
        nv: 120,
        at: (u, v, o) => {
          const y = top - (1 - v) * h;
          // Sobre a aba até o serrilhado; depois vence o degrau e assenta no corpo.
          const onFlap = smooth(y, edgeY - TOOTH - 1.4, edgeY - TOOTH * 0.4);
          const body = sackFrontZ(y);
          o.set(x0 + (u - 0.5) * w, y, STICK + body + (flapZ(Math.max(y, edgeY - TOOTH)) - body) * onFlap);
        },
      }),
    [x0, top, h, w, edgeY],
  );
  useGeometryCleanup(sealGeo);
  const S = TARGET / (H + 4);
  const [labelW, labelH] = sizeLabels(spec);
  return (
    <group userData={{ view: { elevation: 0.24, azimuth: 0.36 } }}>
      <group scale={S}>
        <DeliverySack />
        <mesh geometry={sealGeo} receiveShadow>
          <PrintMaterial map={texture} spec={look} transparent />
        </mesh>
        <mesh geometry={sealGeo}>
          <CutsMaterial map={cuts} />
        </mesh>
        <group position={[-W / 2 - 1.5, ROLL.R, D / 2 + ROLL.R + 2.2]} rotation-y={0.3}>
          <LabelRoll w={w} h={h} texture={texture} cuts={cuts} spec={look} />
        </group>
      </group>
      {showDims && (
        <group position={[x0 * S, (top - h / 2) * S, (flapZ(edgeY) + 0.1) * S]}>
          <Dimensions w={w * S} h={h * S} z={0} labelW={labelW} labelH={labelH} />
        </group>
      )}
    </group>
  );
}
