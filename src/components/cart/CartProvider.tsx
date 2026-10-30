"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { ArtFileKind, UploadedArtFile } from "@/lib/art-files";
import type { AcabamentoEscolhido } from "@/lib/acabamentos";
import { currentCustomer, customerVariations, useCustomer, useGroupPrices } from "@/lib/customer";
import { quantityLabel } from "@/lib/format";
import { bundleTitle, isLineError, priceLine, type OrderItemInput } from "@/lib/orders";
import type { AceiteTermos } from "@/lib/termos-arte";
import { prunePrintFilesExcept } from "@/components/product/gabarito/print-store";
import { track } from "@/lib/tracking";

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
  /** Tabela do preço salvo (carimbada ao adicionar): item de revenda é recalculado se a conta mudar. */
  priceTier?: "balcao" | "revenda";
  /** Arte encaixada no gabarito oficial (PDF no tamanho real), guardada no navegador (IndexedDB) por id. */
  printFile?: { id: string; name: string } | null;
  /** Arquivos da arte que o cliente enviou (frente e verso), guardados no navegador (IndexedDB) por id. */
  artFiles?: CartArtFile[] | null;
  /**
   * Imagem da arte no gabarito (IndexedDB, por id): sobe no checkout só para as "Artes enviadas" de Meus pedidos, sem ir
   * para a produção.
   */
  previa?: { id: string; name: string } | null;
  /** Arquivos que já subiram para o Bunny no checkout (id do IndexedDB → URL pública): não sobem de novo. */
  uploaded?: Record<string, { url: string; nome: string }>;
  /** Acabamentos extras escolhidos; o preço é recalculado pelo catálogo (no carrinho e no servidor). */
  acabamentos?: AcabamentoEscolhido[];
  /** Preço dos acabamentos ao adicionar: só vale enquanto o preço do cliente não chega. */
  acabamentosPreco?: number;
  /** Aceite dos termos de envio de arte dado na página do produto (sem ele, o checkout pede). */
  termosArte?: AceiteTermos | null;
  /** Criação de arte pela equipe da Padrão; o preço é recalculado pelo catálogo (no carrinho e no servidor). */
  criacaoArte?: boolean;
  /** Preço da criação ao adicionar: só vale enquanto o preço do cliente não chega. */
  criacaoPreco?: number;
};

export type CartArtFile = { id: string; name: string; kind: Exclude<ArtFileKind, "pdf">; /** Tipo de anexo do complementar ("Faca de Corte"…). */ tipo?: string };

/** Item com o preço do cliente de agora (balcão ou revenda), que pode diferir do salvo ao adicionar. */
export type CartLine = {
  item: CartItem;
  /** Preço de um lote (setQty unidades; no m², uma peça). */
  unitPrice: number;
  total: number;
  /** Preço da tabela de revenda (com o desconto da categoria, quando houver). */
  reseller: boolean;
  /** Buscando o preço do cliente: mostra o preço salvo até chegar. */
  pending: boolean;
};

/** Itens do mesmo kit/festa ficam juntos; item avulso é um grupo sem título. */
export type CartGroup = { id: string; bundle: { id: string; name: string } | null; title: string | null; lines: CartLine[]; total: number };

/** Faixa de quantidade do item no carrinho; `locked` = grade de tamanhos (muda na página do produto). */
export type QuantityRange = { min: number; max: number; locked: boolean };

type CartContextValue = {
  items: CartItem[];
  /** Itens com o preço do cliente logado. */
  lines: CartLine[];
  /** Linhas agrupadas por kit/festa, na ordem do carrinho. */
  groups: CartGroup[];
  count: number;
  /** Soma das linhas no preço do cliente. */
  subtotal: number;
  /** Revendedor logado: o carrinho está na tabela de revenda. */
  reseller: boolean;
  /** Algum preço ainda carregando. */
  pricing: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  add: (item: Omit<CartItem, "key">) => void;
  remove: (key: string) => void;
  /** Remove todos os itens de um kit/festa. */
  removeBundle: (bundleId: string) => void;
  setQuantity: (key: string, quantity: number) => void;
  /** Mínimo/máximo da quantidade do item (limites do produto no catálogo). */
  rangeOf: (item: CartItem) => QuantityRange;
  /** Guarda as URLs dos arquivos que subiram para o Bunny (id do IndexedDB → URL) nos itens que usam cada um. */
  setUploaded: (files: Record<string, { url: string; nome: string }>) => void;
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

/** Arquivos do item que vão para o Bunny no checkout: o PDF no gabarito e os enviados pelo cliente. */
export function itemArtFiles(item: Pick<CartItem, "printFile" | "artFiles">): { id: string; name: string; kind: ArtFileKind; tipo?: string }[] {
  return [...(item.printFile ? [{ id: item.printFile.id, name: item.printFile.name, kind: "pdf" as const }] : []), ...(item.artFiles ?? [])];
}

/** Tudo o que o item guarda no navegador e sobe no checkout: os arquivos da arte e a imagem no gabarito. */
export function itemStoredFiles(item: Pick<CartItem, "printFile" | "artFiles" | "previa">): { id: string; name: string }[] {
  return [...itemArtFiles(item), ...(item.previa ? [item.previa] : [])];
}

/** Ids dos arquivos guardados das linhas do carrinho (PDF no gabarito, arquivos enviados e prévia; o resto sai do IndexedDB). */
function printFileIds(list: CartItem[]): string[] {
  return list.flatMap((item) => itemStoredFiles(item).map((file) => file.id));
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

// ---------------------------------------------------------------------------------- limites de quantidade

/** Limites do produto e, quando a variação tem faixa própria ("De 11 até 100"), os dela (id → [mín., máx.]). */
type QtyLimits = { minQty: number; maxQty: number; variations?: Record<string, [number, number]> };

const NO_LIMITS: ReadonlyMap<number, QtyLimits> = new Map();
let limits: ReadonlyMap<number, QtyLimits> = NO_LIMITS;
const limitsPending = new Set<number>();
const limitListeners = new Set<() => void>();

/** Busca (uma vez, em lote) os limites dos produtos do carrinho: GET /api/precos/limites. */
function loadLimits(groupIds: number[]) {
  const missing = groupIds.filter((id) => !limits.has(id) && !limitsPending.has(id));
  if (!missing.length) return;
  missing.forEach((id) => limitsPending.add(id));
  fetch(`/api/precos/limites?grupos=${missing.join(",")}`, { headers: { Accept: "application/json" } })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null)
    .then((data: { limits?: Record<string, QtyLimits> } | null) => {
      const next = new Map(limits);
      for (const id of missing) {
        const found = data?.limits?.[id];
        // Sem resposta: sem limite no carrinho (o servidor confere de novo no checkout).
        next.set(id, found && typeof found.minQty === "number" && typeof found.maxQty === "number" ? found : { minQty: 1, maxQty: 0 });
      }
      limits = next;
      limitListeners.forEach((listener) => listener());
    })
    .finally(() => missing.forEach((id) => limitsPending.delete(id)));
}

function subscribeLimits(listener: () => void) {
  limitListeners.add(listener);
  return () => {
    limitListeners.delete(listener);
  };
}

/**
 * Faixa da quantidade, igual à da página de produto: grade de tamanhos fica travada; produto por unidade
 * respeita o mínimo e o máximo do catálogo (até 999); lote de tabela e peça de m² vão de 1 a 99.
 */
export function quantityRange(item: CartItem, productLimits?: QtyLimits): QuantityRange {
  if (item.options?.Tamanhos) return { min: item.quantity, max: item.quantity, locked: true };
  const perUnit = !item.widthCm && (item.setQty || 1) <= 1;
  if (!perUnit) return { min: 1, max: 99, locked: false };
  const own = item.variationId !== undefined ? productLimits?.variations?.[String(item.variationId)] : undefined;
  const min = Math.max(1, own?.[0] ?? productLimits?.minQty ?? 1);
  return { min, max: Math.max(min, Math.min((own?.[1] ?? productLimits?.maxQty) || 999, 999)), locked: false };
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Arquivos do item que já estão no Bunny, no formato do pedido. */
export function uploadedFilesOf(item: Pick<CartItem, "printFile" | "artFiles" | "uploaded">): UploadedArtFile[] {
  return itemArtFiles(item).flatMap((file) => {
    const done = item.uploaded?.[file.id];
    return done ? [{ url: done.url, nome: done.nome, kind: file.kind, ...(file.tipo ? { tipo: file.tipo } : {}) }] : [];
  });
}

/** Item do carrinho no formato do pedido (sem miniaturas); `unitPrice` = o preço que o cliente está vendo. */
export function toOrderItem(item: CartItem, unitPrice = item.unitPrice): OrderItemInput {
  return {
    key: item.key,
    slug: item.slug,
    name: item.name,
    groupId: item.groupId,
    variationId: item.variationId,
    quantity: item.quantity,
    ...(item.widthCm ? { widthCm: item.widthCm } : {}),
    ...(item.heightCm ? { heightCm: item.heightCm } : {}),
    express: Boolean(item.express),
    options: item.options,
    artName: item.artName,
    bundle: item.bundle ?? null,
    unitPrice,
    files: uploadedFilesOf(item),
    ...(item.previa && item.uploaded?.[item.previa.id] ? { previa: item.uploaded[item.previa.id] } : {}),
    ...(item.acabamentos?.length ? { acabamentos: item.acabamentos } : {}),
    ...(item.termosArte ? { termosArte: item.termosArte } : {}),
    ...(item.criacaoArte ? { criacaoArte: true } : {}),
  };
}

/** Agrupa as linhas por kit/festa (na ordem em que aparecem); avulsos ficam sozinhos. */
export function groupLines(lines: CartLine[]): CartGroup[] {
  const groups: CartGroup[] = [];
  const byBundle = new Map<string, CartGroup>();
  for (const line of lines) {
    const bundle = line.item.bundle;
    if (!bundle) {
      groups.push({ id: line.item.key, bundle: null, title: null, lines: [line], total: line.total });
      continue;
    }
    let group = byBundle.get(bundle.id);
    if (!group) {
      group = { id: `kit:${bundle.id}`, bundle, title: bundleTitle(bundle, line.item.options), lines: [], total: 0 };
      byBundle.set(bundle.id, group);
      groups.push(group);
    }
    group.lines.push(line);
    group.total = round2(group.total + line.total);
  }
  return groups;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const items = useSyncExternalStore(subscribe, read, () => EMPTY);
  const [open, setOpen] = useState(false);
  const customer = useCustomer();
  const resellerCustomer = customer.status === "reseller";
  const known = customer.status !== "loading";
  const productLimits = useSyncExternalStore(subscribeLimits, () => limits, () => NO_LIMITS);

  // Limites de quantidade de todos os produtos do carrinho, numa chamada só.
  const allGroups = [...new Set(items.map((item) => item.groupId).filter((id): id is number => Boolean(id)))].sort((a, b) => a - b).join(",");
  useEffect(() => {
    if (allGroups) loadLimits(allGroups.split(",").map(Number));
  }, [allGroups]);

  // Revendedor: todo item com grupo vai para a tabela dele. Conta comum: só o que foi salvo com preço de revenda.
  // Revenda, item salvo na tabela de revenda ou com acabamentos (o preço deles acompanha a quantidade): preço recalculado.
  const needsPrice = useCallback(
    (item: CartItem) => known && Boolean(item.groupId) && (resellerCustomer || item.priceTier === "revenda" || Boolean(item.acabamentos?.length)),
    [known, resellerCustomer],
  );
  const groupIds = useMemo(() => items.filter(needsPrice).map((item) => item.groupId as number), [items, needsPrice]);
  const priceOf = useGroupPrices(groupIds);

  const add = useCallback((item: Omit<CartItem, "key">) => {
    const priceTier = item.priceTier ?? (currentCustomer().status === "reseller" ? "revenda" : "balcao");
    write([...read(), { ...item, priceTier, key: crypto.randomUUID() }]);
    track("carrinho_add", { p: item.slug, q: item.quantity, val: Math.round(item.unitPrice * item.quantity * 100) / 100 });
    setOpen(true);
  }, []);

  const remove = useCallback((key: string) => {
    const gone = read().find((item) => item.key === key);
    if (gone) track("carrinho_remove", { p: gone.slug, q: gone.quantity, val: Math.round(gone.unitPrice * gone.quantity * 100) / 100 });
    write(read().filter((item) => item.key !== key));
    prunePrintFilesExcept(printFileIds(read()));
  }, []);

  const removeBundle = useCallback((bundleId: string) => {
    write(read().filter((item) => item.bundle?.id !== bundleId));
    prunePrintFilesExcept(printFileIds(read()));
  }, []);

  // Arquivos órfãos (carrinho limpo em outra aba, pedido antigo): a limpeza lê o carrinho salvo, não o da hidratação.
  useEffect(() => {
    prunePrintFilesExcept(printFileIds(read()));
  }, []);

  const rangeOf = useCallback((item: CartItem) => quantityRange(item, item.groupId ? productLimits.get(item.groupId) : undefined), [productLimits]);

  const setQuantity = useCallback(
    (key: string, quantity: number) =>
      write(
        read().map((item) => {
          if (item.key !== key) return item;
          const range = quantityRange(item, item.groupId ? limits.get(item.groupId) : undefined);
          return range.locked ? item : { ...item, quantity: Math.max(range.min, Math.min(range.max, Math.round(quantity))) };
        }),
      ),
    [],
  );

  const clear = useCallback(() => {
    write([]);
    prunePrintFilesExcept([]);
  }, []);

  const setUploaded = useCallback((files: Record<string, { url: string; nome: string }>) => {
    const ids = Object.keys(files);
    if (!ids.length) return;
    write(
      read().map((item) => {
        const mine = itemStoredFiles(item).filter((file) => files[file.id]);
        if (!mine.length) return item;
        return { ...item, uploaded: { ...item.uploaded, ...Object.fromEntries(mine.map((file) => [file.id, files[file.id]])) } };
      }),
    );
  }, []);

  const { category, priceTable } = customer;
  const lines = useMemo<CartLine[]>(
    () =>
      items.map((item) => {
        const saved: CartLine = { item, unitPrice: item.unitPrice, total: round2(item.unitPrice * item.quantity + (item.acabamentosPreco ?? 0) + (item.criacaoArte ? (item.criacaoPreco ?? 0) : 0)), reseller: false, pending: false };
        if (!needsPrice(item)) return saved;
        const entry = priceOf(item.groupId as number);
        if (!entry) return { ...saved, pending: true };
        if (entry.status === "error") return saved;
        const priced = priceLine(toOrderItem(item), {
          groupId: entry.data.groupId,
          variations: customerVariations({ category, priceTable }, entry.data),
          customSize: entry.data.customSize,
          neon: entry.data.neon,
          reseller: entry.data.reseller,
          acabamentos: entry.data.acabamentos ?? null,
          criacao: entry.data.criacao ?? null,
        });
        if (isLineError(priced)) return saved;
        return { item, unitPrice: priced.unitPrice, total: priced.total, reseller: priced.reseller, pending: false };
      }),
    [items, needsPrice, priceOf, category, priceTable],
  );

  const value = useMemo(() => {
    // Itens distintos: a quantidade pode ser lote, peça ou unidade (150 camisas não são 150 itens).
    const count = items.length;
    const subtotal = round2(lines.reduce((sum, line) => sum + line.total, 0));
    const pricing = lines.some((line) => line.pending);
    return { items, lines, groups: groupLines(lines), count, subtotal, reseller: resellerCustomer, pricing, open, setOpen, add, remove, removeBundle, setQuantity, rangeOf, setUploaded, clear };
  }, [items, lines, resellerCustomer, open, add, remove, removeBundle, setQuantity, rangeOf, setUploaded, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart precisa estar dentro de CartProvider");
  return ctx;
}

/** Unidade do preço de um lote: "por 1.000 un.", "por unidade" ou "por peça" (m² e grade de tamanhos). */
export function unitLabel(item: CartItem): string {
  return item.widthCm || item.options?.Tamanhos ? "por peça" : quantityLabel(item.setQty);
}

/** Quantidade por extenso: "2 × 1.000 un.", "150 peças" (grade ou m²) ou "500 unidades". */
export function quantityText(item: CartItem): string {
  const n = item.quantity.toLocaleString("pt-BR");
  if (item.options?.Tamanhos || item.widthCm) return `${n} ${item.quantity === 1 ? "peça" : "peças"}`;
  if ((item.setQty || 1) <= 1) return `${n} ${item.quantity === 1 ? "unidade" : "unidades"}`;
  return `${n} × ${item.setQty.toLocaleString("pt-BR")} un.`;
}

/** Detalhes do item para o carrinho, o resumo e o checkout: medida (m²), prazo expresso e kit. */
export function itemFacts(item: CartItem): { size: string | null; express: boolean; bundle: string | null } {
  const cm = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const area = item.widthCm && item.heightCm ? (item.widthCm * item.heightCm) / 10_000 : 0;
  return {
    // A página de produto já grava "Medida" nas opções; aqui só para itens sem ela.
    size: area && !item.options?.Medida ? `${cm(item.widthCm as number)} × ${cm(item.heightCm as number)} cm (${area.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²)` : null,
    express: Boolean(item.express),
    bundle: item.bundle ? bundleTitle(item.bundle, item.options) : null,
  };
}
