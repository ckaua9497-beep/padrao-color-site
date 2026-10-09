"use client";

import type { ProductSummary } from "@/lib/catalog";
import { useFromPrices } from "@/lib/customer";
import { formatBRL, quantityLabel } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Price } from "@/components/ui/Price";
import { cx } from "@/components/ui/cx";

/*
 * "A partir de" das vitrines com o preço do cliente: o catálogo (balcão) para todos e, com revendedor logado,
 * o menor preço da tabela de revenda dele (GET /api/precos/minimos, em lote para os cards da página).
 * Enquanto a tabela carrega, o preço do catálogo fica esmaecido.
 */

type Priced = Pick<ProductSummary, "groupId" | "price" | "priceQty" | "perM2">;

export function CardPrice({ product, className }: { product: Priced; className?: string }) {
  const from = useFromPrices([product.groupId])(product.groupId);
  const value = from?.p ?? product.price;
  const qty = from?.q ?? product.priceQty;
  return (
    <div aria-busy={from === undefined || undefined} className={cx("transition-opacity motion-reduce:transition-none", from === undefined && "opacity-50", className)}>
      <Price className="flex flex-col items-center" value={value} from unit={product.perM2 ? "por m²" : quantityLabel(qty)} />
    </div>
  );
}

/** Selo do card quando o preço mostrado é o da tabela de revenda. */
export function CardResellerBadge({ groupId }: { groupId?: number }) {
  const from = useFromPrices([groupId])(groupId);
  return from ? <Badge tone="new">Revenda</Badge> : null;
}

/** Menor preço de uma lista de produtos (banner da categoria), com a tabela do revendedor quando houver. */
export function FromPriceText({ products }: { products: Priced[] }) {
  const lookup = useFromPrices(products.map((product) => product.groupId));
  let min = Infinity;
  let loading = false;
  for (const product of products) {
    const from = lookup(product.groupId);
    if (from === undefined) loading = true;
    const value = from?.p ?? product.price;
    if (value > 0 && value < min) min = value;
  }
  if (!Number.isFinite(min)) return null;
  return <span className={cx("transition-opacity motion-reduce:transition-none", loading && "opacity-50")}>a partir de {formatBRL(min)}</span>;
}
