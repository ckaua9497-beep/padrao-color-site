import type { CartItem } from "@/components/cart/CartProvider";
import { optionKeys } from "@/lib/pricing";
import { defaultConfig, measureLabel, selectionSummary, type ItemConfig, type PartyItem, type PricedItem, type PricedLine } from "@/lib/party";

/** Estado de um item na tela. Medidas ficam como texto: o campo aceita apagar e redigitar. */
export type ItemState = { qty: number; choice: string | null; width: string; height: string; sizes: string };

export function initialItemState(item: PartyItem): ItemState {
  const config = defaultConfig(item);
  return {
    qty: config.qty,
    choice: null,
    width: config.widthCm ? String(config.widthCm) : "",
    height: config.heightCm ? String(config.heightCm) : "",
    sizes: "",
  };
}

export function initialStates(items: PartyItem[]): Record<string, ItemState> {
  return Object.fromEntries(items.map((item) => [item.key, initialItemState(item)]));
}

/** "150", "1,5", " 90 " → cm (0 quando vazio ou inválido). */
export function parseCm(text: string): number {
  const value = Number(text.replace(",", ".").trim());
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function itemConfig(state: ItemState): ItemConfig {
  return { qty: state.qty, choice: state.choice, widthCm: parseCm(state.width), heightCm: parseCm(state.height) };
}

/** Valores das opções que variam no produto (o resumo curto da linha). */
export function lineDetails(item: PartyItem, line: PricedLine, size: PricedItem["size"]): string {
  const values = optionKeys(item.product.options)
    .filter((key) => item.product.options[key].length > 1 && line.selection[key])
    .map((key) => line.selection[key]);
  if (size && line.area) values.push(measureLabel(size));
  return values.join(" · ");
}

type CartContext = {
  /** Opções da festa ou do kit (Festa, Tema, Texto da arte…), depois das opções do produto. */
  options: Record<string, string>;
  artName: string;
  bundle: { id: string; name: string };
  /** Grade de tamanhos digitada (camisetas). */
  sizes?: string;
};

/** Itens do carrinho de um item da festa ou do kit: um por peça do conjunto, com a variação e a medida. */
export function cartLines(item: PartyItem, priced: PricedItem, context: CartContext): Omit<CartItem, "key">[] {
  const { product } = item;
  const sizes = context.sizes?.trim();
  return priced.lines.map((line) => ({
    slug: product.slug,
    name: product.name,
    image: product.image,
    preview: null,
    options: {
      ...Object.fromEntries(selectionSummary(product.options, line.selection)),
      ...(priced.size && line.area ? { Medida: measureLabel(priced.size) } : {}),
      ...(sizes ? { Tamanhos: sizes } : {}),
      ...context.options,
    },
    unitPrice: line.unitPrice,
    setQty: line.setQty,
    quantity: line.qty,
    leadDays: line.leadDays,
    artName: context.artName,
    groupId: product.groupId,
    variationId: line.variationId,
    ...(priced.size && line.area ? { widthCm: priced.size.widthCm, heightCm: priced.size.heightCm } : {}),
    bundle: context.bundle,
  }));
}
