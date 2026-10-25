import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Listing from "@/components/listing/Listing";
import ListingBanner from "@/components/listing/ListingBanner";
import { businessNav } from "@/components/listing/nav";
import { getBusinessTypes, seoTitle, toSummary } from "@/lib/catalog";
import { catalogoVivo } from "@/lib/catalogo-vivo";
import { produtosComMidia } from "@/lib/midia";
import { midiaDoSite } from "@/lib/midia-servidor";
import { imageUrl } from "@/lib/format";

// "Para o seu negócio": os produtos de cada tipo de negócio (GET /tiposnegocio), na ordem da API.

type Props = { params: Promise<{ slug: string }> };

// Catálogo em tempo real (src/lib/catalogo-vivo.ts): só produtos ativos, com os dados de agora; refeita a cada 10 min.
export const revalidate = 600;

export function generateStaticParams() {
  return getBusinessTypes().map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const type = (await catalogoVivo()).getBusinessType(slug);
  if (!type) return {};
  const description = type.metaDescription || `Produtos personalizados para ${type.name.toLowerCase()}: impressos, brindes e comunicação visual com mockup 3D.`;
  const image = type.banner || type.image;
  return {
    title: seoTitle(type.metaTitle, type.name),
    description,
    openGraph: { title: type.metaTitle || type.name, description, type: "website", images: image ? [{ url: imageUrl(image), alt: type.name }] : undefined },
  };
}

export default async function BusinessPage({ params }: Props) {
  const { slug } = await params;
  const catalogo = await catalogoVivo();
  const type = catalogo.getBusinessType(slug);
  if (!type) notFound();
  const products = produtosComMidia(catalogo.getBusinessProducts(type), await midiaDoSite());
  const art = type.banner || type.image;

  return (
    <div className="container-site pb-20">
      <ListingBanner
        title={type.name}
        subtitle={`${products.length} ${products.length === 1 ? "produto escolhido" : "produtos escolhidos"} para ${type.name.toLowerCase()}`}
        banner={art ? { desktop: art } : null}
        images={products.slice(0, 8).map((p) => p.image)}
        crumbs={[{ href: "/", label: "Início" }, { href: "/negocios", label: "Para o seu negócio" }, { label: type.name }]}
      />
      <Listing products={products.map(toSummary)} nav={businessNav(slug, catalogo)} />
    </div>
  );
}
