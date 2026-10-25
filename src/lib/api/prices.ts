import "server-only";

import { getProductByGroupId, getProducts, type CustomSize, type Product, type Variation } from "../catalog";
import type { LinePrices } from "../orders";
import { NEON_MIN_AREA_M2 } from "../pricing";
import { applyResellerDiscount, resellerDiscountRate, variationsFromApi, type ResellerAccount } from "../reseller";
import { ApiError } from "./client";
import { getProdutos } from "./padrao";

/*
 * Preços por cliente no servidor (GET /api/precos e POST /api/pedidos).
 * Balcão = variações do catálogo (sincronizado da API com a tabela "CLIENTE FINAL").
 * Revendedor = GET /produtos?id_grupo= com o token dele (a API devolve a tabela do cliente), com cache curto
 * por cliente e grupo. O desconto da categoria (Prata/Ouro) é aplicado depois, em linePricesFor.
 */

export type PriceAccount = ResellerAccount & { id: number; token: string; reseller: boolean };

/** Preços de um grupo sem o desconto da categoria. */
export type GroupPrices = {
  groupId: number;
  /** Categoria do catálogo (define o segmento do desconto de revenda). */
  category: string;
  customSize: CustomSize | null;
  /** LED Neon montado pelo cliente (Frase/Logotipo), cobrado por m² com mínimo de 0,25 m² por peça. */
  neon: "frase" | "logo" | null;
  reseller: boolean;
  /** Produto novo da API própria (/api/novos): a Padrão ainda não tem; sem tabela de revenda nem pedido direto. */
  local: boolean;
  variations: Variation[];
  /** Mínimo e máximo de unidades do produto (qtde_minima/qtde_maxima do catálogo; 0 = sem máximo). */
  minQty: number;
  maxQty: number;
  /** Acabamentos extras (catálogo): a tabela e os índices de cada variação; null quando o produto não tem. */
  acabamentos: LinePrices["acabamentos"];
};

const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 2_000;
const tables = new Map<string, { at: number; variations: Variation[] }>();
/** Consultas em andamento por cliente e grupo (só o sucesso vai para `tables`; erro não fica em cache). */
const flying = new Map<string, Promise<Variation[]>>();

export function catalogProduct(groupId: number): Product | undefined {
  return getProductByGroupId(groupId) ?? getProducts().find((product) => product.groupId === groupId);
}

/** Limites de quantidade do produto (os mesmos que a página de produto aplica). */
export function quantityLimits(product: Product): { minQty: number; maxQty: number } {
  return { minQty: Math.max(1, product.minQty ?? 1), maxQty: Math.max(0, product.maxQty ?? 0) };
}

/** Acabamentos extras do produto para o preço: tabela e índices por ID de variação (o preço é sempre o do catálogo). */
export function productFinishes(product: Product): LinePrices["acabamentos"] {
  if (!product.acabamentos?.length) return null;
  const porVariacao = Object.fromEntries(product.variations.filter((v) => v.id !== undefined && v.ac?.length).map((v) => [String(v.id), v.ac as number[]]));
  return { tabela: product.acabamentos, porVariacao };
}

/** Faixas próprias das variações (Caderno "De 11 até 100"): id → [mínimo, máximo] em unidades. */
export function variationQuantityLimits(product: Product): Record<string, [number, number]> | undefined {
  const entries = product.variations.filter((v) => v.mn !== undefined || v.mx !== undefined).map((v): [string, [number, number]] => [String(v.id), [v.mn ?? product.minQty ?? 1, v.mx ?? product.maxQty ?? 0]]);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

async function resellerTable(groupId: number, account: PriceAccount, cacheOnly = false): Promise<Variation[]> {
  const key = `${account.id}:${groupId}`;
  const hit = tables.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.variations;
  if (cacheOnly) throw new ApiError(503, "Tabela de revenda fora do cache com a API sem conexão.", false);
  const pending = flying.get(key);
  if (pending) return pending;
  const request = getProdutos({ id_grupo: groupId }, account.token)
    .then((rows) => {
      const variations = variationsFromApi(rows);
      if (tables.size >= MAX_ENTRIES) {
        const oldest = tables.keys().next().value;
        if (oldest !== undefined) tables.delete(oldest);
      }
      tables.set(key, { at: Date.now(), variations });
      return variations;
    })
    .finally(() => flying.delete(key));
  flying.set(key, request);
  return request;
}

/**
 * Preços do grupo para a conta: tabela de revenda (API) ou balcão (catálogo). null = grupo fora do catálogo.
 * `cacheOnly`: só o que já está no cache (API sem conexão); sem ele, ApiError 503.
 */
export async function groupPrices(groupId: number, account: PriceAccount | null, { cacheOnly = false } = {}): Promise<GroupPrices | null> {
  const product = catalogProduct(groupId);
  if (!product) return null;
  const base = { groupId, category: product.category, customSize: product.customSize ?? null, neon: product.neon ?? null, local: product.source === "site", ...quantityLimits(product), acabamentos: productFinishes(product) };
  // Produto novo (API própria): não existe na API da Padrão, então não há tabela de revenda para buscar.
  if (!account?.reseller || base.local) return { ...base, reseller: false, variations: product.variations };
  const variations = await resellerTable(groupId, account, cacheOnly);
  // Grupo sem tabela de revenda na API: fica no preço de balcão.
  if (!variations.some((variation) => variation.p > 0)) return { ...base, reseller: false, variations: product.variations };
  // A tabela de revenda vem crua da API: os limites próprios da medida e a marca de preço fixo saem do catálogo (mesmo ID).
  const own = new Map(product.variations.map((v) => [v.id, v]));
  const withSize = variations.map((v) => {
    const mine = v.id !== undefined ? own.get(v.id) : undefined;
    return mine && (mine.lm || mine.a === 0) ? { ...v, ...(mine.lm ? { lm: mine.lm } : {}), ...(mine.a === 0 ? { a: 0 as const } : {}) } : v;
  });
  return { ...base, reseller: true, variations: withSize };
}

/**
 * "A partir de" do card: a variação mais barata com preço (mesmo critério do src/lib/catalog-map.ts). No LED montado pelo
 * cliente (`neon`), o preço da variação é o do m²: o "a partir de" é a área mínima (0,25 m²) nele, por peça.
 */
export function fromPrice(variations: Variation[], { neon = false }: { neon?: boolean } = {}): { p: number; q: number } | null {
  let best: Variation | null = null;
  for (const variation of variations) if (variation.p > 0 && (!best || variation.p < best.p)) best = variation;
  if (!best) return null;
  return neon ? { p: Math.round(best.p * NEON_MIN_AREA_M2 * 100) / 100, q: 1 } : { p: best.p, q: best.q };
}

/**
 * Preços prontos para o pedido: variações com o desconto da categoria de revenda (quando houver) e limites.
 * `ordersOn` (pedido real ligado): produto novo da API própria não vai para o gerarpedido, porque o ID da
 * variação dele não existe na Padrão.
 */
export function linePricesFor(prices: GroupPrices, account: ResellerAccount | null, { ordersOn = false } = {}): LinePrices {
  const rate = prices.reseller && account ? resellerDiscountRate(account, prices.category) : 0;
  return {
    groupId: prices.groupId,
    variations: applyResellerDiscount(prices.variations, rate),
    customSize: prices.customSize,
    neon: prices.neon,
    reseller: prices.reseller,
    limits: { minQty: prices.minQty, maxQty: prices.maxQty },
    acabamentos: prices.acabamentos,
    ...(prices.local && ordersOn ? { orderable: false } : {}),
  };
}
