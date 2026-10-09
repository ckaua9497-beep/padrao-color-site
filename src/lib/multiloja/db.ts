import "server-only";

import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS } from "./schema";

/*
 * Banco da multiloja. Em desenvolvimento é um SQLite local (node:sqlite, sem dependência), em
 * MULTILOJA_DB (padrão: .data/multiloja.db, fora do git). Toda leitura e escrita passa por repo.ts, que usa
 * só SQL comum, para a troca por Postgres em produção mexer num arquivo só.
 *
 * Migrações (schema.ts): rodam em ordem, uma vez cada (PRAGMA user_version guarda a última aplicada).
 */

type Holder = { db?: DatabaseSync };
// Um banco por processo (o dev server recarrega módulos: o globalThis segura a mesma conexão).
const holder = globalThis as typeof globalThis & { __multilojaDb?: Holder };

function dbPath(): string {
  const configured = process.env.MULTILOJA_DB?.trim();
  // turbopackIgnore: caminho só conhecido em execução; sem ele o build rastreia o projeto inteiro.
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), configured || ".data/multiloja.db");
}

function migrate(db: DatabaseSync) {
  const current = Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

export function getDb(): DatabaseSync {
  holder.__multilojaDb ??= {};
  const h = holder.__multilojaDb;
  if (!h.db) {
    const file = dbPath();
    mkdirSync(path.dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    migrate(db);
    h.db = db;
  }
  return h.db;
}

/** Roda `fn` numa transação (tudo ou nada). */
export function transaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn(db);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
