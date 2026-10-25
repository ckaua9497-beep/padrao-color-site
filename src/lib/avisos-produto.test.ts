import { test } from "node:test";
import assert from "node:assert/strict";
import { avisosDoProduto } from "./avisos-produto.ts";

test("backlight avisa que a caixa de luz não vem junto; os outros produtos não têm aviso", () => {
  assert.match(avisosDoProduto(241)[0], /Caixa de luz não inclusa/);
  assert.match(avisosDoProduto(334)[0], /Caixa de luz não inclusa/);
  assert.deepEqual(avisosDoProduto(35), []);
  assert.deepEqual(avisosDoProduto(undefined), []);
});
