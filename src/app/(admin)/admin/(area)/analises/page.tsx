import type { Metadata } from "next";
import AnalyticsFilters, { parseAnalyticsSearch } from "@/components/admin/AnalyticsFilters";
import { AnalyticsSections } from "@/components/admin/AnalyticsSections";
import { PageHeader } from "@/components/admin/ui";
import { listLojasAdmin } from "@/lib/multiloja/repo-vendas";

export const metadata: Metadata = { title: "Análises" };

export default async function AdminAnalises(props: PageProps<"/admin/analises">) {
  const { dias, desde, canal, scope } = parseAnalyticsSearch(await props.searchParams);
  const lojas = (await listLojasAdmin()).map((l) => ({ id: l.id, nome: l.nome }));
  return (
    <div className="space-y-8">
      <PageHeader
        group="Rede"
        title="Análises"
        description="Quem chega, o que vê, o que põe no carrinho, onde desiste e o que compra, no site da Padrão e em todas as multilojas. Anônimo: sem dados pessoais, e quem liga “não rastrear” no navegador fica de fora."
        actions={<AnalyticsFilters action="/admin/analises" dias={dias} canal={canal} lojas={lojas} />}
      />
      <AnalyticsSections scope={scope} desde={desde} />
    </div>
  );
}
