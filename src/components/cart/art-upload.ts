"use client";

import { loadPrintFile } from "@/components/product/gabarito/print-store";
import { itemArtFiles, type CartItem } from "./CartProvider";

/*
 * Checkout: os arquivos da arte que estão no navegador (o PDF no gabarito e os que o cliente enviou) sobem para o
 * Bunny por /api/arte antes do pedido. Cada arquivo sobe uma vez só (o logo de um kit vale para todos os itens) e a URL
 * fica guardada no carrinho: se o pedido falhar, a nova tentativa não envia de novo.
 */

export type UploadProgress = { done: number; total: number; name: string };

export type UploadOutcome =
  /** `missing`: arquivos que sumiram do navegador (dados do site apagados); o item segue sem eles. */
  | { ok: true; uploaded: Record<string, { url: string; nome: string }>; missing: string[]; disabled: boolean }
  | { ok: false; error: string; uploaded: Record<string, { url: string; nome: string }> };

/** Arquivos dos itens que ainda não subiram (sem repetir o mesmo arquivo de vários itens). */
export function pendingArtFiles(items: Pick<CartItem, "printFile" | "artFiles" | "uploaded">[]): { id: string; name: string }[] {
  const seen = new Map<string, { id: string; name: string }>();
  for (const item of items) {
    for (const file of itemArtFiles(item)) if (!item.uploaded?.[file.id] && !seen.has(file.id)) seen.set(file.id, { id: file.id, name: file.name });
  }
  return [...seen.values()];
}

export async function uploadCartArt(items: Pick<CartItem, "printFile" | "artFiles" | "uploaded">[], onProgress?: (progress: UploadProgress) => void): Promise<UploadOutcome> {
  const pending = pendingArtFiles(items);
  const uploaded: Record<string, { url: string; nome: string }> = {};
  const missing: string[] = [];
  for (const [index, file] of pending.entries()) {
    onProgress?.({ done: index, total: pending.length, name: file.name });
    const stored = await loadPrintFile(file.id);
    if (!stored) {
      missing.push(file.name);
      continue;
    }
    const form = new FormData();
    form.append("arquivo", new File([stored.blob], file.name, { type: stored.blob.type || "application/octet-stream" }));
    let response: Response;
    try {
      response = await fetch("/api/arte", { method: "POST", body: form, credentials: "same-origin" });
    } catch {
      return { ok: false, error: `Não deu para enviar “${file.name}”: confira a internet e tente de novo.`, uploaded };
    }
    const data = (await response.json().catch(() => ({}))) as { url?: string; nome?: string; error?: string; disabled?: boolean };
    // Envio de arquivos desligado no servidor: o pedido segue sem eles (a arte vai depois, como antes).
    if (response.status === 503 && data.disabled) return { ok: true, uploaded, missing, disabled: true };
    if (!response.ok || !data.url || !data.nome) return { ok: false, error: data.error ?? `Não deu para enviar “${file.name}”. Tente de novo.`, uploaded };
    uploaded[file.id] = { url: data.url, nome: data.nome };
  }
  onProgress?.({ done: pending.length, total: pending.length, name: "" });
  return { ok: true, uploaded, missing, disabled: false };
}
