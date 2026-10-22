import { PAYMENT_KINDS, PAYMENT_LABEL, type PaymentKind } from "./core.ts";

/*
 * Quem cobra cada forma de pagamento da multiloja (puro e testado). O admin escolhe um gateway por forma (por
 * exemplo, Pix pela Pagar.me e cartão pela Cielo); "Usar para tudo" põe um gateway em todas as formas que ele sabe
 * cobrar. Cada pedido grava o gateway que o cobrou (pedidos.pagamento_provedor), então consultas, devoluções e
 * cancelamentos de pedidos antigos continuam no gateway de origem depois de qualquer troca.
 */

export const GATEWAY_NAMES = ["efi", "cielo", "pagarme", "simulado"] as const;
export type GatewayName = (typeof GATEWAY_NAMES)[number];

/** Gateway escolhido para uma forma; "desligado" tira a forma do checkout. */
export type Rota = GatewayName | "desligado";
export type Rotas = Record<PaymentKind, Rota>;

export const GATEWAY_LABEL: Record<GatewayName, string> = { efi: "Efí", cielo: "Cielo", pagarme: "Pagar.me", simulado: "Simulação" };

/** Formas que cada gateway cobra nesta integração (a Cielo só cobra cartão com o Link de Pagamento configurado). */
export const FORMAS_DO_GATEWAY: Record<GatewayName, readonly PaymentKind[]> = { efi: PAYMENT_KINDS, cielo: PAYMENT_KINDS, pagarme: ["pix"], simulado: PAYMENT_KINDS };

export const ROTAS_DESLIGADAS: Rotas = { pix: "desligado", boleto: "desligado", cartao: "desligado" };

export function isGatewayName(value: unknown): value is GatewayName {
  return typeof value === "string" && (GATEWAY_NAMES as readonly string[]).includes(value);
}

export function isRota(value: unknown): value is Rota {
  return value === "desligado" || isGatewayName(value);
}

/**
 * Rotas salvas no admin. A configuração antiga (um gateway "ativo" para tudo e as formas ligadas ou desligadas) vira
 * uma rota por forma; sem nada salvo, todas as formas usam `padrao` (MULTILOJA_PAGAMENTO).
 */
export function rotasSalvas(saved: unknown, padrao: Rota): Rotas {
  const s = (saved && typeof saved === "object" ? saved : {}) as { rotas?: Record<string, unknown>; ativo?: unknown; metodos?: Record<string, unknown> };
  const antigo = isRota(s.ativo) ? s.ativo : padrao;
  return Object.fromEntries(
    PAYMENT_KINDS.map((k) => {
      const rota = s.rotas?.[k];
      return [k, isRota(rota) ? rota : s.metodos?.[k] === false ? "desligado" : antigo];
    }),
  ) as Rotas;
}

/** "Usar para tudo": o gateway passa a cobrar todas as formas que sabe cobrar; as outras continuam como estavam. */
export function usarParaTudo(rotas: Rotas, gateway: GatewayName, sabeCobrar: readonly PaymentKind[]): Rotas {
  return Object.fromEntries(PAYMENT_KINDS.map((k) => [k, sabeCobrar.includes(k) ? gateway : rotas[k]])) as Rotas;
}

/**
 * Formas que o checkout oferece: a rota aponta para um gateway pronto (com credenciais) que sabe cobrar aquela forma.
 * `prontos`: as formas que cada gateway configurado sabe cobrar (gateway sem credenciais fica de fora).
 */
export function formasDisponiveis(rotas: Rotas, prontos: Partial<Record<GatewayName, readonly PaymentKind[]>>): PaymentKind[] {
  return PAYMENT_KINDS.filter((k) => {
    const rota = rotas[k];
    return rota !== "desligado" && Boolean(prontos[rota]?.includes(k));
  });
}

/** Gateways que cobram alguma forma agora, na ordem das formas (Pix, boleto, cartão). */
export function gatewaysEmUso(rotas: Rotas, disponiveis: readonly PaymentKind[]): GatewayName[] {
  const usados: GatewayName[] = [];
  for (const k of disponiveis) {
    const rota = rotas[k];
    if (rota !== "desligado" && !usados.includes(rota)) usados.push(rota);
  }
  return usados;
}

const NA_FRASE: Record<PaymentKind, string> = { pix: "Pix", boleto: "boleto", cartao: "cartão de crédito" };

/** "Pix, boleto e cartão de crédito" (formas no meio de uma frase). */
export function listaFormas(formas: readonly PaymentKind[]): string {
  const nomes = formas.map((k) => NA_FRASE[k]);
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}` : (nomes[0] ?? "");
}

/** "Pix pela Pagar.me · Cartão de crédito pela Cielo · Boleto desligado" (resumo do admin). */
export function resumoRotas(rotas: Rotas, disponiveis: readonly PaymentKind[]): string {
  return PAYMENT_KINDS.map((k) => {
    const rota = rotas[k];
    if (rota === "desligado" || !disponiveis.includes(k)) return `${PAYMENT_LABEL[k]} desligado`;
    return `${PAYMENT_LABEL[k]} pela ${GATEWAY_LABEL[rota]}`;
  }).join(" · ");
}
