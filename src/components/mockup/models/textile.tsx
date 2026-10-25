"use client";

import { useEffect, useMemo } from "react";
import { Decal } from "@react-three/drei";
import * as THREE from "three";
import { dressFor, figureOf, type Figure } from "@/components/product/art-editor/mannequin";
import { DEFAULT_ART, hasArtContent, type ArtRender } from "../art";
import { useApparelArt, useGeometriesCleanup } from "./fabric";
import { inflatedSurface } from "./inflate";
import { useArtTexture, type MaskPath, type ModelProps } from "./shared";
import { TeeModel } from "./apparel/TeeModel";
import { TurnGroup } from "./apparel/TurnGroup";

/*
 * Têxteis procedurais: camiseta (e variações), boné, avental e bandana.
 * Tudo é modelado em centímetros dentro de um grupo escalado (proporções reais). Os painéis de roupa
 * são "vestidos": a grade do inflate.ts recorta o contorno e a altura vem da seção do corpo, então
 * frente e costas se encontram nas costuras e ficam abertas no decote, cavas e barra (manequim
 * invisível). A estampa entra por Decal (camiseta, boné) ou pelo UV (avental, bandana sublimados).
 */

// ---------------------------------------------------------------------------- utilitários

type Pt = [number, number];
type Vec3 = [number, number, number];

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Medida da spec ou o padrão, quando vier zerada/inválida. */
function measure(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function shade(color: string, k: number) {
  return new THREE.Color(color).multiplyScalar(k).getStyle();
}

function mix(color: string, other: string, t: number) {
  return new THREE.Color(color).lerp(new THREE.Color(other), t).getStyle();
}

/** Luminância no espaço linear (branco = 1). */
function luminance(color: string) {
  const c = new THREE.Color(color);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** Cor de contraste para viés, linha e friso quando a spec não traz accentColor. */
function contrast(color: string) {
  return luminance(color) > 0.35 ? "#1d2433" : "#f4f4f2";
}

/** Linha de costura: tom do tecido levemente deslocado (some no branco, aparece no escuro). */
function threadOf(color: string) {
  return luminance(color) > 0.35 ? shade(color, 0.8) : mix(color, "#ffffff", 0.3);
}

/** Forro visto pelas aberturas (decote, cava, barra). */
function liningOf(color: string) {
  return luminance(color) > 0.35 ? shade(color, 0.62) : shade(color, 0.7);
}

// Abaixo disto o perfil vira zero: as amostras do contorno caem um fio para dentro da costura.
const EDGE_SNAP = 0.05;

/** Meia elipse (1 no meio, 0 na costura lateral): seção do corpo vestido. */
function profile(q: number) {
  const r = 1 - q * q;
  if (r <= 0) return 0;
  return Math.max(0, Math.sqrt(r) - EDGE_SNAP) / (1 - EDGE_SNAP);
}

/** Quarto de círculo: 0 na borda, 1 a partir de q = 1. */
function roundEnd(q: number) {
  if (q >= 1) return 1;
  if (q <= 0) return 0;
  const k = 1 - q;
  return Math.sqrt(1 - k * k);
}

/** Interpolação suave (Hermite com tangentes Catmull-Rom) de uma função 1D dada por nós [x, y]. */
function smoothCurve(nodes: Pt[]): (x: number) => number {
  const pts = [...nodes].sort((a, b) => a[0] - b[0]);
  const n = pts.length;
  const slope = (i: number) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    return b[0] === a[0] ? 0 : (b[1] - a[1]) / (b[0] - a[0]);
  };
  return (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 0;
    while (i < n - 2 && x > pts[i + 1][0]) i += 1;
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = x1 - x0 || 1;
    const t = (x - x0) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * slope(i) + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * slope(i + 1);
  };
}

function pushPoint(list: Pt[], x: number, y: number) {
  const last = list[list.length - 1];
  if (last && Math.abs(last[0] - x) < 1e-4 && Math.abs(last[1] - y) < 1e-4) return;
  list.push([x, y]);
}

function pushQuad(list: Pt[], p0: Pt, c: Pt, p1: Pt, steps: number) {
  for (let k = 1; k <= steps; k += 1) {
    const t = k / steps;
    const u = 1 - t;
    pushPoint(list, u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]);
  }
}

function pushLine(list: Pt[], p0: Pt, p1: Pt, steps: number) {
  for (let k = 1; k <= steps; k += 1) pushPoint(list, lerp(p0[0], p1[0], k / steps), lerp(p0[1], p1[1], k / steps));
}

/** Metade direita (começa e termina em x = 0) → contorno inteiro espelhado. */
function mirrorHalf(right: Pt[]): THREE.Vector2[] {
  const left = right
    .slice(1, -1)
    .reverse()
    .map(([x, y]) => new THREE.Vector2(-x, y));
  return [...right.map(([x, y]) => new THREE.Vector2(x, y)), ...left];
}

/** Garante que as faces apontam para fora (centro de referência por vértice); inverte a malha se preciso. */
function orientOutward(geometry: THREE.BufferGeometry, centerOf: (i: number) => THREE.Vector3) {
  geometry.computeVertexNormals();
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const nor = geometry.attributes.normal as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  let sum = 0;
  for (let i = 0; i < pos.count; i += 1) {
    p.fromBufferAttribute(pos, i).sub(centerOf(i));
    n.fromBufferAttribute(nor, i);
    sum += n.dot(p);
  }
  const index = geometry.index;
  if (sum < 0 && index) {
    const arr = index.array;
    for (let k = 0; k + 2 < arr.length; k += 3) {
      const t = arr[k + 1];
      arr[k + 1] = arr[k + 2];
      arr[k + 2] = t;
    }
    index.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  return geometry;
}

/** Grade (rows × cols) de anéis de pontos: tubo, manga, punho. `closed` fecha cada anel. */
function ringsGeometry(rings: THREE.Vector3[][], closed: boolean, uvOf?: (i: number, j: number) => Pt) {
  const rows = rings.length - 1;
  const n = rings[0]?.length ?? 0;
  const cols = closed ? n : n - 1;
  const stride = cols + 1;
  const position = new Float32Array((rows + 1) * stride * 3);
  const uv = new Float32Array((rows + 1) * stride * 2);
  const centers: THREE.Vector3[] = [];
  for (let j = 0; j <= rows; j += 1) {
    const ring = rings[j];
    const c = new THREE.Vector3();
    ring.forEach((p) => c.add(p));
    c.divideScalar(Math.max(1, ring.length));
    centers.push(c);
    for (let i = 0; i <= cols; i += 1) {
      const p = ring[i % n];
      const k = j * stride + i;
      position.set([p.x, p.y, p.z], k * 3);
      uv.set(uvOf ? uvOf(i / cols, j / Math.max(1, rows)) : [i / cols, j / Math.max(1, rows)], k * 2);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const a = j * stride + i;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  orientOutward(geometry, (i) => centers[Math.floor(i / stride)]);
  if (closed) weldSeam(geometry, rows, cols);
  return geometry;
}

/** Junta as normais da emenda de uma grade fechada (sem quina de luz). */
function weldSeam(geometry: THREE.BufferGeometry, rows: number, cols: number) {
  const normal = geometry.attributes.normal as THREE.BufferAttribute;
  const stride = cols + 1;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let j = 0; j <= rows; j += 1) {
    const k1 = j * stride;
    const k2 = k1 + cols;
    a.fromBufferAttribute(normal, k1).add(b.fromBufferAttribute(normal, k2));
    if (a.lengthSq() < 1e-12) continue;
    a.normalize();
    normal.setXYZ(k1, a.x, a.y, a.z);
    normal.setXYZ(k2, a.x, a.y, a.z);
  }
  normal.needsUpdate = true;
}

/**
 * Varredura de um perfil 2D fechado (a = "para cima", b = "para fora") ao longo de um caminho:
 * gola, viés, aba, alça. `outward` diz para que lado fica o "fora" em cada ponto.
 */
function sweepGeometry(
  path: THREE.Vector3[],
  closed: boolean,
  profileAt: (k: number, s: number) => Pt[],
  up: THREE.Vector3 | ((p: THREE.Vector3, tangent: THREE.Vector3) => THREE.Vector3),
  outward: (p: THREE.Vector3) => THREE.Vector3,
) {
  const n = path.length;
  const rings: THREE.Vector3[][] = [];
  const tangent = new THREE.Vector3();
  const u = new THREE.Vector3();
  const o = new THREE.Vector3();
  for (let k = 0; k < n; k += 1) {
    const prev = closed ? path[(k - 1 + n) % n] : path[Math.max(0, k - 1)];
    const next = closed ? path[(k + 1) % n] : path[Math.min(n - 1, k + 1)];
    tangent.subVectors(next, prev).normalize();
    const hint = typeof up === "function" ? up(path[k], tangent) : up;
    u.copy(hint).addScaledVector(tangent, -hint.dot(tangent));
    if (u.lengthSq() < 1e-8) u.set(0, 0, 1);
    u.normalize();
    o.crossVectors(tangent, u);
    if (o.dot(outward(path[k])) < 0) o.negate();
    const pts = profileAt(k, n > 1 ? k / (n - 1) : 0);
    rings.push(pts.map(([a, b]) => path[k].clone().addScaledVector(u, a).addScaledVector(o, b)));
  }
  if (closed) rings.push(rings[0].map((p) => p.clone()));
  const geometry = ringsGeometry(rings, true);
  if (closed) return geometry;
  return withCaps(geometry, rings[0], rings[rings.length - 1]);
}

/** Tampa as duas pontas de uma varredura aberta (leque a partir do centro). */
function withCaps(body: THREE.BufferGeometry, first: THREE.Vector3[], last: THREE.Vector3[]) {
  const pos = Array.from(body.attributes.position.array);
  const uv = Array.from(body.attributes.uv.array);
  const index = Array.from(body.index?.array ?? []);
  const cap = (ring: THREE.Vector3[], away: THREE.Vector3) => {
    const center = new THREE.Vector3();
    ring.forEach((p) => center.add(p));
    center.divideScalar(Math.max(1, ring.length));
    const base = pos.length / 3;
    pos.push(center.x, center.y, center.z);
    uv.push(0.5, 0.5);
    ring.forEach((p) => {
      pos.push(p.x, p.y, p.z);
      uv.push(0.5, 0.5);
    });
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    for (let i = 0; i < ring.length; i += 1) {
      const a = base + 1 + i;
      const b = base + 1 + ((i + 1) % ring.length);
      e1.subVectors(ring[i], center);
      e2.subVectors(ring[(i + 1) % ring.length], center);
      if (e1.cross(e2).dot(away) >= 0) index.push(base, a, b);
      else index.push(base, b, a);
    }
  };
  if (first.length > 2 && last.length > 2) {
    const c0 = first.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(first.length);
    const c1 = last.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(last.length);
    cap(first, c0.clone().sub(c1));
    cap(last, c1.clone().sub(c0));
  }
  body.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** Perfil de retângulo arredondado (largura em a, espessura em b), centrado em (a0, 0). */
function roundedProfile(height: number, thick: number, a0 = 0, steps = 3): Pt[] {
  const r = Math.min(thick / 2, height / 2);
  const pts: Pt[] = [];
  const corners: [number, number, number][] = [
    [a0 + height / 2 - r, thick / 2 - r, 0],
    [a0 - height / 2 + r, thick / 2 - r, Math.PI / 2],
    [a0 - height / 2 + r, -thick / 2 + r, Math.PI],
    [a0 + height / 2 - r, -thick / 2 + r, (Math.PI * 3) / 2],
  ];
  corners.forEach(([ca, cb, start]) => {
    for (let k = 0; k <= steps; k += 1) {
      const t = start + (k / steps) * (Math.PI / 2);
      pts.push([ca + r * Math.cos(t), cb + r * Math.sin(t)]);
    }
  });
  return pts;
}

/**
 * Pesponto: traços curtos (prismas de 5 lados) ao longo de uma polilinha, numa geometria só.
 * `dash` e `gap` em unidades do caminho.
 */
function stitchGeometry(points: THREE.Vector3[], dash: number, gap: number, radius: number, closed = false) {
  const pts = closed && points.length ? [...points, points[0]] : points;
  const lengths = [0];
  for (let i = 1; i < pts.length; i += 1) lengths.push(lengths[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = lengths[lengths.length - 1] ?? 0;
  const at = (s: number, out: THREE.Vector3) => {
    let i = 1;
    while (i < lengths.length - 1 && lengths[i] < s) i += 1;
    const span = lengths[i] - lengths[i - 1] || 1;
    return out.lerpVectors(pts[i - 1], pts[i], clamp((s - lengths[i - 1]) / span, 0, 1));
  };
  const position: number[] = [];
  const index: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  const sides = 5;
  for (let s = gap / 2; s + dash <= total; s += dash + gap) {
    at(s, a);
    at(s + dash, b);
    dir.subVectors(b, a);
    if (dir.lengthSq() < 1e-10) continue;
    dir.normalize();
    side.set(0, 1, 0).cross(dir);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0).cross(dir);
    side.normalize();
    up.crossVectors(dir, side).normalize();
    const base = position.length / 3;
    for (const end of [a, b]) {
      for (let k = 0; k < sides; k += 1) {
        const t = (k / sides) * Math.PI * 2;
        position.push(
          end.x + (side.x * Math.cos(t) + up.x * Math.sin(t)) * radius,
          end.y + (side.y * Math.cos(t) + up.y * Math.sin(t)) * radius,
          end.z + (side.z * Math.cos(t) + up.z * Math.sin(t)) * radius,
        );
      }
    }
    for (let k = 0; k < sides; k += 1) {
      const k1 = (k + 1) % sides;
      index.push(base + k, base + k1, base + sides + k, base + k1, base + sides + k1, base + sides + k);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** Desloca cada ponto de um anel para fora do centro do anel (pesponto um fio acima do tecido). */
function liftRing(ring: THREE.Vector3[], amount: number) {
  const c = ring.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(Math.max(1, ring.length));
  return ring.map((p) => {
    const d = p.clone().sub(c);
    const len = d.length() || 1;
    return p.clone().addScaledVector(d, amount / len);
  });
}

function closedTubeGeometry(points: THREE.Vector3[], radius: number, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points, true, "centripetal");
  return new THREE.TubeGeometry(curve, Math.max(48, points.length * 2), radius, radial, true);
}

function openTubeGeometry(points: THREE.Vector3[], radius: number, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  return new THREE.TubeGeometry(curve, Math.max(24, points.length * 2), radius, radial, false);
}

function canvasTexture(canvas: HTMLCanvasElement, repeat = false) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Junta geometrias simples (posição + índice; normais recalculadas). */
function mergeSimple(list: THREE.BufferGeometry[]) {
  const position: number[] = [];
  const index: number[] = [];
  for (const g of list) {
    const base = position.length / 3;
    const src = g.attributes.position.array;
    for (let i = 0; i < src.length; i += 1) position.push(src[i]);
    const idx = g.index?.array;
    if (idx) for (let i = 0; i < idx.length; i += 1) index.push(base + idx[i]);
    g.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** Textura de malha canelada (listras que se repetem ao longo do caminho da gola/punho). */
function useRibTexture(repeat: number) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, 32);
      g.addColorStop(0, "#d4d4d4");
      g.addColorStop(0.5, "#ffffff");
      g.addColorStop(1, "#d4d4d4");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 8, 32);
    }
    const t = canvasTexture(canvas, true);
    t.repeat.set(1, Math.max(1, Math.round(repeat)));
    return t;
  }, [repeat]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

// ---------------------------------------------------------------------------- camiseta

/** Unidades de cena por centímetro: camiseta adulta M (≈ 72 cm do ombro à barra). */
const SHIRT_UNIT = 2.4 / 72;

type Sleeve = "short" | "long" | "none";
type NeckStyle = "crew" | "v" | "scoop" | "polo" | "envelope";
type Cloth = "cotton" | "pique" | "dryfit" | "mesh" | "fine-mesh";
type EdgeStyle = "rib" | "binding" | "double";

/** Modelagem da peça (cm; y = 0 na barra ou no gancho do body). */
type ShirtCut = {
  length: number;
  chest: number;
  hem: number;
  neckW: number;
  neckFront: number;
  neckBack: number;
  neck: NeckStyle;
  shoulder: number;
  slope: number;
  armpit: number;
  sleeve: Sleeve;
  /** Sem manga: x externo da alça no ombro. */
  strap: number;
  depth: number;
  /** Body de bebê: meia largura da entreperna (0 = barra aberta). */
  crotch: number;
  sleeveLen: number;
  /** Inclinação da manga (rad abaixo da horizontal). */
  sleeveDrop: number;
  cuff: number;
  cloth: Cloth;
  edge: EdgeStyle;
  raglan: boolean;
  pattern: "none" | "pinstripe" | "side";
};

const PLACKET_HALF = 1.6;

type CutInput = Pick<ModelProps["spec"], "collar" | "variant" | "sleeveless" | "longSleeve">;

function shirtCut(spec: CutInput): ShirtCut {
  const tee: ShirtCut = {
    length: 72,
    chest: 26,
    hem: 25.6,
    neckW: 9,
    neckFront: 9,
    neckBack: 2.2,
    neck: spec.collar === "polo" ? "polo" : "crew",
    shoulder: 22.5,
    slope: 4,
    armpit: 50,
    sleeve: spec.sleeveless ? "none" : spec.longSleeve ? "long" : "short",
    strap: 15.5,
    depth: 11,
    crotch: 0,
    sleeveLen: spec.longSleeve ? 56 : 15,
    sleeveDrop: spec.longSleeve ? 1.22 : 0.68,
    cuff: spec.longSleeve ? 4.6 : 8.2,
    cloth: spec.collar === "polo" ? "pique" : "cotton",
    edge: "rib",
    raglan: false,
    pattern: "none",
  };
  if (spec.collar === "polo") return { ...tee, neckW: 8.4, neckFront: 7.2, neckBack: 2 };
  switch (spec.variant) {
    case "body":
      return {
        ...tee,
        length: 38,
        chest: 12.6,
        hem: 12.6,
        neckW: 5.4,
        neckFront: 4.6,
        neckBack: 1.4,
        neck: "envelope",
        shoulder: 10.8,
        slope: 1.6,
        armpit: 25,
        sleeve: "short",
        depth: 6.2,
        crotch: 3.8,
        sleeveLen: 6.5,
        sleeveDrop: 0.72,
        cuff: 4.3,
        edge: "binding",
      };
    case "pajama":
      return { ...tee, sleeve: "long", sleeveLen: 56, sleeveDrop: 1.22, cuff: 4.6, edge: "binding" };
    case "vest":
      return { ...tee, length: 68, chest: 27.5, hem: 27.5, neckW: 9.5, neckFront: 13, neck: "v", armpit: 43, sleeve: "none", strap: 16.5, cloth: "mesh", edge: "binding" };
    case "jersey":
      return { ...tee, neck: "v", neckFront: 11, neckW: 8.6, cloth: "dryfit", raglan: true, pattern: "pinstripe", sleeve: "short", sleeveLen: 16, cuff: 8 };
    case "basketball":
      return { ...tee, length: 76, chest: 26.5, hem: 27, neckW: 10, neckFront: 13.5, neck: "scoop", armpit: 41, sleeve: "none", strap: 14.5, cloth: "fine-mesh", edge: "double", pattern: "side" };
    case "abada":
      return { ...tee, length: 70, chest: 27, hem: 27.2, neckW: 10.5, neckFront: 11.5, neck: "scoop", armpit: 44, sleeve: "none", strap: 16.5, cloth: "dryfit", edge: "binding" };
    default:
      return tee;
  }
}

type ShirtParts = {
  cut: ShirtCut;
  depth: (x: number, y: number) => number;
  front: THREE.BufferGeometry;
  back: THREE.BufferGeometry;
  frontPolygon: THREE.Vector2[];
  backPolygon: THREE.Vector2[];
  sleeves: THREE.BufferGeometry[];
  /** Acabamento das aberturas: [geometria, papel] — gola, viés, barra. */
  trims: { geometry: THREE.BufferGeometry; role: "neck" | "binding" | "binding2" | "hem" | "cuff" }[];
  seams: THREE.BufferGeometry;
  stitches: THREE.BufferGeometry;
  /** Comprimento do caminho da gola (repetição da textura canelada). */
  neckLength: number;
  /** Cunha do raglan (metade direita de cada painel, para pintar a textura). */
  raglan: { front: Pt[]; back: Pt[] } | null;
  /** Caminho da costura lateral (metade direita), para as faixas do basquete. */
  side: Pt[];
  placket: THREE.BufferGeometry | null;
  buttons: Vec3[];
  snaps: Vec3[];
  /** Largura (meia) do corpo da peça e linha do ombro, para o manequim caber por dentro. */
  widthAt: (y: number) => number;
  /** x do contorno (costura lateral, depois a cava) em cada altura. */
  outlineAt: (y: number) => number;
  topLine: (ax: number) => number;
  /** Eixo de cada manga (centro da cava → centro da boca) e os raios livres por dentro. */
  sleeveAxes: { from: THREE.Vector3; to: THREE.Vector3; root: number; cuff: number }[];
  list: THREE.BufferGeometry[];
};

/** Corpo do manequim em coordenadas da camisa: meia largura e meia profundidade em cada altura. */
type BodyFit = { width: (y: number) => number; depth: (y: number) => number };

/** Folga mínima entre o corpo do manequim e o tecido (cm). */
const BODY_EASE = 1.2;

const NO_GEOMETRY: THREE.BufferGeometry[] = [];

function buildShirt(cut: ShirtCut, fit: BodyFit | null = null): ShirtParts {
  const L = cut.length;
  const legTop = cut.crotch ? 9 : 0;
  const baseSide = smoothCurve(
    cut.crotch
      ? [
          [legTop, cut.chest * 0.98],
          [cut.armpit * 0.6, cut.chest * 0.97],
          [cut.armpit, cut.chest],
        ]
      : [
          [0, cut.hem],
          [cut.armpit * 0.42, cut.hem - 0.7],
          [cut.armpit, cut.chest],
        ],
  );
  // Vestida no manequim: a peça nunca fica menor que o corpo (camisa justa estica junto com ele).
  const sideAt = fit ? (y: number) => Math.max(baseSide(y), fit.width(y) + BODY_EASE) : baseSide;
  const chest = sideAt(cut.armpit);
  const flare = (cut.sleeve === "none" ? 2.5 : 4) * (chest / 26);
  const widthAt = (y: number) => (y <= cut.armpit ? sideAt(Math.max(y, legTop)) : chest + flare * smoothstep(cut.armpit, cut.armpit + 8, y));
  const baseD = smoothCurve([
    [0, cut.depth * 0.93],
    [cut.armpit * 0.45, cut.depth * 0.88],
    [cut.armpit, cut.depth],
    [L - cut.neckFront, cut.depth * 0.84],
    [L, cut.depth * 0.56],
  ]);
  const D = fit ? (y: number) => Math.max(baseD(y), fit.depth(y) + BODY_EASE) : baseD;
  const kTop = 0.085 * L;
  const topLine = (ax: number) => (ax <= cut.neckW ? L + 0.6 * (1 - (ax / cut.neckW) ** 2) : L - (cut.slope * (ax - cut.neckW)) / Math.max(1, cut.shoulder - cut.neckW));
  const depth = (x: number, y: number) => {
    const ax = Math.abs(x);
    const drape = 1 + (0.03 * Math.sin(x * 0.45 + y * 0.21) + 0.012 * Math.sin(y * 0.9 - x * 0.3)) * (1 - y / L);
    const bottom = cut.crotch ? roundEnd(y / 2.4) : 1;
    return D(y) * profile(ax / widthAt(y)) * roundEnd((topLine(ax) - y) / kTop) * bottom * drape;
  };

  // Contorno (metade direita): barra/entreperna, lateral, cava, ombro e decote.
  const A: Pt = [sideAt(cut.armpit), cut.armpit];
  const sleeveless = cut.sleeve === "none";
  const sx = sleeveless ? cut.strap : cut.shoulder;
  const S: Pt = [sx, topLine(sx)];
  const N: Pt = [cut.neckW, L];
  const lower: Pt[] = [[0, 0]];
  const leg: Pt[] = [];
  if (cut.crotch) {
    pushLine(lower, [0, 0], [cut.crotch, 0], 4);
    leg.push([cut.crotch, 0]);
    pushQuad(leg, [cut.crotch, 0], [cut.crotch + 1.2, legTop * 0.72], [sideAt(legTop), legTop], 16);
    leg.slice(1).forEach(([x, y]) => pushPoint(lower, x, y));
  } else {
    pushLine(lower, [0, 0], [sideAt(0), 0], 14);
  }
  const side: Pt[] = [[sideAt(legTop), legTop]];
  for (let k = 1; k <= 18; k += 1) {
    const y = lerp(legTop, cut.armpit, k / 18);
    side.push([sideAt(y), y]);
  }
  const arm: Pt[] = [A];
  if (sleeveless) pushQuad(arm, A, [cut.strap + 1.2, cut.armpit + 0.6], S, 20);
  else pushQuad(arm, A, [cut.shoulder + 0.5, cut.armpit + 0.62 * (S[1] - cut.armpit)], S, 16);
  const shoulderLine: Pt[] = [S];
  pushLine(shoulderLine, S, N, 6);

  const neckCurve = (drop: number, front: boolean): Pt[] => {
    const pts: Pt[] = [N];
    const bottom: Pt = [0, L - drop];
    if (front && cut.neck === "v") pushQuad(pts, N, [cut.neckW * 0.42, L - drop * 0.42], bottom, 14);
    else if (front && cut.neck === "polo") {
      pushQuad(pts, N, [cut.neckW, L - drop], [PLACKET_HALF, L - drop], 12);
      pushPoint(pts, 0, L - drop);
    } else pushQuad(pts, N, [cut.neckW, L - drop], bottom, front ? 14 : 10);
    return pts;
  };
  const frontNeck = neckCurve(cut.neckFront, true);
  const backNeck = neckCurve(cut.neckBack, false);

  const outline = (neck: Pt[]) => {
    const half: Pt[] = [];
    [lower, side, arm, shoulderLine, neck].forEach((part) => part.forEach(([x, y]) => pushPoint(half, x, y)));
    return mirrorHalf(half);
  };
  const frontPolygon = outline(frontNeck);
  const backPolygon = outline(backNeck);

  const panel = (polygon: THREE.Vector2[], s: 1 | -1) => {
    const g = inflatedSurface(polygon, { height: 1, resolution: 112, side: s });
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 1) pos.setZ(i, s * depth(pos.getX(i), pos.getY(i)));
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  };
  const front = panel(frontPolygon, 1);
  const back = panel(backPolygon, -1);

  // Anéis das aberturas: frente (+z) e costas (-z) se encontram nos pontos de costura.
  const on = ([x, y]: Pt, s: number, lift = 0) => new THREE.Vector3(x, y, s * (depth(x, y) + lift));
  const mirror = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [-x, y]);
  const ring = (frontPts: Pt[], backPts: Pt[], lift = 0) => [...frontPts.map((p) => on(p, 1, lift)), ...backPts.map((p) => on(p, -1, lift))];

  // Decote: N direito → frente → N esquerdo → costas → (fecha no N direito).
  const frontFull = [...frontNeck, ...mirror(frontNeck).reverse().slice(1)];
  const backFull = [...mirror(backNeck), ...backNeck.slice().reverse().slice(1)].slice(1, -1);
  const neckRing = ring(frontFull, backFull);
  const neckCenter = neckRing.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(neckRing.length);
  const neckLength = neckRing.reduce((s, p, i) => s + p.distanceTo(neckRing[(i + 1) % neckRing.length]), 0);

  const trims: ShirtParts["trims"] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const stitchList: THREE.BufferGeometry[] = [];
  const seamList: THREE.BufferGeometry[] = [];
  let placket: THREE.BufferGeometry | null = null;
  const buttons: Vec3[] = [];
  const snaps: Vec3[] = [];

  const up = new THREE.Vector3(0, 1, 0);
  const awayFrom = (c: THREE.Vector3) => (p: THREE.Vector3) => p.clone().sub(c);

  if (cut.neck === "polo") {
    // Gola polo: pé de gola + caída, do topo da carcela direita, pelas costas, até a esquerda.
    const path = [...frontNeck.slice(0, -1).reverse().map((p) => on(p, 1)), ...backFull.slice().reverse().map((p) => on(p, -1)), ...mirror(frontNeck).slice(0, -1).map((p) => on(p, 1))].filter(
      (p, i, all) => i === 0 || p.distanceToSquared(all[i - 1]) > 1e-6,
    );
    const n = path.length;
    const collar = sweepGeometry(
      path,
      false,
      (k) => {
        const end = Math.min(k, n - 1 - k) / Math.max(1, n - 1);
        // Na frente a caída desce rente ao peito (pontas da gola); atrás e nos ombros abre mais.
        const front = 1 - smoothstep(0, 0.22, end);
        const fall = 5.4 + 2.4 * front;
        const out = lerp(0.66, 0.2, front);
        const ta = 2.9 - fall * Math.sqrt(1 - out * out);
        const tb = 0.6 + fall * out;
        return [
          [0, -0.16],
          [2.7, -0.16],
          [3.2, 0.06],
          [3.25, 0.36],
          [3.0, 0.62],
          [ta, tb],
          [ta - 0.22, tb - 0.26],
          [2.6, 0.34],
          [0, 0.16],
        ];
      },
      up,
      awayFrom(neckCenter),
    );
    trims.push({ geometry: collar, role: "neck" });
    // Carcela com dois botões.
    const top = L - cut.neckFront;
    const bottom = top - 13;
    const placketPath: THREE.Vector3[] = [];
    for (let k = 0; k <= 12; k += 1) {
      const y = lerp(top, bottom, k / 12);
      placketPath.push(new THREE.Vector3(0, y, depth(0, y) + 0.12));
    }
    placket = sweepGeometry(placketPath, false, () => roundedProfile(PLACKET_HALF * 2, 0.32), new THREE.Vector3(1, 0, 0), () => new THREE.Vector3(0, 0, 1));
    [top - 3.2, top - 8.6].forEach((y) => buttons.push([0, y, depth(0, y) + 0.42]));
    const placketStitch = [-1, 1].map((sgn) => {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 10; k += 1) {
        const y = lerp(top - 0.4, bottom + 0.5, k / 10);
        pts.push(new THREE.Vector3(sgn * (PLACKET_HALF - 0.35), y, depth(0, y) + 0.3));
      }
      return stitchGeometry(pts, 0.32, 0.22, 0.035);
    });
    stitchList.push(...placketStitch);
  } else if (cut.edge === "rib" || cut.neck === "envelope") {
    const h = cut.neck === "envelope" ? 1.1 : cut.neck === "v" ? 1.9 : 2.1;
    const collar = sweepGeometry([...neckRing], true, () => roundedProfile(h, 0.5, h / 2 - 0.25), up, awayFrom(neckCenter));
    trims.push({ geometry: collar, role: "neck" });
  } else {
    trims.push({ geometry: closedTubeGeometry(neckRing, 0.48), role: "binding" });
    if (cut.edge === "double") {
      const inner = ring(
        frontFull.map(([x, y]): Pt => [x * 0.97, y - 1.15]),
        backFull.map(([x, y]): Pt => [x * 0.97, y - 1.15]),
        0.1,
      );
      trims.push({ geometry: closedTubeGeometry(inner, 0.3), role: "binding2" });
    }
  }

  // Cavas e mangas (lado direito e espelhado).
  const sleeves: THREE.BufferGeometry[] = [];
  const sleeveAxes: ShirtParts["sleeveAxes"] = [];
  for (const sgn of [1, -1]) {
    const armPts = arm.map(([x, y]): Pt => [sgn * x, y]);
    const armRing = ring(armPts, armPts.slice(1, -1).reverse());
    if (sleeveless) {
      trims.push({ geometry: closedTubeGeometry(armRing, 0.48), role: "binding" });
      if (cut.edge === "double") {
        const shifted = armPts.map(([x, y]): Pt => [x - sgn * 1.15, y - 0.4]);
        trims.push({ geometry: closedTubeGeometry(ring(shifted, shifted.slice(1, -1).reverse(), 0.1), 0.3), role: "binding2" });
      }
      continue;
    }
    const dir = new THREE.Vector3(sgn * Math.cos(cut.sleeveDrop), -Math.sin(cut.sleeveDrop), 0);
    const c0 = armRing.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(armRing.length);
    let ys = 0;
    let zs = 0;
    armRing.forEach((p) => {
      ys = Math.max(ys, Math.abs(p.y - c0.y));
      zs = Math.max(zs, Math.abs(p.z - c0.z));
    });
    const e1 = new THREE.Vector3(-dir.y, dir.x, 0);
    if (e1.y < 0) e1.negate();
    const ez = new THREE.Vector3(0, 0, 1);
    const long = cut.sleeve === "long";
    const c1 = c0.clone().addScaledVector(dir, cut.sleeveLen).add(new THREE.Vector3(0, 0, long ? 2.5 : 0.6));
    const cuffA = cut.cuff;
    const cuffB = cut.cuff * (long ? 0.9 : 0.78);
    const thetas = armRing.map((p) => Math.atan2((p.z - c0.z) / (zs || 1), (p.y - c0.y) / (ys || 1)));
    const cuffPts = thetas.map((t) => c1.clone().addScaledVector(e1, Math.cos(t) * cuffA).addScaledVector(ez, Math.sin(t) * cuffB));
    sleeveAxes.push({ from: c0.clone(), to: c1.clone(), root: Math.min(ys, zs), cuff: Math.min(cuffA, cuffB) });
    const rows = long ? 30 : 12;
    const rings: THREE.Vector3[][] = [];
    for (let j = 0; j <= rows; j += 1) {
      const t = j / rows;
      const axis = c0.clone().lerp(c1, t);
      rings.push(
        armRing.map((p, i) => {
          const q = p.clone().lerp(cuffPts[i], t);
          const bulge = 0.06 * Math.sin(Math.PI * t) + 0.025 * Math.sin(thetas[i] * 3 + t * (long ? 14 : 6)) * Math.sin(Math.PI * t);
          return q.addScaledVector(q.clone().sub(axis), bulge);
        }),
      );
    }
    sleeves.push(ringsGeometry(rings, true));
    const last = rings[rows];
    // Anel a `cm` da boca da manga (pesponto da barra).
    const dropRow = (cm: number) => {
      const f = clamp(1 - cm / cut.sleeveLen, 0, 1) * rows;
      const j0 = Math.floor(f);
      const j1 = Math.min(rows, j0 + 1);
      return rings[j0].map((p, i) => p.clone().lerp(rings[j1][i], f - j0));
    };
    if (long || cut.neck === "polo") {
      // Punho canelado: faixa que continua a manga, um pouco mais justa.
      const band: THREE.Vector3[][] = [];
      const bandLen = long ? 6 : 2.6;
      const tighten = long ? 0.86 : 0.97;
      for (let j = 0; j <= 4; j += 1) {
        const t = j / 4;
        const axis = c1.clone().addScaledVector(dir, bandLen * t);
        band.push(last.map((p) => axis.clone().add(p.clone().sub(c1).multiplyScalar(lerp(1.01, tighten, Math.min(1, t * 2))))));
      }
      trims.push({ geometry: ringsGeometry(band, true), role: "cuff" });
      trims.push({ geometry: closedTubeGeometry(band[4], 0.3), role: "cuff" });
    } else {
      trims.push({ geometry: closedTubeGeometry(last, cut.edge === "binding" ? 0.36 : 0.24), role: cut.edge === "binding" ? "binding" : "hem" });
      stitchList.push(stitchGeometry(liftRing(dropRow(1.8), 0.05), 0.32, 0.2, 0.035, true));
      stitchList.push(stitchGeometry(liftRing(dropRow(2.3), 0.05), 0.32, 0.2, 0.035, true));
    }
  }

  // Barra (camiseta) ou viés das pernas e colchetes (body).
  if (cut.crotch) {
    for (const sgn of [1, -1]) {
      const legPts = leg.map(([x, y]): Pt => [sgn * x, y]);
      const legRing = ring(legPts, legPts.slice(1, -1).reverse());
      trims.push({ geometry: closedTubeGeometry(legRing, 0.4), role: "binding" });
    }
    [-2.4, 0, 2.4].forEach((x) => snaps.push([x, 1.2, depth(x, 1.2) + 0.12]));
  } else {
    const hemPts = lower.slice();
    const hemFull = [...mirror(hemPts).reverse(), ...hemPts.slice(1)];
    const hemRing = ring(hemFull, hemFull.slice(1, -1).reverse());
    trims.push({ geometry: closedTubeGeometry(hemRing, cut.edge === "binding" && sleeveless ? 0.4 : 0.26), role: cut.edge === "binding" && sleeveless ? "binding" : "hem" });
    for (const y of [2.0, 2.6]) {
      for (const s of [1, -1]) {
        const w = sideAt(y) - 0.25;
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 40; k += 1) {
          const x = lerp(-w, w, k / 40);
          pts.push(new THREE.Vector3(x, y, s * (depth(x, y) + 0.05)));
        }
        stitchList.push(stitchGeometry(pts, 0.34, 0.2, 0.035));
      }
    }
  }

  // Costuras: laterais e ombros (frente e costas se encontram em z = 0).
  for (const sgn of [1, -1]) {
    seamList.push(openTubeGeometry(side.map(([x, y]) => new THREE.Vector3(sgn * x, y, 0)), 0.17, 6));
    if (!cut.raglan) seamList.push(openTubeGeometry(shoulderLine.map(([x, y]) => new THREE.Vector3(sgn * x, y, 0)), 0.17, 6));
  }

  // Raglan: costura diagonal da axila até o decote, frente e costas.
  let raglan: ShirtParts["raglan"] = null;
  if (cut.raglan) {
    const fi = Math.round(frontNeck.length * 0.4);
    const bi = Math.round(backNeck.length * 0.4);
    const R = frontNeck[fi];
    const Rb = backNeck[bi];
    raglan = {
      front: [A, ...arm.slice(1), ...shoulderLine.slice(1), ...frontNeck.slice(1, fi + 1)],
      back: [A, ...arm.slice(1), ...shoulderLine.slice(1), ...backNeck.slice(1, bi + 1)],
    };
    for (const sgn of [1, -1]) {
      for (const [s, r] of [
        [1, R],
        [-1, Rb],
      ] as [1 | -1, Pt][]) {
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 16; k += 1) {
          const x = sgn * lerp(A[0] - 0.2, r[0], k / 16);
          const y = lerp(A[1], r[1] - 0.2, k / 16);
          pts.push(new THREE.Vector3(x, y, s * (depth(x, y) + 0.04)));
        }
        seamList.push(openTubeGeometry(pts, 0.14, 6));
      }
    }
  }

  const seams = mergeSimple(seamList);
  const stitches = mergeSimple(stitchList);
  geometries.push(front, back, ...sleeves, ...trims.map((t) => t.geometry), seams, stitches);
  if (placket) geometries.push(placket);
  // Contorno acima da axila: a curva da cava (y cresce de A até S).
  const outlineAt = (y: number) => {
    if (y <= cut.armpit) return sideAt(Math.max(y, legTop));
    for (let k = 1; k < arm.length; k += 1) {
      const [x0, y0] = arm[k - 1];
      const [x1, y1] = arm[k];
      if (y <= y1) return lerp(x0, x1, clamp((y - y0) / Math.max(1e-6, y1 - y0), 0, 1));
    }
    return S[0];
  };
  return {
    cut,
    depth,
    front,
    back,
    frontPolygon,
    backPolygon,
    sleeves,
    trims,
    seams,
    stitches,
    neckLength,
    raglan,
    side,
    placket,
    buttons,
    snaps,
    widthAt,
    outlineAt,
    topLine,
    sleeveAxes,
    list: geometries,
  };
}

/**
 * Tecido do painel (frente ou costas) pintado em canvas na caixa do contorno (mesmo UV do inflate.ts):
 * cor base, cunha do raglan, faixas laterais, risca de giz sublimada e furinhos do tecido furadinho.
 */
function createPanelTexture(polygon: THREE.Vector2[], o: { base: string; accent: string; cloth: Cloth; pattern: ShirtCut["pattern"]; raglan: Pt[] | null; side: Pt[] }) {
  const box = new THREE.Box2().setFromPoints(polygon);
  const size = box.getSize(new THREE.Vector2());
  const width = 1024;
  const s = width / Math.max(1, size.x);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.max(64, Math.round(size.y * s));
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const px = (x: number) => (x - box.min.x) * s;
    const py = (y: number) => (box.max.y - y) * s;
    ctx.fillStyle = o.base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const trace = (pts: Pt[], sign: number) => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(px(sign * x), py(y)) : ctx.moveTo(px(sign * x), py(y))));
    };
    if (o.raglan) {
      ctx.fillStyle = o.accent;
      for (const sign of [-1, 1]) {
        trace(o.raglan, sign);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (o.pattern === "side") {
      // Faixa centrada na costura: metade cai fora do painel e some.
      ctx.lineJoin = "round";
      for (const sign of [-1, 1]) {
        for (const [color, half] of [
          [o.accent, 4.2],
          [contrast(o.accent), 3.3],
          [o.accent, 2.8],
        ] as [string, number][]) {
          trace(o.side, sign);
          ctx.strokeStyle = color;
          ctx.lineWidth = half * 2 * s;
          ctx.stroke();
        }
      }
    }
    if (o.pattern === "pinstripe") {
      ctx.strokeStyle = luminance(o.base) > 0.35 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.08)";
      ctx.lineWidth = 0.5 * s;
      const step = 1.8 * s;
      for (let x = -canvas.height; x < canvas.width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, canvas.height);
        ctx.lineTo(x + canvas.height * 0.58, 0);
        ctx.stroke();
      }
    }
    if (o.cloth === "mesh" || o.cloth === "fine-mesh") {
      const coarse = o.cloth === "mesh";
      const step = (coarse ? 0.8 : 0.48) * s;
      const r = (coarse ? 0.19 : 0.1) * s;
      ctx.fillStyle = luminance(o.base) > 0.35 ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.45)";
      for (let j = 0, y = step / 2; y < canvas.height; j += 1, y += step * 0.866) {
        for (let x = j % 2 ? step : step / 2; x < canvas.width; x += step) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  return canvasTexture(canvas);
}

function ClothMaterial({ cloth, color, map }: { cloth: Cloth; color: string; map?: THREE.Texture | null }) {
  if (cloth === "cotton" || cloth === "pique") {
    return <meshPhysicalMaterial color={map ? "#ffffff" : color} map={map ?? null} roughness={cloth === "pique" ? 0.86 : 0.94} sheen={luminance(color) < 0.08 ? 0.55 : 1} sheenRoughness={0.7} sheenColor="#ffffff" />;
  }
  return <meshPhysicalMaterial color={map ? "#ffffff" : color} map={map ?? null} roughness={0.56} sheen={0.7} sheenRoughness={0.42} sheenColor="#ffffff" specularIntensity={0.55} />;
}

/** Etiqueta de tamanho costurada no avesso da gola, vista pelo decote (o tamanho do manequim). */
function NeckLabel({ position, size = "M" }: { position: Vec3; size?: string }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#f6f4ef";
      ctx.fillRect(0, 0, 128, 64);
      ctx.fillStyle = "#2a2a2a";
      const text = size.trim().toUpperCase().replace(/\s*ANOS?$/, "A").slice(0, 4) || "M";
      ctx.font = `700 ${text.length > 2 ? 22 : 30}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 64, 30);
      ctx.fillRect(28, 50, 72, 3);
    }
    return canvasTexture(canvas);
  }, [size]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={position}>
      <planeGeometry args={[4.4, 2.2]} />
      <meshStandardMaterial map={texture} roughness={0.8} />
    </mesh>
  );
}

/** Calça do pijama dobrada (empilhada à frente da blusa): volume inflado, cós com cordão e debrum. */
export function FoldedPants({ color, accent, position }: { color: string; accent: string; position: Vec3 }) {
  const parts = useMemo(() => {
    const shape = (w: number, h: number, r: number) => {
      const s = new THREE.Shape();
      s.moveTo(-w / 2 + r, -h / 2);
      s.lineTo(w / 2 - r, -h / 2);
      s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
      s.lineTo(w / 2, h / 2 - r);
      s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
      s.lineTo(-w / 2 + r, h / 2);
      s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
      s.lineTo(-w / 2, -h / 2 + r);
      s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
      return s.getSpacedPoints(120).slice(0, -1);
    };
    const body = shape(34, 26, 3.5);
    const band = shape(34.4, 5.2, 1.6);
    const top = inflatedSurface(body, { height: 2.7, falloff: 2.2, folds: 0.25, resolution: 60, side: 1 });
    const bottom = inflatedSurface(body, { height: 2.7, falloff: 2.2, resolution: 40, side: -1 });
    const bandTop = inflatedSurface(band, { height: 0.9, falloff: 0.8, resolution: 70, side: 1 });
    const bandBottom = inflatedSurface(band, { height: 0.9, falloff: 0.8, resolution: 30, side: -1 });
    const cords = [-1, 1].map((sgn) =>
      openTubeGeometry(
        [
          new THREE.Vector3(sgn * 1.2, 0.3, 0.95),
          new THREE.Vector3(sgn * 2.0, 2.4, 0.7),
          new THREE.Vector3(sgn * 2.8, 6, 0.35),
          new THREE.Vector3(sgn * 3.5, 10.2, 0.32),
        ],
        0.28,
        8,
      ),
    );
    const piping = openTubeGeometry(
      Array.from({ length: 24 }, (_, k) => new THREE.Vector3(lerp(-17, 17, k / 23), -2.75, 0.55)),
      0.24,
      6,
    );
    const stitch = mergeSimple(
      [1.6, -1.6].map((y) =>
        stitchGeometry(
          Array.from({ length: 30 }, (_, k) => new THREE.Vector3(lerp(-16.5, 16.5, k / 29), y, 0.92)),
          0.38,
          0.24,
          0.04,
        ),
      ),
    );
    return { top, bottom, bandTop, bandBottom, cords, piping, stitch, list: [top, bottom, bandTop, bandBottom, ...cords, piping, stitch] };
  }, []);
  useGeometriesCleanup(parts.list);
  const thread = threadOf(color);
  return (
    <group position={position} rotation={[-Math.PI / 2, 0, 0.12]}>
      <mesh geometry={parts.top}>
        <ClothMaterial cloth="dryfit" color={color} />
      </mesh>
      <mesh geometry={parts.bottom}>
        <ClothMaterial cloth="dryfit" color={shade(color, 0.9)} />
      </mesh>
      <group position={[0, -10.4, 2.75]}>
        <mesh geometry={parts.bandTop}>
          <ClothMaterial cloth="cotton" color={shade(color, 0.97)} />
        </mesh>
        <mesh geometry={parts.bandBottom}>
          <ClothMaterial cloth="cotton" color={shade(color, 0.9)} />
        </mesh>
        <mesh geometry={parts.stitch}>
          <meshStandardMaterial color={thread} roughness={0.8} />
        </mesh>
        <mesh geometry={parts.piping}>
          <ClothMaterial cloth="dryfit" color={accent} />
        </mesh>
        {parts.cords.map((g, i) => (
          <mesh key={i} geometry={g}>
            <meshStandardMaterial color={accent} roughness={0.75} />
          </mesh>
        ))}
        {[-1, 1].map((sgn) => (
          <mesh key={sgn} position={[sgn * 3.62, 11.2, 0.36]} rotation-z={-sgn * 0.17}>
            <capsuleGeometry args={[0.36, 1.2, 4, 10]} />
            <meshPhysicalMaterial color={accent} roughness={0.35} clearcoat={0.6} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Modelagem no tamanho da Tabela de Medidas: largura (meio tórax, peça deitada) e comprimento do ombro à barra. */
function sizedCut(cut: ShirtCut, widthCm: number, lengthCm: number): ShirtCut {
  const kw = clamp(widthCm / 2 / cut.chest, 0.4, 2);
  const kl = clamp(lengthCm / cut.length, 0.4, 2);
  // Gola cresce menos que o corpo da peça entre os tamanhos.
  const kn = Math.sqrt(kw);
  return {
    ...cut,
    length: cut.length * kl,
    chest: cut.chest * kw,
    hem: cut.hem * kw,
    neckW: cut.neckW * kn,
    neckFront: cut.neckFront * kl,
    neckBack: cut.neckBack * kl,
    shoulder: cut.shoulder * kw,
    slope: cut.slope * kl,
    armpit: cut.armpit * kl,
    strap: cut.strap * kw,
    depth: cut.depth * kw,
    crotch: cut.crotch * kw,
    sleeveLen: cut.sleeveLen * kl,
    cuff: cut.cuff * kw,
  };
}

type FigureParts = {
  torso: THREE.BufferGeometry;
  neck: THREE.BufferGeometry;
  head: { position: Vec3; scale: Vec3 };
  arms: { position: Vec3; quaternion: THREE.Quaternion; length: number; r0: number; r1: number }[];
  list: THREE.BufferGeometry[];
};

/** Distância mínima (cm) entre o manequim e o tecido. */
const FIGURE_MARGIN = 0.7;

/**
 * Manequim estilizado por dentro da camisa (coordenadas da peça: y = 0 na barra). Tronco em seções
 * elípticas com a largura e a profundidade do corpo escolhido, recortado pelo volume da peça onde ela
 * existe (abaixo da linha do ombro, dentro do contorno e da profundidade do tecido): nunca atravessa o
 * pano. Pescoço elíptico dentro da gola, cabeça oval e braços seguindo o eixo das mangas, mais finos
 * que a boca da manga.
 */
function buildFigure(cut: ShirtCut, parts: ShirtParts, figure: Figure, lift: number): FigureParts {
  const L = cut.length;
  const H = figure.heightCm;
  // Fim do tronco (quadril/coxa): um pouco abaixo da barra, sem passar do meio da coxa.
  const yBottom = Math.max(0.36 * H, Math.min(figure.crotch - 0.03 * H, lift - 5)) - lift;
  const yTop = L - 0.4;
  const rows = 48;
  const cols = 56;
  const rings: THREE.Vector3[][] = [];
  for (let j = 0; j <= rows; j += 1) {
    const yb = lerp(yBottom, yTop, j / rows);
    const section = figure.section(yb + lift);
    const ring: THREE.Vector3[] = [];
    for (let i = 0; i < cols; i += 1) {
      // Começa nas costas (t = π): a emenda da malha fica atrás.
      const t = Math.PI + (i / cols) * Math.PI * 2;
      let x = section.a * Math.sin(t);
      let y = yb;
      let z = section.b * Math.cos(t);
      if (y > -0.5) {
        y = Math.min(y, parts.topLine(Math.abs(x)) - 1.1);
        // Perto do ombro o tecido curva rápido (a malha fica aquém da curva): mais folga ali.
        const margin = FIGURE_MARGIN + 0.8 * smoothstep(L - 12, L, y);
        const maxX = Math.max(0.5, parts.outlineAt(y) - margin);
        if (Math.abs(x) > maxX) x = Math.sign(x) * maxX;
        const maxZ = Math.max(0.15, parts.depth(x, y) - margin);
        if (Math.abs(z) > maxZ) z = Math.sign(z) * maxZ;
      }
      ring.push(new THREE.Vector3(x, y, z));
    }
    rings.push(ring);
  }
  const torso = withCaps(ringsGeometry(rings, true), rings[0], rings[rings.length - 1]);
  weldSeam(torso, rows, cols);

  // Pescoço: dentro da gola (largura do decote e fundo das costas), do ombro até dentro da cabeça.
  const hps = figure.hps - lift;
  const backZ = Math.abs(parts.depth(0, L - cut.neckBack - 0.2));
  const na = Math.min(figure.neck.a, cut.neckW * 0.62);
  const nb = Math.min(figure.neck.b, Math.max(2, backZ * 0.85));
  const neckRings: THREE.Vector3[][] = [];
  for (let j = 0; j <= 6; j += 1) {
    const y = lerp(L - 5, hps + figure.neck.length + 2, j / 6);
    neckRings.push(Array.from({ length: 28 }, (_, i) => new THREE.Vector3(na * Math.sin(Math.PI + (i / 28) * Math.PI * 2), y, nb * Math.cos(Math.PI + (i / 28) * Math.PI * 2))));
  }
  const neck = withCaps(ringsGeometry(neckRings, true), neckRings[0], neckRings[neckRings.length - 1]);
  weldSeam(neck, 6, 28);

  const head = {
    position: [0, hps + figure.neck.length + figure.head.h * 0.36, figure.head.d * 0.07] as Vec3,
    scale: [figure.head.w / 2, figure.head.h / 2, figure.head.d / 2] as Vec3,
  };

  // Braços: do ombro (dentro do tronco) ao longo da manga, saindo um pouco pela boca; cortados retos.
  // Manga comprida cai a ~70° e estreita perto da cava: ali só o antebraço (o que aparece no punho).
  const long = cut.sleeve === "long";
  const up = new THREE.Vector3(0, 1, 0);
  const arms = parts.sleeveAxes.map((axis) => {
    const dir = axis.to.clone().sub(axis.from).normalize();
    const start = long ? axis.from.clone().lerp(axis.to, 0.65) : axis.from.clone().addScaledVector(dir, -4);
    const end = axis.to.clone().addScaledVector(dir, long ? 2.5 : 6);
    const r1 = Math.min(long ? figure.arm.end * 0.62 : figure.arm.end, axis.cuff * 0.72, figure.arm.root);
    const r0 = long ? r1 : Math.min(figure.arm.root, axis.root * 0.55);
    return {
      position: start.clone().add(end).multiplyScalar(0.5).toArray() as Vec3,
      quaternion: new THREE.Quaternion().setFromUnitVectors(up, dir),
      length: start.distanceTo(end),
      r0,
      r1,
    };
  });
  return { torso, neck, head, arms, list: [torso, neck] };
}

/**
 * Camiseta vestida num manequim proporcional ao tamanho (art.mannequin: tamanho da Tabela de Medidas e
 * corpo mais magro / intermediário / mais cheio; sem manequim = manequim invisível). A peça segue a
 * largura e o comprimento do tamanho e nunca fica menor que o corpo (justa estica com ele); o manequim
 * (tronco, pescoço, cabeça e braços) é recortado pelo volume da peça. Frente e costas são painéis
 * "vestidos" (grade do inflate.ts com a altura vinda de um tronco elíptico) que se encontram nas
 * costuras laterais e de ombro e ficam abertos no decote, cavas e barra, com forro escuro visto pelas
 * aberturas. A estampa das costas vem de art.back (vazio = costas sem impressão). Mangas são lofts que
 * saem exatamente do anel da cava; gola canelada, polo (pé + caída, carcela e botões), V ou viés
 * varridos ao longo do decote; pespontos duplos na barra e na manga. Variantes: body com entreperna
 * e colchetes, pijama de manga longa com debrum e calça dobrada, colete furadinho, camisa de futebol
 * (gola V, raglan e risca sublimada), regata de basquete (viés duplo, faixas laterais) e abadá cavado.
 * A estampa entra por Decal no peito (logo pequeno vai para o peito esquerdo), sem distorcer.
 */
/**
 * Camiseta: o modelo novo (busto de vitrine e tecido com caimento) em todas as peças; o pijama usa a
 * blusa sem manequim com a calça dobrada na frente. Só o body de bebê segue no modelo de painéis.
 */
export function TshirtModel(props: ModelProps) {
  if (props.spec.variant === "body") return <PanelTshirtModel {...props} />;
  if (props.spec.variant === "pajama") {
    const accent = props.spec.accentColor ?? contrast(props.spec.baseColor);
    return (
      <TeeModel
        {...props}
        pajama
        extra={({ yHem, front }) => <FoldedPants color={props.spec.baseColor} accent={accent} position={[0, yHem - 1.6, front + 15]} />}
      />
    );
  }
  return <TeeModel {...props} />;
}

function PanelTshirtModel({ spec, art, label }: ModelProps) {
  const printArt = useApparelArt(art);
  const { collar, variant, sleeveless, longSleeve } = spec;
  // Manequim: undefined = padrão (M, intermediário); null = escondido. Body de bebê e pijama ficam sem.
  const mannequin = art.mannequin;
  const dressed = mannequin !== null && variant !== "body" && variant !== "pajama";
  const mSize = mannequin?.size ?? "M";
  const mBody = mannequin?.body ?? "medio";
  const mWidth = mannequin?.widthCm ?? null;
  const mLength = mannequin?.lengthCm ?? null;
  const dress = useMemo(() => (dressed ? dressFor(mSize, mBody, mWidth, mLength) : null), [dressed, mSize, mBody, mWidth, mLength]);
  const cut = useMemo(() => {
    const base = shirtCut({ collar, variant, sleeveless, longSleeve });
    // Vestida: largura e comprimento do tamanho escolhido (Tabela de Medidas), em cm reais.
    return dress ? sizedCut(base, dress.widthCm, dress.lengthCm) : base;
  }, [collar, variant, sleeveless, longSleeve, dress]);
  const figure = useMemo(() => (dress ? figureOf(dress.body) : null), [dress]);
  // O ponto alto do ombro do manequim fica logo abaixo da linha do ombro da peça.
  const lift = figure ? figure.hps - (cut.length - 1.2) : 0;
  const parts = useMemo(() => {
    if (!figure) return buildShirt(cut);
    const fit: BodyFit = { width: (y) => (y <= cut.armpit ? figure.section(y + lift).a : 0), depth: (y) => figure.section(y + lift).b };
    return buildShirt(cut, fit);
  }, [cut, figure, lift]);
  useGeometriesCleanup(parts.list);
  const body = useMemo(() => (figure ? buildFigure(cut, parts, figure, lift) : null), [cut, parts, figure, lift]);
  useGeometriesCleanup(body?.list ?? NO_GEOMETRY);

  const rawW = measure(spec.widthCm, 21);
  const aspect = clamp(rawW / measure(spec.heightCm, 28), 0.2, 5);
  // Altura derivada do aspecto já limitado: o Decal tem sempre a proporção da textura.
  const rawH = rawW / aspect;
  const texture = useArtTexture(aspect, "front", printArt, label);
  // Verso: arte própria (logo nas costas); vazio = sem impressão nas costas.
  const backArt = art.back ?? null;
  const hasBack = hasArtContent(backArt);
  const backRender = useMemo<ArtRender>(
    () => ({ ...(backArt ?? DEFAULT_ART), back: null, ledColors: undefined, kind: art.kind, surface: art.surface, opaque: art.opaque, sample: false }),
    [backArt, art.kind, art.surface, art.opaque],
  );
  const backPrint = useApparelArt(backRender);
  const backTexture = useArtTexture(aspect, "front", backPrint, label);

  const base = spec.baseColor;
  const accent = spec.accentColor ?? contrast(base);
  const needsMap = cut.raglan || cut.pattern !== "none" || cut.cloth === "mesh" || cut.cloth === "fine-mesh";
  const maps = useMemo(() => {
    if (!needsMap) return null;
    const common = { base, accent, cloth: cut.cloth, pattern: cut.pattern, side: parts.side };
    return {
      front: createPanelTexture(parts.frontPolygon, { ...common, raglan: parts.raglan?.front ?? null }),
      back: createPanelTexture(parts.backPolygon, { ...common, raglan: parts.raglan?.back ?? null }),
    };
  }, [needsMap, base, accent, cut, parts]);
  useEffect(
    () => () => {
      maps?.front.dispose();
      maps?.back.dispose();
    },
    [maps],
  );
  const rib = useRibTexture(parts.neckLength / 0.34);

  const L = cut.length;
  const maxW = cut.chest * 2 * 0.78;
  const maxH = L - cut.neckFront - (cut.crotch ? 14 : 10);
  const fit = Math.min(1, maxW / rawW, maxH / rawH);
  const printW = rawW * fit;
  const printH = rawH * fit;
  const chestLogo = rawW <= 12 && rawH <= 12;
  const neckGap = cut.neck === "polo" ? 15 : cut.neck === "crew" ? 5 : cut.neck === "envelope" ? 3 : 3.5;
  const printX = chestLogo ? cut.chest * 0.42 : 0;
  const printY = chestLogo ? cut.armpit + (L - cut.neckFront - cut.armpit) * 0.32 : Math.max((cut.crotch ? 11 : 6) + printH / 2, L - cut.neckFront - neckGap - printH / 2);
  const printZ = parts.depth(printX, printY) + 1;
  const backY = Math.max(6 + printH / 2, L - cut.neckBack - 9 - printH / 2);
  const backZ = -(parts.depth(0, backY) + 1);
  const sublimated = cut.cloth !== "cotton" && cut.cloth !== "pique";

  const lining = liningOf(base);
  const sleeveColor = cut.raglan ? accent : base;
  const trimColor = (role: ShirtParts["trims"][number]["role"]) => {
    if (role === "neck") return cut.raglan ? accent : cut.neck === "polo" ? base : shade(base, 0.97);
    if (role === "binding") return cut.crotch ? mix(base, "#ffffff", 0.2) : accent;
    if (role === "binding2") return contrast(accent);
    if (role === "cuff") return cut.raglan || spec.variant === "pajama" ? accent : shade(base, 0.97);
    return base;
  };
  // O Decal projeta na malha na montagem: muda a malha (corte, tamanho, corpo), remonta o Decal.
  const geometryKey = `${variant}-${collar}-${sleeveless}-${longSleeve}-${dress ? `${mSize}-${mBody}-${dress.widthCm}-${dress.lengthCm}` : "solta"}`;
  const labelY = L - cut.neckBack - 2;
  const skin = luminance(base) > 0.45 ? "#9d978f" : "#e4e0d9";
  const skinMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: skin, roughness: 0.62 }), [skin]);
  useEffect(() => () => skinMaterial.dispose(), [skinMaterial]);

  return (
    <TurnGroup base={0.14} scale={SHIRT_UNIT}>
      <mesh geometry={parts.front}>
        <ClothMaterial cloth={cut.cloth} color={base} map={maps?.front} />
        <Decal key={geometryKey} position={[printX, printY, printZ]} rotation={[0, 0, 0]} scale={[printW, printH, 16]} depthTest>
          <meshPhysicalMaterial map={texture} transparent alphaTest={0.02} roughness={sublimated ? 0.58 : 0.72} sheen={0.35} sheenRoughness={0.5} sheenColor="#ffffff" polygonOffset polygonOffsetFactor={-10} depthTest />
        </Decal>
      </mesh>
      <mesh geometry={parts.front}>
        <meshStandardMaterial color={lining} roughness={1} side={THREE.BackSide} />
      </mesh>
      <mesh geometry={parts.back}>
        <ClothMaterial cloth={cut.cloth} color={base} map={maps?.back} />
        {hasBack && (
          <Decal key={geometryKey} position={[0, backY, backZ]} rotation={[0, Math.PI, 0]} scale={[printW, printH, 16]} depthTest>
            <meshPhysicalMaterial map={backTexture} transparent alphaTest={0.02} roughness={sublimated ? 0.58 : 0.72} polygonOffset polygonOffsetFactor={-10} depthTest />
          </Decal>
        )}
      </mesh>
      <mesh geometry={parts.back}>
        <meshStandardMaterial color={lining} roughness={1} side={THREE.BackSide} />
      </mesh>
      {parts.sleeves.map((g, i) => (
        <group key={i}>
          <mesh geometry={g}>
            <ClothMaterial cloth={cut.cloth} color={sleeveColor} />
          </mesh>
          <mesh geometry={g}>
            <meshStandardMaterial color={liningOf(sleeveColor)} roughness={1} side={THREE.BackSide} />
          </mesh>
        </group>
      ))}
      {parts.trims.map((t, i) => (
        <mesh key={i} geometry={t.geometry}>
          {t.role === "neck" && cut.neck !== "polo" ? (
            <meshPhysicalMaterial color={trimColor(t.role)} map={rib} roughness={0.9} sheen={0.8} sheenRoughness={0.6} sheenColor="#ffffff" />
          ) : (
            <ClothMaterial cloth={t.role === "neck" || t.role === "cuff" ? (cut.cloth === "pique" ? "pique" : "cotton") : cut.cloth === "cotton" || cut.cloth === "pique" ? cut.cloth : "dryfit"} color={trimColor(t.role)} />
          )}
        </mesh>
      ))}
      <mesh geometry={parts.seams}>
        <ClothMaterial cloth={cut.cloth} color={shade(base, 0.93)} />
      </mesh>
      <mesh geometry={parts.stitches}>
        <meshStandardMaterial color={threadOf(base)} roughness={0.85} />
      </mesh>
      {parts.placket && (
        <mesh geometry={parts.placket}>
          <ClothMaterial cloth="pique" color={base} />
        </mesh>
      )}
      {parts.buttons.map((p) => (
        <group key={p[1]} position={p}>
          <mesh rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.58, 0.58, 0.22, 24]} />
            <meshPhysicalMaterial color={luminance(base) > 0.35 ? "#f2efe8" : "#1d1d1f"} roughness={0.25} clearcoat={0.8} />
          </mesh>
          {[
            [-0.16, 0.16],
            [0.16, 0.16],
            [-0.16, -0.16],
            [0.16, -0.16],
          ].map(([x, y]) => (
            <mesh key={`${x}${y}`} position={[x, y, 0.1]}>
              <circleGeometry args={[0.07, 10]} />
              <meshBasicMaterial color="#3a3a3a" />
            </mesh>
          ))}
        </group>
      ))}
      {parts.snaps.map((p) => (
        <mesh key={p[0]} position={p} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.42, 0.46, 0.22, 20]} />
          <meshStandardMaterial color="#d8d9dc" metalness={1} roughness={0.28} />
        </mesh>
      ))}
      <NeckLabel position={[0, labelY, -parts.depth(0, labelY) + 0.25]} size={dress ? mSize : "M"} />
      {spec.variant === "pajama" && <FoldedPants color={base} accent={accent} position={[0, -1.6, cut.depth + 17]} />}
      {body && (
        <group>
          <mesh geometry={body.torso} material={skinMaterial} />
          <mesh geometry={body.neck} material={skinMaterial} />
          <mesh position={body.head.position} scale={body.head.scale} material={skinMaterial}>
            <sphereGeometry args={[1, 40, 28]} />
          </mesh>
          {body.arms.map((arm, i) => (
            <mesh key={i} position={arm.position} quaternion={arm.quaternion} material={skinMaterial}>
              <cylinderGeometry args={[arm.r1, arm.r0, arm.length, 24]} />
            </mesh>
          ))}
        </group>
      )}
    </TurnGroup>
  );
}

// ---------------------------------------------------------------------------- boné

/** Unidades de cena por centímetro: boné com ≈ 27 cm da nuca à ponta da aba. */
const CAP_UNIT = 2.2 / 27;

/** Copa: base elíptica (meio comprimento, meia largura), altura e expoente da superelipse vertical. */
const CAP = { a: 10, b: 8.8, h: 11.4, p: 2.4, lean: 1, archW: 4, archH: 6.2 };

function capHeight(theta: number, s: number) {
  return CAP.h * (0.93 + 0.07 * Math.cos(theta) * (1 - s ** 4));
}

/** Ponto da copa: theta = 0 na frente (+z), phi de 0 (base) a π/2 (topo). */
function capPoint(theta: number, phi: number, out = new THREE.Vector3()) {
  const e = 2 / CAP.p;
  const s = Math.pow(Math.sin(phi), e);
  const c = Math.pow(Math.max(0, Math.cos(phi)), e);
  // Gomos levemente estufados entre as costuras.
  const puff = 1 + 0.016 * 0.5 * (1 - Math.cos(6 * theta)) * Math.sin(Math.PI * Math.min(1, s * 1.15));
  return out.set(CAP.b * Math.sin(theta) * c * puff, capHeight(theta, s) * s, CAP.a * Math.cos(theta) * c * puff - CAP.lean * s);
}

/** phi em que a copa passa pela altura y (aproximado pela altura média). */
function capPhiAt(y: number, theta: number) {
  let lo = 0;
  let hi = Math.PI / 2;
  for (let k = 0; k < 24; k += 1) {
    const mid = (lo + hi) / 2;
    if (capPoint(theta, mid).y < y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function capNormal(theta: number, phi: number) {
  const e = 1e-3;
  const p0 = capPoint(theta, phi);
  const du = capPoint(theta + e, phi).sub(p0);
  const dv = capPoint(theta, Math.min(Math.PI / 2, phi + e)).sub(p0);
  // Com theta crescendo para +x e phi subindo, du × dv já aponta para fora da copa.
  return du.cross(dv).normalize();
}

/** Abertura de trás (arco do regulador) em coordenadas da copa. */
function insideArch(x: number, y: number, z: number) {
  if (z > 0) return false;
  const r = CAP.archW;
  const ax = Math.abs(x);
  if (ax >= r) return false;
  return y < CAP.archH - r + Math.sqrt(r * r - ax * ax);
}

function buildCap(printBottom: number, printTop: number) {
  const cols = 144;
  const rows = 44;
  const rings: THREE.Vector3[][] = [];
  for (let j = 0; j <= rows; j += 1) {
    const phi = (j / rows) * (Math.PI / 2) * 0.999;
    rings.push(Array.from({ length: cols }, (_, i) => capPoint((i / cols) * Math.PI * 2, phi)));
  }
  const crown = ringsGeometry(rings, true);

  // Máscara da abertura de trás (alphaMap no UV da copa: u = theta, v = phi).
  const mask = document.createElement("canvas");
  mask.width = 512;
  mask.height = 128;
  const ctx = mask.getContext("2d");
  if (ctx) {
    const img = ctx.createImageData(mask.width, mask.height);
    const p = new THREE.Vector3();
    for (let y = 0; y < mask.height; y += 1) {
      const v = 1 - (y + 0.5) / mask.height;
      for (let x = 0; x < mask.width; x += 1) {
        capPoint(((x + 0.5) / mask.width) * Math.PI * 2, v * (Math.PI / 2) * 0.999, p);
        const k = (y * mask.width + x) * 4;
        const open = insideArch(p.x, p.y, p.z);
        img.data[k] = img.data[k + 1] = img.data[k + 2] = open ? 0 : 255;
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const alpha = canvasTexture(mask);

  // Contorno do arco sobre a copa (viés).
  const archPts: THREE.Vector3[] = [];
  const r = CAP.archW;
  const outline: Pt[] = [[-r, 0]];
  for (let k = 0; k <= 20; k += 1) {
    const t = Math.PI - (k / 20) * Math.PI;
    outline.push([r * Math.cos(t), CAP.archH - r + r * Math.sin(t)]);
  }
  outline.push([r, 0]);
  outline.forEach(([x, y]) => {
    const yy = Math.max(0.15, y);
    let theta = Math.PI;
    let phi = capPhiAt(yy, theta);
    for (let it = 0; it < 4; it += 1) {
      const c = Math.pow(Math.max(0, Math.cos(phi)), 2 / CAP.p);
      theta = Math.PI - Math.asin(clamp(x / (CAP.b * Math.max(0.05, c)), -1, 1));
      phi = capPhiAt(yy, theta);
    }
    archPts.push(capPoint(theta, phi).multiplyScalar(1.006));
  });
  const archBinding = openTubeGeometry(archPts, 0.36, 8);

  // Costuras dos seis gomos e pespontos duplos.
  const seamList: THREE.BufferGeometry[] = [];
  const stitchList: THREE.BufferGeometry[] = [];
  const topPhi = Math.PI / 2 - 0.08;
  const seamRun = (theta: number, phi0: number, phi1: number) => {
    const along = (dTheta: number, lift: number) =>
      Array.from({ length: 28 }, (_, i) => {
        const phi = lerp(phi0, phi1, i / 27);
        const c = Math.pow(Math.max(0.02, Math.cos(phi)), 2 / CAP.p);
        const p = capPoint(theta + dTheta / (CAP.b * c + 0.6), phi);
        return p.addScaledVector(capNormal(theta, phi), lift);
      });
    seamList.push(openTubeGeometry(along(0, 0.02), 0.13, 6));
    stitchList.push(stitchGeometry(along(0.55, 0.05), 0.3, 0.2, 0.035), stitchGeometry(along(-0.55, 0.05), 0.3, 0.2, 0.035));
  };
  for (let k = 0; k < 6; k += 1) {
    const theta = (k * Math.PI) / 3;
    if (k === 0) {
      // Frente: a emenda some debaixo da estampa e reaparece acima dela.
      const below = capPhiAt(printBottom - 0.4, theta);
      const above = capPhiAt(printTop + 0.4, theta);
      if (printBottom > 1.6) seamRun(theta, 0, below);
      if (above < topPhi - 0.12) seamRun(theta, above, topPhi);
      continue;
    }
    seamRun(theta, k === 3 ? capPhiAt(CAP.archH + 0.4, theta) : 0, topPhi);
  }
  // Pesponto da base na frente (fixa a carneira).
  stitchList.push(
    stitchGeometry(
      Array.from({ length: 60 }, (_, i) => {
        const theta = lerp(-1.95, 1.95, i / 59);
        const phi = capPhiAt(1.1, theta);
        return capPoint(theta, phi).addScaledVector(capNormal(theta, phi), 0.05);
      }),
      0.3,
      0.2,
      0.035,
    ),
  );

  // Ilhoses bordados: um por gomo, perto do topo.
  const eyelets = Array.from({ length: 6 }, (_, k) => {
    const theta = (k * Math.PI) / 3 + Math.PI / 6;
    const phi = capPhiAt(CAP.h * 0.8, theta);
    const p = capPoint(theta, phi);
    const n = capNormal(theta, phi);
    return { position: p.toArray() as Vec3, quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n) };
  });

  // Aba pré-curvada: crescente que sai da base da frente, com borda arredondada.
  const visorCols = 48;
  const thetaB = 1.22;
  const length = 7.6;
  const half = 0.17;
  const visorPoint = (u: number, v: number, dy: number) => {
    const theta = u * thetaB;
    const base = new THREE.Vector3(CAP.b * Math.sin(theta) * 0.99, 0, CAP.a * Math.cos(theta) * 0.99);
    const n = new THREE.Vector3(Math.sin(theta) / CAP.b, 0, Math.cos(theta) / CAP.a).normalize();
    const len = length * Math.pow(Math.max(0, 1 - u * u), 0.55);
    const p = base.addScaledVector(n, len * v);
    p.y += dy - 0.021 * p.x * p.x * v - 1.2 * v * v;
    return p;
  };
  const visorRings: THREE.Vector3[][] = [];
  for (let i = 0; i <= visorCols; i += 1) {
    const u = lerp(-0.995, 0.995, i / visorCols);
    const loop: THREE.Vector3[] = [];
    for (let k = 0; k <= 14; k += 1) loop.push(visorPoint(u, k / 14, half));
    const tip = visorPoint(u, 1, 0);
    const out = tip.clone().sub(visorPoint(u, 0.97, 0)).setY(0).normalize();
    for (let k = 1; k <= 3; k += 1) {
      const t = (k / 4) * Math.PI;
      loop.push(tip.clone().addScaledVector(out, Math.sin(t) * half).setY(tip.y + Math.cos(t) * half));
    }
    for (let k = 14; k >= 0; k -= 1) loop.push(visorPoint(u, k / 14, -half));
    visorRings.push(loop);
  }
  const visor = ringsGeometry(visorRings, true);
  // Oito carreiras de pesponto acompanhando a borda da aba.
  for (const d of [0.55, 1.15, 1.75, 2.35, 2.95, 3.55, 4.15, 4.75]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i += 1) {
      const u = lerp(-0.99, 0.99, i / 64);
      const len = length * Math.pow(Math.max(0, 1 - u * u), 0.55);
      if (len < d + 0.6) continue;
      pts.push(visorPoint(u, 1 - d / len, half + 0.03));
    }
    if (pts.length > 2) stitchList.push(stitchGeometry(pts, 0.3, 0.18, 0.035));
  }

  // Carneira (faixa interna) e regulador de trás com fivela.
  const base: THREE.Vector3[] = Array.from({ length: 96 }, (_, i) => {
    const theta = (i / 96) * Math.PI * 2;
    return new THREE.Vector3(CAP.b * Math.sin(theta) * 0.97, 1.6, CAP.a * Math.cos(theta) * 0.97);
  });
  const axis = (p: THREE.Vector3) => new THREE.Vector3(p.x, 0, p.z);
  const sweatband = sweepGeometry(base, true, () => roundedProfile(3, 0.2), new THREE.Vector3(0, 1, 0), axis);
  const strapPath = Array.from({ length: 24 }, (_, i) => {
    const theta = Math.PI + lerp(-0.62, 0.62, i / 23);
    const phi = capPhiAt(1.5, theta);
    return capPoint(theta, phi).addScaledVector(capNormal(theta, phi), 0.2);
  });
  const strap = sweepGeometry(strapPath, false, () => roundedProfile(2.3, 0.22), new THREE.Vector3(0, 1, 0), axis);
  const tailPath = Array.from({ length: 10 }, (_, i) => {
    const theta = Math.PI + lerp(-0.05, 0.42, i / 9);
    const phi = capPhiAt(1.5, theta);
    return capPoint(theta, phi).addScaledVector(capNormal(theta, phi), 0.48);
  });
  const tail = sweepGeometry(tailPath, false, () => roundedProfile(2.1, 0.2), new THREE.Vector3(0, 1, 0), axis);
  const bucklePhi = capPhiAt(1.5, Math.PI);
  const buckleAt = capPoint(Math.PI, bucklePhi).addScaledVector(capNormal(Math.PI, bucklePhi), 0.42);
  const frame = (() => {
    const s = new THREE.Shape();
    const w = 1.5;
    const h = 1.55;
    const rr = 0.35;
    s.moveTo(-w + rr, -h);
    s.lineTo(w - rr, -h);
    s.quadraticCurveTo(w, -h, w, -h + rr);
    s.lineTo(w, h - rr);
    s.quadraticCurveTo(w, h, w - rr, h);
    s.lineTo(-w + rr, h);
    s.quadraticCurveTo(-w, h, -w, h - rr);
    s.lineTo(-w, -h + rr);
    s.quadraticCurveTo(-w, -h, -w + rr, -h);
    return closedTubeGeometry(
      s.getSpacedPoints(48).slice(0, -1).map((q) => new THREE.Vector3(q.x, q.y, 0)),
      0.16,
      8,
    );
  })();

  const seams = mergeSimple(seamList);
  const stitches = mergeSimple(stitchList);
  return {
    crown,
    alpha,
    archBinding,
    seams,
    stitches,
    eyelets,
    visor,
    sweatband,
    strap,
    tail,
    buckle: { geometry: frame, position: buckleAt.toArray() as Vec3 },
    list: [crown, archBinding, seams, stitches, visor, sweatband, strap, tail, frame],
  };
}

/**
 * Boné de seis gomos estruturado. A copa é uma superelipse sobre base elíptica (gomos levemente
 * estufados), com abertura de trás recortada por alphaMap e acabada com viés, regulador com fivela
 * metálica, botão no topo, ilhoses bordados, costuras com pesponto duplo, carneira interna e aba
 * pré-curvada com oito carreiras de pesponto. A estampa (DTF 12 × 6 cm) entra por Decal na frente.
 */
export function CapModel({ spec, art, label }: ModelProps) {
  const printArt = useApparelArt(art);
  const rawW = measure(spec.widthCm, 12);
  const aspect = clamp(rawW / measure(spec.heightCm, 6), 0.2, 5);
  const rawH = rawW / aspect;
  const texture = useArtTexture(aspect, "front", printArt, label);

  const fit = Math.min(1, 15 / rawW, 8 / rawH);
  const printW = rawW * fit;
  const printH = rawH * fit;
  const printY = 2.2 + printH / 2 + Math.max(0, (8 - printH) * 0.25);
  // A costura do meio da frente para nas bordas da estampa (o transfer cobre a emenda).
  const printBottom = Math.round((printY - printH / 2) * 10) / 10;
  const printTop = Math.round((printY + printH / 2) * 10) / 10;
  const parts = useMemo(() => buildCap(printBottom, printTop), [printBottom, printTop]);
  useGeometriesCleanup(parts.list);
  useEffect(() => () => parts.alpha.dispose(), [parts]);
  const base = spec.baseColor;
  const visorColor = spec.accentColor ?? base;
  const light = luminance(base) > 0.35;
  const inner = light ? "#ebe8e1" : "#2a2a2c";

  return (
    <group rotation-y={0.36} scale={CAP_UNIT}>
      {/* Apoiado como numa mesa: a nuca encosta no chão e a aba sobe um pouco. */}
      <group rotation-x={-0.18}>
        <mesh geometry={parts.crown}>
          <meshPhysicalMaterial color={base} alphaMap={parts.alpha} alphaTest={0.5} roughness={0.9} sheen={light ? 0.8 : 0.5} sheenRoughness={0.6} sheenColor="#ffffff" />
          <Decal position={[0, printY, CAP.a - 1.5]} rotation={[0, 0, 0]} scale={[printW, printH, 9]} depthTest>
            <meshPhysicalMaterial map={texture} transparent alphaTest={0.02} roughness={0.6} clearcoat={0.15} polygonOffset polygonOffsetFactor={-10} depthTest />
          </Decal>
        </mesh>
        <mesh geometry={parts.crown}>
          <meshStandardMaterial color={inner} alphaMap={parts.alpha} alphaTest={0.5} roughness={1} side={THREE.BackSide} />
        </mesh>
        <mesh geometry={parts.archBinding}>
          <ClothMaterial cloth="cotton" color={shade(base, 0.95)} />
        </mesh>
        <mesh geometry={parts.seams}>
          <ClothMaterial cloth="cotton" color={shade(base, 0.92)} />
        </mesh>
        <mesh geometry={parts.stitches}>
          <meshStandardMaterial color={threadOf(base)} roughness={0.85} />
        </mesh>
        {parts.eyelets.map((e, i) => (
          <group key={i} position={e.position} quaternion={e.quaternion}>
            <mesh>
              <torusGeometry args={[0.36, 0.11, 6, 20]} />
              <meshStandardMaterial color={threadOf(base)} roughness={0.8} />
            </mesh>
            <mesh position-z={0.02}>
              <circleGeometry args={[0.26, 16]} />
              <meshBasicMaterial color="#141414" />
            </mesh>
          </group>
        ))}
        <mesh position={[0, CAP.h * 0.93 - 0.05, -CAP.lean]} scale={[1, 0.5, 1]}>
          <sphereGeometry args={[0.8, 20, 12]} />
          <ClothMaterial cloth="cotton" color={visorColor} />
        </mesh>
        <mesh geometry={parts.visor}>
          <ClothMaterial cloth="cotton" color={visorColor} />
        </mesh>
        <mesh geometry={parts.sweatband}>
          <meshStandardMaterial color={inner} roughness={0.95} />
        </mesh>
        <mesh geometry={parts.strap}>
          <ClothMaterial cloth="cotton" color={shade(base, 0.96)} />
        </mesh>
        <mesh geometry={parts.tail}>
          <ClothMaterial cloth="cotton" color={shade(base, 0.9)} />
        </mesh>
        <mesh geometry={parts.buckle.geometry} position={parts.buckle.position} rotation-y={Math.PI}>
          <meshStandardMaterial color="#cfd2d6" metalness={1} roughness={0.25} />
        </mesh>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- avental

/** Unidades de cena por centímetro: avental adulto (80 cm) com a alça do pescoço por cima. */
const APRON_UNIT = 2.4 / 96;

type ApronStyle = "classic" | "pro" | "coloring";

/** Fita (alça/tira) varrida ao longo do caminho, com a face larga apontando para `normalAt`. */
function tapeGeometry(points: THREE.Vector3[], width: number, thick: number, normalAt: (p: THREE.Vector3) => THREE.Vector3, samples = 64) {
  const path = new THREE.CatmullRomCurve3(points, false, "centripetal").getSpacedPoints(samples);
  return sweepGeometry(path, false, () => roundedProfile(width, thick, 0, 2), (p, t) => new THREE.Vector3().crossVectors(t, normalAt(p)), normalAt);
}

/** Polígono de bolso: topo reto (boca), cantos de baixo arredondados. */
function pocketPolygon(cx: number, cy: number, w: number, h: number) {
  const r = Math.min(1.6, w / 4, h / 4);
  const pts: Pt[] = [];
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  pts.push([x0, y1]);
  pushLine(pts, [x0, y1], [x0, y0 + r], 10);
  pushQuad(pts, [x0, y0 + r], [x0, y0], [x0 + r, y0], 4);
  pushLine(pts, [x0 + r, y0], [x1 - r, y0], 14);
  pushQuad(pts, [x1 - r, y0], [x1, y0], [x1, y0 + r], 4);
  pushLine(pts, [x1, y0 + r], [x1, y1], 10);
  pushLine(pts, [x1, y1], [x0, y1], 14);
  pts.pop();
  return pts;
}

type Pocket = { cx: number; cy: number; w: number; h: number; puff: number; divider: boolean };

function buildApron(W: number, H: number, style: ApronStyle) {
  const waistY = H * 0.62;
  const bibHalf = W * 0.215;
  const r = Math.min(4, W * 0.06);
  const half: Pt[] = [[0, 0]];
  pushLine(half, [0, 0], [W / 2 - r, 0], 12);
  pushQuad(half, [W / 2 - r, 0], [W / 2, 0], [W / 2, r], 4);
  pushLine(half, [W / 2, r], [W / 2, waistY], 20);
  pushQuad(half, [W / 2, waistY], [bibHalf + 0.8, waistY + 1.5], [bibHalf, H * 0.86], 18);
  pushLine(half, [bibHalf, H * 0.86], [bibHalf, H], 4);
  pushLine(half, [bibHalf, H], [0, H], 6);
  const polygon = mirrorHalf(half);

  // Forma vestida: curva do corpo, caimento em pregas na saia e franzido da amarração na cintura.
  const shapeZ = (x: number, y: number) => {
    const R = lerp(42, 70, smoothstep(waistY * 0.8, H * 0.85, y));
    const below = clamp(1 - y / waistY, 0, 1);
    let z = -(x * x) / (2 * R);
    z += 0.9 * below * below * Math.sin(x * 0.32 + 0.6) + 0.35 * below * Math.sin(x * 0.71 - 1.1);
    z -= 0.7 * Math.exp(-(((y - waistY) / 3.5) ** 2)) * (x / (W / 2)) ** 2;
    z -= 0.03 * Math.max(0, y - waistY);
    return z;
  };
  const T = 0.16;
  const panel = (side: 1 | -1) => {
    const g = inflatedSurface(polygon, { height: 1, falloff: 0.7, resolution: 120, side });
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 1) pos.setZ(i, shapeZ(pos.getX(i), pos.getY(i)) + T * pos.getZ(i));
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  };
  const front = panel(1);
  const back = panel(-1);
  const edge = closedTubeGeometry(
    polygon.map((p) => new THREE.Vector3(p.x, p.y, shapeZ(p.x, p.y))),
    T * 1.15,
    6,
  );

  // Bolsos: canguru (clássico e colorir) ou dois bolsos + porta-caneta (profissional).
  const pockets: Pocket[] =
    style === "pro"
      ? [
          { cx: -W * 0.235, cy: H * 0.3, w: W * 0.31, h: H * 0.2, puff: 0.5, divider: false },
          { cx: W * 0.235, cy: H * 0.3, w: W * 0.31, h: H * 0.2, puff: 0.5, divider: false },
          { cx: -bibHalf * 0.5, cy: H * 0.79, w: 4.8, h: 12, puff: 1.3, divider: false },
        ]
      : [{ cx: 0, cy: H * 0.3, w: W * 0.62, h: H * 0.2, puff: style === "coloring" ? 2.1 : 0.45, divider: true }];
  const pocketZ = (pk: Pocket, x: number, y: number) =>
    shapeZ(x, y) + T + 0.08 + pk.puff * profile(Math.abs(x - pk.cx) / (pk.w / 2)) * roundEnd((y - (pk.cy - pk.h / 2)) / (pk.h * 0.55));
  const stitchList: THREE.BufferGeometry[] = [];
  const pocketParts = pockets.map((pk) => {
    const poly = pocketPolygon(pk.cx, pk.cy, pk.w, pk.h).map(([x, y]) => new THREE.Vector2(x, y));
    const g = inflatedSurface(poly, { height: 1, resolution: 48, side: 1 });
    const pos = g.attributes.position as THREE.BufferAttribute;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, pocketZ(pk, x, y));
      // Mesmo mapeamento do painel: a estampa continua por cima do bolso.
      uv.setXY(i, (x + W / 2) / W, y / H);
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    g.computeVertexNormals();
    const topY = pk.cy + pk.h / 2;
    const mouth = openTubeGeometry(
      Array.from({ length: 24 }, (_, k) => {
        const x = lerp(pk.cx - pk.w / 2, pk.cx + pk.w / 2, k / 23);
        return new THREE.Vector3(x, topY, pocketZ(pk, x, topY - 0.01));
      }),
      0.22,
      6,
    );
    // Pesponto em U (laterais e fundo) e barra da boca.
    const inset = 0.5;
    const u: THREE.Vector3[] = [];
    const add = (x: number, y: number) => u.push(new THREE.Vector3(x, y, pocketZ(pk, x, y) + 0.05));
    for (let k = 0; k <= 12; k += 1) add(pk.cx - pk.w / 2 + inset, lerp(topY - 0.3, pk.cy - pk.h / 2 + inset, k / 12));
    for (let k = 1; k <= 20; k += 1) add(lerp(pk.cx - pk.w / 2 + inset, pk.cx + pk.w / 2 - inset, k / 20), pk.cy - pk.h / 2 + inset);
    for (let k = 1; k <= 12; k += 1) add(pk.cx + pk.w / 2 - inset, lerp(pk.cy - pk.h / 2 + inset, topY - 0.3, k / 12));
    stitchList.push(stitchGeometry(u, 0.36, 0.22, 0.04));
    const hemY = topY - 1.2;
    stitchList.push(
      stitchGeometry(
        Array.from({ length: 24 }, (_, k) => {
          const x = lerp(pk.cx - pk.w / 2 + 0.4, pk.cx + pk.w / 2 - 0.4, k / 23);
          return new THREE.Vector3(x, hemY, pocketZ(pk, x, hemY) + 0.05);
        }),
        0.36,
        0.22,
        0.04,
      ),
    );
    if (pk.divider) {
      for (const dx of [-0.25, 0.25]) {
        stitchList.push(
          stitchGeometry(
            Array.from({ length: 12 }, (_, k) => {
              const y = lerp(topY - 0.4, pk.cy - pk.h / 2 + 0.6, k / 11);
              return new THREE.Vector3(pk.cx + dx, y, pocketZ(pk, pk.cx + dx, y) + 0.05);
            }),
            0.36,
            0.22,
            0.04,
          ),
        );
      }
    }
    return { surface: g, mouth };
  });

  // Pesponto da bainha a 1 cm da borda (contorno anti-horário: normal interna = (-dy, dx)).
  const n = polygon.length;
  const hem = polygon.map((p, i) => {
    const a = polygon[(i - 1 + n) % n];
    const b = polygon[(i + 1) % n];
    const d = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
    const x = p.x - d.y * 1.0;
    const y = p.y + d.x * 1.0;
    return new THREE.Vector3(x, y, shapeZ(x, y) + T + 0.03);
  });
  stitchList.push(stitchGeometry(hem, 0.4, 0.24, 0.04, true));

  // Alça do pescoço: sobe dos cantos do peitilho e contorna um pescoço invisível.
  const bx = bibHalf - 1.6;
  const z0 = shapeZ(bx, H) + T;
  const neckPts = [
    new THREE.Vector3(bx, H - 1.6, z0 + 0.3),
    new THREE.Vector3(bx - 0.5, H + 4, z0 - 0.5),
    new THREE.Vector3(bx * 0.66, H + 10.5, -3),
    new THREE.Vector3(6.8, H + 13.6, -7),
    new THREE.Vector3(4.6, H + 14.4, -11.6),
    new THREE.Vector3(0, H + 14.7, -13.3),
  ];
  const neckPath = [...neckPts, ...neckPts.slice(0, -1).reverse().map((p) => new THREE.Vector3(-p.x, p.y, p.z))];
  const neckNormal = (p: THREE.Vector3) => {
    const radial = new THREE.Vector3(p.x, 0, p.z + 7.2).normalize();
    return new THREE.Vector3(0, 0, 1).lerp(radial, smoothstep(H + 3, H + 12, p.y)).normalize();
  };
  const tapes: THREE.BufferGeometry[] = [tapeGeometry(neckPath, 2.5, 0.28, neckNormal, 96)];

  // Tiras da cintura: contornam a cintura até o laço nas costas.
  const ty = waistY - 1.3;
  const rx = W / 2 + 1;
  const rz = 14;
  const cz = -12;
  const waistNormal = (p: THREE.Vector3) => new THREE.Vector3(p.x / (rx * rx), 0, (p.z - cz) / (rz * rz)).normalize();
  for (const sgn of [1, -1]) {
    const corner = new THREE.Vector3(sgn * (W / 2 - 0.3), ty, shapeZ(W / 2, ty));
    const pts = [corner];
    const t0 = Math.asin(clamp((W / 2 + 0.6) / rx, -1, 1));
    for (let k = 0; k <= 8; k += 1) {
      const t = lerp(Math.max(t0, Math.PI - t0 - 0.2), Math.PI - 0.12, k / 8);
      pts.push(new THREE.Vector3(sgn * rx * Math.sin(t), ty, cz + rz * Math.cos(t)));
    }
    tapes.push(tapeGeometry(pts, 2.6, 0.26, waistNormal, 48));
  }
  // Laço: duas orelhas, nó e pontas caídas.
  const bowZ = cz - rz - 0.7;
  const backN = () => new THREE.Vector3(0, 0, -1);
  for (const sgn of [1, -1]) {
    const loop = Array.from({ length: 28 }, (_, k) => {
      const a = (k / 28) * Math.PI * 2;
      return new THREE.Vector3(sgn * (3.9 + 3.6 * Math.cos(a)), ty + 0.6 + 2.2 * Math.sin(a) + sgn * 0.5 * Math.cos(a), bowZ - 0.5 - 0.6 * (1 + Math.cos(a)));
    });
    tapes.push(sweepGeometry([...loop], true, () => roundedProfile(2.3, 0.24, 0, 2), (_p, t) => new THREE.Vector3().crossVectors(t, backN()), backN));
    tapes.push(
      tapeGeometry(
        [
          new THREE.Vector3(sgn * 0.6, ty - 0.4, bowZ - 0.6),
          new THREE.Vector3(sgn * 1.8, ty - 6, bowZ - 0.9),
          new THREE.Vector3(sgn * 2.4, ty - 13, bowZ - 0.4),
          new THREE.Vector3(sgn * (3.4 + sgn * 0.2), ty - 21, bowZ - 0.8),
        ],
        2.5,
        0.24,
        backN,
        40,
      ),
    );
  }
  const knot = (() => {
    const g = new THREE.SphereGeometry(1.7, 20, 14);
    g.scale(1, 0.85, 0.6);
    g.translate(0, ty + 0.2, bowZ - 0.9);
    return g;
  })();
  tapes.push(knot);
  const strapGeometry = mergeSimple(tapes);

  // Profissional: ilhoses no peitilho e regulador metálico na alça.
  const grommets: Vec3[] = style === "pro" ? [-1, 1].map((sgn) => [sgn * bx, H - 1.6, z0 + 0.06] as Vec3) : [];
  let slider: { position: Vec3; quaternion: THREE.Quaternion } | null = null;
  if (style === "pro") {
    const curve = new THREE.CatmullRomCurve3(neckPath, false, "centripetal");
    const t = 0.16;
    const p = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const nn = neckNormal(p);
    const across = new THREE.Vector3().crossVectors(tangent, nn).normalize();
    const along = new THREE.Vector3().crossVectors(nn, across).normalize();
    const m = new THREE.Matrix4().makeBasis(across, along, nn);
    slider = { position: p.addScaledVector(nn, 0.35).toArray() as Vec3, quaternion: new THREE.Quaternion().setFromRotationMatrix(m) };
  }
  const sliderFrame = closedTubeGeometry(
    Array.from({ length: 40 }, (_, k) => {
      const a = (k / 40) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      return new THREE.Vector3(Math.sign(c) * Math.pow(Math.abs(c), 0.35) * 1.75, Math.sign(s) * Math.pow(Math.abs(s), 0.35) * 0.75, 0);
    }),
    0.17,
    6,
  );
  const stitches = mergeSimple(stitchList);
  const list = [front, back, edge, stitches, strapGeometry, sliderFrame, ...pocketParts.flatMap((p) => [p.surface, p.mouth])];
  return { front, back, edge, pockets, pocketParts, pocketZ, stitches, strapGeometry, grommets, slider, sliderFrame, shapeZ, T, list };
}

/** Converte a arte em desenho de colorir: contornos escuros (Sobel) sobre fundo branco. */
const lineArtMask: MaskPath = (ctx, w, h) => {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    const a = d[i * 4 + 3] / 255;
    const l = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
    lum[i] = a * l + (1 - a);
  }
  const out = ctx.createImageData(w, h);
  const o = out.data;
  const k = 2;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let ink = 0;
      if (x >= k && y >= k && x < w - k && y < h - k) {
        const at = (dx: number, dy: number) => lum[(y + dy) * w + x + dx];
        const gx = at(k, -k) + 2 * at(k, 0) + at(k, k) - at(-k, -k) - 2 * at(-k, 0) - at(-k, k);
        const gy = at(-k, k) + 2 * at(0, k) + at(k, k) - at(-k, -k) - 2 * at(0, -k) - at(k, -k);
        ink = clamp((Math.hypot(gx, gy) - 0.35) * 1.6, 0, 1);
      }
      const v = Math.round(255 - ink * 232);
      const j = (y * w + x) * 4;
      o[j] = o[j + 1] = o[j + 2] = v;
      o[j + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
};

const MARKER_COLORS = ["#e02018", "#18b0e8", "#b0c818"];

/** Canetinhas de tecido no bolso do avental de colorir. */
function Markers({ positions }: { positions: { p: Vec3; tilt: number; color: string }[] }) {
  return (
    <>
      {positions.map(({ p, tilt, color }) => (
        <group key={color} position={p} rotation-z={tilt}>
          <mesh>
            <cylinderGeometry args={[0.72, 0.72, 12, 20]} />
            <meshPhysicalMaterial color="#f5f5f3" roughness={0.35} clearcoat={0.5} />
          </mesh>
          <mesh position-y={7.1}>
            <cylinderGeometry args={[0.8, 0.8, 3.4, 20]} />
            <meshPhysicalMaterial color={color} roughness={0.3} clearcoat={0.7} />
          </mesh>
          <mesh position-y={8.8} scale={[1, 0.45, 1]}>
            <sphereGeometry args={[0.8, 20, 10]} />
            <meshPhysicalMaterial color={color} roughness={0.3} clearcoat={0.7} />
          </mesh>
          <mesh position={[0, 6.6, 0.86]}>
            <boxGeometry args={[0.32, 2.6, 0.14]} />
            <meshPhysicalMaterial color={color} roughness={0.3} clearcoat={0.7} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** Caneta presa no porta-caneta do avental profissional. */
function Pen({ position }: { position: Vec3 }) {
  return (
    <group position={position} rotation-z={0.05}>
      <mesh>
        <cylinderGeometry args={[0.45, 0.42, 13, 20]} />
        <meshPhysicalMaterial color="#1f2a44" roughness={0.3} clearcoat={0.8} />
      </mesh>
      <mesh position-y={6.5} scale={[1, 0.6, 1]}>
        <sphereGeometry args={[0.45, 16, 10]} />
        <meshStandardMaterial color="#d6d8dc" metalness={1} roughness={0.25} />
      </mesh>
      <mesh position={[0, 4.6, 0.55]}>
        <boxGeometry args={[0.3, 4.2, 0.12]} />
        <meshStandardMaterial color="#d6d8dc" metalness={1} roughness={0.25} />
      </mesh>
    </group>
  );
}

/**
 * Avental de peitilho vestido num corpo invisível: painel fino com borda arredondada (inflate.ts)
 * curvado no corpo, com pregas na saia e franzido da amarração. Alça do pescoço em fita contornando
 * o pescoço, tiras da cintura até o laço com pontas nas costas, bainha com pesponto e bolso canguru
 * com divisória. A arte é sublimada na frente inteira pelo UV (mesmo mapeamento nos bolsos).
 * {pro}: dois bolsos, porta-caneta com caneta, ilhoses, regulador metálico e fitas escuras.
 * {coloring}: a arte vira desenho de contorno para colorir e o bolso leva canetinhas.
 */
export function ApronModel({ spec, art, label }: ModelProps) {
  const W = clamp(measure(spec.widthCm, 60), 30, 120);
  const H = clamp(measure(spec.heightCm, 80), 40, 140);
  const style: ApronStyle = spec.variant === "pro" ? "pro" : spec.variant === "coloring" ? "coloring" : "classic";
  const texture = useArtTexture(W / H, "front", art, label, style === "coloring" ? lineArtMask : undefined);
  const parts = useMemo(() => buildApron(W, H, style), [W, H, style]);
  useGeometriesCleanup(parts.list);

  const base = spec.baseColor;
  const strap = style === "pro" ? (spec.accentColor ?? "#2a2d33") : base;
  const lining = liningOf(base);
  const pen = parts.pockets[2];
  const pocket = parts.pockets[0];
  const markerTop = pocket.cy + pocket.h / 2;
  const markers = MARKER_COLORS.map((color, i) => {
    const x = pocket.cx + (i - 1) * 3.6;
    const y = markerTop + 6 - 8.6 - (i === 1 ? 1.2 : 0);
    return { p: [x, y, parts.shapeZ(x, y) + parts.T + 0.95] as Vec3, tilt: (i - 1) * -0.12, color };
  });

  return (
    <group rotation-y={0.16} scale={APRON_UNIT}>
      <mesh geometry={parts.front}>
        <ClothMaterial cloth="dryfit" color={base} />
      </mesh>
      <mesh geometry={parts.front}>
        <meshPhysicalMaterial map={texture} transparent alphaTest={0.02} roughness={0.72} sheen={0.4} sheenRoughness={0.5} sheenColor="#ffffff" polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      <mesh geometry={parts.back}>
        <ClothMaterial cloth="dryfit" color={shade(base, 0.94)} />
      </mesh>
      <mesh geometry={parts.edge}>
        <ClothMaterial cloth="dryfit" color={style === "pro" ? strap : shade(base, 0.96)} />
      </mesh>
      {parts.pocketParts.map((p, i) => (
        <group key={i}>
          <mesh geometry={p.surface}>
            <ClothMaterial cloth="dryfit" color={base} />
          </mesh>
          <mesh geometry={p.surface}>
            <meshPhysicalMaterial map={texture} transparent alphaTest={0.02} roughness={0.72} sheen={0.4} sheenRoughness={0.5} sheenColor="#ffffff" polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
          </mesh>
          <mesh geometry={p.surface}>
            <meshStandardMaterial color={lining} roughness={1} side={THREE.BackSide} />
          </mesh>
          <mesh geometry={p.mouth}>
            <ClothMaterial cloth="dryfit" color={style === "pro" ? strap : shade(base, 0.96)} />
          </mesh>
        </group>
      ))}
      <mesh geometry={parts.stitches}>
        <meshStandardMaterial color={style === "coloring" ? "#9a9a9a" : threadOf(base)} roughness={0.85} />
      </mesh>
      <mesh geometry={parts.strapGeometry}>
        <ClothMaterial cloth="cotton" color={strap} />
      </mesh>
      {parts.grommets.map((p) => (
        <mesh key={p[0]} position={p}>
          <torusGeometry args={[0.72, 0.22, 10, 28]} />
          <meshStandardMaterial color="#cfd2d6" metalness={1} roughness={0.22} />
        </mesh>
      ))}
      {parts.slider && (
        <mesh geometry={parts.sliderFrame} position={parts.slider.position} quaternion={parts.slider.quaternion}>
          <meshStandardMaterial color="#cfd2d6" metalness={1} roughness={0.22} />
        </mesh>
      )}
      {style === "pro" && pen && <Pen position={[pen.cx - 0.6, pen.cy + pen.h / 2 - 1.3, parts.shapeZ(pen.cx, pen.cy) + parts.T + 0.6]} />}
      {style === "coloring" && <Markers positions={markers} />}
    </group>
  );
}

// ---------------------------------------------------------------------------- bandana

/** Grade (nx × ny) de uma folha; `side` = 1 olha para +z antes da deformação, -1 para -z. */
function sheetGeometry(nx: number, ny: number, vertex: (u: number, v: number) => THREE.Vector3, side: 1 | -1) {
  const stride = nx + 1;
  const position = new Float32Array((nx + 1) * (ny + 1) * 3);
  const uv = new Float32Array((nx + 1) * (ny + 1) * 2);
  for (let j = 0; j <= ny; j += 1) {
    for (let i = 0; i <= nx; i += 1) {
      const k = j * stride + i;
      const p = vertex(i / nx, j / ny);
      position.set([p.x, p.y, p.z], k * 3);
      uv.set([i / nx, j / ny], k * 2);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const a = j * stride + i;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      if (side === 1) index.push(a, b, d, a, d, c);
      else index.push(a, d, b, a, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** Unidades de cena por centímetro: bandana 60 × 60 cm estendida. */
const BANDANA_UNIT = 2.6 / 60;

function buildFlatBandana(W: number, H: number) {
  const t = 0.06;
  const r = 0.45;
  // Canto da frente-direita dobrado por cima (enrolamento cilíndrico na linha da dobra).
  const d = new THREE.Vector2(1, -1).normalize();
  const corner = new THREE.Vector2(W / 2, -H / 2);
  const reach = Math.min(W, H) * 0.16;
  const l0 = corner.clone().addScaledVector(d, -reach);
  const mid = (x: number, y: number, out = new THREE.Vector3()) => {
    const wrinkle = 0.22 * Math.sin(x * 0.19 + y * 0.11) * Math.sin(y * 0.16 - 0.4) + 0.12 * Math.sin(x * 0.47 + y * 0.33) + 0.18 * Math.exp(-(((x + y * 0.4 - 6) / 5) ** 2));
    const s = (x - l0.x) * d.x + (y - l0.y) * d.y;
    if (s <= 0) return out.set(x, y, wrinkle + 0.25);
    const bx = x - d.x * s;
    const by = y - d.y * s;
    const a = s / r;
    if (a < Math.PI) return out.set(bx + d.x * r * Math.sin(a), by + d.y * r * Math.sin(a), 0.25 + wrinkle * Math.cos(Math.min(a, Math.PI)) + r * (1 - Math.cos(a)));
    const back = s - Math.PI * r;
    return out.set(bx - d.x * back, by - d.y * back, 0.25 + 2 * r - wrinkle * 0.3 + 0.05 * back);
  };
  const e = 0.05;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const f = new THREE.Vector3();
  const normal = (x: number, y: number) => {
    mid(x + e, y, a).sub(mid(x - e, y, b));
    mid(x, y + e, c).sub(mid(x, y - e, f));
    return a.clone().cross(c).normalize();
  };
  const layer = (side: 1 | -1, inset = 0) => (u: number, v: number) => {
    const x = lerp(-W / 2 + inset, W / 2 - inset, u);
    const y = lerp(-H / 2 + inset, H / 2 - inset, v);
    return mid(x, y).addScaledVector(normal(x, y), side * t);
  };
  const front = sheetGeometry(96, 96, layer(1), 1);
  const back = sheetGeometry(96, 96, layer(-1), -1);
  // Bainha enrolada no contorno e pesponto a 0,8 cm, dos dois lados.
  const border = (inset: number, lift: number) => {
    const pts: THREE.Vector3[] = [];
    const x0 = -W / 2 + inset;
    const x1 = W / 2 - inset;
    const y0 = -H / 2 + inset;
    const y1 = H / 2 - inset;
    const steps = 60;
    const edge = (p: Pt, q: Pt) => {
      for (let k = 0; k < steps; k += 1) {
        const x = lerp(p[0], q[0], k / steps);
        const y = lerp(p[1], q[1], k / steps);
        pts.push(mid(x, y).addScaledVector(normal(x, y), lift));
      }
    };
    edge([x0, y0], [x1, y0]);
    edge([x1, y0], [x1, y1]);
    edge([x1, y1], [x0, y1]);
    edge([x0, y1], [x0, y0]);
    return pts;
  };
  const hem = closedTubeGeometry(border(0.12, 0), 0.17, 6);
  const stitches = mergeSimple([stitchGeometry(border(0.8, t + 0.03), 0.3, 0.2, 0.03, true), stitchGeometry(border(0.8, -t - 0.03), 0.3, 0.2, 0.03, true)]);
  return { front, back, hem, stitches, list: [front, back, hem, stitches] };
}

function SublimatedLayers({ front, back, map, base }: { front: THREE.BufferGeometry; back: THREE.BufferGeometry; map: THREE.Texture; base: string }) {
  return (
    <>
      <mesh geometry={front}>
        <meshPhysicalMaterial color={base} roughness={0.7} sheen={0.6} sheenRoughness={0.45} sheenColor="#ffffff" />
      </mesh>
      <mesh geometry={front}>
        <meshPhysicalMaterial map={map} transparent alphaTest={0.02} roughness={0.66} sheen={0.5} sheenRoughness={0.45} sheenColor="#ffffff" polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      <mesh geometry={back}>
        <meshPhysicalMaterial color={base} roughness={0.75} sheen={0.6} sheenRoughness={0.45} sheenColor="#ffffff" />
      </mesh>
      {/* Avesso: a sublimação atravessa o tecido fino e aparece clara e espelhada. */}
      <mesh geometry={back}>
        <meshStandardMaterial map={map} transparent opacity={0.38} depthWrite={false} roughness={0.8} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
    </>
  );
}

function FlatBandana({ spec, art, label }: ModelProps) {
  const W = clamp(measure(spec.widthCm, 60), 20, 120);
  const H = clamp(measure(spec.heightCm, 60), 20, 120);
  const texture = useArtTexture(W / H, "front", art, label);
  const parts = useMemo(() => buildFlatBandana(W, H), [W, H]);
  useGeometriesCleanup(parts.list);
  const base = spec.baseColor;
  return (
    <group userData={{ view: { elevation: 0.82 } }} rotation-y={0.12} scale={(BANDANA_UNIT * 60) / Math.max(W, H)}>
      <group rotation-x={-Math.PI / 2}>
        <SublimatedLayers front={parts.front} back={parts.back} map={texture} base={base} />
        <mesh geometry={parts.hem}>
          <ClothMaterial cloth="dryfit" color={shade(base, 0.96)} />
        </mesh>
        <mesh geometry={parts.stitches}>
          <meshStandardMaterial color={threadOf(base)} roughness={0.85} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Bandana sublimada de ponta a ponta (arte pelo UV, sem distorcer): o lenço estendido no chão com ondulações leves,
 * bainha enrolada com pesponto e um canto dobrado mostrando o avesso com a estampa clara e espelhada (câmera mais
 * alta). A bandana pet (30 × 30 cm) usa o mesmo modelo, na medida dela: a arte bate com o gabarito, que é o quadrado
 * inteiro (revisão da Padrão de 25/10/2026; o triângulo amarrado num pescoço mostrava só parte da arte).
 */
export function BandanaModel(props: ModelProps) {
  return <FlatBandana {...props} />;
}
