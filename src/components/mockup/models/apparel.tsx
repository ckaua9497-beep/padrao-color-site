"use client";

// Vestuário sublimado: meia (par em fantasma 3/4), short de futebol e maiô infantil.
// Tudo é modelado em centímetros dentro de um grupo escalado (proporções reais) e a arte entra
// pelo UV da própria malha (meia, maiô) ou por Decal (short), sempre na proporção da área de arte.

import { useEffect, useMemo } from "react";
import { Decal } from "@react-three/drei";
import * as THREE from "three";
import { useApparelArt, useGeometriesCleanup } from "./fabric";
import { inflatedSurface } from "./inflate";
import { useArtTexture, type ModelProps } from "./shared";

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

/** Luminância no espaço linear (branco = 1; cinza médio sRGB ≈ 0,21). */
function luminance(color: string) {
  const c = new THREE.Color(color);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

// Abaixo disto o perfil vira zero: as amostras do contorno caem um fio para dentro da costura.
const EDGE_SNAP = 0.05;

/** Meia elipse (1 no meio, 0 na costura lateral), usada como seção do corpo "vestido". */
function profile(q: number) {
  const r = 1 - q * q;
  if (r <= 0) return 0;
  return Math.max(0, Math.sqrt(r) - EDGE_SNAP) / (1 - EDGE_SNAP);
}

/** Quarto de círculo: 0 na borda, 1 a partir de q = 1 (ombro e entreperna arredondados). */
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
    const h = x1 - x0;
    const t = (x - x0) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * slope(i) + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * slope(i + 1);
  };
}

type GridVertex = { p: Vec3; uv: Pt; uv1: Pt };

/**
 * Grade (rows × cols) de uma superfície paramétrica. Sem `flip`, a normal é d(linha) × d(coluna);
 * com `flip`, d(coluna) × d(linha) — cada chamada escolhe o que aponta para fora.
 */
function gridGeometry(rows: number, cols: number, vertex: (i: number, j: number) => GridVertex, flip = false) {
  const stride = cols + 1;
  const count = (rows + 1) * stride;
  const position = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const uv1 = new Float32Array(count * 2);
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= cols; i += 1) {
      const k = j * stride + i;
      const v = vertex(i, j);
      position.set(v.p, k * 3);
      uv.set(v.uv, k * 2);
      uv1.set(v.uv1, k * 2);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const a = j * stride + i;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      if (flip) index.push(a, b, c, b, d, c);
      else index.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute("uv1", new THREE.BufferAttribute(uv1, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** Junta as normais das bordas repetidas de uma grade fechada (costura sem quina de luz). */
function weldGrid(geometry: THREE.BufferGeometry, rows: number, cols: number, around: boolean, along: boolean) {
  const normal = geometry.attributes.normal as THREE.BufferAttribute;
  const stride = cols + 1;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const merge = (k1: number, k2: number) => {
    a.fromBufferAttribute(normal, k1);
    b.fromBufferAttribute(normal, k2);
    a.add(b);
    if (a.lengthSq() < 1e-12) return;
    a.normalize();
    normal.setXYZ(k1, a.x, a.y, a.z);
    normal.setXYZ(k2, a.x, a.y, a.z);
  };
  if (around) for (let j = 0; j <= rows; j += 1) merge(j * stride, j * stride + cols);
  if (along) for (let i = 0; i <= cols; i += 1) merge(i, rows * stride + i);
  normal.needsUpdate = true;
}

/** Linha que colapsa num ponto (ponta do pé): uma única normal média. */
function smoothPole(geometry: THREE.BufferGeometry, cols: number, row: number) {
  const normal = geometry.attributes.normal as THREE.BufferAttribute;
  const sum = new THREE.Vector3();
  const v = new THREE.Vector3();
  const start = row * (cols + 1);
  for (let i = 0; i <= cols; i += 1) sum.add(v.fromBufferAttribute(normal, start + i));
  if (sum.lengthSq() < 1e-12) return;
  sum.normalize();
  for (let i = 0; i <= cols; i += 1) normal.setXYZ(start + i, sum.x, sum.y, sum.z);
  normal.needsUpdate = true;
}

function pushPoint(list: THREE.Vector2[], x: number, y: number) {
  const last = list[list.length - 1];
  if (last && Math.abs(last.x - x) < 1e-4 && Math.abs(last.y - y) < 1e-4) return;
  list.push(new THREE.Vector2(x, y));
}

function pushQuad(list: THREE.Vector2[], p0: Pt, c: Pt, p1: Pt, steps: number) {
  for (let k = 1; k <= steps; k += 1) {
    const t = k / steps;
    const u = 1 - t;
    pushPoint(list, u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]);
  }
}

/** Metade direita (começa e termina em x = 0) → contorno inteiro espelhado. */
function mirrorHalf(right: THREE.Vector2[]) {
  const left = right
    .slice(1, -1)
    .reverse()
    .map((p) => new THREE.Vector2(-p.x, p.y));
  return [...right, ...left];
}

/**
 * Painel "vestido" (frente ou costas) a partir do contorno chapado: a grade do inflate.ts recorta
 * o contorno e a altura de cada ponto vem da seção do corpo (depth), não da distância até a borda.
 * Assim frente e costas se encontram nas costuras (depth = 0) e ficam abertas nas cavas e barras.
 */
function bodyPanel(polygon: THREE.Vector2[], side: 1 | -1, resolution: number, depth: (x: number, y: number) => number, uvOf?: (x: number, y: number) => Pt) {
  const geometry = inflatedSurface(polygon, { height: 1, resolution, side });
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, side * depth(x, y));
    if (uvOf) {
      const [u, v] = uvOf(x, y);
      uv.setXY(i, u, v);
    }
  }
  pos.needsUpdate = true;
  uv.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Viés/barra nas aberturas: trechos do contorno em que o painel fica afastado da costura viram
 * tubos finos (cada trecho inclui os pontos de costura das pontas, onde frente e costas se tocam).
 */
function edgeTubes(polygon: THREE.Vector2[], depth: (x: number, y: number) => number, side: 1 | -1, radius: number, skip: (p: THREE.Vector2) => boolean = () => false) {
  const n = polygon.length;
  const open = polygon.map((p) => !skip(p) && depth(p.x, p.y) > 0.3);
  const start = open.findIndex((o) => !o);
  if (start < 0) return [];
  const toVec = (p: THREE.Vector2) => new THREE.Vector3(p.x, p.y, side * depth(p.x, p.y));
  const runs: THREE.Vector3[][] = [];
  let current: THREE.Vector3[] = [];
  for (let k = 1; k <= n; k += 1) {
    const i = (start + k) % n;
    if (open[i]) {
      if (!current.length) current.push(toVec(polygon[(i - 1 + n) % n]));
      current.push(toVec(polygon[i]));
    } else if (current.length) {
      current.push(toVec(polygon[i]));
      if (current.length >= 3) runs.push(current);
      current = [];
    }
  }
  return runs.map((points) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), Math.max(12, points.length * 2), radius, 6, false));
}

// ---------------------------------------------------------------------------- meia

/** Unidades de cena por centímetro: meia cano médio de ≈ 37 cm do chão ao punho. */
const SOCK_UNIT = 2.5 / 37;

/** Medidas (cm) da meia vestida na forma: cano, calcanhar, peito do pé e biqueira. */
const SOCK = { top: 37, cuff: 3.5, legEnd: 11, ankle: 3.0, heelR: 3.6, instepR: 4, toeStart: 18.5, toeLen: 4.3, toeTop: 4.6 };
const SOCK_SPANS = [26, 9.7, 15, 6];
const SOCK_TOTAL = SOCK_SPANS.reduce((a, b) => a + b, 0);
const T_LEG = SOCK_SPANS[0] / SOCK_TOTAL;
const T_BEND = (SOCK_SPANS[0] + SOCK_SPANS[1]) / SOCK_TOTAL;
const T_FOOT = (SOCK_SPANS[0] + SOCK_SPANS[1] + SOCK_SPANS[2]) / SOCK_TOTAL;
/** Altura máxima da arte no cano (do punho até o tornozelo). */
const SOCK_PRINT_MAX_H = SOCK.top - SOCK.cuff - 0.4 - SOCK.legEnd - 0.1;
const SOCK_RIBS = 40;
/** Malha: repetições do ladrilho de 4 colunas em volta e altura de 4 carreiras (cm). */
const KNIT_AROUND = 12;
const KNIT_ROW = 1.4;

const sockBack = smoothCurve([[11, 3.0], [16, 3.3], [23, 3.65], [29, 3.75], [34, 3.6], [37, 3.5]]);
const sockFront = smoothCurve([[11, 3.0], [22, 3.15], [37, 3.35]]);
const sockSide = smoothCurve([[11, 3.1], [20, 3.4], [29, 3.6], [37, 3.45]]);
const sockFootWidth = smoothCurve([[0, 3.45], [0.55, 4.35], [0.8, 4.4], [1, 4.15]]);

/** Seção da meia no plano y-z: ponto de trás (calcanhar/sola), ponto da frente (canela/peito do pé), meia largura e expoente da superelipse. */
type SockSection = { bz: number; by: number; fz: number; fy: number; rx: number; n: number };

/**
 * Loft entre duas guias: atrás o calcanhar fecha num arco curto; na frente o peito do pé desce num
 * arco côncavo maior. t vai do punho (0) à ponta do pé (1); as seções giram de horizontais a verticais.
 */
function sockSection(t: number): SockSection {
  if (t <= T_LEG) {
    const y = SOCK.top - (t / T_LEG) * (SOCK.top - SOCK.legEnd);
    return { bz: -sockBack(y), by: y, fz: sockFront(y), fy: y, rx: sockSide(y), n: 2 };
  }
  if (t <= T_BEND) {
    const f = (t - T_LEG) / (T_BEND - T_LEG);
    const drop = SOCK.legEnd - SOCK.heelR;
    const arc = (SOCK.heelR * Math.PI) / 2;
    const along = f * (drop + arc);
    let bz: number;
    let by: number;
    if (along <= drop) {
      by = SOCK.legEnd - along;
      bz = -(SOCK.ankle + 0.6 * smoothstep(0, 1, along / drop));
    } else {
      const phi = (along - drop) / SOCK.heelR;
      bz = -(SOCK.ankle + 0.6) + SOCK.heelR - SOCK.heelR * Math.cos(phi);
      by = SOCK.heelR - SOCK.heelR * Math.sin(phi);
    }
    const pf = (f * Math.PI) / 2;
    return {
      bz,
      by,
      fz: SOCK.ankle + SOCK.instepR - SOCK.instepR * Math.cos(pf),
      fy: SOCK.legEnd - SOCK.instepR * Math.sin(pf),
      rx: lerp(3.1, 3.45, f) + 0.22 * Math.sin(Math.PI * f),
      n: lerp(2, 2.3, f),
    };
  }
  if (t <= T_FOOT) {
    const f = (t - T_BEND) / (T_FOOT - T_BEND);
    return {
      bz: f * SOCK.toeStart,
      by: 0,
      fz: lerp(SOCK.ankle + SOCK.instepR, SOCK.toeStart, f),
      fy: lerp(SOCK.legEnd - SOCK.instepR, SOCK.toeTop, Math.pow(f, 1.25)),
      rx: sockFootWidth(f),
      n: lerp(2.3, 2.6, f),
    };
  }
  const f = clamp((t - T_FOOT) / (1 - T_FOOT), 0, 1);
  const a = (f * Math.PI) / 2;
  const z = SOCK.toeStart + SOCK.toeLen * Math.sin(a);
  const c = SOCK.toeTop / 2;
  const h = c * Math.cos(a);
  return { bz: z, by: c - h, fz: z, fy: c + h, rx: sockFootWidth(1) * Math.cos(a), n: lerp(2.6, 2.2, f) };
}

/** Ponto da seção no ângulo theta (0 = frente/canela, +π/2 = lado +x). `grow` infla a seção (sobreposições). */
function sockPoint(sec: SockSection, theta: number, grow = 1): Vec3 {
  const dz = sec.fz - sec.bz;
  const dy = sec.fy - sec.by;
  const len = Math.hypot(dz, dy);
  const nz = len > 1e-6 ? dz / len : 0;
  const ny = len > 1e-6 ? dy / len : 1;
  const ry = (len / 2) * grow;
  const e = 2 / sec.n;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const pc = Math.sign(c) * Math.pow(Math.abs(c), e);
  const ps = Math.sign(s) * Math.pow(Math.abs(s), e);
  return [sec.rx * grow * ps, (sec.by + sec.fy) / 2 + ny * ry * pc, (sec.bz + sec.fz) / 2 + nz * ry * pc];
}

/** t do cano em que a frente passa pela altura y. */
function sockLegT(y: number) {
  return (T_LEG * (SOCK.top - y)) / (SOCK.top - SOCK.legEnd);
}

const knitUv = (theta: number, t: number): Pt => [((theta + Math.PI) / (Math.PI * 2)) * KNIT_AROUND, (t * SOCK_TOTAL) / KNIT_ROW];

const fullTurn = () => (u: number) => -Math.PI + u * Math.PI * 2;

function sockGrid({
  t0,
  t1,
  rows,
  cols,
  columns = fullTurn,
  grow,
  uv,
}: {
  t0: number;
  t1: number;
  rows: number;
  cols: number;
  columns?: (sec: SockSection, v: number) => (u: number) => number;
  grow?: (theta: number, v: number) => number;
  uv?: (u: number, v: number) => Pt;
}) {
  const rowData = Array.from({ length: rows + 1 }, (_, j) => {
    const v = j / rows;
    const t = lerp(t0, t1, v);
    const sec = sockSection(t);
    return { v, t, sec, theta: columns(sec, v) };
  });
  return gridGeometry(rows, cols, (i, j) => {
    const row = rowData[j];
    const u = i / cols;
    const theta = row.theta(u);
    const knit = knitUv(theta, row.t);
    return { p: sockPoint(row.sec, theta, grow ? grow(theta, row.v) : 1), uv: uv ? uv(u, row.v) : knit, uv1: knit };
  });
}

/**
 * Colunas da arte: cada linha cobre a mesma largura física (arco medido na seção), centrada no ângulo
 * `center` (o lado do cano voltado para a câmera); a emenda das sobras fica do lado oposto.
 */
function printColumns(width: number, center: number) {
  return (sec: SockSection) => {
    const samples = 128;
    const from = center - Math.PI;
    const thetas = [from];
    const lengths = [0];
    let prev = sockPoint(sec, from);
    for (let k = 1; k <= samples; k += 1) {
      const theta = from + (k / samples) * Math.PI * 2;
      const p = sockPoint(sec, theta);
      lengths.push(lengths[k - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]));
      thetas.push(theta);
      prev = p;
    }
    const total = lengths[samples];
    const middle = lengths[samples / 2];
    // Arte mais larga que o cano: as sobras se espremem na costura de trás (corta, não estica).
    return (u: number) => {
      const target = clamp(middle + (u - 0.5) * width, 0, total);
      let k = 1;
      while (k < samples && lengths[k] < target) k += 1;
      const span = lengths[k] - lengths[k - 1] || 1;
      return lerp(thetas[k - 1], thetas[k], (target - lengths[k - 1]) / span);
    };
  };
}

function sectionLoop(t: number, grow: number, samples = 96) {
  const sec = sockSection(t);
  return Array.from({ length: samples }, (_, k) => new THREE.Vector3(...sockPoint(sec, (k / samples) * Math.PI * 2 - Math.PI, grow)));
}

function buildSock(printW: number, printH: number, printCenter: number) {
  const tCuff = sockLegT(SOCK.top - SOCK.cuff);
  const tToe = T_BEND + 0.82 * (T_FOOT - T_BEND);
  const tInner = sockLegT(SOCK.top - 2.6);
  const printTop = SOCK.top - SOCK.cuff - 0.4;

  // Punho canelado: nervuras geométricas que somem na emenda com o corpo.
  const cuffRows = 14;
  const cuffCols = 160;
  const cuff = sockGrid({
    t0: 0,
    t1: tCuff,
    rows: cuffRows,
    cols: cuffCols,
    grow: (theta, v) => 1 + 0.028 * (0.5 + 0.5 * Math.cos(theta * SOCK_RIBS)) * (1 - smoothstep(0.72, 1, v)),
  });
  weldGrid(cuff, cuffRows, cuffCols, true, false);

  const bodyRows = 124;
  const cols = 64;
  const body = sockGrid({ t0: tCuff, t1: tToe, rows: bodyRows, cols });
  weldGrid(body, bodyRows, cols, true, false);

  const toeRows = 20;
  const toe = sockGrid({ t0: tToe, t1: 1, rows: toeRows, cols });
  weldGrid(toe, toeRows, cols, true, false);
  smoothPole(toe, cols, toeRows);

  // Calcanhar reforçado: lente sobre a parte de trás, um fio acima do corpo.
  const heel = sockGrid({
    t0: T_LEG + 0.12 * (T_BEND - T_LEG),
    t1: T_BEND + 0.3 * (T_FOOT - T_BEND),
    rows: 24,
    cols: 18,
    columns: (_, v) => (u) => Math.PI + (u - 0.5) * 2 * 1.25 * Math.pow(Math.sin(Math.PI * v), 0.7),
    grow: () => 1.008,
  });

  // Arte sublimada no cano: u em volta (largura física constante), v de cima para baixo.
  const print = sockGrid({
    t0: sockLegT(printTop),
    t1: sockLegT(printTop - printH),
    rows: 40,
    cols: 72,
    columns: printColumns(printW, printCenter),
    grow: () => 1.004,
    uv: (u, v) => [u, 1 - v],
  });

  // Boca: parede interna (vista por dentro), fundo escuro e borda enrolada.
  const innerRows = 5;
  const inner = sockGrid({ t0: 0, t1: tInner, rows: innerRows, cols, grow: () => 0.93 });
  weldGrid(inner, innerRows, cols, true, false);
  const innerSec = sockSection(tInner);
  const floorShape = new THREE.Shape();
  floorShape.absellipse(0, 0, innerSec.rx * 0.93, ((innerSec.fz - innerSec.bz) / 2) * 0.93, 0, Math.PI * 2, false, 0);
  const floor = new THREE.ShapeGeometry(floorShape, 32);
  floor.rotateX(-Math.PI / 2);
  floor.translate(0, innerSec.by, (innerSec.bz + innerSec.fz) / 2);
  // Borda enrolada cobre das nervuras (≈ +2,8%) até a parede interna (93%), sem fresta na boca.
  const rim = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sectionLoop(0, 0.975), true), 128, 0.2, 8, true);
  const toeSeam = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sectionLoop(tToe, 1.012), true), 96, 0.07, 6, true);

  const parts = { cuff, body, toe, heel, print, inner, floor, rim, toeSeam };
  return { ...parts, list: Object.values(parts) };
}

/** Ladrilho de malha (4 colunas × 4 carreiras de pontos em V) para o relevo do tecido. */
function createKnitTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#4e4e4e";
    ctx.fillRect(0, 0, size, size);
    ctx.filter = "blur(1px)";
    ctx.fillStyle = "#d2d2d2";
    const cell = size / 4;
    for (let i = 0; i < 4; i += 1) {
      for (let j = 0; j < 4; j += 1) {
        for (const dir of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(i * cell + cell / 2 + dir * cell * 0.2, j * cell + cell / 2, cell * 0.19, cell * 0.44, dir * 0.42, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.filter = "none";
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // Relevo lê o segundo UV (uv1): a arte usa o primeiro sem perder a malha.
  texture.channel = 1;
  return texture;
}

function useKnitTexture() {
  const texture = useMemo(() => createKnitTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

type SockParts = ReturnType<typeof buildSock>;

function Knit({ color, knit, bump = 0.9, map, overlay = false }: { color?: string; knit: THREE.Texture; bump?: number; map?: THREE.Texture; overlay?: boolean }) {
  return (
    <meshPhysicalMaterial
      color={color ?? "#ffffff"}
      map={map ?? null}
      roughness={0.95}
      sheen={0.7}
      sheenRoughness={0.6}
      sheenColor="#ffffff"
      bumpMap={knit}
      bumpScale={bump}
      polygonOffset={overlay}
      polygonOffsetFactor={overlay ? -2 : 0}
      polygonOffsetUnits={overlay ? -2 : 0}
    />
  );
}

function Sock({ parts, map, knit, base, accent }: { parts: SockParts; map: THREE.Texture; knit: THREE.Texture; base: string; accent: string }) {
  const inside = shade(base, 0.42);
  return (
    <group>
      <mesh geometry={parts.cuff}>
        <Knit color={base} knit={knit} bump={1.6} />
      </mesh>
      <mesh geometry={parts.body}>
        <Knit color={base} knit={knit} />
      </mesh>
      <mesh geometry={parts.print}>
        <Knit map={map} knit={knit} bump={0.5} overlay />
      </mesh>
      <mesh geometry={parts.heel}>
        <Knit color={accent} knit={knit} bump={1.2} overlay />
      </mesh>
      <mesh geometry={parts.toe}>
        <Knit color={accent} knit={knit} bump={1.2} />
      </mesh>
      <mesh geometry={parts.toeSeam}>
        <meshStandardMaterial color={shade(accent, 0.82)} roughness={0.95} />
      </mesh>
      <mesh geometry={parts.inner}>
        <meshStandardMaterial color={inside} roughness={1} side={THREE.BackSide} />
      </mesh>
      <mesh geometry={parts.floor}>
        <meshStandardMaterial color={shade(base, 0.25)} roughness={1} />
      </mesh>
      <mesh geometry={parts.rim}>
        <meshPhysicalMaterial color={base} roughness={0.95} sheen={0.7} sheenRoughness={0.6} sheenColor="#ffffff" />
      </mesh>
    </group>
  );
}

/** Posição (x, z) de cada pé do par, em unidades de cena: um à frente-esquerda, outro atrás-direita. */
const SOCK_PAIR: Pt[] = [
  [-0.5, 0.1],
  [0.48, -0.55],
];
/** Giro do par (3/4, pé apontando para a direita da câmera). */
const SOCK_TURN = 0.42;

/**
 * Par de meias cano médio em "pé invisível" (fantasma), de 3/4. Cada meia é um loft próprio entre
 * a guia de trás (calcanhar) e a da frente (canela e peito do pé), com seção em superelipse; a arte
 * é uma faixa colada no cano com a mesma largura física em toda altura (centro voltado para a câmera), punho
 * canelado geométrico, calcanhar e biqueira na cor de destaque e relevo de malha por canvas (uv1).
 */
export function SockModel({ spec, art, label }: ModelProps) {
  const printW = clamp(measure(spec.widthCm, 18), 4, 40);
  const printH = clamp(measure(spec.heightCm, 22), 4, SOCK_PRINT_MAX_H);
  const texture = useArtTexture(printW / printH, "front", art, label);
  const knit = useKnitTexture();
  // A arte fica centrada no lado do cano que encara a câmera (desfaz o giro do par), não na canela:
  // num cano de ≈ 21 cm de volta só meia arte aparece, e ela precisa ser a metade do meio.
  const parts = useMemo(() => buildSock(printW, printH, -SOCK_TURN), [printW, printH]);
  useGeometriesCleanup(parts.list);
  const base = spec.baseColor;
  const accent = spec.accentColor ?? mix(base, "#6f6f6f", 0.35);
  return (
    <group>
      {SOCK_PAIR.map(([x, z]) => (
        <group key={`${x}:${z}`} position={[x, 0, z]} rotation-y={SOCK_TURN} scale={SOCK_UNIT}>
          <Sock parts={parts} map={texture} knit={knit} base={base} accent={accent} />
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------- short de futebol

/** Unidades de cena por centímetro: short M com ≈ 60 cm de largura na barra. */
const SHORTS_UNIT = 2.6 / 60;

const SH = { top: 22, band: 4.5, crotch: -10, hemIn: -19.5, split: -17.5, hemOutX: 26.4, hemOutY: -22.4, hemInX: 4.6 };
/** Centro vertical da estampa (cm), logo abaixo do cós. */
const SHORTS_PRINT_Y = 2.5;

const shortsOuter = smoothCurve([[-22.5, 29.6], [-10, 28.2], [2, 27.1], [12, 25.4], [17, 23.5], [22, 23.5]]);
const shortsTorsoDepth = smoothCurve([[-10, 9], [0, 8.8], [9, 8], [17, 6], [22, 6]]);
const shortsLegDepth = smoothCurve([[-22.5, 7.2], [-10, 8.4], [2, 8.8]]);

function shortsInner(y: number) {
  if (y >= SH.crotch) return 0;
  return SH.hemInX * Math.pow(clamp((SH.crotch - y) / (SH.crotch - SH.hemIn), 0, 1.2), 0.62);
}

/** Meia espessura (cm) do short "vestido": quadril elíptico que se divide em duas pernas, com vinco no gancho e dobras nas pernas. */
function shortsDepth(x: number, y: number) {
  const ax = Math.abs(x);
  const out = shortsOuter(y);
  const torso = shortsTorsoDepth(y) * profile(ax / out) * smoothstep(SH.crotch - 0.5, SH.crotch + 7, y);
  const inner = shortsInner(y);
  const half = Math.max(0.5, (out - inner) / 2);
  const leg = shortsLegDepth(y) * profile((ax - inner - half) / half) * (1 - smoothstep(SH.crotch + 2, SH.crotch + 13, y));
  const legZone = 1 - smoothstep(-14, -2, y);
  const belowBand = 1 - smoothstep(13, 17, y);
  const folds = 1 + (0.045 * legZone * Math.sin(ax * 0.62 + y * 0.18) + 0.02 * Math.sin(ax * 0.31 - y * 0.27 + 1.3)) * belowBand;
  return Math.max(torso, leg) * folds;
}

/** Lateral direita do cós até a fenda arredondada da barra (cm). */
function shortsSidePath(): Pt[] {
  const pts: Pt[] = [];
  for (let k = 0; k <= 56; k += 1) {
    const y = SH.top - ((SH.top - SH.split) * k) / 56;
    pts.push([shortsOuter(y), y]);
  }
  const p0: Pt = [shortsOuter(SH.split), SH.split];
  const c: Pt = [shortsOuter(-22.5) + 0.3, -23];
  for (let k = 1; k <= 14; k += 1) {
    const t = k / 14;
    const u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * SH.hemOutX, u * u * p0[1] + 2 * u * t * c[1] + t * t * SH.hemOutY]);
  }
  return pts;
}

/** Barra da perna direita, da fenda até a entreperna (levemente arqueada). */
function shortsHemPath(): Pt[] {
  return Array.from({ length: 25 }, (_, k) => {
    const s = k / 24;
    return [lerp(SH.hemOutX, SH.hemInX, s), lerp(SH.hemOutY, SH.hemIn, s) - 0.35 * Math.sin(Math.PI * s)];
  });
}

function shortsPolygon() {
  const right: THREE.Vector2[] = [];
  const waist = shortsOuter(SH.top);
  for (let k = 0; k <= 8; k += 1) pushPoint(right, (waist * k) / 8, SH.top);
  for (const [x, y] of shortsSidePath()) pushPoint(right, x, y);
  for (const [x, y] of shortsHemPath()) pushPoint(right, x, y);
  for (let k = 1; k <= 18; k += 1) {
    const s = Math.pow(1 - k / 18, 1.6);
    const y = SH.crotch - (SH.crotch - SH.hemIn) * s;
    pushPoint(right, shortsInner(y), y);
  }
  return mirrorHalf(right);
}

/** Tecido do short: cor base, faixas laterais duplas acompanhando a costura e a fenda, pesponto da barra. */
function createShortsTexture(polygon: THREE.Vector2[], base: string, accent: string, stitch: string) {
  const box = new THREE.Box2().setFromPoints(polygon);
  const size = box.getSize(new THREE.Vector2());
  const width = 1024;
  const s = width / size.x;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.max(64, Math.round(size.y * s));
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const px = (x: number) => (x - box.min.x) * s;
    const py = (y: number) => (box.max.y - y) * s;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const side = shortsSidePath();
    const trace = (points: Pt[], sign: number, dy = 0) => {
      ctx.beginPath();
      points.forEach(([x, y], i) => (i ? ctx.lineTo(px(sign * x), py(y + dy)) : ctx.moveTo(px(sign * x), py(y + dy))));
    };
    // Traço centrado no contorno: metade cai fora do painel e some, a outra metade vira a faixa.
    for (const sign of [-1, 1]) {
      for (const [color, half] of [
        [accent, 2.15],
        [base, 1.8],
        [accent, 1.4],
      ] as [string, number][]) {
        trace(side, sign);
        ctx.strokeStyle = color;
        ctx.lineWidth = half * 2 * s;
        ctx.stroke();
      }
    }
    ctx.setLineDash([0.35 * s, 0.28 * s]);
    ctx.strokeStyle = stitch;
    ctx.lineWidth = 0.12 * s;
    for (const sign of [-1, 1]) {
      trace(shortsHemPath(), sign, 1.1);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Contorno fechado (o, y) de retângulo arredondado, anti-horário: seção do cós elástico. */
function roundedLoop(o0: number, o1: number, y0: number, y1: number, r: number): Pt[] {
  const corners: [number, number, number, number][] = [
    [o1 - r, y0 + r, -Math.PI / 2, 6],
    [o1 - r, y1 - r, 0, 1],
    [o0 + r, y1 - r, Math.PI / 2, 4],
    [o0 + r, y0 + r, Math.PI, 1],
  ];
  const pts: Pt[] = [];
  corners.forEach(([cx, cy, a0, wall], ci) => {
    for (let k = 0; k <= 4; k += 1) {
      const a = a0 + (k / 4) * (Math.PI / 2);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    // Pontos intermediários na parede até o próximo canto (sombreamento plano nas faces retas).
    const [nx, ny, na] = corners[(ci + 1) % 4];
    const end = pts[pts.length - 1];
    const next: Pt = [nx + r * Math.cos(na), ny + r * Math.sin(na)];
    for (let k = 1; k < wall; k += 1) pts.push([lerp(end[0], next[0], k / wall), lerp(end[1], next[1], k / wall)]);
  });
  pts.push(pts[0]);
  return pts;
}

/** Cós elástico: anel em volta da boca elíptica do short, com franzido do elástico. */
function waistbandGeometry(a: number, b: number) {
  const loop = roundedLoop(-0.3, 0.45, SH.top - SH.band, SH.top + 0.35, 0.28);
  const rows = loop.length - 1;
  const cols = 200;
  const geometry = gridGeometry(
    rows,
    cols,
    (i, j) => {
      const phi = (i / cols) * Math.PI * 2;
      const [o0, y] = loop[j];
      const gather = (o0 > 0 ? 0.12 : 0.04) * (0.5 + 0.5 * Math.sin(phi * 44));
      const sx = Math.sin(phi);
      const cz = Math.cos(phi);
      const nx = b * sx;
      const nz = a * cz;
      const nl = Math.hypot(nx, nz) || 1;
      const o = o0 + gather;
      return { p: [a * sx + (nx / nl) * o, y, b * cz + (nz / nl) * o], uv: [i / cols, j / rows], uv1: [i / cols, j / rows] };
    },
    true,
  );
  weldGrid(geometry, rows, cols, true, true);
  return geometry;
}

function buildShorts() {
  const polygon = shortsPolygon();
  const front = bodyPanel(polygon, 1, 100, shortsDepth);
  const back = bodyPanel(polygon, -1, 100, shortsDepth);
  const nearWaist = (p: THREE.Vector2) => p.y > SH.top - 0.5;
  const hems = [...edgeTubes(polygon, shortsDepth, 1, 0.35, nearWaist), ...edgeTubes(polygon, shortsDepth, -1, 0.35, nearWaist)];
  const a = shortsOuter(SH.top);
  const b = shortsTorsoDepth(SH.top);
  const band = waistbandGeometry(a, b);

  // Cordão: sai dos ilhoses do cós e cai rente ao painel; pontas curtas, ponteiras acima da estampa.
  const eyeletY = SH.top - 2.2;
  const eyeletZ = b + 0.62;
  const cords = [
    { x: 1.4, drift: 1.2, end: SHORTS_PRINT_Y + 13.6 },
    { x: -1.4, drift: -0.8, end: SHORTS_PRINT_Y + 13.0 },
  ].map(({ x, drift, end }) => {
    const sign = Math.sign(x);
    const onPanel = (px: number, py: number) => new THREE.Vector3(px, py, shortsDepth(px, py) + 0.32);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, eyeletY, eyeletZ + 0.1),
      new THREE.Vector3(x + sign * 0.45, eyeletY - 1.1, eyeletZ + 0.45),
      new THREE.Vector3(x + drift * 0.6, SH.top - SH.band - 0.5, b + 0.75),
      onPanel(x + drift, end),
    ]);
    const tip = curve.getPointAt(1);
    const dir = curve.getTangentAt(1).normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return {
      tube: new THREE.TubeGeometry(curve, 48, 0.24, 8, false),
      tip: tip.addScaledVector(dir, 0.55).toArray() as Vec3,
      quaternion,
    };
  });

  const geometries = [front, back, band, ...hems, ...cords.map((c) => c.tube)];
  return {
    polygon,
    front,
    back,
    hems,
    band,
    cords,
    eyelets: [1.4, -1.4].map((x) => [x, eyeletY, eyeletZ] as Vec3),
    list: geometries,
  };
}

function DryFit({ map, color }: { map?: THREE.Texture; color?: string }) {
  return <meshPhysicalMaterial map={map ?? null} color={color ?? "#ffffff"} roughness={0.58} sheen={0.85} sheenRoughness={0.4} sheenColor="#ffffff" specularIntensity={0.6} />;
}

/**
 * Short de futebol em manequim invisível, de frente. Frente e costas são painéis "vestidos" (grade do
 * inflate.ts com a altura vinda de um quadril elíptico que se divide em pernas), abertos na cintura e
 * nas barras com fenda lateral. Tecido em canvas com faixas laterais e pesponto, cós elástico franzido
 * com ilhoses e cordão, e a estampa 30 × 25 cm em Decal centrada abaixo do cós.
 */
export function ShortsModel({ spec, art, label }: ModelProps) {
  const printArt = useApparelArt(art);
  const printW = clamp(measure(spec.widthCm, 30), 4, 44);
  const printH = clamp(measure(spec.heightCm, 25), 4, 26);
  const texture = useArtTexture(printW / printH, "front", printArt, label);
  const parts = useMemo(() => buildShorts(), []);
  useGeometriesCleanup(parts.list);

  const base = spec.baseColor;
  const light = luminance(base) > 0.45;
  const accent = spec.accentColor ?? (light ? "#1c2333" : "#f5f5f5");
  const stitch = light ? shade(base, 0.72) : mix(base, "#ffffff", 0.28);
  const cord = light ? "#22252b" : "#f4f4f4";
  const lining = shade(base, 0.45);
  const fabric = useMemo(() => createShortsTexture(parts.polygon, base, accent, stitch), [parts.polygon, base, accent, stitch]);
  useEffect(() => () => fabric.dispose(), [fabric]);

  return (
    <group rotation-y={0.18} scale={SHORTS_UNIT}>
      <mesh geometry={parts.front}>
        <DryFit map={fabric} />
        <Decal position={[0, SHORTS_PRINT_Y, 6]} rotation={[0, 0, 0]} scale={[printW, printH, 12]} depthTest>
          <meshPhysicalMaterial map={texture} transparent alphaTest={0.02} roughness={0.6} sheen={0.5} sheenRoughness={0.45} sheenColor="#ffffff" polygonOffset polygonOffsetFactor={-10} depthTest />
        </Decal>
      </mesh>
      <mesh geometry={parts.front}>
        <meshStandardMaterial color={lining} roughness={1} side={THREE.BackSide} />
      </mesh>
      <mesh geometry={parts.back}>
        <DryFit map={fabric} />
      </mesh>
      <mesh geometry={parts.back}>
        <meshStandardMaterial color={lining} roughness={1} side={THREE.BackSide} />
      </mesh>
      {parts.hems.map((g, i) => (
        <mesh key={i} geometry={g}>
          <DryFit color={shade(base, 0.94)} />
        </mesh>
      ))}
      <mesh geometry={parts.band}>
        <meshPhysicalMaterial color={base} roughness={0.85} sheen={0.6} sheenRoughness={0.5} sheenColor="#ffffff" />
      </mesh>
      {parts.eyelets.map((p) => (
        <mesh key={p[0]} position={p}>
          <torusGeometry args={[0.42, 0.13, 8, 24]} />
          <meshStandardMaterial color="#d9dadc" metalness={1} roughness={0.28} />
        </mesh>
      ))}
      {parts.cords.map((c, i) => (
        <group key={i}>
          <mesh geometry={c.tube}>
            <meshStandardMaterial color={cord} roughness={0.8} />
          </mesh>
          <mesh position={c.tip} quaternion={c.quaternion}>
            <capsuleGeometry args={[0.3, 1.1, 4, 10]} />
            <meshPhysicalMaterial color={cord} roughness={0.3} clearcoat={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------- maiô infantil

/** Unidades de cena por centímetro: maiô infantil (≈ 6 anos) com ≈ 52 cm do ombro ao gancho. */
const SWIM_UNIT = 2.5 / 52;

const SW = { top: 27, bottom: -25, neckFront: 12.5, neckBack: 20.5 };

const swimWidth = smoothCurve([[-25, 9], [-12, 13.4], [-4, 12.6], [3, 11.9], [10, 12.6], [16, 13.2], [27, 13.4]]);
const swimDepthMid = smoothCurve([[-25, 2.2], [-21, 4.8], [-16, 6.4], [-9, 7.1], [-1, 6.4], [6, 6.6], [13, 7.0], [19, 6.2], [24, 4.6], [27, 3.6]]);

/** Meia espessura (cm) do corpo infantil: tronco elíptico, alças que passam por cima do ombro e gancho fechado. */
function swimDepth(x: number, y: number) {
  const ends = roundEnd((y - SW.bottom) / 3.2) * roundEnd((SW.top - y) / 4.5);
  return swimDepthMid(y) * ends * profile(Math.abs(x) / swimWidth(y));
}

function swimPolygon(neck: number) {
  const r: THREE.Vector2[] = [];
  pushPoint(r, 0, SW.bottom);
  pushPoint(r, 1.7, SW.bottom);
  pushPoint(r, 3.4, SW.bottom);
  // Cava da perna (recorte alto).
  pushQuad(r, [3.4, SW.bottom], [5.4, -13.4], [swimWidth(-10), -10], 24);
  for (let k = 1; k <= 36; k += 1) {
    const y = -10 + (23 * k) / 36;
    pushPoint(r, swimWidth(y), y);
  }
  // Cava do braço até a alça.
  pushQuad(r, [swimWidth(13), 13], [8.7, 14.4], [7.7, 22.5], 20);
  for (let k = 1; k <= 6; k += 1) pushPoint(r, lerp(7.7, 7.5, k / 6), lerp(22.5, SW.top, k / 6));
  pushPoint(r, 6.3, SW.top);
  pushPoint(r, 5.1, SW.top);
  for (let k = 1; k <= 6; k += 1) pushPoint(r, lerp(5.1, 5.3, k / 6), lerp(SW.top, 22, k / 6));
  // Decote: cavado na frente, mais alto nas costas.
  pushQuad(r, [5.3, 22], [neck < 16 ? 4.8 : 3.8, neck + 0.9], [0, neck], 20);
  return mirrorHalf(r);
}

function buildSwimsuit(aspect: number) {
  const frontPolygon = swimPolygon(SW.neckFront);
  const backPolygon = swimPolygon(SW.neckBack);
  // Sublimação total: a arte cobre a frente inteira, sem distorcer (recorta o que sobra).
  const width = swimWidth(SW.top) * 2;
  const height = SW.top - SW.bottom;
  const artW = Math.max(width, height * aspect);
  const artH = artW / aspect;
  const centerY = (SW.top + SW.bottom) / 2;
  const front = bodyPanel(frontPolygon, 1, 120, swimDepth, (x, y) => [x / artW + 0.5, (y - centerY) / artH + 0.5]);
  const back = bodyPanel(backPolygon, -1, 120, swimDepth);
  const bindings = [...edgeTubes(frontPolygon, swimDepth, 1, 0.32), ...edgeTubes(backPolygon, swimDepth, -1, 0.32)];
  return { front, back, bindings, list: [front, back, ...bindings] };
}

/** Lycra cirrê (tecido do catálogo): brilho molhado, mas sem espelhar a ponto de apagar a arte. */
function Lycra({ map, color }: { map?: THREE.Texture; color?: string }) {
  return (
    <meshPhysicalMaterial
      map={map ?? null}
      color={color ?? "#ffffff"}
      roughness={0.32}
      clearcoat={0.5}
      clearcoatRoughness={0.24}
      sheen={0.4}
      sheenRoughness={0.35}
      sheenColor="#ffffff"
    />
  );
}

/**
 * Maiô infantil em manequim invisível. Frente e costas são painéis "vestidos" (grade do inflate.ts com
 * altura de um tronco elíptico que fecha no gancho e passa por cima do ombro nas alças), com decote
 * cavado na frente e mais alto atrás, forro escuro visto pelas aberturas e viés elástico em tubos finos.
 * A arte sublima a frente inteira pelo UV, em "cover" na proporção da área de arte; lycra brilhante.
 */
export function SwimsuitModel({ spec, art, label }: ModelProps) {
  const printW = measure(spec.widthCm, 25);
  const printH = measure(spec.heightCm, 35);
  const aspect = clamp(printW / printH, 0.3, 3);
  const texture = useArtTexture(aspect, "front", art, label);
  const parts = useMemo(() => buildSwimsuit(aspect), [aspect]);
  useGeometriesCleanup(parts.list);
  const base = spec.baseColor;
  const binding = spec.accentColor ?? shade(base, 0.86);
  const lining = shade(base, 0.45);
  return (
    <group rotation-y={0.2} scale={SWIM_UNIT}>
      <mesh geometry={parts.front}>
        <Lycra map={texture} />
      </mesh>
      <mesh geometry={parts.front}>
        <meshStandardMaterial color={lining} roughness={1} side={THREE.BackSide} />
      </mesh>
      <mesh geometry={parts.back}>
        <Lycra color={base} />
      </mesh>
      <mesh geometry={parts.back}>
        <meshStandardMaterial color={lining} roughness={1} side={THREE.BackSide} />
      </mesh>
      {parts.bindings.map((g, i) => (
        <mesh key={i} geometry={g}>
          <Lycra color={binding} />
        </mesh>
      ))}
    </group>
  );
}
