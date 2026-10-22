import type { NextRequest } from "next/server";
import { getProduct } from "@/lib/catalog";
import { produtoComMidia } from "@/lib/midia";
import { midiaDoSite } from "@/lib/midia-servidor";
import { toPartyProduct } from "@/lib/party";

/**
 * GET /api/kit/produto?slug=63-caneca-de-ceramica-personalizada → { product, category }
 * Preço de um produto trazido pela busca do Monte Seu Kit: opções, variações (com as faixas de quantidade),
 * medida livre e limites. Catálogo público, igual para todo cliente: pode ir para cache.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug")?.trim() ?? "";
  if (!/^[a-z0-9-]{1,140}$/.test(slug)) return Response.json({ error: "Produto inválido." }, { status: 400 });
  const found = getProduct(slug);
  if (!found) return Response.json({ error: "Produto não encontrado." }, { status: 404 });
  const product = produtoComMidia(found, await midiaDoSite());
  return Response.json({ product: toPartyProduct(product), category: product.category }, { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } });
}
