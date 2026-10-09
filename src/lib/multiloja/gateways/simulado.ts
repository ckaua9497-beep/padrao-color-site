import "server-only";

import { randomBytes } from "node:crypto";
import type { Gateway } from "./types";

/*
 * Gateway de teste (desenvolvimento): gera Pix, boleto e "cartão" de mentira; a página do pedido mostra
 * "Simular pagamento". Nenhum dinheiro passa por aqui.
 */

const id = () => `sim-${randomBytes(8).toString("hex")}`;

export const simuladoGateway: Gateway = {
  name: "simulado",
  label: "Simulação (teste)",
  methods: ["pix", "boleto", "cartao"],
  configured: () => process.env.NODE_ENV !== "production",

  async create(method, input) {
    if (method === "pix") {
      return { id: id(), data: { pixCode: `00020126SIMULADO-${input.codigo}-${input.total.toFixed(2)}-NAO-PAGUE-ESTE-CODIGO`, expiresAt: new Date(Date.now() + 3_600_000).toISOString() } };
    }
    if (method === "boleto") {
      return {
        id: id(),
        data: {
          boletoLine: `00190.00009 0${input.codigo.replace(/\D/g, "").padEnd(4, "0")}.000000 00000.000000 0 00000000${Math.round(input.total * 100).toString().padStart(6, "0")}`,
          boletoExpiresAt: new Date(Date.now() + input.boletoDias * 86_400_000).toISOString().slice(0, 10),
        },
      };
    }
    return { id: id(), data: { checkoutUrl: input.returnUrl } };
  },

  async status() {
    return { status: "pendente" };
  },
  async refund() {
    return { ok: true, message: "Pagamento de teste: nada a devolver." };
  },
  async void() {
    return { ok: true, message: "Cobrança de teste cancelada." };
  },
  async diagnostics() {
    return [{ label: "Ambiente de desenvolvimento", ok: process.env.NODE_ENV !== "production", detail: "Simulação só funciona fora de produção." }];
  },
};
