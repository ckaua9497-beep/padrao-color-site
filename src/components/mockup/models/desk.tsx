"use client";

// Objetos de mesa: quebra-cabeça, régua, suporte de celular e wobbler.

import { SheetModel } from "./paper";
import type { ModelProps } from "./shared";

/** Provisório: puzzle ainda usa o impresso genérico. */
export function PuzzleModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: ruler ainda usa o impresso genérico. */
export function RulerModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: phonestand ainda usa o impresso genérico. */
export function PhoneStandModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: wobbler ainda usa o impresso genérico. */
export function WobblerModel(props: ModelProps) {
  return <SheetModel {...props} />;
}
