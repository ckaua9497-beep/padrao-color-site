"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { artAspect } from "@/lib/mockup-kinds";
import { roundPath } from "../art";
import {
  AcrylicMaterials,
  Dimensions,
  PrintMaterial,
  Slab,
  Standoffs,
  faceGeometry,
  fitFlat,
  makeShape,
  roughnessOf,
  sizeLabels,
  useArtTexture,
  useGeometryCleanup,
  type ModelProps,
} from "./shared";

export function PanelModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const d = Math.max(spec.depthCm * scale, 0.03);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[-0.08, 0.3, 0]}>
      <Slab w={w} h={h} d={d} spec={spec} front={front} radius={0.02} edgeColor="#ffffff" />
      <Standoffs w={w} h={h} z={d / 2 + 0.03} />
      {showDims && <Dimensions w={w} h={h} z={d} labelW={lw} labelH={lh} />}
    </group>
  );
}

export function AcrylicModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const d = Math.max(spec.depthCm * scale * 2, 0.05);
  const shape = useMemo(() => makeShape("rect", w, h, 0.03), [w, h]);
  const glass = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 3, curveSegments: 24 });
    g.translate(0, 0, -d / 2);
    return g;
  }, [shape, d]);
  const face = useMemo(() => faceGeometry(shape, w, h), [shape, w, h]);
  useGeometryCleanup(glass);
  useGeometryCleanup(face);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[-0.08, 0.32, 0]}>
      {/* Impressão UV no verso do acrílico, vista através da placa. */}
      <mesh geometry={face} position-z={-d / 2 + 0.002}>
        <PrintMaterial map={front} spec={{ ...spec, clearcoat: 0 }} />
      </mesh>
      <mesh geometry={glass} renderOrder={1}>
        <AcrylicMaterials />
      </mesh>
      <Standoffs w={w} h={h} z={d / 2 + 0.03} />
      {showDims && <Dimensions w={w} h={h} z={d} labelW={lw} labelH={lh} />}
    </group>
  );
}

/** Chaveiro: peça pequena de acrílico com furo, argola e corrente. */
export function KeychainModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h } = fitFlat(spec, 1.8);
  const mask = spec.shape === "round" ? roundPath : undefined;
  const front = useArtTexture(artAspect(spec), "front", art, label, mask);
  const d = 0.09;
  const radius = Math.min(w, h) * 0.18;
  const outline = useMemo(() => {
    const s = makeShape(spec.shape === "round" ? "round" : "rect", w, h, radius);
    const hole = new THREE.Path();
    hole.absarc(0, h / 2 - 0.16, 0.07, 0, Math.PI * 2, true);
    s.holes.push(hole);
    return s;
  }, [spec.shape, w, h, radius]);
  const body = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(outline, { depth: d, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 3, curveSegments: 32 });
    g.translate(0, 0, -d / 2);
    return g;
  }, [outline]);
  const face = useMemo(() => faceGeometry(makeShape(spec.shape === "round" ? "round" : "rect", w * 0.94, h * 0.94, radius * 0.9), w * 0.94, h * 0.94), [spec.shape, w, h, radius]);
  useGeometryCleanup(body);
  useGeometryCleanup(face);
  const [lw, lh] = sizeLabels(spec);
  const ringY = h / 2 - 0.16;
  return (
    <group rotation={[-0.12, 0.35, 0.08]}>
      <mesh geometry={face} position-z={0.001}>
        <PrintMaterial map={front} spec={spec} transparent={!!mask} />
      </mesh>
      <mesh geometry={body} renderOrder={1}>
        <AcrylicMaterials />
      </mesh>
      <mesh position={[0, ringY + 0.25, 0]} rotation-y={Math.PI / 2}>
        <torusGeometry args={[0.24, 0.022, 14, 48]} />
        <meshStandardMaterial color="#d9dbde" metalness={1} roughness={0.25} />
      </mesh>
      {[0.55, 0.72].map((y, i) => (
        <mesh key={y} position={[0, ringY + y, 0]} rotation-y={i % 2 ? 0 : Math.PI / 2}>
          <torusGeometry args={[0.06, 0.014, 10, 24]} />
          <meshStandardMaterial color="#d9dbde" metalness={1} roughness={0.25} />
        </mesh>
      ))}
      {showDims && <Dimensions w={w} h={h} z={d} labelW={lw} labelH={lh} />}
    </group>
  );
}

export function CanvasModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h, scale } = fitFlat(spec);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const d = Math.max(spec.depthCm * scale, 0.1);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[-0.06, 0.35, 0]}>
      <Slab w={w} h={h} d={d} spec={{ ...spec, finish: "matte" }} front={front} edgeColor="#efe9dd" backColor="#cdb48a" />
      {showDims && <Dimensions w={w} h={h} z={d / 2} labelW={lw} labelH={lh} />}
    </group>
  );
}

type FlatLook = { thickness: number; radius: number; edge: string; back: string; tilt: number; finish: "matte" | "satin" };

/** Peças que ficam deitadas: mouse pad/jogo americano, tapete, porta-copos e tábua. */
function flatLook(spec: ModelProps["spec"]): FlatLook {
  switch (spec.kind) {
    case "rug":
      return { thickness: 0.08, radius: 0.06, edge: spec.baseColor, back: "#1a1a1a", tilt: -1.15, finish: "matte" };
    case "coaster":
      return { thickness: 0.07, radius: 0.12, edge: "#c49a6c", back: "#b98f62", tilt: -1.0, finish: "satin" };
    case "board":
      return { thickness: 0.13, radius: 0.08, edge: "#b98b5a", back: "#a87c4f", tilt: -0.95, finish: "matte" };
    default:
      return { thickness: 0.05, radius: 0.1, edge: "#1f1f1f", back: "#141414", tilt: -1.05, finish: "matte" };
  }
}

export function MatModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.4);
  const look = flatLook(spec);
  const mask = spec.shape === "round" ? roundPath : undefined;
  const front = useArtTexture(artAspect(spec), "front", art, label, mask);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[look.tilt, 0, 0.35]}>
      <Slab w={w} h={h} d={look.thickness} spec={{ ...spec, finish: look.finish }} front={front} radius={look.radius} edgeColor={look.edge} backColor={look.back} />
      {showDims && <Dimensions w={w} h={h} z={look.thickness / 2 + 0.01} labelW={lw} labelH={lh} />}
    </group>
  );
}

export function BoxModel({ spec, art, label }: ModelProps) {
  const { w, h } = fitFlat(spec, 2);
  const depth = Math.min(w, h) * 0.8;
  const front = useArtTexture(artAspect(spec), "front", art, label);
  // A tampa mede largura × profundidade; a arte segue essa proporção.
  const top = useArtTexture(w / depth, "front", art, label);
  if (spec.glass) {
    return (
      <group rotation={[-0.25, 0.6, 0]}>
        <mesh position-z={depth / 2 - 0.004}>
          <planeGeometry args={[w * 0.9, h * 0.9]} />
          <meshStandardMaterial map={front} />
        </mesh>
        <mesh renderOrder={1}>
          <boxGeometry args={[w, h, depth]} />
          <meshPhysicalMaterial color="#f4fbfa" transparent opacity={0.2} roughness={0.03} clearcoat={1} depthWrite={false} />
        </mesh>
      </group>
    );
  }
  return (
    <group rotation={[-0.25, 0.6, 0]}>
      <mesh>
        <boxGeometry args={[w, h, depth]} />
        <meshStandardMaterial attach="material-0" color="#f6f6f6" roughness={0.8} />
        <meshStandardMaterial attach="material-1" color="#f6f6f6" roughness={0.8} />
        <meshPhysicalMaterial attach="material-2" map={top} roughness={roughnessOf(spec)} clearcoat={spec.clearcoat} />
        <meshStandardMaterial attach="material-3" color="#efefef" roughness={0.8} />
        <meshPhysicalMaterial attach="material-4" map={front} roughness={roughnessOf(spec)} clearcoat={spec.clearcoat} />
        <meshStandardMaterial attach="material-5" color="#f6f6f6" roughness={0.8} />
      </mesh>
    </group>
  );
}
