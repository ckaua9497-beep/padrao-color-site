"use client";

// Cadernos, agendas, planners, blocos e photobooks.

import { artAspect } from "@/lib/mockup-kinds";
import { useArtTexture, Slab, type ModelProps, fitFlat, Spiral } from "./shared";

export function BookModel({ spec, art, label }: ModelProps) {
  const { w, h, scale } = fitFlat(spec, 2.1);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const thick = Math.max(spec.depthCm * scale, 0.14);
  const spiral = spec.binding === "spiral";
  return (
    <group rotation={[-0.3, 0.55, 0]}>
      <group position-z={thick / 2}>
        <Slab w={w} h={h} d={0.03} spec={spec} front={front} radius={0.02} edgeColor="#2b2b2f" backColor="#2b2b2f" />
      </group>
      <group position-z={-thick / 2}>
        <Slab w={w} h={h} d={0.03} spec={spec} front={front} radius={0.02} edgeColor="#2b2b2f" backColor="#2b2b2f" />
      </group>
      <mesh>
        <boxGeometry args={[w * 0.97, h * 0.97, thick - 0.03]} />
        <meshStandardMaterial color="#fbfaf6" roughness={0.95} />
      </mesh>
      {spiral ? (
        <Spiral length={h} axis="y" offset={[-w / 2 + 0.06, 0, 0]} />
      ) : (
        <mesh position-x={-w / 2}>
          <boxGeometry args={[0.04, h, thick + 0.03]} />
          <meshStandardMaterial color="#2b2b2f" roughness={0.6} />
        </mesh>
      )}
    </group>
  );
}
