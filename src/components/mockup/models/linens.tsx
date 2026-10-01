"use client";

// Cama, mesa e banho: toalhas (rosto, mão, fitness, praia), canga, cortina, lençol e toalha de mesa.

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useAnimate } from "../viewer-hooks";
import { Fabric, closedTube, useGeometriesCleanup, useInflated } from "./fabric";
import { shapePolygon } from "./inflate";
import { makeShape, metalColor, useArtTexture, useGeometryCleanup, type ModelProps } from "./shared";
import { lathe, type Pt } from "./vessel";

/*
 * Todo pano daqui é uma grade paramétrica: `a` corre na largura e `b` no comprimento, ambos em cm
 * do tecido aberto. Uma função de forma leva cada (a, b) ao espaço (pendurado, estendido, caído
 * sobre a mesa…) e a arte ocupa um retângulo do pano pelo UV, então nunca estica: cada cm de tecido
 * recebe um cm de arte. Frente, verso e borda saem da mesma linha média, com a espessura real.
 * Os modelos trabalham em cm e o grupo raiz aplica a escala.
 */

const TAU = Math.PI * 2;

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

function smooth(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Crista suave: só a parte positiva do seno, afinada pela potência (rugas de pano no chão). */
function ridge(x: number, power: number) {
  return Math.pow(Math.max(0, Math.sin(x)), power);
}

function shade(color: string, k: number) {
  return new THREE.Color(color).multiplyScalar(k).getStyle();
}

/** Amostras de `start` até cada quebra, com passo máximo próprio em cada trecho (as quebras entram). */
function track(start: number, spans: [number, number][]): number[] {
  const out = [start];
  let from = start;
  for (const [to, step] of spans) {
    if (to <= from + 1e-6) continue;
    const n = Math.max(1, Math.ceil((to - from) / step));
    for (let k = 1; k <= n; k += 1) out.push(from + ((to - from) * k) / n);
    from = to;
  }
  return out;
}

// ---------------------------------------------------------------------------- texturas procedurais

type Pattern = "terry" | "ribs" | "crinkle" | "wood" | "wicker";

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

/** Atoalhado: laçadas claras sobrepostas, repetidas nas bordas para o ladrilho emendar. */
function paintTerry(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const random = seeded(17);
  ctx.fillStyle = "#565656";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 1500; i += 1) {
    const x = random() * w;
    const y = random() * h;
    const r = 4 + random() * 3.5;
    const tone = Math.round(150 + random() * 100);
    for (const dx of [-w, 0, w]) {
      for (const dy of [-h, 0, h]) {
        const px = x + dx;
        const py = y + dy;
        if (px < -r || px > w + r || py < -r || py > h + r) continue;
        const gradient = ctx.createRadialGradient(px, py, 0, px, py, r);
        gradient.addColorStop(0, `rgb(${tone},${tone},${tone})`);
        gradient.addColorStop(1, "rgba(86,86,86,0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, TAU);
        ctx.fill();
      }
    }
  }
}

/** Valor (0–255, ou cor) de cada pixel dos padrões calculados por fórmula; todos repetem sem emenda. */
function patternPixel(pattern: Pattern, x: number, y: number, w: number, h: number, noise: number): [number, number, number] {
  const u = x / w;
  const v = y / h;
  switch (pattern) {
    case "ribs": {
      // Barra maquinetada: nervuras horizontais com um leve cruzado de trama.
      const value = 128 + 92 * Math.sin(v * TAU * 8) + ((x + y) % 4 < 2 ? 14 : -14);
      return [value, value, value];
    }
    case "crinkle": {
      // Musseline amassada: vincos longos quase verticais.
      const value =
        128 +
        58 * Math.sin(TAU * u * 7 + 2.2 * Math.sin(TAU * v * 2)) +
        30 * Math.sin(TAU * u * 15 + 3 * Math.sin(TAU * v * 3 + 1)) +
        14 * Math.sin(TAU * v * 5 + TAU * u * 2);
      return [value, value, value];
    }
    case "wood": {
      // Veios ao longo de v (altura do torneado), com ondulação lenta e fibra fina.
      const grain = Math.sin(TAU * u * 11 + 1.6 * Math.sin(TAU * u * 3) + 0.8 * Math.sin(TAU * v * 2 + TAU * u * 5));
      const fine = Math.sin(TAU * u * 53 + 2 * Math.sin(TAU * v * 3));
      const k = clamp(0.5 + 0.32 * grain + 0.1 * fine + (noise - 0.5) * 0.08, 0, 1);
      return [138 + 58 * k, 96 + 58 * k, 62 + 46 * k];
    }
    default: {
      // Vime: células alternadas de fios horizontais e verticais, sombreados nas bordas.
      const cell = 16;
      const horizontal = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      const across = horizontal ? (y % 8) / 8 : (x % 8) / 8;
      const along = horizontal ? (x % cell) / cell : (y % cell) / cell;
      const k = 0.22 + 0.78 * Math.sin(Math.PI * across) * (0.72 + 0.28 * Math.sin(Math.PI * along)) - noise * 0.08;
      return [205 * k, 163 * k, 105 * k];
    }
  }
}

function patternTexture(pattern: Pattern, repeatX: number, repeatY: number) {
  const canvas = document.createElement("canvas");
  const size = pattern === "terry" || pattern === "crinkle" || pattern === "wood" ? 256 : 128;
  canvas.width = size;
  canvas.height = pattern === "wood" ? 512 : size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const { width: w, height: h } = canvas;
    if (pattern === "terry") {
      paintTerry(ctx, w, h);
    } else {
      const random = seeded(29);
      const image = ctx.createImageData(w, h);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const [r, g, b] = patternPixel(pattern, x, y, w, h, random());
          const i = (y * w + x) * 4;
          image.data[i] = clamp(r, 0, 255);
          image.data[i + 1] = clamp(g, 0, 255);
          image.data[i + 2] = clamp(b, 0, 255);
          image.data[i + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 8;
  return texture;
}

function usePattern(pattern: Pattern, repeatX: number, repeatY: number) {
  const texture = useMemo(() => patternTexture(pattern, repeatX, repeatY), [pattern, repeatX, repeatY]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

// ---------------------------------------------------------------------------- pano paramétrico

/** Forma do pano: (a, b) em cm do tecido aberto → linha média no espaço (cm). */
type ClothFn = (a: number, b: number, time: number, out: THREE.Vector3) => void;

type ClothPlan = {
  /** Amostras na largura e no comprimento (as quebras de material precisam estar entre elas). */
  as: number[];
  bs: number[];
  /** Meia espessura do tecido (cm). */
  half: number;
  /** Retângulo da arte no pano: u cresce com a, v com b. */
  art: { a0: number; b0: number; w: number; h: number };
  /** Material da face externa em cada célula (pelo centro da célula). */
  outer: (a: number, b: number) => number;
  /** Verso com a arte vazada (tecido fino): mesmo UV, espelhado de trás como na peça real. */
  bleed?: boolean;
};

type Cloth = {
  plan: ClothPlan;
  outer: THREE.BufferGeometry;
  inner: THREE.BufferGeometry;
  rim: THREE.BufferGeometry;
  mid: Float32Array;
  normal: Float32Array;
  /** Vértice da grade e lado (0 base, 1 direita, 2 topo, 3 esquerda) de cada amostra da borda. */
  rimGrid: Int32Array;
  rimSide: Uint8Array;
};

function gridGeometry(count: number, uv: Float32Array, buckets: Map<number, number[]>) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  const index: number[] = [];
  [...buckets.keys()]
    .sort((x, y) => x - y)
    .forEach((skin) => {
      const tris = buckets.get(skin) ?? [];
      geometry.addGroup(index.length, tris.length, skin);
      for (const t of tris) index.push(t);
    });
  geometry.setIndex(index);
  return geometry;
}

function createCloth(plan: ClothPlan): Cloth {
  const { as, bs, art } = plan;
  const na = as.length;
  const nb = bs.length;
  const count = na * nb;
  const uvOuter = new Float32Array(count * 2);
  const uvInner = new Float32Array(count * 2);
  for (let j = 0; j < nb; j += 1) {
    for (let i = 0; i < na; i += 1) {
      const k = (j * na + i) * 2;
      const u = (as[i] - art.a0) / art.w;
      const v = (bs[j] - art.b0) / art.h;
      uvOuter[k] = u;
      uvOuter[k + 1] = v;
      // Verso impresso de verdade fica legível de trás; o vazado é o espelho da frente.
      uvInner[k] = plan.bleed ? u : 1 - u;
      uvInner[k + 1] = v;
    }
  }
  const outerBuckets = new Map<number, number[]>();
  const innerTris: number[] = [];
  for (let j = 0; j < nb - 1; j += 1) {
    for (let i = 0; i < na - 1; i += 1) {
      const v00 = j * na + i;
      const v10 = v00 + 1;
      const v01 = v00 + na;
      const v11 = v01 + 1;
      const skin = plan.outer((as[i] + as[i + 1]) / 2, (bs[j] + bs[j + 1]) / 2);
      let bucket = outerBuckets.get(skin);
      if (!bucket) {
        bucket = [];
        outerBuckets.set(skin, bucket);
      }
      bucket.push(v00, v10, v01, v10, v11, v01);
      innerTris.push(v00, v01, v10, v10, v01, v11);
    }
  }
  const outer = gridGeometry(count, uvOuter, outerBuckets);
  const inner = gridGeometry(count, uvInner, new Map([[0, innerTris]]));

  // Borda: percorre o contorno da grade no sentido anti-horário (base, direita, topo, esquerda).
  const edges: [number[], number][] = [
    [Array.from({ length: na }, (_, i) => i), 0],
    [Array.from({ length: nb }, (_, j) => j * na + na - 1), 1],
    [Array.from({ length: na }, (_, i) => (nb - 1) * na + (na - 1 - i)), 2],
    [Array.from({ length: nb }, (_, j) => (nb - 1 - j) * na), 3],
  ];
  const rimGrid: number[] = [];
  const rimSide: number[] = [];
  const rimIndex: number[] = [];
  for (const [list, side] of edges) {
    const base = rimGrid.length;
    for (const g of list) {
      rimGrid.push(g);
      rimSide.push(side);
    }
    for (let k = 0; k < list.length - 1; k += 1) {
      const f0 = (base + k) * 2;
      rimIndex.push(f0, f0 + 1, f0 + 2, f0 + 1, f0 + 3, f0 + 2);
    }
  }
  const rim = new THREE.BufferGeometry();
  rim.setAttribute("position", new THREE.BufferAttribute(new Float32Array(rimGrid.length * 6), 3));
  rim.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(rimGrid.length * 6), 3));
  rim.setIndex(rimIndex);

  return {
    plan,
    outer,
    inner,
    rim,
    mid: new Float32Array(count * 3),
    normal: new Float32Array(count * 3),
    rimGrid: Int32Array.from(rimGrid),
    rimSide: Uint8Array.from(rimSide),
  };
}

const scratch = new THREE.Vector3();

/** Calcula linha média, normais (diferenças na grade) e grava frente, verso e borda. Não aloca. */
function fillCloth(cloth: Cloth, fn: ClothFn, time: number) {
  const { plan, mid, normal, rimGrid, rimSide } = cloth;
  const { as, bs, half } = plan;
  const na = as.length;
  const nb = bs.length;
  for (let j = 0; j < nb; j += 1) {
    for (let i = 0; i < na; i += 1) {
      fn(as[i], bs[j], time, scratch);
      const k = (j * na + i) * 3;
      mid[k] = scratch.x;
      mid[k + 1] = scratch.y;
      mid[k + 2] = scratch.z;
    }
  }
  for (let j = 0; j < nb; j += 1) {
    const jd = j > 0 ? j - 1 : j;
    const ju = j < nb - 1 ? j + 1 : j;
    for (let i = 0; i < na; i += 1) {
      const l = (j * na + (i > 0 ? i - 1 : i)) * 3;
      const r = (j * na + (i < na - 1 ? i + 1 : i)) * 3;
      const d = (jd * na + i) * 3;
      const u = (ju * na + i) * 3;
      const ax = mid[r] - mid[l];
      const ay = mid[r + 1] - mid[l + 1];
      const az = mid[r + 2] - mid[l + 2];
      const bx = mid[u] - mid[d];
      const by = mid[u + 1] - mid[d + 1];
      const bz = mid[u + 2] - mid[d + 2];
      let nx = ay * bz - az * by;
      let ny = az * bx - ax * bz;
      let nz = ax * by - ay * bx;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 1e-12) {
        nx /= len;
        ny /= len;
        nz /= len;
      } else {
        nx = 0;
        ny = 1;
        nz = 0;
      }
      const k = (j * na + i) * 3;
      normal[k] = nx;
      normal[k + 1] = ny;
      normal[k + 2] = nz;
    }
  }
  const outerPos = cloth.outer.attributes.position.array as Float32Array;
  const outerNor = cloth.outer.attributes.normal.array as Float32Array;
  const innerPos = cloth.inner.attributes.position.array as Float32Array;
  const innerNor = cloth.inner.attributes.normal.array as Float32Array;
  for (let k = 0; k < mid.length; k += 1) {
    outerPos[k] = mid[k] + normal[k] * half;
    outerNor[k] = normal[k];
    innerPos[k] = mid[k] - normal[k] * half;
    innerNor[k] = -normal[k];
  }
  const rimPos = cloth.rim.attributes.position.array as Float32Array;
  const rimNor = cloth.rim.attributes.normal.array as Float32Array;
  for (let s = 0; s < rimGrid.length; s += 1) {
    const g = rimGrid[s];
    const i = g % na;
    const j = (g - i) / na;
    const side = rimSide[s];
    // Normal da borda: para fora do pano, no plano do tecido.
    let neighbor = g;
    if (side === 0) neighbor = j < nb - 1 ? g + na : g;
    else if (side === 2) neighbor = j > 0 ? g - na : g;
    else if (side === 1) neighbor = i > 0 ? g - 1 : g;
    else neighbor = i < na - 1 ? g + 1 : g;
    const k = g * 3;
    const n = neighbor * 3;
    let ox = mid[k] - mid[n];
    let oy = mid[k + 1] - mid[n + 1];
    let oz = mid[k + 2] - mid[n + 2];
    const len = Math.sqrt(ox * ox + oy * oy + oz * oz);
    if (len > 1e-12) {
      ox /= len;
      oy /= len;
      oz /= len;
    } else {
      ox = normal[k];
      oy = normal[k + 1];
      oz = normal[k + 2];
    }
    const f = s * 6;
    for (let c = 0; c < 3; c += 1) {
      rimPos[f + c] = mid[k + c] + normal[k + c] * half;
      rimPos[f + 3 + c] = mid[k + c] - normal[k + c] * half;
    }
    rimNor[f] = ox;
    rimNor[f + 1] = oy;
    rimNor[f + 2] = oz;
    rimNor[f + 3] = ox;
    rimNor[f + 4] = oy;
    rimNor[f + 5] = oz;
  }
  // Sem lista literal: roda a cada quadro na canga animada e não pode alocar.
  touch(cloth.outer);
  touch(cloth.inner);
  touch(cloth.rim);
}

function touch(geometry: THREE.BufferGeometry) {
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.normal.needsUpdate = true;
  geometry.computeBoundingSphere();
}

function useCloth(plan: ClothPlan, fn: ClothFn) {
  const cloth = useMemo(() => {
    const created = createCloth(plan);
    fillCloth(created, fn, 0);
    return created;
  }, [plan, fn]);
  useEffect(
    () => () => {
      cloth.outer.dispose();
      cloth.inner.dispose();
      cloth.rim.dispose();
    },
    [cloth],
  );
  return cloth;
}

/** Frente (materiais por grupo, attach "material-N"), verso e borda do pano. */
function ClothMesh({ cloth, outer, inner, rimColor }: { cloth: Cloth; outer: ReactNode; inner: ReactNode; rimColor: string }) {
  return (
    <group>
      <mesh geometry={cloth.outer}>{outer}</mesh>
      <mesh geometry={cloth.inner}>{inner}</mesh>
      <mesh geometry={cloth.rim}>
        <meshStandardMaterial color={rimColor} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------- peças de apoio

/** Caixa estofada: retângulo extrudado na vertical com chanfro redondo; base em y = 0. */
function softBox(w: number, h: number, d: number, radius: number, bevel: number, smoothShading = true) {
  const b = Math.max(0.05, Math.min(bevel, w / 2 - 0.05, h / 2 - 0.05, d / 2 - 0.05));
  const shape = makeShape("rect", w - 2 * b, d - 2 * b, Math.max(0, radius - b));
  const extruded = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, h - 2 * b),
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 4,
    curveSegments: 6,
  });
  extruded.rotateX(-Math.PI / 2);
  extruded.translate(0, b, 0);
  if (!smoothShading) return extruded;
  // Estofado: solda os vértices para a luz correr macia pelos chanfros.
  extruded.deleteAttribute("uv");
  extruded.deleteAttribute("normal");
  const merged = mergeVertices(extruded, 1e-3);
  merged.computeVertexNormals();
  extruded.dispose();
  return merged;
}

/** Perna torneada afinando para baixo (mesa, cama). */
function legGeometry(height: number, top: number, bottom: number) {
  const pts: Pt[] = [
    [0, 0],
    [bottom * 0.9, 0],
    [bottom, height * 0.012],
    [bottom * 1.02, height * 0.06],
    [top * 0.96, height * 0.9],
    [top, height * 0.96],
    [top, height],
    [0, height],
  ];
  return lathe(pts, 28);
}

function Wood({ map }: { map: THREE.Texture }) {
  return <meshStandardMaterial map={map} roughness={0.58} />;
}

function Chrome() {
  return <meshStandardMaterial color="#e3e6ea" metalness={1} roughness={0.14} />;
}

// ---------------------------------------------------------------------------- toalha pendurada

const BAR_R = 1;

type TowelLayout = {
  artW: number;
  artH: number;
  fitness: boolean;
  half: number;
  hem: number;
  band: number;
  width: number;
  artB0: number;
  front: number;
  back: number;
  radius: number;
  arc: number;
  total: number;
};

/**
 * Medidas da toalha dobrada no varão (cm). Rosto e mão: a aba da frente mostra a arte inteira com a
 * barra maquinetada embaixo. Fitness: a arte é a faixa sublimada (28 × 8 cm) costurada no atoalhado.
 */
function towelLayout(widthCm: number, heightCm: number, fitness: boolean): TowelLayout {
  const artW = Math.max(5, widthCm);
  const artH = Math.max(3, heightCm);
  const half = fitness ? 0.24 : 0.3;
  const hem = 1.2;
  const band = fitness ? 0 : clamp(artH * 0.07, 2.8, 5.5);
  const width = fitness ? artW + 3 : artW;
  const artB0 = fitness ? 4.6 : hem + band;
  const front = fitness ? artB0 + artH + Math.max(14, artH * 1.8) : artB0 + artH + 1.8;
  const back = Math.max(band + hem + 8, front * (fitness ? 0.72 : 0.58));
  const radius = BAR_R + half + 0.08;
  const arc = Math.PI * radius;
  return { artW, artH, fitness, half, hem, band, width, artB0, front, back, radius, arc, total: front + arc + back };
}

function HangingTowel({ spec, art, label }: ModelProps) {
  const fitness = spec.variant === "fitness";
  const layout = useMemo(() => towelLayout(spec.widthCm, spec.heightCm, fitness), [spec.widthCm, spec.heightCm, fitness]);
  const texture = useArtTexture(layout.artW / layout.artH, "front", art, label);
  const terry = usePattern("terry", layout.artW / 6, layout.artH / 6);
  const ribs = usePattern("ribs", layout.artW / 4, layout.artH / 4);

  const plan = useMemo<ClothPlan>(() => {
    const L = layout;
    const artA = L.artW / 2;
    const artTop = L.artB0 + L.artH;
    const bandBack = L.total - L.hem - L.band;
    const as = L.fitness ? track(-L.width / 2, [[-artA, 0.75], [artA, 0.75], [L.width / 2, 0.75]]) : track(-L.width / 2, [[L.width / 2, 0.8]]);
    const bs = track(0, [
      [L.hem, 0.6],
      [L.hem + L.band, 0.8],
      [L.artB0, 1],
      [artTop, 1.1],
      [L.front, 1],
      [L.front + L.arc, 0.35],
      [bandBack, 1.2],
      [L.total - L.hem, 0.8],
      [L.total, 0.6],
    ]);
    return {
      as,
      bs,
      half: L.half,
      art: { a0: -artA, b0: L.artB0, w: L.artW, h: L.artH },
      outer: (a, b) => {
        if (b > L.artB0 && b < artTop && Math.abs(a) < artA) return 2;
        if (L.band > 0 && ((b > L.hem && b < L.hem + L.band) || (b > bandBack && b < L.total - L.hem))) return 1;
        return 0;
      },
    };
  }, [layout]);

  const fn = useMemo<ClothFn>(() => {
    const L = layout;
    const R = L.radius;
    const halfW = L.width / 2;
    const artTop = L.artB0 + L.artH;
    // Caimento de cada aba: ondas leves, bordas virando para trás e a ponta abrindo um pouco.
    const hang = (a: number, depth: number, phase: number) => {
      const s = smooth(0, 14, depth);
      const edge = Math.max(0, Math.abs(a) / halfW - 0.82) / 0.18;
      const waves = 0.32 * Math.sin((a / L.width) * TAU * 2.2 + phase) + 0.18 * Math.sin(a * 0.31 + depth * 0.05 + phase);
      return s * (waves - 0.7 * edge * edge) + 0.5 * (depth / L.front) ** 2;
    };
    return (a, b, _time, out) => {
      if (b <= L.front) {
        const depth = L.front - b;
        let z = R + hang(a, depth, 0.6);
        // Bainha dobrada (mais grossa) e, na fitness, a faixa costurada por cima do atoalhado.
        z += 0.14 * (1 - smooth(L.hem - 0.3, L.hem + 0.3, b));
        if (L.fitness) {
          const across = 1 - smooth(L.artW / 2 - 0.3, L.artW / 2 + 0.3, Math.abs(a));
          z += 0.12 * smooth(L.artB0 - 0.5, L.artB0 + 0.2, b) * (1 - smooth(artTop - 0.2, artTop + 0.5, b)) * across;
        }
        out.set(a, -depth, z);
      } else if (b <= L.front + L.arc) {
        const t = (b - L.front) / R;
        out.set(a, R * Math.sin(t), R * Math.cos(t));
      } else {
        const depth = b - L.front - L.arc;
        const z = -R - hang(a, depth, 2.1) - 0.14 * smooth(L.total - L.hem - 0.3, L.total - L.hem + 0.3, b);
        out.set(a, -depth, z);
      }
    };
  }, [layout]);

  const cloth = useCloth(plan, fn);

  // Fitness: debrum da faixa sublimada, um cordão em cima e outro embaixo.
  const piping = useMemo(() => {
    if (!layout.fitness) return [];
    const halfW = layout.width / 2;
    return [layout.artB0, layout.artB0 + layout.artH].map((b) => {
      const points = Array.from({ length: 25 }, (_, i) => {
        const p = new THREE.Vector3();
        fn(-halfW + (layout.width * i) / 24, b, 0, p);
        p.z += layout.half + 0.14;
        return p;
      });
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, 0.17, 6, false);
    });
  }, [layout, fn]);
  useGeometriesCleanup(piping);

  const base = spec.baseColor;
  const thread = spec.accentColor ?? shade(base, 0.8);
  const scale = 2.4 / Math.max(layout.width + 12, layout.front + 4);

  return (
    <group scale={scale}>
      <group rotation-y={0.22}>
        <ClothMesh
          cloth={cloth}
          rimColor={base}
          outer={
            <>
              <meshPhysicalMaterial attach="material-0" color={base} roughness={0.96} sheen={0.7} sheenRoughness={0.85} sheenColor={base} bumpMap={terry} bumpScale={1.4} />
              <meshPhysicalMaterial attach="material-1" color={shade(base, 0.95)} roughness={0.6} sheen={1} sheenRoughness={0.45} sheenColor="#ffffff" bumpMap={ribs} bumpScale={1.1} />
              {layout.fitness ? (
                <meshPhysicalMaterial attach="material-2" map={texture} roughness={0.55} sheen={0.4} sheenRoughness={0.5} sheenColor="#ffffff" />
              ) : (
                <meshPhysicalMaterial attach="material-2" map={texture} roughness={0.9} sheen={0.35} sheenRoughness={0.8} sheenColor="#ffffff" bumpMap={terry} bumpScale={0.7} />
              )}
            </>
          }
          inner={<meshPhysicalMaterial attach="material-0" color={base} roughness={0.96} sheen={0.7} sheenRoughness={0.85} sheenColor={base} bumpMap={terry} bumpScale={1.4} />}
        />
        {piping.map((geometry, i) => (
          <mesh key={i} geometry={geometry}>
            <meshStandardMaterial color={thread} roughness={0.7} />
          </mesh>
        ))}
        <TowelBar width={layout.width} />
      </group>
    </group>
  );
}

/** Porta-toalha cromado: varão, articulações e hastes até as canoplas da parede. */
function TowelBar({ width }: { width: number }) {
  const postX = width / 2 + 4;
  const depth = 8;
  return (
    <group>
      <mesh rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[BAR_R, BAR_R, postX * 2, 32]} />
        <Chrome />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position-x={side * postX}>
          <mesh>
            <sphereGeometry args={[BAR_R * 1.45, 24, 16]} />
            <Chrome />
          </mesh>
          <mesh position-z={-depth / 2} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.85, 0.95, depth, 24]} />
            <Chrome />
          </mesh>
          <mesh position-z={-depth - 0.4} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[2.6, 2.8, 0.9, 40]} />
            <Chrome />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------- toalha de praia

/** Toalha de praia estendida no chão: a arte inteira à vista e a ponta do fundo enrolada (verso para fora). */
function BeachTowel({ spec, art, label }: ModelProps) {
  const W = Math.max(20, spec.widthCm);
  const L = Math.max(20, spec.heightCm);
  const texture = useArtTexture(W / L, "front", art, label);
  const terry = usePattern("terry", W / 6, L / 6);
  const half = 0.3;
  const roll = clamp(L * 0.36, 24, 60);

  const plan = useMemo<ClothPlan>(
    () => ({
      as: track(-W / 2, [[W / 2, 1.2]]),
      bs: track(0, [
        [L, 1.4],
        [L + roll, 0.5],
      ]),
      half,
      art: { a0: -W / 2, b0: 0, w: W, h: L },
      outer: (_a, b) => (b < L ? 1 : 0),
    }),
    [W, L, roll],
  );

  const fn = useMemo<ClothFn>(() => {
    // Rolo em espiral de Arquimedes: cada volta encolhe uma espessura (mais folga).
    const k = (2 * half + 0.28) / TAU;
    const r0 = Math.max(5.8, Math.sqrt(2 * k * roll) * 1.3);
    return (a, b, _time, out) => {
      if (b <= L) {
        const fade = 1 - smooth(L - 18, L - 2, b);
        const n = 0.6 + 0.4 * Math.sin(a * 0.05 + b * 0.031 + 0.4);
        let h = (1.1 * ridge(a * 0.085 + b * 0.04 + 0.6, 4) + 0.7 * ridge(-a * 0.06 + b * 0.075 + 2.1, 6)) * n;
        h += 0.9 * (1 - smooth(0, 5, b)) * ridge(a * 0.16 + 0.8, 2);
        h += 0.5 * (1 - smooth(0, 4, W / 2 - Math.abs(a))) * ridge(b * 0.12, 2);
        out.set(a, half + h * fade, L / 2 - b);
        return;
      }
      const t = b - L;
      const phi = (r0 - Math.sqrt(Math.max(0, r0 * r0 - 2 * k * t))) / k;
      const r = r0 - k * phi;
      out.set(a, half + r0 - r * Math.cos(phi), -L / 2 - r * Math.sin(phi));
    };
  }, [W, L, roll]);

  const cloth = useCloth(plan, fn);
  const base = spec.baseColor;
  const terryMaterial = (slot: number) => (
    <meshPhysicalMaterial attach={`material-${slot}`} color={base} roughness={0.96} sheen={0.7} sheenRoughness={0.85} sheenColor={base} bumpMap={terry} bumpScale={1.3} />
  );

  return (
    <group scale={2.7 / Math.max(W, L + 14)} userData={{ view: { elevation: 0.78, azimuth: 0.3 } }}>
      <ClothMesh
        cloth={cloth}
        rimColor={base}
        outer={
          <>
            {terryMaterial(0)}
            <meshPhysicalMaterial attach="material-1" map={texture} roughness={0.9} sheen={0.35} sheenRoughness={0.8} sheenColor="#ffffff" bumpMap={terry} bumpScale={0.7} />
          </>
        }
        inner={terryMaterial(0)}
      />
    </group>
  );
}

// ---------------------------------------------------------------------------- canga

const BRASS = "#c9a25e";

/**
 * Canga de musseline presa por argolas com prendedor num varão de madeira suspenso por cordão.
 * Entre as argolas o tecido cede em festões; embaixo ganha pregas soltas e balança devagar.
 */
function Canga({ spec, art, label }: ModelProps) {
  const W = Math.max(20, spec.widthCm);
  const H = Math.max(20, spec.heightCm);
  const half = 0.07;
  const texture = useArtTexture(W / H, "front", art, label);
  const crinkle = usePattern("crinkle", W / 18, H / 18);
  const wood = usePattern("wood", 1, 1);
  const clips = clamp(Math.round(W / 30) + 1, 3, 7);
  const spacing = (W - 3) / (clips - 1);

  const plan = useMemo<ClothPlan>(
    () => ({
      as: track(-W / 2, [[W / 2, 1.4]]),
      bs: track(0, [[H, 1.4]]),
      half,
      art: { a0: -W / 2, b0: 0, w: W, h: H },
      outer: () => 0,
      bleed: true,
    }),
    [W, H],
  );

  const fn = useMemo<ClothFn>(
    () => (a, b, time, out) => {
      const phase = (a + W / 2 - 1.5) / spacing;
      const between = Math.sin(Math.PI * (phase - Math.floor(phase))) ** 2;
      const low = 1 - b / H;
      const sag = 2 * between * (b / H) ** 4;
      const cowl = 1.8 * between * smooth(H - 30, H, b);
      const folds = 1.6 * Math.sin((a * TAU) / 26 + 0.9) * low ** 1.3 + 0.7 * Math.sin((a * TAU) / 11 + 2) * low * low;
      const sway = 1.5 * low * low * Math.sin(time * 1.3 + a * 0.045) + 0.5 * low * Math.sin(time * 2.1 + a * 0.12 + b * 0.05);
      out.set(a, b - sag, cowl + folds + sway);
    },
    [W, H, spacing],
  );

  const cloth = useCloth(plan, fn);
  const animate = useAnimate();
  const time = useRef(0);
  useFrame((state, delta) => {
    if (!animate) return;
    time.current += Math.min(delta, 0.1);
    fillCloth(cloth, fn, time.current);
    state.invalidate();
  });

  const rodY = H + 6.5;
  const rodHalf = W / 2 + 10;
  const apex = rodY + 22;
  const parts = useMemo(() => {
    const knob = lathe(
      [
        [0, 0],
        [1.4, 0],
        [1.5, 0.6],
        [2.3, 2.2],
        [2.4, 3.2],
        [1.9, 4.4],
        [0.9, 5],
        [0, 5.1],
      ],
      28,
    );
    const ring = new THREE.TorusGeometry(2.1, 0.28, 10, 36);
    const eyelet = new THREE.TorusGeometry(0.75, 0.16, 8, 20);
    const clip = softBox(2.4, 3.2, 1.2, 0.5, 0.4);
    const cords = [-1, 1].map((side) => new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(side * (rodHalf - 3), rodY + 1, 0), new THREE.Vector3(0, apex, 0)), 1, 0.22, 8, false));
    return { knob, ring, eyelet, clip, cords };
  }, [rodY, rodHalf, apex]);
  useGeometryCleanup(parts.knob);
  useGeometryCleanup(parts.ring);
  useGeometryCleanup(parts.eyelet);
  useGeometryCleanup(parts.clip);
  useGeometriesCleanup(parts.cords);

  const clipXs = Array.from({ length: clips }, (_, k) => -W / 2 + 1.5 + k * spacing);

  return (
    <group scale={2.6 / Math.max(W + 26, apex)}>
      <group rotation-y={0.18}>
        <ClothMesh
          cloth={cloth}
          rimColor={spec.baseColor}
          outer={<meshPhysicalMaterial attach="material-0" map={texture} roughness={0.88} sheen={0.5} sheenRoughness={0.7} sheenColor="#ffffff" bumpMap={crinkle} bumpScale={1.4} />}
          inner={<meshPhysicalMaterial attach="material-0" map={texture} color="#f0f0f0" emissive="#ffffff" emissiveIntensity={0.28} roughness={0.92} bumpMap={crinkle} bumpScale={1.4} />}
        />
        <mesh position-y={rodY} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[1.3, 1.3, rodHalf * 2, 28]} />
          <Wood map={wood} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} geometry={parts.knob} position={[side * rodHalf, rodY, 0]} rotation-z={-side * (Math.PI / 2)}>
            <Wood map={wood} />
          </mesh>
        ))}
        {parts.cords.map((geometry, i) => (
          <mesh key={i} geometry={geometry}>
            <meshStandardMaterial color="#cdb48c" roughness={0.95} />
          </mesh>
        ))}
        <group position-y={apex} rotation-x={Math.PI / 2}>
          <mesh>
            <cylinderGeometry args={[0.45, 0.45, 3, 12]} />
            <meshStandardMaterial color="#8d8f93" metalness={1} roughness={0.35} />
          </mesh>
          {/* Cabeça do prego, para o cordão não escapar pela frente. */}
          <mesh position-y={1.6}>
            <cylinderGeometry args={[1, 1, 0.3, 20]} />
            <meshStandardMaterial color="#8d8f93" metalness={1} roughness={0.35} />
          </mesh>
        </group>
        {clipXs.map((x) => (
          <group key={x} position-x={x}>
            <mesh geometry={parts.ring} position-y={rodY - 0.52} rotation-y={Math.PI / 2}>
              <meshStandardMaterial color={BRASS} metalness={1} roughness={0.32} />
            </mesh>
            <mesh geometry={parts.eyelet} position-y={H + 2.75}>
              <meshStandardMaterial color={BRASS} metalness={1} roughness={0.32} />
            </mesh>
            <mesh geometry={parts.clip} position-y={H - 1.4}>
              <meshStandardMaterial color={BRASS} metalness={1} roughness={0.3} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/**
 * Toalhas: rosto, mão e fitness dobradas sobre um porta-toalha cromado (atoalhado com relevo de
 * laçadas por bump procedural, barra maquinetada nas pontas; na fitness a arte é a faixa costurada);
 * praia estendida no chão com uma ponta enrolada; canga leve presa num varão, balançando.
 */
export function TowelModel(props: ModelProps) {
  if (props.spec.variant === "beach") return <BeachTowel {...props} />;
  if (props.spec.variant === "canga") return <Canga {...props} />;
  return <HangingTowel {...props} />;
}

// ---------------------------------------------------------------------------- cortina

type Pleats = { width: number; edge: number; amplitude: number; k: number; xOfS: Float32Array; count: number };

/**
 * Pregas senoidais com a largura de tecido fixa: acha a largura projetada em que o comprimento de
 * arco dá exatamente a largura da arte e tabela x(s), para o UV seguir o tecido sem esticar a arte.
 */
function pleatsFor(fabricW: number): Pleats {
  const amplitude = 3.2;
  const edge = 3;
  const count = Math.max(3, Math.round((fabricW * 0.85) / 15));
  const steps = 2048;
  const arc = (width: number) => {
    const k = (count * Math.PI) / width;
    const x0 = -width / 2 - edge;
    const dx = (width + 2 * edge) / steps;
    let total = 0;
    for (let i = 0; i < steps; i += 1) {
      const slope = amplitude * k * Math.cos(k * (x0 + (i + 0.5) * dx + width / 2));
      total += dx * Math.sqrt(1 + slope * slope);
    }
    return total;
  };
  let lo = Math.max(1, (fabricW - 2 * edge) * 0.3);
  let hi = Math.max(lo + 1, fabricW - 2 * edge);
  for (let i = 0; i < 40; i += 1) {
    const midW = (lo + hi) / 2;
    if (arc(midW) > fabricW) hi = midW;
    else lo = midW;
  }
  const width = (lo + hi) / 2;
  const k = (count * Math.PI) / width;
  const samples = 512;
  const xOfS = new Float32Array(samples + 1);
  const x0 = -width / 2 - edge;
  const x1 = width / 2 + edge;
  const dx = (x1 - x0) / steps;
  xOfS[0] = x0;
  let s = 0;
  let m = 0;
  for (let i = 0; i < steps && m < samples; i += 1) {
    const xa = x0 + i * dx;
    const slope = amplitude * k * Math.cos(k * (xa + dx / 2 + width / 2));
    const ds = dx * Math.sqrt(1 + slope * slope);
    while (m < samples && ((m + 1) * fabricW) / samples <= s + ds) {
      m += 1;
      xOfS[m] = xa + (dx * ((m * fabricW) / samples - s)) / ds;
    }
    s += ds;
  }
  for (let r = m + 1; r <= samples; r += 1) xOfS[r] = x1;
  return { width, edge, amplitude, k, xOfS, count };
}

function xAlong(p: Pleats, s: number, fabricW: number) {
  const f = clamp(s / fabricW, 0, 1) * (p.xOfS.length - 1);
  const i = Math.min(p.xOfS.length - 2, Math.floor(f));
  return p.xOfS[i] + (p.xOfS[i + 1] - p.xOfS[i]) * (f - i);
}

/**
 * Cortina com ilhós num varão de metal com ponteiras e suportes: pregas senoidais rasas (a arte
 * segue o comprimento de arco do tecido), entretela no topo, bainha reta embaixo e verso vazado.
 */
export function CurtainModel({ spec, art, label }: ModelProps) {
  const W = Math.max(30, spec.widthCm);
  const H = Math.max(30, spec.heightCm);
  const half = 0.08;
  const texture = useArtTexture(W / H, "front", art, label);
  const pleats = useMemo(() => pleatsFor(W), [W]);

  const plan = useMemo<ClothPlan>(
    () => ({
      as: track(0, [[W, 1]]),
      bs: track(0, [
        [6, 1.2],
        [H - 12, 5],
        [H, 1.5],
      ]),
      half,
      art: { a0: 0, b0: 0, w: W, h: H },
      outer: () => 0,
      bleed: true,
    }),
    [W, H],
  );

  const fn = useMemo<ClothFn>(
    () => (a, b, _time, out) => {
      const x = xAlong(pleats, a, W);
      const phase = pleats.k * (x + pleats.width / 2);
      const low = 1 - b / H;
      const z = pleats.amplitude * Math.sin(phase) * (1 + 0.14 * low) + 0.8 * Math.sin(x * 0.043 + 1.1) * low ** 1.5;
      // Bainha embaixo e entretela no topo: tecido dobrado, um pouco mais grosso.
      const slope = pleats.amplitude * pleats.k * Math.cos(phase);
      const lift = 0.2 * (1 - smooth(3.6, 4.6, b)) + 0.16 * smooth(H - 10.5, H - 9.5, b);
      const inv = 1 / Math.sqrt(1 + slope * slope);
      out.set(x - slope * inv * lift, b, z + inv * lift);
    },
    [pleats, W, H],
  );

  const cloth = useCloth(plan, fn);

  const rodY = H - 6;
  const rodHalf = pleats.width / 2 + pleats.edge + 14;
  const bracketX = pleats.width / 2 + pleats.edge + 7;
  const parts = useMemo(() => {
    const grommet = new THREE.TorusGeometry(2.2, 0.42, 12, 32);
    const finial = lathe(
      [
        [0, 0],
        [1.5, 0],
        [1.6, 0.5],
        [1.2, 1.1],
        [1.25, 1.6],
        [2.2, 3],
        [2.5, 4.4],
        [2.2, 5.8],
        [1.3, 6.8],
        [0.5, 7.3],
        [0, 7.4],
      ],
      32,
    );
    // Cada ilhó acompanha a inclinação do tecido no ponto em que o varão o atravessa.
    const up = new THREE.Vector3(0, 0, 1);
    const grommets = Array.from({ length: pleats.count + 1 }, (_, j) => {
      const x = -pleats.width / 2 + (j * pleats.width) / pleats.count;
      const slope = pleats.amplitude * pleats.k * Math.cos(j * Math.PI);
      const n = new THREE.Vector3(-slope, 0, 1).normalize();
      const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(up, n));
      return { x, n: [n.x, n.y, n.z] as const, rotation: [e.x, e.y, e.z] as [number, number, number] };
    });
    return { grommet, finial, grommets };
  }, [pleats]);
  useGeometryCleanup(parts.grommet);
  useGeometryCleanup(parts.finial);

  const metal = spec.metal !== "none" ? metalColor(spec.metal) : "#c4c7cc";
  const offset = half + 0.45;

  return (
    <group scale={2.6 / Math.max(rodHalf * 2 + 6, H + 6)}>
      <group rotation-y={0.2}>
        <ClothMesh
          cloth={cloth}
          rimColor={spec.baseColor}
          outer={<meshPhysicalMaterial attach="material-0" map={texture} roughness={0.82} sheen={0.6} sheenRoughness={0.6} sheenColor="#ffffff" />}
          inner={<meshPhysicalMaterial attach="material-0" map={texture} color="#f0f0f0" emissive="#ffffff" emissiveIntensity={0.3} roughness={0.9} sheen={0.4} sheenColor="#ffffff" />}
        />
        {parts.grommets.flatMap((g) =>
          [1, -1].map((side) => (
            <mesh key={`${g.x}:${side}`} geometry={parts.grommet} position={[g.x + g.n[0] * offset * side, rodY, g.n[2] * offset * side]} rotation={g.rotation}>
              <meshStandardMaterial color={metal} metalness={1} roughness={0.25} />
            </mesh>
          )),
        )}
        <mesh position-y={rodY} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[1.15, 1.15, rodHalf * 2, 32]} />
          <meshStandardMaterial color={metal} metalness={1} roughness={0.32} />
        </mesh>
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh geometry={parts.finial} position={[side * rodHalf, rodY, 0]} rotation-z={-side * (Math.PI / 2)}>
              <meshStandardMaterial color={metal} metalness={1} roughness={0.22} />
            </mesh>
            <group position={[side * bracketX, rodY, 0]}>
              <mesh rotation-y={Math.PI / 2}>
                <torusGeometry args={[1.5, 0.35, 10, 28]} />
                <meshStandardMaterial color={metal} metalness={1} roughness={0.3} />
              </mesh>
              <mesh position={[0, -1.5, -5]} rotation-x={Math.PI / 2}>
                <cylinderGeometry args={[0.6, 0.6, 10, 16]} />
                <meshStandardMaterial color={metal} metalness={1} roughness={0.3} />
              </mesh>
              <mesh position={[0, -1.5, -10.3]} rotation-x={Math.PI / 2}>
                <cylinderGeometry args={[2.8, 2.8, 0.8, 32]} />
                <meshStandardMaterial color={metal} metalness={1} roughness={0.3} />
              </mesh>
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------- pano caído sobre tampo

type Tabletop = { hx: number; hz: number; corner: number; edge: number; top: number };

/** Deslocamento radial extra do pano pendurado (pregas): ângulo, sobra além do tampo, queda e ponto do tampo. */
type DrapeFolds = (theta: number, over: number, drop: number, cx: number, cz: number) => number;

/**
 * Leva o ponto (a, b) do pano (centrado; b cresce para o fundo) a cair sobre um tampo retangular de
 * cantos redondos (redondo quando corner = metade do lado): plano em cima, contorna a quina e desce.
 * Devolve a queda em cm.
 */
function drapeOver(box: Tabletop, a: number, b: number, folds: DrapeFolds, out: THREE.Vector3): number {
  const ix = Math.max(0, box.hx - box.corner);
  const iz = Math.max(0, box.hz - box.corner);
  const px = a;
  const pz = -b;
  const cx = clamp(px, -ix, ix);
  const cz = clamp(pz, -iz, iz);
  const dx = px - cx;
  const dz = pz - cz;
  const rho = Math.sqrt(dx * dx + dz * dz);
  if (rho < 1e-6) {
    out.set(px, box.top, pz);
    return 0;
  }
  const ux = dx / rho;
  const uz = dz / rho;
  const edge = Math.max(0.5, Math.min(box.edge, box.corner));
  const flat = box.corner - edge;
  const quarter = (edge * Math.PI) / 2;
  const d = rho - flat;
  let horizontal = rho;
  let drop = 0;
  if (d > quarter) {
    horizontal = flat + edge;
    drop = edge + d - quarter;
  } else if (d > 0) {
    const t = d / edge;
    horizontal = flat + edge * Math.sin(t);
    drop = edge * (1 - Math.cos(t));
  }
  const r = horizontal + folds(Math.atan2(uz, ux), Math.max(0, rho - box.corner), drop, cx, cz);
  out.set(cx + ux * r, box.top - drop, cz + uz * r);
  return drop;
}

// ---------------------------------------------------------------------------- lençol

const UPHOLSTERY = "#bab2a7";

/**
 * Cama de solteiro vista de lado: base estofada em pés torneados, cabeceira em gomos, colchão com
 * vivo e o lençol estampado cobrindo o tampo e caindo nas laterais; um travesseiro encostado.
 */
export function BeddingModel({ spec, art, label }: ModelProps) {
  const W = Math.max(60, spec.widthCm);
  const D = Math.max(40, spec.heightCm);
  const half = 0.1;
  const texture = useArtTexture(W / D, "front", art, label);
  const wood = usePattern("wood", 1, 1);

  const ML = clamp(W - 15, 50, 200);
  const MD = clamp(D - 12, 30, 200);
  const legH = 12;
  const baseH = 22;
  const mattressH = 20;
  const mattressY = legH + baseH;
  const topY = mattressY + mattressH;

  const plan = useMemo<ClothPlan>(
    () => ({
      as: track(-W / 2, [[W / 2, 1.4]]),
      bs: track(-D / 2, [[D / 2, 1.2]]),
      half,
      art: { a0: -W / 2, b0: -D / 2, w: W, h: D },
      outer: () => 0,
    }),
    [W, D],
  );

  const fn = useMemo<ClothFn>(() => {
    const box: Tabletop = { hx: ML / 2 + half + 0.15, hz: MD / 2 + half + 0.15, corner: 5, edge: 3, top: topY + half + 0.1 };
    const folds: DrapeFolds = (_theta, over, drop, cx, cz) => smooth(0, 3.5, drop) * (0.35 + 0.35 * Math.sin(cx * 0.09 + cz * 0.11 + 0.7) + 0.05 * over);
    return (a, b, _time, out) => {
      const drop = drapeOver(box, a, b, folds, out);
      const crease = 0.35 * ridge(a * 0.045 + b * 0.09 + 0.3, 8) + 0.25 * ridge(-a * 0.07 + b * 0.05 + 1.9, 10);
      out.y += crease * (1 - smooth(0, 2.5, drop));
    };
  }, [ML, MD, topY]);

  const cloth = useCloth(plan, fn);

  const headX = -ML / 2 - 2.5;
  const channels = 6;
  const channelD = (MD + 14) / channels;
  const parts = useMemo(() => {
    const base = softBox(ML + 4, baseH, MD + 4, 4, 2);
    const mattress = softBox(ML, mattressH, MD, 5, 3);
    const channel = softBox(8, 96, channelD, 3.6, 3.6);
    const leg = legGeometry(legH, 2.4, 1.6);
    const post = legGeometry(20, 2, 1.7);
    const piping = closedTube(shapePolygon(makeShape("rect", ML + 0.4, MD + 0.4, 5), 160), 0.45);
    return { base, mattress, channel, leg, post, piping };
  }, [ML, MD, channelD]);
  useGeometryCleanup(parts.base);
  useGeometryCleanup(parts.mattress);
  useGeometryCleanup(parts.channel);
  useGeometryCleanup(parts.leg);
  useGeometryCleanup(parts.post);
  useGeometryCleanup(parts.piping);

  const pillowShape = useMemo(() => makeShape("rect", 1.65, 1.05, 0.2), []);
  const pillow = useInflated(pillowShape, 0.16, { falloff: 0.25, folds: 0.01 });
  const pillowSeam = useMemo(() => (pillow ? closedTube(pillow.polygon, 0.012) : null), [pillow]);
  useGeometryCleanup(pillowSeam);

  const tilt = 0.22;
  const pillowX = headX + 6.4 + 21 * Math.sin(tilt) + 0.5;
  const pillowY = topY + 0.3 + 21 * Math.cos(tilt) - 1.5;
  const legInsetX = ML / 2 - 8;
  const legInsetZ = MD / 2 - 8;

  return (
    <group scale={2.9 / (W + 12)} userData={{ view: { elevation: 0.68, azimuth: 0.32 } }}>
      <ClothMesh
        cloth={cloth}
        rimColor={spec.baseColor}
        outer={<meshPhysicalMaterial attach="material-0" map={texture} roughness={0.8} sheen={0.5} sheenRoughness={0.6} sheenColor="#ffffff" />}
        inner={<meshPhysicalMaterial attach="material-0" color={spec.baseColor} roughness={0.9} sheen={0.4} sheenColor="#ffffff" />}
      />
      <mesh geometry={parts.mattress} position-y={mattressY}>
        <meshPhysicalMaterial color="#f3f1ec" roughness={0.9} sheen={0.6} sheenRoughness={0.7} sheenColor="#ffffff" />
      </mesh>
      <mesh geometry={parts.piping} position-y={mattressY + 2.6} rotation-x={-Math.PI / 2}>
        <meshStandardMaterial color="#d9d5cd" roughness={0.85} />
      </mesh>
      <mesh geometry={parts.base} position-y={legH}>
        <meshPhysicalMaterial color={UPHOLSTERY} roughness={0.92} sheen={0.8} sheenRoughness={0.8} sheenColor="#ffffff" />
      </mesh>
      {[
        [-legInsetX, -legInsetZ],
        [legInsetX, -legInsetZ],
        [-legInsetX, legInsetZ],
        [legInsetX, legInsetZ],
      ].map(([x, z]) => (
        <mesh key={`${x}:${z}`} geometry={parts.leg} position={[x, 0, z]}>
          <Wood map={wood} />
        </mesh>
      ))}
      <group position-x={headX - 4}>
        {Array.from({ length: channels }, (_, k) => (
          <mesh key={k} geometry={parts.channel} position={[0, 18, -(MD + 14) / 2 + channelD * (k + 0.5)]}>
            <meshPhysicalMaterial color={UPHOLSTERY} roughness={0.92} sheen={0.8} sheenRoughness={0.8} sheenColor="#ffffff" />
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <mesh key={side} geometry={parts.post} position-z={side * (MD / 2 + 2)}>
            <Wood map={wood} />
          </mesh>
        ))}
      </group>
      {pillow && (
        <group position={[pillowX, pillowY, 0]} rotation-y={Math.PI / 2}>
          <group rotation-x={-tilt} scale={40}>
            <mesh geometry={pillow.front}>
              <Fabric color="#f8f7f3" sheen={0.7} />
            </mesh>
            <mesh geometry={pillow.back}>
              <Fabric color="#f8f7f3" sheen={0.7} />
            </mesh>
            {pillowSeam && (
              <mesh geometry={pillowSeam}>
                <meshStandardMaterial color="#e6e3dc" roughness={0.9} />
              </mesh>
            )}
          </group>
        </group>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------- toalha de mesa

/**
 * Toalha de mesa caída sobre uma mesa de madeira (redonda se a toalha é quadrada): tampo de quina
 * arredondada e, na redonda, pregas que conservam o comprimento do pano (a arte da queda não espreme).
 */
function TableCloth({ spec, art, label }: ModelProps) {
  const W = Math.max(40, spec.widthCm);
  const D = Math.max(40, spec.heightCm);
  const half = 0.12;
  const texture = useArtTexture(W / D, "front", art, label);
  const wood = usePattern("wood", 1, 1);
  const tableH = 76;
  const topT = 3;
  const round = Math.abs(W - D) < 12;
  const hx = round ? clamp(Math.min(W, D) / 2 - 27, 20, 70) : clamp(W / 2 - 27, 20, 120);
  const hz = round ? hx : clamp(D / 2 - 27, 20, 120);
  const corner = round ? hx : 8;

  const plan = useMemo<ClothPlan>(
    () => ({
      as: track(-W / 2, [[W / 2, 1.25]]),
      bs: track(-D / 2, [[D / 2, 1.25]]),
      half,
      art: { a0: -W / 2, b0: -D / 2, w: W, h: D },
      outer: () => 0,
    }),
    [W, D],
  );

  const fn = useMemo<ClothFn>(() => {
    const pad = half + 0.12;
    const box: Tabletop = { hx: hx + pad, hz: hz + pad, corner: corner + pad, edge: 1.8, top: tableH + pad };
    const radius = corner + pad;
    const flutes = 14;
    // Mesa redonda: a volta do pano a uma distância `over` da borda mede (R + over) / R vezes a volta
    // da borda. As pregas (onda radial de mesmo comprimento de arco) devolvem essa sobra, então a arte
    // que cai não fica espremida; ficam mais fundas nas pontas, que caem mais. A onda só começa abaixo
    // da quina e, perto do tampo, desloca só para fora (não atravessa a madeira).
    const roundFolds: DrapeFolds = (theta, over, drop) => {
      const c = 1 + over / radius;
      const slope = (Math.PI / 2) * Math.sqrt(Math.max(0, c * c - 1));
      const amplitude = (0.92 * slope * radius) / flutes;
      const wave = Math.cos(flutes * theta + 0.5 * Math.sin(3 * theta + 1.3));
      const settle = 1 - smooth(topT, topT + 8, drop);
      return smooth(1.8, topT + 2, drop) * amplitude * (wave + settle) + 0.0012 * drop * drop;
    };
    // Mesa retangular: lados retos caem lisos; a sobra das quinas vira pregas.
    const rectFolds: DrapeFolds = (theta, over, drop) =>
      smooth(0, 10, drop) * 0.1 * over * (0.55 + Math.cos(8 * theta) + 0.35 * Math.sin(5 * theta + 1.3)) + 0.0012 * drop * drop;
    const folds = round ? roundFolds : rectFolds;
    return (a, b, _time, out) => {
      drapeOver(box, a, b, folds, out);
      out.y = Math.max(out.y, half + 0.05);
    };
  }, [hx, hz, corner, round]);

  const cloth = useCloth(plan, fn);

  const legH = tableH - topT;
  const parts = useMemo(() => {
    // Quina do tampo arredondada (raio 1,4 cm), concêntrica com a curva do pano: a madeira não fura o tecido.
    const bevel = 1.4;
    const roundTop = (): THREE.BufferGeometry => {
      const pts: Pt[] = [[0, 0]];
      for (let k = 0; k <= 8; k += 1) {
        const t = -Math.PI / 2 + (k / 8) * Math.PI;
        pts.push([hx - bevel + bevel * Math.cos(t), topT / 2 + (topT / 2) * Math.sin(t)]);
      }
      pts.push([0, topT]);
      return lathe(pts, 96);
    };
    const top = round ? roundTop() : softBox(hx * 2, topT, hz * 2, corner, bevel);
    const leg = legGeometry(legH, 2.6, 1.6);
    return { top, leg };
  }, [round, hx, hz, corner, legH]);
  useGeometryCleanup(parts.top);
  useGeometryCleanup(parts.leg);

  const legs: [number, number][] = round
    ? Array.from({ length: 4 }, (_, k) => {
        const angle = Math.PI / 4 + (k * Math.PI) / 2;
        return [Math.cos(angle) * hx * 0.6, Math.sin(angle) * hx * 0.6];
      })
    : [
        [-(hx - 7), -(hz - 7)],
        [hx - 7, -(hz - 7)],
        [-(hx - 7), hz - 7],
        [hx - 7, hz - 7],
      ];

  return (
    <group scale={2.7 / Math.max(W, D)} userData={{ view: { elevation: 0.72, azimuth: 0.28 } }}>
      <ClothMesh
        cloth={cloth}
        rimColor={spec.baseColor}
        outer={<meshPhysicalMaterial attach="material-0" map={texture} roughness={0.82} sheen={0.55} sheenRoughness={0.6} sheenColor="#ffffff" />}
        inner={<meshPhysicalMaterial attach="material-0" color={spec.baseColor} roughness={0.9} sheen={0.4} sheenColor="#ffffff" />}
      />
      <mesh geometry={parts.top} position-y={legH}>
        <meshStandardMaterial color="#9c7148" roughness={0.6} />
      </mesh>
      {legs.map(([x, z]) => (
        <mesh key={`${x}:${z}`} geometry={parts.leg} position={[x, 0, z]}>
          <Wood map={wood} />
        </mesh>
      ))}
    </group>
  );
}

/** Toalha de piquenique estendida no chão, com rugas suaves e uma cesta de vime ao lado. */
function PicnicCloth({ spec, art, label }: ModelProps) {
  const W = Math.max(40, spec.widthCm);
  const D = Math.max(40, spec.heightCm);
  const half = 0.15;
  const texture = useArtTexture(W / D, "front", art, label);

  const plan = useMemo<ClothPlan>(
    () => ({
      as: track(-W / 2, [[W / 2, 1.6]]),
      bs: track(-D / 2, [[D / 2, 1.6]]),
      half,
      art: { a0: -W / 2, b0: -D / 2, w: W, h: D },
      outer: () => 0,
    }),
    [W, D],
  );

  const fn = useMemo<ClothFn>(
    () => (a, b, _time, out) => {
      const n = 0.55 + 0.45 * Math.sin(a * 0.035 + b * 0.05 + 1.2);
      let h = (1.3 * ridge(a * 0.06 + b * 0.025 + 0.4, 5) + 0.9 * ridge(-a * 0.045 + b * 0.07 + 2.6, 7)) * n;
      // Bordas levemente onduladas, como pano jogado na grama.
      const e = Math.min(W / 2 - Math.abs(a), D / 2 - Math.abs(b));
      h += 0.8 * (1 - smooth(0, 7, e)) * (0.5 + 0.5 * Math.sin(a * 0.11 + b * 0.13));
      out.set(a, half + h, -b);
    },
    [W, D],
  );

  const cloth = useCloth(plan, fn);

  return (
    <group scale={2.7 / (W + 50)} userData={{ view: { elevation: 0.82, azimuth: 0.2 } }}>
      <ClothMesh
        cloth={cloth}
        rimColor={spec.baseColor}
        outer={<meshPhysicalMaterial attach="material-0" map={texture} roughness={0.84} sheen={0.5} sheenRoughness={0.6} sheenColor="#ffffff" />}
        inner={<meshPhysicalMaterial attach="material-0" color={spec.baseColor} roughness={0.9} />}
      />
      <group position={[W / 2 + 24, 0, -D / 2 + 22]} rotation-y={-0.5}>
        <PicnicBasket />
      </group>
    </group>
  );
}

/** Cesta de vime (cm): corpo levemente aberto em cima, borda, duas tampas e alça em arco. */
function PicnicBasket() {
  const wicker = usePattern("wicker", 0.2, 0.2);
  const parts = useMemo(() => {
    const body = new THREE.ExtrudeGeometry(makeShape("rect", 34.4, 23.4, 3.2), { depth: 16.4, bevelEnabled: true, bevelThickness: 0.8, bevelSize: 0.8, bevelSegments: 2, curveSegments: 6 });
    body.rotateX(-Math.PI / 2);
    body.translate(0, 0.8, 0);
    const pos = body.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const flare = 1 + 0.05 * (pos.getY(i) / 18);
      pos.setX(i, pos.getX(i) * flare);
      pos.setZ(i, pos.getZ(i) * flare);
    }
    body.computeVertexNormals();
    const lid = softBox(18.6, 1.4, 26.4, 1.5, 0.5, false);
    const rim = closedTube(shapePolygon(makeShape("rect", 37.8, 26.4, 4.2), 120), 0.7);
    const handle = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(Array.from({ length: 17 }, (_, i) => {
        const t = (i / 16) * Math.PI;
        return new THREE.Vector3(0, 19.4 + 10.5 * Math.sin(t), 10.5 * Math.cos(t));
      })),
      48,
      0.8,
      10,
      false,
    );
    return { body, lid, rim, handle };
  }, []);
  useGeometryCleanup(parts.body);
  useGeometryCleanup(parts.lid);
  useGeometryCleanup(parts.rim);
  useGeometryCleanup(parts.handle);
  return (
    <group>
      <mesh geometry={parts.body}>
        <meshStandardMaterial map={wicker} bumpMap={wicker} bumpScale={1.2} roughness={0.85} />
      </mesh>
      <mesh geometry={parts.rim} position-y={18} rotation-x={-Math.PI / 2}>
        <meshStandardMaterial color="#8a5a2e" roughness={0.6} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} geometry={parts.lid} position={[side * 9.45, 18.2, 0]}>
          <meshStandardMaterial map={wicker} bumpMap={wicker} bumpScale={1.2} roughness={0.85} />
        </mesh>
      ))}
      <mesh geometry={parts.handle}>
        <meshStandardMaterial color="#8a5a2e" roughness={0.55} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, 19.6, side * 10.5]}>
          <sphereGeometry args={[1.2, 16, 12]} />
          <meshStandardMaterial color="#8a5a2e" roughness={0.55} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Toalha de mesa sublimada caída sobre mesa de madeira (tampo plano, pregas em volta, mais fundas nas
 * pontas); piquenique estendida no chão com rugas suaves e cesta de vime. Vista de cima (view hint).
 */
export function TableclothModel(props: ModelProps) {
  if (props.spec.variant === "picnic") return <PicnicCloth {...props} />;
  return <TableCloth {...props} />;
}
