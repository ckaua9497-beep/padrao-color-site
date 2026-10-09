import "server-only";

import { getDb, transaction } from "./db";
import { isPalette, isPlan, SOCIAL_KEYS, type LojistaType, type PaletteKey, type Plan, type SocialKey } from "./core";
import { parseTema, temaInicial, type LojaInfo, type Tema } from "./tema";

/*
 * Acesso aos dados da multiloja no PostgreSQL (parâmetros sempre ligados — nunca texto montado com entrada do
 * usuário). As páginas e ações usam só estas funções.
 */

export type Lojista = {
  id: number;
  nome: string;
  email: string;
  tipo: LojistaType;
  telefone: string | null;
  chavePix: string | null;
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
  /** O DNS do domínio próprio aponta para o site (conferido no painel); só então a loja responde nele. */
  dominioVerificado: boolean;
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
  /** Frete cobrado por pedido (0 = grátis) e o subtotal a partir do qual fica grátis. */
  freteFixo: number;
  freteGratisAcima: number | null;
  plano: Plan;
  ativa: boolean;
  /** Tema publicado da vitrine (sem editor aberto ainda: o clássico com o que a loja já tinha). */
  tema: Tema;
  /** Tema em edição no "Personalizar loja"; null = nada além do publicado. */
  temaRascunho: Tema | null;
  temaPublicadoEm: string | null;
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
    chavePix: strOrNull(row.chave_pix),
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
  const loja = toLojaBase(row, redes, banners, paleta, plano);
  const info = lojaInfo(loja);
  const tema = row.tema ? parseTema(row.tema, info) : temaInicial(info);
  return { ...loja, tema, temaRascunho: row.tema_rascunho ? parseTema(row.tema_rascunho, info, tema) : null, temaPublicadoEm: strOrNull(row.tema_publicado_em) };
}

/** O que os modelos e as seções prontas usam da loja (nome, frase, sobre, logo, cor e banners antigos). */
export function lojaInfo(loja: Pick<Loja, "id" | "nome" | "slogan" | "sobre" | "logo" | "paleta" | "banners">): LojaInfo {
  return { lojaId: loja.id, nome: loja.nome, slogan: loja.slogan, sobre: loja.sobre, logo: loja.logo, paleta: loja.paleta, banners: loja.banners.map((b) => ({ src: b.src, alt: b.alt, href: b.href })) };
}

function toLojaBase(row: Row, redes: Record<string, unknown>, banners: unknown[], paleta: string, plano: string): Omit<Loja, "tema" | "temaRascunho" | "temaPublicadoEm"> {
  return {
    id: Number(row.id),
    lojistaId: Number(row.lojista_id),
    subdominio: str(row.subdominio),
    dominio: strOrNull(row.dominio),
    dominioVerificado: Number(row.dominio_verificado) === 1,
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
    freteFixo: Number(row.frete_fixo ?? 0),
    freteGratisAcima: row.frete_gratis_acima === null || row.frete_gratis_acima === undefined ? null : Number(row.frete_gratis_acima),
    plano: isPlan(plano) ? plano : "gratis",
    ativa: Number(row.ativa) === 1,
    criadoEm: str(row.criado_em),
    atualizadoEm: str(row.atualizado_em),
  };
}

// ---------------------------------------------------------------------------------- lojista

export async function findLojistaLogin(email: string): Promise<(Lojista & { senhaHash: string }) | null> {
  const row = await (await getDb()).get("SELECT * FROM lojistas WHERE email = ?", [email.toLowerCase()]);
  return row ? { ...toLojista(row), senhaHash: str(row.senha_hash) } : null;
}

export async function getLojista(id: number): Promise<Lojista | null> {
  const row = await (await getDb()).get("SELECT * FROM lojistas WHERE id = ?", [id]);
  return row ? toLojista(row) : null;
}

export async function emailTaken(email: string): Promise<boolean> {
  return !!(await (await getDb()).get("SELECT 1 FROM lojistas WHERE email = ?", [email.toLowerCase()]));
}

export async function touchLogin(id: number) {
  await (await getDb()).run("UPDATE lojistas SET ultimo_login = agora() WHERE id = ?", [id]);
}

export async function updateLojistaPassword(id: number, senhaHash: string) {
  await (await getDb()).run("UPDATE lojistas SET senha_hash = ? WHERE id = ?", [senhaHash, id]);
}

export async function updateLojista(id: number, data: { nome: string; telefone: string | null }) {
  await (await getDb()).run("UPDATE lojistas SET nome = ?, telefone = ? WHERE id = ?", [data.nome, data.telefone, id]);
}

export async function setChavePix(id: number, chave: string | null) {
  await (await getDb()).run("UPDATE lojistas SET chave_pix = ? WHERE id = ?", [chave, id]);
}

export async function setLojistaStatus(id: number, status: "ativo" | "bloqueado") {
  await (await getDb()).run("UPDATE lojistas SET status = ? WHERE id = ?", [status, id]);
}

export async function getLoja(id: number): Promise<Loja | null> {
  const row = await (await getDb()).get("SELECT * FROM lojas WHERE id = ?", [id]);
  return row ? toLoja(row) : null;
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
export async function createLojistaWithLoja(data: NewLojista): Promise<{ lojistaId: number; lojaId: number }> {
  return transaction(async (sql) => {
    const lojista = await sql.get<{ id: number }>("INSERT INTO lojistas (nome, email, senha_hash, tipo, telefone) VALUES (?, ?, ?, ?, ?) RETURNING id", [
      data.nome,
      data.email.toLowerCase(),
      data.senhaHash,
      data.tipo,
      data.telefone,
    ]);
    const lojistaId = Number(lojista?.id);
    const loja = await sql.get<{ id: number }>("INSERT INTO lojas (lojista_id, subdominio, nome, margem_padrao, whatsapp, email_contato) VALUES (?, ?, ?, ?, ?, ?) RETURNING id", [
      lojistaId,
      data.loja.subdominio,
      data.loja.nome,
      data.loja.margemPadrao,
      data.loja.whatsapp,
      data.email.toLowerCase(),
    ]);
    return { lojistaId, lojaId: Number(loja?.id) };
  });
}

// ---------------------------------------------------------------------------------- loja

export async function getLojaByLojista(lojistaId: number): Promise<Loja | null> {
  const row = await (await getDb()).get("SELECT * FROM lojas WHERE lojista_id = ? ORDER BY id LIMIT 1", [lojistaId]);
  return row ? toLoja(row) : null;
}

export async function getLojaBySubdomain(subdominio: string): Promise<Loja | null> {
  const row = await (await getDb()).get("SELECT * FROM lojas WHERE subdominio = ?", [subdominio]);
  return row ? toLoja(row) : null;
}

/** Loja do domínio próprio (só depois de verificado o DNS). */
export async function getLojaByDomain(dominio: string): Promise<Loja | null> {
  const row = await (await getDb()).get("SELECT * FROM lojas WHERE dominio = ? AND dominio_verificado = 1", [dominio]);
  return row ? toLoja(row) : null;
}

export async function subdomainTaken(subdominio: string, exceptLojaId = 0): Promise<boolean> {
  return !!(await (await getDb()).get("SELECT 1 FROM lojas WHERE subdominio = ? AND id <> ?", [subdominio, exceptLojaId]));
}

export async function domainTaken(dominio: string, exceptLojaId = 0): Promise<boolean> {
  return !!(await (await getDb()).get("SELECT 1 FROM lojas WHERE dominio = ? AND id <> ?", [dominio, exceptLojaId]));
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
  dominioVerificado: boolean;
  freteFixo: number;
  freteGratisAcima: number | null;
  plano: Plan;
  ativa: boolean;
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
  dominioVerificado: "dominio_verificado",
  freteFixo: "frete_fixo",
  freteGratisAcima: "frete_gratis_acima",
  plano: "plano",
  ativa: "ativa",
};

export async function updateLoja(id: number, patch: LojaPatch) {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch) as [keyof LojaPatch, unknown][]) {
    if (value === undefined) continue;
    sets.push(`${COLUMNS[key]} = ?`);
    values.push(typeof value === "boolean" ? (value ? 1 : 0) : typeof value === "object" && value !== null ? JSON.stringify(value) : value);
  }
  if (!sets.length) return;
  await (await getDb()).run(`UPDATE lojas SET ${sets.join(", ")}, atualizado_em = agora() WHERE id = ?`, [...values, id]);
}

// ---------------------------------------------------------------------------------- tema (Personalizar loja)

export async function saveTemaRascunho(lojaId: number, tema: Tema) {
  await (await getDb()).run("UPDATE lojas SET tema_rascunho = ? WHERE id = ?", [JSON.stringify(tema), lojaId]);
}

/** Publica o tema: a vitrine passa a usar. A cor e o logo também ficam na loja (painel, favicon, e-mails). */
export async function publishTema(lojaId: number, tema: Tema) {
  await (await getDb()).run("UPDATE lojas SET tema = ?, tema_rascunho = NULL, tema_publicado_em = agora(), paleta = ?, logo = ?, atualizado_em = agora() WHERE id = ?", [
    JSON.stringify(tema),
    tema.estilo.paleta,
    tema.marca.logo,
    lojaId,
  ]);
}

export async function discardTemaRascunho(lojaId: number) {
  await (await getDb()).run("UPDATE lojas SET tema_rascunho = NULL WHERE id = ?", [lojaId]);
}

// ---------------------------------------------------------------------------------- produtos da loja

export async function listLojaProdutos(lojaId: number): Promise<LojaProduto[]> {
  const rows = await (await getDb()).all("SELECT * FROM loja_produtos WHERE loja_id = ? ORDER BY destaque DESC, ativado_em, produto_id", [lojaId]);
  return rows.map((row) => ({
    produtoId: str(row.produto_id),
    margem: row.margem === null || row.margem === undefined ? null : Number(row.margem),
    destaque: Number(row.destaque) === 1,
    ativadoEm: str(row.ativado_em),
  }));
}

export async function countLojaProdutos(lojaId: number): Promise<number> {
  const row = await (await getDb()).get<{ n: number }>("SELECT COUNT(*) AS n FROM loja_produtos WHERE loja_id = ?", [lojaId]);
  return Number(row?.n ?? 0);
}

/** Ativa produtos (ignora os já ativos). Devolve quantos entraram. */
export async function activateProdutos(lojaId: number, produtoIds: string[]): Promise<number> {
  if (!produtoIds.length) return 0;
  return (await getDb()).run("INSERT INTO loja_produtos (loja_id, produto_id) SELECT ?::integer, unnest(?::text[]) ON CONFLICT DO NOTHING", [lojaId, produtoIds]);
}

export async function deactivateProdutos(lojaId: number, produtoIds: string[]): Promise<number> {
  if (!produtoIds.length) return 0;
  return (await getDb()).run("DELETE FROM loja_produtos WHERE loja_id = ? AND produto_id = ANY(?::text[])", [lojaId, produtoIds]);
}

/** Margem própria de produtos ativos; null volta para a margem padrão da loja. */
export async function setProdutosMargem(lojaId: number, produtoIds: string[], margem: number | null): Promise<number> {
  if (!produtoIds.length) return 0;
  return (await getDb()).run("UPDATE loja_produtos SET margem = ? WHERE loja_id = ? AND produto_id = ANY(?::text[])", [margem, lojaId, produtoIds]);
}

export async function setProdutoDestaque(lojaId: number, produtoId: string, destaque: boolean) {
  await (await getDb()).run("UPDATE loja_produtos SET destaque = ? WHERE loja_id = ? AND produto_id = ?", [destaque ? 1 : 0, lojaId, produtoId]);
}
