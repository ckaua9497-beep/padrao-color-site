"use client";

import { cx } from "@/components/ui/cx";
import { FONTE_FAMILIA } from "@/components/vitrine/loja/estilo";
import { PALETTES, PALETTE_KEYS } from "@/lib/multiloja/core";
import { CABECALHOS, CANTOS, FONTES, FUNDOS, LIMITES, RODAPES, type CantosKey, type FonteKey, type FundoKey, type Tema } from "@/lib/multiloja/tema";
import { CampoImagem, Chave, Escolha, Grupo, Texto } from "./campos";

/* Painel "Estilo" do editor: marca, cores, tipografia, formas, cabeçalho e rodapé (valem para a loja inteira). */

type Props = { tema: Tema; set: (patch: Partial<Tema>) => void; secao?: "cabecalho" | "rodape" | null };

export default function PainelEstilo({ tema, set, secao }: Props) {
  const estilo = (patch: Partial<Tema["estilo"]>) => set({ estilo: { ...tema.estilo, ...patch } });
  const cabecalho = (patch: Partial<Tema["cabecalho"]>) => set({ cabecalho: { ...tema.cabecalho, ...patch } });
  const p = PALETTES[tema.estilo.paleta];

  const header = (
    <Grupo titulo="Cabeçalho">
      <div className="grid gap-1.5" role="radiogroup" aria-label="Formato do cabeçalho">
        {(Object.keys(CABECALHOS) as (keyof typeof CABECALHOS)[]).map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={tema.cabecalho.estilo === key}
            onClick={() => cabecalho({ estilo: key })}
            className={cx("rounded-control border p-2.5 text-left transition-colors", tema.cabecalho.estilo === key ? "border-ink ring-1 ring-ink" : "border-line bg-white hover:border-ink")}
          >
            <span className={cx("mb-2 flex h-5 items-center gap-1 rounded-sm bg-mist px-1.5", key === "centralizado" && "justify-center")} aria-hidden>
              <span className="size-2.5 rounded-sm" style={{ background: p.main }} />
              <span className="h-1 w-6 rounded-full bg-black/25" />
              {key === "classico" && <span className="ml-2 h-2 flex-1 rounded-full bg-white" />}
              {key === "compacto" && (
                <span className="ml-2 flex gap-1">
                  <span className="h-1 w-3 rounded-full bg-black/20" />
                  <span className="h-1 w-3 rounded-full bg-black/20" />
                  <span className="h-1 w-3 rounded-full bg-black/20" />
                </span>
              )}
            </span>
            <span className="block text-[13px] font-bold">{CABECALHOS[key].nome}</span>
            <span className="block text-[12px] text-muted">{CABECALHOS[key].descricao}</span>
          </button>
        ))}
      </div>
      <Texto label="Faixa de aviso no topo" value={tema.cabecalho.aviso} onChange={(aviso) => cabecalho({ aviso })} max={LIMITES.aviso} placeholder="Ex.: Frete grátis acima de R$ 150" hint="Em branco, a faixa some." />
      <Chave label="Busca de produtos" checked={tema.cabecalho.busca} onChange={(busca) => cabecalho({ busca })} />
      <Chave label="Menu de categorias" checked={tema.cabecalho.categorias} onChange={(categorias) => cabecalho({ categorias })} />
    </Grupo>
  );

  const footer = (
    <Grupo titulo="Rodapé">
      <Escolha label="Cor do rodapé" value={tema.rodape.estilo} onChange={(estiloRodape) => set({ rodape: { estilo: estiloRodape } })} options={(Object.keys(RODAPES) as (keyof typeof RODAPES)[]).map((k) => ({ value: k, label: RODAPES[k] }))} />
      <p className="text-[12px] text-muted">Contato e redes sociais vêm de Dados da loja.</p>
    </Grupo>
  );

  // Clique no cabeçalho ou no rodapé da prévia abre só a parte dele.
  if (secao === "cabecalho") return header;
  if (secao === "rodape") return footer;

  return (
    <>
      <Grupo titulo="Marca">
        <CampoImagem label="Logo" value={tema.marca.logo} onChange={(logo) => set({ marca: { logo } })} hint="Quadrada, de preferência com fundo transparente. Sem logo, aparece a inicial do nome." aspect="aspect-[3/2]" contain />
        <div role="radiogroup" aria-label="Cor da marca">
          <p className="mb-1.5 text-[13px] font-bold">Cor da marca</p>
          <div className="grid grid-cols-4 gap-1.5">
            {PALETTE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={tema.estilo.paleta === key}
                onClick={() => estilo({ paleta: key })}
                className={cx("flex flex-col items-center gap-1 rounded-control border p-2 text-[11px] font-semibold", tema.estilo.paleta === key ? "border-ink ring-1 ring-ink" : "border-line bg-white hover:border-ink")}
              >
                <span aria-hidden className="size-6 rounded-full" style={{ background: PALETTES[key].main }} />
                {PALETTES[key].name}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-muted">As cores já vêm com contraste conferido para leitura.</p>
        </div>
      </Grupo>

      <Grupo titulo="Fonte dos títulos">
        <div className="grid gap-1.5" role="radiogroup" aria-label="Fonte dos títulos">
          {(Object.keys(FONTES) as FonteKey[]).map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={tema.estilo.fonte === key}
              onClick={() => estilo({ fonte: key })}
              className={cx("flex items-center gap-3 rounded-control border px-3 py-2 text-left", tema.estilo.fonte === key ? "border-ink ring-1 ring-ink" : "border-line bg-white hover:border-ink")}
            >
              <span aria-hidden className={cx("w-10 text-[24px] font-bold leading-none", key === "oswald" && "uppercase")} style={{ fontFamily: FONTE_FAMILIA[key] }}>
                Aa
              </span>
              <span>
                <span className="block text-[13px] font-bold">{FONTES[key].nome}</span>
                <span className="block text-[12px] text-muted">{FONTES[key].descricao}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="text-[12px] text-muted">O texto corrido continua na fonte padrão, mais fácil de ler.</p>
      </Grupo>

      <Grupo titulo="Formas">
        <Escolha
          label="Cantos"
          value={tema.estilo.cantos}
          onChange={(cantos) => estilo({ cantos })}
          options={(Object.keys(CANTOS) as CantosKey[]).map((k) => ({ value: k, label: CANTOS[k].nome, icon: <span aria-hidden className="block size-5 border-2 border-current" style={{ borderRadius: CANTOS[k].thumb }} /> }))}
        />
        <Escolha
          label="Botões"
          value={tema.estilo.botoes}
          onChange={(botoes) => estilo({ botoes })}
          options={[
            { value: "pilula", label: "Pílula", icon: <span aria-hidden className="block h-3 w-8 rounded-full bg-current" /> },
            { value: "reto", label: "Retangular", icon: <span aria-hidden className="block h-3 w-8 rounded-[3px] bg-current" /> },
          ]}
        />
        <Escolha
          label="Cartões de produto"
          value={tema.estilo.cards}
          onChange={(cards) => estilo({ cards })}
          options={[
            { value: "sombra", label: "Sombra" },
            { value: "borda", label: "Contorno" },
            { value: "plano", label: "Sem borda" },
          ]}
        />
      </Grupo>

      <Grupo titulo="Fundo da página">
        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Fundo da página">
          {(Object.keys(FUNDOS) as FundoKey[]).map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={tema.estilo.fundo === key}
              onClick={() => estilo({ fundo: key })}
              className={cx("flex flex-col items-center gap-1 rounded-control border p-2 text-[11px] font-semibold", tema.estilo.fundo === key ? "border-ink ring-1 ring-ink" : "border-line bg-white hover:border-ink")}
            >
              <span aria-hidden className="size-6 rounded-full border border-line" style={{ background: key === "marca" ? p.soft : FUNDOS[key].cor }} />
              {FUNDOS[key].nome}
            </button>
          ))}
        </div>
      </Grupo>

      {header}
      {footer}
    </>
  );
}
