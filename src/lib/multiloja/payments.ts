import "server-only";

import { paymentSettings } from "./config";
import type { PaymentKind } from "./core";
import { cieloGateway } from "./gateways/cielo";
import { efiGateway } from "./gateways/efi";
import { pagarmeGateway } from "./gateways/pagarme";
import { simuladoGateway } from "./gateways/simulado";
import { errorText, type Charge, type ChargeInput, type ChargeStatus, type Check, type Gateway, type GatewayResult, type OrderPayment } from "./gateways/types";
import { formasDisponiveis, GATEWAY_LABEL, gatewaysEmUso, isGatewayName, resumoRotas, type GatewayName, type Rotas } from "./pagamento-rotas";

/*
 * Pagamentos da multiloja: cada forma (Pix, boleto, cartão) tem o seu gateway, escolhido no admin → Pagamentos
 * (pagamento-rotas.ts). Cada pedido grava o gateway que o cobrou, e consultas, devoluções e cancelamentos vão sempre
 * para esse gateway. Os gateways ficam em ./gateways (Efí, Cielo, Pagar.me, simulado), todos com o mesmo contrato
 * (types.ts).
 */

export { efiMockActive, pixWebhookUrl, registerPixWebhook, sandboxTestPix } from "./gateways/efi";
export type { Check, ChargeStatus, GatewayResult } from "./gateways/types";

export const GATEWAYS: Record<GatewayName, Gateway> = { efi: efiGateway, cielo: cieloGateway, pagarme: pagarmeGateway, simulado: simuladoGateway };

export function gatewayByName(name: string): Gateway | null {
  return isGatewayName(name) ? GATEWAYS[name] : null;
}

/** Rotas do admin e as formas que dá para cobrar agora (gateway com credenciais que sabe cobrar a forma). */
async function rotasProntas(): Promise<{ rotas: Rotas; disponiveis: PaymentKind[] }> {
  const { rotas } = await paymentSettings();
  const usados = [...new Set(Object.values(rotas))].filter(isGatewayName);
  const prontos = Object.fromEntries(await Promise.all(usados.map(async (name) => [name, (await GATEWAYS[name].configured()) ? await GATEWAYS[name].methods() : []] as const)));
  return { rotas, disponiveis: formasDisponiveis(rotas, prontos) };
}

/** Formas oferecidas no checkout (vazio = pagamento online desligado: o pedido vai pelo WhatsApp da loja). */
export async function availableMethods(): Promise<PaymentKind[]> {
  return (await rotasProntas()).disponiveis;
}

/** Gateway que cobra a forma nos pedidos novos (null = forma desligada ou gateway sem credenciais). */
export async function gatewayFor(method: PaymentKind): Promise<Gateway | null> {
  const { rotas, disponiveis } = await rotasProntas();
  const rota = rotas[method];
  return rota !== "desligado" && disponiveis.includes(method) ? GATEWAYS[rota] : null;
}

export async function createCharge(method: PaymentKind, input: ChargeInput): Promise<{ provider: GatewayName; charge: Charge }> {
  const gateway = await gatewayFor(method);
  if (!gateway) throw new Error("Forma de pagamento indisponível.");
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

/** Resumo para o menu e a visão geral do admin: quem cobra o quê. */
export async function paymentSummary(): Promise<{ label: string; live: boolean; detail: string }> {
  const { rotas, disponiveis } = await rotasProntas();
  const usados = gatewaysEmUso(rotas, disponiveis);
  if (!usados.length) return { label: "desligado", live: false, detail: "Desligado (pedidos pelo WhatsApp)" };
  return {
    label: usados.map((g) => (g === "simulado" ? "simulação" : GATEWAY_LABEL[g])).join(" + "),
    live: !usados.includes("simulado"),
    detail: resumoRotas(rotas, disponiveis),
  };
}

export type GatewayStatus = { name: GatewayName; label: string; methods: readonly PaymentKind[]; configured: boolean; cobrando: PaymentKind[]; checks: Check[] };

/** Situação de cada gateway para o admin (o diagnóstico chama as APIs só dos que têm credenciais). */
export async function gatewaysOverview(): Promise<{ rotas: Rotas; disponiveis: PaymentKind[]; gateways: GatewayStatus[] }> {
  const { rotas, disponiveis } = await rotasProntas();
  const gateways = await Promise.all(
    (Object.values(GATEWAYS) as Gateway[]).map(async (g) => ({
      name: g.name,
      label: g.label,
      methods: await g.methods(),
      configured: await g.configured(),
      cobrando: disponiveis.filter((k) => rotas[k] === g.name),
      checks: await g.diagnostics().catch((error) => [{ label: "Diagnóstico", ok: false, detail: errorText(error) }]),
    })),
  );
  return { rotas, disponiveis, gateways };
}
