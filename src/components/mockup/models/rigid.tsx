"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { artAspect } from "@/lib/mockup-kinds";
import { roundPath } from "../art";
import { useArtTexture, roughnessOf, PrintMaterial, makeShape, faceGeometry, Slab, Dimensions, sizeLabels, type ModelProps, fitFlat, Standoffs } from "./shared";

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
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[-0.08, 0.32, 0]}>
      <mesh geometry={face} position-z={-d / 2 + 0.002}>
        <PrintMaterial map={front} spec={{ ...spec, clearcoat: 0 }} />
      </mesh>
      <mesh geometry={glass} castShadow>
        <meshPhysicalMaterial transmission={1} thickness={d} roughness={0.04} ior={1.49} color="#ffffff" clearcoat={1} clearcoatRoughness={0.02} />
      </mesh>
      <Standoffs w={w} h={h} z={d / 2 + 0.03} />
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


export function MatModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.4);
  const mask = spec.shape === "round" ? roundPath : undefined;
  const front = useArtTexture(artAspect(spec), "front", art, label, mask);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[-1.05, 0, 0.35]}>
      <Slab w={w} h={h} d={0.05} spec={{ ...spec, finish: "matte" }} front={front} radius={0.1} edgeColor="#1f1f1f" backColor="#141414" />
      {showDims && <Dimensions w={w} h={h} z={0.03} labelW={lw} labelH={lh} />}
    </group>
  );
}


export function BoxModel({ spec, art, label }: ModelProps) {
  const { w, h } = fitFlat(spec, 2);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const top = useArtTexture(1, "front", art, label);
  const depth = Math.min(w, h) * 0.8;
  const clear = /acr[ií]lic/i.test(label);
  return (
    <group rotation={[-0.25, 0.6, 0]}>
      <mesh castShadow>
        <boxGeometry args={[w, h, depth]} />
        {clear ? (
          <meshPhysicalMaterial transmission={1} roughness={0.05} thickness={0.05} />
        ) : (
          <>
            <meshStandardMaterial attach="material-0" color="#f6f6f6" roughness={0.8} />
            <meshStandardMaterial attach="material-1" color="#f6f6f6" roughness={0.8} />
            <meshPhysicalMaterial attach="material-2" map={top} roughness={roughnessOf(spec)} clearcoat={spec.clearcoat} />
            <meshStandardMaterial attach="material-3" color="#efefef" roughness={0.8} />
            <meshPhysicalMaterial attach="material-4" map={front} roughness={roughnessOf(spec)} clearcoat={spec.clearcoat} />
            <meshStandardMaterial attach="material-5" color="#f6f6f6" roughness={0.8} />
          </>
        )}
      </mesh>
      {clear && (
        <mesh position-z={depth / 2 + 0.002}>
          <planeGeometry args={[w * 0.9, h * 0.9]} />
          <meshStandardMaterial map={front} />
        </mesh>
      )}
    </group>
  );
}

