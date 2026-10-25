import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductCard from "@/components/ProductCard";
import Rail from "@/components/Rail";
import ProductExperience from "@/components/product/ProductExperience";
import ProductInfo from "@/components/product/ProductInfo";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { imageUrl, spectrumAt } from "@/lib/format";
import { cleanOptionLabel, optionKeys } from "@/lib/pricing";
import { productTemplate } from "@/lib/templates-data";
import { lojaDoHost, lojaItens, lojaProduct, lojaSummary } from "@/lib/multiloja/tenant";

/** Produto ativo na loja (com o preço dela); undefined = a loja não vende esse produto. */
async function findItem(host: string, slug: string) {
  const loja = await lojaDoHost(host);
  if (!loja) return null;
  const items = await lojaItens(loja.id, loja.margemPadrao);
  const item = items.find((i) => i.product.slug === slug);
  return item ? { loja, items, item } : null;
}

export async function generateMetadata(props: PageProps<"/vitrine/[host]/produto/[slug]">): Promise<Metadata> {
  const { host, slug } = await props.params;
  const found = await findItem(host, slug);
  if (!found) return {};
  const { product } = found.item;
  const text = product.metaDescription || product.summary || product.description;
  const description = text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
  return {
    title: product.name,
    description,
    openGraph: { title: product.name, description, images: product.images.slice(0, 4).map((src) => ({ url: imageUrl(src), alt: product.name })) },
  };
}

export default async function VitrineProduto(props: PageProps<"/vitrine/[host]/produto/[slug]">) {
  const { host, slug } = await props.params;
  const found = await findItem(host, slug);
  if (!found) notFound();
  const { loja, items, item } = found;
  const product = lojaProduct(item);
  const keys = optionKeys(product.options);
  const related = items
    .filter((i) => i.product.slug !== product.slug)
    .sort((a, b) => Number(b.product.categorySlug === product.categorySlug) - Number(a.product.categorySlug === product.categorySlug))
    .slice(0, 10)
    .map(lojaSummary);
  const prices = product.variations.map((v) => v.p).filter((p) => p > 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: product.images.slice(0, 4).map(imageUrl),
    sku: product.id,
    category: product.category,
    brand: { "@type": "Brand", name: loja.nome },
    ...(prices.length
      ? { offers: { "@type": "AggregateOffer", priceCurrency: "BRL", lowPrice: Math.min(...prices), highPrice: Math.max(...prices), offerCount: prices.length, availability: "https://schema.org/InStock" } }
      : {}),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="container-site pb-16 pt-8">
        <Breadcrumb
          className="mb-6"
          items={[
            { href: "/", label: "Início" },
            { href: "/produtos", label: "Produtos" },
            { href: `/produtos?categoria=${product.categorySlug}`, label: product.category },
          ]}
        />
        <ProductExperience
          product={{
            id: product.id,
            groupId: product.groupId,
            slug: product.slug,
            name: product.name,
            sizes: product.sizes ?? null,
            sizeChart: product.sizeChart ?? null,
            customSize: product.customSize ?? null,
            template: product.template ?? null,
            printTemplate: productTemplate(product.id),
            summary: product.summary,
            customizacoes: product.customizacoes,
            minQty: product.minQty,
            maxQty: product.maxQty,
            category: product.category,
            categorySlug: product.categorySlug,
            image: product.image,
            images: product.images,
            options: product.options,
            variations: product.variations,
            price: product.price,
            priceQty: product.priceQty,
            leadDays: product.leadDays,
            isNew: product.isNew,
            bestSeller: product.bestSeller,
            source: product.source,
          }}
          pix
          allowArtLater
        />
      </div>

      <section className="bg-mist" aria-labelledby="sobre-o-produto">
        <div className="container-site grid gap-12 py-16 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <h2 id="sobre-o-produto" className="text-title">
              Sobre o produto
            </h2>
            <p className="mt-5 whitespace-pre-line text-body text-ink/80">{product.description}</p>
          </div>
          <div>
            <h2 className="text-title">Informações técnicas</h2>
            <dl className="mt-5 divide-y divide-line rounded-card bg-white px-6">
              {keys.map((key) => (
                <div key={key} className="grid grid-cols-[150px_1fr] gap-4 py-4 text-[15px]">
                  <dt className="font-semibold">{cleanOptionLabel(key)}</dt>
                  <dd className="text-ink/75">{product.options[key].join(" · ")}</dd>
                </div>
              ))}
            </dl>
            <ProductInfo className="mt-6" info={product.info ?? []} options={[]} variationCount={product.variationCount} />
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="container-site py-16" aria-labelledby="veja-tambem">
          <h2 id="veja-tambem" className="mb-6 text-title font-bold">
            Você também pode gostar
          </h2>
          <Rail label="Produtos relacionados" itemClassName="w-[70%] sm:w-[40%] md:w-[30%] lg:w-[calc((100%-4*16px)/5)]">
            {related.map((p, i) => (
              <ProductCard key={p.slug} product={p} tone={spectrumAt(i).soft} />
            ))}
          </Rail>
        </section>
      )}
    </>
  );
}
