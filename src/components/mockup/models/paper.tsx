"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { artAspect } from "@/lib/mockup-kinds";
import { heartPath, roundPath } from "../art";
import { useArtTexture, Slab, Dimensions, sizeLabels, type ModelProps, fitFlat, backVariant, Spiral, PrintMaterial } from "./shared";

/** Painel de uma folha dobrada: um plano que mostra só a faixa [u0, u1] da arte. */
function panelGeometry(w: number, h: number, u0: number, u1: number) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setX(i, u0 + uv.getX(i) * (u1 - u0));
  uv.needsUpdate = true;
  return g;
}

/**
 * Folder e cardápio: a arte é a folha aberta, dividida entre os painéis. Uma dobra fica em pé
 * como um livro entreaberto; duas dobras viram o tríptico em U, abrindo para a câmera.
 */
export function FoldedModel({ spec, art, label }: ModelProps) {
  const panels = Math.max(2, spec.folds + 1);
  const { w, h } = fitFlat(spec, 2.8);
  const panelW = w / panels;
  const aspect = artAspect(spec);
  const front = useArtTexture(aspect, "front", art, label);
  const back = useArtTexture(aspect, backVariant(spec), art, label);
  const fronts = useMemo(() => Array.from({ length: panels }, (_, i) => panelGeometry(panelW, h, i / panels, (i + 1) / panels)), [panels, panelW, h]);
  // O verso é visto espelhado: a faixa da arte do verso anda no sentido contrário.
  const backs = useMemo(() => Array.from({ length: panels }, (_, i) => panelGeometry(panelW, h, 1 - (i + 1) / panels, 1 - i / panels)), [panels, panelW, h]);
  useEffect(() => () => [...fronts, ...backs].forEach((g) => g.dispose()), [fronts, backs]);

  const angle = panels === 2 ? 0.42 : 0.62;
  const panel = (i: number) => (
    <group key={i}>
      <mesh geometry={fronts[i]} position-z={0.002}>
        <PrintMaterial map={front} spec={spec} />
      </mesh>
      <mesh geometry={backs[i]} rotation-y={Math.PI} position-z={-0.002}>
        <PrintMaterial map={back} spec={spec} />
      </mesh>
    </group>
  );

  if (panels === 2) {
    return (
      <group rotation={[-0.08, 0, 0]}>
        <group rotation-y={angle}>
          <group position-x={-panelW / 2}>{panel(0)}</group>
        </group>
        <group rotation-y={-angle}>
          <group position-x={panelW / 2}>{panel(1)}</group>
        </group>
      </group>
    );
  }
  return (
    <group rotation={[-0.08, 0, 0]}>
      <group position-x={-panelW / 2}>
        <group rotation-y={angle}>
          <group position-x={-panelW / 2}>{panel(0)}</group>
        </group>
      </group>
      {panel(1)}
      <group position-x={panelW / 2}>
        <group rotation-y={-angle}>
          <group position-x={panelW / 2}>{panel(2)}</group>
        </group>
      </group>
    </group>
  );
}

export function CardModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.2);
  const aspect = artAspect(spec);
  const front = useArtTexture(aspect, "front", art, label);
  const back = useArtTexture(aspect, backVariant(spec), art, label);
  const d = 0.025;
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[-0.18, 0.28, 0]}>
      <group position={[0.28, -0.22, -0.32]} rotation={[0, Math.PI + 0.25, 0.1]}>
        <Slab w={w} h={h} d={d} spec={spec} front={front} back={back} radius={Math.min(w, h) * 0.03} />
      </group>
      <group rotation-z={-0.06}>
        <Slab w={w} h={h} d={d} spec={spec} front={front} back={back} radius={Math.min(w, h) * 0.03} />
        {showDims && <Dimensions w={w} h={h} z={d} labelW={lw} labelH={lh} />}
      </group>
    </group>
  );
}


export function SheetModel({ spec, art, label, showDims }: ModelProps) {
  const { w, h } = fitFlat(spec);
  const aspect = artAspect(spec);
  const front = useArtTexture(aspect, "front", art, label);
  const back = useArtTexture(aspect, backVariant(spec), art, label);
  const d = 0.012;
  const [lw, lh] = sizeLabels(spec);
  return (
    <group rotation={[-0.12, 0.22, 0]}>
      {[2, 1].map((i) => (
        <group key={i} position={[i * 0.07, -i * 0.05, -i * 0.05]} rotation-z={i * 0.035}>
          <Slab w={w} h={h} d={d} spec={spec} front={front} back={back} />
        </group>
      ))}
      <Slab w={w} h={h} d={d} spec={spec} front={front} back={back} />
      {showDims && <Dimensions w={w} h={h} z={d} labelW={lw} labelH={lh} />}
    </group>
  );
}


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


export function BookModel({ spec, art, label }: ModelProps) {
  const { w, h, scale } = fitFlat(spec, 2.1);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const thick = Math.max(spec.depthCm * scale, 0.14);
  const spiral = spec.binding === "spiral";
  return (
    <group rotation={[-0.3, 0.55, 0]}>
      <group position-z={thick / 2}>
        <Slab w={w} h={h} d={0.03} spec={spec} front={front} radius={0.02} edgeColor="#2b2b2f" backColor="#2b2b2f" />
      </group>
      <group position-z={-thick / 2}>
        <Slab w={w} h={h} d={0.03} spec={spec} front={front} radius={0.02} edgeColor="#2b2b2f" backColor="#2b2b2f" />
      </group>
      <mesh>
        <boxGeometry args={[w * 0.97, h * 0.97, thick - 0.03]} />
        <meshStandardMaterial color="#fbfaf6" roughness={0.95} />
      </mesh>
      {spiral ? (
        <Spiral length={h} axis="y" offset={[-w / 2 + 0.06, 0, 0]} />
      ) : (
        <mesh position-x={-w / 2}>
          <boxGeometry args={[0.04, h, thick + 0.03]} />
          <meshStandardMaterial color="#2b2b2f" roughness={0.6} />
        </mesh>
      )}
    </group>
  );
}


export function TentModel({ spec, art, label }: ModelProps) {
  const { w, h } = fitFlat(spec, 2.2);
  const front = useArtTexture(artAspect(spec), "front", art, label);
  const back = useArtTexture(artAspect(spec), "gray", art, label);
  const tilt = 0.3;
  return (
    <group rotation-y={0.45}>
      <group position={[0, 0, Math.sin(tilt) * h * 0.5]} rotation-x={-tilt}>
        <Slab w={w} h={h} d={0.01} spec={spec} front={front} />
      </group>
      <group position={[0, 0, -Math.sin(tilt) * h * 0.5]} rotation-x={tilt}>
        <Slab w={w} h={h} d={0.01} spec={spec} front={back} />
      </group>
      <Spiral length={w} axis="x" offset={[0, h / 2 * Math.cos(tilt), 0]} count={18} />
    </group>
  );
}

