import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader, Sheet, control, table } from "@/components/admin/ui";
import StatusBadge from "@/components/painel/StatusBadge";
import { cx } from "@/components/ui/cx";
import { formatBRL } from "@/lib/format";
import { ORDER_STATUSES, ORDER_STATUS_LABEL, PAYMENT_LABEL, formatDateTime, isOrderStatus, type OrderStatus } from "@/lib/multiloja/core";
import { getLoja } from "@/lib/multiloja/repo";
import { countPedidosByStatus, listPedidos } from "@/lib/multiloja/repo-vendas";

export const metadata: Metadata = { title: "Pedidos" };

const GATEWAY: Record<string, string> = { efi: "Efí", cielo: "Cielo", simulado: "teste" };

function tabHref(status: OrderStatus | "", busca: string, loja: number | null) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (busca) params.set("busca", busca);
  if (loja) params.set("loja", String(loja));
  const query = params.toString();
  return `/admin/pedidos${query ? `?${query}` : ""}`;
}

export default async function AdminPedidos(props: PageProps<"/admin/pedidos">) {
  const search = await props.searchParams;
  const status = typeof search.status === "string" && isOrderStatus(search.status) ? search.status : "";
  const busca = typeof search.busca === "string" ? search.busca.trim().slice(0, 60) : "";
  const loja = typeof search.loja === "string" && /^\d+$/.test(search.loja) ? await getLoja(Number(search.loja)) : null;
  const pedidos = await listPedidos({ status, busca, lojaId: loja?.id, limite: 500 });
  const counts = await countPedidosByStatus(loja?.id);
  const total = Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);
  const tabs: { value: OrderStatus | ""; label: string; count: number }[] = [{ value: "", label: "Todos", count: total }, ...ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s], count: counts[s] ?? 0 }))];

  return (
    <div className="space-y-6">
      <PageHeader
        group="Operação"
        title={loja ? `Pedidos · ${loja.nome}` : "Pedidos"}
        description={
          loja ? (
            <Link href={tabHref(status, busca, null)} className="font-semibold text-ink underline underline-offset-2">
              Ver os pedidos de todas as lojas
            </Link>
          ) : (
            "Todos os pedidos das multilojas. Os pagos esperam o envio para a produção na Padrão."
          )
        }
      />

      <Sheet flush>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <nav aria-label="Filtrar por status" className="-mx-1 flex flex-wrap gap-1">
            {tabs.map((t) => {
              const active = t.value === status;
              return (
                <Link
                  key={t.value || "todos"}
                  href={tabHref(t.value, busca, loja?.id ?? null)}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors",
                    active ? "bg-ink text-white" : "text-muted hover:bg-mist hover:text-ink",
                    !active && t.count === 0 && "opacity-60",
                  )}
                >
                  {t.label}
                  <span className={cx("tabular-nums", active ? "text-white/70" : t.value === "pago" && t.count > 0 ? "font-bold text-coral-700" : "")}>{t.count}</span>
                </Link>
              );
            })}
          </nav>
          <form className="flex w-full items-center gap-2 sm:w-auto">
            {status && <input type="hidden" name="status" value={status} />}
            {loja && <input type="hidden" name="loja" value={loja.id} />}
            <label htmlFor="busca" className="sr-only">
              Buscar pedido
            </label>
            <input id="busca" name="busca" type="search" defaultValue={busca} placeholder="Código, cliente ou e-mail" className={cx(control, "w-full sm:w-64")} />
            <button type="submit" className="h-10 rounded-control bg-ink px-4 text-[14px] font-bold text-white transition-colors hover:bg-coral-700">
              Buscar
            </button>
          </form>
        </div>

        {pedidos.length === 0 ? (
          <Empty>{busca ? `Nenhum pedido encontrado para “${busca}”.` : "Nenhum pedido aqui."}</Empty>
        ) : (
          <div className={table.wrap}>
            <table className={cx(table.table, "min-w-[880px]")}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Pedido</th>
                  <th className={table.th}>Loja</th>
                  <th className={table.th}>Cliente</th>
                  <th className={table.th}>Pagamento</th>
                  <th className={cx(table.th, "text-right")}>Total</th>
                  <th className={cx(table.th, "text-right")}>Custo Padrão</th>
                  <th className={cx(table.th, "text-right")}>Comissão</th>
                  <th className={table.th}>Status</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {pedidos.map((p) => (
                  <tr key={p.id} className={table.row}>
                    <td className={cx(table.td, "whitespace-nowrap")}>
                      <Link href={`/admin/pedidos/${p.codigo}`} className="font-bold underline-offset-4 hover:underline">
                        {p.codigo}
                      </Link>
                      <span className="block text-[12px] text-muted">{formatDateTime(p.criadoEm)}</span>
                    </td>
                    <td className={cx(table.td, "whitespace-nowrap")}>
                      <span className="font-semibold">{p.lojaNome}</span>
                      <span className="block text-[12px] text-muted">{p.lojaSubdominio}</span>
                    </td>
                    <td className={table.td}>{p.cliente.nome}</td>
                    <td className={cx(table.td, "whitespace-nowrap")}>
                      {PAYMENT_LABEL[p.formaPagamento]}
                      {p.pagamentoProvedor && GATEWAY[p.pagamentoProvedor] && <span className="block text-[12px] text-muted">{GATEWAY[p.pagamentoProvedor]}</span>}
                    </td>
                    <td className={cx(table.num, "font-bold")}>{formatBRL(p.total)}</td>
                    <td className={cx(table.num, "text-muted")}>{formatBRL(p.custoBase)}</td>
                    <td className={table.num}>{formatBRL(p.comissao)}</td>
                    <td className={table.td}>
                      <StatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Sheet>
    </div>
  );
}
