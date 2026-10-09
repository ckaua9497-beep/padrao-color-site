import "server-only";

import type { PaymentRates } from "./core";

/*
 * Configurações da multiloja vindas do ambiente (.env.local). Valores de negócio provisórios até a Padrão
 * definir: taxas dos meios de pagamento e prazo de liberação da comissão.
 */

const numberEnv = (name: string, fallback: number, { min = 0, max = Infinity } = {}) => {
  const raw = process.env[name]?.trim().replace(",", ".");
  const value = raw ? Number(raw) : fallback;
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
};

/** Taxa de cada meio de pagamento em % do valor cobrado (MULTILOJA_TAXA_PIX / MULTILOJA_TAXA_CARTAO). */
export function paymentRates(): PaymentRates {
  return { pix: numberEnv("MULTILOJA_TAXA_PIX", 0, { max: 20 }), cartao: numberEnv("MULTILOJA_TAXA_CARTAO", 0, { max: 20 }) };
}

/** Dias depois do pagamento para a comissão ficar disponível, mesmo sem a entrega marcada. */
export function releaseDays(): number {
  return numberEnv("MULTILOJA_DIAS_LIBERACAO", 14, { min: 0, max: 120 });
}

/** URL pública do site principal (webhooks de pagamento e links do painel). */
export function publicUrl(): string | null {
  const url = process.env.MULTILOJA_URL_PUBLICA?.trim().replace(/\/$/, "");
  return url && /^https?:\/\//.test(url) ? url : null;
}

/** Host para onde o domínio próprio do lojista deve apontar (CNAME), ex.: lojas.padraocolor.com.br. */
export function dnsTarget(): string | null {
  return process.env.MULTILOJA_DNS_ALVO?.trim().toLowerCase() || null;
}

export type ProviderName = "efi" | "simulado";

/**
 * Meio de pagamento online: "efi" quando há credenciais (MULTILOJA_PAGAMENTO=efi); "simulado" em
 * desenvolvimento (nada é cobrado); null em produção sem Efí configurada: o pedido segue pelo WhatsApp.
 */
export function paymentProvider(): ProviderName | null {
  const chosen = process.env.MULTILOJA_PAGAMENTO?.trim().toLowerCase();
  if (chosen === "efi") return "efi";
  if (chosen === "simulado" || process.env.NODE_ENV !== "production") return "simulado";
  return null;
}

export type EfiConfig = {
  sandbox: boolean;
  clientId: string;
  clientSecret: string;
  /** Certificado .p12 da conta Efí (exigido pela API Pix) e a senha dele. */
  certPath: string;
  certPassword: string;
  /** Chave Pix da conta que recebe. */
  pixKey: string;
};

export function efiConfig(): EfiConfig | null {
  const env = (name: string) => process.env[name]?.trim() ?? "";
  const config = {
    sandbox: env("MULTILOJA_EFI_SANDBOX") !== "false",
    clientId: env("MULTILOJA_EFI_CLIENT_ID"),
    clientSecret: env("MULTILOJA_EFI_CLIENT_SECRET"),
    certPath: env("MULTILOJA_EFI_CERTIFICADO"),
    certPassword: env("MULTILOJA_EFI_CERTIFICADO_SENHA"),
    pixKey: env("MULTILOJA_EFI_CHAVE_PIX"),
  };
  return config.clientId && config.clientSecret && config.certPath && config.pixKey ? config : null;
}

/** Envio dos pedidos pagos para produção na API Padrão (POST /gerarpedido) com o cliente da multiloja. */
export function padraoProduction(): { enabled: boolean; customerId: number | null } {
  const id = Number(process.env.PADRAO_MULTILOJA_CLIENTE_ID ?? "");
  return { enabled: process.env.PADRAO_ORDERS_ENABLED === "true", customerId: Number.isInteger(id) && id > 0 ? id : null };
}
