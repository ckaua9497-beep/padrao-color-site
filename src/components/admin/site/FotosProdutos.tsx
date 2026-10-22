"use client";

import Image from "next/image";
import { useState, useTransition, type ReactNode } from "react";
import { salvarFotosProduto } from "@/app/(admin)/admin/site-actions";
import { control, Tag } from "@/components/admin/ui";
import { IconExternal, IconSearch, IconTrash } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { fotoDeEstudio } from "@/components/FotoProduto";
import { imageUrl } from "@/lib/format";
import { fotosDoProduto, origemDaFoto, type MidiaProduto, type OrigemFoto } from "@/lib/midia";
import { ImageDrop } from "./ImageDrop";
import { useAvisoAoSair } from "./useAvisoAoSair";

/*
 * Fotos dos produtos (admin → Site → Imagens → Produtos). À esquerda a lista com busca; à direita as fotos do produto
 * escolhido: as do site (arrastar para ordenar; a primeira é a capa dos cards), as padrão do site e as da API para
 * reaproveitar, e a prévia do card (3:4, como o VitrineCard). Cada produto tem o seu rascunho até salvar; dá para
 * trocar de produto sem perder o que foi feito.
 *
 * Produto com foto padrão do site (midia-padrao.ts) e sem troca salva começa com ela, marcada como padrão: é a que o
 * site mostra. Salvar grava a lista no banco; "Voltar ao padrão do site" apaga a troca.
 */

export type ProdutoFotos = {
  id: string;
  groupId: number | null;
  slug: string;
  name: string;
  category: string;
  categorySlug: string;
  api: string[];
  /** Fotos padrão do site deste produto (null = não tem). */
  padrao: MidiaProduto | null;
  /** Troca salva no banco (null = nada salvo). */
  troca: MidiaProduto | null;
};

const VAZIO: MidiaProduto = { imagens: [], manterApi: false };
const MAX_FOTOS = 12;

// Selo na foto e complemento do texto alternativo, pela origem (as enviadas não têm selo).
const ROTULO: Record<OrigemFoto, { selo: string; alt: string } | null> = { enviada: null, padrao: { selo: "Padrão", alt: "padrão do site" }, api: { selo: "API", alt: "da API" } };

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const igual = (a: MidiaProduto, b: MidiaProduto) => a.manterApi === b.manterApi && a.imagens.length === b.imagens.length && a.imagens.every((src, i) => src === b.imagens[i]);

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Foto como o card do site mostra: a de estúdio cobre o quadro (fundo cinza); as outras ficam inteiras sobre o claro. */
function Foto({ src, alt = "", sizes, folga = "p-2" }: { src: string; alt?: string; sizes: string; folga?: string }) {
  const estudio = fotoDeEstudio(src);
  return (
    <span className={cx("absolute inset-0", estudio ? "bg-foto" : "bg-mist")}>
      <Image src={imageUrl(src)} alt={alt} fill sizes={sizes} draggable={false} className={estudio ? "object-cover" : cx("object-contain", folga)} />
    </span>
  );
}

export default function FotosProdutos({ produtos, categorias, inicial }: { produtos: ProdutoFotos[]; categorias: { slug: string; name: string }[]; inicial: string | null }) {
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [soTrocados, setSoTrocados] = useState(false);
  const [selecionado, setSelecionado] = useState<string | null>(inicial ?? produtos[0]?.id ?? null);
  const [salvos, setSalvos] = useState<Record<string, MidiaProduto>>(() => Object.fromEntries(produtos.filter((p) => p.troca).map((p) => [p.id, p.troca as MidiaProduto])));
  const [rascunhos, setRascunhos] = useState<Record<string, MidiaProduto>>({});
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [alvo, setAlvo] = useState<number | null>(null);

  const termo = semAcento(busca.trim());
  const lista = produtos.filter(
    (p) =>
      (!categoria || p.categorySlug === categoria) &&
      (!soTrocados || salvos[p.id] || rascunhos[p.id]) &&
      (!termo || semAcento(`${p.name} ${p.category} ${p.groupId ?? ""} ${p.id}`).includes(termo)),
  );

  // O que vale hoje para um produto: a troca salva; sem ela, as fotos padrão do site; sem elas, as da API (lista vazia).
  const base = (p: ProdutoFotos) => salvos[p.id] ?? p.padrao ?? VAZIO;
  const produto = produtos.find((p) => p.id === selecionado) ?? null;
  const salvo = produto ? base(produto) : VAZIO;
  const atual = produto ? (rascunhos[produto.id] ?? salvo) : VAZIO;
  const sujo = Boolean(produto) && !igual(atual, salvo);
  // Lista vazia sem troca salva não muda nada no site (o padrão continua): só "Descartar".
  const podeSalvar = sujo && (atual.imagens.length > 0 || Boolean(produto && salvos[produto.id]));
  const usandoPadrao = Boolean(produto?.padrao) && !salvos[produto?.id ?? ""] && !sujo;
  const fotos = produto ? fotosDoProduto(produto.api, produto.api[0], atual) : { image: "", images: [] };
  const fontes = { api: produto?.api ?? [], padrao: produto?.padrao?.imagens ?? [] };
  const capaDe = (p: ProdutoFotos) => fotosDoProduto(p.api, p.api[0], rascunhos[p.id] ?? base(p)).image;
  const trocados = produtos.filter((p) => salvos[p.id]).length;
  useAvisoAoSair(Object.keys(rascunhos).length > 0);

  const editar = (mudanca: (m: MidiaProduto) => MidiaProduto) => {
    if (!produto) return;
    setMsg(null);
    setRascunhos((r) => ({ ...r, [produto.id]: mudanca(r[produto.id] ?? base(produto)) }));
  };
  const mover = (de: number, para: number) =>
    editar((m) => {
      if (para < 0 || para >= m.imagens.length || de === para) return m;
      const imagens = [...m.imagens];
      const [item] = imagens.splice(de, 1);
      imagens.splice(para, 0, item);
      return { ...m, imagens };
    });
  const incluir = (src: string) => editar((m) => (m.imagens.includes(src) || m.imagens.length >= MAX_FOTOS ? m : { ...m, imagens: [...m.imagens, src] }));
  const salvar = (valor: MidiaProduto) => {
    if (!produto) return;
    const g = produto.id;
    startTransition(async () => {
      const r = await salvarFotosProduto(g, valor);
      setMsg({ ok: r.ok, texto: r.message });
      if (!r.ok) return;
      setSalvos((s) => {
        const novo = { ...s };
        if (valor.imagens.length) novo[g] = valor;
        else delete novo[g];
        return novo;
      });
      setRascunhos((r2) => {
        const novo = { ...r2 };
        delete novo[g];
        return novo;
      });
    });
  };

  const resumo = !produto
    ? ""
    : !atual.imagens.length
      ? produto.padrao
        ? "sem fotos escolhidas (salvar assim volta à foto padrão do site)"
        : "usando as fotos da API"
      : usandoPadrao
        ? `${plural(atual.imagens.length, "foto padrão", "fotos padrão")} do site · nada salvo ainda`
        : plural(atual.imagens.length, "foto escolhida", "fotos escolhidas");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] lg:items-start">
      <div className="rounded-card bg-white shadow-sheet lg:sticky lg:top-6">
        <div className="space-y-2 border-b border-line p-4">
          <label className="relative block">
            <span className="sr-only">Buscar produto</span>
            <IconSearch aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto ou número do grupo" className={cx(control, "w-full pl-9")} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={cx(control, "min-w-0 flex-1")}>
              <option value="">Todas as categorias</option>
              {categorias.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-[13px] font-semibold">
              <input type="checkbox" checked={soTrocados} onChange={(e) => setSoTrocados(e.target.checked)} className="size-4 accent-ink" /> Só trocados ({trocados})
            </label>
          </div>
        </div>
        <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto" aria-label="Produtos">
          {lista.length === 0 && <li className="px-4 py-6 text-center text-[14px] text-muted">Nenhum produto encontrado.</li>}
          {lista.map((p) => {
            const ativo = p.id === selecionado;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelecionado(p.id);
                    setMsg(null);
                  }}
                  aria-current={ativo ? "true" : undefined}
                  className={cx("flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors", ativo ? "bg-mist" : "hover:bg-page-checkout")}
                >
                  <span className="relative h-12 w-9 shrink-0 overflow-hidden rounded-control">
                    <Foto src={capaDe(p)} sizes="36px" folga="p-0.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{p.name}</span>
                    <span className="block truncate text-[12px] text-muted">{p.category}</span>
                  </span>
                  {rascunhos[p.id] ? <Tag tone="warn">Não salvo</Tag> : salvos[p.id] ? <Tag tone="ok">Fotos próprias</Tag> : p.padrao ? <Tag>Padrão do site</Tag> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {produto ? (
        <div className="@container/painel space-y-5 rounded-card bg-white p-5 shadow-sheet">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-[18px] font-extrabold leading-snug">{produto.name}</h3>
              <p className="text-[13px] text-muted">
                {produto.category}
                {produto.groupId ? ` · grupo ${produto.groupId}` : ""} · {resumo}
              </p>
            </div>
            <a href={`/produto/${produto.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-bold underline-offset-4 hover:underline">
              Ver no site <IconExternal aria-hidden className="size-4" />
              <span className="sr-only">(abre em nova aba)</span>
            </a>
          </div>

          <div className="grid gap-6 @min-[500px]/painel:grid-cols-[minmax(0,1fr)_240px]">
            <div className="@container/fotos min-w-0 space-y-5">
              <section aria-labelledby="fotos-proprias">
                <h4 id="fotos-proprias" className="mb-2 text-[14px] font-bold">
                  Fotos do site <span className="font-normal text-muted">(arraste para ordenar; a primeira é a capa)</span>
                </h4>
                {usandoPadrao && (
                  <p className="mb-3 rounded-card bg-page-checkout px-4 py-3 text-[13px] leading-relaxed text-muted">
                    <strong className="font-bold text-ink">Foto padrão do site.</strong> Ainda não há troca salva para este produto: é esta a foto que o site mostra. Mude a ordem, junte fotos da API ou envie outras e clique em “Salvar e
                    publicar”.
                  </p>
                )}
                {atual.imagens.length ? (
                  <ol className="grid grid-cols-2 gap-3 @md/fotos:grid-cols-3 @2xl/fotos:grid-cols-4" aria-label="Fotos do site, na ordem do site">
                    {atual.imagens.map((src, i) => {
                      const origem = origemDaFoto(src, fontes);
                      const rotulo = origem ? ROTULO[origem] : null;
                      return (
                        <li
                          key={src}
                          draggable
                          onDragStart={(e) => {
                            setArrastando(i);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(e) => {
                            if (arrastando === null) return;
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
                            "group relative cursor-grab overflow-hidden rounded-card border active:cursor-grabbing",
                            alvo === i && arrastando !== null && arrastando !== i ? "border-ink" : "border-line",
                            arrastando === i && "opacity-50",
                          )}
                        >
                          <span className="relative block aspect-[3/4]">
                            <Foto src={src} alt={`Foto ${i + 1}${rotulo ? `, ${rotulo.alt}` : ""}`} sizes="180px" folga="p-3" />
                          </span>
                          <span className="absolute inset-x-2 top-2 flex flex-wrap items-start justify-between gap-1">
                            {i === 0 ? <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-white">Capa</span> : <span />}
                            {rotulo && (
                              <span aria-hidden className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold text-ink">
                                {rotulo.selo}
                              </span>
                            )}
                          </span>
                          <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-white/90 px-1.5 py-1">
                            <span className="flex">
                              <button type="button" onClick={() => mover(i, i - 1)} disabled={i === 0} aria-label={`Mover a foto ${i + 1} para antes`} className="grid size-10 place-items-center rounded-full text-ink hover:bg-mist disabled:opacity-30 sm:size-8">
                                ←
                              </button>
                              <button
                                type="button"
                                onClick={() => mover(i, i + 1)}
                                disabled={i === atual.imagens.length - 1}
                                aria-label={`Mover a foto ${i + 1} para depois`}
                                className="grid size-10 place-items-center rounded-full text-ink hover:bg-mist disabled:opacity-30 sm:size-8"
                              >
                                →
                              </button>
                            </span>
                            <button
                              type="button"
                              onClick={() => editar((m) => ({ ...m, imagens: m.imagens.filter((x) => x !== src) }))}
                              aria-label={`Tirar a foto ${i + 1}`}
                              className="grid size-10 place-items-center rounded-full text-muted hover:bg-coral-50 hover:text-coral-700 sm:size-8"
                            >
                              <IconTrash className="size-4" />
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                ) : produto.padrao ? (
                  <p className="rounded-card bg-page-checkout px-4 py-4 text-[14px] text-muted">
                    Nenhuma foto escolhida. {salvos[produto.id] ? "Salvar assim apaga a troca e o site volta à foto padrão." : "Como nada foi salvo, o site continua com a foto padrão."} Para mostrar só as fotos da API, use-as abaixo; para
                    desfazer, clique em “Descartar”.
                  </p>
                ) : (
                  <p className="rounded-card bg-page-checkout px-4 py-4 text-[14px] text-muted">Sem fotos próprias: o site mostra as fotos da API (abaixo). Envie fotos ou use uma da API para começar.</p>
                )}
              </section>

              {atual.imagens.length < MAX_FOTOS && (
                <ImageDrop
                  tipo="produto"
                  multiplo
                  onEnviada={(img) => incluir(img.src)}
                  titulo="Arraste fotos aqui (ou clique para escolher)"
                  dica={`PNG, JPG ou WebP até 6 MB · em pé (3:4, como 600 × 804 px) ocupam melhor o card · até ${MAX_FOTOS} fotos`}
                />
              )}

              {produto.padrao && (
                <Galeria
                  id="fotos-padrao"
                  titulo="Fotos padrão do site"
                  fotos={produto.padrao.imagens}
                  rotulo="padrão do site"
                  usadas={atual.imagens}
                  cheio={atual.imagens.length >= MAX_FOTOS}
                  onUsar={incluir}
                />
              )}

              <Galeria id="fotos-api" titulo="Fotos da API" fotos={produto.api} rotulo="da API" usadas={atual.imagens} cheio={atual.imagens.length >= MAX_FOTOS} onUsar={incluir}>
                {atual.imagens.length > 0 && (
                  <label className="mt-3 flex items-center gap-2 text-[14px] font-semibold">
                    <input type="checkbox" checked={atual.manterApi} onChange={(e) => editar((m) => ({ ...m, manterApi: e.target.checked }))} className="size-4 accent-ink" /> Mostrar também as fotos da API depois das
                    escolhidas
                  </label>
                )}
              </Galeria>
            </div>

            <aside aria-label="Prévia" className="space-y-3">
              <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted">Prévia</p>
              {/* O card do site (VitrineCard): foto 3:4 sem cantos arredondados e o nome alinhado à esquerda. */}
              <div className="max-w-[240px] rounded-card border border-line p-3">
                <span className="relative block aspect-[3/4] overflow-hidden">
                  <Foto src={fotos.image} sizes="220px" folga="p-5" />
                </span>
                <p className="mt-3 line-clamp-2 text-base leading-tight">{produto.name}</p>
                <p className="mt-1 text-[12px] text-muted">Card nas listas e na busca</p>
              </div>
              <div>
                <p className="mb-1.5 text-[12px] text-muted">Galeria da página do produto ({fotos.images.length})</p>
                <ul className="flex flex-wrap gap-1.5">
                  {fotos.images.map((src) => (
                    <li key={src} className="relative h-12 w-9 overflow-hidden rounded-control border border-line">
                      <Foto src={src} sizes="36px" folga="p-0.5" />
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            {msg && (
              <p role="status" className={cx("text-[14px] font-semibold", !msg.ok && "text-coral-700")}>
                {msg.texto}
              </p>
            )}
            <span className="flex-1" />
            {salvos[produto.id] && !sujo && (
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => salvar(VAZIO)}>
                {produto.padrao ? "Voltar ao padrão do site" : "Voltar às fotos da API"}
              </Button>
            )}
            {sujo && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  setRascunhos((r) => {
                    const novo = { ...r };
                    delete novo[produto.id];
                    return novo;
                  })
                }
              >
                Descartar
              </Button>
            )}
            <Button type="button" variant="dark" size="sm" loading={pending} disabled={!podeSalvar} onClick={() => salvar(atual)}>
              Salvar e publicar
            </Button>
          </div>
        </div>
      ) : (
        <p className="rounded-card bg-white p-8 text-center text-[14px] text-muted shadow-sheet">Escolha um produto na lista.</p>
      )}
    </div>
  );
}

/** Fotos para reaproveitar (as padrão do site ou as da API): "Usar" junta a foto ao fim da lista do site. */
type GaleriaProps = { id: string; titulo: string; fotos: string[]; rotulo: string; usadas: string[]; cheio: boolean; onUsar: (src: string) => void; children?: ReactNode };

function Galeria({ id, titulo, fotos, rotulo, usadas, cheio, onUsar, children }: GaleriaProps) {
  return (
    <section aria-labelledby={id}>
      <h4 id={id} className="mb-2 text-[14px] font-bold">
        {titulo} <span className="font-normal text-muted">({fotos.length})</span>
      </h4>
      <ul className="flex flex-wrap gap-2">
        {fotos.map((src, i) => {
          const usada = usadas.includes(src);
          return (
            <li key={src} className="w-24">
              <span className="relative block aspect-[3/4] overflow-hidden rounded-control border border-line">
                <Foto src={src} alt={`Foto ${i + 1} ${rotulo}`} sizes="96px" folga="p-1.5" />
              </span>
              <button
                type="button"
                disabled={usada || cheio}
                onClick={() => onUsar(src)}
                aria-label={usada ? `Foto ${i + 1} ${rotulo}: já em uso` : `Usar a foto ${i + 1} ${rotulo}`}
                className="mt-1 min-h-10 w-full rounded-full border border-line-strong py-1 text-[12px] font-bold hover:border-ink disabled:opacity-50 sm:min-h-8"
              >
                {usada ? "Em uso" : "Usar"}
              </button>
            </li>
          );
        })}
      </ul>
      {children}
    </section>
  );
}
