import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";

/*
 * Faixa de vantagens logo abaixo do carrossel (TARJA_02 do Figma): branca, 101 px com a borda, cinco colunas com divisórias
 * claras e borda embaixo, textos em caixa alta (Raleway 16 normal) com as quebras de linha do Figma. As colunas têm as
 * larguras do Figma (245, 271, 253, 265 e 247 de 1280) e o texto fica centrado na coluna, alinhado à esquerda.
 * A faixa de colunas acompanha o conteúdo da página mais as margens de 108 px do Figma: toda a tela até 1516 px e
 * 1516 px (1300 + 2 × 108) nas telas mais largas, em vez de ficar mais estreita que o conteúdo.
 * Abaixo de 1024 px vira uma faixa que rola de lado (com encaixe), sem estourar a página.
 */

type Item = { linhas: string[]; href?: string; externo?: boolean };

export default function FaixaBeneficios({ produtos, prazoMinimo, revendedor }: { produtos: number; prazoMinimo: number; revendedor: string | null }) {
  const itens: Item[] = [
    { linhas: [`${produtos} produtos`, "para a sua marca"], href: "/produtos" },
    { linhas: ["Produção a partir", `de ${prazoMinimo} ${prazoMinimo === 1 ? "dia útil" : "dias úteis"}`] },
    { linhas: ["Atendimento de", "segunda a sexta", "de 08h às 18h"] },
    { linhas: ["Veja seu produto", "em 3D antes", "de imprimir"], href: "/#mockup-3d" },
    { linhas: ["Seja um", "revendedor", "Padrão Color"], href: revendedor ?? undefined, externo: true },
  ];

  return (
    <section aria-label="Vantagens da Padrão Color" className="relative border-b border-line-strong bg-white">
      <ul className="no-scrollbar mx-auto flex max-w-[1516px] snap-x snap-mandatory overflow-x-auto overscroll-x-contain lg:grid lg:grid-cols-[245fr_271fr_253fr_265fr_247fr] lg:overflow-visible">
        {itens.map((item, i) => (
          <li key={item.linhas[0]} className={cx("h-[88px] w-[46%] shrink-0 snap-start sm:w-[31%] md:w-[24%] lg:h-[100px] lg:w-auto", i > 0 && "border-l border-line-strong")}>
            <Conteudo item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Conteudo({ item }: { item: Item }) {
  const texto: ReactNode = item.linhas.map((linha, i) => (
    <Fragment key={linha}>
      {i > 0 && <br />}
      {linha}
    </Fragment>
  ));
  // A célula inteira é o alvo do link (a faixa tem 88 px de altura no celular).
  const celula = "group flex size-full items-center justify-center px-3 focus-visible:-outline-offset-4";
  const linha = <span className="block text-sm/[17px] uppercase decoration-1 underline-offset-4 group-hover:underline lg:text-base/[19px]">{texto}</span>;
  if (!item.href) return <p className={celula}>{linha}</p>;
  if (item.externo) {
    return (
      <a href={item.href} rel="noopener" className={celula}>
        {linha}
      </a>
    );
  }
  return (
    <Link href={item.href} className={celula}>
      {linha}
    </Link>
  );
}
