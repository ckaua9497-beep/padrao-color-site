import type { ApiPedidoItem, ApiSituacao } from "../api/types";
import type { ArtFileKind } from "../art-files";
import type { OrderItemInput } from "../orders";

/*
 * "Artes enviadas" em Meus pedidos (puro, testado). Por item da compra:
 * - o gabarito: a imagem da arte no gabarito que o site gera ao adicionar ao carrinho (só para o cliente ver);
 * - o que o cliente enviou: os arquivos que subiram no checkout e os reenvios de arte, guardados pelo site (repo.ts);
 * - o que a Padrão recebeu: produto.arquivos do GET /pedidos;
 * - a situação da arte, lida do texto da situação do item.
 */

export type ArquivoArte = { nome: string; url: string; tipo: string };

export type ArtesDoItem = {
  /** Variação (produto da API): casa com itens[].produto.id do GET /pedidos. */
  variacao: number | null;
  nome: string;
  /** Imagem da arte no gabarito. */
  gabarito: { nome: string; url: string } | null;
  enviados: ArquivoArte[];
};

/** Reenvio de arte pelo Meus pedidos (POST /reenviararte). */
export type Reenvio = { arquivo: ArquivoArte; em: string };

const TIPO: Record<ArtFileKind, string> = { pdf: "Arte no gabarito (PDF)", arquivo: "Arte enviada", verso: "Verso", extra: "Arquivo" };

/** O que guardar de cada item no fechamento, na ordem dos produtos do pedido (item sem arte fica vazio). */
export function artesDosItens(items: readonly Pick<OrderItemInput, "name" | "variationId" | "files" | "previa">[]): ArtesDoItem[] {
  return items.map((item) => ({
    variacao: item.variationId ?? null,
    nome: item.name,
    gabarito: item.previa ? { nome: item.previa.nome, url: item.previa.url } : null,
    enviados: (item.files ?? []).map((file) => ({ nome: file.nome, url: file.url, tipo: file.kind === "extra" && file.tipo ? file.tipo : TIPO[file.kind] })),
  }));
}

export const temArtes = (artes: ArtesDoItem) => Boolean(artes.gabarito || artes.enviados.length);

/**
 * Item do GET /pedidos → o que o site guardou dele: primeiro pela variação (produto.id), depois pela posição na compra
 * (a API devolve os itens na ordem em que foram enviados).
 */
export function casarItens(itens: readonly Pick<ApiPedidoItem, "pedido" | "produto">[], guardados: readonly ArtesDoItem[]): Map<number, ArtesDoItem> {
  const usados = new Set<number>();
  const casados = new Map<number, ArtesDoItem>();
  itens.forEach((item) => {
    const id = Number(item.produto?.id);
    const i = guardados.findIndex((g, index) => !usados.has(index) && g.variacao !== null && g.variacao === id);
    if (i < 0) return;
    usados.add(i);
    casados.set(item.pedido, guardados[i]);
  });
  itens.forEach((item, index) => {
    if (casados.has(item.pedido) || index >= guardados.length || usados.has(index)) return;
    // Pela posição só quando a variação não desmente (variação diferente = outro item).
    const g = guardados[index];
    if (g.variacao !== null && Number(item.produto?.id) && g.variacao !== Number(item.produto?.id)) return;
    usados.add(index);
    casados.set(item.pedido, g);
  });
  return casados;
}

export type EstadoArte = "aprovada" | "analise" | "recusada" | "cancelada";

/** Situação da arte pelo texto da situação do item (os códigos da API não são documentados). */
export function estadoDaArte(situacao: Partial<ApiSituacao> | undefined): { estado: EstadoArte; texto: string } {
  const text = `${situacao?.descricao ?? ""} ${situacao?.status ?? ""} ${situacao?.texto ?? ""}`.toLowerCase();
  if (/cancel/.test(text)) return { estado: "cancelada", texto: "Pedido cancelado" };
  if (situacao?.reenvia_arte === "Sim" || /recusad|reprovad|problema|pendente de arte|defeito/.test(text)) return { estado: "recusada", texto: "Arte recusada: reenvie o arquivo" };
  if (/aguard|an[aá]lise|confer|recebid/.test(text)) return { estado: "analise", texto: "Em análise pela pré-impressão" };
  if (/aprovad|produ[cç]|impress|acabamento|expedi|enviad|entregue|conclu|finaliz|retirad|separa/.test(text)) return { estado: "aprovada", texto: "Arte aprovada" };
  return { estado: "analise", texto: "Em análise pela pré-impressão" };
}

const isLink = (url: unknown): url is string => typeof url === "string" && /^https?:\/\//i.test(url);

/** Arquivos que a Padrão tem do item (produto.arquivos do GET /pedidos; formato não documentado). */
export function arquivosRecebidos(item: Pick<ApiPedidoItem, "produto">): ArquivoArte[] {
  const raw = Array.isArray(item.produto?.arquivos) ? item.produto.arquivos : [];
  return raw
    .filter((file): file is Record<string, unknown> => typeof file === "object" && file !== null)
    .map((file) => ({ nome: typeof file.nome === "string" && file.nome.trim() ? file.nome.trim() : "arquivo", url: isLink(file.url) ? file.url : "", tipo: typeof file.tipo === "string" ? file.tipo : "" }));
}
