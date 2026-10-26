import "server-only";

import { getFeriados } from "./api/padrao";
import { feriadosDaLista, feriadosNacionais } from "./dias-uteis";

/*
 * Dias que não contam no prazo de produção: GET /feriados do ano atual e do seguinte (a Padrão cadastra feriados e
 * outros dias parados). Cache de 6 h por processo. Sem resposta, ou com a lista vazia, valem os feriados nacionais e a
 * próxima tentativa é em 5 min.
 */

const VALIDADE_MS = 6 * 60 * 60_000;
const NOVA_TENTATIVA_MS = 5 * 60_000;

let cache: { ano: number; dias: Set<string>; ate: number } | null = null;
let buscando: Promise<Set<string>> | null = null;

async function buscar(ano: number): Promise<Set<string>> {
  try {
    const dias = feriadosDaLista(await getFeriados(`${ano}-01-01`, `${ano + 1}-12-31`));
    if (dias.size) {
      cache = { ano, dias, ate: Date.now() + VALIDADE_MS };
      return dias;
    }
    console.error("[feriados] GET /feriados sem datas: usando os feriados nacionais");
  } catch (error) {
    console.error("[feriados] GET /feriados falhou: usando os feriados nacionais", error instanceof Error ? error.message : "");
  }
  const dias = feriadosNacionais(ano);
  cache = { ano, dias, ate: Date.now() + NOVA_TENTATIVA_MS };
  return dias;
}

/** Feriados (AAAA-MM-DD) do ano de Brasília e do seguinte. */
export async function feriados(now = new Date()): Promise<Set<string>> {
  const ano = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(now));
  if (cache && cache.ano === ano && cache.ate > now.getTime()) return cache.dias;
  buscando ??= buscar(ano).finally(() => {
    buscando = null;
  });
  return buscando;
}
