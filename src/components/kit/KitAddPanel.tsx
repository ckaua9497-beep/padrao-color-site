"use client";

import { useId, useMemo, useState } from "react";
import { IconCheck, IconPlus, IconSearch } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { formatBRL } from "@/lib/format";
import { searchCatalog, searchedKitItem, type KitItem, type KitPlan, type SearchEntry } from "@/lib/kit-builder";
import type { PartyProduct } from "@/lib/party";
import { FotoProduto } from "@/components/FotoProduto";

/** Índice leve da busca do topo, baixado uma vez quando o cliente abre a busca. */
let indexRequest: Promise<SearchEntry[]> | null = null;

function loadIndex(): Promise<SearchEntry[]> {
  indexRequest ??= fetch("/produtos/indice.json", { headers: { Accept: "application/json" } })
    .then((response) => (response.ok ? (response.json() as Promise<SearchEntry[]>) : []))
    .catch(() => {
      indexRequest = null;
      return [];
    });
  return indexRequest;
}

type Props = {
  /** Sugestões do objetivo que ainda não estão no kit, com o valor por kit. */
  suggestions: { item: KitItem; plan: KitPlan }[];
  /** Slugs dos produtos que já estão no kit. */
  inKit: ReadonlySet<string>;
  onAdd: (item: KitItem) => void;
};

/** "Adicionar ao kit": as outras sugestões do objetivo ou qualquer produto do catálogo pela busca. */
export function KitAddPanel({ suggestions, inKit, onAdd }: Props) {
  const id = useId();
  const [tab, setTab] = useState<"sugestoes" | "busca">(suggestions.length ? "sugestoes" : "busca");
  const [index, setIndex] = useState<SearchEntry[] | null>(null);
  const [term, setTerm] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const results = useMemo(() => (index ? searchCatalog(index, term) : []), [index, term]);

  const openSearch = () => {
    if (!index) loadIndex().then(setIndex);
  };

  const addEntry = async (entry: SearchEntry) => {
    setAdding(entry.s);
    setMessage(null);
    try {
      const response = await fetch(`/api/kit/produto?slug=${encodeURIComponent(entry.s)}`, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { product: PartyProduct; category: string };
      onAdd(searchedKitItem(data.product, data.category));
      setMessage(`${entry.n} entrou no kit.`);
    } catch {
      setMessage(`Não deu para adicionar “${entry.n}” agora. Tente de novo.`);
    } finally {
      setAdding(null);
    }
  };

  return (
    <div>
      <SegmentedControl
        label="Como adicionar"
        value={tab}
        onChange={(value) => {
          setTab(value);
          if (value === "busca") openSearch();
        }}
        options={[
          { value: "sugestoes", label: `Sugestões (${suggestions.length})` },
          {
            value: "busca",
            label: (
              <>
                <IconSearch className="size-4" /> Buscar no catálogo
              </>
            ),
          },
        ]}
      />

      {tab === "sugestoes" ? (
        suggestions.length ? (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {suggestions.map(({ item, plan }) => (
              <li key={item.key} className="flex items-center gap-3 rounded-card bg-white p-3 ring-1 ring-line">
                <div className="relative size-14 shrink-0 overflow-hidden rounded-control bg-mist">
                  <FotoProduto src={item.product.image} alt="" sizes="56px" respiro="p-1" estudio="cobrir" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-bold leading-snug">{item.title}</p>
                  <p className="text-caption text-muted tabular-nums">{plan.error ? plan.error : `${formatBRL(plan.perKit)} por kit`}</p>
                </div>
                <Button variant="outline" size="sm" disabled={Boolean(plan.error)} icon={<IconPlus className="size-4" />} onClick={() => onAdd(item)}>
                  Adicionar<span className="sr-only"> {item.title}</span>
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted">Todas as sugestões já estão no kit. Busque no catálogo para incluir outros produtos.</p>
        )
      ) : (
        <div className="mt-4">
          <label htmlFor={`${id}-busca`} className="mb-1.5 block text-sm font-semibold">
            Buscar produto
          </label>
          <div className="relative">
            <IconSearch aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
            <input
              id={`${id}-busca`}
              type="search"
              value={term}
              onFocus={openSearch}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Ex.: caneca, mochila, adesivo, camiseta"
              autoComplete="off"
              className="h-12 w-full rounded-control border border-line-strong bg-white pl-10 pr-3 text-[15px] placeholder:text-muted focus:border-ink"
            />
          </div>
          <p aria-live="polite" className="mt-2 text-caption text-muted">
            {message ??
              (!index
                ? "Busque por qualquer produto da loja."
                : term.trim().length < 2
                  ? "Digite pelo menos duas letras."
                  : results.length
                    ? `${results.length} ${results.length === 1 ? "produto encontrado" : "produtos encontrados"}.`
                    : "Nenhum produto com esse nome. Tente outra palavra.")}
          </p>
          {results.length > 0 && (
            <ul className="mt-3 grid gap-2">
              {results.map((entry) => {
                const already = inKit.has(entry.s);
                return (
                  <li key={entry.s} className="flex items-center gap-3 rounded-card bg-white p-3 ring-1 ring-line">
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-control bg-mist">
                      <FotoProduto src={entry.i} alt="" sizes="48px" respiro="p-1" estudio="cobrir" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{entry.n}</p>
                      <p className="truncate text-caption text-muted tabular-nums">
                        {entry.c} · a partir de {formatBRL(entry.p)}
                        {entry.m ? " o m²" : entry.q > 1 ? ` por ${entry.q.toLocaleString("pt-BR")} un.` : ""}
                      </p>
                    </div>
                    {already ? (
                      <span className="inline-flex h-9 items-center gap-1 px-2 text-sm font-semibold text-ink/70">
                        <IconCheck className="size-4" strokeWidth={2.4} /> No kit
                      </span>
                    ) : (
                      <Button variant="outline" size="sm" loading={adding === entry.s} disabled={adding !== null} icon={<IconPlus className="size-4" />} onClick={() => addEntry(entry)}>
                        Adicionar<span className="sr-only"> {entry.n}</span>
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
