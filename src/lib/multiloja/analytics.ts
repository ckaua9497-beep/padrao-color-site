import "server-only";

import type { SQLInputValue } from "node:sqlite";
import { getProductById } from "../catalog";
import { dayKey } from "./core";
import { getDb } from "./db";
import { cartContents, type EventType, type Funnel, type TrackedEvent } from "./eventos";

/*
 * Rastreamento: gravação dos eventos (tabela `eventos`) e as consultas do painel de análise da Padrão.
 * loja_id 0 = site da Padrão Color; > 0 = multiloja. Sem dados pessoais (ver eventos.ts).
 */

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

/** Produto no formato do catálogo (id), aceitando id ou slug. */
function productKey(value: string | null): string | null {
  if (!value) return null;
  return getProductById(value)?.id ?? null;
}

export function insertEvents(lojaId: number, visitante: string, sessao: string, dispositivo: string, eventos: (TrackedEvent | (Omit<TrackedEvent, "tipo"> & { tipo: EventType; pedido?: string }))[]) {
  if (!eventos.length) return;
  const db = getDb();
  const insert = db.prepare(
    "INSERT INTO eventos (dia, loja_id, visitante, sessao, tipo, produto_id, quantidade, valor, pedido, ref, caminho, dispositivo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const dia = dayKey();
  db.exec("BEGIN");
  try {
    for (const e of eventos) {
      insert.run(dia, lojaId, visitante, sessao, e.tipo, productKey(e.produto), e.quantidade, e.valor, "pedido" in e ? (e.pedido ?? null) : null, e.ref, e.caminho, dispositivo);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export type OrderEventInput = {
  lojaId: number;
  visitante: string | null;
  sessao: string | null;
  codigo: string;
  total: number;
  itens: { produto: string; quantidade: number; valor: number }[];
};

/** Pedido criado (com os itens) ou pago, gravado pelo servidor a partir do pedido de verdade. */
export function recordOrderEvent(kind: "pedido_criado" | "pedido_pago", order: OrderEventInput) {
  const visitante = order.visitante ?? "servidor000000000000";
  const sessao = order.sessao ?? `pedido${order.codigo.replace(/[^a-z0-9]/gi, "").toLowerCase()}`.padEnd(16, "0");
  const base = { caminho: null, ref: null };
  const eventos = [{ tipo: kind, produto: null, quantidade: null, valor: order.total, pedido: order.codigo, ...base }] as (Omit<TrackedEvent, "tipo"> & { tipo: EventType; pedido?: string })[];
  if (kind === "pedido_criado") {
    for (const item of order.itens) eventos.push({ tipo: "pedido_item", produto: item.produto, quantidade: item.quantidade, valor: item.valor, pedido: order.codigo, ...base });
  }
  try {
    insertEvents(order.lojaId, visitante, sessao, "servidor", eventos);
  } catch (error) {
    // Rastreamento nunca derruba o pedido.
    console.error("[rastreamento]", error instanceof Error ? error.message : error);
  }
}

// ---------------------------------------------------------------------------------- escopo das consultas

/** "todas" = site + multilojas; "site" = loja 0; "multilojas" = todas as lojas; número = uma loja. */
export type Scope = "todas" | "site" | "multilojas" | number;

function where(scope: Scope, desde: string, alias = ""): { sql: string; values: SQLInputValue[] } {
  const a = alias ? `${alias}.` : "";
  const parts = [`${a}dia >= ?`];
  const values: SQLInputValue[] = [desde];
  if (scope === "site") parts.push(`${a}loja_id = 0`);
  else if (scope === "multilojas") parts.push(`${a}loja_id > 0`);
  else if (typeof scope === "number") {
    parts.push(`${a}loja_id = ?`);
    values.push(scope);
  }
  return { sql: parts.join(" AND "), values };
}

// ---------------------------------------------------------------------------------- consultas

/**
 * O funil (`Funnel`) conta sessões em cada etapa, inclusive "pedido" e "pago" (uma sessão com dois pedidos conta
 * uma vez); `pedidos` e `pagos` são os pedidos em si, para os totais e o ticket médio.
 */
export type Kpis = Funnel & { visitantes: number; paginas: number; pedidos: number; pagos: number; valorPedidos: number; valorPago: number; ticketMedio: number };

export function kpis(scope: Scope, desde: string): Kpis {
  const w = where(scope, desde);
  const row = getDb()
    .prepare(
      `SELECT
        COUNT(DISTINCT CASE WHEN tipo = 'visita' THEN visitante END) AS visitantes,
        COUNT(DISTINCT CASE WHEN tipo = 'visita' THEN sessao END) AS sessoes,
        SUM(CASE WHEN tipo = 'visita' THEN 1 ELSE 0 END) AS paginas,
        COUNT(DISTINCT CASE WHEN tipo = 'produto_view' THEN sessao END) AS produto,
        COUNT(DISTINCT CASE WHEN tipo = 'carrinho_add' THEN sessao END) AS carrinho,
        COUNT(DISTINCT CASE WHEN tipo = 'checkout_inicio' THEN sessao END) AS checkout,
        COUNT(DISTINCT CASE WHEN tipo = 'pedido_criado' THEN sessao END) AS pedido,
        COUNT(DISTINCT CASE WHEN tipo = 'pedido_pago' THEN sessao END) AS pago,
        SUM(CASE WHEN tipo = 'pedido_criado' THEN 1 ELSE 0 END) AS pedidos,
        SUM(CASE WHEN tipo = 'pedido_pago' THEN 1 ELSE 0 END) AS pagos,
        SUM(CASE WHEN tipo = 'pedido_criado' THEN valor ELSE 0 END) AS valor_pedidos,
        SUM(CASE WHEN tipo = 'pedido_pago' THEN valor ELSE 0 END) AS valor_pago
       FROM eventos WHERE ${w.sql}`,
    )
    .get(...w.values) as Row;
  const pedidos = num(row.pedidos);
  return {
    visitantes: num(row.visitantes),
    sessoes: num(row.sessoes),
    paginas: num(row.paginas),
    produto: num(row.produto),
    carrinho: num(row.carrinho),
    checkout: num(row.checkout),
    pedido: num(row.pedido),
    pago: num(row.pago),
    pedidos,
    pagos: num(row.pagos),
    valorPedidos: num(row.valor_pedidos),
    valorPago: num(row.valor_pago),
    ticketMedio: pedidos ? Math.round((num(row.valor_pedidos) / pedidos) * 100) / 100 : 0,
  };
}

export type DayPoint = { dia: string; visitantes: number; sessoes: number; pedidos: number; valor: number };

export function byDay(scope: Scope, desde: string): DayPoint[] {
  const w = where(scope, desde);
  return (
    getDb()
      .prepare(
        `SELECT dia,
          COUNT(DISTINCT CASE WHEN tipo = 'visita' THEN visitante END) AS visitantes,
          COUNT(DISTINCT CASE WHEN tipo = 'visita' THEN sessao END) AS sessoes,
          SUM(CASE WHEN tipo = 'pedido_criado' THEN 1 ELSE 0 END) AS pedidos,
          SUM(CASE WHEN tipo = 'pedido_criado' THEN valor ELSE 0 END) AS valor
         FROM eventos WHERE ${w.sql} GROUP BY dia ORDER BY dia`,
      )
      .all(...w.values) as Row[]
  ).map((r) => ({ dia: str(r.dia), visitantes: num(r.visitantes), sessoes: num(r.sessoes), pedidos: num(r.pedidos), valor: num(r.valor) }));
}

/** Visitas e pedidos por hora do dia (Brasília). */
export function byHour(scope: Scope, desde: string): { hora: number; visitas: number; pedidos: number }[] {
  const w = where(scope, desde);
  const rows = getDb()
    .prepare(
      `SELECT CAST(strftime('%H', datetime(criado_em, '-3 hours')) AS INTEGER) AS hora,
        SUM(CASE WHEN tipo = 'visita' THEN 1 ELSE 0 END) AS visitas,
        SUM(CASE WHEN tipo = 'pedido_criado' THEN 1 ELSE 0 END) AS pedidos
       FROM eventos WHERE ${w.sql} GROUP BY hora`,
    )
    .all(...w.values) as Row[];
  const map = new Map(rows.map((r) => [num(r.hora), { visitas: num(r.visitas), pedidos: num(r.pedidos) }]));
  return Array.from({ length: 24 }, (_, hora) => ({ hora, visitas: map.get(hora)?.visitas ?? 0, pedidos: map.get(hora)?.pedidos ?? 0 }));
}

/** `sessoesPedido`: sessões que fizeram pedido (base da conversão); `pedidos`: pedidos feitos. */
export type ChannelRow = { lojaId: number; nome: string; subdominio: string | null; visitantes: number; sessoes: number; carrinho: number; sessoesPedido: number; pedidos: number; valor: number; pagos: number; valorPago: number };

/** Site da Padrão e cada multiloja lado a lado. */
export function channels(desde: string): ChannelRow[] {
  const rows = getDb()
    .prepare(
      `SELECT e.loja_id,
        COALESCE(l.nome, 'Site Padrão Color') AS nome, l.subdominio,
        COUNT(DISTINCT CASE WHEN e.tipo = 'visita' THEN e.visitante END) AS visitantes,
        COUNT(DISTINCT CASE WHEN e.tipo = 'visita' THEN e.sessao END) AS sessoes,
        COUNT(DISTINCT CASE WHEN e.tipo = 'carrinho_add' THEN e.sessao END) AS carrinho,
        COUNT(DISTINCT CASE WHEN e.tipo = 'pedido_criado' THEN e.sessao END) AS sessoes_pedido,
        SUM(CASE WHEN e.tipo = 'pedido_criado' THEN 1 ELSE 0 END) AS pedidos,
        SUM(CASE WHEN e.tipo = 'pedido_criado' THEN e.valor ELSE 0 END) AS valor,
        SUM(CASE WHEN e.tipo = 'pedido_pago' THEN 1 ELSE 0 END) AS pagos,
        SUM(CASE WHEN e.tipo = 'pedido_pago' THEN e.valor ELSE 0 END) AS valor_pago
       FROM eventos e LEFT JOIN lojas l ON l.id = e.loja_id
       WHERE e.dia >= ? GROUP BY e.loja_id ORDER BY valor DESC, sessoes DESC`,
    )
    .all(desde) as Row[];
  return rows.map((r) => ({
    lojaId: num(r.loja_id),
    nome: str(r.nome),
    subdominio: r.subdominio ? str(r.subdominio) : null,
    visitantes: num(r.visitantes),
    sessoes: num(r.sessoes),
    carrinho: num(r.carrinho),
    sessoesPedido: num(r.sessoes_pedido),
    pedidos: num(r.pedidos),
    valor: num(r.valor),
    pagos: num(r.pagos),
    valorPago: num(r.valor_pago),
  }));
}

/** `views`, `carrinhos` e `compradores` são sessões (cada uma conta uma vez); `pedidos`, pedidos com o produto. */
export type ProductRow = { produtoId: string; nome: string; categoria: string; views: number; carrinhos: number; compradores: number; pedidos: number; unidades: number; receita: number; receitaSite: number; receitaLojas: number; lojas: number };

/** Fluxo de produtos: vistos → carrinho → vendidos, com a receita do site e das multilojas. */
export function products(scope: Scope, desde: string, limit = 50): ProductRow[] {
  const w = where(scope, desde);
  const rows = getDb()
    .prepare(
      `SELECT produto_id,
        COUNT(DISTINCT CASE WHEN tipo = 'produto_view' THEN sessao END) AS views,
        COUNT(DISTINCT CASE WHEN tipo = 'carrinho_add' THEN sessao END) AS carrinhos,
        COUNT(DISTINCT CASE WHEN tipo = 'pedido_item' THEN sessao END) AS compradores,
        COUNT(DISTINCT CASE WHEN tipo = 'pedido_item' THEN pedido END) AS pedidos,
        SUM(CASE WHEN tipo = 'pedido_item' THEN quantidade ELSE 0 END) AS unidades,
        SUM(CASE WHEN tipo = 'pedido_item' THEN valor ELSE 0 END) AS receita,
        SUM(CASE WHEN tipo = 'pedido_item' AND loja_id = 0 THEN valor ELSE 0 END) AS receita_site,
        SUM(CASE WHEN tipo = 'pedido_item' AND loja_id > 0 THEN valor ELSE 0 END) AS receita_lojas,
        COUNT(DISTINCT CASE WHEN tipo = 'pedido_item' AND loja_id > 0 THEN loja_id END) AS lojas
       FROM eventos WHERE ${w.sql} AND produto_id IS NOT NULL
       GROUP BY produto_id ORDER BY receita DESC, carrinhos DESC, views DESC LIMIT ?`,
    )
    .all(...w.values, limit) as Row[];
  return rows.map((r) => {
    const product = getProductById(str(r.produto_id));
    return {
      produtoId: str(r.produto_id),
      nome: product?.name ?? str(r.produto_id),
      categoria: product?.category ?? "",
      views: num(r.views),
      carrinhos: num(r.carrinhos),
      compradores: num(r.compradores),
      pedidos: num(r.pedidos),
      unidades: num(r.unidades),
      receita: num(r.receita),
      receitaSite: num(r.receita_site),
      receitaLojas: num(r.receita_lojas),
      lojas: num(r.lojas),
    };
  });
}

export type AbandonedCart = { sessao: string; lojaId: number; loja: string; ultimo: string; dispositivo: string; chegouCheckout: boolean; itens: { produto: string; nome: string; quantidade: number; valor: number }[]; valor: number };

/**
 * Carrinhos abandonados: sessões com produto no carrinho, sem pedido, paradas há mais de 30 minutos. Anônimos:
 * mostram o que ficou no carrinho, a loja e o aparelho (nada de contato do cliente).
 */
export function abandonedCarts(scope: Scope, desde: string, limit = 40): AbandonedCart[] {
  const w = where(scope, desde, "e");
  const sessions = getDb()
    .prepare(
      `SELECT e.sessao, e.loja_id, COALESCE(l.nome, 'Site Padrão Color') AS loja, MAX(e.criado_em) AS ultimo, MAX(e.dispositivo) AS dispositivo,
        MAX(CASE WHEN e.tipo = 'checkout_inicio' THEN 1 ELSE 0 END) AS checkout
       FROM eventos e LEFT JOIN lojas l ON l.id = e.loja_id
       WHERE ${w.sql}
       GROUP BY e.sessao, e.loja_id
       HAVING SUM(CASE WHEN e.tipo = 'carrinho_add' THEN 1 ELSE 0 END) > 0
         AND SUM(CASE WHEN e.tipo = 'pedido_criado' THEN 1 ELSE 0 END) = 0
         AND MAX(e.criado_em) < datetime('now', '-30 minutes')
       ORDER BY ultimo DESC LIMIT ?`,
    )
    .all(...w.values, limit) as Row[];
  const cartEvents = getDb().prepare("SELECT tipo, produto_id, quantidade, valor FROM eventos WHERE sessao = ? AND loja_id = ? AND tipo IN ('carrinho_add', 'carrinho_remove')");
  return sessions.map((s) => {
    const itens = cartContents((cartEvents.all(str(s.sessao), num(s.loja_id)) as Row[]).map((e) => ({ tipo: str(e.tipo), produto: e.produto_id ? str(e.produto_id) : null, quantidade: e.quantidade == null ? null : num(e.quantidade), valor: e.valor == null ? null : num(e.valor) })));
    return {
      sessao: str(s.sessao),
      lojaId: num(s.loja_id),
      loja: str(s.loja),
      ultimo: str(s.ultimo),
      dispositivo: str(s.dispositivo),
      chegouCheckout: num(s.checkout) === 1,
      itens: itens.map((i) => ({ ...i, nome: getProductById(i.produto)?.name ?? i.produto })),
      valor: Math.round(itens.reduce((sum, i) => sum + i.valor, 0) * 100) / 100,
    };
  });
}

/** Origens (links de divulgação) e aparelhos das visitas. */
export function sources(scope: Scope, desde: string): { refs: { ref: string; sessoes: number }[]; dispositivos: { dispositivo: string; sessoes: number }[] } {
  const w = where(scope, desde);
  const refs = getDb()
    // A origem fica só na primeira página da sessão: cada sessão conta uma vez, com a origem que trouxe.
    .prepare(`SELECT ref, COUNT(*) AS sessoes FROM (SELECT sessao, COALESCE(MAX(ref), '') AS ref FROM eventos WHERE ${w.sql} AND tipo = 'visita' GROUP BY sessao) GROUP BY ref ORDER BY sessoes DESC LIMIT 20`)
    .all(...w.values) as Row[];
  const devices = getDb()
    .prepare(`SELECT dispositivo, COUNT(DISTINCT sessao) AS sessoes FROM eventos WHERE ${w.sql} AND tipo = 'visita' GROUP BY dispositivo ORDER BY sessoes DESC`)
    .all(...w.values) as Row[];
  return { refs: refs.map((r) => ({ ref: str(r.ref), sessoes: num(r.sessoes) })), dispositivos: devices.map((r) => ({ dispositivo: str(r.dispositivo), sessoes: num(r.sessoes) })) };
}
