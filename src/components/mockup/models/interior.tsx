"use client";

// Interiores: papel de parede, ímã de geladeira e capa de cilindro de festa.

import { useEffect, useMemo } from "react";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { KIND_INFO } from "@/lib/mockup-kinds";
import { fontFamily, heartPath, roundPath } from "../art";
import {
  DimLabel,
  Dimensions,
  RoundedBlock,
  Slab,
  bandGeometry,
  makeShape,
  sizeLabels,
  useArtTexture,
  useGeometryCleanup,
  type MaskPath,
  type ModelProps,
} from "./shared";

type Pt = [number, number];
type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

// ---------------------------------------------------------------------------- utilidades locais

/** Gerador pseudoaleatório determinístico (mulberry32): texturas iguais a cada render. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(width: number, height: number, draw: Draw) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(4, Math.round(width));
  canvas.height = Math.max(4, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function useTextureCleanup(texture: THREE.Texture | null) {
  useEffect(() => () => texture?.dispose(), [texture]);
}

function useGeometryListCleanup(list: THREE.BufferGeometry[]) {
  useEffect(() => () => list.forEach((g) => g.dispose()), [list]);
}

const rectPath: MaskPath = (ctx, w, h) => {
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, Math.min(w, h) * 0.05);
};

/**
 * Sombra suave de uma peça colada (ímã, bilhete): a forma desenhada fora do canvas e só a sombra
 * (shadowBlur) cai dentro. `spread` = quanto o plano é maior que a peça.
 */
function shadowTexture(path: MaskPath, aspect: number, spread: number) {
  const base = 256;
  const w = aspect >= 1 ? base : Math.round(base * aspect);
  const h = aspect >= 1 ? Math.round(base / aspect) : base;
  return canvasTexture(w, h, (ctx, cw, ch) => {
    const inset = (1 - 1 / spread) / 2;
    const off = 4000;
    ctx.save();
    ctx.translate(cw * inset - off, ch * inset);
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = Math.min(cw, ch) * inset * 0.7;
    ctx.shadowOffsetX = off;
    ctx.fillStyle = "#000";
    path(ctx, cw * (1 - inset * 2), ch * (1 - inset * 2));
    ctx.fill();
    ctx.restore();
  });
}

/** Degradê preto → transparente (de cima para baixo), para oclusão nos cantos. */
function linearShade() {
  return canvasTexture(8, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(0.35, "rgba(0,0,0,0.45)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

function radialShade() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(0.55, "rgba(0,0,0,0.5)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

function ShadeMaterial({ map, opacity }: { map: THREE.Texture; opacity: number }) {
  return <meshBasicMaterial map={map} color="#000000" transparent opacity={opacity} depthWrite={false} toneMapped={false} polygonOffset polygonOffsetFactor={-2} />;
}

// ============================================================================ papel de parede

/** Largura da bobina: cada faixa tem 50 cm e o desenho repete a cada 50 cm (encaixe meia-queda). */
const TILE_CM = 50;
const WALL_CM = 10;
const FLOOR_CM = 50;
const FLOOR_T_CM = 2;

/**
 * Superfície do papel: uma faixa por bobina, cada uma com módulos quadrados da arte. As faixas ímpares
 * descem meio módulo (encaixe meia-queda, como no papel de parede de verdade). UV de 0 a 1 por módulo:
 * a arte nunca estica e não precisa de RepeatWrapping.
 */
function wallpaperGeometry(wCm: number, hCm: number, s: number) {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const strips = Math.max(1, Math.ceil(wCm / TILE_CM - 1e-6));
  for (let i = 0; i < strips; i += 1) {
    const x0 = i * TILE_CM;
    const x1 = Math.min(wCm, x0 + TILE_CM);
    const u1 = (x1 - x0) / TILE_CM;
    const drop = (i % 2) * (TILE_CM / 2);
    // Profundidade medida do teto para baixo: o papel é colado a partir do teto.
    for (let d0 = -drop; d0 < hCm; d0 += TILE_CM) {
      const a = Math.max(d0, 0);
      const b = Math.min(d0 + TILE_CM, hCm);
      if (b - a < 1e-4) continue;
      const vTop = 1 - (a - d0) / TILE_CM;
      const vBottom = 1 - (b - d0) / TILE_CM;
      const xl = (x0 - wCm / 2) * s;
      const xr = (x1 - wCm / 2) * s;
      const yt = (hCm / 2 - a) * s;
      const yb = (hCm / 2 - b) * s;
      const base = positions.length / 3;
      positions.push(xl, yb, 0, xr, yb, 0, xr, yt, 0, xl, yt, 0);
      normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
      uvs.push(0, vBottom, u1, vBottom, u1, vTop, 0, vTop);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/** Trama de papel texturizado (relevo): fios finos nas duas direções. */
function linenTexture() {
  const random = rng(7);
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      const l = 110 + Math.floor(random() * 40);
      ctx.fillStyle = `rgba(${l},${l},${l},0.55)`;
      ctx.fillRect(0, y, w, 1);
    }
    for (let x = 0; x < w; x += 2) {
      const l = 120 + Math.floor(random() * 50);
      ctx.fillStyle = `rgba(${l},${l},${l},0.4)`;
      ctx.fillRect(x, 0, 1, h);
    }
    for (let i = 0; i < 900; i += 1) {
      const l = Math.floor(random() * 255);
      ctx.fillStyle = `rgba(${l},${l},${l},0.25)`;
      ctx.fillRect(random() * w, random() * h, 1 + random() * 2, 1);
    }
  });
}

/** Assoalho de tábuas de carvalho no sentido da profundidade, com veios e emendas de topo. */
function woodTexture(wCm: number, dCm: number) {
  const random = rng(31);
  const cw = 1024;
  const ch = Math.min(2048, Math.max(64, Math.round((cw * dCm) / wCm)));
  return canvasTexture(cw, ch, (ctx, w, h) => {
    const plankPx = (14 / wCm) * w;
    const pxPerCm = w / wCm;
    for (let x = 0, i = 0; x < w; x += plankPx, i += 1) {
      const light = 52 + random() * 10;
      ctx.fillStyle = `hsl(${28 + random() * 6}, ${38 + random() * 10}%, ${light}%)`;
      ctx.fillRect(x, 0, plankPx + 1, h);
      // Veios: linhas finas e onduladas ao longo da tábua.
      for (let k = 0; k < 22; k += 1) {
        const gx = x + random() * plankPx;
        const amp = 1 + random() * 3;
        const freq = 0.01 + random() * 0.03;
        ctx.strokeStyle = `rgba(70,40,18,${0.06 + random() * 0.12})`;
        ctx.lineWidth = 0.6 + random() * 1.4;
        ctx.beginPath();
        for (let y = 0; y <= h; y += 8) {
          const px = gx + Math.sin(y * freq + k) * amp;
          if (y === 0) ctx.moveTo(px, y);
          else ctx.lineTo(px, y);
        }
        ctx.stroke();
      }
      // Emenda de topo numa altura diferente por tábua.
      const joint = (0.2 + random() * 0.6) * h + (i % 2) * h * 0.1;
      ctx.fillStyle = "rgba(40,22,10,0.45)";
      ctx.fillRect(x, joint, plankPx, Math.max(1, pxPerCm * 0.15));
      // Junta entre tábuas.
      ctx.fillStyle = "rgba(35,20,8,0.6)";
      ctx.fillRect(x, 0, Math.max(1.2, pxPerCm * 0.18), h);
    }
  });
}

/** Perfil (em unidades da cena) extrudado ao longo de x: rodapé e sanca. x do perfil = para fora da parede. */
function moldingGeometry(profile: Pt[], length: number) {
  const shape = new THREE.Shape(profile.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 12 });
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(length / 2, 0, 0);
  return geometry;
}

const BASEBOARD_CM: Pt[] = [
  [0, 0],
  [1.6, 0],
  [1.6, 8.4],
  [1.45, 9.2],
  [1.0, 9.75],
  [0.4, 10],
  [0, 10],
];

/** Sanca em cavetto (côncava), pendurada no teto. */
function crownProfileCm(): Pt[] {
  const arc: Pt[] = [];
  for (let i = 0; i <= 10; i += 1) {
    const a = Math.PI / 2 + (i / 10) * (Math.PI / 2);
    arc.push([8 + 6.4 * Math.cos(a), -8 + 6.4 * Math.sin(a)]);
  }
  return [[0, 0], [8.8, 0], [8.8, -1.1], [8.1, -1.6], ...arc, [1.0, -8.7], [0, -8.7]];
}

function WallDims({ w, h, z, labelW, labelH }: { w: number; h: number; z: number; labelW: string; labelH: string }) {
  const gap = 0.1;
  const tick = 0.04;
  const color = "#0a0a0a";
  return (
    <group position-z={z} userData={{ noBounds: true }}>
      <Line points={[[-w / 2, h / 2 + gap, 0], [w / 2, h / 2 + gap, 0]]} color={color} lineWidth={1.2} />
      <Line points={[[-w / 2, h / 2 + gap - tick, 0], [-w / 2, h / 2 + gap + tick, 0]]} color={color} lineWidth={1.2} />
      <Line points={[[w / 2, h / 2 + gap - tick, 0], [w / 2, h / 2 + gap + tick, 0]]} color={color} lineWidth={1.2} />
      <Line points={[[w / 2 + gap, -h / 2, 0], [w / 2 + gap, h / 2, 0]]} color={color} lineWidth={1.2} />
      <Line points={[[w / 2 + gap - tick, -h / 2, 0], [w / 2 + gap + tick, -h / 2, 0]]} color={color} lineWidth={1.2} />
      <Line points={[[w / 2 + gap - tick, h / 2, 0], [w / 2 + gap + tick, h / 2, 0]]} color={color} lineWidth={1.2} />
      <DimLabel text={labelW} position={[0, h / 2 + gap + 0.12, 0]} />
      <DimLabel text={labelH} position={[w / 2 + gap + 0.24, 0, 0]} />
    </group>
  );
}

/** Mesinha lateral redonda (tampo de carvalho, pés de metal preto) com vaso de cerâmica e capim-dos-pampas. */
function SideTable({ s, shade }: { s: number; shade: THREE.Texture }) {
  const parts = useMemo(() => {
    const topCm: Pt[] = [
      [0, 0],
      [19.2, 0],
      [19.8, 0.35],
      [20, 1.2],
      [19.8, 2.05],
      [19.2, 2.4],
      [0, 2.4],
    ];
    const top = new THREE.LatheGeometry(topCm.map(([x, y]) => new THREE.Vector2(x * s, y * s)), 64);
    const vaseCm: Pt[] = [
      [0, 0],
      [3.6, 0],
      [4.3, 0.4],
      [5.6, 4],
      [6, 8],
      [5.1, 12.8],
      [3.1, 16.6],
      [2.5, 18.8],
      [2.9, 20],
      [2.6, 20.2],
      [2.1, 19.4],
      [0, 18.6],
    ];
    const vase = new THREE.LatheGeometry(vaseCm.map(([x, y]) => new THREE.Vector2(x * s, y * s)), 48);
    // Pés: mesma geometria girada para fora (abertos ~7°).
    const legLength = Math.hypot(52.6, 4) * s;
    const leg = new THREE.CylinderGeometry(0.7 * s, 0.45 * s, legLength, 12);
    const legs = [0, 1, 2].map((i) => {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const top3 = new THREE.Vector3(12 * Math.cos(a), 52.6, 12 * Math.sin(a)).multiplyScalar(s);
      const foot = new THREE.Vector3(16 * Math.cos(a), 0, 16 * Math.sin(a)).multiplyScalar(s);
      const dir = top3.clone().sub(foot).normalize();
      const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const mid = top3.clone().add(foot).multiplyScalar(0.5);
      return { position: [mid.x, mid.y, mid.z] as [number, number, number], quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w] as [number, number, number, number] };
    });
    // Hastes secas saindo do vaso e plumas alongadas na ponta.
    const stems = [
      [[0, 0], [-3, 18], [-9, 34]],
      [[0, 0], [1, 20], [2, 40]],
      [[0, 0], [4, 16], [11, 30]],
    ].map((pts) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y], k) => new THREE.Vector3(x * s, y * s, (k === 2 ? (x > 0 ? -2 : 2) : 0) * s))), 20, 0.18 * s, 6));
    const plumes = [
      { position: [-9, 34, 2], rotation: 0.45 },
      { position: [2, 40, -2], rotation: -0.05 },
      { position: [11, 30, -2], rotation: -0.6 },
    ].map((p) => ({ position: p.position.map((v) => v * s) as [number, number, number], rotation: p.rotation }));
    const plume = new THREE.SphereGeometry(1, 16, 12);
    return { top, vase, leg, legs, stems, plumes, plume, list: [top, vase, leg, plume, ...stems] };
  }, [s]);
  useGeometryListCleanup(parts.list);
  const topY = 52.6 * s;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={0.06 * s}>
        <planeGeometry args={[44 * s, 44 * s]} />
        <ShadeMaterial map={shade} opacity={0.32} />
      </mesh>
      {parts.legs.map((leg, i) => (
        <mesh key={i} geometry={parts.leg} position={leg.position} quaternion={leg.quaternion}>
          <meshStandardMaterial color="#1d1d1f" metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
      <mesh geometry={parts.top} position-y={topY}>
        <meshStandardMaterial color="#b98a5c" roughness={0.55} />
      </mesh>
      <group position={[2 * s, topY + 2.4 * s, -3 * s]}>
        <mesh geometry={parts.vase}>
          <meshStandardMaterial color="#e9e3d8" roughness={0.75} />
        </mesh>
        <group position-y={18 * s}>
          {parts.stems.map((g, i) => (
            <mesh key={i} geometry={g}>
              <meshStandardMaterial color="#b9a27c" roughness={0.9} />
            </mesh>
          ))}
          {parts.plumes.map((p, i) => (
            <mesh key={i} geometry={parts.plume} position={p.position} rotation-z={p.rotation} scale={[2.3 * s, 8 * s, 2.3 * s]}>
              <meshStandardMaterial color="#e6d7ba" roughness={1} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

/**
 * Papel de parede: trecho de parede (largura × pé-direito do pedido) forrado com a arte em módulos de
 * 50 cm, faixas com emenda vertical sutil e encaixe meia-queda, papel fosco com relevo de trama. Sanca e
 * rodapé brancos, um pedaço de assoalho de carvalho e uma mesinha lateral neutra dão a escala.
 */
export function WallpaperModel({ spec, art, label, showDims }: ModelProps) {
  const wCm = Math.max(spec.widthCm, 10);
  const hCm = Math.max(spec.heightCm, 10);
  const s = 2.8 / Math.max(wCm, hCm);
  const W = wCm * s;
  const H = hCm * s;
  const tile = useArtTexture(1, "front", art, label);
  const paper = useMemo(() => wallpaperGeometry(wCm, hCm, s), [wCm, hCm, s]);
  useGeometryCleanup(paper);
  const molding = useMemo(() => {
    const base = moldingGeometry(BASEBOARD_CM.map(([x, y]) => [x * s, y * s]), W);
    const crown = moldingGeometry(crownProfileCm().map(([x, y]) => [x * s, y * s]), W);
    return { base, crown, list: [base, crown] };
  }, [s, W]);
  useGeometryListCleanup(molding.list);
  const textures = useMemo(() => {
    const linen = linenTexture();
    const wood = woodTexture(wCm, FLOOR_CM + WALL_CM);
    const linear = linearShade();
    const radial = radialShade();
    return { linen, wood, linear, radial, list: [linen, wood, linear, radial] };
  }, [wCm]);
  useEffect(() => () => textures.list.forEach((t) => t.dispose()), [textures]);

  const strips = Math.max(1, Math.ceil(wCm / TILE_CM - 1e-6));
  const seams = Array.from({ length: strips - 1 }, (_, i) => ((i + 1) * TILE_CM - wCm / 2) * s);
  const [lw, lh] = sizeLabels(spec);
  const floorD = (FLOOR_CM + WALL_CM) * s;
  const tableX = Math.max(-W / 2 + 24 * s, -W * 0.3);

  return (
    <group>
      <group position-y={H / 2}>
        <RoundedBlock w={W} h={H} d={WALL_CM * s} radius={0.8 * s} color="#e7e3dc" roughness={0.92} position={[0, 0, (-WALL_CM * s) / 2]} />
        <mesh geometry={paper} position-z={0.0006}>
          <meshStandardMaterial map={tile} roughness={0.9} bumpMap={textures.linen} bumpScale={0.35} />
        </mesh>
        {seams.map((x) => (
          <group key={x} position={[x, 0, 0.0012]}>
            <mesh>
              <planeGeometry args={[0.18 * s, H]} />
              <meshBasicMaterial color="#000000" transparent opacity={0.16} depthWrite={false} toneMapped={false} />
            </mesh>
            <mesh position-x={0.22 * s}>
              <planeGeometry args={[0.16 * s, H]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.22} depthWrite={false} toneMapped={false} />
            </mesh>
          </group>
        ))}
        {/* Sombra macia logo abaixo da sanca. */}
        <mesh position={[0, H / 2 - 8.7 * s - 4 * s, 0.0016]}>
          <planeGeometry args={[W, 8 * s]} />
          <ShadeMaterial map={textures.linear} opacity={0.12} />
        </mesh>
        <mesh geometry={molding.crown} position-y={H / 2}>
          <meshStandardMaterial color="#f6f4ef" roughness={0.45} />
        </mesh>
        <mesh geometry={molding.base} position-y={-H / 2}>
          <meshStandardMaterial color="#f6f4ef" roughness={0.4} />
        </mesh>
        {showDims && KIND_INFO[spec.kind].dims && <WallDims w={W} h={H} z={0.12} labelW={lw} labelH={lh} />}
      </group>

      {/* Assoalho: o topo fica em y = 0, a parede apoia nele. */}
      <mesh position={[0, (-FLOOR_T_CM * s) / 2, floorD / 2 - WALL_CM * s]}>
        <boxGeometry args={[W, FLOOR_T_CM * s, floorD]} />
        <meshStandardMaterial attach="material-0" color="#8f6845" roughness={0.7} />
        <meshStandardMaterial attach="material-1" color="#8f6845" roughness={0.7} />
        <meshStandardMaterial attach="material-2" map={textures.wood} roughness={0.5} />
        <meshStandardMaterial attach="material-3" color="#6e4f34" roughness={0.8} />
        <meshStandardMaterial attach="material-4" color="#9a7350" roughness={0.65} />
        <meshStandardMaterial attach="material-5" color="#8f6845" roughness={0.7} />
      </mesh>
      {/* Oclusão no encontro do rodapé com o piso. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.0008, 1.6 * s + 5 * s]}>
        <planeGeometry args={[W, 10 * s]} />
        <ShadeMaterial map={textures.linear} opacity={0.3} />
      </mesh>
      <group position={[tableX, 0, 26 * s]}>
        <SideTable s={s} shade={textures.radial} />
      </group>
    </group>
  );
}

// ============================================================================ ímã de geladeira

/** Manta magnética flexível de 0,8 mm. */
const MAGNET_CM = 0.08;
const MAGNET_BROWN = "#4a3426";
/** Bloquinho de 12 folhas de offset 70 g (~1,4 mm), proporção 5 × 6,5 cm. */
const PAD_CM = 0.14;
const PAD_ASPECT = 5 / 6.5;
/** Fração da altura do bloquinho colada atrás do ímã (fica escondida). */
const PAD_TUCK = 0.16;
/** Folha do bilhete (~0,1 mm) entre a porta e o ímã. */
const NOTE_CM = 0.02;
/** Trecho de porta: chapa esmaltada com borda boleada; a borracha de vedação aparece em volta. */
const DOOR_CM = { depth: 0.9, bevel: 0.35, seal: 0.22 };
/**
 * Puxador em perfil cromado na borda esquerda, em medida real (não acompanha o tamanho do ímã). Fica à
 * esquerda porque a foto do carrinho gira a câmera para a direita: o puxador, à frente da porta, nunca tapa o ímã.
 */
const HANDLE_CM = { inset: 1.15, radius: 0.55, reach: 1.25, gap: 0.9, end: 1.1 };

function maskFor(shape: ModelProps["spec"]["shape"]): MaskPath | undefined {
  if (shape === "round") return roundPath;
  if (shape === "heart") return heartPath;
  return undefined;
}

/** Medida do pedido em cm; um valor ausente ou inválido não pode virar NaN na geometria. */
function specCm(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? Math.max(value, 1) : fallback;
}

type Box = { l: number; r: number; b: number; t: number };
const EMPTY_BOX: Box = { l: Infinity, r: -Infinity, b: Infinity, t: -Infinity };

/** Caixa ampliada por um retângulo w × h centrado em (cx, cy) e girado `angle` em torno da origem. */
function growBox(box: Box, cx: number, cy: number, w: number, h: number, angle = 0): Box {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const next = { ...box };
  for (const [kx, ky] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = cx + (kx * w) / 2;
    const y = cy + (ky * h) / 2;
    const rx = x * cos - y * sin;
    const ry = x * sin + y * cos;
    next.l = Math.min(next.l, rx);
    next.r = Math.max(next.r, rx);
    next.b = Math.min(next.b, ry);
    next.t = Math.max(next.t, ry);
  }
  return next;
}

type MagnetLayout = {
  mw: number;
  mh: number;
  /** Giro do ímã principal (rad). */
  tilt: number;
  /** Bloquinho do calendário; `ownSize` quando a medida do pedido é a dele. */
  pad: { w: number; h: number; y: number; ownSize: boolean } | null;
  /** Bilhete preso pelo ímã, no referencial girado `angle` em torno do centro do ímã. */
  note: { w: number; h: number; x: number; y: number; angle: number; hidden: number; curl: number } | null;
  /** Trecho de porta: tamanho e centro. */
  panel: { w: number; h: number; x: number; y: number };
};

/**
 * Composição em cm com o centro do ímã principal na origem. A porta é só um pouco maior que as peças
 * (≈2× o ímã): o viewer enquadra a caixa do modelo inteiro, então uma porta grande deixaria o ímã minúsculo.
 */
function magnetLayout(spec: ModelProps["spec"]): MagnetLayout {
  const photo = spec.variant === "photo";
  const calendar = spec.variant === "calendar";
  const sw = specCm(spec.widthCm, 5);
  const sh = specCm(spec.heightCm, 5);
  // "Calendário para Imã" (sem impressão) é o próprio bloquinho: a medida do pedido vale para ele e o
  // ímã é derivado; no "Imã c/ Calendário" a medida é a do ímã e o bloquinho pende embaixo dele.
  const ownSize = calendar && spec.blank;
  let mw = sw;
  let mh = sh;
  let pad: MagnetLayout["pad"] = null;
  if (calendar) {
    const padW = ownSize ? sw : sw * 0.92;
    const padH = ownSize ? sh : padW / PAD_ASPECT;
    if (ownSize) {
      mw = padW / 0.92;
      mh = mw * 1.11;
    }
    pad = { w: padW, h: padH, y: -mh / 2 + padH * PAD_TUCK - padH / 2, ownSize };
  }
  const tilt = photo ? -0.03 : calendar ? 0 : -0.04;
  // Peças e as sombras macias delas (planos maiores que a peça): a porta precisa cobrir as duas.
  let objects = growBox(EMPTY_BOX, 0, 0, mw, mh, tilt);
  let shadows = growBox(EMPTY_BOX, 0.04, -0.12, mw * 1.25, mh * 1.25, tilt);
  if (pad) {
    objects = growBox(objects, 0, pad.y, pad.w, pad.h);
    shadows = growBox(shadows, 0.06, pad.y - 0.2, pad.w * 1.3, pad.h * 1.3);
  }
  let note: MagnetLayout["note"] = null;
  if (!photo && !calendar) {
    // Bilhete preso pelo próprio ímã: a ponta de cima fica embaixo dele e o resto pende, girado ao contrário.
    const angle = 0.08;
    const top = mh * 0.12;
    // Ponto mais baixo do ímã no referencial do bilhete: daí para baixo o papel aparece e se descola.
    const rel = tilt - angle;
    const under = -(Math.abs(Math.sin(rel)) * mw + Math.cos(rel) * mh) / 2;
    const covered = top - under;
    const visible = 0.55 * Math.min(mw, mh);
    const h = covered + visible;
    const w = THREE.MathUtils.clamp(mw * 0.94, visible * 1.1, visible * 3);
    const x = -mw * 0.1;
    const y = top - h / 2;
    note = { w, h, x, y, angle, hidden: covered / h, curl: Math.min(0.8, (h - covered) * 0.13) };
    objects = growBox(objects, x, y, w, h, angle);
    shadows = growBox(shadows, x + 0.2, y - 0.35, w * 1.3, h * 1.3, angle);
  }
  const margin = THREE.MathUtils.clamp(0.36 * Math.min(mw, mh), 1.5, 3.2);
  const grip = Math.max(margin, HANDLE_CM.inset + HANDLE_CM.radius + HANDLE_CM.gap);
  const l = Math.min(objects.l - grip, shadows.l - 0.3);
  const r = Math.max(objects.r + margin, shadows.r + 0.3);
  const b = Math.min(objects.b - margin, shadows.b - 0.3);
  const t = Math.max(objects.t + margin, shadows.t + 0.3);
  return { mw, mh, tilt, pad, note, panel: { w: r - l, h: t - b, x: (l + r) / 2, y: (b + t) / 2 } };
}

/**
 * Folha do bloquinho de calendário (janeiro de 2027 começa numa sexta), domingos em vermelho. A faixa de
 * cima (`hidden`, fração da altura) fica colada atrás do ímã, então o conteúdo começa abaixo dela.
 */
function monthTexture(aspect: number, hidden: number) {
  const cw = 384;
  return canvasTexture(cw, cw / aspect, (ctx, w, fullH) => {
    const family = fontFamily();
    ctx.fillStyle = "#fbfaf6";
    ctx.fillRect(0, 0, w, fullH);
    const y0 = fullH * hidden;
    const h = fullH - y0;
    // Picote do bloco logo abaixo da área colada.
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    for (let x = w * 0.03; x < w * 0.97; x += 7) ctx.fillRect(x, y0 + 3, 3, 1.5);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#1c1c1e";
    ctx.font = `800 ${Math.round(h * 0.085)}px ${family}`;
    ctx.fillText("JANEIRO 2027", w / 2, y0 + h * 0.1, w * 0.88);
    ctx.fillStyle = "#d7262b";
    ctx.fillRect(w * 0.32, y0 + h * 0.165, w * 0.36, Math.max(2, h * 0.008));
    const cols = 7;
    const cellW = (w * 0.92) / cols;
    const left = w * 0.04 + cellW / 2;
    ctx.font = `700 ${Math.round(Math.min(h * 0.055, cellW * 0.5))}px ${family}`;
    ["D", "S", "T", "Q", "Q", "S", "S"].forEach((d, i) => {
      ctx.fillStyle = i === 0 ? "#d7262b" : "#6b6b70";
      ctx.fillText(d, left + i * cellW, y0 + h * 0.235);
    });
    const start = 5;
    const rows = 6;
    const top = y0 + h * 0.3;
    const rowH = (h * 0.66) / rows;
    ctx.font = `600 ${Math.round(Math.min(rowH * 0.58, cellW * 0.5))}px ${family}`;
    for (let day = 1; day <= 31; day += 1) {
      const cell = start + day - 1;
      const col = cell % cols;
      const row = Math.floor(cell / cols);
      ctx.fillStyle = col === 0 ? "#d7262b" : "#1c1c1e";
      ctx.fillText(String(day), left + col * cellW, top + row * rowH + rowH / 2);
    }
  });
}

/**
 * Bilhete de papel pautado com rabiscos de lista de compras. A faixa de cima (`hidden`, fração da altura)
 * fica embaixo do ímã, então a escrita começa abaixo dela.
 */
function noteTexture(aspect: number, hidden: number) {
  const random = rng(11);
  const cw = 320;
  return canvasTexture(cw, cw / aspect, (ctx, w, h) => {
    ctx.fillStyle = "#fffdf6";
    ctx.fillRect(0, 0, w, h);
    const gap = w / 8;
    ctx.fillStyle = "rgba(90,140,200,0.35)";
    for (let y = gap; y < h; y += gap) ctx.fillRect(0, y, w, 1.5);
    ctx.fillStyle = "rgba(220,80,80,0.35)";
    ctx.fillRect(w * 0.12, 0, 1.5, h);
    ctx.strokeStyle = "rgba(38,52,105,0.8)";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    const first = Math.ceil((h * hidden) / gap + 0.6) * gap;
    for (let line = first; line < h - gap * 0.4; line += gap) {
      const y = line - gap * 0.3;
      const end = w * (0.45 + random() * 0.4);
      ctx.beginPath();
      ctx.moveTo(w * 0.17, y);
      for (let x = w * 0.17; x < end; x += 5) {
        ctx.lineTo(x, y + Math.sin(x * 0.35 + line) * gap * 0.16 - random() * gap * 0.12);
      }
      ctx.stroke();
    }
  });
}

/**
 * Papel preso no alto que se descola embaixo (curvatura para fora e um canto mais levantado). A fração
 * `flat` de cima, embaixo do ímã, fica plana na porta.
 */
function curledPlane(w: number, h: number, curl: number, flat: number) {
  const geometry = new THREE.PlaneGeometry(w, h, 6, 24);
  const pos = geometry.attributes.position;
  const span = Math.max(1 - flat, 1e-3);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    // A posição é Float32: a linha do topo pode passar de h/2 no arredondamento, e Math.pow(negativo, 2,4)
    // dá NaN (raio NaN, enquadramento quebrado e peça invisível). Por isso o clamp.
    const t = THREE.MathUtils.clamp(((h / 2 - pos.getY(i)) / h - flat) / span, 0, 1);
    pos.setZ(i, curl * Math.pow(t, 2.4) * (1 + 0.6 * (x / w)));
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function SoftShadow({ map, w, h, spread, z, offset, opacity }: { map: THREE.Texture; w: number; h: number; spread: number; z: number; offset: [number, number]; opacity: number }) {
  return (
    <mesh position={[offset[0], offset[1], z]}>
      <planeGeometry args={[w * spread, h * spread]} />
      <ShadeMaterial map={map} opacity={opacity} />
    </mesh>
  );
}

/** Ímã flexível: face impressa brilhante sobre a manta marrom, com sombra justa na porta. */
function MagnetPiece({ w, h, s, spec, front, shadow }: { w: number; h: number; s: number; spec: ModelProps["spec"]; front: THREE.Texture; shadow: THREE.Texture }) {
  const d = MAGNET_CM * s;
  return (
    <group>
      <SoftShadow map={shadow} w={w} h={h} spread={1.25} z={-d / 2 + 0.0004} offset={[0.04 * s, -0.12 * s]} opacity={0.4} />
      <Slab w={w} h={h} d={d} spec={spec} front={front} radius={0.3 * s} edgeColor={MAGNET_BROWN} backColor={MAGNET_BROWN} />
    </group>
  );
}

/**
 * Trecho de porta de geladeira retrô (esmalte pastel, borda boleada e vedação de borracha) só um pouco
 * maior que os ímãs. O puxador em perfil cromado corre pela borda esquerda inteira, como o pedaço de um
 * puxador longo de porta de verdade: não vira uma geladeira em miniatura.
 */
function FridgeDoor({ w, h, s }: { w: number; h: number; s: number }) {
  const parts = useMemo(() => {
    const bevel = DOOR_CM.bevel * s;
    const depth = DOOR_CM.depth * s;
    const radius = Math.min(1.4 * s, Math.min(w, h) * 0.08);
    const door = new THREE.ExtrudeGeometry(makeShape("rect", w - bevel * 2, h - bevel * 2, radius), {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 4,
      curveSegments: 12,
    });
    door.translate(0, 0, -(depth + bevel));
    const rim = DOOR_CM.seal * s;
    const seal = new THREE.ExtrudeGeometry(makeShape("rect", w + rim * 2, h + rim * 2, radius + bevel + rim), { depth: 0.7 * s, bevelEnabled: false, curveSegments: 12 });
    seal.translate(0, 0, -(depth + bevel * 2 + 0.55 * s));
    return { door, seal, list: [door, seal] };
  }, [w, h, s]);
  useGeometryListCleanup(parts.list);
  const shade = useMemo(() => radialShade(), []);
  useTextureCleanup(shade);
  const railR = HANDLE_CM.radius * s;
  const railLen = Math.max(h - (HANDLE_CM.end + HANDLE_CM.radius) * 2 * s, h * 0.3);
  const reach = HANDLE_CM.reach * s;
  return (
    <group>
      <mesh geometry={parts.door}>
        <meshPhysicalMaterial color="#d9e5dd" roughness={0.32} clearcoat={0.8} clearcoatRoughness={0.12} />
      </mesh>
      <mesh geometry={parts.seal}>
        <meshStandardMaterial color="#9ea5a2" roughness={0.85} />
      </mesh>
      <group position-x={-w / 2 + HANDLE_CM.inset * s}>
        {/* Sombra macia do perfil na porta (luz do alto, à esquerda). */}
        <mesh position={[0.35 * s, -0.3 * s, 0.0005]}>
          <planeGeometry args={[railR * 3.4, railLen + railR * 2]} />
          <ShadeMaterial map={shade} opacity={0.3} />
        </mesh>
        <mesh position-z={reach / 2}>
          <boxGeometry args={[railR * 0.7, railLen, reach]} />
          <meshStandardMaterial color="#d5d8db" metalness={1} roughness={0.24} />
        </mesh>
        <mesh position-z={reach}>
          <capsuleGeometry args={[railR, railLen, 8, 24]} />
          <meshStandardMaterial color="#eceef0" metalness={1} roughness={0.16} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Ímãs num trecho de porta de geladeira, com o ímã do pedido como protagonista: padrão (segurando um
 * bilhete pelo topo), foto ímã sozinho e ímã com o bloquinho de calendário pendurado embaixo.
 */
function FridgeMagnets({ spec, art, label, showDims }: ModelProps) {
  const layout = useMemo(() => magnetLayout(spec), [spec]);
  const { mw, mh, tilt, pad, note, panel } = layout;
  const s = 2.5 / Math.max(panel.w, panel.h);
  const padW = pad?.w ?? 0;
  const padH = pad?.h ?? 0;
  const noteW = note?.w ?? 0;
  const noteH = note?.h ?? 0;
  const noteHidden = note?.hidden ?? 0;
  const noteCurl = note?.curl ?? 0;

  const mask = maskFor(spec.shape);
  const front = useArtTexture(mw / mh, "front", art, label, mask);
  const face = useMemo(() => ({ ...spec, finish: "gloss" as const, clearcoat: Math.max(spec.clearcoat, 0.85) }), [spec]);
  const paper = useMemo(() => ({ ...spec, shape: "rect" as const, finish: "matte" as const, clearcoat: 0, spotVarnish: false }), [spec]);
  const textures = useMemo(() => {
    const hero = shadowTexture(mask ?? rectPath, mw / mh, 1.25);
    let sheet: THREE.CanvasTexture | null = null;
    let extra: THREE.CanvasTexture | null = null;
    if (padW > 0) {
      sheet = shadowTexture(rectPath, padW / padH, 1.3);
      extra = monthTexture(padW / padH, PAD_TUCK);
    } else if (noteW > 0) {
      sheet = shadowTexture(rectPath, noteW / noteH, 1.3);
      extra = noteTexture(noteW / noteH, noteHidden);
    }
    const list = [hero, ...(sheet ? [sheet] : []), ...(extra ? [extra] : [])];
    return { hero, sheet, extra, list };
  }, [mask, mw, mh, padW, padH, noteW, noteH, noteHidden]);
  useEffect(() => () => textures.list.forEach((t) => t.dispose()), [textures]);
  const noteGeometry = useMemo(() => (noteW > 0 ? curledPlane(noteW * s, noteH * s, noteCurl * s, noteHidden) : null), [noteW, noteH, noteCurl, noteHidden, s]);
  useGeometryCleanup(noteGeometry);

  const mag = MAGNET_CM * s;
  // O ímã fica por cima do bloquinho ou do bilhete que ele segura.
  const lift = pad ? PAD_CM : note ? NOTE_CM * 1.5 : 0;
  const showDimsHere = showDims && KIND_INFO[spec.kind].dims;
  const [lw, lh] = sizeLabels(spec);

  return (
    <group>
      <FridgeDoor w={panel.w * s} h={panel.h * s} s={s} />

      {/* Peças com o centro do ímã principal na origem da composição. */}
      <group position={[-panel.x * s, -panel.y * s, 0]}>
        {note && noteGeometry && textures.sheet && textures.extra && (
          <group rotation-z={note.angle}>
            <group position={[note.x * s, note.y * s, (NOTE_CM / 2) * s]}>
              <SoftShadow map={textures.sheet} w={noteW * s} h={noteH * s} spread={1.3} z={-0.006 * s} offset={[0.2 * s, -0.35 * s]} opacity={0.26} />
              <mesh geometry={noteGeometry}>
                <meshStandardMaterial map={textures.extra} roughness={0.92} />
              </mesh>
              <mesh geometry={noteGeometry}>
                <meshStandardMaterial color="#f3f1ea" roughness={0.95} side={THREE.BackSide} />
              </mesh>
            </group>
          </group>
        )}

        {pad && textures.sheet && textures.extra && (
          <group position={[0, pad.y * s, (PAD_CM / 2) * s]}>
            <SoftShadow map={textures.sheet} w={padW * s} h={padH * s} spread={1.3} z={(-PAD_CM / 2) * s + 0.0004} offset={[0.06 * s, -0.2 * s]} opacity={0.32} />
            <Slab w={padW * s} h={padH * s} d={PAD_CM * s} spec={paper} front={textures.extra} radius={0.12 * s} edgeColor="#efece5" backColor="#efece5" />
            {/* Folhas do bloco: linhas finas na lateral. */}
            {[0.25, 0.5, 0.75].map((k) => (
              <mesh key={k} position={[padW * s * 0.5 + 0.0006, 0, (-PAD_CM / 2 + PAD_CM * k) * s]} rotation-y={Math.PI / 2}>
                <planeGeometry args={[0.012 * s, padH * s * 0.96]} />
                <meshBasicMaterial color="#c9c4ba" toneMapped={false} />
              </mesh>
            ))}
            {pad.ownSize && showDimsHere && <Dimensions w={padW * s} h={padH * s} z={(PAD_CM / 2) * s + 0.01} labelW={lw} labelH={lh} />}
          </group>
        )}

        <group position-z={lift * s + mag / 2 + 0.002 * s}>
          <group rotation-z={tilt}>
            <MagnetPiece w={mw * s} h={mh * s} s={s} spec={face} front={front} shadow={textures.hero} />
          </group>
          {!pad?.ownSize && showDimsHere && <Dimensions w={mw * s} h={mh * s} z={mag + 0.01} labelW={lw} labelH={lh} />}
        </group>
      </group>
    </group>
  );
}

/** Desenho da ponta do rolo: espiral de camadas (manta marrom e face branca) com miolo vazado. */
function spiralTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = MAGNET_BROWN;
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const inner = w * 0.3;
    const outer = w * 0.5;
    const turns = 9;
    ctx.strokeStyle = "rgba(250,248,242,0.9)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i <= turns * 120; i += 1) {
      const t = i / (turns * 120);
      const a = t * turns * Math.PI * 2;
      const r = inner + (outer - inner - 2) * t;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const hole = ctx.createRadialGradient(cx, cy, 0, cx, cy, inner);
    hole.addColorStop(0, "#120c08");
    hole.addColorStop(0.85, "#2a1d15");
    hole.addColorStop(1, "#f2efe8");
    ctx.fillStyle = hole;
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * Manta de ímã adesiva: rolo de manta marrom meio desenrolado no chão; o trecho aberto mostra a face
 * branca imprimível com a arte (simulação) e a ponta levanta um pouco, como a manta faz de verdade.
 */
function MagnetSheetRoll({ spec, art, label, showDims }: ModelProps) {
  const sheetW = Math.max(spec.widthCm, 5);
  const visibleL = Math.max(5, Math.min(spec.heightCm * 0.7, sheetW * 1.2));
  const R = Math.max(2.5, Math.min(5, sheetW * 0.07));
  const s = 2.6 / Math.max(sheetW, visibleL + R * 2);
  const front = useArtTexture(sheetW / visibleL, "front", art, label);
  const sheet = useMemo(() => {
    const W = sheetW * s;
    const L = visibleL * s;
    const g = new THREE.PlaneGeometry(W, L, 2, 40);
    g.rotateX(-Math.PI / 2);
    g.translate(0, MAGNET_CM * s, R * s + L / 2);
    // A ponta da manta tende a voltar a enrolar: levanta nos últimos 12 cm.
    const pos = g.attributes.position;
    const zone = Math.min(12, visibleL * 0.3) * s;
    const end = (R + visibleL) * s;
    for (let i = 0; i < pos.count; i += 1) {
      const t = (pos.getZ(i) - (end - zone)) / zone;
      if (t > 0) pos.setY(i, pos.getY(i) + 1.6 * s * Math.pow(t, 2.6));
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }, [sheetW, visibleL, R, s]);
  useGeometryCleanup(sheet);
  const spiral = useMemo(() => spiralTexture(), []);
  useTextureCleanup(spiral);
  const [lw, lh] = sizeLabels(spec);
  const W = sheetW * s;
  const frontZ = (R + visibleL) * s;

  return (
    <group userData={{ view: { elevation: 0.75 } }}>
      <mesh geometry={sheet}>
        <meshPhysicalMaterial map={front} roughness={0.42} clearcoat={0.35} clearcoatRoughness={0.2} />
      </mesh>
      <mesh geometry={sheet}>
        <meshStandardMaterial color={MAGNET_BROWN} roughness={0.75} side={THREE.BackSide} />
      </mesh>
      {/* Trecho que sai de baixo do rolo. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, MAGNET_CM * s, (R * s) / 2]}>
        <planeGeometry args={[W, R * s]} />
        <meshStandardMaterial color="#f4f2ec" roughness={0.6} />
      </mesh>
      <mesh rotation-z={Math.PI / 2} position={[0, R * s, 0]}>
        <cylinderGeometry args={[R * s, R * s, W, 64, 1]} />
        <meshStandardMaterial attach="material-0" color={MAGNET_BROWN} roughness={0.68} />
        <meshStandardMaterial attach="material-1" map={spiral} roughness={0.8} />
        <meshStandardMaterial attach="material-2" map={spiral} roughness={0.8} />
      </mesh>
      {showDims && KIND_INFO[spec.kind].dims && (
        <group userData={{ noBounds: true }}>
          <Line points={[[-W / 2, 0.01, frontZ + 0.1], [W / 2, 0.01, frontZ + 0.1]]} color="#0a0a0a" lineWidth={1.2} />
          <Line points={[[-W / 2, 0.01, frontZ + 0.06], [-W / 2, 0.01, frontZ + 0.14]]} color="#0a0a0a" lineWidth={1.2} />
          <Line points={[[W / 2, 0.01, frontZ + 0.06], [W / 2, 0.01, frontZ + 0.14]]} color="#0a0a0a" lineWidth={1.2} />
          <DimLabel text={lw} position={[0, 0.06, frontZ + 0.24]} />
          <DimLabel text={`rolo de ${lh}`} position={[W / 2 - 0.3, R * s * 2 + 0.14, 0]} />
        </group>
      )}
    </group>
  );
}

/**
 * Ímã de geladeira. Padrão, foto ímã e com calendário: ímã flexível de 0,8 mm com impressão brilhante
 * (formato do pedido: retângulo, redondo ou coração) num trecho de porta de geladeira retrô pouco maior
 * que ele; o padrão segura um bilhete pelo topo e o de calendário traz o bloquinho mensal embaixo.
 * Manta adesiva: rolo meio desenrolado com a face branca mostrando a arte.
 */
export function MagnetModel(props: ModelProps) {
  if (props.spec.variant === "sheet") return <MagnetSheetRoll {...props} />;
  return <FridgeMagnets {...props} />;
}

// ============================================================================ capa de cilindro

/** Cores lisas das capas dos cilindros de trás (trio clássico P, M, G). */
const TRIO_COLORS = ["#ecc9c1", "#c3d0be"];
/** Trio clássico vendido (diâmetro × altura, cm): P, M e G. */
const TRIO_CM: [number, number][] = [
  [35, 40],
  [45, 60],
  [53, 80],
];

type TrioItem = { d: number; h: number; x: number; z: number };

/**
 * Monta o trio em torno do cilindro do pedido (na frente, x = z = 0): os outros dois tamanhos do jogo,
 * na mesma escala do pedido, vão atrás à esquerda (o mais alto) e à direita. Um cilindro mais baixo que
 * o da frente abre mais para o lado, para não sumir atrás dele.
 */
function trioLayout(dCm: number, hCm: number) {
  let nearest = 0;
  TRIO_CM.forEach(([, h], i) => {
    if (Math.abs(h - hCm) < Math.abs(TRIO_CM[nearest][1] - hCm)) nearest = i;
  });
  const kd = dCm / TRIO_CM[nearest][0];
  const kh = hCm / TRIO_CM[nearest][1];
  const others = TRIO_CM.filter((_, i) => i !== nearest)
    .map(([d, h]) => ({ d: d * kd, h: h * kh }))
    .sort((a, b) => b.h - a.h);
  const r0 = dCm / 2;
  const back: TrioItem[] = others.map((o, i) => {
    const gap = (r0 + o.d / 2) * 1.05;
    const lateral = o.h > hCm * 1.1 ? 0.6 : 0.9;
    return { ...o, x: (i === 0 ? -1 : 1) * gap * lateral, z: -gap * Math.sqrt(1 - lateral * lateral) };
  });
  const minX = Math.min(-r0, ...back.map((b) => b.x - b.d / 2));
  const maxX = Math.max(r0, ...back.map((b) => b.x + b.d / 2));
  const maxH = Math.max(hCm, ...back.map((b) => b.h));
  return { back, extent: Math.max(maxH, maxX - minX) };
}

/**
 * Capa de helanca vestida no cilindro, em torno (costura atrás): elástico puxando para dentro na base
 * com franzido leve, lateral reta e canto do topo arredondado.
 */
function coverGeometry(rCm: number, hCm: number, s: number) {
  const c = Math.min(2.4, rCm * 0.3, hCm * 0.2);
  const pts: Pt[] = [
    [0, 0.08],
    [rCm - 1.4, 0.08],
    [rCm - 0.55, 0.28],
    [rCm - 0.15, 0.9],
    [rCm, 2.2],
    [rCm, hCm - c],
  ];
  for (let i = 1; i <= 10; i += 1) {
    const a = (i / 10) * (Math.PI / 2);
    pts.push([rCm - c + c * Math.cos(a), hCm - c + c * Math.sin(a)]);
  }
  pts.push([rCm * 0.5, hCm + 0.1], [0, hCm + 0.12]);
  const geometry = new THREE.LatheGeometry(
    pts.map(([x, y]) => new THREE.Vector2(x * s, y * s)),
    128,
    Math.PI,
  );
  // Franzido do elástico: ondas pequenas que somem até 3 cm de altura.
  const pos = geometry.attributes.position;
  const zone = 3 * s;
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    if (y >= zone) continue;
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const k = Math.pow(1 - y / zone, 2) * 0.016 * Math.sin(Math.atan2(x, z) * 44);
    pos.setXYZ(i, x * (1 + k), y, z * (1 + k));
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return { geometry, corner: c };
}

function CoverMaterial({ color, map }: { color: string; map?: THREE.Texture }) {
  return <meshPhysicalMaterial color={map ? "#ffffff" : color} map={map ?? null} roughness={0.6} sheen={0.7} sheenRoughness={0.45} sheenColor="#ffffff" />;
}

function darken(color: string, amount: number) {
  return `#${new THREE.Color(color).multiplyScalar(amount).getHexString()}`;
}

/** Um cilindro vestido: capa, costuras (barra e topo) e, no da frente, a arte. */
function CoveredCylinder({ dCm, hCm, s, color, map }: { dCm: number; hCm: number; s: number; color: string; map?: THREE.Texture }) {
  const rCm = dCm / 2;
  const cover = useMemo(() => coverGeometry(rCm, hCm, s), [rCm, hCm, s]);
  useGeometryCleanup(cover.geometry);
  const bandBottom = 3.2;
  const bandH = Math.max(1, hCm - cover.corner - bandBottom - 0.6);
  const band = useMemo(
    () =>
      map
        ? bandGeometry({
            radiusTop: rCm * s + 0.0025,
            radiusBottom: rCm * s + 0.0025,
            height: bandH * s,
            width: bandH * (dCm / hCm) * s,
            segments: 96,
            rows: 4,
          })
        : null,
    [map, rCm, dCm, hCm, bandH, s],
  );
  useGeometryCleanup(band);
  const seam = darken(color, 0.82);
  return (
    <group>
      <mesh geometry={cover.geometry}>
        <CoverMaterial color={color} />
      </mesh>
      {band && map && (
        <mesh geometry={band} position-y={(bandBottom + bandH / 2) * s}>
          <meshPhysicalMaterial map={map} roughness={0.6} sheen={0.6} sheenRoughness={0.45} sheenColor="#ffffff" polygonOffset polygonOffsetFactor={-1} />
        </mesh>
      )}
      {/* Pesponto da barra e costura do topo. */}
      <mesh position-y={2.6 * s} rotation-x={Math.PI / 2}>
        <torusGeometry args={[rCm * s + 0.0015, 0.09 * s, 6, 128]} />
        <meshStandardMaterial color={seam} roughness={0.7} />
      </mesh>
      <mesh position-y={(hCm - cover.corner) * s} rotation-x={Math.PI / 2}>
        <torusGeometry args={[rCm * s + 0.0015, 0.09 * s, 6, 128]} />
        <meshStandardMaterial color={seam} roughness={0.7} />
      </mesh>
    </group>
  );
}

/**
 * Capa para cilindro de festa: trio clássico P/M/G (35×40, 45×60, 53×80 cm). O cilindro da frente
 * (medida do pedido: diâmetro × altura) veste a capa sublimada com a arte de frente para a câmera, em
 * faixa com a largura física da arte (bandGeometry, sem distorção); o resto da capa usa a cor de fundo
 * da arte. Atrás, os outros dois tamanhos do jogo com capas lisas em tons suaves.
 */
export function CylinderModel({ spec, art, label }: ModelProps) {
  const dCm = Math.max(spec.widthCm, 5);
  const hCm = Math.max(spec.heightCm, 8);
  const trio = useMemo(() => trioLayout(dCm, hCm), [dCm, hCm]);
  const s = 2.6 / trio.extent;
  const front = useArtTexture(dCm / hCm, "front", art, label);
  const background = /^#[0-9a-f]{3,8}$/i.test(art.background) ? art.background : "#ffffff";
  const colors = [spec.accentColor ?? TRIO_COLORS[0], TRIO_COLORS[1]];
  return (
    <group>
      {trio.back.map((b, i) => (
        <group key={i} position={[b.x * s, 0, b.z * s]}>
          <CoveredCylinder dCm={b.d} hCm={b.h} s={s} color={colors[i]} />
        </group>
      ))}
      <CoveredCylinder dCm={dCm} hCm={hCm} s={s} color={background} map={front} />
    </group>
  );
}
