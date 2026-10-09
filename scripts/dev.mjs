/*
 * `npm run dev`: liga o PostgreSQL local (se ainda não estiver no ar e não houver DATABASE_URL) e depois o
 * `next dev` com os mesmos argumentos (ex.: `npm run dev -- -p 3100`). Ao sair, desliga o banco que ligou.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { ensureDevPostgres } from "./postgres-dev.mjs";

const db = process.env.DATABASE_URL ? null : await ensureDevPostgres();
const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(2)], { stdio: "inherit" });

let stopping = false;
async function shutdown(code) {
  if (stopping) return;
  stopping = true;
  if (!child.killed && child.exitCode === null) child.kill();
  if (db) await db.stop().catch(() => undefined);
  process.exit(code ?? 0);
}
child.on("exit", (code) => shutdown(code ?? 0));
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
