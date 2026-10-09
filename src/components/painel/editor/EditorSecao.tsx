"use client";

import Image from "next/image";
import { useState } from "react";
import { IconCheck, IconClock, IconCube, IconGift, IconLayers, IconShield, IconStorefront, IconTruck, IconWhatsApp } from "@/components/icons";
import { cx } from "@/components/ui/cx";
import { imageUrl } from "@/lib/format";
import { ICONES, LIMITES, type IconeKey, type Secao, type SecaoProdutos } from "@/lib/multiloja/tema";
import { CampoImagem, Chave, Escolha, Grupo, Itens, Lista, Texto, type Opcao } from "./campos";

/* Formulário de cada tipo de seção do editor. Só muda o objeto da seção; quem chama guarda no tema. */

export type EditorContexto = {
  categorias: { slug: string; name: string }[];
  produtos: { id: string; name: string; image: string; categorySlug: string }[];
  temWhatsapp: boolean;
};

const ICON_COMPONENT: Record<IconeKey, typeof IconCube> = {
  cubo: IconCube,
  caminhao: IconTruck,
  escudo: IconShield,
  relogio: IconClock,
  presente: IconGift,
  camadas: IconLayers,
  whatsapp: IconWhatsApp,
  loja: IconStorefront,
  check: IconCheck,
};

function linkOptions(ctx: EditorContexto, current: string): Opcao<string>[] {
  const options: Opcao<string>[] = [
    { value: "/produtos", label: "Todos os produtos" },
    { value: "/sobre", label: "Sobre a loja" },
    ...ctx.categorias.map((c) => ({ value: `/produtos?categoria=${c.slug}`, label: `Categoria: ${c.name}` })),
  ];
  return options.some((o) => o.value === current) ? options : [...options, { value: current, label: current }];
}

function ProdutosEscolhidos({ secao, set, ctx }: { secao: SecaoProdutos; set: (s: SecaoProdutos) => void; ctx: EditorContexto }) {
  const [busca, setBusca] = useState("");
  const chosen = new Set(secao.escolhidos);
  const byId = new Map(ctx.produtos.map((p) => [p.id, p]));
  const q = busca.trim().toLowerCase();
  const results = ctx.produtos.filter((p) => !chosen.has(p.id) && (!q || p.name.toLowerCase().includes(q))).slice(0, 30);
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-bold">
        Produtos escolhidos <span className="font-normal text-muted">({secao.escolhidos.length}/{LIMITES.escolhidos})</span>
      </p>
      {secao.escolhidos.length > 0 && (
        <ol className="space-y-1">
          {secao.escolhidos.map((id, i) => {
            const p = byId.get(id);
            if (!p) return null;
            return (
              <li key={id} className="flex items-center gap-2 rounded-control border border-line bg-white p-1.5 pr-1">
                <span className="relative size-9 shrink-0 overflow-hidden rounded-thumb bg-mist">
                  <Image src={imageUrl(p.image)} alt="" fill sizes="36px" className="object-contain p-0.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{p.name}</span>
                <button
                  type="button"
                  aria-label="Mover para cima"
                  disabled={i === 0}
                  onClick={() => {
                    const next = [...secao.escolhidos];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    set({ ...secao, escolhidos: next });
                  }}
                  className="grid size-7 place-items-center rounded-full text-muted hover:bg-mist disabled:opacity-30"
                >
                  ↑
                </button>
                <button type="button" aria-label={`Tirar ${p.name}`} onClick={() => set({ ...secao, escolhidos: secao.escolhidos.filter((x) => x !== id) })} className="grid size-7 place-items-center rounded-full text-muted hover:bg-coral-50 hover:text-coral-700">
                  ×
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {secao.escolhidos.length < LIMITES.escolhidos && (
        <>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto da loja…" aria-label="Buscar produto para adicionar" className="h-10 w-full rounded-control border border-line bg-white px-3 text-[14px] outline-none focus:border-ink" />
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {results.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => set({ ...secao, escolhidos: [...secao.escolhidos, p.id] })} className="flex w-full items-center gap-2 rounded-control p-1.5 text-left hover:bg-mist">
                  <span className="relative size-9 shrink-0 overflow-hidden rounded-thumb bg-mist">
                    <Image src={imageUrl(p.image)} alt="" fill sizes="36px" className="object-contain p-0.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px]">{p.name}</span>
                  <span className="text-[12px] font-bold text-coral-700">+ Pôr</span>
                </button>
              </li>
            ))}
            {results.length === 0 && <li className="py-2 text-center text-[12px] text-muted">Nenhum produto encontrado.</li>}
          </ul>
        </>
      )}
    </div>
  );
}

export default function EditorSecao({ secao, onChange, ctx }: { secao: Secao; onChange: (s: Secao) => void; ctx: EditorContexto }) {
  switch (secao.tipo) {
    case "hero": {
      const set = (patch: Partial<typeof secao>) => onChange({ ...secao, ...patch });
      return (
        <>
          <Grupo titulo="Formato">
            <Escolha
              label="Arrumação"
              value={secao.layout}
              onChange={(layout) => set({ layout })}
              options={[
                { value: "esquerda", label: "Texto e imagem" },
                { value: "centro", label: "Centralizado" },
                { value: "fundo", label: "Imagem de fundo" },
              ]}
            />
            {!(secao.layout === "fundo" && secao.imagem) && (
              <Escolha
                label="Fundo"
                value={secao.fundo}
                onChange={(fundo) => set({ fundo })}
                options={[
                  { value: "suave", label: "Tom claro" },
                  { value: "branco", label: "Branco" },
                  { value: "cor", label: "Cor da marca" },
                  { value: "escuro", label: "Escuro" },
                ]}
              />
            )}
            <CampoImagem
              label={secao.layout === "fundo" ? "Imagem de fundo" : "Imagem"}
              value={secao.imagem}
              onChange={(imagem) => set({ imagem })}
              hint={secao.layout === "esquerda" ? "Sem imagem, aparecem fotos dos seus produtos." : secao.layout === "fundo" ? "Fica escurecida para o texto aparecer." : "Aparece embaixo do texto."}
            />
          </Grupo>
          <Grupo titulo="Textos">
            <Texto label="Selo (acima do título)" value={secao.selo} onChange={(selo) => set({ selo })} max={LIMITES.selo} placeholder="Ex.: Novidade" />
            <Texto label="Título" value={secao.titulo} onChange={(titulo) => set({ titulo })} max={LIMITES.titulo} />
            <Texto label="Frase" value={secao.texto} onChange={(texto) => set({ texto })} max={LIMITES.texto} multiline />
          </Grupo>
          <Grupo titulo="Botões">
            <Texto label="Texto do botão" value={secao.botao} onChange={(botao) => set({ botao })} max={LIMITES.botao} hint="Em branco, o botão some." />
            <Lista label="Leva para" value={secao.link} onChange={(link) => set({ link })} options={linkOptions(ctx, secao.link)} />
            <Escolha
              label="Segundo botão"
              value={secao.botao2}
              onChange={(botao2) => set({ botao2 })}
              options={[
                { value: "nenhum", label: "Nenhum" },
                { value: "whatsapp", label: "WhatsApp" },
                { value: "sobre", label: "Sobre a loja" },
              ]}
            />
            {secao.botao2 === "whatsapp" && !ctx.temWhatsapp && <p className="text-[12px] font-semibold text-coral-700">Cadastre o WhatsApp em Dados da loja para este botão aparecer.</p>}
          </Grupo>
        </>
      );
    }
    case "banners":
      return (
        <>
          <Grupo titulo="Formato">
            <Escolha
              label="Altura"
              value={secao.altura}
              onChange={(altura) => onChange({ ...secao, altura })}
              options={[
                { value: "baixa", label: "Baixa" },
                { value: "media", label: "Média" },
                { value: "alta", label: "Alta" },
              ]}
            />
            <p className="text-[12px] text-muted">Use imagens de 1920 × 640 px. No celular, a imagem é cortada nas laterais.</p>
          </Grupo>
          <Grupo titulo={`Imagens (${secao.slides.length}/${LIMITES.slides})`}>
            <Itens
              itens={secao.slides}
              onChange={(slides) => onChange({ ...secao, slides })}
              max={LIMITES.slides}
              nomeItem="Banner"
              rotulo={(s) => s.alt}
              render={(s, setSlide) => (
                <>
                  <CampoImagem label="Imagem" value={s.src} onChange={(src) => (src ? setSlide({ ...s, src }) : onChange({ ...secao, slides: secao.slides.filter((x) => x !== s) }))} aspect="aspect-[3/1]" />
                  <Texto label="Descrição (para leitores de tela)" value={s.alt} onChange={(alt) => setSlide({ ...s, alt })} max={LIMITES.alt} />
                  <Lista
                    label="Ao clicar, leva para"
                    value={s.href ?? ""}
                    onChange={(href) => setSlide({ ...s, href: href || null })}
                    options={[{ value: "", label: "Não leva a lugar nenhum" }, ...linkOptions(ctx, s.href ?? "/produtos")]}
                  />
                </>
              )}
            />
            {secao.slides.length < LIMITES.slides && <CampoImagem label="Adicionar banner" value={null} onChange={(src) => src && onChange({ ...secao, slides: [...secao.slides, { src, alt: "", href: null }] })} aspect="aspect-[3/1]" />}
          </Grupo>
        </>
      );
    case "vantagens":
      return (
        <>
          <Grupo titulo="Formato">
            <Escolha
              label="Estilo"
              value={secao.estilo}
              onChange={(estilo) => onChange({ ...secao, estilo })}
              options={[
                { value: "cartoes", label: "Cartões" },
                { value: "linha", label: "Em linha" },
              ]}
            />
          </Grupo>
          <Grupo titulo="Itens">
            <Itens
              itens={secao.itens}
              onChange={(itens) => onChange({ ...secao, itens })}
              max={LIMITES.vantagens}
              nomeItem="Vantagem"
              novo={() => ({ icone: "check" as IconeKey, titulo: "Nova vantagem", texto: "" })}
              rotulo={(i) => i.titulo}
              render={(item, setItem) => (
                <>
                  <div>
                    <p className="mb-1.5 text-[13px] font-bold">Ícone</p>
                    <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Ícone">
                      {(Object.keys(ICONES) as IconeKey[]).map((key) => {
                        const Icon = ICON_COMPONENT[key];
                        return (
                          <button key={key} type="button" role="radio" aria-checked={item.icone === key} aria-label={ICONES[key]} title={ICONES[key]} onClick={() => setItem({ ...item, icone: key })} className={cx("grid h-10 place-items-center rounded-control border", item.icone === key ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink")}>
                            <Icon className="size-5" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <Texto label="Título" value={item.titulo} onChange={(titulo) => setItem({ ...item, titulo })} max={50} />
                  <Texto label="Texto" value={item.texto} onChange={(texto) => setItem({ ...item, texto })} max={90} />
                </>
              )}
            />
          </Grupo>
        </>
      );
    case "categorias":
      return (
        <Grupo titulo="Categorias">
          <Texto label="Título" value={secao.titulo} onChange={(titulo) => onChange({ ...secao, titulo })} max={LIMITES.titulo} hint="Em branco, a seção fica sem título." />
          <Escolha
            label="Estilo"
            value={secao.estilo}
            onChange={(estilo) => onChange({ ...secao, estilo })}
            options={[
              { value: "cartoes", label: "Cartões" },
              { value: "circulos", label: "Círculos" },
              { value: "pilulas", label: "Etiquetas" },
            ]}
          />
          <Escolha
            label="Quantas mostrar"
            value={secao.quantidade}
            onChange={(quantidade) => onChange({ ...secao, quantidade })}
            options={[
              { value: 6, label: "Até 6" },
              { value: 12, label: "Até 12" },
            ]}
          />
          <p className="text-[12px] text-muted">A ordem vem de Dados da loja (categorias em destaque primeiro).</p>
        </Grupo>
      );
    case "produtos": {
      const set = (patch: Partial<typeof secao>) => onChange({ ...secao, ...patch });
      return (
        <>
          <Grupo titulo="Quais produtos">
            <Escolha
              label="Mostrar"
              value={secao.fonte}
              onChange={(fonte) => set({ fonte })}
              columns={2}
              options={[
                { value: "destaques", label: "Destaques" },
                { value: "novidades", label: "Novidades" },
                { value: "categoria", label: "Uma categoria" },
                { value: "escolhidos", label: "Escolher um a um" },
              ]}
            />
            {secao.fonte === "destaques" && <p className="text-[12px] text-muted">Os produtos marcados com estrela em Produtos e margens vêm primeiro.</p>}
            {secao.fonte === "novidades" && <p className="text-[12px] text-muted">Os últimos produtos que você ativou na loja.</p>}
            {secao.fonte === "categoria" && (
              <Lista
                label="Categoria"
                value={secao.categoria ?? ""}
                onChange={(categoria) => set({ categoria: categoria || null })}
                options={[{ value: "", label: "Escolha…" }, ...ctx.categorias.map((c) => ({ value: c.slug, label: c.name }))]}
              />
            )}
            {secao.fonte === "escolhidos" && <ProdutosEscolhidos secao={secao} set={(s) => onChange(s)} ctx={ctx} />}
            <Escolha
              label="Quantos mostrar"
              value={secao.quantidade}
              onChange={(quantidade) => set({ quantidade })}
              options={[
                { value: 4, label: "4" },
                { value: 8, label: "8" },
                { value: 12, label: "12" },
              ]}
            />
          </Grupo>
          <Grupo titulo="Textos">
            <Texto label="Título" value={secao.titulo} onChange={(titulo) => set({ titulo })} max={LIMITES.titulo} />
            <Texto label="Subtítulo" value={secao.subtitulo} onChange={(subtitulo) => set({ subtitulo })} max={140} />
            <Chave label="Botão “Ver todos”" checked={secao.verTodos} onChange={(verTodos) => set({ verTodos })} />
          </Grupo>
        </>
      );
    }
    case "chamada": {
      const set = (patch: Partial<typeof secao>) => onChange({ ...secao, ...patch });
      return (
        <>
          <Grupo titulo="Textos">
            <Texto label="Título" value={secao.titulo} onChange={(titulo) => set({ titulo })} max={LIMITES.titulo} />
            <Texto label="Texto" value={secao.texto} onChange={(texto) => set({ texto })} max={LIMITES.texto} multiline />
          </Grupo>
          <Grupo titulo="Botão">
            <Escolha
              label="Ao clicar"
              value={secao.acao}
              onChange={(acao) => set({ acao })}
              options={[
                { value: "whatsapp", label: "Abre o WhatsApp" },
                { value: "link", label: "Abre uma página" },
              ]}
            />
            {secao.acao === "whatsapp" && !ctx.temWhatsapp && <p className="text-[12px] font-semibold text-coral-700">Cadastre o WhatsApp em Dados da loja para o botão aparecer.</p>}
            {secao.acao === "link" && <Lista label="Página" value={secao.link} onChange={(link) => set({ link })} options={linkOptions(ctx, secao.link)} />}
            <Texto label="Texto do botão" value={secao.botao} onChange={(botao) => set({ botao })} max={LIMITES.botao} />
          </Grupo>
          <Grupo titulo="Fundo">
            <Escolha
              label="Cor da faixa"
              value={secao.fundo}
              onChange={(fundo) => set({ fundo })}
              options={[
                { value: "cor", label: "Cor da marca" },
                { value: "escuro", label: "Escuro" },
                { value: "suave", label: "Tom claro" },
              ]}
            />
          </Grupo>
        </>
      );
    }
    case "texto": {
      const set = (patch: Partial<typeof secao>) => onChange({ ...secao, ...patch });
      return (
        <>
          <Grupo titulo="Textos">
            <Texto label="Título" value={secao.titulo} onChange={(titulo) => set({ titulo })} max={LIMITES.titulo} />
            <Texto label="Texto" value={secao.texto} onChange={(texto) => set({ texto })} max={LIMITES.textoLongo} multiline rows={7} hint="Em branco, usa o texto de Dados da loja." />
            <Chave label="Botão “Conhecer a loja”" checked={secao.botaoSobre} onChange={(botaoSobre) => set({ botaoSobre })} />
          </Grupo>
          <Grupo titulo="Imagem e alinhamento">
            <CampoImagem label="Foto (opcional)" value={secao.imagem} onChange={(imagem) => set({ imagem })} hint="Com foto, o texto fica ao lado." aspect="aspect-[4/3]" />
            {!secao.imagem && (
              <Escolha
                label="Alinhamento"
                value={secao.alinhamento}
                onChange={(alinhamento) => set({ alinhamento })}
                options={[
                  { value: "esquerda", label: "À esquerda" },
                  { value: "centro", label: "Centralizado" },
                ]}
              />
            )}
          </Grupo>
        </>
      );
    }
    case "depoimentos":
      return (
        <>
          <Grupo titulo="Título">
            <Texto label="Título" value={secao.titulo} onChange={(titulo) => onChange({ ...secao, titulo })} max={LIMITES.titulo} />
            <p className="text-[12px] text-muted">Os depoimentos de exemplo são fictícios: troque pelos de clientes de verdade.</p>
          </Grupo>
          <Grupo titulo="Depoimentos">
            <Itens
              itens={secao.itens}
              onChange={(itens) => onChange({ ...secao, itens })}
              max={LIMITES.depoimentos}
              nomeItem="Depoimento"
              novo={() => ({ nome: "", local: "", texto: "" })}
              rotulo={(i) => i.nome}
              render={(item, setItem) => (
                <>
                  <Texto label="Nome" value={item.nome} onChange={(nome) => setItem({ ...item, nome })} max={LIMITES.nome} />
                  <Texto label="Cidade (opcional)" value={item.local} onChange={(local) => setItem({ ...item, local })} max={LIMITES.nome} />
                  <Texto label="O que a pessoa disse" value={item.texto} onChange={(texto) => setItem({ ...item, texto })} max={400} multiline />
                </>
              )}
            />
          </Grupo>
        </>
      );
    case "perguntas":
      return (
        <>
          <Grupo titulo="Título">
            <Texto label="Título" value={secao.titulo} onChange={(titulo) => onChange({ ...secao, titulo })} max={LIMITES.titulo} />
          </Grupo>
          <Grupo titulo="Perguntas">
            <Itens
              itens={secao.itens}
              onChange={(itens) => onChange({ ...secao, itens })}
              max={LIMITES.perguntas}
              nomeItem="Pergunta"
              novo={() => ({ pergunta: "", resposta: "" })}
              rotulo={(i) => i.pergunta}
              render={(item, setItem) => (
                <>
                  <Texto label="Pergunta" value={item.pergunta} onChange={(pergunta) => setItem({ ...item, pergunta })} max={160} />
                  <Texto label="Resposta" value={item.resposta} onChange={(resposta) => setItem({ ...item, resposta })} max={800} multiline rows={4} />
                </>
              )}
            />
          </Grupo>
        </>
      );
  }
}
