"use client";

import { useEffect } from "react";

/** Pergunta antes de fechar ou recarregar a aba enquanto houver mudança não salva nos editores do admin → Site. */
export function useAvisoAoSair(sujo: boolean) {
  useEffect(() => {
    if (!sujo) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [sujo]);
}
