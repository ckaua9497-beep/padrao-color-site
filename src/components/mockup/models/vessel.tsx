"use client";

// Helpers de vasilhas (perfil em torno, faixa de impressão, superfícies). Arquivo estável: caneca, copo e garrafa importam daqui.

import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import { metalColor } from "./shared";

/*
 * Copos e garrafas em escala real: 1 unidade = 9,5 cm / 1,5 (a altura da caneca padrão).
 * A arte é uma faixa (bandGeometry) com a largura física da área de impressão, centrada em θ = 0
 * (de frente para a câmera); a alça fica do lado oposto. O grupo gira para mostrar arte e alça.
 */
export const UNIT = 1.5 / 9.5;

export const VIEW_ROTATION = -0.6;

export type Pt = [number, number];

export function lathe(points: Pt[], segments = 96) {
  return new THREE.LatheGeometry(
    points.map(([x, y]) => new THREE.Vector2(x, y)),
    segments,
  );
}

/** Contorno liso a partir de pontos de controle (perfil de garrafa, xícara). */
export function smoothProfile(points: Pt[], samples = 64): Pt[] {
  const curve = new THREE.SplineCurve(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return curve.getPoints(samples).map((p) => [Math.max(0, p.x), p.y]);
}

/** Raio do perfil numa altura (interpolação linear entre os pontos). */
export function radiusOnProfile(profile: Pt[], y: number): number {
  for (let i = 1; i < profile.length; i += 1) {
    const [x0, y0] = profile[i - 1];
    const [x1, y1] = profile[i];
    if ((y0 <= y && y <= y1) || (y1 <= y && y <= y0)) return x0 + (x1 - x0) * ((y - y0) / (y1 - y0 || 1));
  }
  return profile[profile.length - 1][0];
}

export type Surface = { color: string; metalness: number; roughness: number; clearcoat: number; transparent?: boolean; opacity?: number };

export function surfaceOf(spec: MockupSpec): Surface {
  if (spec.glass) return { color: "#eef3f4", metalness: 0, roughness: 0.42, clearcoat: 0.5, transparent: true, opacity: 0.62 };
  if (spec.metal !== "none") return { color: metalColor(spec.metal), metalness: spec.glitter ? 0.55 : 0.9, roughness: spec.glitter ? 0.38 : 0.16, clearcoat: 0.5 };
  return { color: spec.baseColor, metalness: 0, roughness: 0.14, clearcoat: 1 };
}

export function SurfaceMaterial({ surface, side = THREE.FrontSide }: { surface: Surface; side?: THREE.Side }) {
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

export function PrintBand({ geometry, map, glossy = true }: { geometry: THREE.BufferGeometry; map: THREE.Texture; glossy?: boolean }) {
  return (
    <mesh geometry={geometry}>
      <meshPhysicalMaterial map={map} roughness={glossy ? 0.18 : 0.4} clearcoat={glossy ? 1 : 0.3} clearcoatRoughness={0.06} polygonOffset polygonOffsetFactor={-1} />
    </mesh>
  );
}

/** Alça em C do lado +x, entre as alturas `bottom` e `top`. */
export function handleGeometry(radius: number, bottom: number, top: number, reach: number, thickness: number) {
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
