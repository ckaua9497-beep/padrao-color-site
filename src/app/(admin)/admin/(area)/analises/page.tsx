import type { Metadata } from "next";
import AnalyticsFilters, { parseAnalyticsSearch } from "@/components/admin/AnalyticsFilters";
import { AnalyticsSections } from "@/components/admin/AnalyticsSections";
import { listLojasAdmin } from "@/lib/multiloja/repo-vendas";

export const metadata: Metadata = { title: "Análises" };

export default async function AdminAnalises(props: PageProps<"/admin/analises">) {
  const { dias, desde, canal, scope } = parseAnalyticsSearch(await props.searchParams);
  const lojas = listLojasAdmin().map((l) => ({ id: l.id, nome: l.nome }));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-title">Análises</h1>
        <p className="mt-1 max-w-3xl text-muted">
          Rastreamento anônimo do site da Padrão e de todas as multilojas: quem chega, o que vê, o que põe no carrinho, onde desiste e o que compra. Sem dados pessoais; quem ativa “não rastrear” no navegador não entra.
        </p>
      </div>
      <AnalyticsFilters action="/admin/analises" dias={dias} canal={canal} lojas={lojas} />
      <AnalyticsSections scope={scope} desde={desde} />
    </div>
  );
}
