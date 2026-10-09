import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import CartDrawer from "@/components/cart/CartDrawer";
import { IconWhatsApp } from "@/components/icons";
import VitrineFooter from "@/components/vitrine/VitrineFooter";
import RefTracker from "@/components/vitrine/RefTracker";
import VitrineHeader from "@/components/vitrine/VitrineHeader";
import { formatPhone, paletteVars, whatsappLink } from "@/lib/multiloja/core";
import { lojaCategorias, lojaDoHost, lojaItens } from "@/lib/multiloja/tenant";

/*
 * Vitrine de uma loja da multiloja. O cliente acessa <loja>.<domínio>/…; o proxy reescreve para
 * /vitrine/<host>/…. A cor da loja troca as variáveis do coral (botões, preço) na página inteira.
 */

export async function generateMetadata(props: LayoutProps<"/vitrine/[host]">): Promise<Metadata> {
  const { host } = await props.params;
  const loja = lojaDoHost(host);
  if (!loja) return {};
  const description = loja.slogan || loja.sobre.slice(0, 160) || `${loja.nome}: produtos personalizados com prévia em 3D.`;
  return {
    title: { absolute: loja.nome, template: `%s | ${loja.nome}` },
    description,
    openGraph: { siteName: loja.nome, locale: "pt_BR", type: "website", ...(loja.banners[0] ? { images: [{ url: loja.banners[0].src }] } : {}) },
    ...(loja.logo ? { icons: { icon: loja.logo, apple: loja.logo } } : {}),
  };
}

export default async function VitrineLayout(props: LayoutProps<"/vitrine/[host]">) {
  const { host } = await props.params;
  const loja = lojaDoHost(host);
  if (!loja) notFound();

  const categories = lojaCategorias(lojaItens(loja.id, loja.margemPadrao), loja.categoriasDestaque).map(({ slug, name }) => ({ slug, name }));
  const whatsapp = loja.whatsapp ? whatsappLink(loja.whatsapp, `Olá! Vim pela loja ${loja.nome}.`) : null;
  const vars = Object.entries(paletteVars(loja.paleta))
    .map(([name, value]) => `${name}:${value}`)
    .join(";");

  return (
    <>
      {/* Cor da loja: vale também para o carrinho e diálogos, que abrem fora desta árvore. */}
      <style>{`:root{${vars}}`}</style>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:font-bold focus:text-white"
      >
        Pular para o conteúdo
      </a>
      <Suspense>
        <VitrineHeader name={loja.nome} logo={loja.logo} whatsapp={whatsapp} categories={categories} />
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
    </>
  );
}
