import type { Metadata } from "next";
import Link from "next/link";
import StatusBadge from "@/components/painel/StatusBadge";
import { formatBRL } from "@/lib/format";
import { ORDER_STATUSES, ORDER_STATUS_LABEL, PAYMENT_LABEL, formatDateTime, isOrderStatus } from "@/lib/multiloja/core";
import { listPedidos } from "@/lib/multiloja/repo-vendas";

export const metadata: Metadata = { title: "Pedidos" };

export default async function AdminPedidos(props: PageProps<"/admin/pedidos">) {
  const search = await props.searchParams;
  const status = typeof search.status === "string" && isOrderStatus(search.status) ? search.status : "";
  const busca = typeof search.busca === "string" ? search.busca.trim().slice(0, 60) : "";
  const pedidos = listPedidos({ status, busca, limite: 500 });

  return (
    <div className="space-y-6">
      <h1 className="text-title">Pedidos de todas as lojas</h1>
      <form className="flex flex-wrap items-end gap-3 rounded-panel bg-white p-4 shadow-card">
        <div className="min-w-48 flex-1">
          <label htmlFor="busca" className="mb-1 block text-caption font-semibold text-muted">
            Buscar
          </label>
          <input id="busca" name="busca" defaultValue={busca} placeholder="Código, cliente ou e-mail" className="h-11 w-full rounded-full border border-line bg-mist px-4 text-[15px]" />
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
        <p className="rounded-panel bg-white p-10 text-center text-muted shadow-card">Nenhum pedido.</p>
      ) : (
        <div className="relative overflow-x-auto rounded-panel bg-white shadow-card">
          <table className="w-full min-w-[860px] text-left text-[15px]">
            <thead className="border-b border-line text-caption text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Pedido</th>
                <th className="px-4 py-3 font-semibold">Loja</th>
                <th className="px-4 py-3 font-semibold">Cliente</th>
                <th className="px-4 py-3 font-semibold">Pagamento</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 text-right font-semibold">Custo</th>
                <th className="px-4 py-3 text-right font-semibold">Comissão</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {pedidos.map((p) => (
                <tr key={p.id} className="hover:bg-mist/60">
                  <td className="px-4 py-3">
                    <Link href={`/admin/pedidos/${p.codigo}`} className="font-bold underline-offset-4 hover:underline">
                      {p.codigo}
                    </Link>
                    <span className="block text-caption text-muted">{formatDateTime(p.criadoEm)}</span>
                  </td>
                  <td className="px-4 py-3">
                    {p.lojaNome}
                    <span className="block text-caption text-muted">{p.lojaSubdominio}</span>
                  </td>
                  <td className="px-4 py-3">{p.cliente.nome}</td>
                  <td className="px-4 py-3">
                    {PAYMENT_LABEL[p.formaPagamento]}
                    {p.pagamentoProvedor === "simulado" && <span className="block text-caption text-muted">teste</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatBRL(p.total)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatBRL(p.custoBase)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatBRL(p.comissao)}</td>
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
