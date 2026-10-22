import "server-only";

import { timingSafeEqual } from "node:crypto";
import { clientIp } from "../api/guard";
import { cieloConfig, efiWebhookIps, efiWebhookSecret, pagarmeConfig } from "./config";
import { createRateLimiter } from "../api/rate-limit";
import { lojaDoHost } from "./tenant";
import type { Loja } from "./repo";

/* Ajudantes das rotas /api/multiloja: loja pelo Host da requisição e limites de tentativas. */

/** Loja que atendeu a requisição (rotas chamadas pela vitrine, no host da própria loja). */
export async function lojaDaRequisicao(request: Request): Promise<Loja | null> {
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || "";
  return host ? lojaDoHost(host.toLowerCase().replace(/:\d+$/, "")) : null;
}

/** Origem pública da requisição (para montar links de volta). */
export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || url.host;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

const MINUTE = 60_000;
export const vitrineLimits = {
  pedido: createRateLimiter({ max: 8, windowMs: 10 * MINUTE }),
  arte: createRateLimiter({ max: 40, windowMs: 10 * MINUTE }),
  visita: createRateLimiter({ max: 30, windowMs: MINUTE }),
  status: createRateLimiter({ max: 120, windowMs: MINUTE }),
  /** Cotação do checkout (cota o frete na API da Padrão quando o CEP muda). */
  cotacao: createRateLimiter({ max: 60, windowMs: MINUTE }),
};

/** Conta uma tentativa por IP (sem IP confiável, não limita). true = passou do limite. */
export function limited(limiter: (typeof vitrineLimits)[keyof typeof vitrineLimits], request: Request, scope: string): boolean {
  const ip = clientIp(request);
  return ip ? !limiter.hit(`${scope}:${ip}`).ok : false;
}

/**
 * Aviso da Efí (webhook do Pix ou notificação do cartão) com as checagens que a Efí recomenda quando o servidor
 * não exige mTLS: segredo na URL (?hmac=) e IP de origem. Mesmo aceito, o aviso só dispara uma consulta à
 * própria Efí; nada muda no pedido só com o que veio no corpo.
 */
export async function efiWebhookAllowed(request: Request): Promise<boolean> {
  const secret = await efiWebhookSecret();
  if (!secret) return process.env.NODE_ENV !== "production";
  const given = new URL(request.url).searchParams.get("hmac") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const allowed = efiWebhookIps();
  const ip = clientIp(request);
  return !allowed.length || !ip || allowed.includes(ip.replace(/^::ffff:/i, ""));
}

const sameSecret = (given: string, secret: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Aviso da Cielo: o segredo vem no cabeçalho X-Multiloja-Segredo (Post de Notificação da API E-commerce, cabeçalho
 * personalizado cadastrado no portal) ou em ?hmac= (notificação do Link de Pagamento, que não aceita cabeçalho).
 */
export async function cieloWebhookAllowed(request: Request): Promise<boolean> {
  const secret = (await cieloConfig())?.webhookSecret;
  if (!secret) return process.env.NODE_ENV !== "production";
  const given = request.headers.get("x-multiloja-segredo") ?? new URL(request.url).searchParams.get("hmac") ?? "";
  return sameSecret(given, secret);
}

/**
 * Aviso da Pagar.me: o segredo vem na URL cadastrada no painel dela (?hmac=) ou como senha da autenticação básica do
 * webhook (o usuário não importa). Mesmo aceito, o aviso só dispara uma consulta da cobrança na Pagar.me.
 */
export async function pagarmeWebhookAllowed(request: Request): Promise<boolean> {
  const secret = (await pagarmeConfig())?.webhookSecret;
  if (!secret) return process.env.NODE_ENV !== "production";
  const query = new URL(request.url).searchParams.get("hmac") ?? "";
  if (query && sameSecret(query, secret)) return true;
  const basic = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  const password = basic ? Buffer.from(basic, "base64").toString("utf8").split(":").slice(1).join(":") : "";
  return Boolean(password) && sameSecret(password, secret);
}
