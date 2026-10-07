// Monta o catálogo do site a partir da API Padrão Color.
// Uso: npm run sync:catalog   (lê PADRAO_API_URL e PADRAO_API_TOKEN do .env.local)
//
// Saídas em src/data/:
//   catalog.json         categorias + produtos (grupos da API) com variações, preços, prazos,
//                        descrição, informações técnicas, gabarito, tamanhos e medida livre (m²)
//   storefront.json      a vitrine do padraocolor.com.br (GET /configuracoes): banners, botões,
//                        categorias em destaque, "Nossos Destaques", mais vendidos e menu
//   business-types.json  "Para o seu negócio" (GET /tiposnegocio)
//   finishes.json        acabamentos (GET /acabamentos)

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.PADRAO_API_URL ?? "https://lab.padraocolor.com/site").replace(/\/+$/, "");
const TOKEN = process.env.PADRAO_API_TOKEN;
if (!TOKEN) {
  console.error("PADRAO_API_TOKEN ausente. Rode com: node --env-file=.env.local scripts/sync-catalog.mjs");
  process.exit(1);
}

const CONCURRENCY = 6;
const SITE = "https://padraocolor.com.br";

// ------------------------------------------------------------------------------------- HTTP

async function api(path, { retries = 2, timeout = 60_000 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" }, signal: AbortSignal.timeout(timeout) });
      if (res.status === 204) return null;
      const text = await res.text();
      if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 120)}`);
      return JSON.parse(text);
    } catch (error) {
      if (attempt >= retries) throw new Error(`${path}: ${error.message}`);
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
        done += 1;
        if (done % 25 === 0 || done === items.length) process.stdout.write(`\r  produtos: ${done}/${items.length}   `);
      }
    }),
  );
  process.stdout.write("\n");
  return out;
}

// ------------------------------------------------------------------------------------- texto

/** Slug do site oficial (padraocolor.com.br/produto/35-banner---medida-personalizada): não junta hifens. */
const officialSlug = (value) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s/g, "-");

/** Slug das rotas de categoria do site novo (mantém as URLs já publicadas). */
const slugify = (value) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const sim = (value) => value === "Sim" || value === "S" || value === true;
const num = (value) => {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** "- P: Largura 50 cm | Comprimento 68 cm" → { size: "P", widthCm: 50, lengthCm: 68 } */
function parseSizeChart(info) {
  const block = info.find((b) => /medida/i.test(b.titulo));
  if (!block) return null;
  const rows = [];
  for (const line of block.texto.split(/\n/)) {
    const m = /^\s*-?\s*([^:]+?):\s*Largura\s*([\d,.]+)\s*cm?\s*\|\s*Comprimento\s*([\d,.]+)/i.exec(line);
    if (m) rows.push({ size: m[1].trim(), widthCm: num(m[2]), lengthCm: num(m[3]) });
  }
  return rows.length ? rows : null;
}

/** Converte a lista em texto do Python que vem no campo "grupos" do menu ("[{'id': 74, 'nome': '...'}]"). */
function parseMenuGroups(raw) {
  if (Array.isArray(raw)) return raw.map((g) => ({ id: Number(g.id), name: g.nome }));
  const groups = [];
  for (const m of String(raw ?? "").matchAll(/'id':\s*(\d+),\s*'nome':\s*(['"])(.*?)\2/g)) groups.push({ id: Number(m[1]), name: m[3] });
  return groups;
}

/** Links do site oficial viram rotas do site novo; o resto segue externo. */
function localHref(url, productSlugs, categoryById) {
  if (!url) return null;
  const product = /padraocolor\.com\.br\/produto\/([^/?#]+)/.exec(url);
  if (product) {
    const id = /^(\d+)/.exec(product[1])?.[1];
    const slug = id ? productSlugs.get(Number(id)) : undefined;
    return slug ? `/produto/${slug}` : url;
  }
  const category = /padraocolor\.com\.br\/categoria\/(\d+)/.exec(url);
  if (category) {
    const slug = categoryById.get(Number(category[1]));
    return slug ? `/categoria/${slug}` : url;
  }
  return url;
}

// ------------------------------------------------------------------------------------- coleta

console.log(`API: ${BASE}`);
const started = Date.now();
const [categorias, grupos, configuracoes, tiposNegocio, acabamentos] = await Promise.all([
  api("/categorias"),
  api("/grupos"),
  api("/configuracoes"),
  api("/tiposnegocio"),
  api("/acabamentos"),
]);
console.log(`  ${categorias.length} categorias, ${grupos.length} grupos, ${configuracoes.length} itens de vitrine`);

const variationsByGroup = await mapLimit(grupos, CONCURRENCY, async (grupo) => {
  try {
    return (await api(`/produtos?id_grupo=${grupo.id}`, { timeout: 45_000 })) ?? [];
  } catch (error) {
    console.warn(`\n  aviso: grupo ${grupo.id} (${grupo.nome}) sem produtos: ${error.message}`);
    return [];
  }
});

// ------------------------------------------------------------------------------------- produtos

const highlightIds = configuracoes.filter((c) => c.tipo === "Nossos Destaques").map((c) => Number(c.id));
const productGroupById = new Map();

const products = grupos.map((grupo, index) => {
  const rows = variationsByGroup[index] ?? [];
  for (const row of rows) productGroupById.set(row.id, grupo.id);

  const options = {};
  for (const row of rows) {
    for (const [key, value] of Object.entries(row.variacoes ?? {})) {
      if (!value) continue;
      options[key] ??= [];
      if (!options[key].includes(value)) options[key].push(value);
    }
  }

  const variations = rows.map((row) => ({
    id: row.id,
    p: row.preco?.economico ?? 0,
    pe: row.preco?.expresso ?? row.preco?.economico ?? 0,
    q: num(row.quantidade) || 1,
    d: row.prazo?.economico ?? null,
    de: row.prazo?.expresso ?? null,
    v: row.variacoes ?? {},
  }));

  const priced = variations.filter((v) => v.p > 0);
  const cheapest = priced.reduce((best, v) => (!best || v.p < best.p ? v : best), null);
  const leads = variations.map((v) => v.d).filter((d) => typeof d === "number" && d > 0);
  const first = rows[0];
  const sizesRow = rows.find((r) => r.quantidade_tamanho && r.quantidade_tamanho !== "Não");
  const m2Row = rows.find((r) => r.informa_medida === 1);
  const images = [grupo.imagem, ...rows.flatMap((r) => [r.imagem_1, r.imagem_2, r.imagem_3, r.imagem_4])].filter(Boolean);
  const criacao = rows.map((r) => num(r.customizacao?.criacao_arte?.preco)).filter((p) => p > 0);

  return {
    id: String(grupo.id),
    groupId: grupo.id,
    slug: `${grupo.id}-${officialSlug(grupo.nome)}`,
    name: grupo.nome.trim(),
    category: grupo.categoria,
    categoryId: num(grupo.id_categoria),
    categorySlug: slugify(grupo.categoria),
    description: (grupo.descricao ?? "").trim(),
    summary: (grupo.resumo ?? "").trim(),
    info: (grupo.informacao ?? []).map((b) => ({ title: b.titulo.trim(), text: b.texto.trim() })).filter((b) => b.text),
    template: grupo.gabarito || null,
    tags: (grupo.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    metaTitle: grupo.meta_title || grupo.nome,
    metaDescription: grupo.meta_description || "",
    image: grupo.imagem,
    images: [...new Set(images)].slice(0, 6),
    options,
    variations,
    variationCount: variations.length,
    price: cheapest?.p ?? grupo.preco ?? 0,
    priceQty: cheapest?.q ?? 1,
    leadDays: leads.length ? Math.min(...leads) : null,
    featured: highlightIds.includes(grupo.id),
    bestSeller: sim(grupo.mais_vendido),
    isNew: sim(grupo.lancamento),
    sourceUrl: `${SITE}/produto/${grupo.id}-${officialSlug(grupo.nome)}`,
    related: (grupo.veja_tambem ?? []).map((r) => r.id),
    sizes: sizesRow ? Object.values(sizesRow.quantidade_tamanho).filter(Boolean) : null,
    sizeChart: parseSizeChart(grupo.informacao ?? []),
    // Medida livre (m²): o preço da variação é por m² (formato 1x1). Limites "0" = sem limite.
    customSize: m2Row
      ? {
          minWidth: num(m2Row.largura_minima),
          maxWidth: num(m2Row.largura_maxima),
          minHeight: num(m2Row.altura_minima),
          maxHeight: num(m2Row.altura_maxima),
          minArea: num(m2Row.tamanho_minimo),
          maxArea: num(m2Row.tamanho_maximo),
        }
      : null,
    web2print: rows.some((r) => sim(r.customizacao?.web2print)),
    artCreationPrice: criacao.length ? Math.min(...criacao) : null,
    attachments: [...new Set(rows.flatMap((r) => (r.tipos_anexo ?? []).map((a) => a.nome)))],
    minQty: num(first?.qtde_minima) || 1,
    maxQty: num(first?.qtde_maxima) || 999_999,
  };
});

// "Tags" (checklist): reaproveita o produto de tag de presente que já existe (grupo 180) com nome e texto próprios.
const tagBase = products.find((p) => p.groupId === 180);
if (tagBase) {
  products.push({
    ...tagBase,
    id: "tags",
    slug: "tags",
    name: "Tags",
    summary:
      "Tags personalizadas para roupas, presentes, embalagens e lembrancinhas, nos formatos redondo, oval e retangular, com furo para cordão.",
    metaTitle: "Tags Personalizadas | Padrão Color",
    featured: false,
    related: [180, ...tagBase.related.filter((id) => id !== 180)],
  });
}

// ------------------------------------------------------------------------------------- categorias

const bySlug = new Map();
for (const p of products) {
  const list = bySlug.get(p.categorySlug) ?? [];
  list.push(p);
  bySlug.set(p.categorySlug, list);
}
const categories = categorias
  .map((c) => {
    const slug = slugify(c.nome);
    const list = bySlug.get(slug) ?? [];
    if (!list.length) return null;
    const lead = list.map((p) => p.leadDays).filter((d) => typeof d === "number");
    const prices = list.map((p) => p.price).filter((p) => p > 0);
    const cover = list.find((p) => p.featured) ?? list.find((p) => p.bestSeller) ?? list[0];
    return {
      id: c.id,
      slug,
      name: c.nome,
      count: list.length,
      image: c.imagem || cover.image,
      banner: c.banner || null,
      bannerMobile: c.banner_mobile || null,
      metaTitle: c.meta_title || c.nome,
      metaDescription: c.meta_description || "",
      minLeadDays: lead.length ? Math.min(...lead) : null,
      minPrice: prices.length ? Math.min(...prices) : 0,
    };
  })
  .filter(Boolean);

// ------------------------------------------------------------------------------------- vitrine

const productSlugs = new Map(products.filter((p) => typeof p.groupId === "number" && p.id !== "tags").map((p) => [p.groupId, p.slug]));
const categoryById = new Map(categories.map((c) => [c.id, c.slug]));
const byTipo = (tipo) => configuracoes.filter((c) => c.tipo === tipo);

const storefront = {
  banners: byTipo("Banner").map((b) => ({ name: b.nome, desktop: b.imagem_desktop, mobile: b.imagem_mobile || b.imagem_desktop, href: localHref(b.url, productSlugs, categoryById) })),
  buttons: [...byTipo("Botões - Linha 1").map((b) => ({ ...b, row: 1 })), ...byTipo("Botões - Linha 2").map((b) => ({ ...b, row: 2 }))].map((b) => ({
    name: b.nome,
    image: b.imagem,
    href: localHref(b.url, productSlugs, categoryById),
    newTab: sim(b.nova_pagina),
    row: b.row,
  })),
  featuredCategories: byTipo("Categorias em Destaque").map((c) => ({ id: Number(c.id), name: c.nome, image: c.imagem, price: num(c.preco), slug: categoryById.get(Number(c.id)) ?? slugify(c.nome) })),
  highlights: highlightIds.filter((id) => productSlugs.has(id)),
  bestSellers: [...new Set(byTipo("Produtos mais Vendidos").map((p) => productGroupById.get(Number(p.id))).filter((id) => productSlugs.has(id)))],
  menu: byTipo("Menu").map((m) => ({ categoryId: Number(m.id), name: m.nome, slug: categoryById.get(Number(m.id)) ?? slugify(m.nome), groups: parseMenuGroups(m.grupos).filter((g) => productSlugs.has(g.id)) })),
  headerText: byTipo("Header")[0]?.nome ?? null,
  topHeader: byTipo("TopHeader")[0] ? { image: byTipo("TopHeader")[0].imagem, href: localHref(byTipo("TopHeader")[0].url, productSlugs, categoryById) } : null,
};

const businessTypes = tiposNegocio.map((t) => ({
  id: String(t.id),
  slug: slugify(t.nome),
  name: t.nome,
  image: t.imagem,
  banner: t.banner || null,
  metaTitle: t.meta_title || t.nome,
  metaDescription: t.meta_description || "",
  groupIds: (t.grupos ?? []).map((g) => g.id).filter((id) => productSlugs.has(id)),
}));

const finishes = acabamentos.map((a) => ({ id: a.id, name: a.nome, description: a.descricao, informsQty: a.informa_qtde === 1 }));

// ------------------------------------------------------------------------------------- escrita

const dataDir = resolve(root, "src/data");
mkdirSync(dataDir, { recursive: true });
const generatedAt = new Date().toISOString();
const write = (name, value) => {
  const json = JSON.stringify(value);
  writeFileSync(resolve(dataDir, name), json);
  return `${name} ${(json.length / 1024).toFixed(0)} KB`;
};
console.log(
  [
    write("catalog.json", { generatedAt, source: BASE, categories, products }),
    write("storefront.json", { generatedAt, ...storefront }),
    write("business-types.json", businessTypes),
    write("finishes.json", finishes),
  ].join(" · "),
);
console.log(`  ${products.length} produtos, ${products.reduce((s, p) => s + p.variationCount, 0)} variações em ${((Date.now() - started) / 1000).toFixed(0)} s`);
