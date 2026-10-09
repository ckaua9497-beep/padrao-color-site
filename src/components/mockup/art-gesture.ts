"use client";

import { useSyncExternalStore } from "react";

/*
 * Gesto em andamento no editor 2D (arrastar, redimensionar, girar, pinça): enquanto ele dura, o 3D pinta a
 * textura da arte em 1024 px (repintar e reenviar 2048 px à GPU a cada quadro trava o arraste) e volta à
 * resolução cheia ao soltar.
 */

let active = false;
const listeners = new Set<() => void>();

export function setArtGesture(value: boolean) {
  if (active === value) return;
  active = value;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useArtGesture(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => active,
    () => false,
  );
}
