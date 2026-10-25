"use client";

// Comunicação visual: LED neon (placa recortada e quadro), banner/lona/faixa, backlight e roll-up.
// Cada modelo usa a escala de fitFlat (unidades de cena por cm) para que ilhós, bastões, perfis e
// espaçadores tenham a medida real em relação à peça.

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MockupSpec } from "@/lib/mockup";
import { artAspect } from "@/lib/mockup-kinds";
import { FACA_MARGEM_CM, LED_BORDA_CM, LED_MARGEM_CM, distanceField, insidePolygon, polygonArea, smoothLoop, traceLoops } from "@/lib/contorno";
import { canvasFor, loadArtFont, paintArt, type ArtRender } from "../art";
import { fractionLoops, paintContourMask, type ArtContour } from "../art-contour";
import { desenhoDe, linhasDeLed } from "@/lib/led-linhas";
import { useArtContour } from "./use-art-contour";
import { useAnimate } from "../viewer-hooks";
import { Dimensions, PrintMaterial, backVariant, faceGeometry, fitFlat, makeShape, sizeLabels, useArtImage, useArtTexture, useGeometryCleanup, type ModelProps } from "./shared";

type V2 = [number, number];
type V3 = [number, number, number];

const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ utilidades */

/** Gerador pseudoaleatório com semente: texturas procedurais iguais a cada render. */
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

function smoothstep(a: number, b: number, x: number) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

function mixHex(a: string, b: string, t: number) {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
}

function rgba(hex: string, alpha: number) {
  const c = new THREE.Color(hex).getHex();
  return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${alpha})`;
}

function srgbTexture(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function useDispose(resource: { dispose: () => void } | null | undefined) {
  useEffect(() => () => resource?.dispose(), [resource]);
}

/** Perfil (raio, altura) girado em torno de y; pontos com raio 0 nas pontas fecham a peça. */
function lathe(points: V2[], scale: number, segments = 32) {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r * scale, y * scale)),
    segments,
  );
}

/** Caixa de cantos e arestas arredondados (dimmer, interruptor, presilhas), centrada na origem. */
function softBox(l: number, h: number, d: number, radius: number) {
  const bevel = Math.min(radius, d / 2, h / 2) * 0.5;
  const shape = makeShape("rect", l - bevel * 2, h - bevel * 2, Math.max(radius - bevel, 0.0001));
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(d - bevel * 2, 0.0001), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -(d - bevel * 2) / 2);
  return g;
}

function rectPath(w: number, h: number) {
  const path = new THREE.Path();
  path.moveTo(-w / 2, -h / 2);
  path.lineTo(w / 2, -h / 2);
  path.lineTo(w / 2, h / 2);
  path.lineTo(-w / 2, h / 2);
  path.closePath();
  return path;
}

function ropeGeometry(points: V3[], radius: number, segments = 48, closed = false, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    closed,
    "centripetal",
  );
  return new THREE.TubeGeometry(curve, segments, radius, radial, closed);
}

function pathKey(points: V3[]) {
  return points.map((p) => p.map((v) => v.toFixed(4)).join(",")).join(",");
}

function parsePath(key: string): V3[] {
  const nums = key.split(",").map(Number);
  const points: V3[] = [];
  for (let i = 0; i + 2 < nums.length; i += 3) points.push([nums[i], nums[i + 1], nums[i + 2]]);
  return points;
}

/** Corda ou cabo por uma curva suave; os pontos viram texto para memoizar a geometria por valor. */
function Rope({ points, radius, color = "#1d1d1f", roughness = 0.8, segments = 48, closed = false, children }: { points: V3[]; radius: number; color?: string; roughness?: number; segments?: number; closed?: boolean; children?: ReactNode }) {
  const key = pathKey(points);
  const geometry = useMemo(() => ropeGeometry(parsePath(key), radius, segments, closed), [key, radius, segments, closed]);
  useGeometryCleanup(geometry);
  return <mesh geometry={geometry}>{children ?? <meshStandardMaterial color={color} roughness={roughness} />}</mesh>;
}

/** Veios de madeira no sentido do comprimento (v), para bastões, postes e ponteiras torneadas. */
function paintWood(base: string, seed: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const rand = seeded(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 90; i += 1) {
    const x = rand() * 256;
    const dark = rand() < 0.72;
    ctx.strokeStyle = dark ? `rgba(80,45,20,${0.06 + rand() * 0.2})` : `rgba(255,236,205,${0.05 + rand() * 0.12})`;
    ctx.lineWidth = 0.6 + rand() * 2.4;
    const amp = 1.5 + rand() * 5;
    const freq = 0.004 + rand() * 0.012;
    const phase = rand() * TAU;
    ctx.beginPath();
    for (let y = 0; y <= 512; y += 16) {
      const xx = x + Math.sin(y * freq + phase) * amp;
      if (y === 0) ctx.moveTo(xx, y);
      else ctx.lineTo(xx, y);
    }
    ctx.stroke();
  }
  return canvas;
}

function useWood(base: string, seed: number) {
  const texture = useMemo(() => srgbTexture(paintWood(base, seed)), [base, seed]);
  useDispose(texture);
  return texture;
}

type RodLook = "pvc" | "aluminum" | "wood";

/** Bastão ao longo de x com ponteiras: PVC com ponteira preta, alumínio com tampa ou madeira com pomo torneado. */
function Rod({ length, radius, look, position, wood }: { length: number; radius: number; look: RodLook; position: V3; wood?: THREE.Texture }) {
  const r = radius;
  const capGeometry = useMemo(() => {
    const profile: V2[] =
      look === "wood"
        ? [[0, 0], [0.92, 0], [1.0, 0.35], [0.78, 0.8], [1.4, 1.5], [1.72, 2.35], [1.5, 3.15], [0.85, 3.72], [0, 3.9]]
        : look === "pvc"
          ? [[0, 0], [1.28, 0], [1.4, 0.25], [1.4, 2.1], [1.26, 2.55], [0.7, 2.76], [0, 2.8]]
          : [[0, 0], [1.12, 0], [1.16, 0.18], [1.16, 0.7], [0.92, 0.96], [0, 1.02]];
    return lathe(profile, r, 28);
  }, [r, look]);
  useGeometryCleanup(capGeometry);
  const sink = look === "pvc" ? r * 1.9 : r * 0.1;
  const rodMaterial =
    look === "wood" ? (
      <meshStandardMaterial map={wood ?? null} color={wood ? "#ffffff" : "#c79a64"} roughness={0.62} />
    ) : look === "pvc" ? (
      <meshPhysicalMaterial color="#f6f6f4" roughness={0.32} clearcoat={0.4} clearcoatRoughness={0.2} />
    ) : (
      <meshStandardMaterial color="#d5d8dc" metalness={1} roughness={0.3} />
    );
  const capMaterial =
    look === "wood" ? (
      <meshStandardMaterial map={wood ?? null} color={wood ? "#ead2b4" : "#b98a55"} roughness={0.55} />
    ) : (
      <meshStandardMaterial color={look === "pvc" ? "#18191b" : "#2a2c30"} roughness={0.42} />
    );
  return (
    <group position={position}>
      <mesh rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[r, r, length, 24]} />
        {rodMaterial}
      </mesh>
      <mesh geometry={capGeometry} position-x={length / 2 - sink} rotation-z={-Math.PI / 2}>
        {capMaterial}
      </mesh>
      <mesh geometry={capGeometry} position-x={-length / 2 + sink} rotation-z={Math.PI / 2}>
        {capMaterial}
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ lona e tecido */

/** Forma da lona pendurada: barriga, dobras verticais, bordas enroladas e curvatura do roll-up. */
type Drape = {
  bulge: number;
  folds: number;
  foldAmp: number;
  curl: number;
  bow: number;
  phase: number;
  /** Faixa junto às bordas que fica plana (bainha soldada, ilhós). */
  flat: number;
};

const FLAT: Drape = { bulge: 0, folds: 0, foldAmp: 0, curl: 0, bow: 0, phase: 0, flat: 0 };

function drapeZ(d: Drape, w: number, h: number, x: number, y: number) {
  const u = x / w + 0.5;
  const v = y / h + 0.5;
  const sv = Math.max(Math.sin(Math.PI * v), 0);
  let z = d.bulge * Math.sin(Math.PI * u) * sv;
  if (d.foldAmp) {
    const env = Math.pow(sv, 0.8);
    z += d.foldAmp * env * (Math.sin(TAU * d.folds * u + d.phase) + 0.35 * Math.sin(TAU * d.folds * 2.3 * u + d.phase * 1.7));
  }
  if (d.curl) {
    const e = Math.abs(2 * u - 1);
    z -= d.curl * e * e * e * (1 - v * 0.6);
  }
  if (d.bow) {
    const e = 2 * u - 1;
    z -= d.bow * e * e;
  }
  if (d.flat > 0) {
    const edge = Math.min(x + w / 2, w / 2 - x, y + h / 2, h / 2 - y);
    z *= smoothstep(d.flat, d.flat * 2.4, edge);
  }
  return z;
}

/**
 * Malha da lona: grade deslocada só em z, com UV plano (a arte nunca estica vista de frente).
 * O verso tem o u invertido para a arte não aparecer espelhada por trás.
 */
function sheetGeometry(w: number, h: number, d: Drape, segX: number, segY: number, side: 1 | -1, offset: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const row = segX + 1;
  for (let j = 0; j <= segY; j += 1) {
    const v = j / segY;
    const y = (v - 0.5) * h;
    for (let i = 0; i <= segX; i += 1) {
      const u = i / segX;
      const x = (u - 0.5) * w;
      positions.push(x, y, drapeZ(d, w, h, x, y) - (side < 0 ? offset : 0));
      uvs.push(side > 0 ? u : 1 - u, v);
    }
  }
  for (let j = 0; j < segY; j += 1) {
    for (let i = 0; i < segX; i += 1) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const e = c + 1;
      if (side > 0) indices.push(a, b, e, a, e, c);
      else indices.push(a, e, b, a, c, e);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function PrintedFabric({ map }: { map: THREE.Texture }) {
  return <meshPhysicalMaterial map={map} roughness={0.9} sheen={1} sheenRoughness={0.7} sheenColor="#ffffff" />;
}

type SheetProps = {
  spec: MockupSpec;
  w: number;
  h: number;
  thickness: number;
  drape: Drape;
  front: THREE.Texture;
  back?: THREE.Texture;
  fabric?: boolean;
  detail?: number;
  backColor?: string;
  /** Recorte da peça (lona com corte especial): máscara da frente e a mesma espelhada para o verso. */
  cut?: CutMaps | null;
};

type CutMaps = { front: THREE.Texture; back: THREE.Texture };

/** Lona/tecido de duas faces: frente impressa e verso branco ou impresso (dupla face, 4/1). */
function BannerSheet({ spec, w, h, thickness, drape, front, back, fabric = false, detail = 56, backColor = "#eceef0", cut = null }: SheetProps) {
  const { bulge, folds, foldAmp, curl, bow, phase, flat } = drape;
  const long = Math.max(w, h);
  const segX = Math.max(8, Math.round((detail * w) / long));
  const segY = Math.max(8, Math.round((detail * h) / long));
  const geometries = useMemo(() => {
    const d: Drape = { bulge, folds, foldAmp, curl, bow, phase, flat };
    return { front: sheetGeometry(w, h, d, segX, segY, 1, 0), back: sheetGeometry(w, h, d, segX, segY, -1, thickness) };
  }, [w, h, bulge, folds, foldAmp, curl, bow, phase, flat, segX, segY, thickness]);
  useGeometryCleanup(geometries.front);
  useGeometryCleanup(geometries.back);
  const printedBack = back && spec.back !== "blank";
  // Com recorte, o material é outro programa (alphaMap): a key remonta quando ele entra ou sai.
  const cutKey = cut ? "cut" : "full";
  return (
    <group>
      <mesh geometry={geometries.front}>{fabric ? <PrintedFabric map={front} /> : <PrintMaterial key={cutKey} map={front} spec={spec} alphaMap={cut?.front} />}</mesh>
      <mesh geometry={geometries.back}>
        {printedBack ? (
          fabric ? (
            <PrintedFabric map={back} />
          ) : (
            <PrintMaterial key={cutKey} map={back} spec={spec} alphaMap={cut?.back} />
          )
        ) : fabric ? (
          <meshPhysicalMaterial color="#f3f1ec" roughness={0.95} sheen={0.6} sheenRoughness={0.8} sheenColor="#ffffff" />
        ) : (
          <meshStandardMaterial key={cutKey} color={backColor} roughness={0.78} alphaMap={cut?.back ?? null} alphaTest={cut ? 0.5 : 0} />
        )}
      </mesh>
    </group>
  );
}

function useBannerArt(spec: MockupSpec, art: ArtRender, label: string) {
  const aspect = artAspect(spec);
  const front = useArtTexture(aspect, "front", art, label);
  // Lona dupla face: o verso também leva a arte (4/1 sai em cinza).
  const back = useArtTexture(aspect, backVariant(spec), art, label);
  return { front, back };
}

/** Posições dos ilhós a cada ~50 cm nas bordas, como na lona de verdade. */
function grommetPositions(spec: ModelProps["spec"], w: number, h: number, inset = 0.06): [number, number][] {
  const across = Math.max(2, Math.round(spec.widthCm / 50) + 1);
  const down = Math.max(2, Math.round(spec.heightCm / 50) + 1);
  const points: [number, number][] = [];
  for (let i = 0; i < across; i += 1) {
    const x = -w / 2 + inset + ((w - inset * 2) * i) / (across - 1);
    points.push([x, h / 2 - inset], [x, -h / 2 + inset]);
  }
  for (let j = 1; j < down - 1; j += 1) {
    const y = -h / 2 + inset + ((h - inset * 2) * j) / (down - 1);
    points.push([-w / 2 + inset, y], [w / 2 - inset, y]);
  }
  return points;
}

// Ilhós de latão niquelado (cm): cano que atravessa a lona e aba com a borda repuxada.
const GROMMET_PROFILE: V2[] = [
  [0.6, -0.2],
  [0.6, 0.12],
  [0.68, 0.22],
  [0.9, 0.27],
  [1.12, 0.24],
  [1.26, 0.13],
  [1.28, 0.02],
  [1.18, -0.03],
];

/** Ilhós com arruela no verso e o furo escuro; uma geometria compartilhada por todos. */
function Grommets({ points, gs, thickness }: { points: V3[]; gs: number; thickness: number }) {
  const parts = useMemo(() => {
    const ring = lathe(GROMMET_PROFILE, gs, 28);
    ring.rotateX(Math.PI / 2);
    const hole = new THREE.CircleGeometry(0.6 * gs, 20);
    return { ring, hole };
  }, [gs]);
  useGeometryCleanup(parts.ring);
  useGeometryCleanup(parts.hole);
  const materials = useMemo(
    () => ({
      metal: new THREE.MeshStandardMaterial({ color: "#d4d6d9", metalness: 1, roughness: 0.26, side: THREE.DoubleSide }),
      hole: new THREE.MeshBasicMaterial({ color: "#1a1a1c", side: THREE.DoubleSide }),
    }),
    [],
  );
  useDispose(materials.metal);
  useDispose(materials.hole);
  return (
    <>
      {points.map(([x, y, z]) => (
        <group key={`${x.toFixed(4)}:${y.toFixed(4)}`} position={[x, y, z]}>
          <mesh geometry={parts.ring} material={materials.metal} />
          <mesh geometry={parts.ring} material={materials.metal} position-z={-thickness} rotation-y={Math.PI} />
          {/* O furo fica dentro do cano, à frente da lona (atrás dela seria encoberto pela própria lona). */}
          <mesh geometry={parts.hole} material={materials.hole} position-z={0.05 * gs} />
          <mesh geometry={parts.hole} material={materials.hole} position-z={-thickness - 0.05 * gs} />
        </group>
      ))}
    </>
  );
}

/** Bainha soldada: faixa dobrada no verso e o vinco da solda, de leve, na frente. */
function HemBand({ w, h, hem, thickness }: { w: number; h: number; hem: number; thickness: number }) {
  const depth = Math.max(thickness * 1.2, 0.0012);
  const line = Math.max(hem * 0.06, 0.0015);
  const geometries = useMemo(() => {
    const outer = makeShape("rect", w, h, 0.0001);
    outer.holes.push(rectPath(w - hem * 2, h - hem * 2));
    const band = new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: false });
    const seamShape = makeShape("rect", w - hem * 2 + line * 2, h - hem * 2 + line * 2, 0.0001);
    seamShape.holes.push(rectPath(w - hem * 2, h - hem * 2));
    const seam = new THREE.ShapeGeometry(seamShape);
    return { band, seam };
  }, [w, h, hem, depth, line]);
  useGeometryCleanup(geometries.band);
  useGeometryCleanup(geometries.seam);
  return (
    <group>
      <mesh geometry={geometries.band} position-z={-thickness - depth}>
        <meshStandardMaterial color="#f5f5f3" roughness={0.6} />
      </mesh>
      <mesh geometry={geometries.seam} position-z={0.0006} renderOrder={2}>
        <meshBasicMaterial color="#000000" transparent opacity={0.08} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
    </group>
  );
}

/** Pontos de costura (tracejado) ao longo de x, seguindo a forma do tecido. */
function stitchGeometry(w: number, y: number, d: Drape, h: number, z: number, pitch: number, radius: number) {
  const count = Math.min(420, Math.max(4, Math.floor((w * 0.98) / pitch)));
  const dash = pitch * 0.62;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = -w * 0.49 + (i + 0.5) * ((w * 0.98) / count);
    const g = new THREE.CylinderGeometry(radius, radius, dash, 5, 1);
    g.rotateZ(Math.PI / 2);
    g.translate(x, y, drapeZ(d, w, h, x, y) + z);
    parts.push(g);
  }
  const merged = mergeGeometries(parts) ?? new THREE.BufferGeometry();
  parts.forEach((g) => g.dispose());
  return merged;
}

/** Banner padrão: bastões de PVC com ponteiras e cordão em triângulo (como no balcão). */
function RodBanner({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale: s } = fitFlat(spec, 2.4);
  const { front, back } = useBannerArt(spec, art, label);
  const m = Math.min(w, h);
  const r = Math.max(1.0 * s, 0.014);
  const ext = Math.max(3.2 * s, r * 3.4);
  const thickness = Math.max(0.05 * s, 0.0012);
  const topY = h / 2 + r * 0.95;
  const bottomY = -h / 2 - r * 0.95;
  // Amarração no trecho livre do bastão, entre a lona e a ponteira (que encaixa 1,9 r por fora).
  const tieX = w / 2 + (ext - r * 1.9) * 0.5;
  const cordR = Math.max(0.22 * s, 0.0045);
  const apex = topY + r + Math.min(w * 0.3, 0.75);
  const base = topY + r;
  const drape: Drape = { ...FLAT, bulge: 0.01 * m, folds: 1.15, foldAmp: 0.005 * m, phase: 0.6 };
  const tie = useMemo(() => new THREE.TorusGeometry(r + cordR * 0.8, cordR, 8, 24), [r, cordR]);
  const pocket = useMemo(() => new THREE.CylinderGeometry(r * 1.12, r * 1.12, w, 32), [r, w]);
  useGeometryCleanup(tie);
  useGeometryCleanup(pocket);
  const cord: V3[] = [
    [-tieX, base, 0],
    [-tieX * 0.5, (base + apex) / 2, 0],
    [-0.025, apex - 0.012, 0],
    [0, apex, 0],
    [0.025, apex - 0.012, 0],
    [tieX * 0.5, (base + apex) / 2, 0],
    [tieX, base, 0],
  ];
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation-y={0.28}>
      <BannerSheet spec={spec} w={w} h={h} thickness={thickness} drape={drape} front={front} back={back} />
      {[topY, bottomY].map((y) => (
        <group key={y}>
          <mesh geometry={pocket} position-y={y} rotation-z={Math.PI / 2}>
            <meshStandardMaterial color="#f4f4f2" roughness={0.55} />
          </mesh>
          <Rod length={w + ext * 2} radius={r} look="pvc" position={[0, y, 0]} />
        </group>
      ))}
      {[-tieX, tieX].map((x) => (
        <mesh key={x} geometry={tie} position={[x, topY, 0]} rotation-y={Math.PI / 2}>
          <meshStandardMaterial color="#f1efe8" roughness={0.85} />
        </mesh>
      ))}
      <Rope points={cord} radius={cordR} color="#f1efe8" roughness={0.85} segments={80} />
      {showDims && <Dimensions w={w} h={h} z={r * 1.3 + 0.02} labelW={lw} labelH={lh} />}
    </group>
  );
}

/** Lona com bainha soldada e ilhós, pendurada por laços de corda num tubo de alumínio. */
function GrommetBanner({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale: s } = fitFlat(spec, 2.4);
  const { front, back } = useBannerArt(spec, art, label);
  const m = Math.min(w, h);
  const gs = Math.max(s, 0.008);
  const hem = 3.4 * gs;
  const inset = 1.7 * gs;
  const thickness = Math.max(0.05 * s, 0.0012);
  const drape: Drape = { ...FLAT, bulge: 0.006 * m, folds: 1.3, foldAmp: 0.006 * m, phase: 0.8, flat: hem * 1.3 };
  const points: V3[] = grommetPositions(spec, w, h, inset).map(([x, y]) => [x, y, drapeZ(drape, w, h, x, y)]);
  const topY = h / 2 - inset;
  const barR = Math.max(1.3 * s, 0.016);
  const barY = h / 2 + Math.max(9 * s, 0.13);
  const cordR = Math.max(0.25 * s, 0.0045);
  const holeR = 0.6 * gs;
  const loop = useMemo(() => {
    const c = cordR * 1.4;
    const mid = (topY + barY) / 2;
    return ropeGeometry(
      [
        [0, topY - holeR * 0.45, -thickness / 2],
        [0, topY + holeR * 1.1, c * 2.2],
        [0, mid, barR * 0.55 + c],
        [0, barY, barR + c],
        [0, barY + barR + c, 0],
        [0, barY, -(barR + c)],
        [0, mid, -(barR * 0.55 + c)],
        [0, topY + holeR * 1.1, -c * 2.2 - thickness],
      ],
      cordR,
      64,
      true,
    );
  }, [topY, barY, barR, cordR, holeR, thickness]);
  useGeometryCleanup(loop);
  const tops = points.filter(([, y]) => Math.abs(y - topY) < 1e-6);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation-y={0.28}>
      <BannerSheet spec={spec} w={w} h={h} thickness={thickness} drape={drape} front={front} back={back} />
      <HemBand w={w} h={h} hem={hem} thickness={thickness} />
      <Grommets points={points} gs={gs} thickness={thickness} />
      <Rod length={w + Math.max(12 * s, 0.16)} radius={barR} look="aluminum" position={[0, barY, 0]} />
      {tops.map(([x]) => (
        <mesh key={x.toFixed(4)} geometry={loop} position-x={x}>
          <meshStandardMaterial color="#1d1d1f" roughness={0.75} />
        </mesh>
      ))}
      {showDims && <Dimensions w={w} h={h} z={barR + 0.03} labelW={lw} labelH={lh} />}
    </group>
  );
}

/** Faixa: lona larga com ilhós, amarrada com corda em dois mourões de madeira. */
function StripBanner({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale: s } = fitFlat(spec, 2.4);
  const { front, back } = useBannerArt(spec, art, label);
  const wood = useWood("#9a7550", 11);
  const m = Math.min(w, h);
  const gs = Math.max(s, 0.008);
  const hem = 3.4 * gs;
  const inset = 1.7 * gs;
  const thickness = Math.max(0.05 * s, 0.0012);
  const drape: Drape = { ...FLAT, bulge: 0.004 * m, folds: 2.2, foldAmp: 0.004 * m, phase: 0.3, flat: hem * 1.3 };
  const points: V3[] = grommetPositions(spec, w, h, inset).map(([x, y]) => [x, y, drapeZ(drape, w, h, x, y)]);
  const postR = Math.max(4 * s, 0.03);
  const postX = w / 2 + Math.max(14 * s, 0.12) + postR;
  const lift = Math.max(h * 0.6, 0.3);
  const postBottom = -h / 2 - lift;
  const postTop = h / 2 + Math.max(h * 0.12, postR * 2);
  const cordR = Math.max(0.3 * s, 0.005);
  const holeR = 0.6 * gs;
  const sideX = w / 2 - inset;
  const ties = points.filter(([x]) => Math.abs(Math.abs(x) - sideX) < 1e-6);
  const wrap = useMemo(() => new THREE.TorusGeometry(postR + cordR * 0.7, cordR, 8, 28), [postR, cordR]);
  const postCap = useMemo(() => lathe([[0, 0], [1, 0], [1, 0.12], [0.86, 0.3], [0, 0.34]], postR, 28), [postR]);
  useGeometryCleanup(wrap);
  useGeometryCleanup(postCap);
  const postH = postTop - postBottom;
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation-y={0.22}>
      <BannerSheet spec={spec} w={w} h={h} thickness={thickness} drape={drape} front={front} back={back} />
      <HemBand w={w} h={h} hem={hem} thickness={thickness} />
      <Grommets points={points} gs={gs} thickness={thickness} />
      {[-1, 1].map((side) => (
        <group key={side} position-x={side * postX}>
          <mesh position-y={postBottom + postH / 2}>
            <cylinderGeometry args={[postR, postR * 1.04, postH, 28]} />
            <meshStandardMaterial map={wood} roughness={0.7} />
          </mesh>
          <mesh geometry={postCap} position-y={postTop}>
            <meshStandardMaterial map={wood} color="#d9c2a3" roughness={0.65} />
          </mesh>
        </group>
      ))}
      {ties.map(([x, y]) => {
        const side = Math.sign(x);
        const target = side * (postX - postR);
        return (
          <group key={`${x.toFixed(4)}:${y.toFixed(4)}`}>
            <Rope
              points={[
                [x - side * holeR * 0.3, y, -thickness / 2],
                [x + side * holeR * 1.6, y + cordR, cordR * 2],
                [(x + target) / 2, y - Math.abs(target - x) * 0.04, cordR],
                [target, y + cordR * 2, 0],
              ]}
              radius={cordR}
              color="#e8dcc2"
              roughness={0.9}
            />
            <mesh geometry={wrap} position={[side * postX, y + cordR * 1.4, 0]} rotation-x={Math.PI / 2}>
              <meshStandardMaterial color="#e8dcc2" roughness={0.9} />
            </mesh>
            <mesh geometry={wrap} position={[side * postX, y - cordR * 1.4, 0]} rotation-x={Math.PI / 2}>
              <meshStandardMaterial color="#e8dcc2" roughness={0.9} />
            </mesh>
          </group>
        );
      })}
      {showDims && <Dimensions w={w} h={h} z={0.03} labelW={lw} labelH={lh} />}
    </group>
  );
}

/** Banner de tecido: bolsões costurados com bastões de madeira torneada, dobras macias e cordão de sisal. */
function FabricBanner({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale: s } = fitFlat(spec, 2.4);
  const { front, back } = useBannerArt(spec, art, label);
  const wood = useWood("#c9a274", 5);
  const m = Math.min(w, h);
  const r = Math.max(1.0 * s, 0.014);
  const ext = Math.max(1.6 * s, r * 1.6);
  const thickness = Math.max(0.06 * s, 0.0014);
  const folds = THREE.MathUtils.clamp((w / h) * 3, 2.5, 7);
  const drape: Drape = { ...FLAT, folds, foldAmp: 0.014 * m, phase: 1.1 };
  const topY = h / 2 + r * 1.05;
  const bottomY = -h / 2 - r * 1.05;
  const tieX = w / 2 + ext * 0.4;
  const cordR = Math.max(0.3 * s, 0.005);
  const base = topY + r;
  const apex = base + Math.min(w * 0.28, 0.7);
  const stitchY = h / 2 - Math.max(1.4 * s, r * 1.2);
  const stitchR = Math.max(0.07 * s, 0.0022);
  const pitch = Math.max(0.55 * s, stitchR * 7);
  const { bulge, foldAmp, curl, bow, phase, flat } = drape;
  const parts = useMemo(() => {
    const d: Drape = { bulge, folds, foldAmp, curl, bow, phase, flat };
    const pocket = new THREE.CylinderGeometry(r * 1.2, r * 1.2, w, 32);
    pocket.rotateZ(Math.PI / 2);
    // Pesponto do bolsão: atravessa o tecido, aparece na frente e no verso.
    const seam = (z: number) => {
      const rows = [stitchGeometry(w, stitchY, d, h, z, pitch, stitchR), stitchGeometry(w, -stitchY, d, h, z, pitch, stitchR)];
      const merged = mergeGeometries(rows) ?? new THREE.BufferGeometry();
      rows.forEach((g) => g.dispose());
      return merged;
    };
    return { pocket, back: seam(-thickness - stitchR * 0.6), front: seam(stitchR * 0.6) };
  }, [w, h, r, stitchY, thickness, stitchR, pitch, bulge, folds, foldAmp, curl, bow, phase, flat]);
  useGeometryCleanup(parts.pocket);
  useGeometryCleanup(parts.back);
  useGeometryCleanup(parts.front);
  const cord: V3[] = [
    [-tieX, base, 0],
    [-tieX * 0.5, (base + apex) / 2, 0],
    [-0.025, apex - 0.012, 0],
    [0, apex, 0],
    [0.025, apex - 0.012, 0],
    [tieX * 0.5, (base + apex) / 2, 0],
    [tieX, base, 0],
  ];
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation-y={0.28}>
      <BannerSheet spec={spec} w={w} h={h} thickness={thickness} drape={drape} front={front} back={back} fabric detail={72} />
      {[topY, bottomY].map((y) => (
        <group key={y}>
          <mesh geometry={parts.pocket} position-y={y}>
            <meshPhysicalMaterial color="#f7f5f0" roughness={0.92} sheen={1} sheenRoughness={0.7} sheenColor="#ffffff" />
          </mesh>
          <Rod length={w + ext * 2} radius={r} look="wood" wood={wood} position={[0, y, 0]} />
        </group>
      ))}
      <mesh geometry={parts.back}>
        <meshStandardMaterial color="#d9d6cf" roughness={0.8} />
      </mesh>
      <mesh geometry={parts.front}>
        <meshStandardMaterial color="#efece6" roughness={0.75} />
      </mesh>
      {[-tieX, tieX].map((x) => (
        <mesh key={x} position={[x, topY, 0]} rotation-y={Math.PI / 2}>
          <torusGeometry args={[r + cordR * 0.8, cordR, 8, 24]} />
          <meshStandardMaterial color="#b89a6a" roughness={0.95} />
        </mesh>
      ))}
      <Rope points={cord} radius={cordR} color="#b89a6a" roughness={0.95} segments={80} />
      {showDims && <Dimensions w={w} h={h} z={r * 1.3 + 0.02} labelW={lw} labelH={lh} />}
    </group>
  );
}

/**
 * Máscaras do recorte a partir do contorno (frente e verso espelhado, porque o UV do verso é invertido).
 * null sem contorno ou com arte sem transparência (corte reto, na medida).
 */
function useCutMaps(contour: ArtContour | null): CutMaps | null {
  const maps = useMemo(() => {
    if (!contour || contour.cheio) return null;
    const canvas = paintContourMask(contour);
    const front = new THREE.CanvasTexture(canvas);
    const back = new THREE.CanvasTexture(canvas);
    back.repeat.x = -1;
    back.offset.x = 1;
    return { front, back };
  }, [contour]);
  useEffect(
    () => () => {
      maps?.front.dispose();
      maps?.back.dispose();
    },
    [maps],
  );
  return maps;
}

/**
 * Lona sem acabamento: folha crua com as pontas enroladas, presa por dois prendedores no cordão. Com corte especial
 * (spec.contour "faca"), a folha sai recortada no contorno da arte, a FACA_MARGEM_CM do desenho, solta (sem prendedores).
 */
function RawBanner({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale: s } = fitFlat(spec, 2.4);
  const faca = spec.contour === "faca";
  // A arte chega sem fundo (o contorno sai do desenho); impressa, fica sobre o branco da lona.
  const printed = useMemo(() => (faca ? { ...art, background: spec.baseColor } : art), [faca, art, spec.baseColor]);
  const { front, back } = useBannerArt(spec, printed, label);
  const contour = useArtContour(artAspect(spec), art, label, spec.widthCm, FACA_MARGEM_CM, 0, faca);
  const cut = useCutMaps(contour);
  const m = Math.min(w, h);
  const gs = Math.max(s, 0.008);
  const thickness = Math.max(0.05 * s, 0.0012);
  const drape: Drape = { ...FLAT, curl: 0.05 * m, folds: 1.1, foldAmp: 0.006 * m, phase: 2.1 };
  const clipX = w / 2 - Math.max(w * 0.1, 3 * gs);
  const clipW = 3.2 * gs;
  const handleR = 1.1 * gs;
  const parts = useMemo(() => {
    const profile = new THREE.Shape();
    profile.moveTo(-0.16 * gs, -1.9 * gs);
    profile.lineTo(0.16 * gs, -1.9 * gs);
    profile.lineTo(0.72 * gs, 0.15 * gs);
    profile.quadraticCurveTo(0, 0.95 * gs, -0.72 * gs, 0.15 * gs);
    profile.closePath();
    const bev = 0.08 * gs;
    const body = new THREE.ExtrudeGeometry(profile, { depth: clipW - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 8 });
    body.rotateY(-Math.PI / 2);
    body.translate((clipW - bev * 2) / 2, 0, 0);
    const handle = new THREE.TorusGeometry(handleR, 0.09 * gs, 8, 24, Math.PI);
    return { body, handle };
  }, [gs, clipW, handleR]);
  useGeometryCleanup(parts.body);
  useGeometryCleanup(parts.handle);
  const clipTop = h / 2 + 0.6 * gs;
  const cordY = clipTop + handleR * 0.95;
  const apex = cordY + Math.min(w * 0.26, 0.65);
  const cordR = Math.max(0.2 * s, 0.004);
  const clips = [-clipX, clipX].map((x) => ({ x, z: drapeZ(drape, w, h, x, h / 2) }));
  const cord: V3[] = [
    [-clipX, cordY, clips[0].z],
    [-clipX * 0.5, (cordY + apex) / 2, 0],
    [-0.025, apex - 0.012, 0],
    [0, apex, 0],
    [0.025, apex - 0.012, 0],
    [clipX * 0.5, (cordY + apex) / 2, 0],
    [clipX, cordY, clips[1].z],
  ];
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation-y={0.28}>
      <BannerSheet spec={spec} w={w} h={h} thickness={thickness} drape={drape} front={front} back={back} detail={64} cut={cut} />
      {!cut &&
        clips.map(({ x, z }) => (
        <group key={x} position={[x, h / 2 - 0.35 * gs, z - thickness / 2]}>
          <mesh geometry={parts.body}>
            <meshPhysicalMaterial color="#151517" metalness={0.5} roughness={0.32} clearcoat={0.6} />
          </mesh>
          <mesh geometry={parts.handle} position={[0, 0.85 * gs, 0.25 * gs]} rotation-x={-0.35}>
            <meshStandardMaterial color="#d6d8db" metalness={1} roughness={0.22} />
          </mesh>
          <mesh geometry={parts.handle} position={[0, 0.85 * gs, -0.25 * gs]} rotation-x={0.35}>
            <meshStandardMaterial color="#d6d8db" metalness={1} roughness={0.22} />
          </mesh>
        </group>
      ))}
      {!cut && <Rope points={cord} radius={cordR} color="#1d1d1f" segments={80} />}
      {showDims && <Dimensions w={w} h={h} z={0.03} labelW={lw} labelH={lh} />}
    </group>
  );
}

/**
 * Banner e lona em escala real. Padrão: bastões de PVC com ponteiras e cordão; com ilhós: bainha
 * soldada e laços de corda num tubo; {strip} faixa amarrada em mourões; {mini} suporte X de mesa;
 * {fabric} tecido com bastões de madeira e dobras; {raw} lona crua com prendedores. Dupla face mostra a arte no verso.
 */
export function BannerModel(props: ModelProps) {
  const { variant, grommets } = props.spec;
  // O mini banner é o mesmo banner de tubete e corda, só menor (pedido da Padrão em 25/10/2026).
  if (variant === "strip") return <StripBanner {...props} />;
  if (variant === "fabric") return <FabricBanner {...props} />;
  // Lona sem impressão (vendida crua) é a folha solta com prendedores; a arte segue como simulação.
  if (variant === "raw" || props.spec.blank) return <RawBanner {...props} />;
  if (grommets) return <GrommetBanner {...props} />;
  return <RodBanner {...props} />;
}

/* ------------------------------------------------------------------ LED neon */

const GLOW_PAD = 1.5;
const TUBE_SHADES = [0.1, 0.18, 0.3, 0.48, 0.72, 1].map((v) => new THREE.Color(v, v, v));
const HALO_OPACITY = 0.7;
const SPILL_OPACITY = 0.7;
const WALL_LIGHT = 2.4;
const DEFAULT_LEDS = ["#ff4fd8", "#38e1ff"];

function ledColorsOf(spec: MockupSpec, art: ArtRender): string[] {
  const list = art.ledColors?.length ? art.ledColors : spec.ledColors;
  return list.length ? list : DEFAULT_LEDS;
}

/** Medidas da cena do neon: parede atrás dos espaçadores, piso onde o dimmer descansa. */
function neonStage(w: number, h: number, s: number, tB: number) {
  const wallZ = -tB - 2.5 * s;
  const drop = THREE.MathUtils.clamp(h * 0.4, 0.3, 0.55);
  const floorY = -h / 2 - drop;
  const dimmer = { l: 9 * s, h: 2.4 * s, d: 4.2 * s };
  const dimmerPos: V3 = [w * 0.22, floorY + dimmer.h / 2, wallZ + 0.07 + dimmer.d / 2];
  return { wallZ, floorY, dimmer, dimmerPos, tubeDepth: 1.0 * s };
}

type NeonStage = ReturnType<typeof neonStage>;

/** Contorno do acrílico (normalizado -0,5…0,5, y para cima), furos dos espaçadores e saída do cabo. */
type Board = { loops: V2[][]; anchors: V2[]; exit: V2 };

/** Canvas na proporção pedida sem o mínimo de 64 px de canvasFor (degraus pequenos do desfoque). */
function sizedCanvas(aspect: number, longSide: number) {
  const canvas = document.createElement("canvas");
  const safe = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  canvas.width = Math.max(4, Math.round(safe >= 1 ? longSide : longSide * safe));
  canvas.height = Math.max(4, Math.round(safe >= 1 ? longSide / safe : longSide));
  return canvas;
}

/**
 * Canvas cujo contexto 2D ignora sombra: o mesmo paintArt("neon") das miniaturas de estilo sai só com
 * os tubos nítidos (cor + núcleo branco), sem o brilho pintado. Assim letra, espessura do tubo, extras
 * do estilo, cor por palavra e subtexto são idênticos aos da prévia 2D.
 */
function shadowlessCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.shadowBlur = 0;
  ctx.shadowColor = "rgba(0,0,0,0)";
  const context = new Proxy(ctx, {
    get: (target, key) => {
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set: (target, key, value) => (key === "shadowBlur" || key === "shadowColor" ? true : Reflect.set(target, key, value, target)),
  });
  return new Proxy(canvas, {
    get: (target, key) => {
      if (key === "getContext") return () => context;
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** Retângulo central (sem a margem GLOW_PAD) de um canvas de halo. */
function padInset(canvas: HTMLCanvasElement): [number, number, number, number] {
  const iw = canvas.width / GLOW_PAD;
  const ih = canvas.height / GLOW_PAD;
  return [(canvas.width - iw) / 2, (canvas.height - ih) / 2, iw, ih];
}

/**
 * Halo com margem (GLOW_PAD), sem ctx.filter (que nem todo navegador tem): a arte com brilho é reduzida
 * em degraus e ampliada de volta (o filtro bilinear desfoca). `mid` termina com o bloom largo, usado no
 * reflexo da parede; `glow` soma o bloom e o brilho próximo, para o halo sobre os tubos.
 */
function paintNeonGlow(glow: HTMLCanvasElement, soft: HTMLCanvasElement, mid: HTMLCanvasElement, tiny: HTMLCanvasElement) {
  const ctx = glow.getContext("2d");
  const mctx = mid.getContext("2d");
  const tctx = tiny.getContext("2d");
  if (!ctx || !mctx || !tctx) return;
  for (const c of [ctx, mctx, tctx]) {
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
  }
  mctx.clearRect(0, 0, mid.width, mid.height);
  mctx.drawImage(soft, ...padInset(mid));
  tctx.clearRect(0, 0, tiny.width, tiny.height);
  tctx.drawImage(mid, 0, 0, tiny.width, tiny.height);
  mctx.clearRect(0, 0, mid.width, mid.height);
  mctx.drawImage(tiny, 0, 0, mid.width, mid.height);
  ctx.clearRect(0, 0, glow.width, glow.height);
  ctx.drawImage(mid, 0, 0, glow.width, glow.height);
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.75;
  ctx.drawImage(soft, ...padInset(glow));
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

const RING8: V2[] = [
  [1, 0],
  [0.71, 0.71],
  [0, 1],
  [-0.71, 0.71],
  [-1, 0],
  [-0.71, -0.71],
  [0, -1],
  [0.71, -0.71],
];

/**
 * Acrílico recortado em volta do desenho: os tubos nítidos viram máscara, o campo de distância engrossa
 * o desenho (borda de ~2,6 cm), o contorno sai por marching squares e os furos dos espaçadores ficam nos
 * cantos, longe dos tubos.
 */
function traceBoard(canvas: HTMLCanvasElement, tubes: HTMLCanvasElement, widthCm: number, heightCm: number): Board | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const { width: mW, height: mH } = canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, mW, mH);
  ctx.drawImage(tubes, 0, 0, mW, mH);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, mW, mH).data;
  } catch {
    // Imagem de outra origem (canvas "contaminado"): fica o acrílico retangular.
    return null;
  }
  const dist = distanceField(data, mW, mH);
  if (!dist) return null;
  const pxPerCm = (mW / Math.max(widthCm, 1) + mH / Math.max(heightCm, 1)) / 2;
  const grow = THREE.MathUtils.clamp(2.6 * pxPerCm, 1.5, Math.min(mW, mH) * 0.14);
  const clearance = Math.max(1.6 * pxPerCm, 1);
  const inside = new Uint8Array(mW * mH);
  for (let i = 0; i < inside.length; i += 1) inside[i] = dist[i] <= grow ? 1 : 0;

  const raw = traceLoops(inside, mW, mH).filter((loop) => Math.abs(polygonArea(loop)) >= 6);
  // Só os contornos de fora: furos e ilhas dentro de furos ficam cobertos pelo acrílico inteiro.
  const outer = raw.filter((loop, i) => raw.every((other, j) => j === i || !insidePolygon(loop[0], other)));
  const toNormal = ([x, y]: V2): V2 => [(x + 0.5) / mW - 0.5, 0.5 - (y + 0.5) / mH];
  const loops = outer.map((loop) => smoothLoop(loop, 1.1).map(toNormal)).filter((loop) => loop.length >= 6);
  if (!loops.length) return null;

  // Espaçadores: pontos com acrílico em volta e sem tubo perto, o mais perto possível dos cantos.
  const isIn = (x: number, y: number) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    return xi >= 0 && yi >= 0 && xi < mW && yi < mH && inside[yi * mW + xi] === 1;
  };
  const rd = Math.max(1.5, 1.25 * pxPerCm);
  let minX = mW;
  let maxX = 0;
  let minY = mH;
  let maxY = 0;
  const deep: V2[] = [];
  for (let y = 0; y < mH; y += 1) {
    for (let x = 0; x < mW; x += 1) {
      if (!inside[y * mW + x]) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      if (dist[y * mW + x] <= clearance) continue;
      if (RING8.every(([dx, dy]) => isIn(x + dx * rd, y + dy * rd))) deep.push([x, y]);
    }
  }
  const separation = Math.max(4, 0.2 * Math.min(mW, mH));
  const picks: V2[] = [];
  for (const [cx, cy] of [
    [minX, minY],
    [maxX, minY],
    [minX, maxY],
    [maxX, maxY],
  ] as V2[]) {
    let best: V2 | null = null;
    let bestD = Infinity;
    for (const p of deep) {
      const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    const chosen = best;
    if (chosen && picks.every((p) => Math.hypot(p[0] - chosen[0], p[1] - chosen[1]) > separation)) picks.push(chosen);
  }

  // Saída do cabo: ponto mais baixo do acrílico, de preferência à direita do centro.
  let exit: V2 = [Math.round(mW / 2), maxY];
  let lowest = -1;
  for (const [from, to] of [
    [Math.floor(mW * 0.55), Math.ceil(mW * 0.85)],
    [0, mW - 1],
  ]) {
    for (let x = from; x <= Math.min(to, mW - 1); x += 1) {
      for (let y = mH - 1; y > lowest; y -= 1) {
        if (inside[y * mW + x]) {
          lowest = y;
          exit = [x, y];
          break;
        }
      }
    }
    if (lowest >= 0) break;
  }

  return { loops, anchors: picks.map(toNormal), exit: toNormal(exit) };
}

/** Acrílico retangular quando o recorte não sai (canvas indisponível ou imagem de outra origem). */
const RECT_BOARD: Board = {
  loops: [
    makeShape("rect", 0.96, 0.96, 0.05)
      .getPoints(6)
      .map((p) => [p.x, p.y] as V2),
  ],
  anchors: [
    [-0.43, 0.4],
    [0.43, 0.4],
    [-0.43, -0.4],
    [0.43, -0.4],
  ],
  exit: [0.2, -0.48],
};

type NeonTarget = {
  tube: HTMLCanvasElement;
  tubeView: HTMLCanvasElement;
  soft: HTMLCanvasElement;
  glow: HTMLCanvasElement;
  mid: HTMLCanvasElement;
  tiny: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  tubeMap: THREE.CanvasTexture;
  glowMap: THREE.CanvasTexture;
  spillMap: THREE.CanvasTexture;
};

/**
 * Arte do neon a partir do mesmo paintArt("neon") da prévia 2D (estilo, letra, subtexto, cores do LED):
 * tubos nítidos (sem sombra), halo desfocado, bloom largo para a parede e o contorno do acrílico.
 * Repinta no próximo quadro (como useArtTexture) e quando a fonte carrega.
 */
function useNeonArt(aspect: number, art: ArtRender, label: string, widthCm: number, heightCm: number) {
  const image = useArtImage(art.src);
  const invalidate = useThree((state) => state.invalidate);
  const target = useMemo<NeonTarget>(() => {
    const tube = canvasFor(aspect, 1024);
    const soft = canvasFor(aspect, 512);
    const glow = canvasFor(aspect, 384);
    const mid = sizedCanvas(aspect, 128);
    const tiny = sizedCanvas(aspect, 32);
    const mask = canvasFor(aspect, 256);
    return { tube, tubeView: shadowlessCanvas(tube), soft, glow, mid, tiny, mask, tubeMap: srgbTexture(tube), glowMap: srgbTexture(glow), spillMap: srgbTexture(mid) };
  }, [aspect]);
  const [board, setBoard] = useState<Board | null>(null);
  const [fontsLoaded, setFontsLoaded] = useState("");
  const fontKey = `${art.font}:${art.text}:${art.style ?? ""}:${art.subtext ?? ""}`;
  useEffect(() => {
    let alive = true;
    loadArtFont(art).then(() => alive && setFontsLoaded(fontKey));
    return () => {
      alive = false;
    };
  }, [art, fontKey]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      paintArt(target.tubeView, "neon", art, image, label);
      paintArt(target.soft, "neon", art, image, label);
      paintNeonGlow(target.glow, target.soft, target.mid, target.tiny);
      target.tubeMap.needsUpdate = true;
      target.glowMap.needsUpdate = true;
      target.spillMap.needsUpdate = true;
      setBoard(traceBoard(target.mask, target.tube, widthCm, heightCm) ?? RECT_BOARD);
      invalidate();
    });
    return () => cancelAnimationFrame(frame);
  }, [target, art, image, label, widthCm, heightCm, fontsLoaded, invalidate]);
  useEffect(
    () => () => {
      target.tubeMap.dispose();
      target.glowMap.dispose();
      target.spillMap.dispose();
    },
    [target],
  );
  return { tube: target.tubeMap, glow: target.glowMap, spill: target.spillMap, board };
}

/** Parede de tijolinho pintado de grafite, em escala real, que some nas bordas (fundo da cena escura). */
function paintBrickWall(widthCm: number, heightCm: number) {
  const canvas = document.createElement("canvas");
  const W = 1024;
  const H = THREE.MathUtils.clamp(Math.round((W * heightCm) / Math.max(widthCm, 1)), 128, 2048);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const rand = seeded(7);
  const px = W / Math.max(widthCm, 1);
  const bw = 21 * px;
  const bh = 5.5 * px;
  const mortar = Math.max(1, 1.0 * px);
  ctx.fillStyle = "#0e0f12";
  ctx.fillRect(0, 0, W, H);
  let row = 0;
  for (let y = H; y > -bh; y -= bh + mortar, row += 1) {
    for (let x = row % 2 ? -bw / 2 : 0; x < W; x += bw + mortar) {
      const tone = 25 + rand() * 15;
      const warm = rand() * 4;
      ctx.fillStyle = `rgb(${Math.round(tone + warm)},${Math.round(tone)},${Math.round(tone + 3)})`;
      ctx.beginPath();
      ctx.roundRect(x + mortar / 2, y - bh, bw, bh, Math.min(bh * 0.18, 4));
      ctx.fill();
    }
  }
  const specks = Math.min(16000, Math.round((W * H) / 80));
  for (let i = 0; i < specks; i += 1) {
    ctx.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${0.12 + rand() * 0.2})` : `rgba(255,255,255,${0.03 + rand() * 0.05})`;
    ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 2, 1 + rand() * 2);
  }
  ctx.globalCompositeOperation = "destination-in";
  const across = ctx.createLinearGradient(0, 0, W, 0);
  across.addColorStop(0, "rgba(0,0,0,0)");
  across.addColorStop(0.24, "rgba(0,0,0,1)");
  across.addColorStop(0.76, "rgba(0,0,0,1)");
  across.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, W, H);
  const down = ctx.createLinearGradient(0, 0, 0, H);
  down.addColorStop(0, "rgba(0,0,0,0)");
  down.addColorStop(0.32, "rgba(0,0,0,1)");
  down.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = down;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}

/** Luz colorida espalhada na parede: um foco suave por cor de LED. */
function paintWash(colors: string[]) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.globalCompositeOperation = "lighter";
  colors.slice(0, 2).forEach((color, i, list) => {
    const cx = list.length > 1 ? (i ? 0.64 : 0.36) * 256 : 128;
    const gradient = ctx.createRadialGradient(cx, 128, 0, cx, 128, 128);
    gradient.addColorStop(0, rgba(color, 0.85));
    gradient.addColorStop(0.45, rgba(color, 0.3));
    gradient.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
  });
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}

/** Brilho que pulsa de leve e, raramente, pisca (fonte de LED real). */
function neonPulse(t: number) {
  let k = 0.95 + 0.05 * Math.sin(t * 1.7) * Math.sin(t * 0.63 + 1.3);
  const n = Math.sin(Math.floor(t * 10) * 12.9898) * 43758.5453;
  if (n - Math.floor(n) > 0.985) k *= 0.78;
  return k;
}

/** Parede escura com tijolinho, o banho de cor e o reflexo do desenho logo atrás dos tubos. */
function NeonWall({ w, h, s, stage, colorKey, glow, spillRef }: { w: number; h: number; s: number; stage: NeonStage; colorKey: string; glow: THREE.Texture; spillRef: RefObject<THREE.MeshBasicMaterial | null> }) {
  const { wallZ, floorY } = stage;
  const top = h / 2 + Math.max(1.1, h * 0.55);
  const wallW = w + Math.max(3, w * 1.2);
  const wallH = top - floorY;
  const wallWcm = Math.round(wallW / s);
  const wallHcm = Math.round(wallH / s);
  const wall = useMemo(() => srgbTexture(paintBrickWall(wallWcm, wallHcm)), [wallWcm, wallHcm]);
  const wash = useMemo(() => srgbTexture(paintWash(colorKey.split(","))), [colorKey]);
  useDispose(wall);
  useDispose(wash);
  const washH = 2 * Math.min(h * 1.15, -floorY);
  return (
    <group userData={{ noBounds: true }}>
      <mesh position={[0, (top + floorY) / 2, wallZ]} renderOrder={-3}>
        <planeGeometry args={[wallW, wallH]} />
        <meshStandardMaterial map={wall} bumpMap={wall} bumpScale={2.5} roughness={0.9} transparent depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, wallZ + 0.002]} renderOrder={-2}>
        <planeGeometry args={[w * 2.1, washH]} />
        <meshBasicMaterial map={wash} transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, wallZ + 0.004]} renderOrder={-1}>
        <planeGeometry args={[w * GLOW_PAD * 1.06, h * GLOW_PAD * 1.06]} />
        <meshBasicMaterial ref={spillRef} map={glow} transparent opacity={SPILL_OPACITY} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Acrílico cristal: faces quase invisíveis e bordas que conduzem a luz do LED. */
function NeonAcrylic({ tint }: { tint: string }) {
  return (
    <>
      <meshPhysicalMaterial attach="material-0" color="#f2fbff" transparent opacity={0.1} roughness={0.04} clearcoat={1} clearcoatRoughness={0.03} depthWrite={false} />
      <meshPhysicalMaterial attach="material-1" color={mixHex(tint, "#ffffff", 0.5)} emissive={tint} emissiveIntensity={0.5} transparent opacity={0.7} roughness={0.1} clearcoat={1} depthWrite={false} toneMapped={false} />
    </>
  );
}

/** Espaçador cromado (cm): bucha da parede ao acrílico, parafuso e tampa na frente. */
function useStandoff(s: number, tB: number) {
  const geometry = useMemo(() => {
    const L = 2.5;
    const t = tB / s;
    const g = lathe(
      [
        [0, 0],
        [0.75, 0],
        [0.8, 0.08],
        [0.8, L - 0.08],
        [0.42, L],
        [0.42, L + t],
        [0.92, L + t],
        [1.0, L + t + 0.12],
        [1.0, L + t + 0.95],
        [0.9, L + t + 1.12],
        [0.5, L + t + 1.2],
        [0, L + t + 1.22],
      ],
      s,
      32,
    );
    g.rotateX(Math.PI / 2);
    return g;
  }, [s, tB]);
  useGeometryCleanup(geometry);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: "#e6e8ea", metalness: 1, roughness: 0.16 }), []);
  useDispose(material);
  return { geometry, material };
}

/** Cabo cristal que desce pela parede até o dimmer no chão, e o cabo preto da fonte. */
function NeonPower({ stage, exit, s, tB, led, cable }: { stage: NeonStage; exit: V2; s: number; tB: number; led: string; cable: boolean }) {
  const { wallZ, floorY, dimmer, dimmerPos } = stage;
  const cr = Math.max(0.28 * s, 0.0045);
  const [dx, dy, dz] = dimmerPos;
  const left = dx - dimmer.l / 2;
  const right = dx + dimmer.l / 2;
  const [ex, ey] = exit;
  const clear: V3[] = [
    [ex, ey + 1.2 * s, -tB * 0.5],
    [ex + 0.004, ey - 0.03, (wallZ - tB) * 0.5],
    [ex + 0.01, ey - 0.1, wallZ + cr * 1.8],
    [ex + (left - ex) * 0.35, floorY + 0.09, wallZ + cr * 1.8],
    [ex + (left - ex) * 0.75, floorY + cr, wallZ + 0.03],
    [left - 0.035, floorY + cr, dz],
    [left + 0.004, dy, dz],
  ];
  const black: V3[] = [
    [right - 0.004, dy, dz],
    [right + 0.03, floorY + cr, dz],
    [right + 0.1, floorY + cr, (dz + wallZ) / 2],
    [right + 0.14, floorY + cr, wallZ - 0.03],
  ];
  const body = useMemo(() => softBox(dimmer.l, dimmer.h, dimmer.d, dimmer.h * 0.4), [dimmer.l, dimmer.h, dimmer.d]);
  useGeometryCleanup(body);
  const knobR = Math.min(dimmer.d * 0.3, dimmer.l * 0.15);
  return (
    <group>
      {cable && (
        <>
          <Rope points={clear} radius={cr} segments={96}>
            <meshPhysicalMaterial color="#e3eeef" transparent opacity={0.55} roughness={0.12} clearcoat={1} depthWrite={false} />
          </Rope>
          <Rope points={clear} radius={cr * 0.32} segments={96}>
            <meshStandardMaterial color="#c07a45" metalness={1} roughness={0.35} />
          </Rope>
        </>
      )}
      <mesh geometry={body} position={dimmerPos}>
        <meshStandardMaterial color="#141416" roughness={0.5} />
      </mesh>
      <mesh position={[dx + dimmer.l * 0.22, floorY + dimmer.h + dimmer.h * 0.2, dz]}>
        <cylinderGeometry args={[knobR, knobR * 1.05, dimmer.h * 0.4, 28]} />
        <meshStandardMaterial color="#2b2c30" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[dx - dimmer.l * 0.28, dy + dimmer.h * 0.1, dz + dimmer.d / 2]}>
        <sphereGeometry args={[dimmer.h * 0.12, 12, 8]} />
        <meshBasicMaterial color={led} toneMapped={false} />
      </mesh>
      <Rope points={black} radius={cr} color="#111113" roughness={0.6} />
    </group>
  );
}

/** Placa de neon: acrílico recortado no contorno do desenho, espaçadores, tubos de LED e o brilho na parede. */
function NeonSign({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale: s } = fitFlat(spec, 2.4);
  const colors = ledColorsOf(spec, art);
  const colorKey = colors.join(",");
  const neon = useNeonArt(artAspect(spec), art, label, spec.widthCm, spec.heightCm);
  const tB = Math.max(spec.depthCm, 0.5) * s;
  const stage = neonStage(w, h, s, tB);
  const plane = useMemo(() => new THREE.PlaneGeometry(w, h), [w, h]);
  const glowPlane = useMemo(() => new THREE.PlaneGeometry(w * GLOW_PAD, h * GLOW_PAD), [w, h]);
  useGeometryCleanup(plane);
  useGeometryCleanup(glowPlane);
  const board = neon.board;
  const bevel = tB * 0.22;
  const boardGeometry = useMemo(() => {
    if (!board) return null;
    const shapes = board.loops.map((loop) => new THREE.Shape(loop.map(([x, y]) => new THREE.Vector2(x * w, y * h))));
    const depth = Math.max(tB - bevel * 2, tB * 0.2);
    const g = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1 });
    g.translate(0, 0, -(depth + bevel));
    return g;
  }, [board, w, h, tB, bevel]);
  useGeometryCleanup(boardGeometry);
  const standoff = useStandoff(s, tB);
  const halo = useRef<THREE.MeshBasicMaterial>(null);
  const spill = useRef<THREE.MeshBasicMaterial>(null);
  const lightA = useRef<THREE.PointLight>(null);
  const lightB = useRef<THREE.PointLight>(null);
  const animate = useAnimate();
  const time = useRef(0);
  useFrame((state, delta) => {
    if (!animate) return;
    time.current += Math.min(delta, 0.1);
    const k = neonPulse(time.current);
    if (halo.current) halo.current.opacity = HALO_OPACITY * k;
    if (spill.current) spill.current.opacity = SPILL_OPACITY * k;
    if (lightA.current) lightA.current.intensity = WALL_LIGHT * k;
    if (lightB.current) lightB.current.intensity = WALL_LIGHT * k;
    state.invalidate();
  });
  const exit: V2 = board ? [board.exit[0] * w, board.exit[1] * h] : [w * 0.2, -h * 0.3];
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation-y={0.22}>
      <NeonWall w={w} h={h} s={s} stage={stage} colorKey={colorKey} glow={neon.spill} spillRef={spill} />
      <pointLight ref={lightA} position={[-w * 0.26, 0, stage.wallZ + 0.3]} color={colors[0]} intensity={WALL_LIGHT} />
      <pointLight ref={lightB} position={[w * 0.26, 0, stage.wallZ + 0.3]} color={colors[1] ?? colors[0]} intensity={WALL_LIGHT} />
      {boardGeometry && (
        <mesh geometry={boardGeometry} renderOrder={1}>
          <NeonAcrylic tint={colors[0]} />
        </mesh>
      )}
      {board?.anchors.map(([ax, ay]) => (
        <mesh key={`${ax.toFixed(4)}:${ay.toFixed(4)}`} geometry={standoff.geometry} material={standoff.material} position={[ax * w, ay * h, stage.wallZ]} />
      ))}
      {TUBE_SHADES.map((shade, i) => (
        <mesh key={i} geometry={plane} position-z={0.0008 + (stage.tubeDepth * i) / (TUBE_SHADES.length - 1)} renderOrder={3 + i}>
          <meshBasicMaterial map={neon.tube} color={shade} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <mesh geometry={glowPlane} position-z={stage.tubeDepth + 0.003} renderOrder={12} userData={{ noBounds: true }}>
        <meshBasicMaterial ref={halo} map={neon.glow} transparent opacity={HALO_OPACITY} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <NeonPower stage={stage} exit={exit} s={s} tB={tB} led={colors[0]} cable={Boolean(board)} />
      {showDims && <Dimensions w={w} h={h} z={stage.tubeDepth + 0.03} labelW={lw} labelH={lh} light />}
    </group>
  );
}

/** Tubo de neon de uma cor (o LED acende numa cor só por linha), aberto ou fechado, com tampas nas pontas abertas. */
function neonTubeGeometry(curve: THREE.Curve<THREE.Vector3>, radius: number, color: string, whiten: number, closed: boolean, tubular = 320) {
  const radial = 12;
  const tube = new THREE.TubeGeometry(curve, tubular, radius, radial, closed);
  const parts: THREE.BufferGeometry[] = [tube];
  if (!closed) {
    for (const t of [0, 1]) {
      const cap = new THREE.SphereGeometry(radius, radial, 8);
      const p = curve.getPointAt(t);
      cap.translate(p.x, p.y, p.z);
      parts.push(cap);
    }
  }
  const tint = new THREE.Color(color).lerp(new THREE.Color(1, 1, 1), whiten);
  for (const g of parts) {
    const data = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < data.length; k += 3) {
      data[k] = tint.r;
      data[k + 1] = tint.g;
      data[k + 2] = tint.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(data, 3));
  }
  if (parts.length === 1) return tube;
  const merged = mergeGeometries(parts) ?? tube;
  for (const g of parts) if (g !== merged) g.dispose();
  return merged;
}

/** Caminho do tubo com no máximo `max` pontos (o contorno da arte vem com um ponto por pixel). */
function thinPath(path: V2[], max: number): V2[] {
  const step = Math.max(1, Math.ceil(path.length / max));
  return path.filter((_, i) => i % step === 0);
}

type Tubo = { path: V2[]; cor: string; fechada: boolean };

/** Halo dos tubos do quadro (caminhos em unidades de cena), cada linha na cor dela. */
function paintLedGlow(w: number, h: number, tubos: readonly Tubo[]) {
  const canvas = canvasFor(w / h, 384);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const { width: W, height: H } = canvas;
  const unit = Math.min(W, H);
  const off = W * 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowOffsetX = off;
  for (const tubo of tubos) {
    const points = thinPath(tubo.path, 96).map(([x, y]) => [(x / (w * GLOW_PAD) + 0.5) * W - off, (0.5 - y / (h * GLOW_PAD)) * H] as V2);
    if (points.length < 2) continue;
    ctx.shadowColor = tubo.cor;
    ctx.strokeStyle = tubo.cor;
    ctx.lineWidth = unit * 0.014;
    for (const blur of [unit * 0.07, unit * 0.025]) {
      ctx.shadowBlur = blur;
      ctx.beginPath();
      points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (tubo.fechada) ctx.closePath();
      ctx.stroke();
    }
  }
  return canvas;
}

const FRAME_LIGHT = 1.6;
const SHEATH_OPACITY = 0.32;

/**
 * Quadro acrílico com LED neon. As linhas de LED (src/lib/led-linhas.ts, as mesmas do editor e do anexo "Posição do
 * Led") viram tubos de uma cor cada: o contorno automático do desenho a LED_MARGEM_CM (arte sem fundo: impressa no
 * acrílico inteiro), ou a moldura (arte com fundo: impressa no centro), e as linhas que o cliente desenhou com o pincel.
 */
function NeonFrame({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale: s } = fitFlat(spec, 2.4);
  const corPadrao = ledColorsOf(spec, art)[0];
  const aspect = artAspect(spec);
  const contour = useArtContour(aspect, art, label, spec.widthCm, LED_MARGEM_CM, LED_BORDA_CM, spec.contour === "led");
  const desenho = desenhoDe(art);
  const traced = contour && !contour.cheio ? contour : null;
  const lacos = useMemo(() => (contour ? fractionLoops(contour) : null), [contour]);
  const linhas = useMemo(() => linhasDeLed(desenho, lacos, contour?.cheio ?? false, { widthCm: spec.widthCm, heightCm: spec.heightCm }, corPadrao), [desenho, lacos, contour, spec.widthCm, spec.heightCm, corPadrao]);
  // Sem a moldura de LED (contorno do desenho, ou só as linhas do pincel), a arte cobre o acrílico inteiro.
  const full = Boolean(traced) || !desenho.auto;
  const margin = THREE.MathUtils.clamp(Math.min(spec.widthCm, spec.heightCm) * 0.09, 3, 6) * s;
  const pw = full ? w : Math.max(w - margin * 2, w * 0.5);
  const ph = full ? h : Math.max(h - margin * 2, h * 0.5);
  const front = useArtTexture(full ? aspect : pw / ph, "front", art, label);
  const tB = Math.max(spec.depthCm, 0.6) * s;
  const stage = neonStage(w, h, s, tB);
  const tubeR = Math.max(0.55 * s, 0.008);
  // Cores das luzes, do banho na parede e da borda do acrílico: as duas primeiras cores diferentes das linhas.
  const colors = [...new Set(linhas.map((l) => l.cor))].slice(0, 2);
  if (!colors.length) colors.push(corPadrao);
  const colorKey = colors.join(",");
  // Caminhos do tubo em unidades de cena (x para a direita, y para cima, centro do quadro na origem).
  const tubos = useMemo<Tubo[]>(
    () => linhas.map((l) => ({ path: thinPath(l.pontos, 240).map(([x, y]): V2 => [(x - 0.5) * w, (0.5 - y) * h]), cor: l.cor, fechada: l.fechada })).filter((t) => t.path.length >= 2),
    [linhas, w, h],
  );
  const parts = useMemo(() => {
    const bev = tB * 0.25;
    const outline = makeShape("rect", w - bev * 2, h - bev * 2, 1.5 * s);
    const board = new THREE.ExtrudeGeometry(outline, { depth: tB - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 8 });
    board.translate(0, 0, -(tB - bev));
    const print = faceGeometry(makeShape("rect", pw, ph, (full ? 1.5 : 0.6) * s), pw, ph);
    const tubes = tubos.map((tubo) => {
      const curve = new THREE.CatmullRomCurve3(
        tubo.path.map(([x, y]) => new THREE.Vector3(x, y, 0)),
        tubo.fechada,
        "centripetal",
      );
      const tubular = THREE.MathUtils.clamp(Math.round(tubo.path.length * 1.4), 64, 320);
      return { core: neonTubeGeometry(curve, tubeR, tubo.cor, 0.45, tubo.fechada, tubular), sheath: neonTubeGeometry(curve, tubeR * 1.75, tubo.cor, 0, tubo.fechada, tubular) };
    });
    const merge = (geometries: THREE.BufferGeometry[]) => {
      if (!geometries.length) return new THREE.BufferGeometry();
      if (geometries.length === 1) return geometries[0];
      const merged = mergeGeometries(geometries) ?? geometries[0];
      for (const g of geometries) if (g !== merged) g.dispose();
      return merged;
    };
    const core = merge(tubes.map((t) => t.core));
    const sheath = merge(tubes.map((t) => t.sheath));
    const glowPlane = new THREE.PlaneGeometry(w * GLOW_PAD, h * GLOW_PAD);
    return { board, print, core, sheath, glowPlane };
  }, [w, h, s, tB, pw, ph, full, tubos, tubeR]);
  useGeometryCleanup(parts.board);
  useGeometryCleanup(parts.print);
  useGeometryCleanup(parts.core);
  useGeometryCleanup(parts.sheath);
  useGeometryCleanup(parts.glowPlane);
  const glow = useMemo(() => srgbTexture(paintLedGlow(w, h, tubos)), [w, h, tubos]);
  useDispose(glow);
  const standoff = useStandoff(s, tB);
  const halo = useRef<THREE.MeshBasicMaterial>(null);
  const spill = useRef<THREE.MeshBasicMaterial>(null);
  const sheath = useRef<THREE.MeshBasicMaterial>(null);
  const lightA = useRef<THREE.PointLight>(null);
  const lightB = useRef<THREE.PointLight>(null);
  const animate = useAnimate();
  const time = useRef(0);
  useFrame((state, delta) => {
    if (!animate) return;
    time.current += Math.min(delta, 0.1);
    const k = neonPulse(time.current);
    if (halo.current) halo.current.opacity = HALO_OPACITY * k;
    if (spill.current) spill.current.opacity = SPILL_OPACITY * k;
    if (sheath.current) sheath.current.opacity = SHEATH_OPACITY * k;
    if (lightA.current) lightA.current.intensity = FRAME_LIGHT * k;
    if (lightB.current) lightB.current.intensity = FRAME_LIGHT * k;
    state.invalidate();
  });
  const o = Math.max(1.5 * s, margin * 0.36);
  const corners: V2[] = [
    [-(w / 2 - o), h / 2 - o],
    [w / 2 - o, h / 2 - o],
    [-(w / 2 - o), -(h / 2 - o)],
    [w / 2 - o, -(h / 2 - o)],
  ];
  const tubeZ = tubeR + 0.001;
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation-y={0.22}>
      <NeonWall w={w} h={h} s={s} stage={stage} colorKey={colorKey} glow={glow} spillRef={spill} />
      <pointLight ref={lightA} position={[-w * 0.56, h * 0.1, stage.wallZ + 0.22]} color={colors[0]} intensity={FRAME_LIGHT} />
      <pointLight ref={lightB} position={[w * 0.56, -h * 0.1, stage.wallZ + 0.22]} color={colors[1] ?? colors[0]} intensity={FRAME_LIGHT} />
      <pointLight position={[0, h * 0.15, 1.1]} color={mixHex(colors[0], "#ffffff", 0.78)} intensity={1.5} />
      <mesh geometry={parts.board} renderOrder={1}>
        <NeonAcrylic tint={colors[0]} />
      </mesh>
      <mesh geometry={parts.print} position-z={0.0008}>
        {/* Arte sem fundo: onde não há tinta, o acrílico aparece (a key remonta o programa com o alphaTest). */}
        <meshPhysicalMaterial key={full ? "cut" : "full"} map={front} emissiveMap={front} emissive="#ffffff" emissiveIntensity={0.3} roughness={0.3} clearcoat={1} clearcoatRoughness={0.05} alphaTest={full ? 0.5 : 0} />
      </mesh>
      {corners.map(([x, y]) => (
        <mesh key={`${x}:${y}`} geometry={standoff.geometry} material={standoff.material} position={[x, y, stage.wallZ]} />
      ))}
      <mesh geometry={parts.core} position-z={tubeZ}>
        <meshBasicMaterial vertexColors toneMapped={false} />
      </mesh>
      <mesh geometry={parts.sheath} position-z={tubeZ} renderOrder={6}>
        <meshBasicMaterial ref={sheath} vertexColors transparent opacity={SHEATH_OPACITY} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh geometry={parts.glowPlane} position-z={tubeZ * 2 + 0.003} renderOrder={12} userData={{ noBounds: true }}>
        <meshBasicMaterial ref={halo} map={glow} transparent opacity={HALO_OPACITY} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <NeonPower stage={stage} exit={[w * 0.18, -h / 2 + 1.5 * s]} s={s} tB={tB} led={colors[0]} cable />
      {showDims && <Dimensions w={w} h={h} z={tubeZ * 2 + 0.03} labelW={lw} labelH={lh} light />}
    </group>
  );
}

/**
 * LED neon na parede escura: acrílico cristal recortado em volta do texto/arte (marching squares sobre
 * a arte engrossada), espaçadores cromados, tubos em camadas com núcleo aceso, halo aditivo e reflexo
 * colorido na parede, cabo cristal até o dimmer. {frame}: quadro com arte impressa e moldura de neon.
 */
export function NeonModel(props: ModelProps) {
  return props.spec.variant === "frame" ? <NeonFrame {...props} /> : <NeonSign {...props} />;
}

/* ------------------------------------------------------------------ backlight */

/** Halo morno em volta da caixa de luz (atrás dela). */
function paintBoxGlow(aspect: number, pad: number) {
  const canvas = canvasFor(aspect, 256);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const { width: W, height: H } = canvas;
  const unit = Math.min(W, H);
  const off = W * 3;
  ctx.shadowOffsetX = off;
  ctx.shadowColor = "#fff2dc";
  ctx.shadowBlur = unit * 0.09;
  ctx.fillStyle = "#fff2dc";
  ctx.beginPath();
  ctx.roundRect((W * (1 - 1 / pad)) / 2 - off, (H * (1 - 1 / pad)) / 2, W / pad, H / pad, unit * 0.02);
  ctx.fill();
  return canvas;
}

/**
 * Backlight: perfil de alumínio clic-clac com borda boleada (extrusão com furo), face iluminada por
 * igual (emissiva, sem tone mapping), película frontal com reflexo, fundo, suportes, cabo e interruptor.
 */
export function LightboxModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale: s } = fitFlat(spec, 2.4);
  const aspect = artAspect(spec);
  const front = useArtTexture(aspect, "front", art, label);
  const fw = Math.max(2.4 * s, 0.035);
  const depth = Math.max(THREE.MathUtils.clamp(spec.depthCm || 4, 2.5, 8) * s, 0.06);
  const bev = fw * 0.3;
  const outerW = w + fw * 2;
  const outerH = h + fw * 2;
  const cr = Math.max(0.25 * s, 0.0045);
  const parts = useMemo(() => {
    const outline = makeShape("rect", outerW - bev * 2, outerH - bev * 2, fw * 0.2);
    outline.holes.push(rectPath(w + bev * 2, h + bev * 2));
    const frame = new THREE.ExtrudeGeometry(outline, { depth: depth - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 4, curveSegments: 8 });
    frame.translate(0, 0, -(depth - bev));
    const bracket = softBox(Math.max(3 * s, 0.05), Math.max(1.4 * s, 0.022), Math.max(1 * s, 0.016), Math.max(0.3 * s, 0.004));
    const switchBox = softBox(Math.max(6 * s, 0.09), Math.max(1.8 * s, 0.028), Math.max(2.6 * s, 0.04), Math.max(0.6 * s, 0.008));
    const plug = softBox(Math.max(4 * s, 0.06), Math.max(2.2 * s, 0.034), Math.max(3 * s, 0.045), Math.max(0.8 * s, 0.01));
    return { frame, bracket, switchBox, plug };
  }, [w, h, outerW, outerH, depth, bev, fw, s]);
  useGeometryCleanup(parts.frame);
  useGeometryCleanup(parts.bracket);
  useGeometryCleanup(parts.switchBox);
  useGeometryCleanup(parts.plug);
  const glowPad = 1.35;
  const glow = useMemo(() => srgbTexture(paintBoxGlow(outerW / outerH, glowPad)), [outerW, outerH]);
  useDispose(glow);
  const faceZ = -bev - 0.004;
  const floor = -outerH / 2;
  const back = -depth;
  const sx = outerW / 2 + Math.max(10 * s, 0.14);
  const sz = back - Math.max(16 * s, 0.24);
  const switchH = Math.max(1.8 * s, 0.028);
  const plugH = Math.max(2.2 * s, 0.034);
  const cable: V3[] = [
    [w / 2 - fw, -h / 2, back - cr],
    [w / 2 - fw * 0.6, floor + cr * 3, back - 0.03],
    [outerW / 2, floor + cr, back - 0.1],
    [sx - Math.max(3.6 * s, 0.05), floor + cr, sz],
    [sx - Math.max(3 * s, 0.045), floor + switchH / 2, sz],
  ];
  const tail: V3[] = [
    [sx + Math.max(3 * s, 0.045), floor + switchH / 2, sz],
    [sx + Math.max(3.6 * s, 0.05), floor + cr, sz],
    [sx + 0.12, floor + cr, sz - 0.12],
    [sx + 0.16, floor + cr, sz - 0.24],
  ];
  const plugZ = sz - 0.24 - Math.max(1.5 * s, 0.022);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation-y={0.3}>
      <mesh geometry={parts.frame}>
        <meshStandardMaterial color="#cfd3d8" metalness={1} roughness={0.32} />
      </mesh>
      <mesh position-z={faceZ}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={front} toneMapped={false} />
      </mesh>
      <mesh position-z={faceZ + 0.003} renderOrder={2}>
        <planeGeometry args={[w, h]} />
        <meshPhysicalMaterial color="#ffffff" transparent opacity={0.08} roughness={0.05} clearcoat={1} clearcoatRoughness={0.04} depthWrite={false} />
      </mesh>
      <mesh position-z={back + 0.0015} rotation-y={Math.PI}>
        <planeGeometry args={[outerW - bev * 2, outerH - bev * 2]} />
        <meshStandardMaterial color="#a2a7ad" metalness={0.5} roughness={0.55} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} geometry={parts.bracket} position={[side * w * 0.3, h / 2 - fw * 0.5, back - Math.max(0.5 * s, 0.008)]}>
          <meshStandardMaterial color="#8d9298" metalness={0.8} roughness={0.4} />
        </mesh>
      ))}
      <mesh position-z={back - 0.006} renderOrder={-1} userData={{ noBounds: true }}>
        <planeGeometry args={[outerW * glowPad, outerH * glowPad]} />
        <meshBasicMaterial map={glow} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <Rope points={cable} radius={cr} color="#f2f2f2" roughness={0.5} segments={64} />
      <mesh geometry={parts.switchBox} position={[sx, floor + switchH / 2, sz]}>
        <meshStandardMaterial color="#f4f4f4" roughness={0.45} />
      </mesh>
      <Rope points={tail} radius={cr} color="#f2f2f2" roughness={0.5} />
      <mesh geometry={parts.plug} position={[sx + 0.16, floor + plugH / 2, plugZ]} rotation-y={Math.PI / 2}>
        <meshStandardMaterial color="#f4f4f4" roughness={0.45} />
      </mesh>
      {showDims && <Dimensions w={w} h={h} z={0.02} labelW={lw} labelH={lh} />}
    </group>
  );
}

/* ------------------------------------------------------------------ roll-up */

/** Seção do cassete do roll-up (cm): base plana, frente curva e a fenda por onde a lona sobe. */
function cassetteProfile(s: number, k: number) {
  const u = s * k;
  const p = new THREE.Shape();
  p.moveTo(-7.5 * u, 0);
  p.lineTo(8 * u, 0);
  p.quadraticCurveTo(10.5 * u, 0, 10.5 * u, 2.4 * u);
  p.bezierCurveTo(10.5 * u, 6.2 * u, 6 * u, 9.2 * u, 1.2 * u, 9.6 * u);
  p.lineTo(-0.6 * u, 9.6 * u);
  p.bezierCurveTo(-5 * u, 9.4 * u, -8.8 * u, 7.6 * u, -9 * u, 4.4 * u);
  p.quadraticCurveTo(-9.2 * u, 0, -7.5 * u, 0);
  return p;
}

/** Extrusão de um perfil (x da forma = z da cena) ao longo de x, centrada em x; o chanfro cresce o perfil em `bevel`. */
function extrudeAlongX(shape: THREE.Shape, length: number, bevel: number) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(length - bevel * 2, 0.0001), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 16 });
  g.rotateY(-Math.PI / 2);
  g.translate((length - bevel * 2) / 2, 0, 0);
  return g;
}

/**
 * Roll-up retrátil: cassete de alumínio extrudado com tampas e pés giratórios, mastro telescópico de
 * três estágios atrás da lona, trilho superior que prende a lona, que sobe da fenda levemente curvada.
 */
export function RollupModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale: s } = fitFlat(spec, 2.6);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const footT = 0.8 * s;
  const L = w + 5 * s;
  const bodyBevel = 0.5 * s;
  const capT = 2 * s;
  const capBevel = 0.45 * s;
  const top = footT + 9.6 * s + bodyBevel * 2;
  const bannerZ = 0.4 * s;
  const y0 = top - 0.6 * s;
  const railY = y0 + h + 1.2 * s;
  const poleZ = -3.8 * s;
  const poleStart = top - 1.2 * s;
  const poleLength = railY - poleStart;
  const thickness = Math.max(0.04 * s, 0.001);
  const drape: Drape = { ...FLAT, bow: 0.8 * s, bulge: 0.5 * s };
  const parts = useMemo(() => {
    const body = extrudeAlongX(cassetteProfile(s, 1), L, bodyBevel);
    body.translate(0, footT + bodyBevel, 0);
    const cap = extrudeAlongX(cassetteProfile(s, 1.035), capT, capBevel);
    cap.translate(0, footT + capBevel, 0);
    const footShape = makeShape("rect", 4.5 * s, 30 * s, 2 * s);
    const fb = footT * 0.25;
    const foot = new THREE.ExtrudeGeometry(footShape, { depth: footT - fb * 2, bevelEnabled: true, bevelThickness: fb, bevelSize: 0.3 * s, bevelSegments: 2, curveSegments: 10 });
    foot.rotateX(-Math.PI / 2);
    foot.translate(0, fb, 0);
    const rail = extrudeAlongX(makeShape("rect", 2.6 * s, 3.2 * s, 1.1 * s), w + 0.8 * s, 0.3 * s);
    const railCap = extrudeAlongX(makeShape("rect", 2.9 * s, 3.5 * s, 1.25 * s), 1 * s, 0.25 * s);
    const collar = lathe([[0, 0], [1.5, 0], [1.6, 0.2], [1.6, 2.0], [1.45, 2.2], [0, 2.2]], s, 28);
    const socket = lathe([[0, 0], [1.75, 0], [1.85, 0.3], [1.85, 1.6], [1.6, 1.8], [0, 1.8]], s, 28);
    return { body, cap, foot, rail, railCap, collar, socket };
  }, [s, L, bodyBevel, capT, capBevel, footT, w]);
  useGeometryCleanup(parts.body);
  useGeometryCleanup(parts.cap);
  useGeometryCleanup(parts.foot);
  useGeometryCleanup(parts.rail);
  useGeometryCleanup(parts.railCap);
  useGeometryCleanup(parts.collar);
  useGeometryCleanup(parts.socket);
  const sections = [
    { r: 1.25 * s, from: 0, to: 0.36 },
    { r: 1.05 * s, from: 0.34, to: 0.69 },
    { r: 0.88 * s, from: 0.67, to: 1 },
  ];
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation-y={0.35}>
      <mesh geometry={parts.body}>
        <meshStandardMaterial color="#d9dce0" metalness={1} roughness={0.3} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`cap${side}`} geometry={parts.cap} position-x={side * (L / 2 + capT / 2 - 0.2 * s)}>
          <meshStandardMaterial color="#2c2f34" roughness={0.45} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={`foot${side}`} geometry={parts.foot} position={[side * (L / 2 - 9 * s), 0, 1 * s]}>
          <meshStandardMaterial color="#4a4e55" metalness={0.8} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[0, top + 0.0005, bannerZ]}>
        <boxGeometry args={[L * 0.97, 0.06 * s, 0.9 * s]} />
        <meshStandardMaterial color="#0d0d0f" roughness={0.6} />
      </mesh>
      <group position={[0, y0 + h / 2, bannerZ]}>
        <BannerSheet spec={spec} w={w} h={h} thickness={thickness} drape={drape} front={front} detail={48} backColor="#cfd1d4" />
        {showDims && <Dimensions w={w} h={h} z={0.03} labelW={lw} labelH={lh} />}
      </group>
      <mesh geometry={parts.socket} position={[0, top - 1.2 * s, poleZ]}>
        <meshStandardMaterial color="#1c1d20" roughness={0.45} />
      </mesh>
      {sections.map((section, i) => {
        const length = (section.to - section.from) * poleLength;
        return (
          <mesh key={i} position={[0, poleStart + (section.from * poleLength + length / 2), poleZ]}>
            <cylinderGeometry args={[section.r, section.r, length, 20]} />
            <meshStandardMaterial color="#c9cdd2" metalness={1} roughness={0.22} />
          </mesh>
        );
      })}
      {[0.35, 0.68].map((t) => (
        <mesh key={t} geometry={parts.collar} position={[0, poleStart + poleLength * t - 1.1 * s, poleZ]}>
          <meshStandardMaterial color="#1c1d20" roughness={0.45} />
        </mesh>
      ))}
      <mesh position={[0, railY, (poleZ + bannerZ - 1.3 * s) / 2]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.45 * s, 0.45 * s, Math.abs(bannerZ - 1.3 * s - poleZ), 14]} />
        <meshStandardMaterial color="#1c1d20" roughness={0.45} />
      </mesh>
      <mesh geometry={parts.rail} position={[0, railY, bannerZ]}>
        <meshStandardMaterial color="#d9dce0" metalness={1} roughness={0.28} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`rail${side}`} geometry={parts.railCap} position={[side * (w / 2 + 0.8 * s), railY, bannerZ]}>
          <meshStandardMaterial color="#2c2f34" roughness={0.45} />
        </mesh>
      ))}
    </group>
  );
}
