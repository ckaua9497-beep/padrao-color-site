import type { Product, ProductSummary, Variation } from "../catalog";

/*
 * Regras puras da multiloja (testadas em core.test.ts, sem Next nem banco):
 * - qual loja um Host representa (subdomínio de MULTILOJA_DOMINIO ou domínio próprio);
 * - validação de subdomínio, e-mail e margem;
 * - preço da loja = preço base da Padrão × (1 + margem), arredondado ao centavo;
 * - limites dos planos e paletas de cor com contraste aprovado.
 */

// ---------------------------------------------------------------------------------- endereço da loja

/** Subdomínios que nunca viram loja (são do próprio sistema ou confundem o cliente). */
export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "painel",
  "loja",
  "lojas",
  "multiloja",
  "padrao",
  "padraocolor",
  "sac",
  "suporte",
  "ajuda",
  "blog",
  "email",
  "mail",
  "ftp",
  "cdn",
  "img",
  "static",
  "lab",
  "dev",
  "teste",
  "test",
  "staging",
]);

const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

/** Subdomínio no formato aceito: 3 a 30 caracteres, letras minúsculas, números e hífen no meio. */
export function subdomainError(value: string): string | null {
  if (!value) return "Informe o endereço da loja.";
  if (value.length < 3) return "Use pelo menos 3 caracteres.";
  if (value.length > 30) return "Use no máximo 30 caracteres.";
  if (!SUBDOMAIN_RE.test(value)) return "Use só letras minúsculas sem acento, números e hífen (não no começo nem no fim).";
  if (value.includes("--")) return "Não use dois hífens seguidos.";
  if (RESERVED_SUBDOMAINS.has(value)) return "Esse endereço é reservado. Escolha outro.";
  return null;
}

/** Sugestão de subdomínio a partir do nome da loja ("Ateliê da Ana" → "atelie-da-ana"). */
export function suggestSubdomain(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
}

export type TenantHost =
  /** Site principal (padraocolor.com.br, localhost…): não é loja. */
  | { kind: "main" }
  /** <sub>.<domínio raiz> */
  | { kind: "subdomain"; subdomain: string }
  /** Domínio próprio do lojista (resolvido no banco). */
  | { kind: "custom"; domain: string };

/** Tira a porta e o ponto final e põe em minúsculas ("Loja.Exemplo.com.br.:3100" → "loja.exemplo.com.br"). */
export function cleanHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

/**
 * O que um Host representa. `rootDomain` é o domínio das lojas (ex.: "lojas.padraocolor.com.br" ou "localhost");
 * `mainHosts` são os hosts do site principal, que nunca viram loja.
 */
export function parseTenantHost(rawHost: string, rootDomain: string, mainHosts: readonly string[] = []): TenantHost {
  const host = cleanHost(rawHost);
  const root = cleanHost(rootDomain);
  if (!host || host === root || mainHosts.map(cleanHost).includes(host)) return { kind: "main" };
  // Acesso por IP (celular na rede, health check): site principal.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) return { kind: "main" };
  if (root && host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -(root.length + 1));
    // Só um nível: "a.b.lojas…" não é loja; "www.lojas…" é o site.
    if (!sub || sub.includes(".") || sub === "www") return { kind: "main" };
    return { kind: "subdomain", subdomain: sub };
  }
  if (host === "localhost" || host.endsWith(".localhost")) return { kind: "main" };
  return { kind: "custom", domain: host };
}

/** Domínio próprio no formato aceito ("www.minhaloja.com.br"). */
export function customDomainError(value: string): string | null {
  if (!value) return null;
  if (value.length > 253) return "Domínio longo demais.";
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(value)) return "Informe só o domínio, como www.minhaloja.com.br.";
  return null;
}

// ---------------------------------------------------------------------------------- dados do lojista

export const LOJISTA_TYPES = ["influenciador", "fornecedor", "revendedor"] as const;
export type LojistaType = (typeof LOJISTA_TYPES)[number];

export const LOJISTA_TYPE_LABEL: Record<LojistaType, string> = {
  influenciador: "Influenciador(a) / criador(a) de conteúdo",
  fornecedor: "Fornecedor / empresa",
  revendedor: "Revendedor / gráfica",
};

export function emailError(value: string): string | null {
  if (!value) return "Informe o e-mail.";
  if (value.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return "E-mail inválido.";
  return null;
}

export const PASSWORD_MIN = 8;

export function passwordError(value: string): string | null {
  if (value.length < PASSWORD_MIN) return `A senha precisa de pelo menos ${PASSWORD_MIN} caracteres.`;
  if (value.length > 200) return "Senha longa demais.";
  return null;
}

/** Só os dígitos de um telefone/WhatsApp brasileiro; null quando não parece um número válido. */
export function phoneDigits(value: string): string | null {
  const digits = value.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return /^\d{10,11}$/.test(digits) ? digits : null;
}

/** Link do WhatsApp para um número com DDD. */
export function whatsappLink(digits: string, text?: string): string {
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/55${digits}${query}`;
}

export function formatPhone(digits: string): string {
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

// ---------------------------------------------------------------------------------- margem e preço

/** Margem mínima sobre o preço base (regra do painel atual: "Informe uma margem de pelo menos 20%"). */
export const MARGIN_MIN = 20;
/** Teto para evitar erro de digitação (3000% em vez de 30%). */
export const MARGIN_MAX = 300;
export const MARGIN_DEFAULT = 30;

export function marginError(value: number): string | null {
  if (!Number.isFinite(value)) return "Informe a margem em %.";
  if (value < MARGIN_MIN) return `A margem mínima é ${MARGIN_MIN}%.`;
  if (value > MARGIN_MAX) return `A margem máxima é ${MARGIN_MAX}%.`;
  return null;
}

/** "35", "35,5", "35.5%" → 35.5; NaN quando não é número. */
export function parseMargin(raw: string): number {
  const text = raw.trim().replace("%", "").replace(",", ".");
  return text ? Number(text) : Number.NaN;
}

export const roundCents = (value: number) => Math.round(value * 100) / 100;

/**
 * Preço base do lojista a partir do preço do catálogo. O catálogo traz a tabela "CLIENTE FINAL"; a tabela
 * própria da multiloja (mais baixa) ainda não vem da API. `factor` (MULTILOJA_FATOR_BASE) ajusta até lá.
 */
export function basePrice(catalogPrice: number, factor = 1): number {
  return roundCents(catalogPrice * factor);
}

/** Preço de venda na loja: base × (1 + margem%). */
export function salePrice(base: number, margin: number): number {
  return roundCents(base * (1 + margin / 100));
}

/** Lucro bruto do lojista por unidade de venda (antes das taxas de pagamento). */
export function grossProfit(base: number, margin: number): number {
  return roundCents(salePrice(base, margin) - base);
}

/** Variações com o preço da loja (econômico e expresso). Preço 0 = "sob consulta" e continua 0. */
export function priceVariations(variations: Variation[], margin: number, factor = 1): Variation[] {
  return variations.map((v) => ({
    ...v,
    p: v.p > 0 ? salePrice(basePrice(v.p, factor), margin) : v.p,
    ...(typeof v.pe === "number" ? { pe: v.pe > 0 ? salePrice(basePrice(v.pe, factor), margin) : v.pe } : {}),
  }));
}

/** Produto inteiro com o preço da loja ("a partir de" e todas as variações). */
export function priceProduct<T extends Pick<Product, "price" | "variations">>(product: T, margin: number, factor = 1): T {
  return {
    ...product,
    price: product.price > 0 ? salePrice(basePrice(product.price, factor), margin) : product.price,
    variations: priceVariations(product.variations, margin, factor),
  };
}

export function priceSummary(summary: ProductSummary, margin: number, factor = 1): ProductSummary {
  return { ...summary, price: summary.price > 0 ? salePrice(basePrice(summary.price, factor), margin) : summary.price };
}

// ---------------------------------------------------------------------------------- planos

export const PLANS = ["gratis", "basico", "premium"] as const;
export type Plan = (typeof PLANS)[number];

export const PLAN_INFO: Record<Plan, { name: string; maxProducts: number | null; blurb: string }> = {
  gratis: { name: "Grátis", maxProducts: 10, blurb: "Até 10 produtos ativos" },
  basico: { name: "Básico", maxProducts: 50, blurb: "Até 50 produtos ativos" },
  premium: { name: "Premium", maxProducts: null, blurb: "Produtos ilimitados" },
};

export function isPlan(value: string): value is Plan {
  return (PLANS as readonly string[]).includes(value);
}

/** Quantos produtos ainda cabem no plano (Infinity = sem limite). */
export function planRoom(plan: Plan, activeCount: number): number {
  const max = PLAN_INFO[plan].maxProducts;
  return max === null ? Infinity : Math.max(0, max - activeCount);
}

// ---------------------------------------------------------------------------------- aparência

/**
 * Cor da marca do lojista. Paletas fechadas com contraste conferido (core.test.ts): `main` leva texto branco
 * em botão grande (≥ 3:1), `dark` leva texto branco pequeno e serve de texto sobre branco (≥ 4,5:1).
 */
export const PALETTES = {
  coral: { name: "Coral", main: "#ff463a", hover: "#e03a30", dark: "#c4241b", soft: "#fff1f0", tint: "#ffe0dd" },
  azul: { name: "Azul", main: "#1f6feb", hover: "#1a5fcc", dark: "#174ea6", soft: "#eaf2ff", tint: "#d6e6ff" },
  marinho: { name: "Marinho", main: "#24408e", hover: "#1c3373", dark: "#1c3373", soft: "#ecf0fa", tint: "#d8e0f5" },
  verde: { name: "Verde", main: "#16834a", hover: "#126d3d", dark: "#0f6136", soft: "#e8f6ee", tint: "#cdebd9" },
  roxo: { name: "Roxo", main: "#7c3aed", hover: "#6a2fd0", dark: "#5b21b6", soft: "#f3edff", tint: "#e4d8fd" },
  rosa: { name: "Rosa", main: "#d6246e", hover: "#b81d5d", dark: "#a3174f", soft: "#fdeaf2", tint: "#f9d2e2" },
  laranja: { name: "Laranja", main: "#d9480f", hover: "#bb3d0c", dark: "#a8380b", soft: "#fff0e8", tint: "#ffdcc9" },
  grafite: { name: "Grafite", main: "#2b2f36", hover: "#000000", dark: "#2b2f36", soft: "#f1f2f4", tint: "#e1e3e7" },
} as const;

export type PaletteKey = keyof typeof PALETTES;
export const PALETTE_KEYS = Object.keys(PALETTES) as PaletteKey[];

export function isPalette(value: string): value is PaletteKey {
  return value in PALETTES;
}

/** Variáveis CSS que trocam o coral da Padrão pela cor da loja (botões, preço, destaques). */
export function paletteVars(key: PaletteKey): Record<string, string> {
  const p = PALETTES[key];
  return {
    "--color-coral": p.main,
    "--color-coral-600": p.hover,
    "--color-coral-700": p.dark,
    "--color-coral-50": p.soft,
    "--color-coral-100": p.tint,
    "--color-buy": p.main,
    "--color-buy-hover": p.hover,
    "--color-price": p.dark,
    "--color-price-sm": p.dark,
  };
}

/** Contraste WCAG entre duas cores #rrggbb. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------------- redes sociais

export const SOCIAL_KEYS = ["instagram", "tiktok", "youtube", "facebook", "pinterest", "linkedin"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];

export const SOCIAL_LABEL: Record<SocialKey, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
  pinterest: "Pinterest",
  linkedin: "LinkedIn",
};

const SOCIAL_HOSTS: Record<SocialKey, RegExp> = {
  instagram: /(^|\.)instagram\.com$/,
  tiktok: /(^|\.)tiktok\.com$/,
  youtube: /(^|\.)(youtube\.com|youtu\.be)$/,
  facebook: /(^|\.)(facebook\.com|fb\.com)$/,
  pinterest: /(^|\.)pinterest\.(com|com\.br)$/,
  linkedin: /(^|\.)linkedin\.com$/,
};

/** Link de rede social normalizado (https, host da própria rede); "" = vazio; null = inválido. */
export function socialUrl(key: SocialKey, raw: string): string | null {
  const text = raw.trim();
  if (!text) return "";
  // "@perfil" no Instagram/TikTok vira o link do perfil.
  if (/^@[\w.]{1,40}$/.test(text) && (key === "instagram" || key === "tiktok")) {
    return key === "instagram" ? `https://www.instagram.com/${text.slice(1)}/` : `https://www.tiktok.com/${text}`;
  }
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (!SOCIAL_HOSTS[key].test(url.hostname.toLowerCase())) return null;
    url.protocol = "https:";
    return url.toString();
  } catch {
    return null;
  }
}

/** "1 venda", "3 vendas" (número no formato brasileiro). */
export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
}

/** Texto sem acento, minúsculo e só com letras/números (busca do painel, sem carregar o catálogo no navegador). */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------------- pedidos

export const ORDER_STATUSES = ["aguardando_pagamento", "pago", "em_producao", "enviado", "entregue", "cancelado", "expirado"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  aguardando_pagamento: "Aguardando pagamento",
  pago: "Pago",
  em_producao: "Em produção",
  enviado: "Enviado",
  entregue: "Entregue",
  cancelado: "Cancelado",
  expirado: "Pagamento expirado",
};

/** Mudanças de status que a Padrão faz à mão (o pagamento online marca "pago" sozinho). */
export const ORDER_NEXT: Record<OrderStatus, OrderStatus[]> = {
  aguardando_pagamento: ["pago", "cancelado", "expirado"],
  pago: ["em_producao", "cancelado"],
  em_producao: ["enviado", "cancelado"],
  enviado: ["entregue"],
  entregue: [],
  cancelado: [],
  expirado: [],
};

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

/** Pedido que conta como venda (pagamento confirmado e não cancelado). */
export function isPaidStatus(status: OrderStatus): boolean {
  return status === "pago" || status === "em_producao" || status === "enviado" || status === "entregue";
}

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Código do pedido para o cliente ("ML-7F3K2Q"): curto, sem 0/O/1/I/L. */
export function orderCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(6);
  return `ML-${[...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("")}`;
}

export const PAYMENT_KINDS = ["pix", "boleto", "cartao"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];
export const PAYMENT_LABEL: Record<PaymentKind, string> = { pix: "Pix", boleto: "Boleto", cartao: "Cartão de crédito" };

export function isPaymentKind(value: unknown): value is PaymentKind {
  return typeof value === "string" && (PAYMENT_KINDS as readonly string[]).includes(value);
}

/** Frete da loja: valor fixo, grátis a partir de um subtotal. */
export function shippingFor(subtotal: number, fixed: number, freeAbove: number | null): number {
  if (!(fixed > 0)) return 0;
  if (freeAbove !== null && freeAbove > 0 && subtotal >= freeAbove) return 0;
  return roundCents(fixed);
}

/** Taxa de um meio de pagamento: % do valor cobrado + valor fixo por transação (boleto costuma ser só fixo). */
export type FeeRule = { pct: number; fixed: number };
export type PaymentRates = Record<PaymentKind, FeeRule>;

export const NO_FEES: PaymentRates = { pix: { pct: 0, fixed: 0 }, boleto: { pct: 0, fixed: 0 }, cartao: { pct: 0, fixed: 0 } };

/** Taxa do meio de pagamento sobre o total cobrado. */
export function paymentFee(total: number, method: PaymentKind, rates: PaymentRates): number {
  const rule = rates[method];
  return roundCents((total * rule.pct) / 100 + rule.fixed);
}

/**
 * Comissão do lojista: o que o cliente pagou menos o custo da Padrão (preço base), o frete (repassado) e a
 * taxa do pagamento. O desconto do PIX sai da margem do lojista. Nunca negativa.
 */
export function commissionFor({ total, baseCost, shipping, fee }: { total: number; baseCost: number; shipping: number; fee: number }): number {
  return Math.max(0, roundCents(total - baseCost - shipping - fee));
}

export type BalanceOrder = { status: OrderStatus; comissao: number; pagoEm: string | null };
export type BalanceWithdrawal = { status: "solicitado" | "pago" | "recusado"; valor: number };
export type Balance = { available: number; pending: number; requested: number; withdrawn: number; earned: number };

/** Data do SQLite ("AAAA-MM-DD HH:MM:SS", UTC) → Date. */
export function sqlDate(value: string): Date {
  return new Date(`${value.replace(" ", "T")}Z`);
}

/** Data e hora do SQLite no horário de Brasília ("08/10/2026 22:06"). */
export function formatDateTime(value: string, withTime = true): string {
  return sqlDate(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "America/Sao_Paulo",
  });
}

/** "AAAA-MM-DD HH:MM:SS" (UTC, como o SQLite grava) de N dias atrás, para filtrar por período. */
export function sqlDaysAgo(days: number, now = new Date()): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
}

/** Comissão já liberada: pedido entregue, ou pago há pelo menos `releaseDays` dias. */
export function commissionReleased(order: Pick<BalanceOrder, "status" | "pagoEm">, releaseDays: number, now = new Date()): boolean {
  if (order.status === "entregue") return true;
  return order.pagoEm ? now.getTime() - sqlDate(order.pagoEm).getTime() >= releaseDays * 86_400_000 : false;
}

/**
 * Saldo do lojista. A comissão fica "a liberar" até o pedido ser entregue ou passarem `releaseDays` desde o
 * pagamento; depois entra no disponível. Saque solicitado já sai do disponível; recusado volta.
 */
export function balanceOf(orders: BalanceOrder[], withdrawals: BalanceWithdrawal[], releaseDays: number, now = new Date()): Balance {
  let released = 0;
  let pending = 0;
  for (const order of orders) {
    if (!isPaidStatus(order.status)) continue;
    if (commissionReleased(order, releaseDays, now)) released += order.comissao;
    else pending += order.comissao;
  }
  const requested = withdrawals.filter((w) => w.status === "solicitado").reduce((sum, w) => sum + w.valor, 0);
  const withdrawn = withdrawals.filter((w) => w.status === "pago").reduce((sum, w) => sum + w.valor, 0);
  return {
    available: roundCents(Math.max(0, released - requested - withdrawn)),
    pending: roundCents(pending),
    requested: roundCents(requested),
    withdrawn: roundCents(withdrawn),
    earned: roundCents(released + pending),
  };
}

export const WITHDRAW_MIN = 20;

/** Chave PIX: CPF, CNPJ, e-mail, celular (+55…) ou chave aleatória. Devolve a chave limpa ou null. */
export function cleanPixKey(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return text.toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text) && text.length <= 77) return text.toLowerCase();
  const digits = text.replace(/\D/g, "");
  if (/^\+?55/.test(text.replace(/[\s()-]/g, "")) && /^55\d{10,11}$/.test(digits)) return `+${digits}`;
  if (digits.length === 11 || digits.length === 14) return digits;
  return null;
}

// ---------------------------------------------------------------------------------- divulgação

/** Nome curto do link de divulgação (?ref=…): 2 a 30 letras minúsculas, números e hífen. */
export function linkSlugError(value: string): string | null {
  return /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])$/.test(value) ? null : "Use de 2 a 30 letras minúsculas, números e hífen.";
}

/** Dia (AAAA-MM-DD) no horário de Brasília, para somar visitas por dia. */
export function dayKey(date = new Date()): string {
  return new Date(date.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

/** Dia (AAAA-MM-DD, Brasília) de N dias atrás. */
export function dayKeyDaysAgo(days: number, now = new Date()): string {
  return dayKey(new Date(now.getTime() - days * 86_400_000));
}
