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
  const pedido = getPedidoByCodigo(codigo);
  if (!pedido) notFound();
  const loja = getLoja(pedido.lojaId);
  return (
    <div className="space-y-4">
      <Link href="/admin/pedidos" className="text-[15px] font-semibold underline-offset-4 hover:underline">
        ← Pedidos
      </Link>
      <OrderDetail pedido={pedido} itens={listItens(pedido.id)} eventos={listEventos(pedido.id)} lojaNome={loja?.nome} actions={<AdminOrderActions codigo={pedido.codigo} status={pedido.status} />} />
    </div>
  );
}
