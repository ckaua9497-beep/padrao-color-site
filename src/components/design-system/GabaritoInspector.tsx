import Link from "next/link";
import { TemplateLegend, TemplateSheet } from "@/components/product/gabarito/TemplateSheet";
import { Badge } from "@/components/ui/Badge";
import { cx } from "@/components/ui/cx";
import { describePanel, formatMm, sideOf, type PanelSide, type ProductTemplate, type TemplatePage } from "@/lib/templates";

/*
 * Inspetor da página de QA /design-system/gabaritos (componente de servidor): desenha só as folhas do produto
 * inspecionado, com as medidas de cada painel e o mapa opção → folhas.
 */

const SIDE_LABEL: Record<PanelSide, string> = { front: "Frente", back: "Verso", other: "Outra peça" };

type Props = {
  product: { slug: string; name: string; category: string };
  templateKey: string;
  /** Pacote do gabarito na Padrão (.zip/.rar), quando existe. */
  url: string | null;
  note?: string;
  template: ProductTemplate | null;
  /** Problemas do mapeamento (sem folhas, gabarito ausente, folhas perdidas). */
  problems: string[];
  /** Valores de opção sem folha correspondente no gabarito. */
  unmatched: string[];
};

export default function GabaritoInspector({ product, templateKey, url, note, template, problems, unmatched }: Props) {
  const pages = template?.pages ?? [];
  const labels = new Map(pages.map((page) => [page.id, page.label]));
  const mapping = [
    ...Object.entries(template?.byOption ?? {}).map(([option, values]) => ({ option, values })),
    ...(template?.bySize ? [{ option: "Tamanho da grade", values: template.bySize }] : []),
  ];
  const rule = template?.parametric;

  return (
    <div>
      <h2 className="text-xl font-bold">{product.name}</h2>
      <p className="text-[13px] text-muted">{product.category}</p>

      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
        <dt className="text-muted">Loja</dt>
        <dd>
          <Link href={`/produto/${product.slug}`} className="font-semibold hover:underline">
            /produto/{product.slug}
          </Link>
        </dd>
        <dt className="text-muted">Gabarito</dt>
        <dd className="font-semibold">{templateKey}</dd>
        <dt className="text-muted">Arquivo</dt>
        <dd className="break-all">
          {url ? (
            <a href={url.replace(/ /g, "%20")} target="_blank" rel="noreferrer" className="hover:underline">
              {url}
            </a>
          ) : (
            "—"
          )}
        </dd>
        {rule && (
          <>
            <dt className="text-muted">Regra</dt>
            <dd>
              medida livre · sangria {formatMm(rule.bleedMm)} · segurança {formatMm(rule.safeMm)}
            </dd>
          </>
        )}
      </dl>
      {note && <p className="mt-2 text-[13px] text-muted">{note}</p>}

      {(problems.length > 0 || unmatched.length > 0) && (
        <section aria-label="Pendências" className="mt-4 rounded-card bg-coral-50 px-4 py-3 text-[13px]">
          <h3 className="font-bold text-coral-700">Pendências</h3>
          <ul className="mt-1 space-y-0.5 font-bold text-coral-700">
            {problems.map((text) => (
              <li key={text}>{text}</li>
            ))}
            {unmatched.map((text) => (
              <li key={text}>Sem folha: {text}</li>
            ))}
          </ul>
        </section>
      )}

      {mapping.length > 0 && (
        <section aria-label="Opções e folhas" className="mt-4 text-[13px]">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted">Opção → folhas</h3>
          {mapping.map(({ option, values }) => (
            <div key={option} className="mt-2">
              <p className="font-semibold">{option}</p>
              <ul className="mt-1 divide-y divide-line border-y border-line">
                {Object.entries(values).map(([value, ids]) => (
                  <li key={value} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 py-1">
                    <span>{value}</span>
                    <span className="text-muted">{ids.map((id) => labels.get(id) ?? id).join(", ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <TemplateLegend sew className="mt-5" />

      {pages.length > 0 ? (
        <div className={cx("mt-3 grid gap-6", pages.length > 3 && "sm:grid-cols-2")}>
          {pages.map((page) => (
            <SheetFigure key={page.id} page={page} productName={product.name} />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-muted">{rule ? "Medida livre: a folha é montada com a medida digitada." : "Nenhuma folha legível neste gabarito."}</p>
      )}
    </div>
  );
}

function SheetFigure({ page, productName }: { page: TemplatePage; productName: string }) {
  const tags = [page.side && SIDE_LABEL[page.side], page.size && `Tam. ${page.size}`, page.part, page.manual && "manual"].filter(
    (tag): tag is string => Boolean(tag),
  );
  const source = [page.file, page.page ? `pág. ${page.page}` : null].filter(Boolean).join(" · ");
  return (
    <figure className="min-w-0">
      <div className="rounded-panel border border-line bg-white p-3">
        <TemplateSheet page={page} names title={`Gabarito de ${productName}: ${page.label}`} className="max-h-[70vh]" />
      </div>
      <figcaption className="mt-2 text-[13px]">
        <p className="flex flex-wrap items-center gap-1.5 font-semibold">
          {page.label}
          {tags.map((tag) => (
            <Badge key={tag} tone="neutral">
              {tag}
            </Badge>
          ))}
        </p>
        <p className="text-micro text-muted">
          Folha {formatMm(page.sheet.w)} × {formatMm(page.sheet.h)}
          {source && ` · ${source}`}
        </p>
        {page.note && <p className="text-micro text-muted">{page.note}</p>}
        <ol className="mt-1.5 space-y-1">
          {page.panels.map((panel, i) => {
            const info = describePanel(panel);
            return (
              <li key={i}>
                <span className="font-semibold">{panel.name ?? `Peça ${i + 1}`}</span>{" "}
                <span className="text-muted">({SIDE_LABEL[sideOf(page, panel, i)]})</span>: {info.final} · sangria {info.bleed ?? "—"} · segurança{" "}
                {info.safe ?? "—"} · {info.shape ?? "corte reto"}
                {panel.sew && " · costura"}
                {panel.marks?.length ? ` · ${panel.marks.length} ${panel.marks.length === 1 ? "marca" : "marcas"}` : null}
                {panel.faces?.some((f) => f.side) && (
                  <span className="block text-micro text-muted">
                    Faces:{" "}
                    {panel.faces
                      .filter((f) => !f.ignore)
                      .map((f) => `${f.name ?? "face"} (${SIDE_LABEL[f.side ?? "other"]}${f.rotate ? `, girada ${f.rotate}°` : ""}, ${formatMm(f.box.w)} × ${formatMm(f.box.h)})`)
                      .join(" · ")}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </figcaption>
    </figure>
  );
}
