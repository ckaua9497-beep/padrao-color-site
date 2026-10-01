"use client";

// Vestuário: meia, short e maiô.

import { SheetModel } from "./paper";
import type { ModelProps } from "./shared";

/** Provisório: sock ainda usa o impresso genérico. */
export function SockModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: shorts ainda usa o impresso genérico. */
export function ShortsModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: swimsuit ainda usa o impresso genérico. */
export function SwimsuitModel(props: ModelProps) {
  return <SheetModel {...props} />;
}
