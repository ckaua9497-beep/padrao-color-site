"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui/cx";
import { CUPOM_BOAS_VINDAS as CUPOM } from "@/lib/store";

// Objeto novo a cada clique: o efeito reinicia a contagem mesmo quando o tipo se repete.
type Aviso = { tipo: "copiado" | "erro" };

/**
 * Faixa laranja do cupom de boas-vindas, acima do topo (rola com a página). A pílula preta copia o código.
 * `CUPOM_BOAS_VINDAS.ativo` em false esconde a faixa inteira (o checkout ainda não aplica cupom: store.ts).
 * Contraste: o branco sobre o laranja (3,3:1) só aparece a partir de lg, em texto grande (24px no xl, 20px bold no
 * lg); abaixo disso o texto é preto (6,3:1). O código fica sempre branco sobre preto.
 */
export function FaixaCupom() {
  return CUPOM.ativo ? <Faixa /> : null;
}

function Faixa() {
  const [aviso, setAviso] = useState<Aviso | null>(null);

  // O "Copiado!" volta a ser o código depois de alguns segundos.
  useEffect(() => {
    if (!aviso) return;
    const timer = window.setTimeout(() => setAviso(null), 2500);
    return () => window.clearTimeout(timer);
  }, [aviso]);

  const copiar = async () => {
    let ok = true;
    try {
      // Sem permissão (ou fora de HTTPS) a área de transferência não existe ou recusa: o aviso diz o código.
      await navigator.clipboard.writeText(CUPOM.codigo);
    } catch {
      ok = false;
    }
    setAviso({ tipo: ok ? "copiado" : "erro" });
  };

  const copiado = aviso?.tipo === "copiado";

  return (
    <div className="bg-coral text-ink lg:text-white">
      <div className="container-site flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 py-2 text-center md:flex-nowrap md:gap-x-0 lg:h-[78px] lg:py-0">
        <p className="text-[13px] font-semibold uppercase leading-tight md:text-[14px] lg:text-[20px] lg:font-bold lg:leading-none xl:text-[24px] xl:font-normal">{CUPOM.chamada}</p>
        <span aria-hidden className="hidden h-6 w-px bg-ink/25 md:mx-4 md:block lg:h-[49px] lg:bg-line-strong xl:ml-[19px] xl:mr-[29px]" />
        <p className="flex items-center gap-2.5 md:gap-3 lg:gap-6 xl:gap-[35px]">
          <span className="whitespace-nowrap text-[13px] font-black uppercase leading-none md:text-[14px] lg:text-[20px] xl:text-[24px]">{CUPOM.acao}</span>
          <button
            type="button"
            onClick={copiar}
            aria-label={`Copiar o cupom ${CUPOM.codigo}`}
            title="Copiar o cupom"
            className={cx(
              "relative grid h-8 place-items-center rounded-[5px] bg-ink px-3 text-[15px] font-black uppercase leading-none text-white transition-shadow duration-200 hover:ring-2 hover:ring-white/70",
              // Alvo de toque de 44px no celular sem engordar a faixa.
              "after:absolute after:-inset-y-1.5 after:inset-x-0 md:h-9 md:text-[16px] lg:h-[45px] lg:w-[190px] lg:px-0 lg:text-[20px] lg:after:hidden xl:w-[222px] xl:text-[24px]",
            )}
          >
            <span className={cx("col-start-1 row-start-1", copiado && "invisible")}>{CUPOM.codigo}</span>
            <span aria-hidden className={cx("col-start-1 row-start-1", !copiado && "invisible")}>
              Copiado!
            </span>
          </button>
        </p>
        <p role="status" className="sr-only">
          {aviso?.tipo === "copiado" ? `Cupom ${CUPOM.codigo} copiado` : aviso?.tipo === "erro" ? `Não deu para copiar. O cupom é ${CUPOM.codigo}` : ""}
        </p>
      </div>
    </div>
  );
}
