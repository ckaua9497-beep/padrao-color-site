import { catalogoVivo } from "@/lib/catalogo-vivo";

/*
 * Download do gabarito de um produto: GET /api/gabarito/[id] (id do catálogo, ex. "35" ou "tags", ou o slug).
 *
 * Premissa documentada: o "PG Gabarito" do checklist não tem contrato (rota, formato, entrega), e nenhum endpoint
 * do PDF baixa gabarito. O arquivo vem do campo `gabarito` de GET /grupos — a mesma URL que o padraocolor.com.br/gabaritos
 * usa —, lido do catálogo gerado (npm run sync:catalog). A rota repassa o arquivo em streaming com nome amigável.
 * Se o PG Gabarito ganhar uma API, só a função `templateSource` muda.
 *
 * Segurança: só baixa de https://img.padraocolor.com.br/padraocolor/… (a URL vem do catálogo, nunca da requisição).
 */

const ALLOWED_HOST = "img.padraocolor.com.br";
const ALLOWED_PATH = "/padraocolor/";
const HEADERS_TIMEOUT_MS = 20_000;

const CONTENT_TYPES: Record<string, string> = {
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  pdf: "application/pdf",
  ai: "application/postscript",
  eps: "application/postscript",
  cdr: "application/vnd.corel-draw",
  psd: "image/vnd.adobe.photoshop",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

function error(status: number, message: string) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

/** URL do arquivo no servidor de imagens da Padrão, já validada; null = produto sem gabarito ou URL fora da lista. */
function templateSource(template: string | null | undefined): URL | null {
  if (!template) return null;
  try {
    // As URLs da API vêm com espaços ("gabarito_abada dryfit.rar").
    const url = new URL(encodeURI(decodeURI(template.trim())));
    if (url.protocol !== "https:" || url.hostname !== ALLOWED_HOST || !url.pathname.startsWith(ALLOWED_PATH)) return null;
    return url;
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = (await catalogoVivo()).getProductById(id);
  if (!product) return error(404, "Produto não encontrado.");
  const source = templateSource(product.template);
  if (!source) return error(404, "Este produto não tem gabarito para download.");

  const extension = (/\.([a-z0-9]{2,4})$/i.exec(source.pathname)?.[1] ?? "zip").toLowerCase();
  const filename = `gabarito-${product.slug}.${extension}`;

  // O prazo vale até chegar a resposta; o corpo segue em streaming sem limite de tempo.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEADERS_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(source, { signal: controller.signal, cache: "no-store", redirect: "follow" });
  } catch {
    return error(502, "Não foi possível baixar o gabarito agora. Tente de novo em instantes.");
  } finally {
    clearTimeout(timer);
  }

  const finalHost = new URL(upstream.url || source.href).hostname;
  if (!upstream.ok || !upstream.body || finalHost !== ALLOWED_HOST) {
    await upstream.body?.cancel();
    return error(upstream.status === 404 ? 404 : 502, "O arquivo do gabarito não está disponível no momento.");
  }

  const headers = new Headers({
    "Content-Type": CONTENT_TYPES[extension] ?? upstream.headers.get("content-type") ?? "application/octet-stream",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "public, max-age=3600, s-maxage=86400",
    "X-Content-Type-Options": "nosniff",
  });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  return new Response(upstream.body, { status: 200, headers });
}
