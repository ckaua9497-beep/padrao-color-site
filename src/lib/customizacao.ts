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
 * 8. Acessório não muda a arte: o controle remoto do LED neon (opção "s/ controle" / "c/ Controle") é só uma peça a
 *    mais. Variações que só diferem nele aceitam os mesmos arquivos (a união dos tipos de anexo), a mesma criação e o
 *    mesmo web2print. (25/10/2026: no Quadro Acrílico com Led Neon, só a "45x50cm s/ controle" vinha sem "Impressão
 *    Verso" e "Verniz Local Frente", e o envio do verso aparecia ou sumia com o controle.)
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

/** Valor de opção que é acessório e não muda a arte (regra 8): o controle remoto do LED neon. */
export function opcaoDeAcessorio(valor: string): boolean {
  return /\bcontrole\b/.test(semAcento(valor));
}

/**
 * Regra 8: as variações que só diferem num acessório (opcaoDeAcessorio) ficam com o mesmo perfil, com a união dos tipos
 * de anexo (na ordem da mais completa). Só junta variações do mesmo modo que recebem arte; o resto fica como veio.
 */
export function unirPorAcessorio(itens: readonly { variacoes?: Record<string, string> | null; perfil: Customizacao }[]): Customizacao[] {
  const chave = (variacoes?: Record<string, string> | null) =>
    JSON.stringify(
      Object.entries(variacoes ?? {})
        .filter(([, valor]) => !opcaoDeAcessorio(String(valor ?? "")))
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  const grupos = new Map<string, number[]>();
  itens.forEach((item, i) => {
    const k = chave(item.variacoes);
    grupos.set(k, [...(grupos.get(k) ?? []), i]);
  });
  const out = itens.map((item) => item.perfil);
  for (const membros of grupos.values()) {
    // Só variações que têm o acessório (e diferem nele): linhas sem opções ficam como vieram.
    if (membros.length < 2 || !membros.every((i) => Object.values(itens[i].variacoes ?? {}).some((valor) => opcaoDeAcessorio(String(valor ?? ""))))) continue;
    const perfis = membros.map((i) => itens[i].perfil);
    if (new Set(perfis.map((perfil) => perfil.modo)).size > 1 || !recebeArte(perfis[0])) continue;
    const base = [...perfis].sort((a, b) => b.anexos.length - a.anexos.length)[0];
    const anexos = [...base.anexos];
    for (const perfil of perfis) for (const nome of perfil.anexos) if (!anexos.includes(nome)) anexos.push(nome);
    const unido: Customizacao = { modo: base.modo, anexos, criacao: base.criacao ?? perfis.find((perfil) => perfil.criacao !== null)?.criacao ?? null, web2print: perfis.some((perfil) => perfil.web2print) };
    for (const i of membros) out[i] = unido;
  }
  return out;
}

/** Perfis distintos (o mais comum primeiro) e o índice do perfil de cada item, na ordem dos itens. */
export function indexarPerfis(todas: readonly Customizacao[]): { perfis: Customizacao[]; indices: number[] } {
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

/** Perfis distintos do produto (o mais comum primeiro) e o índice do perfil de cada linha, na ordem das linhas. */
export function perfisDeCustomizacao(linhas: readonly LinhaCustomizacao[], nomeGrupo: string): { perfis: Customizacao[]; indices: number[] } {
  return indexarPerfis(unirPorAcessorio(linhas.map((linha) => ({ variacoes: linha.variacoes, perfil: customizacaoDaLinha(linha, nomeGrupo) }))));
}

/** Customização da variação escolhida (sem variação, a do perfil mais comum do produto). */
export function customizacaoDa(product: { customizacoes?: readonly Customizacao[] | null }, variation?: { cz?: number } | null): Customizacao {
  const perfis = product.customizacoes;
  if (!perfis?.length) return CUSTOMIZACAO_PADRAO;
  return perfis[variation?.cz ?? 0] ?? perfis[0];
}

/**
 * Preço da criação de arte de cada variação (ID → preço), para o carrinho e o servidor recalcularem o item; null quando
 * nenhuma variação oferece (regra 5).
 */
export function criacaoPorVariacao(product: { customizacoes?: readonly Customizacao[] | null; variations: readonly { id?: number; cz?: number }[] }): Record<string, number> | null {
  const entries: [string, number][] = [];
  for (const variation of product.variations) {
    const c = customizacaoDa(product, variation);
    if (variation.id !== undefined && recebeArte(c) && c.criacao) entries.push([String(variation.id), c.criacao]);
  }
  return entries.length ? Object.fromEntries(entries) : null;
}

/** A variação recebe arte do cliente (arquivo, texto ou neon personalizado)? */
export const recebeArte = (c: Customizacao) => c.modo !== "nenhuma" && c.modo !== "neon-modelo";

/** Arquivos que a variação aceita além da arte (faca de corte, máscara de branco, verniz, capa, miolo, posição do LED). */
export const anexosComplementares = (c: Customizacao) => (recebeArte(c) ? c.anexos.filter((nome) => !ANEXOS_DA_ARTE.includes(nome)) : []);

export const ARQUIVO_UNICO = "Arquivo Único";

/**
 * Campos de "Arquivos para a produção" da variação (revisão da Padrão de 25/10/2026, "Anexo de Arquivos"): o "Arquivo
 * Único" (sempre, primeiro, mesmo na variação que só aceita ele) e os separados que a API dispara em `tipos_anexo`
 * (Impressão Frente/Verso, verniz, faca, máscara de branco, capa, miolo, posição do LED). São a opção principal do
 * "Enviar sua arte" (pedido de 25/10: os arquivos de produção vêm antes da arte montada no site).
 */
export function anexosDeProducao(c: Customizacao): string[] {
  if (!recebeArte(c)) return [];
  return [ARQUIVO_UNICO, ...c.anexos.filter((nome) => nome !== ARQUIVO_UNICO)];
}

/** Os arquivos enviados cobrem a frente (arquivo único ou "Impressão Frente"): a arte montada no site não vai. */
export function frenteEnviada(enviados: Readonly<Record<string, unknown>>): boolean {
  return Boolean(enviados[ARQUIVO_UNICO] || enviados["Impressão Frente"]);
}

/**
 * Quais campos aparecem: enviar o arquivo único esconde os separados, e enviar qualquer separado esconde o arquivo único
 * (como no site atual). Sem nada enviado, todos aparecem.
 */
export function camposVisiveis(tipos: readonly string[], enviados: Readonly<Record<string, unknown>>): string[] {
  if (enviados[ARQUIVO_UNICO]) return tipos.filter((tipo) => tipo === ARQUIVO_UNICO);
  if (tipos.some((tipo) => tipo !== ARQUIVO_UNICO && enviados[tipo])) return tipos.filter((tipo) => tipo !== ARQUIVO_UNICO);
  return [...tipos];
}
