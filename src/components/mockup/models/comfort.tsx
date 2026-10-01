"use client";

// Conforto: máscara de dormir, almofada de pescoço (e kit soneca) e almofada para notebook.

import { SheetModel } from "./paper";
import type { ModelProps } from "./shared";

/** Provisório: sleepmask ainda usa o impresso genérico. */
export function SleepMaskModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: neckpillow ainda usa o impresso genérico. */
export function NeckPillowModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: lapdesk ainda usa o impresso genérico. */
export function LapDeskModel(props: ModelProps) {
  return <SheetModel {...props} />;
}
