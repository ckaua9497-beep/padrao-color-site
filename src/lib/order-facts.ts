import { getProduct, getProductByGroupId, type Product } from "./catalog";
import { customizacaoDa, recebeArte } from "./customizacao";
import type { PricedLine, ProductFacts } from "./orders";

/**
 * Do catálogo para o pedido: a foto do produto, a categoria do grupo, a embalagem da variação (package) e os tipos de
 * anexo que a variação aceita (customização da variação), usados no tipoArquivo de cada arquivo da arte. Variação sem
 * personalização ou neon de modelo pronto: o pedido vai sem anexos. `vivo`: o produto lido agora da API (o que deu o preço).
 */
export function productFacts(line: PricedLine, vivo?: Product): ProductFacts | null {
  // O produto que precificou a linha (catálogo em tempo real); sem ele, o do sync.
  const product = vivo ?? (line.input.slug ? getProduct(line.input.slug) : undefined) ?? getProductByGroupId(line.groupId);
  if (!product) return null;
  const variation = product.variations.find((v) => v.id === line.variation.id);
  const custom = customizacaoDa(product, variation);
  return { image: product.image, categoryId: product.categoryId ?? null, packaging: variation?.em ?? null, attachments: custom.anexos, semArquivo: !recebeArte(custom) };
}
