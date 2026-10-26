import "server-only";

import { PAYMENT_METHODS, type PaymentMethod } from "../orders";
import { atualizarPagamento, cancelarCompra } from "./padrao";

/*
 * Pedido real e pagamento.
 *
 * PADRAO_ORDERS_ENABLED (padrão "false"): enquanto não for "true", o checkout roda como SIMULAÇÃO — monta e
 * mostra o payload do POST /gerarpedido, mas não chama a API (nada chega à produção da gráfica).
 *
 * Pagamento: ainda não há gateway (Pix/cartão) integrado; a Padrão não trabalha com boleto. O pedido nasce com o pagamento pendente e a
 * Padrão cobra pelo atendimento. Quando houver gateway, a confirmação chega por notificação dele (webhook com
 * assinatura conferida no servidor) e só então registerPayment → POST /atualizarpagamento. O navegador nunca
 * decide que um pedido está pago: por isso não há rota pública para atualizar pagamento.
 */

export function ordersEnabled(): boolean {
  return process.env.PADRAO_ORDERS_ENABLED === "true";
}

export type GatewayResult = {
  status: string;
  authorizationCode?: string;
  paymentId?: string;
  installments?: number;
  chargeId?: string;
  transactionId?: string;
};

/** POST /atualizarpagamento com o resultado já validado do gateway. */
export function registerPayment({ customerId, order, method, result }: { customerId: number; order: number; method: PaymentMethod; result: GatewayResult }, token?: string) {
  return atualizarPagamento(
    {
      idCliente: customerId,
      order,
      tipo: PAYMENT_METHODS[method].apiType,
      status: result.status,
      codAutorizacao: result.authorizationCode,
      idPagamento: result.paymentId,
      parcelas: result.installments ?? 1,
      idCobranca: result.chargeId,
      idTransacao: result.transactionId,
    },
    token,
  );
}

/** POST /cancelarcompra: o cliente desiste da compra (pagamento recusado ou não feito). */
export function cancelPurchase({ customerId, order, reason }: { customerId: number; order: number; reason: string }, token: string) {
  return cancelarCompra({ idCliente: customerId, order, motivo: reason }, token);
}
