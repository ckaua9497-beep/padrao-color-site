import { addressProblem, MAX_ORDER_ITEMS, parseItem, type DeliveryAddress, type OrderItemInput } from "../orders.ts";
import { pixPrice } from "../pricing.ts";
import { isValidDocument, isValidEmail, isValidPhone, onlyDigits } from "../api/validation.ts";
import { commissionFor, isPaymentKind, linkSlugError, paymentFee, roundCents, type PaymentKind, type PaymentRates } from "./core.ts";

/*
 * Pedido da multiloja (puro, testado em pedido.test.ts): validação do que o navegador manda no fechamento e
 * conta dos totais. Nada que vem do navegador vale como preço: o servidor recalcula cada item.
 */

export type CheckoutCliente = { nome: string; email: string; telefone: string; documento: string };

export type CheckoutRequest = {
  items: OrderItemInput[];
  cliente: CheckoutCliente;
  entrega: DeliveryAddress;
  pagamento: PaymentKind;
  /** Total que o cliente viu: se o do servidor for outro, o pedido volta para ele confirmar. */
  expectedTotal: number;
  /** Serviço de entrega escolhido na cotação de frete da Padrão (id do serviço); null = frete fixo da loja. */
  freteServico: number | null;
  ref: string | null;
  observacoes: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export type ParseResult = { ok: true; value: CheckoutRequest } | { ok: false; error: string; field?: string };

export function parseCheckout(raw: unknown): ParseResult {
  if (!isRecord(raw)) return { ok: false, error: "Pedido inválido." };
  if (!Array.isArray(raw.items) || raw.items.length === 0) return { ok: false, error: "Seu carrinho está vazio." };
  if (raw.items.length > MAX_ORDER_ITEMS) return { ok: false, error: `O pedido pode ter até ${MAX_ORDER_ITEMS} itens.` };
  const items = raw.items.map((item: unknown) => parseItem(item));
  if (items.some((item) => item === null)) return { ok: false, error: "Há um item inválido no carrinho. Remova e adicione de novo." };
  if (new Set(items.map((item) => item!.key)).size !== items.length) return { ok: false, error: "Há itens repetidos no carrinho." };

  const c = isRecord(raw.cliente) ? raw.cliente : {};
  const cliente: CheckoutCliente = {
    nome: text(c.nome, 120),
    email: text(c.email, 160).toLowerCase(),
    telefone: onlyDigits(text(c.telefone, 20)),
    documento: onlyDigits(text(c.documento, 20)),
  };
  if (cliente.nome.split(/\s+/).filter(Boolean).length < 2) return { ok: false, error: "Informe nome e sobrenome.", field: "nome" };
  if (!isValidEmail(cliente.email)) return { ok: false, error: "Informe um e-mail válido.", field: "email" };
  if (!isValidPhone(cliente.telefone)) return { ok: false, error: "Informe o telefone com DDD.", field: "telefone" };
  if (!isValidDocument(cliente.documento)) return { ok: false, error: "Informe um CPF ou CNPJ válido.", field: "documento" };

  const e = isRecord(raw.entrega) ? raw.entrega : {};
  const entrega: DeliveryAddress = {
    cep: onlyDigits(text(e.cep, 9)),
    logradouro: text(e.logradouro, 120),
    numero: text(e.numero, 20),
    complemento: text(e.complemento, 80),
    bairro: text(e.bairro, 80),
    cidade: text(e.cidade, 80),
    estado: text(e.estado, 2).toUpperCase(),
  };
  const problem = addressProblem(entrega);
  if (problem) return { ok: false, error: problem, field: "entrega" };

  const pagamento = raw.pagamento;
  if (!isPaymentKind(pagamento)) return { ok: false, error: "Escolha a forma de pagamento." };
  const expectedTotal = Number(raw.expectedTotal);
  if (!Number.isFinite(expectedTotal) || expectedTotal < 0) return { ok: false, error: "Total do pedido inválido." };
  const freteServico = typeof raw.freteServico === "number" && Number.isInteger(raw.freteServico) && raw.freteServico > 0 ? raw.freteServico : null;
  const ref = text(raw.ref, 30);

  return {
    ok: true,
    value: { items: items as OrderItemInput[], cliente, entrega, pagamento, expectedTotal, freteServico, ref: ref && !linkSlugError(ref) ? ref : null, observacoes: text(raw.observacoes, 500) },
  };
}

/**
 * `frete` = o que o cliente paga de frete; `freteCusto` = o custo real (cotação de frete da Padrão), sempre repassado
 * à Padrão, que compra a etiqueta; `freteGratis` = o lojista deu o frete (sai da comissão dele).
 */
export type OrderQuote = { subtotal: number; desconto: number; frete: number; freteCusto: number; freteGratis: boolean; total: number; custoBase: number; taxa: number; comissao: number };

/**
 * Totais do pedido. Subtotal = soma dos itens no preço da loja; o PIX tem o desconto do site; o cliente paga o frete
 * cotado pela Padrão (`shipping.custo`), que é repassado; a taxa do meio de pagamento e o custo da Padrão saem da
 * comissão do lojista. "Frete grátis a partir de" (`gratisAcima`): o frete sai da comissão, só se ela cobrir.
 */
export function quoteOrder(
  lines: { total: number; baseTotal: number }[],
  method: PaymentKind,
  shipping: { custo: number; gratisAcima: number | null },
  rates: PaymentRates,
): OrderQuote {
  const subtotal = roundCents(lines.reduce((sum, l) => sum + l.total, 0));
  const custoBase = roundCents(lines.reduce((sum, l) => sum + l.baseTotal, 0));
  const products = method === "pix" ? pixPrice(subtotal) : subtotal;
  const desconto = roundCents(subtotal - products);
  const freteCusto = roundCents(Math.max(0, shipping.custo));

  if (freteCusto > 0 && shipping.gratisAcima !== null && shipping.gratisAcima > 0 && subtotal >= shipping.gratisAcima) {
    const total = roundCents(products);
    const taxa = paymentFee(total, method, rates);
    const sobra = roundCents(total - custoBase - freteCusto - taxa);
    if (sobra >= 0) return { subtotal, desconto, frete: 0, freteCusto, freteGratis: true, total, custoBase, taxa, comissao: sobra };
  }

  const total = roundCents(products + freteCusto);
  const taxa = paymentFee(total, method, rates);
  return { subtotal, desconto, frete: freteCusto, freteCusto, freteGratis: false, total, custoBase, taxa, comissao: commissionFor({ total, baseCost: custoBase, shipping: freteCusto, fee: taxa }) };
}
