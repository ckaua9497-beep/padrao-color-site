import Image from "next/image";
import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { IconeEntregaRapida, IconeEnvioDireto, IconePlanejamento, SetaFina } from "./icones";
import { CONTEUDO } from "./layout";

/*
 * Quatro cartões de vantagens (TARJA 03 do Figma): faixa cinza de 321 px com cartões brancos de 262 × 209 e sombra,
 * título laranja (24 black: texto grande, o laranja passa no contraste), texto de 16 com as quebras do Figma, ícone de
 * 57 px à direita (texto e ícone alinhados embaixo) e a pílula "CONSULTE CONDIÇÕES" com borda laranja. Os links são os
 * botões da 2ª linha da vitrine da Padrão (storefront.json), que abrem em nova aba como lá.
 * Quatro colunas a partir de 1280 px, duas no tablet e uma no celular. A fileira segue a largura do conteúdo e passa
 * 13 px de cada lado dele, como no Figma (1090 px nos 1064 do quadro de 1280): nas telas largas os cartões crescem junto.
 */

export type LinkCartao = { href: string; novaAba: boolean } | null;

type Cartao = { titulo: string; texto: ReactNode; icone: ReactNode; link: LinkCartao };

const icone = "size-[57px] shrink-0";

export default function CartoesBeneficios({ envioDireto, categoriasDesconto, entrega, projetosEspeciais }: Record<"envioDireto" | "categoriasDesconto" | "entrega" | "projetosEspeciais", LinkCartao>) {
  const cartoes: Cartao[] = [
    {
      titulo: "Envio Direto",
      texto: "Envio Direto para\no seu cliente.\nPersonalize com\na sua etiqueta.",
      icone: <IconeEnvioDireto className={icone} />,
      link: envioDireto,
    },
    {
      titulo: "Categorias\nde Desconto",
      texto: "Preços especiais\nde acordo com o\nseu nível de categoria.",
      icone: <Image src="/site/marca/icone-promo.webp" alt="" width={53} height={53} className="mb-1 mr-[3px] size-[53px] shrink-0" />,
      link: categoriasDesconto,
    },
    {
      titulo: "Conheça nossa\nentrega Expressa",
      texto: "Tenha o seu\nproduto com\nprazo reduzido.",
      icone: <IconeEntregaRapida className={icone} />,
      link: entrega,
    },
    {
      titulo: "Projetos Especiais",
      texto: (
        <>
          Não encontrou{"\n"}o seu projeto no site?{"\n"}
          <strong className="font-black">Solicite aqui{"\n"}o orçamento!</strong>
        </>
      ),
      icone: <IconePlanejamento className={cx(icone, "-mr-2")} />,
      link: projetosEspeciais,
    },
  ];

  return (
    <section aria-label="Condições para a sua empresa" className="bg-vitrine">
      <div className={cx(CONTEUDO, "py-10 xl:pb-[62px] xl:pt-[50px]")}>
        <ul className="grid gap-[14px] sm:grid-cols-2 xl:-mx-[13px] xl:grid-cols-4">
          {cartoes.map((c) => (
            <li key={c.titulo} className="flex min-h-[209px] flex-col bg-white px-[18px] pb-[17px] pt-4 shadow-cartao">
              <h3 className="whitespace-pre-line text-2xl/[28px] font-black text-coral">{c.titulo}</h3>
              <div className="mt-auto flex items-end justify-between gap-1 pt-[9px]">
                {/* Só quebra onde o Figma quebra: se faltar espaço, o ícone avança um pouco sobre a margem. */}
                <p className="shrink-0 whitespace-pre-line text-base/[19px]">{c.texto}</p>
                {c.icone}
              </div>
              {c.link && <BotaoCondicoes link={c.link} contexto={c.titulo.replace("\n", " ")} />}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function BotaoCondicoes({ link, contexto }: { link: NonNullable<LinkCartao>; contexto: string }) {
  return (
    <a
      href={link.href}
      {...(link.novaAba ? { target: "_blank", rel: "noopener noreferrer" } : { rel: "noopener" })}
      className={cx(
        "mt-[17px] inline-flex h-11 w-full max-w-[229px] items-center justify-between rounded-full border border-coral pl-[11px] pr-[17px] text-[15px]/[18px] uppercase",
        // A partir de 1280 px a pílula ocupa a largura do cartão (226 px no quadro do Figma), também quando ele cresce.
        "transition-colors hover:bg-coral-50 xl:h-[37px] xl:max-w-none",
      )}
    >
      <span>
        Consulte condições<span className="sr-only">: {contexto}</span>
        {link.novaAba && <span className="sr-only"> (abre em nova aba)</span>}
      </span>
      <SetaFina className="h-3.5 w-[18px]" />
    </a>
  );
}
