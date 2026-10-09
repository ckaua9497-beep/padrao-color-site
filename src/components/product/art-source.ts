"use client";

import type { CartArtFile } from "@/components/cart/CartProvider";
import { sourceOf } from "@/components/mockup/art";
import { saveArtFile } from "./gabarito/print-store";

/**
 * O arquivo que o cliente enviou para uma imagem da arte: o original (antes do corte de margem e da remoção de fundo)
 * ou, no PDF, o próprio PDF. É ele que vai para a produção.
 */
export function uploadedFileOf(src: string | null | undefined): File | null {
  const info = sourceOf(src);
  if (!info) return null;
  if (info.original) return info.original;
  return info.file instanceof File ? info.file : null;
}

/**
 * Guarda os arquivos da arte no navegador (IndexedDB) ao adicionar ao carrinho; o checkout manda para o Bunny. O mesmo
 * arquivo (o logo de um kit) é guardado uma vez só. Sem IndexedDB, o item segue sem eles (arte depois do pedido).
 */
export async function keepArtFiles(files: { file: File | null | undefined; kind: CartArtFile["kind"] }[], product: string, cache?: Map<File, string>): Promise<CartArtFile[]> {
  const out: CartArtFile[] = [];
  for (const { file, kind } of files) {
    if (!file) continue;
    const id = cache?.get(file) ?? (await saveArtFile(file, file.name, product));
    if (!id) continue;
    cache?.set(file, id);
    if (!out.some((entry) => entry.id === id)) out.push({ id, name: file.name, kind });
  }
  return out;
}
