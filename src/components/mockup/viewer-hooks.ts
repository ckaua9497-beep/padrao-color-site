"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type RefObject } from "react";

export { useMediaQuery } from "@/components/ui/useMediaQuery";

const noopSubscribe = () => () => undefined;

/** O navegador deixa um elemento entrar em tela cheia (o iPhone não deixa). No servidor responde false. */
export function useFullscreenSupport(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => document.fullscreenEnabled === true && typeof document.documentElement.requestFullscreen === "function",
    () => false,
  );
}

/** true enquanto o elemento é o que está em tela cheia. */
export function useIsFullscreen(ref: RefObject<Element | null>): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const update = () => setActive(document.fullscreenElement !== null && document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, [ref]);
  return active;
}

/** true enquanto o elemento tem alguma parte na tela. */
export function useInViewport(ref: RefObject<Element | null>, rootMargin = "0px"): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => setInView(entries.some((e) => e.isIntersecting)), { rootMargin });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, rootMargin]);
  return inView;
}

/** Testa se o navegador consegue criar um contexto WebGL e libera o contexto de teste em seguida. */
export function canUseWebGL(): boolean {
  if (typeof document === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Se os modelos animados (neon pulsando, bandeira ao vento) podem pedir novos frames.
 * Fica dentro do Canvas: falso quando o viewer está fora da tela ou com reduced motion.
 */
export const AnimateContext = createContext(false);

export function useAnimate(): boolean {
  return useContext(AnimateContext);
}

/**
 * Onde a peça está num ambiente: na parede, em cima de um móvel, no assento do sofá, na cama ou no
 * chão. `null` = estúdio. Os modelos usam para tirar o giro de 3/4 do estúdio (a peça fica reta na
 * parede) e escolher a pose (almofada encostada no sofá).
 */
export type RoomSurface = "wall" | "top" | "seat" | "bed" | "floor";

export type SceneMode = {
  room: RoomSurface | null;
  /** O cliente pediu o verso ("Ver verso"): a almofada vira 180°. */
  back: boolean;
  /** Animações curtas (virar a almofada) podem rodar; falso com reduced motion. */
  motion: boolean;
  /**
   * Foco na arte (a placa da fachada de perto): o estúdio escurece como no fim de tarde e o modelo acende as
   * luzes dele (os refletores da placa).
   */
  focus: boolean;
};

const STUDIO_MODE: SceneMode = { room: null, back: false, motion: true, focus: false };

/** Fica dentro do Canvas, como o AnimateContext. */
export const SceneContext = createContext<SceneMode>(STUDIO_MODE);

export function useSceneMode(): SceneMode {
  return useContext(SceneContext);
}
