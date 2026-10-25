import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import VitrineCard from "@/components/VitrineCard";
import { GRADE_CARDS, SIZES_CARDS, visivelEmLinhasCompletas } from "@/components/listing/grade";
import ProductExperience from "@/components/product/ProductExperience";
import ProductInfo from "@/components/product/ProductInfo";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { IconClock, IconCube, IconShield } from "@/components/icons";
import { getProducts, seoTitle, toSummary } from "@/lib/catalog";
import { catalogoVivo, produtoDaPagina } from "@/lib/catalogo-vivo";
import { produtoComMidia, produtosComMidia } from "@/lib/midia";
import { midiaDoSite } from "@/lib/midia-servidor";
import { imageUrl, spectrumAt } from "@/lib/format";
import { cleanOptionLabel, optionKeys } from "@/lib/pricing";
import { productTemplate } from "@/lib/templates-data";

// Catálogo em tempo real (src/lib/catalogo-vivo.ts): a página se refaz a cada 10 min com os dados da API, e o produto
// que não estava no sync (grupo novo) é montado na primeira visita.
export const revalidate = 600;
export const dynamicParams = true;

export function generateStaticParams() {
  return getProducts().map((p) => ({ slug: p.slug }));
}

/** Descrição curta para buscadores: meta description da API, resumo ou o começo da descrição. */
function shortDescription(product: { metaDescription?: string; summary?: string; description: string }): string {
  const text = product.metaDescription || product.summary || product.description;
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}

export async function generateMetadata(props: PageProps<"/produto/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const found = await produtoDaPagina(slug);
  if (!found || !("product" in found)) return {};
  const product = produtoComMidia(found.product, await midiaDoSite());
  const description = shortDescription(product);
  return {
    title: seoTitle(product.metaTitle, product.name),
    description,
    openGraph: {
      title: product.metaTitle || product.name,
      description,
      type: "website",
      locale: "pt_BR",
      siteName: "Padrão Color",
      images: product.images.slice(0, 4).map((src) => ({ url: imageUrl(src), alt: product.name })),
    },
  };
}

export default async function ProductPage(props: PageProps<"/produto/[slug]">) {
  const { slug } = await props.params;
  // Produto ativo com os dados de agora. Link antigo de um produto que a API juntou a outro ("404-caneca-…-interior-
  // preto") ou sem número ("tags", que leva à Tag do grupo 180): redireciona para o atual. Grupo que saiu de /grupos
  // (inativo) e não foi juntado a outro: 404. Nome que mudou na API: o slug novo (redirecionamento temporário, porque o
  // nome pode voltar).
  const found = await produtoDaPagina(slug);
  if (!found) notFound();
  if ("redirect" in found) {
    if (/^\d+-/.test(slug) && found.redirect.split("-")[0] === slug.split("-")[0]) redirect(`/produto/${found.redirect}`);
    permanentRedirect(`/produto/${found.redirect}`);
  }
  // Fotos trocadas no admin (admin → Site → Imagens) no lugar das da API.
  const midia = await midiaDoSite();
  const product = produtoComMidia(found.product, midia);
  // "Veja também" da API primeiro; completa com a mesma categoria (só produtos ativos).
  const related = produtosComMidia((await catalogoVivo()).getRelated(product).map(toSummary), midia);
  const keys = optionKeys(product.options);
  const prices = product.variations.map((v) => v.p).filter((p) => p > 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: shortDescription(product),
    image: product.images.slice(0, 4).map(imageUrl),
    sku: product.id,
    category: product.category,
    brand: { "@type": "Brand", name: "Padrão Color" },
    ...(prices.length
      ? {
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: "BRL",
            lowPrice: Math.min(...prices),
            highPrice: Math.max(...prices),
            offerCount: prices.length,
            availability: "https://schema.org/InStock",
          },
        }
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
            { href: `/categoria/${product.categorySlug}`, label: product.category },
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
            ...(product.neon ? { neon: product.neon } : {}),
            template: product.template ?? null,
            printTemplate: productTemplate(product.id),
            summary: product.summary,
            customizacoes: product.customizacoes,
            acabamentos: product.acabamentos,
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
        />
      </div>

      <section className="bg-mist" aria-labelledby="sobre-o-produto">
        <div className="container-site grid gap-12 py-16 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <h2 id="sobre-o-produto" className="text-title">
              Sobre o produto
            </h2>
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
            {/* Informações do produto vindas da API (material, tabela de medidas, tipo de serviço…). */}
            <ProductInfo className="mt-6" info={product.info ?? []} options={[]} variationCount={product.variationCount} />
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="container-site @container py-16" aria-labelledby="veja-tambem">
          <h2 id="veja-tambem" className="mb-6 text-title font-bold">
            Você também pode gostar
          </h2>
          {/* Grade do Figma (5 colunas a 1280 px); em cada largura só linhas completas (até 10 cards). */}
          <ul className={GRADE_CARDS}>
            {related.map((p, i) => (
              <li key={p.slug} className={visivelEmLinhasCompletas(i, related.length)}>
                <VitrineCard product={p} sizes={SIZES_CARDS} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
