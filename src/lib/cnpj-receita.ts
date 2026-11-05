import "server-only";

import { lerConsultaCnpj, type ConsultaCnpj } from "./revenda";

/*
 * Consulta do CNPJ na Receita pela BrasilAPI (pública, sem chave): GET {CNPJ_API_URL}/{cnpj}, padrão
 * https://brasilapi.com.br/api/cnpj/v1. Usada no cadastro do revendedor com CNPJ (revenda.ts) para ler a situação
 * cadastral e os CNAEs. Sem resposta em 8 s, CNPJ que ela não conhece (o alfanumérico ainda não) ou erro: null, e o
 * cadastro vai para a avaliação da Padrão (nunca recusa por isso). Simulador local: CNPJ_API_URL apontando para outro host.
 */

const DEFAULT_URL = "https://brasilapi.com.br/api/cnpj/v1";
const TIMEOUT_MS = 8_000;

export async function consultarCnpj(cnpj: string): Promise<ConsultaCnpj | null> {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return null;
  const base = (process.env.CNPJ_API_URL?.trim() || DEFAULT_URL).replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/${digits}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) {
      if (res.status !== 404 && res.status !== 400) console.warn(`[cnpj] consulta: HTTP ${res.status}`);
      return null;
    }
    return lerConsultaCnpj(await res.json());
  } catch (error) {
    console.warn("[cnpj] consulta sem resposta:", error instanceof Error ? error.name : error);
    return null;
  }
}
