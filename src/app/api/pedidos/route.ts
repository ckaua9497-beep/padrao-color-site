import { createHash } from "node:crypto";
import { ordersEnabled } from "@/lib/api/checkout";
import { ApiError } from "@/lib/api/client";
import { apiFailure, fail, json, limits, overLimit, readJsonBody, SESSION_EXPIRED, sessionOr401 } from "@/lib/api/guard";
import { gerarPedido, getCliente } from "@/lib/api/padrao";
import { groupPrices, linePricesFor, type PriceAccount } from "@/lib/api/prices";
import type { ApiCliente } from "@/lib/api/types";
import { artBase } from "@/lib/bunny";
import { getProduct } from "@/lib/catalog";
import { productFacts } from "@/lib/order-facts";
import {
  addressFromApi,
  buildOrderPayload,
  extractOrderNumber,
  isLineError,
  orderDelivery,
  orderTotals,
  parseOrderRequest,
  priceLine,
  totalsDiffer,
  type LinePrices,
  type OrderItemInput,
  type PricedLine,
} from "@/lib/orders";
import { clearSession, profileOf } from "@/lib/session";
import { recordOrderEvent } from "@/lib/multiloja/analytics";
import { isTrackingId } from "@/lib/multiloja/eventos";

/*
 * POST /api/pedidos — fecha o pedido do checkout.
 * 1. Exige sessão (o POST /gerarpedido precisa do idCliente) e confere o token no GET /cliente.
 * 2. Recalcula cada item no servidor com a tabela do cliente (balcão ou revenda + categoria): o preço que vem
 *    do navegador nunca vale. Se o total mudou, devolve 409 com a nova cotação para o cliente confirmar.
 * 3. Monta o payload (src/lib/orders.ts). PADRAO_ORDERS_ENABLED != "true" → simulação: devolve o payload e
 *    não chama a API. "true" → POST /gerarpedido, com proteção contra pedido duplicado (duplo clique).
 */

const DUPLICATE_WINDOW_MS = 2 * 60_000;
const recentOrders = new Map<string, { at: number; order: number | null } | { at: number; pending: true }>();

function rememberOrder(key: string, value: { order: number | null } | { pending: true }) {
  const now = Date.now();
  for (const [stored, entry] of recentOrders) if (now - entry.at > DUPLICATE_WINDOW_MS) recentOrders.delete(stored);
  recentOrders.set(key, { at: now, ...value });
}

/** Item antigo sem grupo: acha pelo slug do produto. */
function withGroup(item: OrderItemInput): OrderItemInput {
  if (item.groupId) return item;
  const groupId = getProduct(item.slug)?.groupId;
  return groupId ? { ...item, groupId } : item;
}

export async function POST(request: Request) {
  const body = await readJsonBody(request, 256 * 1024);
  if (!body.ok) return body.response;
  const auth = await sessionOr401();
  if (!auth.ok) return auth.response;
  const session = auth.session;
  // Arquivos da arte: só os da pasta pública do Bunny entram no pedido (arte.anexos).
  const parsed = parseOrderRequest(body.data, { artBase: artBase() });
  if (!parsed.ok) return fail(400, parsed.error);
  const blocked = overLimit(limits.orders, `pedido:${session.id}`);
  if (blocked) return blocked;

  const { payment, delivery, expectedTotal } = parsed.value;
  const items = parsed.value.items.map(withGroup);

  // Cadastro de agora: confere o token, a categoria/tabela e o endereço de entrega.
  let cliente: ApiCliente | null;
  try {
    cliente = await getCliente(session.token);
  } catch (error) {
    return apiFailure(error, { session: true });
  }
  if (!cliente?.id || Number(cliente.id) !== session.id) {
    await clearSession();
    return fail(401, SESSION_EXPIRED, { session: "expired" });
  }
  const profile = profileOf(cliente);
  const account: PriceAccount = { id: session.id, token: session.token, reseller: profile.reseller, category: profile.category, priceTable: profile.priceTable };

  const prices = new Map<number, LinePrices>();
  try {
    const groups = [...new Set(items.map((item) => item.groupId).filter((id): id is number => Boolean(id)))];
    await Promise.all(
      groups.map(async (groupId) => {
        const group = await groupPrices(groupId, account);
        if (group) prices.set(groupId, linePricesFor(group, account, { ordersOn: ordersEnabled() }));
      }),
    );
  } catch (error) {
    return apiFailure(error, { session: true, fallback: "Não foi possível confirmar os preços agora. Tente de novo." });
  }

  const priced = items.map((item) => priceLine(item, item.groupId ? prices.get(item.groupId) : null));
  const problems = priced.filter(isLineError);
  if (problems.length) return fail(422, "Alguns itens do carrinho precisam de atenção.", { items: problems });
  const lines = priced as PricedLine[];

  const totals = orderTotals(lines, payment);
  const quote = { totals, reseller: profile.reseller, lines: lines.map((line) => ({ key: line.key, unitPrice: line.unitPrice, total: line.total, reseller: line.reseller })) };
  if (totalsDiffer(totals.total, expectedTotal)) {
    return fail(409, "Os preços foram atualizados para a sua conta. Confira o novo total antes de confirmar.", { quote });
  }

  const registered = addressFromApi(cliente.endereco_entrega) ?? addressFromApi(cliente.endereco_cadastro);
  const deliveryInfo = orderDelivery(delivery, registered);
  if (!deliveryInfo) return fail(400, "Seu cadastro não tem endereço de entrega completo. Informe outro endereço ou escolha a retirada.");

  const payload = buildOrderPayload({ customerId: session.id, lines, method: payment, delivery: deliveryInfo, facts: productFacts });
  // Rastreamento (site da Padrão = loja 0): pedido e itens, ligados à sessão anônima de quem comprou.
  const visitante = request.headers.get("x-pc-visitante");
  const sessaoRastreio = request.headers.get("x-pc-sessao");
  const trackOrder = (codigo: string) =>
    recordOrderEvent("pedido_criado", {
      lojaId: 0,
      visitante: isTrackingId(visitante) ? visitante : null,
      sessao: isTrackingId(sessaoRastreio) ? sessaoRastreio : null,
      codigo,
      total: totals.total,
      itens: lines.map((line) => ({ produto: getProduct(line.input.slug)?.id ?? String(line.groupId), quantidade: line.units, valor: line.total })),
    });
  if (!ordersEnabled()) {
    await trackOrder(`SIM-${Date.now().toString(36)}`);
    return json({ mode: "simulation", payload, quote });
  }

  const key = `${session.id}:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
  const previous = recentOrders.get(key);
  if (previous && Date.now() - previous.at < DUPLICATE_WINDOW_MS) {
    if ("pending" in previous) return fail(409, "Este pedido acabou de ser enviado. Confira em Meus pedidos antes de enviar de novo.", { duplicate: true, checkOrders: true });
    return json({ mode: "order", order: previous.order, quote, duplicate: true });
  }

  rememberOrder(key, { pending: true });
  try {
    const result = await gerarPedido(payload, session.token);
    const order = extractOrderNumber(result);
    rememberOrder(key, { order });
    await trackOrder(order ? `PC-${order}` : `PC-${Date.now().toString(36)}`);
    return json({ mode: "order", order, quote });
  } catch (error) {
    // Só libera a repetição com certeza de que o pedido não foi criado: nada saiu (sem conexão, disjuntor,
    // certificado) ou a API recusou (4xx). Resposta inválida, 5xx, conexão caída ou muda depois de conectar:
    // o pedido pode ter sido criado. Segura a repetição e manda conferir antes.
    const certainlyNotCreated = error instanceof ApiError && (error.reached === false || (error.status >= 400 && error.status < 500));
    if (!certainlyNotCreated) {
      if (!(error instanceof ApiError)) console.error("[pedidos] gerarpedido:", error instanceof Error ? error.message : "erro desconhecido");
      return fail(error instanceof ApiError && error.status === 504 ? 504 : 502, "Não deu para confirmar se o pedido foi criado. Confira em Meus pedidos antes de tentar de novo.", { checkOrders: true });
    }
    recentOrders.delete(key);
    return apiFailure(error, { session: true, fallback: "Não foi possível criar o pedido agora. Nada foi cobrado." });
  }
}
