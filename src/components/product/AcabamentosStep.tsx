"use client";

import QtyStepper from "@/components/ui/QtyStepper";
import { cx } from "@/components/ui/cx";
import { MAX_QTD_ACABAMENTO, precoAcabamento, type Acabamento, type AcabamentoEscolhido } from "@/lib/acabamentos";
import { formatBRL } from "@/lib/format";

type Props = {
  /** Número do passo e total de passos da página. */
  step: number;
  total: number;
  /** Acabamentos que a variação escolhida aceita. */
  disponiveis: readonly Acabamento[];
  escolhidos: readonly AcabamentoEscolhido[];
  onChange: (escolhidos: AcabamentoEscolhido[]) => void;
  /** Peças do item (lotes × unidades do lote): base do preço por milheiro e por unidade. */
  unidades: number;
};

const COBRANCA: Record<Acabamento["cobranca"], string> = { milheiro: "por milheiro", unidade: "por unidade", fixo: "por item" };
const dias = (n: number) => `+${n} ${n === 1 ? "dia útil" : "dias úteis"}`;

/** Passo "Acabamentos extras" (opcional): serrilha, furo, dobra, laminação…, com o preço para a quantidade escolhida. */
export function AcabamentosStep({ step, total, disponiveis, escolhidos, onChange, unidades }: Props) {
  const toggle = (acabamento: Acabamento, on: boolean) =>
    onChange(on ? [...escolhidos.filter((e) => e.id !== acabamento.id), { id: acabamento.id, qtd: 1 }] : escolhidos.filter((e) => e.id !== acabamento.id));
  const setQtd = (id: string, qtd: number) => onChange(escolhidos.map((e) => (e.id === id ? { ...e, qtd } : e)));

  return (
    <li id="passo-acabamentos" className="scroll-mt-painel">
      <p className="mb-2.5 flex items-center gap-2 text-[15px] font-bold">
        <span className="grid size-5 place-items-center rounded-full bg-ink text-[11px] text-white">{step}</span>
        Acabamentos extras
        <span className="text-caption font-normal text-muted">
          · opcional · passo {step} de {total}
        </span>
      </p>
      <ul className="grid gap-2">
        {disponiveis.map((acabamento) => {
          const escolha = escolhidos.find((e) => e.id === acabamento.id);
          const qtd = escolha?.qtd ?? 1;
          const preco = precoAcabamento(acabamento, unidades, qtd);
          return (
            <li key={acabamento.id} className={cx("rounded-control px-3.5 py-2.5 ring-1 transition-shadow", escolha ? "bg-white ring-2 ring-ink" : "bg-white ring-line-strong")}>
              <label className="flex cursor-pointer items-center gap-3 text-[14px]">
                <input type="checkbox" checked={Boolean(escolha)} onChange={(event) => toggle(acabamento, event.target.checked)} className="size-4 shrink-0 accent-coral-700" />
                <span className="min-w-0 flex-1">
                  <span className={cx("block leading-snug", escolha && "font-semibold")}>{acabamento.nome}</span>
                  <span className="block text-caption text-muted">
                    {acabamento.preco > 0 ? `${formatBRL(acabamento.preco)} ${COBRANCA[acabamento.cobranca]}` : "Sem custo"}
                    {acabamento.prazo > 0 ? ` · ${dias(acabamento.prazo)}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{preco > 0 ? `+ ${formatBRL(preco)}` : "incluso"}</span>
              </label>
              {escolha && acabamento.qtd && (
                <div className="mt-2 flex items-center gap-3 pl-7 text-caption text-muted">
                  <QtyStepper size="sm" value={qtd} onChange={(value) => setQtd(acabamento.id, value)} min={1} max={MAX_QTD_ACABAMENTO} label={`Quantidade de ${acabamento.nome}`} />
                  Quantos aplicar em cada peça
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}
