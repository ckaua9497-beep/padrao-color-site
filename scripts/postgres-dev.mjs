/*
 * PostgreSQL de desenvolvimento, sem instalar nada: o pacote embedded-postgres traz o Postgres de verdade (mesma
 * versão de servidor da nuvem) e guarda os dados em .data/postgres (fora do git). Só para esta máquina: em produção
 * a multiloja usa DATABASE_URL.
 *
 *   npm run db          liga o banco e fica rodando (Ctrl+C desliga)
 *   npm run dev         liga o banco (se precisar) e o site juntos (scripts/dev.mjs)
 *
 * Conexão: postgres://multiloja:…@127.0.0.1:5433/multiloja (DEV_DATABASE em src/lib/multiloja/pg.ts).
 */
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { DEV_DATABASE } from "../src/lib/multiloja/pg.ts";

const DIR = path.resolve(process.env.MULTILOJA_PG_PASTA?.trim() || ".data/postgres");

/** Já tem alguém ouvindo na porta? (outro `npm run db` ou um Postgres instalado) */
function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: DEV_DATABASE.host, port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(1500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Garante o banco local no ar. Devolve a instância que este processo ligou (para desligar ao sair) ou null
 * quando o banco já estava rodando.
 */
export async function ensureDevPostgres({ quiet = false } = {}) {
  if (await portOpen(DEV_DATABASE.port)) return null;
  const pg = new EmbeddedPostgres({
    databaseDir: DIR,
    port: DEV_DATABASE.port,
    user: DEV_DATABASE.user,
    password: DEV_DATABASE.password,
    authMethod: "scram-sha-256",
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--no-locale"],
    onLog: () => {},
    onError: (message) => {
      const text = String(message instanceof Error ? message.message : message).trim();
      if (text && !quiet) console.error(`[postgres] ${text}`);
    },
  });
  const fresh = !existsSync(path.join(DIR, "PG_VERSION"));
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase(DEV_DATABASE.database);
  if (!quiet) console.log(`[postgres] banco local no ar em ${DEV_DATABASE.host}:${DEV_DATABASE.port} (${path.relative(process.cwd(), DIR)})`);
  return pg;
}

// `node scripts/postgres-dev.mjs`: liga e fica rodando até Ctrl+C.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pg = await ensureDevPostgres();
  if (!pg) {
    console.log(`[postgres] já tem um banco rodando na porta ${DEV_DATABASE.port}.`);
  } else {
    const stop = async () => {
      await pg.stop().catch(() => undefined);
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    setInterval(() => {}, 1 << 30);
  }
}
