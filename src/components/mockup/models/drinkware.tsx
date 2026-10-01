"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import { artAspect } from "@/lib/mockup-kinds";
import { bandGeometry, metalColor, useArtTexture, useGeometryCleanup, type ModelProps } from "./shared";

/*
 * Copos e garrafas em escala real: 1 unidade = 9,5 cm / 1,5 (a altura da caneca padrão).
 * A arte é uma faixa (bandGeometry) com a largura física da área de impressão, centrada em θ = 0
 * (de frente para a câmera); a alça fica do lado oposto. O grupo gira para mostrar arte e alça.
 */
const UNIT = 1.5 / 9.5;
const VIEW_ROTATION = -0.6;

type Pt = [number, number];

function lathe(points: Pt[], segments = 96) {
  return new THREE.LatheGeometry(
    points.map(([x, y]) => new THREE.Vector2(x, y)),
    segments,
  );
}

/** Contorno liso a partir de pontos de controle (perfil de garrafa, xícara). */
function smoothProfile(points: Pt[], samples = 64): Pt[] {
  const curve = new THREE.SplineCurve(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return curve.getPoints(samples).map((p) => [Math.max(0, p.x), p.y]);
}

/** Raio do perfil numa altura (interpolação linear entre os pontos). */
function radiusOnProfile(profile: Pt[], y: number): number {
  for (let i = 1; i < profile.length; i += 1) {
    const [x0, y0] = profile[i - 1];
    const [x1, y1] = profile[i];
    if ((y0 <= y && y <= y1) || (y1 <= y && y <= y0)) return x0 + (x1 - x0) * ((y - y0) / (y1 - y0 || 1));
  }
  return profile[profile.length - 1][0];
}

type Surface = { color: string; metalness: number; roughness: number; clearcoat: number; transparent?: boolean; opacity?: number };

function surfaceOf(spec: MockupSpec): Surface {
  if (spec.glass) return { color: "#eef3f4", metalness: 0, roughness: 0.42, clearcoat: 0.5, transparent: true, opacity: 0.62 };
  if (spec.metal !== "none") return { color: metalColor(spec.metal), metalness: spec.glitter ? 0.55 : 0.9, roughness: spec.glitter ? 0.38 : 0.16, clearcoat: 0.5 };
  return { color: spec.baseColor, metalness: 0, roughness: 0.14, clearcoat: 1 };
}

function SurfaceMaterial({ surface, side = THREE.FrontSide }: { surface: Surface; side?: THREE.Side }) {
  return (
    <meshPhysicalMaterial
      color={surface.color}
      metalness={surface.metalness}
      roughness={surface.roughness}
      clearcoat={surface.clearcoat}
      clearcoatRoughness={0.06}
      transparent={surface.transparent ?? false}
      opacity={surface.opacity ?? 1}
      side={side}
    />
  );
}

function PrintBand({ geometry, map, glossy = true }: { geometry: THREE.BufferGeometry; map: THREE.Texture; glossy?: boolean }) {
  return (
    <mesh geometry={geometry}>
      <meshPhysicalMaterial map={map} roughness={glossy ? 0.18 : 0.4} clearcoat={glossy ? 1 : 0.3} clearcoatRoughness={0.06} polygonOffset polygonOffsetFactor={-1} />
    </mesh>
  );
}

/** Alça em C do lado +x, entre as alturas `bottom` e `top`. */
function handleGeometry(radius: number, bottom: number, top: number, reach: number, thickness: number) {
  const mid = (top + bottom) / 2;
  const span = top - bottom;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(radius - 0.02, top, 0),
    new THREE.Vector3(radius + reach * 0.45, top + span * 0.08, 0),
    new THREE.Vector3(radius + reach * 0.92, top - span * 0.12, 0),
    new THREE.Vector3(radius + reach, mid, 0),
    new THREE.Vector3(radius + reach * 0.86, bottom + span * 0.14, 0),
    new THREE.Vector3(radius + reach * 0.35, bottom - span * 0.06, 0),
    new THREE.Vector3(radius - 0.02, bottom, 0),
  ]);
  return new THREE.TubeGeometry(curve, 72, thickness, 18, false);
}

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
