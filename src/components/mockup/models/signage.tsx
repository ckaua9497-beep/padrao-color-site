"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { artAspect } from "@/lib/mockup-kinds";
import { featherPath } from "../art";
import { useAnimate } from "../viewer-hooks";
import {
  AcrylicMaterials,
  Cord,
  Dimensions,
  RoundedBlock,
  Slab,
  Tube,
  Waving,
  backVariant,
  fitFlat,
  makeShape,
  sizeLabels,
  useArtTexture,
  useGeometryCleanup,
  type ModelProps,
} from "./shared";

export function NeonModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h } = fitFlat(spec);
  const neon = useArtTexture(artAspect(spec), "neon", art, label);
  const plate = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(makeShape("rect", w, h, 0.05), { depth: 0.04, bevelEnabled: false, curveSegments: 24 });
    g.translate(0, 0, -0.02);
    return g;
  }, [w, h]);
  useGeometryCleanup(plate);
  const light = useRef<THREE.PointLight>(null);
  const animate = useAnimate();
  const time = useRef(0);
  useFrame((state, delta) => {
    if (!animate || !light.current) return;
    time.current += Math.min(delta, 0.1);
    light.current.intensity = 2.4 + Math.sin(time.current * 3) * 0.15;
    state.invalidate();
  });
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[-0.05, 0.25, 0]}>
      {/* Placa de acrílico onde o LED é fixado. */}
      <mesh geometry={plate} renderOrder={1}>
        <AcrylicMaterials />
      </mesh>
      <mesh position-z={0.03} renderOrder={2}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={neon} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[0, 0, 0.6]} color={spec.ledColors[0]} distance={4} />
      {showDims && <Dimensions w={w} h={h} z={0.05} labelW={lw} labelH={lh} light />}
    </group>
  );
}

/** Posições dos ilhós a cada ~50 cm nas bordas, como na lona de verdade. */
function grommetPositions(spec: ModelProps["spec"], w: number, h: number): [number, number][] {
  const inset = 0.06;
  const across = Math.max(2, Math.round(spec.widthCm / 50) + 1);
  const down = Math.max(2, Math.round(spec.heightCm / 50) + 1);
  const points: [number, number][] = [];
  for (let i = 0; i < across; i += 1) {
    const x = -w / 2 + inset + ((w - inset * 2) * i) / (across - 1);
    points.push([x, h / 2 - inset], [x, -h / 2 + inset]);
  }
  for (let j = 1; j < down - 1; j += 1) {
    const y = -h / 2 + inset + ((h - inset * 2) * j) / (down - 1);
    points.push([-w / 2 + inset, y], [w / 2 - inset, y]);
  }
  return points;
}

export function BannerModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.4);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  // Lona dupla face: o verso também leva a arte.
  const back = useArtTexture(artAspect(spec), backVariant(spec), art, label);
  const [lw, lh] = sizeLabels(spec);
  const cord = useMemo(
    () => [new THREE.Vector3(-w / 2 - 0.02, h / 2 + 0.02, 0), new THREE.Vector3(0, h / 2 + 0.38, 0), new THREE.Vector3(w / 2 + 0.02, h / 2 + 0.02, 0)],
    [w, h],
  );
  return (
    <group rotation={[0, 0.3, 0]}>
      <Slab w={w} h={h} d={0.008} spec={spec} front={front} back={spec.back === "same" ? back : undefined} />
      {spec.grommets ? (
        grommetPositions(spec, w, h).map(([x, y]) => (
          <mesh key={`${x.toFixed(3)}:${y.toFixed(3)}`} position={[x, y, 0.006]}>
            <torusGeometry args={[0.025, 0.008, 12, 24]} />
            <meshStandardMaterial color="#c9c9c9" metalness={1} roughness={0.3} />
          </mesh>
        ))
      ) : (
        <>
          <Tube length={w * 1.08} position={[0, h / 2 + 0.01, 0]} />
          <Tube length={w * 1.08} position={[0, -h / 2 - 0.01, 0]} />
          <Cord points={cord} />
        </>
      )}
      {showDims && <Dimensions w={w} h={h} z={0.02} labelW={lw} labelH={lh} />}
    </group>
  );
}

/** Backlight: caixa de luz com moldura de alumínio e a lona iluminada por trás. */
export function LightboxModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.4);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const frame = 0.06;
  const depth = 0.16;
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[-0.04, 0.3, 0]}>
      <mesh position-z={-depth / 2}>
        <boxGeometry args={[w + frame * 2, h + frame * 2, depth]} />
        <meshStandardMaterial color="#c3c7cc" metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh position-z={0.002}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={front} emissiveMap={front} emissive="#ffffff" emissiveIntensity={0.55} roughness={0.6} toneMapped={false} />
      </mesh>
      {showDims && <Dimensions w={w} h={h} z={0.02} labelW={lw} labelH={lh} />}
    </group>
  );
}

export function RollupModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.6);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[0, 0.35, 0]}>
      <RoundedBlock w={w * 1.06} h={0.09} d={0.22} radius={0.03} color="#cfd2d6" metalness={0.9} roughness={0.3} position={[0, -h / 2 - 0.045, 0]} />
      <Slab w={w} h={h} d={0.006} spec={spec} front={front} />
      <Tube length={w * 1.02} radius={0.018} color="#bfc3c8" position={[0, h / 2, 0]} />
      <mesh position={[0, 0, -0.06]}>
        <cylinderGeometry args={[0.012, 0.012, h, 12]} />
        <meshStandardMaterial color="#9aa0a6" metalness={0.9} roughness={0.3} />
      </mesh>
      {showDims && <Dimensions w={w} h={h} z={0.02} labelW={lw} labelH={lh} />}
    </group>
  );
}

export function FlagModel({ spec, art, label }: ModelProps) {
  const rect = spec.flagStyle === "rect";
  // Base e haste vendidas sozinhas: só a estrutura, sem tecido estampado.
  const hardwareOnly = spec.kind === "hardware";
  const target = 2.4;
  const scale = target / Math.max(spec.widthCm, spec.heightCm);
  const w = spec.widthCm * scale;
  const h = spec.heightCm * scale;
  const texture = useArtTexture(spec.widthCm / spec.heightCm, "front", art, label, rect ? undefined : featherPath);
  const poleH = rect ? h * 2.2 : h + 0.15;
  return (
    <group rotation-y={0.4}>
      <mesh position={[-w / 2 - 0.015, rect ? poleH / 2 - h * 0.6 : 0.05, 0]}>
        <cylinderGeometry args={[0.018, 0.018, poleH, 16]} />
        <meshStandardMaterial color="#4b4f55" metalness={0.8} roughness={0.35} />
      </mesh>
      {!hardwareOnly && (
        <group position-y={rect ? poleH - h * 0.6 - h / 2 - 0.05 : 0}>
          <Waving w={w} h={h} texture={texture} strength={rect ? 0.12 : 0.06} />
        </group>
      )}
      {hardwareOnly && (
        <mesh position={[-w / 2 + 0.2, h / 2 - 0.1, 0]} rotation-z={-0.35}>
          <cylinderGeometry args={[0.012, 0.012, 0.9, 12]} />
          <meshStandardMaterial color="#4b4f55" metalness={0.8} roughness={0.35} />
        </mesh>
      )}
      {!rect && (
        <mesh position={[-w / 2 - 0.015, -h / 2 - 0.05, 0]}>
          <cylinderGeometry args={[0.22, 0.26, 0.08, 32]} />
          <meshStandardMaterial color="#2b2b2f" roughness={0.6} />
        </mesh>
      )}
    </group>
  );
}
