"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { bannersDoSiteAtual, salvarBanners } from "@/app/(admin)/admin/site-actions";
import { Tag } from "@/components/admin/ui";
import BannerCarousel from "@/components/home/BannerCarousel";
import type { Tela } from "@/components/home/BannerImagem";
import PromoBanners from "@/components/home/PromoBanners";
import { IconTrash } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TextField } from "@/components/ui/TextField";
import { cx } from "@/components/ui/cx";
import { imageUrl } from "@/lib/format";
import { avisoDeTamanho, bannersNoAr, LUGARES_BANNER, statusDoBanner, type Banner, type ImagemSite, type LugarBanner } from "@/lib/midia";
import { ImageDrop } from "./ImageDrop";
import { useAvisoAoSair } from "./useAvisoAoSair";

/*
 * Editor de um lugar de banners da página inicial (admin → Site → Banners). Tudo muda no rascunho desta tela, com a
 * prévia do jeito que o site mostra hoje (computador ou celular); "Salvar e publicar" grava e o site se refaz.
 * Sem lista salva, o editor começa com os banners padrão do site (midia-padrao.ts), marcados como tal: são os que a
 * página inicial mostra enquanto isso. Publicar a lista vazia apaga a salva e o padrão volta; para não ter banner
 * nenhum, cada um é desligado.
 */

const novoId = () => `b-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

// As imagens padrão (public/site/banners) vêm do Figma no tamanho em que o site as mostra: sem aviso de tamanho.
const imagemPadrao = (src: string) => src.startsWith("/site/banners/");

type Props = {
  lugar: LugarBanner;
  /** Lista salva no banco (vazia = nada salvo). */
  salvos: Banner[];
  /** Banners padrão do site para este lugar. */
  padrao: Banner[];
  hoje: string;
};

export default function BannersEditor({ lugar, salvos, padrao, hoje }: Props) {
  const info = LUGARES_BANNER[lugar];
  const [temLista, setTemLista] = useState(salvos.length > 0);
  const [banners, setBanners] = useState(() => (salvos.length ? salvos : padrao));
  const [salvo, setSalvo] = useState(() => JSON.stringify(salvos.length ? salvos : padrao));
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [tela, setTela] = useState<Tela>("desktop");
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [alvo, setAlvo] = useState<number | null>(null);
  const sujo = JSON.stringify(banners) !== salvo;
  // Sem lista salva, publicar a lista vazia não muda nada (o padrão continua): só "Descartar".
  const podePublicar = sujo && (banners.length > 0 || temLista);
  const idsPadrao = new Set(padrao.map((b) => b.id));
  // Lista vazia publicada = os banners padrão no site; a prévia mostra o que vai aparecer.
  const noAr = bannersNoAr(banners.length ? banners : padrao, hoje);
  useAvisoAoSair(sujo);

  const mudar = (id: string, campos: Partial<Banner>) => {
    setMsg(null);
    setBanners((lista) => lista.map((b) => (b.id === id ? { ...b, ...campos } : b)));
  };
  const mover = (de: number, para: number) =>
    setBanners((lista) => {
      if (para < 0 || para >= lista.length || de === para) return lista;
      const nova = [...lista];
      const [item] = nova.splice(de, 1);
      nova.splice(para, 0, item);
      return nova;
    });
  const adicionar = (imagem: ImagemSite) => {
    setMsg(null);
    setBanners((lista) =>
      lista.length >= info.limite
        ? lista
        : [...lista, { id: novoId(), desktop: imagem, mobile: null, alt: "", href: null, novaAba: false, ativo: true, inicio: null, fim: null, linha: lugar === "inicio-meio" ? (lista.at(-1)?.linha ?? 1) : null }],
    );
  };
  const salvar = () =>
    startTransition(async () => {
      const r = await salvarBanners(lugar, banners);
      setMsg({ ok: r.ok, texto: r.message });
      if (!r.ok) return;
      if (banners.length) {
        setSalvo(JSON.stringify(banners));
        setTemLista(true);
      } else {
        // A lista salva foi apagada: o editor volta a mostrar os banners padrão, que são os do site agora.
        setBanners(padrao);
        setSalvo(JSON.stringify(padrao));
        setTemLista(false);
      }
    });
  const voltarAoPadrao = () => {
    if (!window.confirm(`Apagar a lista salva de “${info.nome}”? O site volta a mostrar ${padrao.length === 1 ? "o banner padrão" : "os banners padrão"}.`)) return;
    startTransition(async () => {
      const r = await salvarBanners(lugar, []);
      setMsg({ ok: r.ok, texto: r.message });
      if (!r.ok) return;
      setBanners(padrao);
      setSalvo(JSON.stringify(padrao));
      setTemLista(false);
    });
  };
  const importar = () =>
    startTransition(async () => {
      const r = await bannersDoSiteAtual(lugar);
      if (!r.ok) return setMsg({ ok: false, texto: r.message });
      const cabem = r.banners.slice(0, Math.max(0, info.limite - banners.length));
      setBanners((lista) => [...lista, ...cabem]);
      setMsg({ ok: true, texto: cabem.length ? `${cabem.length} ${cabem.length === 1 ? "banner veio" : "banners vieram"} do site atual. Revise e clique em “Salvar e publicar”.` : "Não há espaço para mais banners aqui." });
    });

  return (
    <div className="space-y-5">
      <div className="space-y-1.5 rounded-card bg-page-checkout px-4 py-3 text-[13px] leading-relaxed text-muted">
        {!temLista && (
          <p>
            <strong className="font-bold text-ink">{padrao.length === 1 ? "Banner padrão do site." : "Banners padrão do site."}</strong> Ainda não há nada salvo aqui: {padrao.length === 1 ? "este é o banner que a página inicial mostra" : "estes são os banners que a página inicial mostra"} agora.
            Mude o que quiser e clique em “Salvar e publicar” para guardar a sua lista.
          </p>
        )}
        <p>
          Apagar todos os banners e publicar volta {padrao.length === 1 ? "o banner padrão" : "os banners padrão"} do site. Para não mostrar banner nenhum aqui, deixe os banners na lista e desmarque “Ligado” em cada um.
        </p>
      </div>

      {banners.length === 0 ? (
        <p className="rounded-card border border-dashed border-line-strong px-4 py-5 text-[14px] text-muted">
          {temLista
            ? `Nenhum banner na lista. Publicar assim apaga a lista salva e o site volta ${padrao.length === 1 ? "ao banner padrão" : `aos ${padrao.length} banners padrão`}. Para não ter banner nenhum, clique em “Descartar” e desligue cada um.`
            : `Nenhum banner na lista. Como nada foi salvo aqui, o site continua com ${padrao.length === 1 ? "o banner padrão" : `os ${padrao.length} banners padrão`}. Para não ter banner nenhum, clique em “Descartar”, desligue cada um e publique.`}
        </p>
      ) : (
        <ol className="space-y-3" aria-label={`Banners: ${info.nome}`}>
          {banners.map((b, i) => {
            const status = statusDoBanner(b, hoje);
            const aviso = imagemPadrao(b.desktop.src) ? null : avisoDeTamanho(b.desktop, info.desktop, lugar === "inicio-topo");
            const avisoMobile = b.mobile && info.mobile && !imagemPadrao(b.mobile.src) ? avisoDeTamanho(b.mobile, info.mobile, false) : null;
            return (
              <li
                key={b.id}
                onDragOver={(e) => {
                  if (arrastando === null) return;
                  e.preventDefault();
                  setAlvo(i);
                }}
                onDrop={(e) => {
                  if (arrastando === null) return;
                  e.preventDefault();
                  mover(arrastando, i);
                  setArrastando(null);
                  setAlvo(null);
                }}
                className={cx("rounded-card border bg-white transition-colors", alvo === i && arrastando !== null && arrastando !== i ? "border-ink" : "border-line", arrastando === i && "opacity-50")}
              >
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                  <span
                    draggable
                    onDragStart={(e) => {
                      setArrastando(i);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setArrastando(null);
                      setAlvo(null);
                    }}
                    title="Arraste para mudar a ordem"
                    aria-hidden
                    className="grid h-8 w-5 cursor-grab place-items-center text-[14px] leading-none text-subtle active:cursor-grabbing"
                  >
                    ⋮⋮
                  </span>
                  <p className="text-[14px] font-bold">Banner {i + 1}</p>
                  <Tag tone={status.tom === "ok" ? "ok" : status.tom === "warn" ? "warn" : "neutral"}>{status.texto}</Tag>
                  {!temLista && idsPadrao.has(b.id) && <Tag>Padrão do site</Tag>}
                  <span className="flex-1" />
                  <button type="button" onClick={() => mover(i, i - 1)} disabled={i === 0} aria-label={`Subir o banner ${i + 1}`} className="grid size-8 place-items-center rounded-full text-muted hover:bg-mist hover:text-ink disabled:opacity-30">
                    ↑
                  </button>
                  <button type="button" onClick={() => mover(i, i + 1)} disabled={i === banners.length - 1} aria-label={`Descer o banner ${i + 1}`} className="grid size-8 place-items-center rounded-full text-muted hover:bg-mist hover:text-ink disabled:opacity-30">
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMsg(null);
                      setBanners((lista) => lista.filter((x) => x.id !== b.id));
                    }}
                    aria-label={`Tirar o banner ${i + 1}`}
                    className="grid size-8 place-items-center rounded-full text-muted hover:bg-coral-50 hover:text-coral-700"
                  >
                    <IconTrash className="size-4" />
                  </button>
                </div>

                <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                  <div className="space-y-4">
                    <figure>
                      <div className="relative overflow-hidden rounded-control border border-line bg-mist" style={{ aspectRatio: `${b.desktop.w} / ${b.desktop.h}` }}>
                        <Image src={imageUrl(b.desktop.src)} alt="" fill sizes="(min-width: 1024px) 560px, 100vw" className="object-cover" />
                      </div>
                      <figcaption className="mt-1.5 text-caption text-muted">
                        Computador · {b.desktop.w} × {b.desktop.h} px
                      </figcaption>
                      {aviso && <p className="mt-1 text-caption font-semibold text-coral-700">{aviso}</p>}
                    </figure>
                    <ImageDrop tipo="banner" compacto onEnviada={(img) => mudar(b.id, { desktop: img })} titulo="Trocar a imagem do computador" />

                    <div className="grid gap-3 sm:grid-cols-[120px_1fr] sm:items-start">
                      {b.mobile ? (
                        <figure>
                          <div className="relative overflow-hidden rounded-control border border-line bg-mist" style={{ aspectRatio: `${b.mobile.w} / ${b.mobile.h}` }}>
                            <Image src={imageUrl(b.mobile.src)} alt="" fill sizes="120px" className="object-cover" />
                          </div>
                          <figcaption className="mt-1 text-caption text-muted">
                            Celular · {b.mobile.w} × {b.mobile.h}
                          </figcaption>
                        </figure>
                      ) : (
                        <p className="text-caption text-muted">Sem imagem de celular: o celular mostra a do computador.</p>
                      )}
                      <div className="space-y-2">
                        <ImageDrop
                          tipo="banner"
                          compacto
                          onEnviada={(img) => mudar(b.id, { mobile: img })}
                          titulo={b.mobile ? "Trocar a imagem do celular" : "Imagem do celular (opcional)"}
                          dica={info.mobile ? `Recomendado: ${info.mobile.w} × ${info.mobile.h} px` : "Mesma imagem mais alta, para telas estreitas"}
                        />
                        {b.mobile && (
                          <button type="button" onClick={() => mudar(b.id, { mobile: null })} className="text-caption font-bold underline underline-offset-2">
                            Usar a do computador no celular
                          </button>
                        )}
                        {avisoMobile && <p className="text-caption font-semibold text-coral-700">{avisoMobile}</p>}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {lugar === "inicio-meio" && (
                      <label className="block text-[14px] font-bold">
                        Linha
                        <select
                          value={b.linha ?? ""}
                          onChange={(e) => mudar(b.id, { linha: e.target.value ? Number(e.target.value) : null })}
                          className="mt-1.5 block h-10 w-full rounded-control border border-line bg-white px-3 text-[14px] font-normal"
                        >
                          <option value="">Na mesma linha da anterior</option>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>
                              Linha {n}
                            </option>
                          ))}
                        </select>
                        <span className="mt-1 block text-caption font-normal text-muted">As faixas da mesma linha ficam lado a lado, com a mesma altura.</span>
                      </label>
                    )}
                    <TextField label="Texto alternativo" value={b.alt} onChange={(alt) => mudar(b.id, { alt })} maxLength={140} hint="O que o banner mostra, para quem não vê a imagem e para o Google." error={!b.alt.trim() ? "Obrigatório." : null} />
                    <TextField label="Link (opcional)" value={b.href ?? ""} onChange={(href) => mudar(b.id, { href: href.trim() || null })} maxLength={500} placeholder="/categoria/cartoes-de-visita-e-postais ou https://…" hint="Um caminho do site ou um endereço https." />
                    <label className="flex items-center gap-2 text-[14px] font-semibold">
                      <input type="checkbox" checked={b.novaAba} onChange={(e) => mudar(b.id, { novaAba: e.target.checked })} className="size-4 accent-ink" /> Abrir o link em nova aba
                    </label>
                    <label className="flex items-center gap-2 text-[14px] font-semibold">
                      <input type="checkbox" checked={b.ativo} onChange={(e) => mudar(b.id, { ativo: e.target.checked })} className="size-4 accent-ink" /> Ligado (aparece no site)
                    </label>
                    <fieldset className="grid grid-cols-2 gap-3">
                      <legend className="mb-1.5 text-[14px] font-bold">Período no ar (opcional)</legend>
                      <label className="text-caption font-semibold text-muted">
                        De
                        <input type="date" value={b.inicio ?? ""} onChange={(e) => mudar(b.id, { inicio: e.target.value || null })} className="mt-1 h-10 w-full rounded-control border border-line bg-white px-3 text-[14px] text-ink" />
                      </label>
                      <label className="text-caption font-semibold text-muted">
                        Até
                        <input type="date" value={b.fim ?? ""} min={b.inicio ?? undefined} onChange={(e) => mudar(b.id, { fim: e.target.value || null })} className="mt-1 h-10 w-full rounded-control border border-line bg-white px-3 text-[14px] text-ink" />
                      </label>
                    </fieldset>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {banners.length < info.limite ? (
        <ImageDrop
          tipo="banner"
          multiplo
          onEnviada={adicionar}
          titulo={banners.length ? "Arraste aqui mais banners (ou clique para escolher)" : "Arraste aqui os banners (ou clique para escolher)"}
          dica={`Imagem do computador. Recomendado: ${info.desktop.w} × ${info.desktop.h} px · PNG, JPG ou WebP até 7 MB · cabem ${info.limite}`}
        />
      ) : (
        <p className="text-caption text-muted">Este lugar já tem o máximo de {info.limite} banners.</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={importar} disabled={pending || banners.length >= info.limite}>
          {lugar === "inicio-topo" ? "Trazer os banners do site atual" : "Trazer os botões do site atual"}
        </Button>
        <span className="text-caption text-muted">Os do padraocolor.com.br, como ponto de partida.</span>
        {temLista && !sujo && (
          <Button type="button" variant="outline" size="sm" onClick={voltarAoPadrao} disabled={pending} className="sm:ml-auto">
            Voltar ao padrão do site
          </Button>
        )}
      </div>

      <section aria-label="Prévia" className="overflow-hidden rounded-card border border-line">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-page-checkout px-4 py-2.5">
          <p className="text-[13px] font-bold">
            Prévia: como fica hoje no site <span className="font-normal text-muted">({noAr.length} no ar{banners.length ? "" : ", os padrão"})</span>
          </p>
          <SegmentedControl
            label="Tela da prévia"
            value={tela}
            onChange={setTela}
            options={[
              { value: "desktop", label: "Computador" },
              { value: "mobile", label: "Celular" },
            ]}
          />
        </div>
        <div className="bg-mist p-4">
          {noAr.length ? (
            <div className={cx("mx-auto overflow-hidden rounded-control bg-white", tela === "mobile" ? "max-w-[390px]" : "max-w-full")}>
              {lugar === "inicio-topo" ? <BannerCarousel key={tela} banners={noAr} forcar={tela} /> : <PromoBanners banners={noAr} forcar={tela} className="p-3" />}
            </div>
          ) : (
            <p className="py-6 text-center text-[14px] text-muted">Nenhum banner no ar hoje: este lugar fica sem banner no site.</p>
          )}
        </div>
      </section>

      {(sujo || msg) && (
        <div className="sticky bottom-0 z-20 -mx-5 flex flex-wrap items-center gap-3 border-t border-line bg-white/95 px-5 py-3 backdrop-blur">
          {msg && (
            <p role="status" className={cx("text-[14px] font-semibold", !msg.ok && "text-coral-700")}>
              {msg.texto}
            </p>
          )}
          {sujo && (
            <>
              {!msg && <p className="text-[14px] font-semibold">Mudanças ainda não publicadas.</p>}
              <span className="flex-1" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setBanners(JSON.parse(salvo) as Banner[]);
                  setMsg(null);
                }}
              >
                Descartar
              </Button>
              {podePublicar && (
                <Button type="button" variant="dark" size="sm" loading={pending} onClick={salvar}>
                  Salvar e publicar
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
