"use client";

// Placas rígidas: PVC/PS/XPS (parede, mosaico, mesa, porteiro, placa pet), acrílico, chaveiro e canvas.

import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import { artAspect } from "@/lib/mockup-kinds";
import { placasDoMosaico } from "@/lib/mosaico";
import { fontFamily } from "../art";
import { useSceneMode } from "../viewer-hooks";
import { AcrylicMaterials, Dimensions, PrintMaterial, faceArtOf, fitFlat, makeShape, metalColor, sizeLabels, useArtTexture, useGeometryCleanup, type ModelProps } from "./shared";
import { DoorHook } from "./door-hook";
import { cutShape } from "./cut-path";

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
const FLAT_POSE: V3 = [0, 0, 0];

/**
 * Pose da peça: no estúdio, o 3/4 de vitrine; no ambiente, reta (na parede ou no tampo; o ambiente
 * gira a peça se precisar). `unitsPerCm` diz ao ambiente a escala real do modelo.
 */
function usePose(studio: V3): V3 {
  const { room } = useSceneMode();
  return room ? FLAT_POSE : studio;
}

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

const MONTH_NAMES = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];

/** Folha de um mês de 2027 sem arte própria: nome, iniciais da semana e os dias (domingos em vermelho). */
function createMonthTexture(aspect: number, month: number) {
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
    const x0 = w * 0.06;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = "#121212";
    ctx.font = `800 ${Math.round(headH * 0.62)}px ${family}`;
    ctx.fillText(MONTH_NAMES[month] ?? MONTH_NAMES[0], x0, headH * 0.55);
    ctx.textAlign = "right";
    ctx.fillStyle = "#9a9a9a";
    ctx.font = `600 ${Math.round(headH * 0.45)}px ${family}`;
    ctx.fillText("2027", w - x0, headH * 0.55);
    ctx.fillStyle = "#e4e4e4";
    ctx.fillRect(x0, headH, w - x0 * 2, Math.max(2, h * 0.008));
    const gridTop = headH + h * 0.03;
    const rowH = (h * 0.96 - gridTop) / 7;
    const colW = (w - x0 * 2) / 7;
    ctx.textAlign = "center";
    ["D", "S", "T", "Q", "Q", "S", "S"].forEach((day, i) => {
      ctx.fillStyle = i === 0 ? "#e02018" : "#7a7a7a";
      ctx.font = `700 ${Math.round(rowH * 0.5)}px ${family}`;
      ctx.fillText(day, x0 + colW * (i + 0.5), gridTop + rowH * 0.5);
    });
    ctx.font = `500 ${Math.round(rowH * 0.55)}px ${family}`;
    const first = new Date(Date.UTC(2027, month, 1)).getUTCDay();
    const days = new Date(Date.UTC(2027, month + 1, 0)).getUTCDate();
    for (let day = 1; day <= days; day += 1) {
      const index = first + day - 1;
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

/* ------------------------------------------------------------------ montagem (opções da variação) */

/** Montagem que a variação pede, lida nas opções escolhidas (spec.details). Nada aparece sem a opção pedir. */
type Mount = {
  /** Espaçadores de inox nos cantos. */
  standoffs: boolean;
  /** Moldura: profundidade do perfil em cm ("Moldura 2cm/3cm"), ou null sem moldura. */
  frame: number | null;
  /** Gancho serrilhado atrás ("c/ suporte de parede", "Moldura … c/ suporte"). */
  hanger: boolean;
  /** Fita dupla face VHB atrás. */
  vhb: boolean;
};

function mountOf(spec: MockupSpec): Mount {
  const details = spec.details ?? "";
  const depth = /\bmoldura (\d+(?:[.,]\d+)?) ?cm\b/.exec(details);
  const framed = /\bcom moldura\b/.test(details) || Boolean(depth);
  return {
    standoffs: /\bespacador|\bafastador|\bdistanciador/.test(details),
    frame: framed ? Number((depth?.[1] ?? "2").replace(",", ".")) : null,
    hanger: /\bsuporte\b/.test(details),
    vhb: /\b(com|c\/) fita vhb\b/.test(details),
  };
}

/** Perfil da moldura (cm): face à vista, quanto cobre da borda da chapa e quanto fica à frente dela. */
const FRAME = { face: 1.5, lip: 0.4, rise: 0.25, backing: 0.3 };

/** Medidas da moldura em cena: contorno externo, frente e fundo. */
function frameBox(w: number, h: number, front: number, depthCm: number, scale: number) {
  const face = FRAME.face * scale;
  const lip = FRAME.lip * scale;
  const top = front + FRAME.rise * scale;
  return { W: w + 2 * (face - lip), H: h + 2 * (face - lip), face, lip, top, back: top - depthCm * scale };
}

/**
 * Moldura de alumínio preto (perfil reto, como na foto do quadro) em volta da chapa, cobrindo `lip` da borda, com o
 * fundo de eucatex atrás. `front` = face da frente da chapa.
 */
function FrameMount({ w, h, front, depthCm, scale }: { w: number; h: number; front: number; depthCm: number; scale: number }) {
  const box = frameBox(w, h, front, depthCm, scale);
  const D = box.top - box.back;
  const geometry = useMemo(() => {
    const b = Math.min(0.12 * scale, D * 0.2, box.face * 0.2);
    const outline = roundedRect(box.W - 2 * b, box.H - 2 * b, Math.max(0.12 * scale, b + 0.0005) - b);
    outline.holes.push(roundedRect(w - 2 * box.lip + 2 * b, h - 2 * box.lip + 2 * b, b + 0.0005));
    return extrudeBody(outline, D, b, 4);
  }, [w, h, D, box.W, box.H, box.face, box.lip, scale]);
  useGeometryCleanup(geometry);
  const backing = FRAME.backing * scale;
  return (
    <group>
      <mesh geometry={geometry} position-z={box.top - D / 2}>
        <meshPhysicalMaterial color="#131416" metalness={0.25} roughness={0.36} clearcoat={0.5} clearcoatRoughness={0.2} />
      </mesh>
      <SoftBox size={[box.W - box.face * 0.7, box.H - box.face * 0.7, backing]} radius={0.05 * scale} bevel={0.02 * scale} position={[0, 0, box.back + backing / 2 + 0.0008]}>
        <meshStandardMaterial color="#6e5b47" roughness={0.92} />
      </SoftBox>
    </group>
  );
}

/** Gancho serrilhado de parede, colado no alto das costas (`z` = face de trás onde ele cola). */
function SawHanger({ y, z, scale }: { y: number; z: number; scale: number }) {
  const size: V3 = [4.4 * scale, 0.9 * scale, Math.max(0.12 * scale, 0.002)];
  const teeth = 9;
  return (
    <group position={[0, y, z - size[2] / 2]}>
      <SoftBox size={size} radius={size[1] * 0.12} bevel={size[2] * 0.2}>
        <meshStandardMaterial color="#c9ccd0" metalness={1} roughness={0.3} />
      </SoftBox>
      {Array.from({ length: teeth }, (_, i) => (
        <mesh key={i} position={[(i - (teeth - 1) / 2) * (size[0] / (teeth + 1)), -size[1] * 0.42, 0]} rotation-z={Math.PI / 4}>
          <boxGeometry args={[size[1] * 0.28, size[1] * 0.28, size[2] * 1.02]} />
          <meshStandardMaterial color="#c9ccd0" metalness={1} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/** Fita dupla face VHB nas costas: espuma cinza com o liner vermelho, um pedaço perto de cada canto. */
function VhbTape({ w, h, z, scale }: { w: number; h: number; z: number; scale: number }) {
  const pw = Math.min(5 * scale, w * 0.28);
  const ph = Math.min(1.9 * scale, h * 0.14);
  const t = Math.max(0.11 * scale, 0.0015);
  const inset = 2.2 * scale;
  return (
    <>
      {corners(w, h, 0).map(([x, y]) => {
        const px = x - Math.sign(x) * (pw / 2 + inset);
        const py = y - Math.sign(y) * (ph / 2 + inset);
        return (
          <group key={`${x.toFixed(3)}:${y.toFixed(3)}`} position={[px, py, z - t / 2]}>
            <mesh>
              <boxGeometry args={[pw, ph, t]} />
              <meshStandardMaterial color="#45484d" roughness={0.8} />
            </mesh>
            <mesh position-z={-t / 2 - 0.0004} rotation-y={Math.PI}>
              <planeGeometry args={[pw, ph]} />
              <meshStandardMaterial color="#c8102e" roughness={0.35} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

/** Ferragens e acabamentos atrás/em volta da chapa conforme a variação (moldura, espaçadores, VHB, gancho). */
function PlateMount({ mount, w, h, d, scale, size }: { mount: Mount; w: number; h: number; d: number; scale: number; size: StandoffSize }) {
  const framed = mount.frame !== null;
  const box = frameBox(w, h, d / 2, mount.frame ?? 2, scale);
  const backZ = framed ? box.back + 0.0008 : -d / 2;
  return (
    <>
      {framed && <FrameMount w={w} h={h} front={d / 2} depthCm={mount.frame ?? 2} scale={scale} />}
      {mount.standoffs && !framed && <StandoffSet points={corners(w, h, size.inset)} front={d / 2 + 0.0012} back={-d / 2} size={size} />}
      {mount.vhb && <VhbTape w={framed ? box.W : w} h={framed ? box.H : h} z={backZ} scale={scale} />}
      {mount.hanger && <SawHanger y={(framed ? box.H : h) / 2 - 3 * scale} z={backZ} scale={scale} />}
    </>
  );
}

/** Quanto a cota precisa sair da frente da chapa para não ficar atrás da montagem. */
function mountFront(mount: Mount, d: number, size: StandoffSize, scale: number) {
  if (mount.frame !== null) return d / 2 + FRAME.rise * scale + 0.004;
  if (mount.standoffs) return d / 2 + size.capH;
  return d / 2 + 0.01;
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
function PanelPlate({ plate, look, d, map, spec, eps = 0.0012, backMap }: { plate: Plate; look: PanelLook; d: number; map: THREE.Texture; spec: MockupSpec; eps?: number; backMap?: THREE.Texture }) {
  return (
    <group>
      <mesh geometry={plate.body}>
        <meshStandardMaterial attach="material-0" color={look.back} map={backMap ?? null} roughness={0.86} />
        <meshStandardMaterial attach="material-1" color={look.edge} roughness={look.edgeRoughness} />
      </mesh>
      <mesh geometry={plate.face} position-z={d / 2 + eps}>
        <PrintMaterial map={map} spec={spec} />
      </mesh>
    </group>
  );
}

/**
 * Placa rígida impressa (PVC expandido, PS, polionda, XPS). A montagem sai das opções da variação (moldura,
 * fita VHB, gancho de parede, espaçadores só quando a opção pede); XPS grosso flutua na parede com sarrafo oculto.
 * Variantes: mosaico (arte dividida em placas sobre a parede), porteiro (aviso de maçaneta em couchê), placa pet
 * (osso em PVC) e de mesa (PS dobrado em L ou placa de PVC em pés de acrílico).
 */
export function PanelModel(props: ModelProps) {
  switch (props.spec.variant) {
    case "mosaic":
      return <MosaicPanel {...props} />;
    case "door-sign":
      return <DoorHanger {...props} />;
    // Identificador de porta (produto novo, door-hook.tsx): gancho aberto ou furo redondo, conforme o formato.
    case "door-hook":
      return <DoorHook {...props} />;
    case "pet-tag":
      return <PetTag {...props} />;
    case "desk":
      return props.spec.depthCm < 0.4 ? <BentDisplay {...props} /> : <DeskPlaque {...props} />;
    default:
      return <WallPanel {...props} />;
  }
}

/** Passo das canaletas da polionda de 3 mm (cm). */
const FLUTE_PITCH = 0.42;

/**
 * Polionda vista pela borda: as bocas das canaletas (paredes finas entre furos escuros), e as nervuras de dentro
 * aparecendo de leve nas costas sem impressão. u corre ao longo da borda, v na espessura.
 */
function fluteTextures(repeat: number, backRepeat: number) {
  const edge = document.createElement("canvas");
  edge.width = 32;
  edge.height = 16;
  const ctx = edge.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#eef0f1";
    ctx.fillRect(0, 0, 32, 16);
    ctx.fillStyle = "#3b3f44";
    ctx.beginPath();
    ctx.roundRect(3, 3, 26, 10, 2);
    ctx.fill();
    ctx.fillStyle = "#6c7177";
    ctx.fillRect(3, 3, 26, 2);
  }
  const ribs = document.createElement("canvas");
  ribs.width = 32;
  ribs.height = 4;
  const rctx = ribs.getContext("2d");
  if (rctx) {
    rctx.fillStyle = "#ffffff";
    rctx.fillRect(0, 0, 32, 4);
    rctx.fillStyle = "#dfe2e5";
    rctx.fillRect(0, 0, 4, 4);
  }
  const make = (canvas: HTMLCanvasElement, u: number) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(u, 1);
    texture.anisotropy = 4;
    return texture;
  };
  return { edge: make(edge, repeat), back: make(ribs, backRepeat) };
}

/** Bordas de cima e de baixo da polionda com as canaletas à mostra. */
function FluteEdges({ w, h, d, map }: { w: number; h: number; d: number; map: THREE.Texture }) {
  return (
    <>
      {[1, -1].map((side) => (
        <mesh key={side} position-y={side * (h / 2 + 0.0004)} rotation-x={-side * (Math.PI / 2)}>
          <planeGeometry args={[w * 0.985, d * 0.9]} />
          <meshStandardMaterial map={map} roughness={0.6} />
        </mesh>
      ))}
    </>
  );
}

function WallPanel({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const { plate, look, d } = usePanelPlate(spec, w, h, scale);
  const thick = spec.depthCm >= 1.5;
  const mount = mountOf(spec);
  const size = standoffSize(scale, w, h);
  const polionda = /\bpolionda\b/.test(spec.details ?? "");
  const flutes = useMemo(() => (polionda ? fluteTextures(w / (FLUTE_PITCH * scale), 1 / (FLUTE_PITCH * scale)) : null), [polionda, w, scale]);
  useEffect(
    () => () => {
      flutes?.edge.dispose();
      flutes?.back.dispose();
    },
    [flutes],
  );
  const [lw, lh] = sizeLabels(spec);
  const cleatH = Math.max(3 * scale, 0.05);
  const cleatD = Math.max(1.2 * scale, 0.02);
  const pose = usePose([-0.05, 0.32, 0]);
  return (
    <group rotation={pose} userData={{ unitsPerCm: scale }}>
      <PanelPlate plate={plate} look={look} d={d} map={front} spec={spec} backMap={flutes?.back} />
      {flutes && <FluteEdges w={w} h={h} d={d} map={flutes.edge} />}
      {thick && mount.frame === null && (
        // XPS: sarrafo de alumínio escondido atrás, a placa "flutua" na parede.
        <SoftBox size={[w * 0.55, cleatH, cleatD]} radius={cleatH * 0.15} bevel={cleatD * 0.15} position={[0, h / 2 - cleatH * 2, -d / 2 - cleatD / 2]}>
          <meshStandardMaterial color="#b8bcc1" metalness={0.85} roughness={0.4} />
        </SoftBox>
      )}
      <PlateMount mount={mount} w={w} h={h} d={d} scale={scale} size={size} />
      {showDims && <Dimensions w={w} h={h} z={mountFront(mount, d, size, scale)} labelW={lw} labelH={lh} />}
    </group>
  );
}

/**
 * Quadro mosaico: placas lado a lado como no gabarito e na foto do produto (src/lib/mosaico.ts: 3 ou 5 placas, mais
 * baixas para as pontas, centradas na altura, com vão), coladas (fita VHB) numa parede. A arte é uma só e atravessa
 * todas: a textura cobre o conjunto, vãos incluídos, e cada placa mostra a parte dela.
 */
function MosaicPanel({ spec, art, label, showDims }: ModelProps) {
  const mosaico = useMemo(() => placasDoMosaico(spec.widthCm, spec.heightCm), [spec.widthCm, spec.heightCm]);
  const scale = 2.5 / Math.max(mosaico.larguraCm, mosaico.alturaCm);
  const w = mosaico.larguraCm * scale;
  const h = mosaico.alturaCm * scale;
  const front = useArtTexture(mosaico.larguraCm / mosaico.alturaCm, "front", art, label);
  const look = panelLook(spec.depthCm);
  const d = Math.max(spec.depthCm * scale, 0.008);
  const b = Math.min(look.bevelCm * scale, d * 0.3);
  const r = Math.max(look.radiusCm * scale, b + 0.002);
  const plate = useMemo<Plate>(() => {
    const shapes = mosaico.placas.map((p) => roundedRect(p.w * scale - 2 * b, p.h * scale - 2 * b, r - b, p.x * scale, p.y * scale));
    return { body: extrudeBody(shapes, d, b), face: printFace(shapes, w, h) };
  }, [mosaico, scale, w, h, d, b, r]);
  usePlateCleanup(plate);
  const margin = Math.max(w, h) * 0.09;
  const wallD = 0.06;
  const spacer = Math.max(0.3 * scale, 0.008);
  const [lw, lh] = sizeLabels(spec);
  const { room } = useSceneMode();
  return (
    <group rotation={room ? FLAT_POSE : [0, 0.28, 0]} userData={{ unitsPerCm: scale }}>
      {/* Parede pintada: dá contexto às frestas entre as placas (no ambiente, a parede é a da sala). */}
      {!room && (
        <SoftBox size={[w + margin * 2, h + margin * 2, wallD]} radius={0.01} bevel={0.006} position={[0, 0, -d / 2 - spacer - wallD / 2]}>
          <meshStandardMaterial color="#e6e2da" roughness={0.96} />
        </SoftBox>
      )}
      <PanelPlate plate={plate} look={look} d={d} map={front} spec={spec} />
      {showDims && <Dimensions w={w} h={h} z={d / 2 + 0.01} labelW={lw} labelH={lh} />}
    </group>
  );
}

/** Retângulo com os cantos de cima arredondados e a base reta (continua na dobra do display), centrado. */
function topRoundedRect(w: number, h: number, r: number) {
  const rr = THREE.MathUtils.clamp(r, 0.0005, Math.min(w, h) * 0.45);
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -h / 2);
  s.lineTo(w / 2, -h / 2);
  s.absarc(w / 2 - rr, h / 2 - rr, rr, 0, Math.PI / 2, false);
  s.absarc(-w / 2 + rr, h / 2 - rr, rr, Math.PI / 2, Math.PI, false);
  s.closePath();
  return s;
}

/**
 * Display de mesa em PS 2 mm dobrado a quente em L, como na foto do produto: a placa impressa inclinada para trás,
 * uma dobra de raio curto e o pé liso apoiado na mesa, indo para trás. Seção da dobra e do pé no plano (z, y) da
 * base da placa, extrudada na largura.
 */
function BentDisplay({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec, 2.3);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const look = panelLook(spec.depthCm);
  const d = Math.max(spec.depthCm * scale, 0.006);
  const lean = 0.2;
  const parts = useMemo(() => {
    const shape = topRoundedRect(w, h, Math.max(look.radiusCm * scale, 0.004));
    const plate: Plate = { body: extrudeBody(shape, d, 0), face: printFace(shape, w, h) };
    // Dobra: centro atrás da placa; o raio de fora é o da frente. Vira 90° + inclinação, e o pé sai na horizontal.
    const r = 0.9 * scale;
    const turn = Math.PI / 2 + lean;
    const foot = Math.max(h * 0.34, 5 * scale);
    const cz = -d / 2 - r;
    const at = (radius: number, t: number) => new THREE.Vector2(cz + radius * Math.cos(t), -radius * Math.sin(t));
    const tangent = new THREE.Vector2(-Math.sin(turn), -Math.cos(turn));
    const steps = 18;
    const outer: THREE.Vector2[] = [];
    const inner: THREE.Vector2[] = [];
    for (let k = 0; k <= steps; k += 1) {
      const t = (k / steps) * turn;
      outer.push(at(r + d, t));
      inner.push(at(r, t));
    }
    const outerEnd = outer[steps].clone().addScaledVector(tangent, foot);
    const innerEnd = inner[steps].clone().addScaledVector(tangent, foot);
    const section = new THREE.Shape([...outer, outerEnd, innerEnd, ...inner.reverse()]);
    const bend = extrudeBody(section, w, 0);
    bend.rotateY(-Math.PI / 2);
    return { plate, bend };
  }, [w, h, d, scale, look.radiusCm]);
  usePlateCleanup(parts.plate);
  useGeometryCleanup(parts.bend);
  const [lw, lh] = sizeLabels(spec);
  const pose = usePose([0, 0.5, 0]);
  return (
    <group rotation={pose} userData={{ unitsPerCm: scale }}>
      <group rotation-x={-lean}>
        <group position-y={h / 2}>
          <PanelPlate plate={parts.plate} look={look} d={d} map={front} spec={spec} />
          {showDims && <Dimensions w={w} h={h} z={d / 2 + 0.01} labelW={lw} labelH={lh} />}
        </group>
        <mesh geometry={parts.bend}>
          <meshStandardMaterial color={look.edge} roughness={look.edgeRoughness} />
        </mesh>
      </group>
    </group>
  );
}

/** Margem branca do quadro de mesa: a arte vai até 5 mm do corte (gabarito oficial). */
const PLAQUE_MARGIN = 0.5;

/**
 * Quadro de mesa em PVC 5 mm, como na foto do produto: a placa com a foto (margem branca de 5 mm do gabarito) em pé
 * em dois pés de acrílico com rasgo. Cada pé é a seção (z, y) com o rasgo no meio, extrudada na espessura.
 */
function DeskPlaque({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec, 2.3);
  const m = PLAQUE_MARGIN * scale;
  const front = useArtTexture((w - 2 * m) / (h - 2 * m), "front", art, label);
  const { plate: body, look, d } = usePanelPlate(spec, w, h, scale);
  const plate = useMemo<Plate>(() => ({ body: body.body, face: printFace(roundedRect(w - 2 * m, h - 2 * m, 0.0006), w - 2 * m, h - 2 * m) }), [body.body, w, h, m]);
  useGeometryCleanup(plate.face);
  const foot = { thick: 1.1 * scale, height: 2.4 * scale, depth: Math.max(4.6 * scale, d * 6), slot: 1.2 * scale };
  const geometry = useMemo(() => {
    // Contorno recuado pelo chanfro (extrudeBody o devolve na medida): base em y = 0, rasgo com folga para a placa.
    const b = foot.thick * 0.12;
    const x1 = foot.depth / 2 - b;
    const y1 = foot.height - b;
    const gap = d / 2 + 0.02 * scale + b;
    const floor = foot.height - foot.slot + b;
    const r = foot.height * 0.3;
    const s = new THREE.Shape();
    s.moveTo(-x1, b);
    s.lineTo(x1, b);
    s.lineTo(x1, y1 - r);
    s.quadraticCurveTo(x1, y1, x1 - r, y1);
    s.lineTo(gap, y1);
    s.lineTo(gap, floor);
    s.lineTo(-gap, floor);
    s.lineTo(-gap, y1);
    s.lineTo(-x1 + r, y1);
    s.quadraticCurveTo(-x1, y1, -x1, y1 - r);
    s.closePath();
    const g = extrudeBody(s, foot.thick, b, 8);
    g.rotateY(-Math.PI / 2);
    return g;
  }, [foot.depth, foot.height, foot.slot, foot.thick, d, scale]);
  useGeometryCleanup(geometry);
  const plateY = foot.height - foot.slot + h / 2;
  const footX = w / 2 - Math.max(w * 0.17, foot.thick);
  const [lw, lh] = sizeLabels(spec);
  const pose = usePose([0, 0.42, 0]);
  return (
    <group rotation={pose} userData={{ unitsPerCm: scale }}>
      {[-1, 1].map((side) => (
        <mesh key={side} geometry={geometry} position-x={side * footX} renderOrder={1}>
          <AcrylicMaterials />
        </mesh>
      ))}
      <group position-y={plateY}>
        <PanelPlate plate={plate} look={look} d={d} map={front} spec={spec} />
        {/* Margem branca do PVC em volta da arte. */}
        <mesh geometry={body.face} position-z={d / 2 + 0.0006}>
          <meshStandardMaterial color="#fbfbf9" roughness={0.5} />
        </mesh>
        {showDims && <Dimensions w={w} h={h} z={d / 2 + 0.01} labelW={lw} labelH={lh} />}
      </group>
    </group>
  );
}

/**
 * Corte do porteiro 8,2 × 22 cm do gabarito oficial (mm, y para baixo): topo em meia-lua com o furo da maçaneta
 * (Ø 54 mm) aberto à esquerda por uma fenda, que forma o gancho; cantos de baixo levemente arredondados.
 */
const PORTEIRO_CUT = {
  box: { x: 3.2, y: 3.2, w: 82, h: 221 },
  d: "M44.2 3.2C66.7 3.2 85.2 21.9 85.2 45L85.2 213.3C85.2 215.3 85.1 217.5 84.6 219.4C84.3 220.8 83.7 222.1 82.5 222.9C81.3 223.9 79.7 224.1 78.2 224.1C76.4 224.2 74.4 224.1 72.6 224.1L15.4 224.1C13.5 224.1 11.6 224.3 9.7 224.2C8.2 224.2 6.7 224.1 5.5 223.2C4.4 222.4 3.9 221.2 3.6 220C3.2 218.3 3.2 216.4 3.2 214.7L3.2 72C3.2 67.8 5.2 63.8 9.8 63.8L19.1 63.8C22.9 63.8 25.7 64.7 28.9 66.7C30.9 68 32.7 69.4 34.9 70.4C37.9 71.7 41 72.1 44.2 72.1C58.8 72.1 70.7 60.1 70.7 45C70.7 30 58.8 18 44.2 18C32.5 18 21.1 25.9 18.6 37.9C18 40.6 16.6 43.4 14.2 44.8C12.3 46 10 46.2 8 45.3C4.8 43.9 3.3 40.5 3.9 37.1C7.5 17.3 24.7 3.2 44.2 3.2Z",
  /** Centro do furo (cm, a partir do centro do corte) e raio. */
  hole: { y: 6.87, r: 2.7 },
};

/**
 * Porteiro: cartão de couchê 300 g no corte do gabarito (furo e fenda da maçaneta), pendurado na maçaneta de
 * alavanca de uma porta de madeira.
 */
function DoorHanger({ spec, art, label, showDims }: ModelProps) {
  // Medidas em cm; o grupo escala para a cena. O porteiro é sempre em pé (8,2 × 22).
  const W = Math.max(Math.min(spec.widthCm, spec.heightCm), 1);
  const H = Math.max(spec.widthCm, spec.heightCm, W * 1.6);
  const sx = W / (PORTEIRO_CUT.box.w / 10);
  const sy = H / (PORTEIRO_CUT.box.h / 10);
  const holeR = PORTEIRO_CUT.hole.r * Math.min(sx, sy);
  const holeY = PORTEIRO_CUT.hole.y * sy;
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
    const shape = cutShape(PORTEIRO_CUT.d, PORTEIRO_CUT.box, [sx, sy]);
    return { body: extrudeBody(shape, PAPER_CM, 0, 12), face: printFace(shape, W, H, 12) };
  }, [W, H, sx, sy]);
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

/**
 * Corte da placa pet 5,5 × 3 cm do gabarito oficial (mm, y para baixo): osso de quatro lóbulos com a orelha no meio
 * do topo e o furo de Ø 3 mm da argola.
 */
const PET_CUT = {
  box: { x: 2, y: 2, w: 55, h: 30 },
  d: "M20.7 6.8L17.7 6.8C16.7 6.8 15.8 6.3 15.3 5.6L15.3 5.6C14 3.4 11.8 2 9.2 2C5.2 2 2 5.6 2 10C2 12.9 3.6 14.2 3.6 17C3.6 19.8 2 21.1 2 24C2 28.4 5.2 32 9.2 32C11.7 32 13.8 30.7 15.1 28.7C15.8 27.8 16.9 27.2 18.2 27.2L29.5 27.2L40.8 27.2C42.1 27.2 43.2 27.8 43.9 28.7C45.2 30.7 47.3 32 49.8 32C53.8 32 57 28.4 57 24C57 21.1 55.4 19.8 55.4 17C55.4 14.2 57 12.9 57 10C57 5.6 53.8 2 49.8 2C47.2 2 45 3.4 43.7 5.6L43.7 5.6C43.2 6.3 42.3 6.8 41.3 6.8L38.3 6.8L36 6.8C34.8 6.8 33.8 6.1 33.3 5.1C33.3 5.1 32.4 2.1 29.5 2.1C26.6 2.1 25.7 5.1 25.7 5.1C25.2 6.1 24.2 6.8 23 6.8ZM29.5 4.4C30.3 4.4 31 5 31 5.9C31 6.7 30.3 7.4 29.5 7.4C28.7 7.4 28 6.7 28 5.9C28 5 28.7 4.4 29.5 4.4Z",
};

/** Placa de identificação pet: osso de PVC 5 mm no corte do gabarito, deitado e em 3/4, como na foto do produto. */
function PetTag({ spec, art, label, showDims }: ModelProps) {
  const W = Math.max(spec.widthCm, spec.heightCm, 1);
  const H = Math.max(Math.min(spec.widthCm, spec.heightCm), 0.5);
  const d = Math.max(spec.depthCm, 0.2);
  // Borda boleada de leve (fresa): o contorno entra recuado e o chanfro devolve a medida do corte.
  const b = Math.min(0.03, d * 0.2);
  const U = 2.3 / W;
  const front = useArtTexture(W / H, "front", art, label);
  const plate = useMemo<Plate>(() => {
    const sx = (W - 2 * b) / (PET_CUT.box.w / 10);
    const sy = (H - 2 * b) / (PET_CUT.box.h / 10);
    const shape = cutShape(PET_CUT.d, PET_CUT.box, [sx, sy]);
    return { body: extrudeBody(shape, d, b, 10), face: printFace(shape, W, H, 10) };
  }, [W, H, d, b]);
  usePlateCleanup(plate);
  const look: PanelLook = { edge: "#fbfbf9", edgeRoughness: 0.8, back: "#f3f3f1", bevelCm: b, radiusCm: 0 };
  const [lw, lh] = sizeLabels(spec);
  const labels: [string, string] = spec.widthCm < spec.heightCm ? [lh, lw] : [lw, lh];
  return (
    <group rotation-y={0.3} userData={{ view: { elevation: 0.85 } }}>
      <group rotation-x={-Math.PI / 2} scale={U}>
        <PanelPlate plate={plate} look={look} d={d} map={front} spec={spec} eps={0.0012 / U} />
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
 * e a arte por trás. Padrão: quadro na parede, com a montagem da variação (moldura, VHB, espaçadores). Variantes: display de mesa em L
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
  const mount = mountOf(spec);
  const [lw, lh] = sizeLabels(spec);
  const pose = usePose([-0.05, 0.34, 0]);
  return (
    <group rotation={pose} userData={{ unitsPerCm: scale }}>
      <AcrylicSheet plate={plate} d={d} map={front} spec={spec} />
      <PlateMount mount={mount} w={w} h={h} d={d} scale={scale} size={size} />
      {showDims && <Dimensions w={w} h={h} z={mountFront(mount, d, size, scale)} labelW={lw} labelH={lh} />}
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
  const pose = usePose([0, 0.4, 0]);
  return (
    <group rotation={pose} userData={{ unitsPerCm: scale }}>
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

/** Folha do calendário no gabarito: 21,5 × 16 cm, em paisagem. */
const CAL_PAGE: [number, number] = [21.5, 16];
const CAL_MONTH_IDS = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** Folhas do bloco: capa + 12 meses. */
const CAL_SHEETS = 13;
/** Inclinação de cada chapa do cavalete (rad, a partir da vertical). */
const CAL_LEAN = 0.24;

/**
 * Calendário de mesa com base de acrílico, como na foto do produto: cavalete de duas chapas de acrílico de 3 mm
 * (em pé, em A) unidas no alto pelas duas argolas (douradas ou prateadas, pela opção), que prendem as 13 folhas de
 * 21,5 × 16 cm deitadas na chapa da frente. Na frente fica a capa (a arte principal); com um mês em edição, a folha
 * daquele mês (a arte dele; sem arte, a grade do mês).
 */
function AcrylicCalendar({ spec, art, label }: ModelProps) {
  // Medidas em cm; o grupo escala para a cena. A chapa é um pouco maior que a folha (margem de 0,75 cm dos lados).
  const [pageW, pageH] = CAL_PAGE;
  const bw = pageW + 1.5;
  const bh = pageH + 4.5;
  const t = Math.max(spec.depthCm, 0.3);
  const U = 2.6 / bw;
  const { face } = useSceneMode();
  const monthIndex = face ? CAL_MONTH_IDS.indexOf(face) : -1;
  const monthArt = useMemo(() => (monthIndex >= 0 ? faceArtOf(art, CAL_MONTH_IDS[monthIndex]) : null), [art, monthIndex]);
  const cover = useArtTexture(pageW / pageH, "front", monthArt ?? art, label);
  const grid = useMemo(() => (monthIndex >= 0 && !monthArt ? createMonthTexture(pageW / pageH, monthIndex) : null), [pageW, pageH, monthIndex, monthArt]);
  useEffect(() => () => grid?.dispose(), [grid]);
  const board = useMemo(() => extrudeBody(roundedRect(bw - t * 0.44, bh - t * 0.44, 1.2), t, t * 0.22), [bw, bh, t]);
  useGeometryCleanup(board);
  const ring = useMemo(() => new THREE.TorusGeometry(1.25, 0.09, 10, 48), []);
  useGeometryCleanup(ring);
  const sheet = 0.026;
  const stack = sheet * CAL_SHEETS;
  const ringX = pageW * 0.27;
  const holeY = -0.9;
  const pageTop = holeY + 0.7;
  const details = spec.details ?? "";
  const metal = metalColor(/\bprat/.test(details) ? "silver" : /\bdourad/.test(details) ? "gold" : spec.metal === "none" ? "gold" : spec.metal);
  const apexY = bh * Math.cos(CAL_LEAN);
  // Argola de raio R passando pelos furos das duas chapas (±zh, na altura do furo) e por cima do vértice.
  const ringR = 1.25;
  const zh = -holeY * Math.sin(CAL_LEAN) + t + stack / 2;
  const ringY = apexY + holeY * Math.cos(CAL_LEAN) + Math.sqrt(Math.max(ringR * ringR - zh * zh, 0));
  const pose = usePose([0, 0.36, 0]);
  return (
    <group rotation={pose} userData={{ unitsPerCm: U }}>
      <group scale={U}>
        {/* Chapa da frente (com as folhas) e a de trás, articuladas no alto pelas argolas. */}
        {[1, -1].map((side) => (
          <group key={side} position-y={apexY} rotation-x={-side * CAL_LEAN}>
            <mesh geometry={board} position={[0, -bh / 2, (side * t) / 2]} renderOrder={1}>
              <AcrylicMaterials />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * ringX, holeY, side * t + 0.002 * side]} rotation-y={side > 0 ? 0 : Math.PI}>
                <circleGeometry args={[0.32, 20]} />
                <meshStandardMaterial color="#9fb9b3" transparent opacity={0.5} depthWrite={false} />
              </mesh>
            ))}
            {side > 0 && (
              <group position-z={t}>
                {/* Bloco de folhas de couchê e a folha da frente impressa. */}
                <SoftBox size={[pageW, pageH, stack]} radius={0.15} bevel={0.01} position={[0, pageTop - pageH / 2, stack / 2 + 0.01]}>
                  <meshStandardMaterial color="#f7f6f2" roughness={0.88} />
                </SoftBox>
                <mesh position={[0, pageTop - pageH / 2, stack + 0.016]}>
                  <planeGeometry args={[pageW, pageH]} />
                  {grid ? <meshStandardMaterial map={grid} roughness={0.85} /> : <PrintMaterial map={cover} spec={spec} />}
                </mesh>
                {[-1, 1].map((s) => (
                  <mesh key={s} position={[s * ringX, holeY, stack + 0.02]}>
                    <circleGeometry args={[0.28, 20]} />
                    <meshStandardMaterial color="#3a3a3c" roughness={0.8} />
                  </mesh>
                ))}
              </group>
            )}
          </group>
        ))}
        {/* Argolas: passam pelos furos das duas chapas e das folhas, por cima do vértice. */}
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={ring} position={[s * ringX, ringY, 0]} rotation-y={Math.PI / 2}>
            <meshStandardMaterial color={metal} metalness={1} roughness={0.2} />
          </mesh>
        ))}
      </group>
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
  const pose = usePose([-0.04, 0.38, 0]);
  return (
    <group rotation={pose} userData={{ unitsPerCm: scale }}>
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
