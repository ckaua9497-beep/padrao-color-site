import { efiWebhookAllowed } from "@/lib/multiloja/http";
import { chargeStatus } from "@/lib/multiloja/payments";
import { getPedidoByPagamento } from "@/lib/multiloja/repo-vendas";
import { applyChargeStatus } from "@/lib/multiloja/vendas";

/*
 * Webhook Pix da Efí. Cadastrado pelo /admin/pagamentos com ?hmac=<segredo>&ignorar= (a Efí não acrescenta
 * /pix) e sem mTLS (x-skip-mtls-checking). Chega {pix: [{txid, endToEndId, valor, …}]}; o corpo só serve de aviso:
 * cada txid é consultado na Efí (GET /v2/cob/<txid>) antes de mudar o pedido.
 * No cadastro a Efí manda um aviso de teste sem Pix: responde 200.
 */
export async function POST(request: Request) {
  if (!efiWebhookAllowed(request)) return new Response(null, { status: 401 });
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
      applyChargeStatus(pedido, await chargeStatus("efi", txid), "webhook Pix");
    } catch (error) {
      console.error("[multiloja] webhook pix:", error instanceof Error ? error.message : error);
      // 500: a Efí tenta de novo (até 9 vezes).
      return new Response(null, { status: 500 });
    }
  }
  return new Response(null, { status: 200 });
}
