"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { CustomSize, Variation } from "./catalog";
import { applyResellerDiscount, resellerDiscountRate } from "./reseller";

/*
 * Cliente logado no navegador. O token fica no servidor (cookie httpOnly lacrado); aqui só chegam os dados
 * públicos do GET /api/conta/sessao. Revendedor vê a tabela de revenda (GET /api/precos por grupo, com o
 * desconto da categoria aplicado por src/lib/reseller.ts); conta comum e visitante ficam no preço de balcão.
 */

export type CustomerStatus = "loading" | "anonymous" | "customer" | "reseller";

export type CustomerState = {
  status: CustomerStatus;
  /** ID do cliente na API (vai como idCliente no pedido). */
  id?: number;
  name?: string;
  /** Categoria de revenda (Bronze, Prata, Ouro, Ouro 2, Diamante…). */
  category?: string;
  /** Tabela de preço da API ("CLIENTE FINAL" = balcão). */
  priceTable?: string;
  /** Saldo em conta corrente (GET /cliente → conta_corrente). */
  balance?: number;
  refresh: () => void;
};

type Snapshot = Omit<CustomerState, "refresh">;

// ---------------------------------------------------------------------------------- sessão

const LOADING: Snapshot = { status: "loading" };
const ANONYMOUS: Snapshot = { status: "anonymous" };

let snapshot: Snapshot = LOADING;
let started = false;
/** Cada carga ou login/logout ganha um número: resposta atrasada de uma carga antiga é descartada. */
let generation = 0;
const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;

function toSnapshot(data: unknown): Snapshot {
  const d = (data ?? {}) as Record<string, unknown>;
  if ((d.status !== "customer" && d.status !== "reseller") || typeof d.id !== "number") return ANONYMOUS;
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  return {
    status: d.status,
    id: d.id,
    name: text(d.name),
    category: text(d.category),
    priceTable: text(d.priceTable),
    balance: typeof d.balance === "number" ? d.balance : undefined,
  };
}

function setSnapshot(next: Snapshot) {
  if (JSON.stringify(next) === JSON.stringify(snapshot)) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function load() {
  const ticket = ++generation;
  fetch("/api/conta/sessao", { cache: "no-store", headers: { Accept: "application/json" } })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (ticket === generation) setSnapshot(toSnapshot(data));
    })
    .catch(() => {
      if (ticket === generation && snapshot.status === "loading") setSnapshot(ANONYMOUS);
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) {
    started = true;
    load();
    // Login/logout em outra aba atualiza esta.
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("padrao-conta");
      channel.onmessage = () => load();
    }
  }
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => LOADING;

/**
 * Atualiza o cliente com a resposta do login, do cadastro ou do logout (sem nova ida ao servidor) e
 * avisa as outras abas.
 */
export function setCustomer(data: unknown) {
  generation += 1;
  setSnapshot(toSnapshot(data));
  channel?.postMessage("mudou");
}

/** Cliente agora (para handlers de evento, fora do render). */
export function currentCustomer(): Snapshot {
  return snapshot;
}

const CustomerContext = createContext<CustomerState>({ ...ANONYMOUS, refresh: () => {} });

export function CustomerProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const value = useMemo<CustomerState>(() => ({ ...state, refresh: load }), [state]);
  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
}

export function useCustomer(): CustomerState {
  return useContext(CustomerContext);
}

// ---------------------------------------------------------------------------------- preços por grupo

/** Resposta do GET /api/precos: variações sem o desconto da categoria. */
export type GroupPrices = {
  groupId: number;
  category: string;
  customSize: CustomSize | null;
  reseller: boolean;
  variations: Variation[];
};

export type PriceEntry = { status: "ready"; data: GroupPrices } | { status: "error"; at: number };

const RETRY_MS = 60_000;
const EMPTY_PRICES: ReadonlyMap<string, PriceEntry> = new Map();
let prices: ReadonlyMap<string, PriceEntry> = EMPTY_PRICES;
const pending = new Set<string>();
const priceListeners = new Set<() => void>();

const priceKey = (customerId: number | undefined, groupId: number) => `${customerId ?? 0}:${groupId}`;

function setPrice(key: string, entry: PriceEntry) {
  const next = new Map(prices);
  next.set(key, entry);
  prices = next;
  priceListeners.forEach((listener) => listener());
}

function parsePrices(data: unknown): (GroupPrices & { customerId: number | null }) | null {
  const d = (data ?? {}) as Record<string, unknown>;
  if (typeof d.groupId !== "number" || !Array.isArray(d.variations)) return null;
  const variations = d.variations.filter(
    (v): v is Variation => typeof v === "object" && v !== null && typeof (v as Variation).p === "number" && typeof (v as Variation).q === "number" && typeof (v as Variation).v === "object",
  );
  return {
    groupId: d.groupId,
    category: typeof d.category === "string" ? d.category : "",
    customSize: typeof d.customSize === "object" && d.customSize !== null ? (d.customSize as CustomSize) : null,
    reseller: d.reseller === true,
    variations,
    customerId: typeof d.customerId === "number" ? d.customerId : null,
  };
}

/** Busca (uma vez) os preços do grupo para o cliente; erro tenta de novo depois de 1 minuto. */
function ensureGroupPrices(customerId: number | undefined, groupId: number) {
  const key = priceKey(customerId, groupId);
  const entry = prices.get(key);
  if (pending.has(key) || entry?.status === "ready" || (entry?.status === "error" && Date.now() - entry.at < RETRY_MS)) return;
  pending.add(key);
  fetch(`/api/precos?grupo=${groupId}`, { cache: "no-store", headers: { Accept: "application/json" } })
    .then(async (response) => (response.ok ? parsePrices(await response.json()) : null))
    .then((data) => {
      // Sessão mudou no meio (login/logout em outra aba): descarta e recarrega o cliente.
      if (data && data.customerId !== (customerId ?? null)) {
        setPrice(key, { status: "error", at: Date.now() });
        load();
        return;
      }
      setPrice(key, data ? { status: "ready", data } : { status: "error", at: Date.now() });
    })
    .catch(() => setPrice(key, { status: "error", at: Date.now() }))
    .finally(() => pending.delete(key));
}

function subscribePrices(listener: () => void) {
  priceListeners.add(listener);
  return () => {
    priceListeners.delete(listener);
  };
}

const getPrices = () => prices;
const getServerPrices = () => EMPTY_PRICES;

/**
 * Preços do cliente atual para vários grupos (carrinho e checkout). Devolve a consulta por grupo:
 * undefined = carregando; status "error" = seguir com o preço salvo.
 */
export function useGroupPrices(groupIds: readonly number[]): (groupId: number) => PriceEntry | undefined {
  const customer = useCustomer();
  const all = useSyncExternalStore(subscribePrices, getPrices, getServerPrices);
  const ready = customer.status !== "loading";
  const idsKey = ready ? [...new Set(groupIds)].sort((a, b) => a - b).join(",") : "";
  const customerId = customer.id;
  useEffect(() => {
    if (!idsKey) return;
    for (const id of idsKey.split(",")) ensureGroupPrices(customerId, Number(id));
  }, [idsKey, customerId]);
  return useCallback((groupId: number) => all.get(priceKey(customerId, groupId)), [all, customerId]);
}

/** Desconto da categoria de revenda do cliente aplicado às variações do grupo. */
export function customerVariations(customer: Pick<CustomerState, "category" | "priceTable">, data: GroupPrices): Variation[] {
  if (!data.reseller) return data.variations;
  return applyResellerDiscount(data.variations, resellerDiscountRate({ category: customer.category, priceTable: customer.priceTable }, data.category));
}

export type PricedProduct = { groupId?: number; category: string; categorySlug?: string };

export type CustomerPrices = { variations: Variation[]; reseller: boolean };

/**
 * Preços do cliente para uma LISTA de produtos (Crie Sua Festa, Monte Seu Kit, vitrines): um hook só para
 * vários grupos. Devolve `pricesFor(produto, variaçõesDoCatálogo)`; visitante e conta comum recebem as do
 * catálogo; revendedor, a tabela de revenda com o desconto da categoria assim que ela chega.
 *
 *   const pricesFor = useCustomerPriceList(products.map((p) => p.groupId ?? 0));
 *   const { variations, reseller } = pricesFor(product, product.variations);
 */
export function useCustomerPriceList(groupIds: readonly number[]): (product: PricedProduct, variations: Variation[]) => CustomerPrices {
  const customer = useCustomer();
  const reseller = customer.status === "reseller";
  const lookup = useGroupPrices(reseller ? groupIds.filter((id) => id > 0) : []);
  const { category, priceTable } = customer;
  return useCallback(
    (product: PricedProduct, variations: Variation[]) => {
      const entry = reseller && product.groupId ? lookup(product.groupId) : undefined;
      if (entry?.status !== "ready" || !entry.data.reseller) return { variations, reseller: false };
      // O segmento do desconto sai da categoria do produto (a mesma do catálogo que o servidor usa).
      return { variations: customerVariations({ category, priceTable }, { ...entry.data, category: product.categorySlug ?? product.category }), reseller: true };
    },
    [reseller, lookup, category, priceTable],
  );
}

/**
 * Variações com o preço do cliente logado. Conta comum = preço de balcão (o do catálogo); revendedor = tabela
 * de revenda + desconto da categoria (Prata/Ouro em Offset e Comunicação Visual). Enquanto carrega ou se a
 * tabela falhar, segue com o catálogo.
 */
export function useCustomerVariations(product: PricedProduct, variations: Variation[]): CustomerPrices {
  const pricesFor = useCustomerPriceList(product.groupId ? [product.groupId] : []);
  const { groupId, category, categorySlug } = product;
  return useMemo(() => pricesFor({ groupId, category, categorySlug }, variations), [pricesFor, groupId, category, categorySlug, variations]);
}
