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
  // Etapa 2: pedidos, pagamento, comissão e saque; domínio próprio verificado; frete da loja; divulgação; admins da Padrão.
  `
  ALTER TABLE lojas ADD COLUMN dominio_verificado INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE lojas ADD COLUMN frete_fixo REAL NOT NULL DEFAULT 0;
  ALTER TABLE lojas ADD COLUMN frete_gratis_acima REAL;
  ALTER TABLE lojistas ADD COLUMN chave_pix TEXT;

  CREATE TABLE pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER NOT NULL REFERENCES lojas(id),
    codigo TEXT NOT NULL UNIQUE,
    token TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'aguardando_pagamento',
    cliente_nome TEXT NOT NULL,
    cliente_email TEXT NOT NULL,
    cliente_telefone TEXT NOT NULL,
    cliente_documento TEXT NOT NULL,
    entrega TEXT NOT NULL,
    forma_pagamento TEXT NOT NULL,
    subtotal REAL NOT NULL,
    desconto REAL NOT NULL DEFAULT 0,
    frete REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL,
    custo_base REAL NOT NULL,
    taxa_pagamento REAL NOT NULL DEFAULT 0,
    comissao REAL NOT NULL,
    pagamento_provedor TEXT NOT NULL,
    pagamento_id TEXT,
    pagamento_dados TEXT NOT NULL DEFAULT '{}',
    pago_em TEXT,
    ref TEXT,
    observacoes TEXT NOT NULL DEFAULT '',
    padrao_pedido TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX pedidos_loja ON pedidos(loja_id, criado_em);
  CREATE INDEX pedidos_pagamento ON pedidos(pagamento_id);

  CREATE TABLE pedido_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    posicao INTEGER NOT NULL,
    produto_id TEXT NOT NULL,
    grupo_id INTEGER,
    variacao_id INTEGER,
    nome TEXT NOT NULL,
    opcoes TEXT NOT NULL DEFAULT '{}',
    lotes INTEGER NOT NULL,
    unidades INTEGER NOT NULL,
    largura_cm REAL,
    altura_cm REAL,
    expresso INTEGER NOT NULL DEFAULT 0,
    preco_unitario REAL NOT NULL,
    base_unitario REAL NOT NULL,
    total REAL NOT NULL,
    total_base REAL NOT NULL,
    margem REAL NOT NULL,
    prazo_dias INTEGER,
    arte_nome TEXT,
    arte_arquivo TEXT
  );
  CREATE INDEX pedido_itens_pedido ON pedido_itens(pedido_id);

  CREATE TABLE pedido_eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    nota TEXT NOT NULL DEFAULT '',
    autor TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX pedido_eventos_pedido ON pedido_eventos(pedido_id);

  CREATE TABLE saques (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER NOT NULL REFERENCES lojas(id),
    valor REAL NOT NULL,
    chave_pix TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'solicitado',
    nota TEXT NOT NULL DEFAULT '',
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    resolvido_em TEXT
  );
  CREATE INDEX saques_loja ON saques(loja_id);

  CREATE TABLE links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    nome TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (loja_id, slug)
  );

  CREATE TABLE visitas (
    loja_id INTEGER NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
    ref TEXT NOT NULL DEFAULT '',
    dia TEXT NOT NULL,
    total INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (loja_id, ref, dia)
  );

  CREATE TABLE admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    ultimo_login TEXT
  );
  `,
];
