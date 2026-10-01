"use client";

// Bolsas com volume: mochila, sacola mochila, cooler/lancheira e bolsa esportiva.

import { SheetModel } from "./paper";
import type { ModelProps } from "./shared";

/** Provisório: backpack ainda usa o impresso genérico. */
export function BackpackModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: drawstring ainda usa o impresso genérico. */
export function DrawstringModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: cooler ainda usa o impresso genérico. */
export function CoolerModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: duffel ainda usa o impresso genérico. */
export function DuffelModel(props: ModelProps) {
  return <SheetModel {...props} />;
}
