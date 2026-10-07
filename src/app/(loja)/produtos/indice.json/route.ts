import { getSearchIndex } from "@/lib/catalog";

// Índice leve da busca do topo, gerado do catálogo no build (substitui o antigo public/search-index.json,
// que ficava desatualizado quando o catálogo mudava).
export const dynamic = "force-static";

export function GET() {
  return Response.json(getSearchIndex(), { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } });
}
