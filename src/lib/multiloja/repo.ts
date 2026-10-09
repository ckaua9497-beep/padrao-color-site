import "server-only";

import type { SQLInputValue } from "node:sqlite";
import { getDb, transaction } from "./db";
import { isPalette, isPlan, SOCIAL_KEYS, type LojistaType, type PaletteKey, type Plan, type SocialKey } from "./core";

/*
 * Acesso aos dados da multiloja (SQL comum, parâmetros sempre ligados — nunca texto montado com entrada do
 * usuário). As páginas e ações usam só estas funções.
 */

export type Lojista = {
  id: number;
  nome: string;
  email: string;
  tipo: LojistaType;
  telefone: string | null;
  status: "ativo" | "bloqueado";
  criadoEm: string;
  ultimoLogin: string | null;
};

export type Banner = { src: string; alt: string; href: string | null };

export type Loja = {
  id: number;
  lojistaId: number;
  subdominio: string;
  dominio: string | null;
  nome: string;
  slogan: string;
  sobre: string;
  logo: string | null;
  whatsapp: string | null;
  telefone: string | null;
  emailContato: string | null;
  redes: Partial<Record<SocialKey, string>>;
  paleta: PaletteKey;
  banners: Banner[];
  categoriasDestaque: string[];
  margemPadrao: number;
  plano: Plan;
  ativa: boolean;
  criadoEm: string;
  atualizadoEm: string;
};

export type LojaProduto = { produtoId: string; margem: number | null; destaque: boolean; ativadoEm: string };

type Row = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const strOrNull = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);

function parseJson<T>(raw: unknown, fallback: T): T {
  try {
    return typeof raw === "string" ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function toLojista(row: Row): Lojista {
  return {
    id: Number(row.id),
    nome: str(row.nome),
    email: str(row.email),
    tipo: str(row.tipo) as LojistaType,
    telefone: strOrNull(row.telefone),
    status: row.status === "bloqueado" ? "bloqueado" : "ativo",
    criadoEm: str(row.criado_em),
    ultimoLogin: strOrNull(row.ultimo_login),
  };
}

function toLoja(row: Row): Loja {
  const redes = parseJson<Record<string, unknown>>(row.redes, {});
  const banners = parseJson<unknown[]>(row.banners, []);
  const paleta = str(row.paleta);
  const plano = str(row.plano);
  return {
    id: Number(row.id),
    lojistaId: Number(row.lojista_id),
    subdominio: str(row.subdominio),
    dominio: strOrNull(row.dominio),
    nome: str(row.nome),
    slogan: str(row.slogan),
    sobre: str(row.sobre),
    logo: strOrNull(row.logo),
    whatsapp: strOrNull(row.whatsapp),
    telefone: strOrNull(row.telefone),
    emailContato: strOrNull(row.email_contato),
    redes: Object.fromEntries(SOCIAL_KEYS.filter((k) => typeof redes[k] === "string" && redes[k]).map((k) => [k, redes[k] as string])),
    paleta: isPalette(paleta) ? paleta : "coral",
    banners: banners
      .filter((b): b is Banner => typeof b === "object" && b !== null && typeof (b as Banner).src === "string")
      .map((b) => ({ src: b.src, alt: typeof b.alt === "string" ? b.alt : "", href: typeof b.href === "string" && b.href ? b.href : null })),
    categoriasDestaque: parseJson<unknown[]>(row.categorias_destaque, []).filter((c): c is string => typeof c === "string"),
    margemPadrao: Number(row.margem_padrao),
    plano: isPlan(plano) ? plano : "gratis",
    ativa: Number(row.ativa) === 1,
    criadoEm: str(row.criado_em),
    atualizadoEm: str(row.atualizado_em),
  };
}

// ---------------------------------------------------------------------------------- lojista

export function findLojistaLogin(email: string): (Lojista & { senhaHash: string }) | null {
  const row = getDb().prepare("SELECT * FROM lojistas WHERE email = ?").get(email.toLowerCase()) as Row | undefined;
  return row ? { ...toLojista(row), senhaHash: str(row.senha_hash) } : null;
}

export function getLojista(id: number): Lojista | null {
  const row = getDb().prepare("SELECT * FROM lojistas WHERE id = ?").get(id) as Row | undefined;
  return row ? toLojista(row) : null;
}

export function emailTaken(email: string): boolean {
  return !!getDb().prepare("SELECT 1 FROM lojistas WHERE email = ?").get(email.toLowerCase());
}

export function touchLogin(id: number) {
  getDb().prepare("UPDATE lojistas SET ultimo_login = datetime('now') WHERE id = ?").run(id);
}

export function updateLojistaPassword(id: number, senhaHash: string) {
  getDb().prepare("UPDATE lojistas SET senha_hash = ? WHERE id = ?").run(senhaHash, id);
}

export function updateLojista(id: number, data: { nome: string; telefone: string | null }) {
  getDb().prepare("UPDATE lojistas SET nome = ?, telefone = ? WHERE id = ?").run(data.nome, data.telefone, id);
}

export type NewLojista = {
  nome: string;
  email: string;
  senhaHash: string;
  tipo: LojistaType;
  telefone: string | null;
  loja: { nome: string; subdominio: string; margemPadrao: number; whatsapp: string | null };
};

/** Cria o lojista e a loja dele numa transação. */
export function createLojistaWithLoja(data: NewLojista): { lojistaId: number; lojaId: number } {
  return transaction((db) => {
    const lojista = db
      .prepare("INSERT INTO lojistas (nome, email, senha_hash, tipo, telefone) VALUES (?, ?, ?, ?, ?)")
      .run(data.nome, data.email.toLowerCase(), data.senhaHash, data.tipo, data.telefone);
    const lojistaId = Number(lojista.lastInsertRowid);
    const loja = db
      .prepare("INSERT INTO lojas (lojista_id, subdominio, nome, margem_padrao, whatsapp, email_contato) VALUES (?, ?, ?, ?, ?, ?)")
      .run(lojistaId, data.loja.subdominio, data.loja.nome, data.loja.margemPadrao, data.loja.whatsapp, data.email.toLowerCase());
    return { lojistaId, lojaId: Number(loja.lastInsertRowid) };
  });
}

// ---------------------------------------------------------------------------------- loja

export function getLojaByLojista(lojistaId: number): Loja | null {
  const row = getDb().prepare("SELECT * FROM lojas WHERE lojista_id = ? ORDER BY id LIMIT 1").get(lojistaId) as Row | undefined;
  return row ? toLoja(row) : null;
}

export function getLojaBySubdomain(subdominio: string): Loja | null {
  const row = getDb().prepare("SELECT * FROM lojas WHERE subdominio = ?").get(subdominio) as Row | undefined;
  return row ? toLoja(row) : null;
}

export function getLojaByDomain(dominio: string): Loja | null {
  const row = getDb().prepare("SELECT * FROM lojas WHERE dominio = ?").get(dominio) as Row | undefined;
  return row ? toLoja(row) : null;
}

export function subdomainTaken(subdominio: string, exceptLojaId = 0): boolean {
  return !!getDb().prepare("SELECT 1 FROM lojas WHERE subdominio = ? AND id <> ?").get(subdominio, exceptLojaId);
}

export function domainTaken(dominio: string, exceptLojaId = 0): boolean {
  return !!getDb().prepare("SELECT 1 FROM lojas WHERE dominio = ? AND id <> ?").get(dominio, exceptLojaId);
}

export type LojaPatch = Partial<{
  subdominio: string;
  nome: string;
  slogan: string;
  sobre: string;
  logo: string | null;
  whatsapp: string | null;
  telefone: string | null;
  emailContato: string | null;
  redes: Partial<Record<SocialKey, string>>;
  paleta: PaletteKey;
  banners: Banner[];
  categoriasDestaque: string[];
  margemPadrao: number;
  dominio: string | null;
}>;

const COLUMNS: Record<keyof LojaPatch, string> = {
  subdominio: "subdominio",
  nome: "nome",
  slogan: "slogan",
  sobre: "sobre",
  logo: "logo",
  whatsapp: "whatsapp",
  telefone: "telefone",
  emailContato: "email_contato",
  redes: "redes",
  paleta: "paleta",
  banners: "banners",
  categoriasDestaque: "categorias_destaque",
  margemPadrao: "margem_padrao",
  dominio: "dominio",
};

export function updateLoja(id: number, patch: LojaPatch) {
  const sets: string[] = [];
  const values: SQLInputValue[] = [];
  for (const [key, value] of Object.entries(patch) as [keyof LojaPatch, unknown][]) {
    if (value === undefined) continue;
    sets.push(`${COLUMNS[key]} = ?`);
    values.push(typeof value === "object" && value !== null ? JSON.stringify(value) : (value as SQLInputValue));
  }
  if (!sets.length) return;
  getDb()
    .prepare(`UPDATE lojas SET ${sets.join(", ")}, atualizado_em = datetime('now') WHERE id = ?`)
    .run(...values, id);
}

// ---------------------------------------------------------------------------------- produtos da loja

export function listLojaProdutos(lojaId: number): LojaProduto[] {
  const rows = getDb().prepare("SELECT * FROM loja_produtos WHERE loja_id = ? ORDER BY destaque DESC, ativado_em").all(lojaId) as Row[];
  return rows.map((row) => ({
    produtoId: str(row.produto_id),
    margem: row.margem === null || row.margem === undefined ? null : Number(row.margem),
    destaque: Number(row.destaque) === 1,
    ativadoEm: str(row.ativado_em),
  }));
}

export function countLojaProdutos(lojaId: number): number {
  return Number((getDb().prepare("SELECT COUNT(*) AS n FROM loja_produtos WHERE loja_id = ?").get(lojaId) as Row).n);
}

/** Ativa produtos (ignora os já ativos). Devolve quantos entraram. */
export function activateProdutos(lojaId: number, produtoIds: string[]): number {
  return transaction((db) => {
    const insert = db.prepare("INSERT OR IGNORE INTO loja_produtos (loja_id, produto_id) VALUES (?, ?)");
    let added = 0;
    for (const id of produtoIds) added += Number(insert.run(lojaId, id).changes);
    return added;
  });
}

export function deactivateProdutos(lojaId: number, produtoIds: string[]): number {
  return transaction((db) => {
    const remove = db.prepare("DELETE FROM loja_produtos WHERE loja_id = ? AND produto_id = ?");
    let removed = 0;
    for (const id of produtoIds) removed += Number(remove.run(lojaId, id).changes);
    return removed;
  });
}

/** Margem própria de produtos ativos; null volta para a margem padrão da loja. */
export function setProdutosMargem(lojaId: number, produtoIds: string[], margem: number | null): number {
  return transaction((db) => {
    const update = db.prepare("UPDATE loja_produtos SET margem = ? WHERE loja_id = ? AND produto_id = ?");
    let changed = 0;
    for (const id of produtoIds) changed += Number(update.run(margem, lojaId, id).changes);
    return changed;
  });
}

export function setProdutoDestaque(lojaId: number, produtoId: string, destaque: boolean) {
  getDb().prepare("UPDATE loja_produtos SET destaque = ? WHERE loja_id = ? AND produto_id = ?").run(destaque ? 1 : 0, lojaId, produtoId);
}
