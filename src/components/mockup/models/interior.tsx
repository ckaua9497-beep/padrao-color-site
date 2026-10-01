"use client";

// Interiores: papel de parede, ímã de geladeira e capa de cilindro.

import { SheetModel } from "./paper";
import type { ModelProps } from "./shared";

/** Provisório: wallpaper ainda usa o impresso genérico. */
export function WallpaperModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: magnet ainda usa o impresso genérico. */
export function MagnetModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: cylinder ainda usa o impresso genérico. */
export function CylinderModel(props: ModelProps) {
  return <SheetModel {...props} />;
}
