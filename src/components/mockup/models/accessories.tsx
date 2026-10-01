"use client";

// Acessórios: chinelo, caneta, ventarola, cordão de crachá, crachá e pulseira.

import { SheetModel } from "./paper";
import type { ModelProps } from "./shared";

/** Provisório: flipflop ainda usa o impresso genérico. */
export function FlipflopModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: pen ainda usa o impresso genérico. */
export function PenModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: fan ainda usa o impresso genérico. */
export function FanModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: lanyard ainda usa o impresso genérico. */
export function LanyardModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: badge ainda usa o impresso genérico. */
export function BadgeModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: wristband ainda usa o impresso genérico. */
export function WristbandModel(props: ModelProps) {
  return <SheetModel {...props} />;
}
