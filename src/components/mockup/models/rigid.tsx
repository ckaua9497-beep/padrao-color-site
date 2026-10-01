"use client";

// Placas rígidas: PVC/PS/XPS (parede, mosaico, mesa, porteiro, placa pet), acrílico, chaveiro e canvas.

import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import { artAspect } from "@/lib/mockup-kinds";
import { fontFamily } from "../art";
import { AcrylicMaterials, Dimensions, PrintMaterial, fitFlat, makeShape, metalColor, sizeLabels, useArtTexture, useGeometryCleanup, type ModelProps } from "./shared";

type V3 = [number, number, number];
type Plate = { body: THREE.BufferGeometry; face: THREE.BufferGeometry };

const STEEL = "#d3d6da";
const OAK: [string, string] = ["#c99e68", "#8c6236"];
const PINE: [string, string] = ["#e4c798", "#b38a55"];
const WALNUT_DOOR: [string, string] = ["#b98a5b", "#7f5431"];
const RING_TURNS = 2;
/** Maçaneta de alavanca do porteiro (cm). */
const HANDLE = { neckR: 0.95, neckL: 5.6, roseR: 2.7, roseT: 0.9, leverL: 12.5 };
/** Couchê 300 g, levemente engrossado para a borda aparecer (cm). */
const PAPER_CM = 0.05;
/** Ferragens do chaveiro (cm): orelha, furo, argolinha, elos e argola dupla. */
const KEY = { tabR: 0.55, holeR: 0.2, jump: { r: 0.42, wire: 0.06 }, link: { rx: 0.2, ry: 0.32, wire: 0.05 }, split: { r: 1.25, wire: 0.075 } };
/** Expositor de balcão do chaveiro (cm): haste atrás da placa, braço para a frente passando pela argola. */
const STAND = { postR: 0.32, armR: 0.2, postZ: -2.4, tipZ: 0.95, baseZ: -0.9, gap: 0.7, base: { w: 7.2, h: 0.9, d: 5.4 } };
/** Folga entre as barras do chassi e a lateral da tela (cena). */
const CANVAS_GAP = 0.003;

/* ------------------------------------------------------------------ geometria */

/** Retângulo de cantos redondos (arcos de verdade), centrado em (cx, cy). */
function roundedRect(w: number, h: number, r: number, cx = 0, cy = 0) {
  const rr = THREE.MathUtils.clamp(r, 0.0005, Math.min(w, h) * 0.499);
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  const s = new THREE.Shape();
  s.moveTo(x0 + rr, y0);
  s.absarc(x1 - rr, y0 + rr, rr, -Math.PI / 2, 0, false);
  s.absarc(x1 - rr, y1 - rr, rr, 0, Math.PI / 2, false);
  s.absarc(x0 + rr, y1 - rr, rr, Math.PI / 2, Math.PI, false);
  s.absarc(x0 + rr, y0 + rr, rr, Math.PI, Math.PI * 1.5, false);
  return s;
}

/**
 * Normais suaves entre faces com ângulo pequeno (chanfro, cantos redondos) e vincadas nas quinas.
 * As tampas (faces ±z) ficam planas e não entram na média, senão a face grande ganha degradê.
 */
function creaseNormals(geometry: THREE.BufferGeometry, creaseAngle = 0.95) {
  const pos = geometry.getAttribute("position");
  const count = pos.count - (pos.count % 3);
  const faces = count / 3;
  const fn = new Float32Array(faces * 3);
  const area = new Float32Array(faces);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let f = 0; f < faces; f += 1) {
    a.fromBufferAttribute(pos, f * 3);
    b.fromBufferAttribute(pos, f * 3 + 1);
    c.fromBufferAttribute(pos, f * 3 + 2);
    c.sub(b);
    a.sub(b);
    c.cross(a);
    const len = c.length();
    area[f] = len;
    if (len > 0) c.divideScalar(len);
    fn[f * 3] = c.x;
    fn[f * 3 + 1] = c.y;
    fn[f * 3 + 2] = c.z;
  }
  const keys: string[] = [];
  const shared = new Map<string, number[]>();
  for (let i = 0; i < count; i += 1) {
    const key = `${Math.round(pos.getX(i) * 1e5)}|${Math.round(pos.getY(i) * 1e5)}|${Math.round(pos.getZ(i) * 1e5)}`;
    keys.push(key);
    const list = shared.get(key);
    if (list) list.push(i);
    else shared.set(key, [i]);
  }
  const minDot = Math.cos(creaseAngle);
  const normals = new Float32Array(pos.count * 3);
  for (let i = 0; i < count; i += 1) {
    const f = Math.floor(i / 3);
    const nx = fn[f * 3];
    const ny = fn[f * 3 + 1];
    const nz = fn[f * 3 + 2];
    let sx = nx;
    let sy = ny;
    let sz = nz;
    if (Math.abs(nz) < 0.9995) {
      sx = 0;
      sy = 0;
      sz = 0;
      for (const j of shared.get(keys[i]) ?? []) {
        const g = Math.floor(j / 3);
        const gx = fn[g * 3];
        const gy = fn[g * 3 + 1];
        const gz = fn[g * 3 + 2];
        if (Math.abs(gz) >= 0.9995 || nx * gx + ny * gy + nz * gz < minDot) continue;
        sx += gx * area[g];
        sy += gy * area[g];
        sz += gz * area[g];
      }
      const len = Math.hypot(sx, sy, sz);
      if (len > 1e-12) {
        sx /= len;
        sy /= len;
        sz /= len;
      } else {
        sx = nx;
        sy = ny;
        sz = nz;
      }
    }
    normals[i * 3] = sx;
    normals[i * 3 + 1] = sy;
    normals[i * 3 + 2] = sz;
  }
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
}

/**
 * Corpo extrudado centrado em z com borda boleada. O contorno passado já vem recuado pelo chanfro,
 * então a peça mede exatamente o contorno + 2 × bevel. Grupos: 0 = tampas, 1 = laterais.
 */
function extrudeBody(shape: THREE.Shape | THREE.Shape[], depth: number, bevel: number, curveSegments = 6) {
  const b = Math.min(Math.max(bevel, 0), depth * 0.45);
  const core = depth - 2 * b;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: core,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: b > 0 ? 4 : 1,
    curveSegments,
  });
  geometry.translate(0, 0, -core / 2);
  creaseNormals(geometry);
  return geometry;
}

/** Face impressa sobre a tampa, com UV planar na área total w × h (a arte nunca estica). */
function printFace(shape: THREE.Shape | THREE.Shape[], w: number, h: number, curveSegments = 6) {
  const geometry = new THREE.ShapeGeometry(shape, curveSegments);
  const pos = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < pos.count; i += 1) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  uv.needsUpdate = true;
  return geometry;
}

/** Barra de seção arredondada ao longo de x: o veio da madeira (v do UV) corre no comprimento. */
function barGeometry(length: number, height: number, depth: number, radius: number, bevel: number) {
  const b = Math.min(bevel, height * 0.3, depth * 0.3, length * 0.3);
  const geometry = extrudeBody(roundedRect(depth - 2 * b, height - 2 * b, radius - b), length, b, 4);
  geometry.rotateY(-Math.PI / 2);
  return geometry;
}

/** Perfil girado em torno de z (tampa de espaçador, roseta, pescoço da maçaneta). */
function latheZ(points: [number, number][], segments = 36) {
  const geometry = new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/** Disco com a borda de cima boleada (sai de z = 0 para +z). */
function capProfile(radius: number, height: number): [number, number][] {
  const round = Math.min(radius * 0.32, height * 0.45);
  const points: [number, number][] = [
    [0, 0],
    [radius * 0.97, 0],
    [radius, height * 0.06],
    [radius, height - round],
  ];
  for (let k = 1; k <= 6; k += 1) {
    const a = (k / 6) * (Math.PI / 2);
    points.push([radius - round + round * Math.cos(a), height - round + round * Math.sin(a)]);
  }
  points.push([0, height]);
  return points;
}

/** Cilindro fechado com chanfro nas pontas (corpo do espaçador, pescoço). */
function barrelProfile(radius: number, length: number): [number, number][] {
  const ch = Math.min(radius * 0.15, length * 0.1);
  return [
    [0, 0],
    [radius - ch, 0],
    [radius, ch],
    [radius, length - ch],
    [radius - ch, length],
    [0, length],
  ];
}

class HelixCurve extends THREE.Curve<THREE.Vector3> {
  radius: number;
  turns: number;
  rise: number;

  constructor(radius: number, turns: number, rise: number) {
    super();
    this.radius = radius;
    this.turns = turns;
    this.rise = rise;
  }

  getPoint(t: number, target = new THREE.Vector3()) {
    const a = t * this.turns * Math.PI * 2;
    return target.set(Math.cos(a) * this.radius, Math.sin(a) * this.radius, (t - 0.5) * this.rise);
  }
}

class LoopCurve extends THREE.Curve<THREE.Vector3> {
  rx: number;
  ry: number;

  constructor(rx: number, ry: number) {
    super();
    this.rx = rx;
    this.ry = ry;
  }

  getPoint(t: number, target = new THREE.Vector3()) {
    const a = t * Math.PI * 2;
    return target.set(Math.cos(a) * this.rx, Math.sin(a) * this.ry, 0);
  }
}

/** Elo fechado (oval ou redondo) no plano xy. */
function loopGeometry(rx: number, ry: number, wire: number) {
  return new THREE.TubeGeometry(new LoopCurve(rx, ry), 56, wire, 10, true);
}

function corners(w: number, h: number, inset: number): [number, number][] {
  return [
    [-w / 2 + inset, h / 2 - inset],
    [w / 2 - inset, h / 2 - inset],
    [-w / 2 + inset, -h / 2 + inset],
    [w / 2 - inset, -h / 2 + inset],
  ];
}

/* ------------------------------------------------------------------ texturas */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Veio de madeira procedural: listras onduladas na vertical (v), emendáveis nas duas direções. */
function createWoodTexture([base, grain]: [string, string], seed: number, repeatU: number, repeatV: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const random = mulberry32(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 512);
    ctx.strokeStyle = grain;
    ctx.lineCap = "round";
    for (let i = 0; i < 90; i += 1) {
      const x0 = random() * 256;
      const amp = 1.5 + random() * 7;
      const waves = 1 + Math.floor(random() * 3);
      const phase = random() * Math.PI * 2;
      ctx.globalAlpha = 0.05 + random() * 0.2;
      ctx.lineWidth = 0.6 + random() * 2.4;
      for (const offset of [-256, 0, 256]) {
        ctx.beginPath();
        for (let y = 0; y <= 512; y += 8) {
          const x = x0 + offset + Math.sin((y / 512) * Math.PI * 2 * waves + phase) * amp;
          if (y === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatU, repeatV);
  texture.anisotropy = 4;
  return texture;
}

/** Relevo da trama do canvas (tela de algodão): fios que passam por cima e por baixo. */
function createWeaveTexture(repeatU: number, repeatV: number) {
  const size = 64;
  const cell = size / 8;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const tx = ((x % cell) + 0.5) / cell;
        const ty = ((y % cell) + 0.5) / cell;
        const warp = Math.sin(Math.PI * tx);
        const weft = Math.sin(Math.PI * ty);
        const warpOver = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
        const height = warpOver ? Math.max(warp * (0.65 + 0.35 * weft), weft * 0.45) : Math.max(weft * (0.65 + 0.35 * warp), warp * 0.45);
        const value = Math.round(40 + height * 200);
        const k = (y * size + x) * 4;
        image.data[k] = value;
        image.data[k + 1] = value;
        image.data[k + 2] = value;
        image.data[k + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatU, repeatV);
  texture.anisotropy = 4;
  return texture;
}

/** Grade do mês na folha do calendário (janeiro de 2027 começa numa sexta). */
function createMonthTexture(aspect: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = Math.max(128, Math.round(1024 / aspect));
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const { width: w, height: h } = canvas;
    const family = fontFamily();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    const headH = h * 0.2;
    const x0 = w * 0.02;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = "#121212";
    ctx.font = `800 ${Math.round(headH * 0.62)}px ${family}`;
    ctx.fillText("JANEIRO", x0, headH * 0.55);
    ctx.textAlign = "right";
    ctx.fillStyle = "#9a9a9a";
    ctx.font = `600 ${Math.round(headH * 0.45)}px ${family}`;
    ctx.fillText("2027", w - x0, headH * 0.55);
    ctx.fillStyle = "#e4e4e4";
    ctx.fillRect(x0, headH, w - x0 * 2, Math.max(2, h * 0.008));
    const gridTop = headH + h * 0.03;
    const rowH = (h - gridTop) / 7;
    const colW = (w - x0 * 2) / 7;
    ctx.textAlign = "center";
    ["D", "S", "T", "Q", "Q", "S", "S"].forEach((day, i) => {
      ctx.fillStyle = i === 0 ? "#e02018" : "#7a7a7a";
      ctx.font = `700 ${Math.round(rowH * 0.5)}px ${family}`;
      ctx.fillText(day, x0 + colW * (i + 0.5), gridTop + rowH * 0.5);
    });
    ctx.font = `500 ${Math.round(rowH * 0.55)}px ${family}`;
    for (let day = 1; day <= 31; day += 1) {
      const index = 5 + day - 1;
      const col = index % 7;
      ctx.fillStyle = col === 0 ? "#e02018" : "#222222";
      ctx.fillText(String(day), x0 + colW * (col + 0.5), gridTop + rowH * (Math.floor(index / 7) + 1.5));
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function useDisposable<T extends { dispose: () => void }>(value: T) {
  useEffect(() => () => value.dispose(), [value]);
}

/* ------------------------------------------------------------------ peças comuns */

function usePlateCleanup(plate: Plate) {
  useGeometryCleanup(plate.body);
  useGeometryCleanup(plate.face);
}

/** Caixa de cantos e arestas boleados (sem RoundedBox do drei): extrusão com chanfro. */
function SoftBox({ size, radius, bevel, position, rotation, renderOrder, children }: { size: V3; radius: number; bevel: number; position?: V3; rotation?: V3; renderOrder?: number; children: ReactNode }) {
  const [sx, sy, sz] = size;
  const geometry = useMemo(() => {
    const b = Math.min(bevel, sx * 0.3, sy * 0.3, sz * 0.3);
    return extrudeBody(roundedRect(sx - 2 * b, sy - 2 * b, radius - b), sz, b, 4);
  }, [sx, sy, sz, radius, bevel]);
  useGeometryCleanup(geometry);
  return (
    <mesh geometry={geometry} position={position} rotation={rotation} renderOrder={renderOrder}>
      {children}
    </mesh>
  );
}

/** Várias cópias de uma geometria numa só chamada de desenho (grampos, argolas do wire-o). */
function Instances({ geometry, matrices, children }: { geometry: THREE.BufferGeometry; matrices: THREE.Matrix4[]; children: ReactNode }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  // A geometria entra nas dependências: se ela mudar, o R3F recria a malha e as matrizes precisam voltar.
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices, geometry]);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, Math.max(matrices.length, 1)]} count={matrices.length}>
      {children}
    </instancedMesh>
  );
}

type StandoffSize = { capR: number; capH: number; barrelR: number; barrelL: number; inset: number };

function standoffSize(scale: number, w: number, h: number): StandoffSize {
  const capR = Math.min(Math.max(0.95 * scale, 0.03), Math.min(w, h) * 0.06);
  return { capR, capH: capR * 0.95, barrelR: capR * 0.68, barrelL: Math.max(2 * scale, capR * 2), inset: Math.max(2.4 * scale, capR * 1.9) };
}

/** Espaçadores de inox: tampa boleada na frente, corpo cilíndrico atrás até a parede. */
function StandoffSet({ points, front, back, size }: { points: [number, number][]; front: number; back: number; size: StandoffSize }) {
  const cap = useMemo(() => latheZ(capProfile(size.capR, size.capH)), [size.capR, size.capH]);
  const barrel = useMemo(() => latheZ(barrelProfile(size.barrelR, size.barrelL)), [size.barrelR, size.barrelL]);
  useGeometryCleanup(cap);
  useGeometryCleanup(barrel);
  return (
    <>
      {points.map(([x, y]) => (
        <group key={`${x.toFixed(4)}:${y.toFixed(4)}`} position={[x, y, 0]}>
          <mesh geometry={cap} position-z={front}>
            <meshStandardMaterial color={STEEL} metalness={1} roughness={0.26} />
          </mesh>
          <mesh geometry={barrel} position-z={back} rotation-x={Math.PI}>
            <meshStandardMaterial color={STEEL} metalness={1} roughness={0.34} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** Argola de chaveiro: duas voltas de arame em hélice, pontas arredondadas. */
function SplitRing({ radius, wire, color, position, rotation }: { radius: number; wire: number; color: string; position?: V3; rotation?: V3 }) {
  const rise = wire * 2.1 * RING_TURNS;
  const geometry = useMemo(() => new THREE.TubeGeometry(new HelixCurve(radius, RING_TURNS, rise), 220, wire, 10, false), [radius, wire, rise]);
  const tip = useMemo(() => new THREE.SphereGeometry(wire, 12, 8), [wire]);
  useGeometryCleanup(geometry);
  useGeometryCleanup(tip);
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={geometry}>
        <meshStandardMaterial color={color} metalness={1} roughness={0.2} />
      </mesh>
      {/* Tampa as pontas abertas do tubo. */}
      <mesh geometry={tip} position={[radius, 0, -rise / 2]}>
        <meshStandardMaterial color={color} metalness={1} roughness={0.2} />
      </mesh>
      <mesh geometry={tip} position={[radius, 0, rise / 2]}>
        <meshStandardMaterial color={color} metalness={1} roughness={0.2} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ placas (PVC, PS, XPS) */

type PanelLook = { edge: string; edgeRoughness: number; back: string; bevelCm: number; radiusCm: number };

/** Material pela espessura: XPS (≥ 15 mm, espuma), PVC expandido (4–10 mm) ou PS/polionda (fino). */
function panelLook(depthCm: number): PanelLook {
  if (depthCm >= 1.5) return { edge: "#f1efe8", edgeRoughness: 0.97, back: "#ebe9e2", bevelCm: 0.35, radiusCm: 0.5 };
  if (depthCm >= 0.4) return { edge: "#fafaf8", edgeRoughness: 0.82, back: "#f3f3f1", bevelCm: 0.1, radiusCm: 0.2 };
  return { edge: "#f3f4f5", edgeRoughness: 0.45, back: "#efefef", bevelCm: 0.04, radiusCm: 0.12 };
}

function usePanelPlate(spec: MockupSpec, w: number, h: number, scale: number) {
  const look = panelLook(spec.depthCm);
  const d = Math.max(spec.depthCm * scale, 0.008);
  const b = Math.min(look.bevelCm * scale, d * 0.3);
  const r = Math.max(look.radiusCm * scale, b + 0.002);
  const plate = useMemo<Plate>(() => {
    const shape = roundedRect(w - 2 * b, h - 2 * b, r - b);
    return { body: extrudeBody(shape, d, b), face: printFace(shape, w, h) };
  }, [w, h, d, b, r]);
  usePlateCleanup(plate);
  return { plate, look, d };
}

/** Chapa com borda do material e a arte na face da frente (a impressão cobre a face, a borda fica crua). */
function PanelPlate({ plate, look, d, map, spec, eps = 0.0012 }: { plate: Plate; look: PanelLook; d: number; map: THREE.Texture; spec: MockupSpec; eps?: number }) {
  return (
    <group>
      <mesh geometry={plate.body}>
        <meshStandardMaterial attach="material-0" color={look.back} roughness={0.86} />
        <meshStandardMaterial attach="material-1" color={look.edge} roughness={look.edgeRoughness} />
      </mesh>
      <mesh geometry={plate.face} position-z={d / 2 + eps}>
        <PrintMaterial map={map} spec={spec} />
      </mesh>
    </group>
  );
}

/**
 * Placa rígida impressa (PVC expandido, PS, polionda, XPS). A espessura escolhe o material e a montagem:
 * chapas finas e PVC em espaçadores de inox; XPS grosso flutuando na parede com sarrafo oculto.
 * Variantes: mosaico (arte dividida em placas sobre a parede), porteiro (aviso de maçaneta em couchê),
 * placa pet (osso em PVC com argola) e de mesa (cavalete de PS ou base de madeira com rasgo).
 */
export function PanelModel(props: ModelProps) {
  switch (props.spec.variant) {
    case "mosaic":
      return <MosaicPanel {...props} />;
    case "door-sign":
      return <DoorHanger {...props} />;
    case "pet-tag":
      return <PetTag {...props} />;
    case "desk":
      return props.spec.depthCm < 0.4 ? <EaselPanel {...props} /> : <BlockPanel {...props} />;
    default:
      return <WallPanel {...props} />;
  }
}

function WallPanel({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const { plate, look, d } = usePanelPlate(spec, w, h, scale);
  const thick = spec.depthCm >= 1.5;
  const size = standoffSize(scale, w, h);
  const [lw, lh] = sizeLabels(spec);
  const cleatH = Math.max(3 * scale, 0.05);
  const cleatD = Math.max(1.2 * scale, 0.02);
  return (
    <group rotation={[-0.05, 0.32, 0]}>
      <PanelPlate plate={plate} look={look} d={d} map={front} spec={spec} />
      {thick ? (
        // XPS: sarrafo de alumínio escondido atrás, a placa "flutua" na parede.
        <SoftBox size={[w * 0.55, cleatH, cleatD]} radius={cleatH * 0.15} bevel={cleatD * 0.15} position={[0, h / 2 - cleatH * 2, -d / 2 - cleatD / 2]}>
          <meshStandardMaterial color="#b8bcc1" metalness={0.85} roughness={0.4} />
        </SoftBox>
      ) : (
        <StandoffSet points={corners(w, h, size.inset)} front={d / 2 + 0.0012} back={-d / 2} size={size} />
      )}
      {showDims && <Dimensions w={w} h={h} z={d / 2 + (thick ? 0.01 : size.capH)} labelW={lw} labelH={lh} />}
    </group>
  );
}

/** Quadro mosaico: a mesma arte cortada em placas com frestas, coladas (fita VHB) numa parede. */
function MosaicPanel({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec, 2.5);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const look = panelLook(spec.depthCm);
  const d = Math.max(spec.depthCm * scale, 0.008);
  const b = Math.min(look.bevelCm * scale, d * 0.3);
  const r = Math.max(look.radiusCm * scale, b + 0.002);
  const cols = Math.max(2, Math.round(spec.widthCm / 34));
  const rows = Math.max(2, Math.round(spec.heightCm / 34));
  const gap = Math.max(1.6 * scale, 0.02);
  const plate = useMemo<Plate>(() => {
    const tileW = (w - gap * (cols - 1)) / cols;
    const tileH = (h - gap * (rows - 1)) / rows;
    const shapes: THREE.Shape[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const cx = -w / 2 + tileW / 2 + col * (tileW + gap);
        const cy = -h / 2 + tileH / 2 + row * (tileH + gap);
        shapes.push(roundedRect(tileW - 2 * b, tileH - 2 * b, r - b, cx, cy));
      }
    }
    return { body: extrudeBody(shapes, d, b), face: printFace(shapes, w, h) };
  }, [w, h, d, b, r, cols, rows, gap]);
  usePlateCleanup(plate);
  const margin = Math.max(w, h) * 0.09;
  const wallD = 0.06;
  const spacer = Math.max(0.3 * scale, 0.008);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[0, 0.28, 0]}>
      {/* Parede pintada: dá contexto às frestas entre as placas. */}
      <SoftBox size={[w + margin * 2, h + margin * 2, wallD]} radius={0.01} bevel={0.006} position={[0, 0, -d / 2 - spacer - wallD / 2]}>
        <meshStandardMaterial color="#e6e2da" roughness={0.96} />
      </SoftBox>
      <PanelPlate plate={plate} look={look} d={d} map={front} spec={spec} />
      {showDims && <Dimensions w={w} h={h} z={d / 2 + 0.01} labelW={lw} labelH={lh} />}
    </group>
  );
}

/** Display de mesa em PS fino: placa inclinada sustentada por um pé (cavalete) do mesmo PS atrás. */
function EaselPanel({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec, 2.3);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const { plate, look, d } = usePanelPlate(spec, w, h, scale);
  const lean = 0.22;
  const attach = h * 0.62;
  const p: [number, number] = [attach * Math.cos(lean) - (d / 2) * Math.sin(lean), -attach * Math.sin(lean) - (d / 2) * Math.cos(lean)];
  const foot: [number, number] = [0, p[1] - attach * 0.5];
  const strutL = Math.hypot(p[0] - foot[0], p[1] - foot[1]);
  const strutAngle = Math.atan2(p[1] - foot[1], p[0] - foot[0]);
  const strut = useMemo(() => {
    const top = w * 0.15;
    const bottom = w * 0.19;
    const s = new THREE.Shape();
    s.moveTo(-bottom, 0);
    s.lineTo(bottom, 0);
    s.lineTo(top, strutL);
    s.lineTo(-top, strutL);
    s.closePath();
    return extrudeBody(s, d, Math.min(d * 0.25, 0.003));
  }, [w, strutL, d]);
  useGeometryCleanup(strut);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[0, 0.42, 0]}>
      <group rotation-x={-lean}>
        <group position-y={h / 2}>
          <PanelPlate plate={plate} look={look} d={d} map={front} spec={spec} />
          {showDims && <Dimensions w={w} h={h} z={d / 2 + 0.01} labelW={lw} labelH={lh} />}
        </group>
      </group>
      {/* Pé articulado: sobe do apoio na mesa até as costas da placa. */}
      <group position={[0, foot[0], foot[1]]} rotation-x={strutAngle}>
        <mesh geometry={strut} position-z={-d / 2}>
          <meshStandardMaterial color={look.edge} roughness={0.55} />
        </mesh>
      </group>
    </group>
  );
}

/** Quadro de mesa em PVC: encaixado no rasgo de uma base de carvalho. */
function BlockPanel({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec, 2.3);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const { plate, look, d } = usePanelPlate(spec, w, h, scale);
  const baseW = w * 1.06 + 0.06;
  const baseH = Math.max(2.2 * scale, 0.14);
  const baseD = Math.max(5 * scale, d * 8, 0.32);
  const sink = Math.min(0.8 * scale, baseH * 0.45);
  const base = useMemo(() => barGeometry(baseW, baseH, baseD, baseH * 0.18, baseH * 0.1), [baseW, baseH, baseD]);
  useGeometryCleanup(base);
  // Repetição em cm (a cena muda de escala com o tamanho): ~11 veios por cm, ondas a cada ~12 cm.
  const wood = useMemo(() => createWoodTexture(OAK, 11, 0.12 / scale, 0.08 / scale), [scale]);
  useDisposable(wood);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[0, 0.38, 0]}>
      <mesh geometry={base} position-y={baseH / 2}>
        <meshStandardMaterial map={wood} roughness={0.62} />
      </mesh>
      {/* Rasgo da base, escuro, em volta da placa. */}
      <SoftBox size={[w + 0.012, d * 1.3 + 0.006, 0.004]} radius={0.002} bevel={0} position={[0, baseH + 0.0005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color="#2a1c10" roughness={0.9} />
      </SoftBox>
      <group position-y={baseH - sink} rotation-x={-0.06}>
        <group position-y={h / 2}>
          <PanelPlate plate={plate} look={look} d={d} map={front} spec={spec} />
          {showDims && <Dimensions w={w} h={h} z={d / 2 + 0.01} labelW={lw} labelH={lh} />}
        </group>
      </group>
    </group>
  );
}

/**
 * Contorno do aviso de porta: retângulo com furo para a maçaneta e a fenda diagonal que leva até a borda.
 * O furo faz parte do contorno (a fenda o abre), por isso é percorrido no sentido horário.
 */
function doorHangerShape(w: number, h: number, holeR: number, holeY: number, corner: number) {
  const theta = -0.62;
  const half = Math.asin(Math.min(0.9, 0.06 / holeR));
  const dx = Math.cos(theta);
  const dy = Math.sin(theta);
  const a = new THREE.Vector2(holeR * Math.cos(theta - half), holeY + holeR * Math.sin(theta - half));
  const b = new THREE.Vector2(holeR * Math.cos(theta + half), holeY + holeR * Math.sin(theta + half));
  const ae = new THREE.Vector2(w / 2, a.y + ((w / 2 - a.x) / dx) * dy);
  const be = new THREE.Vector2(w / 2, b.y + ((w / 2 - b.x) / dx) * dy);
  const r = corner;
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.absarc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(ae.x, ae.y);
  s.lineTo(a.x, a.y);
  s.absarc(0, holeY, holeR, theta - half, theta + half, true);
  s.lineTo(be.x, be.y);
  s.absarc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2, false);
  s.absarc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI, false);
  s.absarc(-w / 2 + r, -h / 2 + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** Porteiro: aviso de maçaneta em couchê 300 g pendurado numa porta de madeira com maçaneta de alavanca. */
function DoorHanger({ spec, art, label, showDims }: ModelProps) {
  // Medidas em cm; o grupo escala para a cena. O porteiro é sempre em pé (8,2 × 22).
  const W = Math.max(Math.min(spec.widthCm, spec.heightCm), 1);
  const H = Math.max(spec.widthCm, spec.heightCm, W * 1.6);
  const holeR = W * 0.22;
  const holeY = H / 2 - W * 0.36;
  const { neckR, neckL, roseT, leverL } = HANDLE;
  const hangZ = roseT + neckL * 0.42;
  const reach = holeY + holeR + H / 2;
  const tilt = Math.asin(Math.min(hangZ / reach, 0.5));
  const bottom = neckR - reach * Math.cos(tilt);
  const door = { left: -13.5, right: 6.5, top: 11, bottom: bottom - 7, depth: 4 };
  const doorH = door.top - door.bottom;
  const U = 2.7 / doorH;
  const eps = 0.0012 / U;
  const front = useArtTexture(W / H, "front", art, label);
  const plate = useMemo<Plate>(() => {
    const shape = doorHangerShape(W, H, holeR, holeY, Math.min(0.5, W * 0.06));
    return { body: extrudeBody(shape, PAPER_CM, 0, 12), face: printFace(shape, W, H, 12) };
  }, [W, H, holeR, holeY]);
  usePlateCleanup(plate);
  const rose = useMemo(() => latheZ(capProfile(HANDLE.roseR, HANDLE.roseT)), []);
  const neck = useMemo(() => latheZ(barrelProfile(HANDLE.neckR, HANDLE.neckL + 0.2)), []);
  useGeometryCleanup(rose);
  useGeometryCleanup(neck);
  const wood = useMemo(() => createWoodTexture(WALNUT_DOOR, 5, 0.09, 0.022), []);
  useDisposable(wood);
  const [lw, lh] = sizeLabels(spec);
  const labels: [string, string] = spec.widthCm > spec.heightCm ? [lh, lw] : [lw, lh];
  const paperLook: PanelLook = { edge: "#f7f7f5", edgeRoughness: 0.9, back: "#f7f7f5", bevelCm: 0, radiusCm: 0 };
  return (
    <group rotation-y={-0.38}>
      <group scale={U}>
        <SoftBox size={[door.right - door.left, doorH, door.depth]} radius={0.4} bevel={0.2} position={[(door.left + door.right) / 2, (door.top + door.bottom) / 2, -door.depth / 2]}>
          <meshStandardMaterial map={wood} roughness={0.55} />
        </SoftBox>
        {/* Maçaneta de alavanca preta fosca: roseta, pescoço e alavanca. */}
        <mesh geometry={rose}>
          <meshStandardMaterial color="#232325" metalness={0.7} roughness={0.34} />
        </mesh>
        <mesh geometry={neck} position-z={roseT - 0.1}>
          <meshStandardMaterial color="#232325" metalness={0.7} roughness={0.34} />
        </mesh>
        <SoftBox size={[leverL, 1.8, 1.1]} radius={0.85} bevel={0.3} position={[-leverL / 2 + 0.7, 0, roseT + neckL - 0.4]}>
          <meshStandardMaterial color="#232325" metalness={0.7} roughness={0.3} />
        </SoftBox>
        <group position={[0, neckR, hangZ]} rotation-x={tilt}>
          <group position-y={-(holeY + holeR)}>
            <PanelPlate plate={plate} look={paperLook} d={PAPER_CM} map={front} spec={spec} eps={eps} />
          </group>
        </group>
      </group>
      {showDims && (
        <group position={[0, neckR * U, hangZ * U]} rotation-x={tilt}>
          <group position-y={-(holeY + holeR) * U}>
            <Dimensions w={W * U} h={H * U} z={0.01} labelW={labels[0]} labelH={labels[1]} />
          </group>
        </group>
      )}
    </group>
  );
}

/** Contorno de osso: barra central e quatro lóbulos que se cruzam nas pontas. */
function boneShape(w: number, h: number) {
  const rl = h * 0.3;
  const cy = h / 2 - rl;
  const cx = w / 2 - rl;
  const hb = h * 0.22;
  const notch = Math.asin(cy / rl);
  const join = Math.asin((hb - cy) / rl);
  const s = new THREE.Shape();
  s.moveTo(cx + rl * Math.cos(notch), 0);
  s.absarc(cx, cy, rl, -notch, Math.PI - join, false);
  s.absarc(-cx, cy, rl, join, Math.PI + notch, false);
  s.absarc(-cx, -cy, rl, Math.PI - notch, Math.PI * 2 - join, false);
  s.absarc(cx, -cy, rl, Math.PI + join, Math.PI * 2 + notch, false);
  return { shape: s, holeX: -cx };
}

/** Placa de identificação pet: osso de PVC 5 mm deitado, com argola de aço passando pelo furo. */
function PetTag({ spec, art, label, showDims }: ModelProps) {
  const W = Math.max(spec.widthCm, spec.heightCm, 1);
  const H = Math.max(Math.min(spec.widthCm, spec.heightCm), 0.5);
  const d = Math.max(spec.depthCm, 0.2);
  const b = Math.min(0.07, d * 0.3);
  const U = 2.3 / W;
  const holeR = H * 0.085;
  const front = useArtTexture(W / H, "front", art, label);
  const { plate, holeX } = useMemo(() => {
    const bone = boneShape(W - 2 * b, H - 2 * b);
    const hole = new THREE.Path();
    hole.absarc(bone.holeX, 0, holeR, 0, Math.PI * 2, true);
    bone.shape.holes.push(hole);
    const result: Plate = { body: extrudeBody(bone.shape, d, b, 10), face: printFace(bone.shape, W, H, 10) };
    return { plate: result, holeX: bone.holeX };
  }, [W, H, d, b, holeR]);
  usePlateCleanup(plate);
  // Argolinha em pé: entra pelo furo, abraça a ponta do osso e passa por baixo dela (a peça apoia no arame).
  const jumpR = Math.max(H * 0.2, d * 0.75);
  const jumpWire = H * 0.017;
  const jumpZ = -d / 2 - jumpWire + jumpR;
  const crossTop = Math.sqrt(Math.max(jumpR ** 2 - (d / 2 - jumpZ) ** 2, 0));
  const crossBottom = Math.sqrt(Math.max(jumpR ** 2 - (-d / 2 - jumpZ) ** 2, 0));
  const jumpX = holeX - (crossTop + crossBottom) / 2;
  // Argola dupla deitada na mesa, enfiada na argolinha do lado de fora do osso.
  const splitR = H * 0.36;
  const splitWire = H * 0.022;
  const splitRise = splitWire * 2.1 * RING_TURNS;
  const floor = -d / 2 - 2 * jumpWire;
  const jump = useMemo(() => loopGeometry(jumpR, jumpR, jumpWire), [jumpR, jumpWire]);
  useGeometryCleanup(jump);
  const metal = metalColor(spec.metal);
  const look: PanelLook = { edge: "#fbfbf9", edgeRoughness: 0.8, back: "#f3f3f1", bevelCm: b, radiusCm: 0 };
  const [lw, lh] = sizeLabels(spec);
  const labels: [string, string] = spec.widthCm < spec.heightCm ? [lh, lw] : [lw, lh];
  return (
    <group rotation-y={0.3} userData={{ view: { elevation: 0.85 } }}>
      <group rotation-x={-Math.PI / 2} scale={U}>
        <PanelPlate plate={plate} look={look} d={d} map={front} spec={spec} eps={0.0012 / U} />
        <mesh geometry={jump} position={[jumpX, 0, jumpZ]} rotation-x={Math.PI / 2}>
          <meshStandardMaterial color={metal} metalness={1} roughness={0.2} />
        </mesh>
        <SplitRing radius={splitR} wire={splitWire} color={metal} position={[jumpX - jumpR * 0.85 - splitR, 0, floor + splitRise / 2 + splitWire]} />
      </group>
      {showDims && (
        <group rotation-x={-Math.PI / 2}>
          <Dimensions w={W * U} h={H * U} z={(d / 2) * U + 0.01} labelW={labels[0]} labelH={labels[1]} />
        </group>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ acrílico */

function useAcrylicPlate(w: number, h: number, d: number, radius: number) {
  const plate = useMemo<Plate>(() => {
    const b = d * 0.22;
    const shape = roundedRect(w - 2 * b, h - 2 * b, radius - b);
    return { body: extrudeBody(shape, d, b), face: printFace(shape, w, h) };
  }, [w, h, d, radius]);
  usePlateCleanup(plate);
  return plate;
}

/** Chapa de acrílico com impressão UV no verso (lida através da chapa) e camada de branco atrás. */
function AcrylicSheet({ plate, d, map, spec, eps = 0.0012 }: { plate: Plate; d: number; map: THREE.Texture; spec: MockupSpec; eps?: number }) {
  return (
    <group>
      <mesh geometry={plate.face} position-z={-d / 2 + eps}>
        <PrintMaterial map={map} spec={{ ...spec, clearcoat: 0, spotVarnish: false }} />
      </mesh>
      <mesh geometry={plate.face} position-z={-d / 2 - eps * 0.6} rotation-y={Math.PI}>
        <meshStandardMaterial color="#f4f4f2" roughness={0.6} />
      </mesh>
      <mesh geometry={plate.body} renderOrder={1}>
        <AcrylicMaterials />
      </mesh>
    </group>
  );
}

/**
 * Acrílico com impressão UV no verso: chapa de borda polida (faces quase invisíveis, bordas esverdeadas)
 * e a arte por trás. Padrão: quadro na parede com espaçadores de inox. Variantes: display de mesa em L
 * (chapa grossa colada num pé) e calendário (bloco de acrílico com chapa e folhas em wire-o).
 */
export function AcrylicModel(props: ModelProps) {
  if (props.spec.variant === "calendar") return <AcrylicCalendar {...props} />;
  if (props.spec.variant === "desk") return <AcrylicDesk {...props} />;
  return <AcrylicWall {...props} />;
}

function AcrylicWall({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec);
  const d = Math.max(spec.depthCm * scale, 0.022);
  const plate = useAcrylicPlate(w, h, d, Math.max(0.35 * scale, 0.02));
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const size = standoffSize(scale, w, h);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[-0.05, 0.34, 0]}>
      <AcrylicSheet plate={plate} d={d} map={front} spec={spec} />
      <StandoffSet points={corners(w, h, size.inset)} front={d / 2} back={-d / 2} size={size} />
      {showDims && <Dimensions w={w} h={h} z={d / 2 + size.capH} labelW={lw} labelH={lh} />}
    </group>
  );
}

function AcrylicDesk({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec, 2.3);
  const d = Math.max(spec.depthCm * scale, 0.03);
  const r = Math.max(0.4 * scale, 0.02);
  const plate = useAcrylicPlate(w, h, d, r);
  const footD = Math.max(h * 0.3, 7 * scale);
  const foot = useMemo(() => {
    const b = d * 0.22;
    const g = extrudeBody(roundedRect(w - 2 * b, footD - 2 * b, r - b), d, b);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [w, footD, d, r]);
  useGeometryCleanup(foot);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[0, 0.4, 0]}>
      {/* Pé em L, colado na base da chapa e estendido para trás. */}
      <mesh geometry={foot} position={[0, d / 2, d / 2 - footD / 2]} renderOrder={1}>
        <AcrylicMaterials />
      </mesh>
      <group position-y={d} rotation-x={-0.07}>
        <group position-y={h / 2}>
          <AcrylicSheet plate={plate} d={d} map={front} spec={spec} />
          {showDims && <Dimensions w={w} h={h} z={d / 2 + 0.01} labelW={lw} labelH={lh} />}
        </group>
      </group>
    </group>
  );
}

const CAL_PHOTO: [number, number] = [21.5, 16];

/** Calendário de mesa: bloco de acrílico com rasgo, chapa inclinada e o bloco de folhas em wire-o na frente. */
function AcrylicCalendar({ spec, art, label, showDims }: ModelProps) {
  // Medidas em cm; o grupo escala para a cena.
  const bw = Math.max(spec.widthCm, 10);
  const bh = Math.max(spec.heightCm, 12);
  const t = Math.max(spec.depthCm, 0.3);
  const U = 2.6 / bh;
  const eps = 0.0012 / U;
  const pw = bw - 1.5;
  const ph = bh * 0.9;
  const stack = 0.25;
  const photoH = Math.min(pw * (CAL_PHOTO[1] / CAL_PHOTO[0]), ph * 0.62);
  const gridTop = bh - 1.3 - photoH - 0.5;
  const gridBottom = bh - ph + 0.7;
  const gridW = pw - 1.6;
  const gridH = Math.max(gridTop - gridBottom, 1);
  const block = { w: bw + 2, d: 6, h: 2.6 };
  const sink = 1.2;
  const lean = -0.16;
  const pageZ = t / 2 + 0.02 + stack / 2;
  const faceZ = t / 2 + 0.02 + stack + eps;
  const ring = { r: 0.55, wire: 0.06, pitch: 0.847 };
  const ringZ = (-t / 2 + t / 2 + 0.02 + stack) / 2;

  const photo = useArtTexture(pw / photoH, "front", art, label);
  const month = useMemo(() => createMonthTexture(gridW / gridH), [gridW, gridH]);
  useDisposable(month);
  const board = useMemo(() => extrudeBody(roundedRect(bw - t * 0.44, bh - t * 0.44, 0.6), t, t * 0.22), [bw, bh, t]);
  const base = useMemo(() => extrudeBody(roundedRect(block.w - 0.6, block.h - 0.6, 0.4), block.d, 0.3), [block.w, block.h, block.d]);
  useGeometryCleanup(board);
  useGeometryCleanup(base);
  const loop = useMemo(() => new THREE.TorusGeometry(ring.r, ring.wire, 8, 28), [ring.r, ring.wire]);
  useGeometryCleanup(loop);
  const loops = useMemo(() => {
    const span = pw - 1.2;
    const pairs = Math.max(1, Math.floor(span / ring.pitch));
    const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
    const one = new THREE.Vector3(1, 1, 1);
    const list: THREE.Matrix4[] = [];
    for (let i = 0; i < pairs; i += 1) {
      const x = -((pairs - 1) * ring.pitch) / 2 + i * ring.pitch;
      // Cada laço passa pelo furo (0,5 cm abaixo do topo) e contorna a borda de cima da chapa e das folhas.
      for (const dx of [-0.12, 0.12]) list.push(new THREE.Matrix4().compose(new THREE.Vector3(x + dx, bh - 0.5 + ring.r, ringZ), turn, one));
    }
    return list;
  }, [pw, bh, ringZ, ring.pitch, ring.r]);
  const [lw, lh] = sizeLabels(spec);
  const metal = metalColor(spec.metal);
  return (
    <group rotation-y={0.36}>
      <group scale={U}>
        <mesh geometry={base} position={[0, block.h / 2, 0]} renderOrder={2}>
          <AcrylicMaterials />
        </mesh>
        <group position={[0, block.h - sink, -block.d * 0.12]} rotation-x={lean}>
          <mesh geometry={board} position-y={bh / 2} renderOrder={1}>
            <AcrylicMaterials />
          </mesh>
          {/* Bloco de folhas (couchê) apoiado na chapa. */}
          <SoftBox size={[pw, ph, stack]} radius={0.25} bevel={0.04} position={[0, bh - ph / 2, pageZ]}>
            <meshStandardMaterial color="#f6f5f1" roughness={0.9} />
          </SoftBox>
          <mesh position={[0, bh - 1.3 - photoH / 2, faceZ]}>
            <planeGeometry args={[pw, photoH]} />
            <PrintMaterial map={photo} spec={spec} />
          </mesh>
          <mesh position={[0, (gridTop + gridBottom) / 2, faceZ]}>
            <planeGeometry args={[gridW, gridH]} />
            <meshStandardMaterial map={month} roughness={0.85} />
          </mesh>
          <Instances geometry={loop} matrices={loops}>
            <meshStandardMaterial color={metal} metalness={1} roughness={0.22} />
          </Instances>
        </group>
      </group>
      {showDims && (
        <group position={[0, (block.h - sink) * U, -block.d * 0.12 * U]} rotation-x={lean}>
          <group position-y={(bh / 2) * U}>
            <Dimensions w={bw * U} h={bh * U} z={(t / 2 + stack + 0.3) * U} labelW={lw} labelH={lh} />
          </group>
        </group>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ chaveiro */

/** Contorno do chaveiro com a orelha do furo em cima (retângulo boleado ou redondo/oval). */
function keychainOutline(round: boolean, w: number, h: number, r: number, tabR: number, holeR: number) {
  const s = new THREE.Shape();
  let tabY: number;
  let R = tabR;
  if (round) {
    const a = w / 2;
    const t0 = Math.acos(Math.min(tabR / a, 0.9));
    tabY = (h / 2) * Math.sin(t0);
    R = a * Math.cos(t0);
    s.moveTo(R, tabY);
    s.absarc(0, tabY, R, 0, Math.PI, false);
    s.absellipse(0, 0, a, h / 2, Math.PI - t0, Math.PI * 2 + t0, false, 0);
  } else {
    const rr = THREE.MathUtils.clamp(r, 0.001, Math.min(w, h) * 0.45);
    R = Math.min(tabR, w / 2 - rr - 0.001);
    tabY = h / 2;
    s.moveTo(-w / 2 + rr, -h / 2);
    s.absarc(w / 2 - rr, -h / 2 + rr, rr, -Math.PI / 2, 0, false);
    s.absarc(w / 2 - rr, h / 2 - rr, rr, 0, Math.PI / 2, false);
    s.lineTo(R, h / 2);
    s.absarc(0, h / 2, R, 0, Math.PI, false);
    s.absarc(-w / 2 + rr, h / 2 - rr, rr, Math.PI / 2, Math.PI, false);
    s.absarc(-w / 2 + rr, -h / 2 + rr, rr, Math.PI, Math.PI * 1.5, false);
  }
  const holeY = tabY + R * 0.3;
  const radius = Math.min(holeR, R * 0.6);
  const hole = new THREE.Path();
  hole.absarc(0, holeY, radius, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return { shape: s, holeY, holeR: radius };
}

/**
 * Chaveiro de acrílico pendurado: chapa de borda polida com a arte UV no verso, orelha transparente com furo,
 * argolinha, dois elos e argola dupla de aço, pendente do braço de um expositor de balcão (base de carvalho,
 * haste grafite atrás da placa). Medidas reais em cm, escaladas pelo grupo.
 */
export function KeychainModel({ spec, art, label, showDims }: ModelProps) {
  const round = spec.shape === "round";
  const w = Math.max(spec.widthCm, 1);
  const h = Math.max(spec.heightCm, 1);
  const U = 1.5 / Math.max(w, h);
  const d = Math.max(spec.depthCm, 0.15);
  const b = d * 0.28;
  const radius = round ? 0 : Math.min(w, h) * 0.12;
  const eps = 0.0012 / U;
  const front = useArtTexture(w / h, "front", art, label);
  const { plate, holeTop } = useMemo(() => {
    const outline = keychainOutline(round, w - 2 * b, h - 2 * b, radius - b, KEY.tabR - b, KEY.holeR);
    const faceShape = makeShape(round ? "round" : "rect", w * 0.9, h * 0.9, radius * 0.9);
    const body: Plate = { body: extrudeBody(outline.shape, d, b, 10), face: printFace(faceShape, w * 0.9, h * 0.9, 12) };
    return { plate: body, holeTop: outline.holeY + outline.holeR };
  }, [round, w, h, d, b, radius]);
  usePlateCleanup(plate);

  // Ferragens penduradas, de baixo para cima: cada peça apoia no fio da de cima.
  const { jump, link, split } = KEY;
  const hardware = useMemo(() => ({ jump: loopGeometry(KEY.jump.r, KEY.jump.r, KEY.jump.wire), link: loopGeometry(KEY.link.rx, KEY.link.ry, KEY.link.wire) }), []);
  useGeometryCleanup(hardware.jump);
  useGeometryCleanup(hardware.link);
  const jumpY = holeTop - jump.wire + jump.r;
  const link1Y = jumpY + jump.r - jump.wire - link.wire + link.ry;
  const link2Y = link1Y + link.ry - 2 * link.wire + link.ry;
  const splitY = link2Y + link.ry - link.wire - split.wire + split.r;
  // Expositor: a argola dupla pendura no braço (o fio de cima apoia no braço), a placa fica no ar sobre a base.
  const armY = splitY + split.r - split.wire - STAND.armR;
  const baseTop = -h / 2 - STAND.gap;
  const postBottom = baseTop - 0.15;
  const postL = Math.max(armY - postBottom, 1);
  const stand = useMemo(
    () => ({
      post: new THREE.LatheGeometry(
        barrelProfile(STAND.postR, postL).map(([r, y]) => new THREE.Vector2(r, y)),
        32,
      ),
      arm: latheZ(barrelProfile(STAND.armR, STAND.tipZ - STAND.postZ), 24),
      ball: new THREE.SphereGeometry(1, 24, 16),
      base: barGeometry(STAND.base.w, STAND.base.h, STAND.base.d, 0.3, 0.16),
    }),
    [postL],
  );
  useGeometryCleanup(stand.post);
  useGeometryCleanup(stand.arm);
  useGeometryCleanup(stand.ball);
  useGeometryCleanup(stand.base);
  const wood = useMemo(() => createWoodTexture(OAK, 17, 0.12, 0.08), []);
  useDisposable(wood);
  const metal = metalColor(spec.metal);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation-y={0.42}>
      <group scale={U}>
        {/* Base de carvalho, haste e braço em metal grafite: o chaveiro pende do braço, como no balcão. */}
        <mesh geometry={stand.base} position={[0, baseTop - STAND.base.h / 2, STAND.baseZ]}>
          <meshStandardMaterial map={wood} roughness={0.6} />
        </mesh>
        <mesh geometry={stand.post} position={[0, postBottom, STAND.postZ]}>
          <meshStandardMaterial color="#26272a" metalness={0.75} roughness={0.36} />
        </mesh>
        <mesh geometry={stand.ball} position={[0, armY, STAND.postZ]} scale={STAND.postR * 1.25}>
          <meshStandardMaterial color="#26272a" metalness={0.75} roughness={0.36} />
        </mesh>
        <mesh geometry={stand.arm} position={[0, armY, STAND.postZ]}>
          <meshStandardMaterial color="#26272a" metalness={0.75} roughness={0.32} />
        </mesh>
        {/* Bolinha na ponta do braço: trava a argola. */}
        <mesh geometry={stand.ball} position={[0, armY, STAND.tipZ]} scale={STAND.armR * 1.35}>
          <meshStandardMaterial color="#26272a" metalness={0.75} roughness={0.32} />
        </mesh>
        <AcrylicSheet plate={plate} d={d} map={front} spec={spec} eps={eps} />
        <mesh geometry={hardware.jump} position-y={jumpY} rotation-y={Math.PI / 2}>
          <meshStandardMaterial color={metal} metalness={1} roughness={0.2} />
        </mesh>
        <mesh geometry={hardware.link} position-y={link1Y}>
          <meshStandardMaterial color={metal} metalness={1} roughness={0.2} />
        </mesh>
        <mesh geometry={hardware.link} position-y={link2Y} rotation-y={Math.PI / 2}>
          <meshStandardMaterial color={metal} metalness={1} roughness={0.2} />
        </mesh>
        <SplitRing radius={split.r} wire={split.wire} color={metal} position={[0, splitY, 0]} />
      </group>
      {showDims && <Dimensions w={w * U} h={h * U} z={(d / 2) * U + 0.01} labelW={lw} labelH={lh} />}
    </group>
  );
}

/* ------------------------------------------------------------------ canvas */

type CanvasShell = { front: THREE.BufferGeometry; wrap: THREE.BufferGeometry };

/**
 * Tela esticada: face da frente + dobra boleada, laterais e aba de trás numa varredura do contorno.
 * Laterais com "mirror wrap": a faixa da borda da arte se repete espelhada na lateral (e segue na aba).
 */
function canvasShell(w: number, h: number, depth: number, roll: number, lip: number): CanvasShell {
  const rc = roll * 1.4;
  const ax = w / 2 - rc;
  const ay = h / 2 - rc;
  type Sample = { cx: number; cy: number; sx: number; sy: number; nx: number; ny: number };
  const perimeter: Sample[] = [];
  const seg = 5;
  for (const [sx, sy, start] of [
    [1, 1, 0],
    [-1, 1, 0.5],
    [-1, -1, 1],
    [1, -1, 1.5],
  ]) {
    for (let i = 0; i <= seg; i += 1) {
      const a = (start + (i / seg) * 0.5) * Math.PI;
      perimeter.push({ cx: sx * ax, cy: sy * ay, sx, sy, nx: Math.cos(a), ny: Math.sin(a) });
    }
  }
  const profile: [number, number][] = [];
  const steps = 5;
  for (let j = 0; j <= steps; j += 1) {
    const phi = (j / steps) * (Math.PI / 2);
    profile.push([-roll + roll * Math.sin(phi), depth / 2 - roll + roll * Math.cos(phi)]);
  }
  const back = Math.min(roll * 0.7, depth * 0.15);
  for (let j = 0; j <= steps; j += 1) {
    const phi = (j / steps) * (Math.PI / 2);
    profile.push([-back + back * Math.cos(phi), -depth / 2 + back - back * Math.sin(phi)]);
  }
  profile.push([-lip, -depth / 2]);
  const lengths = [0];
  for (let j = 1; j < profile.length; j += 1) lengths.push(lengths[j - 1] + Math.hypot(profile[j][0] - profile[j - 1][0], profile[j][1] - profile[j - 1][1]));

  // Ponto do contorno recuado em `o`; abaixo do raio do canto, o canto vira quina viva.
  const at = (p: Sample, o: number): [number, number] => {
    const r = rc + o;
    return r >= 0 ? [p.cx + r * p.nx, p.cy + r * p.ny] : [p.sx * (w / 2 + o), p.sy * (h / 2 + o)];
  };
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const positions: number[] = [];
  const uvs: number[] = [];
  for (const p of perimeter) {
    const [x0, y0] = at(p, -roll);
    const u0 = x0 / w + 0.5;
    const v0 = y0 / h + 0.5;
    const horizontal = Math.abs(p.nx) >= Math.abs(p.ny);
    profile.forEach(([o, z], j) => {
      const [x, y] = at(p, o);
      positions.push(x, y, z);
      let u = u0;
      let v = v0;
      if (horizontal) u = p.nx > 0 ? u0 - lengths[j] / w : u0 + lengths[j] / w;
      else v = p.ny > 0 ? v0 - lengths[j] / h : v0 + lengths[j] / h;
      uvs.push(clamp01(u), clamp01(v));
    });
  }
  const n = perimeter.length;
  const m = profile.length;
  const indices: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const i2 = (i + 1) % n;
    for (let j = 0; j < m - 1; j += 1) {
      const a = i * m + j;
      const b = i2 * m + j;
      const c = i * m + j + 1;
      const d = i2 * m + j + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const wrap = new THREE.BufferGeometry();
  wrap.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  wrap.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  wrap.setIndex(indices);
  wrap.computeVertexNormals();

  const outline = new THREE.Shape(perimeter.map((p) => new THREE.Vector2(...at(p, -roll))));
  const front = printFace(outline, w, h);
  front.translate(0, 0, depth / 2);
  return { front, wrap };
}

/**
 * Quadro em canvas: tela de algodão com trama em relevo esticada num chassi de pinus. A arte cobre a frente
 * e dobra pelas laterais espelhada; por trás aparecem as barras de madeira, a aba grampeada, a travessa
 * central (peças grandes) e o gancho serrilhado.
 */
export function CanvasModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec);
  const depth = Math.max(spec.depthCm * scale, 0.05);
  const roll = Math.min(0.35 * scale, depth * 0.22);
  const barW = THREE.MathUtils.clamp(Math.min(spec.widthCm, spec.heightCm) * 0.09, 2.2, 4) * scale;
  const lip = barW * 0.62;
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const shell = useMemo(() => canvasShell(w, h, depth, roll, lip), [w, h, depth, roll, lip]);
  useGeometryCleanup(shell.front);
  useGeometryCleanup(shell.wrap);
  // Trama de ~6,7 fios por cm: fina como algodão de tela, mas sem cair abaixo de ~3 px na vista padrão (moiré).
  const weave = useMemo(() => createWeaveTexture(spec.widthCm / 1.2, spec.heightCm / 1.2), [spec.widthCm, spec.heightCm]);
  useDisposable(weave);
  const wood = useMemo(() => createWoodTexture(PINE, 3, 0.14 / scale, 0.07 / scale), [scale]);
  useDisposable(wood);

  const gap = CANVAS_GAP;
  const barD = depth - roll - 0.006;
  const barZ = -depth / 2 + 0.002 + barD / 2;
  const brace = Math.max(spec.widthCm, spec.heightCm) >= 60 ? (w >= h ? "vertical" : "horizontal") : null;
  const bars = useMemo(
    () => ({
      long: barGeometry(w - 2 * CANVAS_GAP, barW, barD, barW * 0.12, barW * 0.06),
      short: barGeometry(h - 2 * barW - 2 * CANVAS_GAP, barW, barD, barW * 0.12, barW * 0.06),
      brace: brace ? barGeometry((brace === "vertical" ? h : w) - 2 * barW - 2 * CANVAS_GAP, barW * 0.85, barD * 0.8, barW * 0.1, barW * 0.05) : null,
    }),
    [w, h, barW, barD, brace],
  );
  useGeometryCleanup(bars.long);
  useGeometryCleanup(bars.short);
  useGeometryCleanup(bars.brace);

  // Grampos na aba de trás, a cada ~8 cm.
  const staple = useMemo(() => new THREE.BoxGeometry(1.1 * scale, 0.12 * scale, 0.05 * scale), [scale]);
  useGeometryCleanup(staple);
  const staples = useMemo(() => {
    const list: THREE.Matrix4[] = [];
    const z = -depth / 2 - 0.0006;
    const one = new THREE.Vector3(1, 1, 1);
    const flat = new THREE.Quaternion();
    const turned = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
    const along = (length: number) => Math.max(3, Math.round(length / scale / 8));
    const nx = along(w);
    const ny = along(h);
    for (let i = 0; i < nx; i += 1) {
      const x = -w / 2 + barW + ((w - 2 * barW) * (i + 0.5)) / nx;
      for (const sy of [-1, 1]) list.push(new THREE.Matrix4().compose(new THREE.Vector3(x, sy * (h / 2 - lip / 2), z), flat, one));
    }
    for (let i = 0; i < ny; i += 1) {
      const y = -h / 2 + barW + ((h - 2 * barW) * (i + 0.5)) / ny;
      for (const sx of [-1, 1]) list.push(new THREE.Matrix4().compose(new THREE.Vector3(sx * (w / 2 - lip / 2), y, z), turned, one));
    }
    return list;
  }, [w, h, depth, barW, lip, scale]);
  const [lw, lh] = sizeLabels(spec);
  const sawW = Math.min(4 * scale, w * 0.2);
  return (
    <group rotation={[-0.04, 0.38, 0]}>
      {/* Relevo contido: a trama aparece na luz rasante sem granular a arte. */}
      <mesh geometry={shell.front}>
        <meshStandardMaterial map={front} bumpMap={weave} bumpScale={0.55} roughness={0.88} />
      </mesh>
      <mesh geometry={shell.wrap}>
        <meshStandardMaterial map={front} bumpMap={weave} bumpScale={0.55} roughness={0.88} />
      </mesh>
      {/* Avesso da tela, cru, entre as barras. */}
      <mesh position-z={depth / 2 - 0.003} rotation-y={Math.PI}>
        <planeGeometry args={[w - 2 * barW + 0.02, h - 2 * barW + 0.02]} />
        <meshStandardMaterial color="#e8dfcc" bumpMap={weave} bumpScale={0.6} roughness={0.95} />
      </mesh>
      <group position-z={barZ}>
        {[1, -1].map((sy) => (
          <mesh key={`h${sy}`} geometry={bars.long} position-y={sy * (h / 2 - barW / 2 - gap)}>
            <meshStandardMaterial map={wood} roughness={0.78} />
          </mesh>
        ))}
        {[1, -1].map((sx) => (
          <mesh key={`v${sx}`} geometry={bars.short} position-x={sx * (w / 2 - barW / 2 - gap)} rotation-z={Math.PI / 2}>
            <meshStandardMaterial map={wood} roughness={0.78} />
          </mesh>
        ))}
        {bars.brace && (
          <mesh geometry={bars.brace} position-z={-barD * 0.1} rotation-z={brace === "vertical" ? Math.PI / 2 : 0}>
            <meshStandardMaterial map={wood} roughness={0.78} />
          </mesh>
        )}
      </group>
      <Instances geometry={staple} matrices={staples}>
        <meshStandardMaterial color="#b9bdc2" metalness={1} roughness={0.35} />
      </Instances>
      {/* Gancho serrilhado na barra de cima. */}
      <SoftBox size={[sawW, sawW * 0.2, Math.max(0.08 * scale, 0.003)]} radius={sawW * 0.05} bevel={0} position={[0, h / 2 - lip - (barW - lip) / 2, -depth / 2 + 0.002 - Math.max(0.08 * scale, 0.003) / 2 - 0.0005]}>
        <meshStandardMaterial color="#c9ccd0" metalness={1} roughness={0.3} />
      </SoftBox>
      {showDims && <Dimensions w={w} h={h} z={depth / 2 + 0.01} labelW={lw} labelH={lh} />}
    </group>
  );
}
