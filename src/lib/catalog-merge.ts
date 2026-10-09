import type { Category, Product } from "./catalog";

/*
 * Catálogo do site = catalog.json (API da Padrão, npm run sync:catalog) + catalog-novos.json (API própria do
 * site, npm run sync:novos). Os produtos novos entram como os outros; qualquer colisão de slug, grupo ou ID de
 * variação derruba o build, porque o ID da variação vai no pedido e um ID repetido produziria o item errado.
 * Módulo puro (testado com node --test).
 */

export type CatalogFile = { generatedAt: string; source?: string; categories: Category[]; products: Product[] };

export function mergeCatalogs(padrao: CatalogFile, novos: CatalogFile): CatalogFile {
  if (!novos.products.length) return padrao;

  const slugs = new Set(padrao.products.map((p) => p.slug));
  const groups = new Set(padrao.products.map((p) => p.groupId).filter((id): id is number => typeof id === "number"));
  const variations = new Set(padrao.products.flatMap((p) => p.variations.map((v) => v.id)).filter((id): id is number => typeof id === "number"));
  for (const product of novos.products) {
    if (slugs.has(product.slug)) throw new Error(`Produto novo com slug já usado: ${product.slug}`);
    if (typeof product.groupId === "number" && groups.has(product.groupId)) throw new Error(`Produto novo com grupo já usado: ${product.groupId}`);
    for (const variation of product.variations) {
      if (typeof variation.id === "number" && variations.has(variation.id)) throw new Error(`Variação nova com ID já usado: ${variation.id} (${product.slug})`);
      if (typeof variation.id === "number") variations.add(variation.id);
    }
    slugs.add(product.slug);
    if (typeof product.groupId === "number") groups.add(product.groupId);
  }

  const products = [...padrao.products, ...novos.products.map((p) => ({ ...p, source: "site" as const }))];

  // Categoria nova entra no fim; se um produto novo cair numa categoria que já existe, ela é recontada.
  const known = new Map(padrao.categories.map((c) => [c.slug, c]));
  const categories = padrao.categories.map((category) => {
    const extra = novos.products.filter((p) => p.categorySlug === category.slug);
    return extra.length ? recount(category, products.filter((p) => p.categorySlug === category.slug)) : category;
  });
  for (const category of novos.categories) {
    if (!known.has(category.slug)) categories.push(category);
  }
  return { ...padrao, categories, products };
}

function recount(category: Category, list: Product[]): Category {
  const leads = list.map((p) => p.leadDays).filter((d): d is number => typeof d === "number");
  const prices = list.map((p) => p.price).filter((p) => p > 0);
  return { ...category, count: list.length, minLeadDays: leads.length ? Math.min(...leads) : null, minPrice: prices.length ? Math.min(...prices) : 0 };
}
