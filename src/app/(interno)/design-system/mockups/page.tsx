import type { Metadata } from "next";
import Link from "next/link";
import MockupInspector from "@/components/design-system/MockupInspector";
import { getProduct, getProducts } from "@/lib/catalog";
import { mockupSpec, type KindSource } from "@/lib/mockup";
import { KIND_INFO, MOCKUP_KINDS, type MockupKind } from "@/lib/mockup-kinds";

export const metadata: Metadata = { title: "Galeria de mockups 3D" };

const SOURCES: { value: KindSource; label: string }[] = [
  { value: "name", label: "Regra de nome" },
  { value: "category", label: "Padrão da categoria" },
  { value: "override", label: "Override" },
  { value: "fallback", label: "Fallback" },
];

type Query = { kind?: string; source?: string; p?: string };

function href(query: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `/design-system/mockups?${text}` : "/design-system/mockups";
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MockupsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const kind = first(raw.kind) as MockupKind | undefined;
  const source = first(raw.source) as KindSource | undefined;

  const rows = getProducts().map((p) => {
    const spec = mockupSpec(p, {});
    return { slug: p.slug, name: p.name, category: p.category, kind: spec.kind, source: spec.source, blank: spec.blank, variant: spec.variant };
  });
  const counts = new Map<MockupKind, number>();
  for (const row of rows) counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);

  const visible = rows.filter((r) => (!kind || r.kind === kind) && (!source || r.source === source));
  const selected = getProduct(first(raw.p) ?? visible[0]?.slug ?? "");

  return (
    <div className="container-site py-10">
      <h1 className="text-section font-bold">Galeria de mockups 3D</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Cada produto do catálogo com o tipo de mockup resolvido. Selecione um produto para ver o modelo com as opções dele. Só um
        visualizador fica aberto por vez.
      </p>

      <nav aria-label="Filtrar por tipo" className="mt-6 flex flex-wrap gap-1.5">
        <Link href={href({ source })} className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${!kind ? "bg-ink text-white" : "bg-mist"}`}>
          Todos ({rows.length})
        </Link>
        {MOCKUP_KINDS.filter((k) => counts.has(k)).map((k) => (
          <Link
            key={k}
            href={href({ kind: k, source })}
            className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${kind === k ? "bg-ink text-white" : "bg-mist hover:bg-fog"}`}
          >
            {KIND_INFO[k].label} ({counts.get(k)})
          </Link>
        ))}
      </nav>
      <nav aria-label="Filtrar por origem" className="mt-2 flex flex-wrap gap-1.5">
        <Link href={href({ kind })} className={`rounded-full px-3 py-1.5 text-[13px] ${!source ? "bg-ink text-white" : "bg-mist"}`}>
          Qualquer origem
        </Link>
        {SOURCES.map((s) => (
          <Link
            key={s.value}
            href={href({ kind, source: s.value })}
            className={`rounded-full px-3 py-1.5 text-[13px] ${source === s.value ? "bg-ink text-white" : "bg-mist hover:bg-fog"}`}
          >
            {s.label} ({rows.filter((r) => r.source === s.value).length})
          </Link>
        ))}
      </nav>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-label="Produto selecionado" className="lg:sticky lg:top-6 lg:self-start">
          {selected ? (
            <>
              <h2 className="mb-3 text-xl font-bold">{selected.name}</h2>
              <MockupInspector
                key={selected.slug}
                product={{ slug: selected.slug, name: selected.name, categorySlug: selected.categorySlug, image: selected.image, options: selected.options }}
              />
            </>
          ) : (
            <p className="text-muted">Nenhum produto com esses filtros.</p>
          )}
        </section>

        <section aria-label="Produtos">
          <p className="mb-3 text-sm text-muted">{visible.length} produtos</p>
          <table className="w-full text-left text-[14px]">
            <thead className="border-b border-line text-[12px] uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2 pr-3 font-semibold">Produto</th>
                <th className="py-2 pr-3 font-semibold">Tipo</th>
                <th className="py-2 font-semibold">Origem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((row) => (
                <tr key={row.slug} className={row.slug === selected?.slug ? "bg-mist" : undefined}>
                  <td className="py-2 pr-3">
                    <Link href={href({ kind, source, p: row.slug })} className="font-semibold hover:underline">
                      {row.name}
                    </Link>
                    <span className="block text-[12px] text-muted">{row.category}</span>
                  </td>
                  <td className="py-2 pr-3">
                    {KIND_INFO[row.kind].label}
                    {row.variant && <span className="ml-1.5 text-micro text-muted">{row.variant}</span>}
                    {row.blank && <span className="ml-1.5 rounded-full bg-fog px-2 py-0.5 text-micro">sem impressão</span>}
                  </td>
                  <td className={`py-2 ${row.source === "fallback" ? "font-bold text-coral-700" : "text-muted"}`}>{row.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
