"use client";

// Adesivos, rótulos e folhas DTF: vinil recortado com borda branca descolando do liner, cartela meio-corte,
// filme DTF, adesivos em vidro (eletrostático, retroverso, microperfurado), rótulo em pote/garrafa,
// vinil automotivo sobre lataria e rolo de vinil sem impressão.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import { KIND_INFO, artAspect } from "@/lib/mockup-kinds";
import { heartPath, roundPath } from "../art";
import { useApparelArt } from "./fabric";
import {
  Dimensions,
  RoundedBlock,
  Slab,
  bandGeometry,
  fitFlat,
  makeShape,
  roughnessOf,
  sizeLabels,
  useArtTexture,
  useGeometryCleanup,
  type MaskPath,
  type ModelProps,
} from "./shared";
import { lathe, smoothProfile, type Pt } from "./vessel";

/* ------------------------------------------------------------------ máscaras e texturas de apoio */

/** Retângulo de cantos arredondados (adesivo recortado). */
const rectMask: MaskPath = (ctx, w, h) => {
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, Math.min(w, h) * 0.08);
};

/** Quase reto: películas e filmes em metro. */
const squareMask: MaskPath = (ctx, w, h) => {
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, Math.min(w, h) * 0.02);
};

function maskFor(shape: MockupSpec["shape"], rect: MaskPath = rectMask): MaskPath {
  if (shape === "round") return roundPath;
  if (shape === "heart") return heartPath;
  return rect;
}

/** Canvas → textura sRGB, desenhada uma vez. */
function drawTexture(aspect: number, longSide: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const canvas = document.createElement("canvas");
  const safe = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  canvas.width = safe >= 1 ? longSide : Math.max(16, Math.round(longSide * safe));
  canvas.height = safe >= 1 ? Math.max(16, Math.round(longSide / safe)) : longSide;
  const ctx = canvas.getContext("2d");
  if (ctx) paint(ctx, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function useTextureCleanup(texture: THREE.Texture | null) {
  useEffect(() => () => texture?.dispose(), [texture]);
}

/** Silhueta do adesivo (arte + borda de recorte), em branco sobre transparente: vira alpha da borda e do verso. */
function paintSilhouette(ctx: CanvasRenderingContext2D, cw: number, ch: number, inset: number, mask: MaskPath, color = "#ffffff") {
  ctx.clearRect(0, 0, cw, ch);
  ctx.save();
  ctx.translate(inset, inset);
  mask(ctx, cw - inset * 2, ch - inset * 2);
  ctx.fillStyle = color;
  ctx.fill();
  if (inset > 0) {
    ctx.lineJoin = "round";
    ctx.lineWidth = inset * 2;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  ctx.restore();
}

function useSilhouette(mask: MaskPath, w: number, h: number, border: number) {
  const texture = useMemo(() => {
    const total = w + border * 2;
    return drawTexture(total / (h + border * 2), 512, (ctx, cw, ch) => paintSilhouette(ctx, cw, ch, (border * cw) / total, mask));
  }, [mask, w, h, border]);
  useTextureCleanup(texture);
  return texture;
}

const LINER = "#f7f5f0";
const CUT_LINER = "#dde2e8";

type LinerPlan = { W: number; H: number; cols: number; rows: number; pitchX: number; pitchY: number; w: number; h: number; b: number; mask: MaskPath; mark: number };

/** Liner siliconado com o traço do meio-corte de cada adesivo e marcas de registro da plotter. */
function paintLiner(ctx: CanvasRenderingContext2D, cw: number, ch: number, p: LinerPlan) {
  const s = cw / p.W;
  ctx.fillStyle = LINER;
  ctx.fillRect(0, 0, cw, ch);
  for (let r = 0; r < p.rows; r += 1) {
    for (let c = 0; c < p.cols; c += 1) {
      const cx = (c - (p.cols - 1) / 2) * p.pitchX;
      const cy = ((p.rows - 1) / 2 - r) * p.pitchY;
      ctx.save();
      ctx.translate((cx - p.w / 2 + p.W / 2) * s, (p.H / 2 - cy - p.h / 2) * s);
      p.mask(ctx, p.w * s, p.h * s);
      ctx.lineJoin = "round";
      ctx.lineWidth = p.b * s * 2 + 3;
      ctx.strokeStyle = "#cbc5b9";
      ctx.stroke();
      if (p.b > 0) {
        ctx.lineWidth = p.b * s * 2;
        ctx.strokeStyle = LINER;
        ctx.stroke();
      }
      ctx.fillStyle = LINER;
      ctx.fill();
      ctx.restore();
    }
  }
  if (p.mark > 0) {
    const m = p.mark * s;
    ctx.fillStyle = "#151515";
    ctx.fillRect(m * 0.6, m * 0.6, m, m);
    ctx.fillRect(cw - m * 1.6, m * 0.6, m, m);
    ctx.fillRect(m * 0.6, ch - m * 1.6, m, m);
  }
}

function useLiner(W: number, H: number, cols: number, rows: number, pitchX: number, pitchY: number, w: number, h: number, b: number, mask: MaskPath, mark: number) {
  const texture = useMemo(
    () => drawTexture(W / H, 1024, (ctx, cw, ch) => paintLiner(ctx, cw, ch, { W, H, cols, rows, pitchX, pitchY, w, h, b, mask, mark })),
    [W, H, cols, rows, pitchX, pitchY, w, h, b, mask, mark],
  );
  useTextureCleanup(texture);
  return texture;
}

/** Spec do liner: papel siliconado com leve brilho, sempre retangular. */
function useLinerSpec(spec: MockupSpec) {
  return useMemo<MockupSpec>(() => ({ ...spec, shape: "rect", finish: "gloss", clearcoat: 0.25, spotVarnish: false }), [spec]);
}

/** Gerador determinístico (mulberry32): textura de grão igual em todo render. */
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

/* ------------------------------------------------------------------ superfícies deformadas */

type SurfaceFn = (x: number, y: number, out: THREE.Vector3) => void;

/** Descolamento: além da linha `start` (medida ao longo de dx,dy) a folha enrola num cilindro de raio `radius` até `angle` e segue reta. */
type Curl = { dx: number; dy: number; start: number; radius: number; angle: number };

function curlPoint(x: number, y: number, c: Curl, out: THREE.Vector3) {
  const s = x * c.dx + y * c.dy - c.start;
  if (s <= 0) return out.set(x, y, 0);
  const arc = c.radius * c.angle;
  let u: number;
  let z: number;
  if (s <= arc) {
    const th = s / c.radius;
    u = c.radius * Math.sin(th);
    z = c.radius * (1 - Math.cos(th));
  } else {
    const rest = s - arc;
    u = c.radius * Math.sin(c.angle) + rest * Math.cos(c.angle);
    z = c.radius * (1 - Math.cos(c.angle)) + rest * Math.sin(c.angle);
  }
  return out.set(x - s * c.dx + u * c.dx, y - s * c.dy + u * c.dy, z);
}

/** Alcance do contorno na direção (dx, dy), para o descolamento começar a uma distância fixa da borda. */
function reach(shape: MockupSpec["shape"], sw: number, sh: number, dx: number, dy: number) {
  if (shape === "rect") return (sw / 2) * Math.abs(dx) + (sh / 2) * Math.abs(dy);
  return Math.hypot((sw / 2) * dx, (sh / 2) * dy) * (shape === "heart" ? 0.95 : 1);
}

/** Canto descolando na diagonal (sx, sy = sinais do canto). */
function cornerCurl(shape: MockupSpec["shape"], sw: number, sh: number, peel: number, radius: number, angle: number, sx = 1, sy = 1): Curl {
  const len = Math.hypot(sw, sh) || 1;
  const dx = (sx * sw) / len;
  const dy = (sy * sh) / len;
  return { dx, dy, start: reach(shape, sw, sh, dx, dy) - peel, radius: Math.max(radius, 1e-3), angle };
}

const tmp = new THREE.Vector3();

/** Grade w×h (UV 0–1, arte em pé) passada pela deformação e afastada `lift` ao longo da normal. */
function surfacePlane(w: number, h: number, sx: number, sy: number, fn: SurfaceFn | null, lift = 0) {
  const geometry = new THREE.PlaneGeometry(w, h, Math.max(1, Math.round(sx)), Math.max(1, Math.round(sy)));
  const pos = geometry.attributes.position;
  if (fn) {
    for (let i = 0; i < pos.count; i += 1) {
      fn(pos.getX(i), pos.getY(i), tmp);
      pos.setXYZ(i, tmp.x, tmp.y, tmp.z);
    }
    geometry.computeVertexNormals();
  }
  if (lift) {
    const normal = geometry.attributes.normal;
    for (let i = 0; i < pos.count; i += 1) {
      pos.setXYZ(i, pos.getX(i) + normal.getX(i) * lift, pos.getY(i) + normal.getY(i) * lift, pos.getZ(i) + normal.getZ(i) * lift);
    }
  }
  pos.needsUpdate = true;
  geometry.computeBoundingSphere();
  return geometry;
}

type Layers = { border: THREE.BufferGeometry; art: THREE.BufferGeometry };

/** Borda (silhueta) e arte do adesivo sobre a mesma superfície; a arte fica 1 décimo de mm acima. */
function useLayers(w: number, h: number, border: number, fn: SurfaceFn | null, segments = 64) {
  const layers = useMemo<Layers>(() => {
    const sx = fn ? segments : 1;
    const sy = fn ? Math.min(segments * 2, Math.max(8, Math.round((segments * h) / Math.max(w, 1e-3)))) : 1;
    return {
      border: surfacePlane(w + border * 2, h + border * 2, sx, sy, fn, 0),
      art: surfacePlane(w, h, sx, sy, fn, Math.max(0.0015, Math.min(w, h) * 0.0012)),
    };
  }, [w, h, border, fn, segments]);
  useGeometryCleanup(layers.border);
  useGeometryCleanup(layers.art);
  return layers;
}

/** Vinil: borda branca brilhante, verso com adesivo fosco (aparece no canto que descola) e a arte por cima.
 * Com `brush` o filme é vinil escovado prata: borda metálica e arte com brilho de metal riscado. */
function StickerLayers({
  geometry,
  art,
  silhouette,
  matte,
  film = "#fbfbf9",
  backing = "#e6e5df",
  brush = null,
}: {
  geometry: Layers;
  art: THREE.Texture;
  silhouette: THREE.Texture;
  matte: boolean;
  film?: string;
  backing?: string;
  brush?: THREE.Texture | null;
}) {
  const roughness = matte ? 0.55 : 0.24;
  const clearcoat = matte ? 0.1 : 1;
  return (
    <group>
      <mesh geometry={geometry.border}>
        {brush ? (
          <meshPhysicalMaterial color="#c9ced4" map={silhouette} alphaTest={0.5} metalness={1} roughness={0.42} roughnessMap={brush} clearcoat={matte ? 0 : 0.6} clearcoatRoughness={0.08} />
        ) : (
          <meshPhysicalMaterial color={film} map={silhouette} alphaTest={0.5} roughness={roughness} clearcoat={clearcoat} clearcoatRoughness={0.05} />
        )}
      </mesh>
      <mesh geometry={geometry.border}>
        <meshStandardMaterial color={backing} map={silhouette} alphaTest={0.5} roughness={0.85} side={THREE.BackSide} />
      </mesh>
      <mesh geometry={geometry.art}>
        {brush ? (
          <meshPhysicalMaterial map={art} alphaTest={0.5} metalness={0.4} roughness={0.4} roughnessMap={brush} clearcoat={matte ? 0 : 0.6} clearcoatRoughness={0.06} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        ) : (
          <meshPhysicalMaterial map={art} alphaTest={0.5} roughness={roughness} clearcoat={clearcoat} clearcoatRoughness={0.04} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        )}
      </mesh>
    </group>
  );
}

type VinylLook = "standard" | "brushed" | "blackout";

/** Vinil Escovado e Blackout não têm subtipo próprio em mockup.ts: o nome do produto decide o filme. */
function vinylLook(label: string): VinylLook {
  const name = label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/\bescovad/.test(name)) return "brushed";
  if (/\bblackout\b/.test(name)) return "blackout";
  return "standard";
}

/** Riscos horizontais do vinil escovado (mapa de rugosidade: cada linha com um tom). */
function brushTexture() {
  const random = seeded(23);
  return drawTexture(1 / 8, 512, (ctx, w, h) => {
    for (let y = 0; y < h; y += 1) {
      const v = Math.round(150 + random() * 105);
      ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
      ctx.fillRect(0, y, w, 1);
    }
  });
}

function useBrush(enabled: boolean) {
  const texture = useMemo(() => (enabled ? brushTexture() : null), [enabled]);
  useTextureCleanup(texture);
  return texture;
}

const TABLE_VIEW = { view: { elevation: 0.95 } };
const FLAT = -Math.PI / 2;

function dimsOn(spec: MockupSpec, showDims: boolean) {
  return showDims && KIND_INFO[spec.kind].dims;
}

/* ------------------------------------------------------------------ vinil recortado (padrão) */

/** Adesivo de vinil recortado com borda branca no liner, canto descolando; uma segunda unidade aparece por baixo. */
function DieCutSticker({ spec, art, label, showDims }: ModelProps) {
  const { w, h } = fitFlat(spec, 1.8);
  const b = Math.min(w, h) * 0.05;
  const sw = w + b * 2;
  const sh = h + b * 2;
  const margin = Math.max(sw, sh) * 0.09;
  const lw = sw + margin * 2;
  const lh = sh + margin * 2;
  const d = 0.014;
  const mask = maskFor(spec.shape);
  const texture = useArtTexture(artAspect(spec), "front", art, label, mask);
  const silhouette = useSilhouette(mask, w, h, b);
  const liner = useLiner(lw, lh, 1, 1, 0, 0, w, h, b, mask, 0);
  const linerSpec = useLinerSpec(spec);
  const curl = useMemo<SurfaceFn>(() => {
    const c = cornerCurl(spec.shape, sw, sh, Math.min(sw, sh) * 0.3, Math.min(sw, sh) * 0.07, 1.05);
    return (x, y, out) => curlPoint(x, y, c, out);
  }, [spec.shape, sw, sh]);
  const peeled = useLayers(w, h, b, curl, 80);
  const flat = useLayers(w, h, b, null);
  const matte = spec.finish === "matte";
  const look = vinylLook(label);
  const brush = useBrush(look === "brushed");
  // Blackout: cola preta que bloqueia a luz (aparece no canto que descola).
  const backing = look === "blackout" ? "#151515" : "#e6e5df";
  const [labelW, labelH] = sizeLabels(spec);
  return (
    <group rotation-x={FLAT} userData={TABLE_VIEW}>
      <group rotation-z={0.06}>
        {/* Segunda unidade por baixo: vendido em quantidade. */}
        <group position={[-lw * 0.3, lh * 0.3, 0]} rotation-z={0.5}>
          <Slab w={lw} h={lh} d={d} spec={linerSpec} front={liner} radius={0.05} edgeColor="#efece6" backColor="#e9e3d3" />
          <group position-z={d / 2 + 0.002}>
            <StickerLayers geometry={flat} art={texture} silhouette={silhouette} matte={matte} backing={backing} brush={brush} />
          </group>
        </group>
        <group position-z={d + 0.006} rotation-z={-0.12}>
          <Slab w={lw} h={lh} d={d} spec={linerSpec} front={liner} radius={0.05} edgeColor="#efece6" backColor="#e9e3d3" />
          <group position-z={d / 2 + 0.002}>
            <StickerLayers geometry={peeled} art={texture} silhouette={silhouette} matte={matte} backing={backing} brush={brush} />
          </group>
          {dimsOn(spec, showDims) && <Dimensions w={sw} h={sh} z={d + 0.02} labelW={labelW} labelH={labelH} />}
        </group>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ cartela (adesivo em folha) */

/** Cartela: tamanhos pequenos montam a grade em volta do adesivo; tamanhos grandes (A4) são a própria folha. */
function sheetLayout(spec: MockupSpec) {
  const big = Math.max(spec.widthCm, spec.heightCm) >= 15;
  if (big) {
    const landscape = spec.widthCm > spec.heightCm;
    const cols = landscape ? 3 : 2;
    const rows = landscape ? 2 : 3;
    const margin = 1.2;
    const gap = 0.8;
    const cellW = Math.max(1, (spec.widthCm - margin * 2 - (cols - 1) * gap) / cols);
    const cellH = Math.max(1, (spec.heightCm - margin * 2 - (rows - 1) * gap) / rows);
    return { cols, rows, margin, gap, cellW, cellH, sheetW: spec.widthCm, sheetH: spec.heightCm, big };
  }
  const size = Math.max(spec.widthCm, spec.heightCm);
  const cols = size >= 9 ? 2 : 3;
  const rows = size >= 9 ? 2 : size <= 6 ? 4 : 3;
  const margin = 1;
  const gap = 0.6;
  return {
    cols,
    rows,
    margin,
    gap,
    cellW: spec.widthCm,
    cellH: spec.heightCm,
    sheetW: cols * spec.widthCm + (cols - 1) * gap + margin * 2,
    sheetH: rows * spec.heightCm + (rows - 1) * gap + margin * 2,
    big,
  };
}

/** Folha com grade de adesivos em meio-corte; um deles meio descolado e, nas cartelas maiores, um já usado. */
function StickerSheet({ spec, art, label, showDims }: ModelProps) {
  const layout = sheetLayout(spec);
  const unit = 2.6 / Math.max(layout.sheetW, layout.sheetH);
  const W = layout.sheetW * unit;
  const H = layout.sheetH * unit;
  const cw = layout.cellW * unit;
  const ch = layout.cellH * unit;
  const b = Math.min(cw, ch) * 0.045;
  const w = cw - b * 2;
  const h = ch - b * 2;
  const pitchX = (layout.cellW + layout.gap) * unit;
  const pitchY = (layout.cellH + layout.gap) * unit;
  const d = 0.012;
  const mask = maskFor(spec.shape);
  const texture = useArtTexture(w / h, "front", art, label, mask);
  const silhouette = useSilhouette(mask, w, h, b);
  const liner = useLiner(W, H, layout.cols, layout.rows, pitchX, pitchY, w, h, b, mask, 0.45 * unit);
  const linerSpec = useLinerSpec(spec);
  const curl = useMemo<SurfaceFn>(() => {
    const c = cornerCurl(spec.shape, cw, ch, Math.min(cw, ch) * 0.55, Math.min(cw, ch) * 0.09, 1.2);
    return (x, y, out) => curlPoint(x, y, c, out);
  }, [spec.shape, cw, ch]);
  const peeled = useLayers(w, h, b, curl, 72);
  const flat = useLayers(w, h, b, null);
  const matte = spec.finish === "matte";
  const count = layout.cols * layout.rows;
  const peeledIndex = layout.cols - 1;
  const usedIndex = count >= 6 && layout.rows >= 3 ? layout.cols : -1;
  const [labelW, labelH] = sizeLabels(spec);
  const cells = Array.from({ length: count }, (_, i) => {
    const c = i % layout.cols;
    const r = Math.floor(i / layout.cols);
    return { i, x: (c - (layout.cols - 1) / 2) * pitchX, y: ((layout.rows - 1) / 2 - r) * pitchY };
  });
  const first = cells[0];
  return (
    <group rotation-x={FLAT} userData={TABLE_VIEW}>
      <group rotation-z={0.1}>
        <Slab w={W} h={H} d={d} spec={linerSpec} front={liner} radius={0.025} edgeColor="#efece6" backColor="#ece6d6" />
        <group position-z={d / 2 + 0.002}>
          {cells
            .filter((cell) => cell.i !== usedIndex)
            .map((cell) => (
              <group key={cell.i} position={[cell.x, cell.y, 0]}>
                <StickerLayers geometry={cell.i === peeledIndex ? peeled : flat} art={texture} silhouette={silhouette} matte={matte} />
              </group>
            ))}
        </group>
        {dimsOn(spec, showDims) &&
          (layout.big ? (
            <Dimensions w={W} h={H} z={d + 0.02} labelW={labelW} labelH={labelH} />
          ) : (
            <group position={[first.x, first.y, 0]}>
              <Dimensions w={cw} h={ch} z={d + 0.02} labelW={labelW} labelH={labelH} />
            </group>
          ))}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ DTF */

/** Filme PET: leito leitoso translúcido, borda polida e marcas de corte nos cantos da arte. */
function paintFilm(ctx: CanvasRenderingContext2D, cw: number, ch: number, marginFrac: number) {
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = "rgba(232, 240, 238, 0.4)";
  ctx.fillRect(0, 0, cw, ch);
  const edge = Math.max(2, cw * 0.004);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.lineWidth = edge;
  ctx.strokeRect(edge / 2, edge / 2, cw - edge, ch - edge);
  const m = cw * marginFrac;
  const len = m * 0.55;
  const off = m * 0.15;
  ctx.strokeStyle = "rgba(20, 20, 20, 0.7)";
  ctx.lineWidth = Math.max(1.5, cw * 0.0025);
  const corners: [number, number, number, number][] = [
    [m, m, -1, -1],
    [cw - m, m, 1, -1],
    [m, ch - m, -1, 1],
    [cw - m, ch - m, 1, 1],
  ];
  ctx.beginPath();
  for (const [x, y, sx, sy] of corners) {
    ctx.moveTo(x + sx * off, y);
    ctx.lineTo(x + sx * (off + len), y);
    ctx.moveTo(x, y + sy * off);
    ctx.lineTo(x, y + sy * (off + len));
  }
  ctx.stroke();
}

/** Grão do pó de poliamida (relevo bem fino). */
function grainTexture(repeatX: number, repeatY: number) {
  const random = seeded(11);
  const texture = drawTexture(1, 128, (ctx, w, h) => {
    const image = ctx.createImageData(w, h);
    for (let i = 0; i < image.data.length; i += 4) {
      const v = 108 + random() * 40;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(Math.max(1, repeatX), Math.max(1, repeatY));
  return texture;
}

/** Superfície do filme: borda de cima enrolando (folha) ou ponta solta levantando (rolo), canto erguido e ondulação leve. */
function dtfSurface(W: number, H: number, roll: boolean): SurfaceFn {
  const ripple = Math.min(W, H) * 0.004;
  if (roll) {
    const c: Curl = { dx: 0, dy: -1, start: H / 2 - H * 0.05, radius: W * 0.08, angle: 0.75 };
    return (x, y, out) => {
      curlPoint(x, y, c, out);
      out.z += ripple * (1 + Math.sin(x * 5.3 + y * 2.1));
    };
  }
  const c: Curl = { dx: 0, dy: 1, start: H / 2 - H * 0.08, radius: H * 0.05, angle: 1.7 };
  const len = Math.hypot(W, H);
  const cx = W / len;
  const cy = -H / len;
  const cornerStart = (W / 2) * cx - (H / 2) * cy - Math.min(W, H) * 0.22;
  const k = 0.9 / Math.max(Math.min(W, H), 0.1);
  return (x, y, out) => {
    curlPoint(x, y, c, out);
    const s = x * cx + y * cy - cornerStart;
    if (s > 0) out.z += k * s * s;
    out.z += ripple * (1 + Math.sin(x * 4.1 + y * 2.7));
  };
}

/** Rolo de material sobre o eixo x: filme translúcido ou vinil colorido, com tubete de papelão saindo nas pontas. */
function MaterialRoll({ length, radius, color, film }: { length: number; radius: number; color: string; film: boolean }) {
  const coreOuter = radius * 0.55;
  const coreInner = coreOuter * 0.82;
  const coreLength = length * 1.03 + 0.01;
  const core = useMemo(() => ringLathe(coreInner, coreOuter, coreLength), [coreInner, coreOuter, coreLength]);
  useGeometryCleanup(core);
  const ends = useMemo(
    () =>
      drawTexture(1, 256, (ctx, size) => {
        const c = size / 2;
        const coreFrac = coreOuter / radius;
        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = film ? "rgba(232, 240, 238, 0.75)" : "#efece4";
        ctx.beginPath();
        ctx.arc(c, c, c, 0, Math.PI * 2);
        ctx.fill();
        const layers = 22;
        ctx.lineWidth = ((c * (1 - coreFrac)) / layers) * 0.55;
        ctx.strokeStyle = film ? "rgba(255, 255, 255, 0.85)" : color;
        for (let i = 0; i < layers; i += 1) {
          ctx.beginPath();
          ctx.arc(c, c, c * (coreFrac + ((1 - coreFrac) * (i + 0.5)) / layers), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = "#8a6a45";
        ctx.beginPath();
        ctx.arc(c, c, c * coreFrac, 0, Math.PI * 2);
        ctx.fill();
      }),
    [coreOuter, radius, color, film],
  );
  useTextureCleanup(ends);
  return (
    <group rotation-z={Math.PI / 2}>
      <mesh>
        <cylinderGeometry args={[radius, radius, length, 64, 1, false]} />
        {film ? (
          <meshPhysicalMaterial attach="material-0" color="#e7eeec" transparent opacity={0.72} roughness={0.12} clearcoat={1} clearcoatRoughness={0.05} depthWrite={false} />
        ) : (
          <meshPhysicalMaterial attach="material-0" color={color} roughness={0.28} clearcoat={0.9} clearcoatRoughness={0.05} />
        )}
        <meshStandardMaterial attach="material-1" map={ends} transparent={film} roughness={0.5} depthWrite={!film} />
        <meshStandardMaterial attach="material-2" map={ends} transparent={film} roughness={0.5} depthWrite={!film} />
      </mesh>
      <mesh geometry={core}>
        <meshStandardMaterial color="#b48a5a" roughness={0.88} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Anel de seção retangular (tubete, rolo de etiquetas) com quinas suavizadas, centrado em y. */
function ringLathe(inner: number, outer: number, length: number, segments = 64) {
  const e = Math.max((outer - inner) * 0.2, 1e-4);
  const y = length / 2;
  const profile: Pt[] = [
    [inner + e, -y],
    [outer - e, -y],
    [outer, -y + e],
    [outer, y - e],
    [outer - e, y],
    [inner + e, y],
    [inner, y - e],
    [inner, -y + e],
    [inner + e, -y],
  ];
  return lathe(profile, segments);
}

/** Folha DTF: filme PET translúcido com a arte impressa em acabamento de pó; folhas grandes saem de um rolo. */
function DtfFilm({ spec, art, label, showDims }: ModelProps) {
  const roll = Math.max(spec.widthCm, spec.heightCm) >= 50;
  const unit = 2.6 / Math.max(spec.widthCm, spec.heightCm);
  const W = spec.widthCm * unit;
  const H = spec.heightCm * unit;
  const m = Math.min(W, H) * 0.06;
  const aw = W - m * 2;
  const ah = H - m * 2;
  const print = useApparelArt(art);
  const texture = useArtTexture(aw / ah, "front", print, label);
  const geometry = useMemo(() => {
    const fn = dtfSurface(W, H, roll);
    const sx = 56;
    const sy = Math.min(140, Math.max(24, Math.round((56 * H) / W)));
    return { film: surfacePlane(W, H, sx, sy, fn), art: surfacePlane(aw, ah, sx, sy, fn, 0.002) };
  }, [W, H, aw, ah, roll]);
  useGeometryCleanup(geometry.film);
  useGeometryCleanup(geometry.art);
  const film = useMemo(() => drawTexture(W / H, 1024, (ctx, cw, ch) => paintFilm(ctx, cw, ch, m / W)), [W, H, m]);
  useTextureCleanup(film);
  const grain = useMemo(() => grainTexture(aw * 7, ah * 7), [aw, ah]);
  useTextureCleanup(grain);
  const radius = 3 * unit;
  const [labelW, labelH] = sizeLabels(spec);
  return (
    <group rotation-x={FLAT} userData={TABLE_VIEW}>
      <group rotation-z={roll ? 0.12 : 0.08}>
        <mesh geometry={geometry.art}>
          <meshPhysicalMaterial
            map={texture}
            alphaTest={0.4}
            roughness={0.95}
            sheen={0.7}
            sheenRoughness={0.9}
            sheenColor="#ffffff"
            bumpMap={grain}
            bumpScale={0.35}
            polygonOffset
            polygonOffsetFactor={-2}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh geometry={geometry.film}>
          <meshPhysicalMaterial map={film} transparent roughness={0.1} clearcoat={1} clearcoatRoughness={0.04} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        {roll && (
          <group position={[0, H / 2, radius]}>
            <MaterialRoll length={W} radius={radius} color="#e7eeec" film />
          </group>
        )}
        {dimsOn(spec, showDims) && <Dimensions w={W} h={H} z={0.05} labelW={labelW} labelH={labelH} />}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ vidro (eletrostático, retroverso, microperfurado) */

function paneLayout(spec: MockupSpec) {
  const marginCm = Math.max(4, Math.max(spec.widthCm, spec.heightCm) * 0.12);
  const pwCm = spec.widthCm + marginCm * 2;
  const phCm = spec.heightCm + marginCm * 2;
  const unit = 2.5 / Math.max(pwCm, phCm);
  return { w: spec.widthCm * unit, h: spec.heightCm * unit, pw: pwCm * unit, ph: phCm * unit, t: Math.max(0.4 * unit, 0.012) };
}

/** Reflexos diagonais suaves que vendem o vidro. */
function paintGlare(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  const bands: [number, number, number][] = [
    [0.2, 0.16, 0.32],
    [0.33, 0.045, 0.24],
    [0.84, 0.1, 0.16],
  ];
  for (const [x, width, alpha] of bands) {
    const bw = w * width;
    ctx.save();
    ctx.translate(w * x, h / 2);
    ctx.rotate(-0.55);
    const gradient = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(-bw / 2, -h * 1.5, bw, h * 3);
    ctx.restore();
  }
}

/** Painel de vidro temperado de bordas lapidadas (verde na espessura), em dois pés metálicos. */
function GlassPane({ w, h, t }: { w: number; h: number; t: number }) {
  const geometry = useMemo(() => {
    const bevel = t * 0.3;
    const depth = Math.max(t - bevel * 2, 1e-4);
    const g = new THREE.ExtrudeGeometry(makeShape("rect", w - bevel * 2, h - bevel * 2, Math.min(w, h) * 0.02), {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 6,
    });
    g.translate(0, 0, -depth / 2);
    return g;
  }, [w, h, t]);
  useGeometryCleanup(geometry);
  const glare = useMemo(() => drawTexture(w / h, 512, paintGlare), [w, h]);
  useTextureCleanup(glare);
  const footW = Math.min(w * 0.16, 0.42);
  const footH = Math.max(0.06, h * 0.035);
  const footD = Math.max(t * 5, 0.15);
  return (
    <group>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial attach="material-0" color="#e4f0ec" transparent opacity={0.16} roughness={0.03} clearcoat={1} clearcoatRoughness={0.02} envMapIntensity={1.4} depthWrite={false} />
        <meshPhysicalMaterial attach="material-1" color="#9ccabc" transparent opacity={0.72} roughness={0.12} clearcoat={1} depthWrite={false} />
      </mesh>
      <mesh position-z={t / 2 + 0.001} renderOrder={2}>
        <planeGeometry args={[w * 0.97, h * 0.97]} />
        <meshBasicMaterial map={glare} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {[-1, 1].map((side) => (
        <RoundedBlock key={side} w={footW} h={footH} d={footD} radius={Math.min(footW, footD) * 0.3} color="#d3d6da" metalness={1} roughness={0.28} position={[side * w * 0.32, -h / 2 + footH * 0.3, 0]} />
      ))}
    </group>
  );
}

/** Adesivo eletrostático: PVC brilhante aderido na face do vidro, canto inferior soltando. */
function ClingOnGlass({ spec, art, label, showDims }: ModelProps) {
  const { w, h, pw, ph, t } = paneLayout(spec);
  const b = Math.min(w, h) * 0.035;
  const sw = w + b * 2;
  const sh = h + b * 2;
  const mask = maskFor(spec.shape);
  const texture = useArtTexture(artAspect(spec), "front", art, label, mask);
  const silhouette = useSilhouette(mask, w, h, b);
  const curl = useMemo<SurfaceFn>(() => {
    const c = cornerCurl(spec.shape, sw, sh, Math.min(sw, sh) * 0.2, Math.min(sw, sh) * 0.12, 0.5, 1, -1);
    return (x, y, out) => curlPoint(x, y, c, out);
  }, [spec.shape, sw, sh]);
  const layers = useLayers(w, h, b, curl, 64);
  const [labelW, labelH] = sizeLabels(spec);
  return (
    <group rotation-y={-0.3}>
      <GlassPane w={pw} h={ph} t={t} />
      <group position-z={t / 2 + 0.0015}>
        <StickerLayers geometry={layers} art={texture} silhouette={silhouette} matte={false} film="#ffffff" backing="#eef2f1" />
      </group>
      {dimsOn(spec, showDims) && <Dimensions w={sw} h={sh} z={t / 2 + 0.03} labelW={labelW} labelH={labelH} />}
    </group>
  );
}

/** Retroverso: impresso ao contrário e aplicado por dentro; lido de frente através do vidro, verso branco. */
function WindowDecal({ spec, art, label, showDims }: ModelProps) {
  const { w, h, pw, ph, t } = paneLayout(spec);
  const mask = maskFor(spec.shape);
  const texture = useArtTexture(artAspect(spec), "front", art, label, mask);
  const silhouette = useSilhouette(mask, w, h, 0);
  const [labelW, labelH] = sizeLabels(spec);
  return (
    <group rotation-y={-0.3}>
      <GlassPane w={pw} h={ph} t={t} />
      <group position-z={-t / 2 - 0.0012}>
        <mesh>
          <planeGeometry args={[w, h]} />
          <meshPhysicalMaterial map={texture} alphaTest={0.5} roughness={0.4} clearcoat={0.3} />
        </mesh>
        <mesh position-z={-0.0008}>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial map={silhouette} color="#f1f1ee" alphaTest={0.5} roughness={0.9} side={THREE.BackSide} />
        </mesh>
      </group>
      {dimsOn(spec, showDims) && <Dimensions w={w} h={h} z={t / 2 + 0.03} labelW={labelW} labelH={labelH} />}
    </group>
  );
}

/** Furos do microperfurado (branco = vinil, preto = furo); repetido pela área. */
function perforationTexture(repeatX: number, repeatY: number) {
  const texture = drawTexture(1, 64, (ctx, w, h) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w * 0.3, 0, Math.PI * 2);
    ctx.fill();
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  return texture;
}

/** Vinil microperfurado na vitrine: furos visíveis sobre a arte, verso preto (de dentro se vê através). */
function PerforatedFilm({ spec, art, label, showDims }: ModelProps) {
  const { w, h, pw, ph, t } = paneLayout(spec);
  const mask = maskFor(spec.shape, squareMask);
  const texture = useArtTexture(artAspect(spec), "front", art, label, mask);
  const silhouette = useSilhouette(mask, w, h, 0);
  const unit = w / spec.widthCm;
  const spacing = Math.max(0.25 * unit, 0.022);
  const holesX = Math.max(8, Math.round(w / spacing));
  const holesY = Math.max(8, Math.round(h / spacing));
  const holes = useMemo(() => perforationTexture(holesX, holesY), [holesX, holesY]);
  useTextureCleanup(holes);
  const [labelW, labelH] = sizeLabels(spec);
  return (
    <group rotation-y={-0.28}>
      <GlassPane w={pw} h={ph} t={t} />
      <group position-z={t / 2 + 0.0015}>
        <mesh>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial map={texture} alphaMap={holes} transparent roughness={0.55} />
        </mesh>
        <mesh position-z={-0.0005}>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial map={silhouette} color="#121212" alphaMap={holes} transparent roughness={0.7} side={THREE.BackSide} />
        </mesh>
      </group>
      {dimsOn(spec, showDims) && <Dimensions w={w} h={h} z={t / 2 + 0.03} labelW={labelW} labelH={labelH} />}
    </group>
  );
}

/* ------------------------------------------------------------------ rótulo (pote / garrafa) */

type VesselPlan = {
  R: number;
  height: number;
  labelY: number;
  outer: Pt[];
  contents: Pt[] | null;
  cap: Pt[];
  ribs: { y0: number; y1: number; count: number; depth: number };
  amber: boolean;
  rollR: number;
  rollCore: number;
  rollH: number;
  step: number;
};

/** Medidas em cm: rótulo largo vai num pote de mel com tampa de rosca; quadrado/alto numa garrafa âmbar com tampinha. */
function vesselPlan(aw: number, ah: number, jar: boolean): VesselPlan {
  const gap = 0.5;
  const roll = (R: number) => {
    const rollR = Math.max(R * 0.9, (3 * (aw + gap)) / (2 * Math.PI) + 0.3);
    return { rollR, rollCore: Math.min(3.8, rollR * 0.6), rollH: ah + 1, step: (aw + gap) / (rollR + 0.03) };
  };
  if (jar) {
    // O rótulo cobre ~38% da volta (~137°): a arte fica de frente e pouco comprimida nas laterais.
    const R = Math.max(aw / (2 * Math.PI * 0.38), ah * 0.55, 3.2);
    const base = 0.55;
    const sy = base + ah + 1.6;
    const neck = R * 0.84;
    const y0 = sy + 1.1;
    const y1 = sy + 2.7;
    const lr = neck + 0.28;
    return {
      R,
      height: y1,
      labelY: base + (ah + 1.6) / 2,
      amber: false,
      outer: [
        [0, 0],
        [R - 0.6, 0],
        [R - 0.15, 0.12],
        [R, 0.55],
        [R, sy],
        [R * 0.985, sy + 0.45],
        [R * 0.93, sy + 0.8],
        [neck + 0.15, sy + 1.0],
        [neck, sy + 1.15],
        [neck, sy + 2.3],
        [0, sy + 2.3],
      ],
      contents: [
        [0, 0.45],
        [R - 0.55, 0.45],
        [R - 0.26, 0.8],
        [R - 0.26, sy - 0.2],
        [0, sy - 0.2],
      ],
      cap: [
        [neck - 0.05, y0],
        [lr - 0.08, y0],
        [lr, y0 + 0.12],
        [lr, y0 + 0.25],
        [lr, y1 - 0.4],
        [lr, y1 - 0.35],
        [lr - 0.06, y1 - 0.1],
        [lr - 0.35, y1],
        [0, y1],
      ],
      ribs: { y0: y0 + 0.25, y1: y1 - 0.4, count: 56, depth: 0.012 },
      ...roll(R),
    };
  }
  const R = Math.max(aw / (2 * Math.PI * 0.38), 3);
  const base = 0.7;
  const bodyTop = base + ah + 2.4;
  const neck = 1.3;
  const shoulder = smoothProfile(
    [
      [R, bodyTop],
      [R * 0.95, bodyTop + 1.3],
      [R * 0.62, bodyTop + 2.9],
      [neck * 1.15, bodyTop + 4.1],
      [neck, bodyTop + 4.8],
    ],
    28,
  );
  const neckTop = bodyTop + 4.8 + 4;
  const y0 = neckTop + 0.05;
  const y1 = neckTop + 0.95;
  const cr = neck + 0.36;
  return {
    R,
    height: y1,
    labelY: base + 1.2 + ah / 2,
    amber: true,
    outer: [[0, 0], [R - 0.7, 0], [R - 0.2, 0.15], [R, 0.7], ...shoulder, [neck, neckTop], [neck + 0.18, neckTop + 0.12], [neck + 0.18, neckTop + 0.5], [neck - 0.15, neckTop + 0.62], [0, neckTop + 0.62]],
    contents: null,
    cap: [
      [neck - 0.1, y0],
      [cr, y0],
      [cr + 0.04, y0 + 0.3],
      [cr + 0.02, y0 + 0.45],
      [cr - 0.04, y1 - 0.15],
      [cr - 0.2, y1],
      [0, y1],
    ],
    ribs: { y0: y0 - 0.01, y1: y0 + 0.45, count: 21, depth: 0.06 },
    ...roll(R),
  };
}

/** Recartilha (tampa de rosca) ou pregas (tampinha) moldadas no torno. */
function knurl(geometry: THREE.BufferGeometry, y0: number, y1: number, count: number, depth: number) {
  const pos = geometry.attributes.position;
  const eps = 1e-5;
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    // Faixa inclusiva: os dois anéis do perfil nas pontas da recartilha são deslocados juntos (frisos retos).
    if (y < y0 - eps || y > y1 + eps) continue;
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const f = 1 - depth * (0.5 + 0.5 * Math.cos(Math.atan2(x, z) * count));
    pos.setXYZ(i, x * f, y, z * f);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  // Costura do torno para trás.
  geometry.rotateY(Math.PI);
}

function LabelMaterial({ map, spec }: { map: THREE.Texture; spec: MockupSpec }) {
  const gloss = spec.finish === "gloss" || spec.clearcoat > 0;
  return (
    <meshPhysicalMaterial
      map={map}
      alphaTest={0.5}
      roughness={roughnessOf(spec)}
      clearcoat={gloss ? Math.max(spec.clearcoat, 0.7) : 0}
      clearcoatRoughness={0.06}
      polygonOffset
      polygonOffsetFactor={-1}
    />
  );
}

/** Rótulo envolvendo um pote de vidro com mel (rótulos largos) ou uma garrafa âmbar; ao lado, o rolo de rótulos. */
function LabeledProduct({ spec, art, label, showDims }: ModelProps) {
  const jar = spec.widthCm / spec.heightCm > 1.15;
  const plan = useMemo(() => vesselPlan(spec.widthCm, spec.heightCm, jar), [spec.widthCm, spec.heightCm, jar]);
  const unit = 2.3 / plan.height;
  const mask = maskFor(spec.shape);
  const texture = useArtTexture(artAspect(spec), "front", art, label, mask);
  const geo = useMemo(() => {
    const scale = (points: Pt[]): Pt[] => points.map(([x, y]) => [x * unit, y * unit]);
    const cap = lathe(scale(plan.cap), 224);
    knurl(cap, plan.ribs.y0 * unit, plan.ribs.y1 * unit, plan.ribs.count, plan.ribs.depth);
    const labelBand = (radius: number) =>
      bandGeometry({ radiusTop: radius * unit, radiusBottom: radius * unit, height: spec.heightCm * unit, width: spec.widthCm * unit, segments: 96, rows: 2 });
    return {
      glass: lathe(scale(plan.outer), 96),
      contents: plan.contents ? lathe(scale(plan.contents), 72) : null,
      cap,
      label: labelBand(plan.R + 0.03),
      roll: ringLathe(plan.rollCore * unit, plan.rollR * unit, plan.rollH * unit, 96),
      core: ringLathe((plan.rollCore - 0.35) * unit, plan.rollCore * unit, (plan.rollH + 0.1) * unit, 64),
      rollLabel: labelBand(plan.rollR + 0.03),
    };
  }, [plan, unit, spec.widthCm, spec.heightCm]);
  useGeometryCleanup(geo.glass);
  useGeometryCleanup(geo.contents);
  useGeometryCleanup(geo.cap);
  useGeometryCleanup(geo.label);
  useGeometryCleanup(geo.roll);
  useGeometryCleanup(geo.core);
  useGeometryCleanup(geo.rollLabel);
  const capColor = spec.accentColor ?? "#cfa94e";
  const [labelW, labelH] = sizeLabels(spec);
  const span = Math.min(spec.widthCm / plan.R, Math.PI);
  const chord = 2 * plan.R * Math.sin(span / 2) * unit;
  const rollY = (plan.rollH / 2) * unit;
  return (
    <group>
      {/* Rolo atrás e à esquerda, encostando na silhueta do frasco: cena compacta, rótulo do frasco em destaque. */}
      <group position={[-(plan.R + plan.rollR * 0.75 + 0.6) * unit, 0, -(plan.rollR * 1.1) * unit]} rotation-y={0.55}>
        <mesh geometry={geo.roll} position-y={rollY}>
          <meshPhysicalMaterial color="#f4f1e9" roughness={0.42} clearcoat={0.3} />
        </mesh>
        <mesh geometry={geo.core} position-y={rollY}>
          <meshStandardMaterial color="#b08a5c" roughness={0.88} side={THREE.DoubleSide} />
        </mesh>
        {[-1, 0, 1].map((k) => (
          <mesh key={k} geometry={geo.rollLabel} position-y={rollY} rotation-y={k * plan.step}>
            <LabelMaterial map={texture} spec={spec} />
          </mesh>
        ))}
      </group>
      {geo.contents && (
        <mesh geometry={geo.contents}>
          <meshPhysicalMaterial color="#d98a1c" roughness={0.22} clearcoat={0.6} clearcoatRoughness={0.1} emissive="#4a2000" emissiveIntensity={0.25} />
        </mesh>
      )}
      <mesh geometry={geo.glass}>
        {plan.amber ? (
          <meshPhysicalMaterial color="#4a2108" roughness={0.05} clearcoat={1} clearcoatRoughness={0.02} envMapIntensity={1.5} />
        ) : (
          <meshPhysicalMaterial color="#e6f1ee" transparent opacity={0.26} roughness={0.03} clearcoat={1} clearcoatRoughness={0.02} envMapIntensity={1.6} depthWrite={false} />
        )}
      </mesh>
      <mesh geometry={geo.label} position-y={plan.labelY * unit}>
        <LabelMaterial map={texture} spec={spec} />
      </mesh>
      <mesh geometry={geo.cap}>
        <meshStandardMaterial color={capColor} metalness={spec.accentColor ? 0.3 : 1} roughness={0.28} />
      </mesh>
      {dimsOn(spec, showDims) && (
        <group position-y={plan.labelY * unit}>
          <Dimensions w={chord} h={spec.heightCm * unit} z={(plan.R + 0.6) * unit} labelW={labelW} labelH={labelH} />
        </group>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ automotivo */

/** Lataria: curvatura nas duas direções e um vinco de estilo acima da área do adesivo. */
function carSurface(pw: number, ph: number, crease: number): SurfaceFn {
  const bx = 0.3 / pw;
  const by = 0.1 / ph;
  const k = 0.045;
  const e = 0.012;
  return (x, y, out) => {
    out.set(x, y, -bx * x * x - by * y * y - k * (Math.hypot(y - crease, e) - e));
  };
}

/** Vinil automotivo laminado sobre um recorte de porta: pintura metálica com verniz, borda dobrada, friso cromado e base. */
function CarDecal({ spec, art, label, showDims }: ModelProps) {
  const pwCm = spec.widthCm + Math.max(6, spec.widthCm * 0.45) * 2;
  const phCm = spec.heightCm + Math.max(5, spec.heightCm * 0.4) * 2;
  const unit = 2.4 / Math.max(pwCm, phCm);
  const w = spec.widthCm * unit;
  const h = spec.heightCm * unit;
  const pw = pwCm * unit;
  const ph = phCm * unit;
  const t = 0.018;
  const b = Math.min(w, h) * 0.03;
  const ay = -ph * 0.04;
  const crease = ay + h / 2 + b + (ph / 2 - (ay + h / 2 + b)) * 0.5;
  const corner = Math.min(pw, ph) * 0.08;
  const body = useMemo(() => carSurface(pw, ph, crease), [pw, ph, crease]);
  const panel = useMemo(() => {
    const outline = makeShape("rect", pw, ph, corner).getSpacedPoints(220);
    outline.pop();
    const rim = outline.map((p) => {
      body(p.x, p.y, tmp);
      return tmp.clone();
    });
    const trimY = -ph / 2 + ph * 0.07;
    const trim = Array.from({ length: 24 }, (_, i) => {
      body(-pw * 0.42 + (pw * 0.84 * i) / 23, trimY, tmp);
      return new THREE.Vector3(tmp.x, tmp.y, tmp.z + t * 0.9);
    });
    body(0, -ph / 2, tmp);
    const baseZ = tmp.z;
    return {
      front: surfacePlane(pw, ph, 96, 80, body, t / 2),
      back: surfacePlane(pw, ph, 48, 40, body, -t / 2),
      rim: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 260, t / 2, 8, true),
      trim: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(trim), 64, 0.011, 10, false),
      trimEnds: [trim[0], trim[trim.length - 1]],
      baseZ,
    };
  }, [body, pw, ph, corner, t]);
  useGeometryCleanup(panel.front);
  useGeometryCleanup(panel.back);
  useGeometryCleanup(panel.rim);
  useGeometryCleanup(panel.trim);
  const decalSurface = useMemo<SurfaceFn>(
    () => (x, y, out) => {
      body(x, y + ay, out);
      out.z += t / 2 + 0.001;
    },
    [body, ay, t],
  );
  const layers = useLayers(w, h, b, decalSurface, 48);
  const mask = maskFor(spec.shape);
  const texture = useArtTexture(artAspect(spec), "front", art, label, mask);
  const silhouette = useSilhouette(mask, w, h, b);
  const panelAlpha = useSilhouette(rectMask, pw, ph, 0);
  const paint = spec.accentColor ?? "#1c3553";
  const [labelW, labelH] = sizeLabels(spec);
  const centerZ = useMemo(() => {
    body(0, ay, tmp);
    return tmp.z;
  }, [body, ay]);
  return (
    <group rotation-y={-0.3}>
      <mesh geometry={panel.front}>
        <meshPhysicalMaterial color={paint} alphaMap={panelAlpha} alphaTest={0.5} metalness={0.6} roughness={0.32} clearcoat={1} clearcoatRoughness={0.03} />
      </mesh>
      <mesh geometry={panel.back}>
        <meshStandardMaterial color="#5c5f64" alphaMap={panelAlpha} alphaTest={0.5} roughness={0.8} side={THREE.BackSide} />
      </mesh>
      <mesh geometry={panel.rim}>
        <meshPhysicalMaterial color={paint} metalness={0.6} roughness={0.32} clearcoat={1} clearcoatRoughness={0.03} />
      </mesh>
      <mesh geometry={panel.trim}>
        <meshStandardMaterial color="#eef0f2" metalness={1} roughness={0.12} />
      </mesh>
      {panel.trimEnds.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.011, 12, 8]} />
          <meshStandardMaterial color="#eef0f2" metalness={1} roughness={0.12} />
        </mesh>
      ))}
      <StickerLayers geometry={layers} art={texture} silhouette={silhouette} matte={spec.finish === "matte"} />
      <RoundedBlock w={pw * 0.55} h={0.09} d={0.3} radius={0.05} color="#1b1b1d" roughness={0.45} position={[0, -ph / 2 + 0.025, panel.baseZ]} />
      {dimsOn(spec, showDims) && (
        <group position-y={ay}>
          <Dimensions w={w + b * 2} h={h + b * 2} z={centerZ + 0.06} labelW={labelW} labelH={labelH} />
        </group>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ vinil sem impressão */

/** Vinil sem impressão: rolo na cor do material desenrolado na mesa, com a peça recortada sendo destacada do liner. */
function BlankVinyl({ spec, art, label, showDims }: ModelProps) {
  const WCm = spec.widthCm + Math.max(3, spec.widthCm * 0.35) * 2;
  const LCm = spec.heightCm + Math.max(4, spec.heightCm * 0.4) * 2;
  const RCm = 3.5;
  const unit = 2.5 / Math.max(WCm, LCm + RCm * 2);
  const w = spec.widthCm * unit;
  const h = spec.heightCm * unit;
  const W = WCm * unit;
  const L = LCm * unit;
  const R = RCm * unit;
  const b = Math.min(w, h) * 0.045;
  const weed = Math.min(w, h) * 0.05;
  const py = -L * 0.06;
  const vinyl = spec.baseColor;
  const mask = maskFor(spec.shape);
  const texture = useArtTexture(artAspect(spec), "front", art, label, mask);
  const silhouette = useSilhouette(mask, w, h, b);
  const sw = w + b * 2;
  const sh = h + b * 2;
  const curl = useMemo<SurfaceFn>(() => {
    const c = cornerCurl(spec.shape, sw, sh, Math.min(sw, sh) * 0.28, Math.min(sw, sh) * 0.07, 1.0);
    return (x, y, out) => curlPoint(x, y, c, out);
  }, [spec.shape, sw, sh]);
  const layers = useLayers(w, h, b, curl, 72);
  const strip = useMemo(
    () =>
      drawTexture(W / L, 1024, (ctx, cw, ch) => {
        const s = cw / W;
        ctx.fillStyle = vinyl;
        ctx.fillRect(0, 0, cw, ch);
        ctx.save();
        ctx.translate((W / 2 - w / 2) * s, (L / 2 - py - h / 2) * s);
        mask(ctx, w * s, h * s);
        ctx.lineJoin = "round";
        ctx.lineWidth = (b + weed) * s * 2 + 3;
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.stroke();
        // Liner de vinil de recorte (cinza-azulado): contrasta mesmo com vinil branco.
        ctx.lineWidth = (b + weed) * s * 2;
        ctx.strokeStyle = CUT_LINER;
        ctx.stroke();
        ctx.fillStyle = CUT_LINER;
        ctx.fill();
        ctx.restore();
      }),
    [W, L, w, h, b, weed, py, vinyl, mask],
  );
  useTextureCleanup(strip);
  const [labelW, labelH] = sizeLabels(spec);
  return (
    <group rotation-x={FLAT} userData={TABLE_VIEW}>
      <group rotation-z={0.1}>
        <mesh>
          <planeGeometry args={[W, L]} />
          <meshPhysicalMaterial map={strip} roughness={0.3} clearcoat={0.8} clearcoatRoughness={0.06} />
        </mesh>
        <group position={[0, py, 0.002]}>
          <StickerLayers geometry={layers} art={texture} silhouette={silhouette} matte={spec.finish === "matte"} film={vinyl} />
          {dimsOn(spec, showDims) && <Dimensions w={sw} h={sh} z={0.03} labelW={labelW} labelH={labelH} />}
        </group>
        <group position={[0, L / 2, R]}>
          <MaterialRoll length={W} radius={R} color={vinyl} film={false} />
        </group>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ entrada */

/**
 * Adesivos, rótulos e DTF. Cada subtipo (spec.variant) tem a sua cena:
 * vinil recortado com borda branca descolando do liner (padrão; escovado prata e blackout pelo nome do produto),
 * cartela meio-corte (sheet), filme DTF com pó (dtf),
 * eletrostático, retroverso e microperfurado num painel de vidro, rótulo em pote/garrafa com o rolo ao lado (label),
 * vinil sobre lataria (car) e rolo de vinil colorido com a peça recortada (sem impressão).
 * As peças são planos com máscara alfa da arte (redondo, coração) dobrados por uma função de superfície.
 */
export function StickerModel(props: ModelProps) {
  const { spec } = props;
  if (spec.blank && !spec.variant) return <BlankVinyl {...props} />;
  switch (spec.variant) {
    case "sheet":
      return <StickerSheet {...props} />;
    case "dtf":
      return <DtfFilm {...props} />;
    case "electrostatic":
      return <ClingOnGlass {...props} />;
    case "window":
      return <WindowDecal {...props} />;
    case "perforated":
      return <PerforatedFilm {...props} />;
    case "label":
      return <LabeledProduct {...props} />;
    case "car":
      return <CarDecal {...props} />;
    default:
      return <DieCutSticker {...props} />;
  }
}
