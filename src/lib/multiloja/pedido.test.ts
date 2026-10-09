import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCheckout, quoteOrder } from "./pedido.ts";

const item = { key: "a1", slug: "248-cartao-de-visita", name: "Cartão de Visita", groupId: 248, variationId: 1, quantity: 1, options: {}, artName: null, unitPrice: 39.42 };
const valid = {
  items: [item],
  cliente: { nome: "Maria da Silva", email: "Maria@Exemplo.com", telefone: "(21) 99999-0000", documento: "529.982.247-25" },
  entrega: { cep: "25520-000", logradouro: "Rua A", numero: "10", complemento: "", bairro: "Centro", cidade: "São João de Meriti", estado: "rj" },
  pagamento: "pix",
  expectedTotal: 37.45,
  ref: "instagram-bio",
  observacoes: "",
};

test("checkout: dados válidos são limpos", () => {
  const result = parseCheckout(valid);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.cliente.email, "maria@exemplo.com");
  assert.equal(result.value.cliente.telefone, "21999990000");
  assert.equal(result.value.cliente.documento, "52998224725");
  assert.equal(result.value.entrega.estado, "RJ");
  assert.equal(result.value.ref, "instagram-bio");
});

test("checkout: recusa o que falta ou não confere", () => {
  assert.equal(parseCheckout({ ...valid, items: [] }).ok, false);
  const doc = parseCheckout({ ...valid, cliente: { ...valid.cliente, documento: "111.111.111-11" } });
  assert.equal(doc.ok === false && doc.field, "documento");
  const name = parseCheckout({ ...valid, cliente: { ...valid.cliente, nome: "Maria" } });
  assert.equal(name.ok === false && name.field, "nome");
  const cep = parseCheckout({ ...valid, entrega: { ...valid.entrega, cep: "123" } });
  assert.equal(cep.ok === false && cep.field, "entrega");
  assert.equal(parseCheckout({ ...valid, pagamento: "boleto" }).ok, true);
  assert.equal(parseCheckout({ ...valid, pagamento: "cheque" }).ok, false);
  // ref fora do formato é ignorada (não derruba o pedido).
  const ref = parseCheckout({ ...valid, ref: "<script>" });
  assert.equal(ref.ok && ref.value.ref, null);
});

test("totais: desconto do PIX, frete e comissão", () => {
  const lines = [{ total: 39.42, baseTotal: 28.16 }];
  const zero = { pct: 0, fixed: 0 };
  const pix = quoteOrder(lines, "pix", { custo: 0, gratisAcima: null }, { pix: zero, boleto: zero, cartao: zero });
  assert.deepEqual(pix, { subtotal: 39.42, desconto: 1.97, frete: 0, freteCusto: 0, freteGratis: false, total: 37.45, custoBase: 28.16, taxa: 0, comissao: 9.29 });
  const card = quoteOrder(lines, "cartao", { custo: 15, gratisAcima: 100 }, { pix: { pct: 1, fixed: 0 }, boleto: zero, cartao: { pct: 5, fixed: 0 } });
  assert.deepEqual(card, { subtotal: 39.42, desconto: 0, frete: 15, freteCusto: 15, freteGratis: false, total: 54.42, custoBase: 28.16, taxa: 2.72, comissao: 8.54 });
});

test("frete grátis do lojista: sai da comissão, só quando ela cobre", () => {
  const zero = { pct: 0, fixed: 0 };
  const rates = { pix: zero, boleto: zero, cartao: zero };
  // Subtotal 200 (base 120), frete cotado 25: grátis acima de 150 → cliente paga 200, comissão 200-120-25 = 55.
  const gratis = quoteOrder([{ total: 200, baseTotal: 120 }], "cartao", { custo: 25, gratisAcima: 150 }, rates);
  assert.deepEqual([gratis.frete, gratis.freteCusto, gratis.freteGratis, gratis.total, gratis.comissao], [0, 25, true, 200, 55]);
  // Margem pequena: comissão 160-150 = 10 não cobre o frete de 25 → o cliente paga o frete.
  const semMargem = quoteOrder([{ total: 160, baseTotal: 150 }], "cartao", { custo: 25, gratisAcima: 150 }, rates);
  assert.deepEqual([semMargem.frete, semMargem.freteGratis, semMargem.total, semMargem.comissao], [25, false, 185, 10]);
  // Abaixo do valor: frete normal.
  assert.equal(quoteOrder([{ total: 100, baseTotal: 60 }], "cartao", { custo: 25, gratisAcima: 150 }, rates).frete, 25);
});
