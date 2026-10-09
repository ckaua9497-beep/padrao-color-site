"use client";

import { releaseSource } from "@/components/mockup/art";
import { IntakeError, intakeImage } from "@/components/mockup/image-intake";
import type { KitLogo } from "./kit-art";

/** Mesmo teto da página de produto. */
export const MAX_UPLOAD_MB = 25;

/** O envio não deu certo; a mensagem é para o cliente. */
export class UploadError extends Error {}

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export function tooBig(file: File): boolean {
  return file.size > MAX_UPLOAD_MB * 1024 * 1024;
}

/**
 * Lê a arte enviada: PDF (a primeira página vira a prévia) ou imagem pelo tratador automático (orientação, SVG,
 * margem vazia, fundo branco nas peças em que o fundo não é impresso). `raw`: o arquivo como veio.
 */
export async function readArtwork(file: File, { removeWhite = false, raw = false }: { removeWhite?: boolean; raw?: boolean } = {}): Promise<{ src: string; trimmed: boolean; backgroundRemoved: boolean }> {
  if (isPdf(file)) {
    const { readPdfArtwork } = await import("@/components/product/gabarito/pdf-artwork");
    return { src: (await readPdfArtwork(file)).src, trimmed: false, backgroundRemoved: false };
  }
  const result = await intakeImage(file, { removeWhite, treat: !raw });
  return { src: result.src, trimmed: result.trimmed, backgroundRemoved: result.backgroundRemoved };
}

/**
 * Logo do kit: a prévia tratada e, para camisetas e sacolas plásticas, a versão sem o fundo branco (as duas em
 * paralelo). Formatos sem prévia (AI, CDR…) seguem anexados ao pedido pelo nome.
 */
export async function readKitLogo(file: File): Promise<KitLogo> {
  if (tooBig(file)) throw new UploadError(`O arquivo tem mais de ${MAX_UPLOAD_MB} MB. Envie uma versão menor.`);
  const pdf = isPdf(file);
  try {
    const [main, clear] = await Promise.all([readArtwork(file), pdf ? null : readArtwork(file, { removeWhite: true }).catch(() => null)]);
    const removed = Boolean(clear?.backgroundRemoved);
    if (clear && !removed) releaseSource(clear.src);
    const notes = [main.trimmed ? "margens vazias cortadas" : "", removed ? "fundo branco tirado nas camisetas" : ""].filter(Boolean);
    return { name: file.name, file, src: main.src, clear: removed && clear ? clear.src : main.src, note: notes.length ? `Ajustado: ${notes.join(" · ")}.` : null };
  } catch (error) {
    if (error instanceof IntakeError && error.attach) return { name: file.name, file, src: null, clear: null, note: error.message };
    if (pdf) return { name: file.name, file, src: null, clear: null, note: "Não deu para abrir a prévia desse PDF: ele vai anexado ao pedido." };
    throw new UploadError(error instanceof IntakeError ? error.message : "Não conseguimos ler essa imagem. Tente PNG, JPG, WEBP, SVG ou PDF.");
  }
}
