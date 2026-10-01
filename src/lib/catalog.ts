import data from "@/data/catalog.json";

export type Variation = {
  p: number;
  q: number;
  d: number | null;
  v: Record<string, string>;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  category: string;
  categorySlug: string;
  description: string;
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
};

export type Category = {
  slug: string;
  name: string;
  count: number;
  image: string;
  minLeadDays: number | null;
  minPrice: number;
};

export type ProductSummary = Pick<
  Product,
  "id" | "slug" | "name" | "category" | "categorySlug" | "image" | "price" | "priceQty" | "leadDays" | "isNew" | "bestSeller"
>;

const catalog = data as unknown as {
  generatedAt: string;
  categories: Category[];
  products: Product[];
};

export { STORE } from "./store";
export { MENU_GROUPS } from "./menu";


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

export function getProductsByCategory(slug: string): Product[] {
  return catalog.products.filter((p) => p.categorySlug === slug);
}

export function getFeatured(): Product[] {
  const featured = catalog.products.filter((p) => p.featured || p.bestSeller || p.isNew);
  return featured.sort((a, b) => Number(b.bestSeller) - Number(a.bestSeller) || Number(b.isNew) - Number(a.isNew));
}

export function getRelated(product: Product, limit = 10): Product[] {
  return catalog.products
    .filter((p) => p.categorySlug === product.categorySlug && p.slug !== product.slug)
    .slice(0, limit);
}

export function searchProducts(term: string): Product[] {
  const needle = normalize(term);
  if (!needle) return catalog.products;
  const words = needle.split(" ").filter(Boolean);
  return catalog.products.filter((p) => {
    const haystack = normalize(`${p.name} ${p.category}`);
    return words.every((w) => haystack.includes(w));
  });
}

export function toSummary(p: Product): ProductSummary {
  return {
    id: p.id,
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
  };
}

export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const CATALOG_STATS = {
  products: catalog.products.length,
  categories: catalog.categories.length,
  minLeadDays: Math.min(...catalog.products.map((p) => p.leadDays ?? 99)),
};
