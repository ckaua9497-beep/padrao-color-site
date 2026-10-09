import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import CartDrawer from "@/components/cart/CartDrawer";
import { IconWhatsApp } from "@/components/icons";
import VitrineFooter from "@/components/vitrine/VitrineFooter";
import PageTracker from "@/components/PageTracker";
import RefTracker from "@/components/vitrine/RefTracker";
import VitrineHeader from "@/components/vitrine/VitrineHeader";
import { temaAttrs, temaCss } from "@/components/vitrine/loja/estilo";
import { formatPhone, whatsappLink } from "@/lib/multiloja/core";
import type { Tema } from "@/lib/multiloja/tema";
import { lojaCategorias, lojaDoHost, lojaItens } from "@/lib/multiloja/tenant";

/*
 * Vitrine de uma loja da multiloja. O cliente acessa <loja>.<domínio>/…; o proxy reescreve para
 * /vitrine/<host>/…. O tema publicado no "Personalizar loja" (cor, fontes, cantos, cabeçalho, rodapé) vale para
 * todas as páginas da loja; a cor troca as variáveis do coral (botões, preço) na página inteira.
 */

export async function generateMetadata(props: LayoutProps<"/vitrine/[host]">): Promise<Metadata> {
  const { host } = await props.params;
  const loja = await lojaDoHost(host);
  if (!loja) return {};
  const description = loja.slogan || loja.sobre.slice(0, 160) || `${loja.nome}: produtos personalizados com prévia em 3D.`;
  return {
    title: { absolute: loja.nome, template: `%s | ${loja.nome}` },
    description,
    openGraph: { siteName: loja.nome, locale: "pt_BR", type: "website", ...(shareImage(loja.tema) ? { images: [{ url: shareImage(loja.tema) as string }] } : {}) },
    ...(loja.tema.marca.logo ? { icons: { icon: loja.tema.marca.logo, apple: loja.tema.marca.logo } } : {}),
  };
}

/** Imagem de compartilhamento: o primeiro banner ou a imagem do destaque principal. */
function shareImage(tema: Tema): string | null {
  for (const s of tema.secoes) {
    if (!s.visivel) continue;
    if (s.tipo === "banners" && s.slides[0]) return s.slides[0].src;
    if (s.tipo === "hero" && s.imagem) return s.imagem;
  }
  return null;
}

export default async function VitrineLayout(props: LayoutProps<"/vitrine/[host]">) {
  const { host } = await props.params;
  const loja = await lojaDoHost(host);
  if (!loja) notFound();

  const categories = lojaCategorias(await lojaItens(loja.id, loja.margemPadrao), loja.categoriasDestaque).map(({ slug, name }) => ({ slug, name }));
  const whatsapp = loja.whatsapp ? whatsappLink(loja.whatsapp, `Olá! Vim pela loja ${loja.nome}.`) : null;
  const tema = loja.tema;

  return (
    <div className="loja-tema flex flex-1 flex-col" {...temaAttrs(tema)}>
      {/* Tema da loja: as variáveis valem também para o carrinho e diálogos, que abrem fora desta árvore. */}
      <style>{temaCss(tema)}</style>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:font-bold focus:text-white"
      >
        Pular para o conteúdo
      </a>
      <Suspense>
        <VitrineHeader
          name={loja.nome}
          logo={tema.marca.logo}
          whatsapp={whatsapp}
          categories={categories}
          estilo={tema.cabecalho.estilo}
          aviso={tema.cabecalho.aviso}
          busca={tema.cabecalho.busca}
          mostrarCategorias={tema.cabecalho.categorias}
        />
      </Suspense>
      <main id="conteudo" tabIndex={-1} className="flex-1 outline-none">
        {props.children}
      </main>
      <VitrineFooter
        name={loja.nome}
        year={new Date(loja.atualizadoEm.replace(" ", "T") + "Z").getFullYear() || 2026}
        about={loja.sobre}
        whatsapp={loja.whatsapp && whatsapp ? { href: whatsapp, label: formatPhone(loja.whatsapp) } : null}
        phone={loja.telefone ? formatPhone(loja.telefone) : null}
        email={loja.emailContato}
        socials={loja.redes}
        estilo={tema.rodape.estilo}
      />
      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          aria-label={`Falar com ${loja.nome} no WhatsApp`}
          className="fixed bottom-5 left-5 z-float grid size-14 place-items-center rounded-full bg-whatsapp text-white shadow-float transition-transform duration-300 hover:scale-110"
        >
          <IconWhatsApp aria-hidden className="size-8" />
        </a>
      )}
      <CartDrawer />
      <RefTracker />
      <PageTracker />
    </div>
  );
}
