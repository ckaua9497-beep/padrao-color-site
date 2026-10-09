import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CatalogPhotoClient from "@/components/design-system/CatalogPhotoClient";
import { getProduct } from "@/lib/catalog";

export const metadata: Metadata = { title: "Foto de catálogo" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Foto de catálogo de um produto (mockup 3D + estampa da marca, fundo transparente, 600×600), usada pelo
 * scripts/fotos-produtos.mjs. ?p=<slug>&cor=<token>&modo=pattern|mark&seed=7&giro=0&op=Chave:Valor;Chave:Valor
 */
export default async function PhotoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const product = getProduct(first(raw.p) ?? "");
  if (!product) notFound();
  const selection: Record<string, string> = {};
  for (const pair of (first(raw.op) ?? "").split(";")) {
    const i = pair.indexOf(":");
    if (i > 0) selection[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  const mode = first(raw.modo) === "mark" ? "mark" : "pattern";
  return (
    <div className="container-site py-10">
      <h1 className="text-section font-bold">{product.name}</h1>
      <div className="mt-6">
        <CatalogPhotoClient
          product={{ slug: product.slug, name: product.name, categorySlug: product.categorySlug, options: product.options, image: product.image }}
          selection={selection}
          brand={{ color: first(raw.cor) ?? "coral", mode, seed: Number(first(raw.seed) ?? 7) || 7 }}
          turn={Number(first(raw.giro) ?? 0) || 0}
          size={Number(first(raw.tam) ?? 600) || 600}
          margin={Number(first(raw.margem) ?? 0.06) || 0.06}
        />
      </div>
    </div>
  );
}
