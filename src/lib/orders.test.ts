import { test } from "node:test";
import assert from "node:assert/strict";
import type { Variation } from "./catalog";
import type { RotaDoCliente } from "./cliente";
import {
  bundleTitle,
  buildOrderPayload,
  orderForecast,
  paymentProblem,
  SEM_ENDERECO,
  extractOrderNumber,
  isLineError,
  itemJobName,
  orderDelivery,
  orderJobName,
  orderTotal,
  missingArt,
  MISSING_ART,
  parseOrderRequest,
  priceLine,
  resolveVariationId,
  tipoCompraDe,
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
  assert.deepEqual(priced.size, { widthCm: 100, heightCm: 80, areaM2: 0.8, billedAreaM2: 0.8, billedTotalM2: 2.4 });
  assert.equal(priced.productTotal, 120);
  // Uma peça pequena: a peça cobra 0,5 m² (área mínima da API) e o item, 1 m² (revisão da Padrão de 25/10/2026).
  const small = line(item({ key: "c", groupId: 35, variationId: 35, widthCm: 30, heightCm: 30, quantity: 1 }), bannerPrices);
  assert.equal(small.unitPrice, 50, "mínimo de 1 m² no item");
  assert.equal(small.size?.billedTotalM2, 1);
  // Três peças pequenas: 3 × 0,5 m² = 1,5 m² passa do mínimo do item.
  const three = line(item({ key: "d", groupId: 35, variationId: 35, widthCm: 30, heightCm: 30, quantity: 3 }), bannerPrices);
  assert.equal(three.productTotal, 75);
  assert.equal(three.unitPrice, 25);
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

test("loja principal: item sem arte volta para a página do produto", () => {
  assert.equal(missingArt(item()), null);
  assert.equal(missingArt(item({ artName: "produto sem impressão" })), null);
  assert.deepEqual(missingArt(item({ artName: null })), { key: "a", name: "Cartão de Visita", error: MISSING_ART });
});

test("total: a soma dos itens, sem desconto no PIX", () => {
  assert.equal(orderTotal([{ total: 130.38 }, { total: 120 }]), 250.38);
  assert.equal(orderTotal([{ total: 0.1 }, { total: 0.2 }]), 0.3, "em centavos");
  assert.equal(totalsDiffer(237.86, 237.865), false);
  assert.equal(totalsDiffer(237.86, 237.88), true);
});

test("criação de arte: o preço da variação entra uma vez no item e vai em arte.preco com arte.tipo 2", () => {
  const prices: LinePrices = { ...cardPrices, criacao: { "22": 44.9 } };
  const priced = line(item({ criacaoArte: true, options: { "Criação da arte": "Logo no centro", "Nome da arte": "Cartão Padaria", Observação: "Cores da marca" } }), prices);
  assert.equal(priced.criacao, 44.9);
  assert.equal(priced.total, 175.28, "130,38 + 44,90");
  const product = buildOrderPayload({ customerId: 1, lines: [priced], method: "pix", delivery: { tipo: "Retirada", endereco: null }, now: new Date("2026-10-09T11:31:49Z") }).produtos[0];
  assert.deepEqual({ tipo: product.arte.tipo, preco: product.arte.preco }, { tipo: 2, preco: 44.9 });
  assert.equal(product.nome_trabalho, "Cartão Padaria");
  assert.equal(product.descricao, "Cores da marca");
  assert.ok(!product.desc_trabalho.includes("Cores da marca"), "a observação não se repete na descrição do trabalho");
  // Variação sem criação: erro do item (o navegador não escolhe o preço).
  const semCriacao = priceLine(item({ variationId: 23, criacaoArte: true }), prices);
  assert.ok(isLineError(semCriacao));
  assert.equal(line(item(), prices).criacao, 0);
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

const CDN = "https://padrao-color.b-cdn.net/uploads-clientes/";

test("payload do POST /gerarpedido no formato do pedido da Padrão", () => {
  const files = [
    { url: `${CDN}cartao1791545356518.pdf`, nome: "cartao1791545356518.pdf", kind: "arquivo" as const },
    { url: `${CDN}cartaogabarito1791545356600.pdf`, nome: "cartaogabarito1791545356600.pdf", kind: "pdf" as const },
  ];
  const cards = line(item({ files }), cardPrices);
  const banner = line(item({ key: "b", name: "Banner", groupId: 35, variationId: 35, widthCm: 100, heightCm: 80, quantity: 1, options: {}, artName: null, bundle: { id: "festa-1", name: "Kit Aniversário" } }), bannerPrices);
  const delivery = orderDelivery({ kind: "retirada", loja: 1 }, { registered: null, rota: { tipo: "transportadora" } });
  assert.ok(typeof delivery !== "string");
  const facts = (l: PricedLine) =>
    l.groupId === 248
      ? { image: "https://img.padraocolor.com.br/cartao.webp", categoryId: 3, packaging: [0.5, 10, 5, 12, 2] as const, attachments: ["Impressão Frente", "Impressão Verso"] }
      : null;
  // 09/10/2026, 08:31:49 em Brasília (11:31:49 UTC).
  const payload = buildOrderPayload({ customerId: 575, lines: [cards, banner], method: "pix", delivery, facts, tipoCompra: 7, now: new Date("2026-10-09T11:31:49Z") });
  assert.equal(payload.data, "09/10/2026");
  assert.equal(payload.hora, "08:31:49");
  assert.equal(payload.previsao, "15/10/2026", "maior prazo (3 d.u.) a partir de sexta, sem o feriado de 12/10");
  const posFeriado = buildOrderPayload({ customerId: 575, lines: [cards, banner], method: "pix", delivery, facts, holidays: new Set(["2026-10-12", "2026-10-13"]), now: new Date("2026-10-09T11:31:49Z") });
  assert.equal(posFeriado.previsao, "16/10/2026", "os feriados da API entram no prazo");
  assert.equal(payload.idCliente, 575);
  assert.equal(payload.tipo_compra, 7, "inteiro: a API recusa texto em tipo_compra");
  assert.equal(payload.envio, "Site", "o canal vai em envio, como no GET /pedidos");
  assert.equal(payload.nome_trabalho, "Padaria Pão Quente + 1 item");
  assert.deepEqual(payload.pagamento, { tipo: "PIX", valor: 180.38, status: 0, forma: "pix", parcelas: 1 });
  assert.equal(payload.precoTotal, 180.38, "130,38 + 50 (banner de 0,8 m² cobra o mínimo de 1 m²), sem desconto no PIX");
  assert.deepEqual(payload.entrega, { tipo: "Retirada", endereco: null, loja: { id: 1, nome: "Loja Alcântara - RJ" }, frete: 0 });
  assert.equal(payload.frete, 0, "retirada nunca cobra frete");
  assert.deepEqual(payload.produtos[0], {
    id: 22,
    groupId: 248,
    groupCategoryId: 3,
    productName: "Cartão de Visita",
    productImage: "https://img.padraocolor.com.br/cartao.webp",
    productType: 0,
    quantidade: 2,
    price: 65.19,
    precoTotal: 130.38,
    variations: { Papel: "Couchê 250g", Formato: "9x5 cm" },
    descricao: "",
    nomeTrabalho: "Padaria Pão Quente",
    nome_trabalho: "Padaria Pão Quente",
    desc_trabalho: "Arte: cartao.pdf · Texto da arte: Padaria Pão Quente",
    tipoProducao: "economico",
    productionTime: 3,
    package: { peso: 0.5, altura: 5, largura: 10, comprimento: 12 },
    arte: {
      tipo: 1,
      preco: 0,
      anexos: [
        { url: `${CDN}cartaogabarito1791545356600.pdf`, nome: "cartaogabarito1791545356600.pdf", tipoArquivo: "Impressão Frente" },
        { url: `${CDN}cartao1791545356518.pdf`, nome: "cartao1791545356518.pdf", tipoArquivo: "Impressão Frente" },
      ],
    },
    tratamentoArquivo: { tipo: "Padrão", preco: 0 },
    precoTotalAcabamentos: 0,
    unidades: 2000,
    kit: null,
  });
  const second = payload.produtos[1];
  assert.equal(second.largura, 100);
  assert.equal(second.altura, 80);
  assert.equal(second.area, 0.8);
  assert.equal(second.package, null);
  assert.deepEqual(second.arte, { tipo: 1, preco: 0, anexos: [] });
  assert.equal(second.desc_trabalho, "Arte: enviar depois");
  assert.deepEqual(second.kit, { id: "festa-1", nome: "Kit Aniversário" });

  // Sem o código da Padrão, tipo_compra fica null (o pedido não sai: fila-pedidos/processar.ts).
  assert.equal(buildOrderPayload({ customerId: 575, lines: [cards], method: "pix", delivery }).tipo_compra, null);
});

test("tipo_compra do ambiente: só inteiro positivo", () => {
  assert.equal(tipoCompraDe("3"), 3);
  assert.equal(tipoCompraDe(" 12 "), 12);
  for (const valor of [undefined, "", "Site", "0", "-1", "1.5", "2a", "1e3"]) assert.equal(tipoCompraDe(valor), null, String(valor));
});

test("créditos Padrão Color no pedido: parte do total ou o pedido inteiro", () => {
  const cards = line(item(), cardPrices);
  const delivery = orderDelivery({ kind: "retirada", loja: 1 }, { registered: null, rota: { tipo: "transportadora" } });
  assert.ok(typeof delivery !== "string");
  const sem = buildOrderPayload({ customerId: 575, lines: [cards], method: "pix", delivery });
  assert.equal(sem.credito_usado, 0);
  assert.deepEqual(sem.pagamento, { tipo: "PIX", valor: 130.38, status: 0, forma: "pix", parcelas: 1 });

  const parte = buildOrderPayload({ customerId: 575, lines: [cards], method: "cartao", delivery, credito: 100 });
  assert.equal(parte.credito_usado, 100);
  assert.equal(parte.precoTotal, 130.38, "o total não muda: o crédito é forma de pagamento");
  assert.deepEqual(parte.pagamento, { tipo: "Cartão de Crédito", valor: 30.38, status: 0, forma: "cartao", parcelas: 1, credito: 100 });

  const tudo = buildOrderPayload({ customerId: 575, lines: [cards], method: "pix", delivery, credito: 500 });
  assert.equal(tudo.credito_usado, 130.38, "nunca mais que o total");
  assert.deepEqual(tudo.pagamento, { tipo: "Crédito", valor: 0, status: 0, forma: "credito", parcelas: 1, credito: 130.38 });
});

test("entrada do checkout: usarCredito só com true", () => {
  const base = { items: [{ key: "a", slug: "248-cartao-de-visita", name: "Cartão", groupId: 248, variationId: 22, quantity: 1, options: {}, artName: "x.pdf", unitPrice: 65.19 }], payment: "pix", delivery: { kind: "retirada", loja: 1 }, expectedTotal: 65.19 };
  const com = parseOrderRequest({ ...base, usarCredito: true });
  const sem = parseOrderRequest({ ...base, usarCredito: "sim" });
  assert.ok(com.ok && sem.ok);
  assert.equal(com.ok && com.value.usarCredito, true);
  assert.equal(sem.ok && sem.value.usarCredito, undefined);
});

test("arquivos da arte no pedido: só os da pasta pública do Bunny", () => {
  const raw = {
    items: [
      {
        key: "a",
        slug: "s",
        name: "Banner",
        quantity: 1,
        unitPrice: 10,
        options: {},
        files: [
          { url: `${CDN}banner1791545356518.jpg`, nome: "banner1791545356518.jpg", kind: "arquivo" },
          { url: "https://golpe.example/banner1.jpg", nome: "banner1.jpg", kind: "arquivo" },
        ],
      },
    ],
    payment: "pix",
    delivery: { kind: "retirada" },
    expectedTotal: 10,
  };
  const parsed = parseOrderRequest(raw, { artBase: CDN });
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.value.items[0].files, [{ url: `${CDN}banner1791545356518.jpg`, nome: "banner1791545356518.jpg", kind: "arquivo" }]);
  const without = parseOrderRequest(raw);
  assert.ok(without.ok);
  assert.deepEqual(without.value.items[0].files, [], "sem Bunny configurado, nenhum link entra");
});

test("previsão do pedido: maior prazo em dias úteis, contando de hoje só até as 18h", () => {
  const manha = (iso: string) => ({ iso, hora: "10:00:00" });
  assert.equal(orderForecast(manha("2026-12-24"), [2, null, 1]), "29/12/2026", "Natal na sexta e o fim de semana ficam de fora");
  assert.equal(orderForecast(manha("2026-12-30"), [3]), "05/01/2027", "virada do ano com o feriado de 1º de janeiro");
  assert.equal(orderForecast(manha("2026-10-09"), [null]), null);
  assert.equal(orderForecast({ iso: "2026-10-09", hora: "17:59:59" }, [1]), "13/10/2026", "sexta antes das 18h + 1 d.u., com o feriado na segunda");
  assert.equal(orderForecast({ iso: "2026-10-09", hora: "18:00:00" }, [1]), "14/10/2026", "sexta às 18h conta como terça (12/10 é feriado)");
  assert.equal(orderForecast(manha("2026-10-10"), [1]), "14/10/2026", "sábado conta como o próximo dia útil");
  const semFeriado = new Set<string>();
  assert.equal(orderForecast({ iso: "2026-10-09", hora: "18:30:00" }, [1], semFeriado), "13/10/2026", "a lista da API manda: sem 12/10 nela, segunda é dia útil");
  assert.equal(orderForecast(manha("2026-10-13"), [2], new Set(["2026-10-14"])), "16/10/2026", "dia cadastrado na lista (mesmo sem ser feriado) não conta");
});

test("kit e festa: título do grupo e nome do trabalho da compra", () => {
  const party = { id: "festa-aniversario", name: "Crie Sua Festa" };
  assert.equal(bundleTitle(party, { Festa: "Aniversário", Tema: "Safari" }), "Crie Sua Festa — Aniversário");
  assert.equal(bundleTitle({ id: "kit-casamento", name: "Kit Casamento" }, { Kit: "Kit Casamento" }), "Kit Casamento");
  const a = line(item({ key: "a", bundle: party, options: { Festa: "Aniversário", "Texto da arte": "Ana 5 anos" } }), cardPrices);
  const b = line(item({ key: "b", bundle: party, options: { Festa: "Aniversário" } }), cardPrices);
  assert.equal(orderJobName([a, b]), "Crie Sua Festa — Aniversário", "tudo do mesmo kit/festa");
  assert.equal(orderJobName([a, line(item({ key: "c" }), cardPrices)]), "Ana 5 anos + 1 item");
  const payload = buildOrderPayload({ customerId: 1, lines: [a], method: "cartao", delivery: { tipo: "Retirada", endereco: null } });
  assert.deepEqual(payload.produtos[0].kit, { id: "festa-aniversario", nome: "Crie Sua Festa — Aniversário" });
  assert.equal(payload.produtos[0].nome_trabalho, "Ana 5 anos");
  assert.match(payload.produtos[0].desc_trabalho, /Festa: Aniversário/);
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

test("faixa da variação vale no lugar da do produto (Caderno \"De 11 até 100\")", () => {
  const notebooks: LinePrices = {
    groupId: 197,
    variations: [
      { id: 1, p: 64.47, q: 1, d: 11, v: {} },
      { id: 2, p: 57.88, q: 1, d: 11, v: {}, mn: 11, mx: 100 },
    ],
    reseller: false,
    limits: { minQty: 1, maxQty: 10 },
  };
  assert.equal(line(item({ groupId: 197, variationId: 2, quantity: 25 }), notebooks).total, 1447);
  const below = priceLine(item({ groupId: 197, variationId: 2, quantity: 5 }), notebooks);
  assert.ok(isLineError(below));
  assert.match(below.error, /mínima: 11/);
  assert.ok(isLineError(priceLine(item({ groupId: 197, variationId: 1, quantity: 25 }), notebooks)), "faixa de 1 a 10 não leva 25");
});

const ENDERECO = { cep: "25520000", logradouro: "Rua Nicolau Cheven", numero: "255", complemento: "", bairro: "Centro", cidade: "São João de Meriti", estado: "RJ" };
const VERDE: RotaDoCliente = { tipo: "rota", nome: "Rota Verde", cor: "#2e9e44", taxa: 17, cobradaNoPedido: true };

test("Delivery Padrão: no endereço do cadastro, pela rota, com a taxa como frete (sem pagamento na retirada)", () => {
  assert.deepEqual(orderDelivery({ kind: "rota" }, { registered: ENDERECO, rota: VERDE }), {
    tipo: "Delivery Padrão",
    endereco: ENDERECO,
    rota: { nome: "Rota Verde", taxa: 17, cobrada: true },
    frete: 17,
  });
  const naEntrega = orderDelivery({ kind: "rota" }, { registered: ENDERECO, rota: { ...VERDE, cobradaNoPedido: false } });
  assert.equal(typeof naEntrega !== "string" && naEntrega.frete, 0, "pagamento na retirada liberado: a taxa não entra no pedido");
  assert.match(orderDelivery({ kind: "rota" }, { registered: ENDERECO, rota: { tipo: "transportadora" } }) as string, /não tem rota/);
  assert.equal(orderDelivery({ kind: "rota" }, { registered: { ...ENDERECO, cep: "" }, rota: VERDE }), SEM_ENDERECO);
});

test("retirada: loja escolhida e sem frete; pedido antigo sem loja vai para São João de Meriti", () => {
  assert.deepEqual(orderDelivery({ kind: "retirada", loja: 6 }, { registered: null, rota: VERDE }), { tipo: "Retirada", endereco: null, loja: { id: 6, nome: "Loja Niterói" }, frete: 0 });
  const antiga = orderDelivery({ kind: "retirada" }, { registered: null, rota: VERDE });
  assert.equal(typeof antiga !== "string" && antiga.loja?.nome, "Loja São João");
  assert.equal(orderDelivery({ kind: "retirada", loja: 99 }, { registered: null, rota: VERDE }), "Escolha a loja de retirada.");
});

test("transportadora: cobra o serviço cotado agora; sem cotação, frete combinado", () => {
  const sedex = { id: 2, preco: 10.16, nome: "Correios SEDEX", prazo: "1 a 3 dias úteis" };
  assert.deepEqual(orderDelivery({ kind: "transportadora", address: null, servico: 2 }, { registered: ENDERECO, rota: VERDE, transportadora: sedex }), {
    tipo: "Transportadora",
    endereco: ENDERECO,
    transportadora: { servico: 2, nome: "Correios SEDEX", prazo: "1 a 3 dias úteis" },
    frete: 10.16,
  });
  assert.match(orderDelivery({ kind: "transportadora", address: null, servico: 2 }, { registered: ENDERECO, rota: VERDE, transportadora: null }) as string, /não está mais disponível/);
  const combinado = orderDelivery({ kind: "transportadora", address: { ...ENDERECO, cep: "01001000" }, servico: null }, { registered: null, rota: { tipo: "transportadora" } });
  assert.deepEqual(combinado, { tipo: "Transportadora", endereco: { ...ENDERECO, cep: "01001000" }, transportadora: null, frete: 0 });
  assert.equal(orderDelivery({ kind: "transportadora", address: null, servico: null }, { registered: null, rota: VERDE }), SEM_ENDERECO);
});

test("frete entra no total do pedido e no pagamento", () => {
  const cards = line(item(), cardPrices);
  const payload = buildOrderPayload({ customerId: 1, lines: [cards], method: "pix", delivery: { tipo: "Delivery Padrão", endereco: ENDERECO, rota: { nome: "Rota Verde", taxa: 17, cobrada: true }, frete: 17 } });
  assert.equal(payload.frete, 17);
  assert.equal(payload.precoTotal, Math.round((cards.total + 17) * 100) / 100);
  assert.equal(payload.pagamento.valor, payload.precoTotal);
});

test("pagar na retirada: só com a liberação, no Delivery Padrão ou numa loja própria", () => {
  assert.equal(paymentProblem("retirada", { kind: "rota" }, true), null);
  assert.equal(paymentProblem("retirada", { kind: "retirada", loja: 1 }, true), null, "loja própria");
  assert.match(paymentProblem("retirada", { kind: "retirada", loja: 7 }, true) ?? "", /não vale/, "Serra-ES é ponto parceiro");
  assert.match(paymentProblem("retirada", { kind: "transportadora", address: null, servico: 1 }, true) ?? "", /não vale/);
  assert.match(paymentProblem("retirada", { kind: "rota" }, false) ?? "", /não vale/, "sem a liberação no cadastro");
  assert.equal(paymentProblem("pix", { kind: "retirada", loja: 7 }, false), null);
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
  // Entrega nova: rota, loja de retirada e transportadora (endereço do cadastro = null, serviço da cotação).
  const de = (delivery: unknown) => {
    const r = parseOrderRequest({ ...body, delivery });
    return r.ok ? r.value.delivery : null;
  };
  assert.deepEqual(de({ kind: "rota" }), { kind: "rota" });
  assert.deepEqual(de({ kind: "retirada", loja: 7 }), { kind: "retirada", loja: 7 });
  assert.deepEqual(de({ kind: "retirada" }), { kind: "retirada", loja: 3 }, "sem loja: São João de Meriti");
  assert.equal(de({ kind: "retirada", loja: 42 }), null);
  assert.deepEqual(de({ kind: "transportadora", address: null, servico: 2 }), { kind: "transportadora", address: null, servico: 2 });
  assert.deepEqual(de({ kind: "transportadora", address: null, servico: null }), { kind: "transportadora", address: null, servico: null });
  assert.equal(de({ kind: "transportadora", address: { cep: "1" }, servico: 2 }), null, "outro endereço incompleto");
  assert.equal(parseOrderRequest({ ...body, payment: "boleto" }).ok, false, "sem boleto");
  assert.equal(parseOrderRequest({ ...body, payment: "retirada" }).ok, true);
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
