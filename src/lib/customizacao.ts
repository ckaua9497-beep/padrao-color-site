/*
 * Customização de cada variação (GET /produtos: customizacao, criacao_arte e tipos_anexo), com as regras que o site
 * aplica por cima do que a API manda (aprovadas em 23/10/2026):
 * 1. Sem personalização (tipo 0): não pede arte, não aceita arquivo nem oferece criação, mesmo que a API mande anexos
 *    ou preço de criação (bases de wind banner, caneta p/ porcelana, neons prontos…).
 * 2. Neon de modelo pronto (tipo 3): o desenho é o do produto; não aceita arquivo nem criação de arte.
 * 3. Personalizado sem tipos de anexo na API: aceita "Arquivo Único".
 * 4. Nome do produto ("Lona s/ Impressão") ou valor de opção inteiro ("Sem Impressão", "Produto sem Personalização")
 *    dizendo que não há impressão: sem personalização, mesmo com tipo 1.
 * 5. Criação de arte com o preço da própria variação (null = não oferece).
 * 6. Arquivos aceitos = os da própria variação.
 * 7. Web2print só com template (sem ele, envio normal de arquivo).
 * O catálogo guarda os perfis distintos do produto em `customizacoes` e o índice de cada variação em `cz`.
 *
 * Módulo puro (sem React e sem o alias @/): roda no `node --test` e no sync-catalog.
 */

/** Como a arte entra: arquivo do cliente, sem personalização ou um dos fluxos do neon. */
export type ModoArte = "arquivo" | "nenhuma" | "neon-frase" | "neon-modelo" | "neon-logo";

export type Customizacao = {
  modo: ModoArte;
  /** Tipos de anexo aceitos ("Arquivo Único", "Impressão Frente", "Faca de Corte"…). */
  anexos: string[];
  /** Preço da criação de arte pela equipe; null = não oferece. */
  criacao: number | null;
  /** Editor web2print da Padrão, com template. */
  web2print: boolean;
};

/** O que importa de uma linha de GET /produtos. */
export type LinhaCustomizacao = {
  customizacao?: {
    tipo?: number | string;
    web2print?: string;
    template_web2print?: string | null;
    criacao_arte?: { tipo?: number | string; preco?: number | string } | null;
  } | null;
  tipos_anexo?: { nome: string }[] | null;
  variacoes?: Record<string, string> | null;
};

/** Anexos da arte principal (frente e verso); os outros são arquivos complementares (faca, máscara, verniz…). */
export const ANEXOS_DA_ARTE: readonly string[] = ["Arquivo Único", "Impressão Frente", "Impressão Verso"];

/** Produto sem `customizacoes` (API própria, catálogo antigo): arte do cliente em arquivo único. */
export const CUSTOMIZACAO_PADRAO: Customizacao = { modo: "arquivo", anexos: ["Arquivo Único"], criacao: null, web2print: false };

const MODOS: Record<number, ModoArte> = { 0: "nenhuma", 1: "arquivo", 2: "neon-frase", 3: "neon-modelo", 4: "neon-logo" };

const semAcento = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const NOME_SEM_IMPRESSAO = /\b(s\/ ?|sem )(impressao|personalizacao)\b|\bnao personalizavel\b/;
const VALOR_SEM_IMPRESSAO = /^(produto |modelo )?((s\/ ?|sem )(impressao|personalizacao)|nao personalizavel)$/;

/** Regra 4: o nome do produto ou o valor inteiro de uma opção diz que não há impressão. */
export function semImpressaoPeloNome(nomeGrupo: string, variacoes?: Record<string, string> | null): boolean {
  if (NOME_SEM_IMPRESSAO.test(semAcento(nomeGrupo))) return true;
  return Object.values(variacoes ?? {}).some((value) => VALOR_SEM_IMPRESSAO.test(semAcento(String(value ?? ""))));
}

const numero = (value: unknown) => {
  if (value === null || value === undefined || value === "") return NaN;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

/** Customização de uma variação da API, já com as regras do site. */
export function customizacaoDaLinha(linha: LinhaCustomizacao, nomeGrupo: string): Customizacao {
  const c = linha.customizacao;
  const tipo = numero(c?.tipo);
  let modo: ModoArte = MODOS[tipo] ?? "arquivo";
  // O neon pronto ("Modelo Não Personalizável") segue como modelo pronto, não como produto sem impressão.
  if (modo !== "neon-modelo" && semImpressaoPeloNome(nomeGrupo, linha.variacoes)) modo = "nenhuma";
  if (modo === "nenhuma" || modo === "neon-modelo") return { modo, anexos: [], criacao: null, web2print: false };

  const anexos = [...new Set((linha.tipos_anexo ?? []).map((a) => a?.nome?.trim()).filter((nome): nome is string => Boolean(nome)))];
  const tipoCriacao = numero(c?.criacao_arte?.tipo);
  const preco = numero(c?.criacao_arte?.preco);
  return {
    modo,
    anexos: anexos.length ? anexos : ["Arquivo Único"],
    criacao: tipoCriacao > 0 && preco > 0 ? preco : null,
    web2print: semAcento(c?.web2print ?? "") === "sim" && Boolean(c?.template_web2print),
  };
}

/** Perfis distintos do produto (o mais comum primeiro) e o índice do perfil de cada linha, na ordem das linhas. */
export function perfisDeCustomizacao(linhas: readonly LinhaCustomizacao[], nomeGrupo: string): { perfis: Customizacao[]; indices: number[] } {
  const todas = linhas.map((linha) => customizacaoDaLinha(linha, nomeGrupo));
  const contagem = new Map<string, { perfil: Customizacao; n: number }>();
  for (const perfil of todas) {
    const chave = JSON.stringify(perfil);
    const atual = contagem.get(chave);
    if (atual) atual.n += 1;
    else contagem.set(chave, { perfil, n: 1 });
  }
  const ordem = [...contagem.entries()].sort((a, b) => b[1].n - a[1].n).map(([chave]) => chave);
  return { perfis: ordem.map((chave) => contagem.get(chave)!.perfil), indices: todas.map((perfil) => ordem.indexOf(JSON.stringify(perfil))) };
}

/** Customização da variação escolhida (sem variação, a do perfil mais comum do produto). */
export function customizacaoDa(product: { customizacoes?: readonly Customizacao[] | null }, variation?: { cz?: number } | null): Customizacao {
  const perfis = product.customizacoes;
  if (!perfis?.length) return CUSTOMIZACAO_PADRAO;
  return perfis[variation?.cz ?? 0] ?? perfis[0];
}

/** A variação recebe arte do cliente (arquivo, texto ou neon personalizado)? */
export const recebeArte = (c: Customizacao) => c.modo !== "nenhuma" && c.modo !== "neon-modelo";

/** Arquivos que a variação aceita além da arte (faca de corte, máscara de branco, verniz, capa, miolo, posição do LED). */
export const anexosComplementares = (c: Customizacao) => (recebeArte(c) ? c.anexos.filter((nome) => !ANEXOS_DA_ARTE.includes(nome)) : []);
