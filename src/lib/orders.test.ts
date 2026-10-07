import { test } from "node:test";
import assert from "node:assert/strict";
import type { Variation } from "./catalog";
import {
  bundleTitle,
  buildOrderPayload,
  extractOrderNumber,
  isLineError,
  itemJobName,
  orderDelivery,
  orderJobName,
  orderTotals,
  parseOrderRequest,
  priceLine,
  resolveVariationId,
  totalsDiffer,
  type LinePrices,
  type OrderItemInput,
  type PricedLine,
} from "./orders.ts";

const CARDS: Variation[] = [
  { id: 22, p: 65.19, pe: 70.4, q: 1000, d: 3, de: 1, v: { Papel: "Couchê 250g", Formato: "9x5 cm" } },
  { id: 23, p: 80, pe: 0, q: 1000, d: 3, de: null, v: { Papel: "Supremo 300g", Formato: "9x5 cm" } },
];
const BANNER: Variation[] = [{ id: 35, p: 50, pe: 70, q: 1, d: 2, de: 1, v: { Material: "Lona 440g" } }];

const cardPrices: LinePrices = { groupId: 248, variations: CARDS, reseller: false };
const bannerPrices: LinePrices = {
  groupId: 35,
  variations: BANNER,
  customSize: { minWidth: 0.2, maxWidth: 3, minHeight: 0.2, maxHeight: 50, minArea: 0.5, maxArea: 0 },
  reseller: false,
};

function item(overrides: Partial<OrderItemInput> = {}): OrderItemInput {
  return {
    key: "a",
    slug: "248-cartao-de-visita",
    name: "Cartão de Visita",
    groupId: 248,
    variationId: 22,
    quantity: 2,
    options: { Papel: "Couchê 250g", Formato: "9x5 cm", "Texto da arte": "Padaria Pão Quente" },
    artName: "cartao.pdf",
    unitPrice: 65.19,
    ...overrides,
  };
}

function line(input: OrderItemInput, prices: LinePrices): PricedLine {
  const priced = priceLine(input, prices);
  assert.ok(!isLineError(priced), isLineError(priced) ? priced.error : "");
  return priced;
}

test("preço do item: lote da variação × quantidade de lotes", () => {
  const priced = line(item(), cardPrices);
  assert.equal(priced.unitPrice, 65.19);
  assert.equal(priced.lotSize, 1000);
  assert.equal(priced.units, 2000);
  assert.equal(priced.total, 130.38);
  assert.equal(priced.leadDays, 3);
  assert.equal(priced.express, false);
  assert.equal(priced.size, null);
});

test("expresso usa o preço e o prazo expressos; sem preço expresso fica no econômico", () => {
  const express = line(item({ express: true }), cardPrices);
  assert.equal(express.unitPrice, 70.4);
  assert.equal(express.leadDays, 1);
  assert.equal(express.express, true);
  const noExpress = line(item({ variationId: 23, express: true }), cardPrices);
  assert.equal(noExpress.unitPrice, 80);
  assert.equal(noExpress.express, false);
});

test("medida livre: preço por m² × área cobrada (área mínima) e limites do produto", () => {
  const priced = line(item({ key: "b", groupId: 35, variationId: 35, widthCm: 100, heightCm: 80, quantity: 3 }), bannerPrices);
  assert.equal(priced.unitPrice, 40, "0,8 m² × R$ 50");
  assert.equal(priced.total, 120);
  assert.deepEqual(priced.size, { widthCm: 100, heightCm: 80, areaM2: 0.8, billedAreaM2: 0.8 });
  const small = line(item({ key: "c", groupId: 35, variationId: 35, widthCm: 30, heightCm: 30, quantity: 1 }), bannerPrices);
  assert.equal(small.unitPrice, 25, "cobra a área mínima de 0,5 m²");
  const tooWide = priceLine(item({ groupId: 35, variationId: 35, widthCm: 400, heightCm: 100 }), bannerPrices);
  assert.ok(isLineError(tooWide));
  assert.match(tooWide.error, /Largura máxima/);
});

test("variação que sumiu vira erro do item; item antigo acha a variação pelas opções", () => {
  const missing = priceLine(item({ variationId: 999 }), cardPrices);
  assert.ok(isLineError(missing));
  assert.ok(isLineError(priceLine(item(), null)));
  assert.equal(resolveVariationId(CARDS, { Papel: "Supremo 300g", Formato: "9x5 cm" }), 23);
  assert.equal(resolveVariationId(CARDS, { Papel: "Outro" }), undefined);
  const legacy = line(item({ variationId: undefined, options: { "1 - Papel": "x", Papel: "Supremo 300g", Formato: "9x5 cm" } }), cardPrices);
  assert.equal(legacy.variation.id, 23);
});

test("totais: desconto do PIX só no PIX", () => {
  const lines = [{ total: 130.38 }, { total: 120 }];
  assert.deepEqual(orderTotals(lines, "boleto"), { subtotal: 250.38, discount: 0, total: 250.38 });
  assert.deepEqual(orderTotals(lines, "pix"), { subtotal: 250.38, discount: 12.52, total: 237.86 });
  assert.equal(totalsDiffer(237.86, 237.865), false);
  assert.equal(totalsDiffer(237.86, 237.88), true);
});

test("nome do trabalho: texto da arte ou nome do produto, com a contagem de itens", () => {
  assert.equal(itemJobName(item()), "Padaria Pão Quente");
  assert.equal(itemJobName(item({ options: {} })), "Cartão de Visita");
  const a = line(item(), cardPrices);
  const b = line(item({ key: "b", options: {} }), cardPrices);
  assert.equal(orderJobName([a]), "Padaria Pão Quente");
  assert.equal(orderJobName([a, b]), "Padaria Pão Quente + 1 item");
  assert.ok(orderJobName([line(item({ options: { "Texto da arte": "x".repeat(200) } }), cardPrices), b, b]).length <= 60);
});

test("payload do POST /gerarpedido", () => {
  const cards = line(item(), cardPrices);
  const banner = line(item({ key: "b", name: "Banner", groupId: 35, variationId: 35, widthCm: 100, heightCm: 80, quantity: 1, options: {}, artName: null, bundle: { id: "festa-1", name: "Kit Aniversário" } }), bannerPrices);
  const delivery = orderDelivery({ kind: "retirada" }, null);
  assert.ok(delivery);
  const payload = buildOrderPayload({ customerId: 575, lines: [cards, banner], method: "pix", delivery });
  assert.equal(payload.idCliente, 575);
  assert.equal(payload.tipo_compra, "Site");
  assert.equal(payload.nome_trabalho, "Padaria Pão Quente + 1 item");
  assert.deepEqual(payload.pagamento, { tipo: "PIX", forma: "pix", parcelas: 1, valor: 161.86, desconto: 8.52 });
  assert.equal(payload.precoTotal, 161.86, "(130,38 + 40) × 0,95");
  assert.deepEqual(payload.entrega, { tipo: "Retirada", endereco: null });
  assert.deepEqual(payload.produtos[0], {
    idProduto: 22,
    idGrupo: 248,
    descricao: "Cartão de Visita",
    nome_trabalho: "Padaria Pão Quente",
    quantidade: 2000,
    lotes: 2,
    quantidadeLote: 1000,
    expresso: false,
    prazo: 3,
    valorUnitario: 65.19,
    valorTotal: 130.38,
    opcoes: { Papel: "Couchê 250g", Formato: "9x5 cm", "Texto da arte": "Padaria Pão Quente" },
    arte: "cartao.pdf",
    kit: null,
  });
  assert.equal(payload.produtos[1].largura, 100);
  assert.equal(payload.produtos[1].altura, 80);
  assert.equal(payload.produtos[1].area, 0.8);
  assert.equal(payload.produtos[1].arte, null);
  assert.deepEqual(payload.produtos[1].kit, { id: "festa-1", nome: "Kit Aniversário" });
});

test("kit e festa: título do grupo e nome do trabalho da compra", () => {
  const party = { id: "festa-aniversario", name: "Crie Sua Festa" };
  assert.equal(bundleTitle(party, { Festa: "Aniversário", Tema: "Safari" }), "Crie Sua Festa — Aniversário");
  assert.equal(bundleTitle({ id: "kit-casamento", name: "Kit Casamento" }, { Kit: "Kit Casamento" }), "Kit Casamento");
  const a = line(item({ key: "a", bundle: party, options: { Festa: "Aniversário", "Texto da arte": "Ana 5 anos" } }), cardPrices);
  const b = line(item({ key: "b", bundle: party, options: { Festa: "Aniversário" } }), cardPrices);
  assert.equal(orderJobName([a, b]), "Crie Sua Festa — Aniversário", "tudo do mesmo kit/festa");
  assert.equal(orderJobName([a, line(item({ key: "c" }), cardPrices)]), "Ana 5 anos + 1 item");
  const payload = buildOrderPayload({ customerId: 1, lines: [a], method: "boleto", delivery: { tipo: "Retirada", endereco: null } });
  assert.deepEqual(payload.produtos[0].kit, { id: "festa-aniversario", nome: "Crie Sua Festa — Aniversário" });
  assert.equal(payload.produtos[0].nome_trabalho, "Ana 5 anos");
});

test("produto por unidade respeita mínimo e máximo; lote e m² não", () => {
  const pens: LinePrices = { groupId: 9, variations: [{ id: 90, p: 3.5, q: 1, d: 5, v: {} }], reseller: false, limits: { minQty: 8, maxQty: 999 } };
  const ok = line(item({ groupId: 9, variationId: 90, quantity: 8 }), pens);
  assert.equal(ok.units, 8);
  assert.equal(ok.total, 28);
  const few = priceLine(item({ groupId: 9, variationId: 90, quantity: 5 }), pens);
  assert.ok(isLineError(few));
  assert.match(few.error, /mínima: 8 unidades/);
  const many = priceLine(item({ groupId: 9, variationId: 90, quantity: 1000 }), pens);
  assert.ok(isLineError(many));
  assert.match(many.error, /máxima: 999/);
  const apparel = line(item({ groupId: 9, variationId: 90, quantity: 150, options: { Tamanhos: "P×50, M×100" } }), { ...pens, limits: { minQty: 101, maxQty: 999_999 } });
  assert.equal(apparel.units, 150, "grade de vestuário: quantidade = peças");
  assert.ok(isLineError(priceLine(item({ groupId: 9, variationId: 90, quantity: 100 }), { ...pens, limits: { minQty: 101, maxQty: 999_999 } })));
  const packs = line(item({ quantity: 1 }), { ...cardPrices, limits: { minQty: 1000, maxQty: 1000 } });
  assert.equal(packs.units, 1000, "lote de 1000 não confere o mínimo por unidade");
});

test("entrega: endereço do cadastro só quando completo", () => {
  const address = { cep: "25520000", logradouro: "Rua Nicolau Cheven", numero: "255", complemento: "", bairro: "Centro", cidade: "São João de Meriti", estado: "RJ" };
  assert.deepEqual(orderDelivery({ kind: "cadastro" }, address), { tipo: "Entrega", endereco: address });
  assert.equal(orderDelivery({ kind: "cadastro" }, { ...address, cep: "" }), null);
  assert.equal(orderDelivery({ kind: "cadastro" }, null), null);
  assert.deepEqual(orderDelivery({ kind: "outro", address }, null), { tipo: "Entrega", endereco: address });
});

test("entrada do checkout: valida e limpa o que vem do navegador", () => {
  const body = {
    items: [{ ...item(), preview: "data:image/png;base64,xxx", options: { Papel: "Couchê 250g", grande: "y".repeat(500), numero: 3 } }],
    payment: "pix",
    delivery: { kind: "outro", address: { cep: "25520-000", logradouro: "Rua A", numero: "10", bairro: "Centro", cidade: "Rio", estado: "rj" } },
    expectedTotal: 123.45,
  };
  const parsed = parseOrderRequest(body);
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const [first] = parsed.value.items;
  assert.equal("preview" in first, false);
  assert.equal(first.options.grande.length, 300);
  assert.equal("numero" in first.options, false);
  assert.deepEqual(parsed.value.delivery, { kind: "outro", address: { cep: "25520000", logradouro: "Rua A", numero: "10", complemento: "", bairro: "Centro", cidade: "Rio", estado: "RJ" } });

  assert.equal(parseOrderRequest({ ...body, items: [] }).ok, false);
  assert.equal(parseOrderRequest({ ...body, payment: "cheque" }).ok, false);
  assert.equal(parseOrderRequest({ ...body, delivery: { kind: "outro", address: { cep: "1" } } }).ok, false);
  assert.equal(parseOrderRequest({ ...body, items: [{ ...item(), quantity: 0 }] }).ok, false);
  assert.equal(parseOrderRequest({ ...body, items: [{ ...item(), quantity: 1500 }] }).ok, true, "vestuário em grade passa de mil peças");
  assert.equal(parseOrderRequest({ ...body, items: [{ ...item(), quantity: 2.5 }] }).ok, false);
  assert.equal(parseOrderRequest({ ...body, items: [{ ...item(), widthCm: -5 }] }).ok, false);
  assert.equal(parseOrderRequest({ ...body, items: [item(), item()] }).ok, false, "chave repetida");
  assert.equal(parseOrderRequest({ ...body, expectedTotal: "abc" }).ok, false);
  assert.equal(parseOrderRequest(null).ok, false);
});

test("número da compra na resposta do POST /gerarpedido", () => {
  assert.equal(extractOrderNumber({ compra: 12345 }), 12345);
  assert.equal(extractOrderNumber({ Order: "678" }), 678);
  assert.equal(extractOrderNumber({ sucesso: true, dados: { idCompra: 91 } }), 91);
  assert.equal(extractOrderNumber([{ pedido: 5 }]), 5);
  assert.equal(extractOrderNumber({ mensagem: "ok" }), null);
  assert.equal(extractOrderNumber(null), null);
});
