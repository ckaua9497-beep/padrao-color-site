"use server";

import { refresh } from "next/cache";
import { requirePainel } from "@/lib/multiloja/auth";
import { deleteImage, saveImage } from "@/lib/multiloja/files";
import { discardTemaRascunho, lojaInfo, publishTema, saveTemaRascunho } from "@/lib/multiloja/repo";
import { imagensDoTema, parseTema, type Tema } from "@/lib/multiloja/tema";

/*
 * Ações do editor "Personalizar loja". O tema vem do navegador e é sempre revalidado (parseTema): imagens só da
 * própria loja, links só internos, textos com limite. O rascunho salva sozinho enquanto o lojista edita; a loja
 * só muda ao publicar.
 */

export type TemaResult = { ok: true; tema: Tema; message?: string } | { ok: false; message: string };

export async function salvarRascunho(raw: unknown): Promise<TemaResult> {
  const { loja } = await requirePainel();
  const tema = parseTema(raw, lojaInfo(loja));
  await saveTemaRascunho(loja.id, tema);
  return { ok: true, tema };
}

/** Publica o que está no editor. Apaga do banco as imagens que nenhum tema usa mais. */
export async function publicarTema(raw: unknown): Promise<TemaResult> {
  const { loja } = await requirePainel();
  const tema = parseTema(raw, lojaInfo(loja));
  await publishTema(loja.id, tema);
  const keep = new Set([...imagensDoTema(tema), ...loja.banners.map((b) => b.src)]);
  const old = new Set([...imagensDoTema(loja.tema), ...(loja.temaRascunho ? imagensDoTema(loja.temaRascunho) : [])]);
  for (const url of old) if (!keep.has(url)) await deleteImage(loja.id, url);
  refresh();
  return { ok: true, tema, message: "Loja publicada: as mudanças já estão no ar." };
}

/** Volta o editor para o tema publicado (o rascunho é apagado). */
export async function descartarRascunho(): Promise<TemaResult> {
  const { loja } = await requirePainel();
  await discardTemaRascunho(loja.id);
  if (loja.temaRascunho) {
    const keep = new Set([...imagensDoTema(loja.tema), ...loja.banners.map((b) => b.src)]);
    for (const url of imagensDoTema(loja.temaRascunho)) if (!keep.has(url)) await deleteImage(loja.id, url);
  }
  return { ok: true, tema: loja.tema, message: "Alterações descartadas: o editor voltou para a loja publicada." };
}

/** Imagem para o tema (logo, banner, destaque, texto). Fica guardada no banco; o editor recebe o endereço. */
export async function enviarImagemTema(form: FormData): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const { loja } = await requirePainel();
  const file = form.get("imagem");
  if (!(file instanceof File)) return { ok: false, message: "Escolha uma imagem." };
  const saved = await saveImage(loja.id, "tema", file, 5 * 1024 * 1024);
  return saved.ok ? { ok: true, url: saved.url } : { ok: false, message: saved.error };
}
