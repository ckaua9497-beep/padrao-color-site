import type { PaymentKind } from "../core";
import type { DeliveryAddress } from "../../orders";
import type { PaymentData } from "../repo-vendas";

/*
 * Contrato de um gateway de pagamento da multiloja. Cada pedido grava o gateway que o cobrou
 * (pedidos.pagamento_provedor): trocar o gateway ativo no admin vale para as cobranças novas, e as antigas
 * continuam sendo consultadas, devolvidas e canceladas no gateway de origem.
 */

export type GatewayName = "efi" | "cielo" | "simulado";

export type ChargeInput = {
  codigo: string;
  total: number;
  cliente: { nome: string; documento: string; email: string; telefone: string };
  entrega: DeliveryAddress;
  descricao: string;
  /** Página do pedido (volta das páginas de pagamento hospedadas). */
  returnUrl: string;
  /** Dias para o boleto vencer. */
  boletoDias: number;
};

export type Charge = { id: string; data: PaymentData };

/** Situação da cobrança consultada no gateway. `e2eId`: Pix recebido (para devolução). */
export type ChargeStatus = { status: "pago" | "pendente" | "expirado"; e2eId?: string };

export type GatewayResult = { ok: true; message: string } | { ok: false; message: string };

export type Check = { label: string; ok: boolean; detail: string };

export type OrderPayment = { codigo: string; total: number; formaPagamento: PaymentKind; pagamentoProvedor: string; pagamentoId: string | null; pagamento: PaymentData };

export interface Gateway {
  name: GatewayName;
  label: string;
  /** Meios que o gateway sabe cobrar. */
  methods: readonly PaymentKind[];
  /** Credenciais completas para cobrar. */
  configured(): boolean;
  create(method: PaymentKind, input: ChargeInput): Promise<Charge>;
  status(chargeId: string): Promise<ChargeStatus>;
  /** Devolve um pagamento já recebido (pedido cancelado). */
  refund(order: OrderPayment): Promise<GatewayResult>;
  /** Invalida uma cobrança ainda não paga (pedido cancelado antes de pagar). */
  void(order: OrderPayment): Promise<GatewayResult>;
  diagnostics(): Promise<Check[]>;
}

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: string,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export function errorText(error: unknown): string {
  if (error instanceof GatewayError) return `${error.message}${error.detail ? `: ${error.detail}` : ""}`;
  return error instanceof Error ? error.message : "erro desconhecido";
}
