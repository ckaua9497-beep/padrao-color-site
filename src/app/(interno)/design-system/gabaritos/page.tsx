import type { Metadata } from "next";
import Link from "next/link";
import GabaritoInspector from "@/components/design-system/GabaritoInspector";
import { getProducts } from "@/lib/catalog";
import { describePanel, formatMm, panelFor } from "@/lib/templates";
import { allTemplates, productTemplate } from "@/lib/templates-data";

export const metadata: Metadata = { title: "Gabaritos" };

const FILTERS = [
  { value: "pendencia", label: "Com pendência" },
  { value: "folhas", label: "Várias folhas" },
  { value: "pecas", label: "Várias peças por folha" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

type Query = { filtro?: string; p?: string };

function href(query: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `/design-system/gabaritos?${text}` : "/design-system/gabaritos";
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;

/** QA interna dos gabaritos oficiais: todo produto com gabarito, as medidas e o que ficou sem folha. ?filtro=…&p=slug */
export default async function GabaritosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const filter = FILTERS.find((f) => f.value === first(raw.filtro))?.value;
  const data = allTemplates();
  const products = getProducts();

  const rows = products.flatMap((product) => {
    const ref = data.products[product.id];
    if (!ref) return [];
    const source = data.templates[ref.template];
    const template = productTemplate(product.id);
    const pages = template?.pages ?? [];
    const front = panelFor(pages, "front");
    const problems: string[] = [];
    if (!source) problems.push("gabarito ausente");
    else if (!pages.length && !template?.parametric) problems.push("sem folhas");
    else if (pages.length && ref.pages.length > pages.length) problems.push(`${plural(ref.pages.length - pages.length, "folha perdida", "folhas perdidas")}`);
    return [
      {
        slug: product.slug,
        name: product.name,
        category: product.category,
        key: ref.template,
        url: source?.url ?? null,
        note: template?.note ?? source?.note,
        template,
        sheets: pages.length,
        panels: pages.reduce((n, page) => n + page.panels.length, 0),
        multiPanel: pages.some((page) => page.panels.length > 1),
        front: front ? describePanel(front.panel) : null,
        mapping: [
          ...Object.entries(ref.byOption ?? {}).map(([option, values]) => `${option} (${plural(Object.keys(values).length, "valor", "valores")})`),
          ...(ref.bySize ? [`Grade: ${Object.keys(ref.bySize).join(", ")}`] : []),
        ],
        problems,
        unmatched: ref.unmatched ?? [],
        rule: template?.parametric ?? null,
      },
    ];
  });
  type Row = (typeof rows)[number];

  const matches: Record<Filter, (row: Row) => boolean> = {
    pendencia: (row) => row.problems.length > 0 || row.unmatched.length > 0,
    folhas: (row) => row.sheets > 1,
    pecas: (row) => row.multiPanel,
  };
  const visible = filter ? rows.filter(matches[filter]) : rows;
  const wanted = first(raw.p);
  const selected = wanted ? rows.find((row) => row.slug === wanted) : visible[0];

  // Totais de todos os gabaritos baixados (inclusive os que nenhum produto usa).
  const templates = Object.values(data.templates);
  const totalPages = templates.reduce((n, t) => n + t.pages.length, 0);
  const pageList = templates.flatMap((t) => t.pages);
  const totalPanels = pageList.reduce((n, page) => n + page.panels.filter((panel) => !(panel as { ignore?: boolean }).ignore).length, 0);
  const stats = [
    { label: "Produtos", value: rows.length, detail: `de ${products.length.toLocaleString("pt-BR")} no catálogo` },
    { label: "Gabaritos", value: templates.length, detail: `${new Set(rows.map((row) => row.key)).size.toLocaleString("pt-BR")} em uso` },
    { label: "Folhas", value: totalPages, detail: plural(templates.filter((t) => !t.pages.length).length, "gabarito sem folhas", "gabaritos sem folhas") },
    { label: "Painéis", value: totalPanels, detail: plural(pageList.filter((page) => page.panels.length > 1).length, "folha com várias peças", "folhas com várias peças") },
  ];
  const generated = new Date(data.generatedAt);

  return (
    <div className="container-site py-10">
      <h1 className="text-section font-bold">Gabaritos</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Cada produto com gabarito oficial: tamanho final, sangria e área de segurança, como as opções escolhem as folhas e os valores que
        ficaram sem folha. Selecione um produto para ver as folhas desenhadas; só as dele são renderizadas.
      </p>
      {!Number.isNaN(generated.getTime()) && (
        <p className="mt-1 text-[13px] text-muted">
          Gerado em {generated.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}
        </p>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-card border border-line px-4 py-3">
            <dt className="text-[12px] font-semibold uppercase tracking-wide text-muted">{stat.label}</dt>
            <dd className="text-title font-bold">{stat.value.toLocaleString("pt-BR")}</dd>
            <dd className="text-micro text-muted">{stat.detail}</dd>
          </div>
        ))}
      </dl>

      <nav aria-label="Filtrar produtos" className="mt-6 flex flex-wrap gap-1.5">
        <Link href={href({})} className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${!filter ? "bg-ink text-white" : "bg-mist hover:bg-fog"}`}>
          Todos ({rows.length})
        </Link>
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={href({ filtro: f.value })}
            className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${filter === f.value ? "bg-ink text-white" : "bg-mist hover:bg-fog"}`}
          >
            {f.label} ({rows.filter(matches[f.value]).length})
          </Link>
        ))}
      </nav>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section
          key={selected?.slug}
          aria-label="Gabarito selecionado"
          className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto lg:pr-2"
        >
          {selected ? (
            <GabaritoInspector
              product={{ slug: selected.slug, name: selected.name, category: selected.category }}
              templateKey={selected.key}
              url={selected.url}
              note={selected.note}
              template={selected.template}
              problems={selected.problems}
              unmatched={selected.unmatched}
            />
          ) : (
            <p className="text-muted">{wanted ? "Esse produto não tem gabarito." : "Nenhum produto com esse filtro."}</p>
          )}
        </section>

        <section aria-label="Produtos com gabarito" className="min-w-0">
          <p className="mb-3 text-sm text-muted">{plural(visible.length, "produto", "produtos")}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line text-[12px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Produto</th>
                  <th className="py-2 pr-3 font-semibold">Gabarito</th>
                  <th className="py-2 pr-3 text-right font-semibold">Folhas</th>
                  <th className="py-2 pr-3 font-semibold">Tamanho final (frente)</th>
                  <th className="py-2 pr-3 font-semibold">Mapeamento</th>
                  <th className="py-2 font-semibold">Pendências</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((row) => (
                  <tr key={row.slug} className={row.slug === selected?.slug ? "bg-mist align-top" : "align-top"}>
                    <td className="py-2 pr-3">
                      <Link href={href({ filtro: filter, p: row.slug })} className="font-semibold hover:underline">
                        {row.name}
                      </Link>
                      <span className="block text-[12px] text-muted">{row.category}</span>
                    </td>
                    <td className="break-all py-2 pr-3 text-[12px] text-muted">{row.key}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {row.sheets}
                      {row.panels > row.sheets && <span className="block text-micro text-muted">{plural(row.panels, "peça", "peças")}</span>}
                    </td>
                    <td className="py-2 pr-3">
                      {row.front ? (
                        <>
                          <span className="whitespace-nowrap font-semibold">{row.front.final}</span>
                          <span className="block text-micro text-muted">
                            sangria {row.front.bleed ?? "—"} · segurança {row.front.safe ?? "—"}
                            {row.front.shape && ` · ${row.front.shape}`}
                          </span>
                        </>
                      ) : row.rule ? (
                        <span className="text-muted">medida livre</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {row.mapping.length ? (
                        row.mapping.map((text) => (
                          <span key={text} className="block">
                            {text}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted">todas as folhas</span>
                      )}
                    </td>
                    <td className="py-2">
                      {row.problems.map((text) => (
                        <span key={text} className="block font-bold text-coral-700">
                          {text}
                        </span>
                      ))}
                      {row.unmatched.map((text) => (
                        <span key={text} title="Valor de opção sem folha no gabarito" className="block font-bold text-coral-700">
                          {text}
                        </span>
                      ))}
                      {row.rule && (
                        <span className="block text-muted">
                          regra: sangria {formatMm(row.rule.bleedMm)} · segurança {formatMm(row.rule.safeMm)}
                        </span>
                      )}
                      {!row.problems.length && !row.unmatched.length && !row.rule && <span className="text-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
