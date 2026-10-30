import { cancelPurchase } from "@/lib/api/checkout";
import { compraRecente } from "@/lib/api/compras";
import { apiFailure, fail, json, limits, overLimit, readJsonBody, sessionOr401 } from "@/lib/api/guard";
import { COMPRA_FORA_DA_LISTA, estornoDe, janelaDeCancelamento, motivoSemCancelamento, textoDoEstorno } from "@/lib/cancelamento";

/**
 * POST /api/pedidos/compra/[id]/cancelar {motivo} → POST /cancelarcompra: a compra inteira (Meus pedidos e o checkout,
 * quando o pagamento não acontece). [id] = número da COMPRA (o "order" da API); o idCliente vem da sessão.
 * Só nos 15 min depois da compra (cancelamento.ts), conferido aqui no GET /pedidos com o token do cliente.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await readJsonBody(request, 2 * 1024);
  if (!body.ok) return body.response;
  const { id } = await params;
  const order = /^\d{1,12}$/.test(id) ? Number(id) : 0;
  if (!order) return fail(400, "Compra inválida.");
  const auth = await sessionOr401();
  if (!auth.ok) return auth.response;
  const blocked = overLimit(limits.account, `cancelar:${auth.session.id}`);
  if (blocked) return blocked;

  const motivo = typeof (body.data as { motivo?: unknown })?.motivo === "string" ? (body.data as { motivo: string }).motivo.trim().slice(0, 300) : "";
  if (motivo.length < 3) return fail(400, "Conte o motivo do cancelamento.");

  try {
    const compra = await compraRecente(auth.session.token, { compra: order });
    if (!compra) return fail(409, COMPRA_FORA_DA_LISTA);
    const janela = janelaDeCancelamento(compra);
    if (!janela.aberta) return fail(409, motivoSemCancelamento(compra, janela));
    const estorno = estornoDe(compra, janela.itens);
    await cancelPurchase({ customerId: auth.session.id, order: compra.compra, reason: motivo }, auth.session.token);
    return json({ ok: true, message: ["Compra cancelada.", ...textoDoEstorno(estorno)].join(" "), estorno });
  } catch (error) {
    return apiFailure(error, { session: true, fallback: "Não foi possível cancelar a compra agora." });
  }
}
