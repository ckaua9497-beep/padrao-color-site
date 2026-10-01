"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import ProductCard from "@/components/ProductCard";
import type { ProductSummary } from "@/lib/catalog";
import { spectrumAt } from "@/lib/format";

type SidebarCategory = { slug: string; name: string; count: number };

const SORTS = {
  padrao: "Ordenação padrão",
  menor: "Menor preço",
  maior: "Maior preço",
  prazo: "Menor prazo",
  nome: "Nome (A–Z)",
} as const;

type SortKey = keyof typeof SORTS;

const PAGE = 24;

export default function Listing({ products, categories, activeSlug }: { products: ProductSummary[]; categories: SidebarCategory[]; activeSlug?: string }) {
  const [showFilters, setShowFilters] = useState(true);
  const [sort, setSort] = useState<SortKey>("padrao");
  const [limit, setLimit] = useState(PAGE);

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
        <button type="button" onClick={() => setShowFilters((v) => !v)} className="flex items-center gap-2.5 rounded-control bg-mist px-4 py-2.5 text-[15px] font-semibold transition-colors hover:bg-fog">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
            <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
            <circle cx="16" cy="7" r="2" />
            <circle cx="10" cy="17" r="2" />
          </svg>
          {showFilters ? "Esconder filtros" : "Mostrar filtros"}
        </button>
        <div className="flex items-center gap-4">
          <p className="text-[15px] text-ink/75" role="status">
            {products.length} {products.length === 1 ? "produto" : "produtos"}
          </p>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Ordenar produtos"
            className="h-11 rounded-control border border-line-strong bg-white px-3 text-[15px] outline-none focus:border-ink"
          >
            {Object.entries(SORTS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={`grid gap-8 ${showFilters ? "lg:grid-cols-[230px_1fr]" : ""}`}>
        {showFilters && (
          <aside className="animate-fade-up">
            <p className="mb-4 text-[13px] font-semibold uppercase tracking-widest text-muted">Categorias</p>
            <ul className="space-y-1">
              <li>
                <Link href="/produtos" className={`block rounded-[10px] px-3 py-1.5 text-[15px] transition-colors ${!activeSlug ? "bg-ink font-semibold text-white" : "hover:bg-mist"}`}>
                  Todos os produtos
                </Link>
              </li>
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/categoria/${c.slug}`}
                    className={`flex items-center justify-between rounded-[10px] px-3 py-1.5 text-[15px] transition-colors ${activeSlug === c.slug ? "bg-ink font-semibold text-white" : "hover:bg-mist"}`}
                  >
                    {c.name}
                    <span className={`text-[12px] ${activeSlug === c.slug ? "text-white/70" : "text-muted"}`}>{c.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <div>
          {sorted.length === 0 ? (
            <p className="rounded-card bg-mist p-10 text-center text-ink/75">Nenhum produto encontrado.</p>
          ) : (
            <ul className={`grid grid-cols-2 gap-4 md:gap-5 ${showFilters ? "md:grid-cols-3" : "md:grid-cols-3 xl:grid-cols-4"}`}>
              {sorted.slice(0, limit).map((p, i) => (
                <li key={p.slug} className="animate-fade-up" style={{ animationDelay: `${(i % PAGE) * 25}ms` }}>
                  <ProductCard product={p} tone={spectrumAt(i).soft} priority={i < 6} />
                </li>
              ))}
            </ul>
          )}
          {limit < sorted.length && (
            <div className="mt-10 flex justify-center">
              <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="h-12 rounded-full bg-ink px-8 text-sm font-bold text-white transition-colors hover:bg-coral">
                Carregar mais ({sorted.length - limit} restantes)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
