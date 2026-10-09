import "server-only";

import { hkdfSync } from "node:crypto";
import { seal, unseal } from "../api/seal";
import { getDb } from "./db";

/*
 * Configurações da multiloja editáveis no admin (tabela `configuracoes`, chave → JSON). Segredos (chaves de API,
 * certificado) ficam cifrados com AES-256-GCM (chave derivada do PADRAO_SESSION_SECRET) e nunca voltam para o
 * navegador: o admin só vê se estão preenchidos.
 */

let key: Buffer | null = null;
function secretKey(): Buffer {
  const secret = process.env.PADRAO_SESSION_SECRET ?? "";
  if (secret.length < 32) throw new Error("PADRAO_SESSION_SECRET precisa de pelo menos 32 caracteres aleatórios.");
  key ??= Buffer.from(hkdfSync("sha256", secret, "padrao-color", "multiloja-config-v1", 32));
  return key;
}

/** Valor cifrado para guardar ("enc:" + lacre). */
export function sealSecret(value: string): string {
  return `enc:${seal({ v: value }, secretKey())}`;
}

/** Abre um valor cifrado; texto comum passa direto; lacre inválido (outra chave) vira "". */
export function openSecret(value: string | null | undefined): string {
  if (!value) return "";
  if (!value.startsWith("enc:")) return value;
  return unseal<{ v: string }>(value.slice(4), secretKey())?.v ?? "";
}

// Todas as configurações numa leitura só, guardadas por 3 s (uma página lê várias); quem salva limpa na hora.
// Outros servidores veem a mudança em até 3 s.
const CACHE_MS = 3000;
const cache = globalThis as typeof globalThis & { __multilojaSettings?: { at: number; values: Promise<Map<string, string>> } };

function loadAll(): Promise<Map<string, string>> {
  const now = Date.now();
  const hit = cache.__multilojaSettings;
  if (hit && now - hit.at < CACHE_MS) return hit.values;
  const values = (async () => {
    const rows = await (await getDb()).all<{ chave: string; valor: string }>("SELECT chave, valor FROM configuracoes");
    return new Map(rows.map((r) => [r.chave, r.valor]));
  })();
  values.catch(() => {
    if (cache.__multilojaSettings?.values === values) cache.__multilojaSettings = undefined;
  });
  cache.__multilojaSettings = { at: now, values };
  return values;
}

export async function getSetting<T>(chave: string): Promise<T | null> {
  const raw = (await loadAll()).get(chave);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setSetting(chave: string, valor: unknown) {
  await (await getDb()).run("INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = agora()", [chave, JSON.stringify(valor)]);
  cache.__multilojaSettings = undefined;
}
