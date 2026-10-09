import type { Metadata } from "next";
import Link from "next/link";
import Faq from "@/components/home/Faq";
import { IconArrow } from "@/components/icons";
import { GOAL_ICONS } from "@/components/kit/goal-icons";
import { KIT_FAQ } from "@/components/kit/kit-faq";
import ListingBanner from "@/components/listing/ListingBanner";
import KitCard, { type KitCardData } from "@/components/party/KitCard";
import { Button } from "@/components/ui/Button";
import { PartyBoundary } from "@/components/party/PartyBoundary";
import { PARTY_FAQ } from "@/components/party/party-faq";
import { getProducts } from "@/lib/catalog";
import { spectrumAt } from "@/lib/format";
import { KIT_GOALS } from "@/lib/kit-builder";
import { KITS, amountLabel, defaultConfig, getPalette, kitQuote, priceItem, resolveKitItems } from "@/lib/party";

/*
 * Monte Seu Kit: (1) o assistente "Monte o seu kit" (/monte-seu-kit/montar), que sugere produtos do catálogo
 * pelo objetivo, pela quantidade e pelo orçamento — os cards daqui já entram com o objetivo escolhido — e (2)
 * os 10 kits de festa prontos (src/lib/party.ts), com composição fechada feita dos mesmos produtos de festa do
 * Crie Sua Festa. O valor é a soma dos itens, calculada item a item (sem desconto).
 */

export const metadata: Metadata = {
  title: "Monte Seu Kit",
  description: `Monte um kit para a equipe, os clientes, um evento ou a sua loja com sugestões dentro do seu orçamento, ou escolha um dos ${KITS.length} kits de festa prontos. Valor calculado item a item.`,
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
        title="Monte Seu Kit"
        subtitle={`Monte um kit do seu jeito, com sugestões dentro do seu orçamento, ou escolha um dos ${kits.length} kits de festa prontos.`}
        images={kits.slice(0, 3).map((kit) => kit.image)}
        tone="var(--color-sun-50)"
        crumbs={[{ href: "/", label: "Início" }, { label: "Monte Seu Kit" }]}
      />

      <section aria-labelledby="monte-o-seu" className="rounded-card bg-mist p-5 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral-700">Assistente</p>
            <h2 id="monte-o-seu" className="mt-2 text-section font-bold">
              Monte o seu kit em um minuto
            </h2>
            <p className="mt-2 text-body text-ink/75">
              Conte para que é, quantos kits e quanto quer investir. A gente sugere produtos do catálogo dentro do orçamento e você ajusta, busca outros e vê o valor por kit e o
              total na hora.
            </p>
          </div>
          <Button href="/monte-seu-kit/montar" variant="buy" size="md" iconEnd={<IconArrow className="size-4" />}>
            Começar
          </Button>
        </div>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {KIT_GOALS.map((goal, i) => {
            const Icon = GOAL_ICONS[goal.icon];
            return (
              <li key={goal.id}>
                <Link
                  href={goal.href ?? `/monte-seu-kit/montar?objetivo=${goal.id}`}
                  className="group flex h-full items-start gap-3 rounded-card bg-white p-4 ring-1 ring-inset ring-line transition-shadow duration-200 hover:ring-ink"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-full" style={{ background: spectrumAt(i).soft }}>
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold leading-snug">{goal.label}</span>
                    <span className="mt-1 block text-caption text-muted">{goal.description}</span>
                  </span>
                  <IconArrow aria-hidden className="mt-1 size-4 shrink-0 text-muted transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <h2 id="kits-prontos" className="mt-16 text-section font-bold">
        Kits de festa prontos
      </h2>
      <p className="mt-3 max-w-3xl text-sm text-ink/80">
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
        <Faq items={[...KIT_FAQ, ...PARTY_FAQ]} />
      </section>
    </div>
  );
}
