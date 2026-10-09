import { test } from "node:test";
import assert from "node:assert/strict";
import type { Category, Product } from "./catalog";
import { mergeCatalogs, type CatalogFile } from "./catalog-merge.ts";

/* Catálogo da Padrão + produtos novos da API própria: entra tudo, e colisão de ID derruba o build. */

const product = (groupId: number, categorySlug: string, variationIds: number[], extra: Partial<Product> = {}): Product =>
  ({
    id: String(groupId),
    groupId,
    slug: `${groupId}-produto`,
    name: `Produto ${groupId}`,
    category: categorySlug,
    categorySlug,
    description: "",
    image: "",
    images: [],
    options: {},
    variations: variationIds.map((id) => ({ id, p: 10, q: 1, d: 3, v: {} })),
    variationCount: variationIds.length,
    price: 10,
    priceQty: 1,
    leadDays: 3,
    featured: false,
    bestSeller: false,
    isNew: false,
    sourceUrl: "",
    ...extra,
  }) as Product;

const category = (slug: string, count: number, extra: Partial<Category> = {}): Category => ({ slug, name: slug, count, image: "", minLeadDays: 3, minPrice: 10, ...extra });

const padrao: CatalogFile = { generatedAt: "2026-10-06", categories: [category("embalagens", 1)], products: [product(222, "embalagens", [2987, 2988])] };

test("sem produtos novos, o catálogo da Padrão fica igual", () => {
  assert.equal(mergeCatalogs(padrao, { generatedAt: "x", categories: [], products: [] }), padrao);
});

test("produto novo entra com a origem marcada e a categoria nova no fim", () => {
  const merged = mergeCatalogs(padrao, {
    generatedAt: "2026-10-07",
    categories: [category("produtos-novos", 1)],
    products: [product(900001, "produtos-novos", [9001001])],
  });
  assert.equal(merged.generatedAt, "2026-10-06");
  assert.deepEqual(merged.products.map((p) => [p.groupId, p.source ?? "padrao"]), [
    [222, "padrao"],
    [900001, "site"],
  ]);
  assert.deepEqual(merged.categories.map((c) => c.slug), ["embalagens", "produtos-novos"]);
});

test("produto novo numa categoria que já existe: ela é recontada", () => {
  const merged = mergeCatalogs(padrao, {
    generatedAt: "2026-10-07",
    categories: [category("embalagens", 1)],
    products: [product(900005, "embalagens", [9005001], { price: 4, leadDays: 6 })],
  });
  const embalagens = merged.categories.find((c) => c.slug === "embalagens");
  assert.equal(merged.categories.length, 1);
  assert.equal(embalagens?.count, 2);
  assert.equal(embalagens?.minPrice, 4);
  assert.equal(embalagens?.minLeadDays, 3);
});

test("colisão de slug, grupo ou ID de variação derruba o build", () => {
  const novos = (p: Product): CatalogFile => ({ generatedAt: "x", categories: [], products: [p] });
  assert.throws(() => mergeCatalogs(padrao, novos(product(900001, "x", [2988]))), /Variação nova com ID já usado: 2988/);
  assert.throws(() => mergeCatalogs(padrao, novos(product(222, "x", [9001001], { slug: "outro" }))), /grupo já usado: 222/);
  assert.throws(() => mergeCatalogs(padrao, novos(product(900001, "x", [9001001], { slug: "222-produto" }))), /slug já usado/);
  assert.throws(
    () => mergeCatalogs(padrao, { generatedAt: "x", categories: [], products: [product(900001, "x", [9001001]), product(900002, "x", [9001001])] }),
    /9001001/,
    "repetido entre os próprios produtos novos",
  );
});
