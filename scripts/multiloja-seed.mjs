/*
 * Loja de demonstração da multiloja, só para desenvolvimento (PostgreSQL local de `npm run db`/`npm run dev`, ou
 * DATABASE_URL de um banco de TESTE).
 *
 *   npm run multiloja:seed
 *
 * Cria (ou recria) a lojista de teste abaixo com 16 produtos ativos, cor e textos, e um admin de teste da
 * Padrão. Pedidos, saques e links antigos da loja demo são apagados. Depois:
 *   painel:  http://localhost:3100/painel/entrar  (e-mail e senha abaixo)
 *   loja:    http://atelie-demo.localhost:3100
 *   admin:   http://localhost:3100/admin/entrar   (ADMIN_EMAIL e ADMIN_SENHA abaixo)
 *
 * Credenciais de TESTE, válidas só neste banco local. Nunca use em produção.
 */
import { randomBytes, scryptSync } from "node:crypto";
import { connect, migrate } from "../src/lib/multiloja/pg.ts";
import { ensureDevPostgres } from "./postgres-dev.mjs";

const EMAIL = "demo@atelie-demo.test";
const SENHA = process.env.MULTILOJA_SEED_SENHA || "demo-loja-2026";
const SUBDOMINIO = "atelie-demo";
const ADMIN_EMAIL = "admin@padrao-demo.test";
const ADMIN_SENHA = process.env.MULTILOJA_SEED_ADMIN_SENHA || "admin-demo-2026";

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

if (process.env.NODE_ENV === "production") {
  console.error("A loja de demonstração é só para desenvolvimento.");
  process.exit(1);
}
const local = process.env.DATABASE_URL ? null : await ensureDevPostgres({ quiet: true });
const db = connect(undefined, { max: 2 });
await migrate(db);

await db.tx(async (sql) => {
  const old = await sql.get("SELECT id FROM lojistas WHERE email = ?", [EMAIL]);
  const oldLojas = (await sql.all("SELECT id FROM lojas WHERE subdominio = ? OR lojista_id = ?", [SUBDOMINIO, old?.id ?? 0])).map((row) => row.id);
  for (const id of oldLojas) {
    const pedidos = (await sql.all("SELECT id FROM pedidos WHERE loja_id = ?", [id])).map((row) => `pedido/${row.id}`);
    if (pedidos.length) await sql.run("DELETE FROM arquivos WHERE dono = ANY(?::text[])", [pedidos]);
    await sql.run("DELETE FROM arquivos WHERE dono = ?", [`loja/${id}`]);
    for (const table of ["pedidos", "saques", "links", "visitas", "loja_produtos"]) await sql.run(`DELETE FROM ${table} WHERE loja_id = ?`, [id]);
    await sql.run("DELETE FROM lojas WHERE id = ?", [id]);
  }
  if (old) await sql.run("DELETE FROM lojistas WHERE id = ?", [old.id]);

  await sql.run("DELETE FROM admins WHERE email = ?", [ADMIN_EMAIL]);
  await sql.run("INSERT INTO admins (nome, email, senha_hash) VALUES (?, ?, ?)", ["Equipe Padrão (teste)", ADMIN_EMAIL, hashPassword(ADMIN_SENHA)]);

  const lojista = await sql.get("INSERT INTO lojistas (nome, email, senha_hash, tipo, telefone) VALUES (?, ?, ?, ?, ?) RETURNING id", [
    "Ana Demonstração",
    EMAIL,
    hashPassword(SENHA),
    "influenciador",
    "21999990000",
  ]);
  const loja = await sql.get(
    `INSERT INTO lojas (lojista_id, subdominio, nome, slogan, sobre, whatsapp, email_contato, redes, paleta, categorias_destaque, margem_padrao, plano, frete_fixo, frete_gratis_acima)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      lojista.id,
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
      19.9,
      150,
    ],
  );
  for (const [id, margem, destaque] of PRODUTOS) await sql.run("INSERT INTO loja_produtos (loja_id, produto_id, margem, destaque) VALUES (?, ?, ?, ?)", [loja.id, id, margem, destaque ? 1 : 0]);
  await sql.run("INSERT INTO links (loja_id, slug, nome) VALUES (?, 'instagram-bio', 'Bio do Instagram'), (?, 'stories', 'Stories')", [loja.id, loja.id]);
});
await db.close();
if (local) await local.stop();

console.log(`Loja de demonstração pronta (${PRODUTOS.length} produtos).`);
console.log(`  painel: http://localhost:3100/painel/entrar  →  ${EMAIL}  (senha em scripts/multiloja-seed.mjs ou MULTILOJA_SEED_SENHA)`);
console.log(`  loja:   http://${SUBDOMINIO}.localhost:3100`);
console.log(`  admin:  http://localhost:3100/admin/entrar  →  ${ADMIN_EMAIL}  (senha no script ou MULTILOJA_SEED_ADMIN_SENHA)`);
