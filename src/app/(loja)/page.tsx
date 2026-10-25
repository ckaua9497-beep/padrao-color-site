import BannerCarousel from "@/components/home/BannerCarousel";
import PromoBanners from "@/components/home/PromoBanners";
import Showcase3D, { type DemoProduct } from "@/components/home/Showcase3D";
import CartoesBeneficios from "@/components/home/inicio/CartoesBeneficios";
import CategoriasDestaque from "@/components/home/inicio/CategoriasDestaque";
import FaixaBeneficios from "@/components/home/inicio/FaixaBeneficios";
import MaisVendidos from "@/components/home/inicio/MaisVendidos";
import NossosDestaques from "@/components/home/inicio/NossosDestaques";
import ProjetoEspecial from "@/components/home/inicio/ProjetoEspecial";
import { CONTEUDO } from "@/components/home/inicio/layout";
import { cx } from "@/components/ui/cx";
import { CATALOG_STATS, storefront, toSummary, type Product } from "@/lib/catalog";
import { catalogoVivo } from "@/lib/catalogo-vivo";
import { categoriasComMidia, produtoComMidia, produtosComMidia } from "@/lib/midia";
import { bannersDoLugar, midiaDoSite } from "@/lib/midia-servidor";

/*
 * Página inicial no layout do Figma "LOJA ONLINE - PADRAOCOLOR" (quadro de 1280 px): carrossel de banners, faixa de
 * vantagens, categorias, mais vendidos, banner largo, cartões de vantagens, nossos destaques, o mockup 3D e a faixa
 * "projeto especial". Fotos e banners padrão do Figma em public/site (src/lib/midia-padrao.ts); o admin pode trocá-los.
 */

// Banners com período no ar e produtos ativos (catálogo em tempo real) entram e saem sem esperar outra publicação: a
// página se refaz a cada 10 minutos.
export const revalidate = 600;

function find(products: Product[], name: string): Product {
  return products.find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? products.find((p) => p.name.toLowerCase().includes(name.toLowerCase())) ?? products[0];
}

/** Botão da vitrine do site oficial (storefront.json: Revendedor, Envio Direto, Projetos Especiais…). */
function botao(nome: string): { href: string; novaAba: boolean } | null {
  const b = storefront.buttons.find((x) => x.name === nome);
  return b?.href ? { href: b.href, novaAba: b.newTab } : null;
}

export default async function HomePage() {
  // Fotos, imagens de categoria e banners trocados no admin (admin → Site); sem troca, valem os do Figma e os da API.
  const [midia, topo, meio, catalogo] = await Promise.all([midiaDoSite(), bannersDoLugar("inicio-topo"), bannersDoLugar("inicio-meio"), catalogoVivo()]);
  const achar = (name: string) => produtoComMidia(find(catalogo.getProducts(), name), midia);
  const categorias = categoriasComMidia(catalogo.getShowcaseCategories().slice(0, 5), midia);
  const maisVendidos = produtosComMidia(catalogo.getProductsByGroupIds(storefront.bestSellers).map(toSummary), midia);
  const destaques = produtosComMidia(catalogo.getProductsByGroupIds(storefront.highlights).map(toSummary), midia);

  const card = achar("Cartão de Visita com Verniz Local e Lam. Fosca 9x5cm");
  const banner = achar("Banner 60x90cm");
  const mug = achar("Caneca de Cerâmica Personalizada");
  const neon = achar("Led Neon Personalizado - Logotipo");
  const shirt = achar("Camisa de Algodão");
  const cushion = achar("Almofada Quadrada");

  const demos: DemoProduct[] = [
    { tab: "Cartão de visita", product: card },
    { tab: "Caneca", product: mug },
    { tab: "Camiseta", product: shirt },
    { tab: "Banner", product: banner },
    { tab: "Almofada", product: cushion },
    { tab: "LED neon", product: neon },
  ].map(({ tab, product }) => ({ tab, slug: product.slug, name: product.name, category: product.category, categorySlug: product.categorySlug, image: product.image, options: product.options }));

  return (
    <>
      {/* Os banners são imagens: o título da página fica só para leitores de tela. */}
      <h1 className="sr-only">Padrão Color: gráfica online e comunicação visual para a sua marca</h1>
      {/* Com todos os banners do carrossel fora do ar, o topo fica vazio (o admin avisa que nenhum banner aparece). */}
      {topo.length > 0 && <BannerCarousel banners={topo} />}

      <FaixaBeneficios produtos={CATALOG_STATS.products} prazoMinimo={CATALOG_STATS.minLeadDays} revendedor={botao("Revendedor")?.href ?? null} />

      <CategoriasDestaque categorias={categorias} />

      <MaisVendidos produtos={maisVendidos} />

      {meio.length > 0 && (
        <section aria-label="Destaque da loja" className={cx(CONTEUDO, "pb-10 lg:pb-[67px] lg:pt-[26px]")}>
          <PromoBanners banners={meio} />
        </section>
      )}

      <CartoesBeneficios envioDireto={botao("Envio Direto")} categoriasDesconto={botao("Categorias de Desconto")} entrega={botao("Tipos de Entrega")} projetosEspeciais={botao("Projetos Especiais")} />

      <NossosDestaques produtos={destaques} />

      <Showcase3D demos={demos} />

      <ProjetoEspecial link={botao("Projetos Especiais")} />
    </>
  );
}
