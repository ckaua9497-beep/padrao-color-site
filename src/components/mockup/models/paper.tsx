"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { artAspect } from "@/lib/mockup-kinds";
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
