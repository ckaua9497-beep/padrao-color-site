import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ApiProduto } from "./api/types";
import type { Variation } from "./catalog";
import {
  applyResellerDiscount,
  categorySlug,
  categoryTier,
  describeResellerBenefit,
  isResellerAccount,
  resellerDiscountRate,
  SEGMENT_CATEGORIES,
  segmentOf,
  tableIncludesTier,
  variationsFromApi,
} from "./reseller.ts";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8")) as {
  categories: { slug: string; name: string }[];
};

test("revendedor: tabela diferente de CLIENTE FINAL ou categoria exclusiva de revenda", () => {
  assert.equal(isResellerAccount({ priceTable: "CLIENTE FINAL", category: "Bronze" }), false, "conta da integração: Bronze no balcão");
  assert.equal(isResellerAccount({ priceTable: "Cliente Final", category: "" }), false);
  assert.equal(isResellerAccount({ priceTable: "REVENDA", category: "Bronze" }), true);
  assert.equal(isResellerAccount({ priceTable: "CLIENTE FINAL", category: "Prata" }), true);
  assert.equal(isResellerAccount({ priceTable: "CLIENTE FINAL", category: "Ouro 2" }), true);
  assert.equal(isResellerAccount({ priceTable: "CLIENTE FINAL", category: "Diamante" }), true);
  assert.equal(isResellerAccount({ priceTable: "", category: "" }), false);
  assert.equal(isResellerAccount({}), false);
});

test("categoria de revenda: nível 2 pelo número, nível 1 sem número", () => {
  assert.deepEqual(categoryTier("Prata"), { tier: "prata", level: 1 });
  assert.deepEqual(categoryTier("Prata 2"), { tier: "prata", level: 2 });
  assert.deepEqual(categoryTier("Ouro"), { tier: "ouro", level: 1 });
  assert.deepEqual(categoryTier("Ouro 2"), { tier: "ouro", level: 2 });
  assert.deepEqual(categoryTier("OURO NÍVEL 2"), { tier: "ouro", level: 2 });
  assert.deepEqual(categoryTier("ouro2"), { tier: "ouro", level: 2 });
  assert.deepEqual(categoryTier("Bronze"), { tier: "bronze", level: 1 });
  assert.deepEqual(categoryTier("Diamante"), { tier: "diamante", level: 1 });
  assert.deepEqual(categoryTier("Platina"), { tier: "outra", level: 1 });
  assert.equal(categoryTier(""), null);
  assert.equal(categoryTier(undefined), null);
});

test("segmentos: nome ou slug da categoria do catálogo", () => {
  assert.equal(categorySlug("Brindes & Presentes"), "brindes-e-presentes");
  assert.equal(segmentOf("Cartões de Visita e Postais"), "offset");
  assert.equal(segmentOf("folhetos"), "offset");
  assert.equal(segmentOf("Banner e Lonas"), "comunicacao-visual");
  assert.equal(segmentOf("Adesivos e Rótulos"), "comunicacao-visual");
  assert.equal(segmentOf("Vestuário"), null);
  assert.equal(segmentOf("Led Neon"), null);
  assert.equal(segmentOf(""), null);
});

test("todas as categorias dos segmentos existem no catálogo", () => {
  const slugs = new Set(catalog.categories.map((c) => c.slug));
  for (const list of Object.values(SEGMENT_CATEGORIES)) {
    for (const slug of list) assert.ok(slugs.has(slug), `categoria "${slug}" não existe em catalog.json`);
  }
  for (const category of catalog.categories) assert.equal(categorySlug(category.name), category.slug, `slug de "${category.name}"`);
});

test("desconto da categoria: Prata/Ouro só em Offset e Comunicação Visual", () => {
  const prata = { priceTable: "REVENDA", category: "Prata" };
  assert.equal(resellerDiscountRate(prata, "Folhetos"), 0.03);
  assert.equal(resellerDiscountRate({ ...prata, category: "Prata 2" }, "Banner e Lonas"), 0.05);
  assert.equal(resellerDiscountRate({ ...prata, category: "Ouro" }, "comunicacao-visual"), 0.07);
  assert.equal(resellerDiscountRate({ ...prata, category: "Ouro 2" }, "Cartões de Visita e Postais"), 0.1);
  assert.equal(resellerDiscountRate(prata, "Vestuário"), 0, "fora dos segmentos");
  assert.equal(resellerDiscountRate({ priceTable: "REVENDA", category: "Bronze" }, "Folhetos"), 0, "Bronze é a base");
  assert.equal(resellerDiscountRate({ priceTable: "REVENDA", category: "Diamante" }, "Folhetos"), 0, "sem regra pública");
  assert.equal(resellerDiscountRate({ priceTable: "CLIENTE FINAL", category: "Bronze" }, "Folhetos"), 0, "balcão");
  assert.equal(resellerDiscountRate({ priceTable: "REVENDA OURO", category: "Ouro" }, "Folhetos"), 0, "tabela já é da categoria");
  assert.equal(tableIncludesTier("Revenda Prata 2"), true);
  assert.equal(tableIncludesTier("REVENDA"), false);
});

test("aplica o desconto nos preços econômico e expresso, em centavos", () => {
  const variations: Variation[] = [
    { id: 1, p: 65.19, pe: 70.4, q: 1000, d: 2, de: 1, v: { Papel: "Couchê" } },
    { id: 2, p: 10, q: 1, d: null, v: {} },
  ];
  const discounted = applyResellerDiscount(variations, 0.07);
  assert.equal(discounted[0].p, 60.63);
  assert.equal(discounted[0].pe, 65.47);
  assert.equal(discounted[0].q, 1000);
  assert.deepEqual(discounted[0].v, { Papel: "Couchê" });
  assert.equal(discounted[1].p, 9.3);
  assert.equal("pe" in discounted[1], false);
  assert.equal(applyResellerDiscount(variations, 0), variations, "sem desconto devolve a mesma lista");
  assert.equal(variations[0].p, 65.19, "não altera a original");
});

test("produto da API vira variação no formato do catálogo", () => {
  const rows = [
    { id: 22, preco: { economico: 65.19, expresso: 70.4 }, prazo: { hora_envio: "18:00:00", economico: 2, expresso: 1 }, quantidade: "1000", variacoes: { Papel: "Couchê" } },
    { id: "23", preco: { economico: "12,5" }, prazo: {}, quantidade: "", variacoes: null },
    { id: 0, preco: { economico: 1 } },
  ] as unknown as ApiProduto[];
  assert.deepEqual(variationsFromApi(rows), [
    { id: 22, p: 65.19, pe: 70.4, q: 1000, d: 2, de: 1, v: { Papel: "Couchê" } },
    { id: 23, p: 12.5, pe: 12.5, q: 1, d: null, de: null, v: {} },
  ]);
  assert.deepEqual(variationsFromApi(null), []);
});

test("texto do benefício da categoria", () => {
  assert.equal(describeResellerBenefit({ priceTable: "CLIENTE FINAL", category: "Bronze" }), null);
  assert.match(describeResellerBenefit({ priceTable: "REVENDA", category: "Ouro 2" }) ?? "", /Ouro nível 2: 10%/);
  assert.match(describeResellerBenefit({ priceTable: "REVENDA", category: "Bronze" }) ?? "", /tabela de revenda/);
});
