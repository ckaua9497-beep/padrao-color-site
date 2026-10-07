import type { Metadata } from "next";
import Link from "next/link";
import Faq from "@/components/home/Faq";
import ListingBanner from "@/components/listing/ListingBanner";
import KitCard, { type KitCardData } from "@/components/party/KitCard";
import { PartyBoundary } from "@/components/party/PartyBoundary";
import { PARTY_FAQ } from "@/components/party/party-faq";
import { getProducts } from "@/lib/catalog";
import { spectrumAt } from "@/lib/format";
import { KITS, amountLabel, defaultConfig, getPalette, kitQuote, priceItem, resolveKitItems } from "@/lib/party";

/*
 * Monte Seu Kit — Festas: os 10 kits prontos (src/lib/party.ts), com composição fechada feita dos mesmos
 * produtos de festa do Crie Sua Festa. O valor é a soma dos itens, calculada item a item (sem desconto).
 */

export const metadata: Metadata = {
  title: "Monte Seu Kit — Festas",
  description: `${KITS.length} kits de festa prontos — aniversário infantil, chá de bebê, batizado, 15 anos, casamento, festa junina, formatura, evento corporativo, churrasco e Natal — com composição fechada e valor calculado item a item.`,
};

const STEPS = [
  { title: "Escolha o kit", text: "Cada kit junta os produtos de festa pensados para a ocasião." },
  { title: "Escreva uma vez", text: "Nome, tema, cores e frase valem para todos os itens do kit." },
  { title: "Ajuste e leve", text: "Mude quantidades e medidas e adicione o kit inteiro ao carrinho." },
];

export default function MonteSeuKitPage() {
  const products = getProducts();
  const kits: KitCardData[] = KITS.flatMap((kit) => {
    const items = resolveKitItems(kit, products);
    const cover = items.find((item) => item.id === kit.cover) ?? items[0];
    if (!cover) return [];
    const quote = kitQuote(items);
    return [
      {
        slug: kit.slug,
        name: kit.name,
        tagline: kit.tagline,
        audience: kit.audience,
        image: cover.product.image,
        colors: getPalette(kit.palette).colors,
        total: quote.total,
        leadDays: quote.leadDays,
        summary: items.map((item) => `${item.title} · ${amountLabel(item, priceItem(item, defaultConfig(item)))}`),
      },
    ];
  });

  return (
    <div className="container-site pb-20">
      <ListingBanner
        title="Monte Seu Kit — Festas"
        subtitle={`${kits.length} kits prontos para as principais ocasiões, com composição fechada e valor calculado item a item.`}
        images={kits.slice(0, 3).map((kit) => kit.image)}
        tone="var(--color-sun-50)"
        crumbs={[{ href: "/", label: "Início" }, { label: "Monte Seu Kit" }]}
      />

      <p className="max-w-3xl text-sm text-ink/80">
        Os kits têm a composição fechada: você escreve os textos e ajusta quantidades e medidas, mas os itens já vêm escolhidos. Quer decidir item por item?{" "}
        <Link href="/crie-sua-festa" className="font-semibold underline underline-offset-4">
          Crie Sua Festa
        </Link>{" "}
        com os mesmos produtos.
      </p>

      <ol className="mt-8 grid gap-3 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3 rounded-card p-4" style={{ background: spectrumAt(i + 1).soft }}>
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-white">{i + 1}</span>
            <span className="text-sm">
              <span className="block font-bold">{step.title}</span>
              {step.text}
            </span>
          </li>
        ))}
      </ol>

      <section aria-labelledby="kits-prontos" className="mt-12">
        <h2 id="kits-prontos" className="sr-only">
          Kits prontos
        </h2>
        <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {kits.map((kit, i) => (
            <li key={kit.slug}>
              <KitCard kit={kit} eager={i < 3} />
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-20">
        <PartyBoundary current="kit" />
      </div>

      <section aria-labelledby="kit-duvidas" className="mt-16">
        <h2 id="kit-duvidas" className="mb-6 text-section font-bold">
          Dúvidas sobre os kits
        </h2>
        <Faq items={PARTY_FAQ} />
      </section>
    </div>
  );
}
