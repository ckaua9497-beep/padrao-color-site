import "server-only";

import { getDb, transaction } from "./db";
import { isOrderStatus, isPaymentKind, type OrderStatus, type PaymentKind } from "./core";
import type { DeliveryAddress } from "../orders";

/*
 * Pedidos, pagamentos, saques, links de divulgação, visitas e administradores da multiloja (PostgreSQL,
 * parâmetros ligados). Junto com repo.ts, é todo o acesso ao banco das vendas.
 */

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const strOrNull = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown) => Number(v ?? 0);
const PAID = "('pago','em_producao','enviado','entregue')";

function parseJson<T>(raw: unknown, fallback: T): T {
  try {
    return typeof raw === "string" ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Texto para LIKE/ILIKE: tira os curingas que a pessoa digitou. */
const likeOf = (text: string) => `%${text.replace(/[%_\\]/g, "")}%`;

// ---------------------------------------------------------------------------------- pedidos

export type PaymentData = {
  /** PIX copia e cola. */
  pixCode?: string;
  /** Imagem do QR Code (data:image/png;base64,…). */
  pixImage?: string;
  /** Validade do PIX (ISO). */
  expiresAt?: string;
  /** Página de pagamento do cartão (link do provedor). */
  checkoutUrl?: string;
  /** Boleto: linha digitável, link do PDF e vencimento (AAAA-MM-DD). */
  boletoLine?: string;
  boletoUrl?: string;
  boletoExpiresAt?: string;
  /** Identificador do Pix recebido (endToEndId), para a devolução. */
  e2eId?: string;
  /** Devolução/reembolso pedido no gateway ao cancelar. */
  refund?: string;
};

export type Pedido = {
  id: number;
  lojaId: number;
  codigo: string;
  token: string;
  status: OrderStatus;
  cliente: { nome: string; email: string; telefone: string; documento: string };
  entrega: DeliveryAddress;
  formaPagamento: PaymentKind;
  subtotal: number;
  desconto: number;
  frete: number;
  total: number;
  custoBase: number;
  taxaPagamento: number;
  comissao: number;
  pagamentoProvedor: string;
  pagamentoId: string | null;
  pagamento: PaymentData;
  pagoEm: string | null;
  ref: string | null;
  observacoes: string;
  padraoPedido: string | null;
  /** Rastreamento anônimo: "visitante|sessão" de quem fez o pedido. */
  sessao: string | null;
  /** Frete: transportadora ("Correios SEDEX"), id do serviço na cotação da Padrão, prazo de transporte, custo real e se o
   * lojista deu o frete (o cliente pagou 0 e o custo saiu da comissão). Null nos pedidos de frete fixo da loja. */
  envio: { servico: string | null; servicoId: number | null; prazo: string | null; custo: number; gratis: boolean };
  criadoEm: string;
  atualizadoEm: string;
};

export type PedidoItem = {
  id: number;
  posicao: number;
  produtoId: string;
  grupoId: number | null;
  variacaoId: number | null;
  nome: string;
  opcoes: Record<string, string>;
  lotes: number;
  unidades: number;
  larguraCm: number | null;
  alturaCm: number | null;
  expresso: boolean;
  precoUnitario: number;
  baseUnitario: number;
  total: number;
  totalBase: number;
  margem: number;
  prazoDias: number | null;
  arteNome: string | null;
  arteArquivo: string | null;
};

export type PedidoEvento = { status: string; nota: string; autor: string; criadoEm: string };

function toPedido(row: Row): Pedido {
  const status = str(row.status);
  return {
    id: num(row.id),
    lojaId: num(row.loja_id),
    codigo: str(row.codigo),
    token: str(row.token),
    status: isOrderStatus(status) ? status : "aguardando_pagamento",
    cliente: { nome: str(row.cliente_nome), email: str(row.cliente_email), telefone: str(row.cliente_telefone), documento: str(row.cliente_documento) },
    entrega: parseJson<DeliveryAddress>(row.entrega, { cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "" }),
    formaPagamento: isPaymentKind(row.forma_pagamento) ? row.forma_pagamento : "pix",
    subtotal: num(row.subtotal),
    desconto: num(row.desconto),
    frete: num(row.frete),
    total: num(row.total),
    custoBase: num(row.custo_base),
    taxaPagamento: num(row.taxa_pagamento),
    comissao: num(row.comissao),
    pagamentoProvedor: str(row.pagamento_provedor),
    pagamentoId: strOrNull(row.pagamento_id),
    pagamento: parseJson<PaymentData>(row.pagamento_dados, {}),
    pagoEm: strOrNull(row.pago_em),
    ref: strOrNull(row.ref),
    observacoes: str(row.observacoes),
    padraoPedido: strOrNull(row.padrao_pedido),
    sessao: strOrNull(row.sessao),
    envio: {
      servico: strOrNull(row.frete_servico),
      servicoId: row.frete_servico_id == null ? null : num(row.frete_servico_id),
      prazo: strOrNull(row.frete_prazo),
      custo: row.frete_custo == null ? num(row.frete) : num(row.frete_custo),
      gratis: num(row.frete_gratis) === 1,
    },
    criadoEm: str(row.criado_em),
    atualizadoEm: str(row.atualizado_em),
  };
}

function toItem(row: Row): PedidoItem {
  const optional = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: num(row.id),
    posicao: num(row.posicao),
    produtoId: str(row.produto_id),
    grupoId: optional(row.grupo_id),
    variacaoId: optional(row.variacao_id),
    nome: str(row.nome),
    opcoes: parseJson<Record<string, string>>(row.opcoes, {}),
    lotes: num(row.lotes),
    unidades: num(row.unidades),
    larguraCm: optional(row.largura_cm),
    alturaCm: optional(row.altura_cm),
    expresso: num(row.expresso) === 1,
    precoUnitario: num(row.preco_unitario),
    baseUnitario: num(row.base_unitario),
    total: num(row.total),
    totalBase: num(row.total_base),
    margem: num(row.margem),
    prazoDias: optional(row.prazo_dias),
    arteNome: strOrNull(row.arte_nome),
    arteArquivo: strOrNull(row.arte_arquivo),
  };
}

export type NewPedido = Omit<Pedido, "id" | "status" | "pagamentoId" | "pagamento" | "pagoEm" | "padraoPedido" | "criadoEm" | "atualizadoEm">;
export type NewPedidoItem = Omit<PedidoItem, "id" | "arteArquivo">;

export async function createPedido(pedido: NewPedido, itens: NewPedidoItem[]): Promise<number> {
  return transaction(async (sql) => {
    const created = await sql.get<{ id: number }>(
      `INSERT INTO pedidos (loja_id, codigo, token, cliente_nome, cliente_email, cliente_telefone, cliente_documento, entrega, forma_pagamento,
        subtotal, desconto, frete, total, custo_base, taxa_pagamento, comissao, pagamento_provedor, ref, observacoes, sessao,
        frete_servico, frete_servico_id, frete_prazo, frete_custo, frete_gratis)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        pedido.lojaId,
        pedido.codigo,
        pedido.token,
        pedido.cliente.nome,
        pedido.cliente.email,
        pedido.cliente.telefone,
        pedido.cliente.documento,
        JSON.stringify(pedido.entrega),
        pedido.formaPagamento,
        pedido.subtotal,
        pedido.desconto,
        pedido.frete,
        pedido.total,
        pedido.custoBase,
        pedido.taxaPagamento,
        pedido.comissao,
        pedido.pagamentoProvedor,
        pedido.ref,
        pedido.observacoes,
        pedido.sessao,
        pedido.envio.servico,
        pedido.envio.servicoId,
        pedido.envio.prazo,
        pedido.envio.custo,
        pedido.envio.gratis ? 1 : 0,
      ],
    );
    const pedidoId = Number(created?.id);
    for (const item of itens) {
      await sql.run(
        `INSERT INTO pedido_itens (pedido_id, posicao, produto_id, grupo_id, variacao_id, nome, opcoes, lotes, unidades, largura_cm, altura_cm, expresso,
          preco_unitario, base_unitario, total, total_base, margem, prazo_dias, arte_nome)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pedidoId,
          item.posicao,
          item.produtoId,
          item.grupoId,
          item.variacaoId,
          item.nome,
          JSON.stringify(item.opcoes),
          item.lotes,
          item.unidades,
          item.larguraCm,
          item.alturaCm,
          item.expresso ? 1 : 0,
          item.precoUnitario,
          item.baseUnitario,
          item.total,
          item.totalBase,
          item.margem,
          item.prazoDias,
          item.arteNome,
        ],
      );
    }
    await sql.run("INSERT INTO pedido_eventos (pedido_id, status, nota, autor) VALUES (?, 'aguardando_pagamento', 'Pedido feito na loja.', 'cliente')", [pedidoId]);
    return pedidoId;
  });
}

export async function getPedidoByCodigo(codigo: string): Promise<Pedido | null> {
  const row = await (await getDb()).get("SELECT * FROM pedidos WHERE codigo = ?", [codigo]);
  return row ? toPedido(row) : null;
}

export async function getPedidoByPagamento(pagamentoId: string): Promise<Pedido | null> {
  const row = await (await getDb()).get("SELECT * FROM pedidos WHERE pagamento_id = ?", [pagamentoId]);
  return row ? toPedido(row) : null;
}

export async function listItens(pedidoId: number): Promise<PedidoItem[]> {
  return (await (await getDb()).all("SELECT * FROM pedido_itens WHERE pedido_id = ? ORDER BY posicao", [pedidoId])).map(toItem);
}

export async function listEventos(pedidoId: number): Promise<PedidoEvento[]> {
  return (await (await getDb()).all("SELECT * FROM pedido_eventos WHERE pedido_id = ? ORDER BY id", [pedidoId])).map((row) => ({
    status: str(row.status),
    nota: str(row.nota),
    autor: str(row.autor),
    criadoEm: str(row.criado_em),
  }));
}

export type PedidoFiltro = { lojaId?: number; status?: OrderStatus | ""; busca?: string; desde?: string; limite?: number };

/** Pedidos mais recentes primeiro. `busca` procura no código, nome e e-mail do cliente (sem diferenciar maiúsculas). */
export async function listPedidos(filtro: PedidoFiltro = {}): Promise<(Pedido & { lojaNome: string; lojaSubdominio: string })[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  if (filtro.lojaId) {
    where.push("p.loja_id = ?");
    values.push(filtro.lojaId);
  }
  if (filtro.status) {
    where.push("p.status = ?");
    values.push(filtro.status);
  }
  if (filtro.busca) {
    where.push("(p.codigo ILIKE ? OR p.cliente_nome ILIKE ? OR p.cliente_email ILIKE ?)");
    const like = likeOf(filtro.busca);
    values.push(like, like, like);
  }
  if (filtro.desde) {
    where.push("p.criado_em >= ?");
    values.push(filtro.desde);
  }
  const sql = `SELECT p.*, l.nome AS loja_nome, l.subdominio AS loja_subdominio FROM pedidos p JOIN lojas l ON l.id = p.loja_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY p.id DESC LIMIT ?`;
  values.push(Math.min(filtro.limite ?? 200, 1000));
  return (await (await getDb()).all(sql, values)).map((row) => ({ ...toPedido(row), lojaNome: str(row.loja_nome), lojaSubdominio: str(row.loja_subdominio) }));
}

/** Quantos pedidos há em cada status (abas da lista de pedidos e fila do menu do admin). */
export async function countPedidosByStatus(lojaId?: number): Promise<Partial<Record<OrderStatus, number>>> {
  const db = await getDb();
  const rows = lojaId ? await db.all("SELECT status, COUNT(*) AS n FROM pedidos WHERE loja_id = ? GROUP BY status", [lojaId]) : await db.all("SELECT status, COUNT(*) AS n FROM pedidos GROUP BY status");
  return Object.fromEntries(rows.map((r) => [str(r.status), num(r.n)])) as Partial<Record<OrderStatus, number>>;
}

/** Muda o status e registra no histórico. `pago` grava a data do pagamento. */
export async function setPedidoStatus(pedidoId: number, status: OrderStatus, autor: string, nota = "") {
  await transaction(async (sql) => {
    await sql.run(`UPDATE pedidos SET status = ?, ${status === "pago" ? "pago_em = COALESCE(pago_em, agora()), " : ""}atualizado_em = agora() WHERE id = ?`, [status, pedidoId]);
    await sql.run("INSERT INTO pedido_eventos (pedido_id, status, nota, autor) VALUES (?, ?, ?, ?)", [pedidoId, status, nota, autor]);
  });
}

/** Marca o pedido como pago se ele ainda esperava pagamento. false = outro aviso já marcou (ou não esperava). */
export async function markPedidoPago(pedidoId: number, autor: string, nota: string): Promise<boolean> {
  return transaction(async (sql) => {
    const changed = await sql.run(
      "UPDATE pedidos SET status = 'pago', pago_em = COALESCE(pago_em, agora()), atualizado_em = agora() WHERE id = ? AND status IN ('aguardando_pagamento', 'expirado')",
      [pedidoId],
    );
    if (!changed) return false;
    await sql.run("INSERT INTO pedido_eventos (pedido_id, status, nota, autor) VALUES (?, 'pago', ?, ?)", [pedidoId, nota, autor]);
    return true;
  });
}

export async function setPedidoPagamento(pedidoId: number, provedor: string, pagamentoId: string, dados: PaymentData) {
  await (await getDb()).run("UPDATE pedidos SET pagamento_provedor = ?, pagamento_id = ?, pagamento_dados = ?, atualizado_em = agora() WHERE id = ?", [provedor, pagamentoId, JSON.stringify(dados), pedidoId]);
}

/** Junta dados novos ao pagamento do pedido (e2eId do Pix, situação da devolução), sem perder o que já estava lá. */
export async function mergePedidoPagamento(pedidoId: number, extra: Partial<PaymentData>) {
  await transaction(async (sql) => {
    const row = await sql.get("SELECT pagamento_dados FROM pedidos WHERE id = ? FOR UPDATE", [pedidoId]);
    const current = parseJson<PaymentData>(row?.pagamento_dados, {});
    await sql.run("UPDATE pedidos SET pagamento_dados = ?, atualizado_em = agora() WHERE id = ?", [JSON.stringify({ ...current, ...extra }), pedidoId]);
  });
}

export async function setPedidoPadrao(pedidoId: number, numero: string) {
  await (await getDb()).run("UPDATE pedidos SET padrao_pedido = ?, atualizado_em = agora() WHERE id = ?", [numero, pedidoId]);
}

export async function setItemArte(itemId: number, arquivo: string, nome: string) {
  await (await getDb()).run("UPDATE pedido_itens SET arte_arquivo = ?, arte_nome = ? WHERE id = ?", [arquivo, nome, itemId]);
}

/** Pedidos de um cliente (e-mail) na loja: para "Clientes" do painel. */
export type ClienteResumo = { email: string; nome: string; telefone: string; pedidos: number; pagos: number; total: number; ultimo: string };

export async function listClientes(lojaId: number): Promise<ClienteResumo[]> {
  const rows = await (await getDb()).all(
    `SELECT cliente_email AS email, MAX(cliente_nome) AS nome, MAX(cliente_telefone) AS telefone, COUNT(*) AS pedidos,
      SUM(CASE WHEN status IN ${PAID} THEN 1 ELSE 0 END) AS pagos,
      SUM(CASE WHEN status IN ${PAID} THEN total ELSE 0 END) AS total,
      MAX(criado_em) AS ultimo
     FROM pedidos WHERE loja_id = ? GROUP BY cliente_email ORDER BY ultimo DESC LIMIT 500`,
    [lojaId],
  );
  return rows.map((row) => ({ email: str(row.email), nome: str(row.nome), telefone: str(row.telefone), pedidos: num(row.pedidos), pagos: num(row.pagos), total: num(row.total), ultimo: str(row.ultimo) }));
}

/** Pedidos para o saldo (status, comissão, data do pagamento). */
export async function listComissoes(lojaId: number): Promise<{ status: OrderStatus; comissao: number; pagoEm: string | null }[]> {
  return (await (await getDb()).all("SELECT status, comissao, pago_em FROM pedidos WHERE loja_id = ? AND pago_em IS NOT NULL", [lojaId])).map((row) => {
    const status = str(row.status);
    return { status: isOrderStatus(status) ? status : "aguardando_pagamento", comissao: num(row.comissao), pagoEm: strOrNull(row.pago_em) };
  });
}

/** Resumo de vendas por loja desde uma data (painel e admin). */
export async function salesSummary(lojaId: number | null, desde: string): Promise<{ pedidos: number; pagos: number; faturamento: number; comissao: number }> {
  const row = await (await getDb()).get(
    `SELECT COUNT(*) AS pedidos,
      SUM(CASE WHEN status IN ${PAID} THEN 1 ELSE 0 END) AS pagos,
      SUM(CASE WHEN status IN ${PAID} THEN total ELSE 0 END) AS faturamento,
      SUM(CASE WHEN status IN ${PAID} THEN comissao ELSE 0 END) AS comissao
     FROM pedidos WHERE criado_em >= ? ${lojaId ? "AND loja_id = ?" : ""}`,
    lojaId ? [desde, lojaId] : [desde],
  );
  return { pedidos: num(row?.pedidos), pagos: num(row?.pagos), faturamento: num(row?.faturamento), comissao: num(row?.comissao) };
}

// ---------------------------------------------------------------------------------- saques

export type Saque = { id: number; lojaId: number; valor: number; chavePix: string; status: "solicitado" | "pago" | "recusado"; nota: string; criadoEm: string; resolvidoEm: string | null };

function toSaque(row: Row): Saque {
  const status = str(row.status);
  return {
    id: num(row.id),
    lojaId: num(row.loja_id),
    valor: num(row.valor),
    chavePix: str(row.chave_pix),
    status: status === "pago" || status === "recusado" ? status : "solicitado",
    nota: str(row.nota),
    criadoEm: str(row.criado_em),
    resolvidoEm: strOrNull(row.resolvido_em),
  };
}

export async function listSaques(lojaId: number | null): Promise<(Saque & { lojaNome: string })[]> {
  const rows = await (await getDb()).all(`SELECT s.*, l.nome AS loja_nome FROM saques s JOIN lojas l ON l.id = s.loja_id ${lojaId ? "WHERE s.loja_id = ?" : ""} ORDER BY s.id DESC LIMIT 500`, lojaId ? [lojaId] : []);
  return rows.map((row) => ({ ...toSaque(row), lojaNome: str(row.loja_nome) }));
}

export async function createSaque(lojaId: number, valor: number, chavePix: string): Promise<number> {
  const row = await (await getDb()).get<{ id: number }>("INSERT INTO saques (loja_id, valor, chave_pix) VALUES (?, ?, ?) RETURNING id", [lojaId, valor, chavePix]);
  return num(row?.id);
}

export async function resolveSaque(id: number, status: "pago" | "recusado", nota: string): Promise<boolean> {
  return (await (await getDb()).run("UPDATE saques SET status = ?, nota = ?, resolvido_em = agora() WHERE id = ? AND status = 'solicitado'", [status, nota, id])) > 0;
}

// ---------------------------------------------------------------------------------- divulgação

export type LinkDivulgacao = { id: number; slug: string; nome: string; criadoEm: string };

export async function listLinks(lojaId: number): Promise<LinkDivulgacao[]> {
  return (await (await getDb()).all("SELECT * FROM links WHERE loja_id = ? ORDER BY id DESC", [lojaId])).map((row) => ({ id: num(row.id), slug: str(row.slug), nome: str(row.nome), criadoEm: str(row.criado_em) }));
}

export async function createLink(lojaId: number, slug: string, nome: string): Promise<boolean> {
  return (await (await getDb()).run("INSERT INTO links (loja_id, slug, nome) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", [lojaId, slug, nome])) > 0;
}

export async function deleteLink(lojaId: number, id: number) {
  await (await getDb()).run("DELETE FROM links WHERE loja_id = ? AND id = ?", [lojaId, id]);
}

/** Soma uma visita do dia (ref "" = acesso sem link de divulgação). */
export async function countVisit(lojaId: number, ref: string, dia: string) {
  await (await getDb()).run("INSERT INTO visitas (loja_id, ref, dia, total) VALUES (?, ?, ?, 1) ON CONFLICT (loja_id, ref, dia) DO UPDATE SET total = visitas.total + 1", [lojaId, ref, dia]);
}

/** Visitas e vendas por origem (ref) desde um dia. */
export async function refStats(lojaId: number, desdeDia: string): Promise<{ ref: string; visitas: number; pedidos: number; pagos: number; faturamento: number }[]> {
  const db = await getDb();
  const visits = await db.all("SELECT ref, SUM(total) AS n FROM visitas WHERE loja_id = ? AND dia >= ? GROUP BY ref", [lojaId, desdeDia]);
  const sales = await db.all(
    `SELECT COALESCE(ref, '') AS ref, COUNT(*) AS pedidos,
      SUM(CASE WHEN status IN ${PAID} THEN 1 ELSE 0 END) AS pagos,
      SUM(CASE WHEN status IN ${PAID} THEN total ELSE 0 END) AS faturamento
     FROM pedidos WHERE loja_id = ? AND substr(criado_em, 1, 10) >= ? GROUP BY COALESCE(ref, '')`,
    [lojaId, desdeDia],
  );
  const map = new Map<string, { ref: string; visitas: number; pedidos: number; pagos: number; faturamento: number }>();
  for (const v of visits) map.set(str(v.ref), { ref: str(v.ref), visitas: num(v.n), pedidos: 0, pagos: 0, faturamento: 0 });
  for (const s of sales) {
    const entry = map.get(str(s.ref)) ?? { ref: str(s.ref), visitas: 0, pedidos: 0, pagos: 0, faturamento: 0 };
    Object.assign(entry, { pedidos: num(s.pedidos), pagos: num(s.pagos), faturamento: num(s.faturamento) });
    map.set(entry.ref, entry);
  }
  return [...map.values()];
}

/** Visitas por dia (todas as origens) desde um dia. */
export async function visitsByDay(lojaId: number, desdeDia: string): Promise<{ dia: string; visitas: number }[]> {
  return (await (await getDb()).all("SELECT dia, SUM(total) AS n FROM visitas WHERE loja_id = ? AND dia >= ? GROUP BY dia ORDER BY dia", [lojaId, desdeDia])).map((row) => ({
    dia: str(row.dia),
    visitas: num(row.n),
  }));
}

// ---------------------------------------------------------------------------------- admin

export type Admin = { id: number; nome: string; email: string };

export async function findAdminLogin(email: string): Promise<(Admin & { senhaHash: string }) | null> {
  const row = await (await getDb()).get("SELECT * FROM admins WHERE email = ?", [email.toLowerCase()]);
  return row ? { id: num(row.id), nome: str(row.nome), email: str(row.email), senhaHash: str(row.senha_hash) } : null;
}

export async function getAdmin(id: number): Promise<Admin | null> {
  const row = await (await getDb()).get("SELECT id, nome, email FROM admins WHERE id = ?", [id]);
  return row ? { id: num(row.id), nome: str(row.nome), email: str(row.email) } : null;
}

export async function touchAdminLogin(id: number) {
  await (await getDb()).run("UPDATE admins SET ultimo_login = agora() WHERE id = ?", [id]);
}

export type LojaAdminRow = {
  id: number;
  nome: string;
  subdominio: string;
  dominio: string | null;
  dominioVerificado: boolean;
  plano: string;
  ativa: boolean;
  criadoEm: string;
  lojistaId: number;
  lojistaNome: string;
  lojistaEmail: string;
  lojistaTipo: string;
  lojistaStatus: string;
  produtos: number;
  pedidosPagos: number;
  faturamento: number;
};

export async function listLojasAdmin(busca = ""): Promise<LojaAdminRow[]> {
  const like = likeOf(busca);
  const rows = await (await getDb()).all(
    `SELECT l.id, l.nome, l.subdominio, l.dominio, l.dominio_verificado, l.plano, l.ativa, l.criado_em, j.id AS lojista_id, j.nome AS lojista_nome, j.email AS lojista_email,
      j.tipo AS lojista_tipo, j.status AS lojista_status,
      (SELECT COUNT(*) FROM loja_produtos lp WHERE lp.loja_id = l.id) AS produtos,
      (SELECT COUNT(*) FROM pedidos p WHERE p.loja_id = l.id AND p.status IN ${PAID}) AS pedidos_pagos,
      (SELECT COALESCE(SUM(total), 0) FROM pedidos p WHERE p.loja_id = l.id AND p.status IN ${PAID}) AS faturamento
     FROM lojas l JOIN lojistas j ON j.id = l.lojista_id
     WHERE l.nome ILIKE ? OR l.subdominio ILIKE ? OR j.email ILIKE ? OR j.nome ILIKE ?
     ORDER BY l.id DESC LIMIT 500`,
    [like, like, like, like],
  );
  return rows.map((row) => ({
    id: num(row.id),
    nome: str(row.nome),
    subdominio: str(row.subdominio),
    dominio: strOrNull(row.dominio),
    dominioVerificado: num(row.dominio_verificado) === 1,
    plano: str(row.plano),
    ativa: num(row.ativa) === 1,
    criadoEm: str(row.criado_em),
    lojistaId: num(row.lojista_id),
    lojistaNome: str(row.lojista_nome),
    lojistaEmail: str(row.lojista_email),
    lojistaTipo: str(row.lojista_tipo),
    lojistaStatus: str(row.lojista_status),
    produtos: num(row.produtos),
    pedidosPagos: num(row.pedidos_pagos),
    faturamento: num(row.faturamento),
  }));
}
