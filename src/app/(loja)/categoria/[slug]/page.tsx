import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Listing from "@/components/listing/Listing";
import ListingBanner from "@/components/listing/ListingBanner";
import { getCategories, getCategory, getProductsByCategory, toSummary } from "@/lib/catalog";
import { formatBRL, spectrumAt } from "@/lib/format";

export function generateStaticParams() {
  return getCategories().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata(props: PageProps<"/categoria/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const category = getCategory(slug);
  return category ? { title: category.name, description: `${category.count} produtos de ${category.name} com mockup 3D.` } : {};
}

export default async function CategoryPage(props: PageProps<"/categoria/[slug]">) {
  const { slug } = await props.params;
  const category = getCategory(slug);
  if (!category) notFound();
  const categories = getCategories();
  const products = getProductsByCategory(slug);
  const index = categories.findIndex((c) => c.slug === slug);

  return (
    <div className="mx-auto max-w-[1440px] px-5 pb-20 md:px-10 xl:px-[70px]">
      <ListingBanner
        title={category.name}
        subtitle={`${category.count} produtos · a partir de ${formatBRL(category.minPrice)}`}
        images={products.slice(0, 3).map((p) => p.image)}
        tone={spectrumAt(index).soft}
        crumbs={[{ href: "/", label: "Início" }, { href: "/produtos", label: "Produtos" }, { label: category.name }]}
      />
      <Listing products={products.map(toSummary)} categories={categories.map(({ slug, name, count }) => ({ slug, name, count }))} activeSlug={slug} />
    </div>
  );
}
