import { getPedidoByCodigo, setPedidoStatus } from "@/lib/multiloja/repo-vendas";
import { chargeStatus, efiCardNotification } from "@/lib/multiloja/payments";
import { confirmPayment } from "@/lib/multiloja/vendas";

/*
 * Notificação do cartão (API de Cobranças da Efí): chega um token ("notification=<token>"), que é trocado na
 * Efí pelos eventos. Cada cobrança é conferida de novo antes de mudar o pedido.
 */
export async function POST(request: Request) {
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
      const status = await chargeStatus("efi", chargeId);
      if (status === "pago") confirmPayment(pedido, "pagamento", "Cartão aprovado pela Efí.");
      else if (status === "expirado" && pedido.status === "aguardando_pagamento") setPedidoStatus(pedido.id, "expirado", "pagamento", "Cobrança do cartão cancelada ou vencida.");
    }
  } catch (error) {
    console.error("[multiloja] notificação cartão:", error instanceof Error ? error.message : error);
  }
  return new Response(null, { status: 200 });
}
