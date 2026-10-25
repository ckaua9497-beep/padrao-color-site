import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptDo, arquivoServe, corServe, monoDo, processoDa } from "./processo.ts";

test("processo pelo produto e pela cor da variação", () => {
  assert.equal(processoDa({ kind: "sheet", name: "impressao p&b em papel a4", selection: {} }), "pb");
  assert.equal(processoDa({ kind: "wristband", name: "pulseira de identificacao", selection: { "Cor da Impressão": "1/0 (Tons de Cinza só frente)" } }), "pb", "Tyvek é 1/0");
  assert.equal(processoDa({ kind: "wristband", name: "pulseira de identificacao", selection: { "Cor da Impressão": "4/0 (colorido só frente)" } }), null, "fita acetinada é colorida");
  assert.equal(processoDa({ kind: "tumbler", name: "copo termico", selection: {} }), "laser");
  assert.equal(processoDa({ kind: "board", name: "tabua de frios", selection: {} }), "talhamento");
  assert.equal(processoDa({ kind: "sticker", name: "folha dtf textil", selection: {} }), "dtf");
  assert.equal(processoDa({ kind: "card", name: "cartao de visita", selection: { Cor: "4/4 (colorido frente e verso)" } }), null);
});

test("pintura, cores e arquivos de cada processo", () => {
  assert.equal(monoDo("pb"), "gray");
  assert.equal(monoDo("laser"), "black");
  assert.equal(monoDo("talhamento"), "black");
  assert.equal(monoDo("dtf"), null);
  assert.equal(corServe("pb", "#777777"), true);
  assert.equal(corServe("pb", "#ff4d00"), false);
  assert.equal(corServe("laser", "#111111"), true);
  assert.equal(corServe("laser", "#ffffff"), false);
  assert.equal(corServe(null, "#ff4d00"), true);
  assert.equal(arquivoServe("talhamento", "logo.svg"), true);
  assert.equal(arquivoServe("talhamento", "foto.jpg"), false);
  assert.equal(arquivoServe("pb", "foto.jpg"), true);
  assert.ok(acceptDo("talhamento")?.includes(".cdr"));
  assert.equal(acceptDo("pb"), null);
});
