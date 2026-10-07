import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Listing from "@/components/listing/Listing";
import ListingBanner from "@/components/listing/ListingBanner";
import { categoryNav } from "@/components/listing/nav";
import { getCategories, getCategory, getProductsByCategory, seoTitle, toSummary } from "@/lib/catalog";
import { formatBRL, imageUrl, spectrumAt } from "@/lib/format";

export function generateStaticParams() {
  return getCategories().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata(props: PageProps<"/categoria/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const category = getCategory(slug);
  if (!category) return {};
  const description = category.metaDescription || `${category.count} produtos de ${category.name} com mockup 3D.`;
  const image = category.banner ?? category.image;
  return {
    title: seoTitle(category.metaTitle, category.name),
    description,
    openGraph: { title: category.metaTitle || category.name, description, type: "website", images: image ? [{ url: imageUrl(image), alt: category.name }] : undefined },
  };
}

export default async function CategoryPage(props: PageProps<"/categoria/[slug]">) {
  const { slug } = await props.params;
  const category = getCategory(slug);
  if (!category) notFound();
  const products = getProductsByCategory(slug);
  const index = getCategories().findIndex((c) => c.slug === slug);

  return (
    <div className="container-site pb-20">
      <ListingBanner
        title={category.name}
        subtitle={`${category.count} ${category.count === 1 ? "produto" : "produtos"} · a partir de ${formatBRL(category.minPrice)}`}
        images={products.slice(0, 8).map((p) => p.image)}
        tone={spectrumAt(index).soft}
        crumbs={[{ href: "/", label: "Início" }, { href: "/produtos", label: "Produtos" }, { label: category.name }]}
      />
      <Listing products={products.map(toSummary)} nav={categoryNav(slug)} />
    </div>
  );
}
