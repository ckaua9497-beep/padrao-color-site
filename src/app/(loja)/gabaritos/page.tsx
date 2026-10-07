import type { Metadata } from "next";
import ListingBanner from "@/components/listing/ListingBanner";
import TemplateList, { type TemplateItem } from "@/components/listing/TemplateList";
import { IconCube, IconLayers, IconUpload } from "@/components/icons";
import { getTemplateProducts } from "@/lib/catalog";
import { spectrumAt } from "@/lib/format";

export const metadata: Metadata = {
  title: "Gabaritos",
  description: "Baixe o gabarito de cada produto da Padrão Color, com medidas, sangria e área de segurança para montar a sua arte.",
};

const TIPS = [
  { Icon: IconLayers, title: "Abra no seu programa", text: "Illustrator, CorelDRAW, Photoshop ou Canva: o gabarito traz o formato final, a sangria e a área de segurança." },
  { Icon: IconUpload, title: "Monte e exporte", text: "Textos e logos dentro da área de segurança. Exporte em PDF, CMYK e 300 dpi, sem as linhas do gabarito." },
  { Icon: IconCube, title: "Confira em 3D", text: "Na página do produto, envie a arte e veja o mockup antes de fechar o pedido." },
];

export default function TemplatesPage() {
  const products = getTemplateProducts();
  const items: TemplateItem[] = products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    categorySlug: p.categorySlug,
    image: p.image,
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
