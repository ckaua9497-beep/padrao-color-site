"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { fotoDeEstudio } from "@/components/FotoProduto";
import { IconArrow, IconClose, IconSearch } from "@/components/icons";
import { IconButton } from "@/components/ui/IconButton";
import { cx } from "@/components/ui/cx";
import { useFromPrices } from "@/lib/customer";
import { formatBRL, imageUrl } from "@/lib/format";
import { IconLupa } from "./icones";

type SearchEntry = { s: string; n: string; c: string; i: string; p: number; q: number; g?: number };

const normalize = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Um pedido do índice por página: a pílula do computador e o painel do celular dividem o mesmo download. Em falha a
// promessa é descartada (o próximo pedido baixa de novo) e o erro chega a quem pediu.
let indice: Promise<SearchEntry[]> | null = null;
function carregarIndice(): Promise<SearchEntry[]> {
  indice ??= fetch("/produtos/indice.json")
    .then((r) => (r.ok ? (r.json() as Promise<SearchEntry[]>) : Promise.reject(new Error(String(r.status)))))
    .catch((erro: unknown) => {
      indice = null;
      throw erro;
    });
  return indice;
}

/**
 * Índice baixado sob demanda (só quando a busca é usada), filtro sem acento e preço de revendedor. Se o download
 * falha, o índice continua null (a busca avisa em vez de dizer "nenhum produto") e baixa de novo quando a busca
 * reabre ou o campo recebe o foco (`tentarDeNovo`).
 */
function useBusca(ativo: boolean, termo: string) {
  const [index, setIndex] = useState<SearchEntry[] | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!ativo || index) return;
    let vivo = true;
    carregarIndice().then(
      (lista) => {
        if (!vivo) return;
        setIndex(lista);
        setFalhou(false);
      },
      () => {
        if (vivo) setFalhou(true);
      },
    );
    return () => {
      vivo = false;
    };
  }, [ativo, index, tentativa]);

  const tentarDeNovo = () => {
    if (!falhou || index) return;
    setFalhou(false);
    setTentativa((n) => n + 1);
  };

  const chaves = useMemo(() => index?.map((e) => normalize(`${e.n} ${e.c}`)) ?? [], [index]);
  const resultados = useMemo(() => {
    const palavras = normalize(termo).split(/\s+/).filter(Boolean);
    if (!index || palavras.length === 0) return [];
    const achados: SearchEntry[] = [];
    for (let i = 0; i < index.length && achados.length < 8; i++) {
      if (palavras.every((w) => chaves[i].includes(w))) achados.push(index[i]);
    }
    return achados;
  }, [index, chaves, termo]);
  // Revendedor logado: o "a partir de" da tabela de revenda (o mesmo dos cards).
  const fromPrice = useFromPrices(resultados.map((r) => r.g));
  const semIndice = falhou && index === null;
  const pronto = (index !== null || semIndice) && termo.trim() !== "";

  return { resultados, fromPrice, pronto, semIndice, tentarDeNovo };
}

const hrefBusca = (termo: string) => `/produtos?busca=${encodeURIComponent(termo.trim())}`;

const AVISO_FALHA = "Não deu para carregar as sugestões agora.";

function Resultado({ r, preco, onClick }: { r: SearchEntry; preco: number; onClick: () => void }) {
  // Mesma regra do VitrineCard: a foto de estúdio do site (3:4, fundo próprio) preenche a miniatura; a da API
  // (quadrada) fica inteira, com respiro, sobre o cinza claro.
  const estudio = fotoDeEstudio(r.i);
  return (
    <Link href={`/produto/${r.s}`} onClick={onClick} className="group flex items-center gap-3 rounded-control p-2 transition-colors hover:bg-mist focus-visible:bg-mist">
      <span className={cx("relative h-16 w-12 shrink-0 overflow-hidden rounded-thumb", estudio ? "bg-foto" : "bg-mist")}>
        <Image src={imageUrl(r.i)} alt="" fill sizes="64px" className={estudio ? "object-cover" : "object-contain p-1"} />
      </span>
      <span className="min-w-0">
        <span className="line-clamp-2 text-caption font-semibold leading-snug group-hover:underline">{r.n}</span>
        <span className="text-caption text-muted">a partir de {formatBRL(preco)}</span>
      </span>
    </Link>
  );
}

/** Setas para cima e para baixo andam entre os links da lista; a primeira volta para o campo. */
function moverFoco(event: KeyboardEvent<HTMLElement>, lista: HTMLElement | null, campo: HTMLInputElement | null) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const links = [...(lista?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? [])];
  if (links.length === 0) return;
  event.preventDefault();
  const atual = links.indexOf(document.activeElement as HTMLAnchorElement);
  const proximo = event.key === "ArrowDown" ? Math.min(atual + 1, links.length - 1) : atual - 1;
  if (proximo < 0) campo?.focus();
  else links[proximo].focus();
}

/**
 * Busca em pílula do computador (Figma: 732 × 53, fundo cinza claro, borda escura, lupa à direita). A lista de
 * resultados abre presa à pílula enquanto o foco está nela; Enter leva à página de produtos com a busca.
 */
export function BuscaTopo({ onFocus, className }: { onFocus?: () => void; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [termo, setTermo] = useState("");
  const [aberta, setAberta] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const { resultados, fromPrice, pronto, semIndice, tentarDeNovo } = useBusca(aberta, termo);

  // Trocou de página (clique num resultado): fecha a lista.
  const [ultimaRota, setUltimaRota] = useState(pathname);
  if (ultimaRota !== pathname) {
    setUltimaRota(pathname);
    setAberta(false);
  }

  const mostrar = aberta && pronto;

  // Clique num resultado ou em "Ver todos": fecha a lista mesmo quando a rota não muda (já em /produtos, só a busca
  // da URL troca). Se o foco estava num link (teclado), volta ao campo em vez de cair no body quando a lista some.
  const fecharLista = () => {
    if (lista.current?.contains(document.activeElement)) campo.current?.focus();
    setAberta(false);
  };

  return (
    <div
      className={cx("relative", className)}
      onFocus={(event) => {
        // Só quando o foco chega de fora (setas e Esc andam por dentro sem reabrir a lista).
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setAberta(true);
        tentarDeNovo();
        onFocus?.();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setAberta(false);
      }}
    >
      <form
        role="search"
        aria-label="Busca de produtos"
        className="flex h-[53px] items-center rounded-full border border-ink/70 bg-vitrine pl-6 pr-1.5 transition-shadow duration-200 focus-within:ring-2 focus-within:ring-ink"
        onSubmit={(e) => {
          e.preventDefault();
          if (!termo.trim()) return campo.current?.focus();
          setAberta(false);
          router.push(hrefBusca(termo));
        }}
      >
        <input
          ref={campo}
          id="busca-topo"
          type="search"
          value={termo}
          onChange={(e) => {
            setTermo(e.target.value);
            setAberta(true);
          }}
          onClick={() => setAberta(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && mostrar) {
              // Primeiro Esc fecha a lista; o segundo deixa o navegador limpar o campo.
              e.preventDefault();
              setAberta(false);
            } else if (e.key === "ArrowDown" && mostrar) {
              moverFoco(e, lista.current, campo.current);
            }
          }}
          placeholder="O que você quer imprimir?"
          aria-label="Buscar produtos"
          aria-controls="busca-topo-lista"
          aria-describedby="busca-topo-total"
          autoComplete="off"
          enterKeyHint="search"
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] placeholder:text-muted focus-visible:outline-none [&::-webkit-search-cancel-button]:cursor-pointer"
        />
        <button type="submit" aria-label="Buscar" title="Buscar" className="grid size-11 shrink-0 place-items-center rounded-full transition-colors duration-200 hover:bg-ink/5">
          <IconLupa className="size-[30px]" />
        </button>
      </form>

      <p id="busca-topo-total" aria-live="polite" className="sr-only">
        {mostrar ? (semIndice ? AVISO_FALHA : `${resultados.length === 8 ? "Primeiros 8" : resultados.length} produtos encontrados`) : ""}
      </p>

      <div
        ref={lista}
        id="busca-topo-lista"
        // O clique num resultado não tira o foco da pílula antes de navegar (no Safari o link não recebe foco).
        onMouseDown={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setAberta(false);
            campo.current?.focus();
            return;
          }
          moverFoco(e, lista.current, campo.current);
        }}
        className={cx(
          "absolute inset-x-0 top-[calc(100%+8px)] z-menu rounded-panel bg-white p-3 shadow-panel ring-1 ring-line transition-all duration-200 ease-button",
          mostrar ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0",
        )}
      >
        {resultados.length > 0 ? (
          <ul aria-label="Produtos encontrados" className="grid grid-cols-2 gap-1">
            {resultados.map((r) => (
              <li key={r.s}>
                <Resultado r={r} preco={fromPrice(r.g)?.p ?? r.p} onClick={fecharLista} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-2 py-3 text-sm text-muted">{semIndice ? AVISO_FALHA : `Nenhum produto encontrado para “${termo.trim()}”.`}</p>
        )}
        <Link
          href={resultados.length > 0 || semIndice ? hrefBusca(termo) : "/produtos"}
          onClick={fecharLista}
          className="mt-2 flex items-center justify-center gap-2 rounded-control border-t border-line px-2 pb-1 pt-3 text-caption font-bold transition-colors hover:underline"
        >
          {resultados.length > 0 || semIndice ? `Ver todos os resultados para “${termo.trim()}”` : "Ver todos os produtos"}
          <IconArrow aria-hidden className="size-4" />
        </Link>
      </div>
    </div>
  );
}

/**
 * Painel de busca do celular e do tablet: a lupa do topo abre; ocupa a largura toda abaixo da linha do logo. Fecha
 * com Esc, com o X, com Enter e no toque num resultado; `onClose` devolve o foco à lupa (SiteHeader).
 */
export function PainelBusca({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [termo, setTermo] = useState("");
  const painel = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const { resultados, fromPrice, pronto, semIndice, tentarDeNovo } = useBusca(open, termo);

  // Foco só quando a busca abre (antes o efeito rodava a cada render e roubava o foco).
  useEffect(() => {
    if (open) campo.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Rola por dentro, então precisa caber entre o fim do topo e o fim da área visível. Com a página no começo, a faixa
  // do cupom empurra o topo para baixo (100dvh − 92 px passava da tela), e o teclado do celular encolhe a área
  // visível: mede os dois ao abrir e de novo a cada rolagem ou mudança de tamanho. A classe max-h vale até a medida.
  useEffect(() => {
    const el = painel.current;
    const topo = el?.parentElement;
    if (!open || !el || !topo) return;
    const tela = window.visualViewport;
    const medir = () => {
      const fundo = tela ? tela.offsetTop + tela.height : window.innerHeight;
      el.style.maxHeight = `${Math.max(120, Math.floor(fundo - topo.getBoundingClientRect().bottom))}px`;
    };
    medir();
    window.addEventListener("scroll", medir, { passive: true });
    window.addEventListener("resize", medir);
    tela?.addEventListener("resize", medir);
    tela?.addEventListener("scroll", medir);
    return () => {
      window.removeEventListener("scroll", medir);
      window.removeEventListener("resize", medir);
      tela?.removeEventListener("resize", medir);
      tela?.removeEventListener("scroll", medir);
    };
  }, [open]);

  return (
    <div
      ref={painel}
      id="busca"
      className={cx(
        // Rola por dentro: o topo é fixo, então o que passasse da tela não seria alcançado rolando a página.
        "absolute inset-x-0 top-full max-h-[calc(100dvh-var(--spacing-header))] overflow-y-auto overscroll-contain border-t border-line bg-white duration-300 ease-button lg:hidden",
        // Ao abrir, a visibilidade muda na hora (o campo já pode receber o foco); ao fechar, espera o fade.
        open ? "visible opacity-100 shadow-header transition-[opacity,transform]" : "invisible -translate-y-2 opacity-0 transition-[opacity,transform,visibility]",
      )}
    >
      <form
        role="search"
        aria-label="Busca de produtos"
        className="container-site py-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!termo.trim()) return;
          router.push(hrefBusca(termo));
          // Em /produtos a rota não muda (só a busca da URL), então o painel não fecharia sozinho.
          onClose();
        }}
      >
        <div className="flex items-center gap-3 rounded-full border border-ink/70 bg-vitrine px-5 focus-within:ring-2 focus-within:ring-ink">
          <IconSearch aria-hidden className="size-5 text-muted" />
          <input
            ref={campo}
            type="search"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onFocus={tentarDeNovo}
            placeholder="O que você quer imprimir?"
            autoComplete="off"
            enterKeyHint="search"
            className="h-13 min-w-0 flex-1 bg-transparent text-base placeholder:text-muted focus-visible:outline-none [&::-webkit-search-cancel-button]:appearance-none"
            aria-label="Buscar produtos"
          />
          <IconButton label="Fechar busca" variant="ghost" onClick={onClose} className="-mr-4 hover:bg-white">
            <IconClose className="size-4" />
          </IconButton>
        </div>
        <p aria-live="polite" className="sr-only">
          {pronto ? (semIndice ? AVISO_FALHA : `${resultados.length} produtos encontrados`) : ""}
        </p>
        {resultados.length > 0 && (
          <ul className="mt-5 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {resultados.map((r) => (
              <li key={r.s}>
                <Resultado r={r} preco={fromPrice(r.g)?.p ?? r.p} onClick={onClose} />
              </li>
            ))}
          </ul>
        )}
        {pronto && resultados.length === 0 && (
          <p className="mt-5 text-sm text-muted">{semIndice ? AVISO_FALHA : `Nenhum produto encontrado para “${termo.trim()}”.`}</p>
        )}
        {pronto && semIndice && (
          <Link href={hrefBusca(termo)} onClick={onClose} className="mt-2 flex min-h-11 items-center gap-2 text-caption font-bold hover:underline">
            Ver os resultados para “{termo.trim()}”
            <IconArrow aria-hidden className="size-4" />
          </Link>
        )}
      </form>
    </div>
  );
}
