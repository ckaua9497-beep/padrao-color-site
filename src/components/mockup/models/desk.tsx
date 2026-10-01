"use client";

// Objetos de mesa: quebra-cabeça, régua, suporte de celular e wobbler.

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import { KIND_INFO, artAspect } from "@/lib/mockup-kinds";
import { fontFamily, heartPath, roundPath } from "../art";
import { useAnimate } from "../viewer-hooks";
import {
  Dimensions,
  PrintMaterial,
  Slab,
  backVariant,
  faceGeometry,
  makeShape,
  sizeLabels,
  useArtTexture,
  useGeometryCleanup,
  type MaskPath,
  type ModelProps,
} from "./shared";

/** Escala dos objetos de mesa: unidades de cena por cm (a régua de 30 cm fica com ~2,55). */
const UNIT = 0.085;

type Pt = [number, number];

const clamp = THREE.MathUtils.clamp;

// ---------------------------------------------------------------------------------------------
// Utilitários de geometria

/** UV das tampas pela posição no retângulo w × h centrado na origem: a arte segue contínua entre peças. */
function planarUV(w: number, h: number): THREE.UVGenerator {
  return {
    generateTopUV(geometry, vertices, a, b, c) {
      return [a, b, c].map((i) => new THREE.Vector2(vertices[i * 3] / w + 0.5, vertices[i * 3 + 1] / h + 0.5));
    },
    generateSideWallUV() {
      return [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];
    },
  };
}

/**
 * O ExtrudeGeometry junta fundo e topo no grupo 0 (fundo primeiro, mesma contagem). Separa em
 * 0 = topo (arte), 1 = laterais e 2 = fundo, para o verso ganhar material próprio.
 */
function splitLids<T extends THREE.BufferGeometry>(geometry: T): T {
  const [lids, ...rest] = geometry.groups;
  if (!lids) return geometry;
  const half = lids.count / 2;
  geometry.clearGroups();
  geometry.addGroup(lids.start, half, 2);
  geometry.addGroup(lids.start + half, half, 0);
  rest.forEach((group) => geometry.addGroup(group.start, group.count, group.materialIndex ?? 1));
  return geometry;
}

/** Junta geometrias não indexadas num único buffer com um grupo por material: 3 draw calls para o tabuleiro todo. */
function mergeByMaterial(geometries: THREE.BufferGeometry[], materialCount: number) {
  const buckets = Array.from({ length: materialCount }, () => ({ position: [] as number[], normal: [] as number[], uv: [] as number[] }));
  for (const geometry of geometries) {
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const uv = geometry.getAttribute("uv");
    for (const group of geometry.groups) {
      const bucket = buckets[Math.min(group.materialIndex ?? 0, materialCount - 1)];
      for (let i = group.start; i < group.start + group.count; i += 1) {
        bucket.position.push(position.getX(i), position.getY(i), position.getZ(i));
        bucket.normal.push(normal.getX(i), normal.getY(i), normal.getZ(i));
        bucket.uv.push(uv.getX(i), uv.getY(i));
      }
    }
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(buckets.flatMap((b) => b.position), 3));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(buckets.flatMap((b) => b.normal), 3));
  merged.setAttribute("uv", new THREE.Float32BufferAttribute(buckets.flatMap((b) => b.uv), 2));
  let start = 0;
  buckets.forEach((bucket, index) => {
    const count = bucket.position.length / 3;
    if (count) merged.addGroup(start, count, index);
    start += count;
  });
  return merged;
}

/** Material da face impressa como objeto (para malhas com vários grupos), com a mesma lógica do PrintMaterial. */
function useLidMaterials(map: THREE.Texture, spec: MockupSpec, side: { color: string; roughness: number }, bottom: string, sheen = 0) {
  const { finish, clearcoat, spotVarnish } = spec;
  const { color: sideColor, roughness: sideRoughness } = side;
  const materials = useMemo(() => {
    const roughness = finish === "matte" ? 0.85 : finish === "gloss" ? 0.22 : 0.5;
    const coat = Math.max(clearcoat, sheen);
    let top: THREE.Material;
    if (spotVarnish) top = new THREE.MeshPhysicalMaterial({ map, roughness: 0.75, clearcoat: 1, clearcoatMap: map, clearcoatRoughness: 0.04 });
    else if (coat > 0) top = new THREE.MeshPhysicalMaterial({ map, roughness, clearcoat: coat, clearcoatRoughness: 0.08 });
    else top = new THREE.MeshStandardMaterial({ map, roughness });
    return [
      top,
      new THREE.MeshStandardMaterial({ color: sideColor, roughness: sideRoughness }),
      new THREE.MeshStandardMaterial({ color: bottom, roughness: 0.92 }),
    ];
  }, [map, finish, clearcoat, spotVarnish, sheen, sideColor, sideRoughness, bottom]);
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);
  return materials;
}

/** Textura de canvas local (sRGB), desenhada uma vez e liberada ao desmontar. */
function useCanvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(16, Math.round(width));
    canvas.height = Math.max(16, Math.round(height));
    const ctx = canvas.getContext("2d");
    if (ctx) draw(ctx, canvas.width, canvas.height);
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = 8;
    return result;
  }, [width, height, draw]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** Caixa de cantos e arestas suavizados (bisel), centrada na origem; tamanho em x, y, z. */
function SoftBox({
  w,
  h,
  d,
  radius,
  color,
  roughness = 0.6,
  metalness = 0,
  position,
}: {
  w: number;
  h: number;
  d: number;
  radius: number;
  color: string;
  roughness?: number;
  metalness?: number;
  position?: [number, number, number];
}) {
  const geometry = useMemo(() => {
    const bevel = Math.min(radius, w / 4, h / 4, d / 4);
    const shape = makeShape("rect", w, d, Math.min(radius * 1.6, w / 2, d / 2));
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(h - bevel * 2, 0.0001),
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelOffset: -bevel,
      bevelSegments: 3,
      curveSegments: 6,
    });
    g.translate(0, 0, bevel);
    g.rotateX(-Math.PI / 2);
    g.translate(0, -h / 2, 0);
    return g;
  }, [w, h, d, radius]);
  useGeometryCleanup(geometry);
  return (
    <mesh geometry={geometry} position={position}>
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------------------------
// Quebra-cabeça

/** Encaixe clássico de uma borda de 0 a 1 (t ao longo, m para fora): 6 cúbicas [c1, c2, fim]. */
const KNOB: [Pt, Pt, Pt][] = [
  [[0.18, 0.02], [0.36, -0.02], [0.4, 0]],
  [[0.44, 0.01], [0.46, 0.05], [0.43, 0.08]],
  [[0.38, 0.12], [0.36, 0.26], [0.5, 0.26]],
  [[0.64, 0.26], [0.62, 0.12], [0.57, 0.08]],
  [[0.54, 0.05], [0.56, 0.01], [0.6, 0]],
  [[0.64, -0.02], [0.82, 0.02], [1, 0]],
];
const KNOB_STEPS = 5;

/** Gerador pseudoaleatório determinístico (mulberry32): o mesmo produto sempre corta igual. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cubic(p0: Pt, c1: Pt, c2: Pt, p1: Pt, s: number): Pt {
  const u = 1 - s;
  const a = u * u * u;
  const b = 3 * u * u * s;
  const c = 3 * u * s * s;
  const d = s * s * s;
  return [a * p0[0] + b * c1[0] + c * c2[0] + d * p1[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p1[1]];
}

/** Borda de A até B: reta na moldura; entre peças, encaixe com lado (sign), posição e tamanho sorteados. */
function jigsawEdge(a: Pt, b: Pt, random: (() => number) | null): Pt[] {
  if (!random) return [a, b];
  const sign = random() < 0.5 ? 1 : -1;
  const shift = (random() - 0.5) * 0.1;
  const size = 0.9 + random() * 0.2;
  const ripple = random() * 2 - 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const place = ([t, m]: Pt, wave: boolean): Pt => {
    // As pontas (0,0) e (1,0) ficam fixas: as quatro bordas da peça fecham nos cantos.
    const tt = (t === 0 || t === 1) && m === 0 ? t : 0.5 + shift + (t - 0.5) * size;
    const mm = (wave ? m * ripple : m * size) * sign * len;
    return [a[0] + dx * tt + nx * mm, a[1] + dy * tt + ny * mm];
  };
  const points: Pt[] = [a];
  let p0: Pt = a;
  KNOB.forEach(([c1, c2, end], index) => {
    const wave = index === 0 || index === KNOB.length - 1;
    const q1 = place(c1, wave);
    const q2 = place(c2, wave);
    const q3 = index === KNOB.length - 1 ? b : place(end, false);
    for (let s = 1; s <= KNOB_STEPS; s += 1) points.push(cubic(p0, q1, q2, q3, s / KNOB_STEPS));
    p0 = q3;
  });
  points[points.length - 1] = b;
  return points;
}

type LoosePiece = { geometry: THREE.ExtrudeGeometry; center: Pt; position: [number, number, number]; rotation: [number, number, number] };

/**
 * Corta o retângulo w × h numa grade de peças (~3,6 cm) com encaixes; cada peça é extrudada com
 * chanfro (o vinco entre peças aparece de verdade). As peças no lugar viram um buffer só.
 */
function cutPuzzle(w: number, h: number, t: number, widthCm: number, heightCm: number) {
  const cols = clamp(Math.round(widthCm / 3.6), 3, 10);
  const rows = clamp(Math.round(heightCm / 3.6), 3, 10);
  const pw = w / cols;
  const ph = h / rows;
  const random = seeded(0x5eed + cols * 31 + rows * 7);
  const xAt = (c: number) => -w / 2 + c * pw;
  const yAt = (r: number) => -h / 2 + r * ph;
  // Bordas horizontais (esquerda → direita) e verticais (baixo → cima), compartilhadas entre vizinhas.
  const horizontal = Array.from({ length: rows + 1 }, (_, r) =>
    Array.from({ length: cols }, (_, c) => jigsawEdge([xAt(c), yAt(r)], [xAt(c + 1), yAt(r)], r === 0 || r === rows ? null : random)),
  );
  const vertical = Array.from({ length: cols + 1 }, (_, c) =>
    Array.from({ length: rows }, (_, r) => jigsawEdge([xAt(c), yAt(r)], [xAt(c), yAt(r + 1)], c === 0 || c === cols ? null : random)),
  );
  const bevelT = t * 0.22;
  const bevelS = 0.05 * UNIT;
  const options: THREE.ExtrudeGeometryOptions = {
    depth: t - bevelT * 2,
    bevelEnabled: true,
    bevelThickness: bevelT,
    bevelSize: bevelS,
    bevelOffset: -bevelS,
    bevelSegments: 1,
    curveSegments: 1,
    UVGenerator: planarUV(w, h),
  };
  // Peças fora do lugar, todas apoiadas na mesa: uma na frente da lacuna, uma virada mostrando o verso e
  // outra ao lado do tabuleiro. O raio de cada peça (com encaixe) fica abaixo de ~0,85 × pw, daí os afastamentos.
  const loose = new Map<string, { position: [number, number, number]; rotation: [number, number, number] }>([
    [`0,${cols - 3}`, { position: [xAt(cols - 3) - pw * 0.15, -h / 2 - ph * 1.1, 0], rotation: [0, 0, 0.62] }],
    [`0,${cols - 2}`, { position: [w / 2 + pw * 0.95, -h / 2 - ph * 0.2, t], rotation: [Math.PI, 0, -0.5] }],
    [`1,${cols - 2}`, { position: [w / 2 + pw * 1.05, -h / 2 + ph * 1.65, 0], rotation: [0, 0, -0.38] }],
  ]);
  const fixed: THREE.BufferGeometry[] = [];
  const pieces: LoosePiece[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const bottom = horizontal[r][c];
      const right = vertical[c + 1][r];
      const top = [...horizontal[r + 1][c]].reverse();
      const left = [...vertical[c][r]].reverse();
      const outline = [...bottom, ...right.slice(1), ...top.slice(1), ...left.slice(1, -1)];
      const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
      const geometry = splitLids(new THREE.ExtrudeGeometry(shape, options));
      geometry.translate(0, 0, bevelT);
      const pose = loose.get(`${r},${c}`);
      if (pose) pieces.push({ geometry, center: [xAt(c) + pw / 2, yAt(r) + ph / 2], ...pose });
      else fixed.push(geometry);
    }
  }
  const board = mergeByMaterial(fixed, 3);
  fixed.forEach((geometry) => geometry.dispose());
  return { board, pieces };
}

/**
 * Quebra-cabeça de papelão resinado sobre a mesa: grade de peças com encaixes bezier determinísticos,
 * extrudadas com 2 mm e chanfro; topo com a arte em UV global (contínua entre peças), laterais de
 * papelão cinza e verso claro. Três peças soltas na mesa ao lado da lacuna. A câmera sobe (view hint).
 */
export function PuzzleModel({ spec, art, label, showDims }: ModelProps) {
  const widthCm = Math.max(spec.widthCm, 4);
  const heightCm = Math.max(spec.heightCm, 4);
  const w = widthCm * UNIT;
  const h = heightCm * UNIT;
  const t = clamp(spec.depthCm || 0.2, 0.15, 0.4) * UNIT;
  const front = useArtTexture(widthCm / heightCm, "front", art, label);
  const materials = useLidMaterials(front, spec, { color: "#958e82", roughness: 0.95 }, "#c4beb2", 0.3);
  const cut = useMemo(() => cutPuzzle(w, h, t, widthCm, heightCm), [w, h, t, widthCm, heightCm]);
  useEffect(
    () => () => {
      cut.board.dispose();
      cut.pieces.forEach((piece) => piece.geometry.dispose());
    },
    [cut],
  );
  const [lw, lh] = sizeLabels(spec);
  return (
    <group userData={{ view: { elevation: 0.82 } }}>
      <group rotation-x={-Math.PI / 2}>
        <mesh geometry={cut.board} material={materials} />
        {cut.pieces.map((piece) => (
          <group key={`${piece.center[0]}:${piece.center[1]}`} position={piece.position} rotation={piece.rotation}>
            <mesh geometry={piece.geometry} material={materials} position={[-piece.center[0], -piece.center[1], 0]} />
          </group>
        ))}
        {showDims && KIND_INFO[spec.kind].dims && <Dimensions w={w} h={h} z={t + 0.01} labelW={lw} labelH={lh} />}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Régua

const INK = "#151515";
const HALO = "rgba(255,255,255,0.82)";

/** Escala em mm/cm com números, num canvas transparente do tamanho da régua (traço escuro com halo claro). */
function drawRulerScale(widthCm: number) {
  return (ctx: CanvasRenderingContext2D, w: number) => {
    const px = w / widthCm;
    const marks = Math.max(1, Math.floor(widthCm - 1.2));
    const x0 = ((widthCm - marks) / 2) * px;
    const edge = 0.16 * px;
    const tick = (i: number) => (i % 10 === 0 ? 0.46 : i % 5 === 0 ? 0.32 : 0.2) * px;
    ctx.lineCap = "butt";
    [HALO, INK].forEach((color, pass) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = pass ? Math.max(1.2, px * 0.022) : Math.max(3, px * 0.058);
      ctx.beginPath();
      for (let i = 0; i <= marks * 10; i += 1) {
        const x = x0 + (i / 10) * px;
        ctx.moveTo(x, edge);
        ctx.lineTo(x, edge + tick(i));
      }
      ctx.stroke();
    });
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    ctx.font = `600 ${Math.round(px * 0.3)}px ${fontFamily()}`;
    const label = (text: string, x: number, y: number) => {
      ctx.lineWidth = px * 0.07;
      ctx.strokeStyle = HALO;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = INK;
      ctx.fillText(text, x, y);
    };
    for (let cm = 0; cm <= marks; cm += 1) label(String(cm), x0 + cm * px, edge + 0.52 * px);
    ctx.font = `500 ${Math.round(px * 0.2)}px ${fontFamily()}`;
    label("cm", x0 * 0.5, edge + 0.1 * px);
  };
}

/** Corpo da régua: retângulo arredondado extrudado com bisel, arte no topo, escala por cima. */
function RulerBody({ geometry, overlay, materials, scale, t }: { geometry: THREE.BufferGeometry; overlay: THREE.BufferGeometry; materials: THREE.Material[]; scale: THREE.Texture; t: number }) {
  return (
    <group>
      <mesh geometry={geometry} material={materials} />
      <mesh geometry={overlay} position-z={t + 0.0008} renderOrder={1}>
        <meshStandardMaterial map={scale} transparent roughness={0.35} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
    </group>
  );
}

/**
 * Régua de PVC rígido impressa em UV: retângulo de cantos arredondados extrudado na espessura do
 * material, com bisel em toda a volta; arte em toda a face e escala mm/cm com números numa camada
 * própria. Duas réguas deitadas na mesa (vendidas em kit), câmera elevada.
 */
export function RulerModel({ spec, art, label, showDims }: ModelProps) {
  const widthCm = Math.max(spec.widthCm, 5);
  const heightCm = Math.max(spec.heightCm, 1);
  const w = widthCm * UNIT;
  const h = heightCm * UNIT;
  const t = clamp(spec.depthCm || 0.3, 0.15, 0.6) * UNIT;
  const front = useArtTexture(widthCm / heightCm, "front", art, label);
  const draw = useMemo(() => drawRulerScale(widthCm), [widthCm]);
  const scale = useCanvasTexture(2048, (2048 * heightCm) / widthCm, draw);
  const materials = useLidMaterials(front, spec, { color: "#f2f2ef", roughness: 0.3 }, "#ecece9", 0.35);
  const geometry = useMemo(() => {
    const bevelT = t * 0.22;
    const bevelS = Math.min(0.14 * UNIT, h * 0.08);
    const g = new THREE.ExtrudeGeometry(makeShape("rect", w, h, 0.45 * UNIT), {
      depth: t - bevelT * 2,
      bevelEnabled: true,
      bevelThickness: bevelT,
      bevelSize: bevelS,
      bevelOffset: -bevelS,
      bevelSegments: 3,
      curveSegments: 8,
      UVGenerator: planarUV(w, h),
    });
    g.translate(0, 0, bevelT);
    return splitLids(g);
  }, [w, h, t]);
  const overlay = useMemo(() => new THREE.PlaneGeometry(w, h), [w, h]);
  useGeometryCleanup(geometry);
  useGeometryCleanup(overlay);
  const [lw, lh] = sizeLabels(spec);
  const body = <RulerBody geometry={geometry} overlay={overlay} materials={materials} scale={scale} t={t} />;
  return (
    <group userData={{ view: { elevation: 0.92 } }}>
      <group rotation-x={-Math.PI / 2}>
        <group position={[w * 0.05, h * 1.45, 0]} rotation-z={0.1}>
          {body}
        </group>
        <group rotation-z={0.04}>
          {body}
          {showDims && KIND_INFO[spec.kind].dims && <Dimensions w={w} h={h} z={t + 0.01} labelW={lw} labelH={lh} />}
        </group>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Suporte de celular

const PHONE = { w: 14.7, h: 7.15, d: 0.78, radius: 0.95 };
/** Inclinação da frente impressa e do celular (rad, a partir da vertical). */
const FASCIA_TILT = 0.28;
const PHONE_TILT = 0.2;
const KICK_TILT = 0.42;

/** Arredonda as quinas da polilinha (dobra a quente) com arcos quadráticos. */
function fillet(points: Pt[], radius: number, steps = 6): Pt[] {
  const out: Pt[] = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const [px, py] = points[i];
    const [ax, ay] = points[i - 1];
    const [cx, cy] = points[i + 1];
    const l1 = Math.hypot(px - ax, py - ay) || 1;
    const l2 = Math.hypot(cx - px, cy - py) || 1;
    const r = Math.min(radius, l1 * 0.45, l2 * 0.45);
    const p1: Pt = [px - ((px - ax) / l1) * r, py - ((py - ay) / l1) * r];
    const p2: Pt = [px + ((cx - px) / l2) * r, py + ((cy - py) / l2) * r];
    for (let s = 0; s <= steps; s += 1) {
      const k = s / steps;
      const u = 1 - k;
      out.push([u * u * p1[0] + 2 * u * k * px + k * k * p2[0], u * u * p1[1] + 2 * u * k * py + k * k * p2[1]]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Contorno de uma chapa de espessura t seguindo a linha central (juntas em esquadria). */
function thickOutline(line: Pt[], t: number): THREE.Shape {
  const left: THREE.Vector2[] = [];
  const right: THREE.Vector2[] = [];
  const normalOf = (a: Pt, b: Pt): Pt => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  };
  const last = line.length - 1;
  line.forEach(([x, y], i) => {
    const n0 = i > 0 ? normalOf(line[i - 1], line[i]) : normalOf(line[0], line[1]);
    const n1 = i < last ? normalOf(line[i], line[i + 1]) : n0;
    let mx = n0[0] + n1[0];
    let my = n0[1] + n1[1];
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml;
    my /= ml;
    const k = t / 2 / Math.max(0.35, mx * n1[0] + my * n1[1]);
    left.push(new THREE.Vector2(x + mx * k, y + my * k));
    right.push(new THREE.Vector2(x - mx * k, y - my * k));
  });
  return new THREE.Shape([...left, ...right.reverse()]);
}

/**
 * Perfil (z, y) em cm da chapa dobrada: aba na mesa, frente impressa inclinada, patamar com canaleta
 * onde o celular encaixa deitado e o pé traseiro descendo até a mesa.
 */
function standProfile(heightCm: number, t: number) {
  const r = t / 2 + 0.15;
  const up: Pt = [-Math.sin(FASCIA_TILT), Math.cos(FASCIA_TILT)];
  const down: Pt = [Math.sin(PHONE_TILT), -Math.cos(PHONE_TILT)];
  const slotDepth = 1.5;
  const slotWidth = (t + PHONE.d) / Math.cos(PHONE_TILT) + 0.22;
  const fascia = heightCm + 2 * r;
  const p0: Pt = [1.5, t / 2];
  const p1: Pt = [0, t / 2];
  const p2: Pt = [p1[0] + up[0] * fascia, p1[1] + up[1] * fascia];
  const p3: Pt = [p2[0] - 1.2, p2[1]];
  const p4: Pt = [p3[0] + down[0] * slotDepth, p3[1] + down[1] * slotDepth];
  const p5: Pt = [p4[0] - slotWidth, p4[1]];
  const p6: Pt = [p5[0] - down[0] * slotDepth, p5[1] - down[1] * slotDepth];
  const p7: Pt = [p6[0] - 1.2, p6[1]];
  // A ponta do pé encosta na mesa com a quina mais baixa em y = 0.
  const footY = (t / 2) * Math.sin(KICK_TILT);
  const p8: Pt = [p7[0] - (p7[1] - footY) * Math.tan(KICK_TILT), footY];
  const shape = thickOutline(fillet([p0, p1, p2, p3, p4, p5, p6, p7, p8], r), t);
  const faceOffset = t / 2 + 0.012;
  const face: Pt = [
    p1[0] + up[0] * (r + heightCm / 2) + Math.cos(FASCIA_TILT) * faceOffset,
    p1[1] + up[1] * (r + heightCm / 2) + Math.sin(FASCIA_TILT) * faceOffset,
  ];
  const seat: Pt = [(p4[0] + p5[0]) / 2, p4[1] + t / 2 + 0.12];
  const phone: Pt = [seat[0] - Math.sin(PHONE_TILT) * (PHONE.h / 2), seat[1] + Math.cos(PHONE_TILT) * (PHONE.h / 2)];
  return { shape, face, phone };
}

/** Tela de bloqueio discreta: degradê escuro com brilhos suaves, ilha da câmera e barra inferior. */
function drawScreen(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const base = ctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, "#1a2140");
  base.addColorStop(0.5, "#251538");
  base.addColorStop(1, "#06070b");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const glows: [number, number, number, string][] = [
    [0.28, 0.3, 0.55, "rgba(56,225,255,0.32)"],
    [0.74, 0.72, 0.6, "rgba(255,79,216,0.26)"],
  ];
  glows.forEach(([x, y, r, color]) => {
    const glow = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * w);
    glow.addColorStop(0, color);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  });
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.roundRect(w * 0.035, h * 0.41, w * 0.026, h * 0.18, w * 0.013);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.roundRect(w * 0.38, h * 0.93, w * 0.24, h * 0.016, h * 0.008);
  ctx.fill();
}

/** Smartphone moderno de apoio: corpo com bisel, vidro, tela, módulo de câmeras com lentes. */
function Smartphone() {
  const body = useMemo(() => {
    const bevel = 0.12;
    const g = new THREE.ExtrudeGeometry(makeShape("rect", PHONE.w, PHONE.h, PHONE.radius), {
      depth: PHONE.d - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelOffset: -bevel,
      bevelSegments: 3,
      curveSegments: 10,
    });
    g.translate(0, 0, -PHONE.d / 2 + bevel);
    return splitLids(g);
  }, []);
  const screenW = PHONE.w - 0.45;
  const screenH = PHONE.h - 0.45;
  const screen = useMemo(() => faceGeometry(makeShape("rect", screenW, screenH, PHONE.radius - 0.2), screenW, screenH), [screenW, screenH]);
  const bump = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(makeShape("rect", 3.5, 3.5, 0.85), {
      depth: 0.06,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.06,
      bevelOffset: -0.06,
      bevelSegments: 2,
      curveSegments: 8,
    });
    g.rotateY(Math.PI);
    return g;
  }, []);
  const ring = useMemo(() => new THREE.CylinderGeometry(0.66, 0.68, 0.16, 32).rotateX(Math.PI / 2), []);
  const lens = useMemo(() => new THREE.CylinderGeometry(0.46, 0.46, 0.18, 32).rotateX(Math.PI / 2), []);
  useGeometryCleanup(body);
  useGeometryCleanup(screen);
  useGeometryCleanup(bump);
  useGeometryCleanup(ring);
  useGeometryCleanup(lens);
  const screenTexture = useCanvasTexture(512, (512 * screenH) / screenW, drawScreen);
  const back = -PHONE.d / 2;
  // Visto de frente, o módulo fica no canto superior esquerdo (mesmo lado da ilha da câmera).
  const cameraModule: [number, number, number] = [-PHONE.w / 2 + 2.15, PHONE.h / 2 - 2.15, back];
  const lenses: Pt[] = [
    [0.8, 0.8],
    [0.8, -0.8],
    [-0.75, 0],
  ];
  return (
    <group>
      <mesh geometry={body}>
        <meshPhysicalMaterial attach="material-0" color="#050507" roughness={0.05} clearcoat={1} clearcoatRoughness={0.03} />
        <meshStandardMaterial attach="material-1" color="#45474c" metalness={0.9} roughness={0.28} />
        <meshStandardMaterial attach="material-2" color="#2a2d33" roughness={0.42} metalness={0.1} />
      </mesh>
      <mesh geometry={screen} position-z={PHONE.d / 2 + 0.004}>
        <meshStandardMaterial color="#000000" emissive="#ffffff" emissiveMap={screenTexture} emissiveIntensity={0.85} roughness={0.06} />
      </mesh>
      <group position={cameraModule}>
        <mesh geometry={bump}>
          <meshStandardMaterial color="#2f3238" roughness={0.18} metalness={0.2} />
        </mesh>
        {lenses.map(([x, y]) => (
          <group key={`${x}:${y}`} position={[x, y, -0.16]}>
            <mesh geometry={ring}>
              <meshStandardMaterial color="#8d9096" metalness={1} roughness={0.22} />
            </mesh>
            <mesh geometry={lens} position-z={-0.02}>
              <meshPhysicalMaterial color="#07090f" roughness={0.04} clearcoat={1} metalness={0.3} />
            </mesh>
          </group>
        ))}
        <mesh position={[-0.75, 1.05, -0.12]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.2, 0.2, 0.06, 20]} />
          <meshStandardMaterial color="#f4efe0" roughness={0.3} />
        </mesh>
      </group>
      {/* Botões na borda superior. */}
      {[-3.6, -2.3, 3.2].map((x) => (
        <mesh key={x} position={[x, PHONE.h / 2 + 0.02, 0]}>
          <boxGeometry args={[x > 0 ? 1.6 : 0.95, 0.08, 0.32]} />
          <meshStandardMaterial color="#45474c" metalness={0.9} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Suporte de celular em chapa de PVC expandido dobrada a quente: perfil extrudado na largura da peça
 * (aba na mesa, frente impressa inclinada, canaleta no topo e pé traseiro) com dobras arredondadas.
 * A arte ocupa a frente inteira (largura × altura da spec) e o celular fica deitado na canaleta, acima
 * dela, para a impressão ficar toda à vista.
 */
export function PhoneStandModel({ spec, art, label }: ModelProps) {
  const widthCm = Math.max(spec.widthCm, 6);
  const heightCm = Math.max(spec.heightCm, 4);
  const t = clamp(spec.depthCm || 0.5, 0.3, 0.8);
  const front = useArtTexture(artAspect({ widthCm, heightCm }), "front", art, label);
  const profile = useMemo(() => standProfile(heightCm, t), [heightCm, t]);
  const sheetW = widthCm + 0.2;
  const geometry = useMemo(() => {
    const bevel = 0.05;
    const g = new THREE.ExtrudeGeometry(profile.shape, {
      depth: sheetW - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelOffset: -bevel,
      bevelSegments: 2,
      curveSegments: 4,
    });
    // Extrusão em z vira a largura em x; o perfil (z, y) fica no plano lateral.
    g.translate(0, 0, bevel);
    g.rotateY(-Math.PI / 2);
    g.translate(sheetW / 2, 0, 0);
    return g;
  }, [profile, sheetW]);
  useGeometryCleanup(geometry);
  return (
    <group scale={UNIT} userData={{ view: { elevation: 0.2 } }}>
      <mesh geometry={geometry}>
        <meshStandardMaterial color="#f6f6f4" roughness={0.78} />
      </mesh>
      <mesh position={[0, profile.face[1], profile.face[0]]} rotation-x={-FASCIA_TILT}>
        <planeGeometry args={[widthCm, heightCm]} />
        <PrintMaterial map={front} spec={spec} />
      </mesh>
      <group position={[0, profile.phone[1], profile.phone[0]]} rotation-x={-PHONE_TILT}>
        <Smartphone />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Wobbler

/** Etiqueta de preço que vai na canaleta da gôndola (detalhe de cena). */
function drawPriceTag(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#fbfbf8";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#e0322a";
  ctx.fillRect(0, 0, w, h * 0.24);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${Math.round(h * 0.15)}px ${fontFamily()}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("OFERTA", w / 2, h * 0.125);
  ctx.fillStyle = "#151515";
  ctx.font = `800 ${Math.round(h * 0.36)}px ${fontFamily()}`;
  ctx.fillText("9,90", w * 0.6, h * 0.6);
  ctx.font = `700 ${Math.round(h * 0.14)}px ${fontFamily()}`;
  ctx.fillText("R$", w * 0.2, h * 0.5);
  for (let i = 0; i < 26; i += 1) {
    const x = w * 0.08 + i * w * 0.0105;
    ctx.fillRect(x, h * 0.8, i % 3 === 0 ? 2.4 : 1.2, h * 0.12);
  }
}

/** Faixa de PVC cristal com leve caimento: reta presa no clipe, depois segue a tangente atrás do cartão. */
function stripGeometry(free: number, overlap: number, width: number, drop: number) {
  const length = free + overlap;
  const g = new THREE.BoxGeometry(length, width, 0.05, 32, 1, 1);
  g.translate(length / 2, 0, 0);
  const k = drop / (free * free);
  const slope = 2 * k * free;
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const dy = x <= free ? -k * x * x : -drop - slope * (x - free);
    pos.setY(i, pos.getY(i) + dy);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** Canaleta de preço em C (perfil x, y), extrudada ao longo de z. */
function railGeometry(length: number) {
  const outline: Pt[] = [
    [0, 0],
    [0.62, 0],
    [0.62, 0.42],
    [0.5, 0.42],
    [0.5, 0.14],
    [0.14, 0.14],
    [0.14, 3.76],
    [0.5, 3.76],
    [0.5, 3.48],
    [0.62, 3.48],
    [0.62, 3.9],
    [0, 3.9],
  ];
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y))), {
    depth: length - 0.06,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelOffset: -0.03,
    bevelSegments: 1,
  });
  g.translate(0, 0, -length / 2 + 0.03);
  return g;
}

const WOBBLE = { free: 7, overlap: 2.2, strip: 2.4, drop: 0.38, clip: 0.9 };
/** Trecho de gôndola enxuto (cm): só o bastante para explicar a peça sem roubar o enquadramento do cartão. */
const SHELF = { depth: 9, length: 14 };
/** Etiqueta de preço na canaleta, longe do clipe (largura em cm; altura pelo canvas 512 × 290). */
const TAG = { w: 5, z: 4.1 };

/**
 * Wobbler de gôndola: cartão impresso (frente e verso, no formato da spec) preso numa faixa de PVC
 * cristal com caimento leve, que sai de um clipe na canaleta de preço de um trecho de prateleira.
 * Balança devagar quando a animação está liberada (só pede frames enquanto anima).
 */
export function WobblerModel({ spec, art, label }: ModelProps) {
  const widthCm = Math.max(spec.widthCm, 3);
  const heightCm = Math.max(spec.heightCm, 3);
  const aspect = artAspect({ widthCm, heightCm });
  const mask: MaskPath | undefined = spec.shape === "round" ? roundPath : spec.shape === "heart" ? heartPath : undefined;
  const front = useArtTexture(aspect, "front", art, label, mask);
  const back = useArtTexture(aspect, backVariant(spec), art, label, mask);
  const tag = useCanvasTexture(512, 290, drawPriceTag);
  const strip = useMemo(() => stripGeometry(WOBBLE.free, WOBBLE.overlap, WOBBLE.strip, WOBBLE.drop), []);
  const rail = useMemo(() => railGeometry(SHELF.length), []);
  useGeometryCleanup(strip);
  useGeometryCleanup(rail);

  // Cartão inclinado na tangente da faixa; a gôndola tem altura para ele não tocar a mesa.
  const slope = (2 * WOBBLE.drop) / WOBBLE.free;
  const tilt = Math.atan(slope);
  const cardX = WOBBLE.clip + WOBBLE.free + (widthCm / 2) * Math.cos(tilt);
  const cardY = -WOBBLE.drop - (widthCm / 2) * Math.sin(tilt);
  const lowest = WOBBLE.drop + widthCm * Math.sin(tilt) + (heightCm / 2) * Math.cos(tilt);
  const anchorY = Math.max(9, lowest + 1.4);
  const shelfH = anchorY + 2.35;
  const shelfD = SHELF.depth;
  const shelfL = SHELF.length;

  const pivot = useRef<THREE.Group>(null);
  const clock = useRef(0);
  const animate = useAnimate();
  useFrame((state, delta) => {
    const group = pivot.current;
    if (!animate || !group) return;
    clock.current += Math.min(delta, 0.1);
    const time = clock.current;
    group.rotation.y = Math.sin(time * 2.2) * 0.075 + Math.sin(time * 3.7 + 1.1) * 0.015;
    group.rotation.z = Math.sin(time * 2.2 + 0.7) * 0.01;
    state.invalidate();
  });

  return (
    <group scale={UNIT} userData={{ view: { elevation: 0.16, azimuth: 0.42 } }}>
      {/* Trecho de gôndola: rodapé escuro, corpo claro, tampo metálico e canaleta de preço. */}
      <SoftBox w={shelfD - 1.2} h={1.2} d={shelfL - 1.2} radius={0.2} color="#3a3c41" roughness={0.7} position={[-shelfD / 2 - 0.4, 0.6, 0]} />
      <SoftBox w={shelfD} h={shelfH - 1.2} d={shelfL} radius={0.35} color="#ececed" roughness={0.55} position={[-shelfD / 2, 1.2 + (shelfH - 1.2) / 2, 0]} />
      <SoftBox w={shelfD + 0.5} h={0.6} d={shelfL + 0.4} radius={0.2} color="#d3d6da" roughness={0.32} metalness={0.4} position={[-shelfD / 2 + 0.25, shelfH + 0.3, 0]} />
      <mesh geometry={rail} position={[0, anchorY - 1.95, 0]}>
        <meshPhysicalMaterial color="#dfe3e7" roughness={0.22} clearcoat={0.6} clearcoatRoughness={0.1} />
      </mesh>
      <mesh position={[0.16, anchorY, TAG.z]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[TAG.w, (TAG.w * 290) / 512]} />
        <meshStandardMaterial map={tag} roughness={0.6} />
      </mesh>

      <group ref={pivot} position={[0.12, anchorY, 0]}>
        <SoftBox w={WOBBLE.clip} h={3.2} d={0.8} radius={0.15} color="#f3f5f6" roughness={0.3} position={[WOBBLE.clip / 2, 0, 0]} />
        <mesh geometry={strip} position-x={WOBBLE.clip} renderOrder={2}>
          <meshPhysicalMaterial color="#eef7f6" transparent opacity={0.38} roughness={0.06} clearcoat={1} clearcoatRoughness={0.04} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        {/* O Slab trabalha em unidades de cena (o afastamento fixo da face não pode encolher com a escala). */}
        <group position={[cardX, cardY, 0.025 + 0.03]} rotation-z={-tilt} scale={1 / UNIT}>
          <Slab w={widthCm * UNIT} h={heightCm * UNIT} d={0.035 * UNIT} spec={spec} front={front} back={back} radius={0.5 * UNIT} edgeColor="#f7f7f5" />
        </group>
      </group>
    </group>
  );
}
