import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/*
 * Lacre do cookie de sessão: AES-256-GCM com chave derivada (HKDF-SHA256) do PADRAO_SESSION_SECRET.
 * Formato: base64url(versão[1] | iv[12] | tag[16] | dados cifrados). O GCM autentica: cookie alterado,
 * truncado ou lacrado com outra chave não abre. Sem dependência do Next, para testar com node --test.
 */

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const AAD = Buffer.from("padrao-color/sessao");
/** Limite de cookie do navegador: nada maior que isso é nosso. */
const MAX_SEALED_LENGTH = 4096;

export function deriveKey(secret: string): Buffer {
  if (!secret || secret.length < 32) throw new Error("PADRAO_SESSION_SECRET precisa de pelo menos 32 caracteres aleatórios.");
  return Buffer.from(hkdfSync("sha256", secret, "padrao-color", "sessao-cookie-v1", 32));
}

export function seal(data: unknown, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(AAD);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** Abre o lacre; null quando o valor foi alterado, é de outra chave ou não é um lacre. */
export function unseal<T>(value: string, key: Buffer): T | null {
  if (!value || value.length > MAX_SEALED_LENGTH) return null;
  try {
    const raw = Buffer.from(value, "base64url");
    if (raw.length < 1 + IV_BYTES + TAG_BYTES + 1 || raw[0] !== VERSION) return null;
    const iv = raw.subarray(1, 1 + IV_BYTES);
    const tag = raw.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
    const body = raw.subarray(1 + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const text = Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
