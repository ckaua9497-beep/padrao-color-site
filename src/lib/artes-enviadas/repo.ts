import "server-only";

import { getDb } from "../multiloja/db";
import { temArtes, type ArquivoArte, type ArtesDoItem, type Reenvio } from "./regras";

/*
 * Banco das "Artes enviadas" (regras em regras.ts): tabela `artes_pedido` (migração 6). Um registro por pedido do site
 * (os itens em JSON, na ordem dos produtos) e um por reenvio de arte. O pedido que ficou na fila do site é achado pelo
 * protocolo: o número da compra vem de pedidos_fila quando a fila envia.
 */

type Linha = { compra: string | null; pedido: string | null; itens: string; criado_em: string };

/** Lista gravada em `itens` (os itens do pedido, ou o arquivo do reenvio). */
function lista<T>(texto: string): T[] {
  try {
    const valor = JSON.parse(texto) as unknown;
    return Array.isArray(valor) ? (valor as T[]) : [];
  } catch {
    return [];
  }
}

/** Grava o que o cliente mandou num pedido (número da compra, ou o protocolo da fila). Sem arte nenhuma, não grava. */
export async function guardarArtesDoPedido({ clienteId, compra, protocolo, itens }: { clienteId: number; compra?: number | null; protocolo?: string | null; itens: ArtesDoItem[] }) {
  if (!itens.some(temArtes) || (!compra && !protocolo)) return;
  const db = await getDb();
  await db.run(`INSERT INTO artes_pedido (cliente_id, compra, protocolo, itens) VALUES (?, ?, ?, ?)`, [clienteId, compra ? String(compra) : null, protocolo ?? null, JSON.stringify(itens)]);
}

/** Grava um reenvio de arte do item (pedido) pelo Meus pedidos. */
export async function guardarReenvio({ clienteId, pedido, arquivo }: { clienteId: number; pedido: number; arquivo: ArquivoArte }) {
  const db = await getDb();
  await db.run(`INSERT INTO artes_pedido (cliente_id, pedido, itens) VALUES (?, ?, ?)`, [clienteId, String(pedido), JSON.stringify([arquivo])]);
}

export type ArtesDoCliente = {
  /** Número da compra → o que o cliente mandou em cada item (na ordem dos produtos). */
  compras: Map<string, ArtesDoItem[]>;
  /** Número do pedido (item) → reenvios, do mais antigo ao mais novo. */
  reenvios: Map<string, Reenvio[]>;
};

/** Artes dos pedidos recentes do cliente (os últimos 300 registros). */
export async function artesDoCliente(clienteId: number): Promise<ArtesDoCliente> {
  const db = await getDb();
  const linhas = await db.all<Linha>(
    `SELECT COALESCE(a.compra, f.numero_pedido) AS compra, a.pedido, a.itens, a.criado_em
       FROM artes_pedido a LEFT JOIN pedidos_fila f ON a.protocolo IS NOT NULL AND f.protocolo = a.protocolo
      WHERE a.cliente_id = ? ORDER BY a.id DESC LIMIT 300`,
    [clienteId],
  );
  const compras = new Map<string, ArtesDoItem[]>();
  const reenvios = new Map<string, Reenvio[]>();
  for (const linha of linhas.reverse()) {
    if (linha.pedido) {
      const [arquivo] = lista<ArquivoArte>(linha.itens);
      if (arquivo) reenvios.set(linha.pedido, [...(reenvios.get(linha.pedido) ?? []), { arquivo, em: linha.criado_em }]);
    } else if (linha.compra) compras.set(linha.compra, lista<ArtesDoItem>(linha.itens));
  }
  return { compras, reenvios };
}
