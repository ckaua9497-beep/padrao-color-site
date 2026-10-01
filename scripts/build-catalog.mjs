import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source =
  process.env.PADRAO_CATALOGO ??
  "C:/Users/USER/Desktop/padraocollor/data/catalogo.json";

const slugify = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const raw = JSON.parse(readFileSync(source, "utf-8"));
const rows = raw.padrao;

const products = rows.map((item) => {
  const price =
    item.preco_minimo && item.preco_minimo > 0 ? item.preco_minimo : item.preco_entrada;
  const qty = item.quantidade_preco_minimo || item.quantidade_referencia || 1;
  return {
    id: String(item.id),
    slug: item.slug,
    name: item.nome.trim(),
    category: item.categoria,
    categorySlug: slugify(item.categoria),
    description: (item.descricao ?? "").trim(),
    image: item.imagem,
    images: [...new Set([item.imagem, ...(item.imagens ?? [])].filter(Boolean))].slice(0, 5),
    options: item.opcoes ?? {},
    variations: (item.variacoes_amostra ?? []).map((v) => ({
      p: v.preco_economico,
      q: v.quantidade,
      d: v.prazo_dias,
      v: v.variacoes,
    })),
    variationCount: item.n_variacoes ?? (item.variacoes_amostra ?? []).length,
    price,
    priceQty: qty,
    leadDays: item.prazo_dias ?? null,
    featured: Boolean(item.em_vitrine),
    bestSeller: Boolean(item.mais_vendido),
    isNew: Boolean(item.lancamento),
    sourceUrl: item.url,
  };
});

const byCategory = new Map();
for (const product of products) {
  const list = byCategory.get(product.categorySlug) ?? [];
  list.push(product);
  byCategory.set(product.categorySlug, list);
}

const categories = [...byCategory.entries()]
  .map(([slug, list]) => {
    const cover = list.find((p) => p.featured) ?? list.find((p) => p.bestSeller) ?? list[0];
    const lead = list.map((p) => p.leadDays).filter((d) => typeof d === "number");
    return {
      slug,
      name: list[0].category,
      count: list.length,
      image: cover.image,
      minLeadDays: lead.length ? Math.min(...lead) : null,
      minPrice: Math.min(...list.map((p) => p.price).filter((p) => p > 0)),
    };
  })
  .sort((a, b) => b.count - a.count);

mkdirSync(resolve(root, "src/data"), { recursive: true });
writeFileSync(
  resolve(root, "src/data/catalog.json"),
  JSON.stringify({ generatedAt: raw.gerado_em, categories, products }),
);

const index = products.map((p) => ({
  s: p.slug,
  n: p.name,
  c: p.category,
  i: p.image,
  p: p.price,
  q: p.priceQty,
}));
writeFileSync(resolve(root, "public/search-index.json"), JSON.stringify(index));

console.log(`${products.length} produtos, ${categories.length} categorias`);
