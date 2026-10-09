"use client";

import { useEffect } from "react";

/*
 * Link de divulgação: quem chega por <loja>/?ref=instagram-bio fica marcado por 30 dias neste navegador, e o
 * pedido leva essa origem (painel → Divulgação). Também conta uma visita por sessão para as métricas da loja.
 */

const KEY = "ml_ref";
const DAYS = 30;

function safeStorage<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Origem guardada (ainda válida) ou null. */
export function readRef(): string | null {
  return safeStorage(() => {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { ref, until } = JSON.parse(raw) as { ref?: string; until?: number };
    return ref && until && until > Date.now() ? ref : null;
  }, null);
}

export default function RefTracker() {
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref")?.trim().toLowerCase() ?? "";
    const valid = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])$/.test(ref);
    if (valid) safeStorage(() => localStorage.setItem(KEY, JSON.stringify({ ref, until: Date.now() + DAYS * 86_400_000 })), undefined);

    const counted = safeStorage(() => sessionStorage.getItem("ml_visita") === "1", false);
    if (counted && !valid) return;
    safeStorage(() => sessionStorage.setItem("ml_visita", "1"), undefined);
    void fetch("/api/multiloja/visita", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: valid ? ref : (readRef() ?? "") }),
      keepalive: true,
    }).catch(() => undefined);
  }, []);
  return null;
}
