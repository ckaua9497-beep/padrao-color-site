import { test } from "node:test";
import assert from "node:assert/strict";
import { creditoDisponivel, divisaoDoPagamento } from "./creditos.ts";

test("crédito disponível: saldo menos o bloqueado, nunca negativo", () => {
  assert.equal(creditoDisponivel(134.17, 0), 134.17);
  assert.equal(creditoDisponivel(200, 50.5), 149.5);
  assert.equal(creditoDisponivel(-30, 0), 0, "saldo devedor não vira crédito");
  assert.equal(creditoDisponivel(40, 60), 0);
  assert.equal(creditoDisponivel(null, null), 0);
  assert.equal(creditoDisponivel(Number.NaN, 0), 0);
});

test("créditos pagam tudo quando bastam", () => {
  assert.deepEqual(divisaoDoPagamento(17.6, 134.17, true), { credito: 17.6, restante: 0 });
});

test("créditos que não bastam: o resto vai na outra forma de pagamento", () => {
  assert.deepEqual(divisaoDoPagamento(290.08, 200, true), { credito: 200, restante: 90.08 });
});

test("sem usar os créditos (ou sem crédito), tudo vai na forma escolhida", () => {
  assert.deepEqual(divisaoDoPagamento(290.08, 200, false), { credito: 0, restante: 290.08 });
  assert.deepEqual(divisaoDoPagamento(50, 0, true), { credito: 0, restante: 50 });
});

test("centavos: sem sobra de ponto flutuante", () => {
  assert.deepEqual(divisaoDoPagamento(0.3, 0.1, true), { credito: 0.1, restante: 0.2 });
});
