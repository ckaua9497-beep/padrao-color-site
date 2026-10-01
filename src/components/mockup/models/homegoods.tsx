"use client";

// Têxteis de casa: almofadas, cama pet e tecidos (guardanapo, pano de prato, capa de corte, tecido sublimado).

import { useMemo } from "react";
import { artAspect } from "@/lib/mockup-kinds";
import { Fabric, closedTube, useInflated } from "./fabric";
import { Tube, Waving, fitFlat, makeShape, useArtTexture, useGeometryCleanup, type ModelProps } from "./shared";

// ---------------------------------------------------------------------------- almofada e cama pet

export function CushionModel({ spec, art, label }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.2);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const back = useArtTexture(artAspect(spec), spec.back === "same" ? "front" : "blank", art, label);
  const shape = useMemo(() => makeShape(spec.shape, w, h, Math.min(w, h) * 0.14), [spec.shape, w, h]);
  const thick = Math.min(w, h) * 0.16;
  const surfaces = useInflated(shape, thick, { falloff: Math.min(w, h) * 0.32, folds: 0.004 });
  const piping = useMemo(() => (surfaces ? closedTube(surfaces.polygon, 0.022) : null), [surfaces]);
  useGeometryCleanup(piping);
  if (!surfaces) return null;
  return (
    <group rotation={[-0.15, 0.4, 0]}>
      <mesh geometry={surfaces.front}>
        <meshPhysicalMaterial map={front} roughness={0.9} sheen={0.3} sheenColor="#d9d9d9" />
      </mesh>
      <mesh geometry={surfaces.back}>
        <meshPhysicalMaterial map={back} roughness={0.9} sheen={0.3} sheenColor="#d9d9d9" />
      </mesh>
      {piping && (
        <mesh geometry={piping}>
          <meshStandardMaterial color="#efefef" roughness={0.85} />
        </mesh>
      )}
    </group>
  );
}

export function PetBedModel({ spec, art, label }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.4);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const round = spec.shape === "round";
  const rim = 0.2;
  const outline = useMemo(() => makeShape(round ? "round" : "rect", w - rim * 2, h - rim * 2, Math.min(w, h) * 0.18), [round, w, h]);
  const surfaces = useInflated(outline, 0.1, { falloff: 0.25, folds: 0.004 });
  const bolster = useMemo(() => (surfaces ? closedTube(surfaces.polygon, rim, 0) : null), [surfaces]);
  useGeometryCleanup(bolster);
  const fabric = spec.baseColor === "#ffffff" ? "#3b3b40" : spec.baseColor;
  if (!surfaces) return null;
  return (
    <group rotation={[-1.05, 0, 0.3]}>
      <mesh geometry={surfaces.front} position-z={0.02}>
        <meshPhysicalMaterial map={front} roughness={0.9} sheen={0.3} sheenColor="#d9d9d9" />
      </mesh>
      <mesh geometry={surfaces.back} position-z={0.02}>
        <Fabric color={fabric} />
      </mesh>
      {bolster && (
        <mesh geometry={bolster} position-z={0.08} scale={[1, 1, 0.9]}>
          <Fabric color={fabric} />
        </mesh>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------- pano pendurado e bolsas

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
