import { test } from "node:test";
import assert from "node:assert/strict";
import { TERMOS_ARTE, TERMOS_ARTE_VERSAO, aceiteValido, levaArte, novoAceite, textoDoAceite } from "./termos-arte.ts";

test("só os itens com arte do cliente pedem o aceite", () => {
  assert.equal(levaArte({ artName: "logo.png" }), true);
  assert.equal(levaArte({ artName: "texto no mockup · estilo clássico" }), true);
  // Enviar arte depois (multiloja): a arte ainda vem, o aceite vale para ela.
  assert.equal(levaArte({ artName: null }), true);
  assert.equal(levaArte({ artName: "modelo pronto" }), false);
  assert.equal(levaArte({ artName: "produto sem impressão" }), false);
});

test("o aceite do navegador só vale na versão atual e com data válida", () => {
  const aceite = novoAceite(new Date("2026-10-25T17:32:00Z"));
  assert.deepEqual(aceiteValido(aceite), { versao: TERMOS_ARTE_VERSAO, em: "2026-10-25T17:32:00.000Z" });
  assert.equal(aceiteValido({ versao: "2020-01-01", em: aceite.em }), null);
  assert.equal(aceiteValido({ versao: TERMOS_ARTE_VERSAO, em: "ontem" }), null);
  assert.equal(aceiteValido("sim"), null);
  assert.equal(aceiteValido(null), null);
});

test("texto do aceite no horário de Brasília", () => {
  assert.equal(textoDoAceite({ versao: TERMOS_ARTE_VERSAO, em: "2026-10-25T17:32:00.000Z" }), `aceitos em 25/10/2026 às 14:32 (versão ${TERMOS_ARTE_VERSAO})`);
});

test("os termos têm título e itens", () => {
  assert.ok(TERMOS_ARTE.titulo.length > 0);
  assert.ok(TERMOS_ARTE.itens.length >= 5);
});
