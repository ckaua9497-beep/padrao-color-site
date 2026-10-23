"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useSceneMode } from "../../viewer-hooks";

/** Duração do giro para as costas ("Ver verso" ou o passo "Verso" da arte). */
const TURN_SECONDS = 0.7;

/**
 * Grupo que gira 180° no eixo vertical quando o viewer pede o verso (useSceneMode().back): um giro curto
 * com easing; sem animação com reduced motion. `base` é a leve rotação de 3/4 da vitrine.
 */
export function TurnGroup({ base, scale, children }: { base: number; scale: number; children: ReactNode }) {
  const { back, motion } = useSceneMode();
  const ref = useRef<THREE.Group>(null);
  const invalidate = useThree((state) => state.invalidate);
  const anim = useRef({ angle: base, from: base, to: base, t: 1, mounted: false });

  useLayoutEffect(() => {
    const group = ref.current;
    if (!group) return;
    // Peça deitada na mesa (userData.flatLay): quem mostra o verso são as folhas, que desviram; a cena não gira.
    const flat = group.children.some((child) => child.userData.flatLay);
    const target = base + (back && !flat ? Math.PI : 0);
    const state = anim.current;
    if (!state.mounted || !motion) {
      state.mounted = true;
      state.angle = state.to = target;
      state.t = 1;
      group.rotation.y = target;
      invalidate();
      return;
    }
    if (Math.abs(state.to - target) < 1e-6) return;
    state.from = state.angle;
    state.to = target;
    state.t = 0;
    invalidate();
  }, [base, back, motion, invalidate]);

  useFrame((_, delta) => {
    const group = ref.current;
    const state = anim.current;
    if (!group || state.t >= 1) return;
    state.t = Math.min(1, state.t + Math.min(delta, 0.05) / TURN_SECONDS);
    const k = state.t < 0.5 ? 2 * state.t * state.t : 1 - (-2 * state.t + 2) ** 2 / 2;
    state.angle = state.from + (state.to - state.from) * k;
    group.rotation.y = state.angle;
    invalidate();
  });

  return (
    <group ref={ref} scale={scale}>
      {children}
    </group>
  );
}
