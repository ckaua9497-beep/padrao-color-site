"use client";

// Bandeiras, wind banners, wind ball e as bases/hastes vendidas avulsas.

import { dropPath, featherPath, knifePath, sailPath } from "../art";
import { Waving, useArtTexture, type ModelProps } from "./shared";

/** Contorno do tecido de cada modelo de wind banner. */
const FLAG_SHAPES = { pena: featherPath, faca: knifePath, gota: dropPath, vela: sailPath };

export function FlagModel({ spec, art, label }: ModelProps) {
  const rect = spec.flagStyle === "rect";
  // Base e haste vendidas sozinhas: só a estrutura, sem tecido estampado.
  const hardwareOnly = spec.kind === "hardware";
  const target = 2.4;
  const scale = target / Math.max(spec.widthCm, spec.heightCm);
  const w = spec.widthCm * scale;
  const h = spec.heightCm * scale;
  const mask = spec.flagStyle === "rect" ? undefined : FLAG_SHAPES[spec.flagStyle];
  const texture = useArtTexture(spec.widthCm / spec.heightCm, "front", art, label, mask);
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

/** Base e haste vendidas sem bandeira: provisório, mostra o wind banner montado com a arte simulada. */
export function HardwareModel(props: ModelProps) {
  return <FlagModel {...props} />;
}
