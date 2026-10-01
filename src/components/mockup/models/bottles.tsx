"use client";

// Copos (térmico, travel mug, vidro) e garrafas (squeeze, térmica, infantil).

import { useMemo } from "react";
import * as THREE from "three";
import { artAspect } from "@/lib/mockup-kinds";
import { bandGeometry, useArtTexture, useGeometryCleanup, type ModelProps } from "./shared";
import { VIEW_ROTATION, lathe, smoothProfile, surfaceOf, SurfaceMaterial, PrintBand, handleGeometry } from "./vessel";

const TUMBLER_CM = { top: 9, bottom: 7, height: 15 };

export function TumblerModel({ spec, art, label }: ModelProps) {
  const texture = useArtTexture(artAspect(spec), "front", art, label);
  const surface = surfaceOf(spec);
  const unit = 2 / TUMBLER_CM.height;
  const rTop = (TUMBLER_CM.top / 2) * unit;
  const rBottom = (TUMBLER_CM.bottom / 2) * unit;
  const h = TUMBLER_CM.height * unit;
  const lidColor = spec.accentColor ?? "#2a2a2e";

  const body = useMemo(
    () =>
      lathe([
        [0, 0.01],
        [rBottom * 0.85, 0],
        [rBottom, 0.04],
        [rTop, h],
        [rTop - 0.035, h],
        [rBottom - 0.03, 0.09],
        [0, 0.085],
      ]),
    [rTop, rBottom, h],
  );
  const bandH = Math.min(spec.heightCm * unit, h * 0.8);
  const bandCenter = h * 0.48;
  const bandTop = rBottom + (rTop - rBottom) * ((bandCenter + bandH / 2) / h) + 0.004;
  const bandBottom = rBottom + (rTop - rBottom) * ((bandCenter - bandH / 2) / h) + 0.004;
  const band = useMemo(
    () => bandGeometry({ radiusTop: bandTop, radiusBottom: bandBottom, height: bandH, width: spec.widthCm * unit }),
    [bandTop, bandBottom, bandH, spec.widthCm, unit],
  );
  const handle = useMemo(() => (spec.handle ? handleGeometry(rTop * 0.97, h * 0.28, h * 0.74, 0.5, 0.07) : null), [spec.handle, rTop, h]);
  useGeometryCleanup(body);
  useGeometryCleanup(band);
  useGeometryCleanup(handle);

  return (
    <group rotation-y={VIEW_ROTATION}>
      <mesh geometry={body}>
        <SurfaceMaterial surface={surface} side={spec.glass ? THREE.DoubleSide : THREE.FrontSide} />
      </mesh>
      <group position-y={bandCenter}>
        <PrintBand geometry={band} map={texture} glossy={!spec.glass} />
      </group>
      <mesh position-y={h + 0.07}>
        <cylinderGeometry args={[rTop + 0.02, rTop + 0.02, 0.14, 64]} />
        <meshStandardMaterial color={lidColor} roughness={spec.accentColor === "#c9a46c" ? 0.75 : 0.45} />
      </mesh>
      {handle && (
        <mesh geometry={handle} rotation-y={Math.PI / 2}>
          <meshStandardMaterial color={spec.accentColor ?? surface.color} roughness={0.35} metalness={surface.metalness * 0.6} />
        </mesh>
      )}
    </group>
  );
}

const BOTTLE_CM = { diameter: 7, height: 22 };

export function BottleModel({ spec, art, label }: ModelProps) {
  const texture = useArtTexture(artAspect(spec), "front", art, label);
  const surface = surfaceOf(spec);
  const plastic = surface.metalness === 0;
  const unit = 2.5 / BOTTLE_CM.height;
  const r = (BOTTLE_CM.diameter / 2) * unit;
  const shoulder = 1.85;
  const capColor = spec.accentColor ?? "#1f1f22";

  const body = useMemo(
    () =>
      lathe(
        smoothProfile([
          [0, 0.01],
          [r * 0.86, 0],
          [r, 0.06],
          [r, shoulder * 0.55],
          [r, shoulder],
          [r * 0.82, shoulder + 0.22],
          [r * 0.46, shoulder + 0.38],
          [r * 0.42, shoulder + 0.5],
        ]),
      ),
    [r],
  );
  const bandH = Math.min(spec.heightCm * unit, shoulder - 0.2);
  const band = useMemo(
    () => bandGeometry({ radiusTop: r + 0.003, radiusBottom: r + 0.003, height: bandH, width: spec.widthCm * unit }),
    [r, bandH, spec.widthCm, unit],
  );
  const carabiner = useMemo(() => (spec.carabiner ? new THREE.TorusGeometry(0.17, 0.028, 12, 40) : null), [spec.carabiner]);
  useGeometryCleanup(body);
  useGeometryCleanup(band);
  useGeometryCleanup(carabiner);

  const capY = shoulder + 0.5;
  return (
    <group rotation-y={VIEW_ROTATION}>
      <mesh geometry={body}>
        <meshPhysicalMaterial color={surface.color} metalness={surface.metalness} roughness={plastic ? 0.32 : surface.roughness} clearcoat={0.5} />
      </mesh>
      <group position-y={0.1 + bandH / 2}>
        <PrintBand geometry={band} map={texture} />
      </group>
      <mesh position-y={capY + 0.13}>
        <cylinderGeometry args={[r * 0.5, r * 0.5, 0.26, 48]} />
        <meshStandardMaterial color={capColor} roughness={spec.accentColor === "#c9a46c" ? 0.75 : 0.45} />
      </mesh>
      {carabiner && (
        <mesh geometry={carabiner} position={[0, capY + 0.42, 0]} rotation-y={Math.PI / 2}>
          <meshStandardMaterial color="#e07b22" metalness={0.6} roughness={0.35} />
        </mesh>
      )}
    </group>
  );
}
