import { getProducts, getSearchIndex } from "@/lib/catalog";
import { midiaDoSite } from "@/lib/midia-servidor";

// Índice leve da busca do topo, gerado do catálogo no build (substitui o antigo public/search-index.json,
// que ficava desatualizado quando o catálogo mudava). A capa trocada no admin (admin → Site → Imagens) entra no
// lugar da foto da API; a troca refaz o índice (etiqueta do cache das imagens).
export const dynamic = "force-static";

export async function GET() {
  const midia = await midiaDoSite();
  const idPorSlug = new Map(getProducts().map((p) => [p.slug, p.id]));
  const index = getSearchIndex().map((e) => {
    const capa = midia.produtos[idPorSlug.get(e.s) ?? ""]?.imagens[0];
    return capa ? { ...e, i: capa } : e;
  });
  return Response.json(index, { headers: { "Cache-Control": "public, max-age=600, stale-while-revalidate=86400" } });
}
