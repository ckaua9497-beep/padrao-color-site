"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { artAspect } from "@/lib/mockup-kinds";
import { heartPath, roundPath } from "../art";
import { useArtTexture, useGeometryCleanup, type ModelProps, fitFlat, Tube, Waving, pillowGeometry } from "./shared";

function teeShape(sleeveless: boolean) {
  const s = new THREE.Shape();
  if (sleeveless) {
    s.moveTo(-0.3, 1.15);
    s.quadraticCurveTo(0, 0.88, 0.3, 1.15);
    s.lineTo(0.44, 1.14);
    s.quadraticCurveTo(0.46, 0.55, 0.68, 0.4);
    s.lineTo(0.7, -1.15);
    s.quadraticCurveTo(0, -1.2, -0.7, -1.15);
    s.lineTo(-0.68, 0.4);
    s.quadraticCurveTo(-0.46, 0.55, -0.44, 1.14);
    s.closePath();
    return s;
  }
  s.moveTo(-0.28, 1.15);
  s.quadraticCurveTo(0, 0.9, 0.28, 1.15);
  s.lineTo(0.62, 1.05);
  s.lineTo(1.1, 0.6);
  s.lineTo(0.88, 0.34);
  s.lineTo(0.64, 0.52);
  s.lineTo(0.66, -1.15);
  s.quadraticCurveTo(0, -1.2, -0.66, -1.15);
  s.lineTo(-0.64, 0.52);
  s.lineTo(-0.88, 0.34);
  s.lineTo(-1.1, 0.6);
  s.lineTo(-0.62, 1.05);
  s.closePath();
  return s;
}


export function TshirtModel({ spec, art, label }: ModelProps) {
  const printArt = useMemo(() => ({ ...art, background: art.src ? "rgba(0,0,0,0)" : art.background }), [art]);
  const aspect = artAspect(spec);
  const texture = useArtTexture(aspect, "front", printArt, label);
  const printW = Math.min(0.95, 0.8 * (spec.widthCm / 21));
  const geometry = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(teeShape(spec.sleeveless), {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.04,
      bevelSegments: 8,
      curveSegments: 24,
    });
    g.translate(0, 0, -0.025);
    return g;
  }, [spec.sleeveless]);
  useGeometryCleanup(geometry);
  return (
    <group rotation-y={0.25}>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial color={spec.baseColor} roughness={0.95} sheen={1} sheenRoughness={0.8} sheenColor="#ffffff" />
      </mesh>
      <mesh position={[0, 0.22, 0.087]}>
        <planeGeometry args={[printW, printW / aspect]} />
        <meshStandardMaterial map={texture} transparent roughness={0.85} />
      </mesh>
    </group>
  );
}


export function CapModel({ spec, art, label }: ModelProps) {
  const texture = useArtTexture(1.6, "front", art, label);
  return (
    <group rotation-y={0.5} position-y={-0.2}>
      <mesh scale={[1, 0.82, 1]}>
        <sphereGeometry args={[0.9, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial color={spec.baseColor} roughness={0.95} sheen={1} sheenColor="#ffffff" />
      </mesh>
      <mesh scale={[1.002, 0.822, 1.002]}>
        <sphereGeometry args={[0.9, 64, 32, Math.PI / 2 - 0.75, 1.5, 0.45, 0.85]} />
        <meshStandardMaterial map={texture} transparent roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.01, 0.35]} rotation-x={0.12}>
        <cylinderGeometry args={[0.8, 0.8, 0.03, 48, 1, false, -Math.PI / 2, Math.PI]} />
        <meshPhysicalMaterial color={spec.baseColor} roughness={0.9} />
      </mesh>
      <mesh position-y={0.74}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial color={spec.baseColor} roughness={0.9} />
      </mesh>
    </group>
  );
}


export function CushionModel({ spec, art, label }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.2);
  const mask = spec.shape === "round" ? roundPath : spec.shape === "heart" ? heartPath : undefined;
  const front = useArtTexture(artAspect(spec), "front", art, label, mask);
  const back = useArtTexture(artAspect(spec), spec.back === "same" ? "front" : "blank", art, label, mask);
  const thick = Math.min(w, h) * 0.32;
  const geometry = useMemo(() => pillowGeometry(w, h, thick, spec.shape === "heart" ? "round" : spec.shape), [w, h, thick, spec.shape]);
  useGeometryCleanup(geometry);
  const transparent = spec.shape !== "rect";
  return (
    <group rotation={[-0.15, 0.4, 0]}>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial map={front} roughness={0.9} sheen={0.25} sheenColor="#d9d9d9" transparent={transparent} alphaTest={transparent ? 0.5 : 0} />
      </mesh>
      <mesh geometry={geometry} rotation-y={Math.PI}>
        <meshPhysicalMaterial map={back} roughness={0.9} sheen={0.25} sheenColor="#d9d9d9" transparent={transparent} alphaTest={transparent ? 0.5 : 0} />
      </mesh>
    </group>
  );
}


export function ClothModel({ spec, art, label }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.3);
  const texture = useArtTexture(artAspect(spec), "front", art, label);
  return (
    <group rotation-y={0.3}>
      <Tube length={w * 1.15} radius={0.022} color="#b98b5a" position={[0, h / 2 + 0.02, 0]} />
      <Waving w={w} h={h} texture={texture} strength={0.05} anchor="top" />
    </group>
  );
}


export function BagModel({ spec, art, label }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.1);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const depth = w * 0.25;
  const handle = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-w * 0.22, 0, 0),
      new THREE.Vector3(-w * 0.18, h * 0.32, 0),
      new THREE.Vector3(w * 0.18, h * 0.32, 0),
      new THREE.Vector3(w * 0.22, 0, 0),
    ]);
    return new THREE.TubeGeometry(curve, 48, 0.025, 10);
  }, [w, h]);
  useGeometryCleanup(handle);
  const fabric = spec.baseColor === "#ffffff" ? "#f2ede2" : spec.baseColor;
  return (
    <group rotation-y={0.45}>
      <mesh>
        <boxGeometry args={[w, h, depth]} />
        <meshPhysicalMaterial attach="material-0" color={fabric} roughness={0.95} sheen={1} />
        <meshPhysicalMaterial attach="material-1" color={fabric} roughness={0.95} sheen={1} />
        <meshStandardMaterial attach="material-2" color="#d8d2c4" roughness={1} />
        <meshPhysicalMaterial attach="material-3" color={fabric} roughness={0.95} />
        <meshPhysicalMaterial attach="material-4" map={front} roughness={0.9} sheen={1} />
        <meshPhysicalMaterial attach="material-5" color={fabric} roughness={0.95} sheen={1} />
      </mesh>
      <mesh geometry={handle} position={[0, h / 2, depth / 2 - 0.02]}>
        <meshStandardMaterial color={fabric} roughness={0.95} />
      </mesh>
      <mesh geometry={handle} position={[0, h / 2, -depth / 2 + 0.02]}>
        <meshStandardMaterial color={fabric} roughness={0.95} />
      </mesh>
    </group>
  );
}

