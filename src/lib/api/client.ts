import "server-only";

/*
 * Cliente HTTP da API Padrão Color. Só roda no servidor: o token de integração (PADRAO_API_TOKEN)
 * e o token do cliente logado nunca chegam ao navegador.
 *
 * Particularidades levantadas nos testes (não estão no PDF):
 * - o host lab só responde em HTTPS;
 * - datas de filtro vão em DD/MM/AAAA (AAAA-MM-DD devolve 500 "is not a valid date");
 * - erros de regra vêm como 406 {"ERRO": "..."}; 204 = sem registros;
 * - GET /produtos sem filtro estoura o gateway (504): sempre filtrar por grupo/produto.
 */

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
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
  504: "O sistema da Padrão Color demorou a responder.",
};

/** Faz a chamada e devolve o JSON (ou null em 204). Lança ApiError com a mensagem da API. */
export async function apiRequest<T>(path: string, { method = "GET", query, body, token, timeoutMs = 20_000 }: ApiRequest = {}): Promise<T | null> {
  const url = new URL(apiBaseUrl() + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token !== false) headers.Authorization = `Bearer ${token ?? integrationToken()}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new ApiError(timedOut ? 504 : 502, timedOut ? MESSAGES[504] : "Não foi possível falar com o sistema da Padrão Color.");
  }

  if (response.status === 204) return null;
  const text = await response.text();
  if (!response.ok) {
    let message = MESSAGES[response.status] ?? `Erro ${response.status} no sistema da Padrão Color.`;
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const detail = parsed.ERRO ?? parsed.erro ?? parsed.message ?? parsed.mensagem;
      if (typeof detail === "string" && detail.trim()) message = detail.trim();
    } catch {
      if (text && text.length < 200 && !text.trimStart().startsWith("<")) message = text.trim();
    }
    throw new ApiError(response.status, message);
  }
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(502, "Resposta inválida do sistema da Padrão Color.");
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
