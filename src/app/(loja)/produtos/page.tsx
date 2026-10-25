import type { Metadata } from "next";
import Listing from "@/components/listing/Listing";
import ListingBanner from "@/components/listing/ListingBanner";
import { categoryNav } from "@/components/listing/nav";
import { toSummary } from "@/lib/catalog";
import { catalogoVivo } from "@/lib/catalogo-vivo";
import { produtosComMidia } from "@/lib/midia";
import { midiaDoSite } from "@/lib/midia-servidor";

export const metadata: Metadata = {
  title: "Todos os produtos",
  description: "Cartões, banners, adesivos, brindes, vestuário, LED neon e mais: todos os produtos da Padrão Color com mockup 3D e preço na hora.",
};

export default async function ProductsPage(props: PageProps<"/produtos">) {
  const params = await props.searchParams;
  const term = typeof params.busca === "string" ? params.busca : "";
  const [midia, catalogo] = await Promise.all([midiaDoSite(), catalogoVivo()]);
  const products = produtosComMidia(catalogo.searchProducts(term), midia);
  const categories = catalogo.getCategories();

  return (
    <div className="container-site pb-20">
      <ListingBanner
        title={term ? `“${term}”` : "Todos os produtos"}
        subtitle={term ? `${products.length} ${products.length === 1 ? "resultado" : "resultados"} na busca` : `${products.length} produtos em ${categories.length} categorias`}
        images={(term ? products : produtosComMidia(catalogo.getFeatured().slice(0, 8), midia)).slice(0, 8).map((p) => p.image)}
        tone="var(--color-peach-50)"
        crumbs={[{ href: "/", label: "Início" }, { label: term ? "Busca" : "Produtos" }]}
      />
      <Listing key={term} products={products.map(toSummary)} nav={categoryNav(undefined, catalogo)} />
    </div>
  );
}
