// Mapeamento "API no formato da Padrão Color → catálogo do site", usado pelos dois sincronizadores
// (scripts/sync-catalog.mjs, API da Padrão, e scripts/sync-novos.mjs, API própria do site, /api/novos) e pelo
// catálogo em tempo real do servidor. Mesma regra para todos: um produto entra no site exatamente como a API manda,
// com as correções de dados que o site faz por cima (grafias repetidas, limites por variação, LED).
//
// Puro e testado (catalog-map.test.ts): sem JSX, imports com extensão .ts e tipos com `import type`.

import type { ApiGrupo, ApiProduto } from "./api/types";
import type { CustomSize, Product, Variation } from "./catalog";
import { perfisDeCustomizacao } from "./customizacao.ts";
import { tabelaDeAcabamentos } from "./acabamentos.ts";
// Área mínima cobrada do LED montado pelo cliente: o "a partir de" da vitrine é esse mínimo no menor preço do m².
import { NEON_MIN_AREA_M2 } from "./pricing.ts";

// ------------------------------------------------------------------------------------- texto

/** Slug do site oficial (padraocolor.com.br/produto/35-banner---medida-personalizada): não junta hifens. */
export const officialSlug = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s/g, "-");

/** Slug das rotas de categoria do site novo (mantém as URLs já publicadas). */
export const slugify = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const sim = (value: unknown): boolean => value === "Sim" || value === "S" || value === true;
export const num = (value: unknown): number => {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** "- P: Largura 50 cm | Comprimento 68 cm" → { size: "P", widthCm: 50, lengthCm: 68 } */
export function parseSizeChart(info: readonly { titulo: string; texto: string }[]) {
  const block = info.find((b) => /medida/i.test(b.titulo));
  if (!block) return null;
  const rows: { size: string; widthCm: number; lengthCm: number }[] = [];
  for (const line of block.texto.split(/\n/)) {
    const m = /^\s*-?\s*([^:]+?):\s*Largura\s*([\d,.]+)\s*cm?\s*\|\s*Comprimento\s*([\d,.]+)/i.exec(line);
    if (m) rows.push({ size: m[1].trim(), widthCm: num(m[2]), lengthCm: num(m[3]) });
  }
  return rows.length ? rows : null;
}

// ------------------------------------------------------------------------------------- imagens

/** Largura × altura de PNG, GIF, WEBP ou JPEG a partir dos primeiros bytes do arquivo. */
export function parseImageSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 30) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.toString("ascii", 0, 3) === "GIF") return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (chunk === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = buf.readUInt32LE(21);
      return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

// ------------------------------------------------------------------------------------- produtos

/** Linha de GET /produtos como chega (campos opcionais: a API própria manda só parte deles). */
export type ApiRow = Partial<ApiProduto> & { id: number; variacoes?: Record<string, string> };

/**
 * Linhas de GET /produtos?id_grupo= que são variações de verdade (com `id` numérico). A API às vezes responde 200 com
 * linhas de erro no lugar das variações (grupo 532 em 23/10/2026: `[{"ERRO":"Bad Response"}]`); `invalid` traz as
 * descartadas para o aviso do sincronizador.
 */
export function variationRows(data: unknown): { rows: ApiRow[]; invalid: unknown[] } {
  const list: unknown[] = Array.isArray(data) ? data : data == null ? [] : [data];
  const rows = list.filter((row): row is ApiRow => Boolean(row) && typeof row === "object" && Number.isInteger((row as ApiRow).id) && (row as ApiRow).id > 0 && !("ERRO" in (row as object)));
  return { rows, invalid: list.filter((row) => !rows.includes(row as ApiRow)) };
}

/**
 * Embalagem de envio da variação (frete pela API de frete da Padrão): [peso kg, largura, altura, comprimento cm, lotes por
 * caixa]. Só com todas as medidas positivas; sem ela, o frete do produto não pode ser cotado.
 */
export function packaging(emb: unknown): [number, number, number, number, number] | null {
  if (!emb || typeof emb !== "object") return null;
  const e = emb as Record<string, unknown>;
  const values = [num(e.peso), num(e.largura), num(e.altura), num(e.comprimento), num(e.quantidade) || 1] as [number, number, number, number, number];
  return values.every((v) => Number.isFinite(v) && v > 0) ? values : null;
}

/**
 * Embalagem incompleta na Padrão (algo cadastrado, algo zerado; ex.: neon com caixa e peso 0, agenda com peso e caixa
 * 0): [peso kg, largura, altura, comprimento cm], com 0 no que falta. Não cota (o checkout manda para o WhatsApp).
 */
export function partialPackaging(emb: unknown): [number, number, number, number] | null {
  if (!emb || typeof emb !== "object" || packaging(emb)) return null;
  const e = emb as Record<string, unknown>;
  const values = [num(e.peso), num(e.largura), num(e.altura), num(e.comprimento)].map((v) => (v > 0 ? v : 0)) as [number, number, number, number];
  return values.some((v) => v > 0) ? values : null;
}

/** Mínimo e máximo de unidades da linha da API (qtde_minima/qtde_maxima; sem máximo = 999.999). */
export function rowLimits(row: ApiRow | undefined): { min: number; max: number } {
  return { min: num(row?.qtde_minima) || 1, max: num(row?.qtde_maxima) || 999_999 };
}

/**
 * Faixa de quantidade da variação (ex.: Caderno "De 11 até 100" = 11 a 100 unidades), só quando difere da do
 * produto (a da primeira linha): `mn`/`mx`. O pedido, o carrinho e a página de produto respeitam a da variação.
 */
export function variationLimits(row: ApiRow, first: ApiRow | undefined): Pick<Variation, "mn" | "mx"> {
  const own = rowLimits(row);
  const base = rowLimits(first);
  return { ...(own.min !== base.min ? { mn: own.min } : {}), ...(own.max !== base.max ? { mx: own.max } : {}) };
}

/** Limites da medida livre (m²) da linha, em metros; 0 = sem limite. */
export function rowSize(row: ApiRow): CustomSize {
  return {
    minWidth: num(row.largura_minima),
    maxWidth: num(row.largura_maxima),
    minHeight: num(row.altura_minima),
    maxHeight: num(row.altura_maxima),
    minArea: num(row.tamanho_minimo),
    maxArea: num(row.tamanho_maximo),
  };
}

const sizeTuple = (s: CustomSize): [number, number, number, number, number, number] => [s.minWidth, s.maxWidth, s.minHeight, s.maxHeight, s.minArea, s.maxArea];

/**
 * Medida livre da variação quando difere da do produto: `lm` = limites próprios (ex.: Impressão em PS "Até 15x21cm" com
 * máximo de 0,15 × 0,21 m, revisão da Padrão de 25/10/2026) e `a: 0` na variação de preço fixo de um grupo que mistura
 * m² e peça (Faixa, grupo 37). Ler sempre por sizeLimitsOf/variationUsesArea (pricing.ts).
 */
export function variationSize(row: ApiRow, product: CustomSize | null): Pick<Variation, "lm" | "a"> {
  if (!product) return {};
  if (row.informa_medida !== 1) return { a: 0 };
  const own = sizeTuple(rowSize(row));
  const base = sizeTuple(product);
  return own.some((v, i) => v !== base[i]) ? { lm: own } : {};
}

/**
 * Chave para juntar grafias da mesma opção que a API manda diferentes dentro de um grupo (Imã de Geladeira, 23/10/2026:
 * "4/0 (Colorido só Frente)" e "4/0 (colorido só frente)", "Papel Supremo 250gr" e "250g", "1008" e "1008 unidades").
 */
export function optionKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/(\d)\s*gr\b/g, "$1g")
    .replace(/^(\d[\d.]*)\s*unidades?$/, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * As linhas com as grafias repetidas juntadas: em cada opção, valores com a mesma `optionKey` passam a usar a grafia mais
 * comum no grupo (no empate, a primeira que aparece). O pedido vai pelo ID da variação: só o rótulo muda.
 */
export function normalizeOptionValues<T extends { variacoes?: Record<string, string> }>(rows: readonly T[]): T[] {
  const tally = new Map<string, Map<string, Map<string, number>>>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row.variacoes ?? {})) {
      if (!value) continue;
      const byKey = tally.get(key) ?? new Map<string, Map<string, number>>();
      tally.set(key, byKey);
      const spellings = byKey.get(optionKey(value)) ?? new Map<string, number>();
      byKey.set(optionKey(value), spellings);
      spellings.set(value, (spellings.get(value) ?? 0) + 1);
    }
  }
  const canonical = (key: string, value: string) => {
    const spellings = tally.get(key)?.get(optionKey(value));
    if (!spellings || spellings.size < 2) return value;
    return [...spellings.entries()].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
  };
  return rows.map((row) => (row.variacoes ? { ...row, variacoes: Object.fromEntries(Object.entries(row.variacoes).map(([k, v]) => [k, v ? canonical(k, v) : v])) } : row));
}

/**
 * LED Neon montado pelo cliente e cobrado por m²: "frase" (Crie sua Frase, customização 2, medida pelo texto) ou "logo"
 * (Logotipo: customização 4 com medida digitada, `informa_medida` 1). A customização 4 sozinha não basta: o Led Neon
 * Número (298, novo em 25/10/2026) também vem com 4, mas é peça de preço fixo.
 */
export function neonMode(rows: readonly ApiRow[]): "frase" | "logo" | null {
  const tipo = rows[0]?.customizacao?.tipo;
  if (tipo === 2) return "frase";
  return tipo === 4 && rows.some((r) => r.informa_medida === 1) ? "logo" : null;
}


type GroupLike = Pick<ApiGrupo, "id" | "nome" | "categoria"> & Partial<ApiGrupo>;

/**
 * Grupo da API (GET /grupos) + as variações dele (GET /produtos?id_grupo=) → produto do catálogo.
 * `featured`: o grupo está nos "Nossos Destaques" da vitrine. `site`: domínio do site oficial (sourceUrl).
 * `source`: origem do produto quando não é a API da Padrão ("site" = API própria, /api/novos).
 */
export function mapGroup(grupo: GroupLike, apiRows: readonly ApiRow[], { featured = false, site = "https://padraocolor.com.br", source }: { featured?: boolean; site?: string; source?: "site" } = {}): Product {
  const rows = normalizeOptionValues(apiRows);
  const options: Record<string, string[]> = {};
  for (const row of rows) {
    for (const [key, value] of Object.entries(row.variacoes ?? {})) {
      if (!value) continue;
      options[key] ??= [];
      if (!options[key].includes(value)) options[key].push(value);
    }
  }

  const first = rows[0];
  const m2Row = rows.find((r) => r.informa_medida === 1);
  // Medida livre (m²): o preço da variação é por m² (formato 1x1). Limites "0" = sem limite.
  const customSize = m2Row ? rowSize(m2Row) : null;
  const neon = neonMode(rows);

  // Customização por variação (regras em src/lib/customizacao.ts): perfis distintos no produto, índice na variação.
  const custom = perfisDeCustomizacao(rows as Parameters<typeof perfisDeCustomizacao>[0], grupo.nome);
  // Acabamentos extras (serrilha, furo, laminação…): tabela distinta no produto, índices na variação.
  const finishes = tabelaDeAcabamentos(rows);
  const variations: Variation[] = rows.map((row, i) => {
    const em = packaging(row.embalagem);
    const ei = partialPackaging(row.embalagem);
    return {
      id: row.id,
      p: row.preco?.economico ?? 0,
      pe: row.preco?.expresso ?? row.preco?.economico ?? 0,
      q: num(row.quantidade) || 1,
      d: row.prazo?.economico ?? null,
      de: row.prazo?.expresso ?? null,
      v: row.variacoes ?? {},
      ...(em ? { em } : {}),
      ...(ei ? { ei } : {}),
      ...variationLimits(row, first),
      ...variationSize(row, customSize),
      ...(custom.indices[i] ? { cz: custom.indices[i] } : {}),
      ...(finishes.indices[i].length ? { ac: finishes.indices[i] } : {}),
    };
  });

  const priced = variations.filter((v) => v.p > 0);
  const cheapest = priced.reduce<Variation | null>((best, v) => (!best || v.p < best.p ? v : best), null);
  const leads = variations.map((v) => v.d).filter((d): d is number => typeof d === "number" && d > 0);
  const sizesRow = rows.find((r) => r.quantidade_tamanho && r.quantidade_tamanho !== "Não");
  const images = [grupo.imagem, ...rows.flatMap((r) => [r.imagem_1, r.imagem_2, r.imagem_3, r.imagem_4])].filter((v): v is string => Boolean(v));

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
    image: grupo.imagem ?? "",
    images: [...new Set(images)].slice(0, 6),
    options,
    variations,
    variationCount: variations.length,
    // LED montado pelo cliente: o "a partir de" é a área mínima (0,25 m²) no menor preço do m², por peça.
    price: neon && cheapest ? Math.round(cheapest.p * NEON_MIN_AREA_M2 * 100) / 100 : (cheapest?.p ?? grupo.preco ?? 0),
    priceQty: neon ? 1 : (cheapest?.q ?? 1),
    leadDays: leads.length ? Math.min(...leads) : null,
    featured,
    bestSeller: sim(grupo.mais_vendido),
    isNew: sim(grupo.lancamento),
    sourceUrl: `${site}/produto/${grupo.id}-${officialSlug(grupo.nome)}`,
    related: (grupo.veja_tambem ?? []).map((r) => r.id),
    sizes: sizesRow && typeof sizesRow.quantidade_tamanho === "object" ? Object.values(sizesRow.quantidade_tamanho).filter(Boolean) : null,
    sizeChart: parseSizeChart(grupo.informacao ?? []),
    customSize,
    ...(neon ? { neon } : {}),
    customizacoes: custom.perfis,
    ...(finishes.tabela.length ? { acabamentos: finishes.tabela } : {}),
    minQty: rowLimits(first).min,
    maxQty: rowLimits(first).max,
    ...(source ? { source } : {}),
  };
}

// ------------------------------------------------------------------------------------- categorias

type ApiCategoriaLike = { id: number; nome: string; imagem?: string; banner?: string; banner_mobile?: string; meta_title?: string; meta_description?: string };

/** Categorias da API (GET /categorias) com contagem, capa, menor prazo e menor preço dos produtos dela. */
export function buildCategories(categorias: readonly ApiCategoriaLike[], products: readonly Product[]) {
  const bySlug = new Map<string, Product[]>();
  for (const p of products) {
    const list = bySlug.get(p.categorySlug) ?? [];
    list.push(p);
    bySlug.set(p.categorySlug, list);
  }
  return categorias
    .map((c) => {
      const slug = slugify(c.nome);
      const list = bySlug.get(slug) ?? [];
      if (!list.length) return null;
      const lead = list.map((p) => p.leadDays).filter((d): d is number => typeof d === "number");
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
    .filter((c): c is NonNullable<typeof c> => c !== null);
}
