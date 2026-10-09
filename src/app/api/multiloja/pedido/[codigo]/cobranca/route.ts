import { fail, isSameOrigin, json } from "@/lib/api/guard";
import { limited, lojaDaRequisicao, requestOrigin, vitrineLimits } from "@/lib/multiloja/http";
import { getPedidoByCodigo } from "@/lib/multiloja/repo-vendas";
import { renewCharge, tokenMatches } from "@/lib/multiloja/vendas";

/**
 * POST /api/multiloja/pedido/<código>/cobranca?t=<token> — gera outra cobrança (Pix vencido, link do cartão
 * expirado ou cobrança que não abriu) para um pedido que ainda não foi pago. Mesmo valor e mesma forma.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/multiloja/pedido/[codigo]/cobranca">) {
  if (!isSameOrigin(request)) return fail(403, "Origem não permitida.");
  const { codigo } = await ctx.params;
  const loja = lojaDaRequisicao(request);
  const pedido = getPedidoByCodigo(codigo);
  if (!loja || !pedido || pedido.lojaId !== loja.id || !tokenMatches(pedido, new URL(request.url).searchParams.get("t"))) return fail(404, "Pedido não encontrado.");
  if (limited(vitrineLimits.pedido, request, `cobranca:${pedido.id}`)) return fail(429, "Muitas tentativas. Espere alguns minutos.");
  const result = await renewCharge(pedido, requestOrigin(request), loja.nome);
  return result.ok ? json({ ok: true }) : fail(502, result.message);
}
