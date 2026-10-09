"use client";

// Caixas, kits e embalagens: caixa de presente, Kit Cinema, Kit Executivo, solapa e caixa de acrílico.
// Cada variante modela em centímetros dentro de um grupo com escala própria (cm → unidades de cena).

import { useEffect, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import { fontFamily } from "../art";
import { AcrylicMaterials, PrintMaterial, bandGeometry, faceGeometry, makeShape, roughnessOf, useArtTexture, useGeometryCleanup, type ModelProps } from "./shared";
import { PrintBand, handleGeometry, lathe, smoothProfile, type Pt } from "./vessel";
import { BasketBox, PanettoneBox } from "./baskets";
import { CartonBag, CartonBox } from "./cartons";

type Vec3 = [number, number, number];

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
 * Kit Cinema: bandeja de madeira, balde de pipoca e copo com tampa e canudo
 * ---------------------------------------------------------------------------------------------- */

const CINEMA_TRAY = { w: 35, d: 25, h: 2.4, wall: 0.9, floor: 0.6, radius: 2.4, bevel: 0.3 };
const BUCKET = { top: 8.5, bottom: 5.8, height: 19, x: -7, z: -2.5 };
const CUP = { top: 4.5, bottom: 3.1, height: 14, x: 9, z: 4.5 };
const POPCORN_COLORS = ["#fff3d1", "#fbe6b0", "#f6dc9c", "#fff8e6", "#f2d48e", "#fdeec4", "#e2b56a"];

/** Faixa de impressão num tronco de cone (perfil reto entre y = 0,45 e y = altura − 0,2), cobrindo `coverage` da volta. */
function coneBand(rBottom: number, rTop: number, height: number, y0: number, y1: number, coverage: number) {
  const radiusAt = (y: number) => rBottom + (rTop - rBottom) * ((y - 0.45) / (height - 0.65));
  const r0 = radiusAt(y0) + 0.04;
  const r1 = radiusAt(y1) + 0.04;
  // Largura física constante: no raio menor a faixa abre mais o ângulo. Limita a 0,94π para a faixa da
  // frente e a de trás não se sobreporem nas laterais (z-fighting na silhueta).
  const width = Math.min(coverage * Math.PI * (r0 + r1), 0.94 * Math.PI * Math.min(r0, r1));
  return { r0, r1, width, height: y1 - y0, center: (y0 + y1) / 2, aspect: width / Math.hypot(y1 - y0, r1 - r0) };
}

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

function popcornGeometry(floor: number) {
  const base = kernelGeometry();
  const random = rng(17);
  const pieces: Piece[] = [];
  const rim = floor + BUCKET.height;
  const reach = BUCKET.top - 0.9;
  for (let i = 0; i < 220; i += 1) {
    const rho = reach * Math.sqrt(random());
    const phi = random() * Math.PI * 2;
    const dome = 4.3 * Math.pow(Math.max(0, 1 - (rho / BUCKET.top) ** 2), 0.85);
    const s = 0.78 + random() * 0.32;
    pieces.push(
      piece(random, [BUCKET.x + Math.cos(phi) * rho, rim - 0.35 + dome + (random() - 0.5) * 0.8, BUCKET.z + Math.sin(phi) * rho], [s * 1.05, s * 0.86, s], pickColor(random, POPCORN_COLORS)),
    );
  }
  // Algumas pipocas caídas na bandeja, na frente do balde.
  const spilled: [number, number][] = [
    [-1.5, 6.5],
    [0.8, 8.2],
    [2.6, 6.9],
    [-3.6, 9.4],
    [4.3, 10],
    [1.4, 10.4],
  ];
  spilled.forEach(([x, z]) => {
    const s = 0.75 + random() * 0.25;
    pieces.push(piece(random, [x, floor + s * 1.05, z], [s * 1.05, s * 0.86, s], pickColor(random, POPCORN_COLORS)));
  });
  const merged = mergePieces(base, pieces);
  base.dispose();
  return merged;
}

/** Textura de madeira (veios ondulados) para a bandeja. */
function woodTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const random = rng(7);
    ctx.fillStyle = "#b27c4c";
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 150; i += 1) {
      const y0 = random() * 512;
      const amp = 2 + random() * 7;
      const freq = 0.004 + random() * 0.012;
      ctx.strokeStyle = random() > 0.45 ? `rgba(92,52,22,${0.18 + random() * 0.25})` : `rgba(222,170,112,${0.15 + random() * 0.2})`;
      ctx.lineWidth = 0.6 + random() * 2.4;
      ctx.beginPath();
      for (let x = 0; x <= 512; x += 8) {
        const y = y0 + Math.sin(x * freq + i) * amp + Math.sin(x * 0.031 + i * 0.7) * 1.2;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // UV da extrusão = coordenadas em cm: uma volta da textura cobre a bandeja.
  texture.repeat.set(1 / 36, 1 / 36);
  texture.anisotropy = 4;
  return texture;
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

function CinemaKit({ spec, art, label }: ModelProps) {
  const S = 2.5 / CINEMA_TRAY.w;
  const floor = CINEMA_TRAY.floor;
  const bucketBand = coneBand(BUCKET.bottom, BUCKET.top, BUCKET.height, 1.3, BUCKET.height - 1.4, 0.44);
  const cupBand = coneBand(CUP.bottom, CUP.top, CUP.height, 1.2, CUP.height - 1.5, 0.44);
  const bucketArt = useArtTexture(bucketBand.aspect, "front", art, label);
  const cupArt = useArtTexture(cupBand.aspect, "front", art, label);
  // Papel-cartão fosco por padrão; "brilho" no pedido deixa as faixas envernizadas.
  const glossy = spec.finish === "gloss";

  const wood = useMemo(() => woodTexture(), []);
  const straw = useMemo(() => stripeTexture("#e02018"), []);
  useEffect(() => () => wood.dispose(), [wood]);
  useEffect(() => () => straw.dispose(), [straw]);

  const bucket = useMemo(() => lathe(cupProfile(BUCKET.bottom, BUCKET.top, BUCKET.height), 96), []);
  const cup = useMemo(() => lathe(cupProfile(CUP.bottom, CUP.top, CUP.height), 72), []);
  const bucketPrint = useMemo(
    () => bandGeometry({ radiusTop: bucketBand.r1, radiusBottom: bucketBand.r0, height: bucketBand.height, width: bucketBand.width, segments: 72, rows: 10 }),
    [bucketBand.r0, bucketBand.r1, bucketBand.height, bucketBand.width],
  );
  const cupPrint = useMemo(
    () => bandGeometry({ radiusTop: cupBand.r1, radiusBottom: cupBand.r0, height: cupBand.height, width: cupBand.width, segments: 64, rows: 8 }),
    [cupBand.r0, cupBand.r1, cupBand.height, cupBand.width],
  );
  // Monte de pipoca: domo liso por baixo (não deixa buracos) e grãos por cima.
  const filler = useMemo(
    () =>
      lathe(
        smoothProfile([
          [BUCKET.top - 0.45, BUCKET.height - 0.6],
          [BUCKET.top * 0.72, BUCKET.height + 1.6],
          [BUCKET.top * 0.38, BUCKET.height + 3.3],
          [0, BUCKET.height + 3.7],
        ]),
        64,
      ),
    [],
  );
  const lid = useMemo(
    () =>
      lathe(
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
    [],
  );
  const popcorn = useMemo(() => popcornGeometry(floor), [floor]);
  useGeometryCleanup(bucket);
  useGeometryCleanup(cup);
  useGeometryCleanup(bucketPrint);
  useGeometryCleanup(cupPrint);
  useGeometryCleanup(filler);
  useGeometryCleanup(lid);
  useGeometryCleanup(popcorn);

  const paper = <meshPhysicalMaterial color={art.background} roughness={0.42} clearcoat={0.35} clearcoatRoughness={0.2} />;
  const woodMaterial = <meshPhysicalMaterial map={wood} roughness={0.5} clearcoat={0.45} clearcoatRoughness={0.25} />;

  return (
    <group userData={{ view: { elevation: 0.36 } }}>
      <group scale={S}>
        <Tray w={CINEMA_TRAY.w} d={CINEMA_TRAY.d} h={CINEMA_TRAY.h} wall={CINEMA_TRAY.wall} floor={floor} radius={CINEMA_TRAY.radius} bevel={CINEMA_TRAY.bevel} material={woodMaterial} />

        <group position={[BUCKET.x, floor, BUCKET.z]}>
          <mesh geometry={bucket}>{paper}</mesh>
          <mesh position-y={BUCKET.height - 0.15} rotation-x={Math.PI / 2}>
            <torusGeometry args={[BUCKET.top - 0.05, 0.32, 10, 96]} />
            {paper}
          </mesh>
          <group position-y={bucketBand.center}>
            <PrintBand geometry={bucketPrint} map={bucketArt} glossy={glossy} />
          </group>
          <group position-y={bucketBand.center} rotation-y={Math.PI}>
            <PrintBand geometry={bucketPrint} map={bucketArt} glossy={glossy} />
          </group>
          <mesh geometry={filler}>
            <meshStandardMaterial color="#f3dca2" roughness={0.9} />
          </mesh>
        </group>
        <mesh geometry={popcorn}>
          <meshStandardMaterial vertexColors roughness={0.82} />
        </mesh>

        <group position={[CUP.x, floor, CUP.z]}>
          <mesh geometry={cup}>{paper}</mesh>
          <mesh position-y={CUP.height - 0.12} rotation-x={Math.PI / 2}>
            <torusGeometry args={[CUP.top - 0.02, 0.2, 8, 72]} />
            {paper}
          </mesh>
          <group position-y={cupBand.center}>
            <PrintBand geometry={cupPrint} map={cupArt} glossy={glossy} />
          </group>
          <group position-y={cupBand.center} rotation-y={Math.PI}>
            <PrintBand geometry={cupPrint} map={cupArt} glossy={glossy} />
          </group>
          <mesh geometry={lid} position-y={CUP.height - 0.2}>
            <meshPhysicalMaterial color="#f7f7f5" roughness={0.28} clearcoat={0.6} side={THREE.DoubleSide} />
          </mesh>
          {/* Canudo atravessando a tampa, levemente inclinado: ~8 cm para fora, como no copo real. */}
          <group position={[1, CUP.height + 1, 0.4]} rotation={[0.1, 0, -0.14]}>
            <mesh position-y={18 / 2 - 10}>
              <cylinderGeometry args={[0.32, 0.32, 18, 18]} />
              <meshPhysicalMaterial map={straw} roughness={0.3} clearcoat={0.6} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Kit Executivo: caixa rígida preta aberta, espuma com agenda, garrafa térmica e caneta; caneca na frente
 * ---------------------------------------------------------------------------------------------- */

const EXEC = { w: 42, d: 28, h: 9, wall: 0.35, floor: 0.35, foamTop: 8.2, pocket: 1.6, foamBevel: 0.25 };
const EXEC_ITEMS = {
  agenda: { x: -11.5, z: 0, w: 15, d: 21 },
  bottle: { x: 1.8, z: 0 },
  pen: { x: 8.3, z: 0 },
  mugSlot: { x: 14.3, z: -4.5, r: 4.4 },
};

/** Camada de cima da espuma, com os berços vazados (no shape, y = −z do mundo). */
function foamTopGeometry() {
  const b = EXEC.foamBevel;
  const w = EXEC.w - 2 * EXEC.wall - 0.1;
  const d = EXEC.d - 2 * EXEC.wall - 0.1;
  const { agenda, bottle, pen, mugSlot } = EXEC_ITEMS;
  const shape = makeShape("rect", w - 2 * b, d - 2 * b, 0.5);
  shape.holes.push(roundedRectPath(agenda.x, -agenda.z, 15.5 + 2 * b, 21.5 + 2 * b, 0.6));
  shape.holes.push(roundedRectPath(bottle.x, -bottle.z, 7.3 + 2 * b, 24.6 + 2 * b, (7.3 + 2 * b) * 0.45));
  shape.holes.push(roundedRectPath(pen.x, -pen.z, 1.5 + 2 * b, 14.6 + 2 * b, (1.5 + 2 * b) * 0.45));
  const mug = new THREE.Path();
  mug.absarc(mugSlot.x, -mugSlot.z, mugSlot.r + b, 0, Math.PI * 2, false);
  shape.holes.push(mug);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: EXEC.pocket - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 12 });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, EXEC.foamTop - EXEC.pocket + b, 0);
  return geometry;
}

function FoamInsert() {
  const top = useMemo(() => foamTopGeometry(), []);
  useGeometryCleanup(top);
  const baseH = EXEC.foamTop - EXEC.pocket - EXEC.floor;
  const foam = <meshPhysicalMaterial color="#2a2a2e" roughness={0.95} sheen={0.6} sheenColor="#6a6a74" sheenRoughness={0.9} />;
  return (
    <group>
      <mesh geometry={top}>{foam}</mesh>
      <Block size={[EXEC.w - 2 * EXEC.wall - 0.1, baseH, EXEC.d - 2 * EXEC.wall - 0.1]} radius={0.5} bevel={0.05} position={[0, EXEC.floor + baseH / 2, 0]}>
        {foam}
      </Block>
    </group>
  );
}

/** Agenda de capa dura deitada: duas capas, miolo creme recuado, lombada arredondada e arte na capa. */
function Agenda({ spec, art, label, position }: Pick<ModelProps, "spec" | "art" | "label"> & { position: Vec3 }) {
  const { w, d } = EXEC_ITEMS.agenda;
  const board = 0.25;
  const pages = 1.5;
  const bevel = 0.08;
  const faceW = w - 2 * bevel;
  const faceD = d - 2 * bevel;
  const cover = useArtTexture(faceW / faceD, "front", art, label);
  const wrap = <Coated color={art.background} spec={spec} />;
  return (
    <group position={position}>
      <Block size={[w, board, d]} radius={0.35} bevel={bevel} position={[0, board / 2, 0]}>
        {wrap}
      </Block>
      <Block size={[w - 0.6, pages, d - 0.6]} radius={0.15} bevel={0.03} position={[0.25, board + pages / 2, 0]}>
        <meshStandardMaterial color="#f3eee2" roughness={0.92} />
      </Block>
      <Block size={[w, board, d]} radius={0.35} bevel={bevel} position={[0, board * 1.5 + pages, 0]}>
        {wrap}
      </Block>
      <Block size={[0.55, pages + board * 2, d]} radius={0.26} bevel={0.1} position={[-w / 2 + 0.2, (pages + board * 2) / 2, 0]}>
        {wrap}
      </Block>
      <Face w={faceW} h={faceD} radius={0.35} map={cover} spec={spec} position={[0, pages + board * 2 + LIFT, 0]} rotation={[-Math.PI / 2, 0, 0]} />
    </group>
  );
}

/** Mostrador de temperatura da tampa (sensor térmico). */
function displayTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#5fe3ff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 46px ${fontFamily()}`;
    ctx.fillText("45°", 66, 62);
    ctx.font = `600 16px ${fontFamily()}`;
    ctx.fillText("TEMP", 64, 98);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Garrafa térmica deitada ao longo de z, tampa (com sensor) virada para a frente. */
function ThermalBottle({ position }: { position: Vec3 }) {
  const body = useMemo(
    () =>
      lathe(
        [
          [0, 0],
          [3.0, 0],
          [3.4, 0.15],
          [3.5, 0.6],
          [3.5, 18.3],
          [3.35, 19.3],
          [2.8, 20.1],
          [2.5, 20.5],
          [0, 20.55],
        ],
        64,
      ),
    [],
  );
  const cap = useMemo(
    () =>
      lathe(
        [
          [0, 20.75],
          [2.58, 20.75],
          [2.62, 20.9],
          [2.62, 23.55],
          [2.5, 23.92],
          [2.2, 24],
          [0, 24],
        ],
        64,
      ),
    [],
  );
  const display = useMemo(() => displayTexture(), []);
  useEffect(() => () => display.dispose(), [display]);
  useGeometryCleanup(body);
  useGeometryCleanup(cap);
  return (
    <group position={position}>
      <group rotation-x={Math.PI / 2} position-z={-12}>
        <mesh geometry={body}>
          <meshPhysicalMaterial color="#f1f1ef" roughness={0.45} clearcoat={0.3} />
        </mesh>
        <mesh position-y={20.65}>
          <cylinderGeometry args={[2.56, 2.56, 0.3, 64]} />
          <meshStandardMaterial color="#d9dce1" metalness={1} roughness={0.2} />
        </mesh>
        <mesh geometry={cap}>
          <meshStandardMaterial color="#1b1b1e" roughness={0.55} />
        </mesh>
      </group>
      <mesh position-z={12.02}>
        <circleGeometry args={[1.5, 48]} />
        <meshStandardMaterial color="#0b0d10" roughness={0.12} emissive="#ffffff" emissiveMap={display} emissiveIntensity={0.9} />
      </mesh>
    </group>
  );
}

/** Caneta metálica deitada ao longo de z, com anel preto e clipe para cima. */
function Pen({ position }: { position: Vec3 }) {
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
  const metal = <meshStandardMaterial color="#d9dce1" metalness={1} roughness={0.22} />;
  return (
    <group position={position}>
      <group rotation-x={Math.PI / 2} position-z={-7}>
        <mesh geometry={body}>{metal}</mesh>
        <mesh position-y={3.3}>
          <cylinderGeometry args={[0.515, 0.515, 0.6, 32]} />
          <meshStandardMaterial color="#111113" roughness={0.4} />
        </mesh>
        {/* Clipe em −z local = topo depois da rotação. */}
        <Block size={[0.3, 5.2, 0.14]} radius={0.12} bevel={0.04} position={[0, 10.6, -0.6]}>
          {metal}
        </Block>
        <mesh position={[0, 8.05, -0.62]}>
          <sphereGeometry args={[0.13, 16, 12]} />
          {metal}
        </mesh>
      </group>
    </group>
  );
}

const KIT_MUG = { r: 4.1, h: 9.5, printW: 19, printH: 8 };

/** Caneca branca sublimada (faixa de 19 × 8 cm), alça atrás. */
function KitMug({ art, label, position, rotationY }: Pick<ModelProps, "art" | "label"> & { position: Vec3; rotationY: number }) {
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
    <group position={position} rotation-y={rotationY}>
      <mesh geometry={body}>{ceramic}</mesh>
      <group position-y={h / 2 + 0.1}>
        <PrintBand geometry={band} map={texture} />
      </group>
      <mesh geometry={handle} rotation-y={Math.PI / 2}>
        {ceramic}
      </mesh>
    </group>
  );
}

function ExecutiveKit({ spec, art, label }: ModelProps) {
  const S = 2.5 / EXEC.w;
  const lidW = EXEC.w + 2 * EXEC.wall + 0.2;
  const lidD = EXEC.d + 2 * EXEC.wall + 0.2;
  const skirt = 3;
  const black = <meshPhysicalMaterial color="#161619" roughness={0.58} clearcoat={0.15} clearcoatRoughness={0.4} sheen={0.35} sheenColor="#3a3a42" sheenRoughness={0.6} />;
  const { agenda, bottle, pen } = EXEC_ITEMS;
  const seat = EXEC.foamTop - EXEC.pocket;
  return (
    <group userData={{ view: { elevation: 0.68 } }}>
      <group scale={S}>
        <Tray w={EXEC.w} d={EXEC.d} h={EXEC.h} wall={EXEC.wall} floor={EXEC.floor} radius={0.6} bevel={0.15} material={black} />
        {/* Tampa articulada na borda de trás, aberta ~110°: o forro de cetim vira fundo da foto. */}
        <group position={[0, EXEC.h, -EXEC.d / 2]} rotation-x={-1.92}>
          <group position={[0, 0.35, EXEC.d / 2]}>
            <Tray w={lidW} d={lidD} h={skirt} wall={EXEC.wall} floor={0.35} radius={0.75} bevel={0.15} material={black} rotation={[Math.PI, 0, 0]} />
            <Block size={[lidW - 2 * EXEC.wall - 0.4, 0.18, lidD - 2 * EXEC.wall - 0.4]} radius={0.5} bevel={0.08} position={[0, -0.36 - 0.09, 0]}>
              <meshPhysicalMaterial color="#1d1d22" roughness={0.32} sheen={1} sheenColor="#8a8a98" sheenRoughness={0.3} />
            </Block>
          </group>
        </group>
        <FoamInsert />
        <Agenda spec={spec} art={art} label={label} position={[agenda.x, seat, agenda.z]} />
        {/* Garrafa (Ø 7 cm) afundada no berço: o topo fica rente à borda e a tampa da caixa fecha. */}
        <ThermalBottle position={[bottle.x, EXEC.h - 3.5, bottle.z]} />
        <Pen position={[pen.x, seat + 0.55, pen.z]} />
        {/* A caneca sai do berço vazio e fica na frente, com a arte para a câmera. */}
        <KitMug art={art} label={label} position={[13.5, 0, EXEC.d / 2 + 5.5]} rotationY={-0.35} />
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Caixa acrílica: painéis transparentes chanfrados, tampa impressa em UV e cartão impresso dentro
 * ---------------------------------------------------------------------------------------------- */

const SHRED_COLORS = ["#d8b98c", "#c9a271", "#e8d3ad", "#b88d5c", "#efe2c6"];

/** Papel picado (tirinhas sanfonadas) cobrindo o fundo da caixa. */
function shredGeometry(w: number, d: number, floor: number, height: number) {
  // Tirinha deitada (comprimento em x, largura em z), sanfonada em y.
  const base = new THREE.PlaneGeometry(4, 0.32, 10, 1);
  base.rotateX(-Math.PI / 2);
  const p = base.getAttribute("position");
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i);
    p.setY(i, Math.sin(x * 4.2) * 0.12 + Math.sin(x * 1.3) * 0.25);
  }
  base.computeVertexNormals();
  const random = rng(29);
  const spanX = Math.max(w / 2 - 2.6, 0.5);
  const spanZ = Math.max(d / 2 - 2.6, 0.5);
  const count = Math.round(clamp(w * d * 0.9, 150, 620));
  const pieces: Piece[] = [];
  for (let i = 0; i < count; i += 1) {
    const layer = Math.pow(random(), 1.6);
    const s = 0.8 + random() * 0.4;
    // Inclinação de até ±0,4 rad: a ponta mais baixa fica sempre acima do fundo.
    pieces.push(piece(random, [(random() * 2 - 1) * spanX, floor + 1.7 + layer * height, (random() * 2 - 1) * spanZ], [s, 1, 1], pickColor(random, SHRED_COLORS), 0.4));
  }
  const merged = mergePieces(base, pieces);
  base.dispose();
  return merged;
}

function AcrylicBox({ spec, art, label }: ModelProps) {
  // O formato traz largura × profundidade; a altura vem do catálogo (15 cm, 10 cm na de 40 cm) quando não informada.
  const W = cm(spec.widthCm, 25, 8);
  const D = cm(spec.heightCm, 25, 8);
  const H = spec.depthCm >= 5 ? spec.depthCm : W >= 38 ? 10 : 15;
  const t = spec.depthCm > 0 && spec.depthCm < 1.2 ? spec.depthCm : 0.3;
  const S = 2.3 / Math.max(W, D, H);
  const bevel = t * 0.28;
  const lidW = W + 0.2;
  const lidD = D + 0.2;
  const margin = 0.8;
  const printW = lidW - 2 * margin;
  const printD = lidD - 2 * margin;
  const cardW = W - 2 * t - 2.4;
  const cardH = (H - t) * 0.78;
  const lidArt = useArtTexture(printW / printD, "front", art, label);
  const cardArt = useArtTexture(cardW / cardH, "front", art, label);

  const bottom = useMemo(() => plateGeometry(W, D, t, 0.15, bevel), [W, D, t, bevel]);
  const frontBack = useMemo(() => plateGeometry(W, H - t, t, 0.15, bevel), [W, H, t, bevel]);
  const sides = useMemo(() => plateGeometry(D - 2 * t, H - t, t, 0.15, bevel), [D, H, t, bevel]);
  const lid = useMemo(() => plateGeometry(lidW, lidD, t, 0.5, bevel), [lidW, lidD, t, bevel]);
  const card = useMemo(() => plateGeometry(cardW, cardH, 0.06, 0.25, 0.01), [cardW, cardH]);
  const shred = useMemo(() => shredGeometry(W - 2 * t, D - 2 * t, t, 1.4), [W, D, t]);
  useGeometryCleanup(bottom);
  useGeometryCleanup(frontBack);
  useGeometryCleanup(sides);
  useGeometryCleanup(lid);
  useGeometryCleanup(card);
  useGeometryCleanup(shred);

  const wallY = t + (H - t) / 2;
  const glass = <AcrylicMaterials />;
  // Impressão UV direto no acrílico: sai brilhante.
  const uvSpec: MockupSpec = { ...spec, finish: "gloss", clearcoat: Math.max(spec.clearcoat, 0.8) };
  return (
    <group userData={{ view: { elevation: 0.45 } }}>
      <group scale={S}>
        <mesh geometry={shred}>
          <meshStandardMaterial vertexColors roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
        {/* Cartão impresso encostado na parede de trás, aparecendo através da frente. */}
        <group position={[0, t + 0.3 + cardH / 2, -D / 2 + t + 0.7]} rotation-x={-0.06}>
          <mesh geometry={card}>
            <meshStandardMaterial color="#f7f7f5" roughness={0.85} />
          </mesh>
          <Face w={cardW} h={cardH} radius={0.25} map={cardArt} spec={spec} position={[0, 0, 0.03 + LIFT]} />
        </group>

        <mesh geometry={bottom} position-y={t / 2} rotation-x={-Math.PI / 2}>
          {glass}
        </mesh>
        <mesh geometry={frontBack} position={[0, wallY, D / 2 - t / 2]}>
          {glass}
        </mesh>
        <mesh geometry={frontBack} position={[0, wallY, -D / 2 + t / 2]}>
          {glass}
        </mesh>
        <mesh geometry={sides} position={[W / 2 - t / 2, wallY, 0]} rotation-y={Math.PI / 2}>
          {glass}
        </mesh>
        <mesh geometry={sides} position={[-W / 2 + t / 2, wallY, 0]} rotation-y={Math.PI / 2}>
          {glass}
        </mesh>

        {/* Tampa apoiada e deslizada para trás, mostrando a abertura; impressão UV com borda cristal. */}
        <group position={[0, 0, -D * 0.12]} rotation-y={0.05}>
          <mesh geometry={lid} position-y={H + t / 2} rotation-x={-Math.PI / 2}>
            {glass}
          </mesh>
          <Face w={printW} h={printD} radius={0.4} map={lidArt} spec={uvSpec} position={[0, H + t + LIFT, 0]} rotation={[-Math.PI / 2, 0, 0]} />
          <mesh position-y={H + t + LIFT * 0.5} rotation-x={Math.PI / 2}>
            <planeGeometry args={[printW, printD]} />
            <meshStandardMaterial color="#f4f4f4" roughness={0.6} />
          </mesh>
        </group>
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
  // Formato = face do cartão dobrado (largura × altura).
  const w = cm(spec.widthCm, 10, 3);
  const h = cm(spec.heightCm, 5, 2.5);
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
  const front = useArtTexture(w / h, "front", art, label);

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
  const face = useMemo(() => faceGeometry(shape, w, h), [shape, w, h]);
  const fold = useMemo(() => foldGeometry(w, g), [w]);
  const filmFront = useMemo(() => bagFilmGeometry(bag, 1), [bag]);
  const filmBack = useMemo(() => bagFilmGeometry(bag, -1), [bag]);
  const candy = useMemo(() => candyGeometry(bag), [bag]);
  const staple = useMemo(() => new THREE.BoxGeometry(1, 0.07, 0.05), []);
  useGeometryCleanup(panel);
  useGeometryCleanup(face);
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
        {/* Cartão: frente e verso impressos (4/0 fica por fora dos dois lados depois de dobrado). */}
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
          <mesh geometry={face} position-z={-t / 2 - 0.008} rotation-y={Math.PI}>
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
 * - `executive`: caixa preta aberta com espuma (agenda com arte na capa, garrafa térmica com sensor, caneta) e caneca sublimada;
 * - `sleeve`: solapa com furo euro dobrada sobre saquinho de confeitos, pendurada num gancho de PDV;
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
