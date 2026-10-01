"use client";

// Bolsas e sacolas de tecido: ecobag, sacola de presente/corda, bolsa de praia, necessaire, estojo, lixeira de carro.

import { useMemo } from "react";
import * as THREE from "three";
import { artAspect } from "@/lib/mockup-kinds";
import { Fabric, Print, useApparelArt, useGeometriesCleanup, useInflated } from "./fabric";
import { useArtTexture, type ModelProps } from "./shared";

export function BagModel({ spec, art, label }: ModelProps) {
  const printArt = useApparelArt(art);
  const aspect = artAspect(spec);
  const texture = useArtTexture(aspect, "front", printArt, label);
  const pouch = spec.pouch;
  const [w, h] = pouch ? [2.1, 1.25] : [1.75, 1.95];
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    const top = h / 2;
    const bottom = -h / 2;
    const r = pouch ? 0.22 : 0.06;
    const topW = pouch ? w / 2 : w / 2 - 0.04;
    s.moveTo(-topW, top);
    s.lineTo(topW, top);
    s.lineTo(w / 2, bottom + r);
    s.quadraticCurveTo(w / 2, bottom, w / 2 - r, bottom);
    s.lineTo(-w / 2 + r, bottom);
    s.quadraticCurveTo(-w / 2, bottom, -w / 2, bottom + r);
    s.closePath();
    return s;
  }, [w, h, pouch]);
  const surfaces = useInflated(shape, pouch ? 0.24 : 0.1, { falloff: pouch ? 0.4 : 0.18, folds: pouch ? 0.006 : 0.012 });
  const extras = useMemo(() => {
    if (pouch) {
      const zipper = new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(-w / 2 + 0.02, h / 2, 0), new THREE.Vector3(w / 2 - 0.02, h / 2, 0)), 8, 0.03, 8, false);
      return [zipper];
    }
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.36, h / 2 - 0.02, 0),
      new THREE.Vector3(-0.32, h / 2 + 0.5, 0),
      new THREE.Vector3(0, h / 2 + 0.72, 0),
      new THREE.Vector3(0.32, h / 2 + 0.5, 0),
      new THREE.Vector3(0.36, h / 2 - 0.02, 0),
    ]);
    return [new THREE.TubeGeometry(curve, 48, 0.04, 8, false)];
  }, [pouch, w, h]);
  useGeometriesCleanup(extras);
  const fabric = spec.baseColor === "#ffffff" && !pouch ? "#f2ede2" : spec.baseColor;
  const printH = Math.min(h * 0.62, (w * 0.62) / aspect);
  if (!surfaces) return null;
  return (
    <group rotation-y={0.45}>
      <mesh geometry={surfaces.front}>
        <Fabric color={fabric} />
        <Print map={texture} position={[0, pouch ? -0.04 : -0.08, 0.2]} rotation={[0, 0, 0]} size={[printH * aspect, printH]} />
      </mesh>
      <mesh geometry={surfaces.back}>
        <Fabric color={fabric} />
      </mesh>
      {pouch ? (
        <>
          <mesh geometry={extras[0]}>
            <meshStandardMaterial color="#2a2a2e" roughness={0.6} />
          </mesh>
          <mesh position={[w / 2 - 0.22, h / 2 - 0.08, 0.05]}>
            <boxGeometry args={[0.06, 0.16, 0.02]} />
            <meshStandardMaterial color="#c9ccd1" metalness={0.9} roughness={0.3} />
          </mesh>
        </>
      ) : (
        [0.035, -0.035].map((z) => (
          <mesh key={z} geometry={extras[0]} position-z={z} scale={[1, 1, 0.4]}>
            <Fabric color={fabric} />
          </mesh>
        ))
      )}
    </group>
  );
}
