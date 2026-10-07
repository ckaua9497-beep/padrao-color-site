import Image from "next/image";
import { imageUrl } from "@/lib/format";
import { cx } from "@/components/ui/cx";
import { ART_BACK_KEY } from "@/components/product/art-editor/summary-keys";

/**
 * Miniatura do item: o quadro do mockup 3D (com a arte e o estilo escolhidos) quando existe,
 * senão a foto do catálogo. `caption` (opcional) aparece num selo no rodapé, ex.: o estilo da arte.
 * `options` (opcional, as opções do item): a arte com verso ganha o selo "F+V"; a simulação de fachada
 * (foto da loja, não 3D) fica sem o selo "3D".
 */
export function CartThumb({
  preview,
  image,
  name,
  className = "size-20",
  caption,
  options,
}: {
  preview: string | null;
  image: string;
  name: string;
  className?: string;
  caption?: string;
  options?: Record<string, string>;
}) {
  const twoSided = options ? artBackOf(options) !== undefined : false;
  const photo = options ? "Fachada" in options : false;
  return (
    <div className={cx("relative shrink-0 overflow-hidden rounded-control bg-mist ring-1 ring-black/5", className)}>
      {preview ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={`${photo ? "Simulação" : "Mockup"} de ${name}${twoSided ? ", arte na frente e no verso" : ""}`} className="size-full object-cover" />
          {!photo && (
            <span className="absolute left-1 top-1 rounded-full bg-ink/80 px-1.5 text-[9px] font-bold uppercase leading-4 tracking-wide text-white" aria-hidden>
              3D
            </span>
          )}
          {twoSided && (
            <span className="absolute right-1 top-1 rounded-full bg-white/90 px-1.5 text-[9px] font-bold uppercase leading-4 tracking-wide text-ink" aria-hidden>
              F+V
            </span>
          )}
          {caption && <span className="absolute inset-x-1 bottom-1 truncate rounded-full bg-white/90 px-1.5 text-center text-[9px] font-semibold leading-4 text-ink">{caption}</span>}
        </>
      ) : (
        <>
          <Image src={imageUrl(image)} alt={`${name}${twoSided ? ", arte na frente e no verso" : ""}`} fill sizes="80px" className="object-contain p-1" />
          {twoSided && (
            <span className="absolute right-1 top-1 rounded-full bg-ink/80 px-1.5 text-[9px] font-bold uppercase leading-4 tracking-wide text-white" aria-hidden>
              F+V
            </span>
          )}
        </>
      )}
    </div>
  );
}

/** Linha "Arte: …" do item no carrinho, no resumo e no checkout. */
export function artLine(artName: string | null) {
  return artName ? `Arte: ${artName}` : "Arte: enviar depois";
}

/** Estilo e textos da arte guardados nas opções do item (artSummary), para selos e resumos. */
export function artStyleOf(options: Record<string, string>): string | undefined {
  return options.Estilo;
}

/** Resumo da arte do verso guardado nas opções do item ("texto “Equipe”", "imagem"); undefined sem verso. */
export function artBackOf(options: Record<string, string>): string | undefined {
  return options[ART_BACK_KEY];
}
