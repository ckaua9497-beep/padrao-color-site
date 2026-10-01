import SiteHeader, { type MenuGroup } from "@/components/header/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import WhatsAppFloat from "@/components/WhatsAppFloat";
import CartDrawer from "@/components/cart/CartDrawer";
import { CATALOG_STATS, getCategory } from "@/lib/catalog";
import { MENU_GROUPS } from "@/lib/menu";

export default function LojaLayout({ children }: { children: React.ReactNode }) {
  const menu: MenuGroup[] = MENU_GROUPS.map((group) => ({
    label: group.label,
    blurb: group.blurb,
    benefits: [...group.benefits],
    categories: group.categories
      .map((slug) => getCategory(slug))
      .filter((c) => c !== undefined)
      .map((c) => ({ slug: c.slug, name: c.name, count: c.count, image: c.image, minLeadDays: c.minLeadDays })),
  }));

  const announcements = [
    "Veja seu produto em 3D antes de imprimir",
    `${CATALOG_STATS.products} produtos para a sua marca`,
    `Produção a partir de ${CATALOG_STATS.minLeadDays} ${CATALOG_STATS.minLeadDays === 1 ? "dia útil" : "dias úteis"}`,
    "Atendimento de segunda a sexta, das 8h às 18h",
    "Seja um revendedor Padrão Color",
  ];

  return (
    <>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:font-bold focus:text-white"
      >
        Pular para o conteúdo
      </a>
      <SiteHeader menu={menu} announcements={announcements} />
      <main id="conteudo" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <SiteFooter />
      <WhatsAppFloat />
      <CartDrawer />
    </>
  );
}
