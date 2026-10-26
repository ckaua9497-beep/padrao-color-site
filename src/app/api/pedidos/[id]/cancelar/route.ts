import { compraRecente } from "@/lib/api/compras";
import { apiFailure, fail, json, limits, overLimit, readJsonBody, sessionOr401 } from "@/lib/api/guard";
import { cancelarPedido } from "@/lib/api/padrao";
import { COMPRA_FORA_DA_LISTA, estornoDe, janelaDeCancelamento, motivoSemCancelamento, textoDoEstorno } from "@/lib/cancelamento";

/**
 * POST /api/pedidos/[id]/cancelar {motivo} → POST /cancelarpedido: um item da compra.
 * [id] = número do PEDIDO (item da compra). O idCliente vem da sessão, nunca do navegador. Só nos 15 min depois da
 * compra e com o item ainda cancelável (cancelamento.ts), conferido aqui no GET /pedidos com o token do cliente; a API
 * ainda pode recusar (406 com o motivo).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await readJsonBody(request, 2 * 1024);
  if (!body.ok) return body.response;
  const { id } = await params;
  const order = /^\d{1,12}$/.test(id) ? Number(id) : 0;
  if (!order) return fail(400, "Pedido inválido.");
  const auth = await sessionOr401();
  if (!auth.ok) return auth.response;
  const blocked = overLimit(limits.account, `cancelar:${auth.session.id}`);
  if (blocked) return blocked;

  const motivo = typeof (body.data as { motivo?: unknown })?.motivo === "string" ? (body.data as { motivo: string }).motivo.trim().slice(0, 300) : "";
  if (motivo.length < 3) return fail(400, "Conte o motivo do cancelamento.");

  try {
    const compra = await compraRecente(auth.session.token, { pedido: order });
    if (!compra) return fail(409, COMPRA_FORA_DA_LISTA);
    const janela = janelaDeCancelamento(compra);
    if (!janela.aberta) return fail(409, motivoSemCancelamento(compra, janela));
    if (!janela.itens.includes(order)) return fail(409, "Este item não pode mais ser cancelado.");
    const estorno = estornoDe(compra, [order]);
    await cancelarPedido({ idCliente: auth.session.id, pedido: order, motivo }, auth.session.token);
    return json({ ok: true, message: ["Item cancelado.", ...textoDoEstorno(estorno)].join(" "), estorno });
  } catch (error) {
    return apiFailure(error, { session: true, fallback: "Não foi possível cancelar o pedido agora." });
  }
}
