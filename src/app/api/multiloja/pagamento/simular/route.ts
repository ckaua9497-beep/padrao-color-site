import { fail, json, readJsonBody } from "@/lib/api/guard";
import { getPedidoByCodigo } from "@/lib/multiloja/repo-vendas";
import { confirmPayment, tokenMatches } from "@/lib/multiloja/vendas";

/**
 * POST /api/multiloja/pagamento/simular {codigo, token} — só em desenvolvimento e só para pedidos do provedor
 * "simulado": marca o pedido como pago, para testar o caminho inteiro sem dinheiro.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return fail(404, "Não encontrado.");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const { codigo, token } = (body.data ?? {}) as { codigo?: unknown; token?: unknown };
  const pedido = typeof codigo === "string" ? await getPedidoByCodigo(codigo) : null;
  if (!pedido || typeof token !== "string" || !tokenMatches(pedido, token)) return fail(404, "Pedido não encontrado.");
  if (pedido.pagamentoProvedor !== "simulado") return fail(409, "Este pedido não é de teste.");
  await confirmPayment(pedido, "pagamento", "Pagamento simulado (ambiente de teste).");
  return json({ ok: true });
}
