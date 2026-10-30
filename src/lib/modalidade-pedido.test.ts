import { test } from "node:test";
import assert from "node:assert/strict";
import { isModalidade, modalidadeDoPedido, textoDaModalidade } from "./modalidade-pedido.ts";

test("modalidade pelo envio do GET /pedidos", () => {
  assert.equal(modalidadeDoPedido("Site"), "site");
  assert.equal(modalidadeDoPedido("SITE"), "site");
  assert.equal(modalidadeDoPedido("Loja São João"), "loja");
  assert.equal(modalidadeDoPedido("LOJA SAO JOAO"), "loja");
  assert.equal(modalidadeDoPedido("System Color"), "system");
  assert.equal(modalidadeDoPedido("SystemColor"), "system");
  assert.equal(modalidadeDoPedido("Balcão"), null);
  assert.equal(modalidadeDoPedido(""), null);
  assert.equal(modalidadeDoPedido(undefined), null);
});

test("texto da modalidade: o nome dela ou o envio como veio", () => {
  assert.equal(textoDaModalidade("loja sao joao"), "Loja São João");
  assert.equal(textoDaModalidade("Balcão"), "Balcão");
  assert.equal(textoDaModalidade("  "), null);
});

test("filtro de modalidade só aceita as três", () => {
  assert.ok(isModalidade("site") && isModalidade("loja") && isModalidade("system"));
  assert.ok(!isModalidade("todas") && !isModalidade(""));
});
