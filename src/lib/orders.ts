import type { ApiEndereco } from "./api/types";
import type { CustomSize, Variation } from "./catalog";
import { areaQuote, cleanOptionLabel, PIX_DISCOUNT, pixPrice } from "./pricing.ts";
import { isValidCep, isValidUf, onlyDigits } from "./api/validation.ts";

/*
 * Pedido do site para a API (POST /gerarpedido) — mapeamento explícito, tipado e isolado.
 *
 * O PDF só mostra o envelope {idCliente, produtos, pagamento, tipo_compra, nome_trabalho, precoTotal} e remete
 * a um "contrato de pedido fornecido para a integração" que não recebemos. Tudo o que é premissa está aqui,
 * para trocar num lugar só quando o contrato chegar:
 * - produtos[]: um por item do carrinho. idProduto = ID da variação (o "produto" da API), idGrupo = grupo;
 *   quantidade = unidades (lotes × unidades do lote: 2 × "1000 cartões" = 2000); lotes e quantidadeLote vão
 *   separados; valorUnitario = preço de UM lote; valorTotal = valorUnitario × lotes.
 * - Medida livre (m²): largura/altura em cm e area = m² cobrados (respeita a área mínima). A API não calcula
 *   m²: o valor já vem multiplicado pela área.
 * - expresso: true quando o cliente escolheu o prazo expresso (preço "pe" da variação); prazo em dias úteis.
 * - opcoes: as escolhas do produto e o resumo da arte (texto, estilo, fonte…), como no carrinho.
 * - arte: nome do arquivo; o arquivo segue depois por POST /reenviararte. null = "enviar depois".
 * - kit: nome do kit/festa que adicionou o item (Monte Seu Kit / Crie Sua Festa), ou null.
 * - pagamento: {tipo (rótulo no estilo do GET /pedidos, ex. "PIX"), forma, parcelas, valor, desconto}.
 * - entrega: campo a mais (o GET /pedidos devolve entrega_retirada por item; confirmar no contrato).
 * - tipo_compra = "Site" (o GET /pedidos mostra envio "Site" nos pedidos feitos pelo site).
 * - nome_trabalho = texto da arte do primeiro item (ou o nome do produto) + "+ N itens".
 * - precoTotal = soma dos itens no preço do cliente (balcão ou revenda) menos o desconto do PIX.
 * O servidor recalcula tudo a partir da variação: o preço que vem do navegador só serve para comparar.
 */

export type PaymentMethod = "pix" | "cartao" | "boleto";

export const PAYMENT_METHODS: Record<PaymentMethod, { label: string; hint: string; apiType: string }> = {
  pix: { label: "Pix", hint: `Pagamento instantâneo com ${Math.round(PIX_DISCOUNT * 100)}% de desconto`, apiType: "PIX" },
  cartao: { label: "Cartão de crédito", hint: "Pagamento com cartão de crédito", apiType: "Cartão de Crédito" },
  boleto: { label: "Boleto bancário", hint: "Pagamento bancário", apiType: "Boleto Bancário" },
};

export const PURCHASE_TYPE = "Site";

/** Item do carrinho como o checkout manda para o servidor (sem miniaturas). */
export type OrderItemInput = {
  key: string;
  slug: string;
  name: string;
  groupId?: number;
  variationId?: number;
  /** Lotes: quantas vezes a quantidade de tabela (ex.: 2 × 1000 cartões). */
  quantity: number;
  widthCm?: number;
  heightCm?: number;
  express?: boolean;
  options: Record<string, string>;
  artName: string | null;
  bundle?: { id: string; name: string } | null;
  /** Preço de um lote que o cliente viu: só para comparar com o do servidor. */
  unitPrice: number;
};

/** Preços do cliente para um grupo: variações já com o desconto da categoria de revenda, se houver. */
export type LinePrices = {
  groupId: number;
  variations: Variation[];
  customSize?: CustomSize | null;
  reseller: boolean;
  /** Mínimo/máximo de unidades do produto (qtde_minima/qtde_maxima), para produtos vendidos por unidade. */
  limits?: { minQty: number; maxQty: number } | null;
  /** false = produto que a Padrão ainda não tem cadastrado (produto novo do site): não entra no pedido online. */
  orderable?: boolean;
};

export type PricedLine = {
  key: string;
  name: string;
  groupId: number;
  variation: Variation & { id: number };
  input: OrderItemInput;
  express: boolean;
  /** Preço de um lote (já com área, prazo e desconto de revenda). */
  unitPrice: number;
  lotSize: number;
  lots: number;
  units: number;
  total: number;
  leadDays: number | null;
  size: { widthCm: number; heightCm: number; areaM2: number; billedAreaM2: number } | null;
  reseller: boolean;
};

export type LineError = { key: string; name: string; error: string };

/** Produto novo (API própria do site): o pedido é fechado pelo atendimento até a Padrão cadastrar o item. */
export const NEW_PRODUCT_ORDER = "Produto novo: o pedido deste item é fechado pelo atendimento. Remova-o do carrinho e fale com a gente pelo WhatsApp.";

export function isLineError(line: PricedLine | LineError): line is LineError {
  return "error" in line;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Variação pelas opções escolhidas (itens antigos sem variationId). As chaves do carrinho são os rótulos
 * limpos ("Papel"), as da variação vêm numeradas ("1 - Papel").
 */
export function resolveVariationId(variations: Variation[], options: Record<string, string>): number | undefined {
  const candidates = variations.filter((variation) => {
    const keys = Object.keys(variation.v);
    return keys.length > 0 && keys.every((key) => options[cleanOptionLabel(key)] === variation.v[key]);
  });
  return candidates.length === 1 ? candidates[0].id : undefined;
}

/** Preço do item com a tabela do cliente. Erro quando a variação sumiu ou a medida saiu dos limites. */
export function priceLine(input: OrderItemInput, prices: LinePrices | null | undefined): PricedLine | LineError {
  const fail = (error: string): LineError => ({ key: input.key, name: input.name, error });
  if (!prices) return fail("Produto indisponível para compra pelo site. Remova o item ou fale com o atendimento.");
  if (prices.orderable === false) return fail(NEW_PRODUCT_ORDER);
  const variationId = input.variationId ?? resolveVariationId(prices.variations, input.options);
  const variation = variationId ? prices.variations.find((v) => v.id === variationId) : undefined;
  if (!variation || variation.id === undefined) return fail("Esta opção do produto não está mais disponível. Remova o item e escolha de novo.");

  const expressPrice = variation.pe && variation.pe > 0 ? variation.pe : null;
  const express = Boolean(input.express && expressPrice);
  const base = express && expressPrice ? expressPrice : variation.p;
  if (!(base > 0)) return fail("Produto sem preço de tabela. Fale com o atendimento para orçar.");

  let unitPrice = base;
  let size: PricedLine["size"] = null;
  if (input.widthCm !== undefined || input.heightCm !== undefined) {
    const area = areaQuote(base, input.widthCm ?? 0, input.heightCm ?? 0, prices.customSize);
    if (area.error) return fail(area.error);
    unitPrice = area.price;
    size = { widthCm: input.widthCm ?? 0, heightCm: input.heightCm ?? 0, areaM2: area.area, billedAreaM2: area.billedArea };
  }
  unitPrice = round2(unitPrice);
  const lotSize = variation.q || 1;
  // Vendido por unidade (não por lote nem por m²): respeita o mínimo e o máximo do produto.
  const units = input.quantity * lotSize;
  if (!size && lotSize <= 1 && prices.limits) {
    const { minQty, maxQty } = prices.limits;
    if (minQty > 1 && units < minQty) return fail(`Quantidade mínima: ${minQty.toLocaleString("pt-BR")} unidades.`);
    if (maxQty > 0 && units > maxQty) return fail(`Quantidade máxima: ${maxQty.toLocaleString("pt-BR")} unidades. Para mais, escolha a versão para lotes maiores.`);
  }
  return {
    key: input.key,
    name: input.name,
    groupId: prices.groupId,
    variation: { ...variation, id: variation.id },
    input,
    express,
    unitPrice,
    lotSize,
    lots: input.quantity,
    units,
    total: round2(unitPrice * input.quantity),
    leadDays: express ? (variation.de ?? variation.d) : variation.d,
    size,
    reseller: prices.reseller,
  };
}

export type OrderTotals = { subtotal: number; discount: number; total: number };

export function orderTotals(lines: { total: number }[], method: PaymentMethod): OrderTotals {
  const subtotal = round2(lines.reduce((sum, line) => sum + line.total, 0));
  const total = method === "pix" ? pixPrice(subtotal) : subtotal;
  return { subtotal, discount: round2(subtotal - total), total };
}

/** O total mudou mais que um centavo? */
export function totalsDiffer(a: number, b: number): boolean {
  return Math.abs(a - b) > 0.009;
}

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);

/** Título do kit/festa: "Kit Casamento" ou "Crie Sua Festa — Aniversário" (opção "Festa" do item). */
export function bundleTitle(bundle: { id: string; name: string }, options: Record<string, string>): string {
  const party = (options.Festa ?? "").trim();
  return party && !bundle.name.toLowerCase().includes(party.toLowerCase()) ? `${bundle.name} — ${party}` : bundle.name;
}

/** Nome do trabalho do item: o texto da arte, senão o nome do produto. */
export function itemJobName(input: Pick<OrderItemInput, "name" | "options">): string {
  const text = (input.options["Texto da arte"] ?? input.options.Subtexto ?? "").trim();
  return clip(text || input.name, 60);
}

/** Nome do trabalho da compra: o kit/festa quando tudo vem de um só; senão o primeiro item + "+ N itens". */
export function orderJobName(lines: { input: Pick<OrderItemInput, "name" | "options" | "bundle"> }[]): string {
  if (lines.length === 0) return "";
  const first = lines[0].input;
  if (first.bundle && lines.every((line) => line.input.bundle?.id === first.bundle?.id)) return clip(bundleTitle(first.bundle, first.options), 60);
  const rest = lines.length - 1;
  const suffix = rest > 0 ? ` + ${rest} ${rest === 1 ? "item" : "itens"}` : "";
  return clip(itemJobName(lines[0].input), 60 - suffix.length) + suffix;
}

// ---------------------------------------------------------------------------------- entrega

export type DeliveryAddress = { cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; estado: string };

export type DeliveryChoice = { kind: "cadastro" } | { kind: "retirada" } | { kind: "outro"; address: DeliveryAddress };

export type OrderDelivery = { tipo: "Entrega" | "Retirada"; endereco: DeliveryAddress | null };

export function addressProblem(address: DeliveryAddress): string | null {
  if (!isValidCep(address.cep)) return "Informe um CEP válido.";
  if (address.logradouro.trim().length < 3) return "Informe a rua.";
  if (!address.numero.trim()) return "Informe o número (ou S/N).";
  if (address.cidade.trim().length < 2) return "Informe a cidade.";
  if (!isValidUf(address.estado)) return "Informe a UF.";
  return null;
}

/** Endereço do GET /cliente → endereço de entrega; null quando não tem rua. */
export function addressFromApi(endereco: Partial<ApiEndereco> | null | undefined): DeliveryAddress | null {
  if (!endereco?.logradouro?.trim()) return null;
  return {
    cep: onlyDigits(endereco.cep ?? ""),
    logradouro: endereco.logradouro.trim(),
    numero: (endereco.numero ?? "").trim(),
    complemento: (endereco.complemento ?? "").trim(),
    bairro: (endereco.bairro ?? "").trim(),
    cidade: (endereco.cidade ?? "").trim(),
    estado: (endereco.estado ?? "").trim().toUpperCase(),
  };
}

/** Entrega do pedido: endereço do cadastro (GET /cliente), outro endereço ou retirada. */
export function orderDelivery(choice: DeliveryChoice, registered: DeliveryAddress | null): OrderDelivery | null {
  if (choice.kind === "retirada") return { tipo: "Retirada", endereco: null };
  if (choice.kind === "outro") return { tipo: "Entrega", endereco: choice.address };
  return registered && !addressProblem(registered) ? { tipo: "Entrega", endereco: registered } : null;
}

// ---------------------------------------------------------------------------------- payload

export type OrderProduct = {
  idProduto: number;
  idGrupo: number;
  descricao: string;
  nome_trabalho: string;
  /** Unidades: lotes × quantidadeLote. */
  quantidade: number;
  lotes: number;
  quantidadeLote: number;
  /** Medida livre, em cm, e área cobrada em m². */
  largura?: number;
  altura?: number;
  area?: number;
  expresso: boolean;
  prazo: number | null;
  valorUnitario: number;
  valorTotal: number;
  opcoes: Record<string, string>;
  arte: string | null;
  /** Kit/festa que trouxe o item: id do site e título ("Crie Sua Festa — Aniversário"). */
  kit: { id: string; nome: string } | null;
};

export type OrderPayment = { tipo: string; forma: PaymentMethod; parcelas: number; valor: number; desconto: number };

export type OrderPayload = {
  idCliente: number;
  produtos: OrderProduct[];
  pagamento: OrderPayment;
  tipo_compra: string;
  nome_trabalho: string;
  precoTotal: number;
  entrega: OrderDelivery;
};

export function toOrderProduct(line: PricedLine): OrderProduct {
  return {
    idProduto: line.variation.id,
    idGrupo: line.groupId,
    descricao: line.name,
    nome_trabalho: itemJobName(line.input),
    quantidade: line.units,
    lotes: line.lots,
    quantidadeLote: line.lotSize,
    ...(line.size ? { largura: line.size.widthCm, altura: line.size.heightCm, area: line.size.billedAreaM2 } : {}),
    expresso: line.express,
    prazo: line.leadDays,
    valorUnitario: line.unitPrice,
    valorTotal: line.total,
    opcoes: line.input.options,
    arte: line.input.artName,
    kit: line.input.bundle ? { id: line.input.bundle.id, nome: bundleTitle(line.input.bundle, line.input.options) } : null,
  };
}

export function buildOrderPayload({ customerId, lines, method, delivery }: { customerId: number; lines: PricedLine[]; method: PaymentMethod; delivery: OrderDelivery }): OrderPayload {
  const totals = orderTotals(lines, method);
  return {
    idCliente: customerId,
    produtos: lines.map(toOrderProduct),
    pagamento: { tipo: PAYMENT_METHODS[method].apiType, forma: method, parcelas: 1, valor: totals.total, desconto: totals.discount },
    tipo_compra: PURCHASE_TYPE,
    nome_trabalho: orderJobName(lines),
    precoTotal: totals.total,
    entrega: delivery,
  };
}

// ---------------------------------------------------------------------------------- entrada do checkout

export type OrderRequest = { items: OrderItemInput[]; payment: PaymentMethod; delivery: DeliveryChoice; expectedTotal: number };

export const MAX_ORDER_ITEMS = 50;
export const MAX_ITEM_QUANTITY = 100_000;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown, max: number): string | null => (typeof value === "string" ? value.trim().slice(0, max) : null);

function positiveInt(value: unknown): number | undefined {
  const n = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n > 0 && n < 1e9 ? n : undefined;
}

/** Medida em cm: ausente → undefined; inválida → null. */
function measure(value: unknown): number | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 100_000 ? n : null;
}

function parseItem(raw: unknown): OrderItemInput | null {
  if (!isRecord(raw)) return null;
  const key = text(raw.key, 64);
  const name = text(raw.name, 200);
  const quantity = Number(raw.quantity);
  const unitPrice = Number(raw.unitPrice);
  const widthCm = measure(raw.widthCm);
  const heightCm = measure(raw.heightCm);
  // Lotes, peças (m²) ou unidades (vestuário em grade pode passar de mil peças).
  if (!key || !name || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) return null;
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || widthCm === null || heightCm === null) return null;

  const options: Record<string, string> = {};
  if (isRecord(raw.options)) {
    for (const [label, value] of Object.entries(raw.options).slice(0, 40)) {
      if (typeof value === "string" && label.trim()) options[label.trim().slice(0, 80)] = value.trim().slice(0, 300);
    }
  }
  const bundleId = isRecord(raw.bundle) ? text(raw.bundle.id, 64) : null;
  const bundleName = isRecord(raw.bundle) ? text(raw.bundle.name, 120) : null;
  return {
    key,
    slug: text(raw.slug, 200) ?? "",
    name,
    groupId: positiveInt(raw.groupId),
    variationId: positiveInt(raw.variationId),
    quantity,
    ...(widthCm !== undefined ? { widthCm } : {}),
    ...(heightCm !== undefined ? { heightCm } : {}),
    express: raw.express === true,
    options,
    artName: text(raw.artName, 200) || null,
    bundle: bundleId && bundleName ? { id: bundleId, name: bundleName } : null,
    unitPrice,
  };
}

function parseDelivery(raw: unknown): DeliveryChoice | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "cadastro" || raw.kind === "retirada") return { kind: raw.kind };
  if (raw.kind !== "outro" || !isRecord(raw.address)) return null;
  const a = raw.address;
  const address: DeliveryAddress = {
    cep: onlyDigits(text(a.cep, 9) ?? ""),
    logradouro: text(a.logradouro, 120) ?? "",
    numero: text(a.numero, 20) ?? "",
    complemento: text(a.complemento, 80) ?? "",
    bairro: text(a.bairro, 80) ?? "",
    cidade: text(a.cidade, 80) ?? "",
    estado: (text(a.estado, 2) ?? "").toUpperCase(),
  };
  return addressProblem(address) ? null : { kind: "outro", address };
}

/** Valida o corpo do POST /api/pedidos (nada do navegador é confiável). */
export function parseOrderRequest(raw: unknown): { ok: true; value: OrderRequest } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: "Pedido inválido." };
  if (!Array.isArray(raw.items) || raw.items.length === 0) return { ok: false, error: "Seu carrinho está vazio." };
  if (raw.items.length > MAX_ORDER_ITEMS) return { ok: false, error: `O pedido pode ter até ${MAX_ORDER_ITEMS} itens.` };
  const items = raw.items.map(parseItem);
  if (items.some((item) => item === null)) return { ok: false, error: "Há um item inválido no carrinho. Remova e adicione de novo." };
  if (new Set(items.map((item) => item!.key)).size !== items.length) return { ok: false, error: "Há itens repetidos no carrinho." };
  const payment = raw.payment;
  if (payment !== "pix" && payment !== "cartao" && payment !== "boleto") return { ok: false, error: "Escolha a forma de pagamento." };
  const delivery = parseDelivery(raw.delivery);
  if (!delivery) return { ok: false, error: "Confira o endereço de entrega." };
  const expectedTotal = Number(raw.expectedTotal);
  if (!Number.isFinite(expectedTotal) || expectedTotal < 0) return { ok: false, error: "Total do pedido inválido." };
  return { ok: true, value: { items: items as OrderItemInput[], payment, delivery, expectedTotal } };
}

// ---------------------------------------------------------------------------------- resposta da API

const ORDER_KEYS = ["compra", "order", "idcompra", "id_compra", "numero_compra", "pedido", "idpedido", "id_pedido", "numero", "id"];

function asOrderNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d{1,12}$/.test(value.trim())) return Number(value.trim());
  return null;
}

/** Número da compra na resposta do POST /gerarpedido (formato não documentado: procura chaves comuns). */
export function extractOrderNumber(result: unknown, depth = 0): number | null {
  if (Array.isArray(result)) return result.length && depth < 2 ? extractOrderNumber(result[0], depth + 1) : null;
  if (!isRecord(result)) return asOrderNumber(result);
  const entries = Object.entries(result).map(([key, value]) => [key.toLowerCase(), value] as const);
  for (const wanted of ORDER_KEYS) {
    const found = entries.find(([key]) => key === wanted);
    const number = found ? asOrderNumber(found[1]) : null;
    if (number) return number;
  }
  if (depth >= 2) return null;
  for (const [, value] of entries) {
    if (typeof value === "object" && value !== null) {
      const number = extractOrderNumber(value, depth + 1);
      if (number) return number;
    }
  }
  return null;
}
