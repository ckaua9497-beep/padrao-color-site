"use client";

// Papelaria: pacote de papel, calendário de parede, porta-passaporte, tag e marcador de livro.
// Cada modelo trabalha em centímetros dentro de um grupo escalado (constante CM do modelo); as cotas
// ficam fora desse grupo, em unidades de cena, porque Dimensions já usa medidas fixas de cena.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import { KIND_INFO } from "@/lib/mockup-kinds";
import { canvasFor, fontFamily } from "../art";
import { JewelryCard } from "./jewelry";
import {
  Dimensions,
  PrintMaterial,
  faceGeometry,
  makeShape,
  sizeLabels,
  useArtTexture,
  useGeometryCleanup,
  type MaskPath,
  type ModelProps,
  useBackTexture,
  useFaceTexture,
  backKindOf,
} from "./shared";
import { useSceneMode } from "../viewer-hooks";

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

const CAL_YEAR = 2027;
const CAL_MONTHS = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
/** Feriados nacionais de 2027 (e o carnaval) por mês, em vermelho como os domingos. */
const CAL_HOLIDAYS: number[][] = [[1], [8, 9], [26], [21], [1, 27], [], [], [], [7], [12], [2, 15, 20], [25]];

/** Dia da semana (0 = domingo), algoritmo de Sakamoto. */
function weekday(year: number, month: number, day: number) {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const y = month < 3 ? year - 1 : year;
  return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[month - 1] + day) % 7;
}

function daysIn(year: number, month: number) {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Os 12 meses do ano em cartões brancos (faixa escura com o nome do mês, iniciais da semana, dias; domingos e
 * feriados em vermelho): a parte de baixo do calendário quando o cliente ainda não mandou a arte pronta. Com
 * `background`, os cartões ficam sobre a cor de fundo da arte; com null, sobre a própria imagem (canvas transparente).
 */
function yearGridTexture(aspect: number, background: string | null) {
  const canvas = canvasFor(aspect, 2048);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const W = canvas.width;
    const H = canvas.height;
    const font = fontFamily();
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.clearRect(0, 0, W, H);
    }
    const cols = 3;
    const rows = 4;
    const pad = W * 0.05;
    const gap = W * 0.03;
    const cellW = (W - pad * 2 - gap * (cols - 1)) / cols;
    const cellH = (H - pad * 1.6 - gap * (rows - 1)) / rows;
    for (let m = 0; m < 12; m += 1) {
      const x = pad + (m % cols) * (cellW + gap);
      const y = pad * 0.6 + Math.floor(m / cols) * (cellH + gap);
      const r = cellW * 0.06;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.28)";
      ctx.shadowBlur = cellW * 0.05;
      ctx.shadowOffsetY = cellW * 0.015;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(x, y, cellW, cellH, r);
      ctx.fill();
      ctx.restore();
      const barH = cellH * 0.16;
      ctx.fillStyle = "#141414";
      ctx.beginPath();
      ctx.roundRect(x, y, cellW, barH, [r, r, 0, 0]);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 ${barH * 0.58}px ${font}`;
      ctx.fillText(CAL_MONTHS[m], x + cellW / 2, y + barH * 0.54, cellW * 0.9);

      const inner = cellW * 0.06;
      const cw = (cellW - inner * 2) / 7;
      const weekY = y + barH + cellH * 0.08;
      ctx.font = `800 ${cw * 0.5}px ${font}`;
      WEEKDAYS.forEach((d, i) => {
        ctx.fillStyle = i === 0 ? CORAL : "#1d1d1d";
        ctx.fillText(d, x + inner + cw * (i + 0.5), weekY);
      });
      const top = weekY + cellH * 0.06;
      const rowH = (y + cellH - inner * 0.8 - top) / 6;
      const first = weekday(CAL_YEAR, m + 1, 1);
      const holidays = CAL_HOLIDAYS[m];
      ctx.font = `700 ${Math.min(cw * 0.46, rowH * 0.72)}px ${font}`;
      for (let day = 1; day <= daysIn(CAL_YEAR, m + 1); day += 1) {
        const k = first + day - 1;
        const col = k % 7;
        ctx.fillStyle = col === 0 || holidays.includes(day) ? CORAL : "#1d1d1d";
        ctx.fillText(String(day), x + inner + cw * (col + 0.5), top + rowH * (Math.floor(k / 7) + 0.5));
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

const CAL_CM = 0.08;
/** Furo de pendurar do gabarito: 5 mm, centrado, a 10,5 mm do topo. */
const CAL_HOLE_R = 0.25;
const CAL_HOLE_TOP = 1.05;
/** Faixa de cima com a arte quando o calendário ainda não veio pronto (o resto mostra os 12 meses). */
const CAL_HEAD = 0.27;

/**
 * Como a arte entra no calendário: "ready" = arquivo feito no gabarito (o calendário pronto, folha inteira);
 * "backdrop" = foto ou fundo cobrindo a folha, com os 12 meses por cima; "header" = texto, modelo ou logo na faixa
 * de cima, com os meses embaixo sobre a cor de fundo.
 */
function calendarLayout(art: ModelProps["art"]): "ready" | "backdrop" | "header" {
  if (!art.src) return "header";
  const fit = art.templateFit?.src === art.src ? art.templateFit : null;
  if (fit && fit.match !== "other") return "ready";
  return fit?.mode === "whole" ? "header" : "backdrop";
}

/**
 * Calendário de parede: folha única de couchê 250 g, impressa inteira, com o furo do gabarito no topo,
 * pendurada num prego. O arquivo pronto no gabarito cobre a folha toda; uma foto vira o fundo dos 12 meses do
 * ano, e texto, modelo ou logo ficam na faixa de cima, com os meses embaixo, como na foto do produto.
 */
export function WallCalendarModel({ spec, art, label, showDims }: ModelProps) {
  const w = Math.max(8, spec.widthCm);
  const h = Math.max(10, spec.heightCm);
  // Couchê 250 g (~0,3 mm), um pouco exagerado para a borda aparecer de lado.
  const d = 0.04;
  const layout = calendarLayout(art);
  const headH = h * CAL_HEAD;
  const holeY = h / 2 - CAL_HOLE_TOP;
  const areaH = layout === "header" ? headH : h;
  // O furo sai recortado na própria arte (alpha): uma face com furo triangulada deixa uma fissura no "ponto" do furo.
  const holeMask = useMemo<MaskPath>(
    () => (ctx, cw, ch) => {
      const r = (CAL_HOLE_R / w) * cw;
      const cy = (CAL_HOLE_TOP / areaH) * ch;
      ctx.beginPath();
      ctx.rect(0, 0, cw, ch);
      ctx.moveTo(cw / 2 + r, cy);
      ctx.arc(cw / 2, cy, r, 0, Math.PI * 2, true);
    },
    [w, areaH],
  );
  const front = useArtTexture(w / areaH, "front", art, label, holeMask);
  const gridBackground = layout === "header" ? art.background : null;
  const grid = useMemo(() => yearGridTexture(w / (h - headH), gridBackground), [w, h, headH, gridBackground]);
  useTextureCleanup(grid);

  const geo = useMemo(() => {
    const sheet = makeShape("rect", w, h, 0.06);
    addHole(sheet, 0, holeY, CAL_HOLE_R);
    const edge = new THREE.ExtrudeGeometry(sheet, { depth: d, bevelEnabled: false, curveSegments: 24 });
    edge.translate(0, 0, -d / 2);
    // Faces impressas sem o furo (ele vem recortado na arte); o verso liso pode ter o furo na malha.
    const face = faceGeometry(makeShape("rect", w, h, 0.06), w, h);
    // Faixa de cima em UV próprio, para a arte não esticar sobre a grade dos meses.
    const head = faceGeometry(makeShape("rect", w, headH, 0.0005), w, headH);
    head.translate(0, h / 2 - headH / 2, 0);
    return { edge, face, back: mirroredFace(faceGeometry(sheet, w, h)), head };
  }, [w, h, d, headH, holeY]);
  useGeometryCleanup(geo.edge);
  useGeometryCleanup(geo.face);
  useGeometryCleanup(geo.back);
  useGeometryCleanup(geo.head);

  // Afastamento das faces impressas da chapa: com menos, a emenda da triangulação do furo na tampa aparece por cima.
  const lift = 0.02;
  // O prego encosta no alto do furo: a folha fica pendurada nele.
  const nailR = 0.09;
  const nailY = holeY + CAL_HOLE_R - nailR;
  const [lw, lh] = sizeLabels(spec);

  return (
    <group>
      <group scale={CAL_CM}>
        <mesh geometry={geo.edge}>
          <meshStandardMaterial color="#f3f2ee" roughness={0.9} />
        </mesh>
        <mesh geometry={layout === "header" ? geo.head : geo.face} position-z={d / 2 + lift}>
          <PrintMaterial map={front} spec={spec} transparent />
        </mesh>
        {layout !== "ready" && (
          <mesh position={[0, -headH / 2, d / 2 + lift * 2]}>
            <planeGeometry args={[w, h - headH]} />
            <PrintMaterial map={grid} spec={spec} transparent={layout === "backdrop"} />
          </mesh>
        )}
        <mesh geometry={geo.back} position-z={-d / 2 - lift}>
          <meshStandardMaterial color="#f7f6f2" roughness={0.88} />
        </mesh>
        {/* Prego: cabeça à frente da folha, haste atravessando o furo até a parede. */}
        <group position={[0, nailY, 0]}>
          <mesh position-z={-0.62} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[nailR, nailR, 1.6, 16]} />
            <meshStandardMaterial color="#9da1a6" metalness={1} roughness={0.35} />
          </mesh>
          <mesh position-z={d / 2 + 0.14} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.3, 0.28, 0.07, 28]} />
            <meshStandardMaterial color="#a7abb0" metalness={1} roughness={0.3} />
          </mesh>
        </group>
      </group>
      {showDims && KIND_INFO[spec.kind].dims && <Dimensions w={w * CAL_CM} h={h * CAL_CM} z={(d / 2 + 0.3) * CAL_CM} labelW={lw} labelH={lh} />}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Porta-passaporte                                                    */
/* ------------------------------------------------------------------ */

/** Trama do Print Wall (papel com textura de tela, impressão UV): relevo fino em bumpMap, em cm de repetição. */
function printWallTexture(repeat: [number, number]) {
  return paintTexture(
    64,
    64,
    (ctx, w, h) => {
      const rand = seeded(41);
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 4) {
        for (let x = 0; x < w; x += 4) {
          const over = ((x >> 2) + (y >> 2)) % 2 === 0;
          const v = Math.round((over ? 150 : 105) + rand() * 30);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(x + (over ? 0 : 1), y + (over ? 1 : 0), over ? 4 : 2, over ? 2 : 4);
        }
      }
    },
    repeat,
  );
}

/** Porta-passaporte no gabarito: capa de 20,6 × 16 cm aberta (10,3 cm por lado) com abas de 7 cm dobradas para dentro. */
const PASSPORT = { panel: 10.3, flap: 7, gap: 0.5, t: 0.06, radius: 0.45 };
const PASS_CM = 0.16;

/**
 * Porta-passaporte em Print Wall (impressão UV), como na foto do produto: a capa fechada deitada, com a arte da frente
 * e da contracapa (verso) sangrando até a borda e o caderno do passaporte por dentro. Com uma aba em edição, a capa abre
 * deitada mostrando o lado de dentro: a aba direita (dobrada sobre a capa da frente) à esquerda e a esquerda à direita,
 * cada uma com a sua arte. No verso ("Ver verso"), a capa fechada vira e mostra a contracapa.
 */
export function PassportModel({ spec, art, label }: ModelProps) {
  const W = PASSPORT.panel;
  const H = Math.max(8, spec.heightCm);
  const { t, gap, radius } = PASSPORT;
  const shell = useCaseGeometry(W, H, gap, t, radius);
  const aspect = shell.faceW / shell.faceH;
  const front = useArtTexture(aspect, "front", art, label);
  const back = useBackTexture(aspect, spec, art, label, undefined, "blank");
  const { face, back: showBack } = useSceneMode();
  const open = face === "aba-esquerda" || face === "aba-direita";
  // A face impressa tem UV de 0 a 1; o corpo da capa, UV em cm.
  const bump = useMemo(() => printWallTexture([W / 0.6, H / 0.6]), [W, H]);
  const bodyBump = useMemo(() => printWallTexture([1 / 0.6, 1 / 0.6]), []);
  useTextureCleanup(bump);
  useTextureCleanup(bodyBump);
  const bookletW = Math.min(8.8, W - 0.6);
  const bookletH = Math.min(12.5, H - 1.4);
  const front0 = gap / 2 + t;
  const print = (map: THREE.Texture) => <meshPhysicalMaterial map={map} roughness={0.78} clearcoat={0.15} clearcoatRoughness={0.6} bumpMap={bump} bumpScale={0.35} />;
  const plain = <meshStandardMaterial color="#f1efe9" roughness={0.9} bumpMap={bodyBump} bumpScale={0.3} />;

  if (open) return <PassportOpen art={art} label={label} W={W} H={H} bump={bodyBump} />;

  return (
    <group rotation={[-Math.PI / 2, 0, 0.32]} userData={{ view: { elevation: 0.85 } }}>
      {/* Verso: a capa fechada vira (meia volta em x; com o giro do TurnGroup fica no lugar, contracapa para cima). */}
      <group rotation-x={showBack ? Math.PI : 0}>
        <group scale={PASS_CM} position-x={(-(W - front0) / 2) * PASS_CM}>
          <mesh geometry={shell.spine}>{plain}</mesh>
          <mesh geometry={shell.panel} position-z={gap / 2}>
            {plain}
          </mesh>
          <mesh geometry={shell.panel} position-z={-gap / 2 - t}>
            {plain}
          </mesh>
          <mesh geometry={shell.face} position-z={front0 + 0.004}>
            {print(front)}
          </mesh>
          <mesh geometry={shell.faceBack} position-z={-front0 - 0.004}>
            {print(back)}
          </mesh>
          {/* Caderno do passaporte por dentro, encaixado nas abas. */}
          <PageBlock sx={bookletW - 0.1} sy={bookletH - 0.2} sz={gap - 0.14} position={[0.15 + bookletW / 2, 0, 0]} />
          {[1, -1].map((side) => (
            <mesh key={side} position={[0.15 + bookletW / 2, 0, side * (gap / 2 - 0.05)]}>
              <boxGeometry args={[bookletW, bookletH, 0.04]} />
              <meshStandardMaterial color="#1d2a4f" roughness={0.7} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

/** Capa aberta deitada, lado de dentro para cima: as abas dobradas sobre as capas, com a arte de cada uma. */
function PassportOpen({ art, label, W, H, bump }: { art: ModelProps["art"]; label: string; W: number; H: number; bump: THREE.Texture }) {
  // `bump` repete por cm (UV do corpo); a face da aba tem UV de 0 a 1.
  const flapBump = useMemo(() => printWallTexture([PASSPORT.flap / 0.6, H / 0.6]), [H]);
  useTextureCleanup(flapBump);
  const { flap, t, gap, radius } = PASSPORT;
  const right = useFaceTexture(flap / H, art, "aba-direita", label, "blank");
  const left = useFaceTexture(flap / H, art, "aba-esquerda", label, "blank");
  const geo = useMemo(() => {
    const total = 2 * W + gap;
    const sheet = makeShape("rect", total, H, radius);
    const body = new THREE.ExtrudeGeometry(sheet, { depth: t, bevelEnabled: false, curveSegments: 12 });
    body.translate(0, 0, -t);
    const flapShape = makeShape("rect", flap, H, 0.2);
    const flapBody = new THREE.ExtrudeGeometry(flapShape, { depth: t, bevelEnabled: false, curveSegments: 12 });
    return { body, flapBody, flapFace: faceGeometry(flapShape, flap, H) };
  }, [W, H, gap, t, radius, flap]);
  useGeometryCleanup(geo.body);
  useGeometryCleanup(geo.flapBody);
  useGeometryCleanup(geo.flapFace);
  const edgeX = W + gap / 2;
  const plain = <meshStandardMaterial color="#f1efe9" roughness={0.9} bumpMap={bump} bumpScale={0.3} />;
  return (
    <group rotation={[-Math.PI / 2, 0, 0.18]} userData={{ view: { elevation: 0.95 } }}>
      <group scale={PASS_CM}>
        <mesh geometry={geo.body}>{plain}</mesh>
        {/* Vinco da lombada. */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[(s * gap) / 2, 0, 0.003]}>
            <planeGeometry args={[0.05, H - 0.2]} />
            <meshStandardMaterial color="#000000" transparent opacity={0.12} depthWrite={false} />
          </mesh>
        ))}
        {/* À esquerda, a capa da frente com a aba direita; à direita, a contracapa com a aba esquerda. */}
        {[
          { x: -edgeX + flap / 2, map: right },
          { x: edgeX - flap / 2, map: left },
        ].map(({ x, map }) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh geometry={geo.flapBody}>{plain}</mesh>
            <mesh geometry={geo.flapFace} position-z={t + 0.004}>
              <meshPhysicalMaterial map={map} roughness={0.78} clearcoat={0.15} clearcoatRoughness={0.6} bumpMap={flapBump} bumpScale={0.35} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Tag                                                                 */
/* ------------------------------------------------------------------ */


/**
 * Contorno da tag com o furo de 4 mm nas posições do gabarito: redonda com o furo no topo, oval com o furo
 * à esquerda e retangular (cantos vivos) com o furo no canto de cima à esquerda, todos a 7 mm da borda.
 */
function tagShape(kind: MockupSpec["shape"], w: number, h: number): THREE.Shape {
  const holeR = 0.2;
  const inset = 0.7;
  if (kind === "heart") {
    const shape = makeShape("heart", w, h, 0);
    addHole(shape, 0, h * 0.12, holeR);
    return shape;
  }
  if (kind === "round") {
    const shape = makeShape("round", w, h, 0);
    if (w >= h * 1.15) addHole(shape, -w / 2 + inset, 0, holeR);
    else addHole(shape, 0, h / 2 - inset, holeR);
    return shape;
  }
  const shape = makeShape("rect", w, h, 0.04);
  addHole(shape, -w / 2 + inset, h / 2 - inset, holeR);
  return shape;
}

const TAG_CM = 0.16;

/**
 * Tags de couchê 250 g, vendidas sem cordão: três peças sobrepostas em leque (a da frente com a arte, uma
 * virada mostrando o verso), com o furo vazado do gabarito, como nas fotos do produto.
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
  const shape = useMemo(() => tagShape(spec.shape, w, h), [spec.shape, w, h]);
  const front = useArtTexture(w / h, "front", art, label);
  const backKind = backKindOf(spec, art);
  const backTex = useBackTexture(w / h, spec, art, label);
  const back = backKind === "blank" ? null : backTex;
  const card = useCardGeometry(shape, w, h, d);
  const [lw, lh] = sizeLabels(spec);
  const piece: CardProps = { geometry: card, spec, front, back, edgeColor: "#f1eee7" };
  const heroTilt = -0.04;

  return (
    <group>
      <group scale={TAG_CM}>
        {/* Terceira tag, atrás à esquerda */}
        <group position={[-w * 0.2, h * 0.58, -2.6]} rotation-z={0.16}>
          <CutCard {...piece} />
        </group>
        {/* Tag virada mostrando o verso: gira para que a ponta do furo venha para a frente fora da
            tag principal (girar para o outro lado faria a ponta atravessar a arte da frente). */}
        <group position={[w * 0.42, h * 0.45, -1.5]} rotation-z={0.1}>
          <group rotation-y={Math.PI - 0.36}>
            <CutCard {...piece} />
          </group>
        </group>
        {/* Tag principal com a arte */}
        <group rotation-z={heroTilt}>
          <CutCard {...piece} />
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

const BOOK_CM = 0.1;

/**
 * Marcador de livro (com ou sem verniz localizado — o PrintMaterial cuida do brilho) encostado na capa de um
 * livro neutro em pé: cartão liso no corte reto do gabarito, sem furo nem cordão, como na foto do produto.
 * Na versão deitada (18×5), ele se apoia mais inclinado.
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

  const cardShape = useMemo(() => makeShape("rect", w, h, 0.08), [w, h]);
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
  const zc = frontZ + (h / 2) * sin + d / 2;
  const card = useCardGeometry(cardShape, w, h, d);
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
