"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import ProductCard from "@/components/ProductCard";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import type { ProductSummary } from "@/lib/catalog";
import { spectrumAt } from "@/lib/format";

/** Navegação lateral da listagem: categorias (catálogo) ou tipos de negócio. */
export type ListingNav = {
  title: string;
  all: { href: string; label: string };
  items: { href: string; label: string; count: number }[];
  /** href do item atual; ausente = "todos". */
  active?: string;
};

const SORTS = {
  padrao: "Ordenação padrão",
  menor: "Menor preço",
  maior: "Maior preço",
  prazo: "Menor prazo",
  nome: "Nome (A–Z)",
} as const;

type SortKey = keyof typeof SORTS;

/**
 * "auto": aberta no desktop e recolhida no celular, resolvido por CSS (sem salto na hidratação).
 * Depois do primeiro clique vale a escolha da pessoa.
 */
type FiltersState = "auto" | "open" | "closed";

const PAGE = 24;

export default function Listing({ products, nav }: { products: ProductSummary[]; nav: ListingNav }) {
  const [filters, setFilters] = useState<FiltersState>("auto");
  const [sort, setSort] = useState<SortKey>("padrao");
  const [limit, setLimit] = useState(PAGE);
  const desktop = useMediaQuery("(min-width: 64rem)");
  const expanded = filters === "open" || (filters === "auto" && desktop);
  const sidebarOnDesktop = filters !== "closed";

  const sorted = useMemo(() => {
    const list = [...products];
    if (sort === "menor") list.sort((a, b) => a.price - b.price);
    if (sort === "maior") list.sort((a, b) => b.price - a.price);
    if (sort === "prazo") list.sort((a, b) => (a.leadDays ?? 99) - (b.leadDays ?? 99));
    if (sort === "nome") list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return list;
  }, [products, sort]);

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="filtros"
          onClick={() => setFilters(expanded ? "closed" : "open")}
          className="flex h-11 items-center gap-2.5 rounded-control bg-mist px-4 text-[15px] font-semibold transition-colors hover:bg-fog"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
            <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
            <circle cx="16" cy="7" r="2" />
            <circle cx="10" cy="17" r="2" />
          </svg>
          {filters === "auto" ? (
            <>
              <span className="lg:hidden">Mostrar filtros</span>
              <span className="hidden lg:inline">Esconder filtros</span>
            </>
          ) : filters === "open" ? (
            "Esconder filtros"
          ) : (
            "Mostrar filtros"
          )}
        </button>
        <div className="flex items-center gap-4">
          <p className="text-[15px] text-ink/75" role="status">
            {products.length} {products.length === 1 ? "produto" : "produtos"}
          </p>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Ordenar produtos"
            className="h-11 rounded-control border border-line-strong bg-white px-3 text-[15px] focus:border-ink"
          >
            {Object.entries(SORTS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={cx("grid gap-8", sidebarOnDesktop && "lg:grid-cols-[230px_1fr]")}>
        <aside id="filtros" aria-label="Filtros" className={cx("animate-fade-up", filters === "closed" && "hidden", filters === "auto" && "hidden lg:block")}>
          <p className="mb-4 text-caption font-semibold uppercase tracking-widest text-muted">{nav.title}</p>
          <ul className="space-y-1">
            <li>
              <Link
                href={nav.all.href}
                aria-current={!nav.active ? "page" : undefined}
                className={cx("block rounded-thumb px-3 py-1.5 text-[15px] transition-colors", !nav.active ? "bg-ink font-semibold text-white" : "hover:bg-mist")}
              >
                {nav.all.label}
              </Link>
            </li>
            {nav.items.map((item) => {
              const active = nav.active === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cx("flex items-center justify-between gap-3 rounded-thumb px-3 py-1.5 text-[15px] transition-colors", active ? "bg-ink font-semibold text-white" : "hover:bg-mist")}
                  >
                    {item.label}
                    <span className={cx("text-micro", active ? "text-white/75" : "text-muted")}>{item.count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>

        <div>
          {sorted.length === 0 ? (
            <p className="rounded-card bg-mist p-10 text-center text-ink/75">Nenhum produto encontrado.</p>
          ) : (
            <ul className={cx("grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-5", !sidebarOnDesktop && "xl:grid-cols-4")}>
              {sorted.slice(0, limit).map((p, i) => (
                <li key={p.slug} className="animate-fade-up" style={{ animationDelay: `${(i % PAGE) * 25}ms` }}>
                  <ProductCard product={p} tone={spectrumAt(i).soft} priority={i < 6} />
                </li>
              ))}
            </ul>
          )}
          {limit < sorted.length && (
            <div className="mt-10 flex justify-center">
              <Button variant="dark" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                Carregar mais ({sorted.length - limit} restantes)
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
