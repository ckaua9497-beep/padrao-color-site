/*
 * Acabamentos extras de cada variação (GET /produtos: `acabamentos`): serrilha, furo, dobra, laminação, canteamento,
 * encadernação… O cliente escolhe na página do produto; o preço e o prazo entram no total do item e o valor vai em
 * `precoTotalAcabamentos` no pedido.
 *
 * Leitura dos campos da API (a confirmar com a Padrão):
 * - `multiplica`: "milheiro" = preço por mil unidades (mínimo de um milheiro); "unidade" = por peça; "não" = fixo
 *   por item.
 * - `informa_qtde`: 1 = o cliente informa quantos aplica (2 furos, 3 dobras) e o preço multiplica por isso.
 * - `prazo`: dias úteis somados ao prazo do produto; vários acabamentos somam os prazos.
 * O catálogo guarda a tabela de acabamentos distintos do produto em `acabamentos` e os índices de cada variação em
 * `ac`.
 *
 * Módulo puro (sem React e sem o alias @/): roda no `node --test` e no sync-catalog.
 */

export type Cobranca = "milheiro" | "unidade" | "fixo";

export type Acabamento = {
  /** ID do acabamento na API (o mesmo em GET /acabamentos). */
  id: string;
  nome: string;
  cobranca: Cobranca;
  preco: number;
  /** Dias úteis a mais na produção. */
  prazo: number;
  /** O cliente informa a quantidade (furos, dobras, linhas de serrilha). */
  qtd: boolean;
};

/** Escolha do cliente: o acabamento e quantos aplica (1 quando o acabamento não pede quantidade). */
export type AcabamentoEscolhido = { id: string; qtd: number };

export type AcabamentoCotado = { acabamento: Acabamento; qtd: number; preco: number };

export type CotacaoAcabamentos = { itens: AcabamentoCotado[]; total: number; prazo: number };

/** Quantidade máxima informada por acabamento (furos, dobras…). */
export const MAX_QTD_ACABAMENTO = 20;

const SEM_ACABAMENTOS: CotacaoAcabamentos = { itens: [], total: 0, prazo: 0 };
const round2 = (value: number) => Math.round(value * 100) / 100;
const numero = (value: unknown) => {
  if (value === null || value === undefined || value === "") return NaN;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

/** Acabamentos de uma linha de GET /produtos (os sem nome, ID ou preço válido ficam de fora). */
export function acabamentosDaLinha(linha: { acabamentos?: unknown }): Acabamento[] {
  if (!Array.isArray(linha.acabamentos)) return [];
  const out: Acabamento[] = [];
  for (const raw of linha.acabamentos) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Record<string, unknown>;
    const id = String(a.id ?? "").trim();
    const nome = String(a.nome ?? "").trim();
    const preco = numero(a.preco);
    if (!id || !nome || !(preco >= 0)) continue;
    const multiplica = String(a.multiplica ?? "").trim().toLowerCase();
    const cobranca: Cobranca = multiplica === "milheiro" ? "milheiro" : multiplica === "unidade" ? "unidade" : "fixo";
    const prazo = Math.max(0, Math.round(numero(a.prazo) || 0));
    if (!out.some((item) => item.id === id)) out.push({ id, nome, cobranca, preco, prazo, qtd: numero(a.informa_qtde) === 1 });
  }
  return out;
}

/** Tabela dos acabamentos distintos do produto e os índices de cada linha (na ordem das linhas). */
export function tabelaDeAcabamentos(linhas: readonly { acabamentos?: unknown }[]): { tabela: Acabamento[]; indices: number[][] } {
  const tabela: Acabamento[] = [];
  const chaves: string[] = [];
  const indices = linhas.map((linha) =>
    acabamentosDaLinha(linha).map((acabamento) => {
      const chave = JSON.stringify(acabamento);
      let i = chaves.indexOf(chave);
      if (i < 0) {
        i = chaves.push(chave) - 1;
        tabela.push(acabamento);
      }
      return i;
    }),
  );
  return { tabela, indices };
}

/** Acabamentos extras que a variação aceita. */
export function acabamentosDa(product: { acabamentos?: readonly Acabamento[] | null }, variation?: { ac?: readonly number[] } | null): Acabamento[] {
  const tabela = product.acabamentos ?? [];
  return (variation?.ac ?? []).map((i) => tabela[i]).filter((a): a is Acabamento => Boolean(a));
}

/** Preço de um acabamento para o item: `unidades` = peças do item (lotes × unidades do lote). */
export function precoAcabamento(acabamento: Acabamento, unidades: number, qtd = 1): number {
  const vezes = acabamento.qtd ? Math.max(1, Math.min(MAX_QTD_ACABAMENTO, Math.round(qtd))) : 1;
  const base =
    acabamento.cobranca === "milheiro" ? acabamento.preco * Math.max(1, unidades / 1000) : acabamento.cobranca === "unidade" ? acabamento.preco * Math.max(1, unidades) : acabamento.preco;
  return round2(base * vezes);
}

/**
 * Preço e prazo dos acabamentos escolhidos, entre os que a variação aceita. `null` quando algum escolhido não vale
 * para a variação (a opção mudou desde que o cliente escolheu).
 */
export function cotarAcabamentos(disponiveis: readonly Acabamento[], escolhidos: readonly AcabamentoEscolhido[] | undefined, unidades: number): CotacaoAcabamentos | null {
  if (!escolhidos?.length) return SEM_ACABAMENTOS;
  const itens: AcabamentoCotado[] = [];
  for (const escolha of escolhidos) {
    const acabamento = disponiveis.find((a) => a.id === escolha.id);
    if (!acabamento) return null;
    if (itens.some((item) => item.acabamento.id === acabamento.id)) continue;
    const qtd = acabamento.qtd ? Math.max(1, Math.min(MAX_QTD_ACABAMENTO, Math.round(escolha.qtd) || 1)) : 1;
    itens.push({ acabamento, qtd, preco: precoAcabamento(acabamento, unidades, qtd) });
  }
  return { itens, total: round2(itens.reduce((sum, item) => sum + item.preco, 0)), prazo: itens.reduce((sum, item) => sum + item.acabamento.prazo, 0) };
}

/** Escolhas vindas do navegador (carrinho/checkout), validadas: IDs curtos, quantidade inteira, sem repetir. */
export function parseAcabamentosEscolhidos(raw: unknown): AcabamentoEscolhido[] {
  if (!Array.isArray(raw)) return [];
  const out: AcabamentoEscolhido[] = [];
  for (const entry of raw.slice(0, 20)) {
    if (!entry || typeof entry !== "object") continue;
    const { id, qtd } = entry as Record<string, unknown>;
    if (typeof id !== "string" || !/^[\w-]{1,20}$/.test(id) || out.some((item) => item.id === id)) continue;
    const n = typeof qtd === "number" && Number.isFinite(qtd) ? Math.round(qtd) : 1;
    out.push({ id, qtd: Math.max(1, Math.min(MAX_QTD_ACABAMENTO, n)) });
  }
  return out;
}

/** Linha legível dos acabamentos ("Serrilha (2×), Laminação Fosca 1/0"), para o carrinho e o pedido. */
export function resumoAcabamentos(itens: readonly AcabamentoCotado[]): string {
  return itens.map((item) => (item.acabamento.qtd && item.qtd > 1 ? `${item.acabamento.nome} (${item.qtd}×)` : item.acabamento.nome)).join(", ");
}
