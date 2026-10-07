"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

export type CartItem = {
  key: string;
  slug: string;
  name: string;
  image: string;
  preview: string | null;
  options: Record<string, string>;
  unitPrice: number;
  setQty: number;
  quantity: number;
  leadDays: number | null;
  artName: string | null;
  /*
   * Campos para gerar o pedido na API (POST /gerarpedido). Opcionais: carrinhos salvos antes deles
   * continuam válidos.
   */
  /** Grupo da API (a página de produto). */
  groupId?: number;
  /** Produto da API (a variação escolhida). */
  variationId?: number;
  /** Medida livre, em cm (produtos por m²). */
  widthCm?: number;
  heightCm?: number;
  /** Prazo expresso escolhido (o econômico é o padrão). */
  express?: boolean;
  /** Kit ou festa que adicionou o item (Monte Seu Kit / Crie Sua Festa). */
  bundle?: { id: string; name: string } | null;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotal: number;
  open: boolean;
  setOpen: (open: boolean) => void;
  add: (item: Omit<CartItem, "key">) => void;
  remove: (key: string) => void;
  setQuantity: (key: string, quantity: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "padrao-color-cart";
const EMPTY: CartItem[] = [];

let cache: CartItem[] | null = null;
const listeners = new Set<() => void>();

function read(): CartItem[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as CartItem[];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: CartItem[]) {
  cache = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Cota cheia: tenta de novo sem as miniaturas. Se ainda falhar, o carrinho segue só na memória.
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.map((item) => ({ ...item, preview: null }))));
    } catch {
      /* armazenamento indisponível */
    }
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const items = useSyncExternalStore(subscribe, read, () => EMPTY);
  const [open, setOpen] = useState(false);

  const add = useCallback((item: Omit<CartItem, "key">) => {
    write([...read(), { ...item, key: crypto.randomUUID() }]);
    setOpen(true);
  }, []);

  const remove = useCallback((key: string) => write(read().filter((item) => item.key !== key)), []);

  const setQuantity = useCallback(
    (key: string, quantity: number) => write(read().map((item) => (item.key === key ? { ...item, quantity: Math.max(1, Math.min(99, quantity)) } : item))),
    [],
  );

  const clear = useCallback(() => write([]), []);

  const value = useMemo(() => {
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    return { items, count, subtotal, open, setOpen, add, remove, setQuantity, clear };
  }, [items, open, add, remove, setQuantity, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart precisa estar dentro de CartProvider");
  return ctx;
}
