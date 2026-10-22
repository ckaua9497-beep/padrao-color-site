import type { Metadata } from "next";
import ListingBanner from "@/components/listing/ListingBanner";
import TemplateList, { type TemplateItem } from "@/components/listing/TemplateList";
import { IconCube, IconLayers, IconUpload } from "@/components/icons";
import { getTemplateProducts } from "@/lib/catalog";
import { spectrumAt } from "@/lib/format";
import { produtosComMidia } from "@/lib/midia";
import { midiaDoSite } from "@/lib/midia-servidor";
import { describePanel, formatMm, panelFor, type Mm, type TemplatePanel } from "@/lib/templates";
import { productTemplate } from "@/lib/templates-data";

export const metadata: Metadata = {
  title: "Gabaritos",
  description: "Baixe o gabarito de cada produto da Padrão Color, com medidas, sangria e área de segurança para montar a sua arte.",
};

const TIPS = [
  { Icon: IconLayers, title: "Abra no seu programa", text: "Illustrator, CorelDRAW, Photoshop ou Canva: o gabarito traz o formato final, a sangria e a área de segurança." },
  { Icon: IconUpload, title: "Monte e exporte", text: "Textos e logos dentro da área de segurança. Exporte em PDF, CMYK e 300 dpi, sem as linhas do gabarito." },
  { Icon: IconCube, title: "Confira em 3D", text: "Envie a arte na página do produto: o site a encaixa no gabarito automaticamente e mostra o mockup antes do pedido." },
];

/** Limite do resumo de medidas de cada gabarito na lista (cabe em até duas linhas do card). */
const FACTS_MAX = 60;

/** Mesma medida com folga de 1,5 mm (ou 1,5%), em pé ou deitada: as folhas "horizontal" e "vertical" contam uma vez. */
const closeMm = (a: number, b: number) => Math.abs(a - b) <= Math.max(1.5, 0.015 * Math.max(a, b));
const sameSize = (a: Mm, b: Mm) => (closeMm(a.w, b.w) && closeMm(a.h, b.h)) || (closeMm(a.w, b.h) && closeMm(a.h, b.w));
const cm = (mm: number) => (mm / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const dims = (m: Mm) => `${cm(m.w)} × ${cm(m.h)}`;

/** Junta as partes com " · " na ordem; a primeira sempre entra, as outras só se ainda couberem no limite. */
function joinFacts(parts: (string | null | false)[]): string {
  let text = "";
  for (const part of parts) {
    if (!part) continue;
    const next = text ? `${text} · ${part}` : part;
    if (text && next.length > FACTS_MAX) continue;
    text = next;
  }
  return text;
}

/**
 * Medidas do gabarito para a lista, lidas de src/data/templates.json:
 * "5 cm × 5 cm · sangria 2 mm · segurança 4 mm", "3 tamanhos: 20 × 28 a 31 × 46 cm · sangria 1 mm" ou
 * "medida livre · sangria 3 mm". Sem gabarito legível → null (a linha não aparece).
 */
function templateFacts(productId: string): string | null {
  const template = productTemplate(productId);
  if (!template) return null;
  if (template.parametric) {
    const { bleedMm, safeMm } = template.parametric;
    return joinFacts(["medida livre", bleedMm > 0 && `sangria ${formatMm(bleedMm)}`, safeMm > 0 && `segurança ${formatMm(safeMm)}`]);
  }
  const main = panelFor(template.pages, "front")?.panel;
  if (!main) return null;
  // Peça da frente de cada folha (face da almofada, mosaico inteiro, frente da camisa): folhas de tamanhos ou
  // formatos diferentes viram uma faixa de medidas — o mesmo critério da página do produto.
  const fronts = template.pages.flatMap((page) => {
    const ref = panelFor([page], "front");
    return ref && ref.piece.side === "front" ? [ref.panel] : [];
  });
  const panels: TemplatePanel[] = fronts.length ? fronts : [main];
  const sizes: Mm[] = [];
  for (const { metrics } of panels) if (!sizes.some((s) => sameSize(s, metrics.finalMm))) sizes.push(metrics.finalMm);

  const info = describePanel(main);
  // Sangria só em alguns lados: o texto não cabe na linha curta da lista (a página do produto detalha).
  const bleed = info.bleed && !/alguns lados/.test(info.bleed) ? info.bleed : null;
  if (sizes.length === 1) return joinFacts([info.final, bleed && `sangria ${bleed}`, info.safe && `segurança ${info.safe}`, info.shape]);

  sizes.sort((a, b) => a.w * a.h - b.w * b.h);
  const range = `${sizes.length} tamanhos: ${dims(sizes[0])} a ${dims(sizes[sizes.length - 1])} cm`;
  const sameBleed = new Set(panels.map((p) => describePanel(p).bleed)).size === 1;
  return joinFacts([range.length <= FACTS_MAX ? range : `${sizes.length} tamanhos`, sameBleed && bleed && `sangria ${bleed}`]);
}

export default async function TemplatesPage() {
  const products = produtosComMidia(getTemplateProducts(), await midiaDoSite());
  const items: TemplateItem[] = products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    categorySlug: p.categorySlug,
    image: p.image,
    facts: templateFacts(p.id),
    ext: (/\.([a-z0-9]{2,4})$/i.exec(p.template ?? "")?.[1] ?? "zip").toLowerCase(),
  }));

  return (
    <div className="container-site pb-20">
      <ListingBanner
        title="Gabaritos"
        subtitle={`${items.length} produtos com gabarito para baixar e montar a arte no tamanho certo.`}
        images={products.slice(0, 8).map((p) => p.image)}
        tone="var(--color-lime-50)"
        crumbs={[{ href: "/", label: "Início" }, { label: "Gabaritos" }]}
      />
      <ul className="mb-10 grid gap-4 md:grid-cols-3">
        {TIPS.map(({ Icon, title, text }, i) => (
          <li key={title} className="flex gap-4 rounded-card bg-white p-5 shadow-card">
            <span className="grid size-11 shrink-0 place-items-center rounded-full" style={{ background: spectrumAt(i + 2).soft }}>
              <Icon aria-hidden className="size-5" />
            </span>
            <span>
              <span className="block font-bold">{title}</span>
              <span className="mt-1 block text-caption text-ink/75">{text}</span>
            </span>
          </li>
        ))}
      </ul>
      <TemplateList items={items} />
    </div>
  );
}
