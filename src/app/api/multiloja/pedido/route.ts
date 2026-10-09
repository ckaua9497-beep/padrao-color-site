import { fail, json, readJsonBody } from "@/lib/api/guard";
import { limited, lojaDaRequisicao, requestOrigin, vitrineLimits } from "@/lib/multiloja/http";
import { parseCheckout } from "@/lib/multiloja/pedido";
import { activeProvider, availableMethods } from "@/lib/multiloja/payments";
import { isPaymentKind } from "@/lib/multiloja/core";
import { placeOrder, priceCart, quoteFor } from "@/lib/multiloja/vendas";
import { MAX_ORDER_ITEMS, parseItem, type OrderItemInput } from "@/lib/orders";
import { isTrackingId } from "@/lib/multiloja/eventos";

/*
 * Pedido da vitrine da multiloja (chamado no host da loja).
 * POST /api/multiloja/pedido            → fecha o pedido e devolve o link da página do pedido.
 * POST /api/multiloja/pedido?cotar=1    → só recalcula os totais (o checkout mostra antes de confirmar).
 */

export async function POST(request: Request) {
  const loja = await lojaDaRequisicao(request);
  if (!loja) return fail(404, "Loja não encontrada.");
  const body = await readJsonBody(request, 256 * 1024);
  if (!body.ok) return body.response;
  const parsed = parseCheckout(body.data);
  const onlyQuote = new URL(request.url).searchParams.get("cotar") === "1";

  if (onlyQuote) {
    // A cotação só precisa dos itens e da forma de pagamento: os dados do cliente ainda podem estar em branco.
    const raw = body.data as { items?: unknown; pagamento?: unknown };
    const list = Array.isArray(raw.items) && raw.items.length > 0 && raw.items.length <= MAX_ORDER_ITEMS ? raw.items.map(parseItem) : [];
    if (list.length === 0 || list.some((item) => item === null)) return fail(400, "Carrinho inválido.");
    const priced = await priceCart(loja, list as OrderItemInput[]);
    if (!priced.ok) return json({ ok: false, errors: priced.errors }, 422);
    const metodos = await availableMethods();
    const method = isPaymentKind(raw.pagamento) && metodos.includes(raw.pagamento) ? raw.pagamento : (metodos[0] ?? "pix");
    return json({ ok: true, quote: await quoteFor(loja, priced.items, method), online: await activeProvider() !== null && metodos.length > 0, metodos, metodo: method });
  }

  if (!parsed.ok) return fail(400, parsed.error, parsed.field ? { field: parsed.field } : undefined);
  if (!(await activeProvider())) return fail(503, "O pagamento online ainda não está disponível nesta loja. Finalize pelo WhatsApp da loja.");
  if (!(await availableMethods()).includes(parsed.value.pagamento)) return fail(422, "Esta forma de pagamento não está disponível agora. Escolha outra.");
  if (limited(vitrineLimits.pedido, request, `pedido:${loja.id}`)) return fail(429, "Muitos pedidos seguidos. Espere alguns minutos e tente de novo.");

  const visitante = request.headers.get("x-pc-visitante");
  const sessao = request.headers.get("x-pc-sessao");
  const tracking = isTrackingId(visitante) && isTrackingId(sessao) ? { visitante, sessao } : null;
  const result = await placeOrder(loja, parsed.value, requestOrigin(request), tracking);
  if (result.ok) {
    const { pedido } = result;
    return json({ ok: true, codigo: pedido.codigo, url: `/pedido/${pedido.codigo}?t=${pedido.token}`, token: pedido.token }, 201);
  }
  if (result.status === 409) return json({ ok: false, error: result.message, quote: result.quote }, 409);
  if (result.status === 502) return json({ ok: false, error: result.message, codigo: result.pedido.codigo, url: `/pedido/${result.pedido.codigo}?t=${result.pedido.token}` }, 502);
  return json({ ok: false, error: result.message, errors: result.errors ?? [] }, 422);
}
