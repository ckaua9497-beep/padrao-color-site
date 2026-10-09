import { codigoFromCielo } from "@/lib/multiloja/gateways/cielo";
import { cieloWebhookAllowed } from "@/lib/multiloja/http";
import { chargeStatus } from "@/lib/multiloja/payments";
import { getPedidoByCodigo } from "@/lib/multiloja/repo-vendas";
import { applyChargeStatus } from "@/lib/multiloja/vendas";

/*
 * Notificação de mudança de status do Link de Pagamento Cielo (cartão): form com order_number, payment_status…
 * Sem autenticação da Cielo: a URL cadastrada leva ?hmac=<segredo>, e o link é consultado na Cielo
 * (GET /api/public/v1/products/{id}/payments) antes de mudar o pedido.
 */
export async function POST(request: Request) {
  if (!(await cieloWebhookAllowed(request))) return new Response(null, { status: 401 });
  let orderNumber = "";
  try {
    const type = request.headers.get("content-type") ?? "";
    if (type.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;
      orderNumber = String(body.order_number ?? body.MerchantOrderNumber ?? "");
    } else {
      const form = await request.formData();
      orderNumber = String(form.get("order_number") ?? "");
    }
  } catch {
    return new Response(null, { status: 200 });
  }
  const pedido = /^[A-Za-z0-9]{1,20}$/.test(orderNumber) ? await getPedidoByCodigo(codigoFromCielo(orderNumber)) : null;
  if (!pedido || pedido.pagamentoProvedor !== "cielo" || !pedido.pagamentoId?.startsWith("link-")) return new Response(null, { status: 200 });
  try {
    await applyChargeStatus(pedido, await chargeStatus("cielo", pedido.pagamentoId), "Link de Pagamento Cielo");
  } catch (error) {
    console.error("[multiloja] notificação link cielo:", error instanceof Error ? error.message : error);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 200 });
}
