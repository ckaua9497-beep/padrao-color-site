import type { Metadata } from "next";
import data from "@/data/catalog.json";
import novosData from "@/data/catalog-novos.json";
import storefrontData from "@/data/storefront.json";
import businessTypesData from "@/data/business-types.json";
import { mergeCatalogs, type CatalogFile } from "./catalog-merge";

/*
 * Catálogo gerado da API Padrão Color por scripts/sync-catalog.mjs (npm run sync:catalog).
 * Produto = grupo da API (uma página); variação = produto da API (combinação vendável, com preço e prazo).
 */

export type Variation = {
  /** ID do produto na API (vai no pedido). */
  id?: number;
  /** Preço no prazo econômico (por m² quando o produto tem medida livre). */
  p: number;
  /** Preço no prazo expresso. */
  pe?: number;
  /** Quantidade do preço (ex.: 1000 cartões). */
  q: number;
  /** Prazo econômico em dias úteis. */
  d: number | null;
  /** Prazo expresso em dias úteis. */
  de?: number | null;
  v: Record<string, string>;
  /** Embalagem de envio (frete): [peso kg, largura, altura, comprimento cm, lotes por caixa]. */
  em?: [number, number, number, number, number];
  /** Embalagem incompleta na Padrão (sem `em`): [peso kg, largura, altura, comprimento cm], 0 no que falta. Não cota. */
  ei?: [number, number, number, number];
  /**
   * Faixa de quantidade da variação, quando difere da do produto (ex.: Caderno "De 11 até 100"): mínimo e
   * máximo de unidades. Sem eles, valem o minQty/maxQty do produto. Ver unitLimits (pricing.ts).
   */
  mn?: number;
  mx?: number;
};

export type InfoBlock = { title: string; text: string };

export type SizeChartRow = { size: string; widthCm: number; lengthCm: number };

/** Medida livre (preço por m²). Valores em metros; 0 = sem limite. */
export type CustomSize = { minWidth: number; maxWidth: number; minHeight: number; maxHeight: number; minArea: number; maxArea: number };

export type Product = {
  id: string;
  groupId?: number;
  slug: string;
  name: string;
  category: string;
  categoryId?: number;
  categorySlug: string;
  description: string;
  summary?: string;
  info?: InfoBlock[];
  /** URL do gabarito (.zip/.rar) na API, ou null. */
  template?: string | null;
  tags?: string[];
  metaTitle?: string;
  metaDescription?: string;
  image: string;
  images: string[];
  options: Record<string, string[]>;
  variations: Variation[];
  variationCount: number;
  price: number;
  priceQty: number;
  leadDays: number | null;
  featured: boolean;
  bestSeller: boolean;
  isNew: boolean;
  sourceUrl: string;
  related?: number[];
  /** Grade de tamanhos de vestuário (P, M, G…), quando houver. */
  sizes?: string[] | null;
  /** Medidas por tamanho, lidas da "Tabela de Medidas" da API. */
  sizeChart?: SizeChartRow[] | null;
  customSize?: CustomSize | null;
  web2print?: boolean;
  /** Preço do serviço de criação de arte, quando a API informa. */
  artCreationPrice?: number | null;
  attachments?: string[];
  minQty?: number;
  maxQty?: number;
  /** "site" = produto novo da API própria (/api/novos), que a Padrão ainda não tem: sem tabela de revenda nem pedido direto. */
  source?: "padrao" | "site";
};

export type Category = {
  id?: number;
  slug: string;
  name: string;
  count: number;
  image: string;
  banner?: string | null;
  bannerMobile?: string | null;
  metaTitle?: string;
  metaDescription?: string;
  minLeadDays: number | null;
  minPrice: number;
};

export type ProductSummary = Pick<
  Product,
  "id" | "groupId" | "slug" | "name" | "category" | "categorySlug" | "image" | "price" | "priceQty" | "leadDays" | "isNew" | "bestSeller"
> & {
  /** Vendido por m² (medida livre): o preço do card é por m². */
  perM2?: boolean;
};

/** Largura × altura reais da imagem em px (lidas pelo sync; ausentes em dados antigos). */
export type ImageSize = { w: number; h: number };

/** Vitrine do padraocolor.com.br (GET /configuracoes). */
export type Storefront = {
  generatedAt: string;
  banners: { name: string; desktop: string; mobile: string; href: string | null; desktopSize?: ImageSize | null; mobileSize?: ImageSize | null }[];
  buttons: { name: string; image: string; href: string | null; newTab: boolean; row: number; size?: ImageSize | null }[];
  featuredCategories: { id: number; name: string; image: string; price: number; slug: string }[];
  /** IDs de grupo dos "Nossos Destaques", na ordem do site oficial. */
  highlights: number[];
  /** IDs de grupo dos "Produtos mais Vendidos". */
  bestSellers: number[];
  menu: { categoryId: number; name: string; slug: string; groups: { id: number; name: string }[] }[];
  headerText: string | null;
  topHeader: { image: string; href: string | null } | null;
};

export type BusinessType = {
  id: string;
  slug: string;
  name: string;
  image: string;
  banner: string | null;
  metaTitle: string;
  metaDescription: string;
  groupIds: number[];
};

// Catálogo da Padrão (sync:catalog) + produtos novos da API própria (sync:novos).
const catalog = mergeCatalogs(data as unknown as CatalogFile, novosData as unknown as CatalogFile);

/** Categorias dos produtos novos (API própria): na home elas vêm logo depois das em destaque. */
const NEW_CATEGORY_SLUGS = new Set((novosData as unknown as CatalogFile).categories.map((c) => c.slug));

export const storefront = storefrontData as unknown as Storefront;
export const businessTypes = businessTypesData as unknown as BusinessType[];

export { STORE } from "./store";

export function getCategories(): Category[] {
  return catalog.categories;
}

export function getCategory(slug: string): Category | undefined {
  return catalog.categories.find((c) => c.slug === slug);
}

export function getProducts(): Product[] {
  return catalog.products;
}

export function getProduct(slug: string): Product | undefined {
  return catalog.products.find((p) => p.slug === slug);
}

/** Produto pelo ID do catálogo ("180", "tags") ou pelo slug ("180-tag"). */
export function getProductById(idOrSlug: string): Product | undefined {
  return catalog.products.find((p) => p.id === idOrSlug) ?? getProduct(idOrSlug);
}

/** Produtos com gabarito (campo `gabarito` de GET /grupos), em ordem alfabética. */
export function getTemplateProducts(): Product[] {
  return catalog.products.filter((p) => p.template).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/** "Para o seu negócio" (GET /tiposnegocio), só os tipos com produto no catálogo. */
export function getBusinessTypes(): BusinessType[] {
  return businessTypes.filter((t) => t.groupIds.length > 0);
}

export function getBusinessType(slug: string): BusinessType | undefined {
  return getBusinessTypes().find((t) => t.slug === slug);
}

export function getBusinessProducts(type: BusinessType): Product[] {
  return getProductsByGroupIds(type.groupIds);
}

/**
 * Título de SEO a partir do meta title da API. Quando ele já traz a marca ("… - Padrão Color"),
 * vale sozinho; senão entra no modelo "%s | Padrão Color" do layout.
 */
export function seoTitle(metaTitle: string | undefined, fallback: string): Metadata["title"] {
  const title = (metaTitle || fallback).trim();
  return /padr[aã]o\s*color/i.test(title) ? { absolute: title } : title;
}

/** Produto pelo ID do grupo na API (o "Tags" derivado não entra: ele tem ID próprio). */
export function getProductByGroupId(groupId: number): Product | undefined {
  return catalog.products.find((p) => p.groupId === groupId && p.id === String(groupId));
}

export function getProductsByCategory(slug: string): Product[] {
  return catalog.products.filter((p) => p.categorySlug === slug);
}

/** Produtos na ordem da lista de IDs de grupo (ignora os que não existem mais). */
export function getProductsByGroupIds(ids: number[]): Product[] {
  return ids.map((id) => getProductByGroupId(id)).filter((p): p is Product => Boolean(p));
}

/**
 * Vitrine na ordem do padraocolor.com.br: "Destaques" e "Produtos mais Vendidos" da configuração do site
 * (GET /configuracoes), depois os demais marcados como destaque, mais vendido ou lançamento.
 */
export function getFeatured(): Product[] {
  const official = getProductsByGroupIds([...storefront.highlights, ...storefront.bestSellers]);
  const flagged = catalog.products
    .filter((p) => p.featured || p.bestSeller || p.isNew)
    .sort((a, b) => Number(b.featured) - Number(a.featured) || Number(b.bestSeller) - Number(a.bestSeller) || Number(b.isNew) - Number(a.isNew));
  return [...new Set([...official, ...flagged])];
}

/** Categorias da home: as "Categorias em Destaque" do site oficial primeiro, na ordem de lá; depois as demais. */
export function getShowcaseCategories(): Category[] {
  const featured = storefront.featuredCategories.map((c) => getCategory(c.slug)).filter((c): c is Category => Boolean(c));
  const fresh = catalog.categories.filter((c) => NEW_CATEGORY_SLUGS.has(c.slug));
  return [...new Set([...featured, ...fresh, ...catalog.categories])];
}

/** "Veja também" da API; completa com a mesma categoria. */
export function getRelated(product: Product, limit = 10): Product[] {
  const fromApi = getProductsByGroupIds(product.related ?? []).filter((p) => p.slug !== product.slug);
  const sameCategory = catalog.products.filter((p) => p.categorySlug === product.categorySlug && p.slug !== product.slug && !fromApi.includes(p));
  return [...fromApi, ...sameCategory].slice(0, limit);
}

export function searchProducts(term: string): Product[] {
  const needle = normalize(term);
  if (!needle) return catalog.products;
  const words = needle.split(" ").filter(Boolean);
  return catalog.products.filter((p) => {
    const haystack = normalize(`${p.name} ${p.category} ${(p.tags ?? []).join(" ")}`);
    return words.every((w) => haystack.includes(w));
  });
}

export function toSummary(p: Product): ProductSummary {
  return {
    id: p.id,
    groupId: p.groupId,
    slug: p.slug,
    name: p.name,
    category: p.category,
    categorySlug: p.categorySlug,
    image: p.image,
    price: p.price,
    priceQty: p.priceQty,
    leadDays: p.leadDays,
    isNew: p.isNew,
    bestSeller: p.bestSeller,
    ...(p.customSize ? { perM2: true } : {}),
  };
}

/** Índice leve da busca do topo (servido em /produtos/indice.json). */
export type SearchEntry = { s: string; n: string; c: string; i: string; p: number; q: number; g?: number; t?: string; m?: 1 };

export function getSearchIndex(): SearchEntry[] {
  return catalog.products.map((p) => ({
    s: p.slug,
    n: p.name,
    c: p.category,
    i: p.image,
    p: p.price,
    q: p.priceQty,
    ...(p.groupId ? { g: p.groupId } : {}),
    ...(p.tags?.length ? { t: p.tags.join(" ") } : {}),
    ...(p.customSize ? { m: 1 as const } : {}),
  }));
}

export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const CATALOG_STATS = {
  products: catalog.products.length,
  categories: catalog.categories.length,
  minLeadDays: Math.min(...catalog.products.map((p) => p.leadDays ?? 99)),
  generatedAt: catalog.generatedAt,
};
