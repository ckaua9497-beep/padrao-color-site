import type { ChargeInput, ChargeStatus } from "./types";

/*
 * Pagar.me, API v5 (docs.pagar.me, conferido em 2026-10-09): os dados do Pix, puros e testados. As chamadas ficam em
 * pagarme.ts.
 *   POST /core/v5/orders com payments [{ payment_method: "pix", pix: { expires_in } }] → charges[0].last_transaction
 *     traz qr_code (copia e cola), qr_code_url (imagem) e expires_at.
 *   GET /core/v5/charges/{id} → status da cobrança (pending, paid, canceled, failed…).
 *   DELETE /core/v5/charges/{id} → cancela o Pix em aberto ou devolve o pago.
 * O Pix exige o cliente com nome, e-mail, documento e telefone. Avisos (webhooks): {id, type, created_at, data}, com a
 * cobrança em data (charge.*) ou o pedido com data.charges (order.*).
 */

export const PIX_EXPIRA_SEG = 60 * 60;

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Obj) : null);
const str = (value: unknown): string | undefined => (typeof value === "string" && value ? value : undefined);
const digits = (value: string) => value.replace(/\D/g, "");

/** Celular no formato da Pagar.me (DDD e número; tira o 55 da frente). Null quando não tem 10 ou 11 dígitos. */
export function telefonePagarme(telefone: string): { country_code: string; area_code: string; number: string } | null {
  let d = digits(telefone);
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return null;
  return { country_code: "55", area_code: d.slice(0, 2), number: d.slice(2) };
}

/** Corpo do POST /orders: um item com o total do pedido e o Pix com validade. */
export function pedidoPixPagarme(input: ChargeInput, expiraSeg = PIX_EXPIRA_SEG) {
  const documento = digits(input.cliente.documento);
  const empresa = documento.length === 14;
  const celular = telefonePagarme(input.cliente.telefone);
  const e = input.entrega;
  const centavos = Math.round(input.total * 100);
  return {
    code: input.codigo,
    items: [{ code: input.codigo, description: input.descricao.slice(0, 256), amount: centavos, quantity: 1 }],
    customer: {
      name: input.cliente.nome.trim().slice(0, 64),
      email: input.cliente.email.trim().slice(0, 64),
      type: empresa ? "company" : "individual",
      document: documento,
      document_type: empresa ? "CNPJ" : "CPF",
      ...(celular ? { phones: { mobile_phone: celular } } : {}),
      ...(e.cep && e.logradouro
        ? {
            address: {
              // A Pagar.me pede "número, rua, bairro" na primeira linha.
              line_1: [e.numero || "S/N", e.logradouro, e.bairro].filter(Boolean).join(", ").slice(0, 256),
              ...(e.complemento ? { line_2: e.complemento.slice(0, 128) } : {}),
              zip_code: digits(e.cep),
              city: e.cidade.slice(0, 64),
              state: e.estado,
              country: "BR",
            },
          }
        : {}),
    },
    payments: [{ payment_method: "pix", pix: { expires_in: expiraSeg, additional_information: [{ name: "Pedido", value: input.codigo }] } }],
    metadata: { pedido: input.codigo },
  };
}

/**
 * Mensagem de erro da Pagar.me: {message, errors: {campo: [...]}} da validação ou gateway_response.errors da
 * transação recusada. Só textos da Pagar.me (sem os dados do cliente).
 */
export function erroPagarme(body: unknown): string {
  const b = obj(body);
  if (!b) return typeof body === "string" ? body.slice(0, 200) : "";
  const parts: string[] = [];
  if (typeof b.message === "string") parts.push(b.message);
  const errors = obj(b.errors);
  if (errors) for (const [campo, msgs] of Object.entries(errors)) parts.push(`${campo}: ${Array.isArray(msgs) ? msgs.join(" ") : String(msgs)}`);
  const charge = obj((b.charges as unknown[] | undefined)?.[0]) ?? b;
  const gateway = obj(obj(charge.last_transaction)?.gateway_response);
  for (const e of (gateway?.errors as unknown[] | undefined) ?? []) {
    const message = str(obj(e)?.message);
    if (message) parts.push(message);
  }
  return parts.join(" — ").slice(0, 300);
}

export type PixCriado = { pedidoId?: string; cobrancaId?: string; qrCode?: string; qrUrl?: string; expiraEm?: string; erro?: string };

/** Resposta do POST /orders: pedido (or_…), cobrança (ch_…), copia e cola, imagem e validade; `erro` se recusou. */
export function pixCriado(body: unknown): PixCriado {
  const order = obj(body);
  const charge = obj((order?.charges as unknown[] | undefined)?.[0]);
  const tx = obj(charge?.last_transaction);
  const qrCode = str(tx?.qr_code);
  const falhou = order?.status === "failed" || charge?.status === "failed" || tx?.status === "failed" || tx?.status === "with_error";
  return {
    pedidoId: str(order?.id),
    cobrancaId: str(charge?.id),
    qrCode,
    qrUrl: str(tx?.qr_code_url),
    expiraEm: str(tx?.expires_at),
    ...(falhou || !qrCode ? { erro: erroPagarme(body) || "a Pagar.me não devolveu o QR Code" } : {}),
  };
}

/** Situação da cobrança (GET /charges/{id}): paga, aberta, ou cancelada/falhou (o cliente pode gerar outro Pix). */
export function situacaoPagarme(body: unknown): ChargeStatus {
  const charge = obj(body);
  const status = str(charge?.status);
  if (status === "paid" || status === "overpaid") {
    const e2eId = str(obj(charge?.last_transaction)?.end_to_end_id);
    return e2eId ? { status: "pago", e2eId } : { status: "pago" };
  }
  if (status === "canceled" || status === "failed") return { status: "expirado" };
  return { status: "pendente" };
}

const CHARGE_ID = /^ch_[A-Za-z0-9]{8,40}$/;

export function isChargeId(value: string): boolean {
  return CHARGE_ID.test(value);
}

/** Cobranças citadas num aviso: charge.* traz a cobrança em `data`; order.* traz o pedido com `data.charges`. */
export function cobrancasDoAviso(body: unknown): string[] {
  const b = obj(body);
  const data = obj(b?.data);
  if (!data) return [];
  const type = str(b?.type) ?? "";
  const ids = type.startsWith("charge.") ? [data.id] : ((data.charges as unknown[] | undefined) ?? []).map((c) => obj(c)?.id);
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && CHARGE_ID.test(id)))].slice(0, 10);
}
