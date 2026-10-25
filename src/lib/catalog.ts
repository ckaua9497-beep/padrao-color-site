import type { Metadata } from "next";
import data from "@/data/catalog.json";
import novosData from "@/data/catalog-novos.json";
import storefrontData from "@/data/storefront.json";
import businessTypesData from "@/data/business-types.json";
import { mergeCatalogs, type CatalogFile } from "./catalog-merge";
import type { Customizacao } from "./customizacao";
import type { Acabamento } from "./acabamentos";

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
  /** Perfil de customização da variação em `Product.customizacoes` (sem ele, o 0). Ver customizacaoDa. */
  cz?: number;
  /** Acabamentos extras que a variação aceita: índices em `Product.acabamentos`. Ver acabamentosDa. */
  ac?: number[];
  /**
   * Limites próprios da medida livre (m²) da variação, quando diferem dos do produto: [largura mín., máx., altura mín.,
   * máx., área mín., máx.] em metros (0 = sem limite). Ex.: Impressão em PS "Até 15x21cm". Ver sizeLimitsOf (pricing.ts).
   */
  lm?: [number, number, number, number, number, number];
  /** 0 = variação de preço fixo num produto com medida livre (Faixa, grupo 37). Ver variationUsesArea (pricing.ts). */
  a?: 0;
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
  /**
   * LED Neon montado pelo cliente: "frase" (Crie sua Frase, medida pelo texto) ou "logo" (Logotipo, medida digitada).
   * Cobrança mínima de 0,25 m² (NEON_MIN_AREA_M2); `price` já é esse mínimo. Ver neonQuote (pricing.ts).
   */
  neon?: "frase" | "logo";
  /** Perfis de customização das variações (modo da arte, anexos aceitos, criação de arte, web2print). */
  customizacoes?: Customizacao[];
  /** Acabamentos extras distintos das variações (serrilha, furo, laminação…), com preço e prazo. */
  acabamentos?: Acabamento[];
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

/**
 * Produtos novos da API própria (sync:novos) no site. Desligado desde a revisão da Padrão de 25/10/2026: o site só
 * mostra produtos que vêm da API da Padrão. Os dados, a API própria e os modelos 3D continuam no projeto; quando a
 * Padrão cadastrar esses produtos, eles chegam pelo sync:catalog com os IDs dela.
 */
const PRODUTOS_NOVOS_NO_SITE = false;

// Catálogo da Padrão (sync:catalog) + produtos novos da API própria (sync:novos). A junção valida as colisões de ID.
const catalogComNovos = mergeCatalogs(data as unknown as CatalogFile, novosData as unknown as CatalogFile);
const catalog = PRODUTOS_NOVOS_NO_SITE ? catalogComNovos : (data as unknown as CatalogFile);

/** Categorias dos produtos novos (API própria): na home elas vêm logo depois das em destaque. */
const NEW_CATEGORY_SLUGS = new Set(PRODUTOS_NOVOS_NO_SITE ? (novosData as unknown as CatalogFile).categories.map((c) => c.slug) : []);

export const storefront = storefrontData as unknown as Storefront;
export const businessTypes = businessTypesData as unknown as BusinessType[];

export { STORE } from "./store";

/**
 * Consultas sobre um catálogo: o do sync (as exportações abaixo, síncronas) ou o vivo, montado da API no servidor com
 * cache curto (src/lib/catalogo-vivo.ts). Páginas e rotas que mostram produtos usam `await catalogoVivo()` e chamam as
 * mesmas funções nele.
 */
export function catalogView(catalog: Pick<CatalogFile, "categories" | "products">) {
  const bySlug = new Map(catalog.products.map((p) => [p.slug, p]));
  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  // Produto pelo ID do grupo (o derivado que compartilha o grupo, como a antiga "tags", tem outro id).
  const byGroup = new Map(catalog.products.filter((p) => p.id === String(p.groupId)).map((p) => [p.groupId, p]));

  const getCategories = (): Category[] => catalog.categories;
  const getCategory = (slug: string): Category | undefined => catalog.categories.find((c) => c.slug === slug);
  const getProducts = (): Product[] => catalog.products;
  const getProduct = (slug: string): Product | undefined => bySlug.get(slug);
  /** Produto pelo ID do catálogo ("180") ou pelo slug ("180-tag"). */
  const getProductById = (idOrSlug: string): Product | undefined => byId.get(idOrSlug) ?? bySlug.get(idOrSlug);
  /** Produto atual de um ID de link antigo ("71", "tags"): o próprio grupo ou aquele em que a API o juntou. */
  const getProductMovedFrom = (id: string): Product | undefined => {
    // hasOwn: o ID vem da URL ("constructor" não pode cair no protótipo do objeto).
    const targets = Object.hasOwn(GRUPOS_JUNTADOS, id) ? GRUPOS_JUNTADOS[id] : [];
    return byId.get(id) ?? targets.map((to) => byId.get(to)).find(Boolean);
  };
  /** Produtos com gabarito (campo `gabarito` de GET /grupos), em ordem alfabética. */
  const getTemplateProducts = (): Product[] => catalog.products.filter((p) => p.template).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  /** Produto pelo ID do grupo na API. */
  const getProductByGroupId = (groupId: number): Product | undefined => byGroup.get(groupId);
  const getProductsByCategory = (slug: string): Product[] => catalog.products.filter((p) => p.categorySlug === slug);
  /** Produtos na ordem da lista de IDs de grupo (ignora os que não existem mais). */
  const getProductsByGroupIds = (ids: number[]): Product[] => ids.map((id) => byGroup.get(id)).filter((p): p is Product => Boolean(p));
  /** "Para o seu negócio" (GET /tiposnegocio), só os grupos que estão no catálogo e os tipos com algum. */
  const getBusinessTypes = (): BusinessType[] =>
    businessTypes.map((t) => ({ ...t, groupIds: t.groupIds.filter((id) => byGroup.has(id)) })).filter((t) => t.groupIds.length > 0);
  const getBusinessType = (slug: string): BusinessType | undefined => getBusinessTypes().find((t) => t.slug === slug);
  const getBusinessProducts = (type: BusinessType): Product[] => getProductsByGroupIds(type.groupIds);
  /**
   * Vitrine na ordem do padraocolor.com.br: "Destaques" e "Produtos mais Vendidos" da configuração do site
   * (GET /configuracoes), depois os demais marcados como destaque, mais vendido ou lançamento.
   */
  const getFeatured = (): Product[] => {
    const official = getProductsByGroupIds([...storefront.highlights, ...storefront.bestSellers]);
    const flagged = catalog.products
      .filter((p) => p.featured || p.bestSeller || p.isNew)
      .sort((a, b) => Number(b.featured) - Number(a.featured) || Number(b.bestSeller) - Number(a.bestSeller) || Number(b.isNew) - Number(a.isNew));
    return [...new Set([...official, ...flagged])];
  };
  /** Categorias da home: as "Categorias em Destaque" do site oficial primeiro, na ordem de lá; depois as demais. */
  const getShowcaseCategories = (): Category[] => {
    const featured = storefront.featuredCategories.map((c) => getCategory(c.slug)).filter((c): c is Category => Boolean(c));
    const fresh = catalog.categories.filter((c) => NEW_CATEGORY_SLUGS.has(c.slug));
    return [...new Set([...featured, ...fresh, ...catalog.categories])];
  };
  /** "Veja também" da API; completa com a mesma categoria. */
  const getRelated = (product: Product, limit = 10): Product[] => {
    const fromApi = getProductsByGroupIds(product.related ?? []).filter((p) => p.slug !== product.slug);
    const sameCategory = catalog.products.filter((p) => p.categorySlug === product.categorySlug && p.slug !== product.slug && !fromApi.includes(p));
    return [...fromApi, ...sameCategory].slice(0, limit);
  };
  const searchProducts = (term: string): Product[] => {
    const needle = normalize(term);
    if (!needle) return catalog.products;
    const words = needle.split(" ").filter(Boolean);
    return catalog.products.filter((p) => {
      const haystack = normalize(`${p.name} ${p.category} ${(p.tags ?? []).join(" ")}`);
      return words.every((w) => haystack.includes(w));
    });
  };
  const getSearchIndex = (): SearchEntry[] =>
    catalog.products.map((p) => ({
      s: p.slug,
      n: p.name,
      c: p.category,
      i: p.image,
      p: p.price,
      q: p.priceQty,
      ...(p.groupId ? { g: p.groupId } : {}),
      ...(p.tags?.length ? { t: p.tags.join(" ") } : {}),
      ...(p.customSize && !p.neon ? { m: 1 as const } : {}),
    }));

  return {
    getCategories,
    getCategory,
    getProducts,
    getProduct,
    getProductById,
    getProductMovedFrom,
    getTemplateProducts,
    getProductByGroupId,
    getProductsByCategory,
    getProductsByGroupIds,
    getBusinessTypes,
    getBusinessType,
    getBusinessProducts,
    getFeatured,
    getShowcaseCategories,
    getRelated,
    searchProducts,
    getSearchIndex,
  };
}

export type CatalogView = ReturnType<typeof catalogView>;

/** O catálogo do sync (catalog.json): a base do vivo e a reserva quando a API não responde ou o vivo está desligado. */
export const catalogoEstatico: CatalogView = catalogView(catalog);

export const {
  getCategories,
  getCategory,
  getProducts,
  getProduct,
  getProductById,
  getProductMovedFrom,
  getTemplateProducts,
  getProductByGroupId,
  getProductsByCategory,
  getProductsByGroupIds,
  getBusinessTypes,
  getBusinessType,
  getBusinessProducts,
  getFeatured,
  getShowcaseCategories,
  getRelated,
  searchProducts,
  getSearchIndex,
} = catalogoEstatico;

/**
 * Produtos das páginas internas de QA (/design-system): o catálogo com os produtos novos da API própria, mesmo
 * desligados no site, para os modelos 3D deles continuarem conferidos e fotografados (npm run fotos:novos).
 */
export function getQaProducts(): Product[] {
  return catalogComNovos.products;
}

export function getQaProduct(slug: string): Product | undefined {
  return catalogComNovos.products.find((p) => p.slug === slug);
}

/**
 * Grupos que a API juntou a outro e apagou (23/10/2026: as canecas por cor viraram a opção Cor de um grupo só e a
 * Sacola Presente em Tecido virou variações da Sacola Mochila). Vale o primeiro grupo que existir no catálogo: a
 * caneca com glitter na base (532) vem com erro da API e fica fora até ela responder. "tags" era uma cópia do
 * grupo 180 criada no site; saiu em 25/10/2026 (só produtos da API) e o link leva à Tag.
 */
const GRUPOS_JUNTADOS: Record<string, string[]> = {
  "429": ["533"],
  "407": ["434"],
  "435": ["434"],
  "436": ["434"],
  "437": ["434"],
  "472": ["434"],
  "430": ["365"],
  "438": ["365"],
  "439": ["365"],
  "431": ["366"],
  "440": ["366"],
  "441": ["366"],
  "432": ["532", "366"],
  "423": ["367"],
  "71": ["50"],
  tags: ["180"],
};

/**
 * Título de SEO a partir do meta title da API. Quando ele já traz a marca ("… - Padrão Color"),
 * vale sozinho; senão entra no modelo "%s | Padrão Color" do layout.
 */
export function seoTitle(metaTitle: string | undefined, fallback: string): Metadata["title"] {
  const title = (metaTitle || fallback).trim();
  return /padr[aã]o\s*color/i.test(title) ? { absolute: title } : title;
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
    // LED: o "a partir de" já é o preço mínimo da peça (0,25 m²), não o do m².
    ...(p.customSize && !p.neon ? { perM2: true } : {}),
  };
}

/** Índice leve da busca do topo (servido em /produtos/indice.json). */
export type SearchEntry = { s: string; n: string; c: string; i: string; p: number; q: number; g?: number; t?: string; m?: 1 };

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
