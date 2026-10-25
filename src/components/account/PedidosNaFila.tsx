import { formatBRL } from "@/lib/format";
import type { EntradaFila } from "@/lib/fila-pedidos/repo";
import type { EtapaFila } from "@/lib/fila-pedidos/regras";
import { formatDateTime } from "@/lib/multiloja/core";

const SITUACAO: Record<EtapaFila, string> = {
  pendente: "Aguardando a conexão com a produção (envio automático)",
  enviando: "Enviando para a produção",
  conferir: "Em conferência pela equipe",
  enviado: "Enviado à produção",
  simulado: "Simulação (não enviado)",
  cancelado: "Cancelado",
};

/**
 * Pedidos do cliente guardados na fila do site (src/lib/fila-pedidos): a API da Padrão não recebeu ou não confirmou
 * na hora. Mostra o protocolo e a situação até o pedido ganhar o número da Padrão (e alguns dias depois).
 */
export function PedidosNaFila({ entradas }: { entradas: EntradaFila[] }) {
  if (!entradas.length) return null;
  return (
    <section aria-labelledby="pedidos-na-fila" className="mt-6 rounded-card border border-line-strong bg-white p-5">
      <h2 id="pedidos-na-fila" className="text-[17px] font-bold">
        Pedidos recebidos pelo site
      </h2>
      <p className="mt-1 text-caption text-muted">Pedidos que o site guardou porque o sistema de produção não respondeu na hora. Eles vão sozinhos (ou pela nossa equipe) e ganham o número do pedido abaixo.</p>
      <ul className="mt-4 divide-y divide-line">
        {entradas.map((e) => (
          <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-sm">
            <span className="font-bold tabular-nums">{e.protocolo}</span>
            <span className="text-muted">{formatDateTime(e.criadoEm)}</span>
            <span className="min-w-0 flex-1">
              {SITUACAO[e.etapa]}
              {e.numeroPedido ? ` · pedido nº ${e.numeroPedido}` : ""}
            </span>
            <span className="text-muted">
              {e.pedido.items.length} {e.pedido.items.length === 1 ? "item" : "itens"}
            </span>
            <span className="font-semibold tabular-nums">{formatBRL(e.total)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
