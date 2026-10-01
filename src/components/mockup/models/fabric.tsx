"use client";

// Helpers de tecido compartilhados por camiseta, bolsas, têxteis de casa e conforto.
// Arquivo estável: os modelos importam daqui; para um helper novo, crie no arquivo do próprio modelo.

import { useEffect, useMemo } from "react";
import { Decal } from "@react-three/drei";
import * as THREE from "three";
import { inflatedSurface, shapePolygon } from "./inflate";
import { useGeometryCleanup, type ModelProps } from "./shared";

export function Fabric({ color, sheen = 1 }: { color: string; sheen?: number }) {
  return <meshPhysicalMaterial color={color} roughness={0.92} sheen={sheen} sheenRoughness={0.8} sheenColor="#ffffff" />;
}

/** Estampa projetada sobre a malha-mãe (não aparece pelas costas: depthTest ligado). */
export function Print({ map, position, size, rotation }: { map: THREE.Texture; position: [number, number, number]; size: [number, number]; rotation?: [number, number, number] }) {
  return (
    <Decal position={position} rotation={rotation} scale={[size[0], size[1], 0.5]} depthTest>
      <meshStandardMaterial map={map} transparent alphaTest={0.02} roughness={0.85} polygonOffset polygonOffsetFactor={-10} depthTest />
    </Decal>
  );
}

/** Arte de vestuário e sacola: imagem enviada sem fundo (o tecido aparece ao redor). */
export function useApparelArt(art: ModelProps["art"]) {
  return useMemo(() => ({ ...art, background: art.src ? "rgba(0,0,0,0)" : art.background }), [art]);
}

export function useGeometriesCleanup(list: THREE.BufferGeometry[]) {
  useEffect(() => () => list.forEach((g) => g.dispose()), [list]);
}

export function useInflated(shape: THREE.Shape | null, height: number, options: { falloff?: number; folds?: number; resolution?: number } = {}) {
  const { falloff, folds = 0, resolution = 90 } = options;
  const surfaces = useMemo(() => {
    if (!shape) return null;
    const polygon = shapePolygon(shape);
    return {
      polygon,
      front: inflatedSurface(polygon, { height, falloff, folds, resolution, side: 1 }),
      back: inflatedSurface(polygon, { height, falloff, folds, resolution, side: -1 }),
    };
  }, [shape, height, falloff, folds, resolution]);
  useGeometryCleanup(surfaces?.front);
  useGeometryCleanup(surfaces?.back);
  return surfaces;
}

export function closedTube(polygon: THREE.Vector2[], radius: number, z = 0) {
  const curve = new THREE.CatmullRomCurve3(
    polygon.map((p) => new THREE.Vector3(p.x, p.y, z)),
    true,
  );
  return new THREE.TubeGeometry(curve, Math.max(64, polygon.length), radius, 10, true);
}
