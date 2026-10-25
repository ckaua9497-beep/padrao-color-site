import type { Metadata } from "next";
import ContactSheet, { type SheetItem } from "@/components/design-system/ContactSheet";
import { getQaProducts } from "@/lib/catalog";
import { mockupSpec } from "@/lib/mockup";

export const metadata: Metadata = { title: "Folha de contato dos mockups" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Um produto por combinação de tipo e subtipo, fotografados em sequência (?from=0&n=40&kind=mug&texto=…). */
export default async function ContactSheetPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const from = Number(first(raw.from) ?? 0) || 0;
  const count = Number(first(raw.n) ?? 40) || 40;
  const kind = first(raw.kind);
  const text = first(raw.texto) ?? "";

  const seen = new Map<string, SheetItem>();
  for (const p of getQaProducts()) {
    const spec = mockupSpec(p, {});
    if (kind && !kind.split(",").includes(spec.kind)) continue;
    const key = spec.variant ? `${spec.kind}:${spec.variant}` : spec.kind;
    if (!seen.has(key)) seen.set(key, { key, product: { slug: p.slug, name: p.name, categorySlug: p.categorySlug, options: p.options, image: p.image } });
  }
  const all = [...seen.values()].sort((a, b) => a.key.localeCompare(b.key));
  const items = all.slice(from, from + count);

  return (
    <div className="container-site py-10">
      <h1 className="text-section font-bold">Folha de contato</h1>
      <p className="mt-2 text-muted">
        {all.length} combinações de tipo e subtipo; mostrando {from + 1}–{from + items.length}.
      </p>
      <div className="mt-6">
        <ContactSheet items={items} text={text} />
      </div>
    </div>
  );
}
