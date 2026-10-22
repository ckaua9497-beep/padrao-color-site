import type { Metadata } from "next";
import Link from "next/link";
import FotosProdutos, { type ProdutoFotos } from "@/components/admin/site/FotosProdutos";
import ImagensCategorias from "@/components/admin/site/ImagensCategorias";
import { PageHeader } from "@/components/admin/ui";
import { cx } from "@/components/ui/cx";
import { getCategories, getProducts } from "@/lib/catalog";
import { chaveProduto } from "@/lib/midia";
import { MIDIA_PADRAO } from "@/lib/midia-padrao";
import { midiaAtual } from "@/lib/midia-servidor";

export const metadata: Metadata = { title: "Imagens do site" };

/**
 * Fotos dos produtos e imagens/banners das categorias, no lugar das que vêm da API. Os editores recebem o que está
 * salvo no banco (troca) e as imagens padrão do site (padrão), que valem enquanto nada é salvo.
 */
export default async function AdminImagens(props: PageProps<"/admin/site/imagens">) {
  const params = await props.searchParams;
  const aba = params.aba === "categorias" ? "categorias" : "produtos";
  const midia = await midiaAtual();
  const categorias = getCategories();

  const tab = (ativa: boolean) => cx("inline-flex h-9 items-center rounded-full px-4 text-[14px] font-bold transition-colors", ativa ? "bg-ink text-white" : "text-muted hover:text-ink");
  return (
    <div className="space-y-6">
      <PageHeader
        group="Site Padrão Color"
        title="Imagens"
        description="Troque as fotos que o site mostra, mesmo quando a API manda outras: as dos produtos (cards, busca e página do produto) e as das categorias (menu, página inicial e topo da categoria). Sem troca, valem as fotos padrão do site (marcadas “Padrão do site”) e, nos itens sem elas, as da API."
      />
      <nav aria-label="Tipo de imagem" className="inline-flex gap-1 rounded-full bg-white p-1 shadow-sheet">
        <Link href="/admin/site/imagens" aria-current={aba === "produtos" ? "page" : undefined} className={tab(aba === "produtos")}>
          Produtos
        </Link>
        <Link href="/admin/site/imagens?aba=categorias" aria-current={aba === "categorias" ? "page" : undefined} className={tab(aba === "categorias")}>
          Categorias
        </Link>
      </nav>

      {aba === "produtos" ? (
        <FotosProdutos
          produtos={getProducts().map(
            (p): ProdutoFotos => ({
              id: p.id,
              groupId: p.groupId ?? null,
              slug: p.slug,
              name: p.name,
              category: p.category,
              categorySlug: p.categorySlug,
              api: p.images.length ? p.images : [p.image],
              padrao: MIDIA_PADRAO.produtos[chaveProduto(p)] ?? null,
              troca: midia.produtos[chaveProduto(p)] ?? null,
            }),
          )}
          categorias={categorias.map((c) => ({ slug: c.slug, name: c.name }))}
          inicial={typeof params.p === "string" && /^[a-z0-9-]{1,60}$/.test(params.p) ? params.p : null}
        />
      ) : (
        <ImagensCategorias
          categorias={categorias.map((c) => ({ slug: c.slug, name: c.name, count: c.count, imagemApi: c.image, imagemPadrao: MIDIA_PADRAO.categorias[c.slug]?.imagem ?? null, troca: midia.categorias[c.slug] ?? null }))}
        />
      )}
    </div>
  );
}
