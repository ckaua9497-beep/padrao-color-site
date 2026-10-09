/*
 * Cria ou troca a senha de um administrador da multiloja (equipe da Padrão Color).
 *
 *   MULTILOJA_ADMIN_SENHA='senha-forte' npm run multiloja:admin -- email@padraocolor.com.br "Nome da Pessoa"
 *
 * A senha vem do ambiente (não fica no histórico do terminal como argumento) e precisa de 12+ caracteres.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS } from "../src/lib/multiloja/schema.ts";

const [email = "", nome = ""] = process.argv.slice(2);
const senha = process.env.MULTILOJA_ADMIN_SENHA ?? "";

if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || nome.trim().length < 3) {
  console.error('Uso: MULTILOJA_ADMIN_SENHA=... npm run multiloja:admin -- email@dominio "Nome"');
  process.exit(1);
}
if (senha.length < 12) {
  console.error("Defina MULTILOJA_ADMIN_SENHA com pelo menos 12 caracteres.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = scryptSync(senha.normalize("NFKC"), salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const senhaHash = ["scrypt", 16384, 8, 1, salt.toString("base64url"), hash.toString("base64url")].join("$");

const file = path.resolve(process.env.MULTILOJA_DB?.trim() || ".data/multiloja.db");
mkdirSync(path.dirname(file), { recursive: true });
const db = new DatabaseSync(file);
const version = Number(db.prepare("PRAGMA user_version").get().user_version);
for (let i = version; i < MIGRATIONS.length; i++) {
  db.exec(MIGRATIONS[i]);
  db.exec(`PRAGMA user_version = ${i + 1}`);
}
db.prepare("INSERT INTO admins (nome, email, senha_hash) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET nome = excluded.nome, senha_hash = excluded.senha_hash").run(
  nome.trim(),
  email.toLowerCase(),
  senhaHash,
);
console.log(`Administrador ${email.toLowerCase()} pronto. Acesse /admin/entrar.`);
