import type { Metadata } from "next";
import Link from "next/link";
import StatusBadge from "@/components/painel/StatusBadge";
import { formatBRL } from "@/lib/format";
import { dayKeyDaysAgo, formatDateTime, plural, sqlDaysAgo } from "@/lib/multiloja/core";
import { activeGateway } from "@/lib/multiloja/payments";
import { channels, kpis } from "@/lib/multiloja/analytics";
import { funnelRates } from "@/lib/multiloja/eventos";
import { StatTile, InlineBar, compact } from "@/components/admin/charts";
import { padraoProduction } from "@/lib/multiloja/config";
import { listLojasAdmin, listPedidos, listSaques, salesSummary } from "@/lib/multiloja/repo-vendas";

export const metadata: Metadata = { title: "Visão geral" };

export default async function AdminInicio() {
  const mes = salesSummary(null, sqlDaysAgo(30));
  const paraProduzir = listPedidos({ status: "pago", limite: 50 });
  const saques = listSaques(null).filter((s) => s.status === "solicitado");
  const lojas = listLojasAdmin();
  const gateway = activeGateway();
  const rede = kpis("todas", dayKeyDaysAgo(29));
  const taxas = funnelRates(rede);
  const canais = channels(dayKeyDaysAgo(29)).slice(0, 6);
  const maxCanal = Math.max(0, ...canais.map((c) => c.valor));
  const production = padraoProduction();

  const cards = [
    { label: "Lojas", value: String(lojas.length), hint: `${lojas.filter((l) => l.ativa).length} no ar` },
    { label: "Vendas pagas (30 dias)", value: String(mes.pagos), hint: `${plural(mes.pedidos, "pedido", "pedidos")} no total` },
    { label: "Faturamento (30 dias)", value: formatBRL(mes.faturamento) },
    { label: "Comissões (30 dias)", value: formatBRL(mes.comissao) },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-title">Visão geral</h1>

      <section aria-labelledby="rede" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="rede" className="text-xl font-bold">
            Toda a rede nos últimos 30 dias
          </h2>
          <Link href="/admin/analises" className="font-bold underline-offset-4 hover:underline">
            Abrir análises completas
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Visitantes (site + lojas)" value={compact(rede.visitantes)} hint={`${compact(rede.sessoes)} sessões`} />
          <StatTile label="Pedidos" value={compact(rede.pedidos)} hint={formatBRL(rede.valorPedidos)} />
          <StatTile label="Conversão" value={`${taxas.conversaoPedido.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`} hint="sessões que viraram pedido" />
          <StatTile label="Abandono de carrinho" value={`${taxas.abandonoCarrinho.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`} />
        </div>
        {canais.length > 0 && (
          <ul className="divide-y divide-line rounded-panel bg-white px-5 shadow-card">
            {canais.map((c) => (
              <li key={c.lojaId} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-3 text-[14px] md:grid-cols-[220px_1fr_auto]">
                <span className="font-semibold">{c.lojaId === 0 ? c.nome : <Link href={`/admin/lojas/${c.lojaId}`} className="underline-offset-4 hover:underline">{c.nome}</Link>}</span>
                <span className="order-3 col-span-2 md:order-none md:col-span-1">
                  <InlineBar value={c.valor} max={maxCanal} />
                </span>
                <span className="text-right tabular-nums">
                  <strong>{formatBRL(c.valor)}</strong> <span className="text-muted">· {plural(c.pedidos, "pedido", "pedidos")} · {plural(c.visitantes, "visitante", "visitantes")}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-panel bg-white p-4 shadow-card">
            <p className="text-caption font-semibold text-muted">{c.label}</p>
            <p className="mt-1 text-2xl font-black tabular-nums">{c.value}</p>
            {c.hint && <p className="text-caption text-muted">{c.hint}</p>}
          </div>
        ))}
      </div>

      <section className="rounded-panel bg-white p-5 shadow-card" aria-labelledby="config">
        <h2 id="config" className="text-lg font-bold">
          Configuração
        </h2>
        <ul className="mt-2 space-y-1 text-[15px]">
          <li>
            Pagamento online:{" "}
            <strong>{gateway ? (gateway.name === "simulado" ? "simulação (teste, nada é cobrado)" : gateway.label) : "desligado (pedidos pelo WhatsApp)"}</strong>{" "}
            <Link href="/admin/pagamentos" className="underline underline-offset-2">
              trocar
            </Link>
          </li>
          <li>
            Envio para produção na API Padrão: <strong>{production.enabled && production.customerId ? `ligado (cliente ${production.customerId})` : "simulação (PADRAO_ORDERS_ENABLED / PADRAO_MULTILOJA_CLIENTE_ID)"}</strong>
          </li>
        </ul>
      </section>

      <section className="space-y-3" aria-labelledby="produzir">
        <div className="flex items-baseline justify-between">
          <h2 id="produzir" className="text-xl font-bold">
            Pagos, aguardando produção ({paraProduzir.length})
          </h2>
          <Link href="/admin/pedidos?status=pago" className="font-bold underline-offset-4 hover:underline">
            Ver todos
          </Link>
        </div>
        {paraProduzir.length === 0 ? (
          <p className="rounded-panel bg-white p-6 text-muted shadow-card">Nenhum pedido esperando produção.</p>
        ) : (
          <ul className="divide-y divide-line rounded-panel bg-white px-5 shadow-card">
            {paraProduzir.slice(0, 10).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-3 text-[15px]">
                <Link href={`/admin/pedidos/${p.codigo}`} className="font-bold underline-offset-4 hover:underline">
                  {p.codigo}
                </Link>
                <span className="min-w-0 flex-1 truncate text-muted">
                  {p.lojaNome} · {p.cliente.nome} · pago em {p.pagoEm ? formatDateTime(p.pagoEm) : "—"}
                </span>
                <span className="font-bold tabular-nums">{formatBRL(p.total)}</span>
                <StatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="saques-pendentes">
        <div className="flex items-baseline justify-between">
          <h2 id="saques-pendentes" className="text-xl font-bold">
            Saques para pagar ({saques.length})
          </h2>
          <Link href="/admin/saques" className="font-bold underline-offset-4 hover:underline">
            Abrir saques
          </Link>
        </div>
        {saques.length === 0 && <p className="rounded-panel bg-white p-6 text-muted shadow-card">Nenhum saque pendente.</p>}
      </section>
    </div>
  );
}
