"use client";

import { Suspense, useEffect, useState } from "react";
import VitrineFooter from "@/components/vitrine/VitrineFooter";
import VitrineHeader from "@/components/vitrine/VitrineHeader";
import SecoesLoja from "@/components/vitrine/loja/Secoes";
import { temaAttrs, temaCss } from "@/components/vitrine/loja/estilo";
import type { SocialKey } from "@/lib/multiloja/core";
import type { Tema } from "@/lib/multiloja/tema";
import type { VitrineDados } from "@/lib/multiloja/vitrine";

/*
 * Prévia ao vivo do editor (dentro do iframe de /painel/personalizar). Recebe o tema por postMessage a cada
 * mudança e desenha a página inicial com os mesmos componentes da loja. Links e formulários não navegam; clicar
 * numa seção, no cabeçalho ou no rodapé avisa o editor, que abre o formulário daquela parte. Não grava visita nem
 * mexe em carrinho: é só uma prévia.
 */

export type RodapeDados = { year: number; about: string; whatsapp: { href: string; label: string } | null; phone: string | null; email: string | null; socials: Partial<Record<SocialKey, string>> };

export default function PreviaLoja({ inicial, dados, rodape }: { inicial: Tema; dados: VitrineDados; rodape: RodapeDados }) {
  const [tema, setTema] = useState(inicial);
  const [selecionada, setSelecionada] = useState<string | null>(null);

  useEffect(() => {
    const toParent = (msg: unknown) => window.parent?.postMessage(msg, window.location.origin);
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      const data = e.data as { tipo?: string; tema?: Tema; id?: string };
      if (data.tipo === "tema" && data.tema) setTema(data.tema);
      if (data.tipo === "focar" && data.id) {
        setSelecionada(data.id);
        document.querySelector(`[data-secao="${CSS.escape(data.id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    const onClick = (e: MouseEvent) => {
      const el = e.target as Element;
      // Carrossel, perguntas e outros controles da própria página funcionam; links e envios, não.
      if (el.closest("a, button[type=submit]")) e.preventDefault();
      if (el.closest("summary, [aria-label='Anterior'], [aria-label='Próximo'], [role=tab]")) return;
      const part = el.closest("[data-secao], [data-area]");
      const id = part?.getAttribute("data-secao") ?? part?.getAttribute("data-area");
      if (id) {
        setSelecionada(id);
        toParent({ tipo: "selecionar", id });
      }
    };
    const onSubmit = (e: Event) => e.preventDefault();
    window.addEventListener("message", onMessage);
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    toParent({ tipo: "pronto" });
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  const categories = dados.categorias.map(({ slug, name }) => ({ slug, name }));
  const highlight = selecionada ? `[data-secao="${selecionada}"],[data-area="${selecionada}"]>*{outline:3px solid var(--color-coral);outline-offset:-3px}` : "";

  return (
    <div className="loja-tema flex min-h-dvh flex-col" {...temaAttrs(tema)}>
      <style>{`${temaCss(tema)}[data-secao]{cursor:pointer}[data-secao]:hover,[data-area]:hover>*{outline:2px dashed var(--color-coral-700);outline-offset:-2px}${highlight}`}</style>
      <div data-area="cabecalho" className="contents">
        <Suspense>
          <VitrineHeader
            name={dados.nome}
            logo={tema.marca.logo}
            whatsapp={dados.whatsapp}
            categories={categories}
            estilo={tema.cabecalho.estilo}
            aviso={tema.cabecalho.aviso}
            busca={tema.cabecalho.busca}
            mostrarCategorias={tema.cabecalho.categorias}
            preview
          />
        </Suspense>
      </div>
      <main className="flex-1">
        <SecoesLoja tema={tema} dados={dados} preview />
      </main>
      <div data-area="rodape" className="contents">
        <VitrineFooter name={dados.nome} year={rodape.year} about={rodape.about} whatsapp={rodape.whatsapp} phone={rodape.phone} email={rodape.email} socials={rodape.socials} estilo={tema.rodape.estilo} />
      </div>
    </div>
  );
}
