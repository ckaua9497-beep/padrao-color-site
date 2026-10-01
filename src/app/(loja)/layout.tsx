import SiteHeader, { type MenuGroup } from "@/components/header/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import WhatsAppFloat from "@/components/WhatsAppFloat";
import CartDrawer from "@/components/cart/CartDrawer";
import { CATALOG_STATS, MENU_GROUPS, getCategory } from "@/lib/catalog";

export default function LojaLayout({ children }: { children: React.ReactNode }) {
  const menu: MenuGroup[] = MENU_GROUPS.map((group) => ({
    label: group.label,
    blurb: group.blurb,
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
      <SiteHeader menu={menu} announcements={announcements} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <WhatsAppFloat />
      <CartDrawer />
    </>
  );
}
