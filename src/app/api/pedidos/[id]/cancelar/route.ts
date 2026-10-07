import { apiFailure, fail, json, limits, overLimit, readJsonBody, sessionOr401 } from "@/lib/api/guard";
import { cancelarPedido } from "@/lib/api/padrao";

/**
 * POST /api/pedidos/[id]/cancelar {motivo} → POST /cancelarpedido.
 * [id] = número do PEDIDO (item da compra). O idCliente vem da sessão, nunca do navegador; a API decide se
 * o pedido ainda pode ser cancelado (406 com o motivo quando não pode).
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
    await cancelarPedido({ idCliente: auth.session.id, pedido: order, motivo }, auth.session.token);
  } catch (error) {
    return apiFailure(error, { session: true, fallback: "Não foi possível cancelar o pedido agora." });
  }
  return json({ ok: true, message: "Pedido cancelado." });
}
