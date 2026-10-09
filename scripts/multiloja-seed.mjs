/*
 * Loja de demonstração da multiloja, só para desenvolvimento (banco local .data/multiloja.db).
 *
 *   npm run multiloja:seed
 *
 * Cria (ou recria) a lojista de teste abaixo com 16 produtos ativos, cor e textos. Depois:
 *   painel:  http://localhost:3100/painel/entrar  (e-mail e senha abaixo)
 *   loja:    http://atelie-demo.localhost:3100
 *
 * Credenciais de TESTE, válidas só neste banco local. Nunca use em produção.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS } from "../src/lib/multiloja/schema.ts";

const EMAIL = "demo@atelie-demo.test";
const SENHA = process.env.MULTILOJA_SEED_SENHA || "demo-loja-2026";
const SUBDOMINIO = "atelie-demo";

// IDs do catálogo (src/data/catalog.json) e margem própria (null = margem padrão da loja).
const PRODUTOS = [
  ["248", 40, true], // Cartão de Visita
  ["63", 60, true], // Caneca de Cerâmica
  ["5", null, true], // Camisa de Algodão
  ["48", 50, false], // Ecobag
  ["466", 35, false], // Abadá Dryfit 101+
  ["271", null, false], // Adesivo em Vinil
  ["269", 40, false], // Adesivo em Folha
  ["237", 100, false], // Bloco s/ pauta
  ["290", 20, true], // LED Neon frase
  ["329", null, false], // Banner 60x90
  ["148", 45, false], // Almofada Quadrada
  ["28", null, false], // Calendário de Mesa
  ["396", 50, false], // Garrafa Térmica
  ["67", null, false], // Mouse Pad
  ["398", 80, false], // Chaveiro Acrílico
  ["375", null, false], // Quadro Canvas
];

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize("NFKC"), salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", 16384, 8, 1, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

const file = path.resolve(process.env.MULTILOJA_DB?.trim() || ".data/multiloja.db");
mkdirSync(path.dirname(file), { recursive: true });
const db = new DatabaseSync(file);
db.exec("PRAGMA foreign_keys = ON");
const version = Number(db.prepare("PRAGMA user_version").get().user_version);
for (let i = version; i < MIGRATIONS.length; i++) {
  db.exec(MIGRATIONS[i]);
  db.exec(`PRAGMA user_version = ${i + 1}`);
}

db.exec("BEGIN");
const old = db.prepare("SELECT id FROM lojistas WHERE email = ?").get(EMAIL);
if (old) {
  db.prepare("DELETE FROM loja_produtos WHERE loja_id IN (SELECT id FROM lojas WHERE lojista_id = ?)").run(old.id);
  db.prepare("DELETE FROM lojas WHERE lojista_id = ?").run(old.id);
  db.prepare("DELETE FROM lojistas WHERE id = ?").run(old.id);
}
db.prepare("DELETE FROM lojas WHERE subdominio = ?").run(SUBDOMINIO);

const lojista = db
  .prepare("INSERT INTO lojistas (nome, email, senha_hash, tipo, telefone) VALUES (?, ?, ?, ?, ?)")
  .run("Ana Demonstração", EMAIL, hashPassword(SENHA), "influenciador", "21999990000");
const loja = db
  .prepare(
    `INSERT INTO lojas (lojista_id, subdominio, nome, slogan, sobre, whatsapp, email_contato, redes, paleta, categorias_destaque, margem_padrao, plano)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  .run(
    Number(lojista.lastInsertRowid),
    SUBDOMINIO,
    "Ateliê Demo",
    "Presentes e brindes personalizados com a sua cara",
    "O Ateliê Demo é uma loja de demonstração da multiloja Padrão Color.\n\nAqui você escolhe o produto, coloca sua arte ou texto e vê tudo em 3D antes de pedir.",
    "21999990000",
    EMAIL,
    JSON.stringify({ instagram: "https://www.instagram.com/padraocolor/" }),
    "roxo",
    JSON.stringify(["brindes-e-presentes", "vestuario"]),
    30,
    "basico",
  );
const lojaId = Number(loja.lastInsertRowid);
const insert = db.prepare("INSERT INTO loja_produtos (loja_id, produto_id, margem, destaque) VALUES (?, ?, ?, ?)");
for (const [id, margem, destaque] of PRODUTOS) insert.run(lojaId, id, margem, destaque ? 1 : 0);
db.exec("COMMIT");

console.log(`Loja de demonstração pronta (${PRODUTOS.length} produtos).`);
console.log(`  painel: http://localhost:3100/painel/entrar  →  ${EMAIL}  (senha em scripts/multiloja-seed.mjs ou MULTILOJA_SEED_SENHA)`);
console.log(`  loja:   http://${SUBDOMINIO}.localhost:3100`);
