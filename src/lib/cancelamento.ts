import type { ApiPedido, ApiPedidoItem, ApiSituacao } from "./api/types";
import { formatBRL } from "./format.ts";

/*
 * Cancelamento pelo cliente em "Meus pedidos" (puro, testado). Rotas: /api/pedidos/compra/[id]/cancelar (a compra
 * inteira, POST /cancelarcompra) e /api/pedidos/[id]/cancelar (um item, POST /cancelarpedido).
 * - Prazo: até 15 min depois de a compra ser finalizada (data e hora da compra no GET /pedidos, horário de Brasília).
 *   Depois disso, só pelo atendimento. Compra da multiloja não cancela por aqui (o estorno é do gateway da loja).
 * - O cliente cancela um item ou todos os que ainda podem ser cancelados (sem os cancelados, entregues, expedidos…).
 * - Estorno de acordo com o valor pago: cada item leva a parte dele (valor do item ÷ soma dos itens) do crédito usado e
 *   do valor pago. A parte em créditos Padrão Color volta sozinha para a conta corrente; a paga em Pix ou cartão é
 *   estornada pela Padrão na forma de pagamento.
 * Premissas a confirmar com a Padrão (trocar aqui):
 * - `valor_pago` é o que entrou fora do crédito (sem o `credito_usado` e sem o cupom);
 * - o POST /cancelarcompra e o /cancelarpedido devolvem o crédito usado à conta corrente sem outro campo.
 */

export const MINUTOS_PARA_CANCELAR = 15;

const round2 = (value: number) => Math.round(value * 100) / 100;
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0);

/** Momento da compra em ms: data "DD/MM/AAAA" e hora "HH:MM[:SS]" de Brasília (UTC−3 o ano todo desde 2019). */
export function momentoDaCompra(compra: Pick<ApiPedido, "data" | "hora">): number | null {
  const dia = /^\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(compra.data ?? "");
  const hora = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(compra.hora ?? "");
  if (!dia || !hora) return null;
  const [d, m, y] = [Number(dia[1]), Number(dia[2]), Number(dia[3])];
  const t = Date.UTC(y, m - 1, d, Number(hora[1]) + 3, Number(hora[2]), Number(hora[3] ?? 0));
  const volta = new Date(t - 3 * 3_600_000);
  return volta.getUTCDate() === d && volta.getUTCMonth() === m - 1 ? t : null;
}

const textoDa = (situacao: Partial<ApiSituacao> | undefined) => `${situacao?.descricao ?? ""} ${situacao?.status ?? ""}`.toLowerCase();

export const itemCancelado = (situacao: Partial<ApiSituacao> | undefined) => /cancel/.test(textoDa(situacao));

/** Situações finais não deixam cancelar (a API recusa de qualquer forma, com o motivo). */
export function itemCancelavel(situacao: Partial<ApiSituacao> | undefined): boolean {
  return !/cancel|entregue|conclu|finaliz|retirad|expedid|enviad|despachad|em rota/.test(textoDa(situacao));
}

export type JanelaDeCancelamento = {
  /** Ainda dá para cancelar pelo site. */
  aberta: boolean;
  /** Fim do prazo (ms) e a hora dele em Brasília ("14:35"); null quando a data da compra não é legível. */
  ate: number | null;
  ateHora: string | null;
  /** Pedidos (itens) que ainda podem ser cancelados. */
  itens: number[];
};

const horaDeBrasilia = (t: number) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(t);

export function janelaDeCancelamento(compra: ApiPedido, agora = Date.now()): JanelaDeCancelamento {
  const inicio = momentoDaCompra(compra);
  const ate = inicio === null ? null : inicio + MINUTOS_PARA_CANCELAR * 60_000;
  const itens = compra.multiloja === "Sim" ? [] : (compra.itens ?? []).filter((item) => itemCancelavel(item.situacao)).map((item) => item.pedido);
  return { aberta: ate !== null && agora < ate && itens.length > 0, ate, ateHora: ate === null ? null : horaDeBrasilia(ate), itens };
}

export type Estorno = {
  /** Volta para a conta corrente (créditos Padrão Color), automaticamente. */
  credito: number;
  /** Pago em Pix ou cartão: estornado pela Padrão na forma de pagamento. */
  pagamento: number;
  total: number;
  forma: string;
};

/** Estorno dos pedidos (itens) escolhidos: a parte de cada um no crédito usado e no valor pago. */
export function estornoDe(compra: ApiPedido, pedidos: readonly number[]): Estorno {
  const itens: Partial<ApiPedidoItem>[] = compra.itens ?? [];
  const escolhidos = new Set(pedidos);
  const valores = itens.map((item) => Math.max(0, num(item.valor?.total)));
  const base = valores.reduce((sum, value) => sum + value, 0);
  const parte = itens.reduce((sum, item, i) => (escolhidos.has(item.pedido ?? -1) ? sum + (base > 0 ? valores[i] / base : 1 / itens.length) : sum), 0);
  const share = Math.min(1, parte);
  const credito = round2(Math.max(0, num(compra.credito_usado)) * share);
  const pagamento = round2(Math.max(0, num(compra.valor_pago)) * share);
  return { credito, pagamento, total: round2(credito + pagamento), forma: compra.pagamento?.tipo?.trim() ?? "" };
}

/** Frases do estorno para a confirmação e a resposta do cancelamento. */
export function textoDoEstorno(estorno: Estorno): string[] {
  if (estorno.total <= 0) return ["Nenhum valor foi pago ainda: não há estorno."];
  const linhas: string[] = [];
  if (estorno.credito > 0) linhas.push(`${formatBRL(estorno.credito)} voltam automaticamente como crédito Padrão Color na sua conta corrente.`);
  if (estorno.pagamento > 0) linhas.push(`${formatBRL(estorno.pagamento)} pagos${estorno.forma ? ` via ${estorno.forma}` : ""} são estornados pela Padrão Color na mesma forma de pagamento.`);
  return linhas;
}

/** A compra não está entre as de ontem e de hoje no GET /pedidos (antiga, ou ainda não apareceu na lista). */
export const COMPRA_FORA_DA_LISTA = `Não encontramos esta compra entre as de hoje. Se você acabou de finalizar, tente de novo em instantes: o cancelamento pelo site vale até ${MINUTOS_PARA_CANCELAR} minutos depois da compra. Depois disso, fale com o atendimento.`;

/** Recusa quando o prazo passou ou não há item para cancelar (a mesma no servidor e na tela). */
export function motivoSemCancelamento(compra: ApiPedido, janela: JanelaDeCancelamento): string {
  if (compra.multiloja === "Sim") return "Esta compra foi feita em uma loja parceira: o cancelamento é pela loja.";
  if (!janela.itens.length) return "Esta compra não tem mais itens que possam ser cancelados.";
  return `O cancelamento pelo site vale até ${MINUTOS_PARA_CANCELAR} minutos depois da compra${janela.ateHora ? ` (terminou às ${janela.ateHora})` : ""}. Para cancelar agora, fale com o atendimento.`;
}
