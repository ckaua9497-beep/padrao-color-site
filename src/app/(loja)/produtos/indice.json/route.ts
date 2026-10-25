import { catalogoVivo } from "@/lib/catalogo-vivo";
import { midiaDoSite } from "@/lib/midia-servidor";

// Índice leve da busca do topo, gerado do catálogo (substitui o antigo public/search-index.json, que ficava
// desatualizado quando o catálogo mudava): só os produtos ativos, refeito a cada 10 min (catálogo em tempo real). A
// capa trocada no admin (admin → Site → Imagens) entra no lugar da foto da API; a troca refaz o índice (etiqueta do
// cache das imagens).
export const revalidate = 600;

export async function GET() {
  const [midia, catalogo] = await Promise.all([midiaDoSite(), catalogoVivo()]);
  const idPorSlug = new Map(catalogo.getProducts().map((p) => [p.slug, p.id]));
  const index = catalogo.getSearchIndex().map((e) => {
    const capa = midia.produtos[idPorSlug.get(e.s) ?? ""]?.imagens[0];
    return capa ? { ...e, i: capa } : e;
  });
  return Response.json(index, { headers: { "Cache-Control": "public, max-age=600, stale-while-revalidate=86400" } });
}
