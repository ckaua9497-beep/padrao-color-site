"use client";

// Cadernos, agendas, planners, blocos e photobooks em escala real: tudo é modelado em centímetros dentro
// de um grupo com escala UNIT. A capa dura é papelão envolto no papel impresso (UV planar: as bordas
// repetem a sangria da arte, como a dobra real), o miolo tem linhas de folha e o wire-o vem em pares.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MockupSpec } from "@/lib/mockup";
import { KIND_INFO } from "@/lib/mockup-kinds";
import { hasArtContent } from "../art";
import { useSceneMode } from "../viewer-hooks";
import { Fabric } from "./fabric";
import { Dimensions, PrintMaterial, faceGeometry, makeShape, metalColor, sizeLabels, useArtTexture, useBackTexture, useGeometryCleanup, type ModelProps } from "./shared";

/** Unidades de cena por centímetro. */
const UNIT = 0.11;

const ENDPAPER = "#f3f0e8";
const ELASTIC_BAND = 0.1;
const ELASTIC_WIDTH = 0.9;
const DIVIDERS = ["#e0584c", "#f1b43c", "#3f9bd8", "#53ad66", "#9b6fd1"];
const TAB_COLORS = ["#e9b3a1", "#f1d39a", "#bcd8b1", "#a8c7e2", "#c8b7e3", "#f1bccb"];

function sizeOf(spec: MockupSpec): [number, number] {
  const ok = (v: number, fallback: number) => (Number.isFinite(v) && v > 0 ? v : fallback);
  return [ok(spec.widthCm, 15), ok(spec.heightCm, 21)];
}

/** Gerador pseudoaleatório determinístico: as linhas do miolo não mudam entre renders. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Retângulo arredondado extrudado com chanfro suave, centrado na origem (sem arestas cortantes). */
function softBox(w: number, h: number, d: number, radius: number, bevel: number) {
  const b = Math.max(0.002, Math.min(bevel, d * 0.45, w * 0.25, h * 0.25));
  const shape = makeShape("rect", w - 2 * b, h - 2 * b, Math.max(radius - b, 0.01));
  const depth = Math.max(d - 2 * b, 0.001);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** UV planar em xy: a face recebe a arte inteira e as laterais repetem a borda (papel dobrado sobre o papelão). */
function planarUV(g: THREE.BufferGeometry, w: number, h: number, mirror = false) {
  const pos = g.getAttribute("position");
  const uv = g.getAttribute("uv");
  for (let i = 0; i < pos.count; i += 1) {
    const u = pos.getX(i) / w;
    uv.setXY(i, mirror ? 0.5 - u : u + 0.5, pos.getY(i) / h + 0.5);
  }
  uv.needsUpdate = true;
  return g;
}

/**
 * Miolo: retângulo arredondado extrudado na espessura. O UV segue só a espessura (1 cm por repetição da
 * textura de folhas), então as linhas correm paralelas às capas em todas as bordas. `rounding` desloca a
 * seção em arco (lombada redonda convexa, frente côncava), como no livro costurado.
 */
function pageBlockGeometry(w: number, h: number, d: number, radius: number, rounding: number) {
  const g = new THREE.ExtrudeGeometry(makeShape("rect", w, h, Math.max(radius, 0.02)), { depth: d, steps: 8, bevelEnabled: false, curveSegments: 8 });
  g.translate(0, 0, -d / 2);
  const pos = g.getAttribute("position");
  const uv = g.getAttribute("uv");
  const normal = g.getAttribute("normal");
  const half = d / 2;
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    const z = pos.getZ(i);
    if (rounding > 0) {
      const t = z / half;
      pos.setX(i, pos.getX(i) - rounding * (1 - t * t));
      n.fromBufferAttribute(normal, i);
      if (Math.abs(n.z) < 0.5) {
        // Normal da parede curvada: (nx, ny, -nx·dx/dz).
        n.z = -n.x * ((2 * rounding * t) / half);
        n.normalize();
        normal.setXYZ(i, n.x, n.y, n.z);
      }
    }
    uv.setXY(i, z + half, 0.5);
  }
  pos.needsUpdate = true;
  uv.needsUpdate = true;
  normal.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}

/** Textura de 1 cm de folhas empilhadas: cada folha com tom próprio e uma junta mais escura. */
function pageEdgeTexture(paper: string, sheetCm: number, dividers: readonly string[]) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 4;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const base = new THREE.Color(paper);
    const tint = new THREE.Color();
    const rnd = seeded(11);
    const step = Math.max(3, Math.round(1024 * sheetCm));
    for (let x = 0; x < 1024; x += step) {
      tint.copy(base).multiplyScalar(0.9 + rnd() * 0.1);
      ctx.fillStyle = `#${tint.getHexString()}`;
      ctx.fillRect(x, 0, step, 4);
      ctx.fillStyle = `rgba(72, 62, 50, ${(0.12 + rnd() * 0.22).toFixed(3)})`;
      ctx.fillRect(x, 0, 1 + Math.round(rnd()), 4);
    }
    dividers.forEach((color, i) => {
      const at = Math.round(((i + 0.5) / dividers.length) * 1024 + (rnd() - 0.5) * 60);
      ctx.fillStyle = color;
      ctx.fillRect(at, 0, 26, 4);
    });
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** Lombada redonda do capa dura: meia-lua de papelão fino unindo as capas pela borda esquerda. */
function spineGeometry(w: number, h: number, t: number, bulge: number, thickness: number) {
  const half = t / 2;
  const overlap = 0.15;
  const shape = new THREE.Shape();
  shape.moveTo(overlap, half);
  shape.lineTo(0, half);
  shape.absellipse(0, 0, bulge, half, Math.PI / 2, Math.PI * 1.5, false, 0);
  shape.lineTo(overlap, -half);
  shape.lineTo(overlap, -half + thickness);
  shape.lineTo(0, -half + thickness);
  shape.absellipse(0, 0, bulge - thickness, half - thickness, Math.PI * 1.5, Math.PI / 2, true, 0);
  shape.lineTo(overlap, half - thickness);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 24 });
  g.translate(0, 0, -h / 2);
  // A extrusão sai com normais facetadas: na lombada laminada isso vira faixas de brilho. Normal analítica
  // da elipse (externa para fora, interna para a cavidade).
  const pos = g.getAttribute("position");
  const normal = g.getAttribute("normal");
  const ia = bulge - thickness;
  const ib = half - thickness;
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    if (Math.abs(normal.getZ(i)) > 0.5) continue;
    const x = pos.getX(i);
    const y = pos.getY(i);
    if (x > 1e-4) continue;
    if (Math.abs((x / bulge) ** 2 + (y / half) ** 2 - 1) < 0.01) n.set(x / (bulge * bulge), y / (half * half), 0);
    else if (ia > 0 && ib > 0 && Math.abs((x / ia) ** 2 + (y / ib) ** 2 - 1) < 0.01) n.set(-x / (ia * ia), -y / (ib * ib), 0);
    else continue;
    if (n.lengthSq() < 1e-12) continue;
    n.normalize();
    normal.setXYZ(i, n.x, n.y, n.z);
  }
  normal.needsUpdate = true;
  // Extrusão vira altura (y); a seção é simétrica em z.
  g.rotateX(-Math.PI / 2);
  g.translate(-w / 2, 0, 0);
  return planarUV(g, w, h);
}

type WireLayout = { ys: number[]; pairGap: number; pitch: number };

/** Passo 2:1 (12,7 mm) para miolos grossos, 3:1 (8,47 mm) para finos; um furo por par de fios. */
function wireLayout(h: number, t: number): WireLayout {
  const pitch = t > 1.3 ? 1.27 : 0.847;
  const pairs = Math.max(2, Math.floor((h - 1.4) / pitch));
  const ys = Array.from({ length: pairs }, (_, i) => (i - (pairs - 1) / 2) * pitch);
  return { ys, pairGap: pitch * 0.3, pitch };
}

/** Anéis do wire-o num único buffer: cada anel passa pelos furos das duas capas e contorna a lombada. */
function wireGeometry(h: number, t: number, board: number, holeX: number) {
  const { ys, pairGap } = wireLayout(h, t);
  const zt = t / 2 - board / 2;
  const reach = Math.max(0.7, t * 0.4);
  const radius = Math.hypot(reach, zt);
  const base = new THREE.TorusGeometry(radius, 0.06, 6, 40);
  base.rotateX(Math.PI / 2);
  const parts = ys.flatMap((y) => [-1, 1].map((s) => base.clone().translate(holeX - reach, y + (s * pairGap) / 2, 0)));
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  base.dispose();
  return merged;
}

function holesGeometry(h: number, t: number, holeX: number) {
  const { ys, pairGap } = wireLayout(h, t);
  const base = new THREE.ShapeGeometry(makeShape("rect", 0.36, pairGap + 0.26, 0.1), 4);
  const parts = ys.map((y) => base.clone().translate(holeX, y, 0));
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  base.dispose();
  return merged;
}

/** Elástico de fechamento: anel chato no plano yz abraçando o livro de cima a baixo. */
function elasticGeometry(h: number, t: number) {
  const innerT = t + 0.03;
  const innerH = h + 0.06;
  const outer = makeShape("rect", innerT + ELASTIC_BAND * 2, innerH + ELASTIC_BAND * 2, 0.12 + ELASTIC_BAND);
  outer.holes.push(makeShape("rect", innerT, innerH, 0.12));
  const g = new THREE.ExtrudeGeometry(outer, { depth: ELASTIC_WIDTH, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -ELASTIC_WIDTH / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

/** Fita chata ao longo de uma curva, com a ponta cortada em V (fitilho marcador de cetim). */
function ribbonGeometry(points: THREE.Vector3[], width: number, minY: number, samples = 56) {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    curve.getPoint(t, p);
    curve.getTangent(t, tangent);
    p.y = Math.max(p.y, minY);
    side.crossVectors(tangent, up);
    if (side.lengthSq() < 1e-8) side.set(0, 0, 1);
    side.normalize().multiplyScalar(width / 2);
    const notch = i === samples ? width * 0.55 : 0;
    positions.push(p.x - side.x, p.y - side.y, p.z - side.z);
    positions.push(p.x - tangent.x * notch, p.y - tangent.y * notch, p.z - tangent.z * notch);
    positions.push(p.x + side.x, p.y + side.y, p.z + side.z);
    uvs.push(0, t, 0.5, t, 1, t);
  }
  for (let i = 0; i < samples; i += 1) {
    const a = i * 3;
    for (let k = 0; k < 2; k += 1) {
      indices.push(a + k, a + k + 1, a + 3 + k, a + k + 1, a + 4 + k, a + 3 + k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/**
 * Capa com o canto inferior direito levantado: dobra a 45° (orelha), curva macia de raio `bend` e aba reta
 * quase na vertical. O verso branco fica de frente para a câmera e o triângulo descoberto mostra a folha de baixo.
 */
function curlGeometry(w: number, h: number) {
  const g = new THREE.PlaneGeometry(w, h, 72, 108);
  const pos = g.getAttribute("position");
  const dx = Math.SQRT1_2;
  const dy = -Math.SQRT1_2;
  const short = Math.min(w, h);
  const reach = short * 0.27;
  const bend = short * 0.085;
  const lift = 1.55;
  const arc = bend * lift;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const s = (x - w / 2) * dx + (y + h / 2) * dy + reach;
    if (s <= 0) continue;
    let along: number;
    let z: number;
    if (s <= arc) {
      const theta = s / bend;
      along = bend * Math.sin(theta);
      z = bend * (1 - Math.cos(theta));
    } else {
      const rest = s - arc;
      along = bend * Math.sin(lift) + rest * Math.cos(lift);
      z = bend * (1 - Math.cos(lift)) + rest * Math.sin(lift);
    }
    const pull = along - s;
    pos.setXYZ(i, x + dx * pull, y + dy * pull, z);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** Folha do miolo do bloco: pautada (linhas azuis e margem) ou lisa. */
function padSheetTexture(wCm: number, hCm: number, ruled: boolean) {
  const ppc = Math.min(48, 1024 / Math.max(wCm, hCm));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(64, Math.round(wCm * ppc));
  canvas.height = Math.max(64, Math.round(hCm * ppc));
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#fbfaf6";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (ruled) {
      ctx.lineWidth = Math.max(1, ppc * 0.03);
      ctx.strokeStyle = "#b3c6dc";
      for (let y = 2.2 * ppc; y < canvas.height - 0.8 * ppc; y += 0.75 * ppc) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
      ctx.strokeStyle = "#e4a5a5";
      ctx.beginPath();
      ctx.moveTo(1.6 * ppc, 0);
      ctx.lineTo(1.6 * ppc, canvas.height);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

type HardcoverLook = {
  binding: "case" | "wire";
  thick: number;
  board: number;
  radius: number;
  paper: string;
  sheet: number;
  dividers: boolean;
  elastic: boolean;
  ribbon: boolean;
  tabs: boolean;
  wireColor: string;
  wireMetalness: number;
  wireRoughness: number;
};

function hardcoverLook(spec: MockupSpec): HardcoverLook {
  const wire = spec.binding === "spiral" && spec.variant !== "photobook";
  const metal = spec.metal !== "none";
  const silver = { wireColor: metal ? metalColor(spec.metal) : "#d7dade", wireMetalness: 1, wireRoughness: 0.24 };
  // Agendas e planners: wire-o preto fosco, mais elegante.
  const dark = { wireColor: metal ? metalColor(spec.metal) : "#2a2a2f", wireMetalness: metal ? 1 : 0.7, wireRoughness: metal ? 0.22 : 0.34 };
  const none = { dividers: false, elastic: false, ribbon: false, tabs: false };
  if (spec.variant === "photobook") {
    return { ...none, ...silver, binding: "case", thick: 1.5, board: 0.28, radius: 0.12, paper: "#fdfdfb", sheet: 0.05 };
  }
  if (spec.variant === "agenda" || spec.variant === "planner") {
    const planner = spec.variant === "planner";
    return { ...none, ...dark, binding: wire ? "wire" : "case", thick: planner ? 2.1 : 1.9, board: 0.22, radius: 0.75, paper: "#f8f4ea", sheet: 0.01, elastic: true, ribbon: true, tabs: planner };
  }
  return { ...none, ...silver, binding: wire ? "wire" : "case", thick: 1.6, board: 0.24, radius: 0.35, paper: "#fcfcfa", sheet: 0.01, dividers: true };
}

/**
 * Photobook, agenda, planner e caderno de capa dura, em pé e girado 3/4 para mostrar a arte e a espessura.
 * Capas = papelão chanfrado com a arte em UV planar (dobra sobre as bordas) e guardas por dentro; miolo com
 * linhas de folha. Costurado: lombada redonda, miolo arqueado, cabeceados e vinco da dobradiça. Wire-o: anéis
 * em pares atravessando furos nas capas. Agenda/planner: elástico, fitilho no chão; planner com abas de mês.
 */
function HardcoverModel({ spec, art, label, showDims }: ModelProps) {
  const [w, h] = sizeOf(spec);
  const look = hardcoverLook(spec);
  const { thick: t, board: bt, paper, sheet, dividers, elastic: hasElastic, ribbon: hasRibbon, tabs: hasTabs } = look;
  const isCase = look.binding === "case";
  const radius = isCase ? Math.min(look.radius, 0.3) : look.radius;
  const tp = t - 2 * bt;
  const pageLeft = -w / 2 + (isCase ? 0.12 : 0.15);
  const pageRight = w / 2 - 0.3;
  const wp = pageRight - pageLeft;
  const hp = h - 0.6;
  const rounding = isCase ? Math.min(0.22, tp * 0.25) : 0;
  const holeX = -w / 2 + 0.65;
  const elasticX = w / 2 - 2.2;
  const floorY = hasElastic ? -h / 2 - 0.03 - ELASTIC_BAND : -h / 2;

  const front = useArtTexture(w / h, "front", art, label);
  // Contracapa: a arte do verso do cliente; sem ela, a regra da opção (frente repetida, cinza ou lisa). O UV
  // espelhado da contracapa (planarUV mirror) faz a arte ler da esquerda para a direita vista por trás.
  const back = useBackTexture(w / h, spec, art, label);
  // Laminação: mesmo a fosca tem um leve brilho de película.
  const coverSpec = useMemo(() => ({ ...spec, clearcoat: Math.max(spec.clearcoat, 0.12) }), [spec]);

  const frontBoard = useMemo(() => planarUV(softBox(w, h, bt, radius, 0.05), w, h), [w, h, bt, radius]);
  const backBoard = useMemo(() => planarUV(softBox(w, h, bt, radius, 0.05), w, h, true), [w, h, bt, radius]);
  const endpaper = useMemo(() => faceGeometry(makeShape("rect", w - 0.7, h - 0.7, Math.max(radius - 0.35, 0.05)), w - 0.7, h - 0.7), [w, h, radius]);
  // Folga mínima entre miolo e capas: evita faces coplanares (z-fighting) com a guarda.
  const block = useMemo(() => pageBlockGeometry(wp, hp, tp - 0.02, Math.max(radius - 0.3, 0.06), rounding), [wp, hp, tp, radius, rounding]);
  const spine = useMemo(() => (isCase ? spineGeometry(w, h, t, Math.max(0.3, t * 0.24), 0.1) : null), [isCase, w, h, t]);
  const wire = useMemo(() => (isCase ? null : wireGeometry(h, t, bt, holeX)), [isCase, h, t, bt, holeX]);
  const holes = useMemo(() => (isCase ? null : holesGeometry(h, t, holeX)), [isCase, h, t, holeX]);
  const elastic = useMemo(() => (hasElastic ? elasticGeometry(h, t) : null), [hasElastic, h, t]);
  const ribbon = useMemo(() => {
    if (!hasRibbon) return null;
    const z = tp * 0.15;
    const y = floorY + 0.02;
    const points = [
      new THREE.Vector3(w / 2 - 1.0, -h / 2 + 1.2, z),
      new THREE.Vector3(w / 2 - 0.9, -h / 2 + 0.2, z),
      new THREE.Vector3(w / 2 - 0.3, y, z),
      new THREE.Vector3(w / 2 + 1.2, y, z + 0.8),
      new THREE.Vector3(w / 2 + 2.2, y, z + 2.6),
      new THREE.Vector3(w / 2 + 2.5, y, z + 4.2),
    ];
    return ribbonGeometry(points, 0.6, y);
  }, [hasRibbon, w, h, tp, floorY]);
  const tab = useMemo(() => (hasTabs ? softBox(1.1, 1.5, 0.05, 0.35, 0.015) : null), [hasTabs]);
  const edge = useMemo(() => pageEdgeTexture(paper, sheet, dividers ? DIVIDERS : []), [paper, sheet, dividers]);

  useGeometryCleanup(frontBoard);
  useGeometryCleanup(backBoard);
  useGeometryCleanup(endpaper);
  useGeometryCleanup(block);
  useGeometryCleanup(spine);
  useGeometryCleanup(wire);
  useGeometryCleanup(holes);
  useGeometryCleanup(elastic);
  useGeometryCleanup(ribbon);
  useGeometryCleanup(tab);
  useEffect(() => () => edge.dispose(), [edge]);

  const tabCount = hasTabs ? Math.max(0, Math.min(12, Math.floor((hp - 1.2) / 1.55))) : 0;
  const strap = spec.accentColor ?? "#161616";
  const ribbonColor = spec.accentColor ?? "#8e2234";
  const dims = showDims && KIND_INFO[spec.kind].dims;
  const [lw, lh] = sizeLabels(spec);

  return (
    <group rotation-y={0.42} userData={{ view: { elevation: 0.2 } }}>
      <group scale={UNIT}>
        {/* Capa e contracapa: papelão revestido com o impresso. */}
        <mesh geometry={frontBoard} position-z={t / 2 - bt / 2}>
          <PrintMaterial map={front} spec={coverSpec} />
        </mesh>
        <mesh geometry={backBoard} position-z={-t / 2 + bt / 2}>
          <PrintMaterial map={back} spec={coverSpec} />
        </mesh>
        <mesh geometry={endpaper} position-z={t / 2 - bt - 0.005} rotation-y={Math.PI}>
          <meshStandardMaterial color={ENDPAPER} roughness={0.92} />
        </mesh>
        <mesh geometry={endpaper} position-z={-t / 2 + bt + 0.005}>
          <meshStandardMaterial color={ENDPAPER} roughness={0.92} />
        </mesh>

        {/* Miolo. */}
        <mesh geometry={block} position-x={(pageLeft + pageRight) / 2}>
          <meshStandardMaterial map={edge} roughness={0.95} />
        </mesh>

        {spine && (
          <mesh geometry={spine}>
            <PrintMaterial map={front} spec={coverSpec} />
          </mesh>
        )}
        {isCase && (
          <>
            {/* Vinco da dobradiça nas duas capas. */}
            {[1, -1].map((side) => (
              <mesh key={side} position={[-w / 2 + 0.75, 0, side * (t / 2 + 0.006)]} rotation-y={side > 0 ? 0 : Math.PI}>
                <planeGeometry args={[0.16, h - 0.3]} />
                <meshStandardMaterial color="#000000" transparent opacity={0.2} depthWrite={false} roughness={1} />
              </mesh>
            ))}
            {/* Cabeceados no topo e no pé do miolo. */}
            {[1, -1].map((side) => (
              <mesh key={side} position={[pageLeft - rounding * 0.7, side * (hp / 2), 0]} rotation-x={Math.PI / 2}>
                <cylinderGeometry args={[0.09, 0.09, tp * 0.96, 10]} />
                <meshPhysicalMaterial color="#e9e2d0" roughness={0.6} sheen={1} sheenColor="#ffffff" />
              </mesh>
            ))}
          </>
        )}

        {wire && (
          <mesh geometry={wire}>
            <meshStandardMaterial color={look.wireColor} metalness={look.wireMetalness} roughness={look.wireRoughness} />
          </mesh>
        )}
        {holes && (
          <>
            <mesh geometry={holes} position-z={t / 2 + 0.012}>
              <meshStandardMaterial color="#2a2826" roughness={0.85} />
            </mesh>
            <mesh geometry={holes} position-z={-t / 2 - 0.012} rotation-x={Math.PI}>
              <meshStandardMaterial color="#2a2826" roughness={0.85} />
            </mesh>
          </>
        )}

        {elastic && (
          <mesh geometry={elastic} position-x={elasticX}>
            <Fabric color={strap} sheen={0.6} />
          </mesh>
        )}
        {ribbon && (
          <mesh geometry={ribbon}>
            <meshPhysicalMaterial color={ribbonColor} roughness={0.32} sheen={1} sheenRoughness={0.3} sheenColor="#ffffff" side={THREE.DoubleSide} />
          </mesh>
        )}
        {tab &&
          Array.from({ length: tabCount }, (_, i) => (
            <mesh key={i} geometry={tab} position={[pageRight + 0.25, hp / 2 - 1.0 - i * 1.55, -tp / 2 + (tp * (i + 0.5)) / tabCount]}>
              <meshStandardMaterial color={TAB_COLORS[i % TAB_COLORS.length]} roughness={0.75} />
            </mesh>
          ))}
      </group>
      {dims && <Dimensions w={w * UNIT} h={h * UNIT} z={(t / 2) * UNIT + 0.01} labelW={lw} labelH={lh} />}
    </group>
  );
}

type SheetKind = "lined" | "plain" | "art";

/** Miolo do bloco pelo nome do produto: personalizado (arte em cinza), sem pauta ou pautado. */
function sheetKindOf(label: string): SheetKind {
  const name = label.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (/personaliz/.test(name)) return "art";
  if (/s\/\s*pauta|sem pauta|em branco/.test(name)) return "plain";
  return "lined";
}

function PadArtSheet({ w, h, z, art, label }: { w: number; h: number; z: number; art: ModelProps["art"]; label: string }) {
  const map = useArtTexture(w / h, "gray", art, label);
  return (
    <mesh position-z={z}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={map} roughness={0.92} />
    </mesh>
  );
}

function PadPaperSheet({ w, h, z, ruled }: { w: number; h: number; z: number; ruled: boolean }) {
  const map = useMemo(() => padSheetTexture(w, h, ruled), [w, h, ruled]);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <mesh position-z={z}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={map} roughness={0.92} />
    </mesh>
  );
}

/** Lápis sextavado preto com ponta de madeira e acabamento dourado, deitado sobre uma face. */
function Pencil({ x, y, twist }: { x: number; y: number; twist: number }) {
  const r = 0.4;
  return (
    <group position={[x, y, r * Math.cos(Math.PI / 6)]} rotation-z={twist}>
      <group rotation-y={Math.PI / 6}>
        <mesh position-y={0.2}>
          <cylinderGeometry args={[r, r, 11.6, 6]} />
          <meshPhysicalMaterial color="#1d1d21" roughness={0.38} clearcoat={0.8} clearcoatRoughness={0.1} />
        </mesh>
        <mesh position-y={6.25}>
          <cylinderGeometry args={[r * 1.01, r * 1.01, 0.5, 6]} />
          <meshStandardMaterial color="#d2ae6c" metalness={1} roughness={0.3} />
        </mesh>
        <mesh position-y={-6.3}>
          <cylinderGeometry args={[r, r * 0.3, 1.4, 6]} />
          <meshStandardMaterial color="#e2c190" roughness={0.85} />
        </mesh>
        <mesh position-y={-7.3} rotation-x={Math.PI}>
          <coneGeometry args={[r * 0.3, 0.6, 6]} />
          <meshStandardMaterial color="#303033" metalness={0.35} roughness={0.45} />
        </mesh>
      </group>
    </group>
  );
}

const PAD_CHIP = 0.15;
const PAD_STACK = 1.0;

/**
 * Bloco deitado (câmera mais alta): papelão no fundo, pilha de folhas com linhas, capa impressa com o canto
 * enrolado mostrando a folha de baixo (pautada, lisa ou personalizada) e blocagem de cola no topo. Um lápis
 * ao lado dá a escala.
 */
function PadModel({ spec, art, label, showDims }: ModelProps) {
  const [w, h] = sizeOf(spec);
  const front = useArtTexture(w / h, "front", art, label);
  // Verso do cliente: impresso no papelão do fundo, na mesma área da capa.
  const backArt = useBackTexture(w / h, spec, art, label, undefined, "blank");
  const { back: showBack } = useSceneMode();
  // Deitado, o giro de 180° do TurnGroup só mostra a capa de outro lado: com verso do cliente o bloco também
  // vira de barriga para cima (π em x local; somado ao giro do TurnGroup dá o bloco desvirado no lugar), apoiado
  // no chão e com a capa plana embaixo. Sem verso do cliente, nada muda.
  const flipped = showBack && hasArtContent(art.back);
  const sheetKind = sheetKindOf(label);
  const top = PAD_CHIP + PAD_STACK;
  const total = top + 0.04;
  /** Altura do bloco até o topo da blocagem: o bloco virado apoia nela. */
  const stackTop = total + 0.02;

  const chip = useMemo(() => softBox(w, h, PAD_CHIP, 0.2, 0.03), [w, h]);
  const stack = useMemo(() => pageBlockGeometry(w - 0.02, h - 0.02, PAD_STACK, 0.2, 0), [w, h]);
  const cover = useMemo(() => curlGeometry(w, h), [w, h]);
  const flatCover = useMemo(() => new THREE.PlaneGeometry(w, h), [w, h]);
  const base = useMemo(() => faceGeometry(makeShape("rect", w, h, 0.2), w, h), [w, h]);
  const bead = useMemo(() => softBox(w + 0.04, 0.18, total + 0.02, 0.06, 0.04), [w, total]);
  const edge = useMemo(() => pageEdgeTexture("#fbfaf6", 0.01, []), []);
  useGeometryCleanup(chip);
  useGeometryCleanup(stack);
  useGeometryCleanup(cover);
  useGeometryCleanup(flatCover);
  useGeometryCleanup(base);
  useGeometryCleanup(bead);
  useEffect(() => () => edge.dispose(), [edge]);

  const dims = showDims && KIND_INFO[spec.kind].dims;
  const [lw, lh] = sizeLabels(spec);

  return (
    <group rotation={[-Math.PI / 2, 0, 0.3]} userData={{ view: { elevation: 0.9 } }}>
      <group scale={UNIT}>
        <group position-z={flipped ? stackTop : 0} rotation-x={flipped ? Math.PI : 0}>
          <mesh geometry={chip} position-z={PAD_CHIP / 2}>
            <meshStandardMaterial color="#978b77" roughness={0.95} />
          </mesh>
          {/* Verso do cliente no fundo do papelão (girado π em y: lê certo com o bloco desvirado). */}
          {flipped && (
            <mesh geometry={base} position-z={-0.004} rotation-y={Math.PI}>
              <PrintMaterial map={backArt} spec={spec} />
            </mesh>
          )}
          <mesh geometry={stack} position-z={PAD_CHIP + PAD_STACK / 2}>
            <meshStandardMaterial map={edge} roughness={0.95} />
          </mesh>
          {sheetKind === "art" ? (
            <PadArtSheet w={w} h={h} z={top + 0.008} art={art} label={label} />
          ) : (
            <PadPaperSheet w={w} h={h} z={top + 0.008} ruled={sheetKind === "lined"} />
          )}
          <group position-z={top + 0.03}>
            <mesh geometry={flipped ? flatCover : cover}>
              <PrintMaterial map={front} spec={spec} />
            </mesh>
            <mesh geometry={flipped ? flatCover : cover}>
              <meshStandardMaterial color="#f3f1ec" roughness={0.9} side={THREE.BackSide} />
            </mesh>
          </group>
          {/* Blocagem: cola no topo segurando capa, folhas e papelão. */}
          <mesh geometry={bead} position={[0, h / 2 + 0.02, stackTop / 2]}>
            <meshPhysicalMaterial color={spec.accentColor ?? "#a8322b"} roughness={0.5} clearcoat={0.4} clearcoatRoughness={0.3} />
          </mesh>
        </group>
        <Pencil x={w / 2 + 1.8} y={-h * 0.06} twist={0.08} />
      </group>
      {dims && <Dimensions w={w * UNIT} h={h * UNIT} z={(total + 0.05) * UNIT} labelW={lw} labelH={lh} />}
    </group>
  );
}

/**
 * Cadernos, agendas, planners, blocos e photobooks. O bloco ({pad}) fica deitado com o canto da capa
 * enrolado; os demais são capa dura em pé, em 3/4 (ver HardcoverModel).
 */
export function BookModel(props: ModelProps) {
  if (props.spec.variant === "pad") return <PadModel {...props} />;
  return <HardcoverModel {...props} />;
}
