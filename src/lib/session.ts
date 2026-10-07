import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { deriveKey, seal, unseal } from "./api/seal";
import type { ApiCliente } from "./api/types";
import { isResellerAccount } from "./reseller";

/*
 * Sessão do cliente logado. O api_token da Padrão Color fica só no servidor: vai num cookie httpOnly lacrado
 * com AES-256-GCM (chave derivada do PADRAO_SESSION_SECRET), secure em produção, sameSite lax, 7 dias.
 * O navegador só vê dados públicos (GET /api/conta/sessao). Ler funciona em Server Components; gravar e
 * apagar, só em Route Handlers.
 */

const MAX_AGE_SEC = 7 * 24 * 60 * 60;
const PRODUCTION = process.env.NODE_ENV === "production";

/** Em produção com o prefixo __Host- (exige HTTPS, Path=/ e nenhum Domain: não vaza para subdomínios). */
export const SESSION_COOKIE = PRODUCTION ? "__Host-padrao_sessao" : "padrao_sessao";

export type Session = {
  v: 1;
  /** api_token do POST /user/login. Nunca sai do servidor. */
  token: string;
  /** ID do cliente na API (idCliente / codigo). */
  id: number;
  name: string;
  /** Usuário de acesso (GET /cliente → login), para confirmar a senha atual na troca de senha. */
  login: string;
  category: string;
  priceTable: string;
  reseller: boolean;
  iat: number;
  exp: number;
};

/** O que o navegador recebe sobre o cliente logado (sem token). */
export type PublicCustomer = {
  status: "customer" | "reseller";
  id: number;
  name: string;
  category: string;
  priceTable: string;
  reseller: boolean;
  balance?: number;
};

let key: Buffer | null = null;

function sessionKey(): Buffer {
  key ??= deriveKey(process.env.PADRAO_SESSION_SECRET ?? "");
  return key;
}

const nowSec = () => Math.floor(Date.now() / 1000);

/** Dados do cliente que a sessão guarda (atualizados a cada GET /cliente). */
export function profileOf(cliente: ApiCliente) {
  const priceTable = (cliente.tabela?.nome ?? "").trim();
  const category = (cliente.categoria ?? "").trim();
  return {
    id: Number(cliente.id),
    name: (cliente.nome || cliente.razao || "").trim(),
    login: (cliente.login ?? "").trim(),
    category,
    priceTable,
    reseller: isResellerAccount({ priceTable, category }),
  };
}

export function newSession(token: string, cliente: ApiCliente): Session {
  const iat = nowSec();
  return { v: 1, token, iat, exp: iat + MAX_AGE_SEC, ...profileOf(cliente) };
}

/** A sessão mudou em relação ao cadastro atual (categoria, tabela, nome…)? */
export function withProfile(session: Session, cliente: ApiCliente): { session: Session; changed: boolean } {
  const profile = profileOf(cliente);
  const changed = (Object.keys(profile) as (keyof typeof profile)[]).some((field) => profile[field] !== session[field]);
  return { session: changed ? { ...session, ...profile } : session, changed };
}

function isSession(value: unknown): value is Session {
  const s = value as Partial<Session> | null;
  return !!s && s.v === 1 && typeof s.token === "string" && s.token.length > 0 && Number.isInteger(s.id) && (s.id ?? 0) > 0 && typeof s.exp === "number";
}

export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const session = unseal<Session>(raw, sessionKey());
  return isSession(session) && session.exp > nowSec() ? session : null;
}

const COOKIE_OPTIONS = { httpOnly: true, secure: PRODUCTION, sameSite: "lax", path: "/" } as const;

/** Grava a sessão (só em Route Handler). Mantém a validade original: renovar exige login de novo. */
export async function saveSession(session: Session): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, seal(session, sessionKey()), { ...COOKIE_OPTIONS, maxAge: Math.max(0, session.exp - nowSec()) });
}

/** Apaga com os mesmos atributos (um cookie __Host- só some com Secure e Path=/). */
export async function clearSession(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0, expires: new Date(0) });
}

/** Página de login com a volta (e o aviso de sessão expirada). */
export function loginUrl(returnTo?: string, expired = false): string {
  const params = new URLSearchParams();
  if (returnTo) params.set("volta", returnTo);
  if (expired) params.set("sessao", "expirada");
  const query = params.toString();
  return `/conta/entrar${query ? `?${query}` : ""}`;
}

/** Páginas da conta: sem sessão, vai para o login e volta depois. */
export async function requireSession(returnTo: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(loginUrl(returnTo));
  return session;
}

export function publicCustomer(session: Session, balance?: number | null): PublicCustomer {
  return {
    status: session.reseller ? "reseller" : "customer",
    id: session.id,
    name: session.name,
    category: session.category,
    priceTable: session.priceTable,
    reseller: session.reseller,
    ...(typeof balance === "number" && Number.isFinite(balance) ? { balance } : {}),
  };
}
