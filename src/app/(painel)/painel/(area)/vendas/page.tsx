import type { Metadata } from "next";
import Link from "next/link";
import StatusBadge from "@/components/painel/StatusBadge";
import { cx } from "@/components/ui/cx";
import { formatBRL } from "@/lib/format";
import { requirePainel } from "@/lib/multiloja/auth";
import { ORDER_STATUSES, ORDER_STATUS_LABEL, PAYMENT_LABEL, formatDateTime, isOrderStatus, sqlDaysAgo } from "@/lib/multiloja/core";
import { listPedidos, salesSummary } from "@/lib/multiloja/repo-vendas";

export const metadata: Metadata = { title: "Vendas" };

export default async function PainelVendas(props: PageProps<"/painel/vendas">) {
  const { loja } = await requirePainel();
  const search = await props.searchParams;
  const status = typeof search.status === "string" && isOrderStatus(search.status) ? search.status : "";
  const busca = typeof search.busca === "string" ? search.busca.trim().slice(0, 60) : "";
  const pedidos = await listPedidos({ lojaId: loja.id, status, busca, limite: 300 });
  const mes = await salesSummary(loja.id, sqlDaysAgo(30));

  const cards = [
    { label: "Pedidos (30 dias)", value: String(mes.pedidos) },
    { label: "Pagos (30 dias)", value: String(mes.pagos) },
    { label: "Faturamento (30 dias)", value: formatBRL(mes.faturamento) },
    { label: "Sua comissão (30 dias)", value: formatBRL(mes.comissao) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-title">Vendas</h1>
        <p className="mt-1 text-muted">Os pedidos da sua loja. A Padrão Color produz, embala e entrega; o status muda aqui sozinho.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-panel bg-white p-4 shadow-card">
            <p className="text-caption font-semibold text-muted">{c.label}</p>
            <p className="mt-1 text-2xl font-black tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-panel bg-white p-4 shadow-card">
        <div className="min-w-48 flex-1">
          <label htmlFor="busca" className="mb-1 block text-caption font-semibold text-muted">
            Buscar
          </label>
          <input id="busca" name="busca" defaultValue={busca} placeholder="Código, nome ou e-mail" className="h-11 w-full rounded-full border border-line bg-mist px-4 text-[15px]" />
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-caption font-semibold text-muted">
            Status
          </label>
          <select id="status" name="status" defaultValue={status} className="h-11 rounded-full border border-line bg-white px-4 text-[15px]">
            <option value="">Todos</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="h-11 rounded-full bg-ink px-6 text-[15px] font-bold text-white hover:bg-coral-700">
          Filtrar
        </button>
      </form>

      {pedidos.length === 0 ? (
        <div className="rounded-panel bg-white p-10 text-center shadow-card">
          <p className="text-lg font-bold">{busca || status ? "Nenhum pedido com esse filtro." : "Ainda não há pedidos."}</p>
          {!busca && !status && <p className="mt-2 text-muted">Divulgue o link da loja: os pedidos aparecem aqui assim que forem feitos.</p>}
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-panel bg-white shadow-card">
          <table className="w-full min-w-[720px] text-left text-[15px]">
            <thead className="border-b border-line text-caption text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Pedido</th>
                <th className="px-4 py-3 font-semibold">Cliente</th>
                <th className="px-4 py-3 font-semibold">Pagamento</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 text-right font-semibold">Comissão</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {pedidos.map((p) => (
                <tr key={p.id} className="hover:bg-mist/60">
                  <td className="px-4 py-3">
                    <Link href={`/painel/vendas/${p.codigo}`} className="font-bold underline-offset-4 hover:underline">
                      {p.codigo}
                    </Link>
                    <span className="block text-caption text-muted">{formatDateTime(p.criadoEm)}</span>
                  </td>
                  <td className="px-4 py-3">
                    {p.cliente.nome}
                    <span className="block text-caption text-muted">{p.ref ? `via link “${p.ref}”` : p.cliente.email}</span>
                  </td>
                  <td className="px-4 py-3">{PAYMENT_LABEL[p.formaPagamento]}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatBRL(p.total)}</td>
                  <td className={cx("px-4 py-3 text-right font-bold tabular-nums", (p.status === "cancelado" || p.status === "expirado") && "text-muted line-through")}>{formatBRL(p.comissao)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
