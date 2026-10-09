import type { Metadata } from "next";
import { formatPhone } from "@/lib/api/validation";
import { formatBRL } from "@/lib/format";
import { requirePainel } from "@/lib/multiloja/auth";
import { formatDateTime, whatsappLink } from "@/lib/multiloja/core";
import { listClientes } from "@/lib/multiloja/repo-vendas";

export const metadata: Metadata = { title: "Clientes" };

export default async function PainelClientes() {
  const { loja } = await requirePainel();
  const clientes = listClientes(loja.id);
  const compradores = clientes.filter((c) => c.pagos > 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-title">Clientes</h1>
        <p className="mt-1 text-muted">
          {clientes.length} {clientes.length === 1 ? "pessoa fez" : "pessoas fizeram"} pedido na loja; {compradores} com pagamento confirmado. Use os contatos só para falar sobre os pedidos e novidades da loja.
        </p>
      </div>
      {clientes.length === 0 ? (
        <p className="rounded-panel bg-white p-10 text-center text-muted shadow-card">Os clientes aparecem aqui depois do primeiro pedido.</p>
      ) : (
        <div className="overflow-x-auto rounded-panel bg-white shadow-card">
          <table className="w-full min-w-[680px] text-left text-[15px]">
            <thead className="border-b border-line text-caption text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Cliente</th>
                <th className="px-4 py-3 font-semibold">Contato</th>
                <th className="px-4 py-3 text-right font-semibold">Pedidos</th>
                <th className="px-4 py-3 text-right font-semibold">Comprou</th>
                <th className="px-4 py-3 font-semibold">Último pedido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {clientes.map((c) => (
                <tr key={c.email}>
                  <td className="px-4 py-3 font-semibold">{c.nome}</td>
                  <td className="px-4 py-3">
                    <a href={whatsappLink(c.telefone)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                      {formatPhone(c.telefone)}
                    </a>
                    <span className="block text-caption text-muted">{c.email}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.pedidos}
                    {c.pagos !== c.pedidos && <span className="block text-caption text-muted">{c.pagos} pagos</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">{formatBRL(c.total)}</td>
                  <td className="px-4 py-3 text-muted">{formatDateTime(c.ultimo, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
