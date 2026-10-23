import { test } from "node:test";
import assert from "node:assert/strict";
import { acabamentosDa, acabamentosDaLinha, cotarAcabamentos, parseAcabamentosEscolhidos, precoAcabamento, resumoAcabamentos, tabelaDeAcabamentos, type Acabamento } from "./acabamentos.ts";

// Como vêm em GET /produtos (Cartão de Visita, grupo 248).
const API = [
  { id: "1", nome: "Corte Reto", multiplica: "milheiro", prazo: 0, preco: 5, informa_qtde: 0, descricao: "…" },
  { id: "2", nome: "Furo 3mm", multiplica: "milheiro", prazo: 1, preco: 5, informa_qtde: 1 },
  { id: "16", nome: "Laminação Fosca 1/0", multiplica: "unidade", prazo: 1, preco: 0.5, informa_qtde: 0 },
  { id: "30", nome: "Encadernação", multiplica: "não", prazo: 1, preco: "3.50", informa_qtde: 1 },
];

test("acabamentos da linha da API: cobrança, prazo e se pede quantidade", () => {
  const lista = acabamentosDaLinha({ acabamentos: [...API, { id: "", nome: "sem id", preco: 1 }, { id: "9", nome: "sem preço" }] });
  assert.deepEqual(
    lista.map((a) => [a.id, a.cobranca, a.preco, a.prazo, a.qtd]),
    [
      ["1", "milheiro", 5, 0, false],
      ["2", "milheiro", 5, 1, true],
      ["16", "unidade", 0.5, 1, false],
      ["30", "fixo", 3.5, 1, true],
    ],
  );
  assert.deepEqual(acabamentosDaLinha({}), []);
});

test("preço: milheiro (mínimo de um), por unidade, fixo; a quantidade informada multiplica", () => {
  const [corte, furo, laminacao, encadernacao] = acabamentosDaLinha({ acabamentos: API });
  assert.equal(precoAcabamento(corte, 2000), 10, "2 milheiros");
  assert.equal(precoAcabamento(corte, 500), 5, "abaixo de mil cobra um milheiro");
  assert.equal(precoAcabamento(furo, 2000, 2), 20, "2 furos em 2.000 cartões");
  assert.equal(precoAcabamento(laminacao, 300), 150);
  assert.equal(precoAcabamento(encadernacao, 50, 3), 10.5, "fixo × quantidade informada");
  assert.equal(precoAcabamento(corte, 1000, 5), 5, "sem quantidade informada, vale 1");
});

test("cotação: soma preço e prazo; escolha que a variação não aceita invalida", () => {
  const disponiveis = acabamentosDaLinha({ acabamentos: API });
  const cotacao = cotarAcabamentos(disponiveis, [{ id: "2", qtd: 2 }, { id: "16", qtd: 1 }], 1000);
  assert.ok(cotacao);
  assert.equal(cotacao.total, 510, "furo 2 × R$ 5 + laminação 1.000 × R$ 0,50");
  assert.equal(cotacao.prazo, 2);
  assert.equal(resumoAcabamentos(cotacao.itens), "Furo 3mm (2×), Laminação Fosca 1/0");
  assert.deepEqual(cotarAcabamentos(disponiveis, [], 1000), { itens: [], total: 0, prazo: 0 });
  assert.equal(cotarAcabamentos(disponiveis, [{ id: "99", qtd: 1 }], 1000), null);
});

test("tabela do produto: acabamentos distintos e os índices de cada variação", () => {
  const { tabela, indices } = tabelaDeAcabamentos([{ acabamentos: API.slice(0, 2) }, { acabamentos: [] }, { acabamentos: [API[1], { ...API[0], preco: 10 }] }]);
  assert.equal(tabela.length, 3, "Corte Reto a R$ 10 é outro acabamento");
  assert.deepEqual(indices, [[0, 1], [], [1, 2]]);
  const product = { acabamentos: tabela as Acabamento[] };
  assert.deepEqual(acabamentosDa(product, { ac: [1, 2] }).map((a) => a.preco), [5, 10]);
  assert.deepEqual(acabamentosDa(product, {}), []);
});

test("escolhas do navegador: validadas e sem repetir", () => {
  assert.deepEqual(parseAcabamentosEscolhidos([{ id: "2", qtd: 3 }, { id: "2", qtd: 1 }, { id: "x y", qtd: 1 }, { id: "16" }, { id: "30", qtd: 500 }, "lixo"]), [
    { id: "2", qtd: 3 },
    { id: "16", qtd: 1 },
    { id: "30", qtd: 20 },
  ]);
  assert.deepEqual(parseAcabamentosEscolhidos(null), []);
});

test("pedido: o servidor cota os acabamentos pelo catálogo e manda o valor em precoTotalAcabamentos", async () => {
  const { priceLine, toOrderProduct, isLineError } = await import("./orders.ts");
  const tabela = acabamentosDaLinha({ acabamentos: API });
  const prices = { groupId: 248, variations: [{ id: 24, p: 68.15, q: 1000, d: 2, v: { Papel: "Couchê" } }], reseller: false, acabamentos: { tabela, porVariacao: { "24": [1, 2] } } };
  const input = { key: "k", slug: "248-cartao-de-visita", name: "Cartão de Visita", groupId: 248, variationId: 24, quantity: 2, options: { Acabamentos: "texto do navegador" }, artName: null, unitPrice: 68.15, acabamentos: [{ id: "2", qtd: 2 }] };
  const line = priceLine(input, prices);
  assert.ok(!isLineError(line));
  assert.equal(line.acabamentos.total, 20, "2 furos em 2.000 cartões");
  assert.equal(line.total, 156.3, "2 × 68,15 + 20");
  assert.equal(line.leadDays, 3, "2 dias + 1 do furo");
  const product = toOrderProduct(line);
  assert.equal(product.precoTotal, 136.3, "precoTotal do item = só o produto");
  assert.equal(product.precoTotalAcabamentos, 20);
  assert.equal(product.productionTime, 3);
  assert.match(product.desc_trabalho, /Acabamentos: Furo 3mm \(2×\)$/);
  assert.doesNotMatch(product.desc_trabalho, /texto do navegador/);
  const off = priceLine({ ...input, acabamentos: [{ id: "30", qtd: 1 }] }, prices);
  assert.ok(isLineError(off), "acabamento que a variação não aceita");
});
