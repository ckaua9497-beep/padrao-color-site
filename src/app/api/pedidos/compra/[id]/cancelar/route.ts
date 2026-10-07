import { cancelPurchase } from "@/lib/api/checkout";
import { apiFailure, fail, json, limits, overLimit, readJsonBody, sessionOr401 } from "@/lib/api/guard";

/**
 * POST /api/pedidos/compra/[id]/cancelar {motivo} → POST /cancelarcompra (o checkout oferece quando o
 * pagamento não acontece). [id] = número da COMPRA (o "order" da API); o idCliente vem da sessão.
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
    await cancelPurchase({ customerId: auth.session.id, order, reason: motivo }, auth.session.token);
  } catch (error) {
    return apiFailure(error, { session: true, fallback: "Não foi possível cancelar a compra agora." });
  }
  return json({ ok: true, message: "Compra cancelada." });
}
