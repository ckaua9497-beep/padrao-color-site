import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CopyLink from "@/components/painel/CopyLink";
import OrderDetail from "@/components/painel/OrderDetail";
import { requirePainel } from "@/lib/multiloja/auth";
import { getPedidoByCodigo, listEventos, listItens } from "@/lib/multiloja/repo-vendas";
import { lojaUrl } from "@/lib/multiloja/tenant";

export const metadata: Metadata = { title: "Pedido" };

export default async function PainelPedido(props: PageProps<"/painel/vendas/[codigo]">) {
  const { loja } = await requirePainel();
  const { codigo } = await props.params;
  const pedido = getPedidoByCodigo(codigo);
  // Pedido de outra loja: 404, sem dizer que existe.
  if (!pedido || pedido.lojaId !== loja.id) notFound();
  const link = `${await lojaUrl(loja)}/pedido/${pedido.codigo}?t=${pedido.token}`;

  return (
    <div className="space-y-4">
      <Link href="/painel/vendas" className="text-[15px] font-semibold underline-offset-4 hover:underline">
        ← Vendas
      </Link>
      <OrderDetail
        pedido={pedido}
        itens={listItens(pedido.id)}
        eventos={listEventos(pedido.id)}
        actions={
          <div className="flex flex-col items-start gap-1">
            <CopyLink url={link} label="Copiar link do pedido para o cliente" />
            <p className="max-w-xs text-caption text-muted">É a página onde o cliente paga, acompanha e envia a arte.</p>
          </div>
        }
      />
    </div>
  );
}
