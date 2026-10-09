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

export function getSetting<T>(chave: string): T | null {
  const row = getDb().prepare("SELECT valor FROM configuracoes WHERE chave = ?").get(chave) as { valor?: string } | undefined;
  if (!row?.valor) return null;
  try {
    return JSON.parse(row.valor) as T;
  } catch {
    return null;
  }
}

export function setSetting(chave: string, valor: unknown) {
  getDb()
    .prepare("INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = datetime('now')")
    .run(chave, JSON.stringify(valor));
}
