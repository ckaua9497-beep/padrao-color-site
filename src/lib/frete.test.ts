import { test } from "node:test";
import assert from "node:assert/strict";
import { embalagemDe, nomeFrete, opcoesDeFrete, pacotesDoPedido, prazoFrete, type Embalagem } from "./frete.ts";

const caneca: Embalagem = [0.33, 11, 10, 8, 1];
const cartoes: Embalagem = [1.387, 10.5, 18.5, 9, 1];

test("embalagem: a da variação; sem ela, a mais pesada do produto; sem nenhuma, null", () => {
  const vs = [{ id: 1, em: caneca }, { id: 2 }, { id: 3, em: [0.9, 20, 20, 20, 1] as Embalagem }];
  assert.deepEqual(embalagemDe(vs, 1), { embalagem: caneca, estimada: false });
  assert.deepEqual(embalagemDe(vs, 2), { embalagem: [0.9, 20, 20, 20, 1], estimada: true });
  assert.equal(embalagemDe([{ id: 1 }, { id: 2 }], 1), null);
});

test("produtos da cotação: id da variação, medidas inteiras, volumes pelos lotes por caixa, sem valor declarado", () => {
  const pacotes = pacotesDoPedido([
    { id: "10144", lotes: 3, embalagem: caneca },
    { id: "22", lotes: 2, embalagem: cartoes },
    { id: "5", lotes: 25, embalagem: [0.4, 11, 9, 19, 10] },
  ]);
  assert.deepEqual(pacotes[0], { id: "10144", width: 11, height: 10, length: 8, weight: 0.33, insurance_value: 0, quantity: 3 });
  assert.deepEqual(pacotes[1], { id: "22", width: 11, height: 19, length: 9, weight: 1.387, insurance_value: 0, quantity: 2 }, "1.000 cartões num volume: 2 lotes = 2 volumes");
  assert.equal(pacotes[2].quantity, 3, "25 camisas, 10 por caixa");
});

test("cotação da API de frete da Padrão: serviços com preço e prazo, sem os indisponíveis, mais barata primeiro", () => {
  const raw = {
    environment: "production",
    services: [
      { id: 2, name: "SEDEX", company: { id: 1, name: "Correios" }, price: 13.67, deliveryTime: 2, deliveryRange: { min: 1, max: 3 } },
      { id: 34, name: "Loggi Ponto", company: { id: 14, name: "Loggi" }, price: 12.62, deliveryTime: 4, deliveryRange: { min: 3, max: 5 } },
      { id: 3, name: ".Package", company: { id: 2, name: "Jadlog" }, price: "17.60", deliveryTime: 5 },
    ],
    unavailable: [{ id: 1, name: "PAC", company: { name: "Correios" }, error: "Transportadora não atende este trecho." }],
  };
  const opcoes = opcoesDeFrete(raw);
  assert.deepEqual(
    opcoes.map((o) => [o.id, o.preco, o.prazoMin, o.prazoMax]),
    [
      [34, 12.62, 3, 5],
      [2, 13.67, 1, 3],
      [3, 17.6, 5, 5],
    ],
  );
  assert.equal(nomeFrete(opcoes[0]), "Loggi Ponto");
  assert.equal(nomeFrete(opcoes[1]), "Correios SEDEX");
  assert.equal(prazoFrete(opcoes[0]), "3 a 5 dias úteis");
  assert.equal(prazoFrete({ prazoMin: 1, prazoMax: 1 }), "1 dia útil");
  assert.equal(prazoFrete({ prazoMin: 3, prazoMax: 4 }, 2), "5 a 6 dias úteis");
  // Formato do Melhor Envio (lista) também é lido; resposta sem serviços vira lista vazia.
  assert.equal(opcoesDeFrete([{ id: 1, name: "PAC", custom_price: "23.40", custom_delivery_time: 8, company: { name: "Correios" } }])[0].preco, 23.4);
  assert.deepEqual(opcoesDeFrete({ message: "Unauthenticated." }), []);
  assert.deepEqual(opcoesDeFrete(null), []);
});
