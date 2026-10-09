import { test } from "node:test";
import assert from "node:assert/strict";
import { cartContents, deviceFrom, funnelRates, isBot, parseEventBatch } from "./eventos.ts";

const v = "a1b2c3d4e5f6a7b8c9d0";
const s = "f0e1d2c3b4a5968778695a4b";

test("lote do navegador: só eventos do cliente, campos limpos", () => {
  const batch = parseEventBatch({
    v,
    s,
    e: [
      { t: "visita", path: "/produto/248-cartao?x=1", ref: "instagram-bio" },
      { t: "carrinho_add", p: "248-cartao-de-visita", q: 2, val: 78.84 },
      { t: "pedido_pago", val: 99999 }, // só o servidor grava
      { t: "produto_view", p: "<script>" }, // produto inválido vira null
      { t: "visita", ref: "Ref Ruim" },
    ],
  });
  assert.ok(batch);
  assert.equal(batch.eventos.length, 4);
  assert.equal(batch.eventos[0].caminho, "/produto/248-cartao");
  assert.equal(batch.eventos[0].ref, "instagram-bio");
  assert.deepEqual([batch.eventos[1].produto, batch.eventos[1].quantidade, batch.eventos[1].valor], ["248-cartao-de-visita", 2, 78.84]);
  assert.equal(batch.eventos[2].produto, null);
  assert.equal(batch.eventos[3].ref, null);
  assert.equal(parseEventBatch({ v: "curto", s, e: [] }), null);
  assert.equal(parseEventBatch({ v, s, e: Array(100).fill({ t: "visita" }) })?.eventos.length, 30);
});

test("aparelho e robô pelo User-Agent", () => {
  assert.equal(deviceFrom("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), "celular");
  assert.equal(deviceFrom("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile"), "celular");
  assert.equal(deviceFrom("Mozilla/5.0 (iPad; CPU OS 17_0)"), "tablet");
  assert.equal(deviceFrom("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "computador");
  assert.equal(isBot("Googlebot/2.1"), true);
  assert.equal(isBot("Mozilla/5.0 (Windows NT 10.0)"), false);
});

test("funil e abandono", () => {
  const r = funnelRates({ sessoes: 1000, produto: 600, carrinho: 120, checkout: 60, pedido: 30, pago: 24 });
  assert.equal(r.verProduto, 60);
  assert.equal(r.carrinho, 20);
  assert.equal(r.checkout, 50);
  assert.equal(r.abandonoCarrinho, 75);
  assert.equal(r.abandonoCheckout, 50);
  assert.equal(r.conversao, 2.4);
  assert.equal(funnelRates({ sessoes: 0, produto: 0, carrinho: 0, checkout: 0, pedido: 0, pago: 0 }).abandonoCarrinho, 0);
  // Pedido de quem não é rastreado não passa de 100% na etapa.
  assert.equal(funnelRates({ sessoes: 5, produto: 2, carrinho: 2, checkout: 2, pedido: 3, pago: 3 }).pedido, 100);
});

test("carrinho abandonado: adições menos remoções", () => {
  const items = cartContents([
    { tipo: "carrinho_add", produto: "248", quantidade: 1, valor: 39.42 },
    { tipo: "carrinho_add", produto: "63", quantidade: 2, valor: 131.84 },
    { tipo: "carrinho_remove", produto: "248", quantidade: 1, valor: 39.42 },
  ]);
  assert.deepEqual(items, [{ produto: "63", quantidade: 2, valor: 131.84 }]);
});
