import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";
import { buildOrderPayload, extractOrderNumber, isLineError, priceLine, type LinePrices, type OrderItemInput, type PricedLine } from "../orders";
import { productFacts } from "../order-facts";
import { gerarPedido } from "../api/padrao";
import { getProductById, type Product } from "../catalog";
import { orderCode, priceProduct, type PaymentKind } from "./core";
import { cotarFretePadrao, freteApi } from "../frete-api";
import { embalagemDe, nomeFrete, pacotesDoPedido, prazoFrete, type OpcaoFrete } from "../frete";
import { padraoProduction, paymentRates, paymentSettings } from "./config";
import { quoteOrder, type CheckoutRequest, type OrderQuote } from "./pedido";
import { recordOrderEvent } from "./analytics";
import { chargeStatus, createCharge, refundCharge, voidCharge, type ChargeStatus } from "./payments";
import {
  createPedido,
  getPedidoByCodigo,
  listItens,
  markPedidoPago,
  mergePedidoPagamento,
  setPedidoPadrao,
  setPedidoPagamento,
  setPedidoStatus,
  type NewPedidoItem,
  type Pedido,
} from "./repo-vendas";
import type { Loja } from "./repo";
import { baseFactor, lojaItens, type LojaItem } from "./tenant";

/*
 * Fechamento e acompanhamento dos pedidos da multiloja (servidor).
 * 1. Cada item é recalculado duas vezes com a mesma regra do site (priceLine): no preço da loja (o que o cliente
 *    paga) e no preço base (o custo da Padrão). A diferença, menos desconto, frete e taxa, é a comissão.
 * 2. Se o total mudou em relação ao que o cliente viu, o pedido não é criado: volta a cotação nova.
 * 3. O pedido é gravado e a cobrança criada (Pix ou link do cartão). O pagamento confirmado marca "pago".
 */

function linePrices(product: Product, margin: number): LinePrices {
  const priced = priceProduct(product, margin, baseFactor());
  return {
    groupId: product.groupId ?? Number(product.id),
    variations: priced.variations,
    customSize: product.customSize ?? null,
    reseller: false,
    limits: { minQty: Math.max(1, product.minQty ?? 1), maxQty: Math.max(0, product.maxQty ?? 0) },
    orderable: product.source !== "site",
  };
}

export type PricedItem = { line: PricedLine; base: PricedLine; item: LojaItem };

export type PriceResult = { ok: true; items: PricedItem[] } | { ok: false; errors: { key: string; name: string; error: string }[] };

/** Preço de cada item do carrinho na loja (e o custo base). Item que a loja não vende mais vira erro. */
export async function priceCart(loja: Loja, inputs: OrderItemInput[]): Promise<PriceResult> {
  const items = await lojaItens(loja.id, loja.margemPadrao);
  const byGroup = new Map(items.map((i) => [i.product.groupId ?? Number(i.product.id), i]));
  const bySlug = new Map(items.map((i) => [i.product.slug, i]));
  const priced: PricedItem[] = [];
  const errors: { key: string; name: string; error: string }[] = [];
  for (const input of inputs) {
    const item = (input.groupId ? byGroup.get(input.groupId) : undefined) ?? bySlug.get(input.slug);
    if (!item) {
      errors.push({ key: input.key, name: input.name, error: "Este produto não está mais à venda nesta loja. Remova-o do carrinho." });
      continue;
    }
    const line = priceLine(input, linePrices(item.product, item.margin));
    const base = priceLine(input, linePrices(item.product, 0));
    if (isLineError(line)) errors.push(line);
    else if (isLineError(base)) errors.push(base);
    else priced.push({ line, base, item });
  }
  return errors.length ? { ok: false, errors } : { ok: true, items: priced };
}

/** Totais com o custo do frete já cotado (API de frete da Padrão ou, sem ela, o frete fixo da loja). */
export async function quoteFor(loja: Loja, items: PricedItem[], method: PaymentKind, freteCusto: number): Promise<OrderQuote> {
  return quoteOrder(
    items.map(({ line, base }) => ({ total: line.total, baseTotal: base.total })),
    method,
    { custo: freteCusto, gratisAcima: loja.freteGratisAcima },
    await paymentRates(),
  );
}

// ---------------------------------------------------------------------------------- frete

export type FreteCotacao =
  /** Sem a chave da API de frete da Padrão: frete fixo da loja (como antes). */
  | { modo: "fixo"; custo: number }
  /** Formas de entrega da cotação da Padrão (mais barata primeiro) e a escolhida. */
  | { modo: "cotado"; opcoes: OpcaoFrete[]; escolhida: OpcaoFrete; estimado: boolean }
  | { modo: "sem-cep" }
  /** `semMedida`: produtos sem embalagem cadastrada na Padrão (não dá para cotar). */
  | { modo: "erro"; mensagem: string; semMedida: string[] };

/**
 * Frete do carrinho para o CEP pela API de frete da Padrão (o mesmo cálculo do site dela), com a embalagem de cada
 * produto cadastrada na Padrão (a caixa que ela despacha) e o id da variação.
 */
export async function cotarFrete(loja: Loja, items: PricedItem[], cep: string, servicoId: number | null): Promise<FreteCotacao> {
  const api = freteApi();
  if (!api) return { modo: "fixo", custo: loja.freteFixo };
  const destino = cep.replace(/\D/g, "");
  if (destino.length !== 8) return { modo: "sem-cep" };
  const itens = [];
  const semMedida: string[] = [];
  let estimado = false;
  for (const { line, item } of items) {
    const found = embalagemDe(item.product.variations, line.variation.id ?? null);
    if (!found) {
      semMedida.push(item.product.name);
      continue;
    }
    estimado ||= found.estimada;
    itens.push({ id: String(line.variation.id ?? item.product.id), lotes: line.lots, embalagem: found.embalagem });
  }
  if (semMedida.length) return { modo: "erro", mensagem: "Ainda não dá para calcular o frete deste produto pelo site. Finalize pelo WhatsApp da loja.", semMedida };
  const res = await cotarFretePadrao(api, destino, pacotesDoPedido(itens));
  if (!res.ok) return { modo: "erro", mensagem: "Não foi possível calcular o frete agora. Tente de novo em instantes.", semMedida: [] };
  if (!res.opcoes.length) return { modo: "erro", mensagem: "Nenhuma transportadora entrega estes produtos neste CEP.", semMedida: [] };
  const escolhida = res.opcoes.find((o) => o.id === servicoId) ?? res.opcoes[0];
  return { modo: "cotado", opcoes: res.opcoes, escolhida, estimado };
}

/** Custo do frete da cotação (null = ainda não dá para calcular). */
export function custoDoFrete(frete: FreteCotacao): number | null {
  return frete.modo === "fixo" ? frete.custo : frete.modo === "cotado" ? frete.escolhida.preco : null;
}

export type PlaceResult =
  | { ok: true; pedido: Pedido }
  | { ok: false; status: 409; quote: OrderQuote; message: string }
  | { ok: false; status: 422; message: string; errors?: { key: string; name: string; error: string }[] }
  | { ok: false; status: 502; message: string; pedido: Pedido };

export type TrackingIds = { visitante: string; sessao: string } | null;

export async function placeOrder(loja: Loja, request: CheckoutRequest, origin: string, tracking: TrackingIds = null): Promise<PlaceResult> {
  const priced = await priceCart(loja, request.items);
  if (!priced.ok) return { ok: false, status: 422, message: priced.errors[0].error, errors: priced.errors };
  // O frete é cotado de novo aqui: o valor que vale é o do servidor, nunca o que veio do navegador.
  const frete = await cotarFrete(loja, priced.items, request.entrega.cep, request.freteServico);
  if (frete.modo === "erro") return { ok: false, status: 422, message: frete.mensagem };
  if (frete.modo === "sem-cep") return { ok: false, status: 422, message: "Informe o CEP de entrega." };
  const quote = await quoteFor(loja, priced.items, request.pagamento, custoDoFrete(frete) ?? 0);
  if (frete.modo === "cotado" && request.freteServico !== null && frete.escolhida.id !== request.freteServico) {
    return { ok: false, status: 409, quote, message: "A forma de entrega escolhida não está mais disponível. Escolha outra." };
  }
  if (Math.abs(quote.total - request.expectedTotal) > 0.009) {
    return { ok: false, status: 409, quote, message: "O valor do pedido mudou. Confira o novo total antes de continuar." };
  }
  const envio =
    frete.modo === "cotado"
      ? { servico: nomeFrete(frete.escolhida), servicoId: frete.escolhida.id, prazo: prazoFrete(frete.escolhida), custo: quote.freteCusto, gratis: quote.freteGratis }
      : { servico: null, servicoId: null, prazo: null, custo: quote.freteCusto, gratis: quote.freteGratis };

  const codigo = orderCode();
  const token = randomBytes(18).toString("base64url");
  const itens: NewPedidoItem[] = priced.items.map(({ line, base, item }, posicao) => ({
    posicao,
    produtoId: item.product.id,
    grupoId: line.groupId,
    variacaoId: line.variation.id,
    nome: line.name,
    opcoes: line.input.options,
    lotes: line.lots,
    unidades: line.units,
    larguraCm: line.size?.widthCm ?? null,
    alturaCm: line.size?.heightCm ?? null,
    expresso: line.express,
    precoUnitario: line.unitPrice,
    baseUnitario: base.unitPrice,
    total: line.total,
    totalBase: base.total,
    margem: item.margin,
    prazoDias: line.leadDays,
    arteNome: line.input.artName,
  }));
  const pedidoId = await createPedido(
    {
      lojaId: loja.id,
      codigo,
      token,
      cliente: request.cliente,
      entrega: request.entrega,
      formaPagamento: request.pagamento,
      subtotal: quote.subtotal,
      desconto: quote.desconto,
      frete: quote.frete,
      total: quote.total,
      custoBase: quote.custoBase,
      taxaPagamento: quote.taxa,
      comissao: quote.comissao,
      pagamentoProvedor: "",
      ref: request.ref,
      observacoes: request.observacoes,
      sessao: tracking ? `${tracking.visitante}|${tracking.sessao}` : null,
      envio,
    },
    itens,
  );
  await recordOrderEvent("pedido_criado", {
    lojaId: loja.id,
    visitante: tracking?.visitante ?? null,
    sessao: tracking?.sessao ?? null,
    codigo,
    total: quote.total,
    itens: itens.map((i) => ({ produto: i.produtoId, quantidade: i.unidades, valor: i.total })),
  });

  let pedido = (await getPedidoByCodigo(codigo)) as Pedido;
  try {
    const { provider, charge } = await createCharge(request.pagamento, {
      codigo,
      total: quote.total,
      cliente: request.cliente,
      entrega: request.entrega,
      boletoDias: (await paymentSettings()).boletoDias,
      descricao: `Pedido ${codigo} — ${loja.nome}`,
      returnUrl: `${origin}/pedido/${codigo}?t=${token}`,
    });
    await setPedidoPagamento(pedidoId, provider, charge.id, charge.data);
    pedido = (await getPedidoByCodigo(codigo)) as Pedido;
    return { ok: true, pedido };
  } catch (error) {
    console.error("[multiloja] cobrança:", error instanceof Error ? error.message : error);
    return { ok: false, status: 502, message: "O pedido foi registrado, mas a cobrança não abriu. Fale com a loja pelo WhatsApp para pagar.", pedido };
  }
}

/** Token da página do pedido (o link que o cliente recebe), comparado em tempo constante. */
export function tokenMatches(pedido: Pedido, token: string | null | undefined): boolean {
  if (!token) return false;
  const a = Buffer.from(pedido.token);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Pagamento confirmado (webhook, consulta ou simulação): marca "pago" uma vez só, mesmo com o aviso do gateway e a
 * consulta da página chegando juntos (o banco só deixa um dos dois mudar o status).
 */
export async function confirmPayment(pedido: Pedido, autor: string, nota: string): Promise<boolean> {
  if (pedido.status !== "aguardando_pagamento" && pedido.status !== "expirado") return false;
  if (!(await markPedidoPago(pedido.id, autor, nota))) return false;
  const [visitante, sessao] = (pedido.sessao ?? "").split("|");
  await recordOrderEvent("pedido_pago", { lojaId: pedido.lojaId, visitante: visitante || null, sessao: sessao || null, codigo: pedido.codigo, total: pedido.total, itens: [] });
  return true;
}

/** Aplica a situação consultada no provedor: pago (guarda o e2eId do Pix) ou cobrança removida. */
export async function applyChargeStatus(pedido: Pedido, result: ChargeStatus, origem: string): Promise<void> {
  if (result.status === "pago") {
    if (result.e2eId) await mergePedidoPagamento(pedido.id, { e2eId: result.e2eId });
    await confirmPayment(pedido, "pagamento", `Pagamento confirmado (${origem}).`);
  } else if (result.status === "expirado" && pedido.status === "aguardando_pagamento") {
    await setPedidoStatus(pedido.id, "expirado", "pagamento", `A cobrança foi cancelada ou venceu (${origem}).`);
  }
}

// No globalThis: a página do pedido e a rota de consulta são módulos separados, mas o limite vale para os dois.
const checks = globalThis as typeof globalThis & { __multilojaLastCheck?: Map<string, number> };
const lastCheck = (checks.__multilojaLastCheck ??= new Map<string, number>());

/** Confere a cobrança no provedor (no máximo a cada 15 s por pedido) e confirma se já foi paga. */
export async function refreshPayment(pedido: Pedido): Promise<Pedido> {
  if (pedido.status !== "aguardando_pagamento" || !pedido.pagamentoId || !pedido.pagamentoProvedor || pedido.pagamentoProvedor === "simulado") return pedido;
  const now = Date.now();
  if (now - (lastCheck.get(pedido.codigo) ?? 0) < 15_000) return pedido;
  lastCheck.set(pedido.codigo, now);
  try {
    await applyChargeStatus(pedido, await chargeStatus(pedido.pagamentoProvedor, pedido.pagamentoId), "consulta");
  } catch (error) {
    console.error("[multiloja] consulta de pagamento:", error instanceof Error ? error.message : error);
  }
  return (await getPedidoByCodigo(pedido.codigo)) ?? pedido;
}

/** O Pix do pedido já venceu (o cliente pode gerar outro). */
export function pixExpired(pedido: Pedido, now = new Date()): boolean {
  return pedido.formaPagamento === "pix" && Boolean(pedido.pagamento.expiresAt) && new Date(pedido.pagamento.expiresAt as string).getTime() <= now.getTime();
}

/**
 * Nova cobrança para um pedido que ainda não foi pago (Pix vencido, link do cartão expirado ou cobrança que
 * não abriu). Mesmo valor: os itens e os preços do pedido não mudam.
 */
export async function renewCharge(pedido: Pedido, origin: string, lojaNome: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (pedido.status !== "aguardando_pagamento" && pedido.status !== "expirado") return { ok: false, message: "Este pedido não está esperando pagamento." };
  // Antes de trocar a cobrança, confere se a antiga não foi paga nesse meio-tempo.
  if (pedido.pagamentoProvedor && pedido.pagamentoProvedor !== "simulado" && pedido.pagamentoId) {
    const current = await chargeStatus(pedido.pagamentoProvedor, pedido.pagamentoId).catch(() => null);
    if (current?.status === "pago") {
      await applyChargeStatus(pedido, current, "consulta");
      return { ok: true };
    }
  }
  try {
    const { provider, charge } = await createCharge(pedido.formaPagamento, {
      codigo: pedido.codigo,
      total: pedido.total,
      cliente: pedido.cliente,
      entrega: pedido.entrega,
      boletoDias: (await paymentSettings()).boletoDias,
      descricao: `Pedido ${pedido.codigo} — ${lojaNome}`,
      returnUrl: `${origin}/pedido/${pedido.codigo}?t=${pedido.token}`,
    });
    await setPedidoPagamento(pedido.id, provider, charge.id, charge.data);
    if (pedido.status === "expirado") await setPedidoStatus(pedido.id, "aguardando_pagamento", "cliente", "Nova cobrança gerada.");
    return { ok: true };
  } catch (error) {
    console.error("[multiloja] nova cobrança:", error instanceof Error ? error.message : error);
    return { ok: false, message: "Não foi possível gerar a cobrança agora. Tente de novo em instantes." };
  }
}

/** Cancela o pedido e, se já foi pago, pede a devolução (Pix) ou o reembolso (cartão) no gateway que cobrou. */
export async function cancelOrder(pedido: Pedido, autor: string, nota: string): Promise<{ ok: boolean; message: string }> {
  const paid = Boolean(pedido.pagoEm) && pedido.status !== "cancelado";
  if (paid) {
    const refund = await refundCharge(pedido).catch((error) => ({ ok: false as const, message: error instanceof Error ? error.message : "erro na Efí" }));
    if (!refund.ok) return { ok: false, message: `${refund.message} O pedido NÃO foi cancelado.` };
    await mergePedidoPagamento(pedido.id, { refund: refund.message });
    await setPedidoStatus(pedido.id, "cancelado", autor, [nota, refund.message].filter(Boolean).join(" "));
    return { ok: true, message: `Pedido cancelado. ${refund.message}` };
  }
  // Sem pagamento: invalida o Pix/boleto/link em aberto para ninguém pagar depois.
  const voided = await voidCharge(pedido);
  await setPedidoStatus(pedido.id, "cancelado", autor, [nota, voided.ok ? voided.message : `Atenção: ${voided.message}`].filter(Boolean).join(" "));
  return { ok: true, message: `Pedido cancelado (não havia pagamento). ${voided.message}` };
}

// ---------------------------------------------------------------------------------- produção na Padrão

export type ProductionResult = { ok: true; simulated: boolean; numero: string | null; payload: unknown } | { ok: false; message: string };

/**
 * Manda o pedido pago para a produção na API Padrão (POST /gerarpedido) em nome do cliente da multiloja
 * (PADRAO_MULTILOJA_CLIENTE_ID), no preço BASE (o que a Padrão cobra). Sem PADRAO_ORDERS_ENABLED=true, só monta
 * e devolve o payload (simulação), sem chamar a API.
 * Premissa a validar com a Padrão: tipo_compra "Multiloja" e pagamento já recebido pela multiloja.
 */
export async function sendToProduction(pedido: Pedido): Promise<ProductionResult> {
  const { enabled, customerId } = padraoProduction();
  const itens = await listItens(pedido.id);
  const lines: PricedLine[] = [];
  for (const item of itens) {
    const product = getProductById(item.produtoId);
    if (!product) return { ok: false, message: `Produto ${item.nome} não está mais no catálogo.` };
    const input: OrderItemInput = {
      key: String(item.id),
      slug: product.slug,
      name: item.nome,
      groupId: item.grupoId ?? undefined,
      variationId: item.variacaoId ?? undefined,
      quantity: item.lotes,
      ...(item.larguraCm ? { widthCm: item.larguraCm } : {}),
      ...(item.alturaCm ? { heightCm: item.alturaCm } : {}),
      express: item.expresso,
      options: item.opcoes,
      artName: item.arteNome,
      bundle: null,
      unitPrice: item.baseUnitario,
    };
    const line = priceLine(input, linePrices(product, 0));
    if (isLineError(line)) return { ok: false, message: `${item.nome}: ${line.error}` };
    lines.push(line);
  }
  const payload = {
    ...buildOrderPayload({ customerId: customerId ?? 0, lines, method: "cartao", delivery: { tipo: "Entrega", endereco: pedido.entrega }, facts: productFacts }),
    tipo_compra: "Multiloja",
    nome_trabalho: `${pedido.codigo} ${pedido.cliente.nome}`.slice(0, 60),
  };
  if (!enabled || !customerId) {
    await setPedidoStatus(pedido.id, "em_producao", "padrao", "Enviado para produção (simulação: PADRAO_ORDERS_ENABLED desligado).");
    return { ok: true, simulated: true, numero: null, payload };
  }
  try {
    const result = await gerarPedido(payload);
    const numero = extractOrderNumber(result);
    if (numero) await setPedidoPadrao(pedido.id, String(numero));
    await setPedidoStatus(pedido.id, "em_producao", "padrao", numero ? `Pedido ${numero} na Padrão Color.` : "Enviado para produção na Padrão Color.");
    return { ok: true, simulated: false, numero: numero ? String(numero) : null, payload };
  } catch (error) {
    console.error("[multiloja] gerarpedido:", error instanceof Error ? error.message : error);
    return { ok: false, message: "A API da Padrão recusou ou não respondeu. Tente de novo em instantes." };
  }
}
