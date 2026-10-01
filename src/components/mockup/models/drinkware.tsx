"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useArtTexture, type ModelProps, metalColor } from "./shared";

export function MugModel({ spec, art, label }: ModelProps) {
  const texture = useArtTexture(2.35, "front", art, label);
  const r = 0.62;
  const h = 1.5;
  const metal = spec.metal !== "none";
  return (
    <group rotation-y={Math.PI + 0.55}>
      <mesh castShadow>
        <cylinderGeometry args={[r, r, h, 96, 1, true]} />
        <meshPhysicalMaterial
          map={texture}
          color={metal ? metalColor(spec.metal) : spec.baseColor}
          metalness={metal ? 0.85 : 0}
          roughness={metal ? 0.18 : 0.12}
          clearcoat={metal ? 0.6 : 1}
          clearcoatRoughness={0.05}
        />
      </mesh>
      <mesh>
        <cylinderGeometry args={[r * 0.93, r * 0.93, h * 0.98, 96, 1, true]} />
        <meshStandardMaterial color={spec.innerColor} side={THREE.BackSide} roughness={0.15} />
      </mesh>
      <mesh position-y={h / 2} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[r * 0.93, r, 96]} />
        <meshStandardMaterial color={spec.innerColor === "#ffffff" ? "#ffffff" : spec.innerColor} roughness={0.15} />
      </mesh>
      <mesh position-y={-h / 2 + 0.06} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[r * 0.93, 64]} />
        <meshStandardMaterial color={spec.innerColor} roughness={0.2} />
      </mesh>
      <mesh position-y={-h / 2} rotation-x={Math.PI / 2}>
        <circleGeometry args={[r, 64]} />
        <meshStandardMaterial color="#f1f1f1" roughness={0.6} />
      </mesh>
      <group position={[0, 0.02, r - 0.02]} rotation-y={-Math.PI / 2}>
        <mesh rotation-z={-Math.PI / 2} castShadow>
          <torusGeometry args={[0.36, 0.075, 20, 48, Math.PI]} />
          <meshPhysicalMaterial color={spec.accentColor ?? (metal ? metalColor(spec.metal) : spec.baseColor)} metalness={metal ? 0.85 : 0} roughness={0.15} clearcoat={1} />
        </mesh>
      </group>
    </group>
  );
}


export function TumblerModel({ spec, art, label }: ModelProps) {
  const texture = useArtTexture(2.2, "front", art, label);
  const glass = /vidro|chopp/i.test(label);
  const bamboo = /bamb/i.test(label);
  return (
    <group rotation-y={Math.PI}>
      <mesh castShadow>
        <cylinderGeometry args={[0.6, 0.48, 2, 96, 1, true]} />
        {glass ? (
          <meshPhysicalMaterial map={texture} transmission={0.75} roughness={0.45} thickness={0.1} color="#ffffff" />
        ) : (
          <meshPhysicalMaterial map={texture} metalness={spec.metal !== "none" ? 0.6 : 0} roughness={0.25} clearcoat={0.6} />
        )}
      </mesh>
      <mesh position-y={-1} rotation-x={Math.PI / 2}>
        <circleGeometry args={[0.48, 48]} />
        <meshStandardMaterial color="#d9d9d9" />
      </mesh>
      <mesh position-y={1.06} castShadow>
        <cylinderGeometry args={[0.62, 0.62, 0.14, 64]} />
        <meshStandardMaterial color={bamboo ? "#c9a46c" : "#2a2a2e"} roughness={0.6} />
      </mesh>
    </group>
  );
}


export function BottleModel({ spec, art, label }: ModelProps) {
  const texture = useArtTexture(2.2, "front", art, label);
  const profile = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    pts.push(new THREE.Vector2(0, -1.25));
    pts.push(new THREE.Vector2(0.5, -1.25));
    pts.push(new THREE.Vector2(0.55, -1.15));
    pts.push(new THREE.Vector2(0.55, 0.55));
    pts.push(new THREE.Vector2(0.5, 0.78));
    pts.push(new THREE.Vector2(0.32, 0.98));
    pts.push(new THREE.Vector2(0.24, 1.05));
    pts.push(new THREE.Vector2(0.24, 1.18));
    return pts;
  }, []);
  const metal = spec.metal !== "none" || !/pl[aá]stic/i.test(label);
  return (
    <group rotation-y={Math.PI}>
      <mesh castShadow>
        <latheGeometry args={[profile, 96]} />
        <meshPhysicalMaterial color={metal ? "#dfe2e6" : "#f5f5f5"} metalness={metal ? 0.9 : 0} roughness={metal ? 0.25 : 0.4} clearcoat={0.5} />
      </mesh>
      <mesh position-y={-0.3}>
        <cylinderGeometry args={[0.556, 0.556, 1.6, 96, 1, true]} />
        <meshPhysicalMaterial map={texture} roughness={0.3} clearcoat={0.6} transparent />
      </mesh>
      <mesh position-y={1.28} castShadow>
        <cylinderGeometry args={[0.27, 0.27, 0.22, 48]} />
        <meshStandardMaterial color={/bamb/i.test(label) ? "#c9a46c" : "#1f1f22"} roughness={0.5} />
      </mesh>
      {/mosquet/i.test(label) && (
        <mesh position={[0, 1.52, 0]} rotation-y={Math.PI / 2}>
          <torusGeometry args={[0.16, 0.025, 12, 32]} />
          <meshStandardMaterial color="#e07b22" metalness={0.6} roughness={0.35} />
        </mesh>
      )}
    </group>
  );
}

