"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { salvarMidiaCategoria } from "@/app/(admin)/admin/site-actions";
import { Tag } from "@/components/admin/ui";
import { IconExternal } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { imageUrl } from "@/lib/format";
import { imagemPermitida, type MidiaCategoria } from "@/lib/midia";
import { ImageDrop } from "./ImageDrop";
import { useAvisoAoSair } from "./useAvisoAoSair";

/*
 * Imagens das categorias (admin → Site → Imagens → Categorias): a imagem (círculo de "Categorias" na página inicial e o
 * menu) e o banner do topo da página da categoria, no computador e no celular. Campo vazio = a imagem padrão do site
 * (midia-padrao.ts, quando a categoria tem) ou a da API (a imagem), e o topo ilustrado com os produtos (o banner).
 */

export type CategoriaImagens = {
  slug: string;
  name: string;
  count: number;
  imagemApi: string;
  /** Imagem padrão do site desta categoria (null = não tem). */
  imagemPadrao: string | null;
  troca: MidiaCategoria | null;
};

const VAZIO: MidiaCategoria = { imagem: null, banner: null, bannerMobile: null };
const igual = (a: MidiaCategoria, b: MidiaCategoria) => a.imagem === b.imagem && a.banner === b.banner && a.bannerMobile === b.bannerMobile;

export default function ImagensCategorias({ categorias }: { categorias: CategoriaImagens[] }) {
  const [selecionada, setSelecionada] = useState<string | null>(categorias[0]?.slug ?? null);
  const [salvas, setSalvas] = useState<Record<string, MidiaCategoria>>(() => Object.fromEntries(categorias.filter((c) => c.troca).map((c) => [c.slug, c.troca as MidiaCategoria])));
  const [rascunhos, setRascunhos] = useState<Record<string, MidiaCategoria>>({});
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const cat = categorias.find((c) => c.slug === selecionada) ?? null;
  const salva = cat ? (salvas[cat.slug] ?? VAZIO) : VAZIO;
  const atual = cat ? (rascunhos[cat.slug] ?? salva) : VAZIO;
  const sujo = Boolean(cat) && !igual(atual, salva);
  useAvisoAoSair(Object.keys(rascunhos).length > 0);

  // A imagem que o site mostra: a escolhida; sem ela, a padrão do site; sem padrão, a da API.
  const imagemDe = (c: CategoriaImagens, m: MidiaCategoria | undefined) => m?.imagem ?? c.imagemPadrao ?? c.imagemApi;
  const origemDe = (c: CategoriaImagens, src: string) => (src === c.imagemPadrao ? "Imagem padrão do site" : src === c.imagemApi ? "Imagem da API" : "Imagem própria");

  const editar = (campos: Partial<MidiaCategoria>) => {
    if (!cat) return;
    setMsg(null);
    setRascunhos((r) => ({ ...r, [cat.slug]: { ...(r[cat.slug] ?? salvas[cat.slug] ?? VAZIO), ...campos } }));
  };
  const salvar = (valor: MidiaCategoria) => {
    if (!cat) return;
    const slug = cat.slug;
    startTransition(async () => {
      const r = await salvarMidiaCategoria(slug, valor);
      setMsg({ ok: r.ok, texto: r.message });
      if (!r.ok) return;
      setSalvas((s) => {
        const novo = { ...s };
        if (valor.imagem || valor.banner) novo[slug] = valor;
        else delete novo[slug];
        return novo;
      });
      setRascunhos((r2) => {
        const novo = { ...r2 };
        delete novo[slug];
        return novo;
      });
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] lg:items-start">
      <ul className="divide-y divide-line overflow-hidden rounded-card bg-white shadow-sheet lg:sticky lg:top-6" aria-label="Categorias">
        {categorias.map((c) => {
          const ativa = c.slug === selecionada;
          const troca = rascunhos[c.slug] ?? salvas[c.slug];
          return (
            <li key={c.slug}>
              <button
                type="button"
                onClick={() => {
                  setSelecionada(c.slug);
                  setMsg(null);
                }}
                aria-current={ativa ? "true" : undefined}
                className={cx("flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors", ativa ? "bg-mist" : "hover:bg-page-checkout")}
              >
                <span className="relative size-11 shrink-0 overflow-hidden rounded-full bg-mist">
                  <Image src={imageUrl(imagemDe(c, troca))} alt="" fill sizes="44px" className="object-contain p-1" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{c.name}</span>
                  <span className="block text-[12px] text-muted">
                    {c.count} {c.count === 1 ? "produto" : "produtos"}
                  </span>
                </span>
                {rascunhos[c.slug] ? <Tag tone="warn">Não salvo</Tag> : salvas[c.slug] ? <Tag tone="ok">Própria</Tag> : c.imagemPadrao ? <Tag>Padrão do site</Tag> : null}
              </button>
            </li>
          );
        })}
      </ul>

      {cat ? (
        <div className="space-y-6 rounded-card bg-white p-5 shadow-sheet">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h3 className="text-[18px] font-extrabold">{cat.name}</h3>
            <a href={`/categoria/${cat.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-bold underline-offset-4 hover:underline">
              Ver no site <IconExternal aria-hidden className="size-4" />
              <span className="sr-only">(abre em nova aba)</span>
            </a>
          </div>

          <section aria-labelledby="cat-imagem" className="grid gap-4 sm:grid-cols-[160px_1fr] sm:items-start">
            <div>
              <span className="relative block aspect-square overflow-hidden rounded-card bg-mist">
                <Image src={imageUrl(imagemDe(cat, atual))} alt="" fill sizes="160px" className="object-contain p-3" />
              </span>
              <p className="mt-1 text-center text-caption text-muted">{origemDe(cat, imagemDe(cat, atual))}</p>
            </div>
            <div className="space-y-2">
              <h4 id="cat-imagem" className="text-[14px] font-bold">
                Imagem da categoria
              </h4>
              <p className="text-[13px] text-muted">Aparece em “Categorias” na página inicial e no menu. Quadrada, com fundo transparente ou claro.</p>
              <ImageDrop tipo="categoria" compacto onEnviada={(img) => editar({ imagem: img.src })} titulo={atual.imagem ? "Trocar a imagem" : "Enviar uma imagem própria"} dica="PNG, JPG ou WebP até 6 MB" />
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {atual.imagem && (
                  <button type="button" onClick={() => editar({ imagem: null })} className="min-h-10 text-caption font-bold underline underline-offset-2 sm:min-h-0">
                    {cat.imagemPadrao ? "Voltar à imagem padrão do site" : "Voltar à imagem da API"}
                  </button>
                )}
                {/* Com imagem padrão, a da API só aparece se for escolhida. */}
                {cat.imagemPadrao && atual.imagem !== cat.imagemApi && imagemPermitida(cat.imagemApi) && (
                  <button type="button" onClick={() => editar({ imagem: cat.imagemApi })} className="min-h-10 text-caption font-bold underline underline-offset-2 sm:min-h-0">
                    Usar a imagem da API
                  </button>
                )}
              </div>
            </div>
          </section>

          <section aria-labelledby="cat-banner" className="space-y-3 border-t border-line pt-5">
            <div>
              <h4 id="cat-banner" className="text-[14px] font-bold">
                Banner do topo da página da categoria
              </h4>
              <p className="text-[13px] text-muted">Sem banner próprio, a página mostra o topo ilustrado com os produtos da categoria. Recomendado: 1440 × 355 px no computador.</p>
            </div>
            {atual.banner ? (
              <figure>
                <span className="block overflow-hidden rounded-control border border-line bg-mist">
                  <Image src={imageUrl(atual.banner)} alt="" width={1440} height={355} sizes="(min-width: 1024px) 760px, 100vw" className="block h-auto w-full" />
                </span>
                <figcaption className="mt-1 text-caption text-muted">Computador</figcaption>
              </figure>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <ImageDrop tipo="banner" compacto onEnviada={(img) => editar({ banner: img.src })} titulo={atual.banner ? "Trocar o banner do computador" : "Enviar o banner do computador"} dica="1440 × 355 px · até 7 MB" />
                {atual.banner && (
                  <button type="button" onClick={() => editar({ banner: null, bannerMobile: null })} className="text-caption font-bold underline underline-offset-2">
                    Tirar o banner (volta o topo ilustrado)
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {atual.bannerMobile && (
                  <span className="block w-32 overflow-hidden rounded-control border border-line bg-mist">
                    <Image src={imageUrl(atual.bannerMobile)} alt="" width={900} height={500} sizes="128px" className="block h-auto w-full" />
                  </span>
                )}
                <ImageDrop
                  tipo="banner"
                  compacto
                  disabled={!atual.banner}
                  onEnviada={(img) => editar({ bannerMobile: img.src })}
                  titulo={atual.bannerMobile ? "Trocar o banner do celular" : "Banner do celular (opcional)"}
                  dica={atual.banner ? "Mais alto, para telas estreitas" : "Envie antes o do computador"}
                />
                {atual.bannerMobile && (
                  <button type="button" onClick={() => editar({ bannerMobile: null })} className="text-caption font-bold underline underline-offset-2">
                    Usar o do computador no celular
                  </button>
                )}
              </div>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            {msg && (
              <p role="status" className={cx("text-[14px] font-semibold", !msg.ok && "text-coral-700")}>
                {msg.texto}
              </p>
            )}
            <span className="flex-1" />
            {salvas[cat.slug] && !sujo && (
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => salvar(VAZIO)}>
                {cat.imagemPadrao ? "Voltar ao padrão do site" : "Voltar às imagens da API"}
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
                    delete novo[cat.slug];
                    return novo;
                  })
                }
              >
                Descartar
              </Button>
            )}
            <Button type="button" variant="dark" size="sm" loading={pending} disabled={!sujo} onClick={() => salvar(atual)}>
              Salvar e publicar
            </Button>
          </div>
        </div>
      ) : (
        <p className="rounded-card bg-white p-8 text-center text-[14px] text-muted shadow-sheet">Escolha uma categoria na lista.</p>
      )}
    </div>
  );
}
