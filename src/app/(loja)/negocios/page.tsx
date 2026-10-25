import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import ListingBanner from "@/components/listing/ListingBanner";
import { IconArrow } from "@/components/icons";
import { catalogoVivo } from "@/lib/catalogo-vivo";
import { produtosComMidia } from "@/lib/midia";
import { midiaDoSite } from "@/lib/midia-servidor";
import { imageUrl } from "@/lib/format";

// Catálogo em tempo real (src/lib/catalogo-vivo.ts): só produtos ativos, com os dados de agora; refeita a cada 10 min.
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Para o seu negócio",
  description: "Impressos, brindes e comunicação visual escolhidos para cada tipo de negócio: salões, barbearias, clínicas, escolas, eventos, pontos de venda e mais.",
};

export default async function BusinessIndexPage() {
  const catalogo = await catalogoVivo();
  const types = catalogo.getBusinessTypes();
  const images = produtosComMidia(catalogo.getBusinessProducts(types[0]).slice(0, 3), await midiaDoSite()).map((p) => p.image);

  return (
    <div className="container-site pb-20">
      <ListingBanner
        title="Para o seu negócio"
        subtitle={`Produtos escolhidos para ${types.length} tipos de negócio.`}
        images={images}
        tone="var(--color-cyan-50)"
        crumbs={[{ href: "/", label: "Início" }, { label: "Para o seu negócio" }]}
      />
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {types.map((type, i) => (
          <li key={type.slug}>
            <Link href={`/negocios/${type.slug}`} className="group block overflow-hidden rounded-card bg-white shadow-card">
              <span className="block overflow-hidden bg-mist">
                <Image
                  src={imageUrl(type.image)}
                  alt=""
                  width={1440}
                  height={355}
                  sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 400px"
                  loading={i < 6 ? "eager" : "lazy"}
                  className="h-auto w-full transition-transform duration-500 ease-card group-hover:scale-[1.03] motion-reduce:transition-none"
                />
              </span>
              <span className="flex items-center justify-between gap-3 px-5 py-4">
                <span>
                  <span className="block text-[17px] font-bold">{type.name}</span>
                  <span className="block text-caption text-muted">
                    {type.groupIds.length} {type.groupIds.length === 1 ? "produto" : "produtos"}
                  </span>
                </span>
                <IconArrow aria-hidden className="size-5 shrink-0 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
