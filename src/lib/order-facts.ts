import { getProduct, getProductByGroupId } from "./catalog";
import { customizacaoDa, recebeArte } from "./customizacao";
import type { PricedLine, ProductFacts } from "./orders";

/**
 * Do catálogo para o pedido: a foto do produto, a categoria do grupo, a embalagem da variação (package) e os tipos de
 * anexo que a variação aceita (customização da variação), usados no tipoArquivo de cada arquivo da arte. Variação sem
 * personalização ou neon de modelo pronto: o pedido vai sem anexos.
 */
export function productFacts(line: PricedLine): ProductFacts | null {
  const product = (line.input.slug ? getProduct(line.input.slug) : undefined) ?? getProductByGroupId(line.groupId);
  if (!product) return null;
  const variation = product.variations.find((v) => v.id === line.variation.id);
  const custom = customizacaoDa(product, variation);
  return { image: product.image, categoryId: product.categoryId ?? null, packaging: variation?.em ?? null, attachments: custom.anexos, semArquivo: !recebeArte(custom) };
}
