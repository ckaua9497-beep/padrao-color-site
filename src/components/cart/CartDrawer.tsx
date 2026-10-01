"use client";

import Link from "next/link";
import { useCallback } from "react";
import { IconClose } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { IconButton } from "@/components/ui/IconButton";
import QtyStepper from "@/components/ui/QtyStepper";
import { formatBRL, quantityLabel } from "@/lib/format";
import { pixPrice } from "@/lib/pricing";
import { CartThumb, artLine } from "./CartThumb";
import { useCart } from "./CartProvider";

export { CartThumb } from "./CartThumb";

export default function CartDrawer() {
  const { items, open, setOpen, subtotal, remove, setQuantity } = useCart();
  const close = useCallback(() => setOpen(false), [setOpen]);

  return (
    <Drawer open={open} onClose={close} label="Carrinho" width="w-[460px]">
      <header className="flex items-center justify-between border-b border-line px-6 py-5">
        <h2 className="text-xl font-bold">Carrinho</h2>
        <IconButton label="Fechar carrinho" variant="ghost" size="sm" onClick={close} className="bg-mist hover:bg-ink hover:text-white">
          <IconClose className="size-4" />
        </IconButton>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-lg font-semibold">Seu carrinho está vazio.</p>
          <p className="text-sm text-muted">Escolha um produto, escreva o texto ou envie sua arte e veja em 3D antes de comprar.</p>
          <Button href="/produtos" variant="buy" size="md" onClick={close}>
            Ver produtos
          </Button>
        </div>
      ) : (
        <>
          <ul className="flex-1 divide-y divide-line overflow-y-auto px-6">
            {items.map((item) => (
              <li key={item.key} className="flex gap-4 py-5">
                <CartThumb preview={item.preview} image={item.image} name={item.name} />
                <div className="min-w-0 flex-1">
                  <Link href={`/produto/${item.slug}`} onClick={close} className="line-clamp-2 text-sm font-semibold hover:underline">
                    {item.name}
                  </Link>
                  <p className="mt-1 line-clamp-2 text-caption text-muted">{Object.values(item.options).join(" · ")}</p>
                  <p className="mt-1 text-caption text-muted">{artLine(item.artName)}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <QtyStepper size="sm" value={item.quantity} onChange={(v) => setQuantity(item.key, v)} label={`Quantidade de ${item.name}`} />
                    <div className="text-right tabular-nums">
                      <p className="text-sm font-bold">{formatBRL(item.unitPrice * item.quantity)}</p>
                      <p className="text-[11px] text-muted">{quantityLabel(item.setQty)} cada</p>
                    </div>
                  </div>
                  <Button variant="link" size="sm" className="mt-2 min-h-6 text-caption font-semibold" onClick={() => remove(item.key)}>
                    Remover <span className="sr-only">{item.name}</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <footer className="space-y-3 border-t border-line px-6 py-5">
            <div className="flex items-baseline justify-between text-sm tabular-nums">
              <span className="text-muted">Subtotal</span>
              <span className="text-lg font-bold">{formatBRL(subtotal)}</span>
            </div>
            <p className="-mt-2 text-right text-caption font-semibold text-price-sm">{formatBRL(pixPrice(subtotal))} no PIX</p>
            <Button href="/checkout" variant="buy" size="md" block onClick={close}>
              Finalizar compra
            </Button>
            <Button href="/carrinho" variant="outline" size="sm" block onClick={close}>
              Ver carrinho
            </Button>
          </footer>
        </>
      )}
    </Drawer>
  );
}
