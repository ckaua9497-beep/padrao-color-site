"use client";

import { createContext, useContext, useEffect, useState, type RefObject } from "react";

export { useMediaQuery } from "@/components/ui/useMediaQuery";

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
