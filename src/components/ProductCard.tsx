import Link from "next/link";
import type { ProductSummary } from "@/lib/catalog";
import { CardPrice, CardResellerBadge } from "@/components/CardPrice";
import { IconCube } from "@/components/icons";
import { Badge } from "@/components/ui/Badge";
import { FotoProduto } from "@/components/FotoProduto";

export default function ProductCard({ product, tone = "var(--color-mist)", priority = false }: { product: ProductSummary; tone?: string; priority?: boolean }) {
  return (
    <Link href={`/produto/${product.slug}`} className="group flex h-full flex-col overflow-hidden rounded-card bg-white shadow-card">
      <div className="relative aspect-square overflow-hidden rounded-card" style={{ background: tone }}>
        <FotoProduto
          src={product.image}
          alt=""
          sizes="(max-width: 768px) 70vw, (max-width: 1280px) 33vw, 300px"
          respiro="p-4"
          priority={priority}
          className="transition-transform duration-400 ease-card group-hover:scale-[1.04] motion-reduce:transition-none"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {product.bestSeller && <Badge tone="brand">Mais vendido</Badge>}
          {product.isNew && <Badge tone="dark">Lançamento</Badge>}
          <CardResellerBadge groupId={product.groupId} />
        </div>
        <span
          aria-hidden
          className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-micro font-bold text-ink opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <IconCube className="size-3.5 text-coral-700" /> Ver em 3D
        </span>
      </div>
      <div className="flex flex-1 flex-col items-center px-4 pb-5 pt-4 text-center">
        <h3 className="line-clamp-2 min-h-[2.4em] text-card-title">{product.name}</h3>
        <CardPrice className="mt-2" product={product} />
      </div>
    </Link>
  );
}
