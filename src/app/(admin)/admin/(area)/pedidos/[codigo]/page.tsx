import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AdminOrderActions from "@/components/admin/AdminOrderActions";
import OrderDetail from "@/components/painel/OrderDetail";
import { getLoja } from "@/lib/multiloja/repo";
import { getPedidoByCodigo, listEventos, listItens } from "@/lib/multiloja/repo-vendas";

export const metadata: Metadata = { title: "Pedido" };

export default async function AdminPedido(props: PageProps<"/admin/pedidos/[codigo]">) {
  const { codigo } = await props.params;
  const pedido = await getPedidoByCodigo(codigo);
  if (!pedido) notFound();
  const loja = await getLoja(pedido.lojaId);
  return (
    <div className="space-y-4">
      <Link href="/admin/pedidos" className="inline-flex items-center gap-1 text-[13px] font-semibold text-muted underline-offset-4 hover:text-ink hover:underline">
        <span aria-hidden>←</span> Pedidos
      </Link>
      <OrderDetail pedido={pedido} itens={await listItens(pedido.id)} eventos={await listEventos(pedido.id)} lojaNome={loja?.nome} admin actions={<AdminOrderActions codigo={pedido.codigo} status={pedido.status} />} />
    </div>
  );
}
