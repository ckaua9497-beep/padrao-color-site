"use client";

// Embalagens de papel cartão em corte e vinco: caixa para caneca (maleta com alça e janela; cartucho tuck end
// na versão baixa), caixinha "almofada" de bem-casado (carton) e a embalagem sacola em cunha (carton-bag).

import { useMemo, type ReactNode } from "react";
import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import { KIND_INFO } from "@/lib/mockup-kinds";
import type { ArtRender } from "../art";
import { useGeometriesCleanup } from "./fabric";
import { Dimensions, PrintMaterial, roughnessOf, sizeLabels, useArtTexture, type ModelProps } from "./shared";
import { handleGeometry, lathe } from "./vessel";

/*
 * Tudo em centímetros, reduzido por um fator de escala por peça (proporção real). O papel tem espessura:
 * cada aba é uma peça plana com a face externa impressa, a interna no papel e a borda cortada mostrando o
 * miolo; os vincos são cilindros finos na cor da impressão, que arredondam a dobra. A impressão é 4/0: a
 * arte vai nas faces de fora e o lado de dentro fica no papel. A construção segue as fotos dos produtos:
 * - caneca (alta): caixa maleta. Corpo retangular; das faces compridas sobem as duas águas do telhado, que
 *   se encontram no cume e viram a alça dupla (o furo de pega atravessa as duas); as faces curtas sobem em
 *   oitão triangular; uma janela vazada dobra a quina de trás e mostra a caneca branca lá dentro. A versão
 *   de 10,1 cm de altura é um cartucho tuck end, sem alça;
 * - bem-casado: caixinha "almofada". Duas pétalas sobem da base quadrada e se curvam até o meio do topo
 *   (perfil de meia-lua achatada), as cintas das pontas fecham os lados por baixo delas e a lingueta de
 *   pega com furo em "D" sai pela fenda do topo;
 * - sacola: cunha. Frente e verso inclinados que se encontram no alto, laterais triangulares, o furo da alça
 *   atravessando tudo e a aba em meia-lua que desce do topo sobre a frente, com a lingueta riscada.
 */

type Vec3 = [number, number, number];

/** Maior dimensão da cena, em unidades. */
const TARGET = 2.4;

const clamp = THREE.MathUtils.clamp;

/** Medida em cm válida: o spec pode vir sem medida, com zero ou NaN. */
function cm(value: number, fallback: number, min: number, max = 200) {
  return Number.isFinite(value) && value > 0 ? clamp(value, min, max) : fallback;
}

/* ------------------------------------------------------------------------------------------------
 * Papel e tinta
 * ---------------------------------------------------------------------------------------------- */

type Stock = {
  /** Espessura do papel (cm): 300 g ≈ 0,45 mm; micro-ondulado (onda E) ≈ 1,5 mm. */
  t: number;
  /** Cor do papel por fora, sem tinta (arte sem fundo). */
  paper: string;
  /** Lado de dentro, sem impressão. */
  inside: string;
  /** Miolo do papel nas bordas cortadas. */
  edge: string;
  /** Papel pardo ou reciclado sem revestimento: a tinta escurece (multiplica) e não há laminação. */
  tint: string | null;
};

const KRAFT = { paper: "#c39a6b", inside: "#b88f62", edge: "#a98157" };
const WHITE = "#ffffff";

/** Papel pelo texto das opções ("cartao 300g", "kraft 240g", "reciclato 290g", "couche 210g + onda e", "interior kraft"…). */
function stockOf(spec: MockupSpec): Stock {
  const d = spec.details ?? "";
  // O que vem depois de "dentro/interior/verso" fala do lado de dentro, não do papel de fora.
  const insideText = /(lado de dentro|dentro|interno|interior|verso)[^|]*/.exec(d)?.[0] ?? "";
  const outside = d.replace(insideText, "");
  const grams = Number(/(\d{3})\s*g\b/.exec(d)?.[1] ?? 300);
  const flute = /\bonda\b/.test(d);
  const t = flute ? 0.15 : clamp(grams * 0.00015, 0.025, 0.05);
  const dyed = spec.baseColor.toLowerCase() !== WHITE;
  if (dyed) {
    // Cartão colorido na massa: dentro e borda na mesma cor, um pouco mais escuros.
    const base = new THREE.Color(spec.baseColor);
    const shade = (k: number) => `#${base.clone().multiplyScalar(k).getHexString()}`;
    return { t, paper: spec.baseColor, inside: shade(0.92), edge: shade(0.85), tint: null };
  }
  if (/\bkraft\b/.test(outside)) return { t, ...KRAFT, tint: "#d2b08a" };
  if (/\breciclat/.test(outside)) return { t, paper: "#ebe4d4", inside: "#e2d9c6", edge: "#d6ccb6", tint: "#f1e9d8" };
  return {
    t,
    paper: "#fbfaf7",
    inside: /\bkraft\b/.test(insideText) ? KRAFT.inside : "#f3f1eb",
    edge: flute ? "#d8c29e" : "#e8e5dd",
    tint: null,
  };
}

const HEX = /^#(?:[0-9a-f]{3}){1,2}$/i;

/** Cor chapada das abas e do topo: o fundo da arte (a impressão sangra até o vinco), ou o papel se a arte não tem fundo. */
function inkOf(art: ArtRender, stock: Stock) {
  const background = art.background.trim();
  const base = HEX.test(background) ? background : stock.paper;
  if (!stock.tint) return base;
  return `#${new THREE.Color(base).multiply(new THREE.Color(stock.tint)).getHexString()}`;
}

/** Face com a arte. Papel pardo/reciclado escurece a tinta e sai sem laminação. */
function Ink({ map, spec, stock }: { map: THREE.Texture; spec: MockupSpec; stock: Stock }) {
  if (stock.tint) return <meshStandardMaterial map={map} color={stock.tint} roughness={0.92} />;
  return <PrintMaterial map={map} spec={spec} />;
}

/** Área chapada impressa (abas, vincos, laterais), com o mesmo acabamento da arte. `dim` < 1 escurece a cor. */
function Solid({
  color,
  spec,
  stock,
  vertexColors = false,
  side = THREE.FrontSide,
  dim = 1,
}: {
  color: string;
  spec: MockupSpec;
  stock: Stock;
  vertexColors?: boolean;
  side?: THREE.Side;
  dim?: number;
}) {
  const tone = dim === 1 ? color : shade(color, dim);
  if (stock.tint) return <meshStandardMaterial color={tone} roughness={0.92} vertexColors={vertexColors} side={side} />;
  const roughness = roughnessOf(spec);
  if (spec.clearcoat > 0) {
    return <meshPhysicalMaterial color={tone} roughness={roughness} clearcoat={spec.clearcoat} clearcoatRoughness={0.08} vertexColors={vertexColors} side={side} />;
  }
  return <meshStandardMaterial color={tone} roughness={roughness} vertexColors={vertexColors} side={side} />;
}

/** A mesma cor, mais escura (k < 1). */
function shade(color: string, k: number) {
  return `#${new THREE.Color(color).multiplyScalar(k).getHexString()}`;
}

/* ------------------------------------------------------------------------------------------------
 * Abas: peças planas de papel com espessura
 * ---------------------------------------------------------------------------------------------- */

type LeafGeo = { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry; edge: THREE.BufferGeometry };

/** Retângulo [x0, x1] × [y0, y1] com os cantos de cima arredondados em `rTop` e os de baixo em `rBottom`. */
function panelShape(x0: number, x1: number, y0: number, y1: number, rTop = 0, rBottom = 0) {
  const limit = Math.min(x1 - x0, y1 - y0) / 2;
  const rt = Math.min(rTop, limit);
  const rb = Math.min(rBottom, limit);
  const s = new THREE.Shape();
  s.moveTo(x0 + rb, y0);
  s.lineTo(x1 - rb, y0);
  if (rb > 0) s.absarc(x1 - rb, y0 + rb, rb, -Math.PI / 2, 0, false);
  s.lineTo(x1, y1 - rt);
  if (rt > 0) s.absarc(x1 - rt, y1 - rt, rt, 0, Math.PI / 2, false);
  s.lineTo(x0 + rt, y1);
  if (rt > 0) s.absarc(x0 + rt, y1 - rt, rt, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + rb);
  if (rb > 0) s.absarc(x0 + rb, y0 + rb, rb, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** Furo retangular de cantos arredondados (pega da caixa maleta) centrado em (cx, cy). */
function roundRectPath(cx: number, cy: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  const p = new THREE.Path();
  p.moveTo(x0 + rr, y0);
  p.lineTo(x1 - rr, y0);
  p.absarc(x1 - rr, y0 + rr, rr, -Math.PI / 2, 0, false);
  p.lineTo(x1, y1 - rr);
  p.absarc(x1 - rr, y1 - rr, rr, 0, Math.PI / 2, false);
  p.lineTo(x0 + rr, y1);
  p.absarc(x0 + rr, y1 - rr, rr, Math.PI / 2, Math.PI, false);
  p.lineTo(x0, y0 + rr);
  p.absarc(x0 + rr, y0 + rr, rr, Math.PI, Math.PI * 1.5, false);
  return p;
}

/** Furo da alça da sacola em "feijão": pontas redondas, topo reto e a borda de baixo arqueada para cima. */
function beanPath(cx: number, cy: number, w: number, h: number) {
  const r = h / 2;
  const a = Math.max(w / 2 - r, 0.001);
  const p = new THREE.Path();
  p.moveTo(cx - a, cy - r);
  p.quadraticCurveTo(cx, cy - r + h * 0.36, cx + a, cy - r);
  p.absarc(cx + a, cy, r, -Math.PI / 2, Math.PI / 2, false);
  p.lineTo(cx - a, cy + r);
  p.absarc(cx - a, cy, r, Math.PI / 2, Math.PI * 1.5, false);
  return p;
}

/**
 * Aba lateral (guarda-pó) da caixa: base no vinco (y = 0) de zBack a zFront, em z do mundo; a ponta da
 * frente desce em curva para a lingueta passar. `dir` converte z do mundo em x local (±1).
 */
function dustShape(zBack: number, zFront: number, h: number, dir: 1 | -1) {
  const X = (z: number) => z * dir;
  const chamfer = Math.min(h * 0.85, (zFront - zBack) * 0.4);
  const rb = Math.min(0.25, h * 0.2);
  const s = new THREE.Shape();
  s.moveTo(X(zBack), 0);
  s.lineTo(X(zFront), 0);
  s.lineTo(X(zFront), h * 0.12);
  s.quadraticCurveTo(X(zFront), h, X(zFront - chamfer), h);
  s.lineTo(X(zBack + rb), h);
  s.quadraticCurveTo(X(zBack), h, X(zBack), h - rb);
  s.closePath();
  return s;
}

function flipFaces(geometry: THREE.BufferGeometry) {
  const index = geometry.getIndex();
  if (index) {
    const a = index.array;
    for (let i = 0; i < a.length; i += 3) {
      const tmp = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = tmp;
    }
    index.needsUpdate = true;
  }
  const normal = geometry.getAttribute("normal");
  for (let i = 0; i < normal.count; i += 1) normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i));
  normal.needsUpdate = true;
}

/** Borda cortada: faixa de altura t em volta do contorno e dos furos, com a normal saindo do papel. */
function edgeGeometry(shape: THREE.Shape, t: number) {
  const { shape: outline, holes } = shape.extractPoints(12);
  const pos: number[] = [];
  const nor: number[] = [];
  const band = (loop: THREE.Vector2[], hole: boolean) => {
    const pts = loop.slice();
    if (pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop();
    // Contorno anti-horário: o lado de fora fica à direita do sentido; no furo, o papel fica do outro lado.
    const sign = !THREE.ShapeUtils.isClockWise(pts) !== hole ? 1 : -1;
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-7) continue;
      const nx = (sign * dy) / len;
      const ny = (-sign * dx) / len;
      const quad =
        sign > 0
          ? [a.x, a.y, 0, b.x, b.y, 0, a.x, a.y, t, b.x, b.y, 0, b.x, b.y, t, a.x, a.y, t]
          : [a.x, a.y, 0, a.x, a.y, t, b.x, b.y, 0, b.x, b.y, 0, a.x, a.y, t, b.x, b.y, t];
      pos.push(...quad);
      for (let k = 0; k < 6; k += 1) nor.push(nx, ny, 0);
    }
  };
  band(outline, false);
  holes.forEach((h) => band(h, true));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  return geometry;
}

/**
 * Peça de papel com espessura: contorno no plano xy, face interna em z = 0, externa (impressa) em z = t e a
 * borda cortada entre elas. `rect` = retângulo da arte na face externa ([x0, y0, largura, altura], UV 0–1);
 * `turn` gira a arte 180° (tampa presa atrás: a arte fica de pé para quem olha de frente).
 */
function leafGeometry(shape: THREE.Shape, t: number, rect?: [number, number, number, number], turn = false): LeafGeo {
  const outer = new THREE.ShapeGeometry(shape, 12);
  const pos = outer.getAttribute("position");
  if (!outer.boundingBox) outer.computeBoundingBox();
  const box = outer.boundingBox ?? new THREE.Box3();
  const [x0, y0, w, h] = rect ?? [box.min.x, box.min.y, box.max.x - box.min.x || 1, box.max.y - box.min.y || 1];
  const uv = outer.getAttribute("uv");
  for (let i = 0; i < pos.count; i += 1) {
    const u = (pos.getX(i) - x0) / w;
    const v = (pos.getY(i) - y0) / h;
    uv.setXY(i, turn ? 1 - u : u, turn ? 1 - v : v);
  }
  uv.needsUpdate = true;
  outer.translate(0, 0, t);
  const inner = new THREE.ShapeGeometry(shape, 12);
  flipFaces(inner);
  return { outer, inner, edge: edgeGeometry(shape, t) };
}

const leafList = (leaf: LeafGeo) => [leaf.outer, leaf.inner, leaf.edge];

/** `back` = material do lado de dentro, quando ele também é impresso (a lingueta do bem-casado). */
function Leaf({ geo, face, stock, back }: { geo: LeafGeo; face: ReactNode; stock: Stock; back?: ReactNode }) {
  return (
    <group>
      <mesh geometry={geo.outer} castShadow receiveShadow>
        {face}
      </mesh>
      <mesh geometry={geo.inner} castShadow receiveShadow>
        {back ?? <meshStandardMaterial color={stock.inside} roughness={0.9} />}
      </mesh>
      <mesh geometry={geo.edge}>
        <meshStandardMaterial color={stock.edge} roughness={0.95} />
      </mesh>
    </group>
  );
}

/** Vinco: cilindro fino ao longo de x (ou z) que arredonda a dobra por fora. */
function creaseGeometry(radius: number, length: number, axis: "x" | "z" = "x") {
  const g = new THREE.CylinderGeometry(radius, radius, length, 12, 1, true);
  if (axis === "x") g.rotateZ(Math.PI / 2);
  else g.rotateX(Math.PI / 2);
  return g;
}

/* ------------------------------------------------------------------------------------------------
 * Paredes: faixas em volta do retângulo de cantos arredondados
 * ---------------------------------------------------------------------------------------------- */

type Loop = { hx: number; hz: number; r: number };
type RimPt = { x: number; z: number; nx: number; nz: number; s: number };

const ARC_STEPS = 6;

/** Comprimento da faixa de um painel de largura `width` (trecho reto + meio canto de cada lado). */
function stripLength(width: number, r: number) {
  return width - 2 * r + (Math.PI / 2) * r;
}

/**
 * Painel k da parede (0 frente +z, 1 direita +x, 2 trás −z, 3 esquerda −x), da esquerda para a direita
 * vista de fora, com meio canto arredondado em cada ponta. `offset` desloca para fora (+) ou dentro (−);
 * `flat` = quantos trechos no reto (a frente com meia-lua precisa de mais pontos).
 */
function panelPath(loop: Loop, k: number, offset: number, flat = 1): RimPt[] {
  const phi = (k * Math.PI) / 2;
  const nx = Math.sin(phi);
  const nz = Math.cos(phi);
  const tx = Math.cos(phi);
  const tz = -Math.sin(phi);
  const a = k % 2 === 0 ? loop.hx : loop.hz;
  const b = k % 2 === 0 ? loop.hz : loop.hx;
  const r = loop.r;
  const rr = Math.max(r + offset, 0.0005);
  const pts: RimPt[] = [];
  const add = (u: number, w: number, cu: number, cw: number) => pts.push({ x: u * tx + w * nx, z: u * tz + w * nz, nx: cu * tx + cw * nx, nz: cu * tz + cw * nz, s: 0 });
  for (let i = 0; i <= ARC_STEPS; i += 1) {
    const th = -Math.PI / 4 + (Math.PI / 4) * (i / ARC_STEPS);
    add(-(a - r) + rr * Math.sin(th), b - r + rr * Math.cos(th), Math.sin(th), Math.cos(th));
  }
  for (let i = 1; i < flat; i += 1) add(-(a - r) + 2 * (a - r) * (i / flat), b + offset, 0, 1);
  for (let i = 0; i <= ARC_STEPS; i += 1) {
    const th = (Math.PI / 4) * (i / ARC_STEPS);
    add(a - r + rr * Math.sin(th), b - r + rr * Math.cos(th), Math.sin(th), Math.cos(th));
  }
  let s = 0;
  pts.forEach((p, i) => {
    if (i > 0) s += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
    p.s = s;
  });
  return pts;
}

type Top = (x: number, z: number) => number;

/**
 * Faixa vertical ao longo do caminho, de y0 até top(x, z). UV: u = comprimento, v = altura até vTop (a arte
 * é recortada junto com o papel, como na faca). `shade` = [fundo, alto]: cor por vértice (oclusão por dentro).
 */
function wallGeometry(path: RimPt[], y0: number, top: Top, vTop: number, inward = false, shade: [number, number] | null = null) {
  const n = path.length;
  const total = path[n - 1].s || 1;
  const pos = new Float32Array(n * 6);
  const nor = new Float32Array(n * 6);
  const uv = new Float32Array(n * 4);
  const col = shade ? new Float32Array(n * 6) : null;
  const sign = inward ? -1 : 1;
  path.forEach((p, i) => {
    const y1 = top(p.x, p.z);
    for (let j = 0; j < 2; j += 1) {
      const k = i * 2 + j;
      const y = j ? y1 : y0;
      const v = (y - y0) / (vTop - y0);
      pos.set([p.x, y, p.z], k * 3);
      nor.set([p.nx * sign, 0, p.nz * sign], k * 3);
      uv.set([p.s / total, v], k * 2);
      if (col && shade) {
        const c = shade[0] + (shade[1] - shade[0]) * Math.pow(clamp(v, 0, 1), 0.7);
        col.set([c, c, c], k * 3);
      }
    }
  });
  const index: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const a = i * 2;
    const b = a + 2;
    if (inward) index.push(a, a + 1, b, b, a + 1, b + 1);
    else index.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  if (col) geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geometry.setIndex(index);
  return geometry;
}

/** Borda de cima da parede (corte ou vinco), entre o contorno de fora e o de dentro, voltada para cima. */
function rimGeometry(outer: RimPt[], inner: RimPt[], top: Top) {
  const n = Math.min(outer.length, inner.length);
  const pos = new Float32Array(n * 6);
  for (let i = 0; i < n; i += 1) {
    pos.set([outer[i].x, top(outer[i].x, outer[i].z), outer[i].z, inner[i].x, top(inner[i].x, inner[i].z), inner[i].z], i * 6);
  }
  const index: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const o = i * 2;
    index.push(o, o + 2, o + 1, o + 2, o + 3, o + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** As quatro faixas impressas (frente, direita, trás, esquerda), o lado de dentro com oclusão e a borda de cima. */
function wallParts(loop: Loop, t: number, height: number, top: Top, frontFlat: number) {
  const outerPaths = [0, 1, 2, 3].map((k) => panelPath(loop, k, 0, k === 0 ? frontFlat : 1));
  const innerPaths = [0, 1, 2, 3].map((k) => panelPath(loop, k, -t, k === 0 ? frontFlat : 1));
  const outerLoop = outerPaths.flat();
  const innerLoop = innerPaths.flat();
  return {
    faces: outerPaths.map((path) => wallGeometry(path, 0, top, height)),
    inner: wallGeometry(innerLoop, t, top, height, true, [0.5, 1]),
    rim: rimGeometry(outerLoop, innerLoop, top),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Caneca branca (guardada na caixa maleta, vista pela janela)
 * ---------------------------------------------------------------------------------------------- */

/** Caneca de cerâmica branca lisa, alça no +x local. */
function PlainMug({ r, h, position, rotationY }: { r: number; h: number; position: Vec3; rotationY: number }) {
  const parts = useMemo(() => {
    const wall = Math.min(0.4, r * 0.1);
    const body = lathe(
      [
        [0, 0.06],
        [r - 0.8, 0],
        [r - 0.15, 0.04],
        [r - 0.02, 0.2],
        [r, 0.45],
        [r, h - 0.25],
        [r - 0.03, h - 0.06],
        [r - 0.12, h],
        [r - wall + 0.08, h],
        [r - wall, h - 0.08],
        [r - wall, 1],
        [r - wall - 0.35, 0.65],
        [0, 0.6],
      ],
      96,
    );
    const handle = handleGeometry(r - 0.2, h * 0.22, h * 0.78, r * 0.72, r * 0.125);
    return { body, handle, all: [body, handle] };
  }, [r, h]);
  useGeometriesCleanup(parts.all);
  const ceramic = <meshPhysicalMaterial color="#fbfbfa" roughness={0.12} clearcoat={1} clearcoatRoughness={0.05} />;
  return (
    <group position={position} rotation-y={rotationY}>
      <mesh geometry={parts.body} castShadow receiveShadow>
        {ceramic}
      </mesh>
      <mesh geometry={parts.handle} castShadow receiveShadow>
        {ceramic}
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Cartucho tuck end (caneca na versão baixa, sem alça)
 * ---------------------------------------------------------------------------------------------- */

/** Abertura da tampa (rad a partir de fechada), lingueta em relação à tampa e guarda-pós (π/2 = fechados). */
const LID = 0;
const TUCK = Math.PI / 2;
const DUST = Math.PI / 2;

type BoxDims = { W: number; H: number; D: number; t: number; r: number; notch: number; tuck: number; dust: number };

function boxParts({ W, H, D, t, r, notch, tuck, dust }: BoxDims) {
  // Meia-lua na borda de cima da frente: o dedo puxa a lingueta (e ela aparece por ali com a caixa fechada).
  const top: Top = (x, z) => (z > 0 && Math.abs(x) < notch ? H - notch * 0.8 * Math.sqrt(1 - (x / notch) ** 2) : H);
  const walls = wallParts({ hx: W / 2, hz: D / 2, r }, t, H, top, Math.max(8, Math.ceil((W - 2 * r) / 0.04)));
  const floor = new THREE.PlaneGeometry(W - 2 * t, D - 2 * t).rotateX(-Math.PI / 2).translate(0, t + 0.002, 0);
  // Tampa W × D presa no vinco de trás; arte girada para ficar de pé vista de frente.
  const lid = leafGeometry(panelShape(-W / 2, W / 2, 0, D), t, [-W / 2, 0, W, D], true);
  // Lingueta: um pouco mais estreita que o vão de dentro, pontas bem arredondadas.
  const tuckW = W - 2 * t - 0.12;
  const tuckLeaf = leafGeometry(panelShape(-tuckW / 2, tuckW / 2, 0, tuck, Math.min(tuck * 0.75, tuckW * 0.3), 0), t);
  // Guarda-pós: do vinco de trás até antes da lingueta (que desce rente à frente).
  const zBack = -D / 2 + t + 0.06;
  const zFront = D / 2 - 3 * t - 0.08;
  const dustR = leafGeometry(dustShape(zBack, zFront, dust, -1), t);
  const dustL = leafGeometry(dustShape(zBack, zFront, dust, 1), t);
  const creaseW = creaseGeometry(t * 1.15, W);
  // Dentro do grupo girado das laterais, o eixo x local corre ao longo da profundidade da caixa.
  const creaseD = creaseGeometry(t * 1.1, zFront - zBack);
  return {
    walls,
    floor,
    lid,
    tuck: tuckLeaf,
    dustR,
    dustL,
    creaseW,
    creaseD,
    creaseDZ: (zFront + zBack) / 2,
    all: [...walls.faces, walls.inner, walls.rim, floor, ...leafList(lid), ...leafList(tuckLeaf), ...leafList(dustR), ...leafList(dustL), creaseW, creaseD],
  };
}

/**
 * Cartucho de papel cartão estilo tuck end, montado e fechado (o desenho da versão de 10,1 cm): tampa presa
 * atrás com a lingueta encaixada por dentro da frente (aparece pela meia-lua do corte), guarda-pós dobrados
 * por baixo da tampa, vincos arredondados e o miolo do papel nas bordas cortadas. Arte 4/0 em frente,
 * verso, laterais e tampa.
 */
function TuckCarton({ spec, art, label, showDims }: ModelProps) {
  const W = cm(spec.widthCm, 8, 2, 60);
  const H = cm(spec.heightCm, 10, 1.5, 60);
  const D = cm(spec.depthCm, 8, 1.5, 60);
  const stock = stockOf(spec);
  const { t } = stock;
  const r = clamp(t * 1.6, 0.04, 0.12);
  const ink = inkOf(art, stock);

  const panelArt = useMemo(() => ({ ...art, opaque: true }), [art]);
  const frontArt = useArtTexture(stripLength(W, r) / H, "front", panelArt, label);
  const sideArt = useArtTexture(stripLength(D, r) / H, "front", panelArt, label);
  const topArt = useArtTexture(W / D, "front", panelArt, label);

  const notch = clamp(W * 0.09, 0.42, 1.1);
  const tuck = clamp(Math.min(D, H) * 0.24, 0.9, 2.6);
  const dust = clamp(W * 0.42, 0.8, D * 0.45);
  const parts = useMemo(() => boxParts({ W, H, D, t, r, notch, tuck, dust }), [W, H, D, t, r, notch, tuck, dust]);
  useGeometriesCleanup(parts.all);

  const S = TARGET / Math.max(H, D, W);
  const [lw, lh] = sizeLabels(spec);
  const solid = <Solid color={ink} spec={spec} stock={stock} />;

  return (
    <group userData={{ view: { elevation: 0.4, azimuth: 0.5 } }}>
      <group scale={S}>
        {parts.walls.faces.map((g, k) => (
          <mesh key={k} geometry={g} castShadow receiveShadow>
            <Ink map={k % 2 === 0 ? frontArt : sideArt} spec={spec} stock={stock} />
          </mesh>
        ))}
        <mesh geometry={parts.walls.inner} receiveShadow>
          <meshStandardMaterial color={stock.inside} roughness={0.9} vertexColors />
        </mesh>
        <mesh geometry={parts.walls.rim}>
          <meshStandardMaterial color={stock.edge} roughness={0.95} />
        </mesh>
        <mesh geometry={parts.floor} receiveShadow>
          <meshStandardMaterial color={stock.inside} roughness={0.9} />
        </mesh>

        {/* Tampa: vinco atrás, lingueta na ponta. */}
        <mesh geometry={parts.creaseW} position={[0, H, -D / 2]}>
          {solid}
        </mesh>
        <group position={[0, H, -D / 2]} rotation-y={Math.PI}>
          <group rotation-x={-Math.PI / 2 + LID}>
            <Leaf geo={parts.lid} face={<Ink map={topArt} spec={spec} stock={stock} />} stock={stock} />
            <mesh geometry={parts.creaseW} position={[0, D - t, 0]}>
              {solid}
            </mesh>
            <group position={[0, D - 2 * t - 0.01, 0]} rotation-x={-TUCK}>
              <Leaf geo={parts.tuck} face={solid} stock={stock} />
            </group>
          </group>
        </group>

        {/* Guarda-pós presos no alto das laterais (dobram para dentro, por baixo da tampa). */}
        {([1, -1] as const).map((side) => (
          <group key={side} position={[side * (W / 2 - t), H - t, 0]} rotation-y={(side * Math.PI) / 2}>
            <mesh geometry={parts.creaseD} position-x={-side * parts.creaseDZ}>
              {solid}
            </mesh>
            <group rotation-x={-DUST}>
              <Leaf geo={side === 1 ? parts.dustR : parts.dustL} face={solid} stock={stock} />
            </group>
          </group>
        ))}
      </group>
      {showDims && KIND_INFO[spec.kind].dims && (
        <group position={[0, (H / 2) * S, (D / 2) * S + 0.01]}>
          <Dimensions w={W * S} h={H * S} z={0} labelW={lw} labelH={lh} />
        </group>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Caixa maleta para caneca: telhado de duas águas, alça vazada e janela na quina
 * ---------------------------------------------------------------------------------------------- */

/** `a` = lado comprido (águas e alça correm ao longo dele, em z), `b` = lado curto (oitões, em x). */
type GableDims = { a: number; b: number; Hb: number; rise: number; hh: number; t: number };

/**
 * Proporções medidas na foto da caixa de 8,25 × 15,95 × 11,3: corpo com 63% da altura, oitão (do vinco ao
 * cume) com 28% e a alça que passa do cume com o resto. As águas ficam íngremes, como na caixa real.
 */
function gableLayout(W: number, H: number, D: number, t: number): GableDims {
  const b = Math.min(W, D);
  const a = Math.max(W, D);
  const Hb = H * 0.633;
  const rise = clamp(H * 0.276, b * 0.4, b * 0.75);
  const hh = Math.max(H - Hb - rise, 0.6);
  return { a, b, Hb, rise, hh, t };
}

/**
 * Janela que dobra a quina (+x, −z): metade da face comprida (do lado de trás) e dois terços da face curta
 * de trás, da altura de 24% a 75% do corpo — a caneca aparece por ela.
 */
function windowOf({ a, b, Hb }: GableDims) {
  return { y0: Hb * 0.24, y1: Hb * 0.75, onLong: a * 0.48, onShort: b * 0.64, r: Math.min(0.12, Hb * 0.015) };
}

/** Painel [x0, x1] × [0, h] com o recorte da janela encostado na borda direita (side = 1) ou na esquerda (−1). */
function notchedShape(x0: number, x1: number, h: number, side: 1 | -1, len: number, y0: number, y1: number, r: number) {
  const s = new THREE.Shape();
  s.moveTo(x0, 0);
  s.lineTo(x1, 0);
  if (side === 1) {
    const xn = x1 - len;
    s.lineTo(x1, y0);
    s.lineTo(xn + r, y0);
    s.quadraticCurveTo(xn, y0, xn, y0 + r);
    s.lineTo(xn, y1 - r);
    s.quadraticCurveTo(xn, y1, xn + r, y1);
    s.lineTo(x1, y1);
    s.lineTo(x1, h);
    s.lineTo(x0, h);
  } else {
    const xn = x0 + len;
    s.lineTo(x1, h);
    s.lineTo(x0, h);
    s.lineTo(x0, y1);
    s.lineTo(xn - r, y1);
    s.quadraticCurveTo(xn, y1, xn, y1 - r);
    s.lineTo(xn, y0 + r);
    s.quadraticCurveTo(xn, y0, xn - r, y0);
    s.lineTo(x0, y0);
  }
  s.closePath();
  return s;
}

/**
 * Parte da alça acima do cume (u ao longo do comprimento, v para cima): a pega central com cantos redondos
 * e as orelhas baixas nas pontas, separadas dela por uma fenda (como na faca). Começa em v = −0,25, escondida
 * entre as águas.
 */
function handleShape(a: number, hh: number) {
  const e = a / 2;
  const c = a * 0.4;
  const g = Math.min(0.22, a * 0.02);
  const ear = Math.min(0.4, hh * 0.3);
  const re = Math.min(0.3, ear * 0.8, (e - c - g) * 0.5);
  const r = Math.min(0.6, hh * 0.45);
  const s = new THREE.Shape();
  s.moveTo(-e, -0.25);
  s.lineTo(e, -0.25);
  s.lineTo(e, ear - re);
  s.quadraticCurveTo(e, ear, e - re, ear);
  s.lineTo(c + g, ear);
  s.lineTo(c + g, 0.04);
  s.lineTo(c, 0.04);
  s.lineTo(c, hh - r);
  s.quadraticCurveTo(c, hh, c - r, hh);
  s.lineTo(-c + r, hh);
  s.quadraticCurveTo(-c, hh, -c, hh - r);
  s.lineTo(-c, 0.04);
  s.lineTo(-c - g, 0.04);
  s.lineTo(-c - g, ear);
  s.lineTo(-e + re, ear);
  s.quadraticCurveTo(-e, ear, -e, ear - re);
  s.closePath();
  return s;
}

function gableParts(d: GableDims) {
  const { a, b, Hb, rise, hh, t } = d;
  const win = windowOf(d);
  // Faces curtas inteiras (b); as compridas param uma espessura antes da quina (as curtas cobrem).
  const front = leafGeometry(panelShape(-b / 2, b / 2, 0, Hb), t, [-b / 2, 0, b, Hb]);
  const back = leafGeometry(notchedShape(-b / 2, b / 2, Hb, -1, win.onShort, win.y0, win.y1, win.r), t);
  const left = leafGeometry(panelShape(-a / 2 + t, a / 2 - t, 0, Hb), t, [-a / 2, 0, a, Hb]);
  // Face comprida da janela: a arte fica inteira no trecho cheio (como na foto, o texto ao lado da janela);
  // as faixas acima e abaixo da janela formam a moldura, na cor de fundo.
  const ux = a / 2 - win.onLong;
  const right = leafGeometry(panelShape(-a / 2 + t, ux, 0, Hb), t, [-a / 2, 0, ux + a / 2, Hb]);
  const frameLow = leafGeometry(panelShape(ux, a / 2 - t, 0, win.y0), t);
  const frameHigh = leafGeometry(panelShape(ux, a / 2 - t, win.y1, Hb), t);
  // Oitão: triângulo acima da face curta, recuado uma espessura para as águas cobrirem as bordas inclinadas.
  const tri = new THREE.Shape();
  tri.moveTo(-(b / 2 - t), 0);
  tri.lineTo(b / 2 - t, 0);
  tri.lineTo(0, rise);
  tri.closePath();
  const gable = leafGeometry(tri, t);
  // Águas: do vinco no alto da face comprida até o cume. O furo de pega (retângulo bem arredondado) fica na
  // parte de cima das duas, alinhado: olhando de lado, vê-se através da caixa.
  const run = b / 2 - t;
  const L = Math.hypot(run, rise);
  const slopeShape = panelShape(-a / 2, a / 2, 0, L);
  const holeH = clamp(L * 0.42, 1.2, 3.2);
  const holeW = clamp(a * 0.5, holeH * 1.6, 7.5);
  slopeShape.holes.push(roundRectPath(0, L * 0.57, holeW, holeH, holeH * 0.42));
  const slope = leafGeometry(slopeShape, t);
  const handle = leafGeometry(handleShape(a, hh), t);
  const floor = new THREE.PlaneGeometry(b - 2 * t, a - 2 * t).rotateX(-Math.PI / 2).translate(0, t * 0.6, 0);
  // Vincos: quinas verticais (cilindro de altura 1, escalado por trecho), alto das faces compridas, pé dos
  // oitões e o cume.
  const corner = new THREE.CylinderGeometry(t * 1.15, t * 1.15, 1, 10, 1, true);
  const topEdge = creaseGeometry(t * 1.1, a - 2 * t, "z");
  const gableEdge = creaseGeometry(t, b - 2 * t);
  const ridge = creaseGeometry(t * 1.7, a, "z");
  return {
    front,
    back,
    right,
    frameLow,
    frameHigh,
    left,
    gable,
    slope,
    handle,
    floor,
    corner,
    topEdge,
    gableEdge,
    ridge,
    win,
    beta: Math.atan2(run, rise),
    all: [
      ...leafList(front),
      ...leafList(back),
      ...leafList(right),
      ...leafList(frameLow),
      ...leafList(frameHigh),
      ...leafList(left),
      ...leafList(gable),
      ...leafList(slope),
      ...leafList(handle),
      floor,
      corner,
      topEdge,
      gableEdge,
      ridge,
    ],
  };
}

/**
 * Embalagem para caneca alta (8,25 × 15,95 × 11,3 e 11,6 × 17 × 8,5): caixa maleta de papel cartão com as
 * duas águas íngremes subindo das faces compridas até a alça dupla, oitões nas faces curtas e a janela que
 * dobra a quina de trás, por onde se vê a caneca branca guardada. Arte 4/0 na frente, na face comprida
 * cheia e no trecho cheio da face da janela (inteira, sem ser cortada pelo vão); moldura da janela, fundo,
 * telhado e alça saem na cor de fundo da impressão. Modelado com o comprido em z e girado quando a largura
 * é a maior medida (a frente passa a ser a face comprida).
 */
function GableCarton({ spec, art, label, showDims }: ModelProps) {
  const W = cm(spec.widthCm, 8.25, 3, 60);
  const H = cm(spec.heightCm, 15.95, 4, 80);
  const D = cm(spec.depthCm, 11.3, 3, 60);
  const stock = stockOf(spec);
  const { a, b, Hb, rise, hh, t } = gableLayout(W, H, D, stock.t);
  const ink = inkOf(art, stock);
  const parts = useMemo(() => gableParts({ a, b, Hb, rise, hh, t }), [a, b, Hb, rise, hh, t]);
  useGeometriesCleanup(parts.all);

  const panelArt = useMemo(() => ({ ...art, opaque: true }), [art]);
  const { win } = parts;
  const shortArt = useArtTexture(b / Hb, "front", panelArt, label);
  const longArt = useArtTexture(a / Hb, "front", panelArt, label);
  const windowArt = useArtTexture((a - win.onLong) / Hb, "front", panelArt, label);

  // Caneca branca lá dentro: o corpo aparece pela janela; a alça vai para a quina da frente à esquerda, na
  // diagonal (só ali ela cabe), e o corpo recua um pouco para o fundo.
  const mugR = clamp(b / 2 - t - 0.3, 2, 4.2);
  const mugH = clamp(Math.min(Hb - 0.5, mugR * 2.6), 4, 12);
  const mugZ = -clamp(a / 2 - t - 0.25 - mugR, 0, 0.4);
  const mugTurn = Math.atan2(-(a / 2), -(b / 2));
  // Quinas verticais: a da janela só tem os trechos de cima e de baixo.
  const corners: { x: number; z: number; y0: number; y1: number }[] = [];
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const x = sx * (b / 2 - t);
      const z = sz * (a / 2 - t);
      if (sx === 1 && sz === -1) corners.push({ x, z, y0: 0, y1: win.y0 }, { x, z, y0: win.y1, y1: Hb });
      else corners.push({ x, z, y0: 0, y1: Hb });
    }
  }

  const S = TARGET / Math.max(H, W, D);
  const [lw, lh] = sizeLabels(spec);
  const solid = <Solid color={ink} spec={spec} stock={stock} />;
  const shortFace = <Ink map={shortArt} spec={spec} stock={stock} />;
  const longFace = <Ink map={longArt} spec={spec} stock={stock} />;

  return (
    <group userData={{ view: { elevation: 0.2, azimuth: W > D ? 0.9 - Math.PI / 2 : 0.9 } }}>
      <group scale={S}>
        <group rotation-y={W > D ? -Math.PI / 2 : 0}>
          {/* Corpo: faces curtas (frente; fundo com a janela) e compridas (direita com a janela, esquerda). */}
          <group position={[0, 0, a / 2 - t]}>
            <Leaf geo={parts.front} face={shortFace} stock={stock} />
          </group>
          <group position={[0, 0, -(a / 2 - t)]} rotation-y={Math.PI}>
            <Leaf geo={parts.back} face={solid} stock={stock} />
          </group>
          <group position={[b / 2 - t, 0, 0]} rotation-y={Math.PI / 2}>
            <Leaf geo={parts.right} face={<Ink map={windowArt} spec={spec} stock={stock} />} stock={stock} />
            <Leaf geo={parts.frameLow} face={solid} stock={stock} />
            <Leaf geo={parts.frameHigh} face={solid} stock={stock} />
          </group>
          <group position={[-(b / 2 - t), 0, 0]} rotation-y={-Math.PI / 2}>
            <Leaf geo={parts.left} face={longFace} stock={stock} />
          </group>
          <mesh geometry={parts.floor} receiveShadow>
            <meshStandardMaterial color={stock.inside} roughness={0.9} />
          </mesh>
          {corners.map((c, k) => (
            <mesh key={k} geometry={parts.corner} position={[c.x, (c.y0 + c.y1) / 2, c.z]} scale-y={c.y1 - c.y0}>
              {solid}
            </mesh>
          ))}

          {/* Oitões: triângulos acima das faces curtas. */}
          {[0, Math.PI].map((ry) => (
            <group key={ry} rotation-y={ry}>
              <mesh geometry={parts.gableEdge} position={[0, Hb, a / 2 - t]}>
                {solid}
              </mesh>
              <group position={[0, Hb, a / 2 - 2 * t]}>
                <Leaf geo={parts.gable} face={solid} stock={stock} />
              </group>
            </group>
          ))}

          {/* Águas (com o furo de pega) e as duas folhas da alça acima do cume. */}
          {([1, -1] as const).map((sx) => (
            <group key={sx}>
              <mesh geometry={parts.topEdge} position={[sx * (b / 2 - t), Hb, 0]}>
                {solid}
              </mesh>
              <group position={[sx * (b / 2 - t), Hb, 0]} rotation-y={(sx * Math.PI) / 2}>
                <group rotation-x={-parts.beta}>
                  <Leaf geo={parts.slope} face={solid} stock={stock} />
                </group>
              </group>
              <group position={[0, Hb + rise, 0]} rotation-y={(sx * Math.PI) / 2}>
                <Leaf geo={parts.handle} face={solid} stock={stock} />
              </group>
            </group>
          ))}
          <mesh geometry={parts.ridge} position={[0, Hb + rise, 0]}>
            {solid}
          </mesh>

          <PlainMug r={mugR} h={mugH} position={[0, t, mugZ]} rotationY={mugTurn} />
        </group>
      </group>
      {showDims && KIND_INFO[spec.kind].dims && (
        <group position={[0, (H / 2) * S, (D / 2) * S + 0.01]}>
          <Dimensions w={W * S} h={H * S} z={0} labelW={lw} labelH={lh} />
        </group>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Caixinha de bem-casado ("almofada")
 * ---------------------------------------------------------------------------------------------- */

/** Expoente do perfil das cintas das pontas (visto de frente): ombro redondo, laterais quase retas embaixo. */
const SIDE_P = 3;
/** Expoente do perfil das pétalas (visto de lado): meia-lua achatada. */
const PETAL_P = 2.7;

/** Meia-medida do perfil superelíptico (|r/half|^p + |y/height|^p = 1) na altura y. */
function superHalf(half: number, height: number, p: number, y: number) {
  const k = clamp(y / height, 0, 1);
  return half * Math.pow(Math.max(1 - Math.pow(k, p), 0), 1 / p);
}

type ProfilePt = { r: number; y: number; s: number; nr: number; ny: number };

/** Perfil da base (r = half, y = 0) ao topo (0, height), com o comprimento de arco s e a normal para fora. */
function superCurve(half: number, height: number, p: number, n: number): ProfilePt[] {
  const pts: ProfilePt[] = [];
  for (let i = 0; i <= n; i += 1) {
    const th = (i / n) * (Math.PI / 2);
    pts.push({ r: half * Math.pow(Math.cos(th), 2 / p), y: height * Math.pow(Math.sin(th), 2 / p), s: 0, nr: 1, ny: 0 });
  }
  pts.forEach((pt, i) => {
    const prev = pts[Math.max(i - 1, 0)];
    const next = pts[Math.min(i + 1, n)];
    const dr = next.r - prev.r;
    const dy = next.y - prev.y;
    const len = Math.hypot(dr, dy) || 1;
    pt.nr = dy / len;
    pt.ny = -dr / len;
    if (i > 0) pt.s = prev.s + Math.hypot(pt.r - prev.r, pt.y - prev.y);
  });
  return pts;
}

/** Folga da pétala para fora da cinta: quase nada embaixo; no alto a borda abre um pouco (a "orelha" da foto). */
const petalLip = (k: number) => 0.05 + 0.13 * k * k;

/** Índices de uma grade (rows + 1) × (cols + 1), face para fora quando j cresce para a direita e i para cima. */
function gridIndex(rows: number, cols: number) {
  const index: number[] = [];
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      const a = i * (cols + 1) + j;
      const c = a + cols + 1;
      index.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
  return index;
}

/** Lado de dentro de uma casca: os mesmos pontos recuados t pela normal, com as faces viradas. */
function innerShell(outer: THREE.BufferGeometry, t: number) {
  const g = outer.clone();
  if (g.getAttribute("uv")) g.deleteAttribute("uv");
  const p = g.getAttribute("position");
  const n = g.getAttribute("normal");
  for (let i = 0; i < p.count; i += 1) p.setXYZ(i, p.getX(i) - n.getX(i) * t, p.getY(i) - n.getY(i) * t, p.getZ(i) - n.getZ(i) * t);
  p.needsUpdate = true;
  flipFaces(g);
  return g;
}

/**
 * Pétala da frente (+z): sobe da borda da base e se curva até o meio do topo; em cada altura a largura segue
 * a cinta das pontas (mais a folga), então aberta na faca ela é um "sino". UV = papel desenrolado.
 */
function petalGeometry(W: number, D: number, hB: number, n = 44, m = 24) {
  const prof = superCurve(D / 2, hB, PETAL_P, n);
  const S = prof[n].s;
  const wMax = W / 2 + petalLip(0);
  const pos: number[] = [];
  const uv: number[] = [];
  prof.forEach(({ r, y, s }) => {
    const w = Math.max(superHalf(W / 2, hB, SIDE_P, y) + petalLip(y / hB), 0.1);
    for (let j = 0; j <= m; j += 1) {
      const x = ((2 * j) / m - 1) * w;
      pos.push(x, y, r);
      uv.push(0.5 + x / (2 * wMax), s / S);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(gridIndex(n, m));
  geometry.computeVertexNormals();
  return { geometry, prof, aspect: (2 * wMax) / S };
}

/** Cinta da ponta (+x): sobe da base e deita sobre o topo por baixo das pétalas (aparece entre elas). */
function bandGeometry(W: number, D: number, hB: number, n = 44, m = 16) {
  const prof = superCurve(W / 2, hB, SIDE_P, n);
  const pos: number[] = [];
  prof.forEach(({ r, y }) => {
    const zh = Math.max(superHalf(D / 2, hB, PETAL_P, y) - 0.012, 0);
    for (let j = 0; j <= m; j += 1) pos.push(r, y, (1 - (2 * j) / m) * zh);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setIndex(gridIndex(n, m));
  geometry.computeVertexNormals();
  return geometry;
}

/** Fenda da pétala por onde passa a lingueta: risco escuro no eixo, da posição de arco `from` até a ponta. */
function slitGeometry(prof: ProfilePt[], from: number, half = 0.035) {
  const lift = 0.006;
  const rows = prof.filter((p) => p.s >= from);
  const pos: number[] = [];
  rows.forEach(({ r, y, nr, ny }) => pos.push(-half, y + ny * lift, r + nr * lift, half, y + ny * lift, r + nr * lift));
  const index: number[] = [];
  for (let k = 0; k < rows.length - 1; k += 1) {
    const a = 2 * k;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setIndex(index);
  return geometry;
}

/** Lingueta de pega: arco em cima, furo em "D" (meia-lua de base reta) e o pé que entra na caixa. */
function tabShape(tw: number, up: number, down: number) {
  const r = tw / 2;
  const cy = Math.max(up - r, r * 0.3);
  const s = new THREE.Shape();
  s.moveTo(-r, -down);
  s.lineTo(r, -down);
  s.lineTo(r, cy);
  s.absarc(0, cy, r, 0, Math.PI, false);
  s.closePath();
  const hr = r * 0.6;
  const hole = new THREE.Path();
  hole.moveTo(-hr, cy - hr * 0.3);
  hole.lineTo(hr, cy - hr * 0.3);
  hole.lineTo(hr, cy);
  hole.absarc(0, cy, hr, 0, Math.PI, false);
  hole.closePath();
  s.holes.push(hole);
  return s;
}

function pillowParts(W: number, H: number, D: number, t: number) {
  // Proporções da foto de 5,5 × 3,4 × 5,5: a lingueta passa ~0,7 cm do topo das pétalas.
  const tabUp = clamp(H * 0.21, 0.4, 1.4);
  const hB = H - tabUp;
  const tw = clamp(Math.min(W, D) * 0.2, 0.6, 2);
  const petal = petalGeometry(W, D, hB);
  const petalIn = innerShell(petal.geometry, t);
  const band = bandGeometry(W, D, hB);
  const slit = slitGeometry(petal.prof, petal.prof[petal.prof.length - 1].s - (tw / 2 + 0.25));
  const tab = leafGeometry(tabShape(tw, tabUp, Math.min(0.5, hB * 0.3)), t);
  return { hB, petal: petal.geometry, petalIn, band, slit, tab, aspect: petal.aspect, all: [petal.geometry, petalIn, band, slit, ...leafList(tab)] };
}

/**
 * Caixinha para bem-casado: base quadrada, duas pétalas (frente e verso) que sobem e se curvam em meia-lua
 * achatada até o meio do topo, as cintas das pontas fechando os lados por baixo delas (no tom escuro da
 * impressão, como nas fotos) e a lingueta de pega com furo em "D" saindo pela fenda do topo. Arte 4/0 nas
 * pétalas, desenrolada sem distorção.
 */
function BemCasadoCarton({ spec, art, label, showDims }: ModelProps) {
  const W = cm(spec.widthCm, 5.5, 2, 30);
  const H = cm(spec.heightCm, 3.4, 1.5, 30);
  const D = cm(spec.depthCm, 5.5, 2, 30);
  const stock = stockOf(spec);
  const { t } = stock;
  const ink = inkOf(art, stock);
  const parts = useMemo(() => pillowParts(W, H, D, t), [W, H, D, t]);
  useGeometriesCleanup(parts.all);
  const { aspect } = parts;
  const panelArt = useMemo(() => ({ ...art, opaque: true }), [art]);
  const petalArt = useArtTexture(aspect, "front", panelArt, label);

  const S = TARGET / Math.max(W, H, D);
  const [lw, lh] = sizeLabels(spec);
  const band = <Solid color={ink} dim={0.42} spec={spec} stock={stock} side={THREE.DoubleSide} />;
  const tabFace = <Solid color={ink} dim={0.42} spec={spec} stock={stock} />;

  return (
    <group userData={{ view: { elevation: 0.3, azimuth: 0.5 } }}>
      <group scale={S}>
        {[0, Math.PI].map((ry) => (
          <group key={ry} rotation-y={ry}>
            <mesh geometry={parts.petal} castShadow receiveShadow>
              <Ink map={petalArt} spec={spec} stock={stock} />
            </mesh>
            <mesh geometry={parts.petalIn} castShadow receiveShadow>
              <meshStandardMaterial color={stock.inside} roughness={0.9} />
            </mesh>
            <mesh geometry={parts.slit}>
              <meshBasicMaterial color="#000000" transparent opacity={0.6} depthWrite={false} />
            </mesh>
            <mesh geometry={parts.band} castShadow receiveShadow>
              {band}
            </mesh>
          </group>
        ))}
        {/* Lingueta no plano y-z, no meio do topo. */}
        <group position={[-t / 2, parts.hB, 0]} rotation-y={Math.PI / 2}>
          <Leaf geo={parts.tab} face={tabFace} back={tabFace} stock={stock} />
        </group>
      </group>
      {showDims && KIND_INFO[spec.kind].dims && (
        <group position={[0, (H / 2) * S, (D / 2) * S + 0.01]}>
          <Dimensions w={W * S} h={H * S} z={0} labelW={lw} labelH={lh} />
        </group>
      )}
    </group>
  );
}

/**
 * Embalagens de papel cartão do tipo "carton": caixinha de bem-casado (pelo nome, ou pelas medidas pequenas),
 * caixa maleta para caneca quando a altura passa bem do comprimento (a que tem alça e janela) e cartucho
 * tuck end para a caneca baixa.
 */
export function CartonBox(props: ModelProps) {
  const { spec, label } = props;
  const small = Math.max(spec.widthCm, spec.depthCm) <= 8 && spec.heightCm <= 6;
  if (/\bbem.?casado\b/i.test(label) || (!/\bcaneca\b/i.test(label) && small)) return <BemCasadoCarton {...props} />;
  if (spec.heightCm > Math.max(spec.widthCm, spec.depthCm) * 1.15) return <GableCarton {...props} />;
  return <TuckCarton {...props} />;
}

/* ------------------------------------------------------------------------------------------------
 * Embalagem sacola (cunha de uma peça, alça vazada e aba em meia-lua)
 * ---------------------------------------------------------------------------------------------- */

/**
 * Sombra da aba na frente: faixa em volta da meia-lua, escura rente à borda e sumindo para fora (cor por
 * vértice com alfa). É o que destaca a aba, já que a arte continua de uma para a outra.
 */
function flapShadowGeometry(rx: number, cy: number, ry: number, w: number, steps = 48) {
  const pos: number[] = [];
  const col: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const th = Math.PI + (Math.PI * i) / steps;
    const x = rx * Math.cos(th);
    const y = cy + ry * Math.sin(th);
    const nx = Math.cos(th) / rx;
    const ny = Math.sin(th) / ry;
    const len = Math.hypot(nx, ny) || 1;
    // A luz vem de cima: a sombra cai mais embaixo do que nas pontas do arco.
    const k = w * (0.35 + 0.65 * Math.max(-Math.sin(th), 0));
    pos.push(x, y, 0, x + (nx / len) * k, y + (ny / len) * k, 0);
    col.push(0, 0, 0, 0.32, 0, 0, 0, 0);
  }
  const index: number[] = [];
  for (let i = 0; i < steps; i += 1) {
    const a = i * 2;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
  geometry.setIndex(index);
  return geometry;
}

function bagParts(Wf: number, Dg: number, Ht: number, t: number) {
  const run = Dg / 2 - t;
  const Ls = Math.hypot(run, Ht);
  const x1 = Wf / 2 - t;
  const rect: [number, number, number, number] = [-x1, 0, 2 * x1, Ls];
  // Furo da alça perto do topo, atravessando frente, verso e aba (na foto: ~36% da largura, 2 cm do topo).
  const holeW = clamp(Wf * 0.36, 2.4, 7.5);
  const holeH = clamp(holeW * 0.42, 1.1, 2.6);
  const holeV = Ls - clamp(Ls * 0.13, holeH / 2 + 0.7, 3.6);
  const panelOutline = panelShape(-x1, x1, 0, Ls);
  panelOutline.holes.push(beanPath(0, holeV, holeW, holeH));
  const panel = leafGeometry(panelOutline, t, rect);
  // Aba de fechamento: reta no alto e meia-lua embaixo, com ~58% da altura (a ponta passa do meio da frente).
  const flapLen = Ls * 0.58;
  const ry = Math.min(x1 * 0.92, Ls * 0.27);
  const arcY = Ls - flapLen + ry;
  const flapOutline = new THREE.Shape();
  flapOutline.moveTo(-x1, Ls);
  flapOutline.lineTo(-x1, arcY);
  flapOutline.absellipse(0, arcY, x1, ry, Math.PI, Math.PI * 2, false, 0);
  flapOutline.lineTo(x1, Ls);
  flapOutline.closePath();
  flapOutline.holes.push(beanPath(0, holeV, holeW, holeH));
  // Mesmo retângulo de UV da frente: fechada, a aba continua a arte da frente sem emenda.
  const flap = leafGeometry(flapOutline, t, rect);
  const flapShadow = flapShadowGeometry(x1, arcY, ry, clamp(Wf * 0.025, 0.12, 0.4));
  // Lingueta: meia-lua riscada na aba, com a fenda reta na base.
  const lockR = clamp(Wf * 0.13, 0.8, 2.4);
  const lockV = Ls - flapLen * 0.78;
  const lockArc = new THREE.RingGeometry(lockR - 0.025, lockR + 0.025, 40, 1, 0, Math.PI);
  const lockLine = new THREE.PlaneGeometry(lockR * 2.3, 0.05);
  // Lateral triangular: base com a profundidade inteira, ponta no topo.
  const tri = new THREE.Shape();
  tri.moveTo(-(Dg / 2 - t * 0.6), 0);
  tri.lineTo(Dg / 2 - t * 0.6, 0);
  tri.lineTo(0, Ht - 0.04);
  tri.closePath();
  const gusset = leafGeometry(tri, t);
  // Vincos: as bordas inclinadas (frente/verso com a lateral) e a dobra do topo, de onde sai a aba.
  const sideCrease = new THREE.CylinderGeometry(t * 1.1, t * 1.1, Ls, 10, 1, true).translate(0, Ls / 2, 0);
  const ridge = creaseGeometry(t * 1.8, Wf - 2 * t);
  return {
    panel,
    flap,
    flapShadow,
    lockArc,
    lockLine,
    gusset,
    sideCrease,
    ridge,
    Ls,
    lockV,
    gamma: Math.atan2(run, Ht),
    aspect: (2 * x1) / Ls,
    all: [...leafList(panel), ...leafList(flap), flapShadow, lockArc, lockLine, ...leafList(gusset), sideCrease, ridge],
  };
}

/**
 * Embalagem sacola de papel cartão (corte e vinco, uma peça só) em cunha: frente e verso inclinados que se
 * encontram no topo, laterais triangulares, o furo da alça atravessando as camadas perto do topo e a aba de
 * fechamento em meia-lua que desce do topo sobre a frente, com a lingueta riscada. Arte 4/0 na frente
 * (continuada na aba) e no verso; as laterais saem na cor de fundo da impressão.
 */
export function CartonBag({ spec, art, label, showDims }: ModelProps) {
  const W = cm(spec.widthCm, 10, 4, 60);
  const Ht = cm(spec.heightCm, 15.4, 6, 80);
  const D = cm(spec.depthCm, 6, 2, 40);
  // GG e EG vêm como "lateral x altura x frente": a frente é sempre a medida maior.
  const Wf = Math.max(W, D);
  const Dg = Math.min(W, D);
  const stock = stockOf(spec);
  const { t } = stock;
  const ink = inkOf(art, stock);
  const parts = useMemo(() => bagParts(Wf, Dg, Ht, t), [Wf, Dg, Ht, t]);
  useGeometriesCleanup(parts.all);
  const panelArt = useMemo(() => ({ ...art, opaque: true }), [art]);
  const frontArt = useArtTexture(parts.aspect, "front", panelArt, label);

  const S = TARGET / Math.max(Wf, Ht, Dg);
  const [lw, lh] = sizeLabels({ ...spec, widthCm: Wf });
  const solid = <Solid color={ink} spec={spec} stock={stock} />;
  const face = <Ink map={frontArt} spec={spec} stock={stock} />;
  const groove = <meshBasicMaterial color="#000000" transparent opacity={0.55} depthWrite={false} side={THREE.DoubleSide} />;

  return (
    <group userData={{ view: { elevation: 0.2, azimuth: 0.5 } }}>
      <group scale={S}>
        {/* Frente e verso inclinados (o verso é a frente girada); a aba fica sobre a frente. */}
        {[0, Math.PI].map((ry) => (
          <group key={ry} rotation-y={ry}>
            <group position={[0, 0, Dg / 2 - t]} rotation-x={-parts.gamma}>
              <Leaf geo={parts.panel} face={face} stock={stock} />
              {([1, -1] as const).map((sx) => (
                <mesh key={sx} geometry={parts.sideCrease} position={[sx * (Wf / 2 - t), 0, 0]}>
                  {solid}
                </mesh>
              ))}
              {ry === 0 && (
                <mesh geometry={parts.flapShadow} position-z={t + 0.002} renderOrder={1}>
                  <meshBasicMaterial vertexColors transparent depthWrite={false} side={THREE.DoubleSide} />
                </mesh>
              )}
              {ry === 0 && (
                <group position-z={t + 0.004}>
                  <Leaf geo={parts.flap} face={face} stock={stock} />
                  <mesh geometry={parts.lockArc} position={[0, parts.lockV, t + 0.003]}>
                    {groove}
                  </mesh>
                  <mesh geometry={parts.lockLine} position={[0, parts.lockV, t + 0.003]}>
                    {groove}
                  </mesh>
                </group>
              )}
            </group>
          </group>
        ))}
        {/* Laterais triangulares. */}
        {([1, -1] as const).map((sx) => (
          <group key={sx} position={[sx * (Wf / 2 - t), 0, 0]} rotation-y={(sx * Math.PI) / 2}>
            <Leaf geo={parts.gusset} face={solid} stock={stock} />
          </group>
        ))}
        <mesh geometry={parts.ridge} position={[0, Ht, t * 0.5]}>
          {solid}
        </mesh>
      </group>
      {showDims && KIND_INFO[spec.kind].dims && (
        <group position={[0, (Ht / 2) * S, (Dg / 2) * S + 0.01]}>
          <Dimensions w={Wf * S} h={Ht * S} z={0} labelW={lw} labelH={lh} />
        </group>
      )}
    </group>
  );
}
