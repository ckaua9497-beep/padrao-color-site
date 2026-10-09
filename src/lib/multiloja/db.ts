import "server-only";

import { connect, migrate, type Db, type Sql } from "./pg";

/*
 * Banco da multiloja no servidor: PostgreSQL (pg.ts). Um pool de conexões por processo; na primeira consulta
 * aplica as migrações que faltam. Toda leitura e escrita passa por repo.ts, repo-vendas.ts, analytics.ts,
 * settings.ts e files.ts.
 */

type Holder = { ready?: Promise<Db> };
// O dev server recarrega módulos: o globalThis segura o mesmo pool.
const holder = globalThis as typeof globalThis & { __multilojaPg?: Holder };

export function getDb(): Promise<Db> {
  holder.__multilojaPg ??= {};
  const h = holder.__multilojaPg;
  h.ready ??= (async () => {
    const db = connect();
    await migrate(db);
    return db;
  })().catch((error) => {
    // Banco fora do ar na subida: a próxima requisição tenta de novo (sem guardar a falha).
    h.ready = undefined;
    throw error;
  });
  return h.ready;
}

/** Roda `fn` numa transação (tudo ou nada). */
export async function transaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  return (await getDb()).tx(fn);
}

export type { Sql };
