import { cobrancasDoAviso } from "@/lib/multiloja/gateways/pagarme-dados";
import { pagarmeWebhookAllowed } from "@/lib/multiloja/http";
import { chargeStatus } from "@/lib/multiloja/payments";
import { getPedidoByPagamento } from "@/lib/multiloja/repo-vendas";
import { applyChargeStatus } from "@/lib/multiloja/vendas";

/*
 * Avisos (webhooks) da Pagar.me: {id, type, data} em JSON, com a cobrança em data (charge.paid, charge.refunded…) ou o
 * pedido com data.charges (order.paid, order.canceled…). A URL cadastrada no painel da Pagar.me leva ?hmac=<segredo>
 * (ou o segredo como senha da autenticação básica). O aviso não muda nada sozinho: cada cobrança é consultada na
 * Pagar.me (GET /charges/{id}) antes de mudar o pedido. Resposta diferente de 2xx faz a Pagar.me tentar de novo.
 */
export async function POST(request: Request) {
  if (!(await pagarmeWebhookAllowed(request))) return new Response(null, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 200 });
  }
  for (const chargeId of cobrancasDoAviso(body)) {
    const pedido = await getPedidoByPagamento(chargeId);
    if (!pedido || pedido.pagamentoProvedor !== "pagarme") continue;
    try {
      await applyChargeStatus(pedido, await chargeStatus("pagarme", chargeId), "aviso da Pagar.me");
    } catch (error) {
      console.error("[multiloja] aviso pagar.me:", error instanceof Error ? error.message : error);
      return new Response(null, { status: 500 });
    }
  }
  return new Response(null, { status: 200 });
}
