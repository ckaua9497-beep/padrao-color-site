// Mapeamento "API no formato da Padrão Color → catálogo do site", usado pelos dois sincronizadores:
// scripts/sync-catalog.mjs (API da Padrão) e scripts/sync-novos.mjs (API própria do site, /api/novos).
// Mesma regra para os dois: um produto novo entra no site exatamente como um produto da Padrão.

import { perfisDeCustomizacao } from "../../src/lib/customizacao.ts";

// ------------------------------------------------------------------------------------- texto

/** Slug do site oficial (padraocolor.com.br/produto/35-banner---medida-personalizada): não junta hifens. */
export const officialSlug = (value) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s/g, "-");

/** Slug das rotas de categoria do site novo (mantém as URLs já publicadas). */
export const slugify = (value) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const sim = (value) => value === "Sim" || value === "S" || value === true;
export const num = (value) => {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** "- P: Largura 50 cm | Comprimento 68 cm" → { size: "P", widthCm: 50, lengthCm: 68 } */
export function parseSizeChart(info) {
  const block = info.find((b) => /medida/i.test(b.titulo));
  if (!block) return null;
  const rows = [];
  for (const line of block.texto.split(/\n/)) {
    const m = /^\s*-?\s*([^:]+?):\s*Largura\s*([\d,.]+)\s*cm?\s*\|\s*Comprimento\s*([\d,.]+)/i.exec(line);
    if (m) rows.push({ size: m[1].trim(), widthCm: num(m[2]), lengthCm: num(m[3]) });
  }
  return rows.length ? rows : null;
}

// ------------------------------------------------------------------------------------- imagens

/** Largura × altura de PNG, GIF, WEBP ou JPEG a partir dos primeiros bytes do arquivo. */
export function parseImageSize(buf) {
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

/**
 * Linhas de GET /produtos?id_grupo= que são variações de verdade (com `id` numérico). A API às vezes responde 200 com
 * linhas de erro no lugar das variações (grupo 532 em 23/10/2026: `[{"ERRO":"Bad Response"}]`); `invalid` traz as
 * descartadas para o aviso do sincronizador.
 */
export function variationRows(data) {
  const list = Array.isArray(data) ? data : data == null ? [] : [data];
  const rows = list.filter((row) => row && typeof row === "object" && Number.isInteger(row.id) && row.id > 0 && !("ERRO" in row));
  return { rows, invalid: list.filter((row) => !rows.includes(row)) };
}

/**
 * Grupo da API (GET /grupos) + as variações dele (GET /produtos?id_grupo=) → produto do catálogo.
 * `featured`: o grupo está nos "Nossos Destaques" da vitrine. `site`: domínio do site oficial (sourceUrl).
 * `source`: origem do produto quando não é a API da Padrão ("site" = API própria, /api/novos).
 */
/**
 * Embalagem de envio da variação (frete pela API de frete da Padrão): [peso kg, largura, altura, comprimento cm, lotes por
 * caixa]. Só com todas as medidas positivas; sem ela, o frete do produto não pode ser cotado.
 */
export function packaging(emb) {
  if (!emb || typeof emb !== "object") return null;
  const values = [num(emb.peso), num(emb.largura), num(emb.altura), num(emb.comprimento), num(emb.quantidade) || 1];
  return values.every((v) => Number.isFinite(v) && v > 0) ? values : null;
}

/**
 * Embalagem incompleta na Padrão (algo cadastrado, algo zerado; ex.: neon com caixa e peso 0, agenda com peso e caixa
 * 0): [peso kg, largura, altura, comprimento cm], com 0 no que falta. Não cota (o checkout manda para o WhatsApp).
 */
export function partialPackaging(emb) {
  if (!emb || typeof emb !== "object" || packaging(emb)) return null;
  const values = [num(emb.peso), num(emb.largura), num(emb.altura), num(emb.comprimento)].map((v) => (v > 0 ? v : 0));
  return values.some((v) => v > 0) ? values : null;
}

/** Mínimo e máximo de unidades da linha da API (qtde_minima/qtde_maxima; sem máximo = 999.999). */
export function rowLimits(row) {
  return { min: num(row?.qtde_minima) || 1, max: num(row?.qtde_maxima) || 999_999 };
}

/**
 * Faixa de quantidade da variação (ex.: Caderno "De 11 até 100" = 11 a 100 unidades), só quando difere da do
 * produto (a da primeira linha): `mn`/`mx`. O pedido, o carrinho e a página de produto respeitam a da variação.
 */
export function variationLimits(row, first) {
  const own = rowLimits(row);
  const base = rowLimits(first);
  return { ...(own.min !== base.min ? { mn: own.min } : {}), ...(own.max !== base.max ? { mx: own.max } : {}) };
}

export function mapGroup(grupo, rows, { featured = false, site = "https://padraocolor.com.br", source } = {}) {
  const options = {};
  for (const row of rows) {
    for (const [key, value] of Object.entries(row.variacoes ?? {})) {
      if (!value) continue;
      options[key] ??= [];
      if (!options[key].includes(value)) options[key].push(value);
    }
  }

  // Customização por variação (regras em src/lib/customizacao.ts): perfis distintos no produto, índice na variação.
  const custom = perfisDeCustomizacao(rows, grupo.nome);
  const variations = rows.map((row, i) => ({
    id: row.id,
    p: row.preco?.economico ?? 0,
    pe: row.preco?.expresso ?? row.preco?.economico ?? 0,
    q: num(row.quantidade) || 1,
    d: row.prazo?.economico ?? null,
    de: row.prazo?.expresso ?? null,
    v: row.variacoes ?? {},
    ...(packaging(row.embalagem) ? { em: packaging(row.embalagem) } : {}),
    ...(partialPackaging(row.embalagem) ? { ei: partialPackaging(row.embalagem) } : {}),
    ...variationLimits(row, rows[0]),
    ...(custom.indices[i] ? { cz: custom.indices[i] } : {}),
  }));

  const priced = variations.filter((v) => v.p > 0);
  const cheapest = priced.reduce((best, v) => (!best || v.p < best.p ? v : best), null);
  const leads = variations.map((v) => v.d).filter((d) => typeof d === "number" && d > 0);
  const first = rows[0];
  const sizesRow = rows.find((r) => r.quantidade_tamanho && r.quantidade_tamanho !== "Não");
  const m2Row = rows.find((r) => r.informa_medida === 1);
  const images = [grupo.imagem, ...rows.flatMap((r) => [r.imagem_1, r.imagem_2, r.imagem_3, r.imagem_4])].filter(Boolean);

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
    featured,
    bestSeller: sim(grupo.mais_vendido),
    isNew: sim(grupo.lancamento),
    sourceUrl: `${site}/produto/${grupo.id}-${officialSlug(grupo.nome)}`,
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
    customizacoes: custom.perfis,
    minQty: rowLimits(first).min,
    maxQty: rowLimits(first).max,
    ...(source ? { source } : {}),
  };
}

// ------------------------------------------------------------------------------------- categorias

/** Categorias da API (GET /categorias) com contagem, capa, menor prazo e menor preço dos produtos dela. */
export function buildCategories(categorias, products) {
  const bySlug = new Map();
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
}
