import "server-only";

import { opcoesDeFrete, type OpcaoFrete, type PacoteFrete } from "./frete";

/*
 * Cotação de frete na API de frete da Padrão Color (o Melhor Envio fica com eles: conta, CEP de despacho, regras):
 *   POST https://padraocolor.com.br/api/v2/melhor-envio/freight/calculate
 *   x-api-key: PADRAO_FRETE_API_KEY
 *   { to: { postal_code }, products: [{ id, width, height, length, weight, insurance_value, quantity }] }
 * Resposta: { environment, services: [{ id, name, company, price, deliveryTime, deliveryRange }], unavailable: [] }.
 * Cotações iguais (mesmo CEP e caixas) ficam guardadas 10 minutos. A chave só existe no servidor (nunca no navegador
 * nem no log). Sem a chave, não há cotação: a multiloja cobra o frete fixo da loja.
 */

const DEFAULT_URL = "https://padraocolor.com.br/api/v2/melhor-envio/freight/calculate";
const CACHE_MS = 10 * 60_000;

export type FreteApi = { url: string; key: string };

export function freteApi(): FreteApi | null {
  const key = process.env.PADRAO_FRETE_API_KEY?.trim();
  if (!key) return null;
  return { url: process.env.PADRAO_FRETE_URL?.trim() || DEFAULT_URL, key };
}

const holder = globalThis as typeof globalThis & { __freteCache?: Map<string, { at: number; opcoes: OpcaoFrete[] }> };
const cache = (holder.__freteCache ??= new Map());

export type CotacaoFrete = { ok: true; opcoes: OpcaoFrete[] } | { ok: false; erro: string };

export async function cotarFretePadrao(api: FreteApi, cepDestino: string, pacotes: PacoteFrete[]): Promise<CotacaoFrete> {
  const body = { to: { postal_code: cepDestino }, products: pacotes };
  const key = JSON.stringify([api.url, body]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return { ok: true, opcoes: hit.opcoes };
  try {
    const res = await fetch(api.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "x-api-key": api.key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) return { ok: false, erro: "a API de frete recusou a chave" };
    if (!res.ok) return { ok: false, erro: `a API de frete respondeu ${res.status}` };
    const opcoes = opcoesDeFrete(await res.json().catch(() => null));
    if (cache.size > 500) cache.clear();
    cache.set(key, { at: Date.now(), opcoes });
    return { ok: true, opcoes };
  } catch (error) {
    console.error("[frete] API de frete da Padrão:", error instanceof Error ? error.name : "erro");
    return { ok: false, erro: "a API de frete não respondeu" };
  }
}
