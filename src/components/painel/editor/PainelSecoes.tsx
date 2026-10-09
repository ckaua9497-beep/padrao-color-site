"use client";

import { useState } from "react";
import { IconClose, IconLayers, IconPlus } from "@/components/icons";
import { cx } from "@/components/ui/cx";
import { MAX_SECOES, SECAO_NOME, SECOES_PRONTAS, secaoId, type LojaInfo, type Secao } from "@/lib/multiloja/tema";

/*
 * Painel "Seções": a página inicial de cima para baixo. Arrastar (ou ↑ ↓) muda a ordem, o olho esconde sem apagar,
 * clicar abre o formulário da seção. "Adicionar seção" mostra a biblioteca de seções prontas.
 */

type Props = {
  secoes: Secao[];
  info: LojaInfo;
  onChange: (secoes: Secao[]) => void;
  onAbrir: (id: string) => void;
  /** Depois de qual seção entra a nova (a selecionada); null = no fim. */
  depoisDe: string | null;
};

function resumo(s: Secao): string {
  switch (s.tipo) {
    case "hero":
    case "categorias":
    case "produtos":
    case "chamada":
    case "texto":
    case "depoimentos":
    case "perguntas":
      return s.titulo;
    case "banners":
      return `${s.slides.length} ${s.slides.length === 1 ? "imagem" : "imagens"}`;
    case "vantagens":
      return s.itens.map((i) => i.titulo).join(" · ");
  }
}

export default function PainelSecoes({ secoes, info, onChange, onAbrir, depoisDe }: Props) {
  const [biblioteca, setBiblioteca] = useState(false);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [alvo, setAlvo] = useState<number | null>(null);

  const mover = (from: number, to: number) => {
    if (from === to || to < 0 || to >= secoes.length) return;
    const next = [...secoes];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const adicionar = (criar: (info: LojaInfo) => Secao) => {
    const nova = criar(info);
    const at = depoisDe ? secoes.findIndex((s) => s.id === depoisDe) + 1 : secoes.length;
    const next = [...secoes];
    next.splice(at > 0 ? at : secoes.length, 0, nova);
    onChange(next);
    setBiblioteca(false);
    onAbrir(nova.id);
  };

  if (biblioteca) {
    return (
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[15px] font-bold">Seções prontas</p>
          <button type="button" onClick={() => setBiblioteca(false)} aria-label="Fechar seções prontas" className="grid size-9 place-items-center rounded-full hover:bg-mist">
            <IconClose className="size-4" />
          </button>
        </div>
        <p className="mb-3 text-[13px] text-muted">Escolha uma: ela entra {depoisDe ? "depois da seção selecionada" : "no fim da página"}, já com textos de exemplo.</p>
        <ul className="grid gap-2">
          {SECOES_PRONTAS.map((pronta) => (
            <li key={pronta.chave}>
              <button type="button" onClick={() => adicionar(pronta.criar)} className="flex w-full items-start gap-3 rounded-control border border-line bg-white p-3 text-left transition-colors hover:border-ink">
                <span aria-hidden className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-coral-50 text-coral-700">
                  <IconPlus className="size-4" />
                </span>
                <span>
                  <span className="block text-[13px] font-bold">{pronta.nome}</span>
                  <span className="block text-[12px] leading-snug text-muted">{pronta.descricao}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="p-4">
      <p className="mb-3 text-[13px] text-muted">A página inicial, de cima para baixo. Arraste para mudar a ordem e clique para editar.</p>
      <ol className="space-y-1.5" aria-label="Seções da página inicial">
        {secoes.map((s, i) => (
          <li
            key={s.id}
            draggable
            onDragStart={(e) => {
              setArrastando(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setAlvo(i);
            }}
            onDragEnd={() => {
              setArrastando(null);
              setAlvo(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (arrastando !== null) mover(arrastando, i);
              setArrastando(null);
              setAlvo(null);
            }}
            className={cx(
              "flex items-center gap-1 rounded-control border bg-white pl-1 pr-1 transition-colors",
              alvo === i && arrastando !== null && arrastando !== i ? "border-ink" : "border-line",
              arrastando === i && "opacity-50",
              !s.visivel && "bg-mist",
            )}
          >
            <span aria-hidden className="grid h-10 w-5 shrink-0 cursor-grab place-items-center text-[14px] leading-none text-subtle active:cursor-grabbing">
              ⋮⋮
            </span>
            <button type="button" onClick={() => onAbrir(s.id)} className="min-w-0 flex-1 py-2 text-left">
              <span className={cx("block truncate text-[13px] font-bold", !s.visivel && "text-muted")}>{SECAO_NOME[s.tipo]}</span>
              <span className="block truncate text-[12px] text-muted">{s.visivel ? resumo(s) || "—" : "Escondida"}</span>
            </button>
            <button type="button" onClick={() => mover(i, i - 1)} disabled={i === 0} aria-label={`Subir ${SECAO_NOME[s.tipo]}`} className="grid size-8 place-items-center rounded-full text-muted hover:bg-mist hover:text-ink disabled:opacity-30">
              ↑
            </button>
            <button type="button" onClick={() => mover(i, i + 1)} disabled={i === secoes.length - 1} aria-label={`Descer ${SECAO_NOME[s.tipo]}`} className="grid size-8 place-items-center rounded-full text-muted hover:bg-mist hover:text-ink disabled:opacity-30">
              ↓
            </button>
            <button
              type="button"
              onClick={() => onChange(secoes.map((x) => (x.id === s.id ? { ...x, visivel: !x.visivel } : x)))}
              aria-label={s.visivel ? `Esconder ${SECAO_NOME[s.tipo]}` : `Mostrar ${SECAO_NOME[s.tipo]}`}
              aria-pressed={!s.visivel}
              title={s.visivel ? "Esconder" : "Mostrar"}
              className="grid size-8 place-items-center rounded-full text-muted hover:bg-mist hover:text-ink"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
                <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
                <circle cx="12" cy="12" r="2.8" />
                {!s.visivel && <path d="M4 20 20 4" />}
              </svg>
            </button>
          </li>
        ))}
      </ol>
      {secoes.length === 0 && (
        <p className="flex flex-col items-center gap-2 rounded-control border border-dashed border-line-strong px-4 py-8 text-center text-[13px] text-muted">
          <IconLayers className="size-6" />A página está vazia. Adicione uma seção pronta ou aplique um modelo.
        </p>
      )}
      <button
        type="button"
        onClick={() => setBiblioteca(true)}
        disabled={secoes.length >= MAX_SECOES}
        className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink text-[14px] font-bold text-white transition-colors hover:bg-coral-700 disabled:opacity-40"
      >
        <IconPlus className="size-4" /> Adicionar seção
      </button>
      {secoes.length >= MAX_SECOES && <p className="mt-2 text-center text-[12px] text-muted">Limite de {MAX_SECOES} seções.</p>}
    </div>
  );
}

/** Cópia de uma seção (id novo), para duplicar. */
export function duplicar(s: Secao): Secao {
  return { ...structuredClone(s), id: secaoId() };
}
