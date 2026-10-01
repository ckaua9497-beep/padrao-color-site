"use client";

// Conforto: máscara de dormir, almofada de pescoço, kit soneca (manta + travesseiro) e almofada para notebook.

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Fabric, closedTube, useInflated } from "./fabric";
import { inflatedSurface, shapePolygon } from "./inflate";
import { PrintMaterial, faceGeometry, makeShape, useArtTexture, useGeometryCleanup, type ModelProps } from "./shared";

// ---------------------------------------------------------------------------- helpers locais

/** Medida da spec em cm, protegida contra zero/NaN e limitada a uma faixa plausível. */
function cm(value: number, fallback: number, min: number, max: number) {
  return Number.isFinite(value) && value > 0 ? THREE.MathUtils.clamp(value, min, max) : fallback;
}

function shade(color: string, factor: number) {
  return new THREE.Color(color).multiplyScalar(factor).getStyle();
}

function isLight(color: string) {
  const c = new THREE.Color(color);
  return c.r * 0.299 + c.g * 0.587 + c.b * 0.114 > 0.35;
}

function boxAspect(box: THREE.Box2) {
  const w = box.max.x - box.min.x;
  const h = box.max.y - box.min.y;
  return w > 0 && h > 0 ? w / h : 1;
}

/** Altura da superfície inflada a uma distância `d` da borda (mesmo perfil de inflate.ts). */
function surfaceHeight(height: number, falloff: number, d: number) {
  const t = Math.min(1, d / Math.max(falloff, 1e-6));
  return height * Math.sqrt(1 - (1 - t) * (1 - t));
}

/** Contorno deslocado para dentro (linha de costura). Vale para recuos pequenos frente à curvatura. */
function insetPolygon(points: THREE.Vector2[], d: number): THREE.Vector2[] {
  const n = points.length;
  let area = 0;
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  const dir = area > 0 ? 1 : -1;
  return points.map((p, i) => {
    const a = points[(i - 1 + n) % n];
    const b = points[(i + 1) % n];
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    return new THREE.Vector2(p.x - (dir * ty * d) / len, p.y + (dir * tx * d) / len);
  });
}

/** Debrum fechado em 3D (closedTube só aceita z constante; a máscara é curva). */
function loopTube(points: THREE.Vector3[], radius: number, segments = 220) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true), segments, radius, 8, true);
}

type PairOptions = { height: number; falloff: number; folds?: number; resolution?: number; bend?: number; slope?: number; backScale?: number };

/**
 * Frente e verso inflados (inflate.ts) com dois ajustes: `bend` curva a peça em x (máscara que abraça
 * o rosto) e `slope` faz a frente crescer ao longo de y (almofada mais alta atrás). A costura (z = 0)
 * recebe o mesmo deslocamento nos dois lados, então a peça continua fechada.
 */
function useInflatedPair(shape: THREE.Shape, options: PairOptions) {
  const { height, falloff, folds = 0, resolution = 90, bend = 0, slope = 0, backScale = 1 } = options;
  const pair = useMemo(() => {
    const polygon = shapePolygon(shape);
    const box = new THREE.Box2().setFromPoints(polygon);
    const cy = (box.min.y + box.max.y) / 2;
    const half = Math.max((box.max.y - box.min.y) / 2, 1e-6);
    const front = inflatedSurface(polygon, { height, falloff, folds, resolution, side: 1 });
    const back = inflatedSurface(polygon, { height: height * backScale, falloff, folds: 0, resolution, side: -1 });
    const deform = (geometry: THREE.BufferGeometry, tilt: number) => {
      const pos = geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        pos.setZ(i, pos.getZ(i) * (1 + (tilt * (y - cy)) / half) - bend * x * x);
      }
      pos.needsUpdate = true;
      geometry.computeVertexNormals();
    };
    deform(front, slope);
    deform(back, 0);
    return { polygon, box, front, back };
  }, [shape, height, falloff, folds, resolution, bend, slope, backScale]);
  useGeometryCleanup(pair.front);
  useGeometryCleanup(pair.back);
  return pair;
}

/** Pontos de costura: cápsulas curtas instanciadas ao longo de um caminho fechado. */
function Stitches({ points, pitch, radius, color }: { points: THREE.Vector3[]; pitch: number; radius: number; color: string }) {
  const geometry = useMemo(() => new THREE.CapsuleGeometry(radius, pitch * 0.55, 1, 5), [radius, pitch]);
  useGeometryCleanup(geometry);
  const matrices = useMemo(() => {
    if (points.length < 3 || pitch <= 0) return [];
    const curve = new THREE.CatmullRomCurve3(points, true);
    const count = Math.max(3, Math.floor(curve.getLength() / pitch));
    const up = new THREE.Vector3(0, 1, 0);
    return Array.from({ length: count }, (_, i) => {
      const t = i / count;
      const quaternion = new THREE.Quaternion().setFromUnitVectors(up, curve.getTangentAt(t).normalize());
      return new THREE.Matrix4().compose(curve.getPointAt(t), quaternion, new THREE.Vector3(1, 1, 1));
    });
  }, [points, pitch]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [matrices]);
  if (!matrices.length) return null;
  return (
    <instancedMesh key={matrices.length} ref={ref} args={[geometry, undefined, matrices.length]}>
      <meshStandardMaterial color={color} roughness={0.75} />
    </instancedMesh>
  );
}

/** Zíper ao longo de y, com os dentes para +x: fita, dentes alternados, cursor e puxador. */
function Zipper({ length, unit, tape, position }: { length: number; unit: number; tape: string; position: [number, number, number] }) {
  const pitch = 0.32 * unit;
  const count = Math.max(2, Math.floor(length / pitch));
  const tooth = useMemo(() => new THREE.BoxGeometry(0.24 * unit, 0.17 * unit, 0.4 * unit), [unit]);
  useGeometryCleanup(tooth);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i += 1) {
      m.makeTranslation(0.12 * unit, -length / 2 + pitch * (i + 0.5), (i % 2 ? 1 : -1) * 0.09 * unit);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [count, length, pitch, unit]);
  const top = length / 2 - 0.9 * unit;
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.08 * unit, length, 1.3 * unit]} />
        <meshStandardMaterial color={tape} roughness={0.85} />
      </mesh>
      <instancedMesh key={count} ref={ref} args={[tooth, undefined, count]}>
        <meshStandardMaterial color="#c9ccd1" metalness={1} roughness={0.32} />
      </instancedMesh>
      {/* Cursor e puxador pendurado */}
      <mesh position={[0.3 * unit, top, 0]} scale={[1, 1, 1.4]}>
        <capsuleGeometry args={[0.28 * unit, 0.9 * unit, 4, 12]} />
        <meshStandardMaterial color="#d4d7dc" metalness={1} roughness={0.25} />
      </mesh>
      <mesh position={[0.52 * unit, top - 1.35 * unit, 0]} scale={[0.32, 1, 1]}>
        <capsuleGeometry args={[0.36 * unit, 1.5 * unit, 4, 12]} />
        <meshStandardMaterial color="#d4d7dc" metalness={1} roughness={0.25} />
      </mesh>
    </group>
  );
}

/** Ruído suave e repetível para o relevo de pelúcia/microfibra (canal 1 de UV). */
function plushCanvas(size = 128) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  let seed = 1234567;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const raw = new Float32Array(size * size).map(() => rand());
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) sum += raw[((y + dy + size) % size) * size + ((x + dx + size) % size)];
      }
      const g = THREE.MathUtils.clamp(128 + (sum / 9 - 0.5) * 300, 0, 255);
      const k = (y * size + x) * 4;
      image.data[k] = g;
      image.data[k + 1] = g;
      image.data[k + 2] = g;
      image.data[k + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function usePlushBump(repeatX: number, repeatY: number) {
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(plushCanvas());
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    // O relevo segue o UV paramétrico (uv1): não estica nas laterais como a arte projetada.
    t.channel = 1;
    return t;
  }, [repeatX, repeatY]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

// ---------------------------------------------------------------------------- máscara de dormir

/** Unidades por cm na máscara (≈ 18 cm de largura). */
const MASK_UNIT = 2.3 / 18;

/** Contorno de dois lóbulos com recorte para o nariz, centrado na origem. */
function maskShape(w: number, h: number) {
  const x = w / 2;
  const y = h / 2;
  const s = new THREE.Shape();
  s.moveTo(0, 0.9 * y);
  s.bezierCurveTo(-0.3 * x, 1.02 * y, -0.7 * x, 1.04 * y, -0.9 * x, 0.78 * y);
  s.bezierCurveTo(-1.04 * x, 0.6 * y, -1.04 * x, -0.2 * y, -0.92 * x, -0.5 * y);
  s.bezierCurveTo(-0.8 * x, -0.86 * y, -0.5 * x, -1.02 * y, -0.3 * x, -0.92 * y);
  s.bezierCurveTo(-0.16 * x, -0.86 * y, -0.12 * x, -0.5 * y, 0, -0.48 * y);
  s.bezierCurveTo(0.12 * x, -0.5 * y, 0.16 * x, -0.86 * y, 0.3 * x, -0.92 * y);
  s.bezierCurveTo(0.5 * x, -1.02 * y, 0.8 * x, -0.86 * y, 0.92 * x, -0.5 * y);
  s.bezierCurveTo(1.04 * x, -0.2 * y, 1.04 * x, 0.6 * y, 0.9 * x, 0.78 * y);
  s.bezierCurveTo(0.7 * x, 1.04 * y, 0.3 * x, 1.02 * y, 0, 0.9 * y);
  return s;
}

/**
 * Máscara de dormir: contorno de dois lóbulos inflado (inflate.ts) e curvado em x para abraçar o rosto,
 * frente sublimada pela UV da superfície (mesma proporção do contorno), costura pespontada, debrum em
 * volta e elástico com regulador atrás (tubo achatado).
 */
export function SleepMaskModel({ spec, art, label }: ModelProps) {
  const u = MASK_UNIT;
  const w = cm(spec.widthCm, 17.7, 12, 26) * u;
  const h = cm(spec.heightCm, 7.5, 5, 14) * u;
  const puff = 0.85 * u;
  const falloff = 2 * u;
  // As pontas recuam ≈ 2,4 cm em relação ao centro.
  const bend = (2.4 * u) / ((w / 2) * (w / 2));
  const shape = useMemo(() => maskShape(w, h), [w, h]);
  const pair = useInflatedPair(shape, { height: puff, falloff, resolution: 110, bend, backScale: 0.55 });
  const map = useArtTexture(boxAspect(pair.box), "front", art, label);

  const rim = useMemo(() => loopTube(pair.polygon.map((p) => new THREE.Vector3(p.x, p.y, -bend * p.x * p.x)), 0.2 * u), [pair, bend, u]);
  useGeometryCleanup(rim);
  const stitch = useMemo(() => {
    const d = 0.55 * u;
    const z = surfaceHeight(puff, falloff, d) + 0.03 * u;
    return insetPolygon(pair.polygon, d).map((p) => new THREE.Vector3(p.x, p.y, z - bend * p.x * p.x));
  }, [pair, puff, falloff, bend, u]);

  const strap = useMemo(() => {
    const left = pair.polygon.reduce((best, p) => (p.x < best.x ? p : best), pair.polygon[0]);
    const xl = pair.box.min.x;
    const xr = pair.box.max.x;
    const ze = -bend * xr * xr;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(xl + 0.7 * u, 0, ze * 0.85),
      new THREE.Vector3(xl - 0.35 * u, 0, ze - 1.4 * u),
      new THREE.Vector3(xl * 0.72, 0, ze - 5.2 * u),
      new THREE.Vector3(0, 0, ze - 6.6 * u),
      new THREE.Vector3(xr * 0.72, 0, ze - 5.2 * u),
      new THREE.Vector3(xr + 0.35 * u, 0, ze - 1.4 * u),
      new THREE.Vector3(xr - 0.7 * u, 0, ze * 0.85),
    ]);
    return { geometry: new THREE.TubeGeometry(curve, 96, 0.12 * u, 8, false), y: left?.y ?? 0, back: ze - 6.6 * u };
  }, [pair, bend, u]);
  useGeometryCleanup(strap.geometry);

  const trim = spec.accentColor ?? "#1f1f23";
  return (
    <group rotation={[-0.05, 0.3, 0]}>
      <mesh geometry={pair.front}>
        {/* Neoprene sublimado: brilho acetinado contido, para o véu do sheen não lavar a arte nas bordas */}
        <meshPhysicalMaterial map={map} roughness={0.48} sheen={0.45} sheenRoughness={0.35} sheenColor="#ffffff" />
      </mesh>
      <mesh geometry={pair.back}>
        <Fabric color={spec.baseColor} />
      </mesh>
      <mesh geometry={rim}>
        <meshPhysicalMaterial color={trim} roughness={0.55} sheen={0.6} sheenColor="#ffffff" />
      </mesh>
      <Stitches points={stitch} pitch={0.42 * u} radius={0.035 * u} color={trim} />
      {/* Elástico: tubo fino achatado em y vira uma fita de 2 cm */}
      <group position-y={strap.y}>
        <mesh geometry={strap.geometry} scale={[1, 8.3, 1]}>
          <meshStandardMaterial color={trim} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0, strap.back]} scale={[2.8, 1, 1]}>
          <capsuleGeometry args={[0.25 * u, 2.1 * u, 4, 12]} />
          <meshStandardMaterial color="#141416" roughness={0.38} />
        </mesh>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- almofada de pescoço

/** Unidades por cm na almofada de pescoço (30 cm de largura). */
const NECK_UNIT = 2.4 / 30;
const NECK_STEPS = 180;
const NECK_RING = 40;
/** Fim da parte cheia do "U" (rad, medido a partir do topo) e arco da ponta arredondada. */
const NECK_END = 2.12;
const NECK_CAP = 0.5;

type NeckSample = { theta: number; px: number; py: number; nx: number; ny: number; a: number; b: number; s: number };

/** Ponto da linha central do U (elipse levemente alongada em y) com normal no plano e raios do perfil. */
function neckSample(theta: number, width: number): NeckSample {
  const k = width / 30;
  const rc = 9.8 * k;
  const ey = 1.12;
  let nx = rc * ey * Math.sin(theta);
  let ny = rc * Math.cos(theta);
  const len = Math.hypot(nx, ny) || 1;
  nx /= len;
  ny /= len;
  const along = Math.min(1, Math.abs(theta) / NECK_END);
  const over = Math.max(0, Math.abs(theta) - NECK_END) / NECK_CAP;
  return {
    theta,
    px: rc * Math.sin(theta),
    py: rc * ey * Math.cos(theta),
    nx,
    ny,
    // Mais gorda no topo (nuca), afinando para as pontas; ponta em calota.
    a: (5.2 - 0.7 * along * along) * k,
    b: (4.6 - 0.6 * along * along) * k,
    s: Math.sqrt(Math.max(0, 1 - over * over)),
  };
}

/** Ponto do perfil (superelipse: faces mais planas) com franzido na curva interna. */
function ringPoint(q: NeckSample, phi: number, out: THREE.Vector3) {
  const c = Math.cos(phi);
  const sn = Math.sin(phi);
  const cx = Math.sign(c) * Math.abs(c) ** 0.8;
  const sz = Math.sign(sn) * Math.abs(sn) ** 0.8;
  const inner = Math.max(0, -c);
  const gather = 1 + 0.07 * inner * inner * Math.sin(q.theta * 17);
  const r = q.a * q.s * cx * gather;
  return out.set(q.px + q.nx * r, q.py + q.ny * r, q.b * q.s * sz);
}

/**
 * Tubo varrido ao longo do U: u ao longo da curva, v em volta do perfil. A metade da frente (z ≥ 0)
 * recebe a arte projetada em xy (de pé e sem distorção vista de frente); a de trás fica lisa.
 * Com imagem enviada a projeção cobre o U inteiro (painel sublimado 30 × 30 recortado); no modelo
 * com texto ela cobre só a faixa de cima, para o nome não cair no vão do pescoço.
 */
function neckPillowGeometry(width: number, fullCover: boolean) {
  const thetaMax = NECK_END + NECK_CAP;
  const p = new THREE.Vector3();
  const count = (NECK_STEPS + 1) * (NECK_RING + 1);
  const halves = [0, 1].map((half) => {
    const positions = new Float32Array(count * 3);
    const params = new Float32Array(count * 2);
    let k = 0;
    for (let i = 0; i <= NECK_STEPS; i += 1) {
      const t = i / NECK_STEPS;
      const q = neckSample(-thetaMax + 2 * thetaMax * t, width);
      for (let j = 0; j <= NECK_RING; j += 1) {
        ringPoint(q, Math.PI * (half + j / NECK_RING), p);
        positions[k * 3] = p.x;
        positions[k * 3 + 1] = p.y;
        positions[k * 3 + 2] = p.z;
        params[k * 2] = t;
        params[k * 2 + 1] = j / NECK_RING;
        k += 1;
      }
    }
    return { positions, params };
  });

  const indices: number[] = [];
  for (let i = 0; i < NECK_STEPS; i += 1) {
    for (let j = 0; j < NECK_RING; j += 1) {
      const a = i * (NECK_RING + 1) + j;
      const b = a + NECK_RING + 1;
      const c = a + 1;
      const d = b + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  // Caixa da projeção da arte.
  const front = halves[0].positions;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i += 1) {
    minX = Math.min(minX, front[i * 3]);
    maxX = Math.max(maxX, front[i * 3]);
    minY = Math.min(minY, front[i * 3 + 1]);
    maxY = Math.max(maxY, front[i * 3 + 1]);
  }
  const bw = Math.max(maxX - minX, 1e-6);
  // Faixa com centro ≈ 9 cm acima do centro do U: texto de duas linhas não cai no vão do pescoço.
  if (!fullCover) minY = maxY - bw * 0.5;
  const bh = Math.max(maxY - minY, 1e-6);
  const planar = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 1) {
    planar[i * 2] = (front[i * 3] - minX) / bw;
    planar[i * 2 + 1] = (front[i * 3 + 1] - minY) / bh;
  }

  const build = (positions: Float32Array, uv: Float32Array, uv1: Float32Array) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setAttribute("uv1", new THREE.BufferAttribute(uv1, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  };

  // Costura lateral (z = 0): volta por fora, contorna a ponta e volta por dentro.
  const outer: THREE.Vector2[] = [];
  const inner: THREE.Vector2[] = [];
  for (let i = 1; i < NECK_STEPS; i += 1) {
    const q = neckSample(-thetaMax + (2 * thetaMax * i) / NECK_STEPS, width);
    ringPoint(q, 0, p);
    outer.push(new THREE.Vector2(p.x, p.y));
    ringPoint(q, Math.PI, p);
    inner.push(new THREE.Vector2(p.x, p.y));
  }
  const anchor = neckSample(NECK_END - 0.1, width);

  return {
    front: build(halves[0].positions, planar, halves[0].params),
    back: build(halves[1].positions, halves[1].params, halves[1].params),
    seam: [...outer, ...inner.reverse()],
    aspect: bw / bh,
    anchor: { x: anchor.px, y: anchor.py, z: anchor.b * 0.88 },
  };
}

function NeckPillow({ spec, art, label }: ModelProps) {
  const u = NECK_UNIT;
  const width = cm(spec.widthCm, 30, 22, 40) * u;
  const fullCover = Boolean(art.src);
  const geo = useMemo(() => neckPillowGeometry(width, fullCover), [width, fullCover]);
  useGeometryCleanup(geo.front);
  useGeometryCleanup(geo.back);
  const map = useArtTexture(geo.aspect, "front", art, label);
  const bump = usePlushBump(36, 18);
  const piping = useMemo(() => closedTube(geo.seam, 0.26 * u), [geo, u]);
  useGeometryCleanup(piping);
  const strap = useMemo(() => {
    const { x, z } = geo.anchor;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-x, 0, z),
      new THREE.Vector3(-x * 0.5, 0, z + 0.5 * u),
      new THREE.Vector3(0, 0, z + 0.65 * u),
      new THREE.Vector3(x * 0.5, 0, z + 0.5 * u),
      new THREE.Vector3(x, 0, z),
    ]);
    const snap = curve.getPointAt(0.7);
    return { geometry: new THREE.TubeGeometry(curve, 48, 0.15 * u, 10, false), snap: [snap.x, snap.z + 0.16 * u] as const };
  }, [geo, u]);
  useGeometryCleanup(strap.geometry);

  const welt = spec.accentColor ?? shade(spec.baseColor, 0.9);
  const strapColor = spec.accentColor ?? (isLight(spec.baseColor) ? "#202024" : "#e9e6df");
  return (
    <group>
      <mesh geometry={geo.front}>
        <meshPhysicalMaterial map={map} bumpMap={bump} bumpScale={0.3} roughness={0.9} sheen={0.9} sheenRoughness={0.55} sheenColor="#ffffff" />
      </mesh>
      <mesh geometry={geo.back}>
        <meshPhysicalMaterial color={spec.baseColor} bumpMap={bump} bumpScale={0.3} roughness={0.92} sheen={0.9} sheenRoughness={0.55} sheenColor="#ffffff" />
      </mesh>
      <mesh geometry={piping}>
        <meshPhysicalMaterial color={welt} roughness={0.8} sheen={0.6} sheenColor="#ffffff" />
      </mesh>
      {/* Alça com botão de pressão fechando a abertura */}
      <group position-y={geo.anchor.y}>
        <mesh geometry={strap.geometry} scale={[1, 7.3, 1]}>
          <meshPhysicalMaterial color={strapColor} roughness={0.85} sheen={0.5} sheenColor="#ffffff" />
        </mesh>
        <group position={[strap.snap[0], 0, strap.snap[1]]}>
          <mesh rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.55 * u, 0.6 * u, 0.16 * u, 28]} />
            <meshStandardMaterial color="#d4d7dc" metalness={1} roughness={0.24} />
          </mesh>
          <mesh position-z={0.08 * u} scale={[1, 1, 0.42]}>
            <sphereGeometry args={[0.42 * u, 24, 12]} />
            <meshStandardMaterial color="#e2e4e7" metalness={1} roughness={0.18} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- kit soneca (manta + travesseiro)

/** Unidades por cm no kit (travesseiro de 40 cm ao lado da manta dobrada). */
const KIT_UNIT = 0.036;
const BLANKET_LAYERS = 6;
/** Pequeno desalinhamento (cm) de cada camada dobrada, para não parecer um bloco. */
const LAYER_JITTER: [number, number][] = [
  [0, 0],
  [0.35, -0.2],
  [-0.3, 0.18],
  [0.22, 0.3],
  [-0.18, -0.25],
  [0.05, 0.05],
];

/** Travesseiro 40 × 40 inflado, frente sublimada pela UV, debrum fino e zíper na lateral direita. */
function KitPillow({ spec, art, label }: ModelProps) {
  const u = KIT_UNIT;
  const size = 40 * u;
  const shape = useMemo(() => makeShape("rect", size, size, 4 * u), [size, u]);
  const surfaces = useInflated(shape, 6.5 * u, { falloff: 12 * u, folds: 0.3 * u });
  const map = useArtTexture(1, "front", art, label);
  const seam = useMemo(() => (surfaces ? closedTube(surfaces.polygon, 0.22 * u) : null), [surfaces, u]);
  useGeometryCleanup(seam);
  if (!surfaces || !seam) return null;
  return (
    <group>
      <mesh geometry={surfaces.front}>
        <meshPhysicalMaterial map={map} roughness={0.86} sheen={0.6} sheenRoughness={0.5} sheenColor="#ffffff" />
      </mesh>
      <mesh geometry={surfaces.back}>
        <Fabric color={spec.baseColor} sheen={0.7} />
      </mesh>
      <mesh geometry={seam}>
        <Fabric color={shade(spec.baseColor, 0.94)} sheen={0.6} />
      </mesh>
      <Zipper length={30 * u} unit={u} tape={shade(spec.baseColor, 0.85)} position={[size / 2, 0, 0]} />
    </group>
  );
}

/** Manta de fleece dobrada em camadas: dobras arredondadas alternadas, viés nas bordas, arte na camada de cima. */
function FoldedBlanket({ spec, art, label, w, d }: ModelProps & { w: number; d: number }) {
  const u = KIT_UNIT;
  const shape = useMemo(() => makeShape("rect", w, d, 2.5 * u), [w, d, u]);
  const layer = useInflated(shape, 0.5 * u, { falloff: 1.3 * u, resolution: 40 });
  const top = useInflated(shape, 0.62 * u, { falloff: 1.8 * u, folds: 0.1 * u, resolution: 84 });
  const map = useArtTexture(w / d, "front", art, label);
  const binding = useMemo(() => (layer ? closedTube(layer.polygon, 0.3 * u) : null), [layer, u]);
  useGeometryCleanup(binding);
  const fold = useMemo(() => new THREE.CapsuleGeometry(1.0 * u, Math.max(w - 5 * u, 0.1 * u), 4, 20), [w, u]);
  useGeometryCleanup(fold);
  if (!layer || !top || !binding) return null;

  const pitch = 1.08 * u;
  const layerZ = (i: number) => 0.5 * u + i * pitch;
  const bias = spec.accentColor ?? (isLight(spec.baseColor) ? "#3a3a40" : "#e9e6df");
  const last = BLANKET_LAYERS - 1;
  return (
    <group rotation-x={-Math.PI / 2}>
      {Array.from({ length: last }, (_, i) => (
        <group key={i} position={[LAYER_JITTER[i][0] * u, LAYER_JITTER[i][1] * u, layerZ(i)]}>
          <mesh geometry={layer.front}>
            <Fabric color={spec.baseColor} />
          </mesh>
          <mesh geometry={layer.back}>
            <Fabric color={spec.baseColor} />
          </mesh>
          <mesh geometry={binding}>
            <Fabric color={bias} sheen={0.5} />
          </mesh>
        </group>
      ))}
      <group position={[LAYER_JITTER[last][0] * u, LAYER_JITTER[last][1] * u, layerZ(last) + 0.1 * u]}>
        <mesh geometry={top.front}>
          <meshPhysicalMaterial map={map} roughness={0.95} sheen={0.8} sheenRoughness={0.85} sheenColor="#ffffff" />
        </mesh>
        <mesh geometry={top.back}>
          <Fabric color={spec.baseColor} />
        </mesh>
        <mesh geometry={binding}>
          <Fabric color={bias} sheen={0.5} />
        </mesh>
      </group>
      {/* Dobras: alternam entre a borda da frente (y local negativo) e a de trás */}
      {Array.from({ length: last }, (_, i) => (
        <mesh key={`fold-${i}`} geometry={fold} position={[0, (i % 2 ? 1 : -1) * (d / 2 - 1.0 * u), (layerZ(i) + layerZ(i + 1)) / 2]} rotation-z={Math.PI / 2}>
          <Fabric color={spec.baseColor} />
        </mesh>
      ))}
    </group>
  );
}

/** Kit Soneca do catálogo: manta 120 × 60 dobrada (arte em cima) e travesseiro 40 × 40 de pé atrás. */
function NapKit(props: ModelProps) {
  const { spec } = props;
  const u = KIT_UNIT;
  const w = (cm(spec.widthCm, 120, 60, 240) / 3) * u;
  const d = (cm(spec.heightCm, 60, 40, 200) / 2) * u;
  return (
    <group userData={{ view: { elevation: 0.42 } }}>
      <group position={[-13 * u, 20 * u, -9 * u]} rotation-y={0.22}>
        <KitPillow {...props} />
      </group>
      <group position={[15 * u, 0, 14 * u]} rotation-y={-0.25}>
        <FoldedBlanket {...props} w={w} d={d} />
      </group>
    </group>
  );
}

/**
 * Almofada de pescoço em U: tubo varrido próprio (perfil superelíptico de ≈ 4,5 cm, mais cheio na nuca,
 * pontas em calota, franzido na curva interna), arte de pé na face da frente, microfibra com sheen e
 * relevo de pelúcia, debrum na costura lateral e alça com botão de pressão na abertura.
 * Variante "kit" (Kit Soneca): manta de fleece dobrada + travesseiro com zíper, como no catálogo.
 */
export function NeckPillowModel(props: ModelProps) {
  if (props.spec.variant === "kit") return <NapKit {...props} />;
  return (
    <group rotation={[-0.12, 0.3, 0]}>
      <NeckPillow {...props} />
    </group>
  );
}

// ---------------------------------------------------------------------------- almofada para notebook

/** Unidades por cm na almofada para notebook (≈ 52 cm de largura). */
const DESK_UNIT = 2.6 / 52;

/**
 * Almofada para notebook: bandeja de MDF de bordas boleadas com a arte laminada (PrintMaterial com
 * verniz), batente de alumínio, apoio de punho em courino pespontado e almofada de tecido inflada por
 * baixo, mais alta atrás — a bandeja acompanha essa inclinação. Câmera mais alta para ver o tampo.
 */
export function LapDeskModel({ spec, art, label }: ModelProps) {
  const u = DESK_UNIT;
  const pw = cm(spec.widthCm, 50, 30, 70) * u;
  const ph = cm(spec.heightCm, 25, 15, 40) * u;
  const border = 1.2 * u;
  const lipD = 1.4 * u;
  const lipH = 1.0 * u;
  const wristD = 7.5 * u;
  const boardT = 1.0 * u;
  const bevel = 0.2 * u;
  const trayW = pw + 2 * border;
  const deckD = ph + 2 * border;
  const trayD = deckD + lipD + wristD;
  const zDeck = -trayD / 2 + deckD / 2;
  const zLip = -trayD / 2 + deckD + lipD / 2;
  const zWrist = trayD / 2 - wristD / 2;

  const map = useArtTexture(pw / ph, "front", art, label);
  const laminate = useMemo(() => ({ ...spec, clearcoat: Math.max(spec.clearcoat, 0.5) }), [spec]);

  const board = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(makeShape("rect", trayW, trayD, 2.6 * u), {
      depth: boardT,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
      curveSegments: 16,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -(boardT + bevel), 0);
    return g;
  }, [trayW, trayD, boardT, bevel, u]);
  useGeometryCleanup(board);
  const face = useMemo(() => {
    const g = faceGeometry(makeShape("rect", pw, ph, 0.6 * u), pw, ph);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [pw, ph, u]);
  useGeometryCleanup(face);
  const lip = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(makeShape("rect", lipD, lipH, 0.4 * u), { depth: pw, bevelEnabled: false, curveSegments: 8 });
    g.rotateY(Math.PI / 2);
    g.translate(-pw / 2, 0, 0);
    return g;
  }, [lipD, lipH, pw, u]);
  useGeometryCleanup(lip);

  // Apoio de punho: almofadinha de base quase plana.
  const wristPuff = 1.6 * u;
  const wristFalloff = 2.2 * u;
  const wristShape = useMemo(() => makeShape("rect", trayW - 2.4 * u, wristD - 1.0 * u, 2.5 * u), [trayW, wristD, u]);
  const wrist = useInflatedPair(wristShape, { height: wristPuff, falloff: wristFalloff, resolution: 72, backScale: 0.12 });
  const wristStitch = useMemo(() => {
    const inset = 0.55 * u;
    const z = surfaceHeight(wristPuff, wristFalloff, inset) + 0.03 * u;
    return insetPolygon(wrist.polygon, inset).map((p) => new THREE.Vector3(p.x, p.y, z));
  }, [wrist, wristPuff, wristFalloff, u]);

  // Almofada de baixo: frente (topo) mais alta atrás; o verso, achatado, fica no chão.
  const cushionH = 4.6 * u;
  const cushionBack = 0.55;
  const slope = 0.32;
  const cushionD = trayD - 3 * u;
  const cushionShape = useMemo(() => makeShape("rect", trayW - 3 * u, cushionD, 7 * u), [trayW, cushionD, u]);
  const cushion = useInflatedPair(cushionShape, { height: cushionH, falloff: 7 * u, folds: 0.15 * u, resolution: 80, slope, backScale: cushionBack });
  const piping = useMemo(() => closedTube(cushion.polygon, 0.35 * u), [cushion, u]);
  useGeometryCleanup(piping);

  const tilt = Math.atan((cushionH * slope) / (cushionD / 2));
  const cushionY = cushionH * cushionBack;
  const trayY = cushionY + cushionH - 0.25 * u + boardT + 2 * bevel;
  const laminateEdge = spec.accentColor ?? "#1f1f22";
  const leather = spec.accentColor ? shade(spec.accentColor, 0.9) : "#26262a";

  return (
    <group userData={{ view: { elevation: 0.7 } }} rotation-y={0.12}>
      <group position-y={cushionY} rotation-x={-Math.PI / 2}>
        <mesh geometry={cushion.front}>
          <Fabric color={spec.baseColor} sheen={0.5} />
        </mesh>
        <mesh geometry={cushion.back}>
          <Fabric color={spec.baseColor} sheen={0.5} />
        </mesh>
        <mesh geometry={piping}>
          <Fabric color={shade(spec.baseColor, 0.86)} sheen={0.4} />
        </mesh>
      </group>
      <group position-y={trayY} rotation-x={tilt}>
        <mesh geometry={board}>
          <meshPhysicalMaterial color={laminateEdge} roughness={0.42} clearcoat={0.6} clearcoatRoughness={0.15} />
        </mesh>
        <mesh geometry={face} position={[0, 0.02 * u, zDeck]}>
          <PrintMaterial map={map} spec={laminate} />
        </mesh>
        <mesh geometry={lip} position={[0, lipH / 2, zLip]}>
          <meshStandardMaterial color="#d4d7dc" metalness={1} roughness={0.28} />
        </mesh>
        <group position={[0, wristPuff * 0.12, zWrist]} rotation-x={-Math.PI / 2}>
          <mesh geometry={wrist.front}>
            <meshPhysicalMaterial color={leather} roughness={0.5} clearcoat={0.25} clearcoatRoughness={0.4} />
          </mesh>
          <mesh geometry={wrist.back}>
            <meshStandardMaterial color={leather} roughness={0.6} />
          </mesh>
          <Stitches points={wristStitch} pitch={0.45 * u} radius={0.04 * u} color="#a3a3a8" />
        </group>
      </group>
    </group>
  );
}
