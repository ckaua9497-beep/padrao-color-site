import { test } from "node:test";
import assert from "node:assert/strict";
import { destinoDoVerniz, tiposDoVerniz, vernizResumo } from "./verniz.ts";

test("máscara de frente e verso separadas quando a variação tem, senão um arquivo só", () => {
  // Cartão de visita com verniz local: aceita os três; vão frente e verso separados.
  assert.deepEqual(destinoDoVerniz(["Arquivo Único", "Impressão Frente", "Impressão Verso", "Verniz Local Frente", "Verniz Local Verso", "Verniz Localizado"]), { juntos: false, frente: "Verniz Local Frente", verso: "Verniz Local Verso" });
  // Adesivo e quadro com LED: só a frente.
  assert.deepEqual(destinoDoVerniz(["Arquivo Único", "Verniz Local Frente"]), { juntos: false, frente: "Verniz Local Frente", verso: null });
  // Lona e banner: um arquivo só.
  assert.deepEqual(destinoDoVerniz(["Arquivo Único", "Impressão Frente", "Verniz Localizado"]), { juntos: true, tipo: "Verniz Localizado" });
  assert.equal(destinoDoVerniz(["Arquivo Único"]), null);
  assert.deepEqual(tiposDoVerniz(destinoDoVerniz(["Verniz Local Frente", "Verniz Local Verso"])), ["Verniz Local Frente", "Verniz Local Verso"]);
  assert.deepEqual(tiposDoVerniz(destinoDoVerniz(["Verniz Localizado"])), ["Verniz Localizado"]);
  assert.deepEqual(tiposDoVerniz(null), []);
});

test("resumo da escolha do verniz", () => {
  assert.equal(vernizResumo(null), "na imagem e no texto");
  assert.equal(vernizResumo("imagem"), "na imagem");
  assert.equal(vernizResumo("texto"), "no texto");
});
