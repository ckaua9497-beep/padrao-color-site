// Monta o catálogo do site a partir da API Padrão Color.
// Uso: npm run sync:catalog   (lê PADRAO_API_URL e PADRAO_API_TOKEN do .env.local)
//
// Saídas em src/data/:
//   catalog.json         categorias + produtos (grupos da API) com variações, preços, prazos,
//                        descrição, informações técnicas, gabarito, tamanhos e medida livre (m²)
//   storefront.json      a vitrine do padraocolor.com.br (GET /configuracoes): banners (desktop e celular),
//                        botões, categorias em destaque, "Nossos Destaques", mais vendidos e menu, com a medida
//                        real de cada arte (lida dos primeiros bytes da imagem em img.padraocolor.com.br)
//   business-types.json  "Para o seu negócio" (GET /tiposnegocio)
//   finishes.json        acabamentos (GET /acabamentos)

import { mkdirSync, writeFileSync } from "node:fs";
import { classifyNetworkError, createTransport } from "../src/lib/api/transport.ts";
import { buildCategories, mapGroup, num, parseImageSize, sim, slugify } from "./lib/catalog-map.mjs";
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

// O host lab não envia o certificado intermediário: a chamada usa o mesmo transporte do site
// (src/lib/api/transport.ts: node:https com a cadeia da Let's Encrypt, prazos e repetição em conexão velha).
const transport = createTransport();
/** Conexões novas recusadas antes do handshake, seguidas (3 = firewall bloqueando, como no client.ts). */
let refusals = 0;

async function api(path, { retries = 2, timeout = 60_000 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const res = await transport.request(new URL(BASE + path), "GET", { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" }, undefined, timeout, true);
      refusals = 0;
      if (res.status === 204) return null;
      const text = res.text;
      if (res.status < 200 || res.status >= 300) throw new Error(`${res.status} ${text.slice(0, 120)}`);
      return JSON.parse(text);
    } catch (error) {
      const network = classifyNetworkError(error);
      // Sem conexão (API fora do ar ou firewall bloqueando este IP): parar tudo. Repetir centenas de grupos só
      // prolonga o bloqueio.
      refusals = network.refused ? refusals + 1 : 0;
      if (network.unreachable || refusals >= 3) {
        console.error(`
Sem conexão com ${new URL(BASE).host} (${network.code}): a API está fora do ar ou bloqueando este IP. Sincronização interrompida; nada foi gravado.`);
        process.exit(1);
      }
      if (attempt >= retries) throw new Error(`${path}: ${network.timedOut ? "tempo esgotado" : error.message}`);
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

/** Converte a lista em texto do Python que vem no campo "grupos" do menu ("[{'id': 74, 'nome': '...'}]"). */
function parseMenuGroups(raw) {
  if (Array.isArray(raw)) return raw.map((g) => ({ id: Number(g.id), name: g.nome }));
  const groups = [];
  for (const m of String(raw ?? "").matchAll(/'id':\s*(\d+),\s*'nome':\s*(['"])(.*?)\2/g)) groups.push({ id: Number(m[1]), name: m[3] });
  return groups;
}

/** Links do site oficial viram rotas do site novo; o resto segue externo (http do site oficial vira https). */
function localHref(url, productSlugs, categoryById) {
  if (!url) return null;
  const product = /padraocolor\.com\.br\/produto\/([^/?#]+)/.exec(url);
  if (product) {
    const id = /^(\d+)/.exec(product[1])?.[1];
    const slug = id ? productSlugs.get(Number(id)) : undefined;
    if (slug) return `/produto/${slug}`;
  }
  const category = /padraocolor\.com\.br\/categoria\/(\d+)/.exec(url);
  if (category) {
    const slug = categoryById.get(Number(category[1]));
    if (slug) return `/categoria/${slug}`;
  }
  return url.trim().replace(/^http:\/\/(www\.)?padraocolor\.com\.br/i, "https://padraocolor.com.br");
}

// ------------------------------------------------------------------------------------- imagens

/** Medida real de uma imagem da vitrine (só os primeiros 64 KB). Falha = null: o site usa a medida padrão. */
async function imageSize(url) {
  if (!url) return null;
  try {
    const res = await fetch(encodeURI(decodeURI(url)), { headers: { Range: "bytes=0-65535" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const size = parseImageSize(Buffer.from(await res.arrayBuffer()));
    return size && size.w > 0 && size.h > 0 ? size : null;
  } catch {
    return null;
  }
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
  return mapGroup(grupo, rows, { featured: highlightIds.includes(grupo.id), site: SITE });
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
    // Produto novo no site: aparece com o selo de lançamento nas listagens e no menu.
    isNew: true,
    related: [180, ...tagBase.related.filter((id) => id !== 180)],
  });
}

// ------------------------------------------------------------------------------------- categorias

const categories = buildCategories(categorias, products);

// ------------------------------------------------------------------------------------- vitrine

const productSlugs = new Map(products.filter((p) => typeof p.groupId === "number" && p.id !== "tags").map((p) => [p.groupId, p.slug]));
const categoryById = new Map(categories.map((c) => [c.id, c.slug]));
const byTipo = (tipo) => configuracoes.filter((c) => c.tipo === tipo);

// Banners e botões levam a medida real das artes (width/height exatos no next/image, sem salto de layout).
const storefront = {
  banners: await Promise.all(
    byTipo("Banner").map(async (b) => {
      const desktop = b.imagem_desktop;
      const mobile = b.imagem_mobile || b.imagem_desktop;
      const [desktopSize, mobileSize] = await Promise.all([imageSize(desktop), mobile === desktop ? null : imageSize(mobile)]);
      return { name: b.nome, desktop, mobile, href: localHref(b.url, productSlugs, categoryById), desktopSize, mobileSize: mobileSize ?? (mobile === desktop ? desktopSize : null) };
    }),
  ),
  buttons: await Promise.all(
    [...byTipo("Botões - Linha 1").map((b) => ({ ...b, row: 1 })), ...byTipo("Botões - Linha 2").map((b) => ({ ...b, row: 2 }))].map(async (b) => ({
      name: b.nome,
      image: b.imagem,
      href: localHref(b.url, productSlugs, categoryById),
      newTab: sim(b.nova_pagina),
      row: b.row,
      size: await imageSize(b.imagem),
    })),
  ),
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
