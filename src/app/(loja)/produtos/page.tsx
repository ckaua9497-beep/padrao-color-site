import type { Metadata } from "next";
import Listing from "@/components/listing/Listing";
import ListingBanner from "@/components/listing/ListingBanner";
import { getCategories, getFeatured, searchProducts, toSummary } from "@/lib/catalog";

export const metadata: Metadata = { title: "Todos os produtos" };

export default async function ProductsPage(props: PageProps<"/produtos">) {
  const params = await props.searchParams;
  const term = typeof params.busca === "string" ? params.busca : "";
  const products = searchProducts(term);
  const categories = getCategories();

  return (
    <div className="container-site pb-20">
      <ListingBanner
        title={term ? `“${term}”` : "Todos os produtos"}
        subtitle={term ? `${products.length} resultados na busca` : `${products.length} produtos em ${categories.length} categorias`}
        images={(term ? products : getFeatured()).slice(0, 3).map((p) => p.image)}
        tone="var(--color-peach-50)"
        crumbs={[{ href: "/", label: "Início" }, { label: term ? "Busca" : "Produtos" }]}
      />
      <Listing key={term} products={products.map(toSummary)} categories={categories.map(({ slug, name, count }) => ({ slug, name, count }))} />
    </div>
  );
}
