import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FromPriceText } from "@/components/CardPrice";
import Listing from "@/components/listing/Listing";
import ListingBanner from "@/components/listing/ListingBanner";
import { categoryNav } from "@/components/listing/nav";
import { getCategories, seoTitle, toSummary } from "@/lib/catalog";
import { catalogoVivo } from "@/lib/catalogo-vivo";
import { imageUrl, spectrumAt } from "@/lib/format";
import { produtosComMidia } from "@/lib/midia";
import { midiaDoSite } from "@/lib/midia-servidor";

// Catálogo em tempo real (src/lib/catalogo-vivo.ts): só produtos ativos, com os dados de agora; refeita a cada 10 min.
export const revalidate = 600;

export function generateStaticParams() {
  return getCategories().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata(props: PageProps<"/categoria/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const category = (await catalogoVivo()).getCategory(slug);
  if (!category) return {};
  const description = category.metaDescription || `${category.count} produtos de ${category.name} com mockup 3D.`;
  const troca = (await midiaDoSite()).categorias[slug];
  const image = troca?.banner ?? category.banner ?? troca?.imagem ?? category.image;
  return {
    title: seoTitle(category.metaTitle, category.name),
    description,
    openGraph: { title: category.metaTitle || category.name, description, type: "website", images: image ? [{ url: imageUrl(image), alt: category.name }] : undefined },
  };
}

export default async function CategoryPage(props: PageProps<"/categoria/[slug]">) {
  const { slug } = await props.params;
  const catalogo = await catalogoVivo();
  const category = catalogo.getCategory(slug);
  if (!category) notFound();
  // Fotos e banner trocados no admin (admin → Site → Imagens). O banner da API não aparece: o topo da categoria é o
  // ilustrado, a não ser que a Padrão envie um banner próprio.
  const midia = await midiaDoSite();
  const troca = midia.categorias[slug];
  const products = produtosComMidia(catalogo.getProductsByCategory(slug), midia);
  const index = catalogo.getCategories().findIndex((c) => c.slug === slug);
  const summaries = products.map(toSummary);

  return (
    <div className="container-site pb-20">
      <ListingBanner
        title={category.name}
        subtitle={
          <>
            {category.count} {category.count === 1 ? "produto" : "produtos"} · <FromPriceText products={summaries} />
          </>
        }
        banner={troca?.banner ? { desktop: troca.banner, mobile: troca.bannerMobile } : null}
        images={products.slice(0, 8).map((p) => p.image)}
        tone={spectrumAt(index).soft}
        crumbs={[{ href: "/", label: "Início" }, { href: "/produtos", label: "Produtos" }, { label: category.name }]}
      />
      <Listing products={summaries} nav={categoryNav(slug, catalogo)} />
    </div>
  );
}
