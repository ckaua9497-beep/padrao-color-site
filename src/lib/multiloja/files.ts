import "server-only";

import { randomBytes } from "node:crypto";
import { getDb } from "./db";

/*
 * Arquivos enviados, guardados no próprio banco (tabela `arquivos`, conteúdo em bytea): imagens da loja (logo e
 * banners, dono "loja/<id>") servidas por /api/multiloja/arquivo/<loja>/<nome>, e artes dos pedidos (dono
 * "pedido/<id>"), que só a loja, o cliente com o link e o admin baixam.
 *
 * O tipo das imagens vem dos primeiros bytes do arquivo, não da extensão nem do Content-Type que o navegador mandou.
 */

export const IMAGE_TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;
export type ImageExt = keyof typeof IMAGE_TYPES;

const NAME_RE = /^[a-z0-9-]{8,64}\.(png|jpg|webp)$/;
const ART_RE = /^\d{1,3}-[a-f0-9]{12}\.[a-z0-9]{2,4}$/;

/** Tipo real da imagem pelos bytes iniciais; null = não é PNG, JPEG nem WebP. */
export function sniffImage(bytes: Uint8Array): ImageExt | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") return "webp";
  return null;
}

async function store(dono: string, nome: string, tipo: string, bytes: Uint8Array) {
  await (await getDb()).run("INSERT INTO arquivos (dono, nome, tipo, tamanho, dados) VALUES (?, ?, ?, ?, ?)", [dono, nome, tipo, bytes.byteLength, Buffer.from(bytes)]);
}

async function load(dono: string, nome: string): Promise<{ bytes: Buffer; type: string } | null> {
  const row = await (await getDb()).get<{ tipo: string; dados: Buffer }>("SELECT tipo, dados FROM arquivos WHERE dono = ? AND nome = ?", [dono, nome]);
  return row ? { bytes: row.dados, type: row.tipo } : null;
}

export type SaveResult = { ok: true; url: string } | { ok: false; error: string };

export async function saveImage(lojaId: number, prefix: "logo" | "banner" | "tema", file: File, maxBytes: number): Promise<SaveResult> {
  if (file.size === 0) return { ok: false, error: "Arquivo vazio." };
  if (file.size > maxBytes) return { ok: false, error: `A imagem passa de ${Math.round(maxBytes / 1024 / 1024)} MB.` };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = sniffImage(bytes);
  if (!ext) return { ok: false, error: "Envie uma imagem PNG, JPG ou WebP." };
  const name = `${prefix}-${randomBytes(8).toString("hex")}.${ext}`;
  await store(`loja/${lojaId}`, name, IMAGE_TYPES[ext], bytes);
  return { ok: true, url: `/api/multiloja/arquivo/${lojaId}/${name}` };
}

/** Apaga uma imagem da própria loja (ignora URLs de fora ou de outra loja). */
export async function deleteImage(lojaId: number, url: string | null) {
  const match = url ? new RegExp(`^/api/multiloja/arquivo/${lojaId}/([^/]+)$`).exec(url) : null;
  if (!match || !NAME_RE.test(match[1])) return;
  await (await getDb()).run("DELETE FROM arquivos WHERE dono = ? AND nome = ?", [`loja/${lojaId}`, match[1]]);
}

export async function readImage(lojaId: string, name: string): Promise<{ bytes: Buffer; type: string } | null> {
  if (!/^\d{1,10}$/.test(lojaId) || !NAME_RE.test(name)) return null;
  return load(`loja/${lojaId}`, name);
}

// ---------------------------------------------------------------------------------- artes dos pedidos

/** Guarda a arte de um item do pedido. Devolve o nome interno do arquivo. */
export async function saveOrderArt(pedidoId: number, posicao: number, file: File): Promise<string> {
  const ext = (file.name.toLowerCase().split(".").pop() ?? "bin").replace(/[^a-z0-9]/g, "").slice(0, 4) || "bin";
  const name = `${posicao}-${randomBytes(6).toString("hex")}.${ext}`;
  await store(`pedido/${pedidoId}`, name, file.type || "application/octet-stream", new Uint8Array(await file.arrayBuffer()));
  return name;
}

export async function readOrderArt(pedidoId: number, name: string): Promise<Buffer | null> {
  if (!ART_RE.test(name)) return null;
  return (await load(`pedido/${pedidoId}`, name))?.bytes ?? null;
}
