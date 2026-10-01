"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { formatBRL, imageUrl, quantityLabel } from "@/lib/format";
import { useCart } from "./CartProvider";
import QtyStepper from "./QtyStepper";

export function CartThumb({ preview, image, name, className = "size-20" }: { preview: string | null; image: string; name: string; className?: string }) {
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-control bg-mist ${className}`}>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={`Mockup de ${name}`} className="size-full object-cover" />
      ) : (
        <Image src={imageUrl(image)} alt={name} fill sizes="80px" className="object-contain p-1" />
      )}
    </div>
  );
}

export default function CartDrawer() {
  const { items, open, setOpen, subtotal, remove, setQuantity } = useCart();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, setOpen]);

  return (
    <div className={`fixed inset-0 z-[100] ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        onClick={() => setOpen(false)}
        className={`absolute inset-0 bg-ink/60 transition-opacity duration-500 ${open ? "opacity-100" : "opacity-0"}`}
      />
      <aside
        role="dialog"
        aria-label="Carrinho"
        className={`absolute right-0 top-0 flex h-full w-full max-w-[460px] flex-col bg-white transition-transform duration-700 ease-drawer ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <header className="flex items-center justify-between border-b border-line px-6 py-5">
          <h2 className="text-xl font-bold">Carrinho</h2>
          <button type="button" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-full bg-mist transition-colors hover:bg-ink hover:text-white" aria-label="Fechar carrinho">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
            <p className="text-lg font-semibold">Seu carrinho está vazio.</p>
            <p className="text-sm text-muted">Escolha um produto, envie sua arte e veja em 3D antes de comprar.</p>
            <Link href="/produtos" onClick={() => setOpen(false)} className="rounded-full bg-coral px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-coral-600">
              Ver produtos
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-line overflow-y-auto px-6">
              {items.map((item) => (
                <li key={item.key} className="flex gap-4 py-5">
                  <CartThumb preview={item.preview} image={item.image} name={item.name} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/produto/${item.slug}`} onClick={() => setOpen(false)} className="line-clamp-2 text-sm font-semibold hover:text-coral">
                      {item.name}
                    </Link>
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{Object.values(item.options).join(" · ")}</p>
                    <p className="mt-1 text-xs text-muted">{item.artName ? `Arte: ${item.artName}` : "Arte: enviar depois"}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <QtyStepper size="sm" value={item.quantity} onChange={(v) => setQuantity(item.key, v)} />
                      <div className="text-right">
                        <p className="text-sm font-bold">{formatBRL(item.unitPrice * item.quantity)}</p>
                        <p className="text-[11px] text-muted">{quantityLabel(item.setQty)} cada</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => remove(item.key)} className="mt-2 text-xs font-medium text-muted underline-offset-2 hover:text-coral hover:underline">
                      Remover
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <footer className="space-y-3 border-t border-line px-6 py-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Subtotal</span>
                <span className="text-lg font-bold">{formatBRL(subtotal)}</span>
              </div>
              <Link href="/checkout" onClick={() => setOpen(false)} className="flex h-13 items-center justify-center rounded-control bg-coral text-base font-bold text-white transition-colors duration-300 hover:bg-coral-600">
                Finalizar compra
              </Link>
              <Link href="/carrinho" onClick={() => setOpen(false)} className="flex h-11 items-center justify-center rounded-control border border-line-strong text-sm font-semibold transition-colors hover:border-ink">
                Ver carrinho
              </Link>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
