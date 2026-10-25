import { catalogoEstatico, type CatalogView } from "@/lib/catalog";
import type { ListingNav } from "./Listing";

// Navegações laterais das listagens (montadas no servidor: o catálogo não vai para o navegador). `catalogo`: o vivo
// (src/lib/catalogo-vivo.ts) que a página já leu; sem ele, o do sync.

export function categoryNav(activeSlug?: string, catalogo: CatalogView = catalogoEstatico): ListingNav {
  return {
    title: "Categorias",
    all: { href: "/produtos", label: "Todos os produtos" },
    items: catalogo.getCategories().map((c) => ({ href: `/categoria/${c.slug}`, label: c.name, count: c.count })),
    active: activeSlug ? `/categoria/${activeSlug}` : undefined,
  };
}

export function businessNav(activeSlug?: string, catalogo: CatalogView = catalogoEstatico): ListingNav {
  return {
    title: "Para o seu negócio",
    all: { href: "/negocios", label: "Todos os negócios" },
    items: catalogo.getBusinessTypes().map((t) => ({ href: `/negocios/${t.slug}`, label: t.name, count: t.groupIds.length })),
    active: activeSlug ? `/negocios/${activeSlug}` : undefined,
  };
}
