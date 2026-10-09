import pg from "pg";
import { MIGRATIONS } from "./schema.ts";

/*
 * Conexão com o PostgreSQL da multiloja (o site e os scripts usam este módulo; por isso só imports relativos e
 * sem "server-only"). Produção: DATABASE_URL de um Postgres na nuvem (Supabase, Neon, RDS…). Desenvolvimento: sem
 * DATABASE_URL, o Postgres local que `npm run dev` liga sozinho (scripts/postgres-dev.mjs, porta 5433).
 *
 * As consultas usam `?` como marcador (convertido para $1, $2… aqui) e sempre parâmetros ligados: nunca texto
 * montado com entrada do usuário. Booleanos viram 1/0 (as colunas de sim/não são inteiras).
 */

// COUNT/SUM inteiros (int8) e numeric chegariam como texto: viram número (os valores da loja cabem com folga).
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

export type Row = Record<string, unknown>;

/** Banco local de desenvolvimento (só nesta máquina; ver scripts/postgres-dev.mjs). */
export const DEV_DATABASE = { host: "127.0.0.1", port: Number(process.env.MULTILOJA_PG_PORTA ?? 5433), user: "multiloja", password: "multiloja-dev", database: "multiloja" };
export const DEV_DATABASE_URL = `postgres://${DEV_DATABASE.user}:${DEV_DATABASE.password}@${DEV_DATABASE.host}:${DEV_DATABASE.port}/${DEV_DATABASE.database}`;

/** URL do banco: DATABASE_URL; sem ela, o banco local (só fora de produção). */
export function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return url;
  if (process.env.NODE_ENV === "production" && process.env.MULTILOJA_BANCO_LOCAL !== "1") {
    throw new Error("Configure DATABASE_URL com o PostgreSQL da multiloja (veja .env.example).");
  }
  return DEV_DATABASE_URL;
}

/** Troca os `?` por `$1, $2…`, sem mexer no que está entre aspas simples. */
export function placeholders(sql: string): string {
  let out = "";
  let n = 0;
  let quoted = false;
  for (const ch of sql) {
    if (ch === "'") quoted = !quoted;
    out += ch === "?" && !quoted ? `$${++n}` : ch;
  }
  return out;
}

function param(value: unknown): unknown {
  return typeof value === "boolean" ? (value ? 1 : 0) : value === undefined ? null : value;
}

/** O que dá para fazer numa conexão (ou dentro de uma transação). */
export interface Sql {
  all<T = Row>(text: string, params?: readonly unknown[]): Promise<T[]>;
  get<T = Row>(text: string, params?: readonly unknown[]): Promise<T | undefined>;
  /** Executa e devolve quantas linhas mudaram. */
  run(text: string, params?: readonly unknown[]): Promise<number>;
  /** Vários comandos sem parâmetros (migrações). */
  exec(text: string): Promise<void>;
}

export interface Db extends Sql {
  /** Tudo ou nada: `fn` recebe a conexão da transação. */
  tx<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

type Queryable = pg.Pool | pg.PoolClient;

function wrap(q: Queryable): Sql {
  return {
    async all<T>(text: string, params: readonly unknown[] = []) {
      return (await q.query(placeholders(text), params.map(param))).rows as T[];
    },
    async get<T>(text: string, params: readonly unknown[] = []) {
      return (await q.query(placeholders(text), params.map(param))).rows[0] as T | undefined;
    },
    async run(text: string, params: readonly unknown[] = []) {
      return (await q.query(placeholders(text), params.map(param))).rowCount ?? 0;
    },
    async exec(text: string) {
      await q.query(text);
    },
  };
}

export function connect(url = databaseUrl(), options: { max?: number } = {}): Db {
  const pool = new pg.Pool({ connectionString: url, max: options.max ?? 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
  // Erro numa conexão parada (o servidor reiniciou, a rede caiu) não derruba o processo: a próxima consulta reconecta.
  pool.on("error", (error) => console.error("[banco]", error.message));
  return {
    ...wrap(pool),
    async tx<T>(fn: (sql: Sql) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(wrap(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/**
 * Aplica as migrações que faltam (schema.ts), cada uma uma vez, na ordem. Uma trava do Postgres impede que dois
 * servidores subindo juntos rodem a mesma migração.
 */
export async function migrate(db: Db): Promise<number> {
  await db.exec("CREATE TABLE IF NOT EXISTS schema_versao (versao integer NOT NULL)");
  return db.tx(async (sql) => {
    await sql.get("SELECT pg_advisory_xact_lock(7301940)");
    const row = await sql.get<{ versao: number }>("SELECT versao FROM schema_versao");
    const current = row ? Number(row.versao) : 0;
    for (let i = current; i < MIGRATIONS.length; i++) await sql.exec(MIGRATIONS[i]);
    if (!row) await sql.run("INSERT INTO schema_versao (versao) VALUES (?)", [MIGRATIONS.length]);
    else if (current < MIGRATIONS.length) await sql.run("UPDATE schema_versao SET versao = ?", [MIGRATIONS.length]);
    return MIGRATIONS.length - current;
  });
}
