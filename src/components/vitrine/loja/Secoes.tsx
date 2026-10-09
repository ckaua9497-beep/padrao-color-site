import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import ProductCard from "@/components/ProductCard";
import Rail from "@/components/Rail";
import { IconCheck, IconClock, IconCube, IconGift, IconLayers, IconShield, IconStorefront, IconTruck, IconWhatsApp } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { cx } from "@/components/ui/cx";
import { imageUrl, spectrumAt } from "@/lib/format";
import { produtosDaSecao, type IconeKey, type Secao, type SecaoBanners, type SecaoCategorias, type SecaoChamada, type SecaoDepoimentos, type SecaoHero, type SecaoPerguntas, type SecaoProdutos, type SecaoTexto, type SecaoVantagens, type Tema } from "@/lib/multiloja/tema";
import type { VitrineDados } from "@/lib/multiloja/vitrine";

/*
 * Seções da página inicial da loja, desenhadas a partir do tema. O mesmo código desenha a loja de verdade (no
 * servidor) e a prévia do editor (no navegador): por isso nada aqui busca dados, tudo vem em `dados`.
 * Na prévia (`preview`), seção sem conteúdo mostra um aviso do que falta; na loja, ela some.
 */

type Ctx = { tema: Tema; dados: VitrineDados; preview: boolean; primeira: boolean };

const ICONS: Record<IconeKey, typeof IconCube> = {
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

/** Fundo das faixas: claro (texto escuro) ou escuro (texto branco; a cor usa o tom escuro da paleta, AA). */
const BAND = {
  suave: { root: "bg-coral-50 text-ink", sub: "text-ink/75", eyebrow: "text-coral-700", dark: false },
  branco: { root: "bg-white text-ink", sub: "text-ink/75", eyebrow: "text-coral-700", dark: false },
  cor: { root: "bg-coral-700 text-white", sub: "text-white/90", eyebrow: "text-white/85", dark: true },
  escuro: { root: "bg-ink text-white", sub: "text-white/80", eyebrow: "text-coral", dark: true },
} as const;

const outlineOnDark = "inline-flex h-13 items-center justify-center rounded-full border border-white/70 px-7 text-button font-bold text-white transition-colors hover:bg-white hover:text-ink";

function Aviso({ children }: { children: ReactNode }) {
  return (
    <div className="container-site py-6">
      <p className="rounded-card border-2 border-dashed border-line-strong bg-white/70 px-5 py-8 text-center text-[15px] font-semibold text-muted">{children}</p>
    </div>
  );
}

function Titulo({ primeira, className, children }: { primeira: boolean; className: string; children: ReactNode }) {
  return primeira ? <h1 className={className}>{children}</h1> : <h2 className={className}>{children}</h2>;
}

// ---------------------------------------------------------------------------------- destaque principal

function Hero({ secao, dados, primeira }: Ctx & { secao: SecaoHero }) {
  const useImageBg = secao.layout === "fundo" && Boolean(secao.imagem);
  const band = useImageBg ? BAND.escuro : BAND[secao.fundo];
  const collage = dados.produtos.slice(0, 3);
  const secondary =
    secao.botao2 === "whatsapp" && dados.whatsapp ? (
      band.dark ? (
        <a href={dados.whatsapp} target="_blank" rel="noreferrer" className={outlineOnDark}>
          Falar no WhatsApp
        </a>
      ) : (
        <Button href={dados.whatsapp} variant="outline" size="md" target="_blank" rel="noreferrer">
          Falar no WhatsApp
        </Button>
      )
    ) : secao.botao2 === "sobre" ? (
      band.dark ? (
        <Link href="/sobre" className={outlineOnDark}>
          Conhecer a loja
        </Link>
      ) : (
        <Button href="/sobre" variant="outline" size="md">
          Conhecer a loja
        </Button>
      )
    ) : null;

  const content = (
    <div className={cx("relative max-w-2xl", secao.layout !== "esquerda" && "mx-auto text-center")}>
      {secao.selo && <p className={cx("text-sm font-bold uppercase tracking-[0.2em]", band.eyebrow)}>{secao.selo}</p>}
      <Titulo primeira={primeira} className="mt-3 text-display text-balance">
        {secao.titulo || dados.nome}
      </Titulo>
      {secao.texto && <p className={cx("mt-4 whitespace-pre-line text-lead", band.sub)}>{secao.texto}</p>}
      <div className={cx("mt-8 flex flex-wrap gap-3", secao.layout !== "esquerda" && "justify-center")}>
        {secao.botao && (
          <Button href={secao.link} variant={band.dark ? "light" : "buy"} size="md">
            {secao.botao}
          </Button>
        )}
        {secondary}
      </div>
    </div>
  );

  return (
    <section className={cx("relative overflow-hidden", band.root)}>
      {useImageBg && (
        <>
          <Image src={secao.imagem as string} alt="" fill unoptimized priority={primeira} className="object-cover" />
          <div aria-hidden className="absolute inset-0 bg-ink/60" />
        </>
      )}
      <div className={cx("container-site relative", useImageBg ? "py-24 md:py-36" : "py-14 md:py-20")}>
        {secao.layout === "esquerda" ? (
          <div className="grid items-center gap-10 md:grid-cols-[1.1fr_1fr]">
            {content}
            {secao.imagem ? (
              <Image src={secao.imagem} alt="" width={960} height={720} unoptimized priority={primeira} className="aspect-[4/3] w-full rounded-panel object-cover" />
            ) : collage.length > 0 ? (
              <div aria-hidden className="grid grid-cols-2 gap-3">
                {collage.map((p, i) => (
                  <div key={p.slug} className={cx("relative overflow-hidden rounded-panel", i === 0 ? "row-span-2 aspect-[3/4]" : "aspect-square")} style={{ background: spectrumAt(i).soft }}>
                    <Image src={imageUrl(p.image)} alt="" fill sizes="(max-width: 768px) 45vw, 25vw" className="object-contain p-5" />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <>
            {content}
            {secao.layout === "centro" && secao.imagem && <Image src={secao.imagem} alt="" width={1600} height={686} unoptimized className="mx-auto mt-12 aspect-[21/9] w-full max-w-5xl rounded-panel object-cover" />}
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------- banners

function Banners({ secao, preview, primeira }: Ctx & { secao: SecaoBanners }) {
  if (!secao.slides.length) return preview ? <Aviso>Carrossel sem imagens: adicione até 5 banners no editor.</Aviso> : null;
  const ratio = secao.altura === "baixa" ? "aspect-[4/1] max-md:aspect-[2/1]" : secao.altura === "alta" ? "aspect-[2/1] max-md:aspect-[4/5]" : "aspect-[3/1] max-md:aspect-[16/9]";
  return (
    <section aria-label="Destaques da loja" className="container-site pt-6">
      <Rail label="Banners" arrows={secao.slides.length > 1 ? "overlay" : "none"} dots={secao.slides.length > 1} autoplay={secao.slides.length > 1 && !preview ? 6000 : undefined} itemClassName="w-full">
        {secao.slides.map((slide, i) => {
          const img = <Image src={slide.src} alt={slide.alt} width={1920} height={640} unoptimized priority={primeira && i === 0} className={cx("w-full rounded-panel object-cover", ratio)} />;
          return slide.href ? (
            <Link key={slide.src} href={slide.href} className="block">
              {img}
            </Link>
          ) : (
            <div key={slide.src}>{img}</div>
          );
        })}
      </Rail>
    </section>
  );
}

// ---------------------------------------------------------------------------------- vantagens

function Vantagens({ secao }: Ctx & { secao: SecaoVantagens }) {
  if (!secao.itens.length) return null;
  const cols = secao.itens.length === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : secao.itens.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3";
  if (secao.estilo === "linha") {
    return (
      <section aria-label="Vantagens" className="container-site py-10">
        <ul className={cx("grid gap-6 border-y border-line py-8", cols)}>
          {secao.itens.map((item, i) => {
            const Icon = ICONS[item.icone];
            return (
              <li key={i} className="flex flex-col items-center gap-2 text-center">
                <Icon aria-hidden className="size-7 text-coral-700" />
                <span className="text-[16px] font-bold">{item.titulo}</span>
                {item.texto && <span className="text-caption text-muted">{item.texto}</span>}
              </li>
            );
          })}
        </ul>
      </section>
    );
  }
  return (
    <section aria-label="Vantagens" className="container-site pt-8">
      <ul className={cx("grid gap-3", cols)}>
        {secao.itens.map((item, i) => {
          const Icon = ICONS[item.icone];
          return (
            <li key={i} className="flex items-center gap-3 rounded-card bg-white p-4 shadow-card">
              <span className="grid size-11 shrink-0 place-items-center rounded-full" style={{ background: spectrumAt(i + 1).soft }}>
                <Icon aria-hidden className="size-5" />
              </span>
              <span className="text-caption leading-tight">
                <span className="block text-[15px] font-bold">{item.titulo}</span>
                {item.texto}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------------- categorias

function Categorias({ secao, dados, preview }: Ctx & { secao: SecaoCategorias }) {
  const cats = dados.categorias.slice(0, secao.quantidade);
  if (!cats.length) return preview ? <Aviso>As categorias aparecem aqui quando a loja tiver produtos ativos.</Aviso> : null;
  const heading = secao.titulo ? <SectionHeading title={secao.titulo} /> : null;
  if (secao.estilo === "pilulas") {
    return (
      <section className="container-site py-12">
        {heading}
        <ul className="mt-6 flex flex-wrap gap-2">
          {cats.map((c) => (
            <li key={c.slug}>
              <Link href={`/produtos?categoria=${c.slug}`} className="inline-flex h-11 items-center gap-2 rounded-full border border-line-strong bg-white px-5 text-[15px] font-bold transition-colors hover:border-ink">
                {c.name} <span className="text-caption font-semibold text-muted">{c.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  if (secao.estilo === "circulos") {
    return (
      <section className="container-site py-12">
        {heading}
        <ul className="mt-6 flex gap-5 overflow-x-auto pb-2 [scrollbar-width:none] md:flex-wrap md:justify-center md:gap-8">
          {cats.map((c, i) => (
            <li key={c.slug} className="shrink-0">
              <Link href={`/produtos?categoria=${c.slug}`} className="group flex w-24 flex-col items-center gap-2 text-center md:w-28">
                <span className="grid size-24 place-items-center overflow-hidden rounded-full ring-2 ring-transparent transition-shadow group-hover:ring-coral md:size-28" style={{ background: spectrumAt(i).soft }}>
                  {c.image && <Image src={imageUrl(c.image)} alt="" width={96} height={96} className="size-16 object-contain md:size-20" />}
                </span>
                <span className="text-[14px] font-bold leading-tight">{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return (
    <section className="container-site py-12">
      {heading}
      <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cats.map((c, i) => (
          <li key={c.slug}>
            <Link href={`/produtos?categoria=${c.slug}`} className="group flex h-full flex-col items-center gap-3 rounded-card p-4 text-center transition-shadow hover:shadow-card" style={{ background: spectrumAt(i).soft }}>
              {c.image && <Image src={imageUrl(c.image)} alt="" width={120} height={120} className="aspect-square w-20 object-contain transition-transform duration-400 group-hover:scale-105 motion-reduce:transition-none" />}
              <span className="text-[15px] font-bold leading-tight">{c.name}</span>
              <span className="text-caption text-muted">
                {c.count} {c.count === 1 ? "produto" : "produtos"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------------- vitrine de produtos

function Produtos({ secao, dados, tema, preview }: Ctx & { secao: SecaoProdutos }) {
  const list = produtosDaSecao(secao, dados.produtos);
  if (!list.length) {
    if (!preview) return null;
    const why = secao.fonte === "categoria" && !secao.categoria ? "Escolha a categoria desta vitrine no editor." : secao.fonte === "escolhidos" ? "Escolha os produtos desta vitrine no editor." : "Ative produtos no painel para eles aparecerem aqui.";
    return <Aviso>{why}</Aviso>;
  }
  const href = secao.fonte === "categoria" && secao.categoria ? `/produtos?categoria=${secao.categoria}` : "/produtos";
  const colorful = tema.estilo.cards === "sombra";
  return (
    <section className="container-site py-12 md:py-14">
      {(secao.titulo || secao.subtitulo) && <SectionHeading title={secao.titulo} subtitle={secao.subtitulo || undefined} action={secao.verTodos ? { href, label: "Ver todos" } : undefined} />}
      <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
        {list.map((p, i) => (
          <li key={p.slug}>
            <ProductCard product={p} tone={colorful ? spectrumAt(i).soft : "var(--color-mist)"} priority={i < 4} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------------- chamada

function Chamada({ secao, dados, preview }: Ctx & { secao: SecaoChamada }) {
  const band = BAND[secao.fundo];
  const href = secao.acao === "whatsapp" ? dados.whatsapp : secao.link;
  const button =
    href && secao.botao ? (
      secao.acao === "whatsapp" ? (
        band.dark ? (
          <a href={href} target="_blank" rel="noreferrer" className="inline-flex h-13 items-center gap-2 rounded-full bg-white px-7 text-button font-bold text-ink transition-colors hover:bg-mist">
            <IconWhatsApp aria-hidden className="size-5" /> {secao.botao}
          </a>
        ) : (
          <Button href={href} size="md" target="_blank" rel="noreferrer" icon={<IconWhatsApp aria-hidden className="size-5" />}>
            {secao.botao}
          </Button>
        )
      ) : (
        <Button href={href} variant={band.dark ? "light" : "buy"} size="md">
          {secao.botao}
        </Button>
      )
    ) : null;
  return (
    <section className="container-site py-10">
      <div className={cx("flex flex-col items-start gap-6 rounded-panel px-6 py-10 md:flex-row md:items-center md:justify-between md:px-12", band.root)}>
        <div className="max-w-2xl">
          <h2 className="text-title text-balance">{secao.titulo}</h2>
          {secao.texto && <p className={cx("mt-2 whitespace-pre-line text-body", band.sub)}>{secao.texto}</p>}
          {preview && secao.acao === "whatsapp" && !dados.whatsapp && <p className={cx("mt-2 text-caption font-semibold", band.sub)}>Cadastre o WhatsApp em Dados da loja para o botão aparecer.</p>}
        </div>
        {button}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------- texto e imagem

function Texto({ secao, dados }: Ctx & { secao: SecaoTexto }) {
  const centered = secao.alinhamento === "centro" && !secao.imagem;
  const body = (
    <div className={cx(centered && "mx-auto max-w-3xl text-center")}>
      {secao.titulo && <h2 className="text-title">{secao.titulo}</h2>}
      <p className="mt-3 whitespace-pre-line text-body leading-relaxed text-ink/80">{secao.texto || dados.sobre}</p>
      {secao.botaoSobre && (
        <div className="mt-6">
          <Button href="/sobre" variant="outline" size="sm">
            Conhecer a loja
          </Button>
        </div>
      )}
    </div>
  );
  return (
    <section className="bg-white/60 py-14">
      <div className="container-site">
        {secao.imagem ? (
          <div className="grid items-center gap-10 md:grid-cols-2">
            <Image src={secao.imagem} alt="" width={960} height={720} unoptimized className="aspect-[4/3] w-full rounded-panel object-cover" />
            {body}
          </div>
        ) : (
          body
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------- depoimentos

function Depoimentos({ secao }: Ctx & { secao: SecaoDepoimentos }) {
  if (!secao.itens.length) return null;
  return (
    <section className="container-site py-12 md:py-14">
      {secao.titulo && <SectionHeading title={secao.titulo} />}
      <ul className="mt-6 grid gap-4 md:grid-cols-3">
        {secao.itens.map((item, i) => (
          <li key={i} className="flex flex-col rounded-card bg-white p-6 shadow-card">
            <span aria-hidden className="font-titulo text-5xl leading-none text-coral">“</span>
            <p className="mt-2 flex-1 whitespace-pre-line text-[15px] leading-relaxed text-ink/85">{item.texto}</p>
            <p className="mt-5 text-[15px] font-bold">
              {item.nome}
              {item.local && <span className="block text-caption font-normal text-muted">{item.local}</span>}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------------- perguntas

function Perguntas({ secao }: Ctx & { secao: SecaoPerguntas }) {
  if (!secao.itens.length) return null;
  return (
    <section className="container-site max-w-4xl py-12 md:py-14">
      {secao.titulo && <SectionHeading title={secao.titulo} />}
      <div className="mt-6 divide-y divide-line rounded-card bg-white px-5 shadow-card">
        {secao.itens.map((item, i) => (
          <details key={i} className="group py-1">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[16px] font-bold [&::-webkit-details-marker]:hidden">
              {item.pergunta}
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-mist text-lg transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="whitespace-pre-line pb-5 text-[15px] leading-relaxed text-ink/80">{item.resposta}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------- página inicial

function Bloco(props: Ctx & { secao: Secao }) {
  switch (props.secao.tipo) {
    case "hero":
      return <Hero {...props} secao={props.secao} />;
    case "banners":
      return <Banners {...props} secao={props.secao} />;
    case "vantagens":
      return <Vantagens {...props} secao={props.secao} />;
    case "categorias":
      return <Categorias {...props} secao={props.secao} />;
    case "produtos":
      return <Produtos {...props} secao={props.secao} />;
    case "chamada":
      return <Chamada {...props} secao={props.secao} />;
    case "texto":
      return <Texto {...props} secao={props.secao} />;
    case "depoimentos":
      return <Depoimentos {...props} secao={props.secao} />;
    case "perguntas":
      return <Perguntas {...props} secao={props.secao} />;
  }
}

/** Seções visíveis do tema, na ordem. A primeira, se for o destaque principal, leva o título (h1) da página. */
export default function SecoesLoja({ tema, dados, preview = false }: { tema: Tema; dados: VitrineDados; preview?: boolean }) {
  const visible = tema.secoes.filter((s) => s.visivel);
  const heroFirst = visible[0]?.tipo === "hero";
  return (
    <>
      {!heroFirst && <h1 className="sr-only">{dados.nome}</h1>}
      {visible.length === 0 && preview && <Aviso>Nenhuma seção visível. Adicione uma seção no editor.</Aviso>}
      {visible.map((secao, i) => (
        <div key={secao.id} data-secao={secao.id} className="scroll-mt-28">
          <Bloco secao={secao} tema={tema} dados={dados} preview={preview} primeira={i === 0 && heroFirst} />
        </div>
      ))}
    </>
  );
}
