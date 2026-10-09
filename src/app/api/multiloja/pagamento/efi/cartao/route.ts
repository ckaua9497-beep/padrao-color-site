import { efiWebhookAllowed } from "@/lib/multiloja/http";
import { chargeStatus, efiCardNotification } from "@/lib/multiloja/payments";
import { getPedidoByCodigo } from "@/lib/multiloja/repo-vendas";
import { applyChargeStatus } from "@/lib/multiloja/vendas";

/*
 * Notificação do cartão (API de Cobranças da Efí): chega "notification=<token>" (form). O token é trocado na Efí
 * pelos eventos (GET /v1/notification/:token) e cada cobrança é conferida de novo (GET /v1/charge/:id) antes de
 * mudar o pedido. A URL leva ?hmac=<segredo> (montada ao criar o link de pagamento).
 */
export async function POST(request: Request) {
  if (!efiWebhookAllowed(request)) return new Response(null, { status: 401 });
  let token = "";
  try {
    const form = await request.formData();
    token = String(form.get("notification") ?? "");
  } catch {
    return new Response(null, { status: 200 });
  }
  if (!/^[\w-]{10,100}$/.test(token)) return new Response(null, { status: 200 });
  try {
    for (const { codigo, chargeId } of await efiCardNotification(token)) {
      const pedido = getPedidoByCodigo(codigo);
      if (!pedido || pedido.pagamentoProvedor !== "efi" || pedido.pagamentoId !== chargeId) continue;
      applyChargeStatus(pedido, await chargeStatus("efi", chargeId), "notificação do cartão");
    }
  } catch (error) {
    console.error("[multiloja] notificação cartão:", error instanceof Error ? error.message : error);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 200 });
}
