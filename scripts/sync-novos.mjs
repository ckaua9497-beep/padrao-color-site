// Produtos novos do site: consome a API própria (/api/novos, mesmo formato da API da Padrão Color) e grava
// src/data/catalog-novos.json, que o src/lib/catalog.ts soma ao catálogo da Padrão.
//
// Uso:
//   npm run sync:novos              lê NOVOS_API_URL (padrão http://localhost:3100/api/novos: suba o `npm run dev` antes)
//   npm run sync:novos -- --local   sem servidor: monta as mesmas respostas direto de src/data/novos/fonte.json
//
// O mapeamento grupo/variação → produto é o mesmo do sync-catalog.mjs (scripts/lib/catalog-map.mjs).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createTransport, classifyNetworkError } from "../src/lib/api/transport.ts";
import { novosCategorias, novosGrupos, novosProdutos } from "../src/lib/novos-api.ts";
import { buildCategories, mapGroup, parseImageSize } from "./lib/catalog-map.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL = process.argv.includes("--local");
const BASE = (process.env.NOVOS_API_URL || "http://localhost:3100/api/novos").replace(/\/+$/, "");
const TOKEN = process.env.NOVOS_API_TOKEN?.trim();

const transport = createTransport();

/** GET no formato da API da Padrão: JSON, ou null em 204. */
async function api(path) {
  if (LOCAL) {
    const fonte = JSON.parse(readFileSync(resolve(root, "src/data/novos/fonte.json"), "utf8"));
    const url = new URL(path, "http://local");
    const query = Object.fromEntries(url.searchParams.entries());
    const rows = url.pathname === "/categorias" ? novosCategorias(fonte, query) : url.pathname === "/grupos" ? novosGrupos(fonte, query) : novosProdutos(fonte, query);
    return rows.length ? rows : null;
  }
  const headers = { Accept: "application/json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) };
  try {
    const res = await transport.request(new URL(BASE + path), "GET", headers, undefined, 20_000, true);
    if (res.status === 204) return null;
    if (res.status < 200 || res.status >= 300) throw new Error(`${res.status} ${res.text.slice(0, 160)}`);
    return JSON.parse(res.text);
  } catch (error) {
    const network = classifyNetworkError(error);
    if (network.unreachable || network.refused) {
      console.error(`\nSem conexão com ${BASE} (${network.code}). Suba o site (npm run dev) ou rode com --local.`);
      process.exit(1);
    }
    throw new Error(`${path}: ${error.message}`);
  }
}

console.log(`API: ${LOCAL ? "src/data/novos/fonte.json (--local)" : BASE}`);
const [categorias, grupos] = await Promise.all([api("/categorias"), api("/grupos")]);
const products = [];
for (const grupo of grupos ?? []) {
  const rows = (await api(`/produtos?id_grupo=${grupo.id}`)) ?? [];
  if (!rows.length) console.warn(`  aviso: grupo ${grupo.id} (${grupo.nome}) sem variações`);
  products.push(mapGroup(grupo, rows, { source: "site" }));
}
const categories = buildCategories(categorias ?? [], products);

// Fotos são arquivos do próprio site (public/): avisa as que faltam ou fogem do padrão (600×600).
for (const product of products) {
  for (const image of product.images) {
    if (!image.startsWith("/")) continue;
    const file = resolve(root, "public", image.slice(1));
    if (!existsSync(file)) {
      console.warn(`  aviso: foto ausente ${image} (${product.name})`);
      continue;
    }
    const size = parseImageSize(readFileSync(file).subarray(0, 64));
    if (size && (size.w !== 600 || size.h !== 600)) console.warn(`  aviso: ${image} tem ${size.w}x${size.h} (o catálogo usa 600x600)`);
  }
}

const out = resolve(root, "src/data/catalog-novos.json");
const json = JSON.stringify({ generatedAt: new Date().toISOString(), source: LOCAL ? "src/data/novos/fonte.json" : BASE, categories, products });
writeFileSync(out, json);
transport.destroy();
console.log(`  ${categories.length} categoria(s), ${products.length} produtos, ${products.reduce((s, p) => s + p.variationCount, 0)} variações · catalog-novos.json ${(json.length / 1024).toFixed(0)} KB`);
