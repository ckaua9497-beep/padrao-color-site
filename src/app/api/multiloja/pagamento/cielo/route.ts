import { cieloWebhookAllowed } from "@/lib/multiloja/http";
import { chargeStatus } from "@/lib/multiloja/payments";
import { getPedidoByPagamento } from "@/lib/multiloja/repo-vendas";
import { applyChargeStatus } from "@/lib/multiloja/vendas";

/*
 * "Post de Notificação" da API E-commerce Cielo: {PaymentId, ChangeType} em JSON, com o cabeçalho
 * X-Multiloja-Segredo (cadastrado no portal Cielo → Gestão API E-commerce → URL de notificações). O aviso não traz
 * o status: a venda é consultada (GET /1/sales/{PaymentId}) antes de mudar o pedido.
 */
export async function POST(request: Request) {
  if (!cieloWebhookAllowed(request)) return new Response(null, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 200 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const paymentId = String(b.PaymentId ?? b.paymentId ?? b.Paymentid ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return new Response(null, { status: 200 });
  const pedido = getPedidoByPagamento(paymentId);
  if (!pedido || pedido.pagamentoProvedor !== "cielo") return new Response(null, { status: 200 });
  try {
    applyChargeStatus(pedido, await chargeStatus("cielo", paymentId), "aviso da Cielo");
  } catch (error) {
    console.error("[multiloja] aviso cielo:", error instanceof Error ? error.message : error);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 200 });
}
