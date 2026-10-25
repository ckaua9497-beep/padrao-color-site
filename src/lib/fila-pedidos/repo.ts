import "server-only";

import { randomBytes } from "node:crypto";
import { getDb } from "../multiloja/db";
import { ARQUIVOS_DIAS, TRAVADO_MIN, isEtapaFila, nomeGuardado, protocoloDe, type EtapaFila } from "./regras";
import type { OrderRequest } from "../orders";

/*
 * Banco da fila de pedidos do site (regras em regras.ts): tabela `pedidos_fila` (migração 5) e as imagens guardadas
 * em `arquivos` (dono "fila/<cliente>"). Datas em texto UTC (agora()), como o resto do banco.
 */

export type EventoFila = { em: string; texto: string };

export type EntradaFila = {
  id: number;
  protocolo: string;
  clienteId: number;
  etapa: EtapaFila;
  motivo: string | null;
  pedido: OrderRequest;
  payload: Record<string, unknown> | null;
  /** Token do cliente selado (fila-pedidos/processar.ts abre). */
  token: string | null;
  total: number;
  tentativas: number;
  proximaTentativa: string | null;
  ultimoErro: string | null;
  numeroPedido: string | null;
  historico: EventoFila[];
  criadoEm: string;
  atualizadoEm: string;
  enviadoEm: string | null;
};

type Linha = {
  id: number;
  protocolo: string | null;
  cliente_id: number;
  etapa: string;
  motivo: string | null;
  pedido: string;
  payload: string | null;
  token: string | null;
  total: number;
  tentativas: number;
  proxima_tentativa: string | null;
  ultimo_erro: string | null;
  numero_pedido: string | null;
  historico: string;
  criado_em: string;
  atualizado_em: string;
  enviado_em: string | null;
};

function json<T>(texto: string | null, padrao: T): T {
  if (!texto) return padrao;
  try {
    return JSON.parse(texto) as T;
  } catch {
    return padrao;
  }
}

function daLinha(r: Linha): EntradaFila {
  return {
    id: Number(r.id),
    protocolo: r.protocolo ?? protocoloDe(Number(r.id)),
    clienteId: Number(r.cliente_id),
    etapa: isEtapaFila(r.etapa) ? r.etapa : "conferir",
    motivo: r.motivo,
    pedido: json<OrderRequest>(r.pedido, { items: [], payment: "pix", delivery: { kind: "cadastro" }, expectedTotal: 0 }),
    payload: json<Record<string, unknown> | null>(r.payload, null),
    token: r.token,
    total: Number(r.total),
    tentativas: Number(r.tentativas),
    proximaTentativa: r.proxima_tentativa,
    ultimoErro: r.ultimo_erro,
    numeroPedido: r.numero_pedido,
    historico: json<EventoFila[]>(r.historico, []),
    criadoEm: r.criado_em,
    atualizadoEm: r.atualizado_em,
    enviadoEm: r.enviado_em,
  };
}

/** Acrescenta uma linha ao histórico da entrada (quem fez o quê), no SQL. */
const HISTORICO = "historico = (historico::jsonb || jsonb_build_array(jsonb_build_object('em', agora(), 'texto', ?::text)))::text";

export type NovaEntrada = {
  clienteId: number;
  etapa: Extract<EtapaFila, "pendente" | "conferir">;
  motivo: string;
  pedido: OrderRequest;
  payload: unknown | null;
  token: string | null;
  total: number;
  erro: string | null;
  /** Já houve uma tentativa (a do checkout): a próxima é daqui a `esperaMin` minutos. */
  esperaMin: number;
};

export async function enfileirar(nova: NovaEntrada): Promise<EntradaFila> {
  const db = await getDb();
  return db.tx(async (sql) => {
    const row = await sql.get<Linha>(
      `INSERT INTO pedidos_fila (cliente_id, etapa, motivo, pedido, payload, token, total, tentativas, proxima_tentativa, ultimo_erro, historico)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, to_char(now() AT TIME ZONE 'UTC' + make_interval(mins => ?), 'YYYY-MM-DD HH24:MI:SS'), ?, jsonb_build_array(jsonb_build_object('em', agora(), 'texto', ?::text))::text)
       RETURNING *`,
      [nova.clienteId, nova.etapa, nova.motivo, JSON.stringify(nova.pedido), nova.payload ? JSON.stringify(nova.payload) : null, nova.token, nova.total, nova.esperaMin, nova.erro, `Guardado no checkout: ${nova.motivo}`],
    );
    if (!row) throw new Error("fila: inserção sem retorno");
    const protocolo = protocoloDe(Number(row.id));
    await sql.run("UPDATE pedidos_fila SET protocolo = ? WHERE id = ?", [protocolo, row.id]);
    return daLinha({ ...row, protocolo });
  });
}

/**
 * Pega a próxima entrada pendente cuja hora chegou e a marca "enviando" (um servidor por vez: SKIP LOCKED). Antes,
 * entradas presas em "enviando" (o processo caiu no meio) vão para conferir: não se sabe se o pedido foi criado.
 */
export async function pegarPendente(id?: number): Promise<EntradaFila | null> {
  const db = await getDb();
  await db.run(
    `UPDATE pedidos_fila SET etapa = 'conferir', ultimo_erro = 'O envio foi interrompido: confira se o pedido foi criado na Padrão.', atualizado_em = agora(), ${HISTORICO}
     WHERE etapa = 'enviando' AND atualizado_em < to_char(now() AT TIME ZONE 'UTC' - make_interval(mins => ?), 'YYYY-MM-DD HH24:MI:SS')`,
    ["Envio interrompido (processo caiu): conferir", TRAVADO_MIN],
  );
  const row = await db.get<Linha>(
    `UPDATE pedidos_fila SET etapa = 'enviando', atualizado_em = agora()
     WHERE id = (
       SELECT id FROM pedidos_fila
       WHERE ${id ? "id = ? AND etapa IN ('pendente', 'conferir')" : "etapa = 'pendente' AND (proxima_tentativa IS NULL OR proxima_tentativa <= agora())"}
       ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    id ? [id] : [],
  );
  return row ? daLinha(row) : null;
}

/** Pedido criado na Padrão (ou simulado, com os pedidos desligados). */
export async function concluir(id: number, { numero, simulado, payload, texto }: { numero: string | null; simulado: boolean; payload: unknown; texto: string }) {
  await (await getDb()).run(
    `UPDATE pedidos_fila SET etapa = ?, numero_pedido = ?, payload = ?, ultimo_erro = NULL, proxima_tentativa = NULL, enviado_em = agora(), atualizado_em = agora(), ${HISTORICO} WHERE id = ?`,
    [simulado ? "simulado" : "enviado", numero, JSON.stringify(payload), texto, id],
  );
}

/** Sem conexão de novo: volta para pendente com a próxima tentativa daqui a `esperaMin` minutos. */
export async function reagendar(id: number, { erro, esperaMin, payload, token }: { erro: string; esperaMin: number; payload?: unknown; token?: string | null }) {
  await (await getDb()).run(
    `UPDATE pedidos_fila SET etapa = 'pendente', tentativas = tentativas + 1, ultimo_erro = ?,
       proxima_tentativa = to_char(now() AT TIME ZONE 'UTC' + make_interval(mins => ?), 'YYYY-MM-DD HH24:MI:SS'),
       payload = COALESCE(?, payload), token = COALESCE(?, token), atualizado_em = agora()
     WHERE id = ?`,
    [erro, esperaMin, payload === undefined ? null : JSON.stringify(payload), token ?? null, id],
  );
}

/** Precisa de alguém: recusa da API, preço mudou, sessão vencida, resposta sem confirmação ou tentativas esgotadas. */
export async function paraConferir(id: number, { erro, payload, contaTentativa = true }: { erro: string; payload?: unknown; contaTentativa?: boolean }) {
  await (await getDb()).run(
    `UPDATE pedidos_fila SET etapa = 'conferir', tentativas = tentativas + ?, ultimo_erro = ?, proxima_tentativa = NULL,
       payload = COALESCE(?, payload), atualizado_em = agora(), ${HISTORICO}
     WHERE id = ?`,
    [contaTentativa ? 1 : 0, erro, payload === undefined ? null : JSON.stringify(payload), `Para conferir: ${erro}`, id],
  );
}

/** A equipe criou o pedido por fora (ou confirmou que ele existe): marca como enviado com o número. */
export async function marcarEnviado(id: number, numero: string, autor: string): Promise<boolean> {
  return (
    (await (await getDb()).run(
      `UPDATE pedidos_fila SET etapa = 'enviado', numero_pedido = ?, ultimo_erro = NULL, proxima_tentativa = NULL, enviado_em = agora(), atualizado_em = agora(), ${HISTORICO}
       WHERE id = ? AND etapa IN ('pendente', 'conferir')`,
      [numero, `Marcado como enviado (pedido ${numero}) por ${autor}`, id],
    )) > 0
  );
}

export async function cancelar(id: number, autor: string, nota: string): Promise<boolean> {
  return (
    (await (await getDb()).run(
      `UPDATE pedidos_fila SET etapa = 'cancelado', proxima_tentativa = NULL, atualizado_em = agora(), ${HISTORICO} WHERE id = ? AND etapa IN ('pendente', 'conferir')`,
      [`Cancelado por ${autor}${nota ? `: ${nota}` : ""}`, id],
    )) > 0
  );
}

/** Volta uma entrada "conferir" para a fila automática (reenviar na próxima volta do worker). */
export async function voltarParaFila(id: number, autor: string): Promise<boolean> {
  return (
    (await (await getDb()).run(
      `UPDATE pedidos_fila SET etapa = 'pendente', tentativas = 0, proxima_tentativa = agora(), atualizado_em = agora(), ${HISTORICO} WHERE id = ? AND etapa = 'conferir'`,
      [`Devolvido à fila de reenvio por ${autor}`, id],
    )) > 0
  );
}

export async function listarFila({ etapa, limite = 300 }: { etapa?: EtapaFila | ""; limite?: number } = {}): Promise<EntradaFila[]> {
  const rows = await (await getDb()).all<Linha>(`SELECT * FROM pedidos_fila ${etapa ? "WHERE etapa = ?" : ""} ORDER BY id DESC LIMIT ?`, etapa ? [etapa, limite] : [limite]);
  return rows.map(daLinha);
}

export async function contarPorEtapa(): Promise<Partial<Record<EtapaFila, number>>> {
  const rows = await (await getDb()).all<{ etapa: string; n: number }>("SELECT etapa, count(*)::int AS n FROM pedidos_fila GROUP BY etapa");
  return Object.fromEntries(rows.filter((r) => isEtapaFila(r.etapa)).map((r) => [r.etapa, Number(r.n)]));
}

export async function obterEntrada(protocolo: string): Promise<EntradaFila | null> {
  const row = await (await getDb()).get<Linha>("SELECT * FROM pedidos_fila WHERE protocolo = ?", [protocolo]);
  return row ? daLinha(row) : null;
}

/** Pedidos do cliente ainda na fila ou que saíram dela nos últimos 30 dias (Meus pedidos). */
export async function daCliente(clienteId: number): Promise<EntradaFila[]> {
  const rows = await (await getDb()).all<Linha>(
    `SELECT * FROM pedidos_fila WHERE cliente_id = ? AND (etapa IN ('pendente', 'enviando', 'conferir') OR criado_em >= to_char(now() AT TIME ZONE 'UTC' - interval '30 days', 'YYYY-MM-DD HH24:MI:SS'))
     ORDER BY id DESC LIMIT 20`,
    [clienteId],
  );
  return rows.map(daLinha);
}

// ---------------------------------------------------------------------------------- imagens guardadas

/** Guarda um arquivo da arte que o Bunny não recebeu. Devolve o nome público (URL = pastaGuardados + nome). */
export async function guardarArquivo(clienteId: number, original: string, tipo: string, bytes: ArrayBuffer): Promise<string> {
  const nome = nomeGuardado(original, randomBytes(8).toString("hex"), Date.now());
  await (await getDb()).run("INSERT INTO arquivos (dono, nome, tipo, tamanho, dados) VALUES (?, ?, ?, ?, ?)", [`fila/${clienteId}`, nome, tipo || "application/octet-stream", bytes.byteLength, Buffer.from(bytes)]);
  return nome;
}

export async function lerArquivo(nome: string): Promise<{ bytes: Buffer; tipo: string } | null> {
  const row = await (await getDb()).get<{ tipo: string; dados: Buffer }>("SELECT tipo, dados FROM arquivos WHERE nome = ? AND dono LIKE 'fila/%'", [nome]);
  return row ? { bytes: row.dados, tipo: row.tipo } : null;
}

/** Apaga as imagens guardadas há mais de ARQUIVOS_DIAS dias. */
export async function limparArquivosAntigos(): Promise<number> {
  return (await getDb()).run(
    "DELETE FROM arquivos WHERE dono LIKE 'fila/%' AND criado_em < to_char(now() AT TIME ZONE 'UTC' - make_interval(days => ?), 'YYYY-MM-DD HH24:MI:SS')",
    [ARQUIVOS_DIAS],
  );
}
