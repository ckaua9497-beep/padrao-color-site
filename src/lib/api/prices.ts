import "server-only";

import { getProductByGroupId, getProducts, type CustomSize, type Product, type Variation } from "../catalog";
import type { LinePrices } from "../orders";
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
  reseller: boolean;
  /** Produto novo da API própria (/api/novos): a Padrão ainda não tem; sem tabela de revenda nem pedido direto. */
  local: boolean;
  variations: Variation[];
  /** Mínimo e máximo de unidades do produto (qtde_minima/qtde_maxima do catálogo; 0 = sem máximo). */
  minQty: number;
  maxQty: number;
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
  const base = { groupId, category: product.category, customSize: product.customSize ?? null, local: product.source === "site", ...quantityLimits(product) };
  // Produto novo (API própria): não existe na API da Padrão, então não há tabela de revenda para buscar.
  if (!account?.reseller || base.local) return { ...base, reseller: false, variations: product.variations };
  const variations = await resellerTable(groupId, account, cacheOnly);
  // Grupo sem tabela de revenda na API: fica no preço de balcão.
  if (!variations.some((variation) => variation.p > 0)) return { ...base, reseller: false, variations: product.variations };
  return { ...base, reseller: true, variations };
}

/** "A partir de" do card: a variação mais barata com preço (mesmo critério do scripts/sync-catalog.mjs). */
export function fromPrice(variations: Variation[]): { p: number; q: number } | null {
  let best: Variation | null = null;
  for (const variation of variations) if (variation.p > 0 && (!best || variation.p < best.p)) best = variation;
  return best ? { p: best.p, q: best.q } : null;
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
    reseller: prices.reseller,
    limits: { minQty: prices.minQty, maxQty: prices.maxQty },
    ...(prices.local && ordersOn ? { orderable: false } : {}),
  };
}
