import "server-only";

import { NO_FEES, PAYMENT_KINDS, type PaymentKind, type PaymentRates } from "./core";
import type { GatewayName } from "./gateways/types";
import { getSetting, openSecret } from "./settings";

/*
 * Configurações da multiloja. Pagamento: o que foi salvo no admin (/admin/pagamentos, tabela `configuracoes`)
 * vale primeiro; sem nada salvo, valem as variáveis de ambiente (.env.local). Valores de negócio (taxas, prazo de
 * liberação) são provisórios até a Padrão definir.
 */

const env = (name: string) => process.env[name]?.trim() ?? "";

const numberEnv = (name: string, fallback: number, { min = 0, max = Infinity } = {}) => {
  const raw = env(name).replace(",", ".");
  const value = raw ? Number(raw) : fallback;
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
};

/** Dias depois do pagamento para a comissão ficar disponível, mesmo sem a entrega marcada. */
export function releaseDays(): number {
  return numberEnv("MULTILOJA_DIAS_LIBERACAO", 14, { min: 0, max: 120 });
}

/** URL pública do site principal (webhooks de pagamento e links do painel). */
export function publicUrl(): string | null {
  const url = env("MULTILOJA_URL_PUBLICA").replace(/\/$/, "");
  return url && /^https?:\/\//.test(url) ? url : null;
}

/** Host para onde o domínio próprio do lojista deve apontar (CNAME), ex.: lojas.padraocolor.com.br. */
export function dnsTarget(): string | null {
  return env("MULTILOJA_DNS_ALVO").toLowerCase() || null;
}

/** Cadastro público de lojistas (/painel/cadastro) aberto? A Padrão fecha no admin e cria as lojas por lá. */
export const SIGNUP_OPEN_KEY = "multiloja.cadastroAberto";
export function signupOpen(): boolean {
  return getSetting<boolean>(SIGNUP_OPEN_KEY) ?? true;
}

// ---------------------------------------------------------------------------------- pagamento: geral

export type ActiveGateway = GatewayName | "desligado";

export type PaymentSettings = {
  /** Gateway que cobra os pedidos novos. "desligado": pedidos seguem pelo WhatsApp da loja. */
  ativo: ActiveGateway;
  /** Meios oferecidos no checkout (o gateway também precisa saber cobrar o meio). */
  metodos: Record<PaymentKind, boolean>;
  /** Taxas descontadas da comissão do lojista. */
  taxas: PaymentRates;
  /** Dias para o boleto vencer. */
  boletoDias: number;
};

export const PAYMENT_SETTINGS_KEY = "pagamento.geral";

function envActive(): ActiveGateway {
  const chosen = env("MULTILOJA_PAGAMENTO").toLowerCase();
  if (chosen === "efi" || chosen === "cielo" || chosen === "simulado") return chosen;
  return process.env.NODE_ENV !== "production" ? "simulado" : "desligado";
}

function envRates(): PaymentRates {
  return {
    pix: { pct: numberEnv("MULTILOJA_TAXA_PIX", 0, { max: 20 }), fixed: 0 },
    boleto: { pct: 0, fixed: numberEnv("MULTILOJA_TAXA_BOLETO", 0, { max: 50 }) },
    cartao: { pct: numberEnv("MULTILOJA_TAXA_CARTAO", 0, { max: 20 }), fixed: 0 },
  };
}

export function paymentSettings(): PaymentSettings {
  const saved = getSetting<Partial<PaymentSettings>>(PAYMENT_SETTINGS_KEY);
  const metodos = Object.fromEntries(PAYMENT_KINDS.map((k) => [k, saved?.metodos?.[k] ?? true])) as Record<PaymentKind, boolean>;
  const rates = envRates();
  const taxas = Object.fromEntries(
    PAYMENT_KINDS.map((k) => {
      const rule = saved?.taxas?.[k];
      return [k, rule && Number.isFinite(rule.pct) && Number.isFinite(rule.fixed) ? rule : rates[k] ?? NO_FEES[k]];
    }),
  ) as PaymentRates;
  return {
    ativo: saved?.ativo ?? envActive(),
    metodos,
    taxas,
    boletoDias: saved?.boletoDias && saved.boletoDias >= 1 && saved.boletoDias <= 30 ? saved.boletoDias : 3,
  };
}

/** Taxas de cada meio de pagamento (descontadas da comissão). */
export function paymentRates(): PaymentRates {
  return paymentSettings().taxas;
}

// ---------------------------------------------------------------------------------- Efí

export type EfiConfig = {
  sandbox: boolean;
  clientId: string;
  clientSecret: string;
  /** Certificado .p12 da conta Efí (exigido pela API Pix): caminho do arquivo ou o conteúdo em base64. */
  certPath: string;
  certBase64: string;
  /** Senha do .p12 (a Efí gera sem senha: vazio). */
  certPassword: string;
  /** Chave Pix da conta que recebe. */
  pixKey: string;
};

/** Como a Efí fica salva no admin (segredos cifrados com sealSecret). */
export type EfiSaved = { sandbox?: boolean; clientId?: string; clientSecret?: string; certBase64?: string; pixKey?: string; webhookSecret?: string };
export const EFI_SETTINGS_KEY = "pagamento.efi";

export function efiConfig(): EfiConfig | null {
  const saved = getSetting<EfiSaved>(EFI_SETTINGS_KEY);
  const config: EfiConfig = saved?.clientId
    ? {
        sandbox: saved.sandbox !== false,
        clientId: saved.clientId,
        clientSecret: openSecret(saved.clientSecret),
        certPath: "",
        certBase64: openSecret(saved.certBase64),
        certPassword: "",
        pixKey: saved.pixKey ?? "",
      }
    : {
        sandbox: env("MULTILOJA_EFI_SANDBOX") !== "false",
        clientId: env("MULTILOJA_EFI_CLIENT_ID"),
        clientSecret: env("MULTILOJA_EFI_CLIENT_SECRET"),
        certPath: env("MULTILOJA_EFI_CERTIFICADO"),
        certBase64: env("MULTILOJA_EFI_CERTIFICADO_BASE64").replace(/\s+/g, ""),
        certPassword: process.env.MULTILOJA_EFI_CERTIFICADO_SENHA ?? "",
        pixKey: env("MULTILOJA_EFI_CHAVE_PIX"),
      };
  return config.clientId && config.clientSecret && (config.certPath || config.certBase64) && config.pixKey ? config : null;
}

/** Segredo que vai na URL dos webhooks (?hmac=…): sem ele, o aviso é recusado. 24+ caracteres. */
export function efiWebhookSecret(): string | null {
  const saved = openSecret(getSetting<EfiSaved>(EFI_SETTINGS_KEY)?.webhookSecret);
  const secret = saved || env("MULTILOJA_EFI_WEBHOOK_SEGREDO");
  return secret.length >= 24 && /^[A-Za-z0-9_-]+$/.test(secret) ? secret : null;
}

/** IPs de onde a Efí manda os webhooks (documentação: 34.193.116.226). Vazio = não confere o IP. */
export function efiWebhookIps(): string[] {
  const raw = process.env.MULTILOJA_EFI_WEBHOOK_IPS ?? "34.193.116.226";
  return raw
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------------- Cielo

export type CieloConfig = {
  sandbox: boolean;
  /** API E-commerce 3.0 (Pix, boleto e cartão). */
  merchantId: string;
  merchantKey: string;
  /** Banco emissor do boleto na Cielo (ex.: Bradesco2, BancoDoBrasil3); no sandbox, Simulado. */
  boletoProvider: string;
  /** Checkout Cielo / Link de Pagamento (página hospedada do cartão). */
  clientId: string;
  clientSecret: string;
  /** Segredo que vai na URL das notificações (?hmac=…). */
  webhookSecret: string;
};

export type CieloSaved = Partial<Omit<CieloConfig, "merchantKey" | "clientSecret" | "webhookSecret">> & { merchantKey?: string; clientSecret?: string; webhookSecret?: string };
export const CIELO_SETTINGS_KEY = "pagamento.cielo";

/** Cielo salva no admin, ou no ambiente (MULTILOJA_CIELO_*). Null sem MerchantId/MerchantKey. */
export function cieloConfig(): CieloConfig | null {
  const saved = getSetting<CieloSaved>(CIELO_SETTINGS_KEY);
  const config: CieloConfig = saved?.merchantId
    ? {
        sandbox: saved.sandbox !== false,
        merchantId: saved.merchantId,
        merchantKey: openSecret(saved.merchantKey),
        boletoProvider: saved.boletoProvider || (saved.sandbox !== false ? "Simulado" : ""),
        clientId: saved.clientId ?? "",
        clientSecret: openSecret(saved.clientSecret),
        webhookSecret: openSecret(saved.webhookSecret),
      }
    : {
        sandbox: env("MULTILOJA_CIELO_SANDBOX") !== "false",
        merchantId: env("MULTILOJA_CIELO_MERCHANT_ID"),
        merchantKey: env("MULTILOJA_CIELO_MERCHANT_KEY"),
        boletoProvider: env("MULTILOJA_CIELO_BOLETO_BANCO") || (env("MULTILOJA_CIELO_SANDBOX") !== "false" ? "Simulado" : ""),
        clientId: env("MULTILOJA_CIELO_CLIENT_ID"),
        clientSecret: env("MULTILOJA_CIELO_CLIENT_SECRET"),
        webhookSecret: env("MULTILOJA_CIELO_WEBHOOK_SEGREDO"),
      };
  return config.merchantId && config.merchantKey ? config : null;
}

// ---------------------------------------------------------------------------------- produção na Padrão

/** Envio dos pedidos pagos para produção na API Padrão (POST /gerarpedido) com o cliente da multiloja. */
export function padraoProduction(): { enabled: boolean; customerId: number | null } {
  const id = Number(process.env.PADRAO_MULTILOJA_CLIENTE_ID ?? "");
  return { enabled: process.env.PADRAO_ORDERS_ENABLED === "true", customerId: Number.isInteger(id) && id > 0 ? id : null };
}
