import "server-only";

import { getProductByGroupId, getProducts, type CustomSize, type Product, type Variation } from "../catalog";
import type { LinePrices } from "../orders";
import { applyResellerDiscount, resellerDiscountRate, variationsFromApi, type ResellerAccount } from "../reseller";
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
  variations: Variation[];
  /** Mínimo e máximo de unidades do produto (qtde_minima/qtde_maxima do catálogo; 0 = sem máximo). */
  minQty: number;
  maxQty: number;
};

const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 2_000;
const tables = new Map<string, { at: number; variations: Variation[] }>();

export function catalogProduct(groupId: number): Product | undefined {
  return getProductByGroupId(groupId) ?? getProducts().find((product) => product.groupId === groupId);
}

/** Limites de quantidade do produto (os mesmos que a página de produto aplica). */
export function quantityLimits(product: Product): { minQty: number; maxQty: number } {
  return { minQty: Math.max(1, product.minQty ?? 1), maxQty: Math.max(0, product.maxQty ?? 0) };
}

async function resellerTable(groupId: number, account: PriceAccount): Promise<Variation[]> {
  const key = `${account.id}:${groupId}`;
  const hit = tables.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.variations;
  const variations = variationsFromApi(await getProdutos({ id_grupo: groupId }, account.token));
  if (tables.size >= MAX_ENTRIES) {
    const oldest = tables.keys().next().value;
    if (oldest !== undefined) tables.delete(oldest);
  }
  tables.set(key, { at: Date.now(), variations });
  return variations;
}

/** Preços do grupo para a conta: tabela de revenda (API) ou balcão (catálogo). null = grupo fora do catálogo. */
export async function groupPrices(groupId: number, account: PriceAccount | null): Promise<GroupPrices | null> {
  const product = catalogProduct(groupId);
  if (!product) return null;
  const base = { groupId, category: product.category, customSize: product.customSize ?? null, ...quantityLimits(product) };
  if (!account?.reseller) return { ...base, reseller: false, variations: product.variations };
  const variations = await resellerTable(groupId, account);
  // Grupo sem tabela de revenda na API: fica no preço de balcão.
  if (!variations.some((variation) => variation.p > 0)) return { ...base, reseller: false, variations: product.variations };
  return { ...base, reseller: true, variations };
}

/** Preços prontos para o pedido: variações com o desconto da categoria de revenda (quando houver) e limites. */
export function linePricesFor(prices: GroupPrices, account: ResellerAccount | null): LinePrices {
  const rate = prices.reseller && account ? resellerDiscountRate(account, prices.category) : 0;
  return {
    groupId: prices.groupId,
    variations: applyResellerDiscount(prices.variations, rate),
    customSize: prices.customSize,
    reseller: prices.reseller,
    limits: { minQty: prices.minQty, maxQty: prices.maxQty },
  };
}
