import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Product } from "./catalog";
import { panelFor, pagesFor, type ProductTemplate, type TemplatePage } from "./templates.ts";

/*
 * Cobertura dos gabaritos reais (src/data/templates.json, gerado por `npm run sync:templates`): todo produto
 * com gabarito precisa resolver as folhas certas para cada opção de medida e cada tamanho da grade, com
 * medidas coerentes (corte dentro da sangria, segurança dentro do corte). Rode depois de sync:catalog e
 * sync:templates: uma opção nova sem folha aparece aqui.
 */

const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8")) as { products: Product[] };
type RawProduct = { template: string; pages: string[]; byOption?: Record<string, Record<string, string[]>>; bySize?: Record<string, string[]>; unmatched?: string[] };
const data = JSON.parse(readFileSync(new URL("../data/templates.json", import.meta.url), "utf8")) as {
  templates: Record<string, { url: string; parametric?: { bleedMm: number; safeMm: number }; pages: TemplatePage[] }>;
  products: Record<string, RawProduct>;
};

const withTemplate = catalog.products.filter((p) => p.template);

function templateOf(id: string): ProductTemplate | null {
  const ref = data.products[id];
  const t = ref ? data.templates[ref.template] : undefined;
  if (!ref || !t) return null;
  return { key: ref.template, url: t.url, parametric: t.parametric ?? null, pages: t.pages.filter((p) => ref.pages.includes(p.id)), byOption: ref.byOption, bySize: ref.bySize };
}

/** Seleção padrão da página do produto: a variação mais barata. */
function defaultSelection(p: Product): Record<string, string> {
  const cheapest = [...p.variations].sort((a, b) => a.p - b.p)[0];
  return Object.fromEntries(Object.keys(p.options).map((k) => [k, cheapest?.v[k] ?? p.options[k][0]]));
}

const inside = (outer: { x: number; y: number; w: number; h: number }, inner: { x: number; y: number; w: number; h: number }, slack = 1) =>
  inner.x >= outer.x - slack && inner.y >= outer.y - slack && inner.x + inner.w <= outer.x + outer.w + slack && inner.y + inner.h <= outer.y + outer.h + slack;

test("todo produto com gabarito no catálogo tem o gabarito lido", () => {
  const missing = withTemplate.filter((p) => !data.products[p.id] || !data.templates[data.products[p.id].template]);
  assert.deepEqual(
    missing.map((p) => `${p.id} ${p.name}`),
    [],
  );
});

test("todo produto com gabarito resolve folhas (ou uma regra de medida livre) e um painel da frente", () => {
  const problems: string[] = [];
  for (const p of withTemplate) {
    const t = templateOf(p.id);
    if (!t) continue;
    if (t.parametric) continue;
    if (!t.pages.length) {
      problems.push(`${p.id} ${p.name}: sem folhas`);
      continue;
    }
    const size = p.sizes?.length ? p.sizes[Math.floor(p.sizes.length / 2)] : null;
    const selection = defaultSelection(p);
    const pages = pagesFor(t, selection, size);
    // Sem folha de propósito: medida livre (vale a regra) ou valor que a curadoria confirmou sem gabarito.
    const explicitNone = Object.entries(t.byOption ?? {}).some(([k, map]) => selection[k] in map && !map[selection[k]].length);
    if (!pages.length && (p.customSize || explicitNone)) continue;
    if (!panelFor(pages, "front")) problems.push(`${p.id} ${p.name}: sem painel da frente`);
  }
  assert.deepEqual(problems, []);
});

test("cada valor de opção mapeado aponta para folhas que existem", () => {
  const problems: string[] = [];
  for (const [id, ref] of Object.entries(data.products)) {
    const ids = new Set(data.templates[ref.template]?.pages.map((p) => p.id));
    for (const [key, map] of Object.entries(ref.byOption ?? {})) {
      // Lista vazia = a curadoria confirmou que o arquivo não traz aquela medida (a página fica sem gabarito).
      for (const [value, pages] of Object.entries(map)) if (pages.some((pg) => !ids.has(pg))) problems.push(`${id} ${key}=${value}`);
    }
    for (const [size, pages] of Object.entries(ref.bySize ?? {})) if (!pages.length || pages.some((pg) => !ids.has(pg))) problems.push(`${id} tamanho ${size}`);
    for (const pg of ref.pages) if (!ids.has(pg)) problems.push(`${id} folha ${pg}`);
  }
  assert.deepEqual(problems, []);
});

/**
 * Medidas que o próprio arquivo de gabarito da Padrão não traz (conferido na curadoria): a página do produto
 * fica sem o encaixe para elas. Medida nova sem folha falha aqui — confira o gabarito antes de aceitar.
 */
const KNOWN_GAPS = [
  "5: Formato DTF: 21x28cm, Formato DTF: 28x40cm",
  "186: Tamanho Gravação: 7x13cm",
  "249: Formato: 9x20 cm, Formato: 27x5 cm, Formato: 15x18 cm, Formato: 18x20cm, Formato: 20x27 cm, Formato: 15x45 cm, Formato: 45x30 cm",
  "276: Formato: 9x15 cm",
];

test("as opções de medida e os tamanhos da grade têm folha (fora as lacunas conhecidas do gabarito)", () => {
  const problems = Object.entries(data.products)
    .filter(([, ref]) => ref.unmatched?.length)
    .map(([id, ref]) => `${id}: ${ref.unmatched?.join(", ")}`)
    .filter((line) => !KNOWN_GAPS.includes(line));
  assert.deepEqual(problems, []);
});

test("medidas coerentes: corte dentro da sangria, segurança dentro do corte, tamanhos positivos", () => {
  const problems: string[] = [];
  for (const [key, t] of Object.entries(data.templates)) {
    for (const page of t.pages) {
      if (!page.panels.length) problems.push(`${key}/${page.id}: sem painéis`);
      page.panels.forEach((panel, i) => {
        const where = `${key}/${page.id}#${i}`;
        if (!(panel.cut.w > 0 && panel.cut.h > 0)) problems.push(`${where}: corte vazio`);
        if (!inside(panel.bleed, panel.cut)) problems.push(`${where}: corte fora da sangria`);
        if (panel.safe && !inside(panel.cut, panel.safe, 2)) problems.push(`${where}: segurança fora do corte`);
        if (!inside({ x: 0, y: 0, w: page.sheet.w, h: page.sheet.h }, panel.bleed, 2)) problems.push(`${where}: sangria fora da folha`);
      });
    }
  }
  assert.deepEqual(problems, []);
});

test("camisas com grade: cada tamanho tem a sua folha quando o gabarito separa por tamanho", () => {
  const problems: string[] = [];
  for (const p of withTemplate.filter((x) => x.sizes?.length)) {
    const t = templateOf(p.id);
    if (!t?.bySize) continue;
    for (const size of p.sizes ?? []) if (!t.bySize[size]?.length) problems.push(`${p.id} ${p.name}: ${size}`);
  }
  assert.deepEqual(problems, []);
});
