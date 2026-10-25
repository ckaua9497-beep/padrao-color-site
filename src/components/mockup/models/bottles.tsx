"use client";

// Copos (térmico, travel mug, vidro com tampa de bambu) e garrafas (squeeze de alumínio, térmicas inox,
// cola, infantis com tampa de bichinho, térmica com copo). Tudo torneado (LatheGeometry) em escala real.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import { THERMAL_SHARE, artArea, artAspect } from "@/lib/mockup-kinds";
import { THERMAL_WINDOW } from "../art";
import { bandGeometry, makeShape, metalColor, useArtTexture, type MaskPath, type ModelProps } from "./shared";
import { ENGRAVE_MASK_GLSL, lathe, radiusOnProfile, smoothProfile, useStudioReflection, type Pt } from "./vessel";

/*
 * Escala: 1 cm = 0,12 unidade (uma garrafa de 25 cm fica com 3 unidades). Cada peça é um perfil 2D
 * com cantos arredondados (filleted) girado em torno do eixo y. A arte é uma faixa (bandGeometry) que
 * segue o raio da parede em cada altura e mantém a proporção da área de impressão: se não couber na
 * circunferência ou na altura útil, encolhe por inteiro, nunca estica. Centro da arte em +z (câmera).
 */
const U = 0.12;
/** Folga da faixa sobre a parede (evita z-fighting). */
const LIFT = 0.004;
const BAMBOO = "#c9a46c";
const STEEL = "#dfe2e6";
const INK = "#141416";

type Art = ModelProps["art"];
/** Vértice do perfil: x (raio), y, raio do arredondamento do canto. */
type Corner = readonly [number, number, number?];
type Look = "gloss" | "satin" | "matte";
type Finish = { color: string; metalness: number; roughness: number; clearcoat: number; clearcoatRoughness: number };
type Disposable = { dispose: () => void };
type Pose = { position: [number, number, number]; rotation: [number, number, number, THREE.EulerOrder] };

// ---------------------------------------------------------------------------- helpers

/** Libera geometrias/texturas criadas em useMemo quando o registro muda ou o modelo desmonta. */
function useDispose(record: Record<string, Disposable | null>) {
  useEffect(
    () => () => {
      for (const item of Object.values(record)) item?.dispose();
    },
    [record],
  );
}

/** Igual a useDispose para um recurso só (faixa da arte, textura). */
function useDisposeOne(item: Disposable | null) {
  useEffect(() => () => item?.dispose(), [item]);
}

/** Polilinha com cantos arredondados (curva quadrática em cada vértice com raio > 0). */
function filleted(corners: readonly Corner[], steps = 6): Pt[] {
  const out: Pt[] = [];
  const push = (x: number, y: number) => {
    const last = out[out.length - 1];
    if (!last || Math.abs(last[0] - x) + Math.abs(last[1] - y) > 1e-6) out.push([Math.max(0, x), y]);
  };
  corners.forEach(([x, y, round = 0], i) => {
    const prev = corners[i - 1];
    const next = corners[i + 1];
    if (!prev || !next || round <= 0) {
      push(x, y);
      return;
    }
    const ax = prev[0] - x;
    const ay = prev[1] - y;
    const bx = next[0] - x;
    const by = next[1] - y;
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    const angle = la > 0 && lb > 0 ? Math.acos(THREE.MathUtils.clamp((ax * bx + ay * by) / (la * lb), -1, 1)) : 0;
    if (angle < 0.01 || angle > Math.PI - 0.01) {
      push(x, y);
      return;
    }
    const t = Math.min(round / Math.tan(angle / 2), la * 0.5, lb * 0.5);
    const sx = x + (ax / la) * t;
    const sy = y + (ay / la) * t;
    const ex = x + (bx / lb) * t;
    const ey = y + (by / lb) * t;
    for (let s = 0; s <= steps; s += 1) {
      const u = s / steps;
      const a = (1 - u) * (1 - u);
      const b = 2 * (1 - u) * u;
      const c = u * u;
      push(a * sx + b * x + c * ex, a * sy + b * y + c * ey);
    }
  });
  return out;
}

/** Junta trechos de perfil descartando pontos repetidos (normais NaN no torno). */
function joinProfile(...parts: Pt[][]): Pt[] {
  const out: Pt[] = [];
  for (const part of parts) {
    for (const p of part) {
      const last = out[out.length - 1];
      if (!last || Math.abs(last[0] - p[0]) + Math.abs(last[1] - p[1]) > 1e-6) out.push(p);
    }
  }
  return out;
}

function taper(y: number, y0: number, r0: number, y1: number, r1: number) {
  return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1);
}

/** Anel serrilhado (pegada de tampa de rosca): engrenagem suave extrudada na vertical, base em y = 0. */
function ribbedRing(radius: number, height: number, ribs: number, depth: number) {
  const bevel = Math.min(depth * 0.4, height * 0.15);
  const shape = new THREE.Shape();
  const steps = ribs * 6;
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    const r = radius - bevel - depth * (0.5 + 0.5 * Math.cos(a * ribs));
    if (i === 0) shape.moveTo(r * Math.cos(a), r * Math.sin(a));
    else shape.lineTo(r * Math.cos(a), r * Math.sin(a));
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(height - bevel * 2, 0.0001),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  return g;
}

/** Placa de cantos arredondados deitada no plano xz, espessura em y a partir de 0. */
function roundedSlab(w: number, d: number, t: number, radius: number) {
  const bevel = Math.min(t * 0.35, radius * 0.5);
  const shape = makeShape("rect", w - bevel * 2, d - bevel * 2, Math.max(radius - bevel, 0.0001));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(t - bevel * 2, 0.0001),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 8,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  return g;
}

/** Disco de borda boleada (tampa de bambu), base em y = 0, com furo opcional para o canudo. */
function discGeometry(radius: number, height: number, bevel: number, hole?: { x: number; z: number; r: number }) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, radius - bevel, 0, Math.PI * 2, false);
  if (hole) {
    const path = new THREE.Path();
    // Depois do rotateX o y do contorno vira -z.
    path.absarc(hole.x, -hole.z, hole.r + bevel, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(height - bevel * 2, 0.0001),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 72,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  return g;
}

/** Mosquetão em D: tubo fechado com um lado mais reto (o da trava). */
function carabinerGeometry(a: number, b: number, wire: number) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < 40; i += 1) {
    const t = (i / 40) * Math.PI * 2;
    const c = Math.cos(t);
    points.push(new THREE.Vector3(c >= 0 ? a * c : a * 0.5 * c, b * Math.sin(t) * (1 - 0.1 * c), 0));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true, "centripetal"), 120, wire, 12, true);
}

/** Gerador pseudoaleatório determinístico (a textura sai igual a cada render). */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Bambu laminado: tiras com tons alternados, veios finos e nós curtos. */
function bambooTexture(base: string) {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  const ctx = canvas.getContext("2d");
  if (!ctx) return texture;
  const rand = seeded(11);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let x = 0; x < size; ) {
    const w = 40 + rand() * 46;
    ctx.fillStyle = rand() < 0.5 ? `rgba(110,72,30,${0.05 + rand() * 0.09})` : `rgba(255,236,200,${0.06 + rand() * 0.1})`;
    ctx.fillRect(x, 0, w, size);
    x += w;
  }
  for (let i = 0; i < 150; i += 1) {
    const x = rand() * size;
    ctx.strokeStyle = `rgba(86,54,20,${0.06 + rand() * 0.16})`;
    ctx.lineWidth = 0.6 + rand() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + (rand() - 0.5) * 6, size * 0.33, x + (rand() - 0.5) * 6, size * 0.66, x + (rand() - 0.5) * 3, size);
    ctx.stroke();
  }
  for (let i = 0; i < 16; i += 1) {
    ctx.fillStyle = `rgba(80,50,16,${0.12 + rand() * 0.14})`;
    ctx.fillRect(rand() * size, rand() * size, 10 + rand() * 28, 2 + rand() * 2);
  }
  texture.needsUpdate = true;
  return texture;
}

/** Degradê vertical (garrafa coelhinho rosa → lilás). No torno, v = 0 é a base. */
function gradientTexture(bottom: string, top: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const ctx = canvas.getContext("2d");
  if (!ctx) return texture;
  const g = ctx.createLinearGradient(0, 256, 0, 0);
  g.addColorStop(0.12, bottom);
  g.addColorStop(0.88, top);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  texture.needsUpdate = true;
  return texture;
}

function luminance(hex: string) {
  const n = Number.parseInt(hex.replace("#", "").slice(0, 6), 16);
  if (Number.isNaN(n)) return 0.5;
  return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
}

function mix(a: string, b: string, t: number) {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
}

/** Pintura do corpo: inox polido/dourado/rosé, branco brilhante de sublimação ou pintura eletrostática. */
function coatFinish(spec: MockupSpec): Finish {
  if (spec.metal !== "none") {
    return { color: metalColor(spec.metal), metalness: 1, roughness: spec.glitter ? 0.42 : 0.22, clearcoat: 0.6, clearcoatRoughness: 0.12 };
  }
  if (luminance(spec.baseColor) > 0.9) return { color: spec.baseColor, metalness: 0, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 };
  return { color: spec.baseColor, metalness: 0.08, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.35 };
}

function plasticFinish(color: string, roughness = 0.4): Finish {
  return { color, metalness: 0, roughness, clearcoat: 0.35, clearcoatRoughness: 0.25 };
}

function printLook(spec: MockupSpec, finish: Finish): Look {
  if (spec.finish === "matte") return "matte";
  if (spec.finish === "gloss") return "gloss";
  return finish.roughness > 0.4 && finish.metalness < 0.5 ? "satin" : "gloss";
}

function FinishMaterial({ finish, map = null, env = null }: { finish: Finish; map?: THREE.Texture | null; env?: THREE.Texture | null }) {
  return (
    <meshPhysicalMaterial
      color={map ? "#ffffff" : finish.color}
      map={map}
      metalness={finish.metalness}
      roughness={finish.roughness}
      clearcoat={finish.clearcoat}
      clearcoatRoughness={finish.clearcoatRoughness}
      envMap={env}
    />
  );
}

/** Inox polido; com `env` (useStudioReflection) reflete o estúdio claro em vez do fundo escuro do visualizador. */
function SteelMaterial({ roughness = 0.16, env = null }: { roughness?: number; env?: THREE.Texture | null }) {
  return <meshStandardMaterial color={STEEL} metalness={1} roughness={roughness} envMap={env} />;
}

// ---------------------------------------------------------------------------- arte

/** Cantos levemente arredondados, como o recorte do DTF/transfer. */
function decalPath(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, Math.min(w, h) * 0.04);
}

/**
 * Vidro jateado: a sublimação não imprime branco, então o branco da arte vira transparência
 * (o próprio vidro aparece). Ajusta o alfa antes do recorte; putImageData ignora o modo de composição.
 */
function frostedPath(ctx: CanvasRenderingContext2D, w: number, h: number) {
  try {
    const image = ctx.getImageData(0, 0, w, h);
    const px = image.data;
    for (let i = 0; i < px.length; i += 4) {
      const white = Math.min(px[i], px[i + 1], px[i + 2]) / 255;
      px[i + 3] = Math.round(px[i + 3] * Math.min(1, (1 - white) * 2.6));
    }
    ctx.putImageData(image, 0, 0);
  } catch {
    // Canvas contaminado por imagem de outra origem: mantém a arte opaca.
  }
  decalPath(ctx, w, h);
}

/** Proporção da área de impressão com o mesmo piso de fitBand (textura e faixa sempre iguais). */
function printAspect(spec: MockupSpec) {
  return Math.max(spec.widthCm, 0.5) / Math.max(spec.heightCm, 0.5);
}

/**
 * Arte do cliente com fundo transparente quando é imagem enviada (o corpo aparece em volta). Na garrafa
 * térmica, a textura tem a proporção da faixa de 60% (a mesma do editor 2D) e o template se apoia na
 * parte da faixa que fica de frente.
 */
function useDecalArt(spec: MockupSpec, art: Art, label: string, mask: MaskPath = decalPath) {
  const thermal = spec.thermal;
  const decal = useMemo(() => ({ ...art, background: art.src ? "rgba(0,0,0,0)" : art.background, ...(thermal ? { frontWindow: THERMAL_WINDOW } : {}) }), [art, thermal]);
  return useArtTexture(thermal ? artAspect(spec) : printAspect(spec), "front", decal, label, mask);
}

/**
 * Tamanho da faixa na proporção da arte, limitado ao arco disponível (`arc` em radianos; padrão 94% da
 * volta) e à altura útil da parede.
 */
function fitBand(spec: MockupSpec, minRadius: number, maxHeight: number, arc = Math.PI * 2 * 0.94) {
  const w = Math.max(spec.widthCm, 0.5) * U;
  const h = Math.max(spec.heightCm, 0.5) * U;
  const scale = Math.min(1, (arc * minRadius) / w, Math.max(maxHeight, 0.05) / h);
  return { w: w * scale, h: h * scale };
}

/**
 * Garrafa térmica: a área personalizável cobre 60% da volta (≈216°), centrada na frente — só frente e
 * laterais. `radius` é o raio da parede (o mesmo de thermalWall em lib/mockup-kinds.ts), então largura
 * e altura saem na proporção do editor 2D; a altura respeita a parede útil.
 */
function thermalBand(spec: MockupSpec, radius: number, maxHeight: number) {
  const area = artArea(spec);
  const w = THERMAL_SHARE * Math.PI * 2 * radius;
  const h = w * (area.heightCm / Math.max(0.5, area.widthCm));
  const k = Math.min(1, Math.max(maxHeight, 0.05) / h);
  return { w: w * k, h: h * k };
}

function ArtBand({ geometry, map, y, look, overlay = false }: { geometry: THREE.BufferGeometry; map: THREE.Texture; y: number; look: Look; overlay?: boolean }) {
  const roughness = look === "gloss" ? 0.2 : look === "satin" ? 0.4 : 0.62;
  const clearcoat = look === "gloss" ? 1 : look === "satin" ? 0.35 : 0;
  return (
    <mesh geometry={geometry} position-y={y} renderOrder={overlay ? 3 : 0}>
      <meshPhysicalMaterial
        map={map}
        roughness={roughness}
        clearcoat={clearcoat}
        clearcoatRoughness={0.06}
        transparent={overlay}
        alphaTest={overlay ? 0.02 : 0.5}
        depthWrite={!overlay}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------- tampas

/**
 * Tampa de encaixe com abertura deslizante: aba sobre a borda, domo baixo, slot de beber na frente (+z)
 * e o deslizante atrás. `tall` acrescenta o anel serrilhado da travel mug.
 */
function SlideLid({ radius, color, tall }: { radius: number; color: string; tall: boolean }) {
  const skirt = tall ? 1.1 * U : 0;
  const flange = 0.42 * U;
  const dome = 0.72 * U;
  const top = skirt + flange + dome + 0.08 * U;
  const geo = useMemo(() => {
    const sk = tall ? 1.1 * U : 0;
    const fl = 0.42 * U;
    const dm = 0.72 * U;
    return {
      shell: lathe(
        filleted([
          [0, 0],
          [radius, 0, 0.05 * U],
          [radius, sk + fl, 0.16 * U],
          [radius - 0.5 * U, sk + fl + 0.14 * U, 0.25 * U],
          [radius - 0.8 * U, sk + fl + dm, 0.3 * U],
          [0, sk + fl + dm + 0.08 * U],
        ]),
      ),
      ribs: tall ? ribbedRing(radius + 0.06 * U, sk, 54, 0.07 * U) : null,
      slider: roundedSlab(2.2 * U, 1.0 * U, 0.2 * U, 0.45 * U),
      slot: new THREE.ShapeGeometry(makeShape("rect", 1.5 * U, 0.48 * U, 0.24 * U), 8),
    };
  }, [radius, tall]);
  useDispose(geo);
  // Altura do domo num raio ρ (perfil quase reto entre a borda do domo e o centro).
  const domeY = (rho: number) => top - 0.08 * U * Math.min(1, rho / Math.max(radius - 0.8 * U, 0.01));
  const slotZ = radius - 1.3 * U;
  const lid = { color, metalness: 0, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.2 };
  return (
    <group>
      <mesh geometry={geo.shell}>
        <FinishMaterial finish={lid} />
      </mesh>
      {geo.ribs && (
        <mesh geometry={geo.ribs}>
          <FinishMaterial finish={{ ...lid, roughness: 0.55 }} />
        </mesh>
      )}
      <mesh geometry={geo.slider} position={[0, domeY(1.2 * U) - 0.04 * U, -1.2 * U]}>
        <FinishMaterial finish={{ ...lid, roughness: 0.3 }} />
      </mesh>
      <mesh geometry={geo.slot} position={[0, domeY(slotZ) + 0.012 * U, slotZ]} rotation-x={-Math.PI / 2}>
        <meshStandardMaterial color="#050506" roughness={0.9} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------- copos

const CUP = {
  tumbler: { bottom: 3.4, top: 4.4, height: 16.2, rim: 0.9 },
  travel: { bottom: 3.5, top: 4.2, height: 15.2, rim: 0.6 },
};

/**
 * Travel mug: alça atrás e à direita, em θ = π − 0,85 (≈ 131°) já no referencial da cena (o grupo não gira).
 * A faixa é simétrica em θ = 0, então o centro da arte fica exatamente em +z, de frente para a vista
 * inicial, e a alça sai pela lateral direita (~2 cm do arco aparecem além da silhueta, o resto some
 * atrás do corpo). Antes o grupo girava −0,45 rad e levava o centro da arte 26° para a esquerda.
 * A faixa deixa um vão de ±0,3 rad em volta da alça, como o gabarito real de sublimação.
 */
const HANDLE_THETA = Math.PI - 0.85;
const HANDLE_GAP = 0.3;

function cupWall(travel: boolean, y: number) {
  const d = travel ? CUP.travel : CUP.tumbler;
  return taper(y, 0.5 * U, d.bottom * U, d.height * U, d.top * U);
}

/** Copo térmico inox (pintura eletrostática + aro polido + tampa deslizante) e a travel mug com alça. */
function SteelTumbler({ spec, art, label, travel }: ModelProps & { travel: boolean }) {
  const d = travel ? CUP.travel : CUP.tumbler;
  const h = d.height * U;
  const rim = d.rim * U;
  const rT = d.top * U;
  const geo = useMemo(() => {
    const dims = travel ? CUP.travel : CUP.tumbler;
    const H = dims.height * U;
    const rB = dims.bottom * U;
    const top = dims.top * U;
    const coatTop = H - dims.rim * U;
    const wall = (y: number) => cupWall(travel, y);
    const body = lathe(
      filleted([
        [0, 0.35 * U],
        [rB - 0.6 * U, 0.35 * U, 0.25 * U],
        [rB - 0.42 * U, 0, 0.12 * U],
        [rB - 0.08 * U, 0, 0.2 * U],
        [wall(0.5 * U), 0.5 * U, 0.35 * U],
        [wall(coatTop), coatTop, 0.03 * U],
        [wall(coatTop) - 0.06 * U, coatTop],
        [0, coatTop],
      ]),
      128,
    );
    // Aro de inox polido entre a pintura e a tampa, um pouco recuado (a pintura tem espessura).
    const steel = lathe(
      filleted([
        [0, coatTop - 0.1 * U],
        [wall(coatTop) - 0.025 * U, coatTop - 0.1 * U],
        [wall(coatTop) - 0.025 * U, coatTop + 0.05 * U, 0.02 * U],
        [top - 0.01 * U, H - 0.12 * U, 0.1 * U],
        [top - 0.12 * U, H, 0.08 * U],
        [top - 0.4 * U, H],
        [0, H],
      ]),
      128,
    );
    let handle: THREE.BufferGeometry | null = null;
    let pad: THREE.BufferGeometry | null = null;
    if (travel) {
      const yT = H - 2.4 * U;
      const yB = 3.4 * U;
      const xT = wall(yT) - 0.15 * U;
      const xB = wall(yB) - 0.15 * U;
      const curve = new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(xT, yT, 0),
          new THREE.Vector3(xT + 1.5 * U, yT + 0.3 * U, 0),
          new THREE.Vector3(xT + 2.9 * U, yT - 0.7 * U, 0),
          new THREE.Vector3((xT + xB) / 2 + 3.25 * U, (yT + yB) / 2, 0),
          new THREE.Vector3(xB + 3.0 * U, yB + 1.3 * U, 0),
          new THREE.Vector3(xB + 1.5 * U, yB - 0.15 * U, 0),
          new THREE.Vector3(xB, yB, 0),
        ],
        false,
        "centripetal",
      );
      handle = new THREE.TubeGeometry(curve, 96, 0.5 * U, 16, false);
      pad = new THREE.SphereGeometry(1, 24, 16);
    }
    return { body, steel, handle, pad };
  }, [travel]);
  useDispose(geo);

  const finish = coatFinish(spec);
  const map = useDecalArt(spec, art, label);
  const zone0 = 1.0 * U;
  const zone1 = h - rim - 0.5 * U;
  // Com alça a faixa é simétrica em θ = 0 e para antes do vão da alça.
  const arc = travel ? 2 * (HANDLE_THETA - HANDLE_GAP) : undefined;
  const fit = fitBand(spec, cupWall(travel, zone0), zone1 - zone0, arc);
  const center = (zone0 + zone1) / 2;
  const band = useMemo(
    () => bandGeometry({ radiusTop: 0, radiusBottom: 0, height: fit.h, width: fit.w, segments: 128, rows: 8, radiusAt: (y) => cupWall(travel, center + y) + LIFT }),
    [fit.w, fit.h, center, travel],
  );
  useDisposeOne(band);

  const accent = spec.accentColor ?? INK;
  const handleFinish: Finish = { color: accent, metalness: 0, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.2 };
  const padAt = (y: number): [number, number, number] => {
    const rho = cupWall(travel, y) - 0.05 * U;
    return [rho * Math.sin(HANDLE_THETA), y, rho * Math.cos(HANDLE_THETA)];
  };
  const pad = geo.pad;
  return (
    <group>
      <mesh geometry={geo.body}>
        <FinishMaterial finish={finish} />
      </mesh>
      <mesh geometry={geo.steel}>
        <SteelMaterial />
      </mesh>
      <ArtBand geometry={band} map={map} y={center} look={printLook(spec, finish)} />
      <group position-y={h - 0.05 * U}>
        <SlideLid radius={rT + 0.06 * U} color={accent} tall={travel} />
      </group>
      {geo.handle && pad && (
        <>
          {/* A curva nasce em +x (θ = π/2); gira até HANDLE_THETA. Achatada como alça ergonômica. */}
          <mesh geometry={geo.handle} rotation-y={HANDLE_THETA - Math.PI / 2} scale={[1, 1, 1.3]}>
            <FinishMaterial finish={handleFinish} />
          </mesh>
          {[h - 2.4 * U, 3.4 * U].map((y) => (
            <mesh key={y} geometry={pad} position={padAt(y)} rotation-y={HANDLE_THETA} scale={[0.95 * U, 0.75 * U, 0.4 * U]}>
              <FinishMaterial finish={handleFinish} />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
}

/**
 * Copo térmico inox de 500 ml (cm): corpo cônico com pintura eletrostática entre o fundo de inox (base) e o aro de
 * inox polido da boca (rim), tampa preta embutida. Medidas das fotos do produto (186).
 */
const THERMAL_CUP_CM = { bottom: 3.42, top: 4.4, height: 17.2, base: 1.9, rim: 1.7, gap: 0.07 };

/** Raio do cone do copo térmico numa altura (cena). */
function thermalCupWall(y: number) {
  const c = THERMAL_CUP_CM;
  return taper(y, 0, c.bottom * U, c.height * U, c.top * U);
}

/*
 * Gravação a laser na pintura do copo: o laser queima a tinta e revela o inox por baixo, numa cor só (a cor da arte
 * não importa). A máscara (ENGRAVE_MASK_GLSL) grava o que se destaca do fundo da arte; o resto da faixa é
 * descartado (alphaTest) e a pintura do corpo aparece.
 */
function engrave(shader: { fragmentShader: string }) {
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <map_pars_fragment>", `#include <map_pars_fragment>\n${ENGRAVE_MASK_GLSL}`)
    .replace(
      "#include <map_fragment>",
      /* glsl */ `
#ifdef USE_MAP
  diffuseColor.a *= engraveMask( texture2D( map, vMapUv ), engraveBackground() );
#endif
`,
    );
}

const engraveKey = () => "bottles-engrave";

/** Inox revelado pelo laser: acetinado (a queima deixa o metal fosco), refletindo o estúdio. */
function EngravedSteel({ geometry, map, y, env }: { geometry: THREE.BufferGeometry; map: THREE.Texture; y: number; env: THREE.Texture }) {
  return (
    <mesh geometry={geometry} position-y={y}>
      <meshPhysicalMaterial
        color="#d3d6da"
        metalness={1}
        roughness={0.34}
        envMap={env}
        map={map}
        alphaTest={0.5}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
        onBeforeCompile={engrave}
        customProgramCacheKey={engraveKey}
      />
    </mesh>
  );
}

/**
 * Copo térmico 500 ml (186): fundo e aro de inox polido, corpo pintado (preto, rosa, branco, azul) e tampa preta
 * embutida no aro, com abertura de beber na frente e trava deslizante atrás. Com "laser" nas opções a arte é
 * gravada (o inox aparece onde a arte é escura); sem laser, faixa impressa.
 */
function ThermalCup({ spec, art, label }: ModelProps) {
  const c = THERMAL_CUP_CM;
  const H = c.height * U;
  const baseTop = c.base * U;
  const rimBottom = H - c.rim * U;
  const geo = useMemo(() => {
    const h = THERMAL_CUP_CM.height * U;
    const bTop = THERMAL_CUP_CM.base * U;
    const rBottom = h - THERMAL_CUP_CM.rim * U;
    const g = THERMAL_CUP_CM.gap * U;
    const wall = thermalCupWall;
    const r0 = wall(0) - 0.07 * U;
    // Lábio do aro: a tampa encaixa por dentro, 0,4 cm abaixo da borda.
    const lip = wall(h) - 0.02 * U;
    const lidR = lip - 0.24 * U;
    return {
      base: lathe(
        filleted([
          [0, 0.3 * U],
          [r0 - 0.55 * U, 0.3 * U, 0.2 * U],
          [r0 - 0.35 * U, 0, 0.12 * U],
          [r0 - 0.05 * U, 0, 0.3 * U],
          [wall(bTop) - 0.07 * U, bTop, 0.03 * U],
          [0, bTop],
        ]),
        128,
      ),
      body: lathe(
        filleted([
          [0, bTop + g],
          [wall(bTop + g) - 0.05 * U, bTop + g, 0.03 * U],
          [wall(bTop + g + 0.12 * U), bTop + g + 0.12 * U, 0.06 * U],
          [wall(rBottom - g - 0.12 * U), rBottom - g - 0.12 * U, 0.06 * U],
          [wall(rBottom - g) - 0.05 * U, rBottom - g, 0.03 * U],
          [0, rBottom - g],
        ]),
        128,
      ),
      rim: lathe(
        filleted([
          [0, rBottom - 0.2 * U],
          [wall(rBottom) - 0.04 * U, rBottom - 0.2 * U],
          [wall(rBottom) - 0.01 * U, rBottom + 0.05 * U, 0.03 * U],
          [lip, h - 0.18 * U, 0.12 * U],
          [lip - 0.1 * U, h, 0.08 * U],
          [lidR, h - 0.04 * U, 0.04 * U],
          [lidR, h - 0.6 * U],
          [0, h - 0.6 * U],
        ]),
        128,
      ),
      lid: lathe(
        filleted([
          [0, h + 0.3 * U],
          [lidR - 0.5 * U, h + 0.3 * U, 0.4 * U],
          [lidR - 0.12 * U, h + 0.18 * U, 0.14 * U],
          [lidR - 0.02 * U, h - 0.3 * U],
          [0, h - 0.3 * U],
        ]),
        96,
      ),
      slider: roundedSlab(2.3 * U, 1.0 * U, 0.2 * U, 0.42 * U),
      lever: roundedSlab(0.9 * U, 0.55 * U, 0.5 * U, 0.2 * U),
      slot: new THREE.ShapeGeometry(makeShape("rect", 1.7 * U, 0.5 * U, 0.25 * U), 8),
      lidR,
    };
  }, []);
  useDispose({ base: geo.base, body: geo.body, rim: geo.rim, lid: geo.lid, slider: geo.slider, lever: geo.lever, slot: geo.slot });
  const studio = useStudioReflection();

  const finish = coatFinish(spec);
  const laser = /\blaser\b/.test(spec.details ?? "");
  const map = useDecalArt(spec, art, label);
  const zone0 = baseTop + 0.55 * U;
  const zone1 = rimBottom - 0.55 * U;
  const fit = fitBand(spec, thermalCupWall(zone0), zone1 - zone0, Math.PI * 1.1);
  const center = (zone0 + zone1) / 2;
  const band = useMemo(
    () => bandGeometry({ radiusTop: 0, radiusBottom: 0, height: fit.h, width: fit.w, segments: 128, rows: 12, radiusAt: (y) => thermalCupWall(center + y) + LIFT }),
    [fit.w, fit.h, center],
  );
  useDisposeOne(band);
  const lidFinish: Finish = { color: spec.accentColor ?? INK, metalness: 0, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.22 };
  const lidTop = H + 0.3 * U;
  return (
    <group>
      <mesh geometry={geo.base}>
        <SteelMaterial env={studio} roughness={0.2} />
      </mesh>
      <mesh geometry={geo.body}>
        <FinishMaterial finish={finish} />
      </mesh>
      <mesh geometry={geo.rim}>
        <SteelMaterial env={studio} roughness={0.12} />
      </mesh>
      {laser ? <EngravedSteel geometry={band} map={map} y={center} env={studio} /> : <ArtBand geometry={band} map={map} y={center} look={printLook(spec, finish)} />}
      <mesh geometry={geo.lid}>
        <FinishMaterial finish={lidFinish} />
      </mesh>
      {/* Abertura de beber na frente e trava deslizante atrás, com a alavanca saindo pela lateral. */}
      <mesh geometry={geo.slot} position={[0, lidTop + 0.004 * U, geo.lidR - 1.05 * U]} rotation-x={-Math.PI / 2}>
        <meshStandardMaterial color="#050506" roughness={0.9} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      <mesh geometry={geo.slider} position={[0, lidTop - 0.06 * U, -(geo.lidR - 1.3 * U)]}>
        <FinishMaterial finish={{ ...lidFinish, roughness: 0.3 }} />
      </mesh>
      <mesh geometry={geo.lever} position={[geo.lidR + 0.05 * U, H - 0.15 * U, -1.1 * U]} rotation-y={Math.PI / 2 - 0.25}>
        <FinishMaterial finish={{ ...lidFinish, roughness: 0.32 }} />
      </mesh>
    </group>
  );
}

const GLASS_CM = { radius: 3.5, height: 14.5, neck: 0.4, wall: 0.26 };

/** Copo de vidro jateado formato lata, tampa de bambu com furo e canudo de vidro. */
function GlassCan({ spec, art, label }: ModelProps) {
  const R = GLASS_CM.radius * U;
  const H = GLASS_CM.height * U;
  const hole = { x: 0.95 * U, z: -0.85 * U };
  const strawBase = 0.9 * U;
  const lidY = H;
  // O canudo inclina para sair exatamente pelo furo da tampa.
  const tilt = 0.05;
  const strawX = hole.x - (lidY + 0.5 * U - strawBase) * Math.tan(tilt);
  const wood = spec.accentColor ?? BAMBOO;

  const geo = useMemo(() => {
    const r = GLASS_CM.radius * U;
    const h = GLASS_CM.height * U;
    const n = GLASS_CM.neck * U;
    const t = GLASS_CM.wall * U;
    const m = r - n;
    const ro = 0.42 * U;
    const ri = 0.33 * U;
    const len = 19 * U;
    return {
      glass: lathe(
        filleted([
          [0, 0.18 * U],
          [r - 1.0 * U, 0, 0.3 * U],
          [r, 1.2 * U, 0.9 * U],
          [r, h - 2.2 * U, 0.9 * U],
          [m, h - 1.0 * U, 0.6 * U],
          [m, h, 0.1 * U],
          [m - t, h, 0.1 * U],
          [m - t, h - 1.0 * U, 0.6 * U],
          [r - t, h - 2.2 * U, 0.8 * U],
          [r - t, 1.6 * U, 0.7 * U],
          [r - 1.2 * U, 0.75 * U, 0.4 * U],
          [0, 0.7 * U],
        ]),
        128,
      ),
      gasket: lathe(
        filleted([
          [0, -0.9 * U],
          [m - t - 0.01 * U, -0.9 * U, 0.12 * U],
          [m - t - 0.01 * U, 0.02 * U],
          [0, 0.02 * U],
        ]),
        96,
      ),
      lid: discGeometry(m + 0.14 * U, 1.0 * U, 0.2 * U, { x: 0.95 * U, z: -0.85 * U, r: 0.5 * U }),
      straw: lathe(
        filleted([
          [ri, 0],
          [ro, 0, 0.04 * U],
          [ro, len, 0.04 * U],
          [ri, len, 0.04 * U],
          [ri, 0.001],
        ]),
        32,
      ),
    };
  }, []);
  useDispose(geo);
  const grain = useMemo(() => bambooTexture(wood), [wood]);
  useDisposeOne(grain);

  const map = useDecalArt(spec, art, label, frostedPath);
  const zone0 = 1.5 * U;
  const zone1 = H - 2.4 * U;
  const fit = fitBand(spec, R, zone1 - zone0);
  const center = (zone0 + zone1) / 2;
  const band = useMemo(
    () => bandGeometry({ radiusTop: R + LIFT, radiusBottom: R + LIFT, height: fit.h, width: fit.w, segments: 128, rows: 4 }),
    [R, fit.w, fit.h],
  );
  useDisposeOne(band);

  return (
    <group>
      {/* Canudo e vedação primeiro: o vidro translúcido é desenhado por cima. */}
      <mesh geometry={geo.straw} position={[strawX, strawBase, hole.z]} rotation-z={-tilt} renderOrder={1}>
        <meshPhysicalMaterial color="#eef6f3" roughness={0.05} clearcoat={1} transparent opacity={0.42} depthWrite={false} />
      </mesh>
      <mesh geometry={geo.gasket} position-y={lidY}>
        <meshStandardMaterial color="#efefe9" roughness={0.75} />
      </mesh>
      <mesh geometry={geo.glass} renderOrder={2}>
        <meshPhysicalMaterial color={spec.baseColor} roughness={0.5} clearcoat={0.35} clearcoatRoughness={0.4} transparent opacity={0.52} depthWrite={false} />
      </mesh>
      <ArtBand geometry={band} map={map} y={center} look="matte" overlay />
      <mesh geometry={geo.lid} position-y={lidY}>
        <meshStandardMaterial map={grain} roughness={0.62} />
      </mesh>
    </group>
  );
}

/**
 * Copo: inox térmico com tampa deslizante (padrão), travel mug com alça e tampa serrilhada ({travel})
 * ou vidro jateado formato lata com tampa de bambu e canudo ({glass}). Perfis torneados com cantos
 * boleados; a arte é uma faixa que acompanha o cone do copo sem distorcer.
 */
export function TumblerModel(props: ModelProps) {
  const { spec } = props;
  if (spec.variant === "glass" || spec.glass) return <GlassCan {...props} />;
  if (spec.variant === "travel" || spec.handle) return <SteelTumbler {...props} travel />;
  return <ThermalCup {...props} />;
}

// ---------------------------------------------------------------------------- garrafas: bichinhos

type Critter = {
  ears: "round" | "long" | "floppy";
  eyes: "dot" | "googly";
  snout: boolean;
  head: string;
  ear: string;
  inner: string;
  blush: boolean;
};

/** Pose sobre a cabeça (faixa cilíndrica + domo elíptico): posição na superfície e z local = normal. */
function headPose(radius: number, band: number, dome: number, x: number, y: number): Pose {
  let rho = radius;
  let ny = 0;
  if (y > band) {
    const s = Math.min((y - band) / dome, 0.995);
    const c = Math.sqrt(1 - s * s);
    rho = radius * c;
    const slope = -(radius * s) / (dome * c);
    ny = -slope / Math.sqrt(1 + slope * slope);
  }
  const z = Math.sqrt(Math.max(rho * rho - x * x, 0));
  return { position: [x, y, z], rotation: [-Math.asin(ny), Math.atan2(x, z), 0, "YXZ"] };
}

/** Tampa-cabeça de bichinho: domo torneado com orelhas, olhos com brilho, focinho, bochechas e sorriso. */
function CritterHead({ radius, band, dome, critter }: { radius: number; band: number; dome: number; critter: Critter }) {
  const long = critter.ears === "long";
  const geo = useMemo(() => {
    const cap: Pt[] = [];
    for (let i = 1; i <= 24; i += 1) {
      const t = (i / 24) * (Math.PI / 2);
      cap.push([i === 24 ? 0 : radius * Math.cos(t), band + dome * Math.sin(t)]);
    }
    return {
      head: lathe(joinProfile(filleted([[0, 0], [radius, 0, 0.12 * U], [radius, band]]), cap), 96),
      sphere: new THREE.SphereGeometry(1, 32, 20),
      smile: new THREE.TorusGeometry(0.34 * U, 0.06 * U, 8, 24, Math.PI),
      ear: long ? new THREE.CapsuleGeometry(0.55 * U, 2.6 * U, 8, 16) : null,
      innerEar: long ? new THREE.CapsuleGeometry(0.3 * U, 2.0 * U, 8, 12) : null,
    };
  }, [radius, band, dome, long]);
  useDispose(geo);

  const head: Finish = { color: critter.head, metalness: 0, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.15 };
  const earFinish: Finish = { ...head, color: critter.ear };
  const eyeY = band + dome * 0.16;
  const eyeX = radius * 0.36;
  const faceY = band - radius * 0.12;
  const sides = [-1, 1] as const;
  const pose = (x: number, y: number) => headPose(radius, band, dome, x, y);
  const roundEarY = band + dome * Math.sqrt(1 - 0.62 * 0.62);
  const floppyRootY = band + dome * 0.55;
  // O focinho do cachorro desce um pouco para não encostar nos olhos grandes.
  const nose = pose(0, critter.snout ? faceY - 0.4 * U : faceY);
  const earGeo = geo.ear;
  const innerEarGeo = geo.innerEar;

  return (
    <group>
      <mesh geometry={geo.head}>
        <FinishMaterial finish={head} />
      </mesh>

      {critter.ears === "round" &&
        sides.map((s) => (
          <group key={s} position={[s * radius * 0.62, roundEarY, 0]} rotation-z={-s * 0.45}>
            <mesh geometry={geo.sphere} scale={[0.95 * U, 0.95 * U, 0.42 * U]}>
              <FinishMaterial finish={earFinish} />
            </mesh>
            <mesh geometry={geo.sphere} position={[0, -0.05 * U, 0.26 * U]} scale={[0.56 * U, 0.56 * U, 0.2 * U]}>
              <meshPhysicalMaterial color={critter.inner} roughness={0.45} clearcoat={0.4} />
            </mesh>
          </group>
        ))}
      {earGeo &&
        innerEarGeo &&
        sides.map((s) => (
          <group key={s} position={[s * radius * 0.33, band + dome * 0.93, -0.1 * U]} rotation={[-0.12, 0, -s * (s < 0 ? 0.24 : 0.14)]}>
            <mesh geometry={earGeo} position-y={1.6 * U} scale={[1, 1, 0.45]}>
              <FinishMaterial finish={earFinish} />
            </mesh>
            <mesh geometry={innerEarGeo} position={[0, 1.7 * U, 0.17 * U]} scale={[1, 1, 0.4]}>
              <meshPhysicalMaterial color={critter.inner} roughness={0.45} clearcoat={0.4} />
            </mesh>
          </group>
        ))}
      {critter.ears === "floppy" &&
        sides.map((s) => (
          // Orelha caída por fora da cabeça (antes ficava quase toda enterrada): raiz junto ao domo, ponta para fora.
          <mesh key={s} geometry={geo.sphere} position={[s * (radius + 0.12 * U), floppyRootY - 1.35 * U, -0.15 * U]} rotation-z={s * 0.42} scale={[0.78 * U, 1.5 * U, 0.34 * U]}>
            <FinishMaterial finish={earFinish} />
          </mesh>
        ))}

      {/* Olhos: pontinhos brilhantes ou olhos "malucos" de plástico com pupilas desencontradas. */}
      {sides.map((s) => {
        const p = pose(s * eyeX, eyeY);
        if (critter.eyes === "googly") {
          const size = s < 0 ? 1.08 : 0.84;
          const look: [number, number] = s < 0 ? [0.2, 0.16] : [-0.12, -0.2];
          return (
            <group key={s} position={p.position} rotation={p.rotation}>
              <mesh geometry={geo.sphere} scale={[0.6 * U * size, 0.6 * U * size, 0.3 * U]}>
                <meshPhysicalMaterial color="#fbfbf8" roughness={0.15} clearcoat={1} />
              </mesh>
              <mesh geometry={geo.sphere} position={[look[0] * U * size, look[1] * U * size, 0.25 * U]} scale={[0.27 * U * size, 0.27 * U * size, 0.1 * U]}>
                <meshPhysicalMaterial color="#060607" roughness={0.1} clearcoat={1} />
              </mesh>
            </group>
          );
        }
        return (
          <group key={s} position={p.position} rotation={p.rotation}>
            <mesh geometry={geo.sphere} scale={[0.32 * U, 0.4 * U, 0.2 * U]}>
              <meshPhysicalMaterial color="#0b0b0d" roughness={0.08} clearcoat={1} />
            </mesh>
            <mesh geometry={geo.sphere} position={[0.1 * U, 0.14 * U, 0.17 * U]} scale={0.09 * U}>
              <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.6} />
            </mesh>
          </group>
        );
      })}

      {critter.blush &&
        sides.map((s) => {
          const p = pose(s * radius * 0.6, faceY + 0.05 * U);
          return (
            <mesh key={s} geometry={geo.sphere} position={p.position} rotation={p.rotation} scale={[0.42 * U, 0.27 * U, 0.08 * U]}>
              <meshStandardMaterial color="#ff9db2" roughness={0.6} />
            </mesh>
          );
        })}

      <group position={nose.position} rotation={nose.rotation}>
        {critter.snout ? (
          <>
            <mesh geometry={geo.sphere} position-z={-0.1 * U} scale={[0.95 * U, 0.62 * U, 0.5 * U]}>
              <meshPhysicalMaterial color="#f4efe6" roughness={0.4} clearcoat={0.5} />
            </mesh>
            <mesh geometry={geo.sphere} position={[0, 0.28 * U, 0.38 * U]} scale={[0.32 * U, 0.22 * U, 0.18 * U]}>
              <meshPhysicalMaterial color="#09090a" roughness={0.1} clearcoat={1} />
            </mesh>
            <mesh geometry={geo.smile} position={[0, -0.2 * U, 0.33 * U]} rotation-z={Math.PI}>
              <meshStandardMaterial color="#2a1a14" roughness={0.6} />
            </mesh>
          </>
        ) : (
          <>
            <mesh geometry={geo.sphere} scale={[0.22 * U, 0.16 * U, 0.12 * U]}>
              <meshPhysicalMaterial color={critter.ears === "long" ? "#ff8fae" : "#3a2620"} roughness={0.3} clearcoat={0.8} />
            </mesh>
            <mesh geometry={geo.smile} position={[0, -0.32 * U, 0]} rotation-z={Math.PI} scale={0.85}>
              <meshStandardMaterial color="#2a1a14" roughness={0.6} />
            </mesh>
          </>
        )}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- garrafas: corpos

function thermalProfile(r: number, h: number, neck: number, shoulder: number): Pt[] {
  return filleted([
    [0, 0.3 * U],
    [r - 0.5 * U, 0.3 * U, 0.2 * U],
    [r - 0.35 * U, 0, 0.12 * U],
    [r - 0.05 * U, 0, 0.25 * U],
    [r, 0.55 * U, 0.3 * U],
    [r, h - shoulder, shoulder * 0.9],
    [neck, h - 0.8 * U, 0.6 * U],
    [neck, h, 0.05 * U],
    [0, h],
  ]);
}

// Garrafa cola (contorno clássico): base bojuda, cintura, área de rótulo e gargalo longo. Em cm.
const COLA_CM: Pt[] = [
  [0, 0.25],
  [2.7, 0],
  [3.45, 0.45],
  [3.72, 2.4],
  [3.42, 5.4],
  [3.52, 9],
  [3.6, 13],
  [3.5, 16.6],
  [3.05, 19.2],
  [2.0, 22.2],
  [1.55, 23.6],
  [1.55, 25],
];

function colaProfile(): Pt[] {
  return joinProfile(
    smoothProfile(
      COLA_CM.map(([x, y]) => [x * U, y * U]),
      120,
    ),
    [[0, 25 * U]],
  );
}

type ThermalStyle = "bamboo" | "cola" | "bunny" | "dog";

const THERMAL = {
  classic: { r: 3.5, h: 21, neck: 2.3, shoulder: 2.6 },
  cola: { r: 3.7, h: 25, neck: 1.55, shoulder: 0 },
  kid: { r: 3.3, h: 15, neck: 2.4, shoulder: 2.2 },
};

/**
 * Garrafa térmica inox de ombro arredondado: tampa de bambu com anel polido, contorno "cola" com tampinha
 * serrilhada, ou infantil com tampa de bichinho (coelhinho em degradê, cachorro maluco). A térmica reta com
 * sensor de temperatura é a SensorBottle.
 */
function ThermalBottle({ spec, art, label, style }: ModelProps & { style: ThermalStyle }) {
  const kid = style === "bunny" || style === "dog";
  const dims = style === "cola" ? THERMAL.cola : kid ? THERMAL.kid : THERMAL.classic;
  const r = dims.r * U;
  const H = dims.h * U;

  const geo = useMemo(() => {
    const d = style === "cola" ? THERMAL.cola : style === "bunny" || style === "dog" ? THERMAL.kid : THERMAL.classic;
    const profile = style === "cola" ? colaProfile() : thermalProfile(d.r * U, d.h * U, d.neck * U, d.shoulder * U);
    const capR = d.neck * U + 0.3 * U;
    return {
      body: lathe(profile, 128),
      ring: lathe(
        filleted([
          [0, 0],
          [d.neck * U + 0.12 * U, 0, 0.04 * U],
          [d.neck * U + 0.12 * U, 0.5 * U, 0.04 * U],
          [0, 0.5 * U],
        ]),
        96,
      ),
      cap: style === "bamboo" ? discGeometry(capR, 4.2 * U, 0.5 * U) : style === "cola" ? ribbedRing(1.8 * U, 2.0 * U, 56, 0.06 * U) : null,
      capTop:
        style === "cola"
          ? lathe(
              filleted([
                [0, 0],
                [1.72 * U, 0],
                [1.72 * U, 0.22 * U, 0.15 * U],
                [0, 0.3 * U],
              ]),
              72,
            )
          : null,
    };
  }, [style]);
  useDispose(geo);

  const wood = spec.accentColor ?? BAMBOO;
  const textures = useMemo(
    () => ({
      grain: style === "bamboo" ? bambooTexture(wood) : null,
      gradient: style === "bunny" ? gradientTexture(spec.baseColor, mix(spec.baseColor, "#a98be6", 0.75)) : null,
    }),
    [style, wood, spec.baseColor],
  );
  useDispose(textures);

  const finish = coatFinish(spec);
  const map = useDecalArt(spec, art, label);
  const zone0 = (style === "cola" ? 4.4 : 1.0) * U;
  const zone1 = style === "cola" ? 18.2 * U : H - dims.shoulder * U - 0.9 * U;
  const wall = style === "cola" ? 3.3 * U : r;
  const fit = spec.thermal ? thermalBand(spec, wall, zone1 - zone0) : fitBand(spec, wall, zone1 - zone0);
  const center = (zone0 + zone1) / 2;
  const band = useMemo(() => {
    if (style === "cola") {
      const profile = colaProfile();
      return bandGeometry({ radiusTop: 0, radiusBottom: 0, height: fit.h, width: fit.w, segments: 128, rows: 40, radiusAt: (y) => radiusOnProfile(profile, center + y) + LIFT });
    }
    const radius = (style === "bunny" || style === "dog" ? THERMAL.kid.r : THERMAL.classic.r) * U + LIFT;
    return bandGeometry({ radiusTop: radius, radiusBottom: radius, height: fit.h, width: fit.w, segments: 128, rows: 4 });
  }, [style, fit.w, fit.h, center]);
  useDisposeOne(band);

  const capFinish: Finish = spec.accentColor ? plasticFinish(spec.accentColor, 0.38) : finish;
  const critter: Critter | null =
    style === "bunny"
      ? { ears: "long", eyes: "dot", snout: false, head: spec.accentColor ?? mix(spec.baseColor, "#a98be6", 0.75), ear: spec.accentColor ?? mix(spec.baseColor, "#a98be6", 0.75), inner: "#ffc4d6", blush: true }
      : style === "dog"
        ? { ears: "floppy", eyes: "googly", snout: true, head: spec.accentColor ?? spec.baseColor, ear: "#7b4f2e", inner: "#f2c9b0", blush: false }
        : null;

  return (
    <group>
      <mesh geometry={geo.body}>
        <FinishMaterial finish={textures.gradient ? { ...finish, metalness: 0, roughness: 0.2, clearcoat: 1 } : finish} map={textures.gradient} />
      </mesh>
      <ArtBand geometry={band} map={map} y={center} look={printLook(spec, finish)} />
      {style !== "cola" && !critter && (
        <mesh geometry={geo.ring} position-y={H - 1.0 * U}>
          <SteelMaterial />
        </mesh>
      )}
      {style === "bamboo" && geo.cap && (
        <mesh geometry={geo.cap} position-y={H - 0.5 * U}>
          <meshStandardMaterial map={textures.grain} roughness={0.62} />
        </mesh>
      )}
      {style === "cola" && geo.cap && geo.capTop && (
        <group position-y={H - 1.7 * U}>
          <mesh geometry={geo.cap}>{spec.accentColor ? <FinishMaterial finish={capFinish} /> : <SteelMaterial roughness={0.3} />}</mesh>
          <mesh geometry={geo.capTop} position-y={2.0 * U}>
            {spec.accentColor ? <FinishMaterial finish={capFinish} /> : <SteelMaterial roughness={0.3} />}
          </mesh>
        </group>
      )}
      {critter && (
        <group position-y={H - 0.7 * U}>
          <CritterHead radius={r - 0.02 * U} band={1.5 * U} dome={2.3 * U} critter={critter} />
        </group>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------- garrafa térmica com sensor

/**
 * Garrafa térmica de 500 ml com sensor de temperatura (cm, das fotos da 396): cilindro reto pintado, gargalo de inox
 * polido e tampa do mesmo diâmetro com o visor de LED no topo (vidro preto).
 */
const SENSOR_CM = { r: 3.4, body: 19, neckR: 2.75, neckIn: 2.38, neckTop: 20.4, cap: 4.3, glass: 2.85 };

/** Sete segmentos de cada dígito do visor (a, b, c, d, e, f, g). */
const SEGMENTS: Record<string, string> = { "2": "abged", "8": "abcdefg", C: "afed" };

/** Visor da tampa: "28°C" em LED de sete segmentos sobre fundo transparente (a temperatura das fotos do produto). */
export function sensorDisplayTexture() {
  const w = 512;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const ctx = canvas.getContext("2d");
  if (!ctx) return texture;
  ctx.strokeStyle = "#e9f8ff";
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(120,215,255,0.9)";
  ctx.shadowBlur = 14;
  const digit = (char: string, x: number, y: number, dw: number, dh: number, t: number) => {
    const half = dh / 2;
    const ends: Record<string, [number, number, number, number]> = {
      a: [x, y, x + dw, y],
      b: [x + dw, y, x + dw, y + half],
      c: [x + dw, y + half, x + dw, y + dh],
      d: [x, y + dh, x + dw, y + dh],
      e: [x, y + half, x, y + dh],
      f: [x, y, x, y + half],
      g: [x, y + half, x + dw, y + half],
    };
    ctx.lineWidth = t;
    for (const s of SEGMENTS[char] ?? "") {
      const [x0, y0, x1, y1] = ends[s];
      // Segmentos separados por um respiro nas pontas, como no LED de verdade.
      const gap = t * 0.75;
      const len = Math.hypot(x1 - x0, y1 - y0);
      const ux = (x1 - x0) / len;
      const uy = (y1 - y0) / len;
      ctx.beginPath();
      ctx.moveTo(x0 + ux * gap, y0 + uy * gap);
      ctx.lineTo(x1 - ux * gap, y1 - uy * gap);
      ctx.stroke();
    }
  };
  digit("2", 118, 66, 70, 124, 15);
  digit("8", 230, 66, 70, 124, 15);
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(338, 76, 9, 0, Math.PI * 2);
  ctx.stroke();
  digit("C", 362, 120, 36, 66, 9);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Garrafa térmica com sensor (396): cilindro reto pintado (preta, branca, dourada) com o adesivo DTF U.V. na frente,
 * aberta como nas fotos do produto: gargalo de inox polido à mostra e a tampa deitada ao lado, com o visor de
 * temperatura virado para a câmera.
 */
function SensorBottle({ spec, art, label }: ModelProps) {
  const s = SENSOR_CM;
  const geo = useMemo(() => {
    const c = SENSOR_CM;
    const R = c.r * U;
    const top = c.body * U;
    const n = c.neckR * U;
    return {
      body: lathe(
        filleted([
          [0, 0.3 * U],
          [R - 0.55 * U, 0.3 * U, 0.2 * U],
          [R - 0.38 * U, 0, 0.12 * U],
          [R - 0.05 * U, 0, 0.35 * U],
          [R, 0.5 * U],
          [R, top, 0.32 * U],
          [n + 0.08 * U, top, 0.06 * U],
          [n + 0.08 * U, top - 0.2 * U],
          [0, top - 0.2 * U],
        ]),
        128,
      ),
      neck: lathe(
        filleted([
          [n - 0.02 * U, top - 0.3 * U],
          [n, top - 0.2 * U],
          [n, c.neckTop * U, 0.12 * U],
          [c.neckIn * U, c.neckTop * U, 0.12 * U],
          [c.neckIn * U, c.neckTop * U - 2.2 * U, 0.3 * U],
          [0, c.neckTop * U - 2.3 * U],
        ]),
        128,
      ),
      // Tampa em pé no próprio eixo (topo em y = cap); deitada no render.
      cap: lathe(
        filleted([
          [0, 0.4 * U],
          [R - 0.3 * U, 0.4 * U, 0.1 * U],
          [R - 0.3 * U, 0, 0.08 * U],
          [R, 0, 0.1 * U],
          [R, c.cap * U, 0.55 * U],
          [c.glass * U + 0.1 * U, c.cap * U, 0.05 * U],
          [c.glass * U + 0.1 * U, c.cap * U - 0.05 * U],
          [0, c.cap * U - 0.05 * U],
        ]),
        96,
      ),
      glass: new THREE.CircleGeometry(c.glass * U, 64),
    };
  }, []);
  useDispose(geo);
  const display = useMemo(() => sensorDisplayTexture(), []);
  useDisposeOne(display);
  const studio = useStudioReflection();

  const finish = coatFinish(spec);
  const env = spec.metal !== "none" ? studio : null;
  const map = useDecalArt(spec, art, label);
  const R = s.r * U;
  const zone0 = 3 * U;
  const zone1 = (s.body - 1.2) * U;
  const fit = spec.thermal ? thermalBand(spec, R, zone1 - zone0) : fitBand(spec, R, zone1 - zone0);
  const center = (zone0 + zone1) / 2;
  const band = useMemo(() => bandGeometry({ radiusTop: R + LIFT, radiusBottom: R + LIFT, height: fit.h, width: fit.w, segments: 128, rows: 4 }), [R, fit.w, fit.h]);
  useDisposeOne(band);
  const capH = s.cap * U;
  return (
    <group>
      <mesh geometry={geo.body}>
        <FinishMaterial finish={finish} env={env} />
      </mesh>
      <mesh geometry={geo.neck}>
        <SteelMaterial env={studio} roughness={0.1} />
      </mesh>
      <ArtBand geometry={band} map={map} y={center} look="gloss" />
      {/* Tampa deitada à direita, eixo para a câmera: o visor fica de frente. */}
      <group position={[R * 2 + 0.7 * U, R, 0.4 * U - capH / 2]} rotation-x={Math.PI / 2}>
        <mesh geometry={geo.cap}>
          <FinishMaterial finish={finish} env={env} />
        </mesh>
        <mesh geometry={geo.glass} position-y={capH - 0.04 * U} rotation-x={-Math.PI / 2}>
          <meshPhysicalMaterial color="#07080a" roughness={0.06} clearcoat={1} clearcoatRoughness={0.03} envMap={studio} envMapIntensity={0.6} />
        </mesh>
        <mesh geometry={geo.glass} position-y={capH - 0.035 * U} rotation-x={-Math.PI / 2} scale={0.62}>
          <meshBasicMaterial map={display} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

type SportCap = "push" | "loop" | "ball" | "spout";

const SPORTS_CM = { r: 3.65, h: 21.5, neck: 1.75 };
/** Mosquetão de 6,5 cm: meia-largura, meia-altura e raio do arame. */
const CARABINER = { a: 1.45 * U, b: 2.8 * U, wire: 0.28 * U };

/** Squeeze de alumínio: ombro longo, tampa de rosca serrilhada e bico push-pull, alça com mosquetão, bola ou bico dobrável. */
function SportsBottle({ spec, art, label, cap }: ModelProps & { cap: SportCap }) {
  const r = SPORTS_CM.r * U;
  const H = SPORTS_CM.h * U;
  const collarY = H - 1.6 * U;
  const collarH = 1.8 * U;
  const capTopY = collarY + collarH;

  const geo = useMemo(() => {
    const R = SPORTS_CM.r * U;
    const h = SPORTS_CM.h * U;
    const n = SPORTS_CM.neck * U;
    const body = lathe(
      joinProfile(
        filleted([
          [0, 0.35 * U],
          [R - 0.55 * U, 0.35 * U, 0.25 * U],
          [R - 0.4 * U, 0, 0.15 * U],
          [R - 0.05 * U, 0, 0.3 * U],
          [R, 0.6 * U, 0.35 * U],
          [R, h - 6.4 * U],
        ]),
        smoothProfile(
          [
            [R, h - 6.4 * U],
            [R, h - 5.4 * U],
            [R * 0.94, h - 4.0 * U],
            [R * 0.68, h - 2.7 * U],
            [n + 0.12 * U, h - 1.75 * U],
            [n, h - 1.3 * U],
          ],
          40,
        ),
        [
          [n, h],
          [0, h],
        ],
      ),
      128,
    );
    const capR = n + 0.35 * U;
    const dome =
      cap === "push"
        ? filleted([
            [0, 0],
            [capR - 0.05 * U, 0, 0.05 * U],
            [capR - 0.05 * U, 0.3 * U, 0.25 * U],
            [1.25 * U, 1.25 * U, 0.4 * U],
            [1.05 * U, 1.6 * U, 0.1 * U],
            [0, 1.6 * U],
          ])
        : filleted([
            [0, 0],
            [capR - 0.05 * U, 0, 0.05 * U],
            [capR - 0.05 * U, 0.35 * U, 0.3 * U],
            [capR - 0.5 * U, 0.85 * U, 0.35 * U],
            [0, 0.95 * U],
          ]);
    return {
      body,
      collar: ribbedRing(capR, 1.8 * U, 40, 0.08 * U),
      dome: lathe(dome, 96),
      nozzle:
        cap === "push"
          ? lathe(
              filleted([
                [0, 0],
                [0.8 * U, 0],
                [0.8 * U, 0.8 * U, 0.1 * U],
                [0.6 * U, 1.5 * U, 0.3 * U],
                [0.26 * U, 1.66 * U, 0.1 * U],
                [0, 1.66 * U],
              ]),
              64,
            )
          : cap === "spout"
            ? lathe(
                filleted([
                  [0, 0],
                  [0.55 * U, 0],
                  [0.46 * U, 2.4 * U, 0.2 * U],
                  [0.3 * U, 2.6 * U, 0.1 * U],
                  [0, 2.6 * U],
                ]),
                48,
              )
            : null,
      hinge: cap === "spout" ? roundedSlab(1.5 * U, 1.2 * U, 0.5 * U, 0.3 * U) : null,
      carabiner: cap === "loop" ? carabinerGeometry(CARABINER.a, CARABINER.b, CARABINER.wire) : null,
    };
  }, [cap]);
  useDispose(geo);

  const finish = coatFinish(spec);
  const map = useDecalArt(spec, art, label);
  const zone0 = 1.0 * U;
  const zone1 = H - 6.5 * U;
  const fit = spec.thermal ? thermalBand(spec, r, zone1 - zone0) : fitBand(spec, r, zone1 - zone0);
  const center = (zone0 + zone1) / 2;
  const band = useMemo(
    () => bandGeometry({ radiusTop: SPORTS_CM.r * U + LIFT, radiusBottom: SPORTS_CM.r * U + LIFT, height: fit.h, width: fit.w, segments: 128, rows: 4 }),
    [fit.w, fit.h],
  );
  useDisposeOne(band);

  const capColor = spec.accentColor ?? INK;
  const capFinish = plasticFinish(capColor, 0.36);
  const contrast = luminance(capColor) < 0.5 ? "#ececea" : INK;
  const archR = 1.0 * U;
  const archBase = capTopY + 0.6 * U;
  const archY = archBase + archR;
  const spoutTop = capTopY + 0.5 * U;

  return (
    <group>
      <mesh geometry={geo.body}>
        <FinishMaterial finish={finish} />
      </mesh>
      <ArtBand geometry={band} map={map} y={center} look={printLook(spec, finish)} />
      <mesh geometry={geo.collar} position-y={collarY}>
        <FinishMaterial finish={{ ...capFinish, roughness: 0.5 }} />
      </mesh>
      <mesh geometry={geo.dome} position-y={capTopY - 0.02 * U}>
        <FinishMaterial finish={capFinish} />
      </mesh>

      {cap === "push" && geo.nozzle && (
        <group position-y={capTopY + 1.4 * U}>
          <mesh geometry={geo.nozzle}>
            <FinishMaterial finish={plasticFinish(contrast, 0.3)} />
          </mesh>
          <mesh position-y={1.665 * U} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[0.2 * U, 24]} />
            <meshStandardMaterial color="#050506" roughness={0.9} />
          </mesh>
        </group>
      )}

      {cap === "ball" && (
        <group position-y={capTopY + 0.7 * U}>
          <mesh position-y={1.45 * U}>
            <sphereGeometry args={[1.55 * U, 48, 32]} />
            <FinishMaterial finish={{ ...capFinish, roughness: 0.25, clearcoat: 0.8 }} />
          </mesh>
        </group>
      )}

      {cap === "spout" && geo.nozzle && geo.hinge && (
        <group position={[0, spoutTop, -0.7 * U]}>
          <mesh geometry={geo.hinge} position={[0, -0.05 * U, 0]}>
            <FinishMaterial finish={capFinish} />
          </mesh>
          {/* Bico dobrável aberto, inclinado para a frente. */}
          <group position-y={0.35 * U} rotation-x={0.45}>
            <mesh geometry={geo.nozzle}>
              <FinishMaterial finish={plasticFinish(contrast, 0.3)} />
            </mesh>
            <mesh position-y={2.605 * U} rotation-x={-Math.PI / 2}>
              <circleGeometry args={[0.16 * U, 20]} />
              <meshStandardMaterial color="#050506" roughness={0.9} />
            </mesh>
          </group>
        </group>
      )}

      {cap === "loop" && geo.carabiner && (
        <>
          {/* Alça em arco sobre a tampa; o mosquetão passa por ela e tomba para trás. */}
          <mesh position-y={archBase}>
            <torusGeometry args={[archR, 0.3 * U, 12, 40, Math.PI]} />
            <FinishMaterial finish={capFinish} />
          </mesh>
          {/* Pivô no topo do arco: a curva de baixo do mosquetão passa por dentro dele. */}
          <group position-y={archY} rotation={[-0.3, 0, 0.15]}>
            <group rotation-y={Math.PI / 2} position-y={CARABINER.b - 0.7 * U}>
              <mesh geometry={geo.carabiner}>
                <meshStandardMaterial color="#34373d" metalness={0.85} roughness={0.28} />
              </mesh>
              {/* Trava (gate) no lado reto do D. */}
              <mesh position-x={-(CARABINER.a * 0.5 + 0.06 * U)}>
                <cylinderGeometry args={[0.16 * U, 0.16 * U, CARABINER.b * 1.05, 12]} />
                <SteelMaterial roughness={0.22} />
              </mesh>
            </group>
          </group>
        </>
      )}
    </group>
  );
}

const THERMO_CM = { r: 3.6, h: 19, neck: 2.9, cup: 6.4 };

/** Garrafa térmica com copo: o copo invertido serve de tampa, separado do corpo por um anel polido. */
function ThermoCupBottle({ spec, art, label }: ModelProps) {
  const r = THERMO_CM.r * U;
  const H = THERMO_CM.h * U;
  const cupY = H - 1.3 * U;
  const geo = useMemo(() => {
    const R = THERMO_CM.r * U;
    const cupR = R + 0.1 * U;
    const cupH = THERMO_CM.cup * U;
    return {
      body: lathe(thermalProfile(R, THERMO_CM.h * U, THERMO_CM.neck * U, 1.4 * U), 128),
      ring: lathe(
        filleted([
          [0, 0],
          [R + 0.03 * U, 0, 0.03 * U],
          [R + 0.03 * U, 0.4 * U, 0.03 * U],
          [0, 0.4 * U],
        ]),
        96,
      ),
      cup: lathe(
        filleted([
          [0, 0.05 * U],
          [cupR, 0, 0.06 * U],
          [cupR, 0.5 * U, 0.04 * U],
          [cupR - 0.07 * U, 0.6 * U, 0.03 * U],
          [cupR - 0.07 * U, 0.78 * U, 0.03 * U],
          [cupR, 0.88 * U, 0.04 * U],
          [cupR - 0.25 * U, cupH, 0.7 * U],
          [0, cupH],
        ]),
        128,
      ),
    };
  }, []);
  useDispose(geo);

  const finish = coatFinish(spec);
  const map = useDecalArt(spec, art, label);
  const zone0 = 0.9 * U;
  const zone1 = cupY - 0.9 * U;
  const fit = spec.thermal ? thermalBand(spec, r, zone1 - zone0) : fitBand(spec, r, zone1 - zone0);
  const center = (zone0 + zone1) / 2;
  const band = useMemo(
    () => bandGeometry({ radiusTop: THERMO_CM.r * U + LIFT, radiusBottom: THERMO_CM.r * U + LIFT, height: fit.h, width: fit.w, segments: 128, rows: 4 }),
    [fit.w, fit.h],
  );
  useDisposeOne(band);
  const cupFinish: Finish = { color: spec.accentColor ?? INK, metalness: 0.05, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.3 };

  return (
    <group>
      <mesh geometry={geo.body}>
        <FinishMaterial finish={finish} />
      </mesh>
      <ArtBand geometry={band} map={map} y={center} look={printLook(spec, finish)} />
      <mesh geometry={geo.ring} position-y={cupY - 0.4 * U}>
        <SteelMaterial />
      </mesh>
      <mesh geometry={geo.cup} position-y={cupY}>
        <FinishMaterial finish={cupFinish} />
      </mesh>
    </group>
  );
}

const KIDS_CM = { r: 3.5, h: 13.5, neck: 2.6 };

/** Garrafa plástica infantil: corpo baixinho e bojudo com tampa-cabeça de bichinho (orelhas redondas). */
function KidsBottle({ spec, art, label }: ModelProps) {
  const r = KIDS_CM.r * U;
  const H = KIDS_CM.h * U;
  const geo = useMemo(() => {
    const R = KIDS_CM.r * U;
    const h = KIDS_CM.h * U;
    const n = KIDS_CM.neck * U;
    return {
      body: lathe(
        filleted([
          [0, 0.3 * U],
          [R - 0.7 * U, 0, 0.5 * U],
          [R, 1.2 * U, 1.0 * U],
          [R, h - 2.0 * U, 1.4 * U],
          [n, h - 0.4 * U, 0.5 * U],
          [n, h, 0.05 * U],
          [0, h],
        ]),
        128,
      ),
    };
  }, []);
  useDispose(geo);

  const finish = coatFinish(spec);
  const map = useDecalArt(spec, art, label);
  const zone0 = 1.5 * U;
  const zone1 = H - 2.4 * U;
  const fit = spec.thermal ? thermalBand(spec, r, zone1 - zone0) : fitBand(spec, r, zone1 - zone0);
  const center = (zone0 + zone1) / 2;
  const band = useMemo(
    () => bandGeometry({ radiusTop: KIDS_CM.r * U + LIFT, radiusBottom: KIDS_CM.r * U + LIFT, height: fit.h, width: fit.w, segments: 128, rows: 4 }),
    [fit.w, fit.h],
  );
  useDisposeOne(band);

  const headColor = spec.accentColor ?? "#8fd14f";
  const critter: Critter = { ears: "round", eyes: "dot", snout: false, head: headColor, ear: headColor, inner: mix(headColor, "#ffffff", 0.55), blush: true };
  return (
    <group>
      <mesh geometry={geo.body}>
        <FinishMaterial finish={spec.metal === "none" ? { ...finish, roughness: Math.max(finish.roughness, 0.28) } : finish} />
      </mesh>
      <ArtBand geometry={band} map={map} y={center} look={printLook(spec, finish)} />
      <group position-y={H - 0.8 * U}>
        <CritterHead radius={r - 0.15 * U} band={1.7 * U} dome={2.6 * U} critter={critter} />
      </group>
    </group>
  );
}

/**
 * Garrafa: squeeze de alumínio ({sports}: bico push-pull; com mosquetão, tampa bola ou bico dobrável),
 * térmica inox (rosca com anel polido, tampa de bambu, contorno cola, tampas de coelhinho e cachorro),
 * térmica com copo ({thermo-cup}) e plástica infantil com tampa de rostinho ({kids}). Corpos torneados
 * com ombro suave; a arte é uma faixa sem distorção na frente.
 */
export function BottleModel(props: ModelProps) {
  const { spec } = props;
  const variant = spec.variant ?? "";
  if (variant === "kids") return <KidsBottle {...props} />;
  if (variant === "thermo-cup") return <ThermoCupBottle {...props} />;
  if (variant.startsWith("sports") || (spec.carabiner && !variant)) {
    const cap: SportCap = spec.carabiner ? "loop" : variant === "sports-ball" ? "ball" : variant === "sports-spout" ? "spout" : "push";
    return <SportsBottle {...props} cap={cap} />;
  }
  const style: ThermalStyle | null =
    variant === "bunny" ? "bunny" : variant === "dog" ? "dog" : variant === "cola" ? "cola" : spec.accentColor === BAMBOO || variant === "bamboo" ? "bamboo" : null;
  return style ? <ThermalBottle {...props} style={style} /> : <SensorBottle {...props} />;
}
