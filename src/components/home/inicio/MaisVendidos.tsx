import VitrineCard from "@/components/VitrineCard";
import { cx } from "@/components/ui/cx";
import type { ProductSummary } from "@/lib/catalog";
import CabecalhoSecao from "./CabecalhoSecao";
import { CONTEUDO } from "./layout";
import TrilhoProdutos from "./TrilhoProdutos";

/** "Mais vendidos" do Figma: título, "Ver todos" e o trilho de cards com a seta ">" (os mais vendidos da vitrine da Padrão). */
export default function MaisVendidos({ produtos }: { produtos: ProductSummary[] }) {
  if (!produtos.length) return null;
  return (
    <section aria-labelledby="inicio-mais-vendidos" className={cx(CONTEUDO, "pb-10 pt-10 lg:pb-[67px] lg:pt-[51px]")}>
      <CabecalhoSecao id="inicio-mais-vendidos" titulo="Mais vendidos" href="/produtos" rotuloLink="Ver todos os produtos" alinharCards />
      {/* No Figma os cards ficam 6 px para dentro das margens e a seta encosta na margem direita. */}
      <div className="mt-6 lg:mt-[29px] xl:px-[6px]">
        <TrilhoProdutos rotulo="Produtos mais vendidos">
          {produtos.map((p) => (
            // Cards de (conteúdo − 12 − 4 vãos) ÷ 5 a partir de 1280 px: 199 px no quadro do Figma e até 246 px com o conteúdo de 1300.
            <VitrineCard key={p.slug} product={p} selos={false} sizes="(min-width: 1280px) 246px, (min-width: 1024px) 19vw, (min-width: 768px) 23vw, (min-width: 640px) 30vw, 44vw" />
          ))}
        </TrilhoProdutos>
      </div>
    </section>
  );
}
