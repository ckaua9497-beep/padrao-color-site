"use client";

import Link from "next/link";
import { useCallback, type ReactNode } from "react";
import { IconClose } from "@/components/icons";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { IconButton } from "@/components/ui/IconButton";
import QtyStepper from "@/components/ui/QtyStepper";
import { cx } from "@/components/ui/cx";
import { formatBRL } from "@/lib/format";
import { pixPrice } from "@/lib/pricing";
import { CartThumb, artLine } from "./CartThumb";
import { itemFacts, unitLabel, useCart, type CartGroup, type CartItem, type CartLine, type QuantityRange } from "./CartProvider";
import { PrintFileLink } from "@/components/product/gabarito/PrintFileLink";

export { CartThumb } from "./CartThumb";

/** Selos do item: preço de revendedor, prazo expresso, kit/festa (fora do grupo) e medida sem opção "Medida". */
export function ItemTags({ line, hideBundle = false, className }: { line: CartLine; hideBundle?: boolean; className?: string }) {
  const facts = itemFacts(line.item);
  const bundle = hideBundle ? null : facts.bundle;
  if (!line.reseller && !facts.size && !facts.express && !bundle) return null;
  return (
    <div className={cx("flex flex-wrap items-center gap-1.5", className)}>
      {line.reseller && <Badge tone="new">Preço de revendedor</Badge>}
      {facts.express && <Badge tone="dark">Expresso</Badge>}
      {bundle && <Badge tone="neutral">{bundle}</Badge>}
      {facts.size && <span className="text-caption text-muted">Medida: {facts.size}</span>}
    </div>
  );
}

/** Aviso de que os preços estão na tabela de revenda (ou ainda carregando). */
export function ResellerNote({ reseller, pricing, className }: { reseller: boolean; pricing: boolean; className?: string }) {
  if (pricing) {
    return (
      <p role="status" className={cx("text-caption text-muted", className)}>
        Atualizando os preços para a sua conta…
      </p>
    );
  }
  if (!reseller) return null;
  return <p className={cx("rounded-thumb bg-blue-50 px-3 py-2 text-caption font-semibold text-preview", className)}>Você está comprando com preço de revendedor.</p>;
}

/** Quantidade do item: stepper com os limites do produto; grade de tamanhos só muda na página do produto. */
export function QuantityControl({ item, range, onChange, size = "md" }: { item: CartItem; range: QuantityRange; onChange: (value: number) => void; size?: "sm" | "md" }) {
  if (range.locked) {
    return (
      <p className="text-caption">
        <span className="font-semibold">
          {item.quantity.toLocaleString("pt-BR")} {item.quantity === 1 ? "peça" : "peças"}
        </span>
        <Link href={`/produto/${item.slug}`} className="block text-muted underline underline-offset-2 hover:text-ink">
          mudar tamanhos no produto
        </Link>
      </p>
    );
  }
  return <QtyStepper size={size} value={item.quantity} min={range.min} max={range.max} onChange={onChange} label={`Quantidade de ${item.name}`} />;
}

/** Cabeçalho do kit/festa no carrinho, com o total do grupo e "Remover tudo". */
export function BundleHeader({ group, onRemove, className }: { group: CartGroup; onRemove: () => void; className?: string }) {
  return (
    <div className={cx("flex flex-wrap items-center justify-between gap-2", className)}>
      <div className="min-w-0">
        <p className="font-bold">{group.title}</p>
        <p className="text-caption text-muted tabular-nums">
          {group.lines.length} {group.lines.length === 1 ? "item" : "itens"} · {formatBRL(group.total)}
        </p>
      </div>
      <Button variant="link" size="sm" className="text-caption font-semibold" onClick={onRemove}>
        Remover tudo <span className="sr-only">do grupo {group.title}</span>
      </Button>
    </div>
  );
}

function DrawerLine({ line, grouped, onNavigate }: { line: CartLine; grouped: boolean; onNavigate: () => void }) {
  const { remove, setQuantity, rangeOf } = useCart();
  const { item } = line;
  return (
    <div className="flex gap-4">
      <CartThumb preview={item.preview} image={item.image} name={item.name} options={item.options} />
      <div className="min-w-0 flex-1">
        <Link href={`/produto/${item.slug}`} onClick={onNavigate} className="line-clamp-2 text-sm font-semibold hover:underline">
          {item.name}
        </Link>
        <p className="mt-1 line-clamp-2 text-caption text-muted">{Object.values(item.options).join(" · ")}</p>
        <p className="mt-1 text-caption text-muted">{artLine(item.artName)}</p>
        {item.printFile && <PrintFileLink file={item.printFile} className="mt-0.5" />}
        <ItemTags line={line} hideBundle={grouped} className="mt-2" />
        <div className="mt-3 flex items-center justify-between gap-2">
          <QuantityControl item={item} range={rangeOf(item)} size="sm" onChange={(value) => setQuantity(item.key, value)} />
          <div className={cx("text-right tabular-nums", line.pending && "opacity-60")}>
            <p className="text-sm font-bold">{formatBRL(line.total)}</p>
            <p className="text-[11px] text-muted">
              {formatBRL(line.unitPrice)} {unitLabel(item)}
            </p>
          </div>
        </div>
        <Button variant="link" size="sm" className="mt-2 min-h-6 text-caption font-semibold" onClick={() => remove(item.key)}>
          Remover <span className="sr-only">{item.name}</span>
        </Button>
      </div>
    </div>
  );
}

function GroupBox({ group, children, onRemove }: { group: CartGroup; children: ReactNode; onRemove: () => void }) {
  return (
    <section aria-label={group.title ?? undefined} className="rounded-control border border-line">
      <BundleHeader group={group} onRemove={onRemove} className="rounded-t-control bg-mist px-4 py-3" />
      <ul className="divide-y divide-line px-4">{children}</ul>
    </section>
  );
}

export default function CartDrawer() {
  const { lines, groups, open, setOpen, subtotal, reseller, pricing, removeBundle } = useCart();
  const close = useCallback(() => setOpen(false), [setOpen]);

  return (
    <Drawer open={open} onClose={close} label="Carrinho" width="w-[460px]">
      <header className="flex items-center justify-between border-b border-line px-6 py-5">
        <h2 className="text-xl font-bold">Carrinho</h2>
        <IconButton label="Fechar carrinho" variant="ghost" size="sm" onClick={close} className="bg-mist hover:bg-ink hover:text-white">
          <IconClose className="size-4" />
        </IconButton>
      </header>

      {lines.length === 0 ? (
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
            {groups.map((group) => (
              <li key={group.id} className="py-5">
                {group.bundle ? (
                  <GroupBox group={group} onRemove={() => removeBundle(group.bundle?.id ?? "")}>
                    {group.lines.map((line) => (
                      <li key={line.item.key} className="py-4">
                        <DrawerLine line={line} grouped onNavigate={close} />
                      </li>
                    ))}
                  </GroupBox>
                ) : (
                  <DrawerLine line={group.lines[0]} grouped={false} onNavigate={close} />
                )}
              </li>
            ))}
          </ul>
          <footer className="space-y-3 border-t border-line px-6 py-5">
            <ResellerNote reseller={reseller} pricing={pricing} />
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
