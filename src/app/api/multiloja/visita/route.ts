import { isSameOrigin } from "@/lib/api/guard";
import { dayKey, linkSlugError } from "@/lib/multiloja/core";
import { limited, lojaDaRequisicao, vitrineLimits } from "@/lib/multiloja/http";
import { countVisit, listLinks } from "@/lib/multiloja/repo-vendas";

/**
 * POST /api/multiloja/visita {ref} — a vitrine conta uma visita por sessão do navegador. `ref` é o link de
 * divulgação (?ref=…) quando ele existe na loja; sem ele, conta como acesso direto.
 */
export async function POST(request: Request) {
  const noContent = new Response(null, { status: 204 });
  if (!isSameOrigin(request)) return noContent;
  const loja = lojaDaRequisicao(request);
  if (!loja || limited(vitrineLimits.visita, request, `visita:${loja.id}`)) return noContent;
  let ref = "";
  try {
    const body = (await request.json()) as { ref?: unknown };
    ref = typeof body.ref === "string" ? body.ref.trim().slice(0, 30) : "";
  } catch {
    // sem corpo: acesso direto
  }
  if (ref && (linkSlugError(ref) || !listLinks(loja.id).some((link) => link.slug === ref))) ref = "";
  countVisit(loja.id, ref, dayKey());
  return noContent;
}
