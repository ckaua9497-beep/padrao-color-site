import { test } from "node:test";
import assert from "node:assert/strict";
import { ENTREGA_ROTA, ENTREGA_TRANSPORTADORA, LOJAS_RETIRADA, lojaDoCodigo, lojaRetirada, pagaNaRetiradaPermitido, textoDoCodigoDeEntrega } from "./entrega.ts";

test("7 locais de retirada: 5 lojas próprias e os pontos parceiros de Niterói e Serra-ES", () => {
  assert.equal(LOJAS_RETIRADA.length, 7);
  assert.deepEqual(
    LOJAS_RETIRADA.filter((loja) => loja.parceira).map((loja) => loja.nome),
    ["Loja Niterói", "Loja Serra - ES"],
  );
  assert.equal(new Set(LOJAS_RETIRADA.map((loja) => loja.id)).size, 7);
  assert.equal(lojaRetirada(3)?.nome, "Loja São João");
  assert.equal(lojaRetirada(99), null);
  assert.equal(LOJAS_RETIRADA[0].nome, "Loja São João", "a primeira (já marcada), como no site antigo");
});

test("códigos de entrega da Padrão (05/11/2026): S rota, F transportadora e uma letra por loja", () => {
  const todos = [ENTREGA_ROTA, ENTREGA_TRANSPORTADORA, ...LOJAS_RETIRADA.map((loja) => loja.codigo)];
  assert.deepEqual([...todos].sort(), ["A", "F", "J", "N", "P", "S", "T", "V", "Z"]);
  assert.equal(lojaDoCodigo("A")?.nome, "Loja Alcântara - RJ");
  assert.equal(lojaDoCodigo("T")?.parceira, true, "T = Balcão de Niterói");
  assert.equal(lojaDoCodigo("V")?.parceira, true, "V = Balcão de Vitória-ES (o ponto da Serra)");
  assert.equal(lojaDoCodigo("S"), null);
  assert.equal(textoDoCodigoDeEntrega("S"), "Delivery Padrão");
  assert.equal(textoDoCodigoDeEntrega("F"), "Frete por transportadora");
  assert.equal(textoDoCodigoDeEntrega("Z"), "Retirada na Loja Juiz de Fora - MG");
});

test("pagamento na retirada: com a liberação, no Delivery Padrão ou numa loja própria", () => {
  assert.equal(pagaNaRetiradaPermitido({ liberado: true, modo: "rota" }), true);
  assert.equal(pagaNaRetiradaPermitido({ liberado: true, modo: "retirada", loja: 2 }), true);
  assert.equal(pagaNaRetiradaPermitido({ liberado: true, modo: "retirada", loja: 6 }), false, "Niterói é ponto parceiro");
  assert.equal(pagaNaRetiradaPermitido({ liberado: true, modo: "retirada", loja: 7 }), false, "Serra-ES é ponto parceiro");
  assert.equal(pagaNaRetiradaPermitido({ liberado: true, modo: "transportadora" }), false);
  assert.equal(pagaNaRetiradaPermitido({ liberado: false, modo: "rota" }), false);
});
