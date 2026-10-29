import { createHash } from "node:crypto";
import { ordersEnabled } from "@/lib/api/checkout";
import { apiFailure, fail, json, limits, overLimit, readJsonBody, SESSION_EXPIRED, sessionOr401 } from "@/lib/api/guard";
import { getProduct } from "@/lib/catalog";
import { enviarPedido, pastasDaArte, prepararPedido, selarToken, textoDoErro, type Quote } from "@/lib/fila-pedidos/processar";
import { esperaMinutos } from "@/lib/fila-pedidos/regras";
import { enfileirar } from "@/lib/fila-pedidos/repo";
import { ApiError } from "@/lib/api/client";
import { missingArt, missingTerms, parseOrderRequest, SEM_TIPO_COMPRA, type LineError, type OrderPayload, type OrderRequest, type PricedLine } from "@/lib/orders";
import { clearSession, type Session } from "@/lib/session";
import { recordOrderEvent } from "@/lib/multiloja/analytics";
import { isTrackingId } from "@/lib/multiloja/eventos";

/*
 * POST /api/pedidos — fecha o pedido do checkout.
 * 1. Exige sessão (o POST /gerarpedido precisa do idCliente) e confere o token no GET /cliente.
 * 2. Recalcula cada item no servidor com a tabela do cliente (balcão ou revenda + categoria): o preço que vem
 *    do navegador nunca vale. Se o total mudou, devolve 409 com a nova cotação para o cliente confirmar. Item
 *    personalizado sem arte ou sem o aceite dos termos de envio de arte é recusado (422).
 * 3. Monta o payload (src/lib/orders.ts, via fila-pedidos/processar.ts). PADRAO_ORDERS_ENABLED != "true" →
 *    simulação: devolve o payload e não chama a API. "true" → POST /gerarpedido, com proteção contra pedido
 *    duplicado (duplo clique).
 * 4. Sem conexão com a API (no cliente, nos preços ou no gerarpedido), recusa do gerarpedido ou sem confirmação dele:
 *    o pedido e os arquivos ficam guardados na fila do site (src/lib/fila-pedidos) e o cliente recebe um protocolo
 *    (202). Sem conexão, o servidor reenvia sozinho; recusado ou sem confirmação, a equipe confere no admin antes
 *    (evita pedido em dobro). Sem o código de tipo_compra (PADRAO_TIPO_COMPRA) o POST nem sai e o pedido vai conferir.
 */

const DUPLICATE_WINDOW_MS = 2 * 60_000;
const recentOrders = new Map<string, { at: number; order: number | null } | { at: number; pending: true }>();

function rememberOrder(key: string, value: { order: number | null } | { pending: true }) {
  const now = Date.now();
  for (const [stored, entry] of recentOrders) if (now - entry.at > DUPLICATE_WINDOW_MS) recentOrders.delete(stored);
  recentOrders.set(key, { at: now, ...value });
}

/** Guarda o pedido na fila e responde com o protocolo; null quando nem o banco do site responde. */
async function guardar(session: Session, pedido: OrderRequest, { etapa, motivo, payload, quote, erro }: { etapa: "pendente" | "conferir"; motivo: string; payload: OrderPayload | null; quote: Quote | null; erro: unknown }): Promise<Response | null> {
  try {
    const entrada = await enfileirar({
      clienteId: session.id,
      etapa,
      motivo,
      pedido,
      payload,
      token: selarToken(session.token),
      total: quote?.total ?? pedido.expectedTotal,
      erro: textoDoErro(erro),
      esperaMin: esperaMinutos(1),
    });
    return json({ mode: "queued", protocolo: entrada.protocolo, etapa, quote }, 202);
  } catch (error) {
    console.error("[pedidos] fila:", error instanceof Error ? error.message : "erro desconhecido");
    return null;
  }
}

export async function POST(request: Request) {
  const body = await readJsonBody(request, 256 * 1024);
  if (!body.ok) return body.response;
  const auth = await sessionOr401();
  if (!auth.ok) return auth.response;
  const session = auth.session;
  // Arquivos da arte: só os da pasta pública do Bunny (ou dos guardados no site, quando o Bunny falhou) entram no pedido.
  const parsed = parseOrderRequest(body.data, { artBase: pastasDaArte(new URL(request.url).origin) });
  if (!parsed.ok) return fail(400, parsed.error);
  const blocked = overLimit(limits.orders, `pedido:${session.id}`);
  if (blocked) return blocked;
  const pedido = parsed.value;

  // Sem arte ou sem o aceite dos termos: recusa antes de falar com a API (e nunca vai para a fila assim).
  const semArte = pedido.items.map((item) => missingArt(item) ?? missingTerms(item)).filter((erro): erro is LineError => erro !== null);
  if (semArte.length) return fail(422, "Alguns itens do carrinho precisam de atenção.", { items: semArte });

  const preparo = await prepararPedido(pedido, session);
  if (preparo.tipo === "sessao") {
    await clearSession();
    return fail(401, SESSION_EXPIRED, { session: "expired" });
  }
  if (preparo.tipo === "itens") return fail(422, "Alguns itens do carrinho precisam de atenção.", { items: preparo.items });
  if (preparo.tipo === "precos") return fail(409, "Os preços foram atualizados para a sua conta. Confira o novo total antes de confirmar.", { quote: preparo.quote });
  if (preparo.tipo === "endereco") return fail(400, "Seu cadastro não tem endereço de entrega completo. Informe outro endereço ou escolha a retirada.");
  if (preparo.tipo === "falha") {
    // A API caiu antes do pedido (cliente ou preços): guarda e reenvia quando ela voltar.
    if (preparo.classe === "sem-conexao") {
      const queued = await guardar(session, pedido, { etapa: "pendente", motivo: "sem conexão com a API da Padrão antes do pedido", payload: null, quote: null, erro: preparo.erro });
      if (queued) {
        await trackOrder(request, `FILA-${Date.now().toString(36)}`, pedido.expectedTotal, null);
        return queued;
      }
    }
    return apiFailure(preparo.erro, { session: true, fallback: "Não foi possível confirmar os preços agora. Tente de novo." });
  }

  const { payload, quote, total, lines } = preparo;
  if (!ordersEnabled()) {
    await trackOrder(request, `SIM-${Date.now().toString(36)}`, total, lines);
    return json({ mode: "simulation", payload, quote });
  }

  const key = `${session.id}:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
  const previous = recentOrders.get(key);
  if (previous && Date.now() - previous.at < DUPLICATE_WINDOW_MS) {
    if ("pending" in previous) return fail(409, "Este pedido acabou de ser enviado. Confira em Meus pedidos antes de enviar de novo.", { duplicate: true, checkOrders: true });
    return json({ mode: "order", order: previous.order, quote, duplicate: true });
  }

  rememberOrder(key, { pending: true });
  const envio = await enviarPedido(payload, session.token);
  if (envio.tipo === "criado") {
    rememberOrder(key, { order: envio.numero });
    await trackOrder(request, envio.numero ? `PC-${envio.numero}` : `PC-${Date.now().toString(36)}`, total, lines);
    return json({ mode: "order", order: envio.numero, quote });
  }
  // Recusa (4xx, ou o site sem o código de tipo_compra): nada foi criado. A sessão vencida volta para o login; o resto
  // passou por todas as conferências do site (arte, termos, preço, endereço) e a API só responde "Não foi possível
  // gerar o Pedido!", então o cliente não tem o que corrigir: o pedido fica na fila para a equipe conferir e reenviar.
  if (envio.classe === "recusado") {
    if (envio.erro instanceof ApiError && envio.erro.status === 401) {
      recentOrders.delete(key);
      return apiFailure(envio.erro, { session: true, fallback: "Não foi possível criar o pedido agora. Nada foi cobrado." });
    }
    console.error("[pedidos] gerarpedido recusado:", textoDoErro(envio.erro));
    const queued = await guardar(session, pedido, {
      etapa: "conferir",
      motivo: payload.tipo_compra === null ? SEM_TIPO_COMPRA : "a API da Padrão recusou o pedido",
      payload,
      quote,
      erro: envio.erro,
    });
    if (queued) {
      await trackOrder(request, `FILA-${Date.now().toString(36)}`, total, lines);
      return queued;
    }
    recentOrders.delete(key);
    return apiFailure(envio.erro, { session: true, fallback: "Não foi possível criar o pedido agora. Nada foi cobrado." });
  }
  // Sem conexão (nada saiu): fila com reenvio automático. Sem confirmação (pode ter sido criado): fila para a equipe
  // conferir antes, e a trava de duplicado continua valendo.
  const semConexao = envio.classe === "sem-conexao";
  if (semConexao) recentOrders.delete(key);
  else console.error("[pedidos] gerarpedido sem confirmação:", textoDoErro(envio.erro));
  const queued = await guardar(session, pedido, {
    etapa: semConexao ? "pendente" : "conferir",
    motivo: semConexao ? "sem conexão com a API da Padrão no envio do pedido" : "a API não confirmou se o pedido foi criado",
    payload,
    quote,
    erro: envio.erro,
  });
  if (queued) {
    await trackOrder(request, `FILA-${Date.now().toString(36)}`, total, lines);
    return queued;
  }
  if (semConexao) return apiFailure(envio.erro, { session: true, fallback: "Não foi possível criar o pedido agora. Nada foi cobrado." });
  return fail(502, "Não deu para confirmar se o pedido foi criado. Confira em Meus pedidos antes de tentar de novo.", { checkOrders: true });
}

/** Rastreamento (site da Padrão = loja 0): pedido e itens, ligados à sessão anônima de quem comprou. */
async function trackOrder(request: Request, codigo: string, total: number, lines: PricedLine[] | null) {
  const visitante = request.headers.get("x-pc-visitante");
  const sessaoRastreio = request.headers.get("x-pc-sessao");
  await recordOrderEvent("pedido_criado", {
    lojaId: 0,
    visitante: isTrackingId(visitante) ? visitante : null,
    sessao: isTrackingId(sessaoRastreio) ? sessaoRastreio : null,
    codigo,
    total,
    itens: (lines ?? []).map((line) => ({ produto: getProduct(line.input.slug)?.id ?? String(line.groupId), quantidade: line.units, valor: line.total })),
  });
}
