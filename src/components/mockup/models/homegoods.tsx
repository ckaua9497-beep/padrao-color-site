"use client";

// Têxteis de casa: almofadas (plush, capa/fronha, de corpo e para colorir), cama pet e tecidos
// (guardanapo, pano de prato, capa de corte e tecido sublimado/UV).
//
// Tudo é modelado em centímetros e escalado por `s` (unidades de cena por cm) no grupo raiz, então os
// adereços (canetinhas, prato, talheres, barra do forno, busto, bastão) mantêm a proporção real da peça.
// As superfícies de tecido são grades paramétricas (u, v) com normais por diferença central: a arte
// entra pelo UV da própria grade, que segue o comprimento do tecido (nada estica nem espelha).

import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MockupShape } from "@/lib/mockup";
import { artAspect } from "@/lib/mockup-kinds";
import { hasArtContent, type ArtVariant } from "../art";
import { useSceneMode, type RoomSurface } from "../viewer-hooks";
import { useGeometriesCleanup } from "./fabric";
import { inflatedSurface, shapePolygon } from "./inflate";
import { backVariant, makeShape, useArtTexture, useGeometryCleanup, type MaskPath, type ModelProps } from "./shared";
import { lathe, type Pt } from "./vessel";

/** Deita a peça: o plano XY vira o chão (arte para cima, topo da arte ao fundo). */
const FLAT = -Math.PI / 2;

type View = { elevation: number; azimuth?: number };

// ---------------------------------------------------------------------------- utilidades

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

function smoothstep(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Medida válida em cm (a spec pode trazer zero ou NaN de um produto mal cadastrado). */
function cm(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function tone(color: string, toward: string, amount: number) {
  return new THREE.Color(color).lerp(new THREE.Color(toward), amount).getStyle();
}

function isWhite(color: string) {
  return /^#f{3}(f{3})?$/i.test(color);
}

/** Branco puro estoura sob a luz de estúdio: tecido "branco" vira off-white. */
function clothColor(color: string) {
  return isWhite(color) ? "#f3f1ec" : color;
}

/** Ponto do chão (x, y no plano da peça deitada) em coordenadas de mundo, a uma altura `up`. */
function onTable(x: number, y: number, up = 0): [number, number, number] {
  return [x, up, -y];
}

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

/** Ponto mais baixo das geometrias depois de uma rotação (para apoiar adereços no mesmo chão). */
function lowestY(geometries: THREE.BufferGeometry[], rotation: [number, number, number]) {
  const matrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2]));
  const p = new THREE.Vector3();
  let min = Infinity;
  for (const geometry of geometries) {
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i += 1) min = Math.min(min, p.fromBufferAttribute(position, i).applyMatrix4(matrix).y);
  }
  return Number.isFinite(min) ? min : 0;
}

// ---------------------------------------------------------------------------- texturas procedurais

type TileKind = "weave" | "stitch";
type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number) => void;

/** Trama de tecido plano (relevo): fios alternando na horizontal e na vertical. */
const paintWeave: Painter = (ctx, w, h, rand) => {
  const image = ctx.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const across = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
      const ridge = Math.sin(((((across ? y : x) % 4) + 0.5) / 4) * Math.PI);
      const value = clamp(86 + 140 * ridge + (rand() - 0.5) * 34, 0, 255);
      const i = (y * w + x) * 4;
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
};

/** Pesponto: traço de linha e vão transparente (alphaTest). */
const paintStitch: Painter = (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(w * 0.08, h * 0.1, w * 0.56, h * 0.8);
};

const TILES: Record<TileKind, { size: [number, number]; seed: number; paint: Painter }> = {
  weave: { size: [128, 128], seed: 19, paint: paintWeave },
  stitch: { size: [64, 16], seed: 29, paint: paintStitch },
};

/** Textura repetida (trama, pesponto); liberada ao trocar ou desmontar. */
function useTile(kind: TileKind, repeatX: number, repeatY: number) {
  const texture = useMemo(() => {
    const { size, seed, paint } = TILES[kind];
    const canvas = document.createElement("canvas");
    canvas.width = size[0];
    canvas.height = size[1];
    const ctx = canvas.getContext("2d");
    if (ctx) paint(ctx, canvas.width, canvas.height, seeded(seed));
    const tile = new THREE.CanvasTexture(canvas);
    tile.colorSpace = THREE.SRGBColorSpace;
    tile.wrapS = THREE.RepeatWrapping;
    tile.wrapT = THREE.RepeatWrapping;
    tile.repeat.set(Math.max(repeatX, 0.01), Math.max(repeatY, 0.01));
    tile.anisotropy = 8;
    return tile;
  }, [kind, repeatX, repeatY]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/**
 * "Máscara" da almofada para colorir: converte a arte em desenho de contorno. Detecta bordas (Sobel)
 * numa grade de meia resolução já suavizada, engrossa o traço como caneta de contorno e devolve um
 * retângulo cheio, para o recorte que vem depois (destination-in) não apagar nada.
 */
const lineArtMask: MaskPath = (ctx, w, h) => {
  try {
    toLineArt(ctx, w, h);
  } catch {
    // Canvas bloqueado (imagem de outra origem): mantém a arte como está.
  }
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
};

function toLineArt(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  const gw = Math.max(3, Math.floor(w / 2));
  const gh = Math.max(3, Math.floor(h / 2));
  const size = gw * gh;
  const lum = new Float32Array(size);
  for (let y = 0; y < gh; y += 1) {
    for (let x = 0; x < gw; x += 1) {
      let sum = 0;
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          const i = (Math.min(h - 1, y * 2 + dy) * w + Math.min(w - 1, x * 2 + dx)) * 4;
          const alpha = data[i + 3] / 255;
          sum += ((0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255) * alpha + (1 - alpha);
        }
      }
      lum[y * gw + x] = sum / 4;
    }
  }
  // Desfoque 3×3: foto não vira chuvisco de bordas.
  const soft = new Float32Array(size);
  for (let y = 0; y < gh; y += 1) {
    for (let x = 0; x < gw; x += 1) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const row = clamp(y + dy, 0, gh - 1) * gw;
        for (let dx = -1; dx <= 1; dx += 1) sum += lum[row + clamp(x + dx, 0, gw - 1)];
      }
      soft[y * gw + x] = sum / 9;
    }
  }
  const edge = new Float32Array(size);
  for (let y = 1; y < gh - 1; y += 1) {
    for (let x = 1; x < gw - 1; x += 1) {
      const i = y * gw + x;
      const gx = soft[i - gw + 1] + 2 * soft[i + 1] + soft[i + gw + 1] - soft[i - gw - 1] - 2 * soft[i - 1] - soft[i + gw - 1];
      const gy = soft[i + gw - 1] + 2 * soft[i + gw] + soft[i + gw + 1] - soft[i - gw - 1] - 2 * soft[i - gw] - soft[i - gw + 1];
      edge[i] = smoothstep(0.22, 0.85, Math.hypot(gx, gy));
    }
  }
  // Engrossa o traço (máximo 3×3).
  const bold = new Float32Array(size);
  for (let y = 0; y < gh; y += 1) {
    for (let x = 0; x < gw; x += 1) {
      let best = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const row = clamp(y + dy, 0, gh - 1) * gw;
        for (let dx = -1; dx <= 1; dx += 1) best = Math.max(best, edge[row + clamp(x + dx, 0, gw - 1)]);
      }
      bold[y * gw + x] = best;
    }
  }
  for (let y = 0; y < h; y += 1) {
    const row = Math.min(gh - 1, y >> 1) * gw;
    for (let x = 0; x < w; x += 1) {
      const value = 255 - bold[row + Math.min(gw - 1, x >> 1)] * 214;
      const i = (y * w + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

// ---------------------------------------------------------------------------- malhas paramétricas

/** Superfície de tecido: (u, v) em cm do tecido → ponto 3D. ∂u × ∂v aponta para o lado estampado. */
type SheetFn = (u: number, v: number, out: THREE.Vector3) => THREE.Vector3;
/** [u0, u1, v0, v1]. */
type Range = [number, number, number, number];
type Tube = { geometry: THREE.TubeGeometry; length: number };

/**
 * Grade (nu + 1) × (nv + 1) com normais por diferença central (sem costura de normal nas bordas
 * repetidas quando a grade fecha em u ou v). `flip` inverte o lado visível.
 */
function gridGeometry(positions: Float32Array, uvs: Float32Array, nu: number, nv: number, flip: boolean, wrapU = false, wrapV = false) {
  const row = nu + 1;
  const indices: number[] = [];
  for (let j = 0; j < nv; j += 1) {
    for (let i = 0; i < nu; i += 1) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      if (flip) indices.push(a, d, b, a, c, d);
      else indices.push(a, b, d, a, d, c);
    }
  }
  const step = (k: number, delta: number, max: number, wrap: boolean) => {
    const next = k + delta;
    if (!wrap) return clamp(next, 0, max);
    if (next < 0) return max - 1;
    if (next > max) return 1;
    return next;
  };
  const normals = new Float32Array(positions.length);
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const du = new THREE.Vector3();
  const dv = new THREE.Vector3();
  for (let j = 0; j <= nv; j += 1) {
    for (let i = 0; i <= nu; i += 1) {
      p1.fromArray(positions, (j * row + step(i, 1, nu, wrapU)) * 3);
      p0.fromArray(positions, (j * row + step(i, -1, nu, wrapU)) * 3);
      du.subVectors(p1, p0);
      p1.fromArray(positions, (step(j, 1, nv, wrapV) * row + i) * 3);
      p0.fromArray(positions, (step(j, -1, nv, wrapV) * row + i) * 3);
      dv.subVectors(p1, p0);
      du.cross(dv);
      if (flip) du.negate();
      if (du.lengthSq() < 1e-20) du.set(0, 0, flip ? -1 : 1);
      else du.normalize();
      du.toArray(normals, (j * row + i) * 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/** Normal do lado estampado (∂u × ∂v) por diferença finita. */
function sheetNormal(fn: SheetFn, u: number, v: number, eps: number, out: THREE.Vector3) {
  const a = fn(u + eps, v, new THREE.Vector3()).sub(fn(u - eps, v, new THREE.Vector3()));
  const b = fn(u, v + eps, new THREE.Vector3()).sub(fn(u, v - eps, new THREE.Vector3()));
  out.crossVectors(a, b);
  return out.lengthSq() > 1e-20 ? out.normalize() : out.set(0, 0, 1);
}

/** Malha de um trecho do tecido; `offset` afasta ao longo da normal (estampa localizada, aba). */
function sheetGeometry(fn: SheetFn, range: Range, nu: number, nv: number, options: { offset?: number; flip?: boolean; uv?: Range } = {}) {
  const [u0, u1, v0, v1] = range;
  const { offset = 0, flip = false, uv = [0, 1, 0, 1] } = options;
  const eps = Math.max(Math.abs(u1 - u0), Math.abs(v1 - v0)) * 1e-3;
  const count = (nu + 1) * (nv + 1);
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let j = 0; j <= nv; j += 1) {
    const fv = j / nv;
    const v = v0 + (v1 - v0) * fv;
    for (let i = 0; i <= nu; i += 1) {
      const fu = i / nu;
      const u = u0 + (u1 - u0) * fu;
      fn(u, v, p);
      if (offset) p.addScaledVector(sheetNormal(fn, u, v, eps, n), offset);
      const k = j * (nu + 1) + i;
      p.toArray(positions, k * 3);
      uvs[k * 2] = uv[0] + (uv[1] - uv[0]) * fu;
      uvs[k * 2 + 1] = uv[2] + (uv[3] - uv[2]) * fv;
    }
  }
  return gridGeometry(positions, uvs, nu, nv, flip);
}

/** Pontos na borda de um trecho do tecido (sentido anti-horário do parâmetro). */
function edgeLoop(fn: SheetFn, [u0, u1, v0, v1]: Range, step: number, offset = 0) {
  const nu = Math.max(2, Math.ceil(Math.abs(u1 - u0) / step));
  const nv = Math.max(2, Math.ceil(Math.abs(v1 - v0) / step));
  const eps = Math.max(Math.abs(u1 - u0), Math.abs(v1 - v0)) * 1e-3;
  const points: THREE.Vector3[] = [];
  const add = (u: number, v: number) => {
    const p = fn(u, v, new THREE.Vector3());
    if (offset) p.addScaledVector(sheetNormal(fn, u, v, eps, new THREE.Vector3()), offset);
    points.push(p);
  };
  for (let i = 0; i < nu; i += 1) add(u0 + ((u1 - u0) * i) / nu, v0);
  for (let j = 0; j < nv; j += 1) add(u1, v0 + ((v1 - v0) * j) / nv);
  for (let i = 0; i < nu; i += 1) add(u1 - ((u1 - u0) * i) / nu, v1);
  for (let j = 0; j < nv; j += 1) add(u0, v1 - ((v1 - v0) * j) / nv);
  return points;
}

/** Linha aberta entre dois pontos do parâmetro (bainha da aba, zíper). */
function edgeLine(fn: SheetFn, from: [number, number], to: [number, number], count: number, offset = 0) {
  const eps = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]), 1e-3) * 1e-3;
  return Array.from({ length: count + 1 }, (_, i) => {
    const k = i / count;
    const u = from[0] + (to[0] - from[0]) * k;
    const v = from[1] + (to[1] - from[1]) * k;
    const p = fn(u, v, new THREE.Vector3());
    return offset ? p.addScaledVector(sheetNormal(fn, u, v, eps, new THREE.Vector3()), offset) : p;
  });
}

function tubeAlong(points: THREE.Vector3[], radius: number, closed: boolean, radial = 6): Tube {
  const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal");
  const segments = clamp(Math.round(points.length * 2), 24, 720);
  return { geometry: new THREE.TubeGeometry(curve, segments, radius, radial, closed), length: curve.getLength() };
}

/** UV planar (x/w, y/h) num tubo de bainha deitado: a estampa continua por cima da bainha. */
function planarUv(geometry: THREE.BufferGeometry, w: number, h: number) {
  const position = geometry.getAttribute("position");
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    uv[i * 2] = position.getX(i) / w + 0.5;
    uv[i * 2 + 1] = position.getY(i) / h + 0.5;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/** Placa de cantos e arestas arredondados, centrada (deslizante de zíper, aba de pressão, clipe). */
function roundedSlab(w: number, h: number, d: number, r: number) {
  const bevel = Math.min(d * 0.45, r * 0.5, w * 0.2, h * 0.2);
  const depth = Math.max(d - 2 * bevel, 1e-3);
  const geometry = new THREE.ExtrudeGeometry(makeShape("rect", Math.max(w - 2 * bevel, 1e-3), Math.max(h - 2 * bevel, 1e-3), Math.max(r - bevel, 1e-3)), {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 8,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

// ---------------------------------------------------------------------------- materiais

/** Tecido estampado: fosco, brilho de fibra (sheen) e trama em relevo. */
function PrintCloth({ map, bump, sheen = 0.5, roughness = 0.88, offset = false }: { map: THREE.Texture; bump?: THREE.Texture; sheen?: number; roughness?: number; offset?: boolean }) {
  return (
    <meshPhysicalMaterial
      map={map}
      roughness={roughness}
      sheen={sheen}
      sheenRoughness={0.55}
      sheenColor="#ffffff"
      bumpMap={bump ?? null}
      bumpScale={0.25}
      polygonOffset={offset}
      polygonOffsetFactor={offset ? -2 : 0}
      polygonOffsetUnits={offset ? -2 : 0}
    />
  );
}

function PlainCloth({ color, bump, sheen = 0.6, side = THREE.FrontSide }: { color: string; bump?: THREE.Texture; sheen?: number; side?: THREE.Side }) {
  return <meshPhysicalMaterial color={color} roughness={0.92} sheen={sheen} sheenRoughness={0.6} sheenColor="#ffffff" bumpMap={bump ?? null} bumpScale={0.25} side={side} />;
}

/** Cetim: tecido liso de brilho alto e reflexo comprido. */
function SatinCloth({ map, color = "#ffffff", side = THREE.FrontSide }: { map?: THREE.Texture; color?: string; side?: THREE.Side }) {
  return <meshPhysicalMaterial map={map ?? null} color={color} roughness={0.36} sheen={0.85} sheenRoughness={0.3} sheenColor="#ffffff" clearcoat={0.2} clearcoatRoughness={0.4} side={side} />;
}

function Steel({ color = "#d6d9dd", roughness = 0.26 }: { color?: string; roughness?: number }) {
  return <meshStandardMaterial color={color} metalness={1} roughness={roughness} />;
}

function Stitches({ tube, color, pitch = 0.5 }: { tube: Tube; color: string; pitch?: number }) {
  const texture = useTile("stitch", Math.max(4, Math.round(tube.length / pitch)), 1);
  return (
    <mesh geometry={tube.geometry}>
      <meshStandardMaterial map={texture} color={color} alphaTest={0.5} roughness={0.7} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------- corpo de almofada

type PillowForm = {
  w: number;
  h: number;
  /** Volume de cada face (metade da espessura), em cm. */
  t: number;
  /** Quanto as laterais "puxam" para dentro no meio (fração): o canto fica em bico. */
  bow: number;
  /** Distância da borda (cm) até o volume ficar cheio. */
  ramp: number;
  /** Expoente do perfil: menor = borda mais íngreme e topo mais chato. */
  q: number;
  /** Amplitude das rugas (fração do volume). */
  crease: number;
  /** Volume do verso em relação à frente (peça deitada fica achatada embaixo). */
  backScale: number;
  seed: number;
};

type CushionBody = { front: THREE.BufferGeometry; back: THREE.BufferGeometry; outline: THREE.Vector3[]; aspect: number };

function rampProfile(x: number, q: number) {
  const c = clamp(x, 0, 1);
  return Math.pow(1 - (1 - c) * (1 - c), q);
}

/**
 * Almofada retangular paramétrica (u, v ∈ [-1, 1]): laterais côncavas, cantos em bico (o volume é o
 * produto dos perfis das duas direções), rugas radiais nos cantos e franzido ao longo da costura.
 */
function pillowPoint(o: PillowForm, u: number, v: number, side: 1 | -1, out: THREE.Vector3) {
  const x = u * (o.w / 2) * (1 - o.bow * (1 - v * v));
  const y = v * (o.h / 2) * (1 - o.bow * (1 - u * u));
  const a = ((1 - Math.abs(u)) * o.w) / 2 / o.ramp;
  const b = ((1 - Math.abs(v)) * o.h) / 2 / o.ramp;
  const fill = rampProfile(a, o.q) * rampProfile(b, o.q);
  const phase = o.seed + (side === 1 ? 0 : 2.3);
  const rho = Math.hypot(a, b);
  const corner = Math.sin(Math.atan2(b, a) * 7 + phase) * Math.exp(-rho * 3.2) * smoothstep(0.02, 0.2, rho);
  const edge = Math.min(a, b);
  const pucker = Math.sin((u * o.w + v * o.h) * 0.55 + phase) * Math.exp(-edge * 7) * smoothstep(0.01, 0.08, edge);
  const sag = 1 + 0.05 * Math.sin(u * 1.7 + v * 2.3 + phase) * Math.sin(v * 1.1 - u * 0.6 + phase * 0.5);
  const height = side === 1 ? o.t : o.t * o.backScale;
  const wrinkle = o.crease * height * (corner + 0.45 * pucker) * Math.min(1, fill * 5);
  return out.set(x, y, side * (height * fill * sag + wrinkle));
}

/** Uma face (frente ou verso) da almofada retangular em grade nu × nv. */
function cushionSide(o: PillowForm, nu: number, nv: number, dir: 1 | -1) {
  const count = (nu + 1) * (nv + 1);
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const p = new THREE.Vector3();
  for (let j = 0; j <= nv; j += 1) {
    const v = -1 + (2 * j) / nv;
    for (let i = 0; i <= nu; i += 1) {
      const u = -1 + (2 * i) / nu;
      const k = j * (nu + 1) + i;
      pillowPoint(o, u, v, dir, p).toArray(positions, k * 3);
      // O verso é lido por trás: u espelhado para a arte não sair invertida.
      uvs[k * 2] = dir === 1 ? (u + 1) / 2 : (1 - u) / 2;
      uvs[k * 2 + 1] = (v + 1) / 2;
    }
  }
  return gridGeometry(positions, uvs, nu, nv, dir === -1);
}

/**
 * Almofada decorativa lisa dos ambientes (sofá, cama): o mesmo corpo da almofada do produto, em
 * resolução baixa (~2 mil triângulos), frente e verso numa geometria só, em metros.
 */
export function throwPillowGeometry(wCm: number, hCm: number): THREE.BufferGeometry {
  const short = Math.min(wCm, hCm);
  const form: PillowForm = { w: wCm, h: hCm, t: short * 0.17, bow: 0.05, ramp: short * 0.5, q: 0.55, crease: 0.09, backScale: 1, seed: 2.2 };
  const front = cushionSide(form, 22, 22, 1);
  const back = cushionSide(form, 22, 22, -1);
  const merged = mergeGeometries([front, back]) ?? front.clone();
  front.dispose();
  back.dispose();
  merged.scale(0.01, 0.01, 0.01);
  return merged;
}

function rectCushion(o: PillowForm): CushionBody {
  const short = Math.min(o.w, o.h);
  const nu = clamp(Math.round((72 * o.w) / short), 48, 220);
  const nv = clamp(Math.round((72 * o.h) / short), 48, 220);
  const side = (dir: 1 | -1) => cushionSide(o, nu, nv, dir);
  const outline: THREE.Vector3[] = [];
  const push = (u: number, v: number) => outline.push(pillowPoint(o, u, v, 1, new THREE.Vector3()));
  for (let i = 0; i < nu; i += 1) push(-1 + (2 * i) / nu, -1);
  for (let j = 0; j < nv; j += 1) push(1, -1 + (2 * j) / nv);
  for (let i = 0; i < nu; i += 1) push(1 - (2 * i) / nu, 1);
  for (let j = 0; j < nv; j += 1) push(-1, 1 - (2 * j) / nv);
  return { front: side(1), back: side(-1), outline, aspect: o.w / o.h };
}

/** Face inflada (inflate.ts) de um contorno qualquer, com rugas radiais perto da costura. */
function inflatedSide(polygon: THREE.Vector2[], height: number, falloff: number, crease: number, seed: number, side: 1 | -1) {
  const geometry = inflatedSurface(polygon, { height, falloff, resolution: 84, side });
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const k = clamp(Math.abs(z) / Math.max(height, 1e-6), 0, 1);
    const ripple = Math.sin(Math.atan2(y, x) * 13 + seed) * 4 * k * (1 - k) * (1 - k) + 0.3 * Math.sin(x * 0.21 + y * 0.17 + seed) * k;
    position.setZ(i, z + side * crease * height * ripple);
    if (side === -1) uv.setX(i, 1 - uv.getX(i));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function shapedCushion(shape: THREE.Shape, o: PillowForm, falloff: number): CushionBody {
  const polygon = shapePolygon(shape, 220);
  const size = new THREE.Box2().setFromPoints(polygon).getSize(new THREE.Vector2());
  return {
    front: inflatedSide(polygon, o.t, falloff, o.crease, o.seed, 1),
    back: inflatedSide(polygon, o.t * o.backScale, falloff, o.crease, o.seed + 2.3, -1),
    outline: polygon.map((p) => new THREE.Vector3(p.x, p.y, 0)),
    aspect: size.x > 0 && size.y > 0 ? size.x / size.y : 1,
  };
}

/** Frente e verso fechados (se encontram em z = 0 na costura) e o contorno para o vivo. */
function useCushionBody(shape: MockupShape, form: PillowForm) {
  const body = useMemo<CushionBody>(() => {
    if (shape === "rect") return rectCushion(form);
    const short = Math.min(form.w, form.h);
    return shapedCushion(makeShape(shape, form.w, form.h, 0), form, short * (shape === "heart" ? 0.34 : 0.5));
  }, [shape, form]);
  useGeometryCleanup(body.front);
  useGeometryCleanup(body.back);
  return body;
}

function useSeam(outline: THREE.Vector3[], radius: number) {
  const tube = useMemo(() => tubeAlong(outline, radius, true, 10), [outline, radius]);
  useGeometryCleanup(tube.geometry);
  return tube;
}

/** Almofada em pé, levemente reclinada e girada em 3/4. */
const CUSHION_POSE: [number, number, number] = [-0.12, 0.3, 0];

/** No ambiente: encostada no encosto do sofá ou nos travesseiros da cama (o ambiente põe no lugar). */
const ROOM_POSES: Partial<Record<RoomSurface, [number, number, number]>> = {
  seat: [-0.3, 0.14, 0.04],
  bed: [-0.36, 0.08, -0.03],
};

function useCushionPose(): [number, number, number] {
  const { room } = useSceneMode();
  return (room && ROOM_POSES[room]) || CUSHION_POSE;
}

/**
 * Arte do verso (passo da arte "Frente | Verso"), com o contexto de render da frente e sem texto de
 * exemplo (como o verso da camisa). Verso vazio ou ausente: null, e vale o `spec.back` (liso, a mesma
 * arte ou cinza), como antes.
 */
function useBackArt(art: ModelProps["art"]): ModelProps["art"] | null {
  const back = art.back ?? null;
  const filled = hasArtContent(back);
  const { kind, surface, opaque } = art;
  return useMemo(
    () => (back && filled ? { ...back, back: null, ledColors: undefined, sample: false, kind, surface, opaque } : null),
    [back, filled, kind, surface, opaque],
  );
}

/** Duração da virada da almofada ("Ver verso"). */
const FLIP_SECONDS = 0.7;

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Pose do grupo da virada: ângulo (0 = frente, π = verso) e fase do pulinho (0..1). */
function flipPose(group: THREE.Group, angle: number, phase: number, hop: number, lift: number, roll: boolean) {
  // Em pé: gira no eixo vertical. Deitada (de corpo): rola no eixo comprido e gira no chão ao mesmo
  // tempo; no fim dá o mesmo que girar no eixo curto, mas sem a peça "ficar de pé" no meio.
  if (roll) group.rotation.set(angle, 0, angle, "ZXY");
  else group.rotation.set(0, angle, 0);
  const height = (lift * (1 - Math.cos(angle))) / 2 + hop * Math.sin(Math.PI * phase);
  if (roll) group.position.z = height;
  else group.position.y = height;
}

/**
 * Vira o corpo da almofada 180° quando o cliente pede o verso ("Ver verso"): uma virada curta com
 * um pulinho; sem animação com reduced motion. `lift` sobe a peça no fim da virada (almofada de
 * corpo: o verso é mais baixo). A arte do verso já vem espelhada no UV para ler certo depois de virar.
 */
function FlipGroup({ children, hop = 0, lift = 0, roll = false }: { children: ReactNode; hop?: number; lift?: number; roll?: boolean }) {
  const { back, motion } = useSceneMode();
  const ref = useRef<THREE.Group>(null);
  const invalidate = useThree((state) => state.invalidate);
  const anim = useRef({ angle: 0, from: 0, to: 0, t: 1, started: false, mounted: false });
  const target = back ? Math.PI : 0;

  useLayoutEffect(() => {
    const group = ref.current;
    if (!group) return;
    const state = anim.current;
    if (!state.mounted || !motion) {
      state.mounted = true;
      state.angle = target;
      state.t = 1;
      flipPose(group, target, 0, hop, lift, roll);
      invalidate();
      return;
    }
    if (Math.abs(state.angle - target) < 1e-4 && state.t >= 1) {
      flipPose(group, target, 0, hop, lift, roll);
      return;
    }
    state.from = state.angle;
    state.to = target;
    state.t = 0;
    state.started = false;
    invalidate();
  }, [target, motion, hop, lift, roll, invalidate]);

  useFrame((_, delta) => {
    const group = ref.current;
    const state = anim.current;
    if (!group || state.t >= 1) return;
    // O primeiro quadro depois de parado traz um delta enorme: só marca o início.
    if (!state.started) {
      state.started = true;
      invalidate();
      return;
    }
    state.t = Math.min(1, state.t + Math.min(delta, 0.05) / FLIP_SECONDS);
    const k = easeInOut(state.t);
    state.angle = state.from + (state.to - state.from) * k;
    flipPose(group, state.angle, k, hop, lift, roll);
    invalidate();
  });

  return <group ref={ref}>{children}</group>;
}

// ---------------------------------------------------------------------------- canetinhas (almofada para colorir)

const MARKER_BARREL: Pt[] = [
  [0, 0],
  [0.62, 0],
  [0.78, 0.12],
  [0.8, 0.4],
  [0.8, 9],
  [0.74, 9.3],
  [0.6, 9.4],
  [0, 9.4],
];
const MARKER_PLUG: Pt[] = [
  [0, -0.28],
  [0.55, -0.28],
  [0.67, -0.14],
  [0.69, 0.1],
  [0, 0.1],
];
/** Anel do rótulo colorido: perfil fechado (anel sólido). */
const MARKER_BAND: Pt[] = [
  [0.79, 3],
  [0.818, 3.03],
  [0.818, 6.42],
  [0.79, 6.45],
  [0.79, 3],
];
const MARKER_CAP: Pt[] = [
  [0, 8.6],
  [0.87, 8.6],
  [0.9, 8.76],
  [0.9, 12.2],
  [0.82, 12.75],
  [0.55, 13.05],
  [0, 13.12],
];
const MARKER_TIP: Pt[] = [
  [0, 9.35],
  [0.5, 9.35],
  [0.42, 10.1],
  [0.26, 10.8],
  [0.14, 11.25],
  [0.05, 11.42],
  [0, 11.44],
];
const MARKER_INKS = ["#e02018", "#1f86d0", "#2aa85a"];

/** Três canetinhas para tecido deitadas na frente da almofada (uma destampada, com a tampa ao lado). */
function MarkerSet({ floor, front }: { floor: number; front: number }) {
  const parts = useMemo(
    () => ({
      barrel: lathe(MARKER_BARREL, 28),
      plug: lathe(MARKER_PLUG, 24),
      band: lathe(MARKER_BAND, 28),
      cap: lathe(MARKER_CAP, 28),
      tip: lathe(MARKER_TIP, 20),
      clip: roundedSlab(0.42, 3.4, 0.3, 0.18),
    }),
    [],
  );
  const list = useMemo(() => Object.values(parts), [parts]);
  useGeometriesCleanup(list);
  const lift = floor + 0.9;
  const markers = [
    { id: "red", x: -9, z: front + 9, yaw: 0.42, ink: MARKER_INKS[0], capped: true },
    { id: "blue", x: 0.5, z: front + 12.5, yaw: -0.18, ink: MARKER_INKS[1], capped: true },
    { id: "green", x: 9, z: front + 8.5, yaw: 0.85, ink: MARKER_INKS[2], capped: false },
  ];
  return (
    <group>
      {markers.map((m) => (
        <group key={m.id} position={[m.x, lift, m.z]} rotation={[0, m.yaw, Math.PI / 2]}>
          <group position-y={-6.4}>
            <mesh geometry={parts.barrel}>
              <meshPhysicalMaterial color="#f6f6f4" roughness={0.32} clearcoat={0.6} clearcoatRoughness={0.2} />
            </mesh>
            <mesh geometry={parts.plug}>
              <meshStandardMaterial color={m.ink} roughness={0.4} />
            </mesh>
            <mesh geometry={parts.band}>
              <meshStandardMaterial color={m.ink} roughness={0.5} />
            </mesh>
            {m.capped ? (
              <>
                <mesh geometry={parts.cap}>
                  <meshPhysicalMaterial color={m.ink} roughness={0.3} clearcoat={0.6} />
                </mesh>
                <mesh geometry={parts.clip} position={[0, 10.9, 0.98]}>
                  <meshPhysicalMaterial color={m.ink} roughness={0.3} clearcoat={0.6} />
                </mesh>
              </>
            ) : (
              <mesh geometry={parts.tip}>
                <meshStandardMaterial color={m.ink} roughness={0.95} />
              </mesh>
            )}
          </group>
        </group>
      ))}
      <group position={[16.5, lift, front + 13]} rotation={[0, 1.25, Math.PI / 2]}>
        <group position-y={-10.85}>
          <mesh geometry={parts.cap}>
            <meshPhysicalMaterial color={MARKER_INKS[2]} roughness={0.3} clearcoat={0.6} />
          </mesh>
          <mesh geometry={parts.clip} position={[0, 10.9, 0.98]}>
            <meshPhysicalMaterial color={MARKER_INKS[2]} roughness={0.3} clearcoat={0.6} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- almofadas

/**
 * Almofada cheia (quadrada, retangular, redonda, coração) com costura simples, sem vivo: a estampa chega até a costura,
 * como nas fotos dos produtos (revisão da Padrão de 25/10/2026). `coloring` vira desenho de contorno.
 */
function PlushCushion({ spec, art, label, coloring }: ModelProps & { coloring: boolean }) {
  const W = cm(spec.widthCm, 40);
  const H = cm(spec.heightCm, 40);
  const short = Math.min(W, H);
  const s = 2.3 / Math.max(W, H);
  const form = useMemo<PillowForm>(() => ({ w: W, h: H, t: short * 0.16, bow: 0.045, ramp: short * 0.5, q: 0.55, crease: 0.085, backScale: 1, seed: 0.7 }), [W, H, short]);
  const body = useCushionBody(spec.shape, form);
  const piping = useSeam(body.outline, 0.16);
  // Verso: a arte própria do verso, se houver (na proporção do editor 2D, para os elementos movidos
  // caírem no mesmo lugar); senão o que a spec diz (liso, mesma arte ou cinza).
  const backArt = useBackArt(art);
  const backKind: ArtVariant = backArt ? "front" : backVariant(spec);
  const front = useArtTexture(body.aspect, "front", art, label, coloring ? lineArtMask : undefined);
  const back = useArtTexture(backArt ? artAspect(spec) : body.aspect, backKind, backArt ?? art, label, coloring && backKind !== "blank" ? lineArtMask : undefined);
  const weave = useTile("weave", W / 3, H / 3);
  const fabric = clothColor(spec.baseColor);
  // A costura fica na cor de fundo da estampa (sublimação até a borda), não num tom do tecido branco.
  const seamColor = !coloring && /^#[0-9a-f]{3,8}$/i.test(art.background) ? art.background : fabric;
  const pose = useCushionPose();
  const { room } = useSceneMode();
  // No sofá e na cama a almofada afunda no estofado (o ambiente desce 3 e 1,5 cm): as canetinhas, não.
  const sink = room === "seat" ? 3 : room === "bed" ? 1.5 : 0;
  const floor = useMemo(() => lowestY([body.front, body.back, piping.geometry], pose) + sink, [body, piping, pose, sink]);
  return (
    <group scale={s} userData={{ unitsPerCm: s, roomPose: true }}>
      <group rotation={pose}>
        <FlipGroup hop={short * 0.06}>
          <mesh geometry={body.front}>
            <PrintCloth map={front} bump={weave} />
          </mesh>
          <mesh geometry={body.back}>{backKind === "blank" ? <PlainCloth color={fabric} bump={weave} /> : <PrintCloth map={back} bump={weave} />}</mesh>
          <mesh geometry={piping.geometry}>
            <PlainCloth color={tone(seamColor, "#000000", 0.1)} sheen={0.8} />
          </mesh>
        </FlipGroup>
      </group>
      {coloring && <MarkerSet floor={floor} front={form.t} />}
    </group>
  );
}

/**
 * Capa avulsa / fronha: menos cheia, costura simples sem vivo. Até 50 cm leva zíper invisível na
 * costura de baixo (com puxador); 70 × 50 é fronha de travesseiro com aba envelope no verso.
 */
function CoverCushion({ spec, art, label }: ModelProps) {
  const W = cm(spec.widthCm, 40);
  const H = cm(spec.heightCm, 40);
  const short = Math.min(W, H);
  const envelope = Math.max(W, H) >= 60;
  const s = 2.3 / Math.max(W, H);
  const form = useMemo<PillowForm>(
    () => ({ w: W, h: H, t: short * (envelope ? 0.14 : 0.115), bow: envelope ? 0.025 : 0.035, ramp: short * 0.5, q: envelope ? 0.6 : 0.48, crease: 0.12, backScale: 1, seed: 1.9 }),
    [W, H, short, envelope],
  );
  const body = useCushionBody("rect", form);
  const seam = useSeam(body.outline, 0.3);
  const backArt = useBackArt(art);
  const backKind: ArtVariant = backArt ? "front" : backVariant(spec);
  const front = useArtTexture(body.aspect, "front", art, label);
  const back = useArtTexture(backArt ? artAspect(spec) : body.aspect, backKind, backArt ?? art, label);
  const weave = useTile("weave", W / 3, H / 3);
  const fabric = clothColor(spec.baseColor);
  const pose = useCushionPose();

  const extras = useMemo(() => {
    const fn: SheetFn = (u, v, out) => pillowPoint(form, u, v, -1, out);
    if (envelope) {
      // Aba envelope de 17 cm sobre o verso, com bainha e pesponto na borda livre. O UV da aba é o
      // mesmo do verso: com arte no verso, a estampa continua por cima da aba, como na peça costurada.
      const uF = 1 - 34 / W;
      return {
        kind: "envelope" as const,
        flap: sheetGeometry(fn, [uF, 1, -0.985, 0.985], 24, 64, { offset: -0.35, flip: true, uv: [(1 - uF) / 2, 0, 0.0075, 0.9925] }),
        hem: tubeAlong(edgeLine(fn, [uF, -0.97], [uF, 0.97], 64, -0.45), 0.32, false, 8),
        stitch: tubeAlong(edgeLine(fn, [uF + 0.05, -0.95], [uF + 0.05, 0.95], 64, -0.48), 0.06, false, 4),
      };
    }
    // Zíper invisível na costura de baixo; o cursor fica perto do canto e o puxador deita sobre o verso,
    // apontando para cima (para baixo ele passaria da costura e viraria o ponto de apoio da almofada).
    const u0 = 0.78;
    const v0 = -0.94;
    const anchor = fn(u0, v0, new THREE.Vector3());
    const normal = sheetNormal(fn, u0, v0, 2e-3, new THREE.Vector3()).negate();
    anchor.addScaledVector(normal, 0.3);
    // Orientação com y exatamente em `dir` e z o mais perto possível de `out` (normal do tecido).
    const basis = (dir: THREE.Vector3, out: THREE.Vector3) => {
      const y = dir.clone().normalize();
      const z = out.clone().addScaledVector(y, -out.dot(y)).normalize();
      return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(y, z), y, z));
    };
    const up = fn(u0, v0 + 2e-3, new THREE.Vector3()).sub(fn(u0, v0 - 2e-3, new THREE.Vector3()));
    // O puxador segue a curva do verso: aponta para um ponto 2,6 cm acima, rente ao tecido.
    const vTip = v0 + 2.6 / (H / 2);
    const tip = fn(u0, vTip, new THREE.Vector3()).addScaledVector(sheetNormal(fn, u0, vTip, 2e-3, new THREE.Vector3()).negate(), 0.22);
    const along = tip.clone().sub(anchor).normalize();
    return {
      kind: "zipper" as const,
      line: tubeAlong(edgeLine(fn, [-0.86, -0.982], [0.86, -0.982], 80, -0.2), 0.17, false, 6),
      slider: roundedSlab(1.5, 0.9, 0.45, 0.2),
      tab: roundedSlab(1, 2.4, 0.16, 0.4),
      anchor,
      quaternion: basis(up, normal),
      tabPosition: anchor.clone().addScaledVector(along, 1.45),
      tabQuaternion: basis(along, normal),
    };
  }, [form, envelope, W, H]);
  const extraList = useMemo(
    () => (extras.kind === "envelope" ? [extras.flap, extras.hem.geometry, extras.stitch.geometry] : [extras.line.geometry, extras.slider, extras.tab]),
    [extras],
  );
  useGeometriesCleanup(extraList);

  return (
    <group scale={s} userData={{ unitsPerCm: s, roomPose: true }}>
      <group rotation={pose}>
        <FlipGroup hop={short * 0.06}>
          <mesh geometry={body.front}>
            <PrintCloth map={front} bump={weave} />
          </mesh>
          <mesh geometry={body.back}>{backKind === "blank" ? <PlainCloth color={fabric} bump={weave} /> : <PrintCloth map={back} bump={weave} />}</mesh>
          <mesh geometry={seam.geometry}>
            <PlainCloth color={tone(fabric, "#000000", 0.05)} />
          </mesh>
          {extras.kind === "envelope" ? (
            <>
              <mesh geometry={extras.flap}>{backKind === "blank" ? <PlainCloth color={fabric} bump={weave} /> : <PrintCloth map={back} bump={weave} />}</mesh>
              <mesh geometry={extras.hem.geometry}>
                <PlainCloth color={tone(fabric, "#000000", 0.04)} />
              </mesh>
              <Stitches tube={extras.stitch} color={tone(fabric, "#000000", 0.28)} />
            </>
          ) : (
            <>
              <mesh geometry={extras.line.geometry}>
                <meshStandardMaterial color="#2b2c30" roughness={0.6} />
              </mesh>
              <mesh geometry={extras.slider} position={extras.anchor} quaternion={extras.quaternion}>
                <Steel color="#c9ccd1" roughness={0.32} />
              </mesh>
              <mesh geometry={extras.tab} position={extras.tabPosition} quaternion={extras.tabQuaternion}>
                <Steel color="#c9ccd1" roughness={0.32} />
              </mesh>
            </>
          )}
        </FlipGroup>
      </group>
    </group>
  );
}

/** Almofada de corpo (150 × 30): rolo comprido deitado, mais cheio, achatado embaixo pelo próprio peso. */
function BodyPillow({ spec, art, label }: ModelProps) {
  const W = cm(spec.widthCm, 150);
  const H = cm(spec.heightCm, 30);
  const short = Math.min(W, H);
  const s = 2.8 / Math.max(W, H);
  const form = useMemo<PillowForm>(() => ({ w: W, h: H, t: short * 0.27, bow: 0.018, ramp: short * 0.55, q: 0.55, crease: 0.07, backScale: 0.6, seed: 3.1 }), [W, H, short]);
  const body = useCushionBody("rect", form);
  const seam = useSeam(body.outline, 0.4);
  const backArt = useBackArt(art);
  const backKind: ArtVariant = backArt ? "front" : backVariant(spec);
  const front = useArtTexture(body.aspect, "front", art, label);
  const back = useArtTexture(backArt ? artAspect(spec) : body.aspect, backKind, backArt ?? art, label);
  const weave = useTile("weave", W / 3, H / 3);
  const fabric = clothColor(spec.baseColor);
  // Deitada: para mostrar o verso ela rola de lado; o verso é mais baixo, então sobe a diferença.
  return (
    <group scale={s} userData={{ view: { elevation: 0.7, azimuth: 0.2 } satisfies View, unitsPerCm: s, roomPose: true }}>
      <group rotation={[FLAT, 0, 0.06]}>
        <FlipGroup roll lift={form.t * (1 - form.backScale)} hop={short * 0.38}>
          <mesh geometry={body.front}>
            <PrintCloth map={front} bump={weave} />
          </mesh>
          <mesh geometry={body.back}>{backKind === "blank" ? <PlainCloth color={fabric} bump={weave} /> : <PrintCloth map={back} bump={weave} />}</mesh>
          <mesh geometry={seam.geometry}>
            <PlainCloth color={tone(fabric, "#000000", 0.05)} />
          </mesh>
        </FlipGroup>
      </group>
    </group>
  );
}

/**
 * Almofadas. Corpo paramétrico (retangular: laterais côncavas, cantos em bico e rugas radiais) ou
 * inflado do contorno (redonda, coração), arte pelo UV sem distorção, costura simples e trama em relevo.
 * {cover} capa/fronha menos cheia com zíper invisível e puxador (até 50 cm) ou aba envelope (70 × 50);
 * {body} almofada de corpo deitada; {coloring} estampa em traço preto para colorir, com canetinhas.
 */
export function CushionModel(props: ModelProps) {
  const { spec } = props;
  if (spec.variant === "cover") return <CoverCushion {...props} />;
  if (spec.variant === "body") return <BodyPillow {...props} />;
  return <PlushCushion {...props} coloring={spec.variant === "coloring"} />;
}

// ---------------------------------------------------------------------------- cama pet

/** Espessura da base acolchoada da cama (cm). */
const BED_BASE = 1.8;

/**
 * Rolo (bolster) da borda: tubo de seção elíptica ao longo do contorno, mais baixo na frente (entrada),
 * com gomos de matelassê a cada ~15 cm. Grade fechada nas duas direções (sem costura de normal).
 */
function bolsterGeometry(kind: MockupShape, W: number, H: number, corner: number, rw: number, z0: number, top: number) {
  const ring = makeShape(kind, W - 2 * rw, H - 2 * rw, Math.max(corner - rw, 1.5)).getSpacedPoints(240);
  if (ring.length > 3 && ring[0].distanceTo(ring[ring.length - 1]) < 1e-6) ring.pop();
  const N = ring.length;
  const M = 28;
  const arc = new Float64Array(N + 1);
  for (let i = 1; i <= N; i += 1) arc[i] = arc[i - 1] + ring[i % N].distanceTo(ring[i - 1]);
  const total = arc[N] || 1;
  const lobes = Math.max(6, Math.round(total / 15));
  const positions = new Float32Array((N + 1) * (M + 1) * 3);
  const uvs = new Float32Array((N + 1) * (M + 1) * 2);
  for (let i = 0; i <= N; i += 1) {
    const k = i % N;
    const prev = ring[(k - 1 + N) % N];
    const next = ring[(k + 1) % N];
    const tl = Math.hypot(next.x - prev.x, next.y - prev.y) || 1;
    // Contorno anti-horário: a normal externa é a tangente girada -90°.
    const nx = (next.y - prev.y) / tl;
    const ny = -(next.x - prev.x) / tl;
    const dip = 1 - 0.3 * smoothstep(0.35, 1, -ny);
    const rh = ((top - z0) / 2) * dip;
    const zc = z0 + rh;
    const phase = (arc[i] / total) * lobes;
    const pinch = 1 - 0.09 * Math.exp(-(((phase - Math.round(phase)) / 0.07) ** 2));
    for (let j = 0; j <= M; j += 1) {
      const alpha = (j / M) * Math.PI * 2;
      const sn = Math.sin(alpha);
      const out = rw * Math.cos(alpha) * pinch;
      const up = rh * sn * pinch * (sn < 0 ? 0.9 : 1);
      const idx = i * (M + 1) + j;
      positions[idx * 3] = ring[k].x + nx * out;
      positions[idx * 3 + 1] = ring[k].y + ny * out;
      positions[idx * 3 + 2] = zc + up;
      // UV em ladrilhos de 4 cm (para a trama).
      uvs[idx * 2] = ((j / M) * Math.PI * 2 * rw) / 4;
      uvs[idx * 2 + 1] = arc[i] / 4;
    }
  }
  return gridGeometry(positions, uvs, M, N, true, true, true);
}

/** Ossinho de pelúcia: haste e quatro bolinhas, deitado no chão. */
function Bone({ position, yaw }: { position: [number, number, number]; yaw: number }) {
  const parts = useMemo(() => {
    const shaft = new THREE.CylinderGeometry(1, 1, 9.2, 20);
    shaft.rotateZ(Math.PI / 2);
    return { shaft, knob: new THREE.SphereGeometry(1.55, 24, 16) };
  }, []);
  useGeometryCleanup(parts.shaft);
  useGeometryCleanup(parts.knob);
  const knobs: [number, number][] = [
    [-4.6, -1],
    [-4.6, 1],
    [4.6, -1],
    [4.6, 1],
  ];
  return (
    <group position={position} rotation-y={yaw}>
      <mesh geometry={parts.shaft} position-y={1.5}>
        <meshPhysicalMaterial color="#e7d7b9" roughness={0.88} sheen={0.8} sheenRoughness={0.5} sheenColor="#ffffff" />
      </mesh>
      {knobs.map(([x, z]) => (
        <mesh key={`${x}:${z}`} geometry={parts.knob} position={[x, 1.55, z]}>
          <meshPhysicalMaterial color="#e7d7b9" roughness={0.88} sheen={0.8} sheenRoughness={0.5} sheenColor="#ffffff" />
        </mesh>
      ))}
    </group>
  );
}

/** Volume da almofada interna da cama pet (cm): frente cheia, verso baixo (fica dentro da base). */
const PET_PUFF = 4.4;
const PET_BACK_PUFF = 0.9;

/**
 * Cama pet redonda ou retangular, vista de cima: base acolchoada com costura, almofada interna inflada
 * com a arte (UV na proporção da almofada), rolo de borda em matelassê mais baixo na frente e um
 * ossinho de pelúcia no chão. O tecido liso usa a cor da peça (grafite quando branca). A almofada
 * interna é dupla face: com arte no verso, "Ver verso" a desvira dentro da cama.
 */
export function PetBedModel({ spec, art, label }: ModelProps) {
  const round = spec.shape === "round";
  const kind: MockupShape = round ? "round" : "rect";
  const W = cm(spec.widthCm, 64);
  const H = round ? W : cm(spec.heightCm, 55);
  const D = clamp(cm(spec.depthCm, 15), 10, 24);
  const short = Math.min(W, H);
  const s = 2.5 / Math.max(W, H);
  const rw = clamp(short * 0.095, 4, 9.5);
  const corner = round ? 0 : Math.min(short * 0.24, 15);
  const inset = rw * 1.6;
  const cw = Math.max(W - 2 * inset, 10);
  const ch = Math.max(H - 2 * inset, 10);
  const texture = useArtTexture(cw / ch, "front", art, label);
  // Verso da almofada interna: a arte do verso (proporção do editor 2D) ou tecido liso.
  const backArt = useBackArt(art);
  const backTexture = useArtTexture(artAspect(spec), backArt ? "front" : "blank", backArt ?? art, label);
  const bolsterWeave = useTile("weave", 1, 1);
  const baseWeave = useTile("weave", W / 4, H / 4);
  const cushionWeave = useTile("weave", cw / 3, ch / 3);
  const parts = useMemo(() => {
    const basePolygon = shapePolygon(makeShape(kind, W, H, corner), 200);
    const cushionPolygon = shapePolygon(makeShape(kind, cw, ch, Math.max(corner - inset, 3)), 200);
    return {
      baseTop: inflatedSide(basePolygon, BED_BASE / 2, 1.6, 0.04, 0.4, 1),
      baseBottom: inflatedSide(basePolygon, BED_BASE / 2, 1.6, 0.02, 1.1, -1),
      seam: tubeAlong(
        basePolygon.map((p) => new THREE.Vector3(p.x, p.y, 0)),
        0.42,
        true,
        8,
      ),
      cushion: inflatedSide(cushionPolygon, PET_PUFF, Math.min(cw, ch) * 0.3, 0.12, 1.7, 1),
      cushionBack: inflatedSide(cushionPolygon, PET_BACK_PUFF, Math.min(cw, ch) * 0.3, 0.06, 2.9, -1),
      bolster: bolsterGeometry(kind, W, H, corner, rw, BED_BASE * 0.8, D),
    };
  }, [kind, W, H, corner, cw, ch, inset, rw, D]);
  const list = useMemo(() => [parts.baseTop, parts.baseBottom, parts.seam.geometry, parts.cushion, parts.cushionBack, parts.bolster], [parts]);
  useGeometriesCleanup(list);
  const fabric = spec.accentColor ?? (isWhite(spec.baseColor) ? "#3d3e44" : spec.baseColor);
  // Câmera alta o bastante para o rolo da frente (mais baixo) não esconder a base da arte.
  return (
    <group scale={s} userData={{ view: { elevation: 0.72, azimuth: 0.25 } satisfies View, unitsPerCm: s, roomPose: true }}>
      <group rotation-x={FLAT}>
        <group position-z={BED_BASE / 2}>
          <mesh geometry={parts.baseTop}>
            <PlainCloth color={fabric} bump={baseWeave} />
          </mesh>
          <mesh geometry={parts.baseBottom}>
            <PlainCloth color={tone(fabric, "#000000", 0.18)} />
          </mesh>
          <mesh geometry={parts.seam.geometry}>
            <PlainCloth color={tone(fabric, "#000000", 0.12)} sheen={0.8} />
          </mesh>
        </group>
        <group position-z={BED_BASE * 0.85}>
          {/* Desvira pulando por cima do rolo; virada, a frente cheia fica embaixo e a almofada sobe. */}
          <FlipGroup roll lift={PET_PUFF - PET_BACK_PUFF} hop={Math.min(cw, ch) * 0.55}>
            <mesh geometry={parts.cushion}>
              <PrintCloth map={texture} bump={cushionWeave} />
            </mesh>
            <mesh geometry={parts.cushionBack}>{backArt ? <PrintCloth map={backTexture} bump={cushionWeave} /> : <PlainCloth color={fabric} bump={cushionWeave} />}</mesh>
          </FlipGroup>
        </group>
        <mesh geometry={parts.bolster}>
          <PlainCloth color={fabric} bump={bolsterWeave} sheen={0.8} />
        </mesh>
      </group>
      <Bone position={onTable(W * 0.44, -H * 0.62)} yaw={0.55} />
    </group>
  );
}

// ---------------------------------------------------------------------------- tecido pendurado

/**
 * Tecido dobrado sobre uma barra (eixo x, raio R): v = 0 é a barra de baixo da frente, sobe até a
 * barra, contorna por cima e desce atrás até F + πR + B. Ondas verticais crescem para baixo.
 */
function hangOverBar(F: number, R: number, B: number, folds: number, swing: number): SheetFn {
  const wrapEnd = F + Math.PI * R;
  return (u, v, out) => {
    let y: number;
    let z: number;
    let fromBar: number;
    if (v <= F) {
      fromBar = F - v;
      const k = fromBar / F;
      y = -fromBar;
      z = R + folds * Math.pow(k, 1.3) * (0.6 * Math.sin(u * 0.45 + 0.7) + 0.4 * Math.sin(u * 0.86 + 2.1)) + swing * k * k;
    } else if (v <= wrapEnd) {
      fromBar = 0;
      const phi = (v - F) / R;
      y = R * Math.sin(phi);
      z = R * Math.cos(phi);
    } else {
      fromBar = v - wrapEnd;
      const k = fromBar / Math.max(B, 1e-3);
      y = -fromBar;
      z = -R - folds * 0.5 * Math.pow(k, 1.3) * Math.sin(u * 0.5 + 1.3) - swing * 0.4 * k * k;
    }
    // O tecido franze um pouco onde aperta na barra.
    const gather = 0.03 * Math.exp(-((fromBar / 6) ** 2));
    return out.set(u * (1 - gather), y, z);
  };
}

/** Puxador de forno em inox: barra, colunas e rosetas de fixação. */
function OvenBar({ length }: { length: number }) {
  const post = length / 2 - 3;
  return (
    <group>
      <mesh rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[1.3, 1.3, length, 40]} />
        <Steel />
      </mesh>
      {[-1, 1].map((sign) => (
        <group key={sign} position-x={sign * post}>
          <mesh position-z={-3.2} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.85, 0.85, 6.4, 24]} />
            <Steel />
          </mesh>
          <mesh position-z={-6.6} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[2.1, 1.9, 0.6, 32]} />
            <Steel roughness={0.38} />
          </mesh>
        </group>
      ))}
      {[-1, 1].map((sign) => (
        <mesh key={`cap${sign}`} position-x={(sign * length) / 2} scale={[0.45, 1, 1]}>
          <sphereGeometry args={[1.3, 24, 16]} />
          <Steel />
        </mesh>
      ))}
    </group>
  );
}

/** Área da estampa localizada do pano de prato: margens de 2,2 cm nas laterais, 4 embaixo e 3 em cima. */
function dishPrint(W: number, F: number): Range {
  return [-W / 2 + 2.2, W / 2 - 2.2, 4, Math.max(F - 3, 9)];
}

/** Pano de prato dobrado sobre o puxador do forno, bainha e pesponto em volta, estampa localizada na frente. */
function DishTowel({ spec, art, label }: ModelProps) {
  const W = cm(spec.widthCm, 35);
  const L = cm(spec.heightCm, 78);
  const R = 1.3 + 0.32;
  const F = L * 0.72;
  const B = Math.max(3, L - F - Math.PI * R);
  const total = F + Math.PI * R + B;
  const [p0, p1, p2, p3] = dishPrint(W, F);
  const texture = useArtTexture((p1 - p0) / (p3 - p2), "front", art, label);
  const weave = useTile("weave", W / 2.5, total / 2.5);
  // A estampa tem UV próprio (0–1 na área impressa): trama no mesmo passo de 2,5 cm do pano.
  const patchWeave = useTile("weave", (p1 - p0) / 2.5, (p3 - p2) / 2.5);
  const parts = useMemo(() => {
    const fn = hangOverBar(F, R, B, 0.9, 0.7);
    const full: Range = [-W / 2, W / 2, 0, total];
    const inset = (d: number): Range => [full[0] + d, full[1] - d, full[2] + d, full[3] - d];
    return {
      sheet: sheetGeometry(fn, full, 36, 150),
      patch: sheetGeometry(fn, dishPrint(W, F), 40, 96, { offset: 0.035 }),
      hem: tubeAlong(edgeLoop(fn, inset(0.22), 0.8), 0.22, true, 6),
      stitch: tubeAlong(edgeLoop(fn, inset(1), 0.6, 0.06), 0.055, true, 4),
    };
  }, [W, F, R, B, total]);
  const list = useMemo(() => [parts.sheet, parts.patch, parts.hem.geometry, parts.stitch.geometry], [parts]);
  useGeometriesCleanup(list);
  const fabric = clothColor(spec.baseColor);
  const s = 2.4 / Math.max(F + 6, W + 18);
  return (
    <group scale={s} rotation-y={0.22}>
      <OvenBar length={W + 16} />
      <mesh geometry={parts.sheet}>
        <PlainCloth color={fabric} bump={weave} />
      </mesh>
      <mesh geometry={parts.sheet}>
        <PlainCloth color={tone(fabric, "#000000", 0.07)} bump={weave} side={THREE.BackSide} />
      </mesh>
      <mesh geometry={parts.patch}>
        <PrintCloth map={texture} bump={patchWeave} offset />
      </mesh>
      <mesh geometry={parts.hem.geometry}>
        <PlainCloth color={tone(fabric, "#000000", 0.04)} />
      </mesh>
      <Stitches tube={parts.stitch} color={tone(fabric, "#000000", 0.25)} />
    </group>
  );
}

/**
 * Tecido solto estendido (sublimação e UV em tecido): o painel sem bastão nem cordão, como a peça é entregue (revisão
 * da Padrão de 25/10/2026). Ondas largas de quem acabou de abrir o tecido, um vinco suave e o canto de baixo à direita
 * erguido, mostrando o avesso.
 */
function looseSurface(W: number, H: number): SheetFn {
  const L = Math.max(W, H);
  const a = clamp(L / 32, 1, 6);
  return (u, v, out) => {
    // Ondas largas e cruzadas: o tecido não assenta reto.
    const wave = a * (0.42 * Math.sin((u / L) * 6.5 + 0.6) * Math.sin((v / L) * 4.8 + 1.1) + 0.2 * Math.sin(((u + 0.6 * v) / L) * 11 + 0.4));
    const crease = a * 0.75 * Math.exp(-(((u - W * 0.14 + 0.25 * v) / (L * 0.04)) ** 2)) * (0.6 + 0.4 * Math.sin((v / L) * 5));
    // Canto de baixo à direita virado. Sem erguer as bordas: o ponto mais baixo tem de ficar na borda, porque o 3D
    // assenta a peça no chão por ele e, num vale no meio, a sombra do chão atravessaria o tecido.
    const corner = smoothstep(0.6, 1, u / W - v / H);
    return out.set(u, v, 0.12 + a * 0.45 + wave + crease + L * 0.07 * corner * corner);
  };
}

/** Tecido solto; com bainha e ilhós (opção de acabamento), a bainha com pesponto e os ilhoses na borda de cima e nos cantos de baixo. */
function LooseFabric({ spec, art, label }: ModelProps) {
  const W = cm(spec.widthCm, 50);
  const H = cm(spec.heightCm, 70);
  const finished = spec.grommets;
  const texture = useArtTexture(W / H, "front", art, label);
  const weave = useTile("weave", W / 2.5, H / 2.5);
  const parts = useMemo(() => {
    const fn = looseSurface(W, H);
    const range: Range = [-W / 2, W / 2, -H / 2, H / 2];
    const sheet = sheetGeometry(fn, range, 90, Math.round(clamp((90 * H) / W, 40, 140)));
    const edge = tubeAlong(edgeLoop(fn, [-W / 2 + 0.1, W / 2 - 0.1, -H / 2 + 0.1, H / 2 - 0.1], 0.8), finished ? 0.24 : 0.06, true, finished ? 6 : 4);
    planarUv(edge.geometry, W, H);
    const stitch = finished ? tubeAlong(edgeLoop(fn, [-W / 2 + 2.6, W / 2 - 2.6, -H / 2 + 2.6, H / 2 - 2.6], 0.6, 0.05), 0.055, true, 4) : null;
    // Ilhoses a cada ~17 cm na borda de cima e nos dois cantos de baixo (como a peça vem para pendurar).
    const count = Math.max(3, Math.round(W / 17) + 1);
    const x0 = -W / 2 + 2.4;
    const spacing = Math.max((W - 4.8) / (count - 1), 1);
    const holes: [number, number][] = finished ? [...Array.from({ length: count }, (_, i): [number, number] => [x0 + i * spacing, H / 2 - 1.7]), [x0, -H / 2 + 1.7], [x0 + (count - 1) * spacing, -H / 2 + 1.7]] : [];
    const z = new THREE.Vector3(0, 0, 1);
    const grommets = holes.map(([u, v]) => {
      const position = fn(u, v, new THREE.Vector3());
      const normal = sheetNormal(fn, u, v, 1e-2, new THREE.Vector3());
      return { id: `${u.toFixed(1)}:${v.toFixed(1)}`, position, quaternion: new THREE.Quaternion().setFromUnitVectors(z, normal) };
    });
    return { sheet, edge, stitch, grommets, grommet: new THREE.TorusGeometry(0.72, 0.26, 10, 28) };
  }, [W, H, finished]);
  const list = useMemo(() => [parts.sheet, parts.edge.geometry, parts.grommet, ...(parts.stitch ? [parts.stitch.geometry] : [])], [parts]);
  useGeometriesCleanup(list);
  const fabric = clothColor(spec.baseColor);
  const s = 2.6 / Math.max(W, H);
  return (
    <group scale={s} rotation-y={0.12} userData={{ view: { elevation: 0.8, azimuth: 0.16 } satisfies View }}>
      <group rotation-x={FLAT}>
        <mesh geometry={parts.sheet}>
          <PrintCloth map={texture} bump={weave} />
        </mesh>
        <mesh geometry={parts.sheet}>
          <PlainCloth color={tone(fabric, "#000000", 0.05)} bump={weave} side={THREE.BackSide} />
        </mesh>
        <mesh geometry={parts.edge.geometry}>
          {finished ? <PlainCloth color={tone(fabric, "#000000", 0.03)} /> : <PrintCloth map={texture} />}
        </mesh>
        {parts.stitch && <Stitches tube={parts.stitch} color={tone(fabric, "#000000", 0.3)} />}
        {parts.grommets.map((g) => (
          <mesh key={g.id} geometry={parts.grommet} position={g.position} quaternion={g.quaternion}>
            <Steel color="#c9ccd1" roughness={0.3} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- capa de corte

/**
 * Capa de corte vestida num busto: cada altura t (cm a partir da gola) é uma elipse que abre da gola
 * até os ombros e cai quase vertical até a barra. O tecido é medido pelo comprimento do arco, então a
 * largura física da arte se mantém (só franze na gola). Abertura atrás, nas costas.
 */
function capeSurface(W: number, L: number) {
  const shoulder = 16;
  const cover = 0.94;
  const K = 192;
  type Row = { cum: Float64Array; a: number; b: number; zc: number; total: number };
  const cache = new Map<number, Row>();
  const row = (t: number): Row => {
    const key = Math.round(t * 1000);
    const hit = cache.get(key);
    if (hit) return hit;
    const e = 1 - Math.pow(1 - clamp(t / shoulder, 0, 1), 2);
    let a = 7.6 + (23 - 7.6) * e + 2 * smoothstep(shoulder, L, t);
    let b = 7.6 + (14 - 7.6) * e + 2.4 * smoothstep(shoulder, 48, t) + 0.8 * smoothstep(48, L, t);
    const zc = 1.4 * smoothstep(shoulder, 55, t);
    const cum = new Float64Array(K + 1);
    let px = a * Math.sin(-Math.PI);
    let pz = b * Math.cos(-Math.PI);
    for (let k = 1; k <= K; k += 1) {
      const phi = -Math.PI + (2 * Math.PI * k) / K;
      const x = a * Math.sin(phi);
      const z = b * Math.cos(phi);
      cum[k] = cum[k - 1] + Math.hypot(x - px, z - pz);
      px = x;
      pz = z;
    }
    // Dos ombros para baixo o perímetro coberto iguala a largura do tecido (a arte não estica nem
    // encolhe, em qualquer medida); só a gola franze. Elipse escalada = arcos escalados.
    const fit = W / (cover * (cum[K] || 1));
    const scale = 1 + (fit - 1) * smoothstep(shoulder * 0.5, shoulder, t);
    a *= scale;
    b *= scale;
    for (let k = 0; k <= K; k += 1) cum[k] *= scale;
    const entry = { cum, a, b, zc, total: cum[K] };
    cache.set(key, entry);
    return entry;
  };
  // Queda vertical: cada cm de tecido se divide entre abrir sobre os ombros e descer (peso maior na
  // frente, onde a arte é vista). Abaixo dos ombros desce 1:1, então a arte não achata na vertical.
  const dt = 0.25;
  const steps = Math.max(2, Math.ceil(L / dt) + 1);
  const drop = new Float64Array(steps + 1);
  const reach = (t: number) => {
    const r = row(t);
    return 0.6 * (r.b + r.zc) + 0.4 * r.a;
  };
  let prev = reach(0);
  for (let i = 1; i <= steps; i += 1) {
    const next = reach(i * dt);
    drop[i] = drop[i - 1] + Math.sqrt(Math.max(dt * dt - (next - prev) ** 2, (0.25 * dt) ** 2));
    prev = next;
  }
  const yAt = (t: number) => {
    const x = clamp(t / dt, 0, steps);
    const i = Math.min(Math.floor(x), steps - 1);
    return -(drop[i] + (drop[i + 1] - drop[i]) * (x - i));
  };
  // u: cm na largura (0 = frente); v: cm a partir da barra (v = L na gola), para a arte ficar em pé.
  const fn: SheetFn = (u, v, out) => {
    const t = L - v;
    const r = row(t);
    const target = clamp(r.cum[K / 2] + (u / (W / 2)) * (r.total / 2) * cover, 0, r.total);
    let lo = 0;
    let hi = K;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (r.cum[mid] < target) lo = mid;
      else hi = mid;
    }
    const f = (target - r.cum[lo]) / (r.cum[hi] - r.cum[lo] || 1);
    const phi = -Math.PI + (2 * Math.PI * (lo + f)) / K;
    const sx = Math.sin(phi);
    const cz = Math.cos(phi);
    let nx = sx / r.a;
    let nz = cz / r.b;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl;
    nz /= nl;
    // Franzido na gola, caimento leve no meio e godê na barra (deslocamento pela normal: não estica).
    const gather = 1.3 * (1 - smoothstep(0, shoulder * 0.9, t)) * Math.sin(u * 1.15 + 0.3);
    const drape = 0.4 * smoothstep(shoulder, 60, t) * Math.sin(u * 0.27 + 2.2);
    const hem = 1.7 * Math.pow(smoothstep(45, L, t), 1.3) * (0.65 * Math.sin(u * 0.37 + 0.4) + 0.35 * Math.sin(u * 0.86 + 1.9));
    const d = gather + drape + hem;
    return out.set(r.a * sx + nx * d, yAt(t), r.b * cz + r.zc + nz * d);
  };
  return { fn, hemY: yAt(L) };
}

/** Gola da capa: anel de viés fechado (perfil fechado no torno). */
const NECK_BAND: Pt[] = [
  [7.55, -0.7],
  [8, -0.6],
  [8.2, 0],
  [8.2, 2.9],
  [8, 3.3],
  [7.55, 3.35],
  [7.5, 2.9],
  [7.5, -0.3],
  [7.55, -0.7],
];
const FORM_NECK: Pt[] = [
  [0, -8],
  [6.9, -8],
  [6.95, 2],
  [6.7, 6],
  [6.5, 9],
  [6.75, 10.2],
  [0, 10.2],
];
const FORM_CAP: Pt[] = [
  [0, 10.1],
  [7, 10.1],
  [7.35, 10.5],
  [7.4, 11.3],
  [7, 11.9],
  [0, 12],
];
const STAND_BASE: Pt[] = [
  [0, 0],
  [15, 0],
  [16, 0.6],
  [16.2, 1.6],
  [15.4, 2.6],
  [0, 2.8],
];

/** Capa de corte em cetim vestida num busto de costura: gola com pressão nas costas e pedestal de nogueira. */
function BarberCape({ spec, art, label }: ModelProps) {
  const W = cm(spec.widthCm, 120);
  const L = cm(spec.heightCm, 140);
  // Mesma medida protegida da malha (o UV cobre W × L em comprimento de arco).
  const texture = useArtTexture(W / L, "front", art, label);
  const parts = useMemo(() => {
    const cape = capeSurface(W, L);
    return {
      sheet: sheetGeometry(cape.fn, [-W / 2, W / 2, 0, L], 150, 170),
      hem: tubeAlong(edgeLoop(cape.fn, [-W / 2 + 0.3, W / 2 - 0.3, 0.3, L - 0.2], 1.2), 0.3, true, 6),
      band: lathe(NECK_BAND, 64),
      neck: lathe(FORM_NECK, 48),
      cap: lathe(FORM_CAP, 48),
      base: lathe(STAND_BASE, 64),
      tab: roundedSlab(3.4, 2.6, 0.35, 0.8),
      hemY: cape.hemY,
    };
  }, [W, L]);
  const list = useMemo(() => [parts.sheet, parts.hem.geometry, parts.band, parts.neck, parts.cap, parts.base, parts.tab], [parts]);
  useGeometriesCleanup(list);
  const fabric = clothColor(spec.baseColor);
  const baseTop = parts.hemY - 20;
  // A haste sobe até o pescoço do busto (pela abertura das costas não se vê o busto "flutuando").
  const poleTop = FORM_NECK[0][1] + 0.5;
  const s = 2.75 / (13.5 - (baseTop - 2.8));
  return (
    <group scale={s} rotation-y={0.2}>
      <mesh geometry={parts.sheet}>
        <SatinCloth map={texture} />
      </mesh>
      <mesh geometry={parts.sheet}>
        <SatinCloth color={tone(fabric, "#000000", 0.1)} side={THREE.BackSide} />
      </mesh>
      <mesh geometry={parts.hem.geometry}>
        <SatinCloth color={tone(fabric, "#000000", 0.05)} />
      </mesh>
      <mesh geometry={parts.band}>
        <SatinCloth color={tone(fabric, "#000000", 0.04)} />
      </mesh>
      {/* Aba de fechamento e botão de pressão nas costas. */}
      <mesh geometry={parts.tab} position={[0, 1.3, -8.35]}>
        <SatinCloth color={tone(fabric, "#000000", 0.04)} />
      </mesh>
      <mesh position={[0, 1.3, -8.62]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.62, 0.62, 0.25, 24]} />
        <Steel color="#c9ccd1" roughness={0.3} />
      </mesh>
      {/* Busto: pescoço de linho e tampa de nogueira com pegador. */}
      <mesh geometry={parts.neck}>
        <meshStandardMaterial color="#e6e0d4" roughness={0.95} />
      </mesh>
      <mesh geometry={parts.cap}>
        <meshPhysicalMaterial color="#5a3b26" roughness={0.45} clearcoat={0.35} clearcoatRoughness={0.3} />
      </mesh>
      <mesh position-y={12.2}>
        <cylinderGeometry args={[0.45, 0.6, 0.6, 16]} />
        <meshPhysicalMaterial color="#5a3b26" roughness={0.45} clearcoat={0.35} />
      </mesh>
      <mesh position-y={13.1}>
        <sphereGeometry args={[1.15, 24, 16]} />
        <meshPhysicalMaterial color="#5a3b26" roughness={0.45} clearcoat={0.35} />
      </mesh>
      {/* Pedestal: haste de latão escovado e base torneada. */}
      <mesh position-y={(poleTop + baseTop) / 2}>
        <cylinderGeometry args={[1.25, 1.25, poleTop - baseTop, 24]} />
        <Steel color="#c8b48a" roughness={0.35} />
      </mesh>
      <mesh geometry={parts.base} position-y={baseTop - 2.8}>
        <meshPhysicalMaterial color="#5a3b26" roughness={0.45} clearcoat={0.35} clearcoatRoughness={0.3} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------- guardanapo

/** Perfil do prato raso (raio R em cm): pé, fundo, aba subindo e borda arredondada. */
function platePoints(R: number): Pt[] {
  return [
    [0, 0.28],
    [R * 0.34, 0.28],
    [R * 0.36, 0.04],
    [R * 0.4, 0],
    [R * 0.44, 0.03],
    [R * 0.48, 0.24],
    [R * 0.64, 0.48],
    [R * 0.8, 0.86],
    [R * 0.95, 1.44],
    [R, 1.62],
    [R * 0.995, 1.76],
    [R * 0.962, 1.77],
    [R * 0.8, 1.24],
    [R * 0.64, 0.8],
    [R * 0.56, 0.64],
    [R * 0.3, 0.58],
    [0, 0.58],
  ];
}

/** Altura da face de cima do prato num raio r (mesmo perfil de platePoints). */
function plateTop(R: number, r: number) {
  const top: Pt[] = [
    [0, 0.58],
    [R * 0.3, 0.58],
    [R * 0.56, 0.64],
    [R * 0.64, 0.8],
    [R * 0.8, 1.24],
    [R * 0.962, 1.77],
  ];
  for (let i = 1; i < top.length; i += 1) {
    const [r0, y0] = top[i - 1];
    const [r1, y1] = top[i];
    if (r <= r1) return y0 + ((y1 - y0) * (r - r0)) / (r1 - r0 || 1);
  }
  return top[top.length - 1][1];
}

const FORK_HALF: Pt[] = [
  [0, 0],
  [0.5, 0.1],
  [0.85, 0.6],
  [0.95, 2],
  [0.8, 7],
  [0.5, 10.5],
  [0.28, 12],
  [0.32, 13.2],
  [0.75, 14.2],
  [1.1, 15.2],
  [1.15, 19],
  [0.8, 19],
  [0.78, 16.4],
  [0.6, 16.4],
  [0.58, 19],
  [0.12, 19],
  [0.1, 16.4],
  [0, 16.4],
];
const FORK: Pt[] = [...FORK_HALF, ...FORK_HALF.slice(1, -1).reverse().map(([x, y]): Pt => [-x, y])];
const KNIFE: Pt[] = [
  [0, 0],
  [0.55, 0.1],
  [0.8, 0.7],
  [0.82, 9.2],
  [0.6, 10],
  [0.7, 10.6],
  [0.95, 11.3],
  [1, 16.8],
  [0.82, 19.2],
  [0.42, 20.6],
  [0.04, 21.1],
  [-0.42, 21],
  [-0.7, 20.4],
  [-0.74, 11.1],
  [-0.6, 10.6],
  [-0.58, 10],
  [-0.82, 9.2],
  [-0.8, 0.7],
  [-0.55, 0.1],
];

/** Talher em chapa de 2 mm com bisel, centrado no comprimento, base em z = 0. */
function flatwareGeometry(outline: Pt[]) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2 });
  const length = Math.max(...outline.map(([, y]) => y));
  geometry.translate(0, -length / 2, 0.05);
  return geometry;
}

/** Guardanapo aberto sobre a mesa: vincos de quem acabou de desdobrar e um canto levemente erguido. */
function napkinSurface(W: number, H: number): SheetFn {
  return (u, v, out) => {
    const ridge = 0.36 * Math.exp(-((u / 1.7) ** 2)) * (0.7 + 0.3 * Math.cos(v * 0.2));
    const valley = 0.2 * (1 - Math.exp(-((v / 2.8) ** 2))) * Math.exp(-((v / (H * 0.3)) ** 2));
    const wave = 0.1 + 0.11 * Math.sin(u * 0.23 + 0.6) * Math.sin(v * 0.19 + 1.2);
    const corner = smoothstep(0.62, 1, u / W - v / H);
    return out.set(u, v, 0.12 + ridge + valley + wave + 2.6 * corner * corner);
  };
}

/** Kit com 2 guardanapos: um aberto (arte inteira) e outro dobrado no prato, com garfo e faca ao lado. */
function NapkinSet({ spec, art, label }: ModelProps) {
  const W = cm(spec.widthCm, 45);
  const H = cm(spec.heightCm, 45);
  // Prato raso (26–32 cm) grande o bastante para o guardanapo dobrado (W/3 × H/2) não passar da borda.
  const plateR = clamp(Math.hypot(W / 3, H / 2) / 2 / 0.92, 13, 16);
  const px = W / 2 + plateR + 2.5;
  const py = H * 0.12;
  const s = 2.7 / (W + 2 * plateR + 9.5);
  const texture = useArtTexture(W / H, "front", art, label);
  // Os dois guardanapos usam o mesmo espaço de UV (o dobrado é um recorte dele): mesma trama.
  const weave = useTile("weave", W / 2.5, H / 2.5);
  const parts = useMemo(() => {
    const fn = napkinSurface(W, H);
    const hem = tubeAlong(edgeLoop(fn, [-W / 2 + 0.25, W / 2 - 0.25, -H / 2 + 0.25, H / 2 - 0.25], 0.8), 0.24, true, 6);
    planarUv(hem.geometry, W, H);
    // Segundo guardanapo dobrado em 6 (W/3 × H/2) acompanhando a curva do prato: mostra 1/6 da arte.
    const fw = W / 3;
    const fh = H / 2;
    const turn = -0.4;
    const folded: SheetFn = (u, v, out) => {
      const x = u * Math.cos(turn) - v * Math.sin(turn);
      const y = u * Math.sin(turn) + v * Math.cos(turn);
      const edge = Math.min(fw / 2 - Math.abs(u), fh / 2 - Math.abs(v));
      const puff = 0.12 + 0.55 * Math.sqrt(1 - (1 - clamp(edge / 0.9, 0, 1)) ** 2);
      return out.set(x, y, plateTop(plateR, Math.hypot(x, y)) + puff + 0.05 * Math.sin(u * 0.7 + v * 0.4));
    };
    return {
      sheet: sheetGeometry(fn, [-W / 2, W / 2, -H / 2, H / 2], 90, 90),
      hem,
      folded: sheetGeometry(folded, [-fw / 2, fw / 2, -fh / 2, fh / 2], 28, 42, { uv: [1 / 3, 2 / 3, 0.5, 1] }),
      plate: lathe(platePoints(plateR), 96),
      fork: flatwareGeometry(FORK),
      knife: flatwareGeometry(KNIFE),
    };
  }, [W, H, plateR]);
  const list = useMemo(() => [parts.sheet, parts.hem.geometry, parts.folded, parts.plate, parts.fork, parts.knife], [parts]);
  useGeometriesCleanup(list);
  const fabric = clothColor(spec.baseColor);
  return (
    <group scale={s} userData={{ view: { elevation: 0.85, azimuth: 0.18 } satisfies View }}>
      <group rotation-x={FLAT}>
        <group rotation-z={-0.05}>
          <mesh geometry={parts.sheet}>
            <PrintCloth map={texture} bump={weave} />
          </mesh>
          <mesh geometry={parts.sheet}>
            <PlainCloth color={fabric} side={THREE.BackSide} />
          </mesh>
          <mesh geometry={parts.hem.geometry}>
            <PrintCloth map={texture} />
          </mesh>
        </group>
        <mesh geometry={parts.folded} position={[px, py, 0]}>
          <PrintCloth map={texture} bump={weave} />
        </mesh>
      </group>
      <mesh geometry={parts.plate} position={onTable(px, py)}>
        <meshPhysicalMaterial color="#f7f5f0" roughness={0.16} clearcoat={1} clearcoatRoughness={0.05} />
      </mesh>
      <mesh geometry={parts.fork} position={onTable(px + plateR + 3, py - 1.5)} rotation-x={FLAT}>
        <Steel color="#dfe2e6" roughness={0.28} />
      </mesh>
      <mesh geometry={parts.knife} position={onTable(px + plateR + 6.2, py - 0.5)} rotation-x={FLAT}>
        <Steel color="#dfe2e6" roughness={0.28} />
      </mesh>
    </group>
  );
}

/**
 * Tecidos. {napkin} kit de guardanapos: um aberto na mesa com vincos e bainha estampada, outro
 * dobrado sobre o prato, com garfo e faca; {dishcloth} pano de prato dobrado no puxador de inox do
 * forno, estampa localizada, bainha e pesponto; {barber-cape} capa de corte em cetim vestida num busto
 * de costura, gola com pressão; padrão (sublimação / UV em tecido) o tecido solto estendido, sem bastão nem
 * cordão, com bainha e ilhós quando a opção pede.
 */
export function ClothModel(props: ModelProps) {
  const { spec } = props;
  if (spec.variant === "napkin") return <NapkinSet {...props} />;
  if (spec.variant === "dishcloth") return <DishTowel {...props} />;
  if (spec.variant === "barber-cape") return <BarberCape {...props} />;
  return <LooseFabric {...props} />;
}
