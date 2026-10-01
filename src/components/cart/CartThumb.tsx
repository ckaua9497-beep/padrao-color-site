import Image from "next/image";
import { imageUrl } from "@/lib/format";
import { cx } from "@/components/ui/cx";

/** Miniatura do item: o quadro do mockup 3D quando existe, senão a foto do catálogo. */
export function CartThumb({ preview, image, name, className = "size-20" }: { preview: string | null; image: string; name: string; className?: string }) {
  return (
    <div className={cx("relative shrink-0 overflow-hidden rounded-control bg-mist", className)}>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={`Mockup de ${name}`} className="size-full object-cover" />
      ) : (
        <Image src={imageUrl(image)} alt={name} fill sizes="80px" className="object-contain p-1" />
      )}
    </div>
  );
}

/** Linha "Arte: …" do item no carrinho, no resumo e no checkout. */
export function artLine(artName: string | null) {
  return artName ? `Arte: ${artName}` : "Arte: enviar depois";
}
