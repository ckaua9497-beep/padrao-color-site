import { efiChargeNotification } from "@/lib/multiloja/gateways/efi";
import { efiWebhookAllowed } from "@/lib/multiloja/http";
import { chargeStatus } from "@/lib/multiloja/payments";
import { getPedidoByCodigo } from "@/lib/multiloja/repo-vendas";
import { applyChargeStatus } from "@/lib/multiloja/vendas";

/*
 * Notificação da API de Cobranças da Efí (boleto e cartão): chega "notification=<token>" (form). O token é trocado na
 * Efí pelos eventos (GET /v1/notification/:token) e cada cobrança é conferida de novo (GET /v1/charge/:id) antes de
 * mudar o pedido. A URL leva ?hmac=<segredo> (montada ao criar o boleto ou o link do cartão).
 */
export async function POST(request: Request) {
  if (!(await efiWebhookAllowed(request))) return new Response(null, { status: 401 });
  let token = "";
  try {
    const form = await request.formData();
    token = String(form.get("notification") ?? "");
  } catch {
    return new Response(null, { status: 200 });
  }
  if (!/^[\w-]{10,100}$/.test(token)) return new Response(null, { status: 200 });
  try {
    for (const { codigo, chargeNumber } of await efiChargeNotification(token)) {
      const pedido = await getPedidoByCodigo(codigo);
      const ours = pedido?.pagamentoId?.replace(/^(cartao|boleto)-/, "");
      if (!pedido || pedido.pagamentoProvedor !== "efi" || ours !== chargeNumber || !pedido.pagamentoId) continue;
      await applyChargeStatus(pedido, await chargeStatus("efi", pedido.pagamentoId), pedido.formaPagamento === "boleto" ? "notificação do boleto" : "notificação do cartão");
    }
  } catch (error) {
    console.error("[multiloja] notificação de cobrança:", error instanceof Error ? error.message : error);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 200 });
}
