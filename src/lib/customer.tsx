"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Variation } from "./catalog";

/*
 * Cliente logado no navegador (sem o token: ele fica num cookie httpOnly no servidor).
 * STUB da base: responde "anônimo". A frente "Conta, pedidos e checkout" implementa a sessão
 * (GET /api/conta/sessao) e o preço de revendedor.
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
  /** Saldo em conta corrente (GET /contacorrente). */
  balance?: number;
  refresh: () => void;
};

const ANONYMOUS: CustomerState = { status: "anonymous", refresh: () => {} };

const CustomerContext = createContext<CustomerState>(ANONYMOUS);

export function CustomerProvider({ children }: { children: ReactNode }) {
  return <CustomerContext.Provider value={ANONYMOUS}>{children}</CustomerContext.Provider>;
}

export function useCustomer(): CustomerState {
  return useContext(CustomerContext);
}

/**
 * Variações com o preço do cliente logado. Conta comum = preço de balcão (o do catálogo);
 * revendedor = tabela de revenda (STUB: devolve as variações do catálogo).
 */
export function useCustomerVariations(_product: { groupId?: number; category: string }, variations: Variation[]): { variations: Variation[]; reseller: boolean } {
  return { variations, reseller: false };
}
