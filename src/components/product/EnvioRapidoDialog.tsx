"use client";

import type { ReactNode } from "react";
import { IconBolt, IconCheck } from "@/components/icons";
import { FotoProduto } from "@/components/FotoProduto";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { cx } from "@/components/ui/cx";
import { ARQUIVO_UNICO } from "@/lib/customizacao";
import { ArquivosParaProducao, DetalhesDaArte, type ArtDetails } from "./SendArtDialog";
import { TermosArte } from "./TermosArte";

/** Arquivos da arte no envio rápido: os tipos da variação (sempre com o arquivo único), os enviados e o aviso de falta. */
export type EnvioRapidoArte = {
  types: readonly string[];
  files: Readonly<Record<string, File>>;
  onFile: (tipo: string, file: File | null) => void;
  check: (file: File) => string | null;
  /** Anexos que o site faz sozinho a partir da arte (faca, posição do LED, máscara de verniz). */
  automatic: readonly string[];
  /** Frente e verso que já estão montados no editor da página (nome da imagem ou "texto"), quando há. */
  editorFront: string | null;
  editorBack: string | null;
  /** Tentou adicionar sem arte nenhuma. */
  faltando: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  produto: { name: string; image: string };
  /** Passos de configuração do produto (os mesmos da página, no mesmo estado: escolher aqui muda a página). */
  configuracao: ReactNode;
  /** Quantidade (o mesmo controle da página); sem ela, a quantidade sai da configuração (grade, letreiro). */
  quantidade?: ReactNode;
  /** Nome do controle de quantidade (unidades, peças ou lotes da quantidade escolhida). */
  quantidadeTitulo?: string;
  /** Prazo econômico ou expresso, quando a variação tem os dois. */
  prazo?: ReactNode;
  /** null: a variação não leva arte (produto liso, neon pronto). */
  arte: EnvioRapidoArte | null;
  details?: ArtDetails | null;
  termos?: { aceito: boolean; onAceito: (aceito: boolean) => void; faltando: boolean } | null;
  resumo: { linhas: readonly (readonly [string, string])[]; totalLabel: string; total: string; prazo: string | null; nota?: string | null };
  onAdd: () => void;
  adding: boolean;
  /** "Prefiro montar a arte no site": fecha e leva ao passo da arte (o web-to-print com o 3D). */
  onMontar?: (() => void) | null;
};

function Secao({ n, titulo, nota, id, children }: { n: number; titulo: string; nota?: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id ?? `rapido-${n}`}-titulo`} className="scroll-mt-4">
      <h3 id={`${id ?? `rapido-${n}`}-titulo`} className="flex flex-wrap items-baseline gap-x-2 text-[17px] font-bold">
        <span className="grid size-6 shrink-0 place-items-center self-center rounded-full bg-ink text-[12px] text-white">{n}</span>
        {titulo}
        {nota && <span className="text-caption font-normal text-muted">· {nota}</span>}
      </h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * Envio rápido (pedido de 29/10/2026): para quem já tem a arte pronta. Antes do web-to-print da página (o passo "Sua
 * arte", com o editor e o 3D), o cliente configura o produto e envia os arquivos de produção numa tela só e adiciona ao
 * carrinho. A configuração e os arquivos são o mesmo estado da página: fechando o modal, a página mostra o que foi
 * escolhido (e a frente enviada no 3D). Arquivo único sempre; os separados só quando a variação aceita (tipos_anexo).
 */
export function EnvioRapidoDialog({ open, onClose, produto, configuracao, quantidade, quantidadeTitulo = "Quantidade", prazo, arte, details, termos, resumo, onAdd, adding, onMontar }: Props) {
  const enviados = arte ? arte.types.filter((tipo) => arte.files[tipo]) : [];
  // Seções numeradas na ordem: configuração, arquivos (quando a variação leva arte) e o que vai para a produção.
  const passoConfig = 1;
  const passoArte = arte ? 2 : 0;
  const passoFinal = termos || details ? (arte ? 3 : 2) : 0;
  return (
    <Dialog open={open} onClose={onClose} label={`Envio rápido: ${produto.name}`} className="max-w-[1080px]">
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col md:max-h-[calc(100dvh-4.5rem)]">
        {/* relative: os campos de arquivo escondidos (sr-only) ficam presos na área que rola. */}
        <div className="relative overflow-y-auto px-5 pb-6 pt-6 md:px-8 md:pt-8">
          <p className="flex items-center gap-1.5 text-micro font-bold uppercase tracking-[0.18em] text-coral-700">
            <IconBolt className="size-4" /> Envio rápido
          </p>
          <h2 className="mt-1 text-title font-bold">{produto.name}</h2>
          <p className="mt-1 max-w-2xl text-muted">Já tem a arte pronta? Configure o produto e envie os arquivos aqui mesmo, sem passar pelo editor.</p>

          <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,1fr)_300px]">
            <div className="grid min-w-0 gap-8">
              <Secao n={passoConfig} titulo="Configuração do produto" id="rapido-config">
                <ol className="space-y-6">{configuracao}</ol>
                {(quantidade || prazo) && (
                  <div className="mt-6 grid gap-5">
                    {quantidade && (
                      <div>
                        <p className="mb-2.5 text-[15px] font-bold">{quantidadeTitulo}</p>
                        {quantidade}
                      </div>
                    )}
                    {prazo}
                  </div>
                )}
              </Secao>

              {arte && (
                <Secao n={passoArte} titulo="Arquivos da arte" nota="prontos para a produção" id="rapido-arte">
                  <p className="text-caption text-muted">A arte vai para a produção exatamente como você enviar: PDF, JPG, PNG, PSD, AI, CDR, EPS ou SVG.</p>
                  <div className={cx("rounded-card transition-colors", arte.faltando && !enviados.length && "bg-coral-50 p-3 ring-1 ring-coral-700")}>
                    <ArquivosParaProducao
                      types={arte.types}
                      files={arte.files}
                      onFile={arte.onFile}
                      check={arte.check}
                      automatic={arte.automatic}
                      editorFront={arte.editorFront}
                      editorBack={arte.editorBack}
                      idPrefixo="rapido-envio"
                    />
                  </div>
                  {arte.faltando && !enviados.length && (
                    <p role="alert" className="mt-2 text-sm font-semibold text-coral-700">
                      Envie o arquivo da arte para continuar{onMontar ? ", ou monte a arte no site." : "."}
                    </p>
                  )}
                  {onMontar && (
                    <p className="mt-4 text-caption text-muted">
                      Ainda não tem o arquivo?{" "}
                      <Button variant="link" size="sm" className="min-h-6 text-caption" onClick={onMontar}>
                        Montar a arte no site, com o mockup 3D
                      </Button>
                    </p>
                  )}
                </Secao>
              )}

              {passoFinal > 0 && (
                <Secao n={passoFinal} titulo="Para a produção">
                  <div className="grid gap-5">
                    {details && <DetalhesDaArte details={details} />}
                    {termos && <TermosArte id="rapido-termos" aceito={termos.aceito} onAceito={termos.onAceito} faltando={termos.faltando} />}
                  </div>
                </Secao>
              )}
            </div>

            <aside aria-label="Resumo do envio rápido" className="h-fit rounded-card bg-mist p-5 md:sticky md:top-0">
              <div className="flex items-center gap-3">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-thumb bg-white">
                  <FotoProduto src={produto.image} alt="" sizes="64px" respiro="p-1" estudio="cobrir" />
                </div>
                <p className="min-w-0 text-[15px] font-bold leading-snug">{produto.name}</p>
              </div>
              <dl className="mt-4 grid gap-1.5 text-sm">
                {resumo.linhas.map(([rotulo, valor]) => (
                  <div key={rotulo} className="flex justify-between gap-3">
                    <dt className="text-muted">{rotulo}</dt>
                    <dd className="text-right font-semibold">{valor}</dd>
                  </div>
                ))}
              </dl>
              {arte && (
                <div className="mt-4 border-t border-line pt-4">
                  <p className="text-caption font-semibold text-muted">Arquivos</p>
                  {enviados.length ? (
                    <ul className="mt-1.5 grid gap-1 text-sm">
                      {enviados.map((tipo) => (
                        <li key={tipo} className="flex items-center gap-1.5">
                          <IconCheck className="size-4 shrink-0 text-lime-700" strokeWidth={2.4} />
                          <span className="min-w-0 truncate">
                            <strong>{tipo === ARQUIVO_UNICO ? "Arquivo único" : tipo}</strong> · {arte.files[tipo].name}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1.5 text-sm">{arte.editorFront ? `Arte montada no site (${arte.editorFront})` : "Nenhum arquivo enviado ainda."}</p>
                  )}
                </div>
              )}
              <div className="mt-4 border-t border-line pt-4 tabular-nums">
                <p className="text-caption text-muted">Total · {resumo.totalLabel}</p>
                <p className="text-2xl font-black">{resumo.total}</p>
                {resumo.nota && <p className="text-caption text-muted">{resumo.nota}</p>}
                {resumo.prazo && <p className="mt-1 text-caption text-muted">{resumo.prazo}</p>}
              </div>
            </aside>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-white px-5 py-4 md:px-8">
          <p className="mr-auto text-sm tabular-nums">
            <span className="text-muted">Total</span> <strong className="text-lg">{resumo.total}</strong>
          </p>
          <Button variant="outline" size="sm" onClick={onClose}>
            Voltar
          </Button>
          <Button variant="buy" size="md" className="grow sm:grow-0" loading={adding} onClick={onAdd}>
            {adding ? "Adicionando…" : "Adicionar ao carrinho"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
