import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AnalyticsFilters, { parseAnalyticsSearch } from "@/components/admin/AnalyticsFilters";
import { AnalyticsSections, Section } from "@/components/admin/AnalyticsSections";
import { StatTile } from "@/components/admin/charts";
import StatusBadge from "@/components/painel/StatusBadge";
import { formatBRL } from "@/lib/format";
import { releaseDays } from "@/lib/multiloja/config";
import { LOJISTA_TYPE_LABEL, PLAN_INFO, balanceOf, formatDateTime, sqlDaysAgo } from "@/lib/multiloja/core";
import { countLojaProdutos, getLoja, getLojista } from "@/lib/multiloja/repo";
import { listComissoes, listPedidos, listSaques, salesSummary } from "@/lib/multiloja/repo-vendas";
import { lojaUrl } from "@/lib/multiloja/tenant";

export const metadata: Metadata = { title: "Loja" };

/** Raio-x de uma multiloja: vendas, saldo do lojista, fluxo de pessoas, funil, produtos e últimos pedidos. */
export default async function AdminLoja(props: PageProps<"/admin/lojas/[id]">) {
  const { id } = await props.params;
  const loja = /^\d+$/.test(id) ? getLoja(Number(id)) : null;
  if (!loja) notFound();
  const lojista = getLojista(loja.lojistaId);
  const { dias, desde } = parseAnalyticsSearch(await props.searchParams);
  const vendas = salesSummary(loja.id, sqlDaysAgo(dias));
  const saldo = balanceOf(listComissoes(loja.id), listSaques(loja.id), releaseDays());
  const pedidos = listPedidos({ lojaId: loja.id, limite: 10 });
  const url = await lojaUrl(loja);

  return (
    <div className="space-y-6">
      <Link href="/admin/lojas" className="text-[15px] font-semibold underline-offset-4 hover:underline">
        ← Lojas
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-title">{loja.nome}</h1>
          <p className="mt-1 text-muted">
            <a href={url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {url.replace(/^https?:\/\//, "")}
            </a>{" "}
            · {lojista ? `${lojista.nome} (${LOJISTA_TYPE_LABEL[lojista.tipo] ?? lojista.tipo}) · ${lojista.email}` : ""} · plano {PLAN_INFO[loja.plano].name} · {countLojaProdutos(loja.id)} produtos ativos
            {!loja.ativa && " · fora do ar"}
          </p>
        </div>
      </div>

      <AnalyticsFilters action={`/admin/lojas/${loja.id}`} dias={dias} canal={String(loja.id)} lojas={[]} showCanal={false} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={`Vendas pagas (${dias} dias)`} value={String(vendas.pagos)} hint={`${vendas.pedidos} pedidos no total`} />
        <StatTile label="Faturamento" value={formatBRL(vendas.faturamento)} />
        <StatTile label="Comissão do lojista" value={formatBRL(vendas.comissao)} />
        <StatTile label="Saldo do lojista" value={formatBRL(saldo.available)} hint={`a liberar ${formatBRL(saldo.pending)} · já sacado ${formatBRL(saldo.withdrawn)}`} />
      </div>

      <Section id="ultimos" title="Últimos pedidos">
        {pedidos.length === 0 ? (
          <p className="rounded-panel bg-white p-6 text-muted shadow-card">Nenhum pedido ainda.</p>
        ) : (
          <ul className="divide-y divide-line rounded-panel bg-white px-5 shadow-card">
            {pedidos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-3 text-[14px]">
                <Link href={`/admin/pedidos/${p.codigo}`} className="font-bold underline-offset-4 hover:underline">
                  {p.codigo}
                </Link>
                <span className="min-w-0 flex-1 truncate text-muted">
                  {p.cliente.nome} · {formatDateTime(p.criadoEm)}
                </span>
                <span className="font-bold tabular-nums">{formatBRL(p.total)}</span>
                <span className="flex justify-end sm:w-48">
                  <StatusBadge status={p.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <AnalyticsSections scope={loja.id} desde={desde} showChannels={false} />
    </div>
  );
}
