import "server-only";

import { paymentSettings, type ActiveGateway } from "./config";
import { PAYMENT_KINDS, type PaymentKind } from "./core";
import { cieloGateway } from "./gateways/cielo";
import { efiGateway } from "./gateways/efi";
import { simuladoGateway } from "./gateways/simulado";
import { errorText, type Charge, type ChargeInput, type ChargeStatus, type Check, type Gateway, type GatewayName, type GatewayResult, type OrderPayment } from "./gateways/types";

/*
 * Pagamentos da multiloja: escolhe o gateway. O gateway ATIVO (admin → Pagamentos) cobra os pedidos novos; cada
 * pedido grava o gateway que o cobrou, e consultas, devoluções e cancelamentos vão sempre para esse gateway.
 * Os gateways ficam em ./gateways (Efí, Cielo, simulado), todos com o mesmo contrato (types.ts).
 */

export { efiMockActive, pixWebhookUrl, registerPixWebhook, sandboxTestPix } from "./gateways/efi";
export type { Check, ChargeStatus, GatewayResult } from "./gateways/types";

export const GATEWAYS: Record<GatewayName, Gateway> = { efi: efiGateway, cielo: cieloGateway, simulado: simuladoGateway };

export function gatewayByName(name: string): Gateway | null {
  return name in GATEWAYS ? GATEWAYS[name as GatewayName] : null;
}

/** Gateway que cobra os pedidos novos (null = pagamento online desligado ou gateway sem credenciais). */
export async function activeGateway(): Promise<Gateway | null> {
  const { ativo } = await paymentSettings();
  if (ativo === "desligado") return null;
  const gateway = GATEWAYS[ativo];
  return gateway && (await gateway.configured()) ? gateway : null;
}

export async function activeProvider(): Promise<GatewayName | null> {
  return (await activeGateway())?.name ?? null;
}

/** Meios oferecidos no checkout: ligados no admin e suportados pelo gateway ativo. */
export async function availableMethods(): Promise<PaymentKind[]> {
  const gateway = await activeGateway();
  if (!gateway) return [];
  const [{ metodos }, supported] = await Promise.all([paymentSettings(), gateway.methods()]);
  return PAYMENT_KINDS.filter((k) => metodos[k] && supported.includes(k));
}

export async function createCharge(method: PaymentKind, input: ChargeInput): Promise<{ provider: GatewayName; charge: Charge }> {
  const gateway = await activeGateway();
  if (!gateway) throw new Error("Pagamento online desligado.");
  if (!(await availableMethods()).includes(method)) throw new Error("Forma de pagamento indisponível.");
  return { provider: gateway.name, charge: await gateway.create(method, input) };
}

/** Situação da cobrança no gateway que a criou (o aviso só serve de gatilho; quem confirma é esta consulta). */
export async function chargeStatus(provider: string, chargeId: string): Promise<ChargeStatus> {
  const gateway = gatewayByName(provider);
  if (!gateway || provider === "simulado" || !(await gateway.configured())) return { status: "pendente" };
  return gateway.status(chargeId);
}

export async function refundCharge(order: OrderPayment): Promise<GatewayResult> {
  const gateway = gatewayByName(order.pagamentoProvedor);
  if (!gateway) return { ok: false, message: "Gateway do pedido desconhecido." };
  try {
    return await gateway.refund(order);
  } catch (error) {
    return { ok: false, message: errorText(error) };
  }
}

export async function voidCharge(order: OrderPayment): Promise<GatewayResult> {
  const gateway = gatewayByName(order.pagamentoProvedor);
  if (!gateway || !order.pagamentoId) return { ok: true, message: "Sem cobrança aberta." };
  try {
    return await gateway.void(order);
  } catch (error) {
    return { ok: false, message: errorText(error) };
  }
}

export type GatewayStatus = { name: GatewayName; label: string; methods: readonly PaymentKind[]; configured: boolean; active: boolean; checks: Check[] };

/** Situação de cada gateway para o admin (o diagnóstico chama as APIs só dos que têm credenciais). */
export async function gatewaysOverview(): Promise<{ ativo: ActiveGateway; gateways: GatewayStatus[] }> {
  const { ativo } = await paymentSettings();
  const gateways = await Promise.all(
    (Object.values(GATEWAYS) as Gateway[]).map(async (g) => ({
      name: g.name,
      label: g.label,
      methods: await g.methods(),
      configured: await g.configured(),
      active: ativo === g.name,
      checks: await g.diagnostics().catch((error) => [{ label: "Diagnóstico", ok: false, detail: errorText(error) }]),
    })),
  );
  return { ativo, gateways };
}
