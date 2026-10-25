"use client";

// Helpers de vasilhas (perfil em torno, faixa de impressão, superfícies). Arquivo estável: caneca, copo e garrafa importam daqui.

import { useEffect, useMemo } from "react";
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

/**
 * Panorama de estúdio (equirretangular) para refletir em metal polido: fundo claro, softboxes verticais e faixas
 * escuras entre elas, chão cinza. O ambiente do visualizador é preto com poucas placas de luz, e um espelho nele sai
 * quase preto (a caneca cromada parecia preta e a arte sumia); as fotos de produto mostram o metal claro, com faixas.
 */
function studioReflection() {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    // Fundo infinito branco (o chão também é claro: a parede vista de cima reflete o chão).
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#ffffff");
    sky.addColorStop(0.45, "#f1f2f3");
    sky.addColorStop(0.5, "#dfe1e4");
    sky.addColorStop(0.62, "#e9eaec");
    sky.addColorStop(1, "#b9bcc0");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    // Faixas verticais (longitude): bandeiras escuras entre as softboxes, que dão o contraste do cromado de catálogo.
    const bar = (u: number, width: number, color: string, top: number, bottom: number) => {
      const x = u * w;
      const half = (width * w) / 2;
      const g = ctx.createLinearGradient(x - half, 0, x + half, 0);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.3, color);
      g.addColorStop(0.7, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - half, top * h, half * 2, (bottom - top) * h);
    };
    // u = 0,75 é o que a frente da peça reflete (atrás da câmera): fica clara. As bandeiras escuras caem a ~35° de
    // cada lado da frente, e atrás da peça (u = 0,25, o que os contornos refletem) o estúdio é cinza médio.
    bar(0.25, 0.3, "rgba(128,132,138,0.55)", 0.05, 0.95);
    [0.56, 0.94].forEach((u) => bar(u, 0.09, "rgba(40,43,48,0.85)", 0.1, 0.9));
    [0.48, 0.02].forEach((u) => bar(u, 0.035, "rgba(70,74,80,0.45)", 0.2, 0.8));
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Reflexo de estúdio (studioReflection) para o envMap de cromado, inox e glitter. */
export function useStudioReflection() {
  const texture = useMemo(() => studioReflection(), []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
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
