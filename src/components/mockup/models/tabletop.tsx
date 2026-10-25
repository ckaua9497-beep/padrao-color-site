"use client";

// Peças de mesa e chão, deitadas como na vida real (a câmera sobe via userData.view em vez de inclinar a peça):
// mouse pad com borda overlock, mouse pad gamer com mouse, jogo americano com prato e talheres, tapete de pelúcia,
// capacho de vinil com borda de borracha, tábua de madeira (painel sublimado ou gravação a laser), porta-copos
// com base de cortiça, porta-jarra com jarra de vidro e sousplat com prato.
//
// Convenção: a peça é montada no plano XY (arte em +z, topo da arte em +y) e o grupo gira -90° em x; assim o
// topo da arte fica no fundo da mesa e a leitura é direta para a câmera. Medidas em cm viram unidades de cena
// por um fator `s` por peça, e os adereços usam o mesmo fator (proporção real entre peça e prato, mouse, jarra).

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { MockupShape, MockupSpec } from "@/lib/mockup";
import { KIND_INFO, artAspect } from "@/lib/mockup-kinds";
import { Dimensions, PrintMaterial, faceGeometry, makeShape, sizeLabels, useArtTexture, useGeometryCleanup, type ModelProps } from "./shared";
import { ENGRAVE_MASK_GLSL, engravesDirect, lathe, smoothProfile, type Pt } from "./vessel";

/** Lado maior da peça principal, em unidades de cena. */
const TARGET = 2.4;
/** Deita a peça: o plano XY vira o tampo (arte para cima, topo da arte ao fundo). */
const FLAT = -Math.PI / 2;

type View = { elevation: number; azimuth: number };

/** Unidades de cena por cm. */
function cmScale(widthCm: number, heightCm: number, target = TARGET) {
  return target / Math.max(widthCm, heightCm, 1);
}

/** Ponto do tampo (x, y no plano da peça) em coordenadas de mundo, a uma altura `up`. */
function onTable(x: number, y: number, up = 0): [number, number, number] {
  return [x, up, -y];
}

function hasDims(spec: MockupSpec, showDims: boolean) {
  return showDims && KIND_INFO[spec.kind].dims;
}

// ---------------------------------------------------------------------------------------------
// Geometria
// ---------------------------------------------------------------------------------------------

/** Gerador pseudoaleatório com semente: texturas iguais a cada montagem. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** UV planar (x/w, y/h): a arte cobre o tampo sem distorção e "dobra" na borda boleada, como na sublimação. */
function planarUv(geometry: THREE.BufferGeometry, w: number, h: number) {
  const position = geometry.getAttribute("position");
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    uv[i * 2] = position.getX(i) / w + 0.5;
    uv[i * 2 + 1] = position.getY(i) / h + 0.5;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/** Normais suaves por posição (o ExtrudeGeometry sai facetado e a esfera tem costura). */
function smoothNormals(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const keys: string[] = [];
  const sums = new Map<string, THREE.Vector3>();
  for (let i = 0; i < position.count; i += 1) {
    const key = `${Math.round(position.getX(i) * 1e5)}|${Math.round(position.getY(i) * 1e5)}|${Math.round(position.getZ(i) * 1e5)}`;
    keys.push(key);
    if (!sums.has(key)) sums.set(key, new THREE.Vector3());
  }
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const count = index ? index.count : position.count;
  for (let f = 0; f + 2 < count; f += 3) {
    const ids = index ? [index.getX(f), index.getX(f + 1), index.getX(f + 2)] : [f, f + 1, f + 2];
    a.fromBufferAttribute(position, ids[0]);
    b.fromBufferAttribute(position, ids[1]);
    c.fromBufferAttribute(position, ids[2]);
    // Produto vetorial sem normalizar: faces maiores pesam mais.
    cb.subVectors(c, b).cross(ab.subVectors(a, b));
    ids.forEach((id) => sums.get(keys[id])?.add(cb));
  }
  const normals = new Float32Array(position.count * 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    const sum = sums.get(keys[i]);
    if (sum && sum.lengthSq() > 1e-20) n.copy(sum);
    else n.set(0, 0, 1);
    n.normalize();
    normals[i * 3] = n.x;
    normals[i * 3 + 1] = n.y;
    normals[i * 3 + 2] = n.z;
  }
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
}

/**
 * Camada com arestas boleadas: contorno w × h exato, espessura t (de z = 0 a z = t), raio de canto e bisel.
 * Furo redondo opcional em (holeX, 0). UV planar em toda a malha.
 */
function softLayerGeometry(kind: MockupShape, w: number, h: number, t: number, radius: number, bevel: number, holeR = 0, holeX = 0) {
  const b = Math.max(0, Math.min(bevel, t * 0.49, w * 0.2, h * 0.2));
  const shape = makeShape(kind, Math.max(w - 2 * b, 1e-3), Math.max(h - 2 * b, 1e-3), Math.max(radius - b, 1e-4));
  if (holeR > 0) {
    // O bisel fecha o furo: o contorno do furo começa `b` maior.
    const hole = new THREE.Path();
    hole.absarc(holeX, 0, holeR + b, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(t - 2 * b, 1e-4),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 4,
    // Retângulo: segmentos por canto; círculo/coração: contorno inteiro (precisa de mais para não facetar).
    curveSegments: kind === "rect" ? 12 : 48,
  });
  geometry.translate(0, 0, b);
  planarUv(geometry, w, h);
  smoothNormals(geometry);
  return geometry;
}

function useSoftLayer(kind: MockupShape, w: number, h: number, t: number, radius: number, bevel: number, holeR = 0, holeX = 0) {
  const geometry = useMemo(() => softLayerGeometry(kind, w, h, t, radius, bevel, holeR, holeX), [kind, w, h, t, radius, bevel, holeR, holeX]);
  useGeometryCleanup(geometry);
  return geometry;
}

/**
 * Pontos igualmente espaçados no contorno da peça, na altura z (para viés e costura). A quantidade segue o
 * perímetro (`spacing` entre pontos), para os cantos boleados não facetarem nas peças grandes.
 */
function contourPoints(kind: MockupShape, w: number, h: number, radius: number, spacing: number, z: number) {
  const shape = makeShape(kind, Math.max(w, 1e-3), Math.max(h, 1e-3), Math.max(radius, 1e-4));
  const count = Math.round(THREE.MathUtils.clamp(shape.getLength() / Math.max(spacing, 1e-6), 120, 900));
  const points = shape.getSpacedPoints(count);
  while (points.length > 3 && points[0].distanceTo(points[points.length - 1]) < 1e-6) points.pop();
  return points.map((p) => new THREE.Vector3(p.x, p.y, z));
}

function contourTube(points: THREE.Vector3[], radius: number) {
  const curve = new THREE.CatmullRomCurve3(points, true, "centripetal");
  return { geometry: new THREE.TubeGeometry(curve, points.length * 2, radius, 10, true), length: curve.getLength() };
}

// ---------------------------------------------------------------------------------------------
// Texturas procedurais (canvas)
// ---------------------------------------------------------------------------------------------

type SurfaceKind = "weave" | "pile" | "coil" | "cork" | "wood" | "pine" | "overlock" | "stitch";
type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number, tint: string) => void;

/** Disco que se repete nas bordas do ladrilho (textura sem emenda). */
function wrapDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, w: number, h: number) {
  for (const dx of [-w, 0, w]) {
    for (const dy of [-h, 0, h]) {
      const px = x + dx;
      const py = y + dy;
      if (px + r < 0 || px - r > w || py + r < 0 || py - r > h) continue;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function tone(color: string, toward: string, amount: number) {
  return new THREE.Color(color).lerp(new THREE.Color(toward), amount).getStyle();
}

/** Trama de tecido (relevo): fios alternando na horizontal e na vertical. */
const paintWeave: Painter = (ctx, w, h, rand) => {
  const image = ctx.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const across = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
      const ridge = Math.sin(((((across ? y : x) % 4) + 0.5) / 4) * Math.PI);
      const v = Math.max(0, Math.min(255, 70 + 150 * ridge + (rand() - 0.5) * 36));
      const i = (y * w + x) * 4;
      image.data[i] = v;
      image.data[i + 1] = v;
      image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
};

/** Pelúcia (relevo): tufos miúdos. Também serve de textura de borracha moldada. */
const paintPile: Painter = (ctx, w, h, rand) => {
  ctx.fillStyle = "#7a7a7a";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i += 1) {
    const g = Math.round(40 + rand() * 190);
    ctx.fillStyle = `rgba(${g},${g},${g},0.55)`;
    wrapDisc(ctx, rand() * w, rand() * h, 0.6 + rand() * 1.6, w, h);
  }
};

/** Vinil em espiral do capacho: laços claros (fibra) sobre vãos escuros (oclusão e relevo). */
const paintCoil: Painter = (ctx, w, h, rand) => {
  ctx.fillStyle = "#262626";
  ctx.fillRect(0, 0, w, h);
  ctx.lineCap = "round";
  for (let i = 0; i < 340; i += 1) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 4 + rand() * 7;
    const start = rand() * Math.PI * 2;
    const span = Math.PI * (1.1 + rand() * 0.8);
    const g = Math.round(185 + rand() * 70);
    ctx.strokeStyle = `rgb(${g},${g},${g})`;
    ctx.lineWidth = 2.2 + rand() * 2.2;
    for (const dx of [-w, 0, w]) {
      for (const dy of [-h, 0, h]) {
        if (x + dx + r < 0 || x + dx - r > w || y + dy + r < 0 || y + dy - r > h) continue;
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, r, start, start + span);
        ctx.stroke();
      }
    }
  }
};

const CORK_GRAINS = ["#a8774a", "#d6ad78", "#8f6238", "#e4c38f", "#b98a57"];

/** Cortiça aglomerada: grânulos de vários tons e poros escuros. */
const paintCork: Painter = (ctx, w, h, rand) => {
  ctx.fillStyle = "#c29466";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i += 1) {
    ctx.fillStyle = CORK_GRAINS[Math.floor(rand() * CORK_GRAINS.length)];
    wrapDisc(ctx, rand() * w, rand() * h, 0.6 + rand() * 1.7, w, h);
  }
  ctx.fillStyle = "#5e3d22";
  for (let i = 0; i < 260; i += 1) wrapDisc(ctx, rand() * w, rand() * h, 0.4 + rand() * 0.6, w, h);
};

/** Madeira clara (pinus/tauari): veios longos ondulados, desenho de catedral e poros. Veio ao longo de x. */
const paintWood: Painter = (ctx, w, h, rand) => {
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, "#cda274");
  base.addColorStop(0.5, "#d7ae80");
  base.addColorStop(1, "#c89b6a");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 110; i += 1) {
    const y0 = rand() * h;
    const amp = 1.5 + rand() * 9;
    const f1 = ((0.6 + rand() * 1.6) * Math.PI * 2) / w;
    const f2 = f1 * (2.3 + rand());
    const p1 = rand() * Math.PI * 2;
    const p2 = rand() * Math.PI * 2;
    const dark = rand() < 0.7;
    ctx.strokeStyle = dark ? `rgba(120,72,36,${0.06 + rand() * 0.22})` : `rgba(255,232,196,${0.05 + rand() * 0.12})`;
    ctx.lineWidth = 0.6 + rand() * (dark ? 2.6 : 6);
    ctx.beginPath();
    for (let x = -8; x <= w + 8; x += 8) {
      const y = y0 + amp * Math.sin(x * f1 + p1) + amp * 0.35 * Math.sin(x * f2 + p2);
      if (x === -8) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Catedrais: anéis alongados de corte tangencial.
  for (let k = 0; k < 2; k += 1) {
    const cx = w * (0.2 + rand() * 0.6);
    const cy = h * (0.25 + rand() * 0.5);
    for (let j = 0; j < 9; j += 1) {
      ctx.strokeStyle = `rgba(112,64,30,${0.08 + rand() * 0.12})`;
      ctx.lineWidth = 1 + rand() * 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 34 + j * 30, 4 + j * 5.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.fillStyle = "rgba(90,52,24,0.22)";
  for (let i = 0; i < 1600; i += 1) ctx.fillRect(rand() * w, rand() * h, 2 + rand() * 6, 1);
};

/**
 * Pinus (tábuas da 139/140): fundo claro amarelado com veios marcados, mais escuros e acinzentados, em faixas
 * paralelas de largura variável (o "listrado" do pinus das fotos). Veio ao longo de x.
 */
const paintPine: Painter = (ctx, w, h, rand) => {
  ctx.fillStyle = "#e0c99f";
  ctx.fillRect(0, 0, w, h);
  // Lenho de verão (faixas largas, mais claras) e de inverno (linhas escuras), ondulando juntos.
  let y = 0;
  while (y < h + 20) {
    const gap = 9 + rand() * 30;
    const amp = 2 + rand() * 8;
    const f = ((0.5 + rand() * 1.2) * Math.PI * 2) / w;
    const p = rand() * Math.PI * 2;
    ctx.strokeStyle = `rgba(${132 + rand() * 30},${98 + rand() * 20},${64 + rand() * 18},${0.35 + rand() * 0.4})`;
    ctx.lineWidth = 1.6 + rand() * 5.5;
    ctx.beginPath();
    for (let x = -8; x <= w + 8; x += 8) {
      const yy = y + amp * Math.sin(x * f + p) + amp * 0.3 * Math.sin(x * f * 2.7 + p * 1.3);
      if (x === -8) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    ctx.strokeStyle = `rgba(250,236,206,${0.08 + rand() * 0.14})`;
    ctx.lineWidth = gap * 0.5;
    ctx.stroke();
    y += gap;
  }
  ctx.fillStyle = "rgba(96,70,44,0.16)";
  for (let i = 0; i < 1400; i += 1) ctx.fillRect(rand() * w, rand() * h, 2 + rand() * 7, 1);
};

/** Viés com ponto overlock: fios diagonais envolvendo a borda. */
const paintOverlock: Painter = (ctx, w, h, _rand, tint) => {
  ctx.fillStyle = tone(tint, "#000000", 0.45);
  ctx.fillRect(0, 0, w, h);
  for (let c = -h; c <= w; c += 16) {
    ctx.strokeStyle = tone(tint, "#ffffff", 0.05);
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(c, 0);
    ctx.lineTo(c + h, h);
    ctx.stroke();
    ctx.strokeStyle = tone(tint, "#ffffff", 0.16);
    ctx.lineWidth = 3;
    ctx.stroke();
  }
};

/** Pesponto: traço de linha e vão transparente (alphaTest). */
const paintStitch: Painter = (ctx, w, h, _rand, tint) => {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = tint;
  ctx.fillRect(w * 0.06, 0, w * 0.58, h);
};

const SURFACES: Record<SurfaceKind, { size: [number, number]; seed: number; paint: Painter }> = {
  weave: { size: [128, 128], seed: 11, paint: paintWeave },
  pile: { size: [128, 128], seed: 23, paint: paintPile },
  coil: { size: [256, 256], seed: 37, paint: paintCoil },
  cork: { size: [128, 128], seed: 41, paint: paintCork },
  wood: { size: [1024, 512], seed: 53, paint: paintWood },
  pine: { size: [1024, 768], seed: 59, paint: paintPine },
  overlock: { size: [64, 64], seed: 67, paint: paintOverlock },
  stitch: { size: [64, 16], seed: 71, paint: paintStitch },
};

function paintSurface(kind: SurfaceKind, repeatX: number, repeatY: number, tint: string) {
  const { size, seed, paint } = SURFACES[kind];
  const canvas = document.createElement("canvas");
  canvas.width = size[0];
  canvas.height = size[1];
  const ctx = canvas.getContext("2d");
  if (ctx) paint(ctx, canvas.width, canvas.height, seeded(seed), tint);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(Math.max(repeatX, 0.01), Math.max(repeatY, 0.01));
  texture.anisotropy = 8;
  return texture;
}

/** Pinus das tábuas (o mesmo da tábua talhada), para a tábua de frios dentro da caixa acrílica (boxes.tsx). */
export function usePineTexture() {
  return useSurfaceTexture("pine", 1, 1);
}

/** Textura de superfície com repetição (ladrilhos por peça); liberada ao trocar ou desmontar. */
function useSurfaceTexture(kind: SurfaceKind, repeatX: number, repeatY: number, tint = "#ffffff") {
  const texture = useMemo(() => paintSurface(kind, repeatX, repeatY, tint), [kind, repeatX, repeatY, tint]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

// ---------------------------------------------------------------------------------------------
// Materiais e acabamentos de borda
// ---------------------------------------------------------------------------------------------

/** Tecido sublimado (microfibra, Córdoba, pelúcia curta): fosco, brilho de fibra e trama em relevo. */
function ClothPrint({ map, bump, bumpScale = 0.22, sheen = 0.4 }: { map: THREE.Texture; bump: THREE.Texture; bumpScale?: number; sheen?: number }) {
  return <meshPhysicalMaterial map={map} roughness={0.86} sheen={sheen} sheenRoughness={0.55} sheenColor="#ffffff" bumpMap={bump} bumpScale={bumpScale} />;
}

function Rubber({ color, bump }: { color: string; bump?: THREE.Texture }) {
  return <meshStandardMaterial color={color} roughness={0.9} bumpMap={bump ?? null} bumpScale={0.12} />;
}

type EdgeProps = { shape: MockupShape; w: number; h: number; radius: number; s: number; color: string };

/** Viés costurado em overlock contornando a borda (mouse pad): tubo meio por cima, meio pela lateral. */
function Binding({ shape, w, h, radius, s, color, t }: EdgeProps & { t: number }) {
  const tube = useMemo(() => {
    const r = t * 0.62;
    const inset = r * 0.72;
    return contourTube(contourPoints(shape, w - 2 * inset, h - 2 * inset, radius - inset, 0.3 * s, t / 2), r);
  }, [shape, w, h, radius, t, s]);
  useGeometryCleanup(tube.geometry);
  // Um ladrilho = 4 voltas de linha a cada 4 mm.
  const wraps = Math.max(12, Math.round(tube.length / s / 0.4));
  const texture = useSurfaceTexture("overlock", wraps, 1, color);
  return (
    <mesh geometry={tube.geometry}>
      <meshPhysicalMaterial map={texture} bumpMap={texture} bumpScale={0.5} roughness={0.78} sheen={0.5} sheenRoughness={0.5} sheenColor="#ffffff" />
    </mesh>
  );
}

/** Pesponto da bainha (jogo americano): linha tracejada rente à superfície, a `inset` da borda. */
function RunningStitch({ shape, w, h, radius, s, color, inset, z }: EdgeProps & { inset: number; z: number }) {
  const tube = useMemo(
    () => contourTube(contourPoints(shape, w - 2 * inset, h - 2 * inset, radius - inset, 0.4 * s, z), 0.07 * s),
    [shape, w, h, radius, inset, z, s],
  );
  useGeometryCleanup(tube.geometry);
  const stitches = Math.max(12, Math.round(tube.length / s / 0.5));
  const texture = useSurfaceTexture("stitch", stitches, 1, color);
  return (
    <mesh geometry={tube.geometry}>
      <meshStandardMaterial map={texture} alphaTest={0.5} roughness={0.7} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------------------------
// Adereços neutros (cm, escalados pelo fator da peça)
// ---------------------------------------------------------------------------------------------

/** Concha do mouse: esfera achatada embaixo, mais alta atrás e mais estreita na frente (frente em -z). */
function mouseShell() {
  const geometry = new THREE.SphereGeometry(1, 64, 40);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const hump = 1 - 0.35 * ((z - 0.25) / 1.25) ** 2;
    const half = 3.1 * (0.9 + 0.1 * z);
    position.setXYZ(i, x * half, y > 0 ? y * 3.6 * hump : y * 0.3, z * 6);
  }
  geometry.translate(0, 0.3, 0);
  smoothNormals(geometry);
  return geometry;
}

function Mouse({ s, position, rotation = 0 }: { s: number; position: [number, number, number]; rotation?: number }) {
  const shell = useMemo(() => mouseShell(), []);
  useGeometryCleanup(shell);
  return (
    <group position={position} rotation-y={rotation} scale={s}>
      <mesh geometry={shell}>
        <meshPhysicalMaterial color="#1b1c1f" roughness={0.4} clearcoat={0.6} clearcoatRoughness={0.3} />
      </mesh>
      {/* Rodinha de rolagem. */}
      <mesh position={[0, 3.32, -2]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.42, 0.42, 0.34, 28]} />
        <meshStandardMaterial color="#2c2c2c" roughness={0.85} />
      </mesh>
    </group>
  );
}

/** Perfil do prato (raio R em cm): pé, fundo, aba subindo e borda arredondada. */
function platePoints(R: number): Pt[] {
  return [
    [0, 0.24],
    [R * 0.36, 0.24],
    [R * 0.38, 0.03],
    [R * 0.4, 0],
    [R * 0.44, 0],
    [R * 0.47, 0.2],
    [R * 0.64, 0.44],
    [R * 0.8, 0.82],
    [R * 0.95, 1.42],
    [R, 1.62],
    [R * 0.995, 1.74],
    [R * 0.965, 1.75],
    [R * 0.8, 1.2],
    [R * 0.64, 0.72],
    [R * 0.58, 0.56],
    [R * 0.3, 0.52],
    [0, 0.52],
  ];
}

/** Face de baixo do prato (fração do raio, altura em cm), do pé até a borda. */
const PLATE_UNDERSIDE: Pt[] = [
  [0.44, 0],
  [0.47, 0.2],
  [0.64, 0.44],
  [0.8, 0.82],
  [0.95, 1.42],
  [1, 1.62],
];

/** Menor fração do raio em que a face de baixo do prato passa da altura `clearCm` (para a aba não atravessar a peça). */
function plateClearReach(clearCm: number) {
  for (let i = 1; i < PLATE_UNDERSIDE.length; i += 1) {
    const [f0, y0] = PLATE_UNDERSIDE[i - 1];
    const [f1, y1] = PLATE_UNDERSIDE[i];
    if (clearCm <= y1) return f0 + (f1 - f0) * Math.max(0, (clearCm - y0) / (y1 - y0));
  }
  return 1;
}

function Plate({ s, radiusCm, position }: { s: number; radiusCm: number; position: [number, number, number] }) {
  const geometry = useMemo(() => lathe(platePoints(radiusCm), 96), [radiusCm]);
  useGeometryCleanup(geometry);
  return (
    <mesh geometry={geometry} position={position} scale={s}>
      <meshPhysicalMaterial color="#f7f5f0" roughness={0.16} clearcoat={1} clearcoatRoughness={0.05} />
    </mesh>
  );
}

const FORK_RIGHT: Pt[] = [
  [0, 0],
  [0.55, 0.12],
  [0.95, 0.75],
  [1.05, 2.4],
  [0.88, 7.2],
  [0.55, 10.6],
  [0.3, 12.3],
  [0.34, 13.4],
  [0.8, 14.4],
  [1.18, 15.4],
  [1.22, 19.2],
  [0.78, 19.2],
  [0.76, 16.5],
  [0.58, 16.5],
  [0.56, 19.2],
  [0.1, 19.2],
  [0.09, 16.5],
  [0, 16.5],
];
/** Garfo de 4 dentes: metade direita espelhada. */
const FORK: Pt[] = [...FORK_RIGHT, ...FORK_RIGHT.slice(1, -1).reverse().map(([x, y]): Pt => [-x, y])];
/** Faca de mesa: cabo, gola, lâmina com dorso reto e ponta arredondada. */
const KNIFE: Pt[] = [
  [0, 0],
  [0.62, 0.1],
  [0.85, 0.8],
  [0.86, 9.4],
  [0.62, 10.2],
  [0.72, 10.8],
  [0.98, 11.5],
  [1.02, 16.8],
  [0.85, 19.2],
  [0.45, 20.6],
  [0.05, 21.1],
  [-0.4, 21],
  [-0.7, 20.4],
  [-0.75, 11.2],
  [-0.62, 10.7],
  [-0.6, 10.2],
  [-0.86, 9.4],
  [-0.85, 0.8],
  [-0.62, 0.1],
];

/** Talher em chapa de 2 mm com bisel, centrado no comprimento, base em z = 0. */
function flatwareGeometry(outline: Pt[]) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2 });
  const length = Math.max(...outline.map(([, y]) => y));
  geometry.translate(0, -length / 2, 0.05);
  return geometry;
}

/** Garfo e faca lado a lado, deitados com as pontas para o fundo. */
function Cutlery({ s, position }: { s: number; position: [number, number, number] }) {
  const fork = useMemo(() => flatwareGeometry(FORK), []);
  const knife = useMemo(() => flatwareGeometry(KNIFE), []);
  useGeometryCleanup(fork);
  useGeometryCleanup(knife);
  return (
    <group position={position} scale={s}>
      <mesh geometry={fork} rotation-x={FLAT}>
        <meshStandardMaterial color="#dfe2e6" metalness={1} roughness={0.28} />
      </mesh>
      <mesh geometry={knife} rotation-x={FLAT} position={[2.9, 0, 0.6]}>
        <meshStandardMaterial color="#dfe2e6" metalness={1} roughness={0.28} />
      </mesh>
    </group>
  );
}

/** Jarra de vidro (cm): parede com espessura, bico puxado na frente (-x), alça em +x e água até a metade. */
function pitcherGeometries() {
  const outer: Pt[] = [
    [0, 0],
    ...smoothProfile(
      [
        [4.6, 0],
        [5.2, 0.25],
        [5.5, 1.2],
        [6.2, 6],
        [6.35, 10],
        [5.9, 15],
        [5.25, 18.5],
        [5.45, 21],
        [5.75, 22],
      ],
      48,
    ),
  ];
  const inner = smoothProfile(
    [
      [5.45, 22],
      [5.15, 21],
      [4.95, 18.5],
      [5.55, 15],
      [6.0, 10],
      [5.85, 6],
      [5.1, 1.6],
      [4.2, 1.0],
    ],
    48,
  );
  const glass = lathe([...outer, [5.62, 22.12], ...inner, [0, 0.95]], 72);
  // Bico: empurra a borda para fora perto de -x, nos últimos 3,5 cm.
  const position = glass.getAttribute("position");
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    if (y <= 18.5) continue;
    const x = position.getX(i);
    const z = position.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-6) continue;
    const k = Math.min(1, ((y - 18.5) / 3.6) ** 2);
    const pull = k * Math.max(0, -x / r) ** 6;
    const scale = (r + 1.5 * pull) / r;
    position.setXYZ(i, x * scale, y + 0.6 * pull, z * scale);
  }
  smoothNormals(glass);
  const water = lathe(
    [
      [0, 1.02],
      [4.1, 1.08],
      [5.0, 1.65],
      [5.78, 6],
      [5.93, 10],
      [5.7, 13],
      [0, 13],
    ],
    72,
  );
  // Alça em +x com as pontas enterradas na espessura da parede (raio externo ~5,25 em cima e ~6,25 embaixo).
  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(5.02, 18.6, 0),
    new THREE.Vector3(6.6, 18.95, 0),
    new THREE.Vector3(8.9, 17.3, 0),
    new THREE.Vector3(9.95, 13.2, 0),
    new THREE.Vector3(9.35, 9.6, 0),
    new THREE.Vector3(7.7, 7.6, 0),
    new THREE.Vector3(6.05, 7.0, 0),
  ]);
  const handle = new THREE.TubeGeometry(handleCurve, 72, 0.55, 18, false);
  return { glass, water, handle };
}

function GlassMaterial() {
  return <meshPhysicalMaterial color="#eef8f6" roughness={0.04} clearcoat={1} clearcoatRoughness={0.02} transparent opacity={0.3} depthWrite={false} envMapIntensity={1.6} />;
}

function Pitcher({ s, position, rotation = 0 }: { s: number; position: [number, number, number]; rotation?: number }) {
  const parts = useMemo(() => pitcherGeometries(), []);
  useGeometryCleanup(parts.glass);
  useGeometryCleanup(parts.water);
  useGeometryCleanup(parts.handle);
  return (
    <group position={position} rotation-y={rotation} scale={s}>
      <mesh geometry={parts.water} renderOrder={1}>
        <meshPhysicalMaterial color="#d6ecee" roughness={0.05} transparent opacity={0.32} depthWrite={false} />
      </mesh>
      <mesh geometry={parts.glass} renderOrder={2}>
        <GlassMaterial />
      </mesh>
      <mesh geometry={parts.handle} renderOrder={2}>
        <GlassMaterial />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// mat: mouse pad, mouse pad gamer e jogo americano
// ---------------------------------------------------------------------------------------------

/** Mouse pad: base de borracha, microfibra sublimada e viés overlock. Gamer (90 × 40) ganha um mouse ao lado. */
function MousePad({ spec, art, label, showDims }: ModelProps) {
  const gamer = spec.variant === "gamer";
  const s = cmScale(spec.widthCm, spec.heightCm);
  const w = spec.widthCm * s;
  const h = spec.heightCm * s;
  const t = (gamer ? 0.4 : 0.3) * s;
  const radius = (gamer ? 1.3 : 1.6) * s;
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const weave = useSurfaceTexture("weave", spec.widthCm / 1.1, spec.heightCm / 1.1);
  const rubber = useSoftLayer(spec.shape, w, h, t * 0.8, radius, t * 0.3);
  const cloth = useSoftLayer(spec.shape, w, h, t * 0.2, radius, t * 0.08);
  const [lw, lh] = sizeLabels(spec);
  const view: View = gamer ? { elevation: 0.7, azimuth: 0.28 } : { elevation: 0.92, azimuth: 0.32 };
  return (
    <group userData={{ view }}>
      <group rotation-x={FLAT}>
        <mesh geometry={rubber}>
          <Rubber color="#151515" />
        </mesh>
        <mesh geometry={cloth} position-z={t * 0.8}>
          <ClothPrint map={front} bump={weave} />
        </mesh>
        <Binding shape={spec.shape} w={w} h={h} radius={radius} t={t} s={s} color={spec.baseColor} />
        {hasDims(spec, showDims) && <Dimensions w={w} h={h} z={t * 1.4} labelW={lw} labelH={lh} />}
      </group>
      {gamer && <Mouse s={s} position={onTable(w * 0.35, -h * 0.08, t)} rotation={-0.14} />}
    </group>
  );
}

/** Jogo americano de tecido Córdoba: borda macia, pesponto da bainha, prato e talheres neutros ao lado. */
function Placemat({ spec, art, label, showDims }: ModelProps) {
  const W = spec.widthCm;
  const H = spec.heightCm;
  const s = cmScale(W, H);
  const w = W * s;
  const h = H * s;
  const t = 0.2 * s;
  const radius = 1 * s;
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const weave = useSurfaceTexture("weave", W / 0.7, H / 0.7);
  const layer = useSoftLayer(spec.shape, w, h, t, radius, t * 0.45);
  const [lw, lh] = sizeLabels(spec);
  // Prato no canto do fundo, com a aba passando da borda: cobre pouco da arte e explica o uso.
  const plateR = 0.36 * Math.min(W, H);
  const plate = onTable((W / 2 + 0.2 * plateR) * s, (H / 2 - 0.05 * plateR) * s, t);
  const cutlery = onTable((W / 2 + 3.2) * s, -H * 0.14 * s);
  return (
    <group userData={{ view: { elevation: 0.9, azimuth: 0.22 } satisfies View }}>
      <group rotation-x={FLAT}>
        <mesh geometry={layer}>
          <ClothPrint map={front} bump={weave} bumpScale={0.3} sheen={0.3} />
        </mesh>
        <RunningStitch shape={spec.shape} w={w} h={h} radius={radius} s={s} color="#f3efe6" inset={1.1 * s} z={t} />
        {hasDims(spec, showDims) && <Dimensions w={w} h={h} z={t + 0.01} labelW={lw} labelH={lh} />}
      </group>
      <Plate s={s} radiusCm={plateR} position={plate} />
      <Cutlery s={s} position={cutlery} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// rug: tapete sublimático e capacho
// ---------------------------------------------------------------------------------------------

/** Tapete sublimático: pelúcia estampada de borda boleada sobre base de borracha um pouco maior. */
function Rug({ spec, art, label, showDims }: ModelProps) {
  const W = spec.widthCm;
  const H = spec.heightCm;
  const s = cmScale(W, H);
  const w = W * s;
  const h = H * s;
  const radius = Math.min(3, 0.1 * Math.min(W, H)) * s;
  const lip = 0.4 * s;
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const pileBump = useSurfaceTexture("pile", W / 1.4, H / 1.4);
  const base = useSoftLayer(spec.shape, w + 2 * lip, h + 2 * lip, 0.16 * s, radius + lip, 0.07 * s);
  const pile = useSoftLayer(spec.shape, w, h, 0.54 * s, radius, 0.24 * s);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group userData={{ view: { elevation: 0.78, azimuth: 0.3 } satisfies View }}>
      <group rotation-x={FLAT}>
        <mesh geometry={base}>
          <Rubber color={spec.baseColor} />
        </mesh>
        <mesh geometry={pile} position-z={0.16 * s}>
          <meshPhysicalMaterial map={front} roughness={0.96} sheen={0.5} sheenRoughness={0.45} sheenColor="#ffffff" bumpMap={pileBump} bumpScale={0.35} />
        </mesh>
        {hasDims(spec, showDims) && <Dimensions w={w} h={h} z={0.8 * s + 0.01} labelW={lw} labelH={lh} />}
      </group>
    </group>
  );
}

/** Capacho de vinil: campo de fibra em espiral impresso em UV, sobre moldura de borracha na cor escolhida. */
function Doormat({ spec, art, label, showDims }: ModelProps) {
  const W = spec.widthCm;
  const H = spec.heightCm;
  const s = cmScale(W, H);
  const border = Math.min(3.5, 0.06 * Math.min(W, H));
  const fw = W - 2 * border;
  const fh = H - 2 * border;
  const radius = Math.min(4, 0.08 * Math.min(W, H));
  // A arte ocupa o campo de fibra, não a moldura.
  const front = useArtTexture(fw / fh, "front", art, label);
  const coil = useSurfaceTexture("coil", fw / 4.5, fh / 4.5);
  const grain = useSurfaceTexture("pile", W / 1.2, H / 1.2);
  const base = useSoftLayer(spec.shape, W * s, H * s, 0.45 * s, radius * s, 0.2 * s);
  const field = useSoftLayer(spec.shape, fw * s, fh * s, 0.85 * s, Math.max(radius - border * 0.6, 0.6) * s, 0.3 * s);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group userData={{ view: { elevation: 0.72, azimuth: 0.26 } satisfies View }}>
      <group rotation-x={FLAT}>
        <mesh geometry={base}>
          <Rubber color={spec.baseColor} bump={grain} />
        </mesh>
        <mesh geometry={field} position-z={0.3 * s}>
          <meshStandardMaterial map={front} roughness={0.93} aoMap={coil} aoMapIntensity={0.5} bumpMap={coil} bumpScale={0.8} />
        </mesh>
        {hasDims(spec, showDims) && <Dimensions w={W * s} h={H * s} z={1.15 * s + 0.01} labelW={lw} labelH={lh} />}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// board: tábua de carne / frios
// ---------------------------------------------------------------------------------------------

const BURN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Converte a arte em fator de queima: tinta escura vira marrom tostado, fundo claro deixa a madeira intacta.
const BURN_FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform vec3 burn;
varying vec2 vUv;
void main() {
  vec4 art = texture2D(map, vUv);
  float lum = pow(max(dot(art.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0), 1.0 / 2.2);
  float depth = (1.0 - smoothstep(0.18, 0.92, lum)) * art.a;
  gl_FragColor = vec4(mix(vec3(1.0), burn, depth), 1.0);
}`;

type PanelProps = { map: THREE.Texture; w: number; h: number; x: number; z: number; s: number };

/** Gravação a laser: multiplica a madeira pelo tom de queima (os veios continuam aparecendo por baixo). */
function LaserEngraving({ map, w, h, x, z }: PanelProps) {
  const uniforms = useMemo(() => ({ map: { value: map }, burn: { value: new THREE.Vector3(0.36, 0.25, 0.18) } }), [map]);
  return (
    <mesh position={[x, 0, z + 0.0012]}>
      <planeGeometry args={[w, h]} />
      {/* O renderer guarda o objeto de uniforms na compilação: textura nova (outro tamanho) pede material novo. */}
      <shaderMaterial
        key={map.uuid}
        uniforms={uniforms}
        vertexShader={BURN_VERTEX}
        fragmentShader={BURN_FRAGMENT}
        transparent
        depthWrite={false}
        blending={THREE.MultiplyBlending}
        premultipliedAlpha
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
}

/**
 * Painel sublimado embutido: placa brilhante (arte em UV planar, sem distorção) 1,2 mm acima da madeira,
 * com o friso escuro do encaixe em volta.
 *
 * O friso é um anel (contorno do encaixe menos a placa) e não um retângulo cheio sob a placa: com
 * polygonOffset, o deslocamento cresce com a inclinação e com o tamanho do pixel e, em canvas pequeno
 * (render headless, miniatura, celular), passava dos 1,2 mm da placa, e o friso marrom cobria a arte inteira.
 */
function SublimatedPanel({ map, w, h, x, z, s, spec }: PanelProps & { spec: MockupSpec }) {
  const radius = 1 * s;
  const plate = useSoftLayer("rect", w, h, 0.2 * s, radius, 0.06 * s);
  const groove = useMemo(() => {
    const gap = 0.175 * s;
    // O furo entra 0,5 mm por baixo da parede da placa: sem fresta clara entre friso e placa.
    const tuck = 0.05 * s;
    const ring = makeShape("rect", w + 2 * gap, h + 2 * gap, radius + gap);
    ring.holes.push(makeShape("rect", w - 2 * tuck, h - 2 * tuck, Math.max(radius - tuck, 1e-4)));
    return new THREE.ShapeGeometry(ring, 24);
  }, [w, h, radius, s]);
  useGeometryCleanup(groove);
  const glossy = useMemo(() => ({ ...spec, finish: "gloss" as const, clearcoat: 1, spotVarnish: false }), [spec]);
  return (
    <group position={[x, 0, 0]}>
      {/* Levemente acima do tampo: vence a madeira no teste de profundidade sem polygonOffset. */}
      <mesh geometry={groove} position-z={z + 0.0008}>
        <meshStandardMaterial color="#5a3a1e" roughness={0.9} />
      </mesh>
      <mesh geometry={plate} position-z={z - 0.08 * s}>
        <PrintMaterial map={map} spec={glossy} />
      </mesh>
    </group>
  );
}

/** Tábua de madeira com cantos e arestas boleados e furo de pendurar; arte em painel sublimado ou gravada a laser. */
function CuttingBoard({ spec, art, label, showDims }: ModelProps) {
  const laser = spec.variant === "laser";
  const W = spec.widthCm;
  const H = spec.heightCm;
  const s = cmScale(W, H);
  const T = Math.min(3, Math.max(1.8, spec.depthCm));
  const corner = Math.min(3, 0.12 * Math.min(W, H));
  const holeR = Math.min(1.4, 0.06 * Math.min(W, H));
  const holeX = W / 2 - holeR - Math.max(1.6, 0.05 * W);
  const margin = Math.max(1.6, 0.07 * Math.min(W, H));
  // Área da arte: da margem esquerda até antes do furo.
  const left = -W / 2 + margin;
  const pw = Math.max(holeX - holeR - margin * 0.8 - left, W * 0.35);
  const ph = Math.max(H - 2 * margin, H * 0.5);
  const pcx = left + pw / 2;
  const front = useArtTexture(pw / ph, "front", art, label);
  const wood = useSurfaceTexture("wood", 1, 1);
  const board = useSoftLayer("rect", W * s, H * s, T * s, corner * s, 0.5 * s, holeR * s, holeX * s);
  const [lw, lh] = sizeLabels(spec);
  const panel: PanelProps = { map: front, w: pw * s, h: ph * s, x: pcx * s, z: T * s, s };
  return (
    <group userData={{ view: { elevation: 0.7, azimuth: 0.35 } satisfies View }}>
      <group rotation-x={FLAT}>
        <mesh geometry={board}>
          <meshPhysicalMaterial map={wood} bumpMap={wood} bumpScale={0.06} roughness={0.58} clearcoat={0.18} clearcoatRoughness={0.5} />
        </mesh>
        {laser ? <LaserEngraving {...panel} /> : <SublimatedPanel {...panel} spec={spec} />}
        {hasDims(spec, showDims) && <Dimensions w={W * s} h={H * s} z={T * s + 0.02} labelW={lw} labelH={lh} />}
      </group>
    </group>
  );
}

/** Raios dos cantos [sup. esq., sup. dir., inf. dir., inf. esq.]. */
type Corners = [number, number, number, number];

/** Retângulo w × h centrado com um raio por canto (arcos de círculo de verdade, mesmo nos raios grandes). */
function cornerRect(w: number, h: number, [tl, tr, br, bl]: Corners) {
  const x = w / 2;
  const y = h / 2;
  const s = new THREE.Shape();
  s.moveTo(-x + bl, -y);
  s.lineTo(x - br, -y);
  s.absarc(x - br, -y + br, br, -Math.PI / 2, 0, false);
  s.lineTo(x, y - tr);
  s.absarc(x - tr, y - tr, tr, 0, Math.PI / 2, false);
  s.lineTo(-x + tl, y);
  s.absarc(-x + tl, y - tl, tl, Math.PI / 2, Math.PI, false);
  s.lineTo(-x, -y + bl);
  s.absarc(-x + bl, -y + bl, bl, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** Contorno da tábua talhada (cm): a de carne (139) tem os cantos da esquerda bem redondos; a de frios (140), cantos justos. */
function boardCorners(meat: boolean, W: number, H: number): Corners {
  const m = Math.min(W, H);
  return meat ? [0.3 * H, 0.17 * H, 0.06 * H, 0.3 * H] : [0.03 * m, 0.03 * m, 0.03 * m, 0.03 * m];
}

/** Placa de madeira com arestas boleadas e cantos próprios (mesma montagem de softLayerGeometry). */
function boardGeometry(corners: Corners, w: number, h: number, t: number, bevel: number) {
  const b = Math.max(0, Math.min(bevel, t * 0.49, w * 0.2, h * 0.2));
  const shape = cornerRect(Math.max(w - 2 * b, 1e-3), Math.max(h - 2 * b, 1e-3), corners.map((r) => Math.max(r - b, 1e-4)) as Corners);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: Math.max(t - 2 * b, 1e-4), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 4, curveSegments: 24 });
  geometry.translate(0, 0, b);
  planarUv(geometry, w, h);
  smoothNormals(geometry);
  return geometry;
}

/**
 * Canal de suco (cm), aberto no canto de baixo à direita como nas fotos: começa na borda de baixo, contorna a
 * esquerda, o topo e desce pela direita até um quarto da altura. Pontos no plano da tábua.
 */
function grooveLine(W: number, H: number, corners: Corners, inset: number) {
  const x = W / 2 - inset;
  const y = H / 2 - inset;
  const [tl, tr, , bl] = corners.map((r) => Math.max(r - inset, 0.4));
  const points: THREE.Vector2[] = [new THREE.Vector2(W * 0.24, -y)];
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
    for (let i = 0; i <= 16; i += 1) {
      const a = a0 + ((a1 - a0) * i) / 16;
      points.push(new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)));
    }
  };
  arc(-x + bl, -y + bl, bl, -Math.PI / 2, -Math.PI);
  arc(-x + tl, y - tl, tl, Math.PI, Math.PI / 2);
  arc(x - tr, y - tr, tr, Math.PI / 2, 0);
  points.push(new THREE.Vector2(x, -H * 0.24));
  return points;
}

/** Textura do canal (alfa = profundidade): traço largo e um fio mais escuro no lado da sombra. */
function grooveTexture(W: number, H: number, corners: Corners) {
  const cw = 1024;
  const ch = Math.round((cw * H) / W);
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  if (!ctx) return texture;
  const k = cw / W;
  const line = grooveLine(W, H, corners, Math.max(1.1, 0.045 * Math.min(W, H)));
  const trace = (dx: number, dy: number) => {
    ctx.beginPath();
    line.forEach((p, i) => {
      const px = (p.x + W / 2) * k + dx;
      const py = (H / 2 - p.y) * k + dy;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  };
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = 0.62 * k;
  trace(0, 0);
  // Parede do lado da luz (alto à esquerda) na sombra: fio escuro deslocado para lá.
  ctx.strokeStyle = "rgba(0,0,0,0.42)";
  ctx.lineWidth = 0.18 * k;
  trace(-0.17 * k, -0.17 * k);
  texture.needsUpdate = true;
  return texture;
}

// Talhado na madeira (fresa): onde a arte marca, o fundo do talho fica mais escuro (fibra cortada) e a parede do
// lado da luz faz sombra; o canal de suco entra pela mesma conta. Multiplica a madeira (os veios seguem por baixo).
const CARVE_FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform sampler2D groove;
uniform vec2 texel;
uniform vec3 tone;
varying vec2 vUv;
${ENGRAVE_MASK_GLSL}
void main() {
  float c = engraveAt(vUv);
  vec2 o = texel * 5.0;
  float shade = c * (1.0 - engraveAt(vUv + vec2(-o.x, o.y)));
  float g = texture2D(groove, vUv).a;
  vec3 color = mix(vec3(1.0), tone, c) * (1.0 - 0.5 * shade) * (1.0 - g);
  gl_FragColor = vec4(color, 1.0);
}`;

/** Camada do talho sobre o tampo (multiplica a madeira). `direct`: a arte já vem num tom só (processo talhamento). */
function Carving({ map, groove, w, h, z, direct }: { map: THREE.Texture; groove: THREE.Texture; w: number; h: number; z: number; direct: boolean }) {
  const image = map.image as { width?: number; height?: number } | undefined;
  const uniforms = useMemo(
    () => ({
      map: { value: map },
      groove: { value: groove },
      texel: { value: new THREE.Vector2(1 / (image?.width ?? 1024), 1 / (image?.height ?? 1024)) },
      tone: { value: new THREE.Vector3(0.8, 0.7, 0.58) },
    }),
    [map, groove, image?.width, image?.height],
  );
  return (
    <mesh position={[0, 0, z + 0.0012]}>
      <planeGeometry args={[w, h]} />
      {/* Como no LaserEngraving: textura nova pede material novo (o renderer guarda os uniforms). */}
      <shaderMaterial
        key={`${map.uuid}:${groove.uuid}:${direct}`}
        uniforms={uniforms}
        vertexShader={BURN_VERTEX}
        fragmentShader={direct ? `#define ENGRAVE_DIRECT\n${CARVE_FRAGMENT}` : CARVE_FRAGMENT}
        transparent
        depthWrite={false}
        blending={THREE.MultiplyBlending}
        premultipliedAlpha
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
}

/**
 * Tábua talhada na fresa (139/140): pinus maciço sem furo, contorno de cada tábua (a de carne com os cantos da
 * esquerda redondos), canal de suco em volta aberto no canto de baixo à direita e a arte talhada em baixo-relevo
 * sobre o tampo inteiro (texto e vetor: grava o que se destaca do fundo da arte).
 */
function CarvedBoard({ spec, art, label, showDims }: ModelProps) {
  const W = spec.widthCm;
  const H = spec.heightCm;
  const s = cmScale(W, H);
  const T = Math.min(3, Math.max(1.8, spec.depthCm));
  const corners = useMemo(() => boardCorners(spec.variant === "meat", W, H), [spec.variant, W, H]);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const tauari = /\btauari\b/.test(spec.details ?? "");
  const wood = useSurfaceTexture(tauari ? "wood" : "pine", 1, 1);
  const board = useMemo(() => boardGeometry(corners.map((r) => r * s) as Corners, W * s, H * s, T * s, 0.45 * s), [corners, W, H, T, s]);
  useGeometryCleanup(board);
  const groove = useMemo(() => grooveTexture(W, H, corners), [W, H, corners]);
  useEffect(() => () => groove.dispose(), [groove]);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group userData={{ view: { elevation: 0.7, azimuth: 0.35 } satisfies View }}>
      <group rotation-x={FLAT}>
        <mesh geometry={board}>
          <meshPhysicalMaterial map={wood} bumpMap={wood} bumpScale={0.05} roughness={0.66} clearcoat={0.08} clearcoatRoughness={0.6} />
        </mesh>
        <Carving map={front} groove={groove} w={W * s} h={H * s} z={T * s} direct={engravesDirect(art)} />
        {hasDims(spec, showDims) && <Dimensions w={W * s} h={H * s} z={T * s + 0.02} labelW={lw} labelH={lh} />}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// coaster: porta-copos, porta-jarra e sousplat
// ---------------------------------------------------------------------------------------------

/** Jogo de 4 porta-copos: um em destaque e três empilhados ao fundo; tampo impresso sobre cortiça de 3 mm. */
function CoasterSet({ spec, art, label, showDims }: ModelProps) {
  const W = spec.widthCm;
  const H = spec.heightCm;
  const s = cmScale(W, H, 1.6);
  const w = W * s;
  const h = H * s;
  const topT = 0.12 * s;
  const corkT = 0.3 * s;
  const radius = 1 * s;
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const cork = useSurfaceTexture("cork", W / 2.5, H / 2.5);
  const top = useSoftLayer(spec.shape, w, h, topT, radius, topT * 0.4);
  const body = useSoftLayer(spec.shape, w, h, corkT, radius, corkT * 0.25);
  const [lw, lh] = sizeLabels(spec);
  const stride = topT + corkT + 0.0004;
  // A pilha fica atrás à esquerda sem encostar no destaque (conferido com giros de até 0,36 rad no quadrado).
  const pieces = [
    { id: "hero", x: 0, y: 0, level: 0, twist: 0 },
    { id: "stack-0", x: -0.85 * w, y: 1.1 * h, level: 0, twist: 0.22 },
    { id: "stack-1", x: -0.83 * w, y: 1.12 * h, level: 1, twist: -0.12 },
    { id: "stack-2", x: -0.87 * w, y: 1.09 * h, level: 2, twist: 0.36 },
  ];
  return (
    <group userData={{ view: { elevation: 0.82, azimuth: 0.3 } satisfies View }}>
      <group rotation-x={FLAT}>
        {pieces.map((p) => (
          <group key={p.id} position={[p.x, p.y, p.level * stride]} rotation-z={p.twist}>
            <mesh geometry={body}>
              <meshStandardMaterial map={cork} bumpMap={cork} bumpScale={0.3} roughness={0.95} />
            </mesh>
            <mesh geometry={top} position-z={corkT}>
              <PrintMaterial map={front} spec={spec} />
            </mesh>
          </group>
        ))}
        {hasDims(spec, showDims) && <Dimensions w={w} h={h} z={stride + 0.01} labelW={lw} labelH={lh} />}
      </group>
    </group>
  );
}

/** Porta-jarra emborrachado: tecido sublimado sobre borracha, com uma jarra de vidro ao fundo. */
function Trivet({ spec, art, label, showDims }: ModelProps) {
  const W = spec.widthCm;
  const H = spec.heightCm;
  const s = cmScale(W, H);
  const w = W * s;
  const h = H * s;
  const radius = 1.5 * s;
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const weave = useSurfaceTexture("weave", W / 1.1, H / 1.1);
  const base = useSoftLayer(spec.shape, w, h, 0.38 * s, radius, 0.14 * s);
  const top = useSoftLayer(spec.shape, w, h, 0.12 * s, radius, 0.04 * s);
  const [lw, lh] = sizeLabels(spec);
  const R = Math.max(W, H) / 2;
  return (
    <group userData={{ view: { elevation: 0.7, azimuth: 0.3 } satisfies View }}>
      <group rotation-x={FLAT}>
        <mesh geometry={base}>
          <Rubber color="#1a1a1a" />
        </mesh>
        <mesh geometry={top} position-z={0.38 * s}>
          <ClothPrint map={front} bump={weave} />
        </mesh>
        {hasDims(spec, showDims) && <Dimensions w={w} h={h} z={0.5 * s + 0.01} labelW={lw} labelH={lh} />}
      </group>
      <Pitcher s={s} position={onTable(0.9 * R * s, 1.38 * R * s)} rotation={-0.35} />
    </group>
  );
}

/** Sousplat (PVC 5 mm ou capa): disco de borda boleada com a arte no tampo e um prato encostado ao fundo. */
function Sousplat({ spec, art, label, showDims }: ModelProps) {
  const W = spec.widthCm;
  const H = spec.heightCm;
  const s = cmScale(W, H);
  const w = W * s;
  const h = H * s;
  const t = Math.min(0.8, Math.max(0.3, spec.depthCm)) * s;
  const bevel = Math.min(0.12 * s, t * 0.4);
  const radius = 2 * s;
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const body = useSoftLayer(spec.shape, w, h, t, radius, bevel);
  const face = useMemo(
    () => faceGeometry(makeShape(spec.shape, w - 2 * bevel, h - 2 * bevel, Math.max(radius - bevel, 1e-4)), w, h),
    [spec.shape, w, h, bevel, radius],
  );
  useGeometryCleanup(face);
  const printSpec = useMemo(() => ({ ...spec, clearcoat: Math.max(spec.clearcoat, 0.35) }), [spec]);
  const [lw, lh] = sizeLabels(spec);
  // Prato no chão, ao fundo à direita, com a aba passando por cima da borda do sousplat.
  const Rs = Math.max(W, H) / 2;
  const plateR = 0.31 * Math.max(W, H);
  // A aba só passa por cima onde a face de baixo do prato já está mais alta que o sousplat (+0,6 mm de folga).
  const reach = Rs + plateClearReach(t / s + 0.06) * plateR;
  const angle = 1.15;
  return (
    <group userData={{ view: { elevation: 0.85, azimuth: 0.3 } satisfies View }}>
      <group rotation-x={FLAT}>
        <mesh geometry={body}>
          <meshStandardMaterial color="#f3f3f1" roughness={0.6} />
        </mesh>
        <mesh geometry={face} position-z={t + 0.0015}>
          <PrintMaterial map={front} spec={printSpec} />
        </mesh>
        {hasDims(spec, showDims) && <Dimensions w={w} h={h} z={t + 0.01} labelW={lw} labelH={lh} />}
      </group>
      <Plate s={s} radiusCm={plateR} position={onTable(Math.cos(angle) * reach * s, Math.sin(angle) * reach * s)} />
    </group>
  );
}

/** Capa de sousplat (cm, do gabarito da 138): costura em Ø35 (o tampo) e tecido até Ø40, que dobra por baixo. */
const COVER = { seamR: 17.5, cutR: 20, disc: 0.5, fabric: 0.06, gathers: 56 };

/**
 * Casca de tecido da capa: tampo plano até a costura, borda boleada em volta do disco e a aba que entra por baixo,
 * franzida pelo elástico. UV radial pelo comprimento do tecido (o círculo de Ø40 do gabarito): o que passa da costura
 * é a parte da arte que vai para baixo. Montada em y para cima (sem o FLAT), topo da arte para o fundo.
 */
function coverShellGeometry() {
  const { seamR, cutR, disc, fabric, gathers } = COVER;
  const rho = disc / 2 + fabric;
  type Ring = { r: number; y: number; s: number; under: number };
  const rings: Ring[] = [];
  for (let i = 0; i <= 24; i += 1) rings.push({ r: (seamR * i) / 24, y: rho, s: (seamR * i) / 24, under: 0 });
  for (let i = 1; i <= 12; i += 1) {
    const a = Math.PI / 2 - (Math.PI * i) / 12;
    rings.push({ r: seamR + rho * Math.cos(a), y: rho * Math.sin(a), s: seamR + rho * (Math.PI / 2 - a), under: 0 });
  }
  const lipStart = seamR + rho * Math.PI;
  const lip = cutR - lipStart;
  for (let i = 1; i <= 10; i += 1) {
    const k = i / 10;
    rings.push({ r: seamR - lip * k, y: -rho - 0.05 * k, s: lipStart + lip * k, under: k });
  }
  const cols = 192;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  rings.forEach((ring) => {
    for (let i = 0; i <= cols; i += 1) {
      const phi = (i / cols) * Math.PI * 2;
      // Franzido do elástico: o tecido sobra na volta menor e faz pregas que crescem até a bainha.
      const pleat = ring.under * (0.5 + 0.5 * Math.sin(phi * gathers));
      const r = ring.r + ring.under * 0.35 * Math.sin(phi * gathers + 1.1);
      positions.push(r * Math.cos(phi), ring.y - pleat * 0.7, r * Math.sin(phi));
      uvs.push(0.5 + (ring.s / (2 * cutR)) * Math.cos(phi), 0.5 - (ring.s / (2 * cutR)) * Math.sin(phi));
    }
  });
  for (let j = 0; j < rings.length - 1; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const p = j * (cols + 1) + i;
      const q = p + cols + 1;
      indices.push(p, p + 1, q, p + 1, q + 1, q);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, hemR: seamR - lip, hemY: -rho - 0.05 };
}

/** Capa sobre o disco do sousplat (y para cima, centro na origem do disco). */
function CoveredSousplat({ shell, hem, front, weave }: { shell: { geometry: THREE.BufferGeometry; hemR: number; hemY: number }; hem: THREE.BufferGeometry; front: THREE.Texture; weave: THREE.Texture }) {
  return (
    <group>
      <mesh>
        <cylinderGeometry args={[COVER.seamR - 0.05, COVER.seamR - 0.05, COVER.disc, 96]} />
        <meshStandardMaterial color="#ecebe7" roughness={0.7} />
      </mesh>
      <mesh geometry={shell.geometry}>
        <meshPhysicalMaterial map={front} bumpMap={weave} bumpScale={0.25} roughness={0.82} sheen={0.45} sheenRoughness={0.5} sheenColor="#ffffff" side={THREE.DoubleSide} />
      </mesh>
      {/* Bainha com o elástico, fechando a aba por baixo. */}
      <mesh geometry={hem} position-y={shell.hemY - 0.1} rotation-x={Math.PI / 2}>
        <meshPhysicalMaterial map={front} roughness={0.85} sheen={0.4} sheenColor="#ffffff" />
      </mesh>
    </group>
  );
}

/**
 * Capa p/ Sousplat (138): Oxford sublimado esticado sobre o sousplat, a arte do círculo de Ø40 passando pela borda e
 * indo até embaixo, onde o elástico franze o tecido. Uma capa de frente e outra virada atrás, mostrando o franzido
 * (como na foto do produto).
 */
function SousplatCover({ spec, art, label, showDims }: ModelProps) {
  const s = cmScale(2.25 * COVER.cutR, 2.25 * COVER.cutR);
  const front = useArtTexture(1, "front", art, label);
  const weave = useSurfaceTexture("weave", 40 / 0.7, 40 / 0.7);
  const parts = useMemo(() => {
    const shell = coverShellGeometry();
    // Bainha: anel (tubo) na borda de dentro da aba, com a UV no fim do círculo da arte.
    const hem = new THREE.TorusGeometry(shell.hemR, 0.22, 8, 160);
    const uv = hem.getAttribute("uv");
    for (let i = 0; i < uv.count; i += 1) {
      const phi = uv.getX(i) * Math.PI * 2;
      uv.setXY(i, 0.5 + 0.495 * Math.cos(phi), 0.5 - 0.495 * Math.sin(phi));
    }
    return { shell, hem };
  }, []);
  useEffect(
    () => () => {
      parts.shell.geometry.dispose();
      parts.hem.dispose();
    },
    [parts],
  );
  const [lw, lh] = sizeLabels(spec);
  // Altura do centro do disco: a de frente apoia nas pregas da aba; a virada, no tampo.
  const lift = COVER.disc / 2 + COVER.fabric + 0.75;
  const liftFlipped = COVER.disc / 2 + COVER.fabric + 0.01;
  return (
    <group userData={{ view: { elevation: 0.8, azimuth: 0.3 } satisfies View }}>
      <group scale={s}>
        <group position={[-13, lift, 10]} rotation-y={0.2}>
          <CoveredSousplat shell={parts.shell} hem={parts.hem} front={front} weave={weave} />
        </group>
        {/* A outra, de cabeça para baixo: a aba franzida pelo elástico, com a arte até a bainha. */}
        <group position={[15, liftFlipped, -14]} rotation={[Math.PI, -0.5, 0]}>
          <CoveredSousplat shell={parts.shell} hem={parts.hem} front={front} weave={weave} />
        </group>
      </group>
      {hasDims(spec, showDims) && (
        <group position={[-13 * s, (lift + COVER.disc) * s, 10 * s]} rotation-x={FLAT}>
          <Dimensions w={2 * COVER.seamR * s} h={2 * COVER.seamR * s} z={0.01} labelW={lw} labelH={lh} />
        </group>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Exportados
// ---------------------------------------------------------------------------------------------

/**
 * Peças planas de mesa e chão (kinds mat, rug e board), deitadas e vistas de cima (userData.view):
 * mouse pad com viés overlock e base de borracha ({gamer} com mouse), jogo americano com prato e talheres
 * ({placemat}), tapete de pelúcia com base de borracha, capacho de vinil em espiral ({doormat}) e tábua
 * de madeira com veios procedurais e furo, com painel sublimado ou gravação a laser ({laser}); com "Fresa" nas
 * opções, tábua de pinus talhada em baixo-relevo com canal de suco ({meat}: cantos da esquerda redondos).
 */
export function MatModel(props: ModelProps) {
  const { spec } = props;
  if (spec.kind === "board") return /\bfresa\b/.test(spec.details ?? "") ? <CarvedBoard {...props} /> : <CuttingBoard {...props} />;
  if (spec.kind === "rug") return spec.variant === "doormat" ? <Doormat {...props} /> : <Rug {...props} />;
  if (spec.variant === "placemat") return <Placemat {...props} />;
  return <MousePad {...props} />;
}

/**
 * Porta-copos: jogo de 4 com base de cortiça (um em destaque e três empilhados), porta-jarra emborrachado
 * com jarra de vidro ({pitcher}) e sousplat redondo com prato ({placemat}).
 */
export function CoasterModel(props: ModelProps) {
  const { spec } = props;
  if (spec.variant === "pitcher") return <Trivet {...props} />;
  if (spec.variant === "cover") return <SousplatCover {...props} />;
  if (spec.variant === "placemat") return <Sousplat {...props} />;
  return <CoasterSet {...props} />;
}
