import Link from "next/link";
import VitrineCard from "@/components/VitrineCard";
import { visivelEmLinhasCompletas } from "@/components/listing/grade";
import { cx } from "@/components/ui/cx";
import type { ProductSummary } from "@/lib/catalog";
import { CONTEUDO } from "./layout";

/**
 * "Nossos destaques" do Figma: grade de 5 × 3 cards (os destaques da vitrine da Padrão, na ordem de lá) e o botão
 * laranja "Ver todos os produtos" (351 × 55, branco 24 black: texto grande, passa no contraste).
 * As colunas seguem a largura do conteúdo (container query, as mesmas faixas da grade das listagens: 2, 3, 4 e 5
 * colunas) e cada largura mostra só fileiras completas (`visivelEmLinhasCompletas`): com 15 destaques, 14 no celular
 * e 12 com 4 colunas, em vez de uma última fileira pela metade.
 */
export default function NossosDestaques({ produtos }: { produtos: ProductSummary[] }) {
  if (!produtos.length) return null;
  return (
    <section aria-labelledby="inicio-destaques" className={cx(CONTEUDO, "@container pb-14 pt-12 lg:pb-[66px] lg:pt-[56px]")}>
      <h2 id="inicio-destaques" className="text-2xl/[28px] font-normal xl:pl-[11px]">
        Nossos destaques
      </h2>
      <ul className="mt-6 grid grid-cols-2 gap-x-[14px] gap-y-10 @min-[38rem]:grid-cols-3 @min-[51rem]:grid-cols-4 @min-[64rem]:grid-cols-5 lg:mt-[46px] lg:gap-x-[17px] lg:gap-y-[64px] xl:px-[3px]">
        {produtos.map((p, i) => (
          // Sem limite de fileiras (o Figma mostra as 3 de 5 no computador): só a fileira incompleta sai.
          <li key={p.slug} className={visivelEmLinhasCompletas(i, produtos.length, produtos.length)}>
            <VitrineCard
              product={p}
              selos={false}
              sizes="(min-width: 1280px) 246px, (min-width: 1104px) 19vw, (min-width: 896px) 23vw, (min-width: 648px) 31vw, 46vw"
            />
          </li>
        ))}
      </ul>
      <div className="mt-12 flex justify-center lg:mt-[64px]">
        <Link
          href="/produtos"
          className="inline-flex min-h-[55px] w-full max-w-[351px] items-center justify-center rounded-full bg-coral px-4 py-2 text-center text-xl/6 font-black text-white transition-colors hover:bg-coral-600 min-[360px]:px-6 min-[360px]:text-2xl/[28px]"
        >
          Ver todos os produtos
        </Link>
      </div>
    </section>
  );
}
