"use client";

// Papelaria: pacote de papel, calendário de parede, porta-passaporte, tag e marcador de livro.
// Cada modelo trabalha em centímetros dentro de um grupo escalado (constante CM do modelo); as cotas
// ficam fora desse grupo, em unidades de cena, porque Dimensions já usa medidas fixas de cena.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MockupSpec } from "@/lib/mockup";
import { KIND_INFO } from "@/lib/mockup-kinds";
import { canvasFor, fontFamily } from "../art";
import { JewelryCard } from "./jewelry";
import {
  Dimensions,
  PrintMaterial,
  faceGeometry,
  makeShape,
  metalColor,
  sizeLabels,
  useArtTexture,
  useGeometryCleanup,
  type ModelProps,
  useBackTexture,
  backKindOf,
} from "./shared";

const CORAL = "#c4241b";
const CREAM = "#f1ead9";

type Vec3 = [number, number, number];

/* ------------------------------------------------------------------ */
/* Helpers locais                                                      */
/* ------------------------------------------------------------------ */

function useTextureCleanup(texture: THREE.Texture | null | undefined) {
  useEffect(() => () => texture?.dispose(), [texture]);
}

/** Gerador pseudoaleatório com semente: texturas procedurais iguais em todo render. */
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

/** Textura de canvas desenhada uma vez (rótulos, fio torcido, papel). */
function paintTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: [number, number]) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }
  return texture;
}

/** Fio torcido de algodão: listras diagonais (multiplicam a cor do cordão). u corre ao longo do tubo. */
function twistTexture(repeatU: number) {
  return paintTexture(
    64,
    64,
    (ctx, w, h) => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#bdb7ad";
      ctx.lineWidth = 10;
      for (let i = -2; i <= 2; i += 1) {
        ctx.beginPath();
        ctx.moveTo((i * w) / 2, 0);
        ctx.lineTo((i * w) / 2 + w, h);
        ctx.stroke();
      }
    },
    [Math.max(1, repeatU), 1],
  );
}

/** Fios paralelos da franja do pingente (variam em u, ao redor do torno). */
function threadTexture(repeatU: number) {
  return paintTexture(
    64,
    8,
    (ctx, w, h) => {
      const rand = seeded(11);
      for (let x = 0; x < w; x += 4) {
        const shade = 200 + Math.round(rand() * 55);
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
        ctx.fillRect(x, 0, 3, h);
        ctx.fillStyle = "#8f8a82";
        ctx.fillRect(x + 3, 0, 1, h);
      }
    },
    [repeatU, 1],
  );
}

/** Folhas empilhadas vistas pelo corte: linhas finas creme. vertical = linhas variam em u. */
function pageLinesTexture(vertical: boolean, repeat: number) {
  const long = 128;
  return paintTexture(
    vertical ? long : 4,
    vertical ? 4 : long,
    (ctx, w, h) => {
      const rand = seeded(vertical ? 3 : 7);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < long; i += 4) {
        const shade = 205 + Math.round(rand() * 35);
        ctx.fillStyle = `rgb(${shade},${shade - 4},${shade - 14})`;
        if (vertical) ctx.fillRect(i, 0, 1 + Math.round(rand()), h);
        else ctx.fillRect(0, i, w, 1 + Math.round(rand()));
      }
    },
    vertical ? [repeat, 1] : [1, repeat],
  );
}

/** Granulado de couro sintético para bumpMap. */
function grainTexture(repeat: [number, number]) {
  return paintTexture(
    128,
    128,
    (ctx, w, h) => {
      const rand = seeded(29);
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i += 1) {
        const v = Math.round(90 + rand() * 90);
        ctx.fillStyle = `rgba(${v},${v},${v},0.55)`;
        ctx.beginPath();
        ctx.arc(rand() * w, rand() * h, 1 + rand() * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    repeat,
  );
}

/** Cópia da face com u espelhado e normal invertida: verso legível visto por trás, sem girar a peça. */
function mirroredFace(face: THREE.BufferGeometry) {
  const g = face.clone();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setX(i, 1 - uv.getX(i));
  const normal = g.attributes.normal;
  for (let i = 0; i < normal.count; i += 1) normal.setXYZ(i, 0, 0, -1);
  const index = g.index;
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const b = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, b);
    }
    index.needsUpdate = true;
  }
  uv.needsUpdate = true;
  normal.needsUpdate = true;
  return g;
}

function addHole(shape: THREE.Shape, x: number, y: number, r: number) {
  const hole = new THREE.Path();
  hole.absarc(x, y, r, 0, Math.PI * 2, true);
  shape.holes.push(hole);
}

type CardGeometry = { edge: THREE.BufferGeometry; front: THREE.BufferGeometry; back: THREE.BufferGeometry; d: number };

/** Geometria de cartão recortado (pode ter furo): borda extrudada + faces com UV na proporção da arte. */
function useCardGeometry(shape: THREE.Shape, w: number, h: number, d: number): CardGeometry {
  const geo = useMemo(() => {
    const edge = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 32 });
    edge.translate(0, 0, -d / 2);
    const front = faceGeometry(shape, w, h);
    return { edge, front, back: mirroredFace(front), d };
  }, [shape, w, h, d]);
  useGeometryCleanup(geo.edge);
  useGeometryCleanup(geo.front);
  useGeometryCleanup(geo.back);
  return geo;
}

type CardProps = {
  geometry: CardGeometry;
  spec: MockupSpec;
  front: THREE.Texture;
  back: THREE.Texture | null;
  edgeColor: string;
  backColor?: string;
};

function CutCard({ geometry, spec, front, back, edgeColor, backColor = "#f6f5f1" }: CardProps) {
  const lift = 0.006;
  return (
    <group>
      <mesh geometry={geometry.edge}>
        <meshStandardMaterial color={edgeColor} roughness={0.92} />
      </mesh>
      <mesh geometry={geometry.front} position-z={geometry.d / 2 + lift}>
        <PrintMaterial map={front} spec={spec} />
      </mesh>
      <mesh geometry={geometry.back} position-z={-geometry.d / 2 - lift}>
        {back ? <PrintMaterial map={back} spec={spec} /> : <meshStandardMaterial color={backColor} roughness={0.88} />}
      </mesh>
    </group>
  );
}

/** Tubo ao longo de uma curva (cordão, fio, gancho). */
function useTube(points: Vec3[], radius: number, closed = false, segments = 64) {
  const key = JSON.stringify(points);
  const geometry = useMemo(() => {
    const list = (JSON.parse(key) as Vec3[]).map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const curve = new THREE.CatmullRomCurve3(list, closed, "centripetal");
    return new THREE.TubeGeometry(curve, segments, radius, 8, closed);
  }, [key, radius, closed, segments]);
  useGeometryCleanup(geometry);
  return geometry;
}

/** Comprimento aproximado de uma polilinha (para repetir a textura do fio sem esticar). */
function pathLength(points: Vec3[], closed = false) {
  let total = 0;
  const n = points.length;
  for (let i = 0; i < n - (closed ? 0 : 1); i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return total;
}

type CordGeometry = { geometry: THREE.BufferGeometry; map: THREE.Texture };

/** Cordão de algodão torcido: tubo + textura de torção repetida conforme o comprimento. */
function useCord(points: Vec3[], radius: number, closed = false): CordGeometry {
  const geometry = useTube(points, radius, closed, closed ? 140 : 72);
  const length = pathLength(points, closed);
  const map = useMemo(() => twistTexture(Math.round(length / (radius * 9))), [length, radius]);
  useTextureCleanup(map);
  return { geometry, map };
}

function Cord({ cord, color }: { cord: CordGeometry; color: string }) {
  return (
    <mesh geometry={cord.geometry}>
      <meshStandardMaterial color={color} map={cord.map} roughness={0.95} />
    </mesh>
  );
}

/** Bloco de folhas com linhas de papel nos cortes (frente = +x, topo/base = ±y). */
function PageBlock({ sx, sy, sz, position }: { sx: number; sy: number; sz: number; position: Vec3 }) {
  const maps = useMemo(() => {
    const repeat = Math.max(1, (sz * 14) / 32);
    return { fore: pageLinesTexture(true, repeat), top: pageLinesTexture(false, repeat) };
  }, [sz]);
  useTextureCleanup(maps.fore);
  useTextureCleanup(maps.top);
  return (
    <mesh position={position}>
      <boxGeometry args={[sx, sy, sz]} />
      <meshStandardMaterial attach="material-0" color={CREAM} map={maps.fore} roughness={0.95} />
      <meshStandardMaterial attach="material-1" color={CREAM} roughness={0.95} />
      <meshStandardMaterial attach="material-2" color={CREAM} map={maps.top} roughness={0.95} />
      <meshStandardMaterial attach="material-3" color={CREAM} map={maps.top} roughness={0.95} />
      <meshStandardMaterial attach="material-4" color={CREAM} roughness={0.95} />
      <meshStandardMaterial attach="material-5" color={CREAM} roughness={0.95} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Capa dura / capa de couro: lombada em U + dois painéis               */
/* ------------------------------------------------------------------ */

/** Painel com cantos arredondados só do lado da abertura (direita); o lado da lombada fica reto. */
function panelShape(w: number, h: number, r: number) {
  const rr = Math.max(0.001, Math.min(r, w / 2, h / 2));
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  const s = new THREE.Shape();
  s.moveTo(x0, y0);
  s.lineTo(x1 - rr, y0);
  s.absarc(x1 - rr, y0 + rr, rr, -Math.PI / 2, 0, false);
  s.lineTo(x1, y1 - rr);
  s.absarc(x1 - rr, y1 - rr, rr, 0, Math.PI / 2, false);
  s.lineTo(x0, y1);
  s.closePath();
  return s;
}

type CaseGeometry = {
  spine: THREE.BufferGeometry;
  panel: THREE.BufferGeometry;
  face: THREE.BufferGeometry;
  faceBack: THREE.BufferGeometry;
  faceW: number;
  faceH: number;
};

/**
 * Capa fechada: lombada em meia-cana (x < 0) e painéis de x = 0 a W, com chanfro suave.
 * Painel da frente ocupa z ∈ [gap/2, gap/2 + t]; o de trás é o mesmo painel deslocado.
 */
function useCaseGeometry(W: number, H: number, gap: number, t: number, r: number): CaseGeometry {
  const geo = useMemo(() => {
    const b = Math.min(0.04, t * 0.25);
    const ro = gap / 2 + t;
    const ri = gap / 2;
    const spineShape = new THREE.Shape();
    spineShape.absarc(0, 0, ro, Math.PI / 2, Math.PI * 1.5, false);
    spineShape.absarc(0, 0, ri, Math.PI * 1.5, Math.PI / 2, true);
    spineShape.closePath();
    const spine = new THREE.ExtrudeGeometry(spineShape, { depth: H, bevelEnabled: false, curveSegments: 24 });
    spine.rotateX(Math.PI / 2);
    spine.translate(0, H / 2, 0);

    const inner = panelShape(W - 2 * b, H - 2 * b, r - b);
    const panel = new THREE.ExtrudeGeometry(inner, {
      depth: Math.max(0.001, t - 2 * b),
      bevelEnabled: true,
      bevelThickness: b,
      bevelSize: b,
      bevelSegments: 2,
      curveSegments: 16,
    });
    panel.translate(W / 2, 0, b);
    const face = faceGeometry(inner, W - 2 * b, H - 2 * b);
    face.translate(W / 2, 0, 0);
    const faceBack = mirroredFace(face);
    return { spine, panel, face, faceBack, faceW: W - 2 * b, faceH: H - 2 * b };
  }, [W, H, gap, t, r]);
  useGeometryCleanup(geo.spine);
  useGeometryCleanup(geo.panel);
  useGeometryCleanup(geo.face);
  useGeometryCleanup(geo.faceBack);
  return geo;
}

/** Pontos de costura ao longo do contorno do painel, recuados `inset` da borda (cápsulas mescladas). */
function useStitches(W: number, H: number, r: number, inset: number, radius: number, spacing: number) {
  const geometry = useMemo(() => {
    const path = panelShape(W - 2 * inset, H - 2 * inset, r - inset);
    const count = Math.max(8, Math.floor(path.getLength() / spacing));
    const points = path.getSpacedPoints(count);
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i + 1 < points.length; i += 2) {
      const a = points[i];
      const c = points[i + 1];
      const len = a.distanceTo(c);
      if (len < 1e-4) continue;
      const g = new THREE.CapsuleGeometry(radius, Math.max(0.001, len * 0.72), 2, 6);
      g.rotateZ(Math.atan2(c.y - a.y, c.x - a.x) - Math.PI / 2);
      g.translate((a.x + c.x) / 2 + W / 2, (a.y + c.y) / 2, 0);
      parts.push(g);
    }
    const merged = parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry();
    parts.forEach((g) => g.dispose());
    return merged ?? new THREE.BufferGeometry();
  }, [W, H, r, inset, radius, spacing]);
  useGeometryCleanup(geometry);
  return geometry;
}

/* ------------------------------------------------------------------ */
/* Pacote de papel                                                     */
/* ------------------------------------------------------------------ */

type PackLook = {
  wrap: string;
  flap: string;
  thickness: number;
  sheet: string;
  border: number;
  photo: boolean;
  kicker: string;
  title: string;
  subtitle: string;
  footer: string;
  band: [string, string];
  ink: string;
};

function packLook(variant: string | null): PackLook {
  if (variant === "sublimation") {
    return {
      wrap: "#c9a77c",
      flap: "#d8bb92",
      thickness: 1.15,
      sheet: "#f4f2ec",
      border: 0.6,
      photo: false,
      kicker: "PAPEL PARA SUBLIMAÇÃO",
      title: "Sublimático A4",
      subtitle: "Dry Fast · 100 folhas",
      footer: "210 × 297 mm  ·  Transferência térmica",
      band: ["#c92f68", "#f0709e"],
      ink: "#6e1f3f",
    };
  }
  return {
    wrap: "#dfe8f5",
    flap: "#f4f7fc",
    thickness: 1.35,
    sheet: "#fdfdfd",
    border: 0.35,
    photo: true,
    kicker: "PAPEL FOTOGRÁFICO",
    title: "Photo Glossy",
    subtitle: "180g · 50 folhas",
    footer: "A4 · 210 × 297 mm  ·  Alta resolução",
    band: ["#0b3a8c", "#2f7ff0"],
    ink: "#0b3a8c",
  };
}

/** Rótulo do pacote: faixa da marca no alto (fica de fora da folha impressa), resto liso. */
function packLabelTexture(aspect: number, look: PackLook) {
  const canvas = canvasFor(aspect, 1024);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const W = canvas.width;
    const H = canvas.height;
    const u = W / 100;
    const font = fontFamily();
    if (look.photo) {
      // Azul-claro embaixo: a folha branca impressa se destaca sobre o pacote.
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#ffffff");
      bg.addColorStop(0.3, "#e3ecf8");
      bg.addColorStop(1, "#b9cdea");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(11,58,140,0.07)";
      ctx.lineWidth = u * 0.6;
      for (let x = -H; x < W; x += u * 5) {
        ctx.beginPath();
        ctx.moveTo(x, H);
        ctx.lineTo(x + H, 0);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = look.wrap;
      ctx.fillRect(0, 0, W, H);
      // Fibras do kraft.
      const rand = seeded(5);
      for (let i = 0; i < 1400; i += 1) {
        const x = rand() * W;
        const y = rand() * H;
        const a = rand() * Math.PI;
        const l = 4 + rand() * 14;
        ctx.strokeStyle = rand() > 0.5 ? "rgba(90,60,30,0.10)" : "rgba(255,240,220,0.14)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        ctx.stroke();
      }
    }
    const y0 = H * 0.03;
    const bh = H * 0.19;
    const band = ctx.createLinearGradient(0, y0, W, y0 + bh);
    band.addColorStop(0, look.band[0]);
    band.addColorStop(1, look.band[1]);
    ctx.fillStyle = band;
    ctx.fillRect(0, y0, W, bh);
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(W * 0.52, y0);
    ctx.lineTo(W * 0.7, y0);
    ctx.lineTo(W * 0.48, y0 + bh);
    ctx.lineTo(W * 0.3, y0 + bh);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `700 ${u * 3.6}px ${font}`;
    ctx.fillText(look.kicker, u * 7, y0 + bh * 0.3, W - u * 34);
    ctx.font = `800 ${u * 10}px ${font}`;
    ctx.fillText(look.title, u * 7, y0 + bh * 0.66, W - u * 34);
    ctx.font = `500 ${u * 4.8}px ${font}`;
    ctx.fillText(look.subtitle, u * 7, y0 + bh * 0.88, W - u * 34);

    // Selo redondo "A4".
    const cx = W - u * 15;
    const cy = y0 + bh * 0.5;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx, cy, u * 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = look.band[0];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 ${u * 7.5}px ${font}`;
    ctx.fillText("A4", cx, cy + u * 0.4);

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = look.ink;
    ctx.font = `600 ${u * 3.3}px ${font}`;
    ctx.fillText(look.footer, u * 7, y0 + bh + u * 6.5, W - u * 14);
    ctx.fillStyle = look.band[0];
    ctx.fillRect(0, H * 0.962, W, H * 0.012);

    // Reflexos do filme plástico.
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = "#ffffff";
    for (const [x, s] of [
      [0.15, 0.08],
      [0.62, 0.05],
    ]) {
      ctx.beginPath();
      ctx.moveTo(W * x, 0);
      ctx.lineTo(W * (x + s), 0);
      ctx.lineTo(W * (x + s - 0.35), H);
      ctx.lineTo(W * (x - 0.35), H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

type SheetPlacement = { cx: number; cz: number; yaw: number; y: number; halfX: number; halfZ: number; sag: number };

/**
 * Folha deitada (face +y, topo da arte para -z) já posicionada sobre o pacote: onde passa da borda,
 * cai em parábola suave, como papel 180 g fora do apoio. Coordenadas em cm do próprio pacote.
 */
function bentSheet(w: number, h: number, p: SheetPlacement, segX = 28, segY = 36) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const cos = Math.cos(p.yaw);
  const sin = Math.sin(p.yaw);
  for (let j = 0; j <= segY; j += 1) {
    const v = j / segY;
    for (let i = 0; i <= segX; i += 1) {
      const u = i / segX;
      const lx = (u - 0.5) * w;
      const lz = (0.5 - v) * h;
      const x = p.cx + lx * cos + lz * sin;
      const z = p.cz - lx * sin + lz * cos;
      const over = Math.hypot(Math.max(0, Math.abs(x) - p.halfX), Math.max(0, Math.abs(z) - p.halfZ));
      positions.push(x, p.y - p.sag * over * over, z);
      uvs.push(u, v);
    }
  }
  for (let j = 0; j < segY; j += 1) {
    for (let i = 0; i < segX; i += 1) {
      const a = j * (segX + 1) + i;
      const b = a + 1;
      const c = a + segX + 1;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Trapézio da dobra do filme nas pontas do pacote. */
function flapShape(wTop: number, wBottom: number, height: number) {
  const s = new THREE.Shape();
  s.moveTo(-wTop / 2, 0);
  s.lineTo(wTop / 2, 0);
  s.lineTo(wBottom / 2, -height);
  s.lineTo(-wBottom / 2, -height);
  s.closePath();
  return s;
}

const PACK_CM = 0.085;

/**
 * Pacote A4 lacrado (papel foto ou sublimático): bloco com chanfro "almofadado" e filme brilhante,
 * rótulo da marca desenhado em canvas, dobras do filme nas pontas e, por cima, uma folha impressa
 * escorregando para fora com a arte (foto: brilho com borda branca; sublimático: fosca, tinta apagada).
 */
export function PaperpackModel({ spec, art, label }: ModelProps) {
  const look = useMemo(() => packLook(spec.variant), [spec.variant]);
  const sheetW = Math.max(5, spec.widthCm);
  const sheetH = Math.max(5, spec.heightCm);
  const W = sheetW + 0.6;
  const L = sheetH + 0.6;
  const T = look.thickness;
  const bevel = 0.15;
  const artW = sheetW - look.border * 2;
  const artH = sheetH - look.border * 2;
  const front = useArtTexture(artW / artH, "front", art, label);

  const body = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(makeShape("rect", W - bevel * 2, L - bevel * 2, 0.25), {
      depth: Math.max(0.01, T - bevel * 2),
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 4,
      curveSegments: 8,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, bevel, 0);
    return g;
  }, [W, L, T]);
  useGeometryCleanup(body);

  const labelMap = useMemo(() => packLabelTexture((W - bevel * 2) / (L - bevel * 2), look), [W, L, look]);
  useTextureCleanup(labelMap);

  const flaps = useMemo(() => {
    const top = new THREE.ShapeGeometry(flapShape(W - bevel * 2, W - T * 1.4, T * 0.55));
    const bottom = new THREE.ShapeGeometry(flapShape(W - bevel * 2, W - T * 1.4, T * 0.55));
    bottom.rotateZ(Math.PI);
    return { top, bottom };
  }, [W, T]);
  useGeometryCleanup(flaps.top);
  useGeometryCleanup(flaps.bottom);

  const sheets = useMemo(() => {
    // Avança o bastante para a faixa da marca e o rodapé do rótulo ficarem à mostra atrás da folha.
    const place: SheetPlacement = { cx: 1.4, cz: L * 0.34, yaw: -0.1, y: T + 0.03, halfX: W / 2, halfZ: L / 2, sag: 0.008 };
    return {
      paper: bentSheet(sheetW, sheetH, place),
      print: bentSheet(artW, artH, { ...place, y: place.y + 0.025 }),
    };
  }, [sheetW, sheetH, artW, artH, W, L, T]);
  useGeometryCleanup(sheets.paper);
  useGeometryCleanup(sheets.print);

  const printSpec = useMemo<MockupSpec>(() => ({ ...spec, finish: "gloss", clearcoat: 1, spotVarnish: false }), [spec]);
  const flapLift = 0.012;

  return (
    <group userData={{ view: { elevation: 0.85 } }}>
      <group scale={PACK_CM}>
        <mesh geometry={body}>
          <meshPhysicalMaterial color={look.wrap} roughness={0.45} clearcoat={1} clearcoatRoughness={0.14} />
        </mesh>
        <mesh position-y={T + 0.012} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[W - bevel * 2, L - bevel * 2]} />
          <meshPhysicalMaterial map={labelMap} roughness={0.4} clearcoat={1} clearcoatRoughness={0.1} />
        </mesh>
        {[1, -1].map((side) => (
          <group key={side} position-z={(side * L) / 2} rotation-y={side > 0 ? 0 : Math.PI}>
            <mesh geometry={flaps.bottom} position={[0, bevel * 0.4, flapLift]}>
              <meshPhysicalMaterial color={look.flap} roughness={0.35} clearcoat={1} clearcoatRoughness={0.1} />
            </mesh>
            <mesh geometry={flaps.top} position={[0, T - bevel * 0.4, flapLift * 2]}>
              <meshPhysicalMaterial color={look.flap} roughness={0.3} clearcoat={1} clearcoatRoughness={0.08} />
            </mesh>
          </group>
        ))}
        <mesh geometry={sheets.paper}>
          {look.photo ? (
            <meshPhysicalMaterial color={look.sheet} roughness={0.22} clearcoat={1} clearcoatRoughness={0.06} side={THREE.DoubleSide} />
          ) : (
            <meshStandardMaterial color={look.sheet} roughness={0.95} side={THREE.DoubleSide} />
          )}
        </mesh>
        <mesh geometry={sheets.print}>
          {look.photo ? (
            <PrintMaterial map={front} spec={printSpec} />
          ) : (
            // Tinta sublimática no papel ainda é opaca e levemente apagada (só aviva na transferência).
            <meshStandardMaterial map={front} color="#e9e7e4" roughness={0.97} />
          )}
        </mesh>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Calendário de parede                                                */
/* ------------------------------------------------------------------ */

const MONTH = { name: "JANEIRO", year: 2027, days: 31, prevDays: 31, holidays: [1] };
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

/** Dia da semana (0 = domingo), algoritmo de Sakamoto. */
function weekday(year: number, month: number, day: number) {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const y = month < 3 ? year - 1 : year;
  return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[month - 1] + day) % 7;
}

/** Grade do mês: nome e ano, iniciais dos dias, números (fins de semana e feriado em coral). */
function calendarTexture(aspect: number) {
  const canvas = canvasFor(aspect, 1024);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const W = canvas.width;
    const H = canvas.height;
    const font = fontFamily();
    const pad = W * 0.06;
    ctx.fillStyle = "#fdfdfb";
    ctx.fillRect(0, 0, W, H);

    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "#151515";
    ctx.font = `800 ${H * 0.1}px ${font}`;
    ctx.fillText(MONTH.name, pad, H * 0.16);
    ctx.textAlign = "right";
    ctx.fillStyle = CORAL;
    ctx.fillText(String(MONTH.year), W - pad, H * 0.16);

    const cw = (W - pad * 2) / 7;
    ctx.textAlign = "center";
    ctx.font = `700 ${H * 0.045}px ${font}`;
    WEEKDAYS.forEach((d, i) => {
      ctx.fillStyle = i === 0 || i === 6 ? CORAL : "#8a8a8a";
      ctx.fillText(d, pad + cw * (i + 0.5), H * 0.265);
    });
    ctx.fillStyle = "#e2e2e2";
    ctx.fillRect(pad, H * 0.295, W - pad * 2, Math.max(1, H * 0.003));

    const top = H * 0.32;
    const rowH = (H * 0.97 - top) / 6;
    const first = weekday(MONTH.year, 1, 1);
    ctx.font = `600 ${rowH * 0.42}px ${font}`;
    for (let k = 0; k < 42; k += 1) {
      const col = k % 7;
      const row = Math.floor(k / 7);
      let day = k - first + 1;
      let inMonth = true;
      if (day < 1) {
        day += MONTH.prevDays;
        inMonth = false;
      } else if (day > MONTH.days) {
        day -= MONTH.days;
        inMonth = false;
      }
      const x = pad + cw * (col + 0.5);
      const y = top + rowH * (row + 0.62);
      const weekend = col === 0 || col === 6;
      const holiday = inMonth && MONTH.holidays.includes(day);
      ctx.fillStyle = !inMonth ? "#d4d4d4" : weekend || holiday ? CORAL : "#1d1d1d";
      ctx.fillText(String(day), x, y);
      if (holiday) {
        ctx.beginPath();
        ctx.arc(x, y + rowH * 0.18, rowH * 0.045, 0, Math.PI * 2);
        ctx.fill();
      }
      if (row > 0 && col === 0) {
        ctx.fillStyle = "#efefef";
        ctx.fillRect(pad, top + rowH * row, W - pad * 2, Math.max(1, H * 0.002));
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Folha com o recorte de meia-lua no topo (onde aparece o gancho). */
function calendarPageShape(w: number, h: number, notchR: number, notchD: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -h / 2);
  s.lineTo(w / 2, -h / 2);
  s.lineTo(w / 2, h / 2);
  s.lineTo(notchR, h / 2);
  s.absellipse(0, h / 2, notchR, notchD, 0, Math.PI, true, 0);
  s.lineTo(-w / 2, h / 2);
  s.closePath();
  return s;
}

const CAL_CM = 0.08;

/**
 * Calendário de parede: metade de cima com a arte, metade de baixo com a grade do mês (canvas),
 * faixa de furos com wire-o duplo, recorte central com gancho em V apoiado num prego, folhas
 * de trás levemente abertas e base de papelão.
 */
export function WallCalendarModel({ spec, art, label, showDims }: ModelProps) {
  const w = Math.max(8, spec.widthCm);
  const h = Math.max(10, spec.heightCm);
  const strip = 1.4;
  const artH = h / 2 - strip;
  const gridH = h / 2;
  const front = useArtTexture(w / artH, "front", art, label);
  const grid = useMemo(() => calendarTexture(w / gridH), [w, gridH]);
  useTextureCleanup(grid);

  const notchR = 1.8;
  const page = useMemo(() => {
    const shape = calendarPageShape(w, h, notchR, 0.9);
    const sheet = new THREE.ShapeGeometry(shape, 24);
    const board = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false, curveSegments: 24 });
    return { sheet, board };
  }, [w, h]);
  useGeometryCleanup(page.sheet);
  useGeometryCleanup(page.board);

  const ringR = 0.5;
  const holeY = h / 2 - 0.6;
  const axisY = holeY + ringR;
  const axisZ = -0.13;
  const ring = useMemo(() => new THREE.TorusGeometry(ringR, 0.045, 6, 28), []);
  useGeometryCleanup(ring);
  const ringXs = useMemo(() => {
    const list: number[] = [];
    const pitch = 0.85;
    const half = w / 2 - 0.8;
    const n = Math.floor((half * 2) / pitch);
    const start = -(n * pitch) / 2;
    for (let i = 0; i <= n; i += 1) {
      const x = start + i * pitch;
      if (Math.abs(x) > notchR + 1.1) list.push(x);
    }
    return list;
  }, [w]);
  const hanger = useTube(
    [
      [-(notchR + 0.8), axisY, axisZ],
      [-(notchR - 0.1), axisY + 0.9, axisZ + 0.04],
      [-0.6, axisY + 2.5, axisZ + 0.08],
      [-0.25, axisY + 3.05, axisZ + 0.1],
      [0, axisY + 3.2, axisZ + 0.1],
      [0.25, axisY + 3.05, axisZ + 0.1],
      [0.6, axisY + 2.5, axisZ + 0.08],
      [notchR - 0.1, axisY + 0.9, axisZ + 0.04],
      [notchR + 0.8, axisY, axisZ],
    ],
    0.06,
  );
  const wire = metalColor(spec.metal);
  const [lw, lh] = sizeLabels(spec);

  return (
    <group>
      <group scale={CAL_CM}>
        {/* Página da frente */}
        <mesh geometry={page.sheet}>
          <meshStandardMaterial color="#fbfbf9" roughness={0.8} />
        </mesh>
        <mesh position={[0, h / 2 - strip - artH / 2, 0.015]}>
          <planeGeometry args={[w, artH]} />
          <PrintMaterial map={front} spec={spec} />
        </mesh>
        <mesh position={[0, -h / 4, 0.015]}>
          <planeGeometry args={[w, gridH]} />
          <PrintMaterial map={grid} spec={spec} />
        </mesh>
        {ringXs.map((x) => (
          <mesh key={`h${x}`} position={[x, holeY, 0.02]}>
            <planeGeometry args={[0.42, 0.3]} />
            <meshStandardMaterial color="#4a4a4a" roughness={0.9} />
          </mesh>
        ))}
        {/* Folhas de trás, cada uma descendo um pouco na base (espessura do bloco) */}
        {[1, 2].map((i) => (
          <mesh key={i} geometry={page.sheet} position={[0, -0.1 * i, -0.04 * i]}>
            <meshStandardMaterial color={i === 1 ? "#f6f6f3" : "#f1f1ed"} roughness={0.85} side={THREE.DoubleSide} />
          </mesh>
        ))}
        <mesh geometry={page.board} position={[0, -0.3, -0.3]}>
          <meshStandardMaterial color="#9c968b" roughness={0.95} />
        </mesh>
        {/* Wire-o duplo */}
        {ringXs.flatMap((x) =>
          [-0.13, 0.13].map((dx) => (
            <mesh key={`r${x}${dx}`} geometry={ring} position={[x + dx, axisY, axisZ]} rotation-y={Math.PI / 2}>
              <meshStandardMaterial color={wire} metalness={1} roughness={0.28} />
            </mesh>
          )),
        )}
        <mesh geometry={hanger}>
          <meshStandardMaterial color={wire} metalness={1} roughness={0.28} />
        </mesh>
        {/* Prego */}
        <group position={[0, axisY + 3.2 - 0.06 - 0.13, axisZ]}>
          <mesh position-z={-0.45} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.11, 0.11, 2.2, 16]} />
            <meshStandardMaterial color="#9da1a6" metalness={1} roughness={0.35} />
          </mesh>
          <mesh position-z={0.68} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.32, 0.3, 0.1, 24]} />
            <meshStandardMaterial color="#a7abb0" metalness={1} roughness={0.3} />
          </mesh>
        </group>
      </group>
      {showDims && KIND_INFO[spec.kind].dims && <Dimensions w={w * CAL_CM} h={h * CAL_CM} z={0.05 * CAL_CM} labelW={lw} labelH={lh} />}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Porta-passaporte                                                    */
/* ------------------------------------------------------------------ */

/** Cartão de embarque (adereço): cabeçalho azul, rota, dados do voo e código de barras. */
function boardingPassTexture() {
  const canvas = canvasFor(8 / 15.5, 1024);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const W = canvas.width;
    const H = canvas.height;
    const font = fontFamily();
    const u = W / 100;
    ctx.fillStyle = "#fbfbf7";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#13294b";
    ctx.fillRect(0, 0, W, H * 0.12);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${u * 5}px ${font}`;
    ctx.fillText("CARTÃO DE EMBARQUE", u * 7, H * 0.04);
    ctx.font = `800 ${u * 8}px ${font}`;
    ctx.fillText("BOARDING PASS", u * 7, H * 0.085);

    ctx.fillStyle = "#13294b";
    ctx.font = `800 ${u * 17}px ${font}`;
    ctx.fillText("GRU", u * 7, H * 0.19);
    ctx.textAlign = "right";
    ctx.fillText("LIS", W - u * 7, H * 0.19);
    ctx.textAlign = "center";
    ctx.fillStyle = CORAL;
    ctx.font = `700 ${u * 9}px ${font}`;
    ctx.fillText("→", W / 2, H * 0.19);
    ctx.fillStyle = "#777777";
    ctx.font = `500 ${u * 4.2}px ${font}`;
    ctx.textAlign = "left";
    ctx.fillText("São Paulo", u * 7, H * 0.235);
    ctx.textAlign = "right";
    ctx.fillText("Lisboa", W - u * 7, H * 0.235);

    const rows: [string, string][] = [
      ["VOO", "PC 2027"],
      ["ASSENTO", "12A"],
      ["PORTÃO", "7"],
      ["EMBARQUE", "21:40"],
    ];
    rows.forEach(([k, v], i) => {
      const x = i % 2 === 0 ? u * 7 : W / 2 + u * 3;
      const y = H * 0.3 + Math.floor(i / 2) * H * 0.075;
      ctx.textAlign = "left";
      ctx.fillStyle = "#8a8a8a";
      ctx.font = `600 ${u * 3.6}px ${font}`;
      ctx.fillText(k, x, y);
      ctx.fillStyle = "#151515";
      ctx.font = `800 ${u * 6.5}px ${font}`;
      ctx.fillText(v, x, y + H * 0.032);
    });
    ctx.setLineDash([u * 2, u * 1.6]);
    ctx.strokeStyle = "#bdbdbd";
    ctx.lineWidth = u * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.5);
    ctx.lineTo(W, H * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    const rand = seeded(17);
    let x = u * 8;
    ctx.fillStyle = "#111111";
    while (x < W - u * 8) {
      const bw = u * (0.4 + rand() * 1.4);
      ctx.fillRect(x, H * 0.56, bw, H * 0.1);
      x += bw + u * (0.4 + rand() * 1.2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function isLight(color: string) {
  const c = new THREE.Color(color);
  return c.r * 0.299 + c.g * 0.587 + c.b * 0.114 > 0.6;
}

const PASS_CM = 0.16;

/**
 * Porta-passaporte fechado e de leve em ângulo: capa de couro sintético (lombada em meia-cana +
 * painéis chanfrados, granulado em bumpMap) com a arte na frente, pesponto em cápsulas finas,
 * caderno do passaporte por dentro e um cartão de embarque saindo pelo topo.
 */
export function PassportModel({ spec, art, label }: ModelProps) {
  const coverW = Math.max(4, spec.widthCm / 2);
  const H = Math.max(6, spec.heightCm * 0.875);
  const t = 0.16;
  const gap = 0.6;
  const ro = gap / 2 + t;
  const W = coverW - ro;
  const r = 0.7;
  const shell = useCaseGeometry(W, H, gap, t, r);
  const aspect = shell.faceW / shell.faceH;
  const front = useArtTexture(aspect, "front", art, label);
  const backKind = backKindOf(spec, art);
  const back = useBackTexture(aspect, spec, art, label);
  const stitches = useStitches(W, H, r, 0.42, 0.035, 0.32);

  const maps = useMemo(
    () => ({
      face: grainTexture([shell.faceW / 1.2, shell.faceH / 1.2]),
      body: grainTexture([1 / 1.2, 1 / 1.2]),
      pass: boardingPassTexture(),
    }),
    [shell.faceW, shell.faceH],
  );
  useTextureCleanup(maps.face);
  useTextureCleanup(maps.body);
  useTextureCleanup(maps.pass);

  const cover = spec.baseColor.toLowerCase() === "#ffffff" ? "#f3f1ec" : spec.baseColor;
  const thread = spec.accentColor ?? (isLight(cover) ? "#c9c1b3" : "#efe8dc");
  const bookletW = Math.min(8.8, W - 0.5);
  const bookletH = Math.min(12.5, H - 1.2);
  const bookletX = 0.12 + bookletW / 2;
  const passW = Math.min(8, W - 1.4);
  const passH = 15.5;
  const passY = H / 2 + 3.6 - passH / 2;
  const front0 = gap / 2 + t;

  return (
    <group rotation={[0, -0.38, 0]}>
      <group scale={PASS_CM} position-x={(-(W - ro) / 2) * PASS_CM}>
        {/* Lombada e painéis */}
        <mesh geometry={shell.spine}>
          <meshPhysicalMaterial color={cover} roughness={0.6} clearcoat={0.3} clearcoatRoughness={0.45} bumpMap={maps.body} bumpScale={0.4} />
        </mesh>
        <mesh geometry={shell.panel} position-z={gap / 2}>
          <meshPhysicalMaterial color={cover} roughness={0.6} clearcoat={0.3} clearcoatRoughness={0.45} bumpMap={maps.body} bumpScale={0.4} />
        </mesh>
        <mesh geometry={shell.panel} position-z={-gap / 2 - t}>
          <meshPhysicalMaterial color={cover} roughness={0.6} clearcoat={0.3} clearcoatRoughness={0.45} bumpMap={maps.body} bumpScale={0.4} />
        </mesh>
        <mesh geometry={shell.face} position-z={front0 + 0.004}>
          <meshPhysicalMaterial map={front} roughness={0.5} clearcoat={0.35} clearcoatRoughness={0.35} bumpMap={maps.face} bumpScale={0.4} />
        </mesh>
        <mesh geometry={shell.faceBack} position-z={-front0 - 0.004}>
          {backKind === "blank" ? (
            <meshPhysicalMaterial color={cover} roughness={0.55} clearcoat={0.3} clearcoatRoughness={0.45} bumpMap={maps.face} bumpScale={0.4} />
          ) : (
            <meshPhysicalMaterial map={back} roughness={0.5} clearcoat={0.35} clearcoatRoughness={0.35} bumpMap={maps.face} bumpScale={0.4} />
          )}
        </mesh>
        {/* Pesponto nas duas capas */}
        <mesh geometry={stitches} position-z={front0 + 0.02}>
          <meshStandardMaterial color={thread} roughness={0.85} />
        </mesh>
        <mesh geometry={stitches} position-z={-front0 - 0.02}>
          <meshStandardMaterial color={thread} roughness={0.85} />
        </mesh>
        {/* Caderno do passaporte por dentro */}
        <PageBlock sx={bookletW - 0.1} sy={bookletH - 0.2} sz={0.4} position={[bookletX - 0.05, 0, 0]} />
        {[1, -1].map((side) => (
          <mesh key={side} position={[bookletX, 0, side * 0.225]}>
            <boxGeometry args={[bookletW, bookletH, 0.04]} />
            <meshStandardMaterial color="#5b1626" roughness={0.7} />
          </mesh>
        ))}
        {/* Cartão de embarque saindo pelo topo */}
        <group position={[bookletX + 0.5, passY, 0.272]} rotation-z={-0.07}>
          <mesh>
            <planeGeometry args={[passW, passH]} />
            <meshStandardMaterial map={maps.pass} roughness={0.85} />
          </mesh>
          <mesh rotation-y={Math.PI} position-z={-0.004}>
            <planeGeometry args={[passW, passH]} />
            <meshStandardMaterial color="#f6f5f0" roughness={0.85} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Tag                                                                 */
/* ------------------------------------------------------------------ */

type TagGeometry = { shape: THREE.Shape; hole: [number, number]; dir: [number, number] };

/** Contorno da tag com furo: retangular com cantos chanfrados do lado do furo, oval ou redonda. */
function tagGeometry(kind: MockupSpec["shape"], w: number, h: number): TagGeometry {
  const holeR = 0.26;
  const landscape = w >= h * 1.15;
  if (kind === "round" || kind === "heart") {
    const shape = kind === "heart" ? makeShape("heart", w, h, 0) : makeShape("round", w, h, 0);
    if (landscape && kind === "round") {
      const hole: [number, number] = [-w / 2 + 0.85, 0];
      addHole(shape, hole[0], hole[1], holeR);
      return { shape, hole, dir: [-1, 0] };
    }
    const hole: [number, number] = [0, kind === "heart" ? h * 0.12 : h / 2 - 0.8];
    addHole(shape, hole[0], hole[1], holeR);
    return { shape, hole, dir: [0, 1] };
  }
  // Retangular: monta deitada (furo à esquerda) e gira 90° quando a tag é em pé (furo no topo).
  const L = landscape ? w : h;
  const S = landscape ? h : w;
  const c = Math.min(0.9, S * 0.22);
  const r = Math.min(0.35, S * 0.15);
  const pts: [number, number][] = [
    [-L / 2 + c, -S / 2],
    [L / 2 - r, -S / 2],
  ];
  for (let i = 1; i <= 6; i += 1) {
    const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
    pts.push([L / 2 - r + Math.cos(a) * r, -S / 2 + r + Math.sin(a) * r]);
  }
  pts.push([L / 2, S / 2 - r]);
  for (let i = 1; i <= 6; i += 1) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push([L / 2 - r + Math.cos(a) * r, S / 2 - r + Math.sin(a) * r]);
  }
  pts.push([-L / 2 + c, S / 2], [-L / 2, S / 2 - c], [-L / 2, -S / 2 + c]);
  const map = (p: [number, number]): THREE.Vector2 => (landscape ? new THREE.Vector2(p[0], p[1]) : new THREE.Vector2(p[1], -p[0]));
  const shape = new THREE.Shape(pts.map(map));
  const hole = map([-L / 2 + 0.8, 0]);
  addHole(shape, hole.x, hole.y, holeR);
  return { shape, hole: [hole.x, hole.y], dir: landscape ? [-1, 0] : [0, 1] };
}

type TagStringPaths = { loop: Vec3[]; tails: Vec3[][]; knot: Vec3 };

/** Laço de algodão passando pelo furo, com nó e duas pontas caindo pela gravidade. */
function tagString(hole: [number, number], dir: [number, number]): TagStringPaths {
  const [hx, hy] = hole;
  const [dx, dy] = dir;
  const px = -dy;
  const py = dx;
  const pt = (a: number, b: number, z: number): Vec3 => [hx + dx * a + px * b, hy + dy * a + py * b, z];
  const knot = pt(4.0, 0.1, 0);
  const loop: Vec3[] = [pt(0.12, 0, 0.12), pt(1.0, 0.35, 0.32), pt(2.6, 0.55, 0.2), knot, pt(2.6, -0.4, -0.2), pt(1.0, -0.3, -0.32), pt(0.12, 0, -0.12)];
  // Pontas: seguem um pouco na direção do laço e caem (−y).
  const side = dx !== 0 ? dx : 1;
  const tails: Vec3[][] = [
    [knot, [knot[0] + side * 0.5, knot[1] - 0.3, 0.05], [knot[0] + side * 0.8, knot[1] - 1.3, 0.08], [knot[0] + side * 0.7, knot[1] - 2.4, 0.04]],
    [knot, [knot[0] + side * 0.3, knot[1] - 0.4, -0.06], [knot[0] + side * 0.35, knot[1] - 1.6, -0.1], [knot[0] + side * 0.15, knot[1] - 2.9, -0.06]],
  ];
  return { loop, tails, knot };
}

const TAG_CM = 0.16;

type TagPieceProps = {
  card: CardGeometry;
  hole: [number, number];
  spec: MockupSpec;
  front: THREE.Texture;
  back: THREE.Texture | null;
  eyelet: THREE.BufferGeometry;
  knotGeometry: THREE.BufferGeometry;
  metal: string;
  cords: CordGeometry[];
  knot: Vec3;
  cordColor: string;
};

/** Uma tag montada; as geometrias vêm prontas e são compartilhadas entre as três peças. */
function TagPiece({ card, hole, spec, front, back, eyelet, knotGeometry, metal, cords, knot, cordColor }: TagPieceProps) {
  return (
    <group>
      <CutCard geometry={card} spec={spec} front={front} back={back} edgeColor="#f1eee7" />
      {[1, -1].map((side) => (
        <mesh key={side} geometry={eyelet} position={[hole[0], hole[1], side * (card.d / 2 + 0.025)]} scale={[1, 1, 0.55]}>
          <meshStandardMaterial color={metal} metalness={1} roughness={0.25} />
        </mesh>
      ))}
      {cords.map((cord, i) => (
        <Cord key={i} cord={cord} color={cordColor} />
      ))}
      <mesh geometry={knotGeometry} position={knot} scale={[1, 0.8, 0.8]}>
        <meshStandardMaterial color={cordColor} roughness={0.95} />
      </mesh>
    </group>
  );
}

/**
 * Tags de roupa em cartão grosso: três peças sobrepostas em leque (a da frente com a arte, uma
 * virada mostrando o verso), furo com ilhós metálico e laço de algodão torcido com nó e pontas.
 */
/** Tags (padrão) ou cartela de bijuteria (jewelry.tsx, produto novo). */
export function HangtagModel(props: ModelProps) {
  if (props.spec.variant === "jewelry") return <JewelryCard {...props} />;
  return <HangTags {...props} />;
}

function HangTags({ spec, art, label, showDims }: ModelProps) {
  const w = Math.max(1, spec.widthCm);
  const h = Math.max(1, spec.heightCm);
  // Couchê 250 g (~0,3 mm), levemente exagerado para a borda aparecer de lado.
  const d = 0.05;
  const geo = useMemo(() => tagGeometry(spec.shape, w, h), [spec.shape, w, h]);
  const front = useArtTexture(w / h, "front", art, label);
  const backKind = backKindOf(spec, art);
  const backTex = useBackTexture(w / h, spec, art, label);
  const back = backKind === "blank" ? null : backTex;
  const card = useCardGeometry(geo.shape, w, h, d);
  const parts = useMemo(() => ({ eyelet: new THREE.TorusGeometry(0.33, 0.075, 10, 32), knot: new THREE.SphereGeometry(0.16, 14, 10) }), []);
  useGeometryCleanup(parts.eyelet);
  useGeometryCleanup(parts.knot);
  const string = useMemo(() => tagString(geo.hole, geo.dir), [geo]);
  const loop = useCord(string.loop, 0.055, true);
  const tailA = useCord(string.tails[0], 0.05);
  const tailB = useCord(string.tails[1], 0.05);
  const [lw, lh] = sizeLabels(spec);
  const piece: TagPieceProps = {
    card,
    hole: geo.hole,
    spec,
    front,
    back,
    eyelet: parts.eyelet,
    knotGeometry: parts.knot,
    metal: metalColor(spec.metal),
    cords: [loop, tailA, tailB],
    knot: string.knot,
    cordColor: spec.accentColor ?? "#efe6d4",
  };
  const heroTilt = -0.04;

  return (
    <group>
      <group scale={TAG_CM}>
        {/* Terceira tag, atrás à esquerda */}
        <group position={[-w * 0.2, h * 0.58, -2.6]} rotation-z={0.16}>
          <TagPiece {...piece} />
        </group>
        {/* Tag virada mostrando o verso: gira para que a ponta do furo venha para a frente fora da
            tag principal (girar para o outro lado faria a ponta atravessar a arte da frente). */}
        <group position={[w * 0.42, h * 0.45, -1.5]} rotation-z={0.1}>
          <group rotation-y={Math.PI - 0.36}>
            <TagPiece {...piece} />
          </group>
        </group>
        {/* Tag principal com a arte */}
        <group rotation-z={heroTilt}>
          <TagPiece {...piece} />
        </group>
      </group>
      {showDims && KIND_INFO[spec.kind].dims && (
        <group rotation-z={heroTilt}>
          <Dimensions w={w * TAG_CM} h={h * TAG_CM} z={(d / 2 + 0.05) * TAG_CM} labelW={lw} labelH={lh} />
        </group>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Marcador de livro                                                   */
/* ------------------------------------------------------------------ */

/** Pingente de franja: cabeça torneada, amarração e saia de fios (textura de fios ao redor). */
function Tassel({ color }: { color: string }) {
  const geo = useMemo(() => {
    // Perfis de baixo para cima: o torno só gera normais para fora com y crescente.
    const head = new THREE.LatheGeometry(
      [
        [0, -0.96],
        [0.2, -0.95],
        [0.26, -0.85],
        [0.33, -0.55],
        [0.3, -0.25],
        [0.18, -0.05],
        [0, 0],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      28,
    );
    const skirt = new THREE.LatheGeometry(
      [
        [0, -5.12],
        [0.38, -5.1],
        [0.47, -4.9],
        [0.44, -4.0],
        [0.33, -2.6],
        [0.24, -1.4],
        [0.2, -1.0],
        [0, -0.98],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      36,
    );
    const wrap = new THREE.TorusGeometry(0.22, 0.075, 8, 28);
    wrap.rotateX(Math.PI / 2);
    wrap.translate(0, -1.08, 0);
    return { head, skirt, wrap };
  }, []);
  useGeometryCleanup(geo.head);
  useGeometryCleanup(geo.skirt);
  useGeometryCleanup(geo.wrap);
  const maps = useMemo(() => ({ threads: threadTexture(10), twist: twistTexture(6) }), []);
  useTextureCleanup(maps.threads);
  useTextureCleanup(maps.twist);
  return (
    <group>
      <mesh geometry={geo.head}>
        <meshPhysicalMaterial color={color} map={maps.twist} roughness={0.6} sheen={1} sheenRoughness={0.5} sheenColor="#ffffff" />
      </mesh>
      <mesh geometry={geo.wrap}>
        <meshPhysicalMaterial color={color} map={maps.twist} roughness={0.55} sheen={1} sheenRoughness={0.5} sheenColor="#ffffff" />
      </mesh>
      <mesh geometry={geo.skirt}>
        <meshPhysicalMaterial color={color} map={maps.threads} roughness={0.6} sheen={1} sheenRoughness={0.45} sheenColor="#ffffff" />
      </mesh>
    </group>
  );
}

const BOOK_CM = 0.1;

/**
 * Marcador de livro (com ou sem verniz localizado — o PrintMaterial cuida do brilho) encostado na
 * capa de um livro neutro em pé: cartão com furo, cordão em nó de cotovia e pingente de franja
 * apoiado na capa. Na versão deitada (18×5), o pingente descansa no chão.
 */
export function BookmarkModel({ spec, art, label, showDims }: ModelProps) {
  const w = Math.max(1, spec.widthCm);
  const h = Math.max(1, spec.heightCm);
  const d = 0.035;
  const portrait = h >= w;

  // Livro: capa dura em tecido, lombada arredondada, miolo creme.
  const bookW = 15.4;
  const bookH = 23;
  const bookGap = 2.4;
  const board = 0.28;
  const book = useCaseGeometry(bookW, bookH, bookGap, board, 0.3);
  const frontZ = bookGap / 2 + board;

  const cardShape = useMemo(() => {
    const shape = makeShape("rect", w, h, 0.35);
    if (portrait) addHole(shape, 0, h / 2 - 0.9, 0.25);
    else addHole(shape, -w / 2 + 0.9, 0, 0.25);
    return shape;
  }, [w, h, portrait]);
  const front = useArtTexture(w / h, "front", art, label);
  const backKind = backKindOf(spec, art);
  const backTex = useBackTexture(w / h, spec, art, label);
  const back = backKind === "blank" ? null : backTex;

  // Encostado na capa: base no chão, topo tocando a capa.
  const lean = portrait ? 0.1 : 0.22;
  const sin = Math.sin(lean);
  const cos = Math.cos(lean);
  const xc = portrait ? bookW * 0.5 - 1.2 : bookW * 0.5;
  const yc = -bookH / 2 + (h / 2) * cos + (d / 2) * sin;
  // Folga no topo = espessura do cordão que passa entre o marcador e a capa.
  const zc = frontZ + (h / 2) * sin + d / 2 + 0.09;
  const toBook = (p: Vec3): Vec3 => [p[0] + xc, p[1] * cos + p[2] * sin + yc, -p[1] * sin + p[2] * cos + zc];

  // Cordão: nó de cotovia pelo furo, nó à frente do topo e fio até o pingente.
  const hole: [number, number] = portrait ? [0, h / 2 - 0.9] : [-w / 2 + 0.9, 0];
  const dir: [number, number] = portrait ? [0, 1] : [-1, 0];
  const pt = (a: number, b: number, z: number): Vec3 => [hole[0] + dir[0] * a + dir[1] * b, hole[1] + dir[1] * a - dir[0] * b, z];
  const knotLocal = pt(1.9, 0.35, 0.35);
  const strands: Vec3[][] = [
    [pt(0.05, 0.05, d / 2 + 0.06), pt(0.9, 0.15, d / 2 + 0.07), pt(1.6, 0.3, 0.25), knotLocal],
    [pt(0.05, -0.05, -d / 2 - 0.035), pt(0.9, -0.1, -d / 2 - 0.035), pt(1.6, 0.25, 0.2), knotLocal],
  ];
  const knot = toBook(knotLocal);
  const tasselTop: Vec3 = portrait ? [xc + w / 2 + 1.7, knot[1] - 4.2, frontZ + 0.5] : [knot[0] - 1.2, -bookH / 2 + 0.47, zc + 2.2];
  const hang: Vec3[] = portrait
    ? // Passa por cima da borda do marcador e depois deita encostado na capa até o pingente.
      [knot, [knot[0] + 0.7, knot[1] + 0.4, knot[2] + 0.05], [xc + w / 2 + 0.5, (knot[1] + tasselTop[1]) / 2 + 1.2, frontZ + 0.2], [tasselTop[0] - 0.4, (knot[1] + tasselTop[1]) / 2 + 0.2, frontZ + 0.07], [tasselTop[0], tasselTop[1] + 0.5, frontZ + 0.3], tasselTop]
    : [knot, [knot[0] - 0.5, knot[1] - 0.8, knot[2] + 0.4], [tasselTop[0] + 0.4, tasselTop[1] + 0.5, tasselTop[2] - 0.6], tasselTop];
  const card = useCardGeometry(cardShape, w, h, d);
  const strandA = useCord(strands[0], 0.05);
  const strandB = useCord(strands[1], 0.05);
  const hangCord = useCord(hang, 0.05);
  const knotGeometry = useMemo(() => new THREE.SphereGeometry(0.15, 14, 10), []);
  useGeometryCleanup(knotGeometry);
  const tasselColor = spec.accentColor ?? "#b8923f";
  const [lw, lh] = sizeLabels(spec);
  const cloth = "#3b4852";

  return (
    <group rotation-y={-0.3}>
      <group scale={BOOK_CM}>
        {/* Livro */}
        <group>
          <mesh geometry={book.spine}>
            <meshPhysicalMaterial color={cloth} roughness={0.92} sheen={0.6} sheenRoughness={0.8} sheenColor="#ffffff" />
          </mesh>
          {[bookGap / 2, -bookGap / 2 - board].map((z) => (
            <mesh key={z} geometry={book.panel} position-z={z}>
              <meshPhysicalMaterial color={cloth} roughness={0.92} sheen={0.6} sheenRoughness={0.8} sheenColor="#ffffff" />
            </mesh>
          ))}
          {/* Miolo entra um pouco na lombada para não deixar vão visível por cima. */}
          <PageBlock sx={bookW - 0.23} sy={bookH - 0.7} sz={bookGap - 0.02} position={[(bookW - 0.83) / 2, 0, 0]} />
          {/* Filetes dourados na capa */}
          {[bookH / 2 - 2.2, bookH / 2 - 2.6].map((y) => (
            <mesh key={y} position={[bookW / 2, y, frontZ + 0.006]}>
              <planeGeometry args={[bookW * 0.6, 0.08]} />
              <meshStandardMaterial color="#d8b56a" metalness={1} roughness={0.3} />
            </mesh>
          ))}
        </group>
        {/* Marcador */}
        <group position={[xc, yc, zc]} rotation-x={-lean}>
          <CutCard geometry={card} spec={spec} front={front} back={back} edgeColor="#f4f3ef" />
          <Cord cord={strandA} color={tasselColor} />
          <Cord cord={strandB} color={tasselColor} />
          <mesh geometry={knotGeometry} position={knotLocal}>
            <meshStandardMaterial color={tasselColor} roughness={0.8} />
          </mesh>
        </group>
        <Cord cord={hangCord} color={tasselColor} />
        <group position={tasselTop} rotation-z={portrait ? 0 : -Math.PI / 2}>
          <Tassel color={tasselColor} />
        </group>
      </group>
      {showDims && KIND_INFO[spec.kind].dims && (
        <group position={[xc * BOOK_CM, yc * BOOK_CM, zc * BOOK_CM]} rotation-x={-lean}>
          <Dimensions w={w * BOOK_CM} h={h * BOOK_CM} z={(d / 2 + 0.1) * BOOK_CM} labelW={lw} labelH={lh} />
        </group>
      )}
    </group>
  );
}
