"use client";

// Caixas, kits e embalagens.

import { artAspect } from "@/lib/mockup-kinds";
import { fitFlat, roughnessOf, useArtTexture, type ModelProps } from "./shared";

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
