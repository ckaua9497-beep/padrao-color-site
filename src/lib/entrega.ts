/*
 * Entrega do checkout, como no site antigo da Padrão (puro, testado):
 * - "Delivery Padrão": no endereço de entrega do cadastro, sempre pela rota dele (cliente.ts). Sem rota no cadastro, não
 *   existe. A taxa da rota entra no pedido como frete, a não ser com o pagamento na retirada liberado.
 * - "Retirada em uma das lojas Padrão Color": as 5 lojas próprias e os 2 pontos parceiros (Niterói e Serra-ES). Retirada
 *   nunca cobra frete. Ponto parceiro não recebe pagamento na retirada.
 * - "Frete por transportadora": no endereço do cadastro ou em outro, com a forma de entrega cotada na API de frete da
 *   Padrão (frete.ts / frete-pedido.ts). É a única forma de entregar fora do endereço do cadastro.
 * Lojas e pontos como no checkout do site antigo; os ids são os do site oficial (padraocolor.com.br/institucional/nossas-lojas,
 * 26/10/2026). No pedido vai o código da loja no sistema da Padrão (`codigo`): o exemplo de pedido aceito traz
 * `entrega: {id: "J", nome: "Loja São João"}`. Os códigos das outras lojas ainda não vieram (null: vai só o nome).
 */

export type LojaRetirada = {
  /** Id do site oficial (o checkout usa este). */
  id: number;
  /** Código da loja no sistema da Padrão, como vai em `entrega.id` do pedido; null enquanto a Padrão não informar. */
  codigo: string | null;
  nome: string;
  /** Rua, número e bairro. */
  rua: string;
  /** "São João de Meriti/RJ". */
  cidade: string;
  /** Ponto parceiro (não é loja da Padrão): sem pagamento na retirada. */
  parceira: boolean;
};

/** Na ordem, nos nomes e nos endereços do checkout do site antigo ("Selecione uma loja"). */
export const LOJAS_RETIRADA: readonly LojaRetirada[] = [
  { id: 3, codigo: "J", nome: "Loja São João", rua: "Rua Nicolau Cheven, 255 - Jardim Meriti", cidade: "São João de Meriti/RJ", parceira: false },
  { id: 6, codigo: null, nome: "Loja Niterói", rua: "Rua Visconde de Sepetiba, 294 - Centro", cidade: "Niterói/RJ", parceira: true },
  { id: 2, codigo: null, nome: "Loja Mesquita", rua: "Rua Zoé, 116 - Juscelino", cidade: "Mesquita/RJ", parceira: false },
  { id: 1, codigo: null, nome: "Loja Alcântara - RJ", rua: "Rua João Cesarino, 211 - Alcântara", cidade: "São Gonçalo/RJ", parceira: false },
  { id: 4, codigo: null, nome: "Loja São Pedro da Aldeia - RJ", rua: "Rua Marques da Cruz, 42 loja 02 - Centro", cidade: "São Pedro da Aldeia/RJ", parceira: false },
  { id: 5, codigo: null, nome: "Loja Juiz de Fora - MG", rua: "Avenida Barão do Rio Branco, 815 - Mariano Procópio", cidade: "Juiz de Fora/MG", parceira: false },
  { id: 7, codigo: null, nome: "Loja Serra - ES", rua: "Rua Nelcy Lopes Vieira, 6 - Jardim Limoeiro", cidade: "Serra/ES", parceira: true },
];

/** Loja que já vem marcada (a primeira, como no site antigo) e a de pedidos guardados antes das lojas: São João de Meriti. */
export const LOJA_PADRAO = 3;

export function lojaRetirada(id: unknown): LojaRetirada | null {
  return LOJAS_RETIRADA.find((loja) => loja.id === id) ?? null;
}

export type ModoEntrega = "rota" | "retirada" | "transportadora";

export const MODO_ENTREGA: Record<ModoEntrega, string> = {
  rota: "Delivery Padrão",
  retirada: "Retirada em uma das lojas Padrão Color",
  transportadora: "Frete por transportadora",
};

/**
 * Pagamento na retirada (ou na entrega pela rota): só para o cliente com a liberação no cadastro, no Delivery Padrão ou
 * numa loja própria. Ponto parceiro e transportadora, nunca.
 */
export function pagaNaRetiradaPermitido({ liberado, modo, loja }: { liberado: boolean; modo: ModoEntrega; loja?: number | null }): boolean {
  if (!liberado) return false;
  if (modo === "rota") return true;
  if (modo === "retirada") return lojaRetirada(loja ?? LOJA_PADRAO)?.parceira === false;
  return false;
}
