import { fail, json } from "@/lib/api/guard";
import { limited, vitrineLimits } from "@/lib/multiloja/http";
import { getPedidoByCodigo } from "@/lib/multiloja/repo-vendas";
import { refreshPayment, tokenMatches } from "@/lib/multiloja/vendas";

/** GET /api/multiloja/pedido/<código>?t=<token> — situação do pedido (a página do pedido consulta enquanto espera o Pix). */
export async function GET(request: Request, ctx: RouteContext<"/api/multiloja/pedido/[codigo]">) {
  const { codigo } = await ctx.params;
  if (limited(vitrineLimits.status, request, "status")) return fail(429, "Muitas consultas. Espere um pouco.");
  const found = await getPedidoByCodigo(codigo);
  if (!found || !tokenMatches(found, new URL(request.url).searchParams.get("t"))) return fail(404, "Pedido não encontrado.");
  const pedido = await refreshPayment(found);
  return json({ status: pedido.status, pagoEm: pedido.pagoEm });
}
