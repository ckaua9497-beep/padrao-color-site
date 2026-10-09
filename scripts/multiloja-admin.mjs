/*
 * Cria ou troca a senha de um administrador da multiloja (equipe da Padrão Color), no PostgreSQL da DATABASE_URL
 * (sem ela, no banco local de desenvolvimento).
 *
 *   MULTILOJA_ADMIN_SENHA='senha-forte' npm run multiloja:admin -- email@padraocolor.com.br "Nome da Pessoa"
 *
 * A senha vem do ambiente (não fica no histórico do terminal como argumento) e precisa de 12+ caracteres.
 */
import { randomBytes, scryptSync } from "node:crypto";
import { connect, migrate } from "../src/lib/multiloja/pg.ts";
import { ensureDevPostgres } from "./postgres-dev.mjs";

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

const local = process.env.DATABASE_URL ? null : await ensureDevPostgres({ quiet: true });
const db = connect(undefined, { max: 1 });
await migrate(db);
await db.run("INSERT INTO admins (nome, email, senha_hash) VALUES (?, ?, ?) ON CONFLICT (email) DO UPDATE SET nome = EXCLUDED.nome, senha_hash = EXCLUDED.senha_hash", [
  nome.trim(),
  email.toLowerCase(),
  senhaHash,
]);
await db.close();
if (local) await local.stop();
console.log(`Administrador ${email.toLowerCase()} pronto. Acesse /admin/entrar.`);
