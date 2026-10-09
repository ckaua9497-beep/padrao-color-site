import type { Metadata } from "next";
import Link from "next/link";
import StatusBadge from "@/components/painel/StatusBadge";
import { formatBRL } from "@/lib/format";
import { formatDateTime, plural, sqlDaysAgo } from "@/lib/multiloja/core";
import { activeProvider } from "@/lib/multiloja/payments";
import { padraoProduction } from "@/lib/multiloja/config";
import { listLojasAdmin, listPedidos, listSaques, salesSummary } from "@/lib/multiloja/repo-vendas";

export const metadata: Metadata = { title: "Visão geral" };

export default async function AdminInicio() {
  const mes = salesSummary(null, sqlDaysAgo(30));
  const paraProduzir = listPedidos({ status: "pago", limite: 50 });
  const saques = listSaques(null).filter((s) => s.status === "solicitado");
  const lojas = listLojasAdmin();
  const provider = activeProvider();
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
            Pagamento online: <strong>{provider === "efi" ? "Efí (real)" : provider === "simulado" ? "simulado (teste, nada é cobrado)" : "desligado (pedidos pelo WhatsApp)"}</strong>
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
