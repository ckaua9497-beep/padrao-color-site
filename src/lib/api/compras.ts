import "server-only";

import { brasiliaClock } from "../dias-uteis";
import { getPedidos } from "./padrao";
import type { ApiPedido } from "./types";

/*
 * Compra recente do cliente logado, para conferir no servidor o prazo de cancelamento (cancelamento.ts): GET /pedidos
 * de ontem e de hoje (Brasília; os 15 min podem passar da meia-noite), com o token do cliente. Acha pela compra ou por
 * um dos pedidos (itens) dela. null = não está entre as compras desses dois dias.
 */

const POR_PAGINA = 50;
const PAGINAS = 4;

export async function compraRecente(token: string, alvo: { compra: number } | { pedido: number }, now = new Date()): Promise<ApiPedido | null> {
  const hoje = brasiliaClock(now).iso;
  const ontem = brasiliaClock(new Date(now.getTime() - 86_400_000)).iso;
  for (let pag = 1; pag <= PAGINAS; pag += 1) {
    const result = await getPedidos({ dataInicial: ontem, dataFinal: hoje, pag, reg: POR_PAGINA }, token);
    const compras = result?.pedidos ?? [];
    // O número que o checkout mostra é o da compra; se o /gerarpedido devolveu o de um pedido, acha por ele também.
    const numero = "compra" in alvo ? alvo.compra : alvo.pedido;
    const porItem = compras.find((c) => (c.itens ?? []).some((item) => item.pedido === numero));
    const achada = "compra" in alvo ? (compras.find((c) => c.compra === numero) ?? porItem) : porItem;
    if (achada) return achada;
    if (pag >= (result?.paginas ?? 1) || compras.length < POR_PAGINA) break;
  }
  return null;
}
