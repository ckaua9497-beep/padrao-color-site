import Link from "next/link";
import { cx } from "@/components/ui/cx";
import { SetaFina } from "./icones";

/**
 * Título de seção da página inicial (Raleway 24 normal) com o "Ver todos →" (15 black) à direita, como no Figma.
 * `rotuloLink` completa o nome do link para quem usa leitor de tela ("Ver todos os produtos").
 * A partir de 1280 px o link fica recuado da margem direita do conteúdo como no Figma: 19 px em Categorias (a seta
 * termina em 1153 com o conteúdo até 1172) e 7 px quando há cards embaixo (`alinharCards`: a seta termina na borda
 * do último card de "Mais vendidos", que fica 6 px para dentro).
 */
export default function CabecalhoSecao({ id, titulo, href, rotuloLink, alinharCards = false }: { id: string; titulo: string; href?: string; rotuloLink?: string; alinharCards?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 id={id} className="text-2xl/[28px] font-normal">
        {titulo}
      </h2>
      {href && (
        <Link
          href={href}
          aria-label={rotuloLink}
          className={cx(
            "-my-2 inline-flex min-h-11 shrink-0 items-center gap-[7px] text-[15px]/[17px] font-black decoration-1 underline-offset-4 hover:underline",
            alinharCards ? "xl:mr-[7px]" : "xl:mr-[19px]",
          )}
        >
          Ver todos
          <SetaFina className="h-3 w-[15px]" />
        </Link>
      )}
    </div>
  );
}
