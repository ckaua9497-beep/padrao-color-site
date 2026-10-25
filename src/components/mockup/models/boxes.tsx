"use client";

// Caixas, kits e embalagens: caixa de presente, Kit Cinema, Kit Executivo, solapa e caixa de acrílico.
// Cada variante modela em centímetros dentro de um grupo com escala própria (cm → unidades de cena).

import { useEffect, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import { hasArtContent } from "../art";
import { AcrylicMaterials, PrintMaterial, bandGeometry, faceGeometry, makeShape, roughnessOf, useArtTexture, useBackTexture, useFaceTexture, useGeometryCleanup, type ModelProps } from "./shared";
import { PrintBand, handleGeometry, lathe, type Pt } from "./vessel";
import { BasketBox, PanettoneBox } from "./baskets";
import { CartonBag, CartonBox } from "./cartons";
import { sensorDisplayTexture } from "./bottles";
import { CapModel } from "./textile";
import { usePineTexture } from "./tabletop";

type Vec3 = [number, number, number];

/** Escala interna do boné (CAP_UNIT de textile.tsx: o CapModel é montado em cm e reduzido por ela). */
const CAP_SCALE = 2.2 / 27;

/** Folga (cm) entre a superfície e o plano da arte, contra z-fighting. */
const LIFT = 0.02;

const clamp = THREE.MathUtils.clamp;
const smoothstep = THREE.MathUtils.smoothstep;

/** Medida em cm válida: o spec pode vir sem medida, com zero ou NaN. */
function cm(value: number, fallback: number, min: number) {
  return Number.isFinite(value) && value > 0 ? Math.max(value, min) : fallback;
}

/** Gerador pseudoaleatório determinístico (mulberry32): a peça sai igual a cada render. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Raio de canto que cabe no retângulo e nunca é zero (curva degenerada quebra a triangulação). */
function safeRadius(radius: number, w: number, h: number) {
  const limit = Math.min(w, h) / 2;
  return clamp(radius, limit * 0.004, limit * 0.98);
}

function roundedRectPath(cx: number, cy: number, w: number, h: number, radius: number) {
  const r = safeRadius(radius, w, h);
  const x = cx - w / 2;
  const y = cy - h / 2;
  const path = new THREE.Path();
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r);
  path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r);
  path.quadraticCurveTo(x, y, x + r, y);
  return path;
}

/** Placa de cantos arredondados e arestas chanfradas: face em xy, espessura em z, centrada. Grupo 0 = faces, 1 = bordas. */
function plateGeometry(w: number, h: number, t: number, radius: number, bevel: number) {
  const b = Math.max(0, Math.min(bevel, w / 4, h / 4, t / 2.5));
  const sw = w - 2 * b;
  const sh = h - 2 * b;
  const depth = t - 2 * b;
  const geometry = new THREE.ExtrudeGeometry(makeShape("rect", sw, sh, safeRadius(radius, sw, sh)), {
    depth,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 3,
    curveSegments: 8,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

/** Bloco macio: planta (x × z) de cantos arredondados, altura em y, arestas chanfradas. Centrado. */
function blockGeometry(w: number, h: number, d: number, radius: number, bevel: number) {
  const geometry = plateGeometry(w, d, h, radius, bevel);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** Chanfro e raio efetivos da parede de uma bandeja (os planos de arte usam os mesmos números). */
function ringParams(w: number, d: number, h: number, wall: number, radius: number, bevel: number) {
  const b = Math.max(0.001, Math.min(bevel, wall / 3, h / 4));
  return { b, r: safeRadius(radius, w - 2 * b, d - 2 * b) };
}

/** Paredes de caixa aberta (anel extrudado para cima, de y = 0 a y = h), com topo e base chanfrados. */
function ringGeometry(w: number, d: number, h: number, wall: number, radius: number, bevel: number) {
  const { b, r } = ringParams(w, d, h, wall, radius, bevel);
  const shape = makeShape("rect", w - 2 * b, d - 2 * b, r);
  // O chanfro encolhe o furo em b de cada lado: o vão final fica w − 2·parede.
  shape.holes.push(roundedRectPath(0, 0, w - 2 * wall + 2 * b, d - 2 * wall + 2 * b, Math.max(r + 2 * b - wall, 0.02)));
  const depth = Math.max(h - 2 * b, 0.001);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 8 });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, b, 0);
  return geometry;
}

type Piece = { matrix: THREE.Matrix4; color: THREE.Color };

/** Junta cópias transformadas de uma geometria num único buffer com cor por vértice (pipoca, confeitos, papel picado). */
function mergePieces(base: THREE.BufferGeometry, pieces: Piece[]) {
  const position = base.getAttribute("position");
  const normal = base.getAttribute("normal");
  const index = base.getIndex();
  const vertexCount = position.count;
  const indexCount = index ? index.count : vertexCount;
  const positions = new Float32Array(vertexCount * pieces.length * 3);
  const normals = new Float32Array(vertexCount * pieces.length * 3);
  const colors = new Float32Array(vertexCount * pieces.length * 3);
  const indices = new Uint32Array(indexCount * pieces.length);
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  pieces.forEach((piece, k) => {
    normalMatrix.getNormalMatrix(piece.matrix);
    const offset = k * vertexCount;
    for (let i = 0; i < vertexCount; i += 1) {
      v.fromBufferAttribute(position, i).applyMatrix4(piece.matrix);
      n.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
      const o = (offset + i) * 3;
      positions[o] = v.x;
      positions[o + 1] = v.y;
      positions[o + 2] = v.z;
      normals[o] = n.x;
      normals[o + 1] = n.y;
      normals[o + 2] = n.z;
      colors[o] = piece.color.r;
      colors[o + 1] = piece.color.g;
      colors[o + 2] = piece.color.b;
    }
    for (let i = 0; i < indexCount; i += 1) indices[k * indexCount + i] = (index ? index.getX(i) : i) + offset;
  });
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  merged.computeBoundingSphere();
  return merged;
}

/** Cópia com rotação aleatória: giro livre em `spin` e inclinação de até ±tilt nos outros eixos. */
function piece(random: () => number, position: Vec3, scale: Vec3, color: string, tilt = Math.PI, spin: "y" | "z" = "y"): Piece {
  const a = (random() - 0.5) * tilt * 2;
  const b = random() * Math.PI * 2;
  const c = (random() - 0.5) * tilt * 2;
  const euler = spin === "y" ? new THREE.Euler(a, b, c) : new THREE.Euler(a, c, b);
  const quaternion = new THREE.Quaternion().setFromEuler(euler);
  return {
    matrix: new THREE.Matrix4().compose(new THREE.Vector3(...position), quaternion, new THREE.Vector3(...scale)),
    color: new THREE.Color(color),
  };
}

function pickColor(random: () => number, palette: string[]) {
  return palette[Math.floor(random() * palette.length) % palette.length];
}

/* ------------------------------------------------------------------------------------------------
 * Peças básicas
 * ---------------------------------------------------------------------------------------------- */

type Placement = { position?: Vec3; rotation?: Vec3 };

function Block({ size, radius = 0.3, bevel = 0.1, children, position, rotation }: Placement & { size: Vec3; radius?: number; bevel?: number; children: ReactNode }) {
  const [w, h, d] = size;
  const geometry = useMemo(() => blockGeometry(w, h, d, radius, bevel), [w, h, d, radius, bevel]);
  useGeometryCleanup(geometry);
  return (
    <mesh geometry={geometry} position={position} rotation={rotation}>
      {children}
    </mesh>
  );
}

/** Caixa aberta: paredes chanfradas + fundo. `material` vale para as duas malhas. */
function Tray({ w, d, h, wall, floor, radius, bevel, material, position, rotation }: Placement & { w: number; d: number; h: number; wall: number; floor: number; radius: number; bevel: number; material: ReactNode }) {
  const walls = useMemo(() => ringGeometry(w, d, h, wall, radius, bevel), [w, d, h, wall, radius, bevel]);
  const base = useMemo(() => {
    const geometry = blockGeometry(w - wall, floor, d - wall, Math.max(radius - wall / 2, 0.05), Math.min(bevel, floor / 3));
    geometry.translate(0, floor / 2 + 0.004, 0);
    return geometry;
  }, [w, d, wall, floor, radius, bevel]);
  useGeometryCleanup(walls);
  useGeometryCleanup(base);
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={walls}>{material}</mesh>
      <mesh geometry={base}>{material}</mesh>
    </group>
  );
}

/** Plano de impressão (retângulo de cantos arredondados) com UV 0–1 na mesma proporção da arte. */
function Face({ w, h, radius = 0.05, map, spec, position, rotation }: Placement & { w: number; h: number; radius?: number; map: THREE.Texture; spec: MockupSpec }) {
  const geometry = useMemo(() => faceGeometry(makeShape("rect", w, h, safeRadius(radius, w, h)), w, h), [w, h, radius]);
  useGeometryCleanup(geometry);
  return (
    <mesh geometry={geometry} position={position} rotation={rotation}>
      <PrintMaterial map={map} spec={spec} />
    </mesh>
  );
}

/** Papel de revestimento (cartonagem) com o mesmo acabamento da impressão. */
function Coated({ color, spec, roughness }: { color: string; spec: MockupSpec; roughness?: number }) {
  const r = roughness ?? roughnessOf(spec);
  if (spec.clearcoat > 0) return <meshPhysicalMaterial color={color} roughness={r} clearcoat={spec.clearcoat} clearcoatRoughness={0.08} />;
  return <meshStandardMaterial color={color} roughness={r} />;
}

/* ------------------------------------------------------------------------------------------------
 * Caixa de presente (padrão)
 * ---------------------------------------------------------------------------------------------- */

/** Papel de seda amassado dentro da caixa: sobe no meio e fica abaixo da borda nas laterais. */
function tissueGeometry(w: number, d: number, rim: number) {
  const geometry = new THREE.PlaneGeometry(w, d, 44, 34);
  geometry.rotateX(-Math.PI / 2);
  const k = clamp(Math.min(w, d) / 18, 0.3, 1.5);
  const p = geometry.getAttribute("position");
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i) / k;
    const z = p.getZ(i) / k;
    const edge = Math.min(1 - Math.abs((2 * p.getX(i)) / w), 1 - Math.abs((2 * p.getZ(i)) / d));
    const rise = smoothstep(edge, 0, 0.6);
    const crumple = Math.abs(Math.sin(x * 0.9 + z * 0.55)) * 0.5 + Math.abs(Math.sin(x * 0.45 - z * 1.1 + 1.7)) * 0.45 + Math.sin(x * 2.3 + z * 1.9) * 0.12;
    p.setY(i, rim - 0.5 * k + (rise * 1.4 + crumple * (0.25 + rise * 0.6)) * k);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function GiftBox({ spec, art, label }: ModelProps) {
  // Largura × altura do spec = tampa; profundidade = altura da caixa (ou metade do lado menor).
  const W = cm(spec.widthCm, 20, 4);
  const D = cm(spec.heightCm, 15, 4);
  const H = spec.depthCm >= 2 ? spec.depthCm : Math.max(Math.min(W, D) * 0.5, 3);
  const S = 2.4 / Math.max(W, D, H);
  const wall = 0.25;
  const bevel = 0.12;
  const radius = 0.35;
  const base = ringParams(W, D, H, wall, radius, bevel);
  const frontW = W - 2 * (base.b + base.r) - 0.02;
  const frontH = H - 2 * base.b - 0.02;
  // A tampa encaixa por fora: vão interno = base + folga.
  const lidW = W + 2 * wall + 0.15;
  const lidD = D + 2 * wall + 0.15;
  const skirt = clamp(H * 0.32, Math.min(1.5, H * 0.9), Math.min(5, H * 0.9));
  const lid = ringParams(lidW, lidD, skirt, wall, radius, bevel);
  const topW = lidW - 2 * lid.b;
  const topD = lidD - 2 * lid.b;
  const frontArt = useArtTexture(frontW / frontH, "front", art, label);
  const topArt = useArtTexture(topW / topD, "front", art, label);
  const tissue = useMemo(() => tissueGeometry(W - 2 * wall - 0.08, D - 2 * wall - 0.08, H), [W, D, H]);
  useGeometryCleanup(tissue);

  // Tampa suspensa atrás da caixa, inclinada para a câmera: a borda da frente fica sobre o fundo da base.
  const tilt = 1.05;
  const gap = H * 0.2;
  const lidY = H + gap + skirt * Math.cos(tilt) + (lidD / 2) * Math.sin(tilt);
  const lidZ = -D / 2 + D * 0.12 - (-skirt * Math.sin(tilt) + (lidD / 2) * Math.cos(tilt));
  const wrap = <Coated color={art.background} spec={spec} />;

  return (
    <group userData={{ view: { elevation: 0.32 } }}>
      <group scale={S}>
        <Tray w={W} d={D} h={H} wall={wall} floor={0.3} radius={radius} bevel={bevel} material={wrap} />
        <Face w={frontW} h={frontH} map={frontArt} spec={spec} position={[0, H / 2, D / 2 + LIFT]} />
        <Face w={frontW} h={frontH} map={frontArt} spec={spec} position={[0, H / 2, -D / 2 - LIFT]} rotation={[0, Math.PI, 0]} />
        <mesh geometry={tissue}>
          <meshStandardMaterial color={spec.accentColor ?? "#f2d5d7"} roughness={0.88} side={THREE.DoubleSide} />
        </mesh>
        <group position={[0, lidY, lidZ]} rotation-y={-0.1}>
          <group rotation-x={tilt} rotation-z={0.04}>
            <Tray w={lidW} d={lidD} h={skirt} wall={wall} floor={0.3} radius={radius} bevel={bevel} material={wrap} rotation={[Math.PI, 0, 0]} />
            <Face w={topW} h={topD} radius={lid.r} map={topArt} spec={spec} position={[0, LIFT, 0]} rotation={[-Math.PI / 2, 0, 0]} />
          </group>
        </group>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Kit Cinema: almofada porta-pipoca de Oxford sublimado com o suporte de dois furos por cima (fotos da 188)
 * ---------------------------------------------------------------------------------------------- */

/**
 * Medidas do gabarito (cm): o topo (suporte) é 37 × 25 com cantos de raio grande; a lateral da almofada é uma faixa
 * de 109 × 30 que dá a volta e entra por baixo até o fundo de 30 × 20. Furos das fotos: copo à esquerda, balde à direita.
 */
const CINEMA = { topW: 37, topD: 25, corner: 7.5, bottomW: 30, bottomD: 20, height: 14, board: 1.1 };
const LATERAL = { w: 109, h: 30 };
const CINEMA_HOLES = { cup: { x: -8.2, z: 0.6, r: 4 }, bucket: { x: 6.4, z: 0, r: 7.5 } };
const BUCKET = { top: 8.5, bottom: 5.8, height: 19 };
const CUP = { top: 4.5, bottom: 3.1, height: 14 };
const POPCORN_COLORS = ["#fff3d1", "#fbe6b0", "#f6dc9c", "#fff8e6", "#f2d48e", "#fdeec4", "#e2b56a"];

function cupProfile(rBottom: number, rTop: number, height: number): Pt[] {
  return [
    [0, 0],
    [rBottom - 0.35, 0],
    [rBottom - 0.06, 0.1],
    [rBottom, 0.45],
    [rTop, height - 0.2],
    [rTop - 0.35, height - 0.2],
    [0, height - 0.2],
  ];
}

/** Pipoca: esfera com calombos (seed fixa), em escala de 1 cm. */
function kernelGeometry() {
  const geometry = new THREE.SphereGeometry(1, 10, 8);
  const p = geometry.getAttribute("position");
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 1) {
    v.fromBufferAttribute(p, i);
    const bump = 1 + 0.24 * Math.sin(v.x * 4.1 + 1.3) * Math.sin(v.y * 3.7 + 0.4) * Math.sin(v.z * 4.6 + 2.2) + 0.16 * Math.abs(Math.sin(v.x * 2.3 + v.z * 3.1 + v.y));
    v.multiplyScalar(bump);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Monte de pipoca na boca do balde (coordenadas do balde: boca em y = altura). */
function popcornGeometry() {
  const base = kernelGeometry();
  const random = rng(17);
  const pieces: Piece[] = [];
  const reach = BUCKET.top - 0.9;
  for (let i = 0; i < 220; i += 1) {
    const rho = reach * Math.sqrt(random());
    const phi = random() * Math.PI * 2;
    const dome = 4.3 * Math.pow(Math.max(0, 1 - (rho / BUCKET.top) ** 2), 0.85);
    const s = 0.78 + random() * 0.32;
    pieces.push(piece(random, [Math.cos(phi) * rho, BUCKET.height - 0.35 + dome + (random() - 0.5) * 0.8, Math.sin(phi) * rho], [s * 1.05, s * 0.86, s], pickColor(random, POPCORN_COLORS)));
  }
  const merged = mergePieces(base, pieces);
  base.dispose();
  return merged;
}

/** Listras diagonais do canudo (viram hélice no cilindro). */
function stripeTexture(color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = color;
    for (let k = -2; k < 3; k += 1) {
      ctx.beginPath();
      ctx.moveTo(k * 32, 64);
      ctx.lineTo(k * 32 + 16, 64);
      ctx.lineTo(k * 32 + 80, 0);
      ctx.lineTo(k * 32 + 64, 0);
      ctx.closePath();
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 9);
  return texture;
}

/**
 * Ponto do contorno de um retângulo de cantos arredondados (meia-largura a, meia-profundidade b, raio r) no
 * parâmetro s ∈ [0, 1) do perímetro, começando no meio de trás (−z) e indo pela esquerda até a frente: na frente
 * (+z) o s cresce para +x, e a arte lê da esquerda para a direita.
 */
function roundedRectAt(a: number, b: number, r: number, s: number): [number, number, number, number] {
  const sx = a - r;
  const sz = b - r;
  const quarter = (Math.PI * r) / 2;
  // Trechos a partir do meio de trás, no sentido −x: meia aresta de trás, canto, aresta esquerda, canto, aresta da frente…
  const segments: [number, (t: number) => [number, number, number, number]][] = [
    [sx, (t) => [-t, -b, 0, -1]],
    [quarter, (t) => {
      const ang = -Math.PI / 2 - t / r;
      return [-sx + r * Math.cos(ang), -sz + r * Math.sin(ang), Math.cos(ang), Math.sin(ang)];
    }],
    [2 * sz, (t) => [-a, -sz + t, -1, 0]],
    [quarter, (t) => {
      const ang = Math.PI - t / r;
      return [-sx + r * Math.cos(ang), sz + r * Math.sin(ang), Math.cos(ang), Math.sin(ang)];
    }],
    [2 * sx, (t) => [-sx + t, b, 0, 1]],
    [quarter, (t) => {
      const ang = Math.PI / 2 - t / r;
      return [sx + r * Math.cos(ang), sz + r * Math.sin(ang), Math.cos(ang), Math.sin(ang)];
    }],
    [2 * sz, (t) => [a, sz - t, 1, 0]],
    [quarter, (t) => {
      const ang = -t / r;
      return [sx + r * Math.cos(ang), -sz + r * Math.sin(ang), Math.cos(ang), Math.sin(ang)];
    }],
    [sx, (t) => [sx - t, -b, 0, -1]],
  ];
  const total = segments.reduce((sum, [len]) => sum + len, 0);
  let d = (((s % 1) + 1) % 1) * total;
  for (const [len, at] of segments) {
    if (d <= len) return at(d);
    d -= len;
  }
  return segments[segments.length - 1][1](segments[segments.length - 1][0]);
}

/**
 * Lateral da almofada: superfície em anéis de cantos arredondados, do topo (contorno do suporte) estufando para fora e
 * entrando por baixo até o fundo menor. UV: u ao longo do perímetro (meio da frente em u = 0,5), v pelo comprimento do
 * tecido no perfil (topo = 1): a faixa da lateral do gabarito cobre a volta toda e a parte que entra por baixo.
 */
function cushionGeometry() {
  const { topW, topD, bottomW, bottomD, height, corner } = CINEMA;
  // Perfil (quanto o contorno cresce em relação ao topo, altura): estufa no meio e fecha no fundo menor.
  const control: Pt[] = [
    [0, height],
    [1.6, height * 0.78],
    [2.4, height * 0.5],
    [1.4, height * 0.2],
    [-1.2, height * 0.04],
    [-(topW - bottomW) / 2, 0],
  ];
  const curve = new THREE.SplineCurve(control.map(([x, y]) => new THREE.Vector2(x, y)));
  const rows = curve.getPoints(28);
  const lengths = [0];
  for (let j = 1; j < rows.length; j += 1) lengths.push(lengths[j - 1] + rows[j].distanceTo(rows[j - 1]));
  const total = lengths[lengths.length - 1];
  const cols = 160;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  rows.forEach((row, j) => {
    const grow = row.x;
    const a = topW / 2 + grow;
    const b = topD / 2 + grow * ((topD - bottomD) / (topW - bottomW));
    const r = Math.max(2, corner + grow * 0.8);
    for (let i = 0; i <= cols; i += 1) {
      const s = i / cols;
      const [x, z, nx, nz] = roundedRectAt(a, b, r, s);
      // Tecido de pufe: ondas suaves (franzido) que somem no topo e no fundo.
      const ease = Math.sin((Math.PI * lengths[j]) / total);
      const wrinkle = ease * (0.18 * Math.sin(s * Math.PI * 22 + row.y * 0.9) + 0.12 * Math.sin(s * Math.PI * 9 - row.y * 1.7));
      positions.push(x + nx * wrinkle, row.y, z + nz * wrinkle);
      uvs.push(s, 1 - lengths[j] / total);
    }
  });
  for (let j = 0; j < rows.length - 1; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const p = j * (cols + 1) + i;
      const q = p + cols + 1;
      indices.push(p, q, p + 1, p + 1, q, q + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Contorno do suporte (37 × 25, cantos grandes) com os dois furos; y do shape = −z do mundo. */
function cinemaTopShape() {
  const shape = makeShape("rect", CINEMA.topW, CINEMA.topD, CINEMA.corner);
  for (const hole of [CINEMA_HOLES.cup, CINEMA_HOLES.bucket]) {
    const path = new THREE.Path();
    path.absarc(hole.x, -hole.z, hole.r, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }
  return shape;
}

/** Bolsão de tecido sob um furo: cilindro franzido que desce dentro da almofada (face de dentro visível). */
function pocketGeometry(r: number, depth: number) {
  const geometry = new THREE.CylinderGeometry(r, r * 0.86, depth, 48, 10, true);
  const p = geometry.getAttribute("position");
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.07 * Math.sin(a * 7 + y * 0.8) * (0.5 - y / depth);
    p.setXYZ(i, x * k, y - depth / 2, z * k);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Tecido Oxford sublimado: fosco com um leve brilho de fibra sintética. */
function Oxford({ map, color, side }: { map?: THREE.Texture; color?: string; side?: THREE.Side }) {
  return <meshPhysicalMaterial map={map ?? null} color={color ?? "#ffffff"} roughness={0.78} sheen={0.55} sheenRoughness={0.5} sheenColor="#ffffff" side={side ?? THREE.FrontSide} />;
}

/**
 * Kit Cinema (188): almofada de Oxford sublimado (a arte da lateral dá a volta), o suporte de cima com o furo do copo
 * e o do balde (arte do "Topo"; sem ela, repete a da frente), bolsões de tecido nos furos e alças nas laterais.
 * Modelos "com bandeja": o suporte é rígido (placa reta); "sem bandeja": tecido macio, sem a placa. "Completo": balde
 * de pipoca e copo lisos encaixados (sem arte, como pede a Padrão).
 */
function CinemaKit({ spec, art, label }: ModelProps) {
  const S = 2.5 / CINEMA.topW;
  const details = spec.details ?? "";
  const tray = !/\bsem bandeja\b/.test(details);
  const complete = /\bcompleto\b/.test(details);
  const side = useArtTexture(LATERAL.w / LATERAL.h, "front", art, label);
  const top = useFaceTexture(CINEMA.topW / CINEMA.topD, art, "topo", label, "front");
  const straw = useMemo(() => stripeTexture("#e02018"), []);
  useEffect(() => () => straw.dispose(), [straw]);

  const parts = useMemo(() => {
    const shape = cinemaTopShape();
    const t = CINEMA.board;
    const board = new THREE.ExtrudeGeometry(shape, { depth: t - 0.5, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 3, curveSegments: 24 });
    board.rotateX(-Math.PI / 2);
    board.translate(0, 0.25, 0);
    return {
      cushion: cushionGeometry(),
      bottom: new THREE.ShapeGeometry(makeShape("rect", CINEMA.bottomW, CINEMA.bottomD, 5), 16),
      board,
      face: faceGeometry(shape, CINEMA.topW, CINEMA.topD),
      cupPocket: pocketGeometry(CINEMA_HOLES.cup.r - 0.05, 9.5),
      bucketPocket: pocketGeometry(CINEMA_HOLES.bucket.r - 0.05, 12.5),
      handle: new THREE.TorusGeometry(2.4, 0.35, 10, 32, Math.PI),
      bucket: lathe(cupProfile(BUCKET.bottom, BUCKET.top, BUCKET.height), 96),
      cup: lathe(cupProfile(CUP.bottom, CUP.top, CUP.height), 72),
      popcorn: popcornGeometry(),
      lid: lathe(
        [
          [0, 1.25],
          [1.3, 1.25],
          [1.55, 1.05],
          [CUP.top - 0.7, 0.85],
          [CUP.top - 0.45, 0.55],
          [CUP.top + 0.15, 0.5],
          [CUP.top + 0.3, 0.32],
          [CUP.top + 0.28, 0],
          [CUP.top + 0.12, -0.12],
          [CUP.top - 0.1, -0.12],
        ],
        72,
      ),
    };
  }, []);
  useEffect(() => () => Object.values(parts).forEach((geometry) => geometry.dispose()), [parts]);

  const H = CINEMA.height;
  // Sem bandeja o topo é só o tecido: fica um pouco abaixo da borda e sem a placa.
  const topY = tray ? H - 0.15 : H - 0.55;
  const fabric = art.background;
  const paper = <meshPhysicalMaterial color="#fbfbf9" roughness={0.42} clearcoat={0.35} clearcoatRoughness={0.2} />;
  // Altura onde o balde (cônico) encosta na borda do furo: dali para baixo ele fica dentro do bolsão.
  const seat = (rBottom: number, rTop: number, height: number, r: number) => (height * (r - rBottom)) / (rTop - rBottom);
  const bucketY = topY - seat(BUCKET.bottom, BUCKET.top, BUCKET.height, CINEMA_HOLES.bucket.r);
  const cupY = topY - seat(CUP.bottom, CUP.top, CUP.height, CINEMA_HOLES.cup.r);
  return (
    <group userData={{ view: { elevation: 0.62 } }}>
      <group scale={S}>
        <mesh geometry={parts.cushion}>
          <Oxford map={side} />
        </mesh>
        <mesh geometry={parts.bottom} rotation-x={Math.PI / 2} position-y={0.02}>
          <Oxford color={fabric} />
        </mesh>
        <group position-y={topY}>
          {tray && (
            <mesh geometry={parts.board} position-y={-CINEMA.board + 0.1}>
              <Oxford color={fabric} />
            </mesh>
          )}
          <mesh geometry={parts.face} rotation-x={-Math.PI / 2} position-y={0.12}>
            <Oxford map={top} />
          </mesh>
          {/* Bolsões de tecido sob os furos (vistos por dentro). */}
          <mesh geometry={parts.cupPocket} position={[CINEMA_HOLES.cup.x, 0.05, CINEMA_HOLES.cup.z]}>
            <Oxford color={fabric} side={THREE.DoubleSide} />
          </mesh>
          <mesh geometry={parts.bucketPocket} position={[CINEMA_HOLES.bucket.x, 0.05, CINEMA_HOLES.bucket.z]}>
            <Oxford color={fabric} side={THREE.DoubleSide} />
          </mesh>
        </group>
        {/* Alças de tecido nas laterais curtas, saindo logo abaixo do suporte. */}
        {[-1, 1].map((sx) => (
          <mesh key={sx} geometry={parts.handle} position={[sx * (CINEMA.topW / 2 + 0.2), topY - 1.4, 0]} rotation={[0, sx > 0 ? 0 : Math.PI, -Math.PI / 2]} scale={[1, 1, 2.2]}>
            <Oxford color={fabric} />
          </mesh>
        ))}
        {complete && (
          <>
            <group position={[CINEMA_HOLES.bucket.x, bucketY, CINEMA_HOLES.bucket.z]}>
              <mesh geometry={parts.bucket}>{paper}</mesh>
              <mesh position-y={BUCKET.height - 0.15} rotation-x={Math.PI / 2}>
                <torusGeometry args={[BUCKET.top - 0.05, 0.32, 10, 96]} />
                {paper}
              </mesh>
              <mesh geometry={parts.popcorn}>
                <meshStandardMaterial vertexColors roughness={0.82} />
              </mesh>
            </group>
            <group position={[CINEMA_HOLES.cup.x, cupY, CINEMA_HOLES.cup.z]}>
              <mesh geometry={parts.cup}>{paper}</mesh>
              <mesh position-y={CUP.height - 0.12} rotation-x={Math.PI / 2}>
                <torusGeometry args={[CUP.top - 0.02, 0.2, 8, 72]} />
                {paper}
              </mesh>
              <mesh geometry={parts.lid} position-y={CUP.height - 0.2}>
                <meshPhysicalMaterial color="#f7f7f5" roughness={0.28} clearcoat={0.6} side={THREE.DoubleSide} />
              </mesh>
              {/* Canudo atravessando a tampa, levemente inclinado. */}
              <group position={[1, CUP.height + 1, 0.4]} rotation={[0.1, 0, -0.14]}>
                <mesh position-y={18 / 2 - 10}>
                  <cylinderGeometry args={[0.32, 0.32, 18, 18]} />
                  <meshPhysicalMaterial map={straw} roughness={0.3} clearcoat={0.6} />
                </mesh>
              </group>
            </group>
          </>
        )}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Kit Executivo: caixa rígida preta de tampa articulada, berço branco com a garrafa térmica, o caderno espiral,
 * a caneta e a caneca (ou o boné), como nas fotos do produto (399)
 * ---------------------------------------------------------------------------------------------- */

/** Caixa (cm, por dentro) e topo do berço de EVA branco. */
const EXEC = { w: 42, d: 32, h: 8, wall: 0.35, floor: 0.35, insertTop: 6.6, pocket: 1.2, bevel: 0.2 };
/** Posição dos itens no berço (x para a direita, z para a frente), das fotos: garrafa à esquerda, caderno no meio. */
const EXEC_ITEMS = {
  bottle: { x: -15.2, z: 0.8, r: 3.4, length: 23.4 },
  notebook: { x: -1.6, z: 2.4, w: 17, d: 24 },
  pen: { x: -1.6, z: -12.3, length: 14 },
  side: { x: 13.6, z: 2.4, w: 11, d: 14 },
};

/** Berço de EVA: placa com os encaixes rasos de cada item (no shape, y = −z do mundo). */
function insertGeometry() {
  const b = EXEC.bevel;
  const w = EXEC.w - 2 * EXEC.wall - 0.1;
  const d = EXEC.d - 2 * EXEC.wall - 0.1;
  const { bottle, notebook, pen, side } = EXEC_ITEMS;
  const shape = makeShape("rect", w - 2 * b, d - 2 * b, 0.4);
  shape.holes.push(roundedRectPath(bottle.x, -bottle.z, bottle.r * 2 + 0.5 + 2 * b, bottle.length + 0.5 + 2 * b, 2));
  shape.holes.push(roundedRectPath(notebook.x, -notebook.z, notebook.w + 0.6 + 2 * b, notebook.d + 0.5 + 2 * b, 0.5));
  shape.holes.push(roundedRectPath(pen.x, -pen.z, pen.length + 0.6 + 2 * b, 1.4 + 2 * b, 0.6));
  shape.holes.push(roundedRectPath(side.x, -side.z, side.w + 2 * b, side.d + 2 * b, 1.2));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: EXEC.pocket - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 12 });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, EXEC.insertTop - EXEC.pocket + b, 0);
  return geometry;
}

/** EVA branco do berço (fosco, de poro fino). */
function Eva() {
  return <meshPhysicalMaterial color="#efeeea" roughness={0.92} sheen={0.4} sheenColor="#ffffff" sheenRoughness={0.8} />;
}

function KitInsert() {
  const top = useMemo(() => insertGeometry(), []);
  useGeometryCleanup(top);
  const baseH = EXEC.insertTop - EXEC.pocket - EXEC.floor;
  return (
    <group>
      <mesh geometry={top}>
        <Eva />
      </mesh>
      <Block size={[EXEC.w - 2 * EXEC.wall - 0.1, baseH, EXEC.d - 2 * EXEC.wall - 0.1]} radius={0.4} bevel={0.05} position={[0, EXEC.floor + baseH / 2, 0]}>
        <Eva />
      </Block>
    </group>
  );
}

/** Capa do caderno do kit (área impressa); o verso do cliente usa a mesma área na tampa da caixa. */
const COVER = { w: EXEC_ITEMS.notebook.w - 0.9, d: EXEC_ITEMS.notebook.d - 0.16 };

/** Caderno de capa dura preta deitado, wire-o na lateral esquerda e a arte do cliente na capa. */
function KitNotebook({ spec, art, label, position }: Pick<ModelProps, "spec" | "art" | "label"> & { position: Vec3 }) {
  const { w, d } = EXEC_ITEMS.notebook;
  const board = 0.22;
  const pages = 1.3;
  const cover = useArtTexture(COVER.w / COVER.d, "front", art, label);
  const rings = useMemo(() => new THREE.TorusGeometry(0.55, 0.055, 8, 28), []);
  useGeometryCleanup(rings);
  const black = <meshPhysicalMaterial color="#19191b" roughness={0.6} clearcoat={0.2} clearcoatRoughness={0.5} />;
  const count = Math.floor((d - 1.2) / 0.85);
  const top = pages + board * 2;
  return (
    <group position={position}>
      <Block size={[w, board, d]} radius={0.3} bevel={0.06} position={[0, board / 2, 0]}>
        {black}
      </Block>
      <Block size={[w - 0.5, pages, d - 0.5]} radius={0.12} bevel={0.03} position={[0.15, board + pages / 2, 0]}>
        <meshStandardMaterial color="#f5f3ee" roughness={0.92} />
      </Block>
      <Block size={[w, board, d]} radius={0.3} bevel={0.06} position={[0, board * 1.5 + pages, 0]}>
        {black}
      </Block>
      {/* Wire-o: um anel a cada 0,85 cm, abraçando a borda esquerda das duas capas. */}
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} geometry={rings} position={[-w / 2 + 0.35, top / 2, -d / 2 + 0.6 + (i + 0.5) * ((d - 1.2) / count)]}>
          <meshStandardMaterial color="#c9ccd1" metalness={1} roughness={0.3} />
        </mesh>
      ))}
      <Face w={COVER.w} h={COVER.d} radius={0.3} map={cover} spec={spec} position={[0.4, top + LIFT, 0]} rotation={[-Math.PI / 2, 0, 0]} />
    </group>
  );
}

/**
 * Faixa de arte ao longo do eixo (y) de um cilindro, voltada para −z local: na garrafa deitada (eixo para a frente)
 * ela fica para cima e a arte lê da tampa para o fundo, como nas fotos.
 */
function axialBand(radius: number, y0: number, length: number, width: number) {
  const arc = Math.min(width / radius, Math.PI * 0.95);
  const geometry = new THREE.PlaneGeometry(1, 1, 24, 16);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i += 1) {
    const u = position.getX(i) + 0.5;
    const v = position.getY(i) + 0.5;
    // θ cresce com v: a face da frente do plano fica para fora do cilindro.
    const theta = Math.PI - arc / 2 + arc * v;
    position.setXYZ(i, radius * Math.sin(theta), y0 + length * (1 - u), radius * Math.cos(theta));
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Garrafa térmica com sensor (a mesma da 396) deitada ao longo de z, tampa com o visor virada para a frente. */
function KitBottle({ art, label, color, position }: Pick<ModelProps, "art" | "label"> & { color: string; position: Vec3 }) {
  const { r, length } = EXEC_ITEMS.bottle;
  const body = 19.3;
  const parts = useMemo(() => {
    const R = EXEC_ITEMS.bottle.r;
    const capLen = EXEC_ITEMS.bottle.length - body - 0.1;
    return {
      body: lathe(
        [
          [0, 0.3],
          [R - 0.45, 0.3],
          [R - 0.3, 0.02],
          [R - 0.08, 0.03],
          [R, 0.4],
          [R, body - 0.25],
          [R - 0.1, body],
          [0, body],
        ],
        64,
      ),
      cap: lathe(
        [
          [0, 0],
          [R - 0.1, 0],
          [R, 0.12],
          [R, capLen - 0.5],
          [R - 0.18, capLen - 0.14],
          [R - 0.5, capLen],
          [0, capLen],
        ],
        64,
      ),
      capLen,
      // Adesivo DTF de 9 × 10 cm deitado: os 10 cm correm ao longo da garrafa.
      band: axialBand(R + 0.02, (body - 10) / 2 + 0.6, 10, 9),
    };
  }, []);
  useGeometryCleanup(parts.body);
  useGeometryCleanup(parts.cap);
  useGeometryCleanup(parts.band);
  const decal = useMemo(() => (art.src ? { ...art, background: "rgba(0,0,0,0)" } : art), [art]);
  const map = useArtTexture(10 / 9, "front", decal, label);
  const display = useMemo(() => sensorDisplayTexture(), []);
  useEffect(() => () => display.dispose(), [display]);
  const paint = <meshPhysicalMaterial color={color} roughness={0.55} metalness={0.08} clearcoat={0.3} clearcoatRoughness={0.35} />;
  return (
    <group position={position}>
      {/* Torno em y; deitada: y → +z (tampa para a frente). */}
      <group rotation-x={Math.PI / 2} position-z={-length / 2}>
        <mesh geometry={parts.body}>{paint}</mesh>
        <mesh geometry={parts.band}>
          <meshPhysicalMaterial map={map} roughness={0.25} clearcoat={0.8} transparent polygonOffset polygonOffsetFactor={-2} />
        </mesh>
        <group position-y={body + 0.1}>
          <mesh geometry={parts.cap}>{paint}</mesh>
          <mesh position-y={parts.capLen + 0.01} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[r - 0.55, 48]} />
            <meshPhysicalMaterial color="#07080a" roughness={0.06} clearcoat={1} />
          </mesh>
          {/* Visor de frente para a câmera (topo da tampa = +z depois do giro); dígitos de pé. */}
          <mesh position-y={parts.capLen + 0.02} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[(r - 0.55) * 0.62, 48]} />
            <meshBasicMaterial map={display} transparent depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/** Caneta metálica preta deitada ao longo de x, ponteira e anel cromados, clipe para cima. */
function KitPen({ position }: { position: Vec3 }) {
  const body = useMemo(
    () =>
      lathe(
        [
          [0, 0],
          [0.08, 0.05],
          [0.22, 0.45],
          [0.42, 1.5],
          [0.48, 2.6],
          [0.5, 3],
          [0.5, 12.6],
          [0.46, 13.3],
          [0.3, 13.85],
          [0, 14],
        ],
        32,
      ),
    [],
  );
  useGeometryCleanup(body);
  const chrome = <meshStandardMaterial color="#d9dce1" metalness={1} roughness={0.2} />;
  return (
    <group position={position} rotation-z={-Math.PI / 2}>
      <group position-y={-7}>
        <mesh geometry={body}>
          <meshPhysicalMaterial color="#141416" roughness={0.3} metalness={0.4} clearcoat={0.8} clearcoatRoughness={0.1} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.5, 0.5, 0.01, 8]} />
          {chrome}
        </mesh>
        {[2.95, 9.4].map((y) => (
          <mesh key={y} position-y={y}>
            <cylinderGeometry args={[0.515, 0.515, 0.35, 32]} />
            {chrome}
          </mesh>
        ))}
        {/* Clipe em −x local = para cima depois do giro. */}
        <Block size={[0.14, 5.2, 0.3]} radius={0.12} bevel={0.04} position={[-0.6, 10.9, 0]}>
          {chrome}
        </Block>
      </group>
    </group>
  );
}

const KIT_MUG = { r: 4.1, h: 9.5, printW: 19, printH: 8 };

/** Caneca branca sublimada (faixa de 19 × 8 cm) deitada no berço: fundo para a frente, arte para cima, alça para a esquerda. */
function KitMug({ art, label, position }: Pick<ModelProps, "art" | "label"> & { position: Vec3 }) {
  const texture = useArtTexture(KIT_MUG.printW / KIT_MUG.printH, "front", art, label);
  const { r, h } = KIT_MUG;
  const body = useMemo(
    () =>
      lathe(
        [
          [0, 0.06],
          [r - 0.8, 0],
          [r - 0.15, 0.04],
          [r - 0.02, 0.2],
          [r, 0.45],
          [r, h - 0.25],
          [r - 0.03, h - 0.06],
          [r - 0.12, h],
          [r - 0.32, h],
          [r - 0.4, h - 0.08],
          [r - 0.4, 1],
          [r - 0.75, 0.65],
          [0, 0.6],
        ],
        96,
      ),
    [r, h],
  );
  const band = useMemo(() => bandGeometry({ radiusTop: r + 0.025, radiusBottom: r + 0.025, height: KIT_MUG.printH, width: KIT_MUG.printW, rows: 4 }), [r]);
  const handle = useMemo(() => handleGeometry(r - 0.2, h * 0.21, h * 0.8, 3.1, 0.52), [r, h]);
  useGeometryCleanup(body);
  useGeometryCleanup(band);
  useGeometryCleanup(handle);
  const ceramic = <meshPhysicalMaterial color="#fbfbfb" roughness={0.12} clearcoat={1} clearcoatRoughness={0.05} />;
  return (
    // Torno em y; deitada: y → −z (boca para o fundo), +z do torno (frente da arte) → para cima.
    <group position={position} rotation-x={-Math.PI / 2}>
      <group position-y={-h / 2}>
        <mesh geometry={body}>{ceramic}</mesh>
        <group position-y={h / 2 + 0.1}>
          <PrintBand geometry={band} map={texture} />
        </group>
        {/* A alça nasce em +x; meia-volta a leva para −x (a esquerda, para o lado do caderno). */}
        <mesh geometry={handle} rotation-y={Math.PI}>
          {ceramic}
        </mesh>
      </group>
    </group>
  );
}

/** Opção "Modelo" do kit: "agenda + boné + caneta + garrafa" troca a caneca pelo boné. */
function kitWithCap(spec: MockupSpec) {
  const model = (spec.details ?? "").split(" | ").find((value) => value.startsWith("agenda")) ?? "";
  return /\bbone\b/.test(model);
}

function ExecutiveKit({ spec, art, label, showDims }: ModelProps) {
  const S = 2.5 / EXEC.w;
  const lidW = EXEC.w + 2 * EXEC.wall + 0.2;
  const lidD = EXEC.d + 2 * EXEC.wall + 0.2;
  const skirt = 3;
  const black = <meshPhysicalMaterial color="#161619" roughness={0.58} clearcoat={0.15} clearcoatRoughness={0.4} sheen={0.35} sheenColor="#3a3a42" sheenRoughness={0.6} />;
  const { bottle, notebook, pen, side } = EXEC_ITEMS;
  const seat = EXEC.insertTop - EXEC.pocket;
  const withCap = kitWithCap(spec);
  // Boné premium preto (a opção diz "preto ou branco"): mesma arte, no DTF da frente.
  const capSpec = useMemo<MockupSpec>(() => ({ ...spec, kind: "cap", variant: null, widthCm: 12, heightCm: 6, baseColor: "#1c1c1e", accentColor: null }), [spec]);
  // Verso do cliente: na face de fora da tampa aberta (voltada para −z), na mesma área da capa do caderno.
  const backArt = useBackTexture(COVER.w / COVER.d, spec, art, label, undefined, "blank");
  const ownBack = hasArtContent(art.back);
  return (
    <group userData={{ view: { elevation: 0.72 } }}>
      <group scale={S}>
        <Tray w={EXEC.w} d={EXEC.d} h={EXEC.h} wall={EXEC.wall} floor={EXEC.floor} radius={0.6} bevel={0.15} material={black} />
        {/* Tampa articulada na borda de trás, aberta ~100° (quase de pé, como na foto): o forro vira fundo. */}
        <group position={[0, EXEC.h, -EXEC.d / 2]} rotation-x={-1.74}>
          <group position={[0, 0.35, EXEC.d / 2]}>
            <Tray w={lidW} d={lidD} h={skirt} wall={EXEC.wall} floor={0.35} radius={0.75} bevel={0.15} material={black} rotation={[Math.PI, 0, 0]} />
            <Block size={[lidW - 2 * EXEC.wall - 0.4, 0.18, lidD - 2 * EXEC.wall - 0.4]} radius={0.5} bevel={0.08} position={[0, -0.36 - 0.09, 0]}>
              <meshPhysicalMaterial color="#1b1b1f" roughness={0.7} />
            </Block>
            {/* Face de fora da tampa (y = 0 local; borda da frente = +z local = alto da tampa aberta). Giro [π/2, π, 0]:
                x da arte = −x (direita de quem olha por trás), y da arte = +z, normal = +y. */}
            {ownBack && <Face w={COVER.w} h={COVER.d} radius={0.35} map={backArt} spec={spec} position={[0, LIFT, 0]} rotation={[Math.PI / 2, Math.PI, 0]} />}
          </group>
        </group>
        <KitInsert />
        <KitBottle art={art} label={label} color="#1a1a1c" position={[bottle.x, seat + bottle.r, bottle.z]} />
        <KitNotebook spec={spec} art={art} label={label} position={[notebook.x, seat, notebook.z]} />
        <KitPen position={[pen.x, seat + 0.5, pen.z]} />
        {withCap ? (
          // Boné deitado de lado no canto direito, aba virada para o caderno (como na foto da versão com boné).
          <group position={[side.x - 3, seat, side.z - 6]} rotation={[0, -0.6, 0]} scale={1 / CAP_SCALE}>
            <CapModel spec={capSpec} art={art} label={label} showDims={showDims} />
          </group>
        ) : (
          <KitMug art={art} label={label} position={[side.x, seat + KIT_MUG.r + 0.1, side.z]} />
        )}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Caixa acrílica: painéis cristal chanfrados, tampa lisa com puxador e a U.V. nas laterais e no fundo (gabarito)
 * ---------------------------------------------------------------------------------------------- */

type AcrylicWall = "front" | "back" | "left" | "right" | "bottom";

/**
 * Plano de impressão de uma parede, por fora (a `out` cm da face), com a UV da planificação do gabarito (123): a
 * lateral frontal em cima do fundo, a traseira embaixo, a esquerda e a direita dos lados. Dobrada, a frente fica de pé;
 * as laterais giram 90° (a borda de fora do painel vira o topo da parede) e a traseira 180°, como na peça montada.
 */
function acrylicPrintGeometry(wall: AcrylicWall, W: number, D: number, H: number, out: number) {
  const across = wall === "left" || wall === "right" ? D : W;
  const tall = wall === "bottom" ? D : H;
  const geometry = new THREE.PlaneGeometry(across, tall, 1, 1);
  const p = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < p.count; i += 1) {
    // a ∈ [−½, ½] ao longo da parede (da esquerda para a direita de quem olha de fora), b ∈ [0, 1] de baixo para cima.
    const a = p.getX(i) / across;
    const b = p.getY(i) / tall + 0.5;
    let pos: [number, number, number];
    let tex: [number, number];
    if (wall === "front") {
      pos = [a * W, b * H, D / 2 + out];
      tex = [a + 0.5, b];
    } else if (wall === "back") {
      // De fora (atrás), a esquerda de quem olha é o +x; no gabarito o topo do painel encosta no fundo.
      pos = [-a * W, b * H, -D / 2 - out];
      tex = [0.5 - a, 1 - b];
    } else if (wall === "left") {
      // De fora (pela esquerda), a direita de quem olha é a frente (+z); a borda de fora do painel é o topo.
      pos = [-W / 2 - out, b * H, a * D];
      tex = [1 - b, a + 0.5];
    } else if (wall === "right") {
      pos = [W / 2 + out, b * H, -a * D];
      tex = [b, 0.5 - a];
    } else {
      // Fundo, visto por baixo: x do painel = x da caixa, topo do painel = frente.
      pos = [a * W, -out, -(b - 0.5) * D];
      tex = [a + 0.5, 1 - b];
    }
    p.setXYZ(i, ...pos);
    uv.setXY(i, ...tex);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Arte com fundo transparente nas imagens enviadas (frente, verso e lados): PNG sem fundo fica só o desenho. */
function withoutImageBackgrounds<T extends ModelProps["art"]>(art: T): T {
  const clear = <A extends { src: string | null; background: string }>(side: A): A => (side.src ? { ...side, background: "rgba(0,0,0,0)" } : side);
  const faces = art.faces ? Object.fromEntries(Object.entries(art.faces).map(([id, face]) => [id, clear(face)])) : art.faces;
  return { ...clear(art), ...(art.back ? { back: clear(art.back) } : {}), ...(faces ? { faces } : {}) };
}

/** U.V. direto no acrílico: brilhante, recortada pelo alfa da arte; vista por dentro (através da caixa), espelhada. */
function AcrylicPrint({ geometry, map }: { geometry: THREE.BufferGeometry; map: THREE.Texture }) {
  return (
    <mesh geometry={geometry} renderOrder={1}>
      <meshPhysicalMaterial map={map} roughness={0.25} clearcoat={0.8} clearcoatRoughness={0.08} alphaTest={0.5} side={THREE.DoubleSide} />
    </mesh>
  );
}

/**
 * Caixa acrílica (123): cristal com tampa lisa e puxador (sem impressão, como diz o gabarito) e a U.V. em cada parte do
 * gabarito: a lateral frontal (arte principal), a traseira (verso) e as superfícies extras "lateral-esquerda",
 * "lateral-direita" e "fundo-da-caixa" (src/lib/superficies.ts). Parte sem arte do cliente fica cristal. "Com Tábua de
 * Frios": a tábua de pinus dentro.
 */
function AcrylicBox({ spec, art, label }: ModelProps) {
  // O formato traz largura × profundidade × altura; sem a altura, 15 cm (10 cm na de 40 cm).
  const W = cm(spec.widthCm, 25, 8);
  const D = cm(spec.heightCm, 25, 8);
  const H = spec.depthCm >= 5 ? spec.depthCm : W >= 38 ? 10 : 15;
  const t = 0.3;
  const S = 2.3 / Math.max(W, D, H);
  const bevel = t * 0.28;
  const decal = useMemo(() => withoutImageBackgrounds(art), [art]);
  const front = useArtTexture(W / H, "front", decal, label);
  const back = useBackTexture(W / H, spec, decal, label, undefined, "blank");
  const left = useFaceTexture(H / D, decal, "lateral-esquerda", label);
  const right = useFaceTexture(H / D, decal, "lateral-direita", label);
  const bottomArt = useFaceTexture(W / D, decal, "fundo-da-caixa", label);
  const printed = {
    back: hasArtContent(art.back),
    left: hasArtContent(art.faces?.["lateral-esquerda"]),
    right: hasArtContent(art.faces?.["lateral-direita"]),
    bottom: hasArtContent(art.faces?.["fundo-da-caixa"]),
  };
  const withBoard = /\bcom tabua\b/.test(spec.details ?? "");
  const pine = usePineTexture();

  const parts = useMemo(() => {
    // A impressão fica 0,03 cm por fora da face de fora de cada parede.
    const out = 0.03;
    return {
      bottom: plateGeometry(W, D, t, 0.15, bevel),
      frontBack: plateGeometry(W, H - t, t, 0.15, bevel),
      sides: plateGeometry(D - 2 * t, H - t, t, 0.15, bevel),
      lid: plateGeometry(W + 0.2, D + 0.2, t, 0.5, bevel),
      tab: plateGeometry(6, 3.2, t, 1.2, bevel),
      front: acrylicPrintGeometry("front", W, D, H, out),
      back: acrylicPrintGeometry("back", W, D, H, out),
      left: acrylicPrintGeometry("left", W, D, H, out),
      right: acrylicPrintGeometry("right", W, D, H, out),
      floor: acrylicPrintGeometry("bottom", W, D, H, out),
    };
  }, [W, D, H, bevel]);
  useEffect(() => () => Object.values(parts).forEach((geometry) => geometry.dispose()), [parts]);

  const wallY = t + (H - t) / 2;
  const glass = <AcrylicMaterials />;
  const boardT = 1.8;
  return (
    <group userData={{ view: { elevation: 0.45 } }}>
      <group scale={S}>
        {withBoard && (
          <mesh position={[0, t + boardT / 2 + 0.02, 0]}>
            <boxGeometry args={[W - 2 * t - 0.6, boardT, D - 2 * t - 0.6]} />
            <meshPhysicalMaterial map={pine} roughness={0.66} clearcoat={0.08} clearcoatRoughness={0.6} />
          </mesh>
        )}
        <mesh geometry={parts.bottom} position-y={t / 2} rotation-x={-Math.PI / 2}>
          {glass}
        </mesh>
        <mesh geometry={parts.frontBack} position={[0, wallY, D / 2 - t / 2]}>
          {glass}
        </mesh>
        <mesh geometry={parts.frontBack} position={[0, wallY, -D / 2 + t / 2]}>
          {glass}
        </mesh>
        <mesh geometry={parts.sides} position={[W / 2 - t / 2, wallY, 0]} rotation-y={Math.PI / 2}>
          {glass}
        </mesh>
        <mesh geometry={parts.sides} position={[-W / 2 + t / 2, wallY, 0]} rotation-y={Math.PI / 2}>
          {glass}
        </mesh>
        {/* Tampa fechada, um pouco maior que a caixa, com o puxador em pé no meio. */}
        <mesh geometry={parts.lid} position-y={H + t / 2} rotation-x={-Math.PI / 2}>
          {glass}
        </mesh>
        <mesh geometry={parts.tab} position={[0, H + t + 1.5, -D * 0.12]}>
          {glass}
        </mesh>

        <AcrylicPrint geometry={parts.front} map={front} />
        {printed.back && <AcrylicPrint geometry={parts.back} map={back} />}
        {printed.left && <AcrylicPrint geometry={parts.left} map={left} />}
        {printed.right && <AcrylicPrint geometry={parts.right} map={right} />}
        {printed.bottom && <AcrylicPrint geometry={parts.floor} map={bottomArt} />}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Solapa: cartão dobrado com furo euro grampeado no saquinho, pendurado num gancho de PDV
 * ---------------------------------------------------------------------------------------------- */

const CANDY_COLORS = ["#e02018", "#f0a000", "#f8e028", "#b0c818", "#18b0e8", "#0888c8", "#e02888"];

/** Furo euro (fenda com calota no meio), amostrado como união de cápsula e círculo em volta de (cx, cy). */
function euroHole(cx: number, cy: number, slotW: number, slotH: number, bumpR: number, bumpY: number, steps = 56) {
  const a = Math.max(slotW / 2 - slotH / 2, 0);
  const inside = (x: number, y: number) => Math.hypot(Math.max(Math.abs(x) - a, 0), y) <= slotH / 2 || Math.hypot(x, y - bumpY) <= bumpR;
  const path = new THREE.Path();
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let lo = 0;
    let hi = slotW;
    for (let k = 0; k < 18; k += 1) {
      const mid = (lo + hi) / 2;
      if (inside(dx * mid, dy * mid)) lo = mid;
      else hi = mid;
    }
    if (i === 0) path.moveTo(cx + dx * lo, cy + dy * lo);
    else path.lineTo(cx + dx * lo, cy + dy * lo);
  }
  path.closePath();
  return path;
}

/** Contorno da metade do cartão: cantos de baixo arredondados, cantos de cima retos (é a dobra). */
function cardShape(w: number, h: number, radius: number) {
  const r = safeRadius(radius, w, h);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2);
  shape.lineTo(-w / 2, h / 2);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return shape;
}

/**
 * Face de uma metade da solapa com a UV na folha aberta (W × H, dobra no meio): a frente mostra a metade de baixo da
 * arte; a de trás, a metade de cima, que na dobra gira em volta do vinco (de cabeça para baixo para quem olha a frente,
 * como na peça real). `back`: a malha vai girada meia-volta em y (o x local é espelhado).
 */
function halfSheetFace(shape: THREE.Shape, W: number, H: number, back: boolean) {
  const geometry = new THREE.ShapeGeometry(shape, 10);
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const hF = H / 2;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    // Altura a partir da borda de baixo da face (0) até o vinco (hF).
    const up = position.getY(i) + hF / 2;
    uv.setXY(i, back ? 0.5 - x / W : x / W + 0.5, back ? 1 - up / H : up / H);
  }
  uv.needsUpdate = true;
  return geometry;
}

/** Meia-cana da dobra no topo do cartão, ligando a frente (z = +g) ao verso (z = −g). */
function foldGeometry(w: number, g: number, segments = 12) {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= segments; j += 1) {
    const a = (j / segments) * Math.PI;
    positions.push(-w / 2, g * Math.sin(a), g * Math.cos(a), w / 2, g * Math.sin(a), g * Math.cos(a));
  }
  for (let j = 0; j < segments; j += 1) {
    const i = j * 2;
    indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

type BagShape = { w: number; top: number; bottom: number; fillTop: number; cardBottom: number; seal: number; bulge: number };

/** Filme do saquinho: estufa em volta do conteúdo, achata na solda de baixo e dentro do cartão. */
function bagFilmGeometry(bag: BagShape, side: 1 | -1) {
  const geometry = new THREE.PlaneGeometry(bag.w, bag.top - bag.bottom, 28, 40);
  geometry.translate(0, (bag.top + bag.bottom) / 2, 0);
  const p = geometry.getAttribute("position");
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i);
    const y = p.getY(i);
    const across = Math.pow(Math.sin(Math.PI * clamp(x / bag.w + 0.5, 0, 1)), 0.55);
    const up = smoothstep(y, bag.bottom + bag.seal * 0.8, bag.bottom + bag.seal + 1.2);
    const down = 1 - smoothstep(y, bag.fillTop, bag.cardBottom) * 0.82;
    const env = y > bag.cardBottom ? 0 : up * down;
    const wrinkle = 0.035 * Math.sin(x * 2.1 + y * 0.9 + side) * Math.sin(y * 1.7 - x * 0.6);
    p.setZ(i, side * (0.05 + bag.bulge * across * env) + wrinkle * (0.3 + env * 0.7));
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Confeitos coloridos assentados no fundo do saquinho, em duas camadas. */
function candyGeometry(bag: BagShape) {
  const base = new THREE.SphereGeometry(1, 12, 8);
  const random = rng(41);
  const spacing = 1.3;
  const cols = Math.max(1, Math.floor((bag.w - 1.2) / spacing));
  const rows = Math.max(1, Math.floor((bag.fillTop - bag.bottom - bag.seal - 0.8) / 1.1));
  const pieces: Piece[] = [];
  for (let row = 0; row < rows && pieces.length < 140; row += 1) {
    for (let col = 0; col < cols && pieces.length < 140; col += 1) {
      const layer = (row + col) % 2 === 0 ? 1 : -1;
      const x = (col - (cols - 1) / 2) * spacing + (row % 2) * 0.35 + (random() - 0.5) * 0.3;
      const u = clamp(x / bag.w + 0.5, 0.05, 0.95);
      const room = Math.pow(Math.sin(Math.PI * u), 0.55);
      const y = bag.bottom + bag.seal + 0.75 + row * 1.1 + (random() - 0.5) * 0.25;
      const z = layer * 0.24 * room;
      pieces.push(piece(random, [x, y, z], [0.62, 0.62, 0.34], pickColor(random, CANDY_COLORS), 0.35, "z"));
    }
  }
  const merged = mergePieces(base, pieces);
  base.dispose();
  return merged;
}

function Solapa({ spec, art, label }: ModelProps) {
  // Formato = folha aberta (largura × altura); a solapa vai sempre dobrada ao meio, então cada face tem metade da
  // altura (revisão da Padrão de 25/10: "5x10" é uma face de 5 × 5).
  const w = cm(spec.widthCm, 10, 3);
  const sheetH = cm(spec.heightCm, 10, 5);
  const h = sheetH / 2;
  const t = 0.035;
  const g = 0.16;
  const holeY = -clamp(h * 0.2, 0.8, 1.4);
  const slotW = Math.min(2.2, w * 0.42);
  const bump = { r: 0.36, y: 0.16 };
  // Saquinho curto o bastante para o cartão (a arte) continuar dominante no quadro.
  const bagLen = clamp(Math.max(w * 0.9, h * 1.2), 5, 20);
  const bag: BagShape = useMemo(() => {
    const bottom = -h - bagLen;
    return { w: w - 0.3, top: holeY - 0.6, bottom, fillTop: bottom + 0.9 + bagLen * 0.55, cardBottom: -h, seal: 0.8, bulge: 0.75 };
  }, [w, h, holeY, bagLen]);
  const S = 2.4 / (h + bagLen + 1.2);
  const front = useArtTexture(w / sheetH, "front", art, label);

  const shape = useMemo(() => {
    const s = cardShape(w, h, 0.3);
    s.holes.push(euroHole(0, h / 2 + holeY, slotW, 0.5, bump.r, bump.y));
    return s;
  }, [w, h, holeY, slotW, bump.r, bump.y]);
  const panel = useMemo(() => {
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 10 });
    geometry.translate(0, 0, -t / 2);
    return geometry;
  }, [shape]);
  const face = useMemo(() => halfSheetFace(shape, w, sheetH, false), [shape, w, sheetH]);
  const backFace = useMemo(() => halfSheetFace(shape, w, sheetH, true), [shape, w, sheetH]);
  const fold = useMemo(() => foldGeometry(w, g), [w]);
  const filmFront = useMemo(() => bagFilmGeometry(bag, 1), [bag]);
  const filmBack = useMemo(() => bagFilmGeometry(bag, -1), [bag]);
  const candy = useMemo(() => candyGeometry(bag), [bag]);
  const staple = useMemo(() => new THREE.BoxGeometry(1, 0.07, 0.05), []);
  useGeometryCleanup(panel);
  useGeometryCleanup(face);
  useGeometryCleanup(backFace);
  useGeometryCleanup(fold);
  useGeometryCleanup(filmFront);
  useGeometryCleanup(filmBack);
  useGeometryCleanup(candy);
  useGeometryCleanup(staple);

  const rodR = 0.2;
  const rodY = holeY + bump.y + bump.r - rodR;
  const chrome = <meshStandardMaterial color="#dfe2e6" metalness={1} roughness={0.18} />;
  const film = <meshPhysicalMaterial color="#f5f8fa" transparent opacity={0.2} roughness={0.08} clearcoat={1} clearcoatRoughness={0.04} depthWrite={false} side={THREE.DoubleSide} />;
  const stapleX = Math.min(w * 0.28, w / 2 - 0.8);
  const stapleY = -h + 0.45;

  return (
    <group>
      <group scale={S}>
        {/* Cartão dobrado: a impressão (4/0) fica por fora, metade da arte em cada face. */}
        <group position={[0, -h / 2, g]}>
          <mesh geometry={panel}>
            <meshStandardMaterial color="#f7f7f5" roughness={0.7} />
          </mesh>
          <mesh geometry={face} position-z={t / 2 + 0.008}>
            <PrintMaterial map={front} spec={spec} />
          </mesh>
        </group>
        <group position={[0, -h / 2, -g]}>
          <mesh geometry={panel}>
            <meshStandardMaterial color="#f7f7f5" roughness={0.7} />
          </mesh>
          <mesh geometry={backFace} position-z={-t / 2 - 0.008} rotation-y={Math.PI}>
            <PrintMaterial map={front} spec={spec} />
          </mesh>
        </group>
        <mesh geometry={fold}>
          <meshStandardMaterial color={art.background} roughness={roughnessOf(spec)} side={THREE.DoubleSide} />
        </mesh>
        {[-1, 1].map((sx) =>
          [1, -1].map((sz) => (
            <mesh key={`${sx}${sz}`} geometry={staple} position={[sx * stapleX, stapleY, sz * (g + t / 2 + 0.03)]}>
              {chrome}
            </mesh>
          )),
        )}

        {/* Saquinho transparente com confeitos. */}
        <mesh geometry={candy}>
          <meshPhysicalMaterial vertexColors roughness={0.25} clearcoat={1} clearcoatRoughness={0.06} />
        </mesh>
        <mesh geometry={filmFront}>{film}</mesh>
        <mesh geometry={filmBack}>{film}</mesh>
        <mesh position={[0, bag.bottom + bag.seal / 2, 0]}>
          <planeGeometry args={[bag.w, bag.seal]} />
          <meshPhysicalMaterial color="#ffffff" transparent opacity={0.35} roughness={0.45} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        {[-1, 1].map((sx) => (
          <mesh key={sx} position={[sx * (bag.w / 2 - 0.12), (bag.cardBottom + bag.bottom) / 2, 0]}>
            <planeGeometry args={[0.24, bag.cardBottom - bag.bottom]} />
            <meshPhysicalMaterial color="#ffffff" transparent opacity={0.3} roughness={0.3} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        ))}

        {/* Gancho de gôndola passando pelo furo, com a ponta dobrada para cima. */}
        <mesh position={[0, rodY, -0.75]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[rodR, rodR, 6.5, 16]} />
          {chrome}
        </mesh>
        <mesh position={[0, rodY, 2.5]}>
          <sphereGeometry args={[rodR, 16, 12]} />
          {chrome}
        </mesh>
        <mesh position={[0, rodY + 0.5, 2.5]}>
          <cylinderGeometry args={[rodR, rodR, 1, 16]} />
          {chrome}
        </mesh>
        <mesh position={[0, rodY + 1, 2.5]}>
          <sphereGeometry args={[rodR, 16, 12]} />
          {chrome}
        </mesh>
        <Block size={[2.4, 3.4, 0.3]} radius={0.3} bevel={0.06} position={[0, rodY + 0.5, -4.15]}>
          <meshStandardMaterial color="#9a9ea5" metalness={0.8} roughness={0.35} />
        </Block>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Entrada
 * ---------------------------------------------------------------------------------------------- */

/**
 * Caixas e kits, em centímetros reais com bordas chanfradas (extrusões com bevel):
 * - padrão: caixa rígida de presente com papel de seda, tampa suspensa inclinada para a câmera; arte na tampa e na frente;
 * - `cinema`: bandeja de madeira com balde de pipoca (grãos procedurais) e copo com tampa e canudo, arte em faixa cônica;
 * - `executive`: caixa preta de tampa articulada com berço branco: garrafa térmica com sensor, caderno espiral, caneta e
 *   caneca deitada (ou o boné, conforme o modelo do kit);
 * - `sleeve`: solapa com furo euro dobrada ao meio (cada face com metade da altura do formato) sobre saquinho de
 *   confeitos, pendurada num gancho de PDV;
 * - `acrylic`: caixa de acrílico cristal (sem transmission) com tampa impressa em UV e cartão impresso dentro.
 */
export function BoxModel(props: ModelProps) {
  const { spec } = props;
  // Embalagens de papel cartão dos produtos novos (cartons.tsx e baskets.tsx).
  if (spec.variant === "carton") return <CartonBox {...props} />;
  if (spec.variant === "carton-bag") return <CartonBag {...props} />;
  if (spec.variant === "panettone") return <PanettoneBox {...props} />;
  if (spec.variant === "basket") return <BasketBox {...props} />;
  if (spec.variant === "cinema") return <CinemaKit {...props} />;
  if (spec.variant === "executive") return <ExecutiveKit {...props} />;
  if (spec.variant === "sleeve") return <Solapa {...props} />;
  if (spec.variant === "acrylic" || spec.glass) return <AcrylicBox {...props} />;
  return <GiftBox {...props} />;
}
