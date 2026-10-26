// Tipos das respostas da API Padrão Color, levantados chamando os endpoints de leitura
// (o PDF da integração não documenta os JSONs de resposta). "Sim"/"Não" chegam como texto.

export type SimNao = "Sim" | "Não";

export type ApiInfoBlock = { titulo: string; texto: string };

/** Produto relacionado ("veja também") dentro de grupo/categoria. */
export type ApiRelated = {
  id: number;
  nome: string;
  categoria: string;
  lancamento: SimNao;
  mais_vendido: SimNao;
  imagem: string;
  preco: number;
};

/** GET /grupos — o "produto" da vitrine (uma página de produto). */
export type ApiGrupo = {
  id: number;
  tipo: number;
  nome: string;
  origem: number;
  id_categoria: string;
  categoria: string;
  imagem: string;
  /** URL do gabarito (.zip/.rar) ou "" quando não há. */
  gabarito: string;
  meta_title: string;
  meta_description: string;
  descricao: string;
  /** Lista separada por vírgulas. */
  tags: string;
  informacao: ApiInfoBlock[];
  resumo: string;
  lancamento: SimNao;
  mais_vendido: SimNao;
  preco: number;
  veja_tambem: ApiRelated[];
};

/** GET /categorias */
export type ApiCategoria = {
  id: number;
  nome: string;
  imagem: string;
  banner: string;
  banner_mobile: string;
  meta_title: string;
  meta_description: string;
  grupos?: Omit<ApiGrupo, "tipo" | "origem" | "id_categoria" | "categoria" | "veja_tambem">[];
  veja_tambem?: unknown[];
};

/** GET /produtos — cada combinação vendável (variação) de um grupo. */
export type ApiProduto = {
  id: number;
  nome: string;
  origem: number;
  categoria: string;
  grupo: string;
  /** 1 = o cliente informa largura × altura (preço por m²). */
  informa_medida: 0 | 1;
  largura_minima?: string;
  largura_maxima?: string;
  altura_minima?: string;
  altura_maxima?: string;
  tamanho_minimo?: string;
  tamanho_maximo?: string;
  customizacao: {
    tipo: number;
    web2print: SimNao;
    template_web2print?: string;
    criacao_arte?: { tipo: string; preco: string };
  };
  /** Tamanhos de vestuário (tamanho_1…n) ou "Não". */
  quantidade_tamanho: Record<string, string> | "Não";
  formato?: string;
  cor?: string;
  quantidade: string;
  qtde_minima: string;
  qtde_maxima: string;
  imagem_1: string;
  imagem_2: string;
  imagem_3: string;
  imagem_4: string;
  embalagem?: { material: string; peso: number; largura: number; altura: number; comprimento: number; quantidade: number };
  peso?: number | string;
  preco: { expresso: number; economico: number };
  prazo: { hora_envio: string; expresso: number; economico: number };
  variacoes: Record<string, string>;
  acabamentos?: { id: string; nome: string; descricao: string }[];
  tipos_anexo: { nome: string }[];
};

/** GET /acabamentos */
export type ApiAcabamento = {
  id: number;
  nome: string;
  descricao: string;
  informa_qtde: number;
  offset: { multiplica: string; prazo: number };
  sign: { multiplica: string; prazo: number };
  digital: { multiplica: string; prazo: number };
};

/** GET /configuracoes — a vitrine do padraocolor.com.br; o formato muda conforme o `tipo`. */
export type ApiConfiguracao =
  | { tipo: "Banner"; nome: string; imagem_desktop: string; imagem_mobile: string; url: string }
  | { tipo: "Botões - Linha 1" | "Botões - Linha 2"; nome: string; imagem: string; url: string; nova_pagina: SimNao }
  | { tipo: "Categorias em Destaque"; id: string; nome: string; imagem: string; preco: string }
  | { tipo: "Nossos Destaques"; id: string; nome: string; imagem: string; lancamento: SimNao; mais_vendido: SimNao; preco: string }
  | { tipo: "Menu"; id: string; nome: string; grupos: string }
  | { tipo: "Header" | "TopHeader"; nome: string; imagem: string; url: string }
  | { tipo: "Produtos mais Vendidos"; id: string; nome: string; [key: string]: unknown }
  | Record<string, never>;

/** GET /tiposnegocio — "Para o seu negócio". */
export type ApiTipoNegocio = {
  id: string;
  nome: string;
  imagem: string;
  banner: string;
  meta_title: string;
  meta_description: string;
  grupos: { id: number; nome: string; imagem: string }[];
};

export type ApiEndereco = {
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  pais?: string;
  /** Rota de entrega da Padrão: o nome é a cor dela ("VERDE"); sem rota = transportadora (cliente.ts). */
  rota?: string;
  /** Só no endereço de entrega. */
  taxa_rota?: number;
};

/**
 * GET /cliente — o cliente dono do token. `tabela` e `categoria` identificam revendedor. Formato conferido com uma resposta
 * real de 26/10/2026; leia saldo, e-mail, nascimento e rota por src/lib/cliente.ts.
 */
export type ApiCliente = {
  id: number;
  nome: string;
  razao: string;
  documento: string;
  login: string;
  endereco_cadastro: ApiEndereco;
  endereco_entrega: ApiEndereco;
  telefone_1: string;
  telefone_2: string;
  telefone_3: string;
  /** Pode vir vazio: o e-mail fica só em `email_cadastro`. */
  email: string;
  email_cadastro: string;
  /** DD/MM/AAAA. */
  nascimento?: string;
  /** Bronze, Prata, Ouro, Ouro 2, Diamante… */
  categoria: string;
  /** "N" = pagamento na retirada liberado (premissa: cliente.ts): a taxa da rota não entra no pedido. */
  pagamento_antecipado: "S" | "N" | string;
  /** "CLIENTE FINAL" = preço de balcão; outra tabela = revenda. */
  tabela: { id: string; nome: string };
  /** O saldo vem em `credito` (`saldo` era o formato antigo). */
  conta_corrente: { credito?: number; saldo?: number; bloqueado: number };
};

/** GET /contacorrente */
export type ApiContaCorrente = { id: number; revenda: string; saldo?: number; credito?: number; bloqueado: number };

export type ApiSituacao = {
  id: number;
  status: string;
  descricao: string;
  texto: string;
  defeito: string;
  /** "Sim" quando a arte precisa ser reenviada (POST /reenviararte). */
  reenvia_arte: SimNao;
};

export type ApiPedidoItem = {
  pedido: number;
  nome_trabalho: string;
  tipo_arte: string;
  tipo_tratamento: string;
  produto: { id: number; descricao: string; quantidade: number; arquivos: unknown[] };
  entrega_retirada: { tipo: string; pgto: string; rota: string; endereco: ApiEndereco };
  previsao: string;
  situacao: ApiSituacao;
  valor: { produto: number; criacao_arte: number; tratamento_profissional: number; frete: number; total: number };
};

export type ApiPedido = {
  compra: number;
  /** DD/MM/AAAA */
  data: string;
  hora: string;
  envio: string;
  multiloja: SimNao;
  itens: ApiPedidoItem[];
  pagamento: { id: string; autorizacao: string; tipo: string; parcelas: string; status: string };
  nota_fiscal: { numero: string; chave: string; link: string };
  frete: number;
  valor_total: number;
  credito_usado: number;
  valor_cupom: number;
  valor_pago: number;
};

/** GET /pedidos */
export type ApiPedidos = { total: number; paginas: number; pedidos: ApiPedido[] };

/** GET /multiloja/revendas */
export type ApiRevenda = { id: string; nome: string; email: string; categoria: string; plano: string; dominio: string };

export type ApiFeriado = { data: string; descricao?: string; [key: string]: unknown };
