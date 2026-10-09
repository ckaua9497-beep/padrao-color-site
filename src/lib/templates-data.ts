import "server-only";
import data from "@/data/templates.json";
import type { ProductTemplate, TemplatePage, TemplatePanel } from "./templates";

/*
 * Gabaritos oficiais por produto (src/data/templates.json, gerado por `npm run sync:templates` a partir dos
 * arquivos de padraocolor.com.br/gabaritos + a curadoria em src/data/template-curation.json).
 * Só o servidor lê o JSON inteiro; a página de cada produto recebe apenas as folhas dele.
 */

type RawPanel = TemplatePanel;
type RawPage = TemplatePage & { texts?: string[]; nameDims?: unknown; ignore?: boolean; match?: unknown };
type RawTemplate = { url: string; note?: string; parametric?: { bleedMm: number; safeMm: number }; editor?: "cut" | "fit"; pages: RawPage[]; files?: string[]; cdrOnly?: string[] };
type RawProduct = { template: string; pages: string[]; byOption?: Record<string, Record<string, string[]>>; bySize?: Record<string, string[]>; unmatched?: string[] };
type TemplatesFile = { generatedAt: string; templates: Record<string, RawTemplate>; products: Record<string, RawProduct> };

const file = data as unknown as TemplatesFile;

/** Marcas que interessam ao cliente (bolso, logo, zíper, dobra, furo); o resto do desenho fica de fora. */
const KEEP_MARKS = new Set(["magenta", "red", "fold", "hole"]);

function slimPanel(panel: RawPanel): TemplatePanel {
  const marks = panel.marks?.filter((m) => KEEP_MARKS.has(m.role) && m.d && m.d.length < 3000).slice(0, 12);
  return { ...panel, marks: marks?.length ? marks : undefined };
}

function slimPage(page: RawPage): TemplatePage {
  return {
    id: page.id,
    label: page.label,
    file: page.file ?? null,
    page: page.page,
    sheet: page.sheet,
    panels: page.panels.filter((p) => !(p as { ignore?: boolean }).ignore).map(slimPanel),
    side: page.side,
    size: page.size,
    part: page.part,
    manual: page.manual,
    note: page.note,
    span: page.span,
  };
}

/** Gabarito do produto (só as folhas que valem para ele), ou null quando não há gabarito legível. */
export function productTemplate(productId: string | undefined): ProductTemplate | null {
  if (!productId) return null;
  const ref = file.products[productId];
  const template = ref ? file.templates[ref.template] : undefined;
  if (!ref || !template) return null;
  const pages = template.pages.filter((p) => ref.pages.includes(p.id) && p.panels.length).map(slimPage);
  if (!pages.length && !template.parametric) return null;
  return {
    key: ref.template,
    url: template.url,
    note: template.note,
    parametric: template.parametric ?? null,
    editor: template.editor,
    pages,
    byOption: ref.byOption,
    bySize: ref.bySize,
  };
}

/** Todos os gabaritos (página de QA e lista de gabaritos). */
export function allTemplates(): { generatedAt: string; templates: Record<string, RawTemplate>; products: Record<string, RawProduct> } {
  return file;
}
