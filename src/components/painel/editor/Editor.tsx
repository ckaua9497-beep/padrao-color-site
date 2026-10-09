"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { descartarRascunho, publicarTema, salvarRascunho } from "@/app/(painel)/painel/tema-actions";
import { IconExternal } from "@/components/icons";
import { cx } from "@/components/ui/cx";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import { MODELOS, SECAO_NOME, type LojaInfo, type Secao, type Tema } from "@/lib/multiloja/tema";
import EditorSecao, { type EditorContexto } from "./EditorSecao";
import PainelEstilo from "./PainelEstilo";
import PainelModelos from "./PainelModelos";
import PainelSecoes, { duplicar } from "./PainelSecoes";

/*
 * Editor "Personalizar loja" (tela cheia). À esquerda: modelos prontos, seções e estilo; no centro: a loja de
 * verdade numa prévia ao vivo (iframe /painel/previa, no tamanho de computador ou de celular), que recebe o tema a
 * cada mudança por postMessage e avisa quando o lojista clica numa seção. O rascunho salva sozinho; a loja só muda
 * ao publicar. Desfazer/Refazer guardam até 60 passos (digitação seguida no mesmo campo conta como um).
 */

type Painel = "modelos" | "secoes" | "estilo" | "cabecalho" | "rodape" | { secao: string };
type Device = "computador" | "celular";
type Save = { estado: "salvo" | "pendente" | "salvando" | "erro"; quando: string | null };

type Hist = { tema: Tema; passado: Tema[]; futuro: Tema[]; grupo: string | null; t: number };
type Passo = { grupo: string | null; t: number };
type Acao =
  | ({ type: "set"; tema: Tema } & Passo)
  | ({ type: "patch"; patch: Partial<Tema> } & Passo)
  | ({ type: "secao"; secao: Secao } & Passo)
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; tema: Tema };

function commit(state: Hist, tema: Tema, { grupo, t }: Passo): Hist {
  // Digitação seguida no mesmo campo vira um passo só no Desfazer.
  if (grupo && grupo === state.grupo && t - state.t < 900) return { ...state, tema, t };
  return { tema, passado: [...state.passado, state.tema].slice(-60), futuro: [], grupo, t };
}

/** Mexer em seções, estilo, cabeçalho ou rodapé tira o tema do modelo pronto (vira "personalizado"). */
const personalizado = (patch: Partial<Tema>) => Boolean(patch.secoes || patch.estilo || patch.cabecalho || patch.rodape);

function historico(state: Hist, acao: Acao): Hist {
  switch (acao.type) {
    case "set":
      return commit(state, acao.tema, acao);
    case "patch":
      return commit(state, { ...state.tema, ...acao.patch, modelo: personalizado(acao.patch) ? "personalizado" : state.tema.modelo }, acao);
    case "secao":
      return commit(state, { ...state.tema, modelo: "personalizado", secoes: state.tema.secoes.map((s) => (s.id === acao.secao.id ? acao.secao : s)) }, acao);
    case "undo":
      if (!state.passado.length) return state;
      return { tema: state.passado[state.passado.length - 1], passado: state.passado.slice(0, -1), futuro: [state.tema, ...state.futuro], grupo: null, t: 0 };
    case "redo":
      if (!state.futuro.length) return state;
      return { tema: state.futuro[0], passado: [...state.passado, state.tema], futuro: state.futuro.slice(1), grupo: null, t: 0 };
    case "reset":
      return { tema: acao.tema, passado: [], futuro: [], grupo: null, t: 0 };
  }
}

const FRAME = { computador: 1280, celular: 390 } as const;
const hora = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

type Props = { inicial: Tema; publicado: Tema; info: LojaInfo; lojaUrl: string; ctx: EditorContexto };

export default function Editor({ inicial, publicado: publicadoInicial, info, lojaUrl, ctx }: Props) {
  const [hist, dispatch] = useReducer(historico, { tema: inicial, passado: [], futuro: [], grupo: null, t: 0 });
  const tema = hist.tema;
  const [publicado, setPublicado] = useState(publicadoInicial);
  const [painel, setPainel] = useState<Painel>("secoes");
  const [deviceEscolhido, setDevice] = useState<Device>("computador");
  // Tela pequena: a prévia é sempre no tamanho de celular (o computador reduzido ficaria ilegível).
  const telaPequena = useMediaQuery("(max-width: 1023px)");
  const device: Device = telaPequena ? "celular" : deviceEscolhido;
  const [mobileView, setMobileView] = useState<"editar" | "previa">("editar");
  const [save, setSave] = useState<Save>({ estado: "salvo", quando: null });
  const [toast, setToast] = useState<{ texto: string; desfazer?: boolean } | null>(null);
  const [busy, setBusy] = useState<"publicar" | "descartar" | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const lastSaved = useRef(JSON.stringify(inicial));
  const temaRef = useRef(tema);

  const dirty = useMemo(() => JSON.stringify(tema) !== JSON.stringify(publicado), [tema, publicado]);
  const selecionada = typeof painel === "object" ? tema.secoes.find((s) => s.id === painel.secao) ?? null : null;

  const post = useCallback((msg: unknown) => frameRef.current?.contentWindow?.postMessage(msg, window.location.origin), []);

  /** Toda mudança passa aqui: entra no histórico, marca o rascunho como pendente e vai para a prévia. */
  const pendente = useCallback(() => setSave((s) => ({ ...s, estado: "pendente" })), []);
  const update = useCallback((next: Tema) => (dispatch({ type: "set", tema: next, grupo: null, t: Date.now() }), pendente()), [pendente]);
  const set = useCallback((patch: Partial<Tema>, grupo: string | null = null) => (dispatch({ type: "patch", patch, grupo, t: Date.now() }), pendente()), [pendente]);

  const showToast = useCallback((texto: string, desfazer = false) => {
    setToast({ texto, desfazer });
    window.setTimeout(() => setToast((t) => (t?.texto === texto ? null : t)), 6000);
  }, []);

  // Prévia e referência sempre com o tema atual.
  useEffect(() => {
    temaRef.current = tema;
    post({ tipo: "tema", tema });
  }, [tema, post]);

  // Rascunho salva sozinho, um pouco depois da última mudança.
  useEffect(() => {
    const json = JSON.stringify(tema);
    if (json === lastSaved.current) return;
    const timer = window.setTimeout(async () => {
      setSave((s) => ({ ...s, estado: "salvando" }));
      try {
        const res = await salvarRascunho(tema);
        if (!res.ok) throw new Error(res.message);
        lastSaved.current = json;
        setSave({ estado: JSON.stringify(temaRef.current) === json ? "salvo" : "pendente", quando: hora() });
      } catch {
        setSave((s) => ({ ...s, estado: "erro" }));
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [tema]);

  // Mensagens da prévia: pronta (manda o tema) e clique numa seção (abre o formulário dela).
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      const data = e.data as { tipo?: string; id?: string };
      if (data.tipo === "pronto") post({ tipo: "tema", tema: temaRef.current });
      if (data.tipo === "selecionar" && data.id) {
        setPainel(data.id === "cabecalho" || data.id === "rodape" ? data.id : { secao: data.id });
        setMobileView("editar");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [post]);

  // Tamanho da área da prévia (o computador é desenhado a 1280 px e reduzido para caber).
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setArea({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Desfazer/Refazer pelo teclado (fora dos campos de texto, que têm o próprio desfazer).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (!(e.ctrlKey || e.metaKey) || target.closest("input, textarea, select, [contenteditable]")) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: "undo" });
        setSave((s) => ({ ...s, estado: "pendente" }));
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
        setSave((s) => ({ ...s, estado: "pendente" }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Rascunho ainda não salvo: avisa antes de sair.
  useEffect(() => {
    if (save.estado !== "pendente" && save.estado !== "salvando") return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [save.estado]);

  const abrir = (id: string) => {
    setPainel({ secao: id });
    post({ tipo: "focar", id });
  };

  const setSecao = (next: Secao) => (dispatch({ type: "secao", secao: next, grupo: `secao:${next.id}`, t: Date.now() }), pendente());

  const publicar = async () => {
    setBusy("publicar");
    const res = await publicarTema(tema);
    setBusy(null);
    if (!res.ok) return showToast(res.message);
    lastSaved.current = JSON.stringify(res.tema);
    setPublicado(res.tema);
    setSave({ estado: "salvo", quando: hora() });
    showToast(res.message ?? "Loja publicada.");
  };

  const descartar = async () => {
    setBusy("descartar");
    const res = await descartarRascunho();
    setBusy(null);
    if (!res.ok) return showToast(res.message);
    lastSaved.current = JSON.stringify(res.tema);
    dispatch({ type: "reset", tema: res.tema });
    setSave({ estado: "salvo", quando: hora() });
    setPainel("secoes");
    showToast(res.message ?? "Alterações descartadas.");
  };

  const frameW = FRAME[device];
  const scale = device === "computador" && area.w ? Math.min(1, (area.w - 32) / frameW) : 1;
  const frameH = device === "computador" ? Math.max(400, (area.h - 32) / scale) : Math.min(844, Math.max(480, area.h - 48));

  const statusText = save.estado === "salvando" ? "Salvando rascunho…" : save.estado === "pendente" ? "Alterações ainda não salvas" : save.estado === "erro" ? "Não foi possível salvar o rascunho" : dirty ? `Rascunho salvo${save.quando ? ` às ${save.quando}` : ""} · não publicado` : "Tudo publicado";

  const tabs: { key: "modelos" | "secoes" | "estilo"; label: string }[] = [
    { key: "modelos", label: "Modelos prontos" },
    { key: "secoes", label: "Seções" },
    { key: "estilo", label: "Estilo" },
  ];
  const activeTab = typeof painel === "object" ? "secoes" : painel === "cabecalho" || painel === "rodape" ? "estilo" : painel;

  return (
    <div className="flex h-dvh flex-col bg-page-checkout">
      {/* Barra do editor */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-white px-3 md:gap-3 md:px-4">
        <Link href="/painel" className="flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-[13px] font-semibold text-muted hover:bg-mist hover:text-ink">
          ← Painel
        </Link>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-black leading-tight">Personalizar loja</p>
          <p className={cx("truncate text-[12px] leading-tight", save.estado === "erro" ? "font-semibold text-coral-700" : "text-muted")} role="status">
            {statusText}
          </p>
        </div>

        <div className="mx-auto hidden items-center rounded-full bg-mist p-1 md:flex" role="radiogroup" aria-label="Tamanho da prévia">
          {(["computador", "celular"] as Device[]).map((d) => (
            <button key={d} type="button" role="radio" aria-checked={device === d} onClick={() => setDevice(d)} className={cx("h-8 rounded-full px-3.5 text-[13px] font-semibold capitalize transition-colors", device === d ? "bg-white shadow-card" : "text-muted hover:text-ink")}>
              {d}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <button type="button" onClick={() => (dispatch({ type: "undo" }), setSave((s) => ({ ...s, estado: "pendente" })))} disabled={!hist.passado.length} aria-label="Desfazer" title="Desfazer (Ctrl+Z)" className="grid size-9 place-items-center rounded-full text-[17px] hover:bg-mist disabled:opacity-30">
            ↶
          </button>
          <button type="button" onClick={() => (dispatch({ type: "redo" }), setSave((s) => ({ ...s, estado: "pendente" })))} disabled={!hist.futuro.length} aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)" className="grid size-9 place-items-center rounded-full text-[17px] hover:bg-mist disabled:opacity-30">
            ↷
          </button>
          <a href={lojaUrl} target="_blank" rel="noreferrer" className="hidden h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold hover:bg-mist lg:flex">
            Ver loja <IconExternal className="size-3.5" />
          </a>
          {dirty && (
            <button type="button" onClick={descartar} disabled={busy !== null} className="hidden h-9 rounded-full px-3 text-[13px] font-semibold text-muted hover:bg-mist hover:text-ink disabled:opacity-50 sm:block">
              {busy === "descartar" ? "Descartando…" : "Descartar"}
            </button>
          )}
          <button type="button" onClick={publicar} disabled={busy !== null || !dirty} className="h-9 rounded-full bg-ink px-4 text-[13px] font-bold text-white transition-colors hover:bg-coral-700 disabled:bg-line-strong disabled:text-white">
            {busy === "publicar" ? "Publicando…" : dirty ? "Publicar" : "Publicado"}
          </button>
        </div>
      </header>

      {/* Celular: alterna entre editar e ver a prévia */}
      <div className="flex shrink-0 border-b border-line bg-white lg:hidden" role="tablist" aria-label="Editor">
        {(["editar", "previa"] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={mobileView === v} onClick={() => setMobileView(v)} className={cx("h-11 flex-1 text-[14px] font-bold", mobileView === v ? "border-b-2 border-ink" : "text-muted")}>
            {v === "editar" ? "Editar" : "Ver prévia"}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Painel lateral */}
        <aside className={cx("flex w-full shrink-0 flex-col border-r border-line bg-white lg:w-[360px]", mobileView === "previa" && "max-lg:hidden")} aria-label="Opções do editor">
          {typeof painel === "object" || painel === "cabecalho" || painel === "rodape" ? (
            <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2">
              <button type="button" onClick={() => setPainel(typeof painel === "object" ? "secoes" : "estilo")} className="flex h-9 items-center rounded-full px-3 text-[13px] font-semibold text-muted hover:bg-mist hover:text-ink">
                ← {typeof painel === "object" ? "Seções" : "Estilo"}
              </button>
              <p className="min-w-0 flex-1 truncate text-[14px] font-bold">{selecionada ? SECAO_NOME[selecionada.tipo] : painel === "cabecalho" ? "Cabeçalho" : painel === "rodape" ? "Rodapé" : ""}</p>
              {selecionada && (
                <>
                  <button type="button" onClick={() => setSecao({ ...selecionada, visivel: !selecionada.visivel })} className="h-8 rounded-full px-2.5 text-[12px] font-semibold text-muted hover:bg-mist hover:text-ink">
                    {selecionada.visivel ? "Esconder" : "Mostrar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const copia = duplicar(selecionada);
                      const i = tema.secoes.findIndex((s) => s.id === selecionada.id);
                      set({ secoes: [...tema.secoes.slice(0, i + 1), copia, ...tema.secoes.slice(i + 1)] });
                      abrir(copia.id);
                    }}
                    className="h-8 rounded-full px-2.5 text-[12px] font-semibold text-muted hover:bg-mist hover:text-ink"
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      set({ secoes: tema.secoes.filter((s) => s.id !== selecionada.id) });
                      setPainel("secoes");
                      showToast(`${SECAO_NOME[selecionada.tipo]} removida.`, true);
                    }}
                    className="h-8 rounded-full px-2.5 text-[12px] font-semibold text-coral-700 hover:bg-coral-50"
                  >
                    Excluir
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="flex shrink-0 border-b border-line" role="tablist" aria-label="Partes do editor">
              {tabs.map((t) => (
                <button key={t.key} type="button" role="tab" aria-selected={activeTab === t.key} onClick={() => setPainel(t.key)} className={cx("h-12 flex-1 text-[13px] font-bold transition-colors", activeTab === t.key ? "border-b-2 border-ink" : "text-muted hover:text-ink")}>
                  {t.label}
                </button>
              ))}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {painel === "modelos" && (
              <PainelModelos
                tema={tema}
                info={info}
                onAplicar={(novo, nome) => {
                  update(novo);
                  setPainel("secoes");
                  showToast(`Modelo ${nome} aplicado.`, true);
                }}
              />
            )}
            {painel === "secoes" && <PainelSecoes secoes={tema.secoes} info={info} onChange={(secoes) => set({ secoes })} onAbrir={abrir} depoisDe={null} />}
            {(painel === "estilo" || painel === "cabecalho" || painel === "rodape") && <PainelEstilo tema={tema} set={(patch) => set(patch, `estilo:${Object.keys(patch).join()}`)} secao={painel === "estilo" ? null : painel} />}
            {selecionada && <EditorSecao key={selecionada.id} secao={selecionada} onChange={setSecao} ctx={ctx} />}
            {typeof painel === "object" && !selecionada && <p className="p-4 text-[13px] text-muted">Esta seção não existe mais.</p>}
          </div>
          <p className="shrink-0 border-t border-line px-4 py-2.5 text-[12px] text-muted">
            Modelo: <strong className="font-semibold text-ink">{tema.modelo === "personalizado" ? "personalizado" : MODELOS[tema.modelo].nome}</strong> · clique numa parte da prévia para editar
          </p>
        </aside>

        {/* Prévia ao vivo */}
        <div ref={areaRef} className={cx("relative min-w-0 flex-1 overflow-hidden", mobileView === "editar" && "max-lg:hidden")}>
          <div className={cx("absolute inset-0 flex justify-center overflow-auto", device === "celular" ? "items-center p-6" : "p-4")}>
            <div
              className={cx("shrink-0 overflow-hidden bg-white shadow-panel", device === "celular" ? "rounded-[36px] border-[10px] border-ink" : "rounded-card")}
              style={device === "computador" ? { width: frameW * scale, height: frameH * scale } : { width: frameW + 20, height: frameH + 20 }}
            >
              <iframe
                ref={frameRef}
                src="/painel/previa"
                title="Prévia da loja"
                onLoad={() => post({ tipo: "tema", tema: temaRef.current })}
                className="block origin-top-left border-0 bg-white"
                style={{ width: frameW, height: frameH, transform: scale !== 1 ? `scale(${scale})` : undefined }}
              />
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div role="status" className="fixed bottom-5 left-1/2 z-toast flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink py-2 pl-5 pr-2 text-[14px] text-white shadow-float">
          {toast.texto}
          {toast.desfazer && hist.passado.length > 0 && (
            <button
              type="button"
              onClick={() => {
                dispatch({ type: "undo" });
                setSave((s) => ({ ...s, estado: "pendente" }));
                setToast(null);
              }}
              className="h-8 rounded-full bg-white/15 px-3 text-[13px] font-bold hover:bg-white/25"
            >
              Desfazer
            </button>
          )}
          <button type="button" onClick={() => setToast(null)} aria-label="Fechar aviso" className="grid size-8 place-items-center rounded-full hover:bg-white/15">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
