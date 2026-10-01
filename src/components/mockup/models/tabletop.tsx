"use client";

// Peças de mesa e chão: mouse pad, jogo americano, tapete, capacho, tábua e porta-copos.

import { artAspect } from "@/lib/mockup-kinds";
import { roundPath } from "../art";
import { Dimensions, Slab, fitFlat, sizeLabels, useArtTexture, type ModelProps } from "./shared";

type FlatLook = { thickness: number; radius: number; edge: string; back: string; tilt: number; finish: "matte" | "satin" };

/** Peças que ficam deitadas: mouse pad/jogo americano, tapete, porta-copos e tábua. */
function flatLook(spec: ModelProps["spec"]): FlatLook {
  switch (spec.kind) {
    case "rug":
      return { thickness: 0.08, radius: 0.06, edge: spec.baseColor, back: "#1a1a1a", tilt: -1.15, finish: "matte" };
    case "coaster":
      return { thickness: 0.07, radius: 0.12, edge: "#c49a6c", back: "#b98f62", tilt: -1.0, finish: "satin" };
    case "board":
      return { thickness: 0.13, radius: 0.08, edge: "#b98b5a", back: "#a87c4f", tilt: -0.95, finish: "matte" };
    default:
      return { thickness: 0.05, radius: 0.1, edge: "#1f1f1f", back: "#141414", tilt: -1.05, finish: "matte" };
  }
}

export function MatModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.4);
  const look = flatLook(spec);
  const mask = spec.shape === "round" ? roundPath : undefined;
  const front = useArtTexture(artAspect(spec), "front", art, label, mask);
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[look.tilt, 0, 0.35]}>
      <Slab w={w} h={h} d={look.thickness} spec={{ ...spec, finish: look.finish }} front={front} radius={look.radius} edgeColor={look.edge} backColor={look.back} />
      {showDims && <Dimensions w={w} h={h} z={look.thickness / 2 + 0.01} labelW={lw} labelH={lh} />}
    </group>
  );
}

/** Porta-copos: os pequenos vêm em jogo (pilha de 4); porta-jarra e sousplat aparecem sozinhos. */
export function CoasterModel({ spec, art, label, showDims }: ModelProps) {
  const set = Math.max(spec.widthCm, spec.heightCm) <= 12;
  const { w, h } = fitFlat(spec, set ? 1.7 : 2.4);
  const look = flatLook(spec);
  const mask = spec.shape === "round" ? roundPath : undefined;
  const front = useArtTexture(artAspect(spec), "front", art, label, mask);
  const [lw, lh] = sizeLabels(spec);
  const slab = (
    <Slab w={w} h={h} d={look.thickness} spec={{ ...spec, finish: look.finish }} front={front} radius={look.radius} edgeColor={look.edge} backColor={look.back} />
  );
  return (
    <group rotation={[look.tilt, 0, 0.35]}>
      {set &&
        [3, 2, 1].map((i) => (
          <group key={i} position={[w * 0.55, h * 0.1, -look.thickness * 1.15 * i]} rotation-z={i * 0.18}>
            {slab}
          </group>
        ))}
      {slab}
      {showDims && <Dimensions w={w} h={h} z={look.thickness / 2 + 0.01} labelW={lw} labelH={lh} />}
    </group>
  );
}
