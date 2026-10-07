"use client";

import { useEffect, useState } from "react";
import { loadImage } from "@/components/mockup/art";

/** Imagem decodificada a partir de um data URL (null enquanto carrega ou sem imagem). */
export function useLoadedImage(src: string | null | undefined): HTMLImageElement | null {
  const [loaded, setLoaded] = useState<{ src: string; image: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (!src) return;
    let alive = true;
    loadImage(src)
      .then((image) => alive && setLoaded({ src, image }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [src]);
  return src && loaded?.src === src ? loaded.image : null;
}
