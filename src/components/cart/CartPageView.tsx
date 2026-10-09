"use client";

import Link from "next/link";
import { IconClose } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { cx } from "@/components/ui/cx";
import { useCustomer } from "@/lib/customer";
import { formatBRL } from "@/lib/format";
import { pixPrice } from "@/lib/pricing";
import { BundleHeader, ItemTags, QuantityControl, ResellerNote } from "./CartDrawer";
import { CartThumb, artLine } from "./CartThumb";
import { unitLabel, useCart, type CartLine } from "./CartProvider";
import { PrintFileLink } from "@/components/product/gabarito/PrintFileLink";

const ROW = "grid items-center gap-4 rounded-control bg-mist p-4 md:grid-cols-[1fr_120px_130px_120px_44px]";

function LineRow({ line, grouped }: { line: CartLine; grouped: boolean }) {
  const { remove, setQuantity, rangeOf } = useCart();
  const { item } = line;
  return (
    <div className={ROW}>
      <div className="flex items-center gap-4">
        <CartThumb preview={item.preview} image={item.image} name={item.name} options={item.options} />
        <div className="min-w-0">
          <Link href={`/produto/${item.slug}`} className="line-clamp-2 text-[15px] font-semibold hover:underline">
            {item.name}
          </Link>
          <p className="mt-1 text-caption text-muted">
            {Object.entries(item.options)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")}
          </p>
          <p className="mt-1 text-caption font-medium">{artLine(item.artName)}</p>
          {item.printFile && <PrintFileLink file={item.printFile} className="mt-0.5" />}
          <ItemTags line={line} hideBundle={grouped} className="mt-2" />
        </div>
      </div>
      <div className={cx("text-sm tabular-nums", line.pending && "opacity-60")}>
        {formatBRL(line.unitPrice)}
        <span className="block text-[11px] text-muted">{unitLabel(item)}</span>
      </div>
      <QuantityControl item={item} range={rangeOf(item)} onChange={(value) => setQuantity(item.key, value)} />
      <p className={cx("text-[15px] font-bold tabular-nums", line.pending && "opacity-60")}>{formatBRL(line.total)}</p>
      <IconButton label={`Remover ${item.name}`} variant="ghost" onClick={() => remove(item.key)} className="hover:bg-white">
        <IconClose className="size-4" />
      </IconButton>
    </div>
  );
}

const DELIVERY_NOTE = "Entrega no seu endereço ou retirada na loja: o frete é combinado depois do pedido.";

/**
 * `resellerHint`: convite ao revendedor da Padrão para entrar na conta (fica de fora nas lojas da multiloja).
 * `deliveryNote`: como o frete é cobrado (as lojas da multiloja cotam no checkout).
 */
export default function CartPageView({ resellerHint = true, deliveryNote = DELIVERY_NOTE }: { resellerHint?: boolean; deliveryNote?: string } = {}) {
  const { lines, groups, subtotal, reseller, pricing, removeBundle } = useCart();
  const customer = useCustomer();

  if (lines.length === 0) {
    return (
      <div className="rounded-card border border-line-strong bg-white p-12 text-center">
        <p className="text-xl font-semibold">Seu carrinho está vazio.</p>
        <Button href="/produtos" variant="buy" size="md" className="mt-6">
          Ver produtos
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <div className="rounded-card border border-line-strong bg-white p-4">
        <div aria-hidden className="hidden grid-cols-[1fr_120px_130px_120px_44px] gap-4 px-4 pb-3 pt-2 text-caption font-semibold text-muted md:grid">
          <span>Produto</span>
          <span>Preço</span>
          <span>Quantidade</span>
          <span>Subtotal</span>
          <span />
        </div>
        <ul className="space-y-2">
          {groups.map((group) =>
            group.bundle ? (
              <li key={group.id}>
                <section aria-label={group.title ?? undefined} className="rounded-control border border-line p-2">
                  <BundleHeader group={group} onRemove={() => removeBundle(group.bundle?.id ?? "")} className="px-2 pb-3 pt-1" />
                  <ul className="space-y-2">
                    {group.lines.map((line) => (
                      <li key={line.item.key}>
                        <LineRow line={line} grouped />
                      </li>
                    ))}
                  </ul>
                </section>
              </li>
            ) : (
              <li key={group.id}>
                <LineRow line={group.lines[0]} grouped={false} />
              </li>
            ),
          )}
        </ul>
      </div>

      <aside className="h-fit rounded-card border border-line-strong bg-white p-3">
        <ResellerNote reseller={reseller} pricing={pricing} className="mb-3" />
        <dl className="overflow-hidden rounded-control text-[15px] tabular-nums">
          <div className="grid grid-cols-[110px_1fr] gap-4 bg-mist px-4 py-4">
            <dt className="text-muted">Subtotal</dt>
            <dd>{formatBRL(subtotal)}</dd>
          </div>
          <div className="grid grid-cols-[110px_1fr] gap-4 bg-fog px-4 py-4">
            <dt className="text-muted">Entrega</dt>
            <dd>{deliveryNote}</dd>
          </div>
          <div className="grid grid-cols-[110px_1fr] gap-4 bg-mist px-4 py-4">
            <dt className="text-muted">Total</dt>
            <dd>
              <span className="text-lg font-bold">{formatBRL(subtotal)}</span>
              <span className="block text-caption font-semibold text-price-sm">{formatBRL(pixPrice(subtotal))} no PIX</span>
            </dd>
          </div>
        </dl>
        {resellerHint && customer.status === "anonymous" && (
          <p className="mt-3 px-1 text-caption text-muted">
            É revendedor?{" "}
            <Link href="/conta/entrar?volta=/carrinho" className="font-semibold text-ink underline underline-offset-2">
              Entre na sua conta
            </Link>{" "}
            para ver os preços da sua tabela.
          </p>
        )}
        <Button href="/checkout" variant="buy" size="lg" block className="mt-3">
          Continuar
        </Button>
        <Button href="/produtos" variant="outline" size="sm" block className="mt-2">
          Continuar comprando
        </Button>
      </aside>
    </div>
  );
}
