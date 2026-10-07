import Image from "next/image";
import Link from "next/link";
import type { ProductSummary } from "@/lib/catalog";
import { imageUrl, quantityLabel } from "@/lib/format";
import { IconCube } from "@/components/icons";
import { Badge } from "@/components/ui/Badge";
import { Price } from "@/components/ui/Price";

export default function ProductCard({ product, tone = "var(--color-mist)", priority = false }: { product: ProductSummary; tone?: string; priority?: boolean }) {
  return (
    <Link href={`/produto/${product.slug}`} className="group flex h-full flex-col overflow-hidden rounded-card bg-white shadow-card">
      <div className="relative aspect-square overflow-hidden rounded-card" style={{ background: tone }}>
        <Image
          src={imageUrl(product.image)}
          alt=""
          fill
          loading={priority ? "eager" : "lazy"}
          sizes="(max-width: 768px) 70vw, (max-width: 1280px) 33vw, 300px"
          className="object-contain p-4 transition-transform duration-400 ease-card group-hover:scale-[1.04] motion-reduce:transition-none"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {product.bestSeller && <Badge tone="brand">Mais vendido</Badge>}
          {product.isNew && <Badge tone="dark">Lançamento</Badge>}
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
        <Price className="mt-2 flex flex-col items-center" value={product.price} from unit={product.perM2 ? "por m²" : quantityLabel(product.priceQty)} />
      </div>
    </Link>
  );
}
