import { getProduct, getProductByGroupId } from "./catalog";
import type { PricedLine, ProductFacts } from "./orders";

/**
 * Do catálogo para o pedido: a foto do produto, a categoria do grupo, a embalagem da variação (package) e os tipos de
 * anexo que o grupo aceita na API (tipos_anexo), usados no tipoArquivo de cada arquivo da arte.
 */
export function productFacts(line: PricedLine): ProductFacts | null {
  const product = (line.input.slug ? getProduct(line.input.slug) : undefined) ?? getProductByGroupId(line.groupId);
  if (!product) return null;
  const variation = product.variations.find((v) => v.id === line.variation.id);
  return { image: product.image, categoryId: product.categoryId ?? null, packaging: variation?.em ?? null, attachments: product.attachments ?? [] };
}
