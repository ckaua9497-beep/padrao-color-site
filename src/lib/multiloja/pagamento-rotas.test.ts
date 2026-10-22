import { test } from "node:test";
import assert from "node:assert/strict";
import { formasDisponiveis, gatewaysEmUso, listaFormas, resumoRotas, rotasSalvas, ROTAS_DESLIGADAS, usarParaTudo, type Rotas } from "./pagamento-rotas.ts";

test("rotas salvas: valem as do admin; a configuração antiga (um gateway para tudo) vira uma rota por forma", () => {
  assert.deepEqual(rotasSalvas({ rotas: { pix: "pagarme", boleto: "desligado", cartao: "cielo" } }, "simulado"), { pix: "pagarme", boleto: "desligado", cartao: "cielo" });
  // Antes: { ativo, metodos } — forma desligada continua desligada.
  assert.deepEqual(rotasSalvas({ ativo: "efi", metodos: { pix: true, boleto: false, cartao: true } }, "simulado"), { pix: "efi", boleto: "desligado", cartao: "efi" });
  assert.deepEqual(rotasSalvas({ ativo: "desligado", metodos: { pix: true, boleto: true, cartao: true } }, "simulado"), ROTAS_DESLIGADAS);
  // Nada salvo: o padrão do ambiente (MULTILOJA_PAGAMENTO) em todas; valor estranho cai no padrão.
  assert.deepEqual(rotasSalvas(null, "simulado"), { pix: "simulado", boleto: "simulado", cartao: "simulado" });
  assert.deepEqual(rotasSalvas({ rotas: { pix: "paypal" } }, "desligado"), ROTAS_DESLIGADAS);
});

test("usar para tudo: o gateway pega as formas que sabe cobrar e as outras continuam como estavam", () => {
  const antes: Rotas = { pix: "efi", boleto: "cielo", cartao: "cielo" };
  assert.deepEqual(usarParaTudo(antes, "pagarme", ["pix"]), { pix: "pagarme", boleto: "cielo", cartao: "cielo" });
  assert.deepEqual(usarParaTudo(ROTAS_DESLIGADAS, "efi", ["pix", "boleto", "cartao"]), { pix: "efi", boleto: "efi", cartao: "efi" });
});

test("formas no checkout: só com gateway pronto que cobra a forma", () => {
  const rotas: Rotas = { pix: "pagarme", boleto: "desligado", cartao: "cielo" };
  assert.deepEqual(formasDisponiveis(rotas, { pagarme: ["pix"], cielo: ["pix", "boleto", "cartao"] }), ["pix", "cartao"]);
  // Cielo sem o Link de Pagamento não cobra cartão; Pagar.me sem chave fica de fora.
  assert.deepEqual(formasDisponiveis(rotas, { cielo: ["pix", "boleto"] }), []);
  // Rota apontando para um gateway que não cobra a forma não vale.
  assert.deepEqual(formasDisponiveis({ pix: "pagarme", boleto: "pagarme", cartao: "pagarme" }, { pagarme: ["pix"] }), ["pix"]);
});

test("resumo do admin: quem cobra cada forma, na ordem Pix, boleto, cartão", () => {
  const rotas: Rotas = { pix: "pagarme", boleto: "desligado", cartao: "cielo" };
  const disponiveis = formasDisponiveis(rotas, { pagarme: ["pix"], cielo: ["pix", "boleto", "cartao"] });
  assert.deepEqual(gatewaysEmUso(rotas, disponiveis), ["pagarme", "cielo"]);
  assert.equal(resumoRotas(rotas, disponiveis), "Pix pela Pagar.me · Boleto desligado · Cartão de crédito pela Cielo");
  // Forma com gateway sem credenciais aparece como desligada (não vai ao checkout).
  assert.equal(resumoRotas(rotas, ["pix"]), "Pix pela Pagar.me · Boleto desligado · Cartão de crédito desligado");
  assert.deepEqual(gatewaysEmUso(ROTAS_DESLIGADAS, []), []);
});

test("formas no meio da frase: Pix, boleto e cartão de crédito", () => {
  assert.equal(listaFormas(["pix", "boleto", "cartao"]), "Pix, boleto e cartão de crédito");
  assert.equal(listaFormas(["pix"]), "Pix");
  assert.equal(listaFormas(["boleto", "cartao"]), "boleto e cartão de crédito");
  assert.equal(listaFormas([]), "");
});
