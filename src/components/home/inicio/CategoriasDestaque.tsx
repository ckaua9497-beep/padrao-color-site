import Image from "next/image";
import Link from "next/link";
import { cx } from "@/components/ui/cx";
import { imageUrl } from "@/lib/format";
import CabecalhoSecao from "./CabecalhoSecao";
import { CONTEUDO } from "./layout";

/*
 * Categorias da página inicial (Figma): faixa cinza de largura total (371 px), título com "Ver todos" e cinco fotos
 * redondas de 177 px com o nome embaixo. As fotos padrão (public/site/categorias) já são redondas com os cantos
 * transparentes; uma imagem trocada no admin ou vinda da API é recortada em círculo sobre o cinza das fotos.
 * No celular, a fileira rola de lado (com encaixe) de borda a borda. Do tablet em diante os cinco cabem na largura
 * (até 177 px, com no mínimo 16 px entre eles); a partir de 1280 px seguem a grade do Figma (177 px com 45 px de vão
 * nos 1064 px do conteúdo) e crescem com ele até 224 px nos 1300 px das telas largas.
 */

/** Nomes como estão no Figma; outra categoria usa o nome do catálogo. "\n" é a quebra de linha do Figma. */
const ROTULOS: Record<string, string> = {
  "cartoes-de-visita-e-postais": "Cartões de visita\ne postais",
  suprimentos: "Suprimentos",
  "banner-e-lonas": "Banners e lonas",
  restaurantes: "Restaurantes",
  folhetos: "Folhetos",
};

type Categoria = { slug: string; name: string; image: string };

export default function CategoriasDestaque({ categorias }: { categorias: Categoria[] }) {
  if (!categorias.length) return null;
  return (
    <section aria-labelledby="inicio-categorias" className="bg-vitrine">
      <div className={cx(CONTEUDO, "pb-[26px] pt-[33px] lg:pb-[30px]")}>
        <CabecalhoSecao id="inicio-categorias" titulo="Categorias" href="/produtos" rotuloLink="Ver todos os produtos" />
        <ul className="no-scrollbar -mx-4 mt-[22px] flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 py-1 sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-0 md:justify-between md:overflow-visible md:px-0">
          {categorias.map((c) => {
            const redonda = c.image.startsWith("/site/categorias/");
            return (
              <li key={c.slug} className="w-30 shrink-0 snap-start md:w-[min(177px,calc((100%-4rem)/5))] xl:w-[calc((100%-180px)/5)]">
                <Link href={`/categoria/${c.slug}`} className="group block rounded-card">
                  <span className={cx("relative block aspect-square overflow-hidden rounded-full", !redonda && "bg-foto")}>
                    <Image
                      src={imageUrl(c.image)}
                      alt=""
                      fill
                      sizes="(min-width: 1280px) 224px, (min-width: 768px) 177px, 120px"
                      className="object-cover transition-transform duration-500 ease-card group-hover:scale-105 motion-reduce:transition-none"
                    />
                  </span>
                  <span className="mt-4 block whitespace-pre-line text-center text-[15px]/[18px] decoration-1 underline-offset-2 group-hover:underline lg:mt-[35px] lg:text-base/[19px]">
                    {ROTULOS[c.slug] ?? c.name}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
