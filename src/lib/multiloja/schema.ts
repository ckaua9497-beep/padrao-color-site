/*
 * Esquema do banco da multiloja, em migrações na ordem em que rodam. Nunca editar uma migração já aplicada:
 * mudança nova = item novo no fim da lista. Módulo puro (o db.ts e o scripts/multiloja-seed.mjs usam).
 */

export const MIGRATIONS: string[] = [
  `
  CREATE TABLE lojistas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    tipo TEXT NOT NULL,
    documento TEXT,
    telefone TEXT,
    status TEXT NOT NULL DEFAULT 'ativo',
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    ultimo_login TEXT
  );

  CREATE TABLE lojas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lojista_id INTEGER NOT NULL REFERENCES lojistas(id),
    subdominio TEXT NOT NULL UNIQUE,
    dominio TEXT UNIQUE,
    nome TEXT NOT NULL,
    slogan TEXT NOT NULL DEFAULT '',
    sobre TEXT NOT NULL DEFAULT '',
    logo TEXT,
    whatsapp TEXT,
    telefone TEXT,
    email_contato TEXT,
    redes TEXT NOT NULL DEFAULT '{}',
    paleta TEXT NOT NULL DEFAULT 'coral',
    banners TEXT NOT NULL DEFAULT '[]',
    categorias_destaque TEXT NOT NULL DEFAULT '[]',
    margem_padrao REAL NOT NULL DEFAULT 30,
    plano TEXT NOT NULL DEFAULT 'gratis',
    ativa INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE loja_produtos (
    loja_id INTEGER NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
    produto_id TEXT NOT NULL,
    margem REAL,
    destaque INTEGER NOT NULL DEFAULT 0,
    ativado_em TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (loja_id, produto_id)
  );

  CREATE INDEX loja_produtos_loja ON loja_produtos(loja_id);
  `,
];
