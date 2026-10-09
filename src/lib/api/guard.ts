import "server-only";

import { clearSession, getSession, type Session } from "../session";
import { ApiError } from "./client";
import { createRateLimiter } from "./rate-limit";
import { maskEmailsIn } from "./validation";

/*
 * Proteções básicas das rotas /api/conta, /api/pedidos e /api/precos:
 * - POST só da própria loja (Origin / Sec-Fetch-Site) e só JSON (multipart só no envio de arte);
 * - corpo com tamanho máximo lido em stream;
 * - limite de tentativas em memória (login, cadastro, recuperação, pedidos);
 * - respostas sem cache e erros da API traduzidos (sem detalhes internos).
 */

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const all = new Headers(headers);
  all.set("Cache-Control", "private, no-store");
  return Response.json(data, { status, headers: all });
}

export function fail(status: number, message: string, extra?: Record<string, unknown>, headers?: HeadersInit): Response {
  return json({ error: message, ...extra }, status, headers);
}

const firstHost = (value: string | null) => value?.split(",")[0]?.trim().toLowerCase() || null;

/** Hosts extras aceitos como origem (proxy que troca o Host): PADRAO_SITE_ORIGINS="https://loja.com.br,…". */
function extraHosts(): string[] {
  return (process.env.PADRAO_SITE_ORIGINS ?? "")
    .split(",")
    .map((value) => {
      try {
        return new URL(value.trim()).host.toLowerCase();
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

/** POST da própria loja: o Origin precisa ser o host que atendeu (ou Sec-Fetch-Site: same-origin). */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") === "same-origin";
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const hosts = [firstHost(request.headers.get("x-forwarded-host")), firstHost(request.headers.get("host")), new URL(request.url).host.toLowerCase(), ...extraHosts()];
  return hosts.includes(originHost);
}

export type BodyResult<T> = { ok: true; data: T } | { ok: false; response: Response };

/** Lê o corpo em stream e para no limite (não confia no Content-Length). */
async function readLimited(request: Request, maxBytes: number): Promise<Buffer | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return null;
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** POST JSON da própria loja. */
export async function readJsonBody(request: Request, maxBytes = 32 * 1024): Promise<BodyResult<unknown>> {
  if (!isSameOrigin(request)) return { ok: false, response: fail(403, "Origem não permitida.") };
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) return { ok: false, response: fail(415, "Envie os dados em JSON.") };
  let raw: Buffer | null;
  try {
    raw = await readLimited(request, maxBytes);
  } catch {
    return { ok: false, response: fail(400, "Não foi possível ler os dados enviados.") };
  }
  if (!raw) return { ok: false, response: fail(413, "Dados grandes demais.") };
  try {
    return { ok: true, data: raw.length ? (JSON.parse(raw.toString("utf8")) as unknown) : {} };
  } catch {
    return { ok: false, response: fail(400, "Dados inválidos.") };
  }
}

/** Endereço local, de rede interna ou de loopback (o próprio proxy, não o cliente). */
function isInternalIp(ip: string): boolean {
  const v4 = ip.replace(/^::ffff:/i, "");
  return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.)/.test(v4) || ip === "::1" || ip === "::" || /^(f[cd][0-9a-f]{2}|fe80):/i.test(ip) || ip === "localhost";
}

/**
 * IP do cliente como o proxy da hospedagem viu: o cabeçalho de PADRAO_CLIENT_IP_HEADER (atrás de CDN:
 * cf-connecting-ip, x-vercel-forwarded-for…), senão X-Real-IP ou a ÚLTIMA entrada do X-Forwarded-For (a
 * primeira o próprio cliente pode inventar). null = desconhecido: sem cabeçalho, ou só o IP interno do proxy
 * (o Next preenche o X-Forwarded-For com o endereço da conexão). Aí os limites por IP não valem, para não
 * virar um balde único do site inteiro; os limites por usuário/documento continuam.
 */
export function clientIp(request: Request): string | null {
  const configured = process.env.PADRAO_CLIENT_IP_HEADER?.trim();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean);
  const ip = (configured ? request.headers.get(configured)?.split(",")[0]?.trim() : null) || request.headers.get("x-real-ip")?.trim() || forwarded?.[forwarded.length - 1];
  return ip && !isInternalIp(ip) ? ip : null;
}

const MINUTE = 60_000;

/** Limites por processo (ver rate-limit.ts). */
export const limits = {
  loginIp: createRateLimiter({ max: 10, windowMs: 10 * MINUTE }),
  loginUser: createRateLimiter({ max: 5, windowMs: 10 * MINUTE }),
  signup: createRateLimiter({ max: 5, windowMs: 60 * MINUTE }),
  recover: createRateLimiter({ max: 8, windowMs: 15 * MINUTE }),
  recoverCode: createRateLimiter({ max: 5, windowMs: 15 * MINUTE }),
  account: createRateLimiter({ max: 10, windowMs: 10 * MINUTE }),
  orders: createRateLimiter({ max: 10, windowMs: 10 * MINUTE }),
  art: createRateLimiter({ max: 10, windowMs: 10 * MINUTE }),
  // Envio dos arquivos no checkout: um kit pode levar vários (logo, PDFs no gabarito, versos).
  artUpload: createRateLimiter({ max: 60, windowMs: 10 * MINUTE }),
  // Consulta de frete na página de produto (API de frete da Padrão).
  frete: createRateLimiter({ max: 40, windowMs: 10 * MINUTE }),
};

export function tooMany(retryAfterSec: number): Response {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return fail(429, `Muitas tentativas. Tente de novo em ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.`, undefined, { "Retry-After": String(retryAfterSec) });
}

/** Conta uma tentativa; devolve a resposta 429 quando passou do limite. Chave null = não conta. */
export function overLimit(limiter: (typeof limits)[keyof typeof limits], key: string | null): Response | null {
  if (!key) return null;
  const result = limiter.hit(key);
  return result.ok ? null : tooMany(result.retryAfterSec);
}

export const SESSION_EXPIRED = "Sua sessão expirou. Entre de novo para continuar.";

/** Rota que exige cliente logado: devolve a sessão ou a resposta 401. */
export async function sessionOr401(): Promise<{ ok: true; session: Session } | { ok: false; response: Response }> {
  const session = await getSession();
  return session ? { ok: true, session } : { ok: false, response: fail(401, "Entre na sua conta para continuar.", { session: "missing" }) };
}

/**
 * Erro da API → resposta para o navegador. Com `session`, 401 quer dizer token vencido: apaga o cookie.
 * Regra de negócio (406) vira 422 com a mensagem da API (e-mails mascarados); o resto, mensagem genérica.
 */
export async function apiFailure(error: unknown, { session = false, fallback = "Não foi possível concluir agora. Tente de novo em instantes." } = {}): Promise<Response> {
  if (error instanceof ApiError) {
    if (error.status === 401 && session) {
      await clearSession();
      return fail(401, SESSION_EXPIRED, { session: "expired" });
    }
    if ([400, 404, 406, 409, 422].includes(error.status)) return fail(422, maskEmailsIn(error.message));
    if (error.status === 504) return fail(504, "O sistema da Padrão Color demorou a responder. Tente de novo em instantes.");
    return fail(502, "Não foi possível falar com o sistema da Padrão Color. Tente de novo em instantes.");
  }
  console.error("[api]", error instanceof Error ? error.message : "erro desconhecido");
  return fail(500, fallback);
}
