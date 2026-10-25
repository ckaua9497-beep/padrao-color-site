import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { piecesOf, pagesFor, type ProductTemplate, type TemplatePage } from "./templates.ts";
import { faceIdOf, superficieDaPeca, superficiesDe, temVerso } from "./superficies.ts";

type Raw = { templates: Record<string, { pages: TemplatePage[] }>; products: Record<string, { template: string; pages: string[]; byOption?: ProductTemplate["byOption"]; bySize?: ProductTemplate["bySize"] }> };
const raw = JSON.parse(readFileSync(new URL("../data/templates.json", import.meta.url), "utf8")) as Raw;
const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8")) as { products: { id: string; options: Record<string, string[]>; variations: { v: Record<string, string> }[] }[] };

/** Folhas do gabarito na primeira variação do produto (como a página monta). */
function pagesOf(id: string, pick: Record<string, string> = {}): TemplatePage[] {
  const ref = raw.products[id];
  const template = raw.templates[ref.template];
  const pages = template.pages.filter((p) => ref.pages.includes(p.id) && p.panels.length);
  const product = catalog.products.find((p) => p.id === id)!;
  const selection = { ...Object.fromEntries(Object.entries(product.options).map(([k, v]) => [k, product.variations[0].v[k] ?? v[0]])), ...pick };
  return pagesFor({ key: ref.template, url: "", pages, byOption: ref.byOption, bySize: ref.bySize }, selection);
}

test("verso: duas faces sempre; nas outras, a cor decide (4/0 não; 4/1, 4/4 e 1/1 sim)", () => {
  const base = { kind: "card", name: "cartao de pvc", anexos: [] as string[] };
  assert.equal(temVerso({ ...base, selection: { Cor: "4/0 (colorido só frente)" } }), false);
  assert.equal(temVerso({ ...base, selection: { Cor: "4/4 (colorido frente e verso)" } }), true);
  assert.equal(temVerso({ ...base, selection: { "Cor da Impressão": "1/1 (tons de cinza frente e verso)" } }), true);
  assert.equal(temVerso({ ...base, selection: { Cor: "4/1 (frente colorido e verso em tons de cinza)" } }), true);
  assert.equal(temVerso({ ...base, selection: {} }), false, "sem cor e sem anexo de verso");
  assert.equal(temVerso({ ...base, selection: {}, anexos: ["Arquivo Único", "Impressão Verso"] }), true);
  assert.equal(temVerso({ kind: "tshirt", name: "camisa", selection: { Cor: "4/0" }, anexos: [] }), true);
  assert.equal(temVerso({ kind: "flag", name: "wind banner completo modelo faca", selection: {}, anexos: [] }), true);
  assert.equal(temVerso({ kind: "bag", variant: "pencil-case", name: "estojo personalizado", selection: {}, anexos: [] }), true);
});

test("photobook (74): capa, contracapa e uma superfície por lâmina; a lombada fica de fora", () => {
  const list = superficiesDe({ pages: pagesOf("74"), verso: true, frontLabel: "Capa", backLabel: "Contracapa" });
  assert.deepEqual(list.slice(0, 2).map((s) => s.label), ["Capa", "Contracapa"]);
  const pages = list.filter((s) => s.pagina);
  assert.ok(pages.length >= 6, `${pages.length} lâminas`);
  assert.equal(pages[0].label, "Lâmina páginas 1–2");
  assert.ok(!list.some((s) => /lombada/i.test(s.label)));
});

test("agenda (231): capa, contracapa e o miolo (página ímpar e par)", () => {
  const list = superficiesDe({ pages: pagesOf("231"), verso: true, frontLabel: "Capa", backLabel: "Contracapa" });
  assert.deepEqual(
    list.map((s) => s.id),
    ["front", "back", faceIdOf("Página ímpar (wire-o/espiral à esquerda)"), faceIdOf("Página par (wire-o/espiral à direita)")],
  );
  assert.ok(list.slice(2).every((s) => s.pagina));
});

test("short (24): 4 partes, lado direito e esquerdo × frente e verso", () => {
  const pages = pagesOf("24");
  const list = superficiesDe({ pages, verso: true });
  assert.equal(list.length, 4);
  assert.deepEqual(list.slice(0, 2).map((s) => s.id), ["front", "back"]);
  // Cada peça da folha vai para uma superfície diferente.
  const ids = piecesOf(pages[0]).map((piece) => superficieDaPeca(pages[0], piece));
  assert.equal(new Set(ids).size, 4);
});

test("caixa acrílica (123): frontal, traseira e as outras peças do gabarito", () => {
  const list = superficiesDe({ pages: pagesOf("123"), verso: true, frontLabel: "Lateral frontal", backLabel: "Lateral traseira" });
  assert.deepEqual(list.map((s) => s.label), ["Lateral frontal", "Lateral traseira", "Lateral esquerda", "Fundo da caixa", "Lateral direita"]);
  assert.ok(list.every((s) => !s.pagina));
});

test("sem verso na cor: a peça do verso do gabarito não vira superfície extra", () => {
  const list = superficiesDe({ pages: pagesOf("356"), verso: false });
  assert.deepEqual(list.map((s) => s.id), ["front"]);
});
