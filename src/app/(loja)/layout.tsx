import SiteHeader, { type MenuGroup } from "@/components/header/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import WhatsAppFloat from "@/components/WhatsAppFloat";
import CartDrawer from "@/components/cart/CartDrawer";
import PageTracker from "@/components/PageTracker";
import { getCategory } from "@/lib/catalog";
import { MENU_GROUPS } from "@/lib/menu";
import { categoriaComMidia } from "@/lib/midia";
import { midiaDoSite } from "@/lib/midia-servidor";

export default async function LojaLayout({ children }: { children: React.ReactNode }) {
  // Imagens de categoria trocadas no admin (admin → Site → Imagens) também no menu.
  const midia = await midiaDoSite();
  const menu: MenuGroup[] = MENU_GROUPS.map((group) => ({
    label: group.label,
    blurb: group.blurb,
    benefits: [...group.benefits],
    more: "more" in group ? group.more : undefined,
    categories: group.categories
      .map((slug) => getCategory(slug))
      .filter((c) => c !== undefined)
      .map((c) => categoriaComMidia(c, midia))
      .map((c) => ({ slug: c.slug, name: c.name, count: c.count, image: c.image, minLeadDays: c.minLeadDays })),
  }));

  return (
    <>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:font-bold focus:text-white"
      >
        Pular para o conteúdo
      </a>
      <SiteHeader menu={menu} />
      <main id="conteudo" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <SiteFooter />
      <WhatsAppFloat />
      <CartDrawer />
      <PageTracker />
    </>
  );
}
