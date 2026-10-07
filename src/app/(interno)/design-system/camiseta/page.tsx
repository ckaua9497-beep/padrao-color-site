import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TeeLab from "@/components/design-system/TeeLab";
import type { BodyType } from "@/components/mockup/art";
import { getProduct } from "@/lib/catalog";

export const metadata: Metadata = { title: "Bancada da camiseta" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** QA interna da camiseta: ?p=slug&tam=M&corpo=medio&sem=1&lado=back&texto=…&verso=…&cor=preta&formato=28 */
export default async function TeeLabPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const product = getProduct(first(raw.p) ?? "5-camisa-de-algodao");
  if (!product) notFound();
  const body = first(raw.corpo);
  return (
    <div className="p-6">
      <TeeLab
        product={{ slug: product.slug, name: product.name, categorySlug: product.categorySlug, options: product.options, image: product.image }}
        query={{
          size: first(raw.tam) ?? "M",
          body: body === "magro" || body === "cheio" ? (body as BodyType) : "medio",
          ghost: first(raw.sem) === "1",
          side: first(raw.lado) === "back" ? "back" : "front",
          text: first(raw.texto) ?? "",
          back: first(raw.verso) ?? "",
          color: first(raw.cor) ?? null,
          print: first(raw.formato) ?? null,
        }}
      />
    </div>
  );
}
