import "server-only";

import { clientIp } from "../api/guard";
import { createRateLimiter } from "../api/rate-limit";
import { lojaDoHost } from "./tenant";
import type { Loja } from "./repo";

/* Ajudantes das rotas /api/multiloja: loja pelo Host da requisição e limites de tentativas. */

/** Loja que atendeu a requisição (rotas chamadas pela vitrine, no host da própria loja). */
export function lojaDaRequisicao(request: Request): Loja | null {
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
};

/** Conta uma tentativa por IP (sem IP confiável, não limita). true = passou do limite. */
export function limited(limiter: (typeof vitrineLimits)[keyof typeof vitrineLimits], request: Request, scope: string): boolean {
  const ip = clientIp(request);
  return ip ? !limiter.hit(`${scope}:${ip}`).ok : false;
}
