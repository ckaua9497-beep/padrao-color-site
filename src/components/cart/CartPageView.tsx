"use client";

import Link from "next/link";
import { formatBRL, quantityLabel } from "@/lib/format";
import { CartThumb } from "./CartDrawer";
import { useCart } from "./CartProvider";
import QtyStepper from "@/components/ui/QtyStepper";

export default function CartPageView() {
  const { items, subtotal, remove, setQuantity } = useCart();

  if (items.length === 0) {
    return (
      <div className="rounded-card border border-line-strong bg-white p-12 text-center">
        <p className="text-xl font-semibold">Seu carrinho está vazio.</p>
        <Link href="/produtos" className="mt-6 inline-flex h-12 items-center rounded-full bg-coral px-8 font-bold text-white hover:bg-coral-600">
          Ver produtos
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <div className="rounded-card border border-line-strong bg-white p-4">
        <div className="hidden grid-cols-[1fr_120px_130px_120px_40px] gap-4 px-4 pb-3 pt-2 text-[13px] font-semibold text-muted md:grid">
          <span>Produto</span>
          <span>Preço</span>
          <span>Quantidade</span>
          <span>Subtotal</span>
          <span />
        </div>
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.key} className="grid items-center gap-4 rounded-control bg-mist p-4 md:grid-cols-[1fr_120px_130px_120px_40px]">
              <div className="flex items-center gap-4">
                <CartThumb preview={item.preview} image={item.image} name={item.name} />
                <div className="min-w-0">
                  <Link href={`/produto/${item.slug}`} className="line-clamp-2 text-[15px] font-semibold hover:text-coral">
                    {item.name}
                  </Link>
                  <p className="mt-1 text-[12px] text-muted">{Object.entries(item.options).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
                  <p className="mt-1 text-[12px] font-medium">{item.artName ? `Arte: ${item.artName}` : "Arte: enviar depois"}</p>
                </div>
              </div>
              <div className="text-[14px]">
                {formatBRL(item.unitPrice)}
                <span className="block text-[11px] text-muted">{quantityLabel(item.setQty)}</span>
              </div>
              <QtyStepper value={item.quantity} onChange={(v) => setQuantity(item.key, v)} />
              <p className="text-[15px] font-bold">{formatBRL(item.unitPrice * item.quantity)}</p>
              <button type="button" onClick={() => remove(item.key)} aria-label={`Remover ${item.name}`} className="grid size-8 place-items-center rounded-full text-xl text-ink/60 hover:bg-white hover:text-coral">
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>

      <aside className="h-fit rounded-card border border-line-strong bg-white p-3">
        <dl className="overflow-hidden rounded-control text-[15px]">
          <div className="grid grid-cols-[110px_1fr] gap-4 bg-mist px-4 py-4">
            <dt className="text-muted">Subtotal</dt>
            <dd>{formatBRL(subtotal)}</dd>
          </div>
          <div className="grid grid-cols-[110px_1fr] gap-4 bg-fog/60 px-4 py-4">
            <dt className="text-muted">Entrega</dt>
            <dd>Calculada na finalização da compra, pelo CEP.</dd>
          </div>
          <div className="grid grid-cols-[110px_1fr] gap-4 bg-mist px-4 py-4">
            <dt className="text-muted">Total</dt>
            <dd className="text-lg font-bold">{formatBRL(subtotal)}</dd>
          </div>
        </dl>
        <Link href="/checkout" className="mt-3 flex h-15 items-center justify-center rounded-control bg-coral text-xl font-bold text-white transition-colors hover:bg-coral-600">
          Continuar
        </Link>
        <Link href="/produtos" className="mt-2 flex h-11 items-center justify-center rounded-control border border-line-strong text-[15px] font-medium hover:border-ink">
          Continuar comprando
        </Link>
      </aside>
    </div>
  );
}
