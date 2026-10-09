import "server-only";

import { hkdfSync, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { seal, unseal } from "../api/seal";
import { createRateLimiter } from "../api/rate-limit";
import { getLojaByLojista, getLojista, type Loja, type Lojista } from "./repo";
import { getAdmin, type Admin } from "./repo-vendas";

/*
 * Login do lojista no painel. Senha com scrypt (sal aleatório por senha); sessão num cookie httpOnly lacrado
 * (AES-256-GCM, chave própria derivada do PADRAO_SESSION_SECRET), separado da sessão do cliente da Padrão.
 */

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LEN = 32;

/** "scrypt$N$r$p$sal$hash" (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, KEY_LEN, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltText, hashText] = stored.split("$");
  if (algo !== "scrypt" || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64url");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(saltText, "base64url"), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Hash de mentira para gastar o mesmo tempo quando o e-mail não existe (não revela quais e-mails têm conta). */
let dummyHash: Promise<string> | null = null;
export function timingDummy(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(12).toString("hex"));
  return dummyHash;
}

// ---------------------------------------------------------------------------------- sessão

const MAX_AGE_SEC = 7 * 24 * 60 * 60;
const PRODUCTION = process.env.NODE_ENV === "production";
export const PAINEL_COOKIE = PRODUCTION ? "__Host-ml_painel" : "ml_painel";

type PainelSession = { v: 1; lojistaId: number; iat: number; exp: number };

let key: Buffer | null = null;
function sessionKey(): Buffer {
  const secret = process.env.PADRAO_SESSION_SECRET ?? "";
  if (secret.length < 32) throw new Error("PADRAO_SESSION_SECRET precisa de pelo menos 32 caracteres aleatórios.");
  key ??= Buffer.from(hkdfSync("sha256", secret, "padrao-color", "multiloja-painel-v1", 32));
  return key;
}

const nowSec = () => Math.floor(Date.now() / 1000);
const COOKIE_OPTIONS = { httpOnly: true, secure: PRODUCTION, sameSite: "lax", path: "/" } as const;

/** Grava a sessão (Server Action ou Route Handler). */
export async function startPainelSession(lojistaId: number) {
  const iat = nowSec();
  const session: PainelSession = { v: 1, lojistaId, iat, exp: iat + MAX_AGE_SEC };
  (await cookies()).set(PAINEL_COOKIE, seal(session, sessionKey()), { ...COOKIE_OPTIONS, maxAge: MAX_AGE_SEC });
}

export async function endPainelSession() {
  (await cookies()).set(PAINEL_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0, expires: new Date(0) });
}

async function readSession(): Promise<PainelSession | null> {
  const raw = (await cookies()).get(PAINEL_COOKIE)?.value;
  if (!raw) return null;
  const s = unseal<PainelSession>(raw, sessionKey());
  return s && s.v === 1 && Number.isInteger(s.lojistaId) && s.exp > nowSec() ? s : null;
}

export type PainelContext = { lojista: Lojista; loja: Loja };

/** Lojista logado e a loja dele; null sem sessão, lojista bloqueado ou sem loja. */
export async function getPainel(): Promise<PainelContext | null> {
  const session = await readSession();
  if (!session) return null;
  const lojista = getLojista(session.lojistaId);
  if (!lojista || lojista.status !== "ativo") return null;
  const loja = getLojaByLojista(lojista.id);
  return loja ? { lojista, loja } : null;
}

/** Páginas e ações do painel: sem sessão vai para o login. */
export async function requirePainel(): Promise<PainelContext> {
  const ctx = await getPainel();
  if (!ctx) redirect("/painel/entrar");
  return ctx;
}

// ---------------------------------------------------------------------------------- administradores da Padrão

export const ADMIN_COOKIE = PRODUCTION ? "__Host-ml_admin" : "ml_admin";
const ADMIN_MAX_AGE_SEC = 12 * 60 * 60;

type AdminSession = { v: 1; adminId: number; iat: number; exp: number };

let adminKey: Buffer | null = null;
function adminSessionKey(): Buffer {
  const secret = process.env.PADRAO_SESSION_SECRET ?? "";
  if (secret.length < 32) throw new Error("PADRAO_SESSION_SECRET precisa de pelo menos 32 caracteres aleatórios.");
  adminKey ??= Buffer.from(hkdfSync("sha256", secret, "padrao-color", "multiloja-admin-v1", 32));
  return adminKey;
}

export async function startAdminSession(adminId: number) {
  const iat = nowSec();
  const session: AdminSession = { v: 1, adminId, iat, exp: iat + ADMIN_MAX_AGE_SEC };
  (await cookies()).set(ADMIN_COOKIE, seal(session, adminSessionKey()), { ...COOKIE_OPTIONS, sameSite: "strict", maxAge: ADMIN_MAX_AGE_SEC });
}

export async function endAdminSession() {
  (await cookies()).set(ADMIN_COOKIE, "", { ...COOKIE_OPTIONS, sameSite: "strict", maxAge: 0, expires: new Date(0) });
}

export async function getAdminSession(): Promise<Admin | null> {
  const raw = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!raw) return null;
  const s = unseal<AdminSession>(raw, adminSessionKey());
  return s && s.v === 1 && Number.isInteger(s.adminId) && s.exp > nowSec() ? getAdmin(s.adminId) : null;
}

export async function requireAdmin(): Promise<Admin> {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/entrar");
  return admin;
}

// ---------------------------------------------------------------------------------- limites

const MINUTE = 60_000;
export const painelLimits = {
  loginIp: createRateLimiter({ max: 10, windowMs: 10 * MINUTE }),
  loginEmail: createRateLimiter({ max: 5, windowMs: 10 * MINUTE }),
  signupIp: createRateLimiter({ max: 5, windowMs: 60 * MINUTE }),
};

/** IP do cliente para os limites (mesma regra das rotas da API: só cabeçalho confiável, nunca IP interno). */
export async function requestIp(): Promise<string | null> {
  const h = await headers();
  const configured = process.env.PADRAO_CLIENT_IP_HEADER?.trim();
  const forwarded = h.get("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean);
  const ip = (configured ? h.get(configured)?.split(",")[0]?.trim() : null) || h.get("x-real-ip")?.trim() || forwarded?.[forwarded.length - 1];
  if (!ip) return null;
  const v4 = ip.replace(/^::ffff:/i, "");
  const internal = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.)/.test(v4) || ip === "::1" || ip === "localhost";
  return internal ? null : ip;
}
