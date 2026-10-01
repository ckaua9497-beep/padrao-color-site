"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type RefObject } from "react";

/** Media query reativa, sem setState dentro de efeito. No servidor responde false. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
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
