import type { ApiCategoria, ApiGrupo, ApiProduto } from "./api/types";

/*
 * API própria do site para os produtos que a Padrão Color ainda não tem na API dela (GET /api/novos).
 * Responde no MESMO formato da API da Padrão (/categorias, /grupos, /produtos e os mesmos filtros), para o
 * scripts/sync-novos.mjs consumir igual ao sync-catalog.mjs. O grupo leva também `parametros`: todos os
 * atributos e valores do produto (inclusive os ainda sem preço), regras, quantidades, serviços e medidas.
 *
 * Fonte: src/data/novos/fonte.json. IDs reservados para nunca colidir com a Padrão: categoria 900000,
 * grupos 900001+ e variações 9000001+ (README, "Produtos novos").
 * Módulo puro (sem "server-only" e sem JSON importado) para os testes rodarem com node --test.
 */

/** Todos os parâmetros de um produto novo (extensão do grupo; a API da Padrão não tem). */
export type NovoParametros = {
  atributos: { id: string; nome: string; visivel: boolean; valores: { id: string; nome: string; medidaMm?: Record<string, number> }[] }[];
  configuracoesValidas?: number;
  regras?: string[];
  quantidade?: { minima: number; maxima: number; multiplo: number; faixas: number[] };
  servicos?: { id: string; nome: string; preco: number; prazoDias: number | null }[];
  precos?: { referencia: boolean; observacao?: string; combinacoesComPreco?: number };
  prazo?: { producaoDiasUteis: number; estimado?: boolean; base?: string };
  disponivelSobConsulta?: string[];
  [key: string]: unknown;
};

export type NovoGrupo = ApiGrupo & { parametros: NovoParametros };

export type NovosFonte = {
  meta: {
    atualizadoEm: string;
    /** Multiplica todos os preços (1 = como está na fonte). Ajuste único para a Padrão revisar a tabela. */
    ajustePreco?: number;
  };
  categorias: ApiCategoria[];
  grupos: NovoGrupo[];
  produtos: ApiProduto[];
};

export type NovosQuery = Record<string, string | undefined>;

export const NOVOS_RANGES = { categoria: 900_000, grupo: [900_001, 999_999], produto: [9_000_001, 9_999_999] } as const;

/** Filtros de cada recurso (os mesmos da API da Padrão). */
export const NOVOS_FILTERS = {
  categorias: ["id", "categoria", "grupo"],
  grupos: ["id", "categoria", "grupo", "tag"],
  produtos: ["id_produto", "id_grupo", "id_categoria", "categoria", "grupo"],
} as const;

export type NovosRecurso = keyof typeof NOVOS_FILTERS;

const plain = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Igual por id, nome ou slug (sem acento, maiúscula ou pontuação). */
const matches = (filter: string | undefined, ...values: unknown[]) => {
  if (filter === undefined || filter === "") return true;
  const wanted = plain(filter);
  return values.some((value) => plain(value) === wanted);
};

const round2 = (value: number) => Math.round(value * 100) / 100;

function priced<T extends { preco: number } | ApiProduto>(item: T, factor: number): T {
  if (factor === 1) return item;
  if ("variacoes" in item) {
    const row = item as ApiProduto;
    return { ...row, preco: { economico: round2(row.preco.economico * factor), expresso: round2(row.preco.expresso * factor) } } as T;
  }
  return { ...item, preco: round2((item as { preco: number }).preco * factor) };
}

const factorOf = (fonte: NovosFonte) => (fonte.meta.ajustePreco && fonte.meta.ajustePreco > 0 ? fonte.meta.ajustePreco : 1);

export function novosCategorias(fonte: NovosFonte, query: NovosQuery = {}): ApiCategoria[] {
  const grupoFiltro = query.grupo;
  return fonte.categorias.filter((categoria) => {
    if (!matches(query.id, categoria.id) || !matches(query.categoria, categoria.nome, categoria.id)) return false;
    if (grupoFiltro) return fonte.grupos.some((g) => g.categoria === categoria.nome && matches(grupoFiltro, g.id, g.nome));
    return true;
  });
}

export function novosGrupos(fonte: NovosFonte, query: NovosQuery = {}): NovoGrupo[] {
  const factor = factorOf(fonte);
  return fonte.grupos
    .filter(
      (g) =>
        matches(query.id, g.id) &&
        matches(query.categoria, g.categoria, g.id_categoria) &&
        matches(query.grupo, g.nome, g.id) &&
        (!query.tag || g.tags.split(",").some((tag) => plain(tag) === plain(query.tag))),
    )
    .map((g) => priced(g, factor));
}

/** Número do começo do texto, com ponto de milhar ("1.000 unidades" → 1000). */
const leadingNumber = (value: string) => {
  const m = /^\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)(?![\d,x])/.exec(value);
  return m ? Number(m[1].replace(/[.\s]/g, "")) : null;
};

/** "250" acha "250 unidades" (e não "1.250"); "3x6,5" acha "3x6,5 cm (cantos retos)"; texto acha trecho. */
function optionMatches(have: string, want: string): boolean {
  if (plain(have) === plain(want)) return true;
  if (/^\s*[\d.]+\s*$/.test(want)) return leadingNumber(have) === Number(want.replace(/\./g, ""));
  return plain(have).startsWith(`${plain(want)} `) || plain(have).includes(plain(want));
}

/** Filtros extras de /produtos: qualquer outra chave filtra pelas opções da variação (?Formato=…&Quantidade=250). */
function optionFilters(query: NovosQuery): [string, string][] {
  const reserved = new Set<string>([...NOVOS_FILTERS.produtos, "token"]);
  return Object.entries(query).filter((entry): entry is [string, string] => !reserved.has(entry[0]) && typeof entry[1] === "string" && entry[1] !== "");
}

export function novosProdutos(fonte: NovosFonte, query: NovosQuery = {}): ApiProduto[] {
  const factor = factorOf(fonte);
  const byGroup = new Map(fonte.grupos.map((g) => [g.nome, g]));
  const options = optionFilters(query);
  return fonte.produtos
    .filter((row) => {
      const grupo = byGroup.get(row.grupo);
      if (!matches(query.id_produto, row.id) || !matches(query.id_grupo, grupo?.id) || !matches(query.id_categoria, grupo?.id_categoria)) return false;
      if (!matches(query.categoria, row.categoria) || !matches(query.grupo, row.grupo, grupo?.id)) return false;
      return options.every(([key, value]) => {
        const option = Object.entries(row.variacoes).find(([name]) => plain(name) === plain(key));
        return option !== undefined && optionMatches(option[1], value);
      });
    })
    .map((row) => priced(row, factor));
}

/** GET /api/novos: índice da API com todos os produtos e todos os parâmetros. */
export function novosIndice(fonte: NovosFonte, baseUrl: string) {
  const grupos = novosGrupos(fonte);
  return {
    api: "Padrão Color — produtos novos",
    versao: 1,
    atualizadoEm: fonte.meta.atualizadoEm,
    formato: "Mesmo formato da API da Padrão Color: /categorias, /grupos e /produtos, com os mesmos filtros. Sem registros: 204.",
    recursos: {
      categorias: { url: `${baseUrl}/categorias`, filtros: NOVOS_FILTERS.categorias },
      grupos: { url: `${baseUrl}/grupos`, filtros: NOVOS_FILTERS.grupos, extras: ["parametros: todos os atributos, valores, regras, quantidades, serviços e medidas"] },
      produtos: {
        url: `${baseUrl}/produtos`,
        filtros: NOVOS_FILTERS.produtos,
        extras: ["qualquer opção da variação como filtro, ex.: ?id_grupo=900001&Formato=3x6,5&Quantidade=250"],
      },
    },
    faixasDeId: NOVOS_RANGES,
    categorias: novosCategorias(fonte),
    grupos: grupos.map((g) => {
      const rows = fonte.produtos.filter((row) => row.grupo === g.nome);
      const opcoes: Record<string, string[]> = {};
      for (const row of rows) {
        for (const [key, value] of Object.entries(row.variacoes)) {
          opcoes[key] ??= [];
          if (value && !opcoes[key].includes(value)) opcoes[key].push(value);
        }
      }
      return {
        id: g.id,
        nome: g.nome,
        categoria: g.categoria,
        imagem: g.imagem,
        preco: g.preco,
        resumo: g.resumo,
        variacoes: rows.length,
        opcoes,
        parametros: g.parametros,
        produtos: `${baseUrl}/produtos?id_grupo=${g.id}`,
      };
    }),
  };
}

/** Recurso pedido no caminho (/api/novos/<recurso>); null = índice; undefined = não existe. */
export function novosRecurso(segments: string[] | undefined): NovosRecurso | null | undefined {
  if (!segments?.length) return null;
  if (segments.length > 1) return undefined;
  const name = segments[0].toLowerCase();
  return name in NOVOS_FILTERS ? (name as NovosRecurso) : undefined;
}
