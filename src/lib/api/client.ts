import "server-only";

import { classifyNetworkError, createLimiter, createTransport, type RawResponse } from "./transport";
import { maskEmailsIn } from "./validation";

/*
 * Cliente HTTP da API Padrão Color. Só roda no servidor: o token de integração (PADRAO_API_TOKEN)
 * e o token do cliente logado nunca chegam ao navegador.
 *
 * Particularidades levantadas nos testes (não estão no PDF):
 * - o host lab só responde em HTTPS;
 * - datas de filtro vão em DD/MM/AAAA (AAAA-MM-DD devolve 500 "is not a valid date");
 * - erros de regra vêm como 406 {"ERRO": "..."}; 204 = sem registros;
 * - GET /produtos sem filtro estoura o gateway (504): sempre filtrar por grupo/produto;
 * - o host lab envia só o certificado do site, sem o intermediário da Let's Encrypt: o fetch do Node recusa a
 *   conexão (UNABLE_TO_VERIFY_LEAF_SIGNATURE). Por isso a chamada usa node:https com a cadeia em tls-chain.ts
 *   (transport.ts: conexão, prazos e repetição em conexão velha);
 * - o firewall bloqueia por IP quem abre conexões demais ou erra o login muitas vezes (07/10/2026): de fora do
 *   Brasil também não conecta.
 */

export class ApiError extends Error {
  readonly status: number;
  /**
   * O pedido chegou à API? true = ela respondeu (qualquer HTTP); false = nada saiu (sem conexão, disjuntor,
   * fila, certificado); "maybe" = a conexão caiu ou ficou muda depois de conectar. Pedido (gerarpedido) só pode
   * ser repetido com false ou com uma recusa (4xx).
   */
  readonly reached: boolean | "maybe";

  constructor(status: number, message: string, reached: boolean | "maybe" = true) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.reached = reached;
  }
}

export function apiBaseUrl(): string {
  return (process.env.PADRAO_API_URL ?? "https://lab.padraocolor.com/site").replace(/\/+$/, "");
}

export function integrationToken(): string {
  const token = process.env.PADRAO_API_TOKEN;
  if (!token) throw new ApiError(500, "PADRAO_API_TOKEN não configurado no servidor.");
  return token;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export type ApiRequest = {
  method?: "GET" | "POST";
  query?: Query;
  body?: unknown;
  /**
   * Token do cliente logado. Sem ele usa o da integração; `false` não envia Authorization
   * (POST /user/login e fluxos de recuperação de senha).
   */
  token?: string | false;
  timeoutMs?: number;
};

const MESSAGES: Record<number, string> = {
  401: "Sessão expirada ou credenciais inválidas.",
  406: "A operação não foi aceita.",
  500: "O sistema da Padrão Color está indisponível no momento.",
  502: "Não foi possível falar com o sistema da Padrão Color.",
  504: "O sistema da Padrão Color demorou a responder.",
};

// Protege o servidor da API: o firewall dela bloqueia por IP quem abre conexões demais (aconteceu em 07/10/2026).
// Consultas (GET) simultâneas limitadas por processo (login, cadastro e pedido não entram na fila) e, com o host
// sem conexão, um intervalo em que as chamadas falham na hora (503), sem abrir socket.
const transport = createTransport();
const gets = createLimiter(6);
const DOWN_MS = 30_000;
let downUntil = 0;
/** Depois do intervalo, uma chamada só testa o host (meia-abertura); as outras seguem falhando na hora. */
let probing = false;
/** Conexões novas recusadas antes do handshake, seguidas: a partir de 3 conta como host bloqueando. */
let refusals = 0;
/** Espera máxima por vaga na fila (a chamada ainda ganha o prazo inteiro depois). */
const QUEUE_WAIT_MS = 10_000;

/** A API está sem conexão agora (as chamadas falham na hora, sem chegar a ela)? */
export function apiUnavailable(): boolean {
  return Date.now() < downUntil || probing;
}

function markDown() {
  downUntil = Date.now() + DOWN_MS;
  probing = false;
  // Quem esperava vaga na fila não vai conseguir: sai já com 503.
  gets.drain();
}

/** Respostas de regra de negócio esperadas (não vão para o log). 401 com token de cliente = sessão vencida. */
const EXPECTED_STATUS = new Set([400, 404, 406, 409, 422]);

/** Faz a chamada e devolve o JSON (ou null em 204). Lança ApiError com a mensagem da API. */
export async function apiRequest<T>(path: string, { method = "GET", query, body, token, timeoutMs = 20_000 }: ApiRequest = {}): Promise<T | null> {
  const url = new URL(apiBaseUrl() + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token !== false) headers.Authorization = `Bearer ${token ?? integrationToken()}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const payload = body === undefined ? undefined : JSON.stringify(body);

  if (Date.now() < downUntil || probing) throw new ApiError(503, MESSAGES[502], false);
  // Passou o intervalo: esta chamada testa o host; as outras falham na hora até ela voltar.
  const probe = downUntil > 0;
  if (probe) probing = true;
  const throttled = method === "GET";
  const queueWait = Math.min(timeoutMs, QUEUE_WAIT_MS);
  if (throttled && !(await gets.acquire(queueWait))) {
    if (probe) probing = false;
    if (apiUnavailable()) throw new ApiError(503, MESSAGES[502], false);
    console.error(`[api] ${method} ${path}: ${queueWait / 1000} s na fila de consultas sem vaga`);
    throw new ApiError(504, MESSAGES[504], false);
  }
  let response: RawResponse;
  try {
    // O host caiu enquanto esta chamada esperava na fila: nem tenta.
    if (Date.now() < downUntil) throw new ApiError(503, MESSAGES[502], false);
    // A conexão ganha o prazo inteiro mesmo depois da fila: prazo curto demais viraria "sem conexão" à toa
    // (e abriria o disjuntor com o host de pé).
    // Repetir só o que não cria nada (GET e o login): numa conexão velha o pedido não chegou ao servidor.
    response = await transport.request(url, method, headers, payload, timeoutMs, method === "GET" || path === "/user/login");
    refusals = 0;
    if (probe) {
      downUntil = 0;
      probing = false;
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const failure = classifyNetworkError(error);
    refusals = failure.refused ? refusals + 1 : 0;
    const down = failure.unreachable || refusals >= 3;
    // Fica no log do servidor: sem isso o cliente só vê "tente de novo".
    const reason = down
      ? `sem conexão com ${url.host} (${failure.code}): o servidor da API está fora do ar ou bloqueando este IP; novas chamadas só daqui a ${DOWN_MS / 1000} s`
      : failure.timedOut
        ? `sem resposta da API por ${timeoutMs / 1000} s`
        : failure.code;
    console.error(`[api] ${method} ${path}: ${reason}`);
    if (down) {
      refusals = 0;
      markDown();
      throw new ApiError(503, MESSAGES[502], false);
    }
    if (probe) {
      // O host respondeu (mesmo com erro): fecha o disjuntor.
      downUntil = 0;
      probing = false;
    }
    throw new ApiError(failure.timedOut ? 504 : 502, failure.timedOut ? MESSAGES[504] : MESSAGES[502], failure.sent);
  } finally {
    if (throttled) gets.release();
  }

  if (response.status === 204) return null;
  const text = response.text;
  if (response.status < 200 || response.status >= 300) {
    let message = MESSAGES[response.status] ?? `Erro ${response.status} no sistema da Padrão Color.`;
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const detail = parsed.ERRO ?? parsed.erro ?? parsed.message ?? parsed.mensagem;
      if (typeof detail === "string" && detail.trim()) message = detail.trim();
    } catch {
      if (text && text.length < 200 && !text.trimStart().startsWith("<")) message = text.trim();
    }
    // Fora das regras de negócio esperadas (5xx, 403/429 de firewall, redirecionamento, token da integração
    // recusado) fica no log do servidor: o cliente só vê a mensagem genérica.
    if (response.status >= 500 || !(EXPECTED_STATUS.has(response.status) || (response.status === 401 && token !== undefined))) {
      console.error(`[api] ${method} ${path}: ${response.status} ${maskEmailsIn(message).slice(0, 200)}`);
    }
    throw new ApiError(response.status, message);
  }
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    // A API respondeu (e pode ter gravado algo): não é para repetir às cegas.
    console.error(`[api] ${method} ${path}: ${response.status} com resposta que não é JSON (${text.length} bytes)`);
    throw new ApiError(502, "Resposta inválida do sistema da Padrão Color.", true);
  }
}

/** Data no formato que a API aceita nos filtros (DD/MM/AAAA). Aceita Date ou "AAAA-MM-DD". */
export function apiDate(value: Date | string): string {
  if (typeof value === "string") {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    return value;
  }
  const dd = String(value.getDate()).padStart(2, "0");
  const mm = String(value.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${value.getFullYear()}`;
}
