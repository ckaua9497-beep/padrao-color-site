"use client";

// Objetos de mesa: quebra-cabeça, régua, suporte de celular e wobbler.

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import { KIND_INFO, artAspect } from "@/lib/mockup-kinds";
import { fontFamily } from "../art";
import { useAnimate } from "../viewer-hooks";
import {
  Dimensions,
  PrintMaterial,
  faceGeometry,
  makeShape,
  sizeLabels,
  useArtTexture,
  useGeometryCleanup,
  type ModelProps,
} from "./shared";
import { cutShape } from "./cut-path";

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

/**
 * Peças do suporte de celular no gabarito oficial ("suporte-para-celular", mm, y para baixo): a placa frontal de
 * 9 × 21 cm com o recorte do cabo embaixo e os dois rasgos de 28 × 6,8 mm, e a base de encaixe de 9 × 10 cm com as
 * duas abas no topo (entram nos rasgos e sobram na frente como apoio do celular) e o recorte do cabo.
 */
const STAND_PLATE = {
  box: { x: 132, y: 19.8, w: 90, h: 210 },
  d: "M138.8 19.8L215.1 19.8C218.9 19.8 222 22.8 222 26.6L222 222.9C222 226.7 218.9 229.8 215.1 229.8L187.9 229.8C186.2 229.8 184.8 228.8 184.1 227.4C184.1 227.4 182.4 222.3 177 222.3C171.5 222.3 169.8 227.4 169.9 227.4C169.2 228.8 167.7 229.8 166.1 229.8L138.8 229.8C135 229.8 132 226.7 132 222.9L132 26.6C132 22.8 135 19.8 138.8 19.8Z M142.5 196.2L170.5 196.2L170.5 203L142.5 203Z M183.5 196.2L211.5 196.2L211.5 203L183.5 203Z",
  /** Centro dos rasgos acima da base da placa (cm). */
  slot: 3.02,
};
const STAND_BASE = {
  box: { x: 28, y: 129.8, w: 90, h: 100 },
  d: "M85 129.8L102 129.8C104.8 129.8 107 132 107 134.8L107 159.8L114.7 159.8C116.5 159.8 118 161.3 118 163.1L118 226.4C118 228.3 116.5 229.8 114.7 229.8L83.2 229.8C80.9 229.8 79 227.9 79 225.7L79 210.8C79 207.5 76.3 204.8 73 204.8C69.7 204.8 67 207.5 67 210.8L67 225.7C67 227.9 65.2 229.8 62.9 229.8L31.4 229.8C29.5 229.8 28 228.3 28 226.4L28 163.1C28 161.3 29.5 159.8 31.4 159.8L39 159.8L39 134.8C39 132 41.3 129.8 44 129.8L61 129.8C63.8 129.8 66 132 66 134.8L66 159.8L80 159.8L80 134.8C80 132 82.3 129.8 85 129.8Z",
  /** Raiz das abas (cm acima do centro da peça) e comprimento do corpo abaixo delas. */
  root: 2,
  body: 7,
};
/** Inclinação da placa (rad, a partir da vertical), como na foto do produto. */
const STAND_TILT = 0.32;

/** Chapa de PVC com borda levemente quebrada, centrada na espessura. */
function pvcSheet(shape: THREE.Shape, t: number) {
  const bevel = Math.min(0.04, t * 0.12);
  const g = new THREE.ExtrudeGeometry(shape, { depth: t - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -t / 2 + bevel);
  return g;
}

/**
 * Suporte de celular em PVC expandido 5 mm, como na foto do produto: a placa impressa (9 × 21 cm) inclinada para
 * trás, com o recorte do cabo e os dois rasgos; a base de encaixe passa pelos rasgos, sobra na frente como os dois
 * apoios do celular e desce por trás até a mesa, segurando a placa.
 */
export function PhoneStandModel({ spec, art, label }: ModelProps) {
  // O "Tamanho 21x9 cm" é a placa em pé: 9 de largura por 21 de altura.
  const W = Math.max(Math.min(spec.widthCm, spec.heightCm), 4);
  const H = Math.max(spec.widthCm, spec.heightCm, W * 1.4);
  const t = clamp(spec.depthCm || 0.5, 0.3, 0.8);
  const sx = W / (STAND_PLATE.box.w / 10);
  const sy = H / (STAND_PLATE.box.h / 10);
  const front = useArtTexture(artAspect({ widthCm: W, heightCm: H }), "front", art, label);
  const parts = useMemo(() => {
    const plate = cutShape(STAND_PLATE.d, STAND_PLATE.box, [sx, sy]);
    const base = cutShape(STAND_BASE.d, STAND_BASE.box, [sx, sx]);
    return { plate: pvcSheet(plate, t), face: faceGeometry(plate, W, H), base: pvcSheet(base, t) };
  }, [sx, sy, t, W, H]);
  useGeometryCleanup(parts.plate);
  useGeometryCleanup(parts.face);
  useGeometryCleanup(parts.base);

  // Placa: base da frente apoiada na mesa (y = 0), "para cima" inclinado para trás.
  const up = new THREE.Vector3(0, Math.cos(STAND_TILT), -Math.sin(STAND_TILT));
  const bottom = new THREE.Vector3(0, (t / 2) * Math.sin(STAND_TILT), 0);
  const center = bottom.clone().addScaledVector(up, H / 2);
  // Base: atravessa os rasgos e desce para trás até a borda de baixo tocar a mesa.
  const slot = bottom.clone().addScaledVector(up, STAND_PLATE.slot * sy);
  const body = STAND_BASE.body * sx;
  const fall = Math.asin(clamp((slot.y - t / 2) / (body + t / 2), 0.05, 0.9));
  const forward = new THREE.Vector3(0, Math.sin(fall), Math.cos(fall));
  const root = slot.clone().addScaledVector(forward, -t / 2);
  const basePosition = root.clone().addScaledVector(forward, -STAND_BASE.root * sx);
  const pvc = "#f3f3f0";
  return (
    <group scale={UNIT} rotation-y={0.5} userData={{ view: { elevation: 0.2 } }}>
      <group position={[center.x, center.y, center.z]} rotation-x={-STAND_TILT}>
        <mesh geometry={parts.plate}>
          <meshStandardMaterial color={pvc} roughness={0.8} />
        </mesh>
        <mesh geometry={parts.face} position-z={t / 2 + 0.012}>
          <PrintMaterial map={front} spec={spec} />
        </mesh>
      </group>
      <mesh geometry={parts.base} position={[basePosition.x, basePosition.y, basePosition.z]} rotation-x={Math.PI / 2 - fall}>
        <meshStandardMaterial color="#e7e7e3" roughness={0.82} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Wobbler

/**
 * Corte do wobbler de 16 cm no gabarito oficial ("wobbler", mm, y para baixo): disco de Ø 16,2 cm, pescoço de
 * 3,5 cm e a aba de 7 × 3,5 cm no topo, onde a haste plástica cola.
 */
const WOBBLER_CUT = {
  box: { x: 14, y: 9.2, w: 161.9, h: 311.6 },
  d: "M64.9 9.2L125.1 9.2C127.9 9.2 130.2 11.5 130.2 14.3L130.2 39.2C130.2 42 127.9 44.3 125.1 44.3L112.6 44.3L112.6 161.3C148.8 169.3 175.9 201.5 175.9 240.1C175.9 284.7 139.7 320.8 95 320.8C50.3 320.8 14 284.7 14 240.1C14 201.5 41.1 169.3 77.4 161.3L77.4 44.3L64.9 44.3C62.1 44.3 59.7 42 59.7 39.2L59.7 14.3C59.7 11.5 62.1 9.2 64.9 9.2Z",
  /** Disco (cm, a partir do centro da caixa) e altura da aba. */
  disc: { y: -7.51, r: 8.1 },
  tab: 3.51,
};
/** Haste plástica de prateleira (cm): largura, espessura, subida acima da aba, raio da curva e trecho para trás. */
const ARM = { w: 2.4, t: 0.08, rise: 3.2, bend: 2.2, reach: 6.5 };

/** Fita de seção retangular ao longo de uma curva no plano (y, z): a haste flexível do wobbler. */
function ribbonGeometry(points: THREE.Vector2[], width: number, thick: number) {
  const positions: number[] = [];
  const indices: number[] = [];
  const n = points.length;
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    const ty = b.x - a.x;
    const tz = b.y - a.y;
    const len = Math.hypot(ty, tz) || 1;
    const ny = -tz / len;
    const nz = ty / len;
    for (const [sx, sn] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      positions.push((sx * width) / 2, p.x + (sn * thick * ny) / 2, p.y + (sn * thick * nz) / 2);
    }
  });
  for (let i = 0; i < n - 1; i += 1) {
    for (let k = 0; k < 4; k += 1) {
      const a = i * 4 + k;
      const b = i * 4 + ((k + 1) % 4);
      indices.push(a, a + 4, b, b, a + 4, b + 4);
    }
  }
  indices.push(0, 1, 2, 0, 2, 3);
  const last = (n - 1) * 4;
  indices.push(last, last + 2, last + 1, last, last + 3, last + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/**
 * Wobbler como na foto do produto: o recorte em couchê 250 g (disco impresso, pescoço e aba) preso na haste plástica
 * branca de prateleira, que sobe atrás da aba e faz a curva para trás até a ponta com o adesivo. Balança devagar
 * quando a animação está liberada (só pede frames enquanto anima).
 */
export function WobblerModel({ spec, art, label }: ModelProps) {
  const size = Math.max(Math.min(spec.widthCm, spec.heightCm), 6);
  const s = size / (WOBBLER_CUT.box.w / 10);
  const d = 0.035;
  const front = useArtTexture(1, "front", art, label);
  const back = useArtTexture(1, spec.back === "blank" ? "blank" : spec.back === "gray" ? "gray" : "front", art, label);
  const discR = WOBBLER_CUT.disc.r * s;
  const discY = WOBBLER_CUT.disc.y * s;
  const top = (WOBBLER_CUT.box.h / 20) * s;
  const parts = useMemo(() => {
    const cut = cutShape(WOBBLER_CUT.d, WOBBLER_CUT.box, [s, s]);
    const card = new THREE.ExtrudeGeometry(cut, { depth: d, bevelEnabled: false, curveSegments: 24 });
    card.translate(0, 0, -d / 2);
    const disc = faceGeometry(makeShape("round", discR * 2, discR * 2, 0), discR * 2, discR * 2);
    // Haste: cola atrás da aba, sobe, curva para trás e segue reta até o adesivo.
    const start = top - WOBBLER_CUT.tab * s * 0.85;
    const z0 = -d / 2 - ARM.t / 2 - 0.01;
    const points: THREE.Vector2[] = [new THREE.Vector2(start, z0), new THREE.Vector2(top + ARM.rise, z0)];
    for (let k = 1; k <= 14; k += 1) {
      const a = (k / 14) * (Math.PI / 2);
      points.push(new THREE.Vector2(top + ARM.rise + Math.sin(a) * ARM.bend, z0 - ARM.bend + Math.cos(a) * ARM.bend));
    }
    points.push(new THREE.Vector2(top + ARM.rise + ARM.bend, z0 - ARM.bend - ARM.reach));
    return { card, disc, arm: ribbonGeometry(points, ARM.w, ARM.t), pad: new THREE.Vector3(0, top + ARM.rise + ARM.bend + ARM.t / 2 + 0.08, z0 - ARM.bend - ARM.reach + 1.2) };
  }, [s, d, discR, top]);
  useGeometryCleanup(parts.card);
  useGeometryCleanup(parts.disc);
  useGeometryCleanup(parts.arm);

  const pivot = useRef<THREE.Group>(null);
  const clock = useRef(0);
  const animate = useAnimate();
  useFrame((state, delta) => {
    const group = pivot.current;
    if (!animate || !group) return;
    clock.current += Math.min(delta, 0.1);
    const time = clock.current;
    group.rotation.y = Math.sin(time * 2.2) * 0.075 + Math.sin(time * 3.7 + 1.1) * 0.015;
    group.rotation.x = Math.sin(time * 2.2 + 0.7) * 0.02;
    state.invalidate();
  });

  return (
    <group scale={UNIT} rotation-y={0.35} userData={{ view: { elevation: 0.12 } }}>
      <mesh geometry={parts.arm}>
        <meshPhysicalMaterial color="#f6f7f7" roughness={0.3} clearcoat={0.5} clearcoatRoughness={0.2} />
      </mesh>
      <mesh position={parts.pad}>
        <boxGeometry args={[ARM.w * 0.9, 0.16, 2]} />
        <meshStandardMaterial color="#e9ecee" roughness={0.6} />
      </mesh>
      <group ref={pivot} position-y={top}>
        <group position-y={-top}>
          <mesh geometry={parts.card}>
            <meshStandardMaterial color="#f7f7f5" roughness={0.85} />
          </mesh>
          <mesh geometry={parts.disc} position={[0, discY, d / 2 + 0.006]}>
            <PrintMaterial map={front} spec={spec} />
          </mesh>
          <mesh geometry={parts.disc} position={[0, discY, -d / 2 - 0.006]} rotation-y={Math.PI}>
            <PrintMaterial map={back} spec={spec} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
