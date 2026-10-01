import Image from "next/image";
import Link from "next/link";
import type { ProductSummary } from "@/lib/catalog";
import { formatBRL, imageUrl, quantityLabel } from "@/lib/format";
import { IconCube } from "@/components/icons";

export default function ProductCard({ product, tone = "#f5f5f5", priority = false }: { product: ProductSummary; tone?: string; priority?: boolean }) {
  return (
    <Link href={`/produto/${product.slug}`} className="group flex h-full flex-col overflow-hidden rounded-card bg-white shadow-card transition-transform duration-500 ease-card hover:-translate-y-1">
      <div className="relative aspect-square overflow-hidden rounded-card" style={{ background: tone }}>
        <Image
          src={imageUrl(product.image)}
          alt={product.name}
          fill
          priority={priority}
          sizes="(max-width: 768px) 70vw, (max-width: 1280px) 33vw, 300px"
          className="object-contain p-4 transition-transform duration-500 ease-card group-hover:scale-[1.06]"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {product.bestSeller && <span className="rounded-full bg-coral px-3 py-1 text-[11px] font-bold text-white">Mais vendido</span>}
          {product.isNew && <span className="rounded-full bg-ink px-3 py-1 text-[11px] font-bold text-white">Lançamento</span>}
        </div>
        <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-ink opacity-0 transition-all duration-300 group-hover:opacity-100">
          <IconCube className="size-3.5 text-coral" /> Ver em 3D
        </span>
      </div>
      <div className="flex flex-1 flex-col items-center px-4 pb-5 pt-4 text-center">
        <h3 className="line-clamp-2 min-h-[2.5em] text-[15px] leading-tight tracking-[-0.01em]">{product.name}</h3>
        <p className="mt-2 text-[11px] uppercase tracking-wide text-muted">a partir de</p>
        <p className="text-lg font-bold text-coral">{formatBRL(product.price)}</p>
        <p className="text-[11px] text-muted">{quantityLabel(product.priceQty)}</p>
      </div>
    </Link>
  );
}
