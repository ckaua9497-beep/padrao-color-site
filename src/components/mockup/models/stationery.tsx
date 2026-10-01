"use client";

// Papelaria: pacote de papel, calendário de parede, porta-passaporte, tag e marcador de livro.

import { SheetModel } from "./paper";
import type { ModelProps } from "./shared";

/** Provisório: paperpack ainda usa o impresso genérico. */
export function PaperpackModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: wallcalendar ainda usa o impresso genérico. */
export function WallCalendarModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: passport ainda usa o impresso genérico. */
export function PassportModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: hangtag ainda usa o impresso genérico. */
export function HangtagModel(props: ModelProps) {
  return <SheetModel {...props} />;
}

/** Provisório: bookmark ainda usa o impresso genérico. */
export function BookmarkModel(props: ModelProps) {
  return <SheetModel {...props} />;
}
