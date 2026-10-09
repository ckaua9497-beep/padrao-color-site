import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductCard from "@/components/ProductCard";
import { cx } from "@/components/ui/cx";
import { normalize } from "@/lib/catalog";
import { spectrumAt } from "@/lib/format";
import { lojaCategorias, lojaDoHost, lojaItens, lojaSummary } from "@/lib/multiloja/tenant";

type Search = { q?: string | string[]; categoria?: string | string[]; ordem?: string | string[] };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

const ORDERS = {
  relevancia: "Destaques",
  "menor-preco": "Menor preço",
  "maior-preco": "Maior preço",
  nome: "Nome (A–Z)",
} as const;
type Order = keyof typeof ORDERS;

export async function generateMetadata(props: PageProps<"/vitrine/[host]/produtos">): Promise<Metadata> {
  const search = (await props.searchParams) as Search;
  const q = one(search.q).trim();
  return { title: q ? `Busca: ${q}` : "Produtos" };
}

export default async function VitrineProdutos(props: PageProps<"/vitrine/[host]/produtos">) {
  const { host } = await props.params;
  const search = (await props.searchParams) as Search;
  const loja = lojaDoHost(host);
  if (!loja) notFound();

  const q = one(search.q).trim().slice(0, 80);
  const categoria = one(search.categoria);
  const ordemRaw = one(search.ordem);
  const ordem: Order = ordemRaw in ORDERS ? (ordemRaw as Order) : "relevancia";

  const items = lojaItens(loja.id, loja.margemPadrao);
  const categories = lojaCategorias(items, loja.categoriasDestaque);
  const words = normalize(q).split(" ").filter(Boolean);

  let list = items.filter(({ product }) => {
    if (categoria && product.categorySlug !== categoria) return false;
    if (!words.length) return true;
    const haystack = normalize(`${product.name} ${product.category} ${(product.tags ?? []).join(" ")}`);
    return words.every((w) => haystack.includes(w));
  });
  if (ordem === "relevancia") list = [...list.filter((i) => i.featured), ...list.filter((i) => !i.featured)];
  const products = list.map(lojaSummary);
  if (ordem === "menor-preco") products.sort((a, b) => a.price - b.price);
  if (ordem === "maior-preco") products.sort((a, b) => b.price - a.price);
  if (ordem === "nome") products.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const current = categories.find((c) => c.slug === categoria);
  const title = q ? `Resultados para “${q}”` : (current?.name ?? "Todos os produtos");
  const href = (patch: Partial<Record<"q" | "categoria" | "ordem", string>>) => {
    const params = new URLSearchParams();
    const next = { q, categoria, ordem: ordem === "relevancia" ? "" : ordem, ...patch };
    for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
    const query = params.toString();
    return `/produtos${query ? `?${query}` : ""}`;
  };

  return (
    <div className="container-site py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-title">{title}</h1>
          <p className="mt-1 text-muted">
            {products.length} {products.length === 1 ? "produto" : "produtos"}
          </p>
        </div>
        <form action="/produtos" className="flex items-center gap-2">
          {q && <input type="hidden" name="q" value={q} />}
          {categoria && <input type="hidden" name="categoria" value={categoria} />}
          <label htmlFor="ordem" className="text-sm font-bold">
            Ordenar
          </label>
          <select id="ordem" name="ordem" defaultValue={ordem} className="h-11 rounded-full border border-line bg-white px-4 text-[15px]">
            {(Object.keys(ORDERS) as Order[]).map((key) => (
              <option key={key} value={key}>
                {ORDERS[key]}
              </option>
            ))}
          </select>
          <button type="submit" className="h-11 rounded-full bg-ink px-5 text-[15px] font-bold text-white hover:bg-coral-700">
            Aplicar
          </button>
        </form>
      </div>

      {/* Busca no celular (no computador ela fica no topo). */}
      <form action="/produtos" role="search" className="mt-6 md:hidden">
        <label htmlFor="busca-mobile" className="sr-only">
          Buscar produtos
        </label>
        <input id="busca-mobile" name="q" type="search" defaultValue={q} placeholder="Buscar produtos" className="h-12 w-full rounded-full border border-line bg-mist px-5 text-body" />
      </form>

      {categories.length > 1 && (
        <ul className="mt-6 hidden flex-wrap gap-2 md:flex" aria-label="Filtrar por categoria">
          <li>
            <Link href={href({ categoria: "" })} aria-current={!categoria ? "page" : undefined} className={cx("inline-flex h-10 items-center rounded-full border px-4 text-[15px] font-semibold", !categoria ? "border-ink bg-ink text-white" : "border-line hover:border-ink")}>
              Todas
            </Link>
          </li>
          {categories.map((c) => (
            <li key={c.slug}>
              <Link
                href={href({ categoria: c.slug })}
                aria-current={categoria === c.slug ? "page" : undefined}
                className={cx("inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[15px] font-semibold", categoria === c.slug ? "border-ink bg-ink text-white" : "border-line hover:border-ink")}
              >
                {c.name} <span className={cx("text-caption", categoria === c.slug ? "text-white/70" : "text-muted")}>{c.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {products.length === 0 ? (
        <div className="mt-12 rounded-panel bg-mist px-6 py-16 text-center">
          <p className="text-lg font-bold">Nenhum produto encontrado.</p>
          <p className="mt-2 text-muted">Tente outra palavra ou veja todas as categorias.</p>
          <Link href="/produtos" className="mt-6 inline-block font-bold underline underline-offset-4">
            Ver todos os produtos
          </Link>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
          {products.map((p, i) => (
            <li key={p.slug}>
              <ProductCard product={p} tone={spectrumAt(i).soft} priority={i < 4} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
