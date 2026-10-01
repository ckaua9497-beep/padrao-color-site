"use client";

import Link from "next/link";
import { IconClose } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import QtyStepper from "@/components/ui/QtyStepper";
import { formatBRL, quantityLabel } from "@/lib/format";
import { pixPrice } from "@/lib/pricing";
import { CartThumb, artLine } from "./CartThumb";
import { useCart } from "./CartProvider";

export default function CartPageView() {
  const { items, subtotal, remove, setQuantity } = useCart();

  if (items.length === 0) {
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
          {items.map((item) => (
            <li key={item.key} className="grid items-center gap-4 rounded-control bg-mist p-4 md:grid-cols-[1fr_120px_130px_120px_44px]">
              <div className="flex items-center gap-4">
                <CartThumb preview={item.preview} image={item.image} name={item.name} />
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
                </div>
              </div>
              <div className="text-sm tabular-nums">
                {formatBRL(item.unitPrice)}
                <span className="block text-[11px] text-muted">{quantityLabel(item.setQty)}</span>
              </div>
              <QtyStepper value={item.quantity} onChange={(v) => setQuantity(item.key, v)} label={`Quantidade de ${item.name}`} />
              <p className="text-[15px] font-bold tabular-nums">{formatBRL(item.unitPrice * item.quantity)}</p>
              <IconButton label={`Remover ${item.name}`} variant="ghost" onClick={() => remove(item.key)} className="hover:bg-white">
                <IconClose className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      </div>

      <aside className="h-fit rounded-card border border-line-strong bg-white p-3">
        <dl className="overflow-hidden rounded-control text-[15px] tabular-nums">
          <div className="grid grid-cols-[110px_1fr] gap-4 bg-mist px-4 py-4">
            <dt className="text-muted">Subtotal</dt>
            <dd>{formatBRL(subtotal)}</dd>
          </div>
          <div className="grid grid-cols-[110px_1fr] gap-4 bg-fog px-4 py-4">
            <dt className="text-muted">Entrega</dt>
            <dd>Calculada na finalização da compra, pelo CEP.</dd>
          </div>
          <div className="grid grid-cols-[110px_1fr] gap-4 bg-mist px-4 py-4">
            <dt className="text-muted">Total</dt>
            <dd>
              <span className="text-lg font-bold">{formatBRL(subtotal)}</span>
              <span className="block text-caption font-semibold text-price-sm">{formatBRL(pixPrice(subtotal))} no PIX</span>
            </dd>
          </div>
        </dl>
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
