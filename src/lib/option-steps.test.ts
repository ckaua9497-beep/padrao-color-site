import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Variation } from "./catalog";
import { chooseOption, displayOrder, optionKeys, quote, stepValues, type Selection } from "./pricing.ts";

type CatalogProduct = { name: string; options: Record<string, string[]>; variations: Variation[] };
const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8")) as { products: CatalogProduct[] };

// Cartão de Visita (grupo 248): papéis de tiragem pequena (9x5, 120/210/300, sem verniz) e de milheiro (com UV).
const v = (id: number, p: number, Papel: string, Formato: string, Cor: string, Quantidade: string, Acabamento: string): Variation => ({ id, p, q: 1, d: 2, v: { Papel, Formato, Cor, Quantidade, Acabamento } });
const CARTAO = [
  v(1, 28.16, "Offset 240g", "9x5 cm", "4/0", "120 unidades", "Sem Verniz UV"),
  v(2, 40, "Offset 240g", "9x5 cm", "4/4", "210 unidades", "Sem Verniz UV"),
  v(3, 90, "Couchê/C2S 250g", "9x5 cm", "4/4", "1000", "UV Total 1/0"),
  v(4, 95, "Couchê/C2S 250g", "9x10 cm", "4/1", "1000", "UV Total 1/0"),
];
const OPTIONS = {
  Papel: ["Couchê/C2S 250g", "Offset 240g"],
  Formato: ["9x5 cm", "9x10 cm"],
  Cor: ["4/0", "4/1", "4/4"],
  Quantidade: ["1000", "120 unidades", "210 unidades"],
  Acabamento: ["UV Total 1/0", "Sem Verniz UV"],
};
const KEYS = optionKeys(OPTIONS);

test("cada passo mostra só o que combina com os passos anteriores", () => {
  const offset: Selection = { ...CARTAO[1].v };
  assert.deepEqual(stepValues("Papel", KEYS, OPTIONS, CARTAO, offset), ["Couchê/C2S 250g", "Offset 240g"], "o primeiro passo mostra tudo");
  assert.deepEqual(stepValues("Formato", KEYS, OPTIONS, CARTAO, offset), ["9x5 cm"]);
  assert.deepEqual(stepValues("Quantidade", KEYS, OPTIONS, CARTAO, offset), ["210 unidades"], "Offset 4/4 só em 210");
  assert.deepEqual(stepValues("Acabamento", KEYS, OPTIONS, CARTAO, offset), ["Sem Verniz UV"], "Offset não tem UV");
});

test("trocar o papel ajusta os passos seguintes para uma variação que existe", () => {
  const next = chooseOption(KEYS, CARTAO, { ...CARTAO[1].v }, "Papel", "Couchê/C2S 250g");
  assert.deepEqual(next, CARTAO[2].v, "mantém 9x5 e 4/4 e troca quantidade e acabamento");
  const q = quote(CARTAO, next, { price: 0, qty: 1, leadDays: null }, KEYS.length);
  assert.equal(q.variation?.id, 3);
  assert.equal(q.exact, true);
});

test("trocar um passo do meio mantém os anteriores", () => {
  const next = chooseOption(KEYS, CARTAO, { ...CARTAO[2].v }, "Formato", "9x10 cm");
  assert.equal(next.Papel, "Couchê/C2S 250g");
  assert.deepEqual(next, CARTAO[3].v);
});

test("quantidades em ordem crescente; as outras opções na ordem da API", () => {
  assert.deepEqual(displayOrder("Quantidade", ["1000", "120 unidades", "300 unidades", "210 unidades"]), ["120 unidades", "210 unidades", "300 unidades", "1000"]);
  assert.deepEqual(displayOrder("04 - Quantidade", ["1.000", "500"]), ["500", "1.000"]);
  assert.deepEqual(displayOrder("Quantidade", ["De 1 até 10", "De 11 até 100"]), ["De 1 até 10", "De 11 até 100"]);
  assert.deepEqual(displayOrder("Papel", ["Offset 240g", "Couchê 250g"]), ["Offset 240g", "Couchê 250g"]);
});

test("catálogo inteiro: qualquer valor mostrado leva a uma variação que existe", () => {
  const exists = (variations: Variation[], keys: string[], selection: Selection) =>
    variations.some((variation) => keys.every((k) => variation.v[k] === undefined || variation.v[k] === selection[k]));
  for (const product of catalog.products) {
    const keys = optionKeys(product.options);
    if (keys.length < 2) continue;
    for (const start of product.variations) {
      const selection: Selection = Object.fromEntries(keys.map((k) => [k, start.v[k] ?? product.options[k][0]]));
      for (const key of keys) {
        for (const value of stepValues(key, keys, product.options, product.variations, selection)) {
          const next = chooseOption(keys, product.variations, selection, key, value);
          assert.ok(exists(product.variations, keys, next), `${product.name}: ${key} = ${value} a partir de ${JSON.stringify(start.v)}`);
        }
      }
    }
  }
});
