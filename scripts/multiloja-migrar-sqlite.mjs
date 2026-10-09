/*
 * Copia a multiloja do SQLite antigo (.data/multiloja.db) e dos arquivos em pasta (.data/arquivos) para o
 * PostgreSQL (DATABASE_URL; sem ela, o banco local de desenvolvimento). Roda uma vez, numa transação só: ou copia
 * tudo, ou nada. Recusa se o Postgres já tiver lojistas (para não misturar dados).
 *
 *   npm run multiloja:migrar-sqlite                 (usa .data/multiloja.db e .data/arquivos)
 *   npm run multiloja:migrar-sqlite -- caminho.db pasta-dos-arquivos
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { connect, migrate } from "../src/lib/multiloja/pg.ts";
import { ensureDevPostgres } from "./postgres-dev.mjs";

const [dbArg, filesArg] = process.argv.slice(2);
const sqliteFile = path.resolve(dbArg || ".data/multiloja.db");
const filesDir = path.resolve(filesArg || ".data/arquivos");
if (!existsSync(sqliteFile)) {
  console.error(`Não achei o SQLite em ${sqliteFile}.`);
  process.exit(1);
}

// Ordem das chaves estrangeiras: quem é referenciado vem antes.
const TABLES = ["lojistas", "lojas", "loja_produtos", "pedidos", "pedido_itens", "pedido_eventos", "saques", "links", "visitas", "admins", "configuracoes", "eventos"];
const WITH_ID = ["lojistas", "lojas", "pedidos", "pedido_itens", "pedido_eventos", "saques", "links", "admins", "eventos"];
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", pdf: "application/pdf", svg: "image/svg+xml" };

const lite = new DatabaseSync(sqliteFile, { readOnly: true });
const local = process.env.DATABASE_URL ? null : await ensureDevPostgres({ quiet: true });
const db = connect(undefined, { max: 2 });
await migrate(db);

try {
  const existing = await db.get("SELECT COUNT(*) AS n FROM lojistas");
  if (Number(existing.n) > 0) throw new Error("o Postgres já tem lojistas: a cópia é só para um banco novo.");

  const counts = await db.tx(async (sql) => {
    const counts = {};
    for (const table of TABLES) {
      const exists = lite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
      if (!exists) continue;
      const pgCols = new Set((await sql.all("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ?", [table])).map((r) => r.column_name));
      const rows = lite.prepare(`SELECT * FROM ${table}`).all();
      if (!rows.length) {
        counts[table] = 0;
        continue;
      }
      const cols = Object.keys(rows[0]).filter((c) => pgCols.has(c));
      const insert = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
      for (const row of rows) await sql.run(insert, cols.map((c) => row[c]));
      counts[table] = rows.length;
    }
    // Os próximos ids continuam depois dos copiados.
    for (const table of WITH_ID) {
      await sql.get(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM ${table}`);
    }

    // Arquivos: .data/arquivos/<loja>/<nome> (logo, banners) e .data/arquivos/pedidos/<pedido>/<nome> (artes).
    let files = 0;
    const put = async (dono, dir) => {
      for (const nome of readdirSync(dir)) {
        const file = path.join(dir, nome);
        if (!statSync(file).isFile()) continue;
        const bytes = readFileSync(file);
        const ext = nome.split(".").pop()?.toLowerCase() ?? "";
        await sql.run("INSERT INTO arquivos (dono, nome, tipo, tamanho, dados) VALUES (?, ?, ?, ?, ?) ON CONFLICT (dono, nome) DO NOTHING", [dono, nome, MIME[ext] ?? "application/octet-stream", bytes.length, bytes]);
        files += 1;
      }
    };
    if (existsSync(filesDir)) {
      for (const entry of readdirSync(filesDir)) {
        const dir = path.join(filesDir, entry);
        if (!statSync(dir).isDirectory()) continue;
        if (/^\d+$/.test(entry)) await put(`loja/${entry}`, dir);
        else if (entry === "pedidos") for (const pedido of readdirSync(dir)) if (/^\d+$/.test(pedido)) await put(`pedido/${pedido}`, path.join(dir, pedido));
      }
    }
    counts.arquivos = files;
    return counts;
  });

  console.log("Copiado para o PostgreSQL:");
  for (const [table, n] of Object.entries(counts)) console.log(`  ${table.padEnd(16)} ${n}`);
  console.log("O SQLite antigo não foi apagado; depois de conferir o site, pode remover .data/multiloja.db* e .data/arquivos.");
} catch (error) {
  console.error(`Nada foi copiado: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  await db.close();
  lite.close();
  if (local) await local.stop();
}
