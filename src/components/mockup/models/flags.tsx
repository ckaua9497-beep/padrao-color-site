"use client";

// Bandeiras, wind banners, wind ball e as bases/hastes vendidas avulsas.

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { formatSize, type FlagStyle } from "@/lib/mockup";
import { dropPath, featherPath, knifePath, sailPath, type ArtRender } from "../art";
import { useAnimate } from "../viewer-hooks";
import { useGeometriesCleanup } from "./fabric";
import { inflatedSurface } from "./inflate";
import { backArtOf, makeShape, metalColor, useArtTexture, type ModelProps } from "./shared";
import { lathe, smoothProfile, type Pt } from "./vessel";

/*
 * Escala real: 1 unidade de cena = 1 m. O tecido é uma malha plana recortada no contorno do modelo
 * (inflatedSurface com altura zero) e com UV na mesma proporção da arte. Bainha da haste, costuras,
 * bainha da borda e elástico de baixo são malhas próprias que recebem o MESMO deslocamento de vento
 * do tecido (função da distância até a haste), então tudo ondula junto sem descolar.
 */
const CM = 0.01;
const TAU = Math.PI * 2;
const SLEEVE_COLOR = "#141416";
/** Haste de alumínio do wind banner (Ø 21 mm). */
const POLE_R = 0.0105;
/** Passo do pesponto (ponto + intervalo). */
const STITCH_PITCH = 0.011;
const THREAD = 0.0011;

type Vec3 = [number, number, number];

function clamp(value: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Number.isFinite(value) ? value : lo));
}

/** Contorno do tecido de cada modelo de wind banner (máscaras 2D equivalentes às curvas abaixo). */
export const FLAG_SHAPES = { pena: featherPath, faca: knifePath, gota: dropPath, vela: sailPath };

// ---------------------------------------------------------------------------- contornos

type Segment = THREE.Curve<THREE.Vector2>;

const v2 = (p: Pt) => new THREE.Vector2(p[0], p[1]);
const line = (a: Pt, b: Pt): Segment => new THREE.LineCurve(v2(a), v2(b));
const quad = (a: Pt, c: Pt, b: Pt): Segment => new THREE.QuadraticBezierCurve(v2(a), v2(c), v2(b));
const cubic = (a: Pt, c1: Pt, c2: Pt, b: Pt): Segment => new THREE.CubicBezierCurve(v2(a), v2(c1), v2(c2), v2(b));

type Outline = {
  /** Contorno normalizado (x da haste para a ponta, y de baixo para cima), em sentido horário. */
  segments: Segment[];
  /** Bainha da haste: segmentos inteiros cobertos e fração do seguinte. */
  sleeve: [number, number];
  /** Canto de baixo preso à haste pelo elástico. */
  tie: Pt;
};

/** Mesmas silhuetas dos paths do canvas (art.ts), com os cantos por onde a haste dobra arredondados. */
function outlineOf(style: FlagStyle): Outline {
  switch (style) {
    case "faca":
      return {
        segments: [line([0, 0], [0, 0.78]), quad([0, 0.78], [0, 0.861], [0.14, 0.888]), line([0.14, 0.888], [0.72, 1]), quad([0.72, 1], [1, 1], [1, 0.9]), line([1, 0.9], [0.86, 0]), line([0.86, 0], [0, 0])],
        sleeve: [3, 0],
        tie: [0.86, 0],
      };
    case "gota":
      return {
        segments: [line([0, 0], [0, 0.7]), cubic([0, 0.7], [0, 1.05], [1.05, 1.02], [0.92, 0.64]), quad([0.92, 0.64], [0.8, 0.25], [0.32, 0]), line([0.32, 0], [0, 0])],
        sleeve: [1, 0.82],
        tie: [0.32, 0],
      };
    case "vela":
      return {
        segments: [line([0, 0], [0, 0.88]), quad([0, 0.88], [0, 1], [0.2, 0.97]), quad([0.2, 0.97], [0.92, 0.86], [1, 0]), line([1, 0], [0, 0])],
        sleeve: [2, 0.42],
        tie: [1, 0],
      };
    case "rect":
      return {
        segments: [line([0, 0], [0, 0.94]), quad([0, 0.94], [0, 1], [0.12, 1]), line([0.12, 1], [1, 1]), line([1, 1], [1, 0]), line([1, 0], [0, 0])],
        sleeve: [2, 0.96],
        tie: [1, 0],
      };
    default:
      return {
        segments: [line([0, 0], [0, 0.92]), quad([0, 0.92], [0.05, 1], [0.45, 1]), cubic([0.45, 1], [1.05, 0.98], [1.02, 0.55], [0.82, 0.22]), quad([0.82, 0.22], [0.7, 0.04], [0.42, 0]), line([0.42, 0], [0, 0])],
        sleeve: [2, 0.35],
        tie: [0.42, 0],
      };
  }
}

/** Pontos do contorno em metros; com `upTo`, só o trecho da bainha. */
function sampleOutline(segments: Segment[], W: number, H: number, upTo?: [number, number]): THREE.Vector2[] {
  const points: THREE.Vector2[] = [];
  const count = upTo ? Math.min(segments.length, upTo[0] + (upTo[1] > 0 ? 1 : 0)) : segments.length;
  for (let i = 0; i < count; i += 1) {
    const segment = segments[i];
    const end = upTo && i === upTo[0] ? upTo[1] : 1;
    const steps = segment instanceof THREE.LineCurve ? 1 : 48;
    for (let s = points.length ? 1 : 0; s <= steps; s += 1) {
      const p = segment.getPoint((s / steps) * end);
      points.push(new THREE.Vector2(p.x * W, p.y * H));
    }
  }
  return points;
}

function closePolygon(points: THREE.Vector2[]) {
  if (points.length > 2 && points[0].distanceTo(points[points.length - 1]) < 1e-6) points.pop();
  return points;
}

/** Reamostra uma polilinha em passos iguais de comprimento. */
function resample(points: THREE.Vector2[], step: number): THREE.Vector2[] {
  if (points.length < 2) return [points[0]?.clone() ?? new THREE.Vector2(), points[0]?.clone() ?? new THREE.Vector2()];
  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) cumulative.push(cumulative[i - 1] + points[i].distanceTo(points[i - 1]));
  const total = cumulative[cumulative.length - 1];
  if (total <= 1e-6) return [points[0].clone(), points[points.length - 1].clone()];
  const count = Math.max(2, Math.ceil(total / step) + 1);
  const out: THREE.Vector2[] = [];
  let seg = 1;
  for (let k = 0; k < count; k += 1) {
    const s = (k / (count - 1)) * total;
    while (seg < points.length - 1 && cumulative[seg] < s) seg += 1;
    const span = cumulative[seg] - cumulative[seg - 1] || 1;
    const t = Math.min(1, Math.max(0, (s - cumulative[seg - 1]) / span));
    out.push(points[seg - 1].clone().lerp(points[seg], t));
  }
  return out;
}

function resampleClosed(polygon: THREE.Vector2[], step: number) {
  const ring = resample([...polygon, polygon[0]], step);
  ring.pop();
  return ring;
}

/** Trecho da polilinha sem `start` metros do começo e `end` metros do fim. */
function trimPath(path: THREE.Vector2[], start: number, end: number) {
  const cumulative = [0];
  for (let i = 1; i < path.length; i += 1) cumulative.push(cumulative[i - 1] + path[i].distanceTo(path[i - 1]));
  const total = cumulative[cumulative.length - 1];
  return path.filter((_, i) => cumulative[i] >= start && cumulative[i] <= total - end);
}

/** Normal no plano apontando para dentro do tecido (contorno horário: direita da tangente). */
function inwardNormal(path: THREE.Vector2[], i: number) {
  const a = path[Math.max(0, i - 2)];
  const b = path[Math.min(path.length - 1, i + 2)];
  const tx = b.x - a.x;
  const ty = b.y - a.y;
  const length = Math.hypot(tx, ty) || 1;
  return new THREE.Vector2(ty / length, -tx / length);
}

function distanceToPath(path: THREE.Vector2[], x: number, y: number) {
  let best = Infinity;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSq));
    best = Math.min(best, Math.hypot(x - a.x - dx * t, y - a.y - dy * t));
  }
  return Number.isFinite(best) ? best : 0;
}

// ---------------------------------------------------------------------------- vento

type Wind = { reach: number; amp: number; wavelength: number; speed: number; billow: number; droop: number };

type Deformable = { geometry: THREE.BufferGeometry; base: Float32Array; dist: Float32Array };

function deformable(geometry: THREE.BufferGeometry, path: THREE.Vector2[]): Deformable {
  const position = geometry.getAttribute("position");
  const base = new Float32Array(position.count * 3);
  const dist = new Float32Array(position.count);
  for (let i = 0; i < position.count; i += 1) {
    base[i * 3] = position.getX(i);
    base[i * 3 + 1] = position.getY(i);
    base[i * 3 + 2] = position.getZ(i);
    dist[i] = distanceToPath(path, base[i * 3], base[i * 3 + 1]);
  }
  return { geometry, base, dist };
}

/** Normais de malha indexada sem alocar (roda a cada quadro enquanto a bandeira ondula). */
function refreshNormals(geometry: THREE.BufferGeometry) {
  const index = geometry.index;
  const normal = geometry.getAttribute("normal") as THREE.BufferAttribute | undefined;
  if (!index || !normal) return;
  const p = (geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
  const n = normal.array as Float32Array;
  const ids = index.array;
  n.fill(0);
  for (let f = 0; f < ids.length; f += 3) {
    const a = ids[f] * 3;
    const b = ids[f + 1] * 3;
    const c = ids[f + 2] * 3;
    const cbx = p[c] - p[b];
    const cby = p[c + 1] - p[b + 1];
    const cbz = p[c + 2] - p[b + 2];
    const abx = p[a] - p[b];
    const aby = p[a + 1] - p[b + 1];
    const abz = p[a + 2] - p[b + 2];
    const nx = cby * abz - cbz * aby;
    const ny = cbz * abx - cbx * abz;
    const nz = cbx * aby - cby * abx;
    n[a] += nx;
    n[a + 1] += ny;
    n[a + 2] += nz;
    n[b] += nx;
    n[b + 1] += ny;
    n[b + 2] += nz;
    n[c] += nx;
    n[c + 1] += ny;
    n[c + 2] += nz;
  }
  for (let i = 0; i < n.length; i += 3) {
    const length = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= length;
    n[i + 1] /= length;
    n[i + 2] /= length;
  }
  normal.needsUpdate = true;
}

/** Ondulação crescente a partir da haste, curvatura para trás (vento) e leve caída da ponta. */
function blow(item: Deformable, wind: Wind, time: number) {
  const attribute = item.geometry.getAttribute("position") as THREE.BufferAttribute;
  const out = attribute.array as Float32Array;
  const { base, dist } = item;
  const k = TAU / wind.wavelength;
  for (let i = 0; i < dist.length; i += 1) {
    const o = i * 3;
    const y = base[o + 1];
    const d = dist[i];
    const w = Math.min(1.15, d / wind.reach);
    const ripple = 0.72 * Math.sin(d * k - time * wind.speed + y * k * 0.32) + 0.28 * Math.sin(d * k * 1.9 - time * wind.speed * 1.55 - y * k * 0.5 + 1.3);
    out[o] = base[o];
    out[o + 1] = y - wind.droop * w * w;
    out[o + 2] = base[o + 2] + wind.amp * Math.pow(w, 1.3) * ripple - wind.billow * w * w;
  }
  attribute.needsUpdate = true;
  refreshNormals(item.geometry);
  item.geometry.computeBoundingSphere();
}

function useWind(items: Deformable[], wind: Wind) {
  const animate = useAnimate();
  const time = useRef(0);
  useFrame((state, delta) => {
    if (!animate) return;
    time.current += Math.min(delta, 0.1);
    for (let i = 0; i < items.length; i += 1) blow(items[i], wind, time.current);
    state.invalidate();
  });
}

// ---------------------------------------------------------------------------- malhas do tecido

/**
 * Bainha (túnel) da haste: seção em gota — redonda do lado da haste e achatada até a costura,
 * `flap` metros para dentro do tecido. As pontas afinam e fecham (a haste entra pela de baixo).
 */
function sleeveGeometry(path: THREE.Vector2[], radius: number, flap: number, taper: [number, number], radial = 16) {
  const count = path.length;
  const cumulative = [0];
  for (let i = 1; i < count; i += 1) cumulative.push(cumulative[i - 1] + path[i].distanceTo(path[i - 1]));
  const total = cumulative[count - 1];
  const positions = new Float32Array(count * (radial + 1) * 3);
  for (let i = 0; i < count; i += 1) {
    const p = path[i];
    const normal = inwardNormal(path, i);
    const s = cumulative[i];
    let k = 1;
    if (taper[0] > 0 && s < taper[0]) k = Math.sqrt(Math.max(0, 1 - (1 - s / taper[0]) ** 2));
    if (taper[1] > 0 && total - s < taper[1]) k = Math.min(k, Math.sqrt(Math.max(0, 1 - (1 - (total - s) / taper[1]) ** 2)));
    for (let j = 0; j <= radial; j += 1) {
      const a = (j / radial) * TAU;
      const c = Math.cos(a);
      const offset = (c >= 0 ? flap * c : radius * c) * k;
      const z = radius * Math.sin(a) * (c >= 0 ? 1 - 0.6 * c * c : 1) * k;
      const o = (i * (radial + 1) + j) * 3;
      positions[o] = p.x + normal.x * offset;
      positions[o + 1] = p.y + normal.y * offset;
      positions[o + 2] = z;
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < count - 1; i += 1) {
    for (let j = 0; j < radial; j += 1) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Pesponto: tubo fino paralelo à haste, tracejado pela textura (UV em passos de STITCH_PITCH). */
function stitchGeometry(path: THREE.Vector2[], offset: number, z: number) {
  const points = path.map((p, i) => {
    const normal = inwardNormal(path, i);
    return new THREE.Vector3(p.x + normal.x * offset, p.y + normal.y * offset, z);
  });
  const curve = new THREE.CatmullRomCurve3(points);
  const length = Math.max(curve.getLength(), 1e-3);
  const geometry = new THREE.TubeGeometry(curve, Math.max(8, Math.round(length / 0.015)), THREAD, 4, false);
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i += 1) uv.setX(i, (uv.getX(i) * length) / STITCH_PITCH);
  return geometry;
}

function hemGeometry(polygon: THREE.Vector2[], radius: number) {
  const ring = resampleClosed(polygon, 0.012);
  const curve = new THREE.CatmullRomCurve3(
    ring.map((p) => new THREE.Vector3(p.x, p.y, 0)),
    true,
  );
  return new THREE.TubeGeometry(curve, Math.max(32, ring.length), radius, 5, true);
}

type FlagPlan = {
  W: number;
  H: number;
  /** Contorno fechado em metros (0..W, 0..H). */
  polygon: THREE.Vector2[];
  /** Linha da haste/bainha (reamostrada): referência do vento. */
  path: THREE.Vector2[];
  /** Arte deitada (texto subindo pelo mastro, como nos wind banners de verdade). */
  vertical: boolean;
  /** Arte do verso (dupla face) deitada; a do verso decide sozinha (pode ter imagem e a da frente não). */
  backVertical: boolean;
  resolution: number;
  sleeve: { radius: number; flap: number; taper: [number, number] };
  hem: number;
  tie: { corner: THREE.Vector2; anchor: THREE.Vector3 } | null;
  wind: Omit<Wind, "reach">;
};

type FlagParts = {
  cloth: THREE.BufferGeometry;
  /** O mesmo tecido (posição, normal e índices compartilhados: ondula junto) com a UV do verso lida de trás. */
  clothBack: THREE.BufferGeometry;
  sleeve: THREE.BufferGeometry;
  stitches: THREE.BufferGeometry[];
  hem: THREE.BufferGeometry;
  tie: { cord: THREE.BufferGeometry; grommet: THREE.BufferGeometry; anchor: THREE.Vector3 } | null;
  items: Deformable[];
  wind: Wind;
  all: THREE.BufferGeometry[];
};

function buildFlag(plan: FlagPlan): FlagParts {
  const { W, H, polygon, path, sleeve: s } = plan;
  const cloth = inflatedSurface(polygon, { height: 0, resolution: plan.resolution, side: 1 });
  const position = cloth.getAttribute("position");
  const uv = cloth.getAttribute("uv");
  for (let i = 0; i < position.count; i += 1) {
    const u = position.getX(i) / W;
    const v = position.getY(i) / H;
    // Na arte deitada, o comprimento do canvas corre ao longo da haste e o topo das letras aponta para ela.
    if (plan.vertical) uv.setXY(i, v, 1 - u);
    else uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
  // Verso dupla face: visto de trás a haste fica à direita, então o u corre da ponta para a haste (texto sem
  // espelhar). Deitada, o texto sobe pela haste como na frente e o topo das letras aponta para a ponta.
  const backUv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const u = position.getX(i) / W;
    const v = position.getY(i) / H;
    backUv[i * 2] = plan.backVertical ? v : 1 - u;
    backUv[i * 2 + 1] = plan.backVertical ? u : v;
  }
  const clothBack = new THREE.BufferGeometry();
  clothBack.setIndex(cloth.getIndex());
  clothBack.setAttribute("position", position);
  clothBack.setAttribute("normal", cloth.getAttribute("normal"));
  clothBack.setAttribute("uv", new THREE.BufferAttribute(backUv, 2));

  const sleeve = sleeveGeometry(path, s.radius, s.flap, s.taper);
  // Costura no ponto em que a seção da bainha está a 72% da aba (altura = 0,478 × raio).
  const zStitch = s.radius * 0.478 + THREAD * 0.3;
  const seam = trimPath(path, s.taper[0] + 0.004, s.taper[1] + 0.004);
  const stitches = seam.length >= 2 ? [zStitch, -zStitch].map((z) => stitchGeometry(seam, s.flap * 0.72, z)) : [];
  const hem = hemGeometry(polygon, plan.hem);

  let tie: FlagParts["tie"] = null;
  if (plan.tie) {
    const centroid = polygon.reduce((acc, p) => acc.add(p), new THREE.Vector2()).divideScalar(Math.max(1, polygon.length));
    const eye = plan.tie.corner.clone().add(centroid.sub(plan.tie.corner).setLength(0.024));
    const grommet = new THREE.TorusGeometry(0.0065, 0.0022, 8, 20);
    grommet.scale(1, 1, 1.8);
    grommet.translate(eye.x, eye.y, 0);
    const anchor = plan.tie.anchor;
    const cordCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(eye.x, eye.y, 0),
      new THREE.Vector3((eye.x + anchor.x) / 2, Math.min(eye.y, anchor.y) - 0.035, 0.004),
      anchor.clone(),
    ]);
    const cord = new THREE.TubeGeometry(cordCurve, 32, 0.0022, 6, false);
    tie = { cord, grommet, anchor };
  }

  const moving = [cloth, sleeve, ...stitches, hem, ...(tie ? [tie.cord, tie.grommet] : [])];
  // Distância até a haste medida numa cópia mais grossa da linha (erro < 1 mm, ~3× mais rápido).
  const reference = resample(path, 0.03);
  const items = moving.map((geometry) => deformable(geometry, reference));
  let reach = 0.05;
  items[0].dist.forEach((d) => {
    reach = Math.max(reach, d);
  });
  const wind = { ...plan.wind, reach };
  items.forEach((item) => blow(item, wind, 0));
  // O verso não entra no vento (os atributos já são os do tecido); a esfera de recorte é a mesma, atualizada no lugar.
  clothBack.boundingSphere = cloth.boundingSphere;
  return { cloth, clothBack, sleeve, stitches, hem, tie, items, wind, all: [...moving, clothBack] };
}

/** Tracejado do pesponto (alpha) — uma textura por bandeira. */
function useStitchTexture() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 4;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 21, 4);
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    return map;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** Arte do passo "Verso" (art.back) e o aspecto do canvas dela. */
type FlagBack = { art: ArtRender; aspect: number; label: string };

/** Verso dupla face: a arte do verso no lado de trás do tecido, com o mesmo material do verso vazado. */
function FlagBackFace({ geometry, back }: { geometry: THREE.BufferGeometry; back: FlagBack }) {
  const texture = useArtTexture(back.aspect, "front", back.art, back.label);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial map={texture} roughness={0.86} emissive="#ffffff" emissiveIntensity={0.09} side={THREE.BackSide} />
    </mesh>
  );
}

/**
 * Tecido sublimado (frente nítida, verso com a arte vazada), bainhas, pesponto e elástico. Com `back` (o cliente
 * montou um verso), o lado de trás mostra essa arte em vez da frente vazada.
 */
function FlagCloth({ parts, texture, sleeveColor, threadColor, hemColor, back }: { parts: FlagParts; texture: THREE.Texture; sleeveColor: string; threadColor: string; hemColor?: string; back?: FlagBack | null }) {
  useWind(parts.items, parts.wind);
  const stitch = useStitchTexture();
  // Bainha dobrada na cor do fundo da arte (a estampa vira junto com o tecido); cor inválida cai no branco.
  const hem = hemColor && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hemColor) ? hemColor : "#f1f1f1";
  return (
    <group>
      <mesh geometry={parts.cloth}>
        <meshPhysicalMaterial map={texture} roughness={0.72} sheen={0.45} sheenRoughness={0.55} sheenColor="#ffffff" side={THREE.FrontSide} />
      </mesh>
      {back ? (
        <FlagBackFace geometry={parts.clothBack} back={back} />
      ) : (
        <mesh geometry={parts.cloth}>
          <meshStandardMaterial map={texture} roughness={0.86} emissive="#ffffff" emissiveIntensity={0.09} side={THREE.BackSide} />
        </mesh>
      )}
      <mesh geometry={parts.sleeve}>
        <meshPhysicalMaterial color={sleeveColor} roughness={0.88} sheen={0.6} sheenRoughness={0.6} sheenColor="#ffffff" />
      </mesh>
      {parts.stitches.map((geometry, i) => (
        <mesh key={i} geometry={geometry}>
          <meshStandardMaterial color={threadColor} map={stitch} alphaTest={0.5} roughness={0.8} />
        </mesh>
      ))}
      <mesh geometry={parts.hem}>
        <meshPhysicalMaterial color={hem} roughness={0.85} sheen={0.4} sheenRoughness={0.6} sheenColor="#ffffff" />
      </mesh>
      {parts.tie && (
        <>
          <mesh geometry={parts.tie.cord}>
            <meshStandardMaterial color="#141414" roughness={0.75} />
          </mesh>
          <mesh geometry={parts.tie.grommet}>
            <Steel />
          </mesh>
          <mesh position={[0, parts.tie.anchor.y, 0]} rotation-x={Math.PI / 2}>
            <torusGeometry args={[POLE_R + 0.0025, 0.003, 8, 24]} />
            <Plastic />
          </mesh>
        </>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------- materiais

function Aluminium() {
  return <meshStandardMaterial color="#cdd1d6" metalness={1} roughness={0.3} />;
}

function Steel() {
  return <meshStandardMaterial color="#b9bdc3" metalness={1} roughness={0.38} />;
}

function PowderCoat() {
  return <meshStandardMaterial color="#26272b" metalness={0.35} roughness={0.55} />;
}

function Plastic({ color = "#1b1c1f", roughness = 0.6 }: { color?: string; roughness?: number }) {
  return <meshStandardMaterial color={color} roughness={roughness} />;
}

function Fibreglass() {
  return <meshPhysicalMaterial color="#17181a" roughness={0.3} clearcoat={0.6} clearcoatRoughness={0.2} />;
}

// ---------------------------------------------------------------------------- bases

/** Altura do topo do eixo giratório da base em cruz. */
const CROSS_TOP = 0.2;
const BAG_R = 0.2;
const BAG_TUBE = 0.062;
const BAG_FLAT = 0.6;

/** Base em cruz: quatro pés de aço chato, cubo com eixo giratório e bolsa d'água de PVC em anel. */
function CrossBase({ position, rotationY = 0 }: { position?: Vec3; rotationY?: number }) {
  const parts = useMemo(() => {
    const legLength = 0.42;
    const leg = new THREE.ExtrudeGeometry(makeShape("rect", legLength, 0.034, 0.012), { depth: 0.01, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 6 });
    leg.rotateX(-Math.PI / 2);
    leg.translate(legLength / 2 + 0.03, 0.002, 0);
    const bag = new THREE.TorusGeometry(BAG_R, BAG_TUBE, 20, 72);
    bag.rotateX(Math.PI / 2);
    bag.scale(1, BAG_FLAT, 1);
    const seam = new THREE.TorusGeometry(BAG_R + BAG_TUBE, 0.0024, 6, 96);
    seam.rotateX(Math.PI / 2);
    return { leg, bag, seam, list: [leg, bag, seam] };
  }, []);
  useGeometriesCleanup(parts.list);
  const bagY = 0.014 + BAG_TUBE * BAG_FLAT;
  const bagTop = bagY + BAG_TUBE * BAG_FLAT;
  const valve = 0.55;
  return (
    <group position={position} rotation-y={rotationY}>
      {[0, 1, 2, 3].map((i) => {
        const angle = Math.PI / 4 + (i * Math.PI) / 2;
        return (
          <group key={i} rotation-y={angle}>
            <mesh geometry={parts.leg}>
              <PowderCoat />
            </mesh>
            <mesh position={[0.452, 0.008, 0]}>
              <cylinderGeometry args={[0.019, 0.021, 0.016, 20]} />
              <Plastic color="#111113" roughness={0.95} />
            </mesh>
          </group>
        );
      })}
      <mesh geometry={parts.bag} position-y={bagY}>
        <meshPhysicalMaterial color="#25282d" roughness={0.32} clearcoat={0.6} clearcoatRoughness={0.15} />
      </mesh>
      <mesh geometry={parts.seam} position-y={bagY}>
        <Plastic color="#1a1c20" roughness={0.5} />
      </mesh>
      <group position={[Math.sin(valve) * BAG_R, bagTop - 0.004, Math.cos(valve) * BAG_R]}>
        <mesh position-y={0.006}>
          <cylinderGeometry args={[0.018, 0.019, 0.012, 24]} />
          <Plastic color="#3a3d43" roughness={0.45} />
        </mesh>
        <mesh position-y={0.014}>
          <cylinderGeometry args={[0.012, 0.014, 0.008, 6]} />
          <Plastic color="#e8e8e8" roughness={0.4} />
        </mesh>
      </group>
      <mesh position-y={0.04}>
        <cylinderGeometry args={[0.042, 0.046, 0.05, 32]} />
        <Steel />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[Math.cos(i * (Math.PI / 2)) * 0.03, 0.068, Math.sin(i * (Math.PI / 2)) * 0.03]}>
          <cylinderGeometry args={[0.0055, 0.0055, 0.006, 6]} />
          <Steel />
        </mesh>
      ))}
      <mesh position-y={0.13}>
        <cylinderGeometry args={[0.0125, 0.0125, 0.13, 20]} />
        <Steel />
      </mesh>
      <mesh position-y={0.172}>
        <cylinderGeometry args={[0.018, 0.018, 0.045, 24]} />
        <Plastic color="#0f0f11" roughness={0.45} />
      </mesh>
    </group>
  );
}

/** Altura do topo do encaixe metálico da base redonda. */
const ROUND_TOP = 0.15;

const ROUND_PROFILE: Pt[] = [
  [0, 0],
  [0.165, 0],
  [0.18, 0.003],
  [0.185, 0.012],
  [0.185, 0.03],
  [0.18, 0.042],
  [0.165, 0.05],
  [0.13, 0.058],
  [0.09, 0.064],
  [0.06, 0.069],
  [0.05, 0.075],
  [0.047, 0.09],
  [0.046, 0.104],
  [0.042, 0.11],
  [0, 0.11],
];

/** Base redonda de 37 cm: plástico rotomoldado para encher com água, nervuras, tampa de rosca e encaixe com manípulo. */
function RoundBase({ position, rotationY = 0 }: { position?: Vec3; rotationY?: number }) {
  const parts = useMemo(() => {
    const body = lathe(smoothProfile(ROUND_PROFILE, 96), 72);
    // Nervuras concêntricas da cúpula (raio, altura sobre o perfil).
    const ribs = (
      [
        [0.172, 0.0475],
        [0.148, 0.0545],
      ] as Pt[]
    ).map(([r, y]) => {
      const rib = new THREE.TorusGeometry(r, 0.0028, 6, 96);
      rib.rotateX(Math.PI / 2);
      rib.translate(0, y, 0);
      return rib;
    });
    return { body, ribs, list: [body, ...ribs] };
  }, []);
  useGeometriesCleanup(parts.list);
  return (
    <group position={position} rotation-y={rotationY}>
      <mesh geometry={parts.body}>
        <meshPhysicalMaterial color="#1c1d20" roughness={0.62} clearcoat={0.15} clearcoatRoughness={0.6} />
      </mesh>
      {parts.ribs.map((rib, i) => (
        <mesh key={i} geometry={rib}>
          <Plastic color="#18191c" roughness={0.55} />
        </mesh>
      ))}
      {/* Tampa de rosca do enchimento, inclinada com a cúpula. */}
      <group rotation-y={0.55}>
        <group position={[0, 0.062, 0.105]} rotation-x={0.15}>
          <mesh position-y={0.007}>
            <cylinderGeometry args={[0.024, 0.025, 0.014, 32]} />
            <Plastic color="#2c2f34" roughness={0.5} />
          </mesh>
          <mesh position-y={0.012} rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.0245, 0.0018, 6, 32]} />
            <Plastic color="#24262a" roughness={0.6} />
          </mesh>
          <mesh position-y={0.0145}>
            <boxGeometry args={[0.03, 0.004, 0.006]} />
            <Plastic color="#2c2f34" roughness={0.5} />
          </mesh>
        </group>
      </group>
      <mesh position-y={0.125}>
        <cylinderGeometry args={[0.02, 0.021, 0.05, 28]} />
        <Steel />
      </mesh>
      <mesh position={[0.026, 0.132, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.003, 0.003, 0.016, 10]} />
        <Steel />
      </mesh>
      <mesh position={[0.037, 0.132, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.009, 0.009, 0.01, 8]} />
        <Plastic color="#101012" roughness={0.5} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------- hastes soltas

function springGeometry(radius: number, wire: number, length: number, turns: number) {
  const steps = turns * 24;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const a = t * turns * TAU;
    points.push(new THREE.Vector3(-length / 2 + length * t, Math.cos(a) * radius, Math.sin(a) * radius));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), steps, wire, 6, false);
}

function Section({ length, radius, kind, position }: { length: number; radius: number; kind: "alu" | "glass"; position: Vec3 }) {
  return (
    <group position={position} rotation-z={Math.PI / 2}>
      <mesh>
        <cylinderGeometry args={[radius, radius, length, 24]} />
        {kind === "alu" ? <Aluminium /> : <Fibreglass />}
      </mesh>
      {kind === "alu" ? (
        <>
          <mesh position-y={length / 2 + 0.035}>
            <cylinderGeometry args={[radius * 0.8, radius * 0.8, 0.07, 20]} />
            <Aluminium />
          </mesh>
          <mesh position-y={length / 2 + 0.002}>
            <cylinderGeometry args={[radius * 1.02, radius * 0.86, 0.008, 20]} />
            <Aluminium />
          </mesh>
          <mesh position-y={-length / 2 - 0.004}>
            <cylinderGeometry args={[radius * 1.12, radius * 1.12, 0.014, 20]} />
            <Plastic color="#111113" roughness={0.8} />
          </mesh>
        </>
      ) : (
        <>
          <mesh position-y={length / 2}>
            <sphereGeometry args={[radius * 1.25, 16, 12]} />
            <Plastic color="#0d0d0f" roughness={0.9} />
          </mesh>
          <mesh position-y={-length / 2 + 0.025}>
            <cylinderGeometry args={[radius * 1.3, radius * 1.3, 0.05, 20]} />
            <Aluminium />
          </mesh>
        </>
      )}
    </group>
  );
}

/** Jogo de hastes deitado lado a lado: dois tubos de alumínio com luva, a ponta de fibra flexível e o eixo com mola. */
function PoleSet({ lengthCm, diameterCm, position, rotationY = 0 }: { lengthCm: number; diameterCm: number; position?: Vec3; rotationY?: number }) {
  const L = clamp(lengthCm, 60, 160) * CM;
  // O catálogo arredonda a bitola para "0,01 m"; tubo de wind banner de 3 m tem no mínimo ~16 mm.
  const r = clamp(diameterCm, 1.6, 3) * CM * 0.5;
  const coil = r * 0.9 + 0.0035;
  const spring = useMemo(() => springGeometry(coil, 0.0017, 0.09, 9), [coil]);
  const springs = useMemo(() => [spring], [spring]);
  useGeometriesCleanup(springs);
  const gap = Math.max(0.045, r * 5);
  return (
    <group position={position} rotation-y={rotationY}>
      <Section length={L} radius={r} kind="alu" position={[0, r * 1.12, 0]} />
      <Section length={L} radius={r} kind="alu" position={[0.05, r * 1.12, gap]} />
      <Section length={L * 1.05} radius={r * 0.72} kind="glass" position={[-0.02, r * 0.94, gap * 2]} />
      <group position={[L * 0.18, coil + 0.0017, gap * 3]}>
        <mesh rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[r * 0.9, r * 0.9, 0.22, 20]} />
          <Steel />
        </mesh>
        <mesh geometry={spring}>
          <Steel />
        </mesh>
        {[-0.05, 0.05].map((x) => (
          <mesh key={x} position-x={x} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[coil + 0.002, coil + 0.002, 0.008, 20]} />
            <Steel />
          </mesh>
        ))}
        <mesh position-x={-0.115} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[r * 1.15, r * 1.15, 0.016, 20]} />
          <Plastic color="#0f0f11" roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- wind banner montado

type BannerProps = {
  style: FlagStyle;
  widthCm: number;
  heightCm: number;
  art: ArtRender;
  label: string;
  base: "cross" | "round";
  sleeveColor: string;
  position?: Vec3;
  rotationY?: number;
};

/** Wind banner montado: base, haste de alumínio e o tecido com a bainha acompanhando a curva da fibra. */
function WindBanner({ style, widthCm, heightCm, art, label, base, sleeveColor, position, rotationY = 0 }: BannerProps) {
  const W = clamp(widthCm, 20, 300) * CM;
  const H = clamp(heightCm, 60, 600) * CM;
  const vertical = !art.src && H / W > 1.8;
  const texture = useArtTexture(vertical ? H / W : W / H, "front", art, label);
  const backArt = useMemo(() => backArtOf(art), [art]);
  // Sem verso próprio vale o mesmo da frente (a malha não é refeita à toa).
  const backVertical = !(backArt ?? art).src && H / W > 1.8;
  const back = backArt ? { art: backArt, aspect: backVertical ? H / W : W / H, label } : null;
  const parts = useMemo(() => {
    const outline = outlineOf(style);
    const polygon = closePolygon(sampleOutline(outline.segments, W, H));
    const path = resample(sampleOutline(outline.segments, W, H, outline.sleeve), 0.012);
    return buildFlag({
      W,
      H,
      polygon,
      path,
      vertical,
      backVertical,
      resolution: 110,
      sleeve: { radius: 0.014, flap: 0.045, taper: [0.012, 0.03] },
      hem: 0.0028,
      tie: { corner: new THREE.Vector2(outline.tie[0] * W, outline.tie[1] * H), anchor: new THREE.Vector3(POLE_R + 0.002, -0.1, 0) },
      wind: { amp: 0.07 * W, wavelength: Math.max(0.45, W * 0.95), speed: 2.1, billow: 0.07 * W, droop: 0 },
    });
  }, [style, W, H, vertical, backVertical]);
  useGeometriesCleanup(parts.all);
  const baseTop = base === "round" ? ROUND_TOP : CROSS_TOP;
  const clothY = baseTop + 0.32;
  const low = baseTop - 0.04;
  const high = clothY + 0.08;
  return (
    <group position={position} rotation-y={rotationY}>
      {base === "round" ? <RoundBase /> : <CrossBase />}
      <mesh position-y={(low + high) / 2}>
        <cylinderGeometry args={[POLE_R, POLE_R, high - low, 20]} />
        <Aluminium />
      </mesh>
      <mesh position-y={baseTop + 0.13}>
        <cylinderGeometry args={[POLE_R * 1.2, POLE_R * 1.2, 0.03, 20]} />
        <Aluminium />
      </mesh>
      <group position-y={clothY}>
        <FlagCloth parts={parts} texture={texture} sleeveColor={sleeveColor} threadColor="#d9d9d9" hemColor={art.background} back={back} />
      </group>
    </group>
  );
}

function WindBannerModel({ spec, art, label }: ModelProps) {
  return (
    <group rotation-y={-0.3}>
      <WindBanner style={spec.flagStyle} widthCm={spec.widthCm} heightCm={spec.heightCm} art={art} label={label} base="cross" sleeveColor={spec.accentColor ?? SLEEVE_COLOR} />
    </group>
  );
}

// ---------------------------------------------------------------------------- bandeira de mastro

function hoistPlan(W: number, H: number, options: Pick<FlagPlan, "resolution" | "sleeve" | "hem" | "wind">): FlagPlan {
  return {
    W,
    H,
    polygon: [new THREE.Vector2(0, 0), new THREE.Vector2(0, H), new THREE.Vector2(W, H), new THREE.Vector2(W, 0)],
    path: resample([new THREE.Vector2(0, 0), new THREE.Vector2(0, H)], 0.015),
    vertical: false,
    backVertical: false,
    tie: null,
    ...options,
  };
}

function ropeGeometry(a: Vec3, b: Vec3) {
  return new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(...a), new THREE.Vector3(...b)), 2, 0.0028, 6, false);
}

const STAND_PROFILE: Pt[] = [
  [0, 0],
  [0.25, 0],
  [0.256, 0.006],
  [0.252, 0.018],
  [0.22, 0.03],
  [0.12, 0.045],
  [0.05, 0.06],
  [0.042, 0.075],
  [0.04, 0.2],
  [0.034, 0.21],
  [0.027, 0.21],
  [0.027, 0.15],
  [0, 0.15],
];
const POLE_FOOT = 0.16;

/** Bandeira 150×100 num mastro de piso: pedestal, mastro afinando, pomo dourado, roldana, adriça e cunho. */
function ClassicFlagModel({ spec, art, label }: ModelProps) {
  const W = clamp(spec.widthCm, 20, 400) * CM;
  const H = clamp(spec.heightCm, 15, 300) * CM;
  const texture = useArtTexture(W / H, "front", art, label);
  const backArt = useMemo(() => backArtOf(art), [art]);
  const back = backArt ? { art: backArt, aspect: W / H, label } : null;
  const parts = useMemo(
    () =>
      buildFlag(
        hoistPlan(W, H, {
          resolution: 84,
          sleeve: { radius: 0.0045, flap: 0.04, taper: [0.006, 0.006] },
          hem: 0.0028,
          wind: { amp: 0.07 * Math.min(1, H), wavelength: Math.max(0.4, W * 0.55), speed: 2.6, billow: 0.012 * W, droop: 0.045 * H },
        }),
      ),
    [W, H],
  );
  useGeometriesCleanup(parts.all);

  const poleH = Math.max(2, H + 1.45);
  const poleTop = POLE_FOOT + poleH;
  const hoistX = 0.06;
  const flagTop = poleTop - 0.1;
  const flagBottom = flagTop - H;
  const cleatY = Math.min(1.15, flagBottom - 0.25);
  // Mosquetões: argola no plano xz, atravessando o ilhó e saindo do lado do mastro.
  const hook = 0.012;
  const grommetX = 0.018;
  const hookOut = hoistX + grommetX - hook * 2;

  const rig = useMemo(() => {
    const pole = lathe(
      [
        [0, 0],
        [0.024, 0],
        [0.024, 0.05],
        [0.021, 0.08],
        [0.019, poleH * 0.6],
        [0.016, poleH - 0.012],
        [0.013, poleH],
        [0, poleH],
      ],
      32,
    );
    const stand = lathe(STAND_PROFILE, 64);
    const ropes = [
      ropeGeometry([0.028, poleTop + 0.022, 0.003], [hookOut, flagTop - 0.022, 0]),
      ropeGeometry([hookOut, flagBottom + 0.022, 0], [0.032, cleatY + 0.03, 0.006]),
      ropeGeometry([0.024, poleTop + 0.022, -0.006], [0.028, cleatY + 0.035, -0.004]),
    ];
    return { pole, stand, ropes, list: [pole, stand, ...ropes] };
  }, [poleH, poleTop, hookOut, flagTop, flagBottom, cleatY]);
  useGeometriesCleanup(rig.list);
  const poleColor = metalColor(spec.metal === "none" ? "silver" : spec.metal);

  return (
    <group rotation-y={-0.25}>
      <mesh geometry={rig.stand}>
        <meshStandardMaterial color="#2b2b2e" metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh geometry={rig.pole} position-y={POLE_FOOT}>
        <meshStandardMaterial color={poleColor} metalness={1} roughness={0.26} />
      </mesh>
      {/* Roldana (caminhão) e pomo. */}
      <mesh position-y={poleTop + 0.02}>
        <cylinderGeometry args={[0.026, 0.024, 0.04, 28]} />
        <meshStandardMaterial color={poleColor} metalness={1} roughness={0.3} />
      </mesh>
      <mesh position={[0.02, poleTop + 0.022, 0]}>
        <torusGeometry args={[0.012, 0.0035, 8, 24]} />
        <Plastic color="#e9e9e9" roughness={0.4} />
      </mesh>
      <mesh position-y={poleTop + 0.055}>
        <cylinderGeometry args={[0.008, 0.012, 0.03, 16]} />
        <meshStandardMaterial color="#d8b45a" metalness={1} roughness={0.22} />
      </mesh>
      <mesh position-y={poleTop + 0.11}>
        <sphereGeometry args={[0.042, 32, 24]} />
        <meshStandardMaterial color="#d8b45a" metalness={1} roughness={0.18} />
      </mesh>
      {/* Adriça (dois ramos) e cunho com a sobra enrolada. */}
      {rig.ropes.map((geometry, i) => (
        <mesh key={i} geometry={geometry}>
          <meshStandardMaterial color="#efece4" roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[0.036, cleatY + 0.02, 0]}>
        <capsuleGeometry args={[0.0065, 0.075, 4, 10]} />
        <meshStandardMaterial color={poleColor} metalness={1} roughness={0.3} />
      </mesh>
      <mesh position={[0.026, cleatY + 0.02, 0]}>
        <boxGeometry args={[0.012, 0.03, 0.01]} />
        <meshStandardMaterial color={poleColor} metalness={1} roughness={0.3} />
      </mesh>
      <mesh position={[0.042, cleatY - 0.05, 0.008]} rotation-y={0.3}>
        <torusGeometry args={[0.024, 0.0032, 8, 28]} />
        <meshStandardMaterial color="#efece4" roughness={0.85} />
      </mesh>
      <group position={[hoistX, flagBottom, 0]}>
        <FlagCloth parts={parts} texture={texture} sleeveColor="#f3f0e6" threadColor="#cfcabd" hemColor={art.background} back={back} />
        {[H - 0.022, 0.022].map((y) => (
          <group key={y}>
            <mesh position={[grommetX, y, 0]} scale={[1, 1, 1.7]}>
              <torusGeometry args={[0.0075, 0.0028, 8, 20]} />
              <meshStandardMaterial color="#c9a24e" metalness={1} roughness={0.3} />
            </mesh>
            <mesh position={[grommetX - hook, y, 0]} rotation-x={Math.PI / 2}>
              <torusGeometry args={[hook, 0.0017, 6, 24]} />
              <Steel />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- bandeira de carro

/** Bandeira de carro com haste plástica e presilha encaixada no vidro de um recorte de porta. */
function CarFlagModel({ spec, art, label }: ModelProps) {
  const W = clamp(spec.widthCm, 15, 80) * CM;
  const H = clamp(spec.heightCm, 10, 60) * CM;
  const texture = useArtTexture(W / H, "front", art, label);
  const backArt = useMemo(() => backArtOf(art), [art]);
  const back = backArt ? { art: backArt, aspect: W / H, label } : null;
  const parts = useMemo(
    () =>
      buildFlag(
        hoistPlan(W, H, {
          resolution: 64,
          sleeve: { radius: 0.0075, flap: 0.022, taper: [0.004, 0.006] },
          hem: 0.0018,
          wind: { amp: 0.07 * W, wavelength: Math.max(0.12, W * 0.45), speed: 8, billow: 0.03 * W, droop: 0.03 * H },
        }),
      ),
    [W, H],
  );
  useGeometriesCleanup(parts.all);

  const door = useMemo(() => {
    const panel = new THREE.ExtrudeGeometry(makeShape("rect", 0.66, 0.2, 0.025), { depth: 0.05, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 8 });
    panel.translate(0, 0.108, -0.025);
    const glassShape = new THREE.Shape();
    glassShape.moveTo(-0.31, 0);
    glassShape.lineTo(0.31, 0);
    glassShape.lineTo(0.31, 0.19);
    glassShape.quadraticCurveTo(0.31, 0.24, 0.25, 0.24);
    glassShape.lineTo(-0.1, 0.24);
    glassShape.quadraticCurveTo(-0.14, 0.24, -0.17, 0.21);
    glassShape.lineTo(-0.31, 0.07);
    glassShape.closePath();
    const glass = new THREE.ExtrudeGeometry(glassShape, { depth: 0.005, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 2, curveSegments: 12 });
    glass.translate(0, 0.2, -0.0025);
    const seal = new THREE.ExtrudeGeometry(makeShape("rect", 0.64, 0.05, 0.006), { depth: 0.012, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 6 });
    seal.rotateX(-Math.PI / 2);
    seal.translate(0, 0.217, 0);
    const trim = new THREE.ExtrudeGeometry(makeShape("rect", 0.64, 0.008, 0.003), { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 2, curveSegments: 4 });
    trim.translate(0, 0.205, 0.033);
    // Presilha em U invertido abraçando a borda do vidro.
    const clipShape = new THREE.Shape();
    clipShape.moveTo(-0.011, -0.04);
    clipShape.lineTo(-0.0035, -0.04);
    clipShape.lineTo(-0.0035, 0);
    clipShape.lineTo(0.0035, 0);
    clipShape.lineTo(0.0035, -0.04);
    clipShape.lineTo(0.011, -0.04);
    clipShape.lineTo(0.011, 0.01);
    clipShape.quadraticCurveTo(0.011, 0.014, 0.007, 0.014);
    clipShape.lineTo(-0.007, 0.014);
    clipShape.quadraticCurveTo(-0.011, 0.014, -0.011, 0.01);
    clipShape.closePath();
    const clip = new THREE.ExtrudeGeometry(clipShape, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0012, bevelSegments: 2, curveSegments: 6 });
    clip.translate(0, 0, -0.0175);
    clip.rotateY(Math.PI / 2);
    return { panel, glass, seal, trim, clip, list: [panel, glass, seal, trim, clip] };
  }, []);
  useGeometriesCleanup(door.list);

  const glassTop = 0.2 + 0.24 + 0.0015;
  const clipX = -0.04;
  const tilt = 0.1;
  const poleLength = H + 0.2;
  return (
    <group rotation-y={-0.2} userData={{ view: { elevation: 0.16 } }}>
      <mesh geometry={door.panel}>
        <meshPhysicalMaterial color="#2a2e35" metalness={0.55} roughness={0.32} clearcoat={1} clearcoatRoughness={0.05} />
      </mesh>
      <mesh geometry={door.trim}>
        <meshStandardMaterial color="#dfe2e6" metalness={1} roughness={0.15} />
      </mesh>
      <mesh geometry={door.seal}>
        <Plastic color="#0e0e10" roughness={0.9} />
      </mesh>
      <mesh geometry={door.glass}>
        <meshPhysicalMaterial color="#26343c" transparent opacity={0.5} roughness={0.04} metalness={0.1} clearcoat={1} clearcoatRoughness={0.02} depthWrite={false} />
      </mesh>
      <mesh geometry={door.clip} position={[clipX, glassTop, 0]}>
        <Plastic color="#151517" roughness={0.45} />
      </mesh>
      {/* Soquete encostado na perna externa da presilha (face externa em z = 0,011). */}
      <group position={[clipX, glassTop - 0.035, 0.0195]} rotation-z={-tilt}>
        <mesh position-y={0.02}>
          <cylinderGeometry args={[0.0085, 0.0085, 0.05, 20]} />
          <Plastic color="#151517" roughness={0.45} />
        </mesh>
        <mesh position-y={0.01 + poleLength / 2}>
          <cylinderGeometry args={[0.0055, 0.0055, poleLength, 16]} />
          <Plastic color="#f2f2f2" roughness={0.38} />
        </mesh>
        <mesh position-y={0.01 + poleLength}>
          <sphereGeometry args={[0.008, 16, 12]} />
          <Plastic color="#f2f2f2" roughness={0.38} />
        </mesh>
        <group position-y={0.12}>
          <FlagCloth parts={parts} texture={texture} sleeveColor="#f4f4f4" threadColor="#d0d0d0" hemColor={art.background} back={back} />
        </group>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- wind ball

/** Hemisfério de trás da wind ball com a arte do passo "Verso" (a UV dele já lê de trás). */
function BallBack({ geometry, art, label }: { geometry: THREE.BufferGeometry; art: ArtRender; label: string }) {
  const texture = useArtTexture(1, "front", art, label);
  return (
    <mesh geometry={geometry}>
      <meshPhysicalMaterial map={texture} roughness={0.6} sheen={0.6} sheenRoughness={0.5} sheenColor="#ffffff" />
    </mesh>
  );
}

/** Wind ball: esfera de helanca em dois hemisférios costurados (arte nos dois lados) num mastro com base em cruz. */
function WindBallModel({ spec, art, label }: ModelProps) {
  // Formato "1,0 × 3,0 m": diâmetro da bola × altura montada.
  const D = clamp(spec.widthCm, 30, 150) * CM;
  const r = D / 2;
  const total = Math.max(clamp(spec.heightCm, 60, 400) * CM, D * 1.8);
  const center = total - r - 0.08;
  const texture = useArtTexture(1, "front", art, label);
  const backArt = useMemo(() => backArtOf(art), [art]);
  const ball = useMemo(() => {
    // Projeção frontal: de frente a arte aparece inteira e sem distorção; o verso lê espelhado de volta.
    const half = (phiStart: number, flip: boolean) => {
      const geometry = new THREE.SphereGeometry(r, 72, 48, phiStart, Math.PI);
      const position = geometry.getAttribute("position");
      const uv = geometry.getAttribute("uv");
      for (let i = 0; i < position.count; i += 1) {
        const u = position.getX(i) / D + 0.5;
        uv.setXY(i, flip ? 1 - u : u, position.getY(i) / D + 0.5);
      }
      return geometry;
    };
    const front = half(0, false);
    const back = half(Math.PI, true);
    const seam = new THREE.TorusGeometry(r, 0.0045, 8, 160);
    return { front, back, seam, list: [front, back, seam] };
  }, [r, D]);
  useGeometriesCleanup(ball.list);
  const low = CROSS_TOP - 0.04;
  return (
    <group rotation-y={-0.2}>
      <CrossBase />
      <mesh position-y={(low + total) / 2}>
        <cylinderGeometry args={[POLE_R, POLE_R, total - low, 20]} />
        <Aluminium />
      </mesh>
      <mesh position-y={total + 0.012}>
        <sphereGeometry args={[0.018, 20, 14]} />
        <Plastic color="#111113" roughness={0.4} />
      </mesh>
      <group position-y={center}>
        <mesh geometry={ball.front}>
          <meshPhysicalMaterial map={texture} roughness={0.6} sheen={0.6} sheenRoughness={0.5} sheenColor="#ffffff" />
        </mesh>
        {backArt ? (
          <BallBack geometry={ball.back} art={backArt} label={label} />
        ) : (
          <mesh geometry={ball.back}>
            <meshPhysicalMaterial map={texture} roughness={0.6} sheen={0.6} sheenRoughness={0.5} sheenColor="#ffffff" />
          </mesh>
        )}
        <mesh geometry={ball.seam}>
          <meshStandardMaterial color="#1a1a1c" roughness={0.8} />
        </mesh>
        {[1, -1].map((side) => (
          <mesh key={side} position-y={side * (r - 0.004)}>
            <cylinderGeometry args={[0.03, 0.034, 0.03, 24]} />
            <Plastic color="#151517" roughness={0.45} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- exports

/**
 * Bandeiras sublimadas. Wind banners (pena, faca, gota, vela, retangular): tecido recortado no contorno do
 * modelo, bainha preta seguindo a curva da haste de fibra, pesponto, elástico no canto e base em cruz com
 * bolsa d'água. "Bandeira" (paisagem) vai num mastro de piso com adriça; {car} na presilha de vidro;
 * {ball} é a esfera estampada no mastro. O tecido ondula ao vento quando a animação está liberada.
 */
export function FlagModel(props: ModelProps) {
  const { spec } = props;
  if (spec.variant === "ball") return <WindBallModel {...props} />;
  if (spec.variant === "car") return <CarFlagModel {...props} />;
  if (spec.flagStyle === "rect" && spec.widthCm >= spec.heightCm) return <ClassicFlagModel {...props} />;
  return <WindBannerModel {...props} />;
}

/**
 * Base e haste vendidas sem bandeira: a peça avulsa em destaque na frente, em escala real e com detalhe
 * (base redonda de 37 cm, base em cruz com bolsa d'água ou o jogo de hastes deitado com a mola), e atrás um
 * wind banner montado com a arte do cliente como simulação.
 */
export function HardwareModel({ spec, art }: ModelProps) {
  const style: FlagStyle = spec.flagStyle === "rect" ? "pena" : spec.flagStyle;
  const sleeve = spec.accentColor ?? SLEEVE_COLOR;
  // Câmera um pouco mais alta: as peças avulsas no chão, em primeiro plano, aparecem inteiras.
  const view = { view: { elevation: 0.38 } };
  if (spec.variant === "round-base") {
    return (
      <group rotation-y={-0.25} userData={view}>
        <WindBanner style={style} widthCm={55} heightCm={170} art={art} label={formatSize(55, 170)} base="round" sleeveColor={sleeve} position={[-0.3, 0, -0.42]} />
        <RoundBase position={[0.34, 0, 0.3]} rotationY={-0.5} />
      </group>
    );
  }
  if (spec.variant === "pole") {
    return (
      <group rotation-y={-0.2} userData={view}>
        <WindBanner style={style} widthCm={70} heightCm={240} art={art} label={formatSize(70, 240)} base="cross" sleeveColor={sleeve} position={[-0.25, 0, -0.5]} />
        <PoleSet lengthCm={spec.heightCm} diameterCm={spec.widthCm} position={[0.05, 0, 0.42]} rotationY={0.06} />
      </group>
    );
  }
  return (
    <group rotation-y={-0.2} userData={view}>
      <WindBanner style={style} widthCm={70} heightCm={240} art={art} label={formatSize(70, 240)} base="cross" sleeveColor={sleeve} position={[-0.45, 0, -0.6]} />
      <CrossBase position={[0.58, 0, 0.22]} rotationY={0.2} />
      <PoleSet lengthCm={110} diameterCm={2.1} position={[-0.2, 0, 0.92]} rotationY={0.06} />
    </group>
  );
}
