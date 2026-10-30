/*
 * Créditos Padrão Color no pagamento (revisão da Padrão de 29/10/2026: os créditos pagam a compra no site, sozinhos ou
 * junto com outra forma quando não bastam, como no site antigo: "Usar meus créditos nesta compra" / "Não usar créditos
 * agora"). O crédito é o saldo da conta corrente (GET /contacorrente ou `conta_corrente` do GET /cliente: cliente.ts)
 * menos o bloqueado. O servidor recalcula a divisão no fechamento (fila-pedidos/processar.ts); o navegador só diz se
 * quer usar.
 * Premissas a confirmar com a Padrão: o bloqueado não pode ser usado; no /gerarpedido o crédito vai em `credito_usado`
 * (como no GET /pedidos) e em `pagamento.credito`, e `pagamento.valor` é o que falta pagar na forma escolhida; pago
 * todo em crédito, `pagamento.tipo` = "Crédito".
 */

const centavos = (valor: number) => Math.round(valor * 100) / 100;

/** Crédito que a compra pode usar: o saldo menos o bloqueado, nunca negativo (saldo devedor = sem crédito). */
export function creditoDisponivel(saldo: number | null | undefined, bloqueado?: number | null): number {
  const s = typeof saldo === "number" && Number.isFinite(saldo) ? saldo : 0;
  const b = typeof bloqueado === "number" && Number.isFinite(bloqueado) && bloqueado > 0 ? bloqueado : 0;
  return Math.max(0, centavos(s - b));
}

export type DivisaoPagamento = {
  /** Parte do total paga com os créditos. */
  credito: number;
  /** O que falta pagar na forma escolhida (Pix, cartão ou na retirada); 0 = os créditos pagam tudo. */
  restante: number;
};

/** Quanto do total os créditos pagam e quanto sobra para a forma de pagamento escolhida. */
export function divisaoDoPagamento(total: number, disponivel: number, usar: boolean): DivisaoPagamento {
  const conta = Math.max(0, centavos(total));
  const credito = usar ? Math.min(conta, Math.max(0, centavos(disponivel))) : 0;
  return { credito, restante: centavos(conta - credito) };
}
