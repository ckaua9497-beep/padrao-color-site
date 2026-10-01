"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { artAspect } from "@/lib/mockup-kinds";
import { bandGeometry, useArtTexture, useGeometryCleanup, type ModelProps } from "./shared";
import { UNIT, VIEW_ROTATION, lathe, smoothProfile, radiusOnProfile, surfaceOf, SurfaceMaterial, PrintBand, handleGeometry, type Pt } from "./vessel";

const MUG_CM = { diameter: 8.2, height: 9.5 };

const TEACUP_CM = { top: 7.6, bottom: 4.6, height: 6.2 };

export function MugModel({ spec, art, label }: ModelProps) {
  const texture = useArtTexture(artAspect(spec), "front", art, label);
  const surface = surfaceOf(spec);
  const handleColor = spec.accentColor && !spec.glitter ? spec.accentColor : surface.color;
  const teacup = spec.teacup;

  const shape = useMemo(() => {
    if (teacup) {
      const top = (TEACUP_CM.top / 2) * UNIT;
      const bottom = (TEACUP_CM.bottom / 2) * UNIT;
      const h = TEACUP_CM.height * UNIT;
      const wall = 0.035;
      const wallOuter = smoothProfile([
        [0, 0.012],
        [bottom * 0.92, 0],
        [bottom, 0.03],
        [bottom * 1.25, h * 0.32],
        [top * 0.96, h * 0.8],
        [top, h],
      ]);
      // O último ponto fecha o aro até a parede interna.
      const outer: Pt[] = [...wallOuter, [top - wall, h]];
      const inner = smoothProfile([
        [top - wall, h],
        [top * 0.93 - wall, h * 0.8],
        [bottom * 1.2 - wall, h * 0.32],
        [bottom * 0.7, 0.07],
        [0, 0.065],
      ]);
      const bandH = Math.min(spec.heightCm * UNIT, h * 0.7);
      const bandCenter = h * 0.56;
      // A faixa acompanha a curva da xícara em cada altura.
      const bandRadius = (y: number) => radiusOnProfile(wallOuter, bandCenter + y) + 0.004;
      return { outer, inner, radius: top, height: h, bandH, bandCenter, bandRadius };
    }
    const r = (MUG_CM.diameter / 2) * UNIT;
    const h = MUG_CM.height * UNIT;
    const wall = 0.045;
    const outer: Pt[] = [
      [0, 0.008],
      [r * 0.8, 0],
      [r - 0.025, 0.004],
      [r - 0.004, 0.03],
      [r, 0.06],
      [r, h - 0.03],
      [r - 0.004, h - 0.008],
      [r - 0.014, h],
      [r - wall + 0.006, h],
    ];
    const inner: Pt[] = [
      [r - wall + 0.006, h],
      [r - wall, h - 0.02],
      [r - wall, 0.13],
      [r - wall - 0.05, 0.09],
      [0, 0.085],
    ];
    const bandH = Math.min(spec.heightCm * UNIT, h - 0.1);
    const bandRadius = () => r + 0.004;
    return { outer, inner, radius: r, height: h, bandH, bandCenter: h / 2, bandRadius };
  }, [teacup, spec.heightCm]);

  const outer = useMemo(() => lathe(shape.outer), [shape]);
  const inner = useMemo(() => lathe(shape.inner), [shape]);
  const band = useMemo(
    () =>
      bandGeometry({
        radiusTop: shape.radius,
        radiusBottom: shape.radius,
        radiusAt: shape.bandRadius,
        height: shape.bandH,
        width: spec.widthCm * UNIT,
      }),
    [shape, spec.widthCm],
  );
  const handle = useMemo(
    () =>
      teacup
        ? handleGeometry(shape.radius * 0.92, shape.height * 0.42, shape.height * 0.86, 0.26, 0.04)
        : handleGeometry(shape.radius, shape.height * 0.24, shape.height * 0.8, 0.42, 0.065),
    [teacup, shape],
  );
  const saucer = useMemo(
    () =>
      teacup
        ? lathe(
            smoothProfile([
              [0, 0.0],
              [0.62, 0.0],
              [0.7, 0.03],
              [0.86, 0.075],
              [0.9, 0.09],
              [0.86, 0.1],
              [0.62, 0.055],
              [0.3, 0.045],
              [0, 0.045],
            ]),
          )
        : null,
    [teacup],
  );
  useGeometryCleanup(outer);
  useGeometryCleanup(inner);
  useGeometryCleanup(band);
  useGeometryCleanup(handle);
  useGeometryCleanup(saucer);

  const lift = teacup ? 0.05 : 0;
  return (
    <group rotation-y={VIEW_ROTATION}>
      {saucer && (
        <mesh geometry={saucer}>
          <SurfaceMaterial surface={surface} side={THREE.DoubleSide} />
        </mesh>
      )}
      <group position-y={lift}>
        <mesh geometry={outer}>
          <SurfaceMaterial surface={surface} />
        </mesh>
        <mesh geometry={inner}>
          <meshPhysicalMaterial color={spec.glass ? "#eef3f4" : spec.innerColor} roughness={0.14} clearcoat={0.8} transparent={spec.glass} opacity={spec.glass ? 0.5 : 1} />
        </mesh>
        <group position-y={shape.bandCenter}>
          <PrintBand geometry={band} map={texture} glossy={!spec.glass} />
        </group>
        {/* Alça do lado oposto à arte (θ = π). */}
        <mesh geometry={handle} rotation-y={Math.PI / 2}>
          <meshPhysicalMaterial color={handleColor} metalness={surface.metalness} roughness={surface.roughness} clearcoat={surface.clearcoat} transparent={surface.transparent ?? false} opacity={surface.opacity ?? 1} />
        </mesh>
        {spec.glitter && spec.accentColor && (
          <mesh position-y={0.11}>
            <cylinderGeometry args={[shape.radius + 0.003, shape.radius + 0.003, 0.2, 96]} />
            <meshPhysicalMaterial color={spec.accentColor} metalness={0.6} roughness={0.35} clearcoat={0.6} />
          </mesh>
        )}
      </group>
    </group>
  );
}
