"use client";

// Bolsas e sacolas: ecobag/tote, bolsa de praia, sacola de papel com alça de corda, saquinho de presente
// com cordão, lixeira de carro no encosto de cabeça, necessaire (com ou sem mosquetão) e estojo.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MockupSpec } from "@/lib/mockup";
import type { ArtRender } from "../art";
import { useApparelArt, useGeometriesCleanup } from "./fabric";
import { PrintMaterial, backArtOf, backKindOf, metalColor, roughnessOf, useArtTexture, useBackTexture, useGeometryCleanup, type ModelProps } from "./shared";
import { KraftSack, PlasticBag } from "./sacks";

/*
 * Tudo é modelado em centímetros e reduzido por um único fator de escala por peça (proporção real).
 * O corpo das bolsas de tecido é uma superfície paramétrica: em cada altura, uma superelipse
 * (largura × fole) com rugas e franzidos somados na direção da normal, e o fundo fecha com um
 * filete arredondado. A estampa é uma malha que copia a frente do corpo por comprimento de arco,
 * então a arte nunca estica nem espelha. Alças, cordas trançadas, costuras, zíper e debruns são
 * geometrias varridas sobre caminhos calculados na própria superfície.
 */

/** Maior dimensão da cena, em unidades. */
const TARGET = 2.4;

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smooth = THREE.MathUtils.smoothstep;
const vec = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const DOWN = new THREE.Vector3(0, -1, 0);

/** Medida do pedido em cm, com faixa sã (evita NaN, zero e tamanhos absurdos). */
function cm(value: number, fallback: number, min: number, max: number) {
  return Number.isFinite(value) && value > 0 ? clamp(value, min, max) : fallback;
}

// ---------------------------------------------------------------------------- cores e materiais

function shade(color: string, k: number) {
  return `#${new THREE.Color(color).multiplyScalar(k).getHexString()}`;
}

function mix(a: string, b: string, t: number) {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
}

/** Luminância em espaço linear. */
function luma(color: string) {
  const c = new THREE.Color(color);
  return c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
}

/** Branco puro vira o branco levemente quente do tecido real. */
function clothColor(color: string) {
  return color.toLowerCase() === "#ffffff" ? "#f3f0e8" : color;
}

function threadColor(fabric: string) {
  return luma(fabric) > 0.4 ? shade(fabric, 0.78) : mix(fabric, "#ffffff", 0.38);
}

/** Debrum, fita do zíper e alças técnicas: a cor de destaque ou um preto que contrasta com o corpo. */
function trimColor(spec: MockupSpec) {
  if (spec.accentColor) return spec.accentColor;
  return luma(spec.baseColor) < 0.05 ? "#3a3b40" : "#1f2023";
}

type Grain = "weave" | "leather";

/** Trama de lona ou granulado de courino, em tons quase brancos (multiplica a cor do material). */
function grainCanvas(kind: Grain) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  let seed = kind === "weave" ? 11 : 29;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  if (kind === "weave") {
    const n = 8;
    const cell = size / n;
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        const x = i * cell;
        const y = j * cell;
        // Fio de urdume por cima numa casa, de trama na seguinte: o xadrez da sarja simples.
        const warp = (i + j) % 2 === 0;
        const g = warp ? ctx.createLinearGradient(x, 0, x + cell, 0) : ctx.createLinearGradient(0, y, 0, y + cell);
        g.addColorStop(0, "#dedede");
        g.addColorStop(0.5, "#ffffff");
        g.addColorStop(1, "#dedede");
        ctx.fillStyle = g;
        ctx.fillRect(x, y, cell, cell);
      }
    }
    for (let k = 0; k < 260; k += 1) {
      ctx.fillStyle = `rgba(0,0,0,${0.02 + rand() * 0.035})`;
      ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 4, 1);
    }
  } else {
    for (let k = 0; k < 900; k += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 0.6 + rand() * 1.9;
      ctx.fillStyle = rand() > 0.45 ? `rgba(0,0,0,${0.025 + rand() * 0.05})` : "rgba(255,255,255,0.25)";
      // Desenha também as cópias vizinhas para a textura repetir sem emenda.
      for (const dx of [-size, 0, size]) {
        for (const dy of [-size, 0, size]) {
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  return canvas;
}

/** Textura de grão com repetição em centímetros (as UVs das malhas daqui estão em cm). */
function useGrain(kind: Grain, period: number) {
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(grainCanvas(kind));
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.repeat.set(1 / period, 1 / period);
    return t;
  }, [kind, period]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function Cloth({ color, map, side, roughness = 0.92, sheen = 1 }: { color: string; map?: THREE.Texture; side?: THREE.Side; roughness?: number; sheen?: number }) {
  return <meshPhysicalMaterial color={color} map={map} side={side} roughness={roughness} sheen={sheen} sheenRoughness={0.75} sheenColor="#ffffff" />;
}

function Leather({ color, map }: { color: string; map?: THREE.Texture }) {
  return <meshPhysicalMaterial color={color} map={map} roughness={0.5} clearcoat={0.3} clearcoatRoughness={0.4} />;
}

type InkLook = { roughness?: number; sheen?: number; clearcoat?: number };

/** Tinta sobre o tecido (sublimação) ou sobre o courino (UV, com leve brilho). */
function Ink({ map, roughness = 0.86, sheen = 0.5, clearcoat = 0 }: { map: THREE.Texture } & InkLook) {
  return (
    <meshPhysicalMaterial
      map={map}
      transparent
      alphaTest={0.02}
      roughness={roughness}
      sheen={sheen}
      sheenRoughness={0.8}
      sheenColor="#ffffff"
      clearcoat={clearcoat}
      clearcoatRoughness={0.3}
      polygonOffset
      polygonOffsetFactor={-2}
      polygonOffsetUnits={-2}
    />
  );
}

function Metal({ color }: { color: string }) {
  return <meshStandardMaterial color={color} metalness={1} roughness={0.26} />;
}

function Thread({ color }: { color: string }) {
  return <meshStandardMaterial color={color} roughness={0.85} />;
}

// ---------------------------------------------------------------------------- corpo paramétrico

type Profile = {
  /** Altura da boca (cm); o corpo vai de y = 0 até aqui. */
  height: number;
  /** Raio do filete do fundo. */
  fillet: number;
  /** Expoente da superelipse da seção (2 = elipse, 4 = quase retângulo). */
  power: number;
  halfW: (t: number) => number;
  halfD: (t: number) => number;
  /** Deslocamento extra na direção da normal (rugas, franzido). */
  ripple?: (t: number, theta: number) => number;
  /** Deslocamento vertical extra (babado). */
  lift?: (t: number, theta: number) => number;
};

type Section = { x: number; z: number; nx: number; nz: number };

/** Ponto e normal horizontal da superelipse da altura t; theta = π/2 é o centro da frente (+z). */
function section(p: Profile, t: number, theta: number): Section {
  const a = Math.max(0.05, p.halfW(t));
  const b = Math.max(0.05, p.halfD(t));
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const e = 2 / p.power;
  const g = (2 * (p.power - 1)) / p.power;
  const nx = (Math.sign(c) * Math.abs(c) ** g) / a;
  const nz = (Math.sign(s) * Math.abs(s) ** g) / b;
  const len = Math.hypot(nx, nz) || 1;
  return { x: a * Math.sign(c) * Math.abs(c) ** e, z: b * Math.sign(s) * Math.abs(s) ** e, nx: nx / len, nz: nz / len };
}

function wallPoint(p: Profile, t: number, theta: number, out: THREE.Vector3, offset = 0) {
  const s = section(p, t, theta);
  const r = (p.ripple ? p.ripple(t, theta) : 0) + offset;
  const y = p.fillet + t * (p.height - p.fillet) + (p.lift ? p.lift(t, theta) : 0);
  return out.set(s.x + s.nx * r, y, s.z + s.nz * r);
}

function tAtY(p: Profile, y: number) {
  return clamp((y - p.fillet) / Math.max(0.01, p.height - p.fillet), 0, 1);
}

type LoopFn = (theta: number, out: THREE.Vector3) => void;

/** Volta completa (começa nas costas) reamostrada em `count` trechos de mesmo comprimento. */
function sampleLoop(at: LoopFn, count: number) {
  const dense = count * 4;
  const pts: THREE.Vector3[] = [];
  const cum: number[] = [];
  for (let i = 0; i <= dense; i += 1) {
    const v = new THREE.Vector3();
    at(-Math.PI / 2 + (i / dense) * Math.PI * 2, v);
    cum.push(i ? cum[i - 1] + v.distanceTo(pts[i - 1]) : 0);
    pts.push(v);
  }
  const length = cum[dense];
  const points: THREE.Vector3[] = [];
  let k = 0;
  for (let j = 0; j <= count; j += 1) {
    const target = (j / count) * length;
    while (k < dense - 1 && cum[k + 1] < target) k += 1;
    const span = cum[k + 1] - cum[k] || 1;
    points.push(pts[k].clone().lerp(pts[k + 1], clamp((target - cum[k]) / span, 0, 1)));
  }
  return { points, length };
}

const COLS = 112;

/** Corpo fechado embaixo e aberto na boca. UV em centímetros (para a trama). */
function bodyGeometry(p: Profile, wallRows: number) {
  const rf = p.fillet;
  const rows: LoopFn[] = [];
  const base = (theta: number) => section(p, 0, theta);
  for (const s of [0.02, 0.3, 0.62, 1]) {
    rows.push((theta, out) => {
      const b = base(theta);
      out.set((b.x - b.nx * rf) * s, 0, (b.z - b.nz * rf) * s);
    });
  }
  const filletRows = 5;
  for (let k = 1; k < filletRows; k += 1) {
    const phi = (k / filletRows) * (Math.PI / 2);
    const inset = rf * (1 - Math.sin(phi));
    const y = rf * (1 - Math.cos(phi));
    rows.push((theta, out) => {
      const b = base(theta);
      out.set(b.x - b.nx * inset, y, b.z - b.nz * inset);
    });
  }
  for (let k = 0; k <= wallRows; k += 1) {
    const t = k / wallRows;
    rows.push((theta, out) => wallPoint(p, t, theta, out));
  }

  const stride = COLS + 1;
  const positions = new Float32Array(rows.length * stride * 3);
  const uvs = new Float32Array(rows.length * stride * 2);
  const vAcc = new Float32Array(stride);
  let prev: THREE.Vector3[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const { points, length } = sampleLoop(rows[i], COLS);
    for (let j = 0; j < points.length; j += 1) {
      const pt = points[j];
      const k = i * stride + j;
      positions[k * 3] = pt.x;
      positions[k * 3 + 1] = pt.y;
      positions[k * 3 + 2] = pt.z;
      if (prev.length) vAcc[j] += pt.distanceTo(prev[j]);
      uvs[k * 2] = (j / COLS) * length;
      uvs[k * 2 + 1] = vAcc[j];
    }
    prev = points;
  }
  const indices: number[] = [];
  for (let i = 0; i < rows.length - 1; i += 1) {
    for (let j = 0; j < COLS; j += 1) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

type FrontRow = { points: THREE.Vector3[]; cum: number[]; center: number };
const FRONT_SAMPLES = 200;

/** Lado do corpo: 1 = frente (+z), -1 = costas (-z), sempre lido por quem olha daquele lado. */
type Side = 1 | -1;

/**
 * Meia-volta da frente (da esquerda para a direita de quem olha) com comprimento acumulado. Com side = -1, a
 * meia-volta das costas, também da esquerda para a direita de quem olha por trás (de +x para -x).
 */
function frontRow(p: Profile, t: number, side: Side = 1): FrontRow {
  const points: THREE.Vector3[] = [];
  const cum: number[] = [];
  for (let i = 0; i <= FRONT_SAMPLES; i += 1) {
    const theta = side === 1 ? Math.PI * (1 - i / FRONT_SAMPLES) : -Math.PI * (i / FRONT_SAMPLES);
    const v = wallPoint(p, t, theta, new THREE.Vector3());
    cum.push(i ? cum[i - 1] + v.distanceTo(points[i - 1]) : 0);
    points.push(v);
  }
  return { points, cum, center: cum[FRONT_SAMPLES / 2] };
}

/** Ponto a `s` cm (comprimento de arco) do centro da frente. */
function pick(row: FrontRow, s: number, out = new THREE.Vector3()) {
  const last = row.cum.length - 1;
  const target = clamp(row.center + s, 0, row.cum[last]);
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (row.cum[mid] <= target) lo = mid;
    else hi = mid;
  }
  const span = row.cum[hi] - row.cum[lo] || 1;
  return out.copy(row.points[lo]).lerp(row.points[hi], clamp((target - row.cum[lo]) / span, 0, 1));
}

type SurfaceFrame = { pos: THREE.Vector3; normal: THREE.Vector3 };

/** Posição e normal na frente do corpo, a `s` cm do centro e na altura y. */
function frontFrame(p: Profile, s: number, y: number): SurfaceFrame {
  const row = frontRow(p, tAtY(p, y));
  const up = frontRow(p, tAtY(p, y + 0.3));
  const down = frontRow(p, tAtY(p, y - 0.3));
  const pos = pick(row, s);
  const ds = pick(row, s + 0.3).sub(pick(row, s - 0.3));
  const dy = pick(up, s).sub(pick(down, s));
  const normal = ds.cross(dy);
  if (normal.lengthSq() < 1e-10) normal.set(0, 0, 1);
  return { pos, normal: normal.normalize() };
}

/** O mesmo ponto nas costas (o corpo é simétrico em z). */
function mirrorFrame(f: SurfaceFrame): SurfaceFrame {
  return { pos: vec(f.pos.x, f.pos.y, -f.pos.z), normal: vec(f.normal.x, f.normal.y, -f.normal.z) };
}

const along = (f: SurfaceFrame, k: number) => f.pos.clone().addScaledVector(f.normal, k);

const ARC_STEPS = 160;

/** Linha central da frente (ou das costas, side = -1) entre y0 e y1: alturas e comprimento de arco acumulado. */
function centerColumn(p: Profile, y0: number, y1: number, side: Side = 1) {
  const ys: number[] = [];
  const arc: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const theta = side === 1 ? Math.PI / 2 : -Math.PI / 2;
  for (let i = 0; i <= ARC_STEPS; i += 1) {
    const y = lerp(y0, y1, i / ARC_STEPS);
    wallPoint(p, tAtY(p, y), theta, b);
    arc.push(i ? arc[i - 1] + a.distanceTo(b) : 0);
    ys.push(y);
    a.copy(b);
  }
  return { ys, arc };
}

/** Altura real da estampa (cm medidos sobre o tecido, não na vertical): define o aspecto da arte. */
function centerArc(p: Profile, y0: number, y1: number) {
  const { arc } = centerColumn(p, y0, y1);
  return Math.max(0.5, arc[ARC_STEPS]);
}

/**
 * Malha da estampa: copia a frente do corpo (pw cm de largura, de y0 a y1) e sobe um pouco na normal.
 * Linhas e colunas são espaçadas por comprimento de arco, então onde o corpo curva (topo da
 * necessaire, barriga da ecobag) a arte não estica. u cresce da esquerda para a direita e v de
 * baixo para cima, como a arte no canvas; o aspecto da textura é pw / centerArc(p, y0, y1).
 * Com side = -1 copia as costas, com u da esquerda para a direita de quem olha por trás (a arte não espelha).
 */
function printGeometry(p: Profile, pw: number, y0: number, y1: number, cols = 44, rows = 32, side: Side = 1) {
  const positions = new Float32Array((rows + 1) * (cols + 1) * 3);
  const uvs = new Float32Array((rows + 1) * (cols + 1) * 2);
  const v = new THREE.Vector3();
  const { ys, arc } = centerColumn(p, y0, y1, side);
  const total = arc[ARC_STEPS] || 1;
  let m = 0;
  for (let i = 0; i <= rows; i += 1) {
    const target = (total * i) / rows;
    while (m < ARC_STEPS - 1 && arc[m + 1] < target) m += 1;
    const span = arc[m + 1] - arc[m] || 1;
    const y = lerp(ys[m], ys[m + 1], clamp((target - arc[m]) / span, 0, 1));
    const row = frontRow(p, tAtY(p, y), side);
    for (let j = 0; j <= cols; j += 1) {
      pick(row, -pw / 2 + (pw * j) / cols, v);
      const k = i * (cols + 1) + j;
      positions[k * 3] = v.x;
      positions[k * 3 + 1] = v.y;
      positions[k * 3 + 2] = v.z;
      uvs[k * 2] = j / cols;
      uvs[k * 2 + 1] = i / rows;
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      const a = i * (cols + 1) + j;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute("normal");
  for (let k = 0; k < normals.count; k += 1) {
    positions[k * 3] += normals.getX(k) * 0.05;
    positions[k * 3 + 1] += normals.getY(k) * 0.05;
    positions[k * 3 + 2] += normals.getZ(k) * 0.05;
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Estampa das costas com a arte do passo "Verso" (art.back): a mesma área da frente (pw de largura, de y0 a y1, no
 * aspecto da frente) copiada no lado de trás do corpo, com a mesma tinta. Só monta quando o cliente fez um verso;
 * sem ele as costas seguem lisas, como antes.
 */
function BackPrint({ profile, pw, y0, y1, aspect, art, label, look }: { profile: Profile; pw: number; y0: number; y1: number; aspect: number; art: ArtRender; label: string; look?: InkLook }) {
  const printArt = useApparelArt(art);
  const texture = useArtTexture(aspect, "front", printArt, label);
  const geometry = useMemo(() => printGeometry(profile, pw, y0, y1, 44, 32, -1), [profile, pw, y0, y1]);
  useGeometryCleanup(geometry);
  return (
    <mesh geometry={geometry}>
      <Ink map={texture} {...look} />
    </mesh>
  );
}

/** Volta fechada na altura t (sem o ponto repetido), afastada `offset` cm da superfície. */
function loopPoints(p: Profile, t: number, count: number, offset = 0) {
  const { points } = sampleLoop((theta, out) => wallPoint(p, t, theta, out, offset), count);
  points.pop();
  return points;
}

/** Linha vertical da lateral (theta = 0 direita, π esquerda), de baixo até a boca. */
function seamPoints(p: Profile, theta: number, offset: number, t0 = 0, t1 = 1, count = 40) {
  return Array.from({ length: count + 1 }, (_, k) => wallPoint(p, lerp(t0, t1, k / count), theta, new THREE.Vector3(), offset));
}

// ---------------------------------------------------------------------------- geometrias varridas

function ringGeometry(points: THREE.Vector3[], radius: number, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points, true, "centripetal");
  return new THREE.TubeGeometry(curve, clamp(points.length * 2, 64, 360), radius, radial, true);
}

function pipeGeometry(points: THREE.Vector3[], radius: number, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  return new THREE.TubeGeometry(curve, clamp(points.length * 2, 24, 240), radius, radial, false);
}

type StitchPath = { points: THREE.Vector3[]; closed: boolean };

function appendDash(pos: number[], idx: number[], a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const axis = b.clone().sub(a);
  const len = axis.length();
  if (len < 1e-6) return;
  axis.divideScalar(len);
  const u = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) < 0.9 ? AXIS_Y : AXIS_X).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u);
  const base = pos.length / 3;
  for (const end of [a, b]) {
    for (let k = 0; k < 4; k += 1) {
      const ang = (k * Math.PI) / 2;
      const o = end.clone().addScaledVector(u, Math.cos(ang) * r).addScaledVector(v, Math.sin(ang) * r);
      pos.push(o.x, o.y, o.z);
    }
  }
  for (let k = 0; k < 4; k += 1) {
    const k2 = (k + 1) % 4;
    idx.push(base + k, base + k2, base + 4 + k, base + k2, base + 4 + k2, base + 4 + k);
  }
  idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  idx.push(base + 4, base + 5, base + 6, base + 4, base + 6, base + 7);
}

/** Pesponto tracejado: pontinhos de linha em vários caminhos, numa só malha. */
function stitchGeometry(paths: StitchPath[], dash = 0.34, gap = 0.2, radius = 0.04) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const { points, closed } of paths) {
    if (points.length < 2) continue;
    const path = closed ? [...points, points[0]] : points;
    const cum = [0];
    for (let i = 1; i < path.length; i += 1) cum.push(cum[i - 1] + path[i].distanceTo(path[i - 1]));
    const total = cum[cum.length - 1];
    let k = 0;
    const at = (s: number) => {
      while (k < path.length - 2 && cum[k + 1] < s) k += 1;
      const span = cum[k + 1] - cum[k] || 1;
      return path[k].clone().lerp(path[k + 1], clamp((s - cum[k]) / span, 0, 1));
    };
    for (let s = gap / 2; s + dash <= total; s += dash + gap) appendDash(pos, idx, at(s), at(s + dash), radius);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  return geometry;
}

// Seção de fita (retângulo de cantos bem arredondados), em frações de largura × espessura.
const STRAP_PROFILE = Array.from({ length: 16 }, (_, k) => {
  const a = (k / 16) * Math.PI * 2;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: Math.sign(c) * Math.abs(c) ** 0.3 * 0.5, y: Math.sign(s) * Math.abs(s) ** 0.3 * 0.5 };
});

type StrapOptions = {
  width: number;
  thick: number;
  /** A face larga olha para esse eixo (alças num plano vertical). */
  facing?: THREE.Vector3;
  /** Ou: a largura segue esse eixo (laço horizontal, tiras que descem). */
  widthAxis?: THREE.Vector3;
  closed?: boolean;
  samples?: number;
  /** Recuo do pesponto a partir da borda; 0 = sem pesponto. */
  stitchInset?: number;
};

/** Fita/alça varrida sobre uma curva. Devolve a malha (UV em cm) e as linhas de pesponto das duas faces. */
function strapGeometry(points: THREE.Vector3[], o: StrapOptions) {
  const closed = o.closed ?? false;
  const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal");
  const n = o.samples ?? 96;
  const length = curve.getLength();
  const ringCount = closed ? n : n + 1;
  const m = STRAP_PROFILE.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const stitches: THREE.Vector3[][] = [[], [], [], []];
  const prevW = AXIS_X.clone();
  const inset = o.stitchInset ?? 0;
  for (let i = 0; i < ringCount; i += 1) {
    const u = i / n;
    const P = curve.getPointAt(u);
    const T = curve.getTangentAt(u);
    const W = o.facing ? T.clone().cross(o.facing) : (o.widthAxis ?? AXIS_Y).clone().addScaledVector(T, -T.dot(o.widthAxis ?? AXIS_Y));
    if (W.lengthSq() < 1e-8) W.copy(prevW);
    else W.normalize();
    prevW.copy(W);
    const N = T.clone().cross(W).normalize();
    for (let k = 0; k < m; k += 1) {
      const q = P.clone().addScaledVector(W, STRAP_PROFILE[k].x * o.width).addScaledVector(N, STRAP_PROFILE[k].y * o.thick);
      pos.push(q.x, q.y, q.z);
      uv.push(u * length, (k / m) * o.width * 2);
    }
    if (inset > 0) {
      const sw = o.width / 2 - inset;
      const sn = o.thick / 2 + 0.015;
      stitches[0].push(P.clone().addScaledVector(W, sw).addScaledVector(N, sn));
      stitches[1].push(P.clone().addScaledVector(W, -sw).addScaledVector(N, sn));
      stitches[2].push(P.clone().addScaledVector(W, sw).addScaledVector(N, -sn));
      stitches[3].push(P.clone().addScaledVector(W, -sw).addScaledVector(N, -sn));
    }
  }
  for (let i = 0; i < n; i += 1) {
    const next = closed ? (i + 1) % ringCount : i + 1;
    for (let k = 0; k < m; k += 1) {
      const k2 = (k + 1) % m;
      const a = i * m + k;
      const b = i * m + k2;
      const c = next * m + k;
      const d = next * m + k2;
      idx.push(a, b, c, b, d, c);
    }
  }
  if (!closed) {
    // Tampas das pontas.
    for (const [ring, flip] of [
      [0, true],
      [n, false],
    ] as [number, boolean][]) {
      const center = new THREE.Vector3();
      for (let k = 0; k < m; k += 1) center.add(new THREE.Vector3(pos[(ring * m + k) * 3], pos[(ring * m + k) * 3 + 1], pos[(ring * m + k) * 3 + 2]));
      center.divideScalar(m);
      const ci = pos.length / 3;
      pos.push(center.x, center.y, center.z);
      uv.push(0, 0);
      for (let k = 0; k < m; k += 1) {
        const a = ring * m + k;
        const b = ring * m + ((k + 1) % m);
        if (flip) idx.push(ci, b, a);
        else idx.push(ci, a, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  const paths: StitchPath[] = inset > 0 ? stitches.map((s) => ({ points: s, closed })) : [];
  return { geometry, stitches: paths };
}

/** Corda de três pernas torcidas em hélice ao redor da curva (alça de corda, cordão do saquinho). */
function ropeGeometry(points: THREE.Vector3[], radius: number, pitch: number, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal");
  const length = curve.getLength();
  const turns = Math.max(1, Math.round(length / pitch));
  const segs = Math.round(clamp(turns * 10, 48, 640));
  const frames = curve.computeFrenetFrames(segs, closed);
  const parts: THREE.BufferGeometry[] = [];
  for (let strand = 0; strand < 3; strand += 1) {
    const pts: THREE.Vector3[] = [];
    const count = closed ? segs : segs + 1;
    for (let i = 0; i < count; i += 1) {
      const u = i / segs;
      const a = u * turns * Math.PI * 2 + (strand * Math.PI * 2) / 3;
      const P = curve.getPointAt(u);
      P.addScaledVector(frames.normals[i], Math.cos(a) * radius * 0.45).addScaledVector(frames.binormals[i], Math.sin(a) * radius * 0.45);
      pts.push(P);
    }
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), segs, radius * 0.58, 6, closed));
  }
  const merged = mergeGeometries(parts);
  if (merged) {
    parts.forEach((g) => g.dispose());
    return merged;
  }
  parts.slice(1).forEach((g) => g.dispose());
  return parts[0];
}

function roundedRectPath<T extends THREE.Path>(path: T, cx: number, cy: number, w: number, h: number, r: number): T {
  const rr = Math.max(0.001, Math.min(r, w / 2, h / 2));
  const x = cx - w / 2;
  const y = cy - h / 2;
  path.moveTo(x + rr, y);
  path.lineTo(x + w - rr, y);
  path.quadraticCurveTo(x + w, y, x + w, y + rr);
  path.lineTo(x + w, y + h - rr);
  path.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  path.lineTo(x + rr, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - rr);
  path.lineTo(x, y + rr);
  path.quadraticCurveTo(x, y, x + rr, y);
  return path;
}

/** Placa de cantos e arestas arredondados no plano XY, centrada, espessura em z (furo opcional). */
function plateGeometry(w: number, h: number, t: number, r: number, hole?: { w: number; h: number; y: number }) {
  const bevel = Math.min(t * 0.35, r * 0.5, 0.08);
  const shape = roundedRectPath(new THREE.Shape(), 0, 0, Math.max(0.02, w - bevel * 2), Math.max(0.02, h - bevel * 2), Math.max(0.001, r - bevel));
  if (hole) shape.holes.push(roundedRectPath(new THREE.Path(), 0, hole.y, hole.w, hole.h, Math.min(hole.w, hole.h) / 2));
  const depth = Math.max(0.002, t - bevel * 2);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Caixa com cantos arredondados de verdade: esfera achatada em superelipsoide (encosto de cabeça). */
function softBoxGeometry(w: number, h: number, d: number, e = 0.32) {
  const g = new THREE.SphereGeometry(1, 48, 32);
  const pos = g.getAttribute("position");
  const f = (v: number) => Math.sign(v) * Math.abs(v) ** e;
  for (let i = 0; i < pos.count; i += 1) {
    const x = f(pos.getX(i));
    const y = f(pos.getY(i));
    const z = f(pos.getZ(i));
    // Topo um pouco mais estreito e frente estufada, como uma espuma revestida.
    pos.setXYZ(i, x * (w / 2) * (1 - 0.06 * (y + 1)), y * (h / 2), z * (d / 2) * (1 + 0.1 * (1 - x * x)));
  }
  g.computeVertexNormals();
  // Nos polos os triângulos degeneram e a normal zera: aponta para cima/baixo.
  const nor = g.getAttribute("normal");
  for (let i = 0; i < nor.count; i += 1) {
    if (Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i)) < 0.5) nor.setXYZ(i, 0, Math.sign(pos.getY(i)) || 1, 0);
  }
  return g;
}

/** Caixas soltas numa só malha (dentes do zíper). */
function boxesGeometry(boxes: { c: [number, number, number]; s: [number, number, number] }[]) {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const faces: [number, number, number, number][] = [
    // [eixo normal, sinal, eixo u, eixo v] com u × v = normal
    [0, 1, 1, 2],
    [0, -1, 2, 1],
    [1, 1, 2, 0],
    [1, -1, 0, 2],
    [2, 1, 0, 1],
    [2, -1, 1, 0],
  ];
  for (const { c, s } of boxes) {
    for (const [axis, sign, ua, va] of faces) {
      const base = pos.length / 3;
      for (const [du, dv] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const p: [number, number, number] = [c[0], c[1], c[2]];
        p[axis] += (sign * s[axis]) / 2;
        p[ua] += (du * s[ua]) / 2;
        p[va] += (dv * s[va]) / 2;
        pos.push(p[0], p[1], p[2]);
        const n: [number, number, number] = [0, 0, 0];
        n[axis] = sign;
        nor.push(n[0], n[1], n[2]);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geometry.setIndex(idx);
  return geometry;
}

/** Grade (u, v) ∈ [0,1]² orientada para fora segundo `outward`. UV padrão 0–1 (painel de papel). */
function gridGeometry(nu: number, nv: number, at: (u: number, v: number, out: THREE.Vector3) => void, outward: THREE.Vector3) {
  const positions = new Float32Array((nu + 1) * (nv + 1) * 3);
  const uvs = new Float32Array((nu + 1) * (nv + 1) * 2);
  const p = new THREE.Vector3();
  for (let j = 0; j <= nv; j += 1) {
    for (let i = 0; i <= nu; i += 1) {
      at(i / nu, j / nv, p);
      const k = j * (nu + 1) + i;
      positions[k * 3] = p.x;
      positions[k * 3 + 1] = p.y;
      positions[k * 3 + 2] = p.z;
      uvs[k * 2] = i / nu;
      uvs[k * 2 + 1] = j / nv;
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < nv; j += 1) {
    for (let i = 0; i < nu; i += 1) {
      const a = j * (nu + 1) + i;
      const b = a + 1;
      const c = a + nu + 1;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  // Confere a orientação no triângulo do meio e inverte tudo se apontar para dentro.
  const mid = Math.floor(indices.length / 6 / 2) * 6;
  const at3 = (i: number) => vec(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
  const A = at3(indices[mid]);
  const n = at3(indices[mid + 1]).sub(A).cross(at3(indices[mid + 2]).sub(A));
  if (n.dot(outward) < 0) {
    for (let k = 0; k < indices.length; k += 3) {
      const tmp = indices[k + 1];
      indices[k + 1] = indices[k + 2];
      indices[k + 2] = tmp;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// ---------------------------------------------------------------------------- tote / ecobag / praia

function toteProfile(W: number, H: number, D: number, beach: boolean): Profile {
  return {
    height: H,
    fillet: Math.min(1.4, D * 0.3),
    power: beach ? 2.8 : 3.2,
    // Praia: trapézio, mais larga na boca.
    halfW: (t) => (W / 2) * (beach ? 0.88 + 0.12 * t : 1) * (1 + 0.015 * Math.sin(Math.PI * t)),
    // O fole fica cheio embaixo e se fecha perto da boca; a frente estufa no meio.
    halfD: (t) => lerp(D / 2, D * (beach ? 0.32 : 0.2), smooth(t, 0.15, 1)) + D * 0.1 * Math.sin(Math.PI * t),
    ripple: (t, th) => (0.2 * Math.sin(th * 5 + t * 7) + 0.12 * Math.sin(th * 9 - t * 4)) * Math.sin(Math.PI * t) + 0.22 * smooth(t, 0.82, 1) * Math.sin(th * 13),
  };
}

/** Etiqueta de tecido costurada na lateral esquerda (a que fica à vista no ângulo padrão). */
function sideTag(p: Profile) {
  const at = wallPoint(p, 0.62, Math.PI, new THREE.Vector3());
  return { position: vec(at.x - 0.75, at.y, at.z), geometry: plateGeometry(1.5, 2.2, 0.08, 0.15) };
}

function ToteBag({ spec, art, label, beach }: ModelProps & { beach: boolean }) {
  const W = beach ? cm(spec.widthCm, 45, 24, 80) : cm(spec.widthCm, 35, 12, 70);
  const H = beach ? cm(spec.heightCm, 32, 18, 60) : cm(spec.heightCm, 40, 12, 70);
  const D = beach ? clamp(W * 0.3, 9, 18) : clamp(cm(spec.depthCm, 10, 2, 20) * 0.7, 3, W * 0.3);
  const fillet = Math.min(1.4, D * 0.3);
  const y0 = fillet + H * 0.07;
  const y1 = Math.max(y0 + 2, beach ? H - 7.2 : H - 3.4);
  const pw = (beach ? 0.76 : 0.8) * W;
  const drop = beach ? clamp(H * 0.45, 10, 22) : clamp(H * 0.62, 14, 32);
  const profile = useMemo(() => toteProfile(W, H, D, beach), [W, H, D, beach]);
  const ph = useMemo(() => centerArc(profile, y0, y1), [profile, y0, y1]);

  const printArt = useApparelArt(art);
  const texture = useArtTexture(pw / ph, "front", printArt, label);
  const backArt = useMemo(() => backArtOf(art), [art]);
  const grain = useGrain("weave", 0.45);

  const parts = useMemo(() => {
    const p = profile;
    const body = bodyGeometry(p, 60);
    const print = printGeometry(p, pw, y0, y1);
    const rim = ringGeometry(loopPoints(p, 1, 180, 0.02), 0.17);
    const tag = sideTag(p);
    const hemPaths: StitchPath[] = [{ points: loopPoints(p, tAtY(p, H - 2.1), 220, 0.06), closed: true }];
    const handles: THREE.BufferGeometry[] = [];
    const handleStitches: StitchPath[] = [];
    const grommets: { position: THREE.Vector3; quaternion: THREE.Quaternion }[] = [];

    if (beach) {
      // Corda passando por ilhoses: sai pela frente, faz o arco e volta pelo outro ilhós.
      const gx = W * 0.2;
      const gy = H - 3.6;
      const left = frontFrame(p, -gx, gy);
      const right = frontFrame(p, gx, gy);
      const zf = left.pos.z;
      const rope = (side: 1 | -1) => {
        const pts = [
          along(left, -1.2),
          along(left, 0.8),
          along(left, 1.6).add(vec(-0.6, 3.5, 0)),
          vec(-gx * 0.95, H + drop * 0.72, zf + 1.8),
          vec(0, H + drop * (side === 1 ? 1 : 0.95), zf + 1.2),
          vec(gx * 0.95, H + drop * 0.72, zf + 1.8),
          along(right, 1.6).add(vec(0.6, 3.5, 0)),
          along(right, 0.8),
          along(right, -1.2),
        ];
        return pts.map((q) => vec(q.x, q.y, q.z * side));
      };
      handles.push(ropeGeometry(rope(1), 0.55, 1.6), ropeGeometry(rope(-1), 0.55, 1.6));
      for (const f of [left, right, mirrorFrame(left), mirrorFrame(right)]) {
        grommets.push({ position: along(f, 0.12), quaternion: new THREE.Quaternion().setFromUnitVectors(AXIS_Z, f.normal) });
      }
    } else {
      // Alças de fita costuradas por dentro da boca: a frente fica livre para a arte.
      const x0 = clamp(W * 0.2, 4.5, 12);
      const yIn = H - 5;
      for (const side of [1, -1] as const) {
        const zIn = (p.halfD(tAtY(p, yIn)) - 0.8) * side;
        const zTop = (p.halfD(1) - 0.6) * side;
        const lean = side * 1.2;
        const apex = H + drop * (side === 1 ? 1 : 0.96);
        const pts = [
          vec(-x0, yIn, zIn),
          vec(-x0, H - 0.3, zTop),
          vec(-x0 * 1.06, H + drop * 0.4, zTop + lean * 0.5),
          vec(-x0 * 0.82, H + drop * 0.86, zTop + lean),
          vec(0, apex, zTop + lean * 1.1),
          vec(x0 * 0.82, H + drop * 0.86, zTop + lean),
          vec(x0 * 1.06, H + drop * 0.4, zTop + lean * 0.5),
          vec(x0, H - 0.3, zTop),
          vec(x0, yIn, zIn),
        ];
        const strap = strapGeometry(pts, { width: 2.6, thick: 0.24, facing: AXIS_Z, samples: 120, stitchInset: 0.32 });
        handles.push(strap.geometry);
        handleStitches.push(...strap.stitches);
      }
    }
    const stitch = stitchGeometry([...hemPaths, ...handleStitches]);
    const torus = new THREE.TorusGeometry(1.0, 0.26, 12, 32);
    const hole = new THREE.CircleGeometry(0.78, 24);
    return {
      body,
      print,
      rim,
      tag,
      handles,
      stitch,
      grommets,
      torus,
      hole,
      all: [body, print, rim, tag.geometry, stitch, torus, hole, ...handles],
    };
  }, [profile, W, H, beach, pw, y0, y1, drop]);
  useGeometriesCleanup(parts.all);

  const fabric = clothColor(spec.baseColor);
  const inner = shade(fabric, 0.74);
  const thread = threadColor(fabric);
  const handleColor = spec.accentColor ?? fabric;
  const ropeColor = spec.accentColor ?? "#d8c49c";
  const metal = metalColor(spec.metal);
  const roughness = beach ? 0.62 : 0.92;
  const scale = TARGET / Math.max(W, H + drop);

  return (
    <group rotation-y={0.32}>
      <group scale={scale}>
        <mesh geometry={parts.body}>
          <Cloth color={fabric} map={grain} roughness={roughness} sheen={beach ? 0.5 : 1} />
        </mesh>
        <mesh geometry={parts.body}>
          <Cloth color={inner} side={THREE.BackSide} />
        </mesh>
        <mesh geometry={parts.print}>
          <Ink map={texture} roughness={beach ? 0.6 : 0.86} />
        </mesh>
        {backArt && <BackPrint profile={profile} pw={pw} y0={y0} y1={y1} aspect={pw / ph} art={backArt} label={label} look={{ roughness: beach ? 0.6 : 0.86 }} />}
        <mesh geometry={parts.rim}>
          <Cloth color={fabric} map={grain} roughness={roughness} />
        </mesh>
        <mesh geometry={parts.stitch}>
          <Thread color={thread} />
        </mesh>
        <mesh geometry={parts.tag.geometry} position={parts.tag.position}>
          <Cloth color={trimColor(spec)} sheen={0.4} />
        </mesh>
        {parts.handles.map((g, i) => (
          <mesh key={i} geometry={g}>
            {beach ? <meshStandardMaterial color={ropeColor} roughness={0.88} /> : <Cloth color={handleColor} map={grain} />}
          </mesh>
        ))}
        {parts.grommets.map((g, i) => (
          <group key={i} position={g.position} quaternion={g.quaternion}>
            <mesh geometry={parts.torus}>
              <Metal color={metal} />
            </mesh>
            <mesh geometry={parts.hole} position-z={0.02}>
              <meshStandardMaterial color="#141414" roughness={1} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- sacola de papel com alça de corda

function PaperGiftBag({ spec, art, label }: ModelProps) {
  const W = cm(spec.widthCm, 15, 8, 50);
  const H = cm(spec.heightCm, 22, 10, 60);
  const D = clamp(cm(spec.depthCm, 10, 2, 30) * 0.8, 4, W * 0.6);
  const drop = clamp(H * 0.42, 6, 16);
  // A face inteira da sacola é impressa: fundo pintado, não transparente.
  const panelArt = useMemo(() => ({ ...art, opaque: true }), [art]);
  const front = useArtTexture(W / H, "front", panelArt, label);
  // Costas: a arte do passo "Verso" quando o cliente montou uma; sem ela, a regra da opção (frente repetida, cinza ou liso).
  const backKind = backKindOf(spec, panelArt);
  const back = useBackTexture(W / H, spec, panelArt, label);

  const parts = useMemo(() => {
    const foldH = Math.min(3.5, H * 0.16);
    const bow = Math.min(0.3, W * 0.02);
    const crease = D * 0.18;
    // Painel frontal: leve barriga abaixo da dobra do topo; a faixa dobrada (mais rígida) fica plana.
    const panel = (u: number, v: number, out: THREE.Vector3) => {
      const y = v * H;
      const rigid = smooth(y, H - foldH - 1, H - foldH);
      out.set((u - 0.5) * W, y, D / 2 + bow * Math.sin(Math.PI * u) * (0.35 + 0.65 * Math.sin(Math.PI * v)) * (1 - rigid) + 0.03 * rigid);
    };
    const frontPanel = gridGeometry(18, 30, panel, AXIS_Z);
    const backPanel = gridGeometry(18, 30, panel, AXIS_Z).rotateY(Math.PI);
    // Fole lateral: duas meias-faces que se dobram para dentro na vertical, mais perto da boca.
    const sides: THREE.BufferGeometry[] = [];
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        sides.push(
          gridGeometry(
            4,
            30,
            (u, v, out) => {
              const c = crease * smooth(v, 0.15, 1) * (1 - u);
              out.set(sx * (W / 2 - c), v * H, sz * u * (D / 2));
            },
            vec(sx, 0, 0),
          ),
        );
      }
    }
    const bottom = gridGeometry(2, 2, (u, v, out) => out.set((u - 0.5) * W, 0, (v - 0.5) * D), vec(0, -1, 0));
    // Dobra interna do topo (o papel virado para dentro, que dá rigidez à boca), na frente e nas costas.
    const fold = gridGeometry(12, 2, (u, v, out) => out.set((u - 0.5) * (W - 0.12), H - foldH + v * (foldH - 0.04), D / 2 - 0.07), vec(0, 0, -1));
    const foldBack = gridGeometry(12, 2, (u, v, out) => out.set((u - 0.5) * (W - 0.12), H - foldH + v * (foldH - 0.04), D / 2 - 0.07), vec(0, 0, -1)).rotateY(Math.PI);
    // Borda da boca: acompanha o V do fole.
    const outline = new THREE.CurvePath<THREE.Vector3>();
    const corners = [vec(-W / 2, H, D / 2), vec(W / 2, H, D / 2), vec(W / 2 - crease, H, 0), vec(W / 2, H, -D / 2), vec(-W / 2, H, -D / 2), vec(-W / 2 + crease, H, 0)];
    corners.forEach((c, i) => outline.add(new THREE.LineCurve3(c, corners[(i + 1) % corners.length])));
    const rim = new THREE.TubeGeometry(outline, 240, 0.05, 5, true);

    // Corda torcida passando pelos furos, com nó por dentro.
    const hx = W * 0.2;
    const yh = H - foldH * 0.55;
    const rope = (side: 1 | -1) =>
      [
        vec(-hx, yh, D / 2 - 0.9),
        vec(-hx, yh, D / 2 + 0.35),
        vec(-hx * 1.12, yh + foldH * 0.7, D / 2 + 0.75),
        vec(-hx * 0.92, H + drop * 0.75, D / 2 + 0.75),
        vec(0, H + drop * (side === 1 ? 1 : 0.95), D / 2 + 0.55),
        vec(hx * 0.92, H + drop * 0.75, D / 2 + 0.75),
        vec(hx * 1.12, yh + foldH * 0.7, D / 2 + 0.75),
        vec(hx, yh, D / 2 + 0.35),
        vec(hx, yh, D / 2 - 0.9),
      ].map((q) => vec(q.x, q.y, q.z * side));
    const ropes = [ropeGeometry(rope(1), 0.26, 0.9), ropeGeometry(rope(-1), 0.26, 0.9)];
    const holes = [-hx, hx].flatMap((x) => [vec(x, yh, D / 2 + 0.05), vec(x, yh, -D / 2 - 0.05)]);
    const knots = [-hx, hx].flatMap((x) => [vec(x, yh, D / 2 - 0.95), vec(x, yh, -D / 2 + 0.95)]);
    const hole = new THREE.CircleGeometry(0.32, 20);
    const knot = new THREE.SphereGeometry(0.52, 16, 12);
    return { frontPanel, backPanel, sides, bottom, fold, foldBack, rim, ropes, holes, knots, hole, knot, all: [frontPanel, backPanel, ...sides, bottom, fold, foldBack, rim, ...ropes, hole, knot] };
  }, [W, H, D, drop]);
  useGeometriesCleanup(parts.all);

  const paper = spec.baseColor.toLowerCase() === "#ffffff" ? "#f7f6f2" : spec.baseColor;
  const cord = spec.accentColor ?? (luma(paper) > 0.3 ? "#1d1d20" : "#ece6d8");
  const scale = TARGET / Math.max(W, H + drop);

  return (
    <group rotation-y={0.38}>
      <group scale={scale}>
        <mesh geometry={parts.frontPanel}>
          <PrintMaterial map={front} spec={spec} />
        </mesh>
        <mesh geometry={parts.frontPanel}>
          <meshStandardMaterial color={paper} roughness={0.6} side={THREE.BackSide} />
        </mesh>
        <mesh geometry={parts.backPanel}>
          {/* Verso sem impressão (4/0) é o próprio papel, na cor da sacola. */}
          {backKind === "blank" ? <meshStandardMaterial color={paper} roughness={roughnessOf(spec)} /> : <PrintMaterial map={back} spec={spec} />}
        </mesh>
        <mesh geometry={parts.backPanel}>
          <meshStandardMaterial color={paper} roughness={0.6} side={THREE.BackSide} />
        </mesh>
        {[parts.fold, parts.foldBack].map((g, i) => (
          <mesh key={i} geometry={g}>
            <meshStandardMaterial color={shade(paper, 0.97)} roughness={0.7} side={THREE.DoubleSide} />
          </mesh>
        ))}
        {[...parts.sides, parts.bottom].map((g, i) => (
          <mesh key={i} geometry={g}>
            <meshStandardMaterial color={paper} roughness={0.55} side={THREE.DoubleSide} />
          </mesh>
        ))}
        <mesh geometry={parts.rim}>
          <meshStandardMaterial color={shade(paper, 0.96)} roughness={0.5} />
        </mesh>
        {parts.holes.map((p, i) => (
          <mesh key={i} geometry={parts.hole} position={p} rotation-y={p.z < 0 ? Math.PI : 0}>
            <meshStandardMaterial color="#121212" roughness={1} />
          </mesh>
        ))}
        {parts.ropes.map((g, i) => (
          <mesh key={i} geometry={g}>
            <meshStandardMaterial color={cord} roughness={0.55} />
          </mesh>
        ))}
        {parts.knots.map((p, i) => (
          <mesh key={i} geometry={parts.knot} position={p}>
            <meshStandardMaterial color={cord} roughness={0.55} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- saquinho de presente com cordão

const CINCH = 0.78;

function giftProfile(W: number, H: number): Profile {
  const D0 = W * 0.17;
  const gather = (t: number) => smooth(t, 0.5, CINCH);
  const belowW = (t: number) => (W / 2) * (1 + 0.05 * Math.sin((Math.PI * t) / CINCH)) * (1 - 0.62 * gather(t));
  const belowD = (t: number) => D0 * (0.72 + 0.38 * Math.sin(Math.PI * Math.min(t / CINCH, 1) * 0.9)) * (1 - 0.72 * gather(t));
  const cW = belowW(CINCH);
  const cD = belowD(CINCH);
  const flare = (t: number) => Math.sin(((t - CINCH) / (1 - CINCH)) * (Math.PI / 2));
  return {
    height: H,
    fillet: Math.min(1.2, D0 * 0.35),
    power: 2.4,
    halfW: (t) => (t <= CINCH ? belowW(t) : lerp(cW, W * 0.4, flare(t))),
    halfD: (t) => (t <= CINCH ? belowD(t) : lerp(cD, D0 * 0.6, flare(t))),
    // Franzido: pregas finas que nascem embaixo do cordão e viram babado acima dele.
    ripple: (t, th) => {
      const g = t <= CINCH ? gather(t) : 1;
      return 0.5 * g * (0.6 * Math.sin(th * 14 + 1.3) + 0.4 * Math.sin(th * 23 + t * 20)) + 0.12 * Math.sin(th * 5 + t * 6) * Math.sin(Math.PI * t);
    },
    lift: (t, th) => smooth(t, CINCH + 0.06, 1) * 0.7 * Math.sin(th * 9 + 0.5),
  };
}

function GiftPouch({ spec, art, label }: ModelProps) {
  const W = cm(spec.widthCm, 20, 8, 60);
  const H = cm(spec.heightCm, 25, 10, 70);
  const fillet = Math.min(1.2, W * 0.17 * 0.35);
  const yc = fillet + CINCH * (H - fillet);
  const y0 = fillet + 1.4;
  const y1 = Math.max(y0 + 2, Math.min(yc - 5.3, fillet + 0.6 * (H - fillet)));
  const pw = W * 0.72;
  const profile = useMemo(() => giftProfile(W, H), [W, H]);
  const ph = useMemo(() => centerArc(profile, y0, y1), [profile, y0, y1]);
  const printArt = useApparelArt(art);
  const texture = useArtTexture(pw / ph, "front", printArt, label);
  const backArt = useMemo(() => backArtOf(art), [art]);
  const grain = useGrain("weave", 0.4);

  const parts = useMemo(() => {
    const p = profile;
    const body = bodyGeometry(p, 84);
    const print = printGeometry(p, pw, y0, y1);
    const rim = ringGeometry(loopPoints(p, 1, 200, 0.02), 0.14);
    const hem = stitchGeometry([{ points: loopPoints(p, tAtY(p, H - 1.4), 220, 0.05), closed: true }]);
    // Cordão esticado: apoia nas cristas das pregas (segue a seção sem as rugas).
    const tc = tAtY(p, yc);
    const ring = sampleLoop((theta, out) => {
      const sec = section(p, tc, theta);
      out.set(sec.x + sec.nx * 0.75, yc, sec.z + sec.nz * 0.75);
    }, 120).points;
    ring.pop();
    const cinch = ropeGeometry(ring, 0.24, 0.7, true);
    // Laço na frente: duas orelhas e duas pontas com nó, apoiadas sobre o tecido.
    // O laço acompanha o tamanho do saquinho (desenhado para 20 cm de largura).
    // Apoiado na superfície lisa (sem as pregas): o laço fica simétrico, com a largura desenhada, e
    // o afastamento extra cobre a altura das pregas para não atravessar o tecido.
    const k = clamp(W / 20, 0.6, 1.6);
    const smoothP: Profile = { ...p, ripple: undefined, lift: undefined };
    const crest = (y: number) => {
      const t = tAtY(p, y);
      return 0.5 * (t <= CINCH ? smooth(t, 0.5, CINCH) : 1) - 0.01;
    };
    const on = (x: number, y: number, lift: number) => along(frontFrame(smoothP, x * k, yc + y * k), lift + crest(yc + y * k));
    const center = on(0, 0, 0.9);
    const loopL = [center, on(-1.0, 0.9, 0.8), on(-2.6, 1.7, 0.9), on(-3.8, 0.5, 0.9), on(-3.2, -0.8, 0.8), on(-1.3, -0.5, 0.8), center.clone()];
    const loopR = loopL.map((q) => vec(-q.x, q.y, q.z));
    const tailL = [center, on(-0.7, -1.6, 0.6), on(-1.4, -3.2, 0.5), on(-1.7, -4.4, 0.5)];
    const tailR = [center, on(0.8, -1.5, 0.6), on(1.7, -3.0, 0.5), on(2.2, -4.1, 0.5)];
    const bow = [loopL, loopR, tailL, tailR].map((pts) => ropeGeometry(pts, 0.24, 0.7));
    const knots = [tailL[tailL.length - 1], tailR[tailR.length - 1]];
    const knot = new THREE.SphereGeometry(0.42, 16, 12);
    return { body, print, rim, hem, cinch, bow, center, knots, knot, all: [body, print, rim, hem, cinch, knot, ...bow] };
  }, [profile, W, H, pw, y0, y1, yc]);
  useGeometriesCleanup(parts.all);

  const fabric = clothColor(spec.baseColor);
  const cord = spec.accentColor ?? (luma(fabric) > 0.4 ? "#a8804e" : "#efe9dd");
  const scale = TARGET / Math.max(W, H);

  return (
    <group rotation-y={0.28}>
      <group scale={scale}>
        <mesh geometry={parts.body}>
          <Cloth color={fabric} map={grain} />
        </mesh>
        <mesh geometry={parts.body}>
          <Cloth color={shade(fabric, 0.74)} side={THREE.BackSide} />
        </mesh>
        <mesh geometry={parts.print}>
          <Ink map={texture} />
        </mesh>
        {backArt && <BackPrint profile={profile} pw={pw} y0={y0} y1={y1} aspect={pw / ph} art={backArt} label={label} />}
        <mesh geometry={parts.rim}>
          <Cloth color={fabric} map={grain} />
        </mesh>
        <mesh geometry={parts.hem}>
          <Thread color={threadColor(fabric)} />
        </mesh>
        {[parts.cinch, ...parts.bow].map((g, i) => (
          <mesh key={i} geometry={g}>
            <meshStandardMaterial color={cord} roughness={0.6} />
          </mesh>
        ))}
        <mesh geometry={parts.knot} position={parts.center} scale={[1.3, 1.1, 1]}>
          <meshStandardMaterial color={cord} roughness={0.6} />
        </mesh>
        {parts.knots.map((p, i) => (
          <mesh key={i} geometry={parts.knot} position={p}>
            <meshStandardMaterial color={cord} roughness={0.6} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- lixeira de carro no encosto de cabeça

function carProfile(W: number, H: number, D: number): Profile {
  return {
    height: H,
    fillet: Math.min(1.2, D * 0.3),
    power: 4,
    halfW: (t) => (W / 2) * (0.94 + 0.06 * t),
    halfD: (t) => (D / 2) * (0.92 + 0.12 * Math.sin(Math.PI * t)) * (1 - 0.1 * smooth(t, 0.7, 1)),
    ripple: (t, th) => 0.12 * Math.sin(th * 6 + t * 8) * Math.sin(Math.PI * t),
  };
}

/** Encosto de cabeça de carro médio (cm). */
const HEADREST = { w: 25, h: 16.5, d: 11 };

function CarTrashBag({ spec, art, label }: ModelProps) {
  // Pendurada, a lixeira é mais alta do que larga.
  const a = cm(spec.widthCm, 19.5, 10, 50);
  const b = cm(spec.heightCm, 26.5, 10, 60);
  const W = Math.min(a, b);
  const H = Math.max(a, b);
  const D = clamp(cm(spec.depthCm, 10, 2, 20) * 0.7, 4, 10);
  const fillet = Math.min(1.2, D * 0.3);
  const y0 = fillet + H * 0.06;
  const y1 = Math.max(y0 + 2, H - 2.6);
  const pw = W * 0.8;

  const head = HEADREST;
  const layout = useMemo(() => {
    const p = carProfile(W, H, D);
    const postX = 7.2;
    const postZ = -(p.halfD(1) + 2.6);
    const collarY = H + 3.2;
    const headBottom = H + 10;
    const loopY = H + 6.2;
    return { p, postX, postZ, collarY, headBottom, loopY };
  }, [W, H, D]);
  const ph = useMemo(() => centerArc(layout.p, y0, y1), [layout, y0, y1]);
  const printArt = useApparelArt(art);
  const texture = useArtTexture(pw / ph, "front", printArt, label);
  const backArt = useMemo(() => backArtOf(art), [art]);
  const grain = useGrain("weave", 0.4);

  const parts = useMemo(() => {
    const { p, postX, postZ, collarY, headBottom, loopY } = layout;
    const body = bodyGeometry(p, 56);
    const print = printGeometry(p, pw, y0, y1);
    // Debrum: boca, laterais e fundo.
    const rim = ringGeometry(loopPoints(p, 1, 180, 0.05), 0.38);
    const bottomPipe = ringGeometry(loopPoints(p, 0, 160, 0.05), 0.28);
    const sidePipes = [0, Math.PI].map((th) => pipeGeometry(seamPoints(p, th, 0.05), 0.28));
    const hem = stitchGeometry([{ points: loopPoints(p, tAtY(p, H - 1.6), 220, 0.06), closed: true }]);

    // Laço horizontal em volta das hastes e duas tiras descendo até as costas da bolsa.
    const r = 0.95;
    const loop: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k += 1) {
      const ang = -Math.PI / 2 + (k / 10) * Math.PI;
      loop.push(vec(postX + r * Math.cos(ang), loopY, postZ - r * Math.sin(ang)));
    }
    for (let k = 0; k <= 10; k += 1) {
      const ang = Math.PI / 2 + (k / 10) * Math.PI;
      loop.push(vec(-postX + r * Math.cos(ang), loopY, postZ - r * Math.sin(ang)));
    }
    const loopStrap = strapGeometry(loop, { width: 2.0, thick: 0.18, widthAxis: AXIS_Y, closed: true, samples: 140, stitchInset: 0.3 });
    const drops = [-1, 1].map((sx) => {
      const backAt = mirrorFrame(frontFrame(p, sx * (W / 2 - 2.2), H - 3.6));
      const pts = [
        vec(sx * postX, loopY, postZ + r - 0.05),
        vec(sx * (postX + 0.2), H + 3.4, postZ + r + 0.4),
        vec(sx * (W / 2 - 2.2), H + 0.6, -(p.halfD(1) + 0.4)),
        along(backAt, 0.25),
      ];
      return strapGeometry(pts, { width: 2.0, thick: 0.18, widthAxis: AXIS_X, samples: 48, stitchInset: 0.3 });
    });
    const strapStitch = stitchGeometry([...loopStrap.stitches, ...drops.flatMap((d) => d.stitches)], 0.28, 0.18, 0.035);
    const buckle = plateGeometry(3.0, 2.6, 0.55, 0.45, { w: 2.2, h: 0.5, y: 0.55 });

    // Encosto de cabeça (silhueta neutra) com hastes cromadas e guias plásticas.
    const headrest = softBoxGeometry(HEADREST.w, HEADREST.h, HEADREST.d);
    const postLen = headBottom + 1.5 - collarY;
    const post = new THREE.CylinderGeometry(0.6, 0.6, postLen, 20);
    const collar = new THREE.CylinderGeometry(1.05, 1.1, 1.4, 24);
    return {
      body,
      print,
      rim,
      bottomPipe,
      sidePipes,
      hem,
      loop: loopStrap.geometry,
      drops: drops.map((d) => d.geometry),
      strapStitch,
      buckle,
      headrest,
      post,
      collar,
      postLen,
      all: [body, print, rim, bottomPipe, ...sidePipes, hem, loopStrap.geometry, ...drops.map((d) => d.geometry), strapStitch, buckle, headrest, post, collar],
    };
  }, [layout, W, H, pw, y0, y1]);
  useGeometriesCleanup(parts.all);

  const { postX, postZ, collarY, headBottom, loopY } = layout;
  const fabric = clothColor(spec.baseColor);
  const trim = trimColor(spec);
  const scale = TARGET / Math.max(head.w, headBottom + head.h);

  return (
    <group rotation-y={0.34}>
      <group scale={scale}>
        <mesh geometry={parts.body}>
          <Cloth color={fabric} map={grain} />
        </mesh>
        <mesh geometry={parts.body}>
          <Cloth color={shade(fabric, 0.7)} side={THREE.BackSide} />
        </mesh>
        <mesh geometry={parts.print}>
          <Ink map={texture} />
        </mesh>
        {backArt && <BackPrint profile={layout.p} pw={pw} y0={y0} y1={y1} aspect={pw / ph} art={backArt} label={label} />}
        {[parts.rim, parts.bottomPipe, ...parts.sidePipes, parts.loop, ...parts.drops].map((g, i) => (
          <mesh key={i} geometry={g}>
            <Cloth color={trim} sheen={0.5} roughness={0.8} />
          </mesh>
        ))}
        <mesh geometry={parts.hem}>
          <Thread color={threadColor(fabric)} />
        </mesh>
        <mesh geometry={parts.strapStitch}>
          <Thread color={threadColor(trim)} />
        </mesh>
        <mesh geometry={parts.buckle} position={[0, loopY, postZ + 0.95 + 0.38]}>
          <meshStandardMaterial color="#141416" roughness={0.45} />
        </mesh>
        <mesh geometry={parts.headrest} position={[0, headBottom + head.h / 2, postZ]}>
          <meshPhysicalMaterial color="#2c2d31" roughness={0.85} sheen={0.6} sheenRoughness={0.6} sheenColor="#6d7078" />
        </mesh>
        {[-postX, postX].map((x) => (
          <group key={x}>
            <mesh geometry={parts.post} position={[x, collarY + parts.postLen / 2, postZ]}>
              <Metal color="#d9dce0" />
            </mesh>
            <mesh geometry={parts.collar} position={[x, collarY - 0.7, postZ]}>
              <meshStandardMaterial color="#1b1b1d" roughness={0.5} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- necessaire, necessaire com mosquetão e estojo

type PouchKind = "necessaire" | "clip" | "pencil";

type PouchShape = { W: number; H: number; D: number; power: number; topStart: number; slit: number; endR: number; fillet: number; bulge: number };

function pouchShape(kind: PouchKind, spec: MockupSpec): PouchShape {
  const a = cm(spec.widthCm, kind === "pencil" ? 20 : 22, 6, 40);
  const b = cm(spec.heightCm, kind === "pencil" ? 8 : 14, 4, 40);
  // Bolsinha deitada: o lado maior é a largura.
  const W = Math.max(a, b);
  const H = Math.min(a, b);
  if (kind === "clip") {
    const D = clamp(H * 0.36, 2, 5);
    return { W, H, D, power: 4, topStart: 0.42, slit: 0.32, endR: Math.min(0.9, H * 0.12), fillet: Math.min(0.6, D * 0.3), bulge: 0.04 };
  }
  if (kind === "pencil") {
    const D = clamp(cm(spec.depthCm, 10, 2, 20) * 0.5, 2.5, H * 0.7);
    return { W, H, D, power: 2.6, topStart: 0.42, slit: 0.4, endR: Math.min(1.4, H * 0.18), fillet: Math.min(0.8, D * 0.3), bulge: 0.06 };
  }
  const D = clamp(cm(spec.depthCm, 10, 2, 20), 3, H * 0.75);
  return { W, H, D, power: 3.4, topStart: 0.58, slit: 0.45, endR: Math.min(1.6, H * 0.12), fillet: Math.min(1.5, D * 0.25), bulge: 0.05 };
}

function pouchProfile(s: PouchShape): Profile {
  // Topo em quarto de círculo fechando no zíper; as pontas também arredondam.
  const round = (t: number) => {
    const k = clamp((t - s.topStart) / (1 - s.topStart), 0, 1);
    return Math.sqrt(1 - k * k);
  };
  return {
    height: s.H,
    fillet: s.fillet,
    power: s.power,
    halfW: (t) => (s.W / 2) * (1 + s.bulge * 0.3 * Math.sin(Math.PI * t)) - s.endR * (1 - round(t)),
    halfD: (t) => s.slit + (s.D / 2 - s.slit) * round(t) * (1 + s.bulge * Math.sin(Math.PI * t * 0.8)),
    ripple: (t, th) => 0.07 * Math.sin(th * 6 + t * 5) * Math.sin(Math.PI * t) + 0.08 * smooth(t, 0.8, 1) * Math.sin(th * 17),
  };
}

/** Mosquetão em "D" no plano XY, com a haste reta em x = 0 e o corpo para a esquerda. */
function carabinerGeometry() {
  const outline: [number, number][] = [
    [0, -2.6],
    [-0.2, -3.0],
    [-1.2, -3.1],
    [-2.1, -2.4],
    [-2.3, 0.4],
    [-1.9, 2.4],
    [-1.0, 3.0],
    [-0.2, 2.8],
    [0, 2.2],
    [0.05, 0],
  ];
  return ringGeometry(
    outline.map(([x, y]) => vec(x, y, 0)),
    0.26,
    10,
  );
}

function ZipPouch({ spec, art, label, kind }: ModelProps & { kind: PouchKind }) {
  const s = pouchShape(kind, spec);
  const { W, H, D, power, topStart, slit, endR, fillet, bulge } = s;
  const y0 = fillet + H * 0.1;
  // A estampa sobe pela curva do topo até perto do puxador (medida em arco, então não estica).
  const reach = kind === "clip" ? 0.7 : kind === "pencil" ? 0.6 : 0.5;
  const y1 = Math.max(y0 + 1, fillet + (topStart + (1 - topStart) * reach) * (H - fillet));
  const pw = W * (kind === "pencil" ? 0.84 : 0.8);
  const leather = kind === "clip";
  const profile = useMemo(() => pouchProfile({ W, H, D, power, topStart, slit, endR, fillet, bulge }), [W, H, D, power, topStart, slit, endR, fillet, bulge]);
  const ph = useMemo(() => centerArc(profile, y0, y1), [profile, y0, y1]);
  const printArt = useApparelArt(art);
  const texture = useArtTexture(pw / ph, "front", printArt, label);
  const backArt = useMemo(() => backArtOf(art), [art]);
  const grain = useGrain(leather ? "leather" : "weave", leather ? 2 : 0.4);

  const parts = useMemo(() => {
    const p = profile;
    const body = bodyGeometry(p, 64);
    const print = printGeometry(p, pw, y0, y1);
    const topW = p.halfW(1);
    const L = Math.max(2, topW * 2 - 0.3);
    const tapeW = slit * 2 + (kind === "pencil" ? 1.3 : 1.6);
    const tape = plateGeometry(L + 0.6, tapeW, 0.14, 0.3).rotateX(-Math.PI / 2);
    const pitch = kind === "necessaire" ? 0.34 : 0.28;
    const count = Math.max(2, Math.floor((L - 0.4) / pitch));
    const teethDepth = kind === "necessaire" ? 0.46 : 0.38;
    const teeth = boxesGeometry(
      Array.from({ length: count }, (_, i) => ({
        c: [-(L - 0.4) / 2 + ((i + 0.5) * (L - 0.4)) / count, H + 0.15, (i % 2 ? 1 : -1) * 0.09] as [number, number, number],
        s: [pitch * 0.62, 0.16, teethDepth] as [number, number, number],
      })),
    );
    const tapeStitch = stitchGeometry(
      [1, -1].map((sz) => ({
        points: [vec(-L / 2, H + 0.09, sz * (tapeW / 2 - 0.22)), vec(L / 2, H + 0.09, sz * (tapeW / 2 - 0.22))],
        closed: false,
      })),
      0.26,
      0.16,
      0.03,
    );
    // Cursor e puxador: o puxador deita sobre a curva da frente.
    const sliderX = L * 0.26;
    const slider = plateGeometry(1.6, 1.15, 0.42, 0.4).rotateX(-Math.PI / 2);
    const tabLen = kind === "necessaire" ? 2.6 : kind === "pencil" ? 2.2 : 1.8;
    const tab = plateGeometry(0.8, tabLen, 0.14, 0.38, { w: 0.34, h: tabLen * 0.28, y: -tabLen * 0.22 }).translate(0, -tabLen / 2, 0);
    const hinge = vec(sliderX, H + 0.38, 0.55);
    const rest = along(frontFrame(p, sliderX, H - tabLen * 0.8), 0.28);
    const dir = rest.sub(hinge).normalize();
    const tabQuat = new THREE.Quaternion().setFromUnitVectors(DOWN, dir);
    const endTab = plateGeometry(1.5, tapeW, 0.28, 0.2).rotateX(-Math.PI / 2);

    const geos: THREE.BufferGeometry[] = [body, print, tape, teeth, tapeStitch, slider, tab, endTab];
    // Vivo nas costuras laterais e no fundo (necessaire); o estojo é mais simples.
    const piping: THREE.BufferGeometry[] = [];
    if (kind !== "pencil") {
      piping.push(ringGeometry(loopPoints(p, 0, 160, 0.04), 0.2), ...[0, Math.PI].map((th) => pipeGeometry(seamPoints(p, th, 0.04, 0, 0.97), 0.2)));
    }
    geos.push(...piping);

    // Alça de couro com mosquetão na ponta esquerda.
    let clip: { tab: THREE.BufferGeometry; ring: THREE.BufferGeometry; position: THREE.Vector3 } | null = null;
    if (kind === "clip") {
      const yA = H * 0.62;
      const xe = p.halfW(tAtY(p, yA));
      const bend = -xe - 2.6;
      // A alça dobra em "U" em volta da haste do mosquetão, com folga para o arame (r 0,26) passar
      // por dentro sem atravessar o couro.
      const loop = [
        vec(-xe + 0.8, yA, 0.2),
        vec(-xe - 0.5, yA, 0.32),
        vec(-xe - 1.5, yA, 0.5),
        vec(-xe - 2.1, yA, 0.56),
        vec(bend + 0.12, yA, 0.36),
        vec(bend, yA, 0),
        vec(bend + 0.12, yA, -0.36),
        vec(-xe - 2.1, yA, -0.56),
        vec(-xe - 1.5, yA, -0.5),
        vec(-xe - 0.5, yA, -0.32),
        vec(-xe + 0.8, yA, -0.2),
      ];
      const loopTab = strapGeometry(loop, { width: 1.1, thick: 0.12, widthAxis: AXIS_Y, samples: 80 });
      const ring = carabinerGeometry();
      // Haste reta (x = 0 local) no meio do "U"; o giro de 0,1 rad no render a desloca ~0,16 cm na altura da alça.
      clip = { tab: loopTab.geometry, ring, position: vec(bend + 0.52, yA - 1.6, 0) };
      geos.push(loopTab.geometry, ring);
    }
    return { body, print, tape, teeth, tapeStitch, slider, sliderX, tab, hinge, tabQuat, endTab, L, piping, clip, all: geos };
  }, [profile, kind, H, slit, pw, y0, y1]);
  useGeometriesCleanup(parts.all);

  const fabric = clothColor(spec.baseColor);
  const trim = trimColor(spec);
  const metal = metalColor(spec.metal);
  const scale = TARGET / (W + (kind === "clip" ? 5 : 0));

  return (
    <group rotation-y={0.3}>
      <group scale={scale}>
        <mesh geometry={parts.body}>{leather ? <Leather color={fabric} map={grain} /> : <Cloth color={fabric} map={grain} />}</mesh>
        <mesh geometry={parts.print}>
          <Ink map={texture} roughness={leather ? 0.42 : 0.86} sheen={leather ? 0 : 0.5} clearcoat={leather ? 0.25 : 0} />
        </mesh>
        {backArt && (
          <BackPrint profile={profile} pw={pw} y0={y0} y1={y1} aspect={pw / ph} art={backArt} label={label} look={{ roughness: leather ? 0.42 : 0.86, sheen: leather ? 0 : 0.5, clearcoat: leather ? 0.25 : 0 }} />
        )}
        {parts.piping.map((g, i) => (
          <mesh key={i} geometry={g}>
            {leather ? <Leather color={shade(fabric, 0.92)} /> : <Cloth color={trim} sheen={0.5} roughness={0.8} />}
          </mesh>
        ))}
        <mesh geometry={parts.tape} position-y={H + 0.02}>
          <Cloth color={trim} sheen={0.4} roughness={0.85} />
        </mesh>
        <mesh geometry={parts.teeth}>{kind === "pencil" ? <meshStandardMaterial color={shade(trim, 0.85)} roughness={0.4} /> : <Metal color={metal} />}</mesh>
        <mesh geometry={parts.tapeStitch}>
          <Thread color={threadColor(trim)} />
        </mesh>
        {[-1, 1].map((sx) => (
          <mesh key={sx} geometry={parts.endTab} position={[sx * (parts.L / 2 + 0.45), H - 0.12, 0]} rotation-z={-sx * 0.45}>
            {leather ? <Leather color={shade(fabric, 0.92)} /> : <Cloth color={trim} sheen={0.4} roughness={0.85} />}
          </mesh>
        ))}
        <mesh geometry={parts.slider} position={[parts.sliderX, H + 0.36, 0]}>
          <Metal color={metal} />
        </mesh>
        <mesh geometry={parts.tab} position={parts.hinge} quaternion={parts.tabQuat}>
          <Metal color={metal} />
        </mesh>
        {parts.clip && (
          <>
            <mesh geometry={parts.clip.tab}>
              <Leather color={shade(fabric, 0.9)} />
            </mesh>
            <mesh geometry={parts.clip.ring} position={parts.clip.position} rotation-z={0.1}>
              <Metal color={metal} />
            </mesh>
          </>
        )}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- modelo

/**
 * Bolsas e sacolas. O corpo de tecido é uma superfície paramétrica em centímetros (superelipse por
 * altura, fole, filete no fundo, rugas) com a arte numa malha que copia a frente por comprimento de
 * arco. Padrão: tote/ecobag com fole e alças de fita pespontadas. Variantes: praia (trapézio largo,
 * ilhoses e corda trançada), corda (sacola de papel couchê com fole vincado e cordão), presente
 * (saquinho franzido com cordão e laço), lixeira de carro (pendurada nas hastes de um encosto de
 * cabeça por fita e fivela), necessaire/estojo (zíper com dentes, cursor e puxador; mosquetão no
 * courino quando spec.carabiner).
 */
export function BagModel({ spec, art, label, showDims }: ModelProps) {
  const variant = spec.variant;
  const props = { spec, art, label, showDims };
  if (variant === "rope") return <PaperGiftBag {...props} />;
  // Produtos novos (sacks.tsx): sacola plástica de alça vazada ou fita e saco de papel kraft.
  if (variant === "plastic") return <PlasticBag {...props} />;
  if (variant === "kraft-sack") return <KraftSack {...props} />;
  if (variant === "gift") return <GiftPouch {...props} />;
  if (variant === "car-trash") return <CarTrashBag {...props} />;
  if (variant === "pencil-case") return <ZipPouch {...props} kind="pencil" />;
  if (variant === "necessaire" || spec.pouch) return <ZipPouch {...props} kind={spec.carabiner ? "clip" : "necessaire"} />;
  return <ToteBag {...props} beach={variant === "beach"} />;
}
