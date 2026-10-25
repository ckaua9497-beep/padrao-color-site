/*
 * Arquivos de arte do pedido no Bunny Storage (pasta pública da CDN da Padrão).
 *
 * O cliente monta ou envia a arte no site; os arquivos ficam no navegador (IndexedDB) até ele finalizar a compra. No
 * checkout, cada arquivo vai para /api/arte, o servidor grava no Bunny (PUT com a AccessKey, que nunca chega ao
 * navegador) e devolve a URL pública. O pedido leva as URLs em produtos[].arte.anexos, com o tipo de anexo que o
 * produto aceita na API ("Arquivo Único", "Impressão Frente", "Impressão Verso"…).
 *
 * Módulo puro (sem React e sem o alias @/): roda no `node --test` (art-files.test.ts).
 */

/** Extensões aceitas no envio e o Content-Type gravado no Bunny. */
export const ART_UPLOAD_TYPES: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  // BMP e JFIF abrem na página do produto (image-prep.ts); sem eles aqui, o checkout recusava o arquivo.
  jfif: "image/jpeg",
  bmp: "image/bmp",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  psd: "image/vnd.adobe.photoshop",
  ai: "application/postscript",
  eps: "application/postscript",
  cdr: "application/vnd.corel-draw",
  zip: "application/zip",
  rar: "application/vnd.rar",
};

/** Teto por arquivo (o PDF no gabarito de uma lona grande passa dos 25 MB da imagem enviada). */
export const ART_UPLOAD_MAX_MB = 60;

/**
 * De onde veio o arquivo: o PDF montado no gabarito, a arte enviada pelo cliente (frente), a do verso ou um arquivo
 * complementar da variação ("extra", com o tipo de anexo em `tipo`: faca de corte, máscara de branco, verniz…).
 */
export type ArtFileKind = "pdf" | "arquivo" | "verso" | "extra";

/** Arquivo no Bunny, como o checkout manda para o servidor. */
export type UploadedArtFile = { url: string; nome: string; kind: ArtFileKind; tipo?: string };

/** Anexo do pedido (POST /gerarpedido): produtos[].arte.anexos. */
export type ArtAttachment = { url: string; nome: string; tipoArquivo: string };

export function fileExtension(name: string): string {
  const match = /\.([a-z0-9]{1,5})$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : "";
}

/** Problema do arquivo para o envio (formato ou tamanho); null quando pode ir. */
export function uploadProblem(name: string, size: number): string | null {
  const ext = fileExtension(name);
  if (!ART_UPLOAD_TYPES[ext]) return "Formato de arquivo não aceito. Envie PDF, PNG, JPG, SVG, AI, CDR ou EPS.";
  if (!(size > 0)) return "O arquivo está vazio.";
  if (size > ART_UPLOAD_MAX_MB * 1024 * 1024) return `O arquivo passa de ${ART_UPLOAD_MAX_MB} MB.`;
  return null;
}

/**
 * Nome do arquivo no Bunny: o nome que o cliente deu, sem acento, espaço nem caractere especial, mais o momento do
 * envio (ms) e a extensão — "Cartão Visita (1).pdf" → "CartaoVisita11791545356518.pdf", como os do site da Padrão.
 */
export function artFileName(original: string, stamp: number): string {
  const ext = fileExtension(original) || "bin";
  const base = original
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .slice(0, 60);
  return `${base || "arte"}${Math.max(0, Math.round(stamp))}.${ext}`;
}

/** Nome gerado por artFileName (só letras, números e a extensão): o que pode aparecer depois da pasta. */
const STORED_NAME = /^[A-Za-z0-9]{1,80}\.[a-z0-9]{1,5}$/;

/** Pasta pública dos arquivos: "https://padrao-color.b-cdn.net/uploads-clientes/". */
export function artPublicBase(cdnUrl: string, folder: string): string {
  return `${cdnUrl.replace(/\/+$/, "")}/${folder.replace(/^\/+|\/+$/g, "")}/`;
}

/** A URL é de um arquivo nosso no Bunny (pasta pública, nome gerado aqui)? Nada de link de fora no pedido. */
export function isArtFileUrl(url: string, base: string): boolean {
  if (!base || !url.startsWith(base)) return false;
  return STORED_NAME.test(url.slice(base.length));
}

const KINDS: readonly ArtFileKind[] = ["pdf", "arquivo", "verso", "extra"];
export const MAX_ITEM_FILES = 12;

/** Arquivos de um item vindos do navegador (validados um a um); os inválidos ficam de fora. */
export function parseUploadedFiles(raw: unknown, base: string): UploadedArtFile[] {
  if (!Array.isArray(raw) || !base) return [];
  const out: UploadedArtFile[] = [];
  for (const entry of raw.slice(0, MAX_ITEM_FILES)) {
    if (typeof entry !== "object" || entry === null) continue;
    const { url, nome, kind, tipo } = entry as Record<string, unknown>;
    if (typeof url !== "string" || typeof nome !== "string" || !KINDS.includes(kind as ArtFileKind)) continue;
    // Complementar sem o tipo de anexo não tem como ir para a produção.
    if (kind === "extra" && (typeof tipo !== "string" || !tipo.trim() || tipo.length > 60)) continue;
    if (!isArtFileUrl(url, base) || url.slice(base.length) !== nome) continue;
    if (out.some((file) => file.url === url)) continue;
    out.push({ url, nome, kind: kind as ArtFileKind, ...(kind === "extra" ? { tipo: (tipo as string).trim() } : {}) });
  }
  return out;
}

/**
 * Tipo de anexo de cada arquivo, entre os que a variação aceita na API (tipos_anexo): o PDF montado no gabarito e a
 * arte da frente vão como "Arquivo Único" (ou "Impressão Frente" quando a variação separa frente e verso); a do
 * verso, como "Impressão Verso"; o complementar, com o próprio tipo. Sem a lista na API: "Arquivo Único".
 */
export function attachmentType(kind: ArtFileKind, accepted: readonly string[], tipo?: string): string {
  const has = (name: string) => accepted.includes(name);
  if (kind === "extra" && tipo && has(tipo)) return tipo;
  if (kind === "verso") return has("Impressão Verso") ? "Impressão Verso" : has("Arquivo Único") || !accepted.length ? "Arquivo Único" : accepted[0];
  if (has("Arquivo Único") || !accepted.length) return "Arquivo Único";
  return has("Impressão Frente") ? "Impressão Frente" : accepted[0];
}

/**
 * Anexos do item no pedido: o PDF do gabarito primeiro, depois a arte enviada (frente e verso) e os complementares.
 * Variação que não recebe arquivo (`accepted` vazio com `semArquivo`): nenhum anexo.
 */
export function orderAttachments(files: readonly UploadedArtFile[], accepted: readonly string[], { semArquivo = false }: { semArquivo?: boolean } = {}): ArtAttachment[] {
  if (semArquivo) return [];
  const order: Record<ArtFileKind, number> = { pdf: 0, arquivo: 1, verso: 2, extra: 3 };
  return [...files].sort((a, b) => order[a.kind] - order[b.kind]).map((file) => ({ url: file.url, nome: file.nome, tipoArquivo: attachmentType(file.kind, accepted, file.tipo) }));
}
