import { getPedidoByPagamento, setPedidoStatus } from "@/lib/multiloja/repo-vendas";
import { chargeStatus } from "@/lib/multiloja/payments";
import { confirmPayment } from "@/lib/multiloja/vendas";

/*
 * Webhook Pix da Efí (a Efí chama <webhookUrl>/pix com {pix: [{txid, …}]}). O corpo só serve de aviso: cada
 * txid é conferido na própria Efí (GET /v2/cob/<txid>) antes de marcar o pedido como pago.
 * Cadastrar na Efí: PUT /v2/webhook/<chave> com webhookUrl = <MULTILOJA_URL_PUBLICA>/api/multiloja/pagamento/efi
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 200 });
  }
  const pix = (body as { pix?: { txid?: unknown }[] } | null)?.pix;
  const txids = Array.isArray(pix) ? pix.map((p) => p?.txid).filter((t): t is string => typeof t === "string" && /^[a-zA-Z0-9]{26,35}$/.test(t)).slice(0, 20) : [];
  for (const txid of txids) {
    const pedido = getPedidoByPagamento(txid);
    if (!pedido || pedido.pagamentoProvedor !== "efi") continue;
    try {
      const status = await chargeStatus("efi", txid);
      if (status === "pago") confirmPayment(pedido, "pagamento", "Pix confirmado pela Efí.");
      else if (status === "expirado" && pedido.status === "aguardando_pagamento") setPedidoStatus(pedido.id, "expirado", "pagamento", "Cobrança Pix removida.");
    } catch (error) {
      console.error("[multiloja] webhook pix:", error instanceof Error ? error.message : error);
    }
  }
  // A Efí só precisa do 200; o resultado não volta para ela.
  return new Response(null, { status: 200 });
}
