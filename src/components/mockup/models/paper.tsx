"use client";

// Papelaria e impressos: cartões (visita, PVC, calendário de bolso), folhas soltas (postal, flyer, timbrado,
// cartaz, cardápio, foto, Yupo, sublimático, impressão), folders/pastas e displays de mesa.
// Cada folha é uma superfície com espessura real (frente, verso e borda) que curva, enrola e dobra com
// vinco arredondado; a arte do cliente vai na face impressa sem distorção.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import { KIND_INFO, artAspect } from "@/lib/mockup-kinds";
import { canvasFor, fontFamily, hasArtContent } from "../art";
import { useSceneMode } from "../viewer-hooks";
import {
  AcrylicMaterials,
  Dimensions,
  PrintMaterial,
  faceGeometry,
  fitFlat,
  makeShape,
  metalColor,
  sizeLabels,
  useArtTexture,
  useFaceTexture,
  useGeometryCleanup,
  type ModelProps,
  useBackTexture,
} from "./shared";

type Vec3 = [number, number, number];

const PAPER = "#f8f7f3";
const EDGE = "#ebe9e3";
const BOARD_BACK = "#d8d5cd";
/** Impressos deitados na mesa: câmera mais alta, como foto "flat lay". */
// `flatLay`: peça deitada na mesa; no verso as folhas desviram (Lay) em vez de a cena girar (TurnGroup).
const FLAT_LAY = { view: { elevation: 0.85 }, flatLay: true };
/** Folga entre folhas empilhadas (evita faces se tocando). */
const STACK_GAP = 0.0005;

// Calendários mostram o ano que vem a partir do segundo semestre.
const TODAY = new Date();
const CALENDAR_YEAR = TODAY.getMonth() >= 6 ? TODAY.getFullYear() + 1 : TODAY.getFullYear();

/* ---------- espessura ---------- */

/** Espessura do papel em cm: a da opção (spec.depthCm) quando veio do produto, senão a típica da peça. */
function paperCm(spec: MockupSpec, fallback: number) {
  const d = spec.depthCm;
  const kindDefault = KIND_INFO[spec.kind].defaultSize[2];
  return d > 0.004 && d < 0.2 && Math.abs(d - kindDefault) > 1e-6 ? d : fallback;
}

/** Espessura em unidades de cena, levemente exagerada para a borda aparecer. */
function sheetT(cm: number, scale: number) {
  return Math.max(cm * scale * 1.3, 0.0025);
}

/* ---------- forma da folha: caminho com dobras + curvatura ---------- */

/** Dobra (ou rolo, com raio grande): centro em fração do comprimento, giro em radianos (+ = para a frente da folha). */
type Fold = { at: number; turn: number; radius: number };

type SheetForm = {
  /** Eixo ao longo do qual as dobras acontecem. */
  axis: "x" | "y";
  /** Direção inicial do caminho (rad) no plano eixo × z. */
  heading: number;
  folds: Fold[];
  /** Arqueamento: bordas em x sobem esta altura. */
  bow: number;
  /** Canto (inferior direito) ou base levantada. */
  lift: number;
  liftAt: "corner" | "bottom";
};

function sheetForm(partial: Partial<SheetForm> = {}): SheetForm {
  return { axis: "x", heading: 0, folds: [], bow: 0, lift: 0, liftAt: "corner", ...partial };
}

const FLAT = sheetForm();

type Piece = { s0: number; len: number; a0: number; b0: number; th0: number; k: number };

/** Avança no caminho: reta (k = 0) ou arco de curvatura k. */
function step(a: number, b: number, th: number, k: number, d: number): [number, number, number] {
  if (Math.abs(k) < 1e-9) return [a + Math.cos(th) * d, b + Math.sin(th) * d, th];
  const th1 = th + k * d;
  return [a + (Math.sin(th1) - Math.sin(th)) / k, b - (Math.cos(th1) - Math.cos(th)) / k, th1];
}

/** Caminho plano de comprimento fixo: retas entre dobras, arcos nos vincos. */
function buildPath(length: number, heading: number, folds: Fold[]): Piece[] {
  const pieces: Piece[] = [];
  let s = 0;
  let a = 0;
  let b = 0;
  let th = heading;
  const push = (len: number, k: number) => {
    if (len <= 1e-9) return;
    pieces.push({ s0: s, len, a0: a, b0: b, th0: th, k });
    [a, b, th] = step(a, b, th, k, len);
    s += len;
  };
  for (const fold of [...folds].sort((p, q) => p.at - q.at)) {
    const arc = Math.abs(fold.turn) * fold.radius;
    const start = Math.min(Math.max(fold.at * length - arc / 2, s), length);
    push(start - s, 0);
    const len = Math.min(arc, length - s);
    if (len > 1e-9 && arc > 1e-9) push(len, fold.turn / arc);
    else th += fold.turn;
  }
  push(length - s, 0);
  if (!pieces.length) pieces.push({ s0: 0, len: Math.max(length, 1e-6), a0: 0, b0: 0, th0: heading, k: 0 });
  return pieces;
}

function evalPath(pieces: Piece[], s: number): [number, number] {
  const first = pieces[0];
  if (s <= first.s0) return [first.a0 + Math.cos(first.th0) * (s - first.s0), first.b0 + Math.sin(first.th0) * (s - first.s0)];
  for (const p of pieces) {
    if (s <= p.s0 + p.len) {
      const [a, b] = step(p.a0, p.b0, p.th0, p.k, s - p.s0);
      return [a, b];
    }
  }
  const last = pieces[pieces.length - 1];
  const [a, b, th] = step(last.a0, last.b0, last.th0, last.k, last.len);
  const d = s - last.s0 - last.len;
  return [a + Math.cos(th) * d, b + Math.sin(th) * d];
}

type Deform = (x: number, y: number, out: THREE.Vector3) => THREE.Vector3;

/** Ponto da superfície média para a coordenada (x, y) da folha plana. */
function makeDeform(w: number, h: number, f: SheetForm): Deform {
  const length = f.axis === "x" ? w : h;
  const pieces = buildPath(length, f.heading, f.folds);
  return (x, y, out) => {
    const nx = x / (w / 2);
    const ny = y / (h / 2);
    let z = f.bow * nx * nx;
    if (f.lift) {
      if (f.liftAt === "corner") {
        const c = Math.max(0, nx - ny - 1);
        z += f.lift * c * c;
      } else {
        const q = Math.max(0, (-ny - 0.35) / 0.65);
        z += f.lift * q * q * (0.3 + 0.7 * nx * nx);
      }
    }
    const [a, b] = evalPath(pieces, (f.axis === "x" ? x : y) + length / 2);
    if (f.axis === "x") return out.set(a - length / 2, y, b + z);
    return out.set(x, a - length / 2, b + z);
  };
}

// Vetores de trabalho dos construtores de geometria (fora do render).
const P = new THREE.Vector3();
const NORMAL = new THREE.Vector3();
const VA = new THREE.Vector3();
const VB = new THREE.Vector3();
const TX = new THREE.Vector3();
const TY = new THREE.Vector3();

/** Posição (P) e normal da frente (NORMAL) por diferenças finitas. */
function frame(deform: Deform, x: number, y: number) {
  const e = 1e-5;
  deform(x, y, P);
  TX.subVectors(deform(x + e, y, VA), deform(x - e, y, VB));
  TY.subVectors(deform(x, y + e, VA), deform(x, y - e, VB));
  NORMAL.crossVectors(TX, TY).normalize();
}

/** Amostras de um eixo: uniformes + densas dentro de cada vinco/rolo. */
function axisSamples(lo: number, hi: number, length: number, seg: number, folds: Fold[]): number[] {
  const list: number[] = [];
  for (let i = 0; i <= seg; i += 1) list.push(lo + ((hi - lo) * i) / seg);
  for (const f of folds) {
    const arc = Math.abs(f.turn) * f.radius;
    const center = f.at * length - length / 2;
    const n = Math.max(2, Math.min(28, Math.ceil(Math.abs(f.turn) / 0.1)));
    for (let i = 0; i <= n; i += 1) {
      const v = center - arc / 2 + (arc * i) / n;
      if (v > lo && v < hi) list.push(v);
    }
  }
  list.sort((p, q) => p - q);
  return list.filter((v, i) => i === 0 || v - list[i - 1] > 1e-7);
}

/** Divisões da grade: folha reta só precisa das dobras; curvatura pede grade densa. */
function gridSegs(w: number, h: number, f: SheetForm, seg: number): [number, number] {
  if (f.bow === 0 && f.lift === 0) return [f.axis === "x" ? 2 : 1, f.axis === "y" ? 2 : 1];
  const short = Math.max(6, Math.round((seg * Math.min(w, h)) / Math.max(w, h)));
  return w >= h ? [seg, short] : [short, seg];
}

function gridGeometry(deform: Deform, xs: number[], ys: number[], offset: number, side: 1 | -1, uvOf: (x: number, y: number) => [number, number]) {
  const nx = xs.length;
  const ny = ys.length;
  const position = new Float32Array(nx * ny * 3);
  const normal = new Float32Array(nx * ny * 3);
  const uv = new Float32Array(nx * ny * 2);
  let k = 0;
  for (const y of ys) {
    for (const x of xs) {
      frame(deform, x, y);
      position[k * 3] = P.x + NORMAL.x * offset;
      position[k * 3 + 1] = P.y + NORMAL.y * offset;
      position[k * 3 + 2] = P.z + NORMAL.z * offset;
      normal[k * 3] = NORMAL.x * side;
      normal[k * 3 + 1] = NORMAL.y * side;
      normal[k * 3 + 2] = NORMAL.z * side;
      const [u, v] = uvOf(x, y);
      uv[k * 2] = u;
      uv[k * 2 + 1] = v;
      k += 1;
    }
  }
  const index: number[] = [];
  for (let j = 0; j < ny - 1; j += 1) {
    for (let i = 0; i < nx - 1; i += 1) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      if (side > 0) index.push(a, b, d, a, d, c);
      else index.push(a, d, b, a, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  return geometry;
}

/** Borda da folha: quatro tiras entre frente e verso (normais separadas por lado, cantos vivos). */
function edgeGeometry(deform: Deform, xs: number[], ys: number[], t: number) {
  const x0 = xs[0];
  const x1 = xs[xs.length - 1];
  const y0 = ys[0];
  const y1 = ys[ys.length - 1];
  const sides: [number, number][][] = [xs.map((x) => [x, y0]), ys.map((y) => [x1, y]), xs.map((x) => [x, y1]), ys.map((y) => [x0, y])];
  const position: number[] = [];
  const index: number[] = [];
  for (const line of sides) {
    const start = position.length / 3;
    for (const [x, y] of line) {
      frame(deform, x, y);
      position.push(P.x + NORMAL.x * (t / 2), P.y + NORMAL.y * (t / 2), P.z + NORMAL.z * (t / 2));
      position.push(P.x - NORMAL.x * (t / 2), P.y - NORMAL.y * (t / 2), P.z - NORMAL.z * (t / 2));
    }
    for (let i = 0; i < line.length - 1; i += 1) {
      const a = start + i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** Frente (UV da arte inteira), verso (UV espelhado: lê certo pelas costas) e borda. */
function sheetGeometries(w: number, h: number, t: number, f: SheetForm, seg: number) {
  const deform = makeDeform(w, h, f);
  const [sx, sy] = gridSegs(w, h, f, seg);
  const xs = axisSamples(-w / 2, w / 2, w, sx, f.axis === "x" ? f.folds : []);
  const ys = axisSamples(-h / 2, h / 2, h, sy, f.axis === "y" ? f.folds : []);
  return {
    front: gridGeometry(deform, xs, ys, t / 2, 1, (x, y) => [x / w + 0.5, y / h + 0.5]),
    back: gridGeometry(deform, xs, ys, -t / 2, -1, (x, y) => [0.5 - x / w, y / h + 0.5]),
    edge: edgeGeometry(deform, xs, ys, t),
  };
}

/** Recorte [x0..x1]×[y0..y1] da superfície afastado `offset` da linha média, com UV 0–1 próprio. */
function patchGeometry(w: number, h: number, f: SheetForm, rect: [number, number, number, number], offset: number, side: 1 | -1, flipU: boolean, flipV: boolean, seg: number) {
  const [x0, x1, y0, y1] = rect;
  const deform = makeDeform(w, h, f);
  const [gx, gy] = gridSegs(w, h, f, seg);
  const xs = axisSamples(x0, x1, w, Math.max(1, Math.round((gx * (x1 - x0)) / w)), f.axis === "x" ? f.folds : []);
  const ys = axisSamples(y0, y1, h, Math.max(1, Math.round((gy * (y1 - y0)) / h)), f.axis === "y" ? f.folds : []);
  const spanX = x1 - x0 || 1;
  const spanY = y1 - y0 || 1;
  return gridGeometry(deform, xs, ys, offset * side, side, (x, y) => {
    const u = (x - x0) / spanX;
    const v = (y - y0) / spanY;
    return [flipU ? 1 - u : u, flipV ? 1 - v : v];
  });
}

/* ---------- componentes de folha ---------- */

type PaperSheetProps = {
  w: number;
  h: number;
  t: number;
  form?: SheetForm;
  seg?: number;
  /** Material da frente e do verso (elementos de material do R3F). */
  front: ReactNode;
  back: ReactNode;
  edge?: string;
  children?: ReactNode;
};

/** Folha com espessura: frente, verso e borda seguindo a mesma forma (curva, rolo ou dobras). */
function PaperSheet({ w, h, t, form = FLAT, seg = 32, front, back, edge = EDGE, children }: PaperSheetProps) {
  const key = JSON.stringify(form);
  const geo = useMemo(() => sheetGeometries(w, h, t, JSON.parse(key) as SheetForm, seg), [w, h, t, key, seg]);
  useEffect(
    () => () => {
      geo.front.dispose();
      geo.back.dispose();
      geo.edge.dispose();
    },
    [geo],
  );
  return (
    <group>
      <mesh geometry={geo.front}>{front}</mesh>
      <mesh geometry={geo.back}>{back}</mesh>
      <mesh geometry={geo.edge}>
        <meshStandardMaterial color={edge} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {children}
    </group>
  );
}

type PatchProps = {
  w: number;
  h: number;
  form?: SheetForm;
  rect: [number, number, number, number];
  offset: number;
  side?: 1 | -1;
  flipU?: boolean;
  flipV?: boolean;
  seg?: number;
  children: ReactNode;
};

/** Área impressa sobre parte da folha (miolo da foto, faces do display, sobreposição de texto). */
function SheetPatch({ w, h, form = FLAT, rect, offset, side = 1, flipU = false, flipV = false, seg = 32, children }: PatchProps) {
  const key = JSON.stringify(form);
  const [x0, x1, y0, y1] = rect;
  const geometry = useMemo(
    () => patchGeometry(w, h, JSON.parse(key) as SheetForm, [x0, x1, y0, y1], offset, side, flipU, flipV, seg),
    [w, h, key, x0, x1, y0, y1, offset, side, flipU, flipV, seg],
  );
  useGeometryCleanup(geometry);
  return <mesh geometry={geometry}>{children}</mesh>;
}

/** Põe uma folha deitada na mesa (topo da arte para o fundo); `flip` vira a folha e mostra o verso. */
function Lay({ x = 0, y = 0, z = 0, rot = 0, flip = false, children }: { x?: number; y?: number; z?: number; rot?: number; flip?: boolean; children: ReactNode }) {
  // Verso pedido ("Ver verso" ou o passo "Verso" da arte): cada folha deitada desvira.
  const { back } = useSceneMode();
  const turned = flip !== back;
  return (
    <group position={[x, y, z]} rotation-y={rot}>
      <group rotation-x={-Math.PI / 2}>{turned ? <group rotation-y={Math.PI}>{children}</group> : children}</group>
    </group>
  );
}

/** Centro de uma folha deitada girada `rot` em torno do canto de baixo à esquerda (px, pz). */
function aroundPivot(px: number, pz: number, rot: number, w: number, h: number): [number, number] {
  const vx = w / 2;
  const vz = -h / 2;
  return [px + vx * Math.cos(rot) + vz * Math.sin(rot), pz - vx * Math.sin(rot) + vz * Math.cos(rot)];
}

/** Bloco com cantos e arestas suavizados. Grupos da geometria: 0 = faces, 1 = laterais (para o acrílico). */
function SoftBox({ w, h, d, radius, position, rotation, children }: { w: number; h: number; d: number; radius: number; position?: Vec3; rotation?: Vec3; children: ReactNode }) {
  const geometry = useMemo(() => {
    const bevel = Math.max(0, Math.min(d * 0.3, radius * 0.5, w * 0.1, h * 0.1));
    const depth = Math.max(d - 2 * bevel, d * 0.2);
    const g = new THREE.ExtrudeGeometry(makeShape("rect", w - 2 * bevel, h - 2 * bevel, Math.max(radius - bevel, 0)), {
      depth,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 8,
    });
    g.translate(0, 0, -depth / 2);
    return g;
  }, [w, h, d, radius]);
  useGeometryCleanup(geometry);
  return (
    <mesh geometry={geometry} position={position} rotation={rotation}>
      {children}
    </mesh>
  );
}

/* ---------- texturas locais (canvas) ---------- */

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, arg: string) => void;

/** Repinta os canvas com texto quando as fontes do site terminam de carregar. */
function useFontsReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    document.fonts.ready.then(() => alive && setReady(true)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

/** Textura desenhada por um pintor deste arquivo (verso do postal, calendário, linhas de texto, madeira). */
function usePaintedTexture(aspect: number, painter: Painter, arg: string, longSide = 1024, repeatX = 0, repeatY = 0) {
  const fonts = useFontsReady();
  const texture = useMemo(() => {
    const canvas = canvasFor(aspect, longSide);
    const ctx = canvas.getContext("2d");
    if (ctx) painter(ctx, canvas.width, canvas.height, arg);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    if (repeatX > 0 && repeatY > 0) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeatX, repeatY);
    }
    tex.userData.fontsReady = fonts;
    return tex;
  }, [aspect, painter, arg, longSide, repeatX, repeatY, fonts]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function font(weight: number, size: number) {
  return `${weight} ${Math.max(6, Math.round(size))}px ${fontFamily()}`;
}

/** Pseudoaleatório com semente (desenho estável entre renders). */
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

const BRAND = ["#e02018", "#f8e028", "#18b0e8", "#b0c818"];
const BRAND_GRAY = ["#6f6f6f", "#dadada", "#a6a6a6", "#bdbdbd"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const INK = "#1d1d1f";
const RED = "#d7262b";
const MUTED = "#8c8c8c";

/** Carvalho claro: veios ondulados em tons quentes. */
function paintWood(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#d4b083");
  grad.addColorStop(0.5, "#c89f70");
  grad.addColorStop(1, "#d1aa7b");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const rand = seeded(17);
  for (let i = 0; i < 110; i += 1) {
    const y0 = rand() * h;
    const amp = h * (0.004 + rand() * 0.02);
    const freq = ((1 + rand() * 2.5) * Math.PI * 2) / w;
    const phase = rand() * Math.PI * 2;
    const dark = rand() > 0.35;
    ctx.strokeStyle = dark ? `rgba(110, 72, 38, ${0.06 + rand() * 0.16})` : `rgba(240, 214, 175, ${0.08 + rand() * 0.12})`;
    ctx.lineWidth = 0.6 + rand() * 2.6;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.3 + phase) * amp * 0.25;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

/** Linhas de texto fracas: corpo da carta no timbrado ("letter") ou documento na pasta ("doc"). */
function paintLines(ctx: CanvasRenderingContext2D, w: number, h: number, mode: string) {
  ctx.clearRect(0, 0, w, h);
  const doc = mode === "doc";
  const left = w * 0.12;
  const right = w * 0.88;
  const top = doc ? h * 0.2 : h * 0.66;
  const bottom = doc ? h * 0.86 : h * 0.9;
  const gap = h * 0.024;
  const thick = h * 0.0065;
  const rand = seeded(doc ? 11 : 5);
  if (doc) {
    ctx.fillStyle = "rgba(20,20,24,0.85)";
    ctx.beginPath();
    ctx.roundRect(left, h * 0.1, (right - left) * 0.5, h * 0.02, h * 0.004);
    ctx.fill();
    ctx.fillStyle = BRAND[0];
    ctx.fillRect(left, h * 0.14, w * 0.1, h * 0.006);
  }
  ctx.fillStyle = doc ? "rgba(40,40,46,0.45)" : "rgba(40,40,46,0.24)";
  let y = top;
  let line = 0;
  let paragraph = 3 + Math.floor(rand() * 3);
  while (y < bottom) {
    const last = line >= paragraph;
    const len = (right - left) * (last ? 0.3 + rand() * 0.4 : 0.88 + rand() * 0.12);
    ctx.beginPath();
    ctx.roundRect(left, y, len, thick, thick / 2);
    ctx.fill();
    y += gap;
    line += 1;
    if (last) {
      y += gap * 0.8;
      line = 0;
      paragraph = 3 + Math.floor(rand() * 3);
    }
  }
  if (!doc) {
    // Assinatura à caneta.
    ctx.strokeStyle = "rgba(25,40,110,0.5)";
    ctx.lineWidth = Math.max(1.5, h * 0.0028);
    ctx.lineCap = "round";
    const sx = right - w * 0.3;
    const sy = h * 0.935;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.bezierCurveTo(sx + w * 0.04, sy - h * 0.03, sx + w * 0.06, sy + h * 0.02, sx + w * 0.1, sy - h * 0.01);
    ctx.bezierCurveTo(sx + w * 0.14, sy - h * 0.03, sx + w * 0.15, sy + h * 0.015, sx + w * 0.22, sy - h * 0.005);
    ctx.stroke();
  }
}

/** Verso de cartão postal: título, divisória, selo tracejado e linhas de endereço (deitado se a peça for retrato). */
function paintPostcardBack(ctx: CanvasRenderingContext2D, cw: number, ch: number, mode: string) {
  ctx.fillStyle = "#fbfaf6";
  ctx.fillRect(0, 0, cw, ch);
  ctx.save();
  let W = cw;
  let H = ch;
  if (ch > cw) {
    ctx.translate(0, ch);
    ctx.rotate(-Math.PI / 2);
    W = ch;
    H = cw;
  }
  const unit = Math.min(W, H);
  const pad = unit * 0.09;
  const stroke = Math.max(1.5, unit * 0.007);
  const split = W * (W / H > 3 ? 0.62 : 0.55);
  const mark = unit * 0.05;
  BRAND.forEach((color, i) => {
    ctx.fillStyle = mode === "gray" ? BRAND_GRAY[i] : mode === "blank" ? "#cfcfcf" : color;
    ctx.fillRect(pad + i * mark * 1.25, pad, mark, mark);
  });
  ctx.fillStyle = "#8d8d8d";
  ctx.font = font(700, unit * 0.06);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("CARTÃO POSTAL", pad, pad + mark * 1.7, Math.max(10, split - pad * 2));
  ctx.strokeStyle = "#cdcdcd";
  ctx.lineWidth = stroke;
  ctx.beginPath();
  ctx.moveTo(split, pad * 1.2);
  ctx.lineTo(split, H - pad * 1.2);
  ctx.stroke();
  const stampH = Math.min(H * 0.36, (W - split) * 0.42);
  const stampW = stampH * 0.84;
  const sx = W - pad - stampW;
  const sy = pad;
  ctx.setLineDash([stroke * 3, stroke * 2]);
  ctx.strokeStyle = "#b5b5b5";
  ctx.strokeRect(sx, sy, stampW, stampH);
  ctx.setLineDash([]);
  ctx.fillStyle = "#b0b0b0";
  ctx.font = font(600, stampH * 0.17);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("SELO", sx + stampW / 2, sy + stampH / 2, stampW * 0.9);
  const x0 = split + (W - split) * 0.1;
  const x1 = W - pad;
  const top = sy + stampH + (H - sy - stampH) * 0.25;
  const bottom = H - pad * 1.3;
  ctx.strokeStyle = "#c3c3c3";
  for (let i = 0; i < 4; i += 1) {
    const y = top + ((bottom - top) * i) / 3;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Grade de um mês: título, iniciais da semana e dias (domingos em vermelho). */
function drawMonth(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, year: number, month: number, title: string) {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const titleH = h * 0.18;
  const weekH = h * 0.12;
  const rowH = (h - titleH - weekH) / 6;
  const cw = w / 7;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = INK;
  ctx.font = font(800, Math.min(titleH * 0.6, (w / Math.max(6, title.length)) * 1.5));
  ctx.fillText(title, x + w / 2, y + titleH * 0.5, w);
  ctx.font = font(700, Math.min(weekH * 0.6, cw * 0.5));
  WEEKDAYS.forEach((d, i) => {
    ctx.fillStyle = i === 0 ? RED : MUTED;
    ctx.fillText(d, x + cw * (i + 0.5), y + titleH + weekH / 2);
  });
  ctx.font = font(500, Math.min(rowH * 0.58, cw * 0.48));
  for (let day = 1; day <= days; day += 1) {
    const idx = first + day - 1;
    const col = idx % 7;
    const row = Math.floor(idx / 7);
    ctx.fillStyle = col === 0 ? RED : INK;
    ctx.fillText(String(day), x + cw * (col + 0.5), y + titleH + weekH + rowH * (row + 0.5));
  }
}

/** Verso do calendário de bolso: ano em destaque e os 12 meses em grade. */
function paintYear(ctx: CanvasRenderingContext2D, w: number, h: number, arg: string) {
  const year = Number(arg) || CALENDAR_YEAR;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  const unit = Math.min(w, h);
  const pad = unit * 0.06;
  const header = h * (w < h ? 0.1 : 0.13);
  ctx.fillStyle = INK;
  ctx.font = font(800, header * 0.62);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(year), w / 2, pad + header / 2, w - pad * 2);
  const bandW = unit * 0.3;
  BRAND.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(w / 2 - bandW / 2 + (bandW / 4) * i, pad + header * 0.98, bandW / 4, unit * 0.008);
  });
  const cols = w < h ? 3 : 4;
  const rows = 12 / cols;
  const top = pad + header * 1.15;
  const gapX = unit * 0.035;
  const gapY = unit * 0.03;
  const cellW = (w - pad * 2 - gapX * (cols - 1)) / cols;
  const cellH = (h - top - pad - gapY * (rows - 1)) / rows;
  for (let m = 0; m < 12; m += 1) {
    const cx = pad + (m % cols) * (cellW + gapX);
    const cy = top + Math.floor(m / cols) * (cellH + gapY);
    drawMonth(ctx, cx, cy, cellW, cellH, year, m, MONTHS[m].toUpperCase());
  }
}

/** Página do calendário de mesa: um mês grande ("2027-0" = janeiro de 2027). */
function paintMonth(ctx: CanvasRenderingContext2D, w: number, h: number, arg: string) {
  const [yearText, monthText] = arg.split("-");
  const year = Number(yearText) || CALENDAR_YEAR;
  const month = Math.min(11, Math.max(0, Number(monthText) || 0));
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  const pad = Math.min(w, h) * 0.07;
  drawMonth(ctx, pad, pad, w - pad * 2, h - pad * 2, year, month, `${MONTHS[month].toUpperCase()} ${year}`);
}

/* ---------- cartões ---------- */

type CardGeo = { body: THREE.BufferGeometry; face: THREE.BufferGeometry; lift: number };

/** Corpo do cartão com arestas chanfradas + face recortada no formato (reaproveitados por todos os cartões da cena). */
function useCardGeometry(shape: MockupSpec["shape"], w: number, h: number, t: number, radius: number): CardGeo {
  const bevel = Math.min(t * 0.3, radius > 0 ? radius * 0.5 : t * 0.3);
  const body = useMemo(() => {
    const depth = Math.max(t - 2 * bevel, t * 0.2);
    const g = new THREE.ExtrudeGeometry(makeShape(shape, w - 2 * bevel, h - 2 * bevel, Math.max(radius - bevel, 0)), {
      depth,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 16,
    });
    g.translate(0, 0, -depth / 2);
    return g;
  }, [shape, w, h, t, radius, bevel]);
  const face = useMemo(() => faceGeometry(makeShape(shape, w - bevel, h - bevel, Math.max(radius - bevel / 2, 0)), w, h), [shape, w, h, radius, bevel]);
  useGeometryCleanup(body);
  useGeometryCleanup(face);
  return { body, face, lift: t / 2 + 0.0006 };
}

function Card({ geo, spec, front, back, pvc }: { geo: CardGeo; spec: MockupSpec; front: THREE.Texture; back: THREE.Texture; pvc: boolean }) {
  return (
    <group>
      <mesh geometry={geo.body}>
        {pvc ? (
          <meshPhysicalMaterial color="#eef4f3" roughness={0.12} clearcoat={1} clearcoatRoughness={0.05} transparent opacity={0.82} />
        ) : (
          <meshStandardMaterial color={EDGE} roughness={0.92} />
        )}
      </mesh>
      <mesh geometry={geo.face} position-z={geo.lift}>
        <PrintMaterial map={front} spec={spec} />
      </mesh>
      <mesh geometry={geo.face} position-z={-geo.lift} rotation-y={Math.PI}>
        <PrintMaterial map={back} spec={spec} />
      </mesh>
    </group>
  );
}

type CardSceneProps = {
  spec: MockupSpec;
  front: THREE.Texture;
  back: THREE.Texture;
  showBack: boolean;
  showDims: boolean;
  pvc: boolean;
  radiusCm: number;
  thicknessCm: number;
};

/** Expositor de madeira com frente (e verso, quando impresso) em pé + leque de cartões na mesa. */
function CardScene({ spec, front, back, showBack, showDims, pvc, radiusCm, thicknessCm }: CardSceneProps) {
  const { w, h, scale } = fitFlat(spec, 1.5);
  const cm = scale;
  const t = sheetT(thicknessCm, scale);
  const geo = useCardGeometry(spec.shape, w, h, t, radiusCm * scale);
  const gap = 1.4 * cm;
  const blockH = 1.4 * cm;
  const blockD = 2 * cm;
  const inset = 0.55 * cm;
  const lean = 0.1;
  const slots = showBack ? [-(w + gap) / 2, (w + gap) / 2] : [0];
  const blockL = (showBack ? 2 * w + gap : w) + 1.8 * cm;
  const wood = usePaintedTexture(4, paintWood, "oak", 1024, 1 / blockL, 4 / blockL);
  const faceSpec: MockupSpec = pvc ? { ...spec, finish: "gloss", clearcoat: 1 } : spec;
  const card = <Card geo={geo} spec={faceSpec} front={front} back={back} pvc={pvc} />;
  const [lw, lh] = sizeLabels(spec);
  const fan = [0.38, 0.28, 0.18, 0.08, -0.02];
  const pivotX = -w * 0.62;
  // Recuo do canto mais ao fundo de cada cartão girado no pivô: o leque não pode entrar no bloco.
  const reach = Math.max(...fan.map((a) => Math.max(0, w * Math.sin(a)) + h * Math.cos(a)));
  const pivotZ = blockD / 2 + 0.45 * cm + reach;
  return (
    <group userData={{ view: { elevation: 0.34 } }}>
      <SoftBox w={blockL} h={blockD} d={blockH} radius={0.35 * cm} rotation={[-Math.PI / 2, 0, 0]} position={[0, blockH / 2, 0]}>
        <meshPhysicalMaterial map={wood} roughness={0.55} clearcoat={0.35} clearcoatRoughness={0.45} />
      </SoftBox>
      {slots.map((x) => (
        <mesh key={x} position={[x, blockH + 0.0008, -inset * Math.tan(lean)]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[w + 0.15 * cm, t * 2.4]} />
          <meshBasicMaterial color="#2a1d12" />
        </mesh>
      ))}
      <group position={[slots[0], blockH - inset, 0]} rotation-x={-lean}>
        <group position-y={h / 2}>
          {card}
          {showDims && <Dimensions w={w} h={h} z={t / 2 + 0.01} labelW={lw} labelH={lh} />}
        </group>
      </group>
      {showBack && (
        <group position={[slots[1], blockH - inset, 0]} rotation-x={-lean}>
          <group position-y={h / 2} rotation-y={Math.PI}>
            {card}
          </group>
        </group>
      )}
      {fan.map((a, i) => {
        const [x, z] = aroundPivot(pivotX, pivotZ, a, w, h);
        return (
          <Lay key={a} x={x} z={z} y={t / 2 + i * (t + STACK_GAP * 3)} rot={a}>
            {card}
          </Lay>
        );
      })}
    </group>
  );
}

function BusinessCards({ spec, art, label, showDims }: ModelProps) {
  const pvc = spec.variant === "pvc";
  const aspect = artAspect(spec);
  const front = useArtTexture(aspect, "front", art, label);
  // O cartão do verso mostra a arte do passo "Verso"; sem ela, o verso liso (não repete a frente).
  const back = useBackTexture(aspect, spec, art, label, undefined, "blank");
  return (
    <CardScene
      spec={spec}
      front={front}
      back={back}
      showBack={printsBack(spec, art)}
      showDims={showDims && KIND_INFO[spec.kind].dims}
      pvc={pvc}
      // PVC CR80: cantos de 3 mm. Papel: canto vivo (só um chanfro mínimo).
      radiusCm={pvc ? 0.3 : 0.02}
      thicknessCm={paperCm(spec, pvc ? 0.076 : 0.035)}
    />
  );
}

function PocketCalendar({ spec, art, label, showDims }: ModelProps) {
  const aspect = artAspect(spec);
  const front = useArtTexture(aspect, "front", art, label);
  const back = usePaintedTexture(aspect, paintYear, String(CALENDAR_YEAR), 1536);
  // O calendário de bolso sai sempre com canteamento (cantos arredondados).
  return <CardScene spec={spec} front={front} back={back} showBack showDims={showDims && KIND_INFO[spec.kind].dims} pvc={false} radiusCm={0.35} thicknessCm={paperCm(spec, 0.03)} />;
}

/**
 * Cartão de visita, cartão de PVC e calendário de bolso. Corpo extrudado com arestas chanfradas e
 * espessura real; frente (e verso, quando impresso) em pé num expositor de madeira e um leque de
 * cartões na mesa mostrando a pilha. PVC: 0,76 mm, cantos de 3 mm, brilho e borda translúcida.
 * Calendário de bolso: verso com os 12 meses desenhados num canvas local.
 */
export function CardModel(props: ModelProps) {
  return props.spec.variant === "pocket-calendar" ? <PocketCalendar {...props} /> : <BusinessCards {...props} />;
}

/* ---------- folhas soltas ---------- */

/** Papel de escritório sem verniz fica fosco. */
function officeSpec(spec: MockupSpec): MockupSpec {
  return spec.clearcoat > 0 || spec.spotVarnish ? spec : { ...spec, finish: "matte" };
}

function SheetDims({ spec, w, h, t, show }: { spec: MockupSpec; w: number; h: number; t: number; show: boolean }) {
  const [lw, lh] = sizeLabels(spec);
  if (!show || !KIND_INFO[spec.kind].dims) return null;
  return <Dimensions w={w} h={h} z={t / 2 + 0.01} labelW={lw} labelH={lh} />;
}

/** A peça imprime o verso (cor x/1, x/4 ou o cliente montou um)? */
function printsBack(spec: MockupSpec, art: ModelProps["art"]) {
  return spec.back !== "blank" || hasArtContent(art.back);
}

/**
 * Flyer, folheto, filipeta, encarte: leque de folhas, a de cima com a ponta levantando. Com verso impresso, uma folha
 * virada ao lado do leque mostra o verso (a arte do passo "Verso"; sem ela, o verso liso, sem repetir a frente).
 */
function FlyerStack({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec, 2.4);
  const t = sheetT(paperCm(spec, 0.01), scale);
  const aspect = artAspect(spec);
  const front = useArtTexture(aspect, "front", art, label);
  const back = useBackTexture(aspect, spec, art, label, undefined, "blank");
  const short = Math.min(w, h);
  const long = Math.max(w, h) / short > 2.6;
  const verso = printsBack(spec, art);
  const angles = verso ? (long ? [0.2, 0.1, 0] : [0.33, 0.16, 0]) : long ? [0.3, 0.2, 0.1, 0] : [0.5, 0.33, 0.16, 0];
  const curl = sheetForm({ bow: short * 0.015, lift: short * 0.07 });
  // Com verso, o leque vai para a esquerda e a folha virada fica à direita, sem cobrir a frente.
  const shift = verso ? -w * 0.42 : 0;
  const sheet = (form: SheetForm, dims: boolean) => (
    <PaperSheet w={w} h={h} t={t} form={form} front={<PrintMaterial map={front} spec={spec} />} back={<PrintMaterial map={back} spec={spec} />}>
      {dims && <SheetDims spec={spec} w={w} h={h} t={t} show={showDims} />}
    </PaperSheet>
  );
  return (
    <group userData={FLAT_LAY}>
      {angles.map((a, i) => {
        const [x, z] = aroundPivot(-w / 2, h / 2, a, w, h);
        const top = i === angles.length - 1;
        return (
          <Lay key={a} x={x + shift} z={z} y={t / 2 + i * (t * 1.15 + STACK_GAP)} rot={a}>
            {sheet(top ? curl : FLAT, top)}
          </Lay>
        );
      })}
      {verso && (
        <Lay x={w * 0.62} z={h * 0.06} y={t / 2} rot={-0.14} flip>
          {sheet(FLAT, false)}
        </Lay>
      )}
    </group>
  );
}

/**
 * Cartões postais: pilha curta com a frente para cima e um cartão virado mostrando o verso
 * (selo, divisória e endereço). Formatos muito alongados viram tiras na diagonal com a ponta enrolada.
 */
function Postcards({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec, 2.4);
  const t = sheetT(paperCm(spec, 0.03), scale);
  const aspect = artAspect(spec);
  const front = useArtTexture(aspect, "front", art, label);
  const backArt = usePaintedTexture(aspect, paintPostcardBack, spec.back);
  // Verso montado pelo cliente: no lugar do verso padrão do postal (selo, divisória e endereço).
  const ownBack = useBackTexture(aspect, spec, art, label);
  const custom = hasArtContent(art.back);
  const uncoated: MockupSpec = { ...spec, finish: "matte", clearcoat: 0, spotVarnish: false };
  const faceFront = <PrintMaterial map={front} spec={spec} />;
  const faceBack = <PrintMaterial map={custom ? ownBack : backArt} spec={custom ? spec : uncoated} />;
  const short = Math.min(w, h);
  const landscape = w >= h;
  if (Math.max(w, h) / short > 3) {
    const length = Math.max(w, h);
    const turn = 1.9;
    const roll = sheetForm({ axis: landscape ? "x" : "y", folds: [{ at: 0.9, turn, radius: (0.2 * length) / turn }] });
    const rot = landscape ? 0.3 : -0.36;
    const off = short * 1.45;
    return (
      <group userData={FLAT_LAY}>
        <Lay x={landscape ? -off * 0.25 : off} z={landscape ? -off : off * 0.2} rot={rot + (landscape ? 0.06 : -0.06)} y={t / 2} flip>
          <PaperSheet w={w} h={h} t={t} front={faceFront} back={faceBack} />
        </Lay>
        <Lay rot={rot} y={t / 2}>
          <PaperSheet w={w} h={h} t={t} front={faceFront} back={faceBack} />
        </Lay>
        <Lay x={short * 0.03} z={short * 0.02} rot={rot - 0.02} y={t * 1.7}>
          <PaperSheet w={w} h={h} t={t} form={roll} front={faceFront} back={faceBack}>
            <SheetDims spec={spec} w={w} h={h} t={t} show={showDims} />
          </PaperSheet>
        </Lay>
      </group>
    );
  }
  const curl = sheetForm({ bow: short * 0.01, lift: short * 0.07 });
  return (
    <group userData={FLAT_LAY}>
      <Lay x={w * 0.5} z={-h * 0.2} rot={-0.22} y={t / 2} flip>
        <PaperSheet w={w} h={h} t={t} front={faceFront} back={faceBack} />
      </Lay>
      <Lay x={-w * 0.08} z={h * 0.02} rot={0.12} y={t * 1.7}>
        <PaperSheet w={w} h={h} t={t} front={faceFront} back={faceBack} />
      </Lay>
      <Lay x={-w * 0.1} rot={-0.05} y={t * 2.9}>
        <PaperSheet w={w} h={h} t={t} front={faceFront} back={faceBack} />
      </Lay>
      <Lay x={-w * 0.12} z={-h * 0.01} rot={0.03} y={t * 4.1}>
        <PaperSheet w={w} h={h} t={t} form={curl} front={faceFront} back={faceBack}>
          <SheetDims spec={spec} w={w} h={h} t={t} show={showDims} />
        </PaperSheet>
      </Lay>
    </group>
  );
}

/** Papel timbrado: três folhas A4, a de cima com o corpo da carta em linhas fracas e assinatura. */
function Letterhead({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec, 2.4);
  const t = sheetT(paperCm(spec, 0.011), scale);
  const aspect = artAspect(spec);
  const front = useArtTexture(aspect, "front", art, label);
  const lines = usePaintedTexture(aspect, paintLines, "letter");
  const paper = officeSpec(spec);
  const short = Math.min(w, h);
  const curl = sheetForm({ bow: short * 0.012, lift: short * 0.04 });
  const plain = <meshStandardMaterial color={PAPER} roughness={0.92} />;
  const sheets = [
    { x: w * 0.16, z: -h * 0.05, rot: -0.14 },
    { x: w * 0.07, z: -h * 0.02, rot: 0.07 },
    { x: 0, z: 0, rot: -0.02 },
  ];
  return (
    <group userData={{ view: { elevation: 0.95 } }}>
      {sheets.map((s, i) => {
        const top = i === sheets.length - 1;
        return (
          <Lay key={s.rot} x={s.x} z={s.z} rot={s.rot} y={t / 2 + i * (t * 1.2 + STACK_GAP)}>
            <PaperSheet w={w} h={h} t={t} form={top ? curl : FLAT} front={<PrintMaterial map={front} spec={paper} />} back={plain}>
              {top && (
                <SheetPatch w={w} h={h} form={curl} rect={[-w / 2, w / 2, -h / 2, h / 2]} offset={t / 2 + 0.0009}>
                  <meshStandardMaterial map={lines} transparent depthWrite={false} roughness={0.9} polygonOffset polygonOffsetFactor={-2} />
                </SheetPatch>
              )}
              {top && <SheetDims spec={spec} w={w} h={h} t={t} show={showDims} />}
            </PaperSheet>
          </Lay>
        );
      })}
    </group>
  );
}

/** Impressão A4/A3: folha impressa com o canto curvando, sobre uma folha em branco. */
function OfficePrint({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec, 2.4);
  const t = sheetT(paperCm(spec, 0.01), scale);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const short = Math.min(w, h);
  const curl = sheetForm({ bow: short * 0.015, lift: short * 0.09 });
  const plain = <meshStandardMaterial color={PAPER} roughness={0.92} />;
  return (
    <group userData={{ view: { elevation: 0.9 } }}>
      <Lay x={-w * 0.14} z={-h * 0.06} rot={-0.13} y={t / 2}>
        <PaperSheet w={w} h={h} t={t} front={plain} back={plain} />
      </Lay>
      <Lay x={w * 0.03} rot={0.04} y={t * 1.7}>
        <PaperSheet w={w} h={h} t={t} form={curl} seg={36} front={<PrintMaterial map={front} spec={officeSpec(spec)} />} back={plain}>
          <SheetDims spec={spec} w={w} h={h} t={t} show={showDims} />
        </PaperSheet>
      </Lay>
    </group>
  );
}

/**
 * Cartaz preso numa parede com fita crepe nos cantos de cima; a base descola levemente da parede. Frente e verso: outro
 * cartaz deitado no chão, virado, mostra o verso (a arte do passo "Verso"; sem ela, o verso liso).
 */
function PosterOnWall({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec, 2.2);
  const t = sheetT(paperCm(spec, 0.013), scale);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const back = useBackTexture(artAspect(spec), spec, art, label, undefined, "blank");
  const verso = printsBack(spec, art);
  const m = Math.max(w, h) * 0.15;
  const wallW = w + 2 * m;
  const wallH = h + m * 2.6;
  const wallD = 0.08;
  const posterY = m * 1.7 + h / 2;
  const short = Math.min(w, h);
  const curl = sheetForm({ lift: short * 0.06, liftAt: "bottom" });
  const tape = short * 0.17;
  const skirt = wallH * 0.05;
  return (
    <group>
      <SoftBox w={wallW} h={wallH} d={wallD} radius={0.012} position={[0, wallH / 2, -wallD / 2]}>
        <meshStandardMaterial color="#e8e4dc" roughness={0.97} />
      </SoftBox>
      <SoftBox w={wallW + 0.012} h={skirt} d={0.03} radius={0.004} position={[0, skirt / 2, 0.015]}>
        <meshStandardMaterial color="#f5f3ef" roughness={0.6} />
      </SoftBox>
      <group position={[0, posterY, t / 2 + 0.003]}>
        <PaperSheet w={w} h={h} t={t} form={curl} seg={28} front={<PrintMaterial map={front} spec={spec} />} back={<meshStandardMaterial color={PAPER} roughness={0.9} />}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * (w / 2 - tape * 0.18), h / 2 - tape * 0.18, t / 2 + 0.0012]} rotation-z={(-s * Math.PI) / 4}>
              <planeGeometry args={[tape, tape * 0.34]} />
              <meshStandardMaterial color="#efe5c9" roughness={0.55} transparent opacity={0.8} />
            </mesh>
          ))}
          <SheetDims spec={spec} w={w} h={h} t={t} show={showDims} />
        </PaperSheet>
      </group>
      {verso && (
        <Lay x={w * 0.42} z={h * 0.62} y={t / 2} rot={-0.3} flip>
          <PaperSheet w={w} h={h} t={t} form={sheetForm({ lift: short * 0.05 })} seg={28} front={<PrintMaterial map={front} spec={spec} />} back={<PrintMaterial map={back} spec={spec} />} />
        </Lay>
      )}
    </group>
  );
}

/** Cardápio de folha única num display de mesa em L de acrílico: base e duas placas com a folha no meio. */
function MenuHolder({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec, 2.2);
  const cm = scale;
  const t = sheetT(paperCm(spec, 0.02), scale);
  const aspect = artAspect(spec);
  const front = useArtTexture(aspect, "front", art, label);
  const back = useBackTexture(aspect, spec, art, label);
  const acr = 0.25 * cm;
  const margin = 0.7 * cm;
  const baseD = 7.5 * cm;
  const recline = 0.13;
  const panelW = w + 2 * margin;
  const panelH = h + 0.5 * cm;
  const gap = t + 0.15 * cm;
  return (
    <group userData={{ view: { elevation: 0.14 } }}>
      <SoftBox w={panelW} h={baseD} d={acr} radius={0.4 * cm} rotation={[-Math.PI / 2, 0, 0]} position={[0, acr / 2, 0]}>
        <AcrylicMaterials />
      </SoftBox>
      <group position={[0, acr, -baseD * 0.2]} rotation-x={-recline}>
        <SoftBox w={panelW} h={panelH} d={acr} radius={0.4 * cm} position={[0, panelH / 2, -(gap + acr) / 2]}>
          <AcrylicMaterials />
        </SoftBox>
        <group position={[0, h / 2 + 0.1 * cm, 0]}>
          <PaperSheet w={w} h={h} t={t} front={<PrintMaterial map={front} spec={spec} />} back={<PrintMaterial map={back} spec={spec} />}>
            <SheetDims spec={spec} w={w} h={h} t={t} show={showDims} />
          </PaperSheet>
        </group>
        <SoftBox w={panelW} h={panelH} d={acr} radius={0.4 * cm} position={[0, panelH / 2, (gap + acr) / 2]}>
          <AcrylicMaterials />
        </SoftBox>
      </group>
    </group>
  );
}

/** Papel fotográfico: três fotos brilhantes espalhadas, com borda branca fina; a de cima arqueia. */
function PhotoPrints({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec, 2.2);
  const t = sheetT(paperCm(spec, 0.025), scale);
  const short = Math.min(w, h);
  const border = short * 0.035;
  const iw = w - 2 * border;
  const ih = h - 2 * border;
  const front = useArtTexture(iw / ih, "front", art, label);
  const glossy: MockupSpec = { ...spec, finish: "gloss", clearcoat: 1, spotVarnish: false };
  const curl = sheetForm({ bow: short * 0.025 });
  const layout = [
    { x: -w * 0.34, z: -h * 0.12, rot: 0.3, form: FLAT },
    { x: w * 0.32, z: -h * 0.18, rot: -0.24, form: FLAT },
    { x: 0, z: h * 0.04, rot: 0.05, form: curl },
  ];
  return (
    <group userData={FLAT_LAY}>
      {layout.map((p, i) => (
        <Lay key={p.rot} x={p.x} z={p.z} rot={p.rot} y={t / 2 + i * (t + STACK_GAP * 4)}>
          <PaperSheet
            w={w}
            h={h}
            t={t}
            form={p.form}
            front={<meshPhysicalMaterial color="#fbfbf9" roughness={0.18} clearcoat={1} clearcoatRoughness={0.05} />}
            back={<meshStandardMaterial color="#f1f0ec" roughness={0.9} />}
          >
            <SheetPatch w={w} h={h} form={p.form} rect={[-iw / 2, iw / 2, -ih / 2, ih / 2]} offset={t / 2 + 0.0007}>
              <PrintMaterial map={front} spec={glossy} />
            </SheetPatch>
            {i === layout.length - 1 && <SheetDims spec={spec} w={w} h={h} t={t} show={showDims} />}
          </PaperSheet>
        </Lay>
      ))}
    </group>
  );
}

// Gotas sobre o Yupo: posição em fração da meia-largura/meia-altura e tamanho relativo.
const DROPS: Vec3[] = [
  [0.42, 0.3, 1],
  [0.5, 0.16, 0.55],
  [-0.35, -0.42, 0.85],
  [-0.22, 0.56, 0.6],
  [0.14, -0.27, 0.45],
  [0.66, -0.52, 0.7],
  [-0.62, 0.12, 0.5],
  [0.28, 0.66, 0.4],
  [-0.08, -0.7, 0.35],
];

/** Gotas d'água achatadas: casca brilhante sem transmissão, assentadas na superfície curva. */
function Droplets({ w, h, t, form }: { w: number; h: number; t: number; form: SheetForm }) {
  const key = JSON.stringify(form);
  const drops = useMemo(() => {
    const deform = makeDeform(w, h, JSON.parse(key) as SheetForm);
    const p = new THREE.Vector3();
    const r0 = Math.min(w, h) * 0.024;
    return DROPS.map(([fx, fy, s]) => {
      deform((fx * w) / 2, (fy * h) / 2, p);
      const r = r0 * s;
      return { pos: [p.x, p.y, p.z + t / 2 + r * 0.12] as Vec3, r };
    });
  }, [w, h, t, key]);
  const geometry = useMemo(() => new THREE.SphereGeometry(1, 24, 14), []);
  const material = useMemo(
    // Quase invisível: o que vende a gota é o reflexo do estúdio, não um corpo leitoso.
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#eaf5f9",
        roughness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0,
        transparent: true,
        opacity: 0.17,
        ior: 1.33,
        envMapIntensity: 1.8,
        depthWrite: false,
      }),
    [],
  );
  useGeometryCleanup(geometry);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <>
      {drops.map((d) => (
        <mesh key={`${d.pos[0]}:${d.pos[1]}`} geometry={geometry} material={material} position={d.pos} scale={[d.r, d.r * 0.9, d.r * 0.4]} />
      ))}
    </>
  );
}

/** Papel sintético Yupo: brilho acetinado, levemente arqueado, com gotas d'água (é à prova d'água). */
function SyntheticSheets({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec, 2.4);
  const t = sheetT(paperCm(spec, 0.02), scale);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const satin: MockupSpec = { ...spec, finish: "satin", clearcoat: Math.max(spec.clearcoat, 0.35), spotVarnish: false };
  const short = Math.min(w, h);
  const curl = sheetForm({ bow: short * 0.02, lift: short * 0.04 });
  const plain = <meshPhysicalMaterial color="#fafafa" roughness={0.45} clearcoat={0.2} />;
  return (
    <group userData={FLAT_LAY}>
      <Lay x={w * 0.13} z={-h * 0.06} rot={-0.12} y={t / 2}>
        <PaperSheet w={w} h={h} t={t} front={<PrintMaterial map={front} spec={satin} />} back={plain} />
      </Lay>
      <Lay x={-w * 0.02} rot={0.04} y={t * 1.7}>
        <PaperSheet w={w} h={h} t={t} form={curl} front={<PrintMaterial map={front} spec={satin} />} back={plain}>
          <Droplets w={w} h={h} t={t} form={curl} />
          <SheetDims spec={spec} w={w} h={h} t={t} show={showDims} />
        </PaperSheet>
      </Lay>
    </group>
  );
}

/** Papel sublimático: impressão fosca sobre folhas virgens; a ponta enrola e mostra o verso rosado. */
function SublimationSheets({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec, 2.4);
  const t = sheetT(paperCm(spec, 0.01), scale);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const length = Math.max(w, h);
  const turn = 2.3;
  const curl = sheetForm({ axis: w >= h ? "x" : "y", folds: [{ at: 0.92, turn, radius: (0.16 * length) / turn }] });
  const blank = <meshStandardMaterial color="#fbfbfb" roughness={0.9} />;
  const tinted = <meshStandardMaterial color="#f6e6ee" roughness={0.88} />;
  return (
    <group userData={FLAT_LAY}>
      <Lay x={w * 0.1} z={-h * 0.06} rot={-0.1} y={t / 2}>
        <PaperSheet w={w} h={h} t={t} front={blank} back={tinted} />
      </Lay>
      <Lay x={w * 0.05} z={-h * 0.02} rot={0.05} y={t * 1.65}>
        <PaperSheet w={w} h={h} t={t} front={blank} back={tinted} />
      </Lay>
      <Lay rot={-0.02} y={t * 2.8}>
        <PaperSheet w={w} h={h} t={t} form={curl} front={<meshStandardMaterial map={front} color="#efefef" roughness={0.95} />} back={tinted}>
          <SheetDims spec={spec} w={w} h={h} t={t} show={showDims} />
        </PaperSheet>
      </Lay>
    </group>
  );
}

/**
 * Impressos de folha única (variant): postal (pilha + verso com selo e endereço), flyer (leque com
 * curvatura), timbrado (A4 com linhas de texto), cartaz (na parede com fita), cardápio (display de
 * acrílico), foto (brilho e borda branca), Yupo (acetinado com gotas), sublimático (verso rosado
 * no rolo) e impressão (folha curvando sobre outra). Folhas são superfícies curvas com espessura real.
 */
export function SheetModel(props: ModelProps) {
  switch (props.spec.variant) {
    case "postcard":
      return <Postcards {...props} />;
    case "letterhead":
      return <Letterhead {...props} />;
    case "poster":
      return <PosterOnWall {...props} />;
    case "menu":
      return <MenuHolder {...props} />;
    case "photo":
      return <PhotoPrints {...props} />;
    case "synthetic":
      return <SyntheticSheets {...props} />;
    case "sublimation":
      return <SublimationSheets {...props} />;
    case "print":
      return <OfficePrint {...props} />;
    default:
      return <FlyerStack {...props} />;
  }
}

/* ---------- dobrados ---------- */

/** Dobras do folder: em pé abre em V/U para a câmera; deitado relaxa com vincos levemente erguidos. */
function leafletForm(axis: "x" | "y", panels: number, standing: boolean, crease: number): SheetForm {
  if (panels <= 2) {
    const a = standing ? 0.5 : 0.13;
    return sheetForm({ axis, heading: -a, folds: [{ at: 0.5, turn: 2 * a, radius: crease }] });
  }
  const a = standing ? 0.72 : 0.16;
  return sheetForm({
    axis,
    heading: -a,
    folds: [
      { at: 1 / 3, turn: a, radius: crease },
      { at: 2 / 3, turn: a, radius: crease },
    ],
  });
}

/** Folder/cardápio dobrado: uma folha contínua com vincos arredondados; a arte aberta corre pelos painéis. */
function Leaflet({ spec, art, label, standing }: ModelProps & { standing: boolean }) {
  const { w, h, scale } = fitFlat(spec, 2.6);
  const t = sheetT(paperCm(spec, 0.014), scale);
  const aspect = artAspect(spec);
  const front = useArtTexture(aspect, "front", art, label);
  const back = useBackTexture(aspect, spec, art, label);
  const axis = standing || w >= h ? "x" : "y";
  const long = axis === "x" ? w : h;
  const short = axis === "x" ? h : w;
  // Tiras muito compridas (10×45) são sanfonas de 3 painéis mesmo sem "2 dobras" no nome.
  const panels = Math.min(3, Math.max(2, spec.folds + 1, !standing && long / short >= 3.5 ? 3 : 0));
  const crease = Math.max(t * 1.6, 0.004);
  if (standing) {
    // Cardápio em pé como na foto do produto: as dobras fecham para dentro (o lado interno, o verso, fica côncavo) e
    // o lado externo fica para a câmera, com a contracapa no meio e a capa à direita (gabarito: 3 | 2 Verso | 1 Frente).
    // Mesma folha girada meia volta, com as faces trocadas: o verso espelhado da folha lê certo visto daqui.
    return (
      <group userData={{ view: { elevation: 0.2 } }} rotation-y={0.3}>
        <group rotation-y={Math.PI}>
          <PaperSheet
            w={w}
            h={h}
            t={t}
            form={leafletForm(axis, panels, standing, crease)}
            front={<PrintMaterial map={back} spec={spec} />}
            back={<PrintMaterial map={front} spec={spec} />}
          />
        </group>
      </group>
    );
  }
  const sheet = (
    <PaperSheet
      w={w}
      h={h}
      t={t}
      form={leafletForm(axis, panels, standing, crease)}
      front={<PrintMaterial map={front} spec={spec} />}
      back={<PrintMaterial map={back} spec={spec} />}
    />
  );
  return (
    <group userData={FLAT_LAY}>
      <Lay>{sheet}</Lay>
    </group>
  );
}

/** Altura da bolsa em fração da capa (gabarito: 9 cm numa capa de 31). */
const POCKET = 0.3;

/** Bolsa interna da pasta, centrada, com o canto de fora cortado em diagonal. */
function pocketShape(pw: number, hp: number) {
  const x0 = -pw / 2 + pw * 0.012;
  const x1 = pw / 2 - pw * 0.012;
  const yb = -hp / 2;
  const top = hp / 2;
  const cut = pw * 0.12;
  const shape = new THREE.Shape();
  shape.moveTo(x0, yb);
  shape.lineTo(x1, yb);
  shape.lineTo(x1, top - cut * 0.6);
  shape.lineTo(x1 - cut, top);
  shape.lineTo(x0, top);
  shape.lineTo(x0, yb);
  return shape;
}

/** Inclinação de cada capa a partir da lombada (a pasta aberta não fica chapada na mesa). */
const FOLDER_TILT = 0.04;

/**
 * Pastas (com bolsa, com orelha, simples e plastificada), deitadas e vistas de cima, como os gabaritos: só o lado de
 * fora é impresso. Na frente, a pasta aberta por fora mostra o verso à esquerda e a frente à direita (a contracapa com
 * a arte do passo "Verso"; sem ela, lisa); atrás, outra aberta por dentro, branca, com um documento e, nas "c/ Bolsa",
 * a bolsa com a arte dela dobrada sobre o verso.
 */
function PocketFolder({ spec, art, label }: ModelProps) {
  // Formato aberto (largura > altura) vira capa de meia largura.
  const landscape = spec.widthCm > spec.heightCm * 1.05;
  const pwCm = Math.max(1, landscape ? spec.widthCm / 2 : spec.widthCm);
  const phCm = Math.max(1, landscape ? Math.min(spec.heightCm, pwCm * 1.42) : spec.heightCm);
  const scale = 2.6 / Math.max(pwCm * 3.5, phCm * 1.8);
  const pw = pwCm * scale;
  const ph = phCm * scale;
  const t = sheetT(paperCm(spec, 0.03), scale);
  const withPocket = spec.variant === "folder-pocket";
  const front = useArtTexture(pw / ph, "front", art, label);
  const back = useBackTexture(pw / ph, spec, art, label, undefined, "blank");
  const docW = pw * 0.86;
  const docH = Math.min(ph * 0.9, docW * 1.414);
  const docT = sheetT(0.011, scale);
  const doc = usePaintedTexture(docW / docH, paintLines, "doc");
  const pocket = useMemo(() => {
    const hp = ph * POCKET;
    const shape = pocketShape(pw, hp);
    const body = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 4 });
    body.translate(0, 0, -t / 2);
    return { body, face: faceGeometry(shape, pw, hp), aspect: pw / hp, y: -ph / 2 + hp / 2 + ph * 0.006 };
  }, [pw, ph, t]);
  useGeometryCleanup(pocket.body);
  useGeometryCleanup(pocket.face);
  const plain = <meshStandardMaterial color={PAPER} roughness={0.9} />;
  // Uma capa da pasta (frente = lado de fora), girada na lombada (x = 0) para o lado `side`.
  const cover = (side: 1 | -1, outside: ReactNode, children?: ReactNode) => (
    <group rotation-y={side * FOLDER_TILT}>
      <group position-x={(side * pw) / 2}>
        <PaperSheet w={pw} h={ph} t={t} front={outside} back={plain}>
          {children}
        </PaperSheet>
      </group>
    </group>
  );
  const spineLift = pw * Math.sin(FOLDER_TILT);
  return (
    <group userData={{ view: { elevation: 0.9 } }}>
      {/* Atrás: aberta por dentro (virada), com o documento e a bolsa sobre o verso (que, por dentro, fica à direita). */}
      <Lay x={pw * 0.85} z={-ph * 0.5} y={spineLift + t} rot={-0.16} flip>
        {cover(1, <PrintMaterial map={front} spec={spec} />)}
        {cover(
          -1,
          <PrintMaterial map={back} spec={spec} />,
          <group position-z={-t / 2}>
            <group position={[0, ph / 2 - docH / 2 - ph * 0.06, -docT / 2 - 0.0006]} rotation-y={Math.PI}>
              <PaperSheet w={docW} h={docH} t={docT} front={plain} back={plain}>
                <mesh position-z={docT / 2 + 0.0006}>
                  <planeGeometry args={[docW, docH]} />
                  <meshStandardMaterial map={doc} transparent depthWrite={false} roughness={0.9} polygonOffset polygonOffsetFactor={-2} />
                </mesh>
              </PaperSheet>
            </group>
            {withPocket && <FolderPocket geometry={pocket} z={-docT - t / 2 - 0.0016} t={t} art={art} label={label} spec={spec} />}
          </group>,
        )}
      </Lay>
      {/* Na frente: aberta por fora, verso à esquerda e frente à direita. */}
      <Lay x={-pw * 0.55} z={ph * 0.25} y={spineLift + t * 4 + 0.004} rot={0.08}>
        {cover(1, <PrintMaterial map={front} spec={spec} />)}
        {cover(-1, <PrintMaterial map={back} spec={spec} />)}
      </Lay>
    </group>
  );
}

/** Bolsa colada no verso, por dentro da pasta: a face impressa (arte da superfície "bolsa") fica para quem abre. */
function FolderPocket({ geometry, z, t, art, label, spec }: { geometry: { body: THREE.BufferGeometry; face: THREE.BufferGeometry; aspect: number; y: number }; z: number; t: number; art: ModelProps["art"]; label: string; spec: MockupSpec }) {
  // Sem arte própria, a bolsa segue a arte da capa (ela sai da mesma folha impressa, como na foto do produto).
  const map = useFaceTexture(geometry.aspect, art, "bolsa", label, "front");
  return (
    <group position={[0, geometry.y, z]} rotation-y={Math.PI}>
      <mesh geometry={geometry.body}>
        <meshStandardMaterial color={EDGE} roughness={0.9} />
      </mesh>
      <mesh geometry={geometry.face} position-z={t / 2 + 0.0008}>
        <PrintMaterial map={map} spec={spec} />
      </mesh>
    </group>
  );
}

/**
 * Folder, cardápio dobrado e pasta. A folha é uma superfície contínua dobrada por um caminho com vincos
 * arredondados (a arte aberta corre por todos os painéis; o verso, espelhado, lê certo por trás).
 * {menu}: em pé, abrindo em V (1 dobra) ou U (2 dobras). Padrão: deitado, painéis relaxados.
 * {folder}/{folder-pocket}: pasta aberta por fora (verso e frente) + outra por dentro com documento (e a bolsa).
 */
export function FoldedModel(props: ModelProps) {
  if (props.spec.variant === "folder-pocket" || props.spec.variant === "folder") return <PocketFolder {...props} />;
  return <Leaflet {...props} standing={props.spec.variant === "menu"} />;
}

/* ---------- displays de mesa ---------- */

/** Triângulo de papel: face da frente sobe até o vinco do topo, a de trás desce e a base volta pela mesa. */
function tentForm(face: number, base: number, psi: number, crease: number): SheetForm {
  const length = 2 * face + base;
  return sheetForm({
    axis: "y",
    heading: -psi,
    folds: [
      { at: face / length, turn: 2 * psi - Math.PI, radius: crease },
      { at: (2 * face) / length, turn: -(Math.PI / 2 + psi), radius: crease },
    ],
  });
}

/** Display de mesa de papel (A-frame), com a arte nas duas faces. */
function TableTent({ spec, art, label }: ModelProps) {
  // Medida alta e estreita (14,5×45) é a folha aberta: duas faces + base.
  const tall = spec.heightCm > spec.widthCm * 1.8;
  const faceCm = tall ? spec.heightCm * 0.42 : spec.heightCm;
  const baseCm = tall ? spec.heightCm - 2 * faceCm : spec.heightCm * 0.4;
  const scale = 2.4 / Math.max(spec.widthCm, faceCm);
  const W = spec.widthCm * scale;
  const F = faceCm * scale;
  const B = baseCm * scale;
  const t = sheetT(paperCm(spec, 0.035), scale);
  const crease = Math.max(t * 1.8, 0.005);
  const psi = Math.asin(Math.min(0.9, B / 2 / F));
  const L = 2 * F + B;
  const easel = tentForm(F, B, psi, crease);
  const apexM = (crease * (Math.PI - 2 * psi)) / 2 + 0.002;
  const footM = (crease * (Math.PI / 2 + psi)) / 2 + 0.002;
  const span = Math.max(F - apexM - footM, F * 0.5);
  const front = useArtTexture(W / span, "front", art, label);
  const y0 = -L / 2;
  const offset = t / 2 + 0.0007;
  return (
    <group rotation-y={0.3} userData={{ view: { elevation: 0.2 } }}>
      <group position-y={L / 2}>
        <PaperSheet w={W} h={L} t={t} form={easel} front={<meshStandardMaterial color={PAPER} roughness={0.85} />} back={<meshStandardMaterial color={BOARD_BACK} roughness={0.95} />}>
          <SheetPatch w={W} h={L} form={easel} rect={[-W / 2, W / 2, y0 + footM, y0 + footM + span]} offset={offset}>
            <PrintMaterial map={front} spec={spec} />
          </SheetPatch>
          {/* Face de trás: o caminho desce, então a arte gira 180° para ler de pé por trás. */}
          <SheetPatch w={W} h={L} form={easel} rect={[-W / 2, W / 2, y0 + F + apexM, y0 + F + apexM + span]} offset={offset} flipU flipV>
            <PrintMaterial map={front} spec={spec} />
          </SheetPatch>
        </PaperSheet>
      </group>
    </group>
  );
}

/** Calendário de mesa: cavalete de papelão, bloco de páginas preso por wire-o; arte + grade do mês. */
function DeskCalendar({ spec, art, label }: ModelProps) {
  const pwCm = Math.max(1, spec.widthCm);
  const phCm = Math.max(1, spec.heightCm);
  const scale = 2.4 / (pwCm + 2);
  const cm = scale;
  const pw = pwCm * scale;
  const ph = phCm * scale;
  const boardT = sheetT(paperCm(spec, 0.045), scale);
  const stackT = Math.max(13 * 0.025 * scale, 0.006);
  const F = ph + 1.6 * cm;
  const W = pw + 0.6 * cm;
  const B = F * 0.5;
  const psi = Math.asin(Math.min(0.9, B / 2 / F));
  const L = 2 * F + B;
  const easel = tentForm(F, B, psi, Math.max(boardT * 1.6, 0.004));

  // Página: arte ao lado da grade (formato deitado) ou em cima dela (formato em pé).
  const m = ph * 0.05;
  const topM = 0.9 * cm;
  const regionH = ph - topM - m;
  const side = pw / ph > 1.4;
  const artW = side ? (pw - 3 * m) * 0.56 : pw - 2 * m;
  const artH = side ? regionH : (regionH - m) * 0.58;
  const gridW = side ? pw - 3 * m - artW : pw - 2 * m;
  const gridH = side ? regionH : regionH - m - artH;
  const artPos: Vec3 = side ? [-pw / 2 + m + artW / 2, ph / 2 - topM - artH / 2, 0] : [0, ph / 2 - topM - artH / 2, 0];
  const gridPos: Vec3 = side ? [pw / 2 - m - gridW / 2, ph / 2 - topM - gridH / 2, 0] : [0, -ph / 2 + m + gridH / 2, 0];
  const front = useArtTexture(artW / artH, "front", art, label);
  const grid = usePaintedTexture(gridW / gridH, paintMonth, `${CALENDAR_YEAR}-0`);

  // Posições no plano da face da frente (origem no pé da frente).
  const up: Vec3 = [0, Math.cos(psi), -Math.sin(psi)];
  const nrm: Vec3 = [0, Math.sin(psi), Math.cos(psi)];
  const along = (d: number, o: number): Vec3 => [0, up[1] * d + nrm[1] * o, up[2] * d + nrm[2] * o];
  const off = boardT / 2 + stackT / 2 + 0.0015;
  const pageTop = F - 0.45 * cm;
  const pagePos = along(pageTop - ph / 2, off);
  const holeInset = 0.3 * cm;
  const holeLocalY = ph / 2 - holeInset;
  // Argola justa como wire-o real: passa pelo furo e contorna o topo do cavalete com folga pequena.
  const apex = along(F, 0);
  const hole = along(pageTop - holeInset, off + stackT / 2);
  const chordY = apex[1] - hole[1];
  const chordZ = apex[2] - hole[2];
  const chord = Math.max(Math.hypot(chordY, chordZ), 1e-4);
  const clear = 0.18 * cm;
  const ringR = chord / 2 + clear / 2;
  const center: Vec3 = [0, hole[1] + (chordY / chord) * ringR, hole[2] + (chordZ / chord) * ringR];
  const pitch = 0.847 * cm;
  const pairs = Math.max(3, Math.floor((pw - 1.4 * cm) / pitch) + 1);
  const ringXs = Array.from({ length: pairs }, (_, i) => (i - (pairs - 1) / 2) * pitch);
  const tube = Math.max(0.05 * cm, 0.0035);

  const ring = useMemo(() => new THREE.TorusGeometry(ringR, tube, 8, 40), [ringR, tube]);
  const holeGeo = useMemo(() => new THREE.PlaneGeometry(0.42 * cm, 0.26 * cm), [cm]);
  useGeometryCleanup(ring);
  useGeometryCleanup(holeGeo);
  const wireColor = metalColor(spec.metal);
  const materials = useMemo(
    () => ({
      wire: new THREE.MeshStandardMaterial({ color: wireColor, metalness: 1, roughness: 0.28 }),
      hole: new THREE.MeshBasicMaterial({ color: "#3a3a3a" }),
    }),
    [wireColor],
  );
  useEffect(
    () => () => {
      materials.wire.dispose();
      materials.hole.dispose();
    },
    [materials],
  );
  const paper = <meshStandardMaterial color="#fdfdfb" roughness={0.88} />;
  const pageZ = stackT / 2 + 0.0006;
  return (
    <group rotation-y={0.28} userData={{ view: { elevation: 0.22 } }}>
      <group position-y={L / 2}>
        <PaperSheet w={W} h={L} t={boardT} form={easel} front={<meshStandardMaterial color="#f1efe9" roughness={0.85} />} back={<meshStandardMaterial color={BOARD_BACK} roughness={0.95} />} />
      </group>
      <group position={pagePos} rotation-x={-psi}>
        <PaperSheet w={pw} h={ph} t={stackT} front={paper} back={paper} edge="#e7e4dd" />
        <mesh position={[artPos[0], artPos[1], pageZ]}>
          <planeGeometry args={[artW, artH]} />
          <PrintMaterial map={front} spec={spec} />
        </mesh>
        <mesh position={[gridPos[0], gridPos[1], pageZ]}>
          <planeGeometry args={[gridW, gridH]} />
          <meshStandardMaterial map={grid} roughness={0.85} />
        </mesh>
        {ringXs.map((x) => (
          <mesh key={x} geometry={holeGeo} material={materials.hole} position={[x, holeLocalY, pageZ + 0.0004]} />
        ))}
      </group>
      {ringXs.flatMap((x) =>
        [-0.11 * cm, 0.11 * cm].map((dx) => (
          <mesh key={`${x}:${dx}`} geometry={ring} material={materials.wire} position={[x + dx, center[1], center[2]]} rotation-y={Math.PI / 2} />
        )),
      )}
    </group>
  );
}

/**
 * Displays de mesa. Padrão (display de papel): A-frame feito de uma folha contínua com vincos
 * arredondados (frente, topo, trás e base), interior cinza do duplex e a arte nas duas faces.
 * {calendar}: calendário de mesa com cavalete, bloco de páginas com espessura, wire-o no topo e
 * página com a arte + grade do mês desenhada num canvas local.
 */
export function TentModel(props: ModelProps) {
  return props.spec.variant === "calendar" ? <DeskCalendar {...props} /> : <TableTent {...props} />;
}
