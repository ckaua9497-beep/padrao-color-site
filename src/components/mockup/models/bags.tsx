"use client";

// Bolsas com volume: mochila, sacola mochila, cooler/lancheira e bolsa esportiva.

import { useMemo } from "react";
import { Decal } from "@react-three/drei";
import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import { artAspect } from "@/lib/mockup-kinds";
import { closedTube, useApparelArt, useGeometriesCleanup } from "./fabric";
import { inflatedSurface, shapePolygon } from "./inflate";
import { backArtOf, bandGeometry, makeShape, useArtTexture, useBackTexture, type ModelProps } from "./shared";
import { lathe, radiusOnProfile, smoothProfile, type Pt } from "./vessel";

/*
 * Tudo é modelado em centímetros dentro de um grupo com escala UNIT, em proporção real.
 * O corpo das bolsas é uma caixa subdividida com cantos arredondados e faces estufadas (softBody);
 * zíper, debrum, costuras e alças são geometrias varridas sobre caminhos calculados na própria
 * superfície deformada. A arte entra por Decal no painel frontal, ou por UV na sacola mochila
 * (sublimada de ponta a ponta) e nas faixas da bolsa cilindro e do cooler redondo.
 */
const UNIT = 2.5 / 45;

const vec = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const smooth = THREE.MathUtils.smoothstep;

// ---------------------------------------------------------------------------- cores e materiais

function shade(color: string, k: number) {
  return new THREE.Color(color).multiplyScalar(k).getStyle();
}

function isDark(color: string) {
  const c = new THREE.Color(color);
  return c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722 < 0.06;
}

/** Alças, zíper e debrum: a cor de destaque ou um preto técnico que contrasta com o corpo. */
function trimOf(spec: MockupSpec) {
  if (spec.accentColor) return spec.accentColor;
  return isDark(spec.baseColor) ? "#3c3d42" : "#1e1f23";
}

function safeAspect(spec: MockupSpec) {
  const a = artAspect(spec);
  return Number.isFinite(a) && a > 0 ? clamp(a, 0.2, 5) : 1;
}

/** Maior retângulo com a proporção da arte que cabe em maxW × maxH. */
function fitContain(aspect: number, maxW: number, maxH: number): [number, number] {
  const w = Math.min(maxW, maxH * aspect);
  return [w, w / aspect];
}

function Cloth({ color, attach, sheen = 0.8, roughness = 0.9 }: { color: string; attach?: string; sheen?: number; roughness?: number }) {
  return <meshPhysicalMaterial attach={attach} color={color} roughness={roughness} sheen={sheen} sheenRoughness={0.72} sheenColor="#ffffff" />;
}

function Metal() {
  return <meshStandardMaterial color="#c4c7cd" metalness={1} roughness={0.27} />;
}

function Plastic({ color = "#151518" }: { color?: string }) {
  return <meshStandardMaterial color={color} roughness={0.42} />;
}

/**
 * Estampa sublimada/DTF projetada no painel (Decal com profundidade própria, em centímetros). No verso, `rotation`
 * [0, π, 0] projeta de trás para a frente: a arte lê da esquerda para a direita para quem olha as costas.
 */
function PanelPrint({ map, position, size, depth, rotation = [0, 0, 0] }: { map: THREE.Texture; position: [number, number, number]; size: [number, number]; depth: number; rotation?: [number, number, number] }) {
  return (
    <Decal position={position} rotation={rotation} scale={[size[0], size[1], depth]} depthTest>
      <meshPhysicalMaterial map={map} transparent alphaTest={0.02} roughness={0.78} sheen={0.35} sheenRoughness={0.7} sheenColor="#ffffff" polygonOffset polygonOffsetFactor={-10} depthTest />
    </Decal>
  );
}

function PrintedSurface({ map }: { map: THREE.Texture }) {
  return <meshPhysicalMaterial map={map} roughness={0.8} sheen={0.4} sheenRoughness={0.7} sheenColor="#ffffff" polygonOffset polygonOffsetFactor={-2} />;
}

// ---------------------------------------------------------------------------- geometria utilitária

type Frame = { p: THREE.Vector3; t: THREE.Vector3; n: THREE.Vector3; b: THREE.Vector3 };
type SurfacePath = { points: THREE.Vector3[]; normals: THREE.Vector3[] };

function frameMatrix(f: Frame, scale: THREE.Vector3, position: THREE.Vector3) {
  return new THREE.Matrix4().makeBasis(f.b, f.t, f.n).scale(scale).setPosition(position);
}

function frameQuaternion(f: Frame) {
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.b, f.t, f.n));
}

/** Copia uma geometria-modelo em várias posições numa só malha (dentes de zíper, pontos de costura). */
function repeatGeometry(template: THREE.BufferGeometry, matrices: THREE.Matrix4[]) {
  const pos = template.getAttribute("position");
  const nor = template.getAttribute("normal");
  const index = template.getIndex();
  const count = pos.count;
  const positions = new Float32Array(count * 3 * matrices.length);
  const normals = new Float32Array(count * 3 * matrices.length);
  const indices: number[] = [];
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  matrices.forEach((m, k) => {
    normalMatrix.getNormalMatrix(m);
    for (let i = 0; i < count; i += 1) {
      const o = (k * count + i) * 3;
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      n.fromBufferAttribute(nor, i).applyNormalMatrix(normalMatrix);
      positions[o] = v.x;
      positions[o + 1] = v.y;
      positions[o + 2] = v.z;
      normals[o] = n.x;
      normals[o + 1] = n.y;
      normals[o + 2] = n.z;
    }
    if (index) for (let i = 0; i < index.count; i += 1) indices.push(index.getX(i) + k * count);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  if (indices.length) geometry.setIndex(indices);
  return geometry;
}

function repeatBox(matrices: THREE.Matrix4[]) {
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const geometry = repeatGeometry(unit, matrices);
  unit.dispose();
  return geometry;
}

/** Retângulo arredondado desenhado num Path/Shape (furos de fivela e puxador). */
function rrect<T extends THREE.Path>(path: T, cx: number, cy: number, w: number, h: number, r: number): T {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const rr = Math.min(r, w / 2, h / 2);
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

/** Contorno de retângulo arredondado amostrado a cada `step`, começando no meio da borda de baixo (sentido anti-horário). */
function roundedRectLoop(hx: number, hy: number, rad: number, step: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const ex = Math.max(0, hx - rad);
  const ey = Math.max(0, hy - rad);
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1e-6) return;
    const n = Math.max(1, Math.ceil(len / step));
    for (let i = 0; i < n; i += 1) pts.push(new THREE.Vector2(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n));
  };
  const arc = (cx: number, cy: number, a0: number) => {
    if (rad < 1e-6) return;
    const n = Math.max(2, Math.ceil((rad * Math.PI) / 2 / step));
    for (let i = 0; i < n; i += 1) {
      const a = a0 + (Math.PI / 2) * (i / n);
      pts.push(new THREE.Vector2(cx + rad * Math.cos(a), cy + rad * Math.sin(a)));
    }
  };
  line(0, -hy, ex, -hy);
  arc(ex, -ey, -Math.PI / 2);
  line(hx, -ey, hx, ey);
  arc(ex, ey, 0);
  line(ex, hy, -ex, hy);
  arc(-ex, ey, Math.PI / 2);
  line(-hx, ey, -hx, -ey);
  arc(-ex, -ey, Math.PI);
  line(-ex, -hy, 0, -hy);
  return pts;
}

function linePoints(a: THREE.Vector3, b: THREE.Vector3, step: number) {
  const n = Math.max(2, Math.ceil(a.distanceTo(b) / step));
  return Array.from({ length: n + 1 }, (_, i) => a.clone().lerp(b, i / n));
}

/** Tangente, normal e lateral em cada ponto de um caminho sobre a superfície. */
function pathFrames(path: SurfacePath): Frame[] {
  const { points, normals } = path;
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)];
    const c = points[Math.min(points.length - 1, i + 1)];
    const t = c.clone().sub(a);
    if (t.lengthSq() < 1e-12) t.set(1, 0, 0);
    t.normalize();
    const n = normals[i].clone().addScaledVector(t, -normals[i].dot(t));
    if (n.lengthSq() < 1e-12) n.set(0, 0, 1);
    n.normalize();
    return { p, t, n, b: new THREE.Vector3().crossVectors(t, n) };
  });
}

function pipingGeometry(points: THREE.Vector3[], radius: number) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true), Math.min(480, Math.max(64, points.length)), radius, 8, true);
}

// ---------------------------------------------------------------------------- corpo macio

type SoftBody = {
  w: number;
  h: number;
  d: number;
  /** Raio das arestas. */
  r: number;
  /** Quanto cada face estufa no centro (cm). */
  front?: number;
  back?: number;
  side?: number;
  top?: number;
  bottom?: number;
  /** Fração que a largura (x) e a espessura (z) perdem até o topo. */
  taperX?: number;
  taperZ?: number;
  /** A partir desta altura o contorno frontal fecha em arco (topo de mochila). */
  archFrom?: number;
  arch?: number;
};

function radiusOf(o: SoftBody) {
  return Math.max(0.05, Math.min(o.r, o.w * 0.49, o.h * 0.49, o.d * 0.49));
}

function innerOf(o: SoftBody) {
  const r = radiusOf(o);
  return vec(o.w / 2 - r, o.h / 2 - r, o.d / 2 - r);
}

/** Leva um ponto da caixa (ou já da caixa arredondada) para a superfície final, estufada e afunilada. */
function deformer(o: SoftBody) {
  const r = radiusOf(o);
  const hw = o.w / 2;
  const hh = o.h / 2;
  const hd = o.d / 2;
  const inner = innerOf(o);
  const arch = o.arch ?? 0;
  const archFrom = o.archFrom ?? hh;
  const topY = hh + (o.top ?? 0);
  return (p: THREE.Vector3) => {
    const cx = clamp(p.x, -inner.x, inner.x);
    const cy = clamp(p.y, -inner.y, inner.y);
    const cz = clamp(p.z, -inner.z, inner.z);
    const nx = p.x - cx;
    const ny = p.y - cy;
    const nz = p.z - cz;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-9) p.set(cx + (nx / len) * r, cy + (ny / len) * r, cz + (nz / len) * r);
    const ux = p.x / hw;
    const uy = p.y / hh;
    const uz = p.z / hd;
    const fx = Math.max(0, 1 - ux * ux);
    const fy = Math.max(0, 1 - uy * uy);
    const fz = Math.max(0, 1 - uz * uz);
    p.x += (o.side ?? 0) * fy * fz * ux;
    p.y += (uy > 0 ? (o.top ?? 0) : (o.bottom ?? 0)) * fx * fz * uy;
    p.z += (uz > 0 ? (o.front ?? 0) : (o.back ?? 0)) * fx * fy * uz;
    const t = (uy + 1) / 2;
    p.x *= 1 - (o.taperX ?? 0) * t;
    p.z *= 1 - (o.taperZ ?? 0) * t;
    if (arch > 0 && p.y > archFrom) {
      const k = Math.min(1, (p.y - archFrom) / Math.max(1e-6, topY - archFrom));
      p.x *= Math.sqrt(Math.max(0.05, 1 - arch * k * k));
      p.z *= Math.sqrt(Math.max(0.05, 1 - arch * 0.22 * k * k));
    }
    return p;
  };
}

/** Normal da superfície deformada, a partir de dois passos tangentes na caixa arredondada. */
function surfaceNormal(deform: (p: THREE.Vector3) => THREE.Vector3, p: THREE.Vector3, inner: THREE.Vector3) {
  const n = p.clone().sub(p.clone().clamp(inner.clone().negate(), inner));
  if (n.lengthSq() < 1e-12) n.set(0, 1, 0);
  n.normalize();
  const t1 = new THREE.Vector3().crossVectors(Math.abs(n.x) < 0.9 ? vec(1, 0, 0) : vec(0, 1, 0), n).normalize();
  const t2 = new THREE.Vector3().crossVectors(n, t1);
  const p0 = deform(p.clone());
  const a = deform(p.clone().addScaledVector(t1, 0.05)).sub(p0);
  const b = deform(p.clone().addScaledVector(t2, 0.05)).sub(p0);
  const out = new THREE.Vector3().crossVectors(a, b);
  if (out.lengthSq() < 1e-14) return n;
  out.normalize();
  return out.dot(n) < 0 ? out.negate() : out;
}

function onSurface(o: SoftBody, pre: THREE.Vector3[], keep?: (p: THREE.Vector3) => boolean): SurfacePath {
  const deform = deformer(o);
  const inner = innerOf(o);
  const points: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];
  for (const p of pre) {
    if (keep && !keep(p)) continue;
    points.push(deform(p.clone()));
    normals.push(surfaceNormal(deform, p, inner));
  }
  return { points, normals };
}

/**
 * Laço sobre a caixa arredondada, em volta do eixo y ou z. `angle` mede a partir da face
 * perpendicular ao eixo (0 = sobre a face, π/4 = na quina, π/2 = na lateral); `coord` fixa a
 * altura/profundidade do laço (corte transversal).
 */
function surfaceLoop(o: SoftBody, axis: "y" | "z", sign: 1 | -1, angle: number, coord?: number, step = 0.36) {
  const r = radiusOf(o);
  const inner = innerOf(o);
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  if (axis === "z") {
    const z = coord ?? sign * (inner.z + r * c);
    return roundedRectLoop(inner.x + r * s, inner.y + r * s, r * s, step).map((p) => vec(p.x, p.y, z));
  }
  const y = coord ?? sign * (inner.y + r * c);
  return roundedRectLoop(inner.x + r * s, inner.z + r * s, r * s, step).map((p) => vec(p.x, y, p.y));
}

/** Normais suaves nas emendas da caixa (as faces do BoxGeometry não compartilham vértices). */
function smoothSeams(geometry: THREE.BufferGeometry) {
  const pos = geometry.getAttribute("position");
  const nor = geometry.getAttribute("normal");
  const key = (i: number) => `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
  const sums = new Map<string, THREE.Vector3>();
  for (let i = 0; i < pos.count; i += 1) {
    const k = key(i);
    const acc = sums.get(k) ?? new THREE.Vector3();
    acc.x += nor.getX(i);
    acc.y += nor.getY(i);
    acc.z += nor.getZ(i);
    sums.set(k, acc);
  }
  sums.forEach((n) => n.normalize());
  for (let i = 0; i < pos.count; i += 1) {
    const n = sums.get(key(i));
    if (n) nor.setXYZ(i, n.x, n.y, n.z);
  }
  nor.needsUpdate = true;
}

/**
 * Corpo estofado. Com `splitBelow`, os triângulos abaixo dessa altura (pré-deformação, alinhada a
 * uma fileira da grade) vão para o grupo 1: fundo em outra cor, com emenda reta.
 */
function softBodyGeometry(o: SoftBody, splitBelow?: number) {
  const r = radiusOf(o);
  const step = Math.min(Math.max(o.w, o.h, o.d) / 46, r / 3.2);
  const seg = (len: number) => clamp(Math.ceil(len / step), 4, 80);
  const sy = seg(o.h);
  const geometry = new THREE.BoxGeometry(o.w, o.h, o.d, seg(o.w), sy, seg(o.d));
  const pos = geometry.getAttribute("position");
  const preY = Float32Array.from({ length: pos.count }, (_, i) => pos.getY(i));
  const deform = deformer(o);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    deform(v.fromBufferAttribute(pos, i));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  smoothSeams(geometry);
  geometry.clearGroups();
  let seamY: number | null = null;
  const index = geometry.getIndex();
  if (splitBelow !== undefined && index) {
    const cell = o.h / sy;
    // Arredonda para cima: a emenda nunca cai na curva da aresta de baixo.
    const seam = -o.h / 2 + Math.ceil((splitBelow + o.h / 2) / cell - 1e-6) * cell;
    const upper: number[] = [];
    const lower: number[] = [];
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      ((preY[a] + preY[b] + preY[c]) / 3 < seam ? lower : upper).push(a, b, c);
    }
    geometry.setIndex([...upper, ...lower]);
    geometry.addGroup(0, upper.length, 0);
    geometry.addGroup(upper.length, lower.length, 1);
    seamY = seam;
  }
  return { geometry, seamY };
}

// ---------------------------------------------------------------------------- zíper, alças e ferragens

/** Fita e dentes do zíper ao longo de um caminho na superfície. */
function zipperGeometries(path: SurfacePath, tapeWidth = 1.5, tooth = 0.36) {
  const frames = pathFrames(path);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  frames.forEach(({ p, n, b }, i) => {
    for (const s of [-1, 1]) {
      const v = p.clone().addScaledVector(b, (s * tapeWidth) / 2).addScaledVector(n, 0.06);
      positions.push(v.x, v.y, v.z);
      normals.push(n.x, n.y, n.z);
    }
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const tape = new THREE.BufferGeometry();
  tape.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  tape.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  tape.setIndex(indices);
  const size = vec(tapeWidth * 0.36, tooth * 0.62, 0.22);
  const teeth = repeatBox(frames.map((f, i) => frameMatrix(f, size, f.p.clone().addScaledVector(f.n, 0.17).addScaledVector(f.b, i % 2 ? 0.07 : -0.07))));
  return { tape, teeth };
}

type PullerPose = { position: THREE.Vector3; quaternion: THREE.Quaternion; hang: number };

/** Cursor do zíper numa fração do caminho; o puxador pende para baixo sobre a superfície. */
function pullerAt(path: SurfacePath, frac: number): PullerPose | null {
  const frames = pathFrames(path);
  if (!frames.length) return null;
  const f = frames[clamp(Math.round(frac * (frames.length - 1)), 0, frames.length - 1)];
  const gx = -f.b.y;
  const gy = -f.t.y;
  const hang = Math.hypot(gx, gy) < 0.25 ? 0 : Math.atan2(gx, -gy);
  return { position: f.p.clone().addScaledVector(f.n, 0.1), quaternion: frameQuaternion(f), hang };
}

type StrapOptions = { width: number; thick: number; roundness?: number; stitch?: number };
type Strap = { body: THREE.BufferGeometry; stitches: THREE.BufferGeometry | null; frameAt: (u: number) => Frame; curve: THREE.CatmullRomCurve3 };

/**
 * Alça varrida: perfil de superelipse (fita plana ou alça acolchoada) ao longo de uma curva, com a
 * largura orientada por `widthDir`, pontas fechadas e costura tracejada perto das bordas.
 */
function strap(points: THREE.Vector3[], widthDir: THREE.Vector3, o: StrapOptions): Strap {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const length = Math.max(0.1, curve.getLength());
  const segments = clamp(Math.ceil(length / 0.6), 16, 160);
  const e = o.roundness ?? 4;
  const M = 16;
  const profile = Array.from({ length: M }, (_, k) => {
    const a = (k / M) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [Math.sign(c) * Math.abs(c) ** (2 / e) * (o.width / 2), Math.sign(s) * Math.abs(s) ** (2 / e) * (o.thick / 2)];
  });
  const frameAt = (u: number): Frame => {
    const p = curve.getPointAt(clamp(u, 0, 1));
    const t = curve.getTangentAt(clamp(u, 0, 1)).normalize();
    const b = widthDir.clone().addScaledVector(t, -widthDir.dot(t));
    if (b.lengthSq() < 1e-8) b.crossVectors(t, Math.abs(t.y) < 0.9 ? vec(0, 1, 0) : vec(1, 0, 0));
    b.normalize();
    return { p, t, b, n: new THREE.Vector3().crossVectors(b, t) };
  };
  const positions: number[] = [];
  const indices: number[] = [];
  const ring = (f: Frame) => {
    for (const [x, y] of profile) {
      positions.push(f.p.x + f.b.x * x + f.n.x * y, f.p.y + f.b.y * x + f.n.y * y, f.p.z + f.b.z * x + f.n.z * y);
    }
  };
  for (let i = 0; i <= segments; i += 1) ring(frameAt(i / segments));
  for (let i = 0; i < segments; i += 1) {
    for (let k = 0; k < M; k += 1) {
      const a = i * M + k;
      const b = i * M + ((k + 1) % M);
      indices.push(a, a + M, b, b, a + M, b + M);
    }
  }
  // Tampas nas pontas (anel duplicado para a normal não vazar para a lateral).
  for (const end of [0, 1]) {
    const f = frameAt(end);
    const start = positions.length / 3;
    ring(f);
    positions.push(f.p.x, f.p.y, f.p.z);
    const center = start + M;
    for (let k = 0; k < M; k += 1) {
      const a = start + k;
      const b = start + ((k + 1) % M);
      if (end === 0) indices.push(center, a, b);
      else indices.push(center, b, a);
    }
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  body.setIndex(indices);
  body.computeVertexNormals();

  let stitches: THREE.BufferGeometry | null = null;
  if (o.stitch && o.width > o.stitch * 2 + 0.4) {
    const xo = o.width / 2 - o.stitch;
    const yo = (o.thick / 2) * (1 - Math.abs(xo / (o.width / 2)) ** e) ** (1 / e) + 0.012;
    const pitch = 0.55;
    const count = Math.max(0, Math.floor((length - 2) / pitch));
    const matrices: THREE.Matrix4[] = [];
    const size = vec(0.08, 0.32, 0.08);
    for (let k = 0; k < count; k += 1) {
      const f = frameAt((1 + (k + 0.5) * pitch) / length);
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) matrices.push(frameMatrix(f, size, f.p.clone().addScaledVector(f.b, sx * xo).addScaledVector(f.n, sy * yo)));
      }
    }
    if (matrices.length) stitches = repeatBox(matrices);
  }
  return { body, stitches, frameAt, curve };
}

function curveSlice(curve: THREE.Curve<THREE.Vector3>, u0: number, u1: number, n = 12) {
  return Array.from({ length: n + 1 }, (_, i) => curve.getPointAt(u0 + ((u1 - u0) * i) / n));
}

/** Pespontos em retângulo com X (reforço de alça), no plano local de uma etiqueta. */
function boxStitch(matrix: THREE.Matrix4, w: number, h: number, lift: number): THREE.Matrix4[] {
  const out: THREE.Matrix4[] = [];
  const x = w / 2 - 0.35;
  const y = h / 2 - 0.35;
  const segs: [number, number, number, number][] = [
    [-x, -y, x, -y],
    [x, -y, x, y],
    [x, y, -x, y],
    [-x, y, -x, -y],
    [-x, -y, x, y],
    [x, -y, -x, y],
  ];
  for (const [x0, y0, x1, y1] of segs) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.floor(len / 0.5));
    const angle = Math.atan2(y1 - y0, x1 - x0);
    for (let i = 0; i < n; i += 1) {
      const t = (i + 0.5) / n;
      const local = new THREE.Matrix4().compose(
        vec(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, lift),
        new THREE.Quaternion().setFromAxisAngle(vec(0, 0, 1), angle),
        vec(0.3, 0.07, 0.07),
      );
      out.push(matrix.clone().multiply(local));
    }
  }
  return out;
}

/** Arco de alça de ombro: sai das argolas laterais, sobe e passa por cima (um pouco para trás). */
function shoulderArc(xEnd: number, yStart: number, apexY: number, zApex: number) {
  const left = [vec(-xEnd, yStart, 0), vec(-(xEnd + 1.3), yStart + 4.5, zApex * 0.12), vec(-xEnd * 0.66, apexY - 3.2, zApex * 0.72), vec(0, apexY, zApex)];
  const right = left
    .slice(0, 3)
    .reverse()
    .map((p) => vec(-p.x, p.y, p.z));
  return [...left, ...right];
}

function dRingPolygon(w = 3.6, h = 2.5) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 4; i += 1) pts.push(new THREE.Vector2(-w / 2 + (w * i) / 4, 0));
  for (let i = 1; i < 12; i += 1) {
    const a = (Math.PI * i) / 12;
    pts.push(new THREE.Vector2((w / 2) * Math.cos(a), h * Math.sin(a)));
  }
  return pts;
}

/** Ferragens pequenas compartilhadas pelo modelo: cursor, puxador, regulador, argola D e etiqueta. */
function useHardware() {
  const parts = useMemo(() => {
    const slider = new THREE.ExtrudeGeometry(rrect(new THREE.Shape(), 0, 0, 1.0, 1.8, 0.32), {
      depth: 0.3,
      bevelEnabled: true,
      bevelThickness: 0.1,
      bevelSize: 0.1,
      bevelSegments: 2,
      curveSegments: 6,
    });
    slider.translate(0, 0, 0.1);
    const tabShape = rrect(new THREE.Shape(), 0, -1.5, 1.0, 3.0, 0.45);
    tabShape.holes.push(rrect(new THREE.Path(), 0, -0.8, 0.42, 0.9, 0.2));
    const pullTab = new THREE.ExtrudeGeometry(tabShape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 8 });
    const buckleShape = rrect(new THREE.Shape(), 0, 0, 4.8, 3.0, 0.6);
    buckleShape.holes.push(rrect(new THREE.Path(), 0, 0.62, 4.1, 0.72, 0.3), rrect(new THREE.Path(), 0, -0.62, 4.1, 0.72, 0.3));
    const buckle = new THREE.ExtrudeGeometry(buckleShape, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2, curveSegments: 6 });
    buckle.translate(0, 0, -0.15);
    const dRing = closedTube(dRingPolygon(), 0.2);
    const patch = new THREE.BoxGeometry(1, 1, 1);
    return { slider, pullTab, buckle, dRing, patch, all: [slider, pullTab, buckle, dRing, patch] };
  }, []);
  useGeometriesCleanup(parts.all);
  return parts;
}

type Hardware = ReturnType<typeof useHardware>;

function Puller({ pose, hw, color }: { pose: PullerPose; hw: Hardware; color: string }) {
  return (
    <group position={pose.position} quaternion={pose.quaternion}>
      <mesh geometry={hw.slider}>
        <Metal />
      </mesh>
      <group position={[0, 0.55, 0.5]} rotation-z={pose.hang}>
        <mesh geometry={hw.pullTab} rotation-x={-0.2}>
          <meshStandardMaterial color={color} metalness={0.6} roughness={0.35} />
        </mesh>
      </group>
    </group>
  );
}

type ZipperParts = { tape: THREE.BufferGeometry; teeth: THREE.BufferGeometry };

function Zipper({ parts, color }: { parts: ZipperParts; color: string }) {
  return (
    <>
      <mesh geometry={parts.tape}>
        <Cloth color={color} sheen={0.5} roughness={0.85} />
      </mesh>
      <mesh geometry={parts.teeth}>
        <meshStandardMaterial color={shade(color, 0.75)} roughness={0.32} />
      </mesh>
    </>
  );
}

function StrapMesh({ part, color, stitch, padded = false }: { part: Strap; color: string; stitch: string; padded?: boolean }) {
  return (
    <>
      <mesh geometry={part.body}>
        <Cloth color={color} sheen={padded ? 0.7 : 0.45} roughness={padded ? 0.88 : 0.72} />
      </mesh>
      {part.stitches && (
        <mesh geometry={part.stitches}>
          <meshStandardMaterial color={stitch} roughness={0.8} />
        </mesh>
      )}
    </>
  );
}

/** Regulador de fita posicionado num ponto da alça. */
function Buckle({ frame, hw }: { frame: Frame; hw: Hardware }) {
  return (
    <mesh geometry={hw.buckle} position={frame.p} quaternion={frameQuaternion(frame)}>
      <Plastic />
    </mesh>
  );
}

/** Argola D presa à lateral por uma tira de fita; `side` = ±1 (lado em x). */
function SideRing({ x, y, side, hw, color }: { x: number; y: number; side: number; hw: Hardware; color: string }) {
  return (
    <group position={[x, y, 0]}>
      <mesh geometry={hw.patch} position={[side * 0.12, -0.7, 0]} scale={[0.3, 2.6, 3.4]}>
        <Cloth color={color} sheen={0.4} roughness={0.75} />
      </mesh>
      <mesh geometry={hw.dRing} position={[side * 0.45, 0.4, 0]} rotation-y={Math.PI / 2}>
        <Metal />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------- mochila

function buildBackpack(pw: number, ph: number, small: boolean) {
  const r = small ? 2.2 : 3.4;
  const d = small ? 7.5 : clamp(pw * 0.45, 11, 17);
  const margin = small ? r + 0.5 : r + 0.7;
  const bottomPad = small ? r + 1.6 : r + 2.0;
  const topZone = small ? 4.5 : clamp(ph * 0.2, 5, 9);
  // Na mochila brinde a medida é a peça inteira (18 × 21 × 7,5); na personalizada é a área de impressão.
  const w = small ? pw : pw + margin * 2;
  const h = small ? ph : ph + bottomPad + topZone;
  const boxW = w - margin * 2;
  const boxH = h - bottomPad - topZone;
  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;
  const printCy = -hh + bottomPad + boxH / 2;
  const archFrom = printCy + boxH / 2 + 0.6;
  const o: SoftBody = { w, h, d, r, front: small ? 0.6 : 1.1, back: 0.5, side: small ? 0.35 : 0.6, top: 0.5, taperZ: 0.22, archFrom, arch: 0.6 };
  const deform = deformer(o);
  const inner = innerOf(o);

  const { geometry: body, seamY } = softBodyGeometry(o, -hh + r + 0.4);
  const frontZ = deform(vec(0, printCy, hd)).z;
  // A área impressa é o painel inteiro (retrato): a textura usa a proporção dele, sem distorcer.
  const artW = boxW;
  const artH = boxH;

  const frontPiping = pipingGeometry(onSurface(o, surfaceLoop(o, "z", 1, Math.PI / 4)).points, 0.32);
  const backPiping = pipingGeometry(onSurface(o, surfaceLoop(o, "z", -1, Math.PI / 4)).points, 0.32);
  const seamPiping = seamY === null ? null : pipingGeometry(onSurface(o, surfaceLoop(o, "y", -1, Math.PI / 2, seamY)).points, 0.28);

  // Zíper do compartimento principal: corre pela lateral, passa por cima e desce do outro lado.
  const zipPath = onSurface(o, surfaceLoop(o, "z", 1, Math.PI / 2, inner.z * 0.3), (p) => p.y > printCy - boxH * 0.12);
  const zipper = zipperGeometries(zipPath, small ? 1.2 : 1.5);
  const pullers = [pullerAt(zipPath, 0.57), pullerAt(zipPath, 0.63)].filter((p): p is PullerPose => p !== null);

  // Alças de ombro acolchoadas nas costas, terminando em fita com regulador.
  const backZ = deform(vec(0, 0, -hd)).z;
  const straps = [-1, 1].map((s) => {
    const top = deform(vec(s * 3.4, archFrom + topZone * 0.25, -hd));
    // Alça pré-curvada em S, afastada das costas só o bastante para a espessura do acolchoado.
    const lower = vec(s * hw * 0.74, -hh + bottomPad + 4, backZ - (small ? 1.6 : 2.4));
    const padded = strap(
      [top.clone().add(vec(0, -0.4, 1.0)), top.clone().add(vec(s * 1.0, 1.0, -2.2)), vec(s * hw * 0.56, printCy + boxH * 0.15, backZ - (small ? 2.6 : 4.0)), lower],
      vec(1, 0, 0),
      { width: small ? 3.8 : 6.4, thick: small ? 0.55 : 1.7, roundness: small ? 4 : 3, stitch: small ? 0.4 : 0.5 },
    );
    const anchor = deform(vec(s * inner.x, -inner.y, -hd));
    const webbing = strap([lower.clone().add(vec(0, 1.2, 0.3)), lower.clone().lerp(anchor, 0.5).add(vec(s * 0.6, 0, -1.2)), anchor.clone().add(vec(0, 0, 0.7))], vec(1, 0, 0), {
      width: small ? 2.0 : 2.6,
      thick: 0.22,
    });
    return { padded, webbing, buckle: webbing.frameAt(0.42) };
  });

  // Alça de mão no topo.
  const zTop = -Math.min(hd * 0.35, inner.z);
  const ha = deform(vec(-5.5, hh, zTop));
  const hb = deform(vec(5.5, hh, zTop));
  const handle = strap([ha.clone().add(vec(0, -0.6, 0)), ha.clone().add(vec(-0.3, 2.4, 0)), vec(0, Math.max(ha.y, hb.y) + 4.2, zTop * 0.8), hb.clone().add(vec(0.3, 2.4, 0)), hb.clone().add(vec(0, -0.6, 0))], vec(0, 0, 1), {
    width: small ? 2.0 : 2.6,
    thick: 0.6,
    stitch: 0.35,
  });

  // Bolso lateral de garrafa (lado -x, o que fica para a câmera).
  const pocket: SoftBody = { w: d * 0.72, h: small ? 7 : 13, d: small ? 1.6 : 2.4, r: 1.0, front: 0.5, side: 0.2 };
  const pocketY = -hh + bottomPad + pocket.h / 2 - 0.4;
  const sideX = deform(vec(-hw, pocketY, 0)).x;
  const pocketBody = softBodyGeometry(pocket).geometry;

  const geometries = [body, frontPiping, backPiping, zipper.tape, zipper.teeth, handle.body, pocketBody];
  if (seamPiping) geometries.push(seamPiping);
  if (handle.stitches) geometries.push(handle.stitches);
  straps.forEach(({ padded, webbing }) => {
    geometries.push(padded.body, webbing.body);
    if (padded.stitches) geometries.push(padded.stitches);
  });
  return {
    body,
    frontZ,
    printCy,
    artW,
    artH,
    decalDepth: d * 0.75,
    frontPiping,
    backPiping,
    seamPiping,
    zipper,
    pullers,
    straps,
    handle,
    pocket: { geometry: pocketBody, position: vec(sideX + pocket.d / 2 - 0.8, pocketY, -0.2), w: pocket.w, h: pocket.h, d: pocket.d },
    all: geometries,
  };
}

/**
 * Mochila estofada: corpo de caixa arredondada com frente estufada e topo em arco, painel frontal
 * sublimado (Decal na área de impressão da spec), debrum nas quinas, zíper com dois cursores
 * contornando o topo, alça de mão, alças de ombro acolchoadas com regulador e bolso lateral.
 * Na personalizada a medida é o painel impresso (retrato, maior lado na altura); a "Mochila Brinde"
 * (≤ 24 cm) usa a medida como a peça inteira, fica mais fina e tem alças de fita.
 */
export function BackpackModel({ spec, art, label }: ModelProps) {
  const pw = clamp(Math.min(spec.widthCm, spec.heightCm), 10, 60);
  const ph = clamp(Math.max(spec.widthCm, spec.heightCm), 12, 70);
  const small = ph <= 24;
  const hw = useHardware();
  const p = useMemo(() => buildBackpack(pw, ph, small), [pw, ph, small]);
  useGeometriesCleanup(p.all);
  const texture = useArtTexture(p.artW / p.artH, "front", art, label);
  const base = spec.baseColor;
  const trim = trimOf(spec);
  const stitch = isDark(trim) ? "#6b6c70" : shade(trim, 0.6);
  const sheen = small ? 0.35 : 0.8;
  return (
    <group rotation-y={0.5}>
      <group scale={UNIT}>
        <mesh geometry={p.body}>
          <Cloth attach="material-0" color={base} sheen={sheen} roughness={small ? 0.95 : 0.9} />
          <Cloth attach="material-1" color={trim} sheen={0.5} roughness={0.8} />
          <PanelPrint key={p.body.uuid} map={texture} position={[0, p.printCy, p.frontZ]} size={[p.artW, p.artH]} depth={p.decalDepth} />
        </mesh>
        {[p.frontPiping, p.backPiping, p.seamPiping].map((g, i) =>
          g ? (
            <mesh key={i} geometry={g}>
              <Cloth color={trim} sheen={0.5} roughness={0.7} />
            </mesh>
          ) : null,
        )}
        <Zipper parts={p.zipper} color={trim} />
        {p.pullers.map((pose, i) => (
          <Puller key={i} pose={pose} hw={hw} color={trim} />
        ))}
        {p.straps.map((s, i) => (
          <group key={i}>
            <StrapMesh part={s.padded} color={trim} stitch={stitch} padded={!small} />
            <StrapMesh part={s.webbing} color={trim} stitch={stitch} />
            <Buckle frame={s.buckle} hw={hw} />
          </group>
        ))}
        <StrapMesh part={p.handle} color={trim} stitch={stitch} />
        <group position={p.pocket.position} rotation-y={-Math.PI / 2}>
          <mesh geometry={p.pocket.geometry}>
            <Cloth color={shade(trim, 1.15)} sheen={0.3} roughness={0.95} />
          </mesh>
          <mesh geometry={hw.patch} position={[0, p.pocket.h / 2 - 0.7, p.pocket.d / 2 + 0.35]} scale={[p.pocket.w * 0.94, 1.3, 0.35]}>
            <Cloth color={trim} sheen={0.5} roughness={0.8} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- sacola mochila

/** Franze o topo (cordão puxado), achata os cantos de baixo (onde o cordão prende) e refaz o UV da área impressa. */
function shapeSack(g: THREE.BufferGeometry, w: number, h: number, chan: number, puff: number, side: 1 | -1) {
  const pos = g.getAttribute("position");
  const uv = g.getAttribute("uv");
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    let z = pos.getZ(i);
    const t = clamp(Math.abs(z) / puff, 0, 1);
    const top = smooth(y, h / 2 - 14, h / 2 - 1);
    const corner = Math.min(Math.hypot(x + w / 2, y + h / 2), Math.hypot(x - w / 2, y + h / 2));
    z *= (1 - 0.65 * top) * (0.12 + 0.88 * smooth(corner, 0, 9));
    z += side * t * (0.42 * top ** 1.5 * Math.sin(x * 1.25 + 0.6 * Math.sin(y * 0.4)) + 0.12 * (1 - top) * Math.sin(0.33 * x - 0.21 * y + 0.8));
    pos.setZ(i, z);
    // Costas: u corre de +x para -x, para a arte do verso ler da esquerda para a direita vista de trás.
    if (uv) uv.setXY(i, side === 1 ? (x + w / 2) / w : (w / 2 - x) / w, (y + h / 2) / (h - chan));
  }
  pos.needsUpdate = true;
  if (uv) uv.needsUpdate = true;
  g.computeVertexNormals();
}

function buildDrawstring(w: number, h: number, chan: number) {
  const puff = clamp(w * 0.05, 1.0, 2.2);
  const polygon = shapePolygon(makeShape("rect", w, h, 1.2), 220);
  const falloff = clamp(w * 0.16, 3, 7);
  const front = inflatedSurface(polygon, { height: puff, falloff, resolution: 84, side: 1 });
  const back = inflatedSurface(polygon, { height: puff, falloff, resolution: 60, side: -1 });
  shapeSack(front, w, h, chan, puff, 1);
  shapeSack(back, w, h, chan, puff, -1);

  // Bainha do cordão no topo: tubo achatado franzido, com pesponto em cima e embaixo.
  const channelPts = Array.from({ length: 13 }, (_, k) => vec(-w / 2 - 0.3 + ((w + 0.6) * k) / 12, h / 2 - chan / 2 + 0.18 * Math.sin(k * 1.9), 0.1 * Math.sin(k * 2.3)));
  const channel = strap(channelPts, vec(0, 1, 0), { width: chan + 0.4, thick: puff * 0.7 + 1.0, roundness: 2.4, stitch: 0.45 });

  // Abas de reforço nos cantos de baixo, com ilhós por onde o cordão passa.
  const tabPolygon = shapePolygon(makeShape("rect", 3.6, 4.4, 1.0), 48);
  const tabFront = inflatedSurface(tabPolygon, { height: 0.42, falloff: 0.45, resolution: 22, side: 1 });
  const tabBack = inflatedSurface(tabPolygon, { height: 0.42, falloff: 0.45, resolution: 22, side: -1 });

  const corners = [-1, 1].map((s) => {
    const K = vec((s * w) / 2, -h / 2, 0);
    const G = K.clone().add(vec(s * 0.7, -0.7, 0));
    // Nó e pontas para fora, na altura da aba: a sacola apoia nas abas, sem ficar suspensa pelas pontas.
    const knot = G.clone().add(vec(s * 1.0, -0.6, 1.1));
    const cordPts = [
      vec(s * (w / 2 - 2), h / 2 - chan / 2, 0),
      vec(s * (w / 2 + 0.6), h / 2 - chan / 2 + 0.3, 0.2),
      vec(s * (w / 2 + 1.9), h / 2 + 2.4, -0.7),
      vec(s * (w / 2 + 1.4), h / 2 - 4.5, -1.9),
      vec(s * (w / 2 + 0.5), 0, -2.3),
      vec(s * (w / 2 + 0.8), -h / 2 + 5, -1.4),
      G.clone().add(vec(0, 0.4, -1.1)),
      G.clone().add(vec(0, 0, 0.7)),
      knot,
    ];
    const cord = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cordPts, false, "centripetal"), 180, 0.28, 8, false);
    const tailEnd = knot.clone().add(vec(s * 1.6, -1.2, 0.5));
    const tail = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([knot, knot.clone().lerp(tailEnd, 0.5).add(vec(s * 0.3, 0, 0.1)), tailEnd]), 16, 0.27, 8, false);
    return { K, G, knot, tailEnd, cord, tail, angle: (s * Math.PI) / 4 };
  });

  const all = [front, back, channel.body, tabFront, tabBack, ...corners.flatMap((c) => [c.cord, c.tail])];
  if (channel.stitches) all.push(channel.stitches);
  return { front, back, channel, tabFront, tabBack, corners, all };
}

/**
 * Sacola mochila (gym sack): corpo plano inflado a partir do contorno, frente sublimada de ponta a
 * ponta pelo UV (abaixo da bainha), franzido no topo, bainha do cordão com pesponto, cordões que
 * descem pelas laterais até abas de reforço com ilhós nos cantos de baixo e terminam em nó.
 */
export function DrawstringModel({ spec, art, label }: ModelProps) {
  const w = clamp(spec.widthCm, 15, 80);
  const h = clamp(spec.heightCm, 18, 100);
  const chan = 3.2;
  // Sublimada de ponta a ponta: a arte cobre a frente toda, com fundo pintado.
  const panelArt = useMemo(() => ({ ...art, opaque: true }), [art]);
  const texture = useArtTexture(w / (h - chan), "front", panelArt, label);
  // Costas: lisas, ou sublimadas com a arte do passo "Verso" (mesma área da frente).
  const ownBack = backArtOf(art) !== null;
  const backTexture = useBackTexture(w / (h - chan), spec, panelArt, label, undefined, "blank");
  const p = useMemo(() => buildDrawstring(w, h, chan), [w, h]);
  useGeometriesCleanup(p.all);
  const base = spec.baseColor;
  const trim = trimOf(spec);
  const cordColor = spec.accentColor ?? (isDark(base) ? "#ededed" : "#1c1c1f");
  return (
    <group rotation-y={0.32}>
      <group scale={UNIT}>
        <mesh geometry={p.front}>
          <PrintedSurface map={texture} />
        </mesh>
        <mesh geometry={p.back}>{ownBack ? <PrintedSurface map={backTexture} /> : <Cloth color={base} />}</mesh>
        <mesh geometry={p.channel.body}>
          <Cloth color={base} />
        </mesh>
        {p.channel.stitches && (
          <mesh geometry={p.channel.stitches}>
            <meshStandardMaterial color={isDark(base) ? "#7a7a7e" : shade(base, 0.62)} roughness={0.8} />
          </mesh>
        )}
        {p.corners.map((c, i) => (
          <group key={i}>
            <group position={c.K} rotation-z={c.angle}>
              <mesh geometry={p.tabFront}>
                <Cloth color={trim} sheen={0.3} roughness={0.6} />
              </mesh>
              <mesh geometry={p.tabBack}>
                <Cloth color={trim} sheen={0.3} roughness={0.6} />
              </mesh>
            </group>
            {[0.46, -0.46].map((z) => (
              <mesh key={z} position={[c.G.x, c.G.y, z]}>
                <torusGeometry args={[0.52, 0.17, 10, 28]} />
                <Metal />
              </mesh>
            ))}
            <mesh geometry={c.cord}>
              <Cloth color={cordColor} sheen={0.6} roughness={0.75} />
            </mesh>
            <mesh geometry={c.tail}>
              <Cloth color={cordColor} sheen={0.6} roughness={0.75} />
            </mesh>
            <mesh position={c.knot}>
              <sphereGeometry args={[0.62, 16, 12]} />
              <Cloth color={cordColor} sheen={0.6} roughness={0.75} />
            </mesh>
            <mesh position={c.tailEnd}>
              <sphereGeometry args={[0.3, 12, 8]} />
              <Plastic />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- cooler e lancheira

function buildBoxCooler(W: number, H: number, D: number, lunch: boolean) {
  const r = lunch ? 2.0 : 2.8;
  const topZone = r + 1.0;
  const margin = r + 0.8;
  const bottomPad = r + 0.8;
  const pw = W - margin * 2;
  const ph = H - topZone - bottomPad;
  const hw = W / 2;
  const hh = H / 2;
  const hd = D / 2;
  const printCy = -hh + bottomPad + ph / 2;
  const o: SoftBody = { w: W, h: H, d: D, r, front: lunch ? 0.6 : 0.9, back: 0.7, side: lunch ? 0.4 : 0.6, top: lunch ? 0.5 : 0.8, taperX: 0.03 };
  const deform = deformer(o);
  const inner = innerOf(o);
  const body = softBodyGeometry(o).geometry;
  const frontZ = deform(vec(0, printCy, hd)).z;
  const backZ = deform(vec(0, printCy, -hd)).z;

  // Debrum na borda da tampa e na do fundo.
  const pipings = [surfaceLoop(o, "y", 1, Math.PI / 4), surfaceLoop(o, "y", -1, Math.PI / 4)].map((loop) => pipingGeometry(onSurface(o, loop).points, 0.3));

  // Zíper da tampa: logo abaixo do debrum, contorna frente e laterais; a traseira é a dobradiça.
  const zipPath = onSurface(o, surfaceLoop(o, "y", 1, 1.3), (p) => p.z > -inner.z * 0.7);
  const zipper = zipperGeometries(zipPath, lunch ? 1.2 : 1.5);
  const pullers = [pullerAt(zipPath, 0.25), pullerAt(zipPath, 0.3)].filter((p): p is PullerPose => p !== null);

  const geometries: THREE.BufferGeometry[] = [body, ...pipings, zipper.tape, zipper.teeth];
  let shoulder: { main: Strap; pad: Strap; buckle: Frame; ringX: number; ringY: number } | null = null;
  let handle: { main: Strap; tabs: THREE.Vector3[]; stitches: THREE.BufferGeometry } | null = null;
  if (lunch) {
    const a = deform(vec(-4.5, hh, 0));
    const b = deform(vec(4.5, hh, 0));
    const main = strap([a.clone().add(vec(0, -0.5, 0)), a.clone().add(vec(-0.2, 2.6, 0)), vec(0, Math.max(a.y, b.y) + 5.6, 0), b.clone().add(vec(0.2, 2.6, 0)), b.clone().add(vec(0, -0.5, 0))], vec(0, 0, 1), {
      width: 2.8,
      thick: 1.3,
      roundness: 2.6,
      stitch: 0.4,
    });
    const tabs = [a, b].map((p) => p.clone().add(vec(0, 0.12, 0)));
    const stitches = repeatBox(tabs.flatMap((p) => boxStitch(new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(p), 3.2, 3.0, 0.3)));
    geometries.push(main.body, stitches);
    if (main.stitches) geometries.push(main.stitches);
    handle = { main, tabs, stitches };
  } else {
    const ringY = hh - r - 4.5;
    const ringX = deform(vec(hw, ringY, 0)).x;
    const main = strap(shoulderArc(ringX + 0.45, ringY + 2.6, hh + 17, -3.2), vec(0, 0, 1), { width: 3.8, thick: 0.22 });
    const pad = strap(curveSlice(main.curve, 0.38, 0.62), vec(0, 0, 1), { width: 6.2, thick: 1.1, roundness: 2.6, stitch: 0.45 });
    geometries.push(main.body, pad.body);
    if (pad.stitches) geometries.push(pad.stitches);
    shoulder = { main, pad, buckle: main.frameAt(0.2), ringX, ringY };
  }
  return { body, frontZ, backZ, printCy, pw, ph, decalDepth: D * 0.6, pipings, zipper, pullers, shoulder, handle, all: geometries };
}

function BoxCooler({ spec, art, label }: ModelProps) {
  const lunch = spec.variant === "lunch";
  const W = lunch ? clamp(spec.widthCm, 12, 40) : clamp(spec.widthCm, 15, 60);
  const H = lunch ? clamp(spec.heightCm, 12, 45) : W * 0.89;
  const D = lunch ? clamp(W * 0.42, 6, 14) : clamp(spec.heightCm < spec.widthCm ? spec.heightCm : W * 0.6, 10, 40);
  const hw = useHardware();
  const p = useMemo(() => buildBoxCooler(W, H, D, lunch), [W, H, D, lunch]);
  useGeometriesCleanup(p.all);
  // A área impressa é o painel frontal inteiro: a arte usa a proporção dele (sem distorcer).
  const texture = useArtTexture(p.pw / p.ph, "front", art, label);
  // Painel de trás (dobradiça da tampa, sem zíper): só recebe estampa com a arte do passo "Verso".
  const ownBack = backArtOf(art) !== null;
  const backTexture = useBackTexture(p.pw / p.ph, spec, art, label, undefined, "blank");
  const shoulder = p.shoulder;
  const base = spec.baseColor;
  const trim = trimOf(spec);
  const stitch = isDark(trim) ? "#6b6c70" : shade(trim, 0.6);
  return (
    <group rotation-y={lunch ? 0.42 : -0.45}>
      <group scale={UNIT}>
        <mesh geometry={p.body}>
          {/* Lancheira em lona: trama fosca, quase sem brilho; cooler em microfibra acetinada. */}
          <Cloth color={base} sheen={lunch ? 0.35 : 0.7} roughness={lunch ? 0.94 : 0.88} />
          <PanelPrint key={p.body.uuid} map={texture} position={[0, p.printCy, p.frontZ]} size={[p.pw, p.ph]} depth={p.decalDepth} />
          {ownBack && <PanelPrint key={`${p.body.uuid}:verso`} map={backTexture} position={[0, p.printCy, p.backZ]} rotation={[0, Math.PI, 0]} size={[p.pw, p.ph]} depth={p.decalDepth} />}
        </mesh>
        {p.pipings.map((g, i) => (
          <mesh key={i} geometry={g}>
            <Cloth color={trim} sheen={0.5} roughness={0.7} />
          </mesh>
        ))}
        <Zipper parts={p.zipper} color={trim} />
        {p.pullers.map((pose, i) => (
          <Puller key={i} pose={pose} hw={hw} color={trim} />
        ))}
        {shoulder && (
          <>
            {[-1, 1].map((s) => (
              <SideRing key={s} x={s * shoulder.ringX} y={shoulder.ringY} side={s} hw={hw} color={trim} />
            ))}
            <StrapMesh part={shoulder.main} color={trim} stitch={stitch} />
            <StrapMesh part={shoulder.pad} color={trim} stitch={stitch} padded />
            <Buckle frame={shoulder.buckle} hw={hw} />
          </>
        )}
        {p.handle && (
          <>
            <StrapMesh part={p.handle.main} color={trim} stitch={stitch} padded />
            {p.handle.tabs.map((t, i) => (
              <mesh key={i} geometry={hw.patch} position={t} scale={[3.2, 0.3, 3.0]}>
                <Cloth color={trim} sheen={0.4} roughness={0.75} />
              </mesh>
            ))}
            <mesh geometry={p.handle.stitches}>
              <meshStandardMaterial color={stitch} roughness={0.8} />
            </mesh>
          </>
        )}
      </group>
    </group>
  );
}

function buildCanCooler(R: number, H: number) {
  const profile = smoothProfile(
    [
      [0, 0],
      [R - 1.4, 0],
      [R - 0.3, 0.3],
      [R, 1.4],
      [R + 0.35, H * 0.5],
      [R, H - 1.8],
      [R - 0.45, H - 0.5],
      [R * 0.75, H + 0.2],
      [0, H + 0.5],
    ],
    90,
  );
  const body = lathe(profile, 96);
  const bandBottom = 2.4;
  const bandH = H - 6.6;
  const bandCy = bandBottom + bandH / 2;
  // Frente do cilindro (≈ 150°), livre das argolas laterais.
  const bandW = Math.PI * R * 0.85;
  const band = bandGeometry({ radiusTop: R, radiusBottom: R, height: bandH, width: bandW, segments: 96, rows: 18, radiusAt: (y) => radiusOnProfile(profile, bandCy + y) + 0.06 });

  const zipY = H - 2.6;
  const zipR = radiusOnProfile(profile, zipY) + 0.02;
  const pre: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];
  const span = (Math.PI * 5) / 3;
  const n = Math.ceil((span * zipR) / 0.36);
  for (let i = 0; i <= n; i += 1) {
    const a = -span / 2 + (span * i) / n;
    pre.push(vec(zipR * Math.sin(a), zipY, zipR * Math.cos(a)));
    normals.push(vec(Math.sin(a), 0, Math.cos(a)));
  }
  const zipPath = { points: pre, normals };
  const zipper = zipperGeometries(zipPath, 1.5);
  const pullers = [pullerAt(zipPath, 0.66), pullerAt(zipPath, 0.7)].filter((p): p is PullerPose => p !== null);

  const ringY = H - 5.2;
  const ringX = radiusOnProfile(profile, ringY);
  const main = strap(shoulderArc(ringX + 0.45, ringY + 2.6, H + 15, -3.2), vec(0, 0, 1), { width: 3.8, thick: 0.22 });
  const pad = strap(curveSlice(main.curve, 0.38, 0.62), vec(0, 0, 1), { width: 6.2, thick: 1.1, roundness: 2.6, stitch: 0.45 });
  const rings = [0.9, H - 1.0].map((y) => ({ y, r: radiusOnProfile(profile, y) - 0.02 }));
  const all = [body, band, zipper.tape, zipper.teeth, main.body, pad.body];
  if (pad.stitches) all.push(pad.stitches);
  return { body, band, bandCy, aspect: bandW / bandH, zipper, pullers, main, pad, buckle: main.frameAt(0.2), ringX, ringY, rings, all };
}

/** Cooler redondo (opção "Cilindro", medida em pé): corpo torneado, faixa sublimada na frente. */
function CanCooler({ spec, art, label }: ModelProps) {
  const R = clamp(spec.widthCm / 2, 6, 25);
  const H = clamp(spec.heightCm * 0.8, 12, 60);
  const hw = useHardware();
  const p = useMemo(() => buildCanCooler(R, H), [R, H]);
  useGeometriesCleanup(p.all);
  const texture = useArtTexture(p.aspect, "front", art, label);
  // Verso: a mesma faixa girada para trás (entre as argolas), só com a arte do passo "Verso".
  const ownBack = backArtOf(art) !== null;
  const backTexture = useBackTexture(p.aspect, spec, art, label, undefined, "blank");
  const trim = trimOf(spec);
  const stitch = isDark(trim) ? "#6b6c70" : shade(trim, 0.6);
  return (
    <group rotation-y={-0.35}>
      <group scale={UNIT}>
        <mesh geometry={p.body}>
          <Cloth color={spec.baseColor} sheen={0.7} roughness={0.88} />
        </mesh>
        <mesh geometry={p.band} position-y={p.bandCy}>
          <PrintedSurface map={texture} />
        </mesh>
        {ownBack && (
          <mesh geometry={p.band} position-y={p.bandCy} rotation-y={Math.PI}>
            <PrintedSurface map={backTexture} />
          </mesh>
        )}
        {p.rings.map((ring) => (
          <mesh key={ring.y} position-y={ring.y} rotation-x={Math.PI / 2}>
            <torusGeometry args={[ring.r, 0.3, 8, 96]} />
            <Cloth color={trim} sheen={0.5} roughness={0.7} />
          </mesh>
        ))}
        <Zipper parts={p.zipper} color={trim} />
        {p.pullers.map((pose, i) => (
          <Puller key={i} pose={pose} hw={hw} color={trim} />
        ))}
        {[-1, 1].map((s) => (
          <SideRing key={s} x={s * p.ringX} y={p.ringY} side={s} hw={hw} color={trim} />
        ))}
        <StrapMesh part={p.main} color={trim} stitch={stitch} />
        <StrapMesh part={p.pad} color={trim} stitch={stitch} padded />
        <Buckle frame={p.buckle} hw={hw} />
      </group>
    </group>
  );
}

/**
 * Cooler térmico macio: caixa estofada com faces estufadas e debrum nas quinas, zíper da tampa
 * contornando frente e laterais com dois cursores, painel frontal impresso (Decal) e alça de ombro
 * com argolas D, regulador e ombreira. Variante "lunch" (lancheira): mais alta e estreita, com alça
 * de mão acolchoada no topo. A opção "Cilindro" (medida mais alta que larga) vira um cooler redondo.
 */
export function CoolerModel(props: ModelProps) {
  const { spec } = props;
  if (spec.variant !== "lunch" && spec.heightCm > spec.widthCm * 1.15) return <CanCooler {...props} />;
  return <BoxCooler {...props} />;
}

// ---------------------------------------------------------------------------- bolsa esportiva

function buildSportDuffel(artW: number, artH: number) {
  const W = 48;
  const H = 27;
  const D = 25;
  const r = 7.5;
  const hw = W / 2;
  const hh = H / 2;
  const hd = D / 2;
  const o: SoftBody = { w: W, h: H, d: D, r, front: 1.0, back: 1.0, side: 0.8, top: 0.6, taperZ: 0.28 };
  const deform = deformer(o);
  const inner = innerOf(o);
  const body = softBodyGeometry(o).geometry;
  const printCy = -2.0;
  // Base das alças acima da arte e por fora dela (a arte DTF tem 25 cm: x ∈ ±12,5).
  const handleX = 14.5;
  const frontZ = deform(vec(0, printCy, hd)).z;
  const pipings = [surfaceLoop(o, "z", 1, Math.PI / 4), surfaceLoop(o, "z", -1, Math.PI / 4)].map((loop) => pipingGeometry(onSurface(o, loop).points, 0.34));

  // Zíper em U: corre no topo e desce um pouco pelas cabeceiras.
  const zipPath = onSurface(o, surfaceLoop(o, "z", 1, Math.PI / 2, 0), (p) => p.y > hh - r * 0.55);
  const zipper = zipperGeometries(zipPath, 1.7);
  const pullers = [pullerAt(zipPath, 0.3), pullerAt(zipPath, 0.36)].filter((p): p is PullerPose => p !== null);

  // Duas alças de mão (frente e trás) que se encontram sobre o topo, presas por etiquetas costuradas em X.
  const tabMatrices: THREE.Matrix4[] = [];
  const handles = ([1, -1] as const).map((zs) => {
    const anchors = [-1, 1].map((sx) => {
      const pre = vec(sx * handleX, inner.y - 0.5, zs * hd);
      const n = surfaceNormal(deform, pre, inner);
      const p = deform(pre.clone());
      const t = vec(0, 1, 0).addScaledVector(n, -n.y).normalize();
      const b = new THREE.Vector3().crossVectors(t, n);
      tabMatrices.push(new THREE.Matrix4().makeBasis(b, t, n).setPosition(p.clone().addScaledVector(n, 0.15)));
      return { p, n };
    });
    const [a, b] = anchors;
    return strap(
      [
        a.p.clone().addScaledVector(a.n, -0.3),
        a.p.clone().add(vec(-0.4, 3.2, zs * 0.4)),
        vec(-handleX * 0.6, hh + 7.5, zs * 3.0),
        vec(0, hh + 10.4, zs * 1.4),
        vec(handleX * 0.6, hh + 7.5, zs * 3.0),
        b.p.clone().add(vec(0.4, 3.2, zs * 0.4)),
        b.p.clone().addScaledVector(b.n, -0.3),
      ],
      vec(0, 0, 1),
      { width: 2.3, thick: 1.6, roundness: 2.2 },
    );
  });
  const grip = strap([vec(-6.2, hh + 10.3, 0), vec(0, hh + 10.7, 0), vec(6.2, hh + 10.3, 0)], vec(0, 0, 1), { width: 4.8, thick: 2.8, roundness: 2.4, stitch: 0.5 });
  const tabStitches = repeatBox(tabMatrices.flatMap((m) => boxStitch(m, 3.6, 5.2, 0.17)));

  // Alça de ombro saindo das argolas nas cabeceiras.
  const ringY = inner.y - 1.0;
  const ringX = deform(vec(hw, ringY, 0)).x;
  const shoulder = strap(shoulderArc(ringX + 0.45, ringY + 2.6, hh + 19, -5), vec(0, 0, 1), { width: 3.8, thick: 0.22 });
  const pad = strap(curveSlice(shoulder.curve, 0.4, 0.6), vec(0, 0, 1), { width: 6.4, thick: 1.2, roundness: 2.6, stitch: 0.45 });

  // Bolso com zíper na cabeceira +x.
  const pocket: SoftBody = { w: D * 0.62, h: H * 0.45, d: 3.4, r: 1.4, front: 0.7, side: 0.3, top: 0.2 };
  const pocketY = -3.5;
  const pocketBody = softBodyGeometry(pocket).geometry;
  const pocketInner = innerOf(pocket);
  const pocketPiping = pipingGeometry(onSurface(pocket, surfaceLoop(pocket, "z", 1, Math.PI / 4)).points, 0.26);
  const pocketZipPath = onSurface(pocket, linePoints(vec(-pocketInner.x, pocketInner.y - 1.0, pocket.d / 2), vec(pocketInner.x, pocketInner.y - 1.0, pocket.d / 2), 0.32));
  const pocketZip = zipperGeometries(pocketZipPath, 1.1, 0.32);
  const pocketPuller = pullerAt(pocketZipPath, 0.82);
  const pocketX = deform(vec(hw, pocketY, 0)).x;

  const all = [body, ...pipings, zipper.tape, zipper.teeth, ...handles.map((h) => h.body), grip.body, tabStitches, shoulder.body, pad.body, pocketBody, pocketPiping, pocketZip.tape, pocketZip.teeth];
  if (grip.stitches) all.push(grip.stitches);
  if (pad.stitches) all.push(pad.stitches);
  const [aw, ah] = fitContain(artW / artH, Math.min(artW, W * 0.62), Math.min(artH, H * 0.46));
  return {
    body,
    frontZ,
    printCy,
    artSize: [aw, ah] as [number, number],
    decalDepth: D * 0.5,
    pipings,
    zipper,
    pullers,
    handles,
    grip,
    tabMatrices,
    tabStitches,
    shoulder,
    pad,
    buckle: shoulder.frameAt(0.78),
    ringX,
    ringY,
    pocket: { body: pocketBody, piping: pocketPiping, zip: pocketZip, puller: pocketPuller, position: vec(pocketX + pocket.d / 2 - 1.0, pocketY, 0) },
    all,
  };
}

/** Etiqueta retangular costurada (base das alças de mão). */
function Patch({ matrix, w, h, hw, color }: { matrix: THREE.Matrix4; w: number; h: number; hw: Hardware; color: string }) {
  const { position, quaternion } = useMemo(() => {
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    matrix.decompose(position, quaternion, new THREE.Vector3());
    return { position, quaternion };
  }, [matrix]);
  return (
    <mesh geometry={hw.patch} position={position} quaternion={quaternion} scale={[w, h, 0.3]}>
      <Cloth color={color} sheen={0.4} roughness={0.75} />
    </mesh>
  );
}

function SportDuffel({ spec, art, label }: ModelProps) {
  // Esportiva: a medida da spec é a arte em DTF (25 × 10 cm) aplicada em tamanho real na lateral.
  const sport = spec.variant === "sport";
  const aspect = safeAspect(spec);
  const artW = sport ? clamp(spec.widthCm, 5, 60) : clamp(spec.widthCm * 0.55, 5, 60);
  const artH = artW / aspect;
  const printArt = useApparelArt(art);
  const texture = useArtTexture(aspect, "front", printArt, label);
  const hw = useHardware();
  const p = useMemo(() => buildSportDuffel(artW, artH), [artW, artH]);
  useGeometriesCleanup(p.all);
  const base = spec.baseColor;
  const trim = trimOf(spec);
  const stitch = isDark(trim) ? "#6b6c70" : shade(trim, 0.6);
  return (
    <group rotation-y={-0.5}>
      <group scale={UNIT}>
        <mesh geometry={p.body}>
          <Cloth color={base} sheen={0.55} roughness={0.72} />
          <PanelPrint key={p.body.uuid} map={texture} position={[0, p.printCy, p.frontZ]} size={p.artSize} depth={p.decalDepth} />
        </mesh>
        {p.pipings.map((g, i) => (
          <mesh key={i} geometry={g}>
            <Cloth color={trim} sheen={0.5} roughness={0.7} />
          </mesh>
        ))}
        <Zipper parts={p.zipper} color={trim} />
        {p.pullers.map((pose, i) => (
          <Puller key={i} pose={pose} hw={hw} color={trim} />
        ))}
        {p.handles.map((h, i) => (
          <StrapMesh key={i} part={h} color={trim} stitch={stitch} padded />
        ))}
        <StrapMesh part={p.grip} color={trim} stitch={stitch} padded />
        {p.tabMatrices.map((m, i) => (
          <Patch key={i} matrix={m} w={3.6} h={5.2} hw={hw} color={trim} />
        ))}
        <mesh geometry={p.tabStitches}>
          <meshStandardMaterial color={stitch} roughness={0.8} />
        </mesh>
        {[-1, 1].map((s) => (
          <SideRing key={s} x={s * p.ringX} y={p.ringY} side={s} hw={hw} color={trim} />
        ))}
        <StrapMesh part={p.shoulder} color={trim} stitch={stitch} />
        <StrapMesh part={p.pad} color={trim} stitch={stitch} padded />
        <Buckle frame={p.buckle} hw={hw} />
        <group position={p.pocket.position} rotation-y={Math.PI / 2}>
          <mesh geometry={p.pocket.body}>
            <Cloth color={base} sheen={0.55} roughness={0.72} />
          </mesh>
          <mesh geometry={p.pocket.piping}>
            <Cloth color={trim} sheen={0.5} roughness={0.7} />
          </mesh>
          <Zipper parts={p.pocket.zip} color={trim} />
          {p.pocket.puller && <Puller pose={p.pocket.puller} hw={hw} color={trim} />}
        </group>
      </group>
    </group>
  );
}

/** Faixa de arte sobre o cilindro deitado (eixo x), centrada na frente: largura ao longo do eixo, altura em arco. */
function barrelBand(profile: Pt[], artW: number, artH: number, nu = 96, nv = 24) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= nv; j += 1) {
    const v = j / nv;
    for (let i = 0; i <= nu; i += 1) {
      const u = i / nu;
      const x = -artW / 2 + artW * u;
      const r = radiusOnProfile(profile, x) + 0.06;
      const phi = ((v - 0.5) * artH) / r;
      positions.push(x, r * Math.sin(phi), r * Math.cos(phi));
      uvs.push(u, v);
    }
  }
  for (let j = 0; j < nv; j += 1) {
    for (let i = 0; i < nu; i += 1) {
      const a = j * (nu + 1) + i;
      const b = a + 1;
      const c = a + nu + 1;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildBarrel(L: number, R: number, aspect: number) {
  const profile = smoothProfile(
    [
      [0, -L / 2 - 0.8],
      [R * 0.55, -L / 2 - 0.55],
      [R * 0.9, -L / 2 - 0.1],
      [R, -L / 2 + 1.6],
      [R + 0.25, -L / 4],
      [R + 0.35, 0],
      [R + 0.25, L / 4],
      [R, L / 2 - 1.6],
      [R * 0.9, L / 2 + 0.1],
      [R * 0.55, L / 2 + 0.55],
      [0, L / 2 + 0.8],
    ],
    120,
  );
  const body = lathe(profile, 96);
  // Tampas laterais na cor de acabamento (grupo 1), com debrum na emenda.
  const capAt = L / 2 - 1.0;
  const index = body.getIndex();
  const pos = body.getAttribute("position");
  if (index) {
    const side: number[] = [];
    const caps: number[] = [];
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      const y = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
      (Math.abs(y) > capAt ? caps : side).push(a, b, c);
    }
    body.setIndex([...side, ...caps]);
    body.clearGroups();
    body.addGroup(0, side.length, 0);
    body.addGroup(side.length, caps.length, 1);
  }
  const rings = [-capAt, capAt].map((x) => ({ x, r: radiusOnProfile(profile, x) }));

  const [artW, artH] = fitContain(aspect, L - 9, R * 1.25);
  const band = barrelBand(profile, artW, artH);

  const zipPts = linePoints(vec(-(L / 2 - 6), 0, 0), vec(L / 2 - 6, 0, 0), 0.36).map((p) => vec(p.x, radiusOnProfile(profile, p.x) + 0.02, 0));
  const zipPath = { points: zipPts, normals: zipPts.map(() => vec(0, 1, 0)) };
  const zipper = zipperGeometries(zipPath, 1.7);
  const pullers = [pullerAt(zipPath, 0.62), pullerAt(zipPath, 0.68)].filter((p): p is PullerPose => p !== null);

  // Alças de mão ancoradas no alto da frente e de trás, unidas por uma empunhadura acolchoada.
  const a = L * 0.2;
  const phi = 0.62;
  const tabMatrices: THREE.Matrix4[] = [];
  const handles = ([1, -1] as const).map((zs) => {
    const anchors = [-1, 1].map((sx) => {
      const rr = radiusOnProfile(profile, sx * a);
      const n = vec(0, Math.cos(phi), zs * Math.sin(phi));
      const p = n.clone().multiplyScalar(rr).setX(sx * a);
      const t = new THREE.Vector3().crossVectors(n, vec(1, 0, 0));
      tabMatrices.push(new THREE.Matrix4().makeBasis(vec(1, 0, 0), t, n).setPosition(p.clone().addScaledVector(n, 0.15)));
      return { p, n };
    });
    const [l, rgt] = anchors;
    return strap(
      [
        l.p.clone().addScaledVector(l.n, -0.3),
        l.p.clone().addScaledVector(l.n, 2.6).add(vec(0.3, 0, 0)),
        vec(-a * 0.7, R + 7.2, zs * 2.8),
        vec(0, R + 9.6, zs * 1.4),
        vec(a * 0.7, R + 7.2, zs * 2.8),
        rgt.p.clone().addScaledVector(rgt.n, 2.6).add(vec(-0.3, 0, 0)),
        rgt.p.clone().addScaledVector(rgt.n, -0.3),
      ],
      vec(0, 0, 1),
      { width: 2.3, thick: 1.6, roundness: 2.2 },
    );
  });
  const grip = strap([vec(-6, R + 9.5, 0), vec(0, R + 9.9, 0), vec(6, R + 9.5, 0)], vec(0, 0, 1), { width: 4.8, thick: 2.8, roundness: 2.4, stitch: 0.5 });
  const tabStitches = repeatBox(tabMatrices.flatMap((m) => boxStitch(m, 3.6, 5.2, 0.17)));
  const all = [body, band, zipper.tape, zipper.teeth, ...handles.map((h) => h.body), grip.body, tabStitches];
  if (grip.stitches) all.push(grip.stitches);
  return { body, rings, band, zipper, pullers, handles, grip, tabMatrices, tabStitches, all };
}

function BarrelDuffel({ spec, art, label }: ModelProps) {
  const D = clamp(spec.heightCm, 16, 45);
  const R = D / 2;
  const L = clamp(spec.widthCm, D * 1.6, D * 2.2);
  const aspect = safeAspect(spec);
  // A faixa impressa da bolsa cilindro é opaca (o painel inteiro recebe a arte).
  const panelArt = useMemo(() => ({ ...art, opaque: true }), [art]);
  const texture = useArtTexture(aspect, "front", panelArt, label);
  // Verso: a mesma faixa girada para o lado de trás, só com a arte do passo "Verso".
  const ownBack = backArtOf(art) !== null;
  const backTexture = useBackTexture(aspect, spec, panelArt, label, undefined, "blank");
  const hw = useHardware();
  const p = useMemo(() => buildBarrel(L, R, aspect), [L, R, aspect]);
  useGeometriesCleanup(p.all);
  const base = spec.baseColor;
  const trim = trimOf(spec);
  const stitch = isDark(trim) ? "#6b6c70" : shade(trim, 0.6);
  return (
    <group rotation-y={-0.38}>
      <group scale={UNIT}>
        <group rotation-z={-Math.PI / 2}>
          <mesh geometry={p.body}>
            <Cloth attach="material-0" color={base} sheen={0.7} roughness={0.85} />
            <Cloth attach="material-1" color={trim} sheen={0.5} roughness={0.8} />
          </mesh>
        </group>
        <mesh geometry={p.band}>
          <PrintedSurface map={texture} />
        </mesh>
        {ownBack && (
          <mesh geometry={p.band} rotation-y={Math.PI}>
            <PrintedSurface map={backTexture} />
          </mesh>
        )}
        {p.rings.map((ring) => (
          <mesh key={ring.x} position-x={ring.x} rotation-y={Math.PI / 2}>
            <torusGeometry args={[ring.r, 0.34, 8, 96]} />
            <Cloth color={trim} sheen={0.5} roughness={0.7} />
          </mesh>
        ))}
        <Zipper parts={p.zipper} color={trim} />
        {p.pullers.map((pose, i) => (
          <Puller key={i} pose={pose} hw={hw} color={trim} />
        ))}
        {p.handles.map((h, i) => (
          <StrapMesh key={i} part={h} color={trim} stitch={stitch} padded />
        ))}
        <StrapMesh part={p.grip} color={trim} stitch={stitch} padded />
        {p.tabMatrices.map((m, i) => (
          <Patch key={i} matrix={m} w={3.6} h={5.2} hw={hw} color={trim} />
        ))}
        <mesh geometry={p.tabStitches}>
          <meshStandardMaterial color={stitch} roughness={0.8} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Bolsas esportivas. Variante "cylinder": bolsa cilindro deitada — corpo torneado com tampas
 * laterais em cor de acabamento e debrum, faixa sublimada abraçando a lateral voltada para a câmera,
 * zíper no topo e duas alças com empunhadura. Variante "sport" (e padrão): duffel de academia em caixa
 * estofada afunilada no topo, arte DTF em tamanho real na lateral, zíper em U, alças de mão com
 * etiquetas costuradas em X, alça de ombro com argolas e bolso com zíper na cabeceira.
 */
export function DuffelModel(props: ModelProps) {
  if (props.spec.variant === "cylinder") return <BarrelDuffel {...props} />;
  return <SportDuffel {...props} />;
}
