import { IconCheck } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";

const CARDS = [
  {
    id: "festa",
    href: "/crie-sua-festa",
    title: "Crie Sua Festa",
    lead: "Montagem livre, item por item",
    points: [
      "Você escolhe quais produtos de festa entram, sem composição fixa",
      "Quantidades, formatos e medidas do seu jeito",
      "Tema, cores e textos escritos uma vez, iguais em tudo",
    ],
    cta: "Montar a minha festa",
  },
  {
    id: "kit",
    href: "/monte-seu-kit",
    title: "Monte Seu Kit — Festas",
    lead: "Kits prontos, com composição fechada",
    points: ["10 combinações pensadas para cada ocasião", "Você escreve os textos e ajusta quantidades e medidas", "Valor calculado item a item, sem desconto de kit"],
    cta: "Ver os kits prontos",
  },
] as const;

/**
 * A fronteira entre as abas, na própria página: o Crie Sua Festa é a montagem livre com os produtos de
 * festa pré-definidos; o Monte Seu Kit são combinações prontas desses mesmos produtos; a página do produto
 * continua sendo o lugar do ajuste fino.
 */
export function PartyBoundary({ current }: { current: "festa" | "kit" }) {
  return (
    <section aria-labelledby="festa-ou-kit" className="rounded-panel bg-cloud p-5 sm:p-8">
      <h2 id="festa-ou-kit" className="text-xl font-bold sm:text-2xl">
        Crie Sua Festa ou Monte Seu Kit?
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-ink/80">
        As duas abas usam os mesmos produtos de festa e levam cada item para o carrinho como um produto comum. Quer outro papel ou acabamento? Cada item tem o link da página do produto para o ajuste fino.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {CARDS.map((card) => {
          const here = card.id === current;
          return (
            <div key={card.id} className={cx("flex flex-col rounded-card bg-white p-5 shadow-card", here && "ring-2 ring-ink")}>
              <p className="text-micro font-bold uppercase tracking-wide text-coral-700">{here ? "Você está aqui" : card.lead}</p>
              <h3 className="mt-1 text-lg font-bold">{card.title}</h3>
              {here && <p className="text-sm text-muted">{card.lead}</p>}
              <ul className="mt-3 grid gap-1.5 text-sm">
                {card.points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <IconCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-coral-700" strokeWidth={2.4} />
                    {point}
                  </li>
                ))}
              </ul>
              {!here && (
                <Button href={card.href} variant="outline" size="sm" className="mt-5 self-start">
                  {card.cta}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
