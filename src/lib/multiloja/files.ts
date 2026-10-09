import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/*
 * Imagens enviadas pelo lojista (logo e banners). Em desenvolvimento ficam em MULTILOJA_ARQUIVOS (padrão:
 * .data/arquivos/<loja>/), servidas por /api/multiloja/arquivo/<loja>/<nome>. Em produção, trocar o destino
 * por um storage (CDN) mantendo esta interface.
 *
 * O tipo vem dos primeiros bytes do arquivo, não da extensão nem do Content-Type que o navegador mandou.
 */

export const IMAGE_TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;
export type ImageExt = keyof typeof IMAGE_TYPES;

const NAME_RE = /^[a-z0-9-]{8,64}\.(png|jpg|webp)$/;

function root(): string {
  // turbopackIgnore: caminho só conhecido em execução; sem ele o build rastreia o projeto inteiro.
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.MULTILOJA_ARQUIVOS?.trim() || ".data/arquivos");
}

/** Tipo real da imagem pelos bytes iniciais; null = não é PNG, JPEG nem WebP. */
export function sniffImage(bytes: Uint8Array): ImageExt | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") return "webp";
  return null;
}

export type SaveResult = { ok: true; url: string } | { ok: false; error: string };

export async function saveImage(lojaId: number, prefix: "logo" | "banner", file: File, maxBytes: number): Promise<SaveResult> {
  if (file.size === 0) return { ok: false, error: "Arquivo vazio." };
  if (file.size > maxBytes) return { ok: false, error: `A imagem passa de ${Math.round(maxBytes / 1024 / 1024)} MB.` };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = sniffImage(bytes);
  if (!ext) return { ok: false, error: "Envie uma imagem PNG, JPG ou WebP." };
  const name = `${prefix}-${randomBytes(8).toString("hex")}.${ext}`;
  const dir = path.join(root(), String(lojaId));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);
  return { ok: true, url: `/api/multiloja/arquivo/${lojaId}/${name}` };
}

/** Apaga um arquivo da própria loja (ignora URLs de fora ou de outra loja). */
export async function deleteImage(lojaId: number, url: string | null) {
  const match = url ? new RegExp(`^/api/multiloja/arquivo/${lojaId}/([^/]+)$`).exec(url) : null;
  if (!match || !NAME_RE.test(match[1])) return;
  await unlink(path.join(root(), String(lojaId), match[1])).catch(() => undefined);
}

export async function readImage(lojaId: string, name: string): Promise<{ bytes: Buffer; type: string } | null> {
  if (!/^\d{1,10}$/.test(lojaId) || !NAME_RE.test(name)) return null;
  try {
    const bytes = await readFile(path.join(root(), lojaId, name));
    const ext = name.split(".").pop() as ImageExt;
    return { bytes, type: IMAGE_TYPES[ext] };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------- artes dos pedidos

const ART_RE = /^\d{1,3}-[a-f0-9]{12}\.[a-z0-9]{2,4}$/;

/** Guarda a arte de um item do pedido (fora da pasta pública). Devolve o nome interno do arquivo. */
export async function saveOrderArt(pedidoId: number, posicao: number, file: File): Promise<string> {
  const ext = (file.name.toLowerCase().split(".").pop() ?? "bin").replace(/[^a-z0-9]/g, "").slice(0, 4) || "bin";
  const name = `${posicao}-${randomBytes(6).toString("hex")}.${ext}`;
  const dir = path.join(root(), "pedidos", String(pedidoId));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), new Uint8Array(await file.arrayBuffer()));
  return name;
}

export async function readOrderArt(pedidoId: number, name: string): Promise<Buffer | null> {
  if (!ART_RE.test(name)) return null;
  try {
    return await readFile(path.join(root(), "pedidos", String(pedidoId), name));
  } catch {
    return null;
  }
}
