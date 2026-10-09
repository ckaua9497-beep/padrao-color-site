import "server-only";

import { ART_UPLOAD_TYPES, artFileName, artPublicBase, fileExtension } from "./art-files";

/*
 * Bunny Storage da Padrão: os arquivos de arte dos pedidos (pasta pública da CDN). Só o servidor fala com ele, porque
 * a AccessKey dá escrita na zona inteira (nunca vai para o navegador nem para o log).
 *
 *   PUT  {BUNNY_STORAGE_URL}/{BUNNY_UPLOAD_FOLDER}/{nome}   (AccessKey, Content-Type do arquivo)
 *   URL  {BUNNY_CDN_URL}/{BUNNY_UPLOAD_FOLDER}/{nome}
 *
 * Sem a chave configurada, o envio fica desligado: o checkout segue e a arte vai "enviar depois", como antes.
 * Teste local: `node scripts/bunny-mock.mjs` e BUNNY_STORAGE_URL/BUNNY_CDN_URL apontando para ele.
 */

export type BunnyConfig = { accessKey: string; storageUrl: string; cdnUrl: string; folder: string };

const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, "");

export function bunnyConfig(): BunnyConfig | null {
  const accessKey = process.env.BUNNY_ACCESS_KEY?.trim();
  const storageUrl = process.env.BUNNY_STORAGE_URL?.trim().replace(/\/+$/, "");
  const cdnUrl = process.env.BUNNY_CDN_URL?.trim().replace(/\/+$/, "");
  const folder = trimSlashes(process.env.BUNNY_UPLOAD_FOLDER?.trim() || "uploads-clientes");
  if (!accessKey || !storageUrl || !cdnUrl || !folder) return null;
  return { accessKey, storageUrl, cdnUrl, folder };
}

/** Pasta pública dos arquivos ("https://…b-cdn.net/uploads-clientes/"); "" com o envio desligado. */
export function artBase(): string {
  const config = bunnyConfig();
  return config ? artPublicBase(config.cdnUrl, config.folder) : "";
}

export class BunnyError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Bunny Storage respondeu ${status}`);
    this.name = "BunnyError";
    this.status = status;
  }
}

let lastStamp = 0;

/** Momento do envio em ms, sempre crescente: dois arquivos de mesmo nome no mesmo instante não se sobrescrevem. */
function nextStamp(): number {
  const now = Date.now();
  lastStamp = now > lastStamp ? now : lastStamp + 1;
  return lastStamp;
}

/** Grava o arquivo no Bunny com o nome limpo + o momento do envio e devolve a URL pública. */
export async function uploadArtFile(config: BunnyConfig, file: { name: string; bytes: ArrayBuffer }): Promise<{ url: string; nome: string }> {
  const nome = artFileName(file.name, nextStamp());
  const response = await fetch(`${config.storageUrl}/${config.folder}/${nome}`, {
    method: "PUT",
    headers: { AccessKey: config.accessKey, "Content-Type": ART_UPLOAD_TYPES[fileExtension(nome)] ?? "application/octet-stream" },
    body: file.bytes,
    signal: AbortSignal.timeout(120_000),
    cache: "no-store",
  });
  if (!response.ok) throw new BunnyError(response.status);
  return { url: `${artPublicBase(config.cdnUrl, config.folder)}${nome}`, nome };
}
