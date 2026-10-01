"use client";

// Cama, mesa e banho: toalha, cortina, lençol e toalha de mesa.

import { SheetModel } from "./paper";
import type { ModelProps } from "./shared";

/** Provisório: towel ainda usa o impresso genérico. */
export function TowelModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: curtain ainda usa o impresso genérico. */
export function CurtainModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: bedding ainda usa o impresso genérico. */
export function BeddingModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: tablecloth ainda usa o impresso genérico. */
export function TableclothModel(props: ModelProps) {
  return <SheetModel {...props} />;
}
