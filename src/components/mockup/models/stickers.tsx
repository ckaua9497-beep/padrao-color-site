"use client";

// Adesivos, rótulos e folhas DTF.

import { useMemo } from "react";
import { artAspect } from "@/lib/mockup-kinds";
import { heartPath, roundPath } from "../art";
import { useArtTexture, Slab, Dimensions, sizeLabels, type ModelProps, fitFlat } from "./shared";

export function StickerModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h } = fitFlat(spec, 2);
  const aspect = artAspect(spec);
  const mask = spec.shape === "round" ? roundPath : spec.shape === "heart" ? heartPath : undefined;
  const front = useArtTexture(aspect, "front", art, label, mask);
  const [lw, lh] = sizeLabels(spec);
  const liner = useMemo(() => ({ ...spec, shape: "rect" as const, clearcoat: 0, finish: "matte" as const }), [spec]);
  const blank = useArtTexture(aspect, "blank", art, label);
  return (
    <group rotation={[-0.2, 0.25, 0]}>
      <group position-z={-0.02}>
        <Slab w={w * 1.14} h={h * 1.14} d={0.01} spec={liner} front={blank} radius={0.06} edgeColor="#ececec" backColor="#e9e2d0" />
      </group>
      <group position-z={0.008}>
        <Slab w={w * 1.04} h={h * 1.04} d={0.006} spec={{ ...spec, clearcoat: 0 }} front={blank} radius={Math.min(w, h) * 0.08} />
      </group>
      <group position-z={0.018} rotation={[0.04, -0.05, 0]}>
        <Slab w={w} h={h} d={0.008} spec={spec} front={front} radius={Math.min(w, h) * 0.07} />
      </group>
      {showDims && <Dimensions w={w * 1.14} h={h * 1.14} z={0.03} labelW={lw} labelH={lh} />}
    </group>
  );
}
