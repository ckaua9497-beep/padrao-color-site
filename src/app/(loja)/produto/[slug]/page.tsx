import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductCard from "@/components/ProductCard";
import Rail from "@/components/Rail";
import ProductExperience from "@/components/product/ProductExperience";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { IconClock, IconCube, IconShield } from "@/components/icons";
import { getProduct, getProducts, getRelated, toSummary } from "@/lib/catalog";
import { spectrumAt } from "@/lib/format";
import { cleanOptionLabel, optionKeys } from "@/lib/pricing";

export function generateStaticParams() {
  return getProducts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(props: PageProps<"/produto/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const product = getProduct(slug);
  if (!product) return {};
  return { title: product.name, description: product.description.slice(0, 160) };
}

export default async function ProductPage(props: PageProps<"/produto/[slug]">) {
  const { slug } = await props.params;
  const product = getProduct(slug);
  if (!product) notFound();
  const related = getRelated(product).map(toSummary);
  const keys = optionKeys(product.options);

  return (
    <>
      <div className="container-site pb-16 pt-8">
        <Breadcrumb
          className="mb-6"
          items={[
            { href: "/", label: "Início" },
            { href: "/produtos", label: "Produtos" },
            { href: `/categoria/${product.categorySlug}`, label: product.category },
          ]}
        />

        <ProductExperience
          product={{
            slug: product.slug,
            name: product.name,
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
          }}
        />
      </div>

      <section className="bg-mist">
        <div className="container-site grid gap-12 py-16 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <h2 className="text-title">Sobre o produto</h2>
            <p className="mt-5 whitespace-pre-line text-body text-ink/80">{product.description}</p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                { Icon: IconCube, title: "Mockup 3D", text: "Prévia com a sua arte" },
                { Icon: IconClock, title: "Prazo", text: product.leadDays ? `A partir de ${product.leadDays} ${product.leadDays === 1 ? "dia útil" : "dias úteis"}` : "Conforme configuração" },
                { Icon: IconShield, title: "Compra segura", text: "Pagamento protegido" },
              ].map(({ Icon, title, text }, i) => (
                <li key={title} className="flex items-center gap-3 rounded-card bg-white p-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full" style={{ background: spectrumAt(i + 1).soft }}>
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <span className="text-caption leading-tight">
                    <span className="block font-bold">{title}</span>
                    {text}
                  </span>
                </li>
              ))}
            </ul>
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
              <div className="grid grid-cols-[150px_1fr] gap-4 py-4 text-[15px]">
                <dt className="font-semibold">Variações</dt>
                <dd className="text-ink/75">{product.variationCount} combinações</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="container-site py-16">
          <h2 className="mb-6 text-title font-bold">Você também pode gostar</h2>
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
