import Link from "next/link";
import type { ProductSummary } from "@/lib/catalog";
import { CardResellerBadge, VitrinePrice } from "@/components/CardPrice";
import { FotoProduto, fotoDeEstudio } from "@/components/FotoProduto";
import { Badge } from "@/components/ui/Badge";
import { cx } from "@/components/ui/cx";

/*
 * Card de produto do Figma (página inicial, categorias, busca e relacionados): foto 3:4, nome à esquerda e
 * "A partir de:" com o preço grande em laranja. As fotos do site (public/site/produtos, fundo cinza de estúdio) ocupam
 * o quadro todo; as da API ficam inteiras sobre o cinza claro. ProductCard continua nas lojas da multiloja.
 */

type Props = {
  product: ProductSummary;
  priority?: boolean;
  /** `sizes` da imagem (largura do card na grade em que ele está). */
  sizes?: string;
  /** Mostra o selo "Lançamento" (false na página inicial, que no Figma não tem selo). O "Revenda" aparece sempre. */
  selos?: boolean;
  className?: string;
};

export default function VitrineCard({ product, priority = false, sizes = "(max-width: 768px) 46vw, (max-width: 1280px) 22vw, 240px", selos = true, className }: Props) {
  const estudio = fotoDeEstudio(product.image);
  return (
    <Link href={`/produto/${product.slug}`} className={cx("group flex h-full flex-col", className)}>
      <div className={cx("relative aspect-[3/4] overflow-hidden", estudio ? "bg-foto" : "bg-mist")}>
        <FotoProduto
          src={product.image}
          alt=""
          sizes={sizes}
          respiro="p-5"
          estudio="cobrir"
          priority={priority}
          className="transition-transform duration-400 ease-card group-hover:scale-[1.03] motion-reduce:transition-none"
        />
        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
          {selos && product.isNew && <Badge tone="dark">Lançamento</Badge>}
          <CardResellerBadge groupId={product.groupId} />
        </div>
      </div>
      {/* Altura fixa de 3 linhas no celular (cards estreitos: "Banner Roll Up Retrátil Personalizado" inteiro) e 2 a partir de sm. */}
      <h3 className="mt-3.5 line-clamp-3 min-h-[3.75em] text-base leading-tight decoration-1 underline-offset-2 group-hover:underline sm:line-clamp-2 sm:min-h-[2.5em]">
        {product.name}
      </h3>
      <VitrinePrice className="mt-auto pt-3" product={product} />
    </Link>
  );
}
