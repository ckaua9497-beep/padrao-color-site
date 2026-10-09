import "server-only";

import { headers } from "next/headers";
import { cache } from "react";
import { getProducts, toSummary, type Product, type ProductSummary } from "../catalog";
import { parseTenantHost, priceProduct, priceSummary } from "./core";
import { getLojaByDomain, getLojaBySubdomain, listLojaProdutos, type Loja } from "./repo";

/*
 * Loja a partir do Host. O proxy (src/proxy.ts) reescreve <loja>.<MULTILOJA_DOMINIO>/caminho para
 * /vitrine/<host>/caminho; as páginas da vitrine chamam lojaDoHost(params.host).
 */

/** Domínio raiz das lojas. Em desenvolvimento, "localhost": http://<loja>.localhost:3100. */
export function rootDomain(): string {
  return process.env.MULTILOJA_DOMINIO?.trim().toLowerCase() || "localhost";
}

/** Hosts do site principal (nunca viram loja), separados por vírgula. */
export function mainHosts(): string[] {
  return (process.env.MULTILOJA_HOSTS_PRINCIPAIS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/** Fator da tabela base sobre o preço de balcão do catálogo (MULTILOJA_FATOR_BASE, padrão 1). */
export function baseFactor(): number {
  const value = Number(process.env.MULTILOJA_FATOR_BASE ?? "1");
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : 1;
}

/** Loja ativa do host (param da rota já decodificado ou não); null = não existe ou está desativada. */
export const lojaDoHost = cache(async (hostParam: string): Promise<Loja | null> => {
  const host = decodeURIComponent(hostParam);
  const parsed = parseTenantHost(host, rootDomain(), mainHosts());
  const loja = parsed.kind === "subdomain" ? await getLojaBySubdomain(parsed.subdomain) : parsed.kind === "custom" ? await getLojaByDomain(parsed.domain) : null;
  return loja?.ativa ? loja : null;
});

/** Endereço público da loja. Em dev mantém a porta do servidor (ex.: http://ana.localhost:3100). */
export async function lojaUrl(loja: Pick<Loja, "subdominio" | "dominio">): Promise<string> {
  if (loja.dominio) return `https://${loja.dominio}`;
  const root = rootDomain();
  if (root === "localhost") {
    const host = (await headers()).get("host") ?? "localhost:3100";
    const port = /:(\d+)$/.exec(host)?.[1];
    return `http://${loja.subdominio}.localhost${port ? `:${port}` : ""}`;
  }
  return `https://${loja.subdominio}.${root}`;
}

export type LojaItem = { product: Product; margin: number; featured: boolean; ativadoEm: string };

/** Produtos ativos da loja que existem no catálogo, com a margem que vale para cada um. */
export const lojaItens = cache(async (lojaId: number, margemPadrao: number): Promise<LojaItem[]> => {
  const byId = new Map(getProducts().map((p) => [p.id, p]));
  return (await listLojaProdutos(lojaId)).flatMap((row) => {
    const product = byId.get(row.produtoId);
    return product ? [{ product, margin: row.margem ?? margemPadrao, featured: row.destaque, ativadoEm: row.ativadoEm }] : [];
  });
});

/** Produto com o preço da loja (todas as variações). */
export function lojaProduct(item: LojaItem): Product {
  return priceProduct(item.product, item.margin, baseFactor());
}

export function lojaSummary(item: LojaItem): ProductSummary {
  return priceSummary(toSummary(item.product), item.margin, baseFactor());
}

export type LojaCategoria = { slug: string; name: string; count: number };

/** Categorias com produto ativo na loja: as em destaque primeiro (na ordem escolhida), depois as com mais produtos. */
export function lojaCategorias(items: LojaItem[], destaque: string[]): LojaCategoria[] {
  const counts = new Map<string, LojaCategoria>();
  for (const { product } of items) {
    const entry = counts.get(product.categorySlug) ?? { slug: product.categorySlug, name: product.category, count: 0 };
    entry.count += 1;
    counts.set(product.categorySlug, entry);
  }
  const rank = (slug: string) => {
    const i = destaque.indexOf(slug);
    return i === -1 ? Infinity : i;
  };
  return [...counts.values()].sort((a, b) => rank(a.slug) - rank(b.slug) || b.count - a.count || a.name.localeCompare(b.name, "pt-BR"));
}
