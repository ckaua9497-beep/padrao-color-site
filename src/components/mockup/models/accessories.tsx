"use client";

// Acessórios: chinelo, caneta, ventarola, cordão de crachá, crachá e pulseira.
// Cada peça é modelada em centímetros dentro de um grupo com escala (proporções reais);
// cotas de medida ficam fora da escala, em unidades de cena.

import { useEffect, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import { KIND_INFO, artAspect, flipflopSize } from "@/lib/mockup-kinds";
import { fontFamily } from "../art";
import { useGeometriesCleanup } from "./fabric";
import { inflatedSurface } from "./inflate";
import {
  Dimensions,
  PrintMaterial,
  RoundedBlock,
  faceGeometry,
  makeShape,
  sizeLabels,
  useArtTexture,
  useGeometryCleanup,
  type MaskPath,
  type ModelProps,
  useBackTexture,
  backKindOf,
} from "./shared";
import { PrintBand, lathe, type Pt } from "./vessel";

// ---------------------------------------------------------------------------- utilitários

const clamp = THREE.MathUtils.clamp;

type V3 = [number, number, number];

const vec = ([x, y, z]: V3) => new THREE.Vector3(x, y, z);

/** Cromado das ferragens (clipe, mosquetão, ponteira). */
function Chrome({ roughness = 0.16 }: { roughness?: number }) {
  return <meshStandardMaterial color="#dfe2e6" metalness={1} roughness={roughness} />;
}

function isLight(color: string) {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(color).getHSL(hsl);
  return hsl.l > 0.86;
}

function shade(color: string, factor: number) {
  return new THREE.Color(color).multiplyScalar(factor).getStyle();
}

/** Pseudoaleatório com semente: as texturas procedurais saem iguais a cada render. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/** Relevo fino para bumpMap (fibra do Tyvek ou granulado da borracha). É dado de altura: fica em espaço linear. */
function useBumpTexture(kind: "fiber" | "grain", repeatX: number, repeatY: number) {
  const texture = useMemo(() => {
    const size = 256;
    const canvas = makeCanvas(size, size);
    const ctx = canvas.getContext("2d");
    const rand = seeded(kind === "fiber" ? 11 : 29);
    if (ctx) {
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, size, size);
      if (kind === "fiber") {
        for (let i = 0; i < 700; i += 1) {
          const x = rand() * size;
          const y = rand() * size;
          const a = rand() * Math.PI;
          const len = 8 + rand() * 26;
          ctx.strokeStyle = rand() > 0.5 ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.22)";
          ctx.lineWidth = 0.6 + rand() * 1.4;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (rand() - 0.5) * 10, y + Math.sin(a) * len * 0.5 + (rand() - 0.5) * 10, x + Math.cos(a) * len, y + Math.sin(a) * len);
          ctx.stroke();
        }
      } else {
        for (let i = 0; i < 3200; i += 1) {
          const tone = rand() > 0.5 ? 255 : 0;
          ctx.fillStyle = `rgba(${tone},${tone},${tone},0.22)`;
          ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2);
        }
      }
    }
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    return t;
  }, [kind, repeatX, repeatY]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** Veio de madeira clara (palito da ventarola, suporte do prato). */
function useWoodTexture() {
  const texture = useMemo(() => {
    const canvas = makeCanvas(128, 512);
    const ctx = canvas.getContext("2d");
    const rand = seeded(5);
    if (ctx) {
      const base = ctx.createLinearGradient(0, 0, 128, 0);
      base.addColorStop(0, "#c9a477");
      base.addColorStop(0.5, "#d8b88c");
      base.addColorStop(1, "#c29b6b");
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 128, 512);
      for (let i = 0; i < 48; i += 1) {
        const x0 = rand() * 128;
        const amp = 1 + rand() * 4;
        const phase = rand() * 6;
        const freq = 0.004 + rand() * 0.01;
        ctx.strokeStyle = `rgba(${Math.round(105 + rand() * 30)},${Math.round(68 + rand() * 20)},40,${0.12 + rand() * 0.25})`;
        ctx.lineWidth = 0.5 + rand() * 2;
        ctx.beginPath();
        for (let y = 0; y <= 512; y += 16) {
          const x = x0 + Math.sin(y * freq + phase) * amp;
          if (y === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** Bloco de madeira (cm) com cantos arredondados e quinas chanfradas; o veio corre ao longo do maior lado. */
function WoodBlock({ size, map, radius = 0.25, position, rotation }: { size: V3; map: THREE.Texture; radius?: number; position?: V3; rotation?: V3 }) {
  const [w, h, d] = size;
  const geometry = useMemo(() => {
    const bevel = Math.min(0.08, w * 0.1, h * 0.1, d * 0.1);
    const depth = Math.max(0.01, d - bevel * 2);
    const g = new THREE.ExtrudeGeometry(makeShape("rect", w - bevel * 2, h - bevel * 2, radius), {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 6,
    });
    g.translate(0, 0, -depth / 2);
    // UV planar: v ao longo do maior lado (veio), u na soma dos outros dois eixos.
    const long = w >= h && w >= d ? 0 : h >= d ? 1 : 2;
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const along = long === 0 ? x : long === 1 ? y : z;
      uv.setXY(i, (x + y + z - along) / 3 + 0.5, along / 12 + 0.5);
    }
    uv.needsUpdate = true;
    return g;
  }, [w, h, d, radius]);
  useGeometryCleanup(geometry);
  return (
    <mesh geometry={geometry} position={position} rotation={rotation}>
      <meshStandardMaterial map={map} roughness={0.68} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------- fita (cordão, pulseira, alça de vinil)

/** Ponto da linha central da fita com o referencial dela: `side` é a largura (v), `normal` a face impressa. */
type Frame = { p: THREE.Vector3; side: THREE.Vector3; normal: THREE.Vector3; u: number };

/** Referencial em que a face impressa olha para `facing(p)` (girado de `twist` em torno da tangente). */
function frameAt(curve: THREE.Curve<THREE.Vector3>, t: number, facing: (p: THREE.Vector3) => THREE.Vector3, twist: number, u: number): Frame {
  const p = curve.getPointAt(t);
  const tangent = curve.getTangentAt(t).normalize();
  const side = new THREE.Vector3().crossVectors(facing(p), tangent);
  if (side.lengthSq() < 1e-10) side.set(1, 0, 0);
  side.normalize();
  const normal = new THREE.Vector3().crossVectors(tangent, side).normalize();
  if (twist) {
    side.applyAxisAngle(tangent, twist);
    normal.applyAxisAngle(tangent, twist);
  }
  return { p, side, normal, u };
}

/** Referenciais com a largura sempre na mesma direção (alça de vinil que passa pelo furo do crachá). */
function sideFrames(curve: THREE.Curve<THREE.Vector3>, count: number, side: THREE.Vector3): Frame[] {
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count;
    const p = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const normal = new THREE.Vector3().crossVectors(tangent, side).normalize();
    return { p, side: side.clone(), normal, u: t };
  });
}

/**
 * Referenciais com a arte repetida: cada módulo de `tile` cm recomeça em u = 0. Na emenda há dois
 * pontos na mesma posição (u = 1 e u = 0), então não precisa de RepeatWrapping na textura.
 */
function tiledFrames(curve: THREE.Curve<THREE.Vector3>, tile: number, facing: (p: THREE.Vector3) => THREE.Vector3, twist: (t: number) => number): Frame[] {
  const length = curve.getLength();
  const tiles = Math.max(1, Math.ceil(length / tile - 1e-6));
  const frames: Frame[] = [];
  for (let k = 0; k < tiles; k += 1) {
    const s0 = k * tile;
    const s1 = Math.min(length, (k + 1) * tile);
    const steps = Math.max(2, Math.round((28 * (s1 - s0)) / tile));
    for (let j = 0; j <= steps; j += 1) {
      const s = s0 + ((s1 - s0) * j) / steps;
      const t = clamp(s / length, 0, 1);
      frames.push(frameAt(curve, t, facing, twist(t), (s - s0) / tile));
    }
  }
  return frames;
}

/**
 * Fita com espessura: frente (grupo 0, u ao longo da fita, v na largura), verso (grupo 1, com u
 * espelhado para a arte ler certo por trás) e as duas bordas (grupo 2). Normais analíticas.
 */
function ribbonGeometry(frames: Frame[], width: number, thickness: number) {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const hw = width / 2;
  const ht = thickness / 2;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const n = frames.length;
  // Camadas: frente, verso, borda +side, borda -side. Cada uma tem 2 vértices por referencial.
  const layers = [0, 1, 2, 3].map((layer) => {
    const base = positions.length / 3;
    for (const f of frames) {
      if (layer === 0 || layer === 1) {
        const s = layer === 0 ? ht : -ht;
        a.copy(f.p).addScaledVector(f.side, -hw).addScaledVector(f.normal, s);
        b.copy(f.p).addScaledVector(f.side, hw).addScaledVector(f.normal, s);
        const nx = layer === 0 ? 1 : -1;
        const u = layer === 0 ? f.u : 1 - f.u;
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        normals.push(f.normal.x * nx, f.normal.y * nx, f.normal.z * nx, f.normal.x * nx, f.normal.y * nx, f.normal.z * nx);
        uvs.push(u, 0, u, 1);
      } else {
        const s = layer === 2 ? hw : -hw;
        a.copy(f.p).addScaledVector(f.side, s).addScaledVector(f.normal, ht);
        b.copy(f.p).addScaledVector(f.side, s).addScaledVector(f.normal, -ht);
        const sx = layer === 2 ? 1 : -1;
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        normals.push(f.side.x * sx, f.side.y * sx, f.side.z * sx, f.side.x * sx, f.side.y * sx, f.side.z * sx);
        uvs.push(0, 0, 0, 0);
      }
    }
    return base;
  });
  const groups: [number, number][] = [];
  layers.forEach((base, layer) => {
    const start = indices.length;
    for (let i = 0; i < n - 1; i += 1) {
      const a0 = base + i * 2;
      const b0 = a0 + 1;
      const a1 = a0 + 2;
      const b1 = a0 + 3;
      if (layer === 0) indices.push(a0, a1, b1, a0, b1, b0);
      else if (layer === 1) indices.push(a0, b1, a1, a0, b0, b1);
      else if (layer === 2) indices.push(a0, a1, b0, b0, a1, b1);
      else indices.push(a0, b0, a1, b0, b1, a1);
    }
    groups.push([start, indices.length - start]);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.addGroup(groups[0][0], groups[0][1], 0);
  geometry.addGroup(groups[1][0], groups[1][1], 1);
  geometry.addGroup(groups[2][0], groups[2][1] + groups[3][1], 2);
  return geometry;
}

/** Tubo de seção elíptica (tira do chinelo): largura em `side`, espessura voltada para `outward(p)`. */
function strapGeometry(curve: THREE.Curve<THREE.Vector3>, halfWidth: number, halfThickness: number, outward: (p: THREE.Vector3) => THREE.Vector3, segments = 48, radial = 16) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    side.crossVectors(tangent, outward(p));
    if (side.lengthSq() < 1e-10) side.set(1, 0, 0);
    side.normalize();
    up.crossVectors(side, tangent).normalize();
    for (let k = 0; k <= radial; k += 1) {
      const angle = (k / radial) * Math.PI * 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      positions.push(
        p.x + side.x * c * halfWidth + up.x * s * halfThickness,
        p.y + side.y * c * halfWidth + up.y * s * halfThickness,
        p.z + side.z * c * halfWidth + up.z * s * halfThickness,
      );
      n.copy(side).multiplyScalar(c * halfThickness).addScaledVector(up, s * halfWidth).normalize();
      normals.push(n.x, n.y, n.z);
    }
  }
  for (let i = 0; i < segments; i += 1) {
    for (let k = 0; k < radial; k += 1) {
      const a = i * (radial + 1) + k;
      const b = a + radial + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

/** Contorno compatível com THREE.Shape e com o canvas 2D. */
type PathSink = {
  moveTo(x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): unknown;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): unknown;
};

/** Leva um contorno da peça (centro na origem, y para cima, caixa w × h) para o canvas da arte (y para baixo). */
function canvasSink(ctx: CanvasRenderingContext2D, w: number, h: number, cw: number, ch: number): PathSink {
  const X = (x: number) => (x / w + 0.5) * cw;
  const Y = (y: number) => (0.5 - y / h) * ch;
  return {
    moveTo: (x, y) => ctx.moveTo(X(x), Y(y)),
    lineTo: (x, y) => ctx.lineTo(X(x), Y(y)),
    quadraticCurveTo: (a, b, x, y) => ctx.quadraticCurveTo(X(a), Y(b), X(x), Y(y)),
    bezierCurveTo: (a, b, c, d, x, y) => ctx.bezierCurveTo(X(a), Y(b), X(c), Y(d), X(x), Y(y)),
  };
}

/** Furo oblongo (rasgo do crachá) centrado em x = 0. */
function slotPath(y: number, w: number, h: number) {
  const r = h / 2;
  const path = new THREE.Path();
  path.moveTo(-w / 2 + r, y - r);
  path.lineTo(w / 2 - r, y - r);
  path.absarc(w / 2 - r, y, r, -Math.PI / 2, Math.PI / 2, false);
  path.lineTo(-w / 2 + r, y + r);
  path.absarc(-w / 2 + r, y, r, Math.PI / 2, (Math.PI * 3) / 2, false);
  return path;
}

// ---------------------------------------------------------------------------- cartão de PVC e ferragens (cm)

type PvcCardProps = {
  w: number;
  h: number;
  d: number;
  radius: number;
  spec: MockupSpec;
  front?: THREE.Texture | null;
  back?: THREE.Texture | null;
  /** Centro do rasgo (y); sem ele o cartão é liso. */
  slotY?: number;
  slotW?: number;
  slotH?: number;
  /** Furos redondos [x, y, raio] (credencial com cordão). */
  holes?: readonly (readonly [number, number, number])[];
};

/** Cartão rígido com cantos arredondados, núcleo branco, rasgo ou furos opcionais e laminação brilhante. */
function PvcCard({ w, h, d, radius, spec, front, back, slotY, slotW = 1.35, slotH = 0.32, holes }: PvcCardProps) {
  const shape = useMemo(() => {
    const s = makeShape("rect", w, h, radius);
    if (slotY !== undefined) s.holes.push(slotPath(slotY, slotW, slotH));
    for (const [x, y, r] of holes ?? []) {
      const hole = new THREE.Path();
      hole.absarc(x, y, r, 0, Math.PI * 2, true);
      s.holes.push(hole);
    }
    return s;
  }, [w, h, radius, slotY, slotW, slotH, holes]);
  const bevel = Math.min(0.025, d * 0.3);
  const body = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 16 });
    g.translate(0, 0, -d / 2);
    return g;
  }, [shape, d, bevel]);
  const face = useMemo(() => faceGeometry(shape, w, h), [shape, w, h]);
  useGeometryCleanup(body);
  useGeometryCleanup(face);
  const laminate = useMemo<MockupSpec>(() => ({ ...spec, finish: "gloss", clearcoat: 1 }), [spec]);
  const z = d / 2 + bevel + 0.008;
  return (
    <group>
      <mesh geometry={body}>
        <meshStandardMaterial color="#f3f3f1" roughness={0.35} />
      </mesh>
      <mesh geometry={face} position-z={z}>
        {front ? <PrintMaterial map={front} spec={laminate} /> : <meshPhysicalMaterial color="#fbfbfa" roughness={0.3} clearcoat={1} clearcoatRoughness={0.06} />}
      </mesh>
      <mesh geometry={face} position-z={-z} rotation-y={Math.PI}>
        {back ? <PrintMaterial map={back} spec={laminate} /> : <meshPhysicalMaterial color="#fbfbfa" roughness={0.3} clearcoat={1} clearcoatRoughness={0.06} />}
      </mesh>
    </group>
  );
}

/** Mosquetão lagosta (cm): olhal no topo (y = 0), corpo em gota; a barra de baixo (y ≈ -2,72) engata no furo. */
function LobsterClip() {
  const parts = useMemo(() => {
    const outer = new THREE.Shape();
    outer.moveTo(0, -1.05);
    outer.bezierCurveTo(0.36, -1.05, 0.62, -1.6, 0.62, -2.15);
    outer.bezierCurveTo(0.62, -2.6, 0.32, -2.82, 0, -2.82);
    outer.bezierCurveTo(-0.32, -2.82, -0.62, -2.6, -0.62, -2.15);
    outer.bezierCurveTo(-0.62, -1.6, -0.36, -1.05, 0, -1.05);
    const hole = new THREE.Path();
    hole.moveTo(0, -1.42);
    hole.bezierCurveTo(0.2, -1.42, 0.42, -1.8, 0.42, -2.15);
    hole.bezierCurveTo(0.42, -2.45, 0.22, -2.62, 0, -2.62);
    hole.bezierCurveTo(-0.22, -2.62, -0.42, -2.45, -0.42, -2.15);
    hole.bezierCurveTo(-0.42, -1.8, -0.2, -1.42, 0, -1.42);
    outer.holes.push(hole);
    const body = new THREE.ExtrudeGeometry(outer, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3, curveSegments: 20 });
    body.translate(0, 0, -0.08);
    const swivel = lathe(
      [
        [0, -1.12],
        [0.15, -1.1],
        [0.21, -0.96],
        [0.21, -0.66],
        [0.15, -0.52],
        [0, -0.5],
      ],
      24,
    );
    const eye = new THREE.TorusGeometry(0.24, 0.065, 10, 28);
    const trigger = new THREE.BoxGeometry(0.16, 0.42, 0.18);
    return { body, swivel, eye, trigger };
  }, []);
  const list = useMemo(() => [parts.body, parts.swivel, parts.eye, parts.trigger], [parts]);
  useGeometriesCleanup(list);
  return (
    <group>
      <mesh geometry={parts.eye} position-y={-0.28}>
        <Chrome />
      </mesh>
      <mesh geometry={parts.swivel}>
        <Chrome roughness={0.22} />
      </mesh>
      <mesh geometry={parts.body}>
        <Chrome />
      </mesh>
      <mesh geometry={parts.trigger} position={[0.62, -1.7, 0]} rotation-z={-0.35}>
        <Chrome roughness={0.3} />
      </mesh>
    </group>
  );
}

/** Ponteira metálica que prende as duas pontas da fita, com a argola logo abaixo (cm; centro da ponteira na origem). */
function CrimpAndRing() {
  const ring = useMemo(() => new THREE.TorusGeometry(0.5, 0.085, 12, 36), []);
  useGeometryCleanup(ring);
  return (
    <group>
      <RoundedBlock w={2.4} h={1.3} d={0.62} radius={0.22} color="#dfe2e6" metalness={1} roughness={0.2} />
      <RoundedBlock w={0.5} h={0.5} d={0.3} radius={0.1} color="#dfe2e6" metalness={1} roughness={0.22} position={[0, -1.1, 0]} />
      <mesh geometry={ring} position-y={-1.65} rotation-y={Math.PI / 2}>
        <Chrome />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------- chinelo

/** Contorno da sola direita em cm (calcanhar em y = -13, dedão do lado -x). */
const FOOT_POINTS: [number, number][] = [
  [0, -13],
  [2.6, -12.4],
  [3.7, -10.2],
  [3.7, -6.5],
  [3.6, -3],
  [4.1, 0.8],
  [4.75, 4.5],
  [4.95, 7.2],
  [4.4, 10],
  [3.0, 12.0],
  [1.0, 12.7],
  [-1.0, 13.0],
  [-3.0, 12.5],
  [-4.4, 10.8],
  [-4.95, 8],
  [-4.7, 4.8],
  [-3.6, 1.2],
  [-3.1, -2.5],
  [-3.3, -6.5],
  [-3.7, -10],
  [-2.7, -12.3],
];

/** Polígono da sola ajustado à caixa w × h (a área de arte); `mirror` gera o pé esquerdo. */
function footPolygon(w: number, h: number, mirror: boolean): THREE.Vector2[] {
  const curve = new THREE.CatmullRomCurve3(
    FOOT_POINTS.map(([x, y]) => new THREE.Vector3(x, y, 0)),
    true,
    "centripetal",
  );
  const points = curve.getSpacedPoints(180);
  points.pop();
  const box = new THREE.Box3().setFromPoints(points);
  const sx = box.max.x - box.min.x || 1;
  const sy = box.max.y - box.min.y || 1;
  const polygon = points.map((p) => new THREE.Vector2(((p.x - box.min.x) / sx - 0.5) * w * (mirror ? -1 : 1), ((p.y - box.min.y) / sy - 0.5) * h));
  return mirror ? polygon.reverse() : polygon;
}

/** Menor e maior x do contorno numa altura y. */
function widthAt(polygon: THREE.Vector2[], y: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[j];
    const b = polygon[i];
    if (a.y > y !== b.y > y) {
      const x = a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
      min = Math.min(min, x);
      max = Math.max(max, x);
    }
  }
  return Number.isFinite(min) ? [min, max] : [-1, 1];
}

/** Máscara da arte no contorno da palmilha (coordenadas da peça → canvas). */
function polygonMask(polygon: THREE.Vector2[], w: number, h: number): MaskPath {
  return (ctx, cw, ch) => {
    ctx.beginPath();
    polygon.forEach((p, i) => {
      const x = (p.x / w + 0.5) * cw;
      const y = (0.5 - p.y / h) * ch;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  };
}

const FLIP_UNIT = 2.3 / 26;
/** Alturas da sola (cm): camada de baixo, camada de cima e topo onde a palmilha impressa assenta. */
const SOLE = { lower: 0.9, lowerBevel: 0.22, upper: 0.5, upperBevel: 0.18 };
const SOLE_TOP = SOLE.lower + SOLE.lowerBevel * 2 + SOLE.upper + SOLE.upperBevel;

function flipflopParts(polygon: THREE.Vector2[], w: number, h: number, mirror: boolean) {
  const sign = mirror ? -1 : 1;
  const shape = new THREE.Shape(polygon);

  const lower = new THREE.ExtrudeGeometry(shape, { depth: SOLE.lower, bevelEnabled: true, bevelThickness: SOLE.lowerBevel, bevelSize: SOLE.lowerBevel, bevelSegments: 3, curveSegments: 1 });
  lower.translate(0, 0, SOLE.lowerBevel);
  const upper = new THREE.ExtrudeGeometry(shape, { depth: SOLE.upper, bevelEnabled: true, bevelThickness: SOLE.upperBevel, bevelSize: SOLE.upperBevel, bevelSegments: 3, curveSegments: 1 });
  upper.translate(0, 0, SOLE.lower + SOLE.lowerBevel * 2);

  // Palmilha: superfície inflada (borda arredondada) com arco, concha do calcanhar e friso dos dedos.
  const insoleHeight = 0.16;
  const insole = inflatedSurface(polygon, { height: insoleHeight, falloff: 0.55, resolution: 72, side: 1 });
  const pos = insole.attributes.position;
  const bump = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => Math.exp(-(((x - cx) / rx) ** 2) - ((y - cy) / ry) ** 2);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const edge = clamp(pos.getZ(i) / insoleHeight, 0, 1);
    const relief =
      0.32 * bump(x, y, sign * -0.24 * w, -0.08 * h, 0.17 * w, 0.13 * h) - 0.12 * bump(x, y, 0, -0.36 * h, 0.25 * w, 0.1 * h) + 0.07 * bump(x, y, sign * -0.05 * w, 0.33 * h, 0.4 * w, 0.03 * h);
    pos.setZ(i, pos.getZ(i) + relief * edge + SOLE_TOP + 0.004);
  }
  pos.needsUpdate = true;
  insole.computeVertexNormals();

  // Tiras em Y: pino entre os dedos e duas pontas presas na borda da sola, à frente do arco.
  const post = new THREE.Vector3(sign * -0.13 * w, 0.25 * h, SOLE_TOP + 1.25);
  const anchorY = -0.06 * h;
  const [minX, maxX] = widthAt(polygon, anchorY);
  const medial = new THREE.Vector3(mirror ? maxX - 0.9 : minX + 0.9, anchorY, SOLE_TOP - 0.15);
  const lateral = new THREE.Vector3(mirror ? minX + 0.9 : maxX - 0.9, anchorY, SOLE_TOP - 0.15);
  const centerX = (minX + maxX) / 2;
  const outward = (p: THREE.Vector3) => new THREE.Vector3(p.x - centerX, 0, p.z - 1).normalize();
  const strapCurve = (anchor: THREE.Vector3, rise: number) => {
    const mid = (k: number, lift: number, spread: number) => {
      const p = post.clone().lerp(anchor, k);
      p.z += lift;
      p.x += (anchor.x - centerX) * spread;
      return p;
    };
    return new THREE.CatmullRomCurve3([post.clone(), mid(0.3, rise, 0), mid(0.68, rise * 0.95, 0.06), mid(0.9, 0.7, 0.04), anchor.clone()], false, "centripetal");
  };
  const straps = [strapCurve(medial, 1.45), strapCurve(lateral, 1.75)].map((curve) => strapGeometry(curve, 0.68, 0.24, outward));
  const pin = lathe(
    [
      [0, SOLE_TOP - 0.1],
      [0.34, SOLE_TOP - 0.1],
      [0.3, SOLE_TOP + 0.4],
      [0.33, SOLE_TOP + 0.9],
      [0.42, SOLE_TOP + 1.15],
      [0, SOLE_TOP + 1.2],
    ],
    24,
  );
  pin.rotateX(Math.PI / 2);
  pin.translate(post.x, post.y, 0);
  return { lower, upper, insole, straps, pin, post };
}

function Flipflop({ polygon, w, h, mirror, texture, bump, sole, tread, strap }: { polygon: THREE.Vector2[]; w: number; h: number; mirror: boolean; texture: THREE.Texture; bump: THREE.Texture; sole: string; tread: string; strap: string }) {
  const parts = useMemo(() => flipflopParts(polygon, w, h, mirror), [polygon, w, h, mirror]);
  const list = useMemo(() => [parts.lower, parts.upper, parts.insole, parts.pin, ...parts.straps], [parts]);
  useGeometriesCleanup(list);
  return (
    <group>
      <mesh geometry={parts.lower}>
        <meshStandardMaterial attach="material-0" color={tread} roughness={0.95} bumpMap={bump} bumpScale={1.5} />
        <meshStandardMaterial attach="material-1" color={sole} roughness={0.82} />
      </mesh>
      <mesh geometry={parts.upper}>
        <meshStandardMaterial attach="material-0" color="#fafaf8" roughness={0.8} />
        <meshStandardMaterial attach="material-1" color="#fafaf8" roughness={0.8} />
      </mesh>
      <mesh geometry={parts.insole}>
        <meshStandardMaterial map={texture} roughness={0.62} bumpMap={bump} bumpScale={0.6} transparent alphaTest={0.5} />
      </mesh>
      <mesh geometry={parts.pin}>
        <meshPhysicalMaterial color={strap} roughness={0.4} clearcoat={0.4} />
      </mesh>
      <mesh position={parts.post.toArray()} scale={[0.62, 0.78, 0.42]}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshPhysicalMaterial color={strap} roughness={0.4} clearcoat={0.4} />
      </mesh>
      {parts.straps.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshPhysicalMaterial color={strap} roughness={0.38} clearcoat={0.45} clearcoatRoughness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Chinelo: par em 3/4 visto de cima. Sola de borracha em duas camadas extrudadas com bisel (vinco entre elas),
 * palmilha sublimada como superfície inflada com relevo anatômico e a arte recortada pelo contorno do pé
 * (máscara no canvas). O pé esquerdo é o contorno espelhado com UV próprio, então a arte não espelha.
 * Tiras em Y como tubos elípticos com pino entre os dedos. Com uma região escolhida (art.region: dedos,
 * meio ou calcanhar), o paintArt pinta a arte só nessa faixa da palmilha e o resto fica na cor da peça.
 */
export function FlipflopModel({ spec, art, label }: ModelProps) {
  // Mesma medida da área do editor 2D (artArea): largura 6–14 cm, comprimento 16–32 cm.
  const { widthCm: w, heightCm: h } = flipflopSize(spec);
  const right = useMemo(() => footPolygon(w, h, false), [w, h]);
  const left = useMemo(() => footPolygon(w, h, true), [w, h]);
  const rightMask = useMemo(() => polygonMask(right, w, h), [right, w, h]);
  const leftMask = useMemo(() => polygonMask(left, w, h), [left, w, h]);
  const rightArt = useArtTexture(w / h, "front", art, label, rightMask);
  const leftArt = useArtTexture(w / h, "front", art, label, leftMask);
  const bump = useBumpTexture("grain", w / 3, h / 3);
  const lowerColor = isLight(spec.baseColor) ? "#e6e6e2" : spec.baseColor;
  const tread = shade(lowerColor, 0.8);
  const strap = spec.accentColor ?? (isLight(spec.baseColor) ? "#1d1d1f" : spec.baseColor);
  const unit = FLIP_UNIT * (26 / h);
  const gap = w * 0.66;
  return (
    <group userData={{ view: { elevation: 0.82 } }}>
      <group scale={unit}>
        <group position={[gap, 0, 0.6]} rotation-y={-0.12}>
          <group rotation-x={-Math.PI / 2}>
            <Flipflop polygon={right} w={w} h={h} mirror={false} texture={rightArt} bump={bump} sole={lowerColor} tread={tread} strap={strap} />
          </group>
        </group>
        <group position={[-gap, 0, -1.6]} rotation-y={0.16}>
          <group rotation-x={-Math.PI / 2}>
            <Flipflop polygon={left} w={w} h={h} mirror texture={leftArt} bump={bump} sole={lowerColor} tread={tread} strap={strap} />
          </group>
        </group>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- caneta

const PEN_UNIT = 2.6 / 14;

/** Perfis (raio, altura) em cm da caneta esferográfica de 14 cm, da ponta (y = 0) ao botão. */
const PEN_PROFILES: Record<"tip" | "grip" | "ring1" | "barrel" | "ring2" | "cap" | "button", Pt[]> = {
  tip: [
    [0, 0],
    [0.03, 0.005],
    [0.045, 0.05],
    [0.06, 0.12],
    [0.1, 0.2],
    [0.32, 1.55],
    [0.37, 1.75],
    [0.4, 1.85],
    [0.4, 2.0],
    [0, 2.0],
  ],
  grip: [
    [0, 1.98],
    [0.41, 1.98],
    [0.44, 2.06],
    ...Array.from({ length: 10 }, (_, i): Pt => [i % 2 ? 0.425 : 0.445, 2.18 + i * 0.23]),
    [0.44, 4.5],
    [0.42, 4.6],
    [0, 4.6],
  ],
  ring1: [
    [0, 4.58],
    [0.44, 4.58],
    [0.47, 4.62],
    [0.47, 4.73],
    [0.45, 4.77],
    [0, 4.77],
  ],
  barrel: [
    [0, 4.75],
    [0.47, 4.75],
    [0.5, 4.82],
    [0.5, 11.6],
    [0.49, 12.4],
    [0.48, 12.5],
    [0, 12.5],
  ],
  ring2: [
    [0, 12.48],
    [0.48, 12.48],
    [0.5, 12.53],
    [0.5, 12.68],
    [0.47, 12.72],
    [0, 12.72],
  ],
  cap: [
    [0, 12.7],
    [0.46, 12.7],
    [0.46, 13.2],
    [0.42, 13.42],
    [0.32, 13.5],
    [0, 13.5],
  ],
  button: [
    [0, 13.45],
    [0.2, 13.45],
    [0.22, 13.8],
    [0.19, 13.95],
    [0.1, 14.0],
    [0, 14.0],
  ],
};

/** Clipe de bolso visto de lado (x = distância do eixo, y = altura), extrudado na largura. */
function clipGeometry(r: number, bottom: number, top: number, width: number) {
  const s = new THREE.Shape();
  s.moveTo(r - 0.2, top);
  s.lineTo(r + 0.12, top);
  s.quadraticCurveTo(r + 0.26, top - 0.05, r + 0.26, top - 0.25);
  s.lineTo(r + 0.2, bottom + 0.45);
  s.quadraticCurveTo(r + 0.18, bottom + 0.05, r + 0.05, bottom);
  s.quadraticCurveTo(r - 0.01, bottom - 0.01, r, bottom + 0.1);
  s.lineTo(r + 0.1, bottom + 0.45);
  s.lineTo(r + 0.14, top - 0.4);
  s.quadraticCurveTo(r + 0.14, top - 0.2, r, top - 0.2);
  s.lineTo(r - 0.2, top - 0.2);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -width / 2);
  // O perfil foi desenhado no lado +x; o clipe fica no lado -x (para cima depois de deitar a caneta).
  g.rotateY(Math.PI);
  return g;
}

/**
 * Faixa de impressão ao longo do eixo de um cilindro: u segue o comprimento (+y), v contorna o tambor
 * (θ decrescente), centrada em θ = 0 (+z). Assim a arte lê da ponta para o botão quando a caneta deita em +x.
 */
function axialBandGeometry(radius: number, y0: number, length: number, arc: number, segU = 48, segV = 16) {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= segV; j += 1) {
    const v = j / segV;
    const theta = arc / 2 - arc * v;
    for (let i = 0; i <= segU; i += 1) {
      const u = i / segU;
      positions.push(radius * Math.sin(theta), y0 + length * u, radius * Math.cos(theta));
      normals.push(Math.sin(theta), 0, Math.cos(theta));
      uvs.push(u, v);
    }
  }
  for (let j = 0; j < segV; j += 1) {
    for (let i = 0; i < segU; i += 1) {
      const a = j * (segU + 1) + i;
      const b = a + 1;
      const c = a + segU + 1;
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

type PenGeometries = Record<keyof typeof PEN_PROFILES, THREE.BufferGeometry> & { clip: THREE.BufferGeometry; band: THREE.BufferGeometry };

function Ballpoint({ geometries, color, map }: { geometries: PenGeometries; color: string; map: THREE.Texture }) {
  const grip = isLight(color) ? "#3a3a3d" : shade(color, 0.55);
  return (
    <group position-y={-7}>
      <mesh geometry={geometries.tip}>
        <Chrome />
      </mesh>
      <mesh geometry={geometries.grip}>
        <meshStandardMaterial color={grip} roughness={0.88} />
      </mesh>
      <mesh geometry={geometries.ring1}>
        <Chrome />
      </mesh>
      <mesh geometry={geometries.barrel}>
        <meshPhysicalMaterial color={color} roughness={0.3} clearcoat={0.8} clearcoatRoughness={0.08} />
      </mesh>
      <PrintBand geometry={geometries.band} map={map} />
      <mesh geometry={geometries.ring2}>
        <Chrome />
      </mesh>
      <mesh geometry={geometries.cap}>
        <meshPhysicalMaterial color={color} roughness={0.3} clearcoat={0.8} clearcoatRoughness={0.08} />
      </mesh>
      <mesh geometry={geometries.button}>
        <Chrome roughness={0.2} />
      </mesh>
      <mesh geometry={geometries.clip}>
        <Chrome roughness={0.14} />
      </mesh>
    </group>
  );
}

/** Caneta deitada: eixo do torno (y) vira +x; `roll` gira em torno do eixo para a arte encarar a câmera. */
function LyingPen({ position, yaw, roll, children }: { position: V3; yaw: number; roll: number; children: ReactNode }) {
  return (
    <group position={position} rotation={[0, yaw, -Math.PI / 2]}>
      <group rotation-y={roll}>{children}</group>
    </group>
  );
}

function BallpointPens({ spec, art, label }: ModelProps) {
  const printW = clamp(spec.widthCm, 2, 7);
  const printH = clamp(spec.heightCm, 0.4, 1.4);
  const map = useArtTexture(printW / printH, "front", art, label);
  const geometries = useMemo<PenGeometries>(() => {
    const radius = 0.51;
    const start = Math.max(4.85, 7.4 - printW / 2);
    return {
      tip: lathe(PEN_PROFILES.tip, 48),
      grip: lathe(PEN_PROFILES.grip, 48),
      ring1: lathe(PEN_PROFILES.ring1, 48),
      barrel: lathe(PEN_PROFILES.barrel, 64),
      ring2: lathe(PEN_PROFILES.ring2, 48),
      cap: lathe(PEN_PROFILES.cap, 48),
      button: lathe(PEN_PROFILES.button, 32),
      clip: clipGeometry(0.46, 9.8, 13.35, 0.55),
      band: axialBandGeometry(radius, start, printW, Math.min(printH / radius, Math.PI * 0.9)),
    };
  }, [printW, printH]);
  const list = useMemo(() => Object.values(geometries), [geometries]);
  useGeometriesCleanup(list);
  const radius = 0.5;
  return (
    <group userData={{ view: { elevation: 0.3 } }}>
      <group scale={PEN_UNIT}>
        <LyingPen position={[0, radius, 1.4]} yaw={-0.12} roll={-0.3}>
          <Ballpoint geometries={geometries} color={spec.baseColor} map={map} />
        </LyingPen>
        <LyingPen position={[0.8, radius, -3]} yaw={Math.PI + 0.3} roll={-0.3}>
          <Ballpoint geometries={geometries} color={spec.baseColor} map={map} />
        </LyingPen>
      </group>
    </group>
  );
}

/**
 * Perfis (raio, altura) em cm da caneta plástica de clique de 14 cm (fotos da 229), da ponta (y = 0) ao botão: ponteira
 * cônica branca com a esfera de metal, empunhadura colorida, corpo branco, topo afinando e botão colorido.
 */
const PLASTIC_PEN: Record<"ball" | "tip" | "grip" | "barrel" | "button", Pt[]> = {
  ball: [
    [0, 0],
    [0.035, 0.01],
    [0.05, 0.06],
    [0.06, 0.16],
    [0, 0.16],
  ],
  tip: [
    [0, 0.12],
    [0.07, 0.12],
    [0.12, 0.3],
    [0.3, 1.2],
    [0.4, 1.75],
    [0.43, 1.95],
    [0, 1.95],
  ],
  grip: [
    [0, 1.92],
    [0.43, 1.92],
    [0.46, 2.0],
    [0.47, 4.45],
    [0.45, 4.55],
    [0, 4.55],
  ],
  barrel: [
    [0, 4.5],
    [0.45, 4.5],
    [0.49, 4.62],
    [0.5, 11.9],
    [0.48, 12.6],
    [0.41, 13.15],
    [0.36, 13.25],
    [0, 13.25],
  ],
  button: [
    [0, 13.0],
    [0.27, 13.0],
    [0.29, 13.9],
    [0.26, 14.08],
    [0.16, 14.15],
    [0, 14.15],
  ],
};

/** Empunhadura emborrachada: anéis finos ao longo do grip (relevo). */
function rubberGripProfile(): Pt[] {
  const rings = 16;
  const pts: Pt[] = [
    [0, 1.92],
    [0.43, 1.92],
    [0.46, 2.0],
  ];
  for (let i = 0; i <= rings; i += 1) pts.push([i % 2 ? 0.455 : 0.475, 2.08 + (i * 2.3) / rings]);
  pts.push([0.45, 4.55], [0, 4.55]);
  return pts;
}

/**
 * Clipe plástico largo, visto de frente (x = largura, y = comprimento), com a janela vazada perto do topo e a ponta
 * arredondada; extrudado na espessura e virado para encostar no corpo (normal −x depois do giro).
 */
function plasticClipGeometry(width: number, length: number, thickness: number) {
  const shape = makeShape("rect", width, length, width * 0.42);
  const hole = new THREE.Path();
  const hw = width * 0.26;
  const top = length / 2 - 0.55;
  hole.moveTo(-hw, top);
  hole.lineTo(-hw, top - 1.05);
  hole.quadraticCurveTo(-hw, top - 1.2, -hw + 0.12, top - 1.2);
  hole.lineTo(hw - 0.12, top - 1.2);
  hole.quadraticCurveTo(hw, top - 1.2, hw, top - 1.05);
  hole.lineTo(hw, top);
  hole.lineTo(-hw, top);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -thickness / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

type PlasticPenGeometries = Record<keyof typeof PLASTIC_PEN, THREE.BufferGeometry> & { rubber: THREE.BufferGeometry; clip: THREE.BufferGeometry; bridge: THREE.BufferGeometry; band: THREE.BufferGeometry };

/** Plástico injetado brilhante da caneta (branco do corpo e cor dos detalhes). */
function PenPlastic({ color, roughness = 0.3 }: { color: string; roughness?: number }) {
  return <meshPhysicalMaterial color={color} roughness={roughness} clearcoat={0.5} clearcoatRoughness={0.15} />;
}

function PlasticPen({ geometries, accent, rubber, map }: { geometries: PlasticPenGeometries; accent: string; rubber: boolean; map: THREE.Texture }) {
  const white = "#f6f6f3";
  return (
    <group position-y={-7}>
      <mesh geometry={geometries.ball}>
        <Chrome roughness={0.2} />
      </mesh>
      <mesh geometry={geometries.tip}>
        <PenPlastic color={white} />
      </mesh>
      <mesh geometry={rubber ? geometries.rubber : geometries.grip}>
        <PenPlastic color={accent} roughness={rubber ? 0.78 : 0.28} />
      </mesh>
      <mesh geometry={geometries.barrel}>
        <PenPlastic color={white} />
      </mesh>
      <mesh geometry={geometries.button}>
        <PenPlastic color={accent} roughness={0.32} />
      </mesh>
      {/* Clipe branco do lado −x (para cima com a caneta deitada), preso no topo por uma ponte. */}
      <mesh geometry={geometries.clip} position={[-0.64, 10.65, 0]}>
        <PenPlastic color={white} roughness={0.34} />
      </mesh>
      <mesh geometry={geometries.bridge} position={[-0.5, 12.75, 0]}>
        <PenPlastic color={white} roughness={0.34} />
      </mesh>
      <mesh geometry={geometries.band}>
        <meshPhysicalMaterial map={map} roughness={0.3} clearcoat={0.5} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
    </group>
  );
}

/**
 * Caneta plástica (229): branca, com botão e empunhadura na cor escolhida (emborrachada no modelo "Emborrachada
 * Parcial", plástico liso no "Sem Emborrachamento"), clipe branco vazado e a impressão U.V. no corpo, lendo ao longo
 * da caneta. Duas canetas deitadas, uma mostrando a arte e a outra o clipe.
 */
function PlasticPens({ spec, art, label }: ModelProps) {
  const printW = clamp(spec.widthCm, 2, 7);
  const printH = clamp(spec.heightCm, 0.4, 1.4);
  // A U.V. imprime só o desenho: a imagem enviada sai sem fundo, sobre o branco do corpo.
  const decal = useMemo(() => (art.src ? { ...art, background: "rgba(0,0,0,0)" } : art), [art]);
  const map = useArtTexture(printW / printH, "front", decal, label);
  const geometries = useMemo<PlasticPenGeometries>(() => {
    const radius = 0.503;
    const start = Math.max(4.9, 8.2 - printW / 2);
    const bridge = new THREE.BoxGeometry(0.32, 0.5, 0.5);
    return {
      ball: lathe(PLASTIC_PEN.ball, 24),
      tip: lathe(PLASTIC_PEN.tip, 48),
      grip: lathe(PLASTIC_PEN.grip, 48),
      rubber: lathe(rubberGripProfile(), 48),
      barrel: lathe(PLASTIC_PEN.barrel, 64),
      button: lathe(PLASTIC_PEN.button, 32),
      clip: plasticClipGeometry(0.62, 4.6, 0.14),
      bridge,
      band: axialBandGeometry(radius, start, printW, Math.min(printH / radius, Math.PI * 0.9)),
    };
  }, [printW, printH]);
  const list = useMemo(() => Object.values(geometries), [geometries]);
  useGeometriesCleanup(list);
  const rubber = /emborrachad/.test(spec.details ?? "") && !/\bsem emborrachamento\b/.test(spec.details ?? "");
  const accent = spec.baseColor;
  const radius = 0.5;
  return (
    <group userData={{ view: { elevation: 0.3 } }}>
      <group scale={PEN_UNIT}>
        <LyingPen position={[0, radius, 1.4]} yaw={-0.12} roll={-0.3}>
          <PlasticPen geometries={geometries} accent={accent} rubber={rubber} map={map} />
        </LyingPen>
        <LyingPen position={[0.8, radius, -3]} yaw={Math.PI + 0.3} roll={-0.3}>
          <PlasticPen geometries={geometries} accent={accent} rubber={rubber} map={map} />
        </LyingPen>
      </group>
    </group>
  );
}

/** Perfis em cm do marcador para porcelana (ponta de feltro em y = 0, tampa encaixada atrás). */
const MARKER_PROFILES: Record<"nib" | "holder" | "barrel" | "band" | "cap", Pt[]> = {
  nib: [
    [0, 0],
    [0.08, 0.02],
    [0.16, 0.12],
    [0.2, 0.35],
    [0.2, 0.62],
    [0, 0.62],
  ],
  holder: [
    [0, 0.55],
    [0.22, 0.55],
    [0.3, 0.75],
    [0.5, 1.3],
    [0.55, 1.5],
    [0, 1.5],
  ],
  barrel: [
    [0, 1.45],
    [0.58, 1.45],
    [0.6, 1.6],
    [0.6, 11.4],
    [0.58, 11.5],
    [0, 11.5],
  ],
  band: [
    [0, 2.2],
    [0.612, 2.2],
    [0.612, 3.1],
    [0, 3.1],
  ],
  cap: [
    [0, 10.0],
    [0.62, 10.0],
    [0.67, 10.1],
    [0.67, 14.4],
    [0.6, 14.65],
    [0.4, 14.75],
    [0, 14.75],
  ],
};

/** Perfil (raio, altura) em cm de um prato de sobremesa de 19 cm, da base para o topo (normais para fora). */
const PLATE_PROFILE: Pt[] = [
  [0, 0.32],
  [3.9, 0.32],
  [4.05, 0.05],
  [4.15, 0],
  [4.45, 0],
  [4.6, 0.1],
  [4.75, 0.4],
  [6.6, 0.58],
  [8.6, 1.2],
  [9.3, 1.45],
  [9.5, 1.62],
  [9.42, 1.76],
  [9.2, 1.8],
  [8.6, 1.62],
  [6.6, 1.0],
  [5.7, 0.8],
  [0, 0.78],
];

/** Inclinação do prato no cavalete (rad para trás da vertical). */
const PLATE_RECLINE = 0.24;

function PorcelainPen({ spec, art, label }: ModelProps) {
  const disc = useArtTexture(1, "front", art, label);
  const wood = useWoodTexture();
  const geometries = useMemo(
    () => ({
      nib: lathe(MARKER_PROFILES.nib, 32),
      holder: lathe(MARKER_PROFILES.holder, 40),
      barrel: lathe(MARKER_PROFILES.barrel, 56),
      band: lathe(MARKER_PROFILES.band, 56),
      cap: lathe(MARKER_PROFILES.cap, 56),
      clip: clipGeometry(0.64, 11.2, 14.45, 0.6),
      plate: lathe(PLATE_PROFILE, 96),
      art: new THREE.CircleGeometry(5.45, 72),
    }),
    [],
  );
  const list = useMemo(() => Object.values(geometries), [geometries]);
  useGeometriesCleanup(list);
  const ink = spec.baseColor;
  // Prato apoiado no suporte: a borda de baixo assenta na base, atrás do batente, e o pé encosta no espaldar.
  const alpha = Math.PI / 2 - PLATE_RECLINE;
  const rimDrop = 9.5 * Math.sin(alpha) - 1.62 * Math.cos(alpha);
  const rimForward = 9.5 * Math.cos(alpha) + 1.62 * Math.sin(alpha);
  const baseTop = 1.2;
  const plateCenter: V3 = [0, rimDrop + baseTop, -rimForward];
  return (
    <group userData={{ view: { elevation: 0.16 } }}>
      <group scale={PEN_UNIT}>
        {/* Suporte de madeira: base com batente na frente; o espaldar fica escondido atrás do prato. */}
        <WoodBlock size={[11, baseTop, 4.2]} map={wood} radius={0.3} position={[0, baseTop / 2, -0.8]} />
        <WoodBlock size={[11, 0.7, 0.6]} map={wood} radius={0.2} position={[0, baseTop + 0.35, 0.65]} />
        <group position={plateCenter} rotation-x={alpha}>
          {/* Espaldar paralelo ao prato, encostado no pé e encaixado na base. */}
          <WoodBlock size={[2.2, 0.6, 12.3]} map={wood} radius={0.2} position={[0, -0.32, 3.15]} />
          <mesh geometry={geometries.plate}>
            <meshPhysicalMaterial color="#fbfbf8" roughness={0.12} clearcoat={1} clearcoatRoughness={0.04} />
          </mesh>
          {/* Arte "pintada à mão" no fundo do prato, sob o vidrado. */}
          <mesh geometry={geometries.art} position-y={0.79} rotation-x={-Math.PI / 2}>
            <meshPhysicalMaterial map={disc} roughness={0.2} clearcoat={1} clearcoatRoughness={0.05} polygonOffset polygonOffsetFactor={-2} />
          </mesh>
        </group>
        {/* Marcador destampado (tampa encaixada atrás), deitado na frente do cavalete. */}
        <LyingPen position={[1.5, 0.67, 4.6]} yaw={0.32} roll={-0.4}>
          <group position-y={-7.4}>
            <mesh geometry={geometries.nib}>
              <meshStandardMaterial color={ink} roughness={0.7} />
            </mesh>
            <mesh geometry={geometries.holder}>
              <meshStandardMaterial color="#d9d9d6" roughness={0.45} />
            </mesh>
            <mesh geometry={geometries.barrel}>
              <meshPhysicalMaterial color="#202022" roughness={0.42} clearcoat={0.5} />
            </mesh>
            <mesh geometry={geometries.band}>
              <meshPhysicalMaterial color={ink} roughness={0.3} clearcoat={0.8} />
            </mesh>
            <mesh geometry={geometries.cap}>
              <meshPhysicalMaterial color={ink} roughness={0.3} clearcoat={0.8} clearcoatRoughness={0.08} />
            </mesh>
            <mesh geometry={geometries.clip}>
              <meshPhysicalMaterial color={ink} roughness={0.3} clearcoat={0.8} />
            </mesh>
          </group>
        </LyingPen>
      </group>
    </group>
  );
}

/**
 * Caneta: plástica branca de clique com detalhes coloridos (padrão, PlasticPens). {touch}: esferográfica metálica
 * de 14 cm em torno (ponteira cromada, grip emborrachado, corpo brilhante, clipe extrudado e botão), com a faixa
 * de impressão de 5 × 1 cm contornando o tambor de frente para a câmera; duas canetas deitadas em diagonal.
 * {porcelain}: marcador para porcelana com tampa encaixada, ao lado de um prato num cavalete de madeira
 * com a arte desenhada no fundo.
 */
export function PenModel(props: ModelProps) {
  if (props.spec.variant === "porcelain") return <PorcelainPen {...props} />;
  if (props.spec.variant === "touch") return <BallpointPens {...props} />;
  return <PlasticPens {...props} />;
}

// ---------------------------------------------------------------------------- ventarola

const FAN_UNIT = 2.4 / 24.6;
/** Espessura do papel 300 g (cm). */
const FAN_PAPER = 0.045;
const BEZIER_CIRCLE = 0.5523;

/** Contorno da pá na caixa w × h: elipse, coração ou (padrão) triângulo arredondado com a pega embaixo. */
function fanOutline(sink: PathSink, w: number, h: number, shape: MockupSpec["shape"]) {
  const x = w / 2;
  const y = h / 2;
  if (shape === "round") {
    const kx = x * BEZIER_CIRCLE;
    const ky = y * BEZIER_CIRCLE;
    sink.moveTo(0, -y);
    sink.bezierCurveTo(kx, -y, x, -ky, x, 0);
    sink.bezierCurveTo(x, ky, kx, y, 0, y);
    sink.bezierCurveTo(-kx, y, -x, ky, -x, 0);
    sink.bezierCurveTo(-x, -ky, -kx, -y, 0, -y);
    return;
  }
  if (shape === "heart") {
    // Mesmo coração do makeShape, reescalado para encostar nas quatro bordas da área de arte
    // (as curvas originais ocupam 75,8% × 78,1% da caixa, com o centro 5,9% abaixo).
    const hw = w / 0.7578;
    const hh = h / 0.7813;
    const px = (u: number) => (u - 0.5) * hw;
    const py = (v: number) => (v - 0.5 + 0.0594) * hh;
    sink.moveTo(px(0.5), py(0.05));
    sink.bezierCurveTo(px(-0.1), py(0.45), px(0.1), py(1.05), px(0.5), py(0.75));
    sink.bezierCurveTo(px(0.9), py(1.05), px(1.1), py(0.45), px(0.5), py(0.05));
    return;
  }
  // Padrão (fotos da 178): triângulo arredondado de ponta para baixo, como uma palheta. A ponta é a pega; o topo é
  // quase reto, com cantos de raio grande, e os lados descem retos até a ponta boleada.
  sink.moveTo(0, -y);
  sink.bezierCurveTo(w * 0.075, -y, w * 0.13, -h * 0.455, w * 0.18, -h * 0.385);
  // Tudo dentro da caixa w × h: a pá (plano w × h) e a borda seguem o mesmo contorno.
  sink.lineTo(w * 0.44, h * 0.08);
  sink.bezierCurveTo(w * 0.5, h * 0.2, x, h * 0.44, w * 0.31, h * 0.485);
  sink.bezierCurveTo(w * 0.12, y, -w * 0.12, y, -w * 0.31, h * 0.485);
  sink.bezierCurveTo(-x, h * 0.44, -w * 0.5, h * 0.2, -w * 0.44, h * 0.08);
  sink.lineTo(-w * 0.18, -h * 0.385);
  sink.bezierCurveTo(-w * 0.13, -h * 0.455, -w * 0.075, -y, 0, -y);
}

/** Pá dobrada em arco (as laterais recuam), como o papel de 300 g se curva na mão. */
function bentPlane(w: number, h: number, bendAt: (x: number) => number, z: number, flip: boolean) {
  const g = new THREE.PlaneGeometry(w, h, 64, 52);
  if (flip) g.rotateY(Math.PI);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i += 1) pos.setZ(i, bendAt(pos.getX(i)) + z);
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** Borda do papel: parede fina ao longo do contorno, acompanhando a curvatura. */
function edgeWall(points: THREE.Vector2[], d: number, bendAt: (x: number) => number) {
  const positions: number[] = [];
  const indices: number[] = [];
  points.forEach((p) => {
    const z = bendAt(p.x);
    positions.push(p.x, p.y, z + d / 2, p.x, p.y, z - d / 2);
  });
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const a = i * 2;
    const b = ((i + 1) % n) * 2;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/**
 * Ventarola (178): leque de papel recortado em triângulo arredondado (a ponta de baixo é a pega), impresso frente e
 * verso e curvado em arco como o papel de 300 g na mão; arte recortada pelo contorno com máscara no canvas. Sem
 * palito nem base, como o produto. Elipse e coração ficam para os formatos com essas palavras. Cotas na pá.
 */
export function FanModel({ spec, art, label, showDims }: ModelProps) {
  const w = clamp(spec.widthCm, 8, 40);
  const h = clamp(spec.heightCm, 8, 40);
  const shape = spec.shape;
  const bend = w * 0.06;
  const bendAt = useMemo(() => (x: number) => -bend * ((2 * x) / w) ** 2, [bend, w]);
  const mask = useMemo<MaskPath>(
    () => (ctx, cw, ch) => {
      ctx.beginPath();
      fanOutline(canvasSink(ctx, w, h, cw, ch), w, h, shape);
      ctx.closePath();
    },
    [w, h, shape],
  );
  const front = useArtTexture(artAspect({ widthCm: w, heightCm: h }), "front", art, label, mask);
  const back = useBackTexture(artAspect({ widthCm: w, heightCm: h }), spec, art, label, mask);

  const geometries = useMemo(() => {
    const outline = new THREE.Shape();
    fanOutline(outline, w, h, shape);
    return {
      front: bentPlane(w, h, bendAt, FAN_PAPER / 2, false),
      back: bentPlane(w, h, bendAt, -FAN_PAPER / 2, true),
      edge: edgeWall(outline.getSpacedPoints(220).slice(0, -1), FAN_PAPER, bendAt),
    };
  }, [w, h, shape, bendAt]);
  const list = useMemo(() => Object.values(geometries), [geometries]);
  useGeometriesCleanup(list);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation-y={-0.32}>
      <group scale={FAN_UNIT}>
        <mesh geometry={geometries.front}>
          <PrintMaterial map={front} spec={spec} transparent />
        </mesh>
        <mesh geometry={geometries.back}>
          <PrintMaterial map={back} spec={spec} transparent />
        </mesh>
        <mesh geometry={geometries.edge}>
          <meshStandardMaterial color="#f6f5f1" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {showDims && KIND_INFO[spec.kind].dims && <Dimensions w={w * FAN_UNIT} h={h * FAN_UNIT} z={0.04} labelW={lw} labelH={lh} />}
    </group>
  );
}

// ---------------------------------------------------------------------------- cordão de crachá

/** Linha central do cordão (cm): sobe pela esquerda, contorna um pescoço invisível por trás e desce pela direita. */
const LANYARD_LEFT: V3[] = [
  [-0.3, -28, 0.95],
  [-1.5, -23.5, 1.5],
  [-3.5, -15.5, 2.1],
  [-5.6, -6.5, 1.9],
  [-6.9, 0, 0.3],
  [-6.7, 3.4, -3.6],
  [-4.5, 4.8, -8.6],
];
const LANYARD_NECK_Z = -4.5;
const LANYARD_CARD = { w: 5.4, h: 8.6, d: 0.076 };

function lanyardCurve(length: number) {
  const right = LANYARD_LEFT.map(([x, y, z]): V3 => [-x, y, z]).reverse();
  right[right.length - 1] = [0.3, -28, 0.7];
  const curve = new THREE.CatmullRomCurve3([...LANYARD_LEFT, [0, 5.4, -10.6] as V3, ...right].map(vec), false, "centripetal");
  curve.arcLengthDivisions = 600;
  // A curva base mede ≈ 90 cm; outras medidas esticam só a descida das fitas.
  const stretch = length / 90;
  if (Math.abs(stretch - 1) > 0.01) {
    curve.points.forEach((p) => {
      if (p.y < 0) p.y *= stretch;
    });
    curve.updateArcLengths();
  }
  return curve;
}

/**
 * Cordão de crachá: fita de cetim de poliéster com espessura (frente, verso e bordas) seguindo uma
 * CatmullRom em V em volta de um pescoço invisível, levemente torcida. A arte (módulo 8:1) se repete
 * ao longo da fita — cada módulo recomeça o u, sem esticar. Embaixo, ponteira metálica, argola,
 * mosquetão lagosta e um crachá de PVC em branco.
 */
export function LanyardModel({ spec, art, label }: ModelProps) {
  const strapW = clamp(Math.min(spec.widthCm, spec.heightCm), 1, 4);
  const length = clamp(Math.max(spec.widthCm, spec.heightCm), 50, 130);
  const texture = useArtTexture(8, "front", art, label);
  const geometry = useMemo(() => {
    const curve = lanyardCurve(length);
    const facing = (p: THREE.Vector3) => new THREE.Vector3(p.x, 0, p.z - LANYARD_NECK_Z);
    const twist = (t: number) => 0.22 * Math.sin(t * Math.PI * 5) * Math.sin(t * Math.PI);
    return ribbonGeometry(tiledFrames(curve, strapW * 8, facing, twist), strapW, 0.1);
  }, [strapW, length]);
  useGeometryCleanup(geometry);
  const bottom = -28 * (length / 90);
  const crimpY = bottom - 0.55;
  const lobsterY = crimpY - 1.95;
  const card = LANYARD_CARD;
  const slotY = card.h / 2 - 0.6;
  const cardY = lobsterY - 2.72 - slotY;
  const unit = 2.8 / (5.4 - (cardY - card.h / 2));
  return (
    <group scale={unit}>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial attach="material-0" map={texture} roughness={0.42} sheen={0.7} sheenRoughness={0.35} sheenColor="#ffffff" />
        <meshPhysicalMaterial attach="material-1" map={texture} roughness={0.42} sheen={0.7} sheenRoughness={0.35} sheenColor="#ffffff" />
        <meshStandardMaterial attach="material-2" color={art.background} roughness={0.6} />
      </mesh>
      <group position={[0, crimpY, 0.82]}>
        <CrimpAndRing />
      </group>
      <group position={[0, lobsterY, 0.82]} rotation-y={1.0}>
        <LobsterClip />
      </group>
      <group position={[0, cardY, 0.82]} rotation-y={-0.18}>
        <PvcCard w={card.w} h={card.h} d={card.d} radius={0.35} spec={spec} slotY={slotY} />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- crachá e credencial

/** Jacaré (cm) acima do rasgo: alça de vinil cristal que passa pelo furo, botão de pressão e clipe metálico. */
function JacareClip({ slotY, d }: { slotY: number; d: number }) {
  const parts = useMemo(() => {
    const layer = d / 2 + 0.05;
    const top = slotY + 3.0;
    const path: V3[] = [
      [0, top, layer + 0.03],
      [0, slotY + 1.2, layer],
      [0, slotY + 0.25, layer],
      [0, slotY - 0.06, layer * 0.6],
      [0, slotY - 0.11, 0],
      [0, slotY - 0.06, -layer * 0.6],
      [0, slotY + 0.25, -layer],
      [0, slotY + 1.2, -layer],
      [0, top, -layer - 0.03],
    ];
    const curve = new THREE.CatmullRomCurve3(path.map(vec), false, "centripetal");
    const strap = ribbonGeometry(sideFrames(curve, 80, new THREE.Vector3(1, 0, 0)), 1.2, 0.035);
    const plate = new THREE.ExtrudeGeometry(makeShape("rect", 1.3, 2.4, 0.35), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2, curveSegments: 8 });
    plate.translate(0, 0, -0.03);
    const snap = lathe(
      [
        [0, 0],
        [0.3, 0],
        [0.3, 0.05],
        [0.22, 0.14],
        [0, 0.17],
      ],
      24,
    );
    snap.rotateX(Math.PI / 2);
    return { strap, plate, snap, top, layer };
  }, [slotY, d]);
  const list = useMemo(() => [parts.strap, parts.plate, parts.snap], [parts]);
  useGeometriesCleanup(list);
  const { top, layer } = parts;
  return (
    <group>
      <mesh geometry={parts.strap}>
        <meshPhysicalMaterial attach="material-0" color="#eef4f6" transparent opacity={0.5} roughness={0.1} clearcoat={1} depthWrite={false} />
        <meshPhysicalMaterial attach="material-1" color="#eef4f6" transparent opacity={0.5} roughness={0.1} clearcoat={1} depthWrite={false} />
        <meshStandardMaterial attach="material-2" color="#dfe9ec" transparent opacity={0.7} roughness={0.2} depthWrite={false} />
      </mesh>
      <mesh geometry={parts.snap} position={[0, slotY + 1.3, layer + 0.03]}>
        <Chrome />
      </mesh>
      <mesh geometry={parts.snap} position={[0, slotY + 1.3, -layer - 0.03]} rotation-y={Math.PI}>
        <Chrome />
      </mesh>
      <RoundedBlock w={1.55} h={0.5} d={layer * 2 + 0.22} radius={0.12} color="#dfe2e6" metalness={1} roughness={0.22} position={[0, top, 0]} />
      <mesh geometry={parts.plate} position={[0, top + 1.45, 0.2]} rotation-x={-0.1}>
        <Chrome roughness={0.18} />
      </mesh>
      <mesh geometry={parts.plate} position={[0, top + 1.45, -0.2]} rotation-x={0.1}>
        <Chrome roughness={0.18} />
      </mesh>
      <mesh position={[0, top + 1.15, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.1, 0.1, 1.45, 16]} />
        <Chrome roughness={0.25} />
      </mesh>
      {[0.06, -0.06].map((z) => (
        <mesh key={z} position={[0, top + 2.62, z]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.07, 0.07, 1.25, 12]} />
          <Chrome />
        </mesh>
      ))}
    </group>
  );
}

function ClipBadge({ spec, art, label, showDims }: ModelProps) {
  const w = clamp(spec.widthCm, 3, 15);
  const h = clamp(spec.heightCm, 3, 15);
  const front = useArtTexture(w / h, "front", art, label);
  const backKind = backKindOf(spec, art);
  const back = useBackTexture(w / h, spec, art, label);
  const d = 0.076;
  const slotY = h / 2 - 0.55;
  const top = slotY + 5.7;
  const unit = 2.4 / Math.max(w, top + h / 2);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[-0.04, -0.3, 0]}>
      <group scale={unit}>
        <PvcCard w={w} h={h} d={d} radius={0.32} spec={spec} front={front} back={backKind === "blank" ? null : back} slotY={slotY} />
        <JacareClip slotY={slotY} d={d} />
      </group>
      {showDims && KIND_INFO[spec.kind].dims && <Dimensions w={w * unit} h={h * unit} z={0.03} labelW={lw} labelH={lh} />}
    </group>
  );
}

/** Bolso da credencial: placa fina na frente, embaixo, recortada da mesma placa (a arte continua por cima dela). */
function CredentialPocket({ w, h, pocketH, d, radius, spec, front }: { w: number; h: number; pocketH: number; d: number; radius: number; spec: MockupSpec; front: THREE.Texture }) {
  const parts = useMemo(() => {
    // Contorno nas coordenadas do cartão (para a UV seguir a arte do cartão inteiro): cantos de baixo arredondados.
    const y0 = -h / 2;
    const y1 = y0 + pocketH;
    const r = Math.min(radius, pocketH / 2);
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, y1);
    shape.lineTo(-w / 2, y0 + r);
    shape.quadraticCurveTo(-w / 2, y0, -w / 2 + r, y0);
    shape.lineTo(w / 2 - r, y0);
    shape.quadraticCurveTo(w / 2, y0, w / 2, y0 + r);
    shape.lineTo(w / 2, y1);
    shape.lineTo(-w / 2, y1);
    const body = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 12 });
    return { body, face: faceGeometry(shape, w, h) };
  }, [w, h, pocketH, d, radius]);
  const list = useMemo(() => [parts.body, parts.face], [parts]);
  useGeometriesCleanup(list);
  return (
    <group>
      <mesh geometry={parts.body}>
        <meshStandardMaterial color="#e4e4e1" roughness={0.5} />
      </mesh>
      <mesh geometry={parts.face} position-z={d + 0.004}>
        <PrintMaterial map={front} spec={spec} />
      </mesh>
      {/* Sombra de contato logo acima da boca do bolso: marca a fenda como na foto. */}
      <mesh position={[0, -h / 2 + pocketH + 0.05, 0.008]}>
        <planeGeometry args={[w - 0.1, 0.1]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.28} depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * Credencial (338): placa de PS 1 mm impressa (9,5 × 15 cm), cantos arredondados, dois furos no alto por onde passa
 * um cordão redondo preto (nó atrás de cada furo) e o bolso embaixo, como na foto do produto. Pendurada pelo
 * cordão, um pouco de três quartos.
 */
function Credential({ spec, art, label, showDims }: ModelProps) {
  const w = clamp(spec.widthCm, 4, 20);
  const h = clamp(spec.heightCm, 4, 25);
  const front = useArtTexture(w / h, "front", art, label);
  const backKind = backKindOf(spec, art);
  const back = useBackTexture(w / h, spec, art, label);
  const d = 0.1;
  const radius = 0.5;
  const holeR = 0.22;
  const holeX = w / 2 - 0.8;
  const holeY = h / 2 - 0.75;
  const pocketH = Math.min(2.2, h * 0.15);
  const pocketD = 0.05;
  const loopH = Math.max(9, h * 0.85);
  const holes = useMemo(
    () =>
      [
        [-holeX, holeY, holeR],
        [holeX, holeY, holeR],
      ] as const,
    [holeX, holeY],
  );
  const cord = useMemo(() => {
    // Sai da frente de cada furo, sobe em gota até o gancho (pescoço) e desce do outro lado.
    const top = holeY + loopH;
    const points: V3[] = [
      [-holeX, holeY, 0.06],
      [-holeX - 0.15, holeY + 0.9, 0.12],
      [-holeX + 0.1, holeY + loopH * 0.3, 0.1],
      [-holeX * 0.6, holeY + loopH * 0.62, 0],
      [-holeX * 0.22, top - 0.6, -0.08],
      [0, top, -0.1],
      [holeX * 0.22, top - 0.6, -0.08],
      [holeX * 0.6, holeY + loopH * 0.62, 0],
      [holeX - 0.1, holeY + loopH * 0.3, 0.1],
      [holeX + 0.15, holeY + 0.9, 0.12],
      [holeX, holeY, 0.06],
    ];
    const curve = new THREE.CatmullRomCurve3(points.map(vec), false, "centripetal");
    return new THREE.TubeGeometry(curve, 200, 0.12, 12, false);
  }, [holeX, holeY, loopH]);
  useGeometryCleanup(cord);
  const laminate = useMemo<MockupSpec>(() => ({ ...spec, finish: "gloss", clearcoat: 1 }), [spec]);
  const top = holeY + loopH + 0.2;
  const unit = 2.8 / (top + h / 2);
  const [lw, lh] = sizeLabels(spec);
  const cordColor = "#1b1b1d";
  return (
    <group rotation={[-0.03, -0.28, 0]}>
      <group scale={unit}>
        <PvcCard w={w} h={h} d={d} radius={radius} spec={spec} front={front} back={backKind === "blank" ? null : back} holes={holes} />
        <group position-z={d / 2 + 0.03}>
          <CredentialPocket w={w} h={h} pocketH={pocketH} d={pocketD} radius={radius} spec={laminate} front={front} />
        </group>
        <mesh geometry={cord}>
          <meshStandardMaterial color={cordColor} roughness={0.62} />
        </mesh>
        {/* O cordão atravessa cada furo e termina num nó atrás da placa. */}
        {[-holeX, holeX].map((x) => (
          <group key={x}>
            <mesh position={[x, holeY, 0]} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.12, 0.12, d + 0.16, 12]} />
              <meshStandardMaterial color={cordColor} roughness={0.62} />
            </mesh>
            <mesh position={[x, holeY - 0.08, -d / 2 - 0.2]} scale={[1, 0.8, 0.9]}>
              <sphereGeometry args={[0.24, 16, 12]} />
              <meshStandardMaterial color={cordColor} roughness={0.62} />
            </mesh>
          </group>
        ))}
      </group>
      {showDims && KIND_INFO[spec.kind].dims && <Dimensions w={w * unit} h={h * unit} z={0.03} labelW={lw} labelH={lh} />}
    </group>
  );
}

/**
 * Crachá: cartão de PVC 0,76 mm com cantos arredondados, rasgo vazado, núcleo branco e laminação
 * brilhante; arte na frente (verso conforme 4/0 ou 4/4) e jacaré com alça de vinil cristal passando
 * pelo rasgo, sempre no lado de cima (horizontal ou vertical, conforme a medida da spec).
 * {credential}: placa de PS com dois furos, cordão redondo e bolso embaixo. Cotas no cartão.
 */
export function BadgeModel(props: ModelProps) {
  return props.spec.variant === "credential" ? <Credential {...props} /> : <ClipBadge {...props} />;
}

// ---------------------------------------------------------------------------- pulseira

const WRIST_UNIT = 0.075;

/** Ponta da pulseira: cor da fita, numeração e os cortes de segurança do adesivo. */
function useTabTexture(color: string, aspect: number) {
  const texture = useMemo(() => {
    const height = 128;
    const width = Math.round(clamp(height * aspect, 64, 2048));
    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
      const ink = isLight(color) ? "rgba(0,0,0,0.42)" : "rgba(255,255,255,0.55)";
      const tab = Math.min(width, height * 1.5);
      // Linha de dobra pontilhada do liner e cortes em diagonal na aba adesiva.
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 7]);
      ctx.beginPath();
      ctx.moveTo(width - tab, 8);
      ctx.lineTo(width - tab, height - 8);
      ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 0; i < 3; i += 1) {
        const x = width - tab * 0.7 + i * tab * 0.18;
        ctx.beginPath();
        ctx.moveTo(x, height * 0.22);
        ctx.lineTo(x + tab * 0.08, height * 0.78);
        ctx.stroke();
      }
      ctx.fillStyle = ink;
      ctx.font = `600 ${Math.round(height * 0.26)}px ${fontFamily()}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (width - tab > height * 1.2) ctx.fillText("Nº 000128", (width - tab) / 2, height / 2, width - tab - 16);
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [color, aspect]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** Fitas da pulseira: trecho impresso (u 0–1 na área de arte) e a ponta lisa com a aba. */
function bandSegments(curve: THREE.CatmullRomCurve3, length: number, print: number, facing: (p: THREE.Vector3) => THREE.Vector3, width: number, thickness: number) {
  const printCount = 140;
  const tailCount = 30;
  const at = (s: number) => clamp(s / length, 0, 1);
  const printFrames = Array.from({ length: printCount + 1 }, (_, i) => {
    const s = (print * i) / printCount;
    return frameAt(curve, at(s), facing, 0, s / print);
  });
  const tail = length - print;
  const tailFrames = Array.from({ length: tailCount + 1 }, (_, i) => {
    const s = print + (tail * i) / tailCount;
    return frameAt(curve, at(s), facing, 0, (s - print) / tail);
  });
  return [ribbonGeometry(printFrames, width, thickness), ribbonGeometry(tailFrames, width, thickness)];
}

/** Escala uma curva em todas as direções para medir exatamente `length` (a arte não estica). */
function curveOfLength(points: THREE.Vector3[], length: number) {
  const probe = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const factor = length / (probe.getLength() || 1);
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => p.clone().multiplyScalar(factor)),
    false,
    "centripetal",
  );
  curve.arcLengthDivisions = 600;
  return curve;
}

/**
 * Pulseira de identificação (Tyvek): uma fechada em pé — anel levemente oval em espiral, a ponta com a
 * aba adesiva sobrepondo por fora, arte por fora com u ao longo da circunferência — e outra aberta deitada
 * na frente, com as pontas levemente curvadas, para a arte inteira ficar legível. Material fosco com
 * relevo de fibra; câmera mais alta.
 */
export function WristbandModel({ spec, art, label }: ModelProps) {
  const length = clamp(Math.max(spec.widthCm, spec.heightCm), 12, 45);
  const width = clamp(Math.min(spec.widthCm, spec.heightCm), 1, 3.5);
  const tabLength = Math.min(3, length * 0.15);
  const print = Math.min(length - tabLength, width * 16);
  const tail = length - print;
  const texture = useArtTexture(print / width, "front", art, label);
  const tab = useTabTexture(spec.baseColor, tail / width);
  const fiber = useBumpTexture("fiber", print / 4, width / 4);
  const thickness = 0.03;

  const geometries = useMemo(() => {
    // Anel: espiral oval com um pouco mais de uma volta; a arte (meio do trecho impresso) fica em θ = 0.
    const overlap = Math.min(3.5, length * 0.12);
    const circumference = length - overlap;
    const radius = circumference / (Math.PI * 2);
    const thetaAt = (s: number) => ((s - print / 2) / circumference) * Math.PI * 2;
    const start = thetaAt(0);
    const end = thetaAt(length);
    const steps = Math.ceil((end - start) / 0.05);
    const ringPoints = Array.from({ length: steps + 1 }, (_, i) => {
      const theta = start + ((end - start) * i) / steps;
      const grow = 1 + (thickness * 2.2 * (theta - start)) / (Math.PI * 2 * radius);
      return new THREE.Vector3(radius * 1.08 * grow * Math.sin(theta), 0, radius * 0.92 * grow * Math.cos(theta));
    });
    const ring = curveOfLength(ringPoints, length);
    const radial = (p: THREE.Vector3) => new THREE.Vector3(p.x, 0, p.z);

    // Fita aberta: reta com as pontas curvando para cima e uma ondulação suave.
    const flatPoints = Array.from({ length: 25 }, (_, i) => {
      const x = -length / 2 + (length * i) / 24;
      const edge = Math.max(0, (Math.abs(x) - (length / 2 - 3)) / 3);
      return new THREE.Vector3(x, 0.9 * edge * edge, 0.5 * Math.sin((x / length) * Math.PI * 1.4));
    });
    const flat = curveOfLength(flatPoints, length);
    const up = () => new THREE.Vector3(0, 1, 0);
    const [ringPrint, ringTail] = bandSegments(ring, length, print, radial, width, thickness);
    const [flatPrint, flatTail] = bandSegments(flat, length, print, up, width, thickness);
    return { ringPrint, ringTail, flatPrint, flatTail, radius };
  }, [length, width, print]);
  const list = useMemo(() => [geometries.ringPrint, geometries.ringTail, geometries.flatPrint, geometries.flatTail], [geometries]);
  useGeometriesCleanup(list);

  const inside = spec.baseColor;
  const band = (geometry: THREE.BufferGeometry, map: THREE.Texture, bump: boolean) => (
    <mesh geometry={geometry}>
      <meshStandardMaterial attach="material-0" map={map} roughness={0.86} bumpMap={bump ? fiber : null} bumpScale={0.5} />
      <meshStandardMaterial attach="material-1" color={inside} roughness={0.9} />
      <meshStandardMaterial attach="material-2" color={inside} roughness={0.9} />
    </mesh>
  );
  const r = geometries.radius;
  return (
    <group userData={{ view: { elevation: 0.72 } }}>
      <group scale={WRIST_UNIT}>
        <group position={[length * 0.12, width / 2, -r - 1.6]} rotation-y={0.2}>
          {band(geometries.ringPrint, texture, true)}
          {band(geometries.ringTail, tab, false)}
        </group>
        <group position={[0, thickness / 2 + 0.005, 2.2]} rotation-y={-0.06}>
          {band(geometries.flatPrint, texture, true)}
          {band(geometries.flatTail, tab, false)}
        </group>
      </group>
    </group>
  );
}
