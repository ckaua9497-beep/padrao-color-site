// Chamadas do navegador para as rotas /api/conta e /api/pedidos (mesma origem; o cookie de sessão vai sozinho).

export type Reply<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: string; data: Record<string, unknown> };

const OFFLINE = "Sem conexão com a internet. Confira e tente de novo.";

function fallbackMessage(status: number): string {
  if (status === 401) return "Entre na sua conta para continuar.";
  if (status === 429) return "Muitas tentativas. Aguarde alguns minutos.";
  if (status >= 500) return "O sistema está instável agora. Tente de novo em instantes.";
  return "Não foi possível concluir. Confira os dados e tente de novo.";
}

async function send<T>(url: string, init: RequestInit): Promise<Reply<T>> {
  try {
    const response = await fetch(url, { ...init, cache: "no-store", headers: { Accept: "application/json", ...init.headers } });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.ok) return { ok: true, status: response.status, data: data as T };
    return { ok: false, status: response.status, error: typeof data.error === "string" ? data.error : fallbackMessage(response.status), data };
  } catch {
    return { ok: false, status: 0, error: OFFLINE, data: {} };
  }
}

export function postJson<T = Record<string, unknown>>(url: string, body: unknown): Promise<Reply<T>> {
  return send<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
}

export function getJson<T = Record<string, unknown>>(url: string): Promise<Reply<T>> {
  return send<T>(url, { method: "GET" });
}

export function postForm<T = Record<string, unknown>>(url: string, form: FormData): Promise<Reply<T>> {
  return send<T>(url, { method: "POST", body: form });
}

export type CepAddress = { logradouro: string; bairro: string; cidade: string; estado: string };

/** Endereço pelo CEP (ViaCEP, direto do navegador). null = não achou ou sem conexão. */
export async function lookupCep(cep: string): Promise<CepAddress | null> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  try {
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, unknown>;
    if (data.erro) return null;
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    return { logradouro: text(data.logradouro), bairro: text(data.bairro), cidade: text(data.localidade), estado: text(data.uf).toUpperCase() };
  } catch {
    return null;
  }
}
