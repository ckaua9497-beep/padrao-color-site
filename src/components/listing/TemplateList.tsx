"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { IconSearch } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { imageUrl } from "@/lib/format";

export type TemplateItem = {
  id: string;
  slug: string;
  name: string;
  category: string;
  categorySlug: string;
  image: string;
  /** Medidas do gabarito ("5 cm × 5 cm · sangria 2 mm · segurança 4 mm", "3 tamanhos: …"); null quando não há dado. */
  facts?: string | null;
  /** Extensão do arquivo (zip, rar, pdf). */
  ext: string;
};

const PAGE = 48;

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/** Lista da página /gabaritos: busca por nome, filtro por categoria e download pela rota /api/gabarito/[id]. */
export default function TemplateList({ items }: { items: TemplateItem[] }) {
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const categories = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const item of items) {
      const entry = counts.get(item.categorySlug) ?? { name: item.category, count: 0 };
      entry.count += 1;
      counts.set(item.categorySlug, entry);
    }
    return [...counts.entries()].map(([slug, v]) => ({ slug, ...v })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [items]);

  const filtered = useMemo(() => {
    const words = normalize(term).split(/\s+/).filter(Boolean);
    return items.filter((item) => (!category || item.categorySlug === category) && words.every((w) => normalize(`${item.name} ${item.category}`).includes(w)));
  }, [items, term, category]);

  return (
    <div>
      <div className="flex flex-col gap-3 rounded-card bg-mist p-4 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="mb-1.5 block text-sm font-bold">Buscar gabarito</span>
          <span className="flex h-12 items-center gap-2 rounded-control border border-line-strong bg-white px-3 focus-within:border-ink">
            <IconSearch aria-hidden className="size-5 text-muted" />
            <input
              type="search"
              value={term}
              onChange={(event) => {
                setTerm(event.target.value);
                setLimit(PAGE);
              }}
              placeholder="Ex.: banner, camisa, cartão de visita"
              className="h-full w-full bg-transparent text-[15px] placeholder:text-muted focus-visible:outline-none"
            />
          </span>
        </label>
        <label className="sm:w-72">
          <span className="mb-1.5 block text-sm font-bold">Categoria</span>
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setLimit(PAGE);
            }}
            className="h-12 w-full rounded-control border border-line-strong bg-white px-3 text-[15px] focus:border-ink"
          >
            <option value="">Todas as categorias ({items.length})</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name} ({c.count})
              </option>
            ))}
          </select>
        </label>
      </div>

      <p role="status" className="mb-4 mt-6 text-[15px] text-ink/75">
        {filtered.length} {filtered.length === 1 ? "gabarito" : "gabaritos"}
        {term.trim() ? ` para “${term.trim()}”` : ""}
      </p>

      {filtered.length === 0 ? (
        <p className="rounded-card bg-mist p-10 text-center text-ink/75">Nenhum gabarito encontrado. Tente outro nome ou escolha “Todas as categorias”.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.slice(0, limit).map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-card bg-white p-3 shadow-card">
              <span className="relative size-16 shrink-0 overflow-hidden rounded-thumb bg-mist">
                <Image src={imageUrl(item.image)} alt="" fill sizes="64px" className="object-contain p-1" />
              </span>
              <span className="min-w-0 flex-1">
                <Link href={`/produto/${item.slug}`} className="line-clamp-2 text-[15px] font-semibold leading-snug underline-offset-2 hover:underline">
                  {item.name}
                </Link>
                {item.facts && <span className="block text-caption tabular-nums text-muted">{item.facts}</span>}
                <span className="block text-caption text-muted">{item.category}</span>
              </span>
              <a
                href={`/api/gabarito/${encodeURIComponent(item.id)}`}
                download
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-bold text-white transition-colors hover:bg-coral-700"
                aria-label={`Baixar gabarito de ${item.name} (.${item.ext})`}
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" />
                </svg>
                .{item.ext}
              </a>
            </li>
          ))}
        </ul>
      )}

      {limit < filtered.length && (
        <div className="mt-8 flex justify-center">
          <Button variant="dark" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
            Carregar mais ({filtered.length - limit} restantes)
          </Button>
        </div>
      )}
    </div>
  );
}
