import "server-only";

import { produtoDoGrupo } from "./catalogo-vivo";
import { embalagemDe, nomeFrete, pacotesDoPedido, prazoFrete, type OpcaoFrete } from "./frete";
import { cotarFretePadrao, freteApi } from "./frete-api";

/*
 * "Frete por transportadora" do checkout (entrega.ts): cotação do carrinho na API de frete da Padrão, com a embalagem
 * cadastrada de cada variação (do catálogo, nunca a que vem do navegador). A mesma conta vale na tela (/api/pedidos/frete)
 * e no fechamento do pedido (fila-pedidos/processar.ts), que cota de novo e cobra o serviço escolhido.
 * - "combinar": sem a chave da API de frete, ou com item sem medida de envio cadastrada: o atendimento combina o frete.
 * - "falha": a API de frete não respondeu.
 */

export type ItemFrete = { groupId?: number; variationId?: number; quantity: number };

export type OpcaoEntrega = OpcaoFrete & { titulo: string; prazoTexto: string };

export type CotacaoEntrega = { tipo: "opcoes"; opcoes: OpcaoEntrega[] } | { tipo: "combinar"; motivo: "desligado" | "sem-medida" } | { tipo: "falha" };

export async function cotarEntrega(cep: string, itens: readonly ItemFrete[]): Promise<CotacaoEntrega> {
  const api = freteApi();
  if (!api) return { tipo: "combinar", motivo: "desligado" };
  const caixas = [];
  for (const item of itens) {
    const product = item.groupId ? await produtoDoGrupo(item.groupId) : undefined;
    const found = product ? embalagemDe(product.variations, item.variationId ?? null) : null;
    if (!found) return { tipo: "combinar", motivo: "sem-medida" };
    caixas.push({ id: String(item.variationId ?? item.groupId), lotes: Math.max(1, item.quantity), embalagem: found.embalagem });
  }
  const res = await cotarFretePadrao(api, cep.replace(/\D/g, ""), pacotesDoPedido(caixas));
  if (!res.ok) return { tipo: "falha" };
  return { tipo: "opcoes", opcoes: res.opcoes.map((o) => ({ ...o, titulo: nomeFrete(o), prazoTexto: prazoFrete(o) })) };
}
