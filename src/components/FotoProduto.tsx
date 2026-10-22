import Image, { getImageProps } from "next/image";
import { imageUrl } from "@/lib/format";
import { cx } from "@/components/ui/cx";

/** A foto é uma das fotos de estúdio do site (public/site/produtos: 3:4, com o cinza do estúdio no fundo)? */
export const fotoDeEstudio = (src: string) => src.startsWith("/site/produtos/");

/**
 * Fotos de estúdio em que o produto encosta nas laterais (na camisa, o braço e a mão): esticar a borda viraria listras
 * coloridas, então nos quadros elas cobrem a caixa. As outras têm só o fundo (liso ou em degradê) nas laterais.
 */
const ENCOSTA_NAS_LATERAIS = new Set(["/site/produtos/452.webp"]);

type Props = {
  src: string;
  alt: string;
  sizes: string;
  /** Respiro das fotos recortadas da API (fundo transparente) dentro da caixa. A foto de estúdio não tem respiro. */
  respiro?: string;
  /**
   * Foto de estúdio: "inteira" (galeria, prévias, capas) entra toda, e as laterais da caixa continuam o fundo dela;
   * "cobrir" (miniaturas, caixas 3:4) ocupa a caixa inteira.
   */
  estudio?: "inteira" | "cobrir";
  priority?: boolean;
  /** Classes da foto em si (zoom ao passar o mouse…). */
  className?: string;
};

/**
 * Foto de produto dentro de uma caixa. O pai precisa ser posicionado, com tamanho e `overflow-hidden`. O recorte da API
 * (fundo transparente) fica inteiro, com respiro, sobre o fundo do pai; a foto de estúdio, com o cinza dela, não vira
 * uma placa solta no meio do quadro.
 */
export function FotoProduto({ src, alt, sizes, respiro = "p-6", estudio = "inteira", priority = false, className }: Props) {
  const url = imageUrl(src);
  const loading = priority ? "eager" : "lazy";
  if (!fotoDeEstudio(src)) return <Image src={url} alt={alt} fill sizes={sizes} loading={loading} className={cx("object-contain", respiro, className)} />;
  if (estudio === "cobrir" || ENCOSTA_NAS_LATERAIS.has(src)) return <Image src={url} alt={alt} fill sizes={sizes} loading={loading} className={cx("object-cover", className)} />;
  // Laterais: a primeira e a última coluna da foto, esticadas. A versão de 96 px já vem suavizada e acompanha o degradê
  // do fundo de estúdio sem emenda, linha a linha. Uma cópia desfocada da foto inteira puxava a cor do produto para as
  // bordas, e desfoque ou escala por cima desalinham as faixas horizontais da foto (sombra, chão).
  const borda = { backgroundImage: `url("${getImageProps({ src: url, alt: "", width: 48, height: 64 }).props.src}")` };
  return (
    <>
      <span aria-hidden className="absolute inset-0 flex">
        <span className="flex-1 bg-size-[3000%_100%] bg-left bg-no-repeat" style={borda} />
        <span className="flex-1 bg-size-[3000%_100%] bg-right bg-no-repeat" style={borda} />
      </span>
      <Image src={url} alt={alt} fill sizes={sizes} loading={loading} className={cx("object-contain", className)} />
    </>
  );
}
