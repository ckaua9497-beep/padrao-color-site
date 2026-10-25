/*
 * Fila de pedidos do site (regras puras, testadas em regras.test.ts). Quando o pedido não chega à produção pelo POST
 * /gerarpedido (API fora do ar, firewall da Padrão, disjuntor do client.ts) ou a API não confirma, o pedido e as
 * imagens ficam guardados no banco do site (repo.ts) e:
 *   - "pendente": sem conexão, nada foi criado na Padrão. O servidor reenvia sozinho (worker.ts), esperando cada vez
 *     mais entre as tentativas, até MAX_TENTATIVAS; depois vai para "conferir".
 *   - "conferir": a API recusou, o preço mudou, a sessão do cliente venceu ou a resposta não confirmou se o pedido foi
 *     criado. A equipe confere no sistema da Padrão e decide no admin (/admin/fila-pedidos): reenviar, marcar como
 *     enviado com o número do pedido ou cancelar. Nada é reenviado sozinho daqui (evita pedido em dobro).
 * Arquivos da arte: quando o Bunny não está configurado ou falha, o /api/arte guarda o arquivo no banco do site e
 * devolve uma URL do próprio site (/api/pedidos/arquivo/<nome>); antes de reenviar, a fila sobe esses arquivos para o
 * Bunny quando ele volta e troca as URLs no pedido.
 */

export type EtapaFila = "pendente" | "enviando" | "enviado" | "simulado" | "conferir" | "cancelado";

export const ETAPAS_FILA: readonly EtapaFila[] = ["pendente", "enviando", "conferir", "enviado", "simulado", "cancelado"];

export const ETAPA_LABEL: Record<EtapaFila, string> = {
  pendente: "Aguardando reenvio",
  enviando: "Enviando",
  conferir: "Conferir",
  enviado: "Enviado à produção",
  simulado: "Simulado",
  cancelado: "Cancelado",
};

export function isEtapaFila(value: unknown): value is EtapaFila {
  return typeof value === "string" && (ETAPAS_FILA as readonly string[]).includes(value);
}

/** Espera (min) depois de cada tentativa sem conexão; da 7ª em diante, 1 hora. */
export const ESPERAS_MIN = [1, 2, 5, 10, 20, 30, 60] as const;
/** Tentativas sem conexão antes de passar para "conferir" (~3 dias). */
export const MAX_TENTATIVAS = 72;
/** "enviando" há mais que isto: o processo caiu no meio do envio e não se sabe se o pedido foi criado. */
export const TRAVADO_MIN = 15;
/** Arquivos guardados no site ficam este tempo (a produção e a conferência usam as URLs). */
export const ARQUIVOS_DIAS = 180;

export function esperaMinutos(tentativas: number): number {
  return ESPERAS_MIN[Math.min(Math.max(tentativas, 1), ESPERAS_MIN.length) - 1];
}

export function protocoloDe(id: number): string {
  return `PF-${String(id).padStart(5, "0")}`;
}

/** Falha da API como o client.ts informa (ApiError); null = erro desconhecido (bug, resposta estranha). */
export type FalhaApi = { status: number; reached: boolean | "maybe" } | null;
export type ClasseFalha = "sem-conexao" | "recusado" | "incerto";

/**
 * O que fazer com a falha:
 *   - "consulta" (GET /cliente e os preços): nada é criado; sem conexão, 5xx, bloqueio (403) e excesso (429) voltam
 *     para a fila; outras recusas (401 sessão, 4xx) vão para conferir.
 *   - "pedido" (POST /gerarpedido): só é seguro repetir quando nada saiu (sem conexão) — recusa 4xx vai para conferir,
 *     e o resto (5xx, conexão caída depois de enviar, erro desconhecido) pode ter criado o pedido: conferir.
 */
export function classificarFalha(etapa: "consulta" | "pedido", falha: FalhaApi): ClasseFalha {
  if (etapa === "consulta") {
    if (!falha || falha.reached === false || falha.status >= 500 || falha.status === 403 || falha.status === 429) return "sem-conexao";
    return "recusado";
  }
  if (falha?.reached === false) return "sem-conexao";
  if (falha && falha.reached === true && falha.status >= 400 && falha.status < 500) return "recusado";
  return "incerto";
}

/** Nome do arquivo guardado: 16 hex aleatórios + nome limpo + momento + extensão, no formato que art-files aceita. */
export function nomeGuardado(original: string, aleatorio: string, stamp: number): string {
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(original.trim())?.[1] ?? "bin").toLowerCase();
  const base = original
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "");
  const prefixo = aleatorio.replace(/[^a-f0-9]/gi, "").slice(0, 16).toLowerCase();
  const momento = String(Math.max(0, Math.round(stamp)));
  // Até 80 caracteres antes da extensão (o limite de STORED_NAME em art-files.ts).
  return `${prefixo}${base.slice(0, Math.max(0, 80 - prefixo.length - momento.length))}${momento}.${ext}`;
}

/** Pasta pública dos arquivos guardados no site: "<origem>/api/pedidos/arquivo/". */
export function pastaGuardados(origem: string): string {
  return `${origem.replace(/\/+$/, "")}/api/pedidos/arquivo/`;
}

type Anexo = { url?: unknown; nome?: unknown };
type ComAnexos = { produtos?: { arte?: { anexos?: Anexo[] } }[] };

/** URLs dos anexos do pedido que estão na pasta `pasta` (os arquivos guardados no site). */
export function anexosGuardados(payload: unknown, pasta: string): string[] {
  const out = new Set<string>();
  for (const produto of (payload as ComAnexos | null)?.produtos ?? []) {
    for (const anexo of produto?.arte?.anexos ?? []) if (typeof anexo?.url === "string" && anexo.url.startsWith(pasta)) out.add(anexo.url);
  }
  return [...out];
}

/** O pedido com as URLs (e os nomes) dos anexos trocados por `mapa` (URL antiga → arquivo novo). Não altera o original. */
export function trocarAnexos<T>(payload: T, mapa: Readonly<Record<string, { url: string; nome: string }>>): T {
  const copia = structuredClone(payload) as T & ComAnexos;
  for (const produto of copia.produtos ?? []) {
    for (const anexo of produto?.arte?.anexos ?? []) {
      const novo = typeof anexo.url === "string" ? mapa[anexo.url] : undefined;
      if (novo) {
        anexo.url = novo.url;
        anexo.nome = novo.nome;
      }
    }
  }
  return copia;
}
