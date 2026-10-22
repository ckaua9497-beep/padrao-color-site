"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { ativarProdutos, definirMargem, desativarProdutos, marcarDestaque, type ProdutosResult } from "@/app/(painel)/painel/actions";
import { FotoProduto } from "@/components/FotoProduto";
import { cx } from "@/components/ui/cx";
import { formatBRL, quantityLabel } from "@/lib/format";
import { MARGIN_MAX, MARGIN_MIN, marginError, normalizeText as normalize, parseMargin, salePrice } from "@/lib/multiloja/core";

/*
 * Lista de produtos do painel: busca, filtro por categoria e status, seleção em lote (ativar, desativar,
 * margem) e edição da margem por produto. Os dados vêm do servidor a cada ação (refresh), então a tela mostra
 * sempre o que está gravado.
 */

export type ManagerRow = {
  id: string;
  name: string;
  category: string;
  categorySlug: string;
  image: string;
  base: number;
  qty: number;
  perM2: boolean;
  active: boolean;
  /** Margem própria; null = margem padrão da loja. */
  margin: number | null;
  featured: boolean;
};

type Status = "todos" | "ativos" | "inativos";
const PAGE = 40;

export default function ProductManager({ rows, defaultMargin, maxActive, planName }: { rows: ManagerRow[]; defaultMargin: number; maxActive: number | null; planName: string }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<Status>("todos");
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMargin, setBulkMargin] = useState("");
  const [result, setResult] = useState<ProdutosResult | null>(null);
  const [pending, startTransition] = useTransition();

  const activeCount = rows.filter((r) => r.active).length;
  const categories = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const r of rows) map.set(r.categorySlug, { name: r.category, count: (map.get(r.categorySlug)?.count ?? 0) + 1 });
    return [...map.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, "pt-BR"));
  }, [rows]);

  const filtered = useMemo(() => {
    const words = normalize(deferredQuery).split(" ").filter(Boolean);
    return rows.filter((r) => {
      if (category && r.categorySlug !== category) return false;
      if (status === "ativos" && !r.active) return false;
      if (status === "inativos" && r.active) return false;
      if (!words.length) return true;
      const haystack = normalize(`${r.name} ${r.category}`);
      return words.every((w) => haystack.includes(w));
    });
  }, [rows, deferredQuery, category, status]);

  const visible = filtered.slice(0, limit);
  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  const run = (action: () => Promise<ProdutosResult>, clearSelection = false) =>
    startTransition(async () => {
      const res = await action();
      setResult(res);
      if (res.ok && clearSelection) setSelected(new Set());
    });

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const ids = [...selected];
  const bulkMarginValue = parseMargin(bulkMargin);
  const bulkMarginProblem = bulkMargin ? marginError(bulkMarginValue) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Ativos na loja" value={maxActive === null ? String(activeCount) : `${activeCount} / ${maxActive}`} hint={`Plano ${planName}`} />
        <Stat label="Margem padrão" value={`${defaultMargin}%`} hint="Muda em Dados da loja" />
        <Stat label="No catálogo" value={String(rows.length)} hint="produtos da Padrão Color" />
      </div>

      <div className="space-y-3 rounded-panel bg-white p-4 shadow-card md:sticky md:top-0 md:z-float">
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <div>
            <label htmlFor="busca-produtos" className="sr-only">
              Buscar produtos
            </label>
            <input
              id="busca-produtos"
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
              placeholder="Buscar produto"
              className="h-11 w-full rounded-full border border-line bg-mist px-5 text-[15px] focus:border-ink focus:bg-white"
            />
          </div>
          <div>
            <label htmlFor="filtro-categoria" className="sr-only">
              Categoria
            </label>
            <select
              id="filtro-categoria"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setLimit(PAGE);
              }}
              className="h-11 w-full rounded-full border border-line bg-white px-4 text-[15px]"
            >
              <option value="">Todas as categorias</option>
              {categories.map(([slug, c]) => (
                <option key={slug} value={slug}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
          </div>
          <div role="radiogroup" aria-label="Status" className="flex rounded-full bg-mist p-1">
            {(["todos", "ativos", "inativos"] as Status[]).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={status === s}
                onClick={() => {
                  setStatus(s);
                  setLimit(PAGE);
                }}
                className={cx("h-9 flex-1 rounded-full px-4 text-[14px] font-bold capitalize", status === s ? "bg-ink text-white" : "hover:bg-white")}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <label className="mr-2 flex items-center gap-2 text-[14px] font-semibold">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={() => setSelected(allFilteredSelected ? new Set() : new Set(filtered.map((r) => r.id)))}
              className="size-4 accent-ink"
            />
            Selecionar os {filtered.length} da lista
          </label>
          {selected.size > 0 && (
            <>
              <span className="rounded-full bg-ink px-3 py-1 text-[13px] font-bold text-white">{selected.size} selecionados</span>
              <BulkButton disabled={pending} onClick={() => run(() => ativarProdutos(ids), true)}>
                Ativar
              </BulkButton>
              <BulkButton disabled={pending} onClick={() => run(() => desativarProdutos(ids), true)}>
                Desativar
              </BulkButton>
              <span className="flex items-center gap-1">
                <label htmlFor="margem-lote" className="sr-only">
                  Margem para os selecionados (%)
                </label>
                <input
                  id="margem-lote"
                  inputMode="decimal"
                  value={bulkMargin}
                  onChange={(e) => setBulkMargin(e.target.value)}
                  placeholder="Margem %"
                  aria-invalid={bulkMarginProblem ? true : undefined}
                  className={cx("h-9 w-28 rounded-full border px-3 text-[14px]", bulkMarginProblem ? "border-coral-700" : "border-line")}
                />
                <BulkButton disabled={pending || !bulkMargin || Boolean(bulkMarginProblem)} onClick={() => run(() => definirMargem(ids, bulkMarginValue))}>
                  Aplicar margem
                </BulkButton>
              </span>
              <BulkButton disabled={pending} onClick={() => run(() => definirMargem(ids, null))}>
                Usar margem padrão
              </BulkButton>
              <button type="button" onClick={() => setSelected(new Set())} className="text-[14px] font-semibold text-muted underline underline-offset-2 hover:text-ink">
                Limpar seleção
              </button>
            </>
          )}
        </div>
        {bulkMarginProblem && <p className="text-caption font-semibold text-coral-700">{bulkMarginProblem}</p>}
        <p role="status" aria-live="polite" className={cx("text-[14px] font-semibold", !result && "sr-only", result?.ok === false ? "text-coral-700" : "text-ink")}>
          {pending ? "Salvando…" : (result?.message ?? "")}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-panel bg-white p-10 text-center text-muted shadow-card">Nenhum produto com esses filtros.</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((row) => (
            <ProductRow key={row.id} row={row} defaultMargin={defaultMargin} checked={selected.has(row.id)} onCheck={() => toggle(row.id)} pending={pending} run={run} />
          ))}
        </ul>
      )}

      {filtered.length > visible.length && (
        <div className="text-center">
          <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="h-11 rounded-full border border-line-strong bg-white px-6 text-[15px] font-bold hover:border-ink">
            Mostrar mais ({filtered.length - visible.length} restantes)
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-panel bg-white p-3 shadow-card sm:p-4">
      <p className="text-caption font-semibold leading-tight text-muted">{label}</p>
      <p className="text-xl font-black tabular-nums sm:text-2xl">{value}</p>
      <p className="text-caption leading-tight text-muted max-sm:hidden">{hint}</p>
    </div>
  );
}

function BulkButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="h-9 rounded-full border border-line-strong bg-white px-4 text-[14px] font-bold hover:border-ink disabled:opacity-50">
      {children}
    </button>
  );
}

function ProductRow({
  row,
  defaultMargin,
  checked,
  onCheck,
  pending,
  run,
}: {
  row: ManagerRow;
  defaultMargin: number;
  checked: boolean;
  onCheck: () => void;
  pending: boolean;
  run: (action: () => Promise<ProdutosResult>) => void;
}) {
  const margin = row.margin ?? defaultMargin;
  const [draft, setDraft] = useState(String(margin));
  const [editedFor, setEditedFor] = useState(margin);
  // O servidor mudou a margem (ação em lote): o campo volta ao valor gravado.
  if (editedFor !== margin) {
    setEditedFor(margin);
    setDraft(String(margin));
  }
  const draftValue = parseMargin(draft);
  const problem = marginError(draftValue);
  const price = salePrice(row.base, problem ? margin : draftValue);
  const unit = row.perM2 ? "por m²" : quantityLabel(row.qty);

  const saveMargin = () => {
    if (problem || draftValue === margin) return;
    run(() => definirMargem([row.id], draftValue === defaultMargin ? null : draftValue));
  };

  const toggleActive = () => run(() => (row.active ? desativarProdutos([row.id]) : ativarProdutos([row.id])));

  return (
    <li className="rounded-panel bg-white p-3 shadow-card md:p-4">
      <div className="flex items-center gap-3">
        <input type="checkbox" checked={checked} onChange={onCheck} aria-label={`Selecionar ${row.name}`} className="size-4 shrink-0 accent-ink" />
        <span className="relative size-14 shrink-0 overflow-hidden rounded-thumb bg-mist">
          <FotoProduto src={row.image} alt="" sizes="56px" respiro="p-1" estudio="cobrir" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-bold leading-snug">{row.name}</p>
          <p className="text-caption text-muted">
            {row.category}
            {row.active && row.margin === null && " · margem padrão"}
          </p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[14px] font-bold">
          <span className="max-sm:sr-only">{row.active ? "Ativo" : "Inativo"}</span>
          <input type="checkbox" role="switch" checked={row.active} disabled={pending} onChange={toggleActive} aria-label={`${row.active ? "Desativar" : "Ativar"} ${row.name}`} className="peer sr-only" />
          <span aria-hidden className={cx("relative h-6 w-11 rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink", row.active ? "bg-ink" : "bg-line-strong")}>
            <span className={cx("absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left]", row.active ? "left-[22px]" : "left-0.5")} />
          </span>
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 items-end gap-3 border-t border-line pt-3 sm:grid-cols-[1fr_140px_1fr_auto]">
        <div className="text-[14px]">
          <p className="text-caption text-muted">Preço base</p>
          <p className="tabular-nums">
            {formatBRL(row.base)} <span className="text-caption text-muted">{unit}</span>
          </p>
        </div>

        {row.active ? (
          <div>
            <label htmlFor={`margem-${row.id}`} className="text-caption text-muted">
              Margem (%)
            </label>
            <input
              id={`margem-${row.id}`}
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={saveMargin}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveMargin();
              }}
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? `margem-${row.id}-erro` : undefined}
              className={cx("h-9 w-full rounded-control border px-3 text-[15px] tabular-nums", problem ? "border-coral-700" : "border-line")}
            />
            {problem && (
              <p id={`margem-${row.id}-erro`} className="mt-1 text-[12px] font-semibold text-coral-700">
                Entre {MARGIN_MIN}% e {MARGIN_MAX}%
              </p>
            )}
          </div>
        ) : (
          <p className="text-caption text-muted">Margem padrão ao ativar: {defaultMargin}%</p>
        )}

        <div className="text-[14px]">
          <p className="text-caption text-muted">Preço na loja</p>
          <p className="font-bold tabular-nums">
            {formatBRL(price)} <span className="font-normal text-muted">· lucro {formatBRL(price - row.base)}</span>
          </p>
        </div>

        <div className="justify-self-end">
          {row.active ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => marcarDestaque(row.id, !row.featured))}
              aria-pressed={row.featured}
              className={cx("h-9 rounded-full px-4 text-[13px] font-bold", row.featured ? "bg-ink text-white" : "border border-line hover:border-ink")}
            >
              {row.featured ? "★ Em destaque" : "☆ Destacar"}
            </button>
          ) : (
            <button type="button" disabled={pending} onClick={toggleActive} className="h-9 rounded-full bg-ink px-4 text-[13px] font-bold text-white hover:bg-coral-700 disabled:opacity-50">
              Ativar
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
