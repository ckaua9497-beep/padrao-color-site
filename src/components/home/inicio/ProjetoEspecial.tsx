import Image from "next/image";
import { cx } from "@/components/ui/cx";
import { CONTEUDO } from "./layout";

/*
 * Faixa "Projeto especial" do Figma: escura (243 px), "Vai produzir um projeto único e exclusivo?" (45, com o fim em
 * black), o convite em 24 e o botão laranja "Solicitar Projeto Especial" (branco 24 black: texto grande). À direita, o
 * contorno laranja do símbolo da Padrão, cortado pela faixa como no Figma (459 × 332, 36 px acima do topo, começando
 * 99 px antes da margem direita do conteúdo: x = 1073 no quadro de 1280; nas telas largas acompanha o conteúdo).
 * No tablet o contorno desce para o canto de baixo (o texto ocupa a largura toda); no celular ele sai (ficaria atrás
 * do texto) e o botão usa 22 black, que ainda é texto grande (≥ 19 px bold) para o branco sobre o laranja.
 */

export default function ProjetoEspecial({ link }: { link: { href: string; novaAba: boolean } | null }) {
  return (
    <section aria-labelledby="inicio-projeto-especial" className="on-dark relative mb-[53px] mt-[66px] overflow-hidden bg-night text-white">
      <Image
        src="/site/marca/simbolo-contorno-laranja.webp"
        alt=""
        width={1090}
        height={788}
        sizes="(min-width: 1280px) 459px, 300px"
        className="pointer-events-none absolute -bottom-[110px] -right-[60px] hidden h-auto w-[280px] select-none sm:block xl:bottom-auto xl:left-[calc(min(100%-108px,50%+650px)-99px)] xl:right-auto xl:top-[-36px] xl:w-[459px]"
      />
      <div className={cx(CONTEUDO, "relative py-10 xl:h-[243px] xl:pb-0 xl:pt-[50px]")}>
        <h2 id="inicio-projeto-especial" className="text-[28px]/[1.18] font-normal sm:text-[36px] xl:-ml-[6px] xl:text-[45px]/[53px]">
          Vai produzir um projeto <strong className="font-black">único e exclusivo?</strong>
        </h2>
        <div className="mt-6 flex flex-col items-start gap-6 xl:mt-[33px] xl:flex-row xl:items-center xl:gap-[118px] xl:pl-2">
          <p className="text-xl/[1.2] sm:text-2xl/[28px] xl:min-w-[405px]">
            Solicite um projeto especial,
            <br />
            nós te ajudamos com todo o projeto.
          </p>
          {link && (
            <a
              href={link.href}
              {...(link.novaAba ? { target: "_blank", rel: "noopener noreferrer" } : { rel: "noopener" })}
              className="inline-flex min-h-[55px] w-full max-w-[351px] shrink-0 items-center justify-center rounded-full bg-coral px-4 py-2 text-center text-xl/6 font-black text-white transition-colors hover:bg-coral-600 min-[360px]:text-[22px]/[26px] sm:text-2xl/[28px]"
            >
              Solicitar Projeto Especial
              {link.novaAba && <span className="sr-only"> (abre em nova aba)</span>}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
