/*
 * Tipo de cliente no cadastro (puro, testado). Fluxo do "Novo modelo de cadastro" da Padrão (PDF de 05/11/2026): "Como
 * você se identifica?" Cliente ou Revendedor gráfico, cada um com CPF ou CNPJ.
 * - Cliente final (CPF ou CNPJ): cadastro normal, preço de cliente.
 * - Revendedor com CPF: sempre passa pela avaliação da Padrão.
 * - Revendedor com CNPJ: aprovado na hora quando o CNPJ está ativo na Receita e tem, como atividade principal ou
 *   secundária, um dos CNAEs da lista da Padrão (CNAES_REVENDA); senão, ou sem resposta da consulta, vai para a avaliação.
 * - O revendedor responde um mini questionário (QUESTIONARIO_REVENDA, provisório: a Padrão valida as perguntas).
 * A avaliação é feita no sistema da Padrão: o site manda o perfil, a situação e o questionário junto do cadastro
 * (camposDoPerfil). Premissa a confirmar com a Padrão: o nome e os valores desses campos na API (hoje `perfil` e
 * `revenda`, provisórios). O preço de revenda só aparece quando a Padrão liga a tabela do cliente (GET /cliente `tabela`).
 */

/** Pessoa física (CPF) ou jurídica (CNPJ). */
export type Pessoa = "pf" | "pj";

export type Perfil = "cliente" | "revendedor";

export const PERFIL_LABEL: Record<Perfil, string> = { cliente: "Cliente", revendedor: "Revendedor gráfico" };
export const PESSOA_LABEL: Record<Pessoa, string> = { pf: "Pessoa Física", pj: "Pessoa Jurídica" };

export const isPerfil = (value: unknown): value is Perfil => value === "cliente" || value === "revendedor";
export const isPessoa = (value: unknown): value is Pessoa => value === "pf" || value === "pj";

// ---------------------------------------------------------------------------------- CNAEs

export type Cnae = { codigo: string; descricao: string };

/** CNAEs que aprovam o revendedor com CNPJ na hora: a lista da Padrão (Cadu, 05/11/2026), como ela mandou. */
export const CNAES_REVENDA: readonly Cnae[] = [
  { codigo: "1811301", descricao: "Impressão de jornais" },
  { codigo: "1811302", descricao: "Impressão de livros, revistas e outras publicações periódicas" },
  { codigo: "1812100", descricao: "Serviços de pré-impressão" },
  { codigo: "1813001", descricao: "Impressão de material para uso publicitário" },
  { codigo: "1813002", descricao: "Impressão de material para outros usos" },
  { codigo: "1813003", descricao: "Impressão de materiais para uso na comunicação visual" },
  { codigo: "1813099", descricao: "Impressão de outros materiais gráficos" },
  { codigo: "1819101", descricao: "Serviços de encadernação e plastificação" },
  { codigo: "1819102", descricao: "Serviços de acabamento gráfico" },
  { codigo: "1819199", descricao: "Serviços de impressão a jato de tinta e outros serviços gráficos" },
  { codigo: "2230201", descricao: "Reprodução de som" },
  { codigo: "2230202", descricao: "Reprodução de vídeo" },
  { codigo: "2230203", descricao: "Reprodução de softwares em meio eletrônico" },
  { codigo: "3299002", descricao: "Fabricação de artigos para festas, publicitários e decorativos" },
  { codigo: "7319003", descricao: "Marketing direto" },
  { codigo: "7420002", descricao: "Atividades de produção de fotografia, exceto aérea e submarina" },
  { codigo: "7490101", descricao: "Atividades de design" },
  { codigo: "2222901", descricao: "Fabricação de embalagens de material plástico" },
  { codigo: "2229302", descricao: "Fabricação de artigos de material plástico para uso pessoal e doméstico" },
  { codigo: "1721400", descricao: "Fabricação de embalagens de papel" },
  { codigo: "4649499", descricao: "Comércio atacadista de outros produtos intermediários não especificados anteriormente" },
  { codigo: "4753900", descricao: "Comércio varejista especializado de equipamentos e suprimentos de informática" },
  { codigo: "7420001", descricao: "Atividades de produção de fotografia aérea e submarina" },
  { codigo: "7311400", descricao: "Agências de publicidade" },
  { codigo: "8230001", descricao: "Serviços de organização de feiras, congressos, exposições e festas" },
  { codigo: "8230002", descricao: "Casas de festas e eventos" },
  { codigo: "5811500", descricao: "Edição de livros" },
  { codigo: "5812300", descricao: "Edição de jornais" },
  { codigo: "5813100", descricao: "Edição de revistas" },
  { codigo: "7111100", descricao: "Serviços de arquitetura" },
  { codigo: "7119703", descricao: "Serviços de desenho técnico relacionados à arquitetura e engenharia" },
  { codigo: "1412601", descricao: "Confecção de peças do vestuário, exceto roupas íntimas e as confeccionadas sob medida" },
  { codigo: "1412602", descricao: "Confecção, sob medida, de roupas profissionais" },
];

const LISTA = new Set(CNAES_REVENDA.map((cnae) => cnae.codigo));

/** Código da CNAE em 7 dígitos ("18.13-0-01", "1813-0/01" ou 1813001 → "1813001"); null quando não é um código. */
export function codigoCnae(value: unknown): string | null {
  const digits = typeof value === "number" ? (Number.isInteger(value) && value > 0 ? String(value) : "") : typeof value === "string" ? value.replace(/\D/g, "") : "";
  if (!digits || digits.length > 7) return null;
  const codigo = digits.padStart(7, "0");
  return /^0+$/.test(codigo) ? null : codigo;
}

/** "1813001" → "1813-0/01". */
export const formatarCnae = (codigo: string) => `${codigo.slice(0, 4)}-${codigo.slice(4, 5)}/${codigo.slice(5, 7)}`;

/** O que a consulta do CNPJ na Receita diz (cnpj-receita.ts). */
export type ConsultaCnpj = {
  /** Situação cadastral ATIVA. */
  ativa: boolean;
  situacao: string;
  /** Atividade principal primeiro, depois as secundárias. */
  cnaes: string[];
};

/** Resposta da BrasilAPI (/api/cnpj/v1/{cnpj}): cnae_fiscal, cnaes_secundarios [{codigo}], descricao_situacao_cadastral. */
export function lerConsultaCnpj(json: unknown): ConsultaCnpj | null {
  if (typeof json !== "object" || json === null) return null;
  const data = json as Record<string, unknown>;
  const principal = codigoCnae(data.cnae_fiscal);
  if (!principal) return null;
  const secundarios = Array.isArray(data.cnaes_secundarios) ? data.cnaes_secundarios.map((item) => codigoCnae((item as { codigo?: unknown } | null)?.codigo)) : [];
  const cnaes = [...new Set([principal, ...secundarios.filter((codigo): codigo is string => Boolean(codigo))])];
  const situacao = typeof data.descricao_situacao_cadastral === "string" ? data.descricao_situacao_cadastral.trim().toUpperCase() : "";
  return { ativa: situacao === "ATIVA", situacao, cnaes };
}

export type SituacaoRevenda = "aprovado" | "analise";

export type DecisaoRevenda = {
  situacao: SituacaoRevenda;
  /** Por que (vai para a Padrão junto do cadastro). */
  motivo: string;
  /** CNAEs do CNPJ que estão na lista. */
  cnaes: string[];
};

/** Revendedor aprovado na hora ou em análise (só o CNPJ ativo com CNAE da lista é aprovado). `consulta` null = sem resposta. */
export function decisaoDaRevenda(pessoa: Pessoa, consulta: ConsultaCnpj | null): DecisaoRevenda {
  if (pessoa === "pf") return { situacao: "analise", motivo: "Revendedor com CPF: passa pela avaliação da Padrão.", cnaes: [] };
  if (!consulta) return { situacao: "analise", motivo: "Não foi possível consultar o CNPJ na Receita: passa pela avaliação da Padrão.", cnaes: [] };
  const cnaes = consulta.cnaes.filter((codigo) => LISTA.has(codigo));
  if (!consulta.ativa) return { situacao: "analise", motivo: `CNPJ com situação ${consulta.situacao || "desconhecida"} na Receita: passa pela avaliação da Padrão.`, cnaes };
  if (!cnaes.length) return { situacao: "analise", motivo: `Nenhuma atividade do CNPJ (${consulta.cnaes.map(formatarCnae).join(", ")}) está na lista de atividades gráficas: passa pela avaliação da Padrão.`, cnaes };
  return { situacao: "aprovado", motivo: `Atividade gráfica no CNPJ (CNAE ${cnaes.map(formatarCnae).join(", ")}): revendedor aprovado na hora.`, cnaes };
}

// ---------------------------------------------------------------------------------- questionário

export type Pergunta =
  | { id: string; texto: string; tipo: "opcao"; opcoes: readonly string[]; obrigatoria: boolean }
  | { id: string; texto: string; tipo: "texto"; obrigatoria: boolean; exemplo?: string };

/** Mude a versão quando mudar as perguntas (vai junto das respostas). */
export const QUESTIONARIO_VERSAO = 1;

/** Mini questionário do revendedor. Provisório: as perguntas são para a Padrão validar. */
export const QUESTIONARIO_REVENDA: readonly Pergunta[] = [
  { id: "tempo", texto: "Há quanto tempo você revende produtos gráficos?", tipo: "opcao", opcoes: ["Estou começando agora", "Menos de 1 ano", "De 1 a 3 anos", "Mais de 3 anos"], obrigatoria: true },
  { id: "atendimento", texto: "Como você atende seus clientes?", tipo: "opcao", opcoes: ["Loja física", "Online (site, redes sociais, WhatsApp)", "Loja física e online", "Visitando os clientes"], obrigatoria: true },
  { id: "produtos", texto: "Quais produtos você mais vende?", tipo: "texto", obrigatoria: true, exemplo: "Ex.: cartões de visita, banners, adesivos, camisetas" },
  { id: "volume", texto: "Quanto você pretende comprar por mês?", tipo: "opcao", opcoes: ["Até R$ 500", "De R$ 500 a R$ 2.000", "De R$ 2.000 a R$ 5.000", "Acima de R$ 5.000"], obrigatoria: true },
  { id: "presenca", texto: "Site ou rede social da sua revenda", tipo: "texto", obrigatoria: false, exemplo: "@suarevenda ou www.suarevenda.com.br" },
  { id: "origem", texto: "Como conheceu a Padrão Color?", tipo: "opcao", opcoes: ["Indicação", "Instagram", "Google", "Já comprava nas lojas da Padrão", "Outro"], obrigatoria: false },
];

export type Respostas = Record<string, string>;

const MAX_RESPOSTA = 300;

/** Respostas vindas do navegador: só as perguntas do questionário, opção da lista e texto curto. */
export function lerRespostas(raw: unknown): Respostas {
  const data = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const respostas: Respostas = {};
  for (const pergunta of QUESTIONARIO_REVENDA) {
    const value = typeof data[pergunta.id] === "string" ? (data[pergunta.id] as string).trim().slice(0, MAX_RESPOSTA) : "";
    if (!value) continue;
    if (pergunta.tipo === "opcao" && !pergunta.opcoes.includes(value)) continue;
    respostas[pergunta.id] = value;
  }
  return respostas;
}

/** Perguntas obrigatórias sem resposta: id → mensagem. */
export function questionarioErros(respostas: Respostas): Record<string, string> {
  const erros: Record<string, string> = {};
  for (const pergunta of QUESTIONARIO_REVENDA) {
    if (pergunta.obrigatoria && !respostas[pergunta.id]) erros[pergunta.id] = pergunta.tipo === "opcao" ? "Escolha uma opção." : "Responda esta pergunta.";
  }
  return erros;
}

// ---------------------------------------------------------------------------------- cadastro na API

export type CamposDoPerfil = {
  perfil: "CLIENTE FINAL" | "REVENDEDOR";
  revenda?: {
    situacao: "APROVADO" | "EM ANALISE";
    motivo: string;
    cnaes: string[];
    questionario: { versao: number; respostas: { pergunta: string; resposta: string }[] };
  };
};

/** O tipo de cliente que vai no POST /cadastrarcliente. Nomes e valores provisórios (cabeçalho do arquivo). */
export function camposDoPerfil(perfil: Perfil, decisao: DecisaoRevenda | null = null, respostas: Respostas = {}): CamposDoPerfil {
  if (perfil === "cliente" || !decisao) return { perfil: "CLIENTE FINAL" };
  return {
    perfil: "REVENDEDOR",
    revenda: {
      situacao: decisao.situacao === "aprovado" ? "APROVADO" : "EM ANALISE",
      motivo: decisao.motivo,
      cnaes: decisao.cnaes.map(formatarCnae),
      questionario: {
        versao: QUESTIONARIO_VERSAO,
        respostas: QUESTIONARIO_REVENDA.filter((pergunta) => respostas[pergunta.id]).map((pergunta) => ({ pergunta: pergunta.texto, resposta: respostas[pergunta.id] })),
      },
    },
  };
}

/** O que o cliente lê depois de criar a conta de revendedor. */
export function textoDaRevenda(decisao: Pick<DecisaoRevenda, "situacao" | "cnaes">): string {
  if (decisao.situacao === "aprovado") {
    return `Cadastro de revendedor aprovado: seu CNPJ tem atividade gráfica (CNAE ${decisao.cnaes.map(formatarCnae).join(", ")}). Os preços de revenda aparecem assim que a Padrão Color liberar a sua tabela.`;
  }
  return "Seu cadastro de revendedor foi enviado para a avaliação da Padrão Color. Enquanto isso, você já pode comprar com o preço de cliente.";
}
