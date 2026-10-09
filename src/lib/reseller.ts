import type { ApiProduto } from "./api/types";
import type { Variation } from "./catalog";

/*
 * Preço de revendedor (checklist "Conta, pedidos e checkout"): com a conta logada, revendedor vê e compra
 * pela tabela de revenda; conta comum fica no preço de balcão (o do catálogo).
 *
 * Regras públicas (padraocolor.com.br/institucional/nossas-categorias-de-revenda):
 * - Bronze é a tabela base de revenda; Prata e Ouro dão desconto sobre ela.
 * - Prata nível 1 = 3%, nível 2 = 5%; Ouro nível 1 = 7%, nível 2 = 10%.
 * - Os descontos Prata/Ouro valem só nos segmentos Offset e Comunicação Visual.
 *
 * Premissas (a API não documenta nada disso; ajustar aqui quando a Padrão confirmar):
 * - Revendedor = tabela diferente de "CLIENTE FINAL" (balcão) OU categoria exclusiva de revenda
 *   (Prata, Ouro, Diamante). Bronze sozinho não basta: a conta da integração é Bronze com tabela de balcão.
 * - A tabela de revenda vem do GET /produtos com o token do cliente; o desconto da categoria vai por cima,
 *   exceto quando o nome da tabela já cita a categoria (ex.: "REVENDA OURO"): aí o desconto já está no preço.
 * - "Prata 2"/"Ouro 2" (ou "nível 2") = nível 2; sem número = nível 1. Diamante não aparece na página
 *   pública: fica sem desconto extra até ter regra.
 * - Segmentos por categoria do catálogo em SEGMENT_CATEGORIES. Na dúvida a categoria fica de fora
 *   (sem desconto extra), para o site nunca mandar um precoTotal abaixo do que a Padrão pratica.
 */

/** Tabela de balcão na API (GET /cliente → tabela.nome). */
export const COUNTER_TABLE = "CLIENTE FINAL";

export type ResellerSegment = "offset" | "comunicacao-visual";

/** Categorias do catálogo (slug) em cada segmento com desconto Prata/Ouro. */
export const SEGMENT_CATEGORIES: Record<ResellerSegment, readonly string[]> = {
  // Impressos em papel da gráfica offset: cartões, folhetos, calendários, papelaria, embalagens, ímãs e tags.
  offset: ["cartoes-de-visita-e-postais", "folhetos", "calendarios", "escritorio", "embalagens", "promocional"],
  // Sinalização e grandes formatos: banners, lonas, placas, wind banners e adesivos/vinil.
  "comunicacao-visual": ["banner-e-lonas", "comunicacao-visual", "adesivos-e-rotulos"],
};

export const SEGMENT_LABELS: Record<ResellerSegment, string> = { offset: "Offset", "comunicacao-visual": "Comunicação Visual" };

export type Tier = "bronze" | "prata" | "ouro" | "diamante" | "outra";

/** Desconto por categoria e nível sobre a tabela base de revenda. */
export const TIER_DISCOUNTS: Record<"prata" | "ouro", Record<1 | 2, number>> = {
  prata: { 1: 0.03, 2: 0.05 },
  ouro: { 1: 0.07, 2: 0.1 },
};

const RESELLER_ONLY_TIERS: ReadonlySet<Tier> = new Set<Tier>(["prata", "ouro", "diamante"]);

export type ResellerAccount = { priceTable?: string | null; category?: string | null };

function plain(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Mesmo slug das rotas de categoria (scripts/sync-catalog.mjs): "Brindes & Presentes" → "brindes-e-presentes". */
export function categorySlug(name: string): string {
  return plain(name)
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "Ouro 2" → ouro nível 2; "Prata" → prata nível 1; vazio → null. */
export function categoryTier(category: string | null | undefined): { tier: Tier; level: 1 | 2 } | null {
  const text = plain(category);
  if (!text) return null;
  const match = /^(bronze|prata|ouro|diamante)(?![a-z])(?:\s*(?:-|nivel|niv\.?|n\.?|nº|n°)?\s*(\d))?/.exec(text);
  if (!match) return { tier: "outra", level: 1 };
  return { tier: match[1] as Tier, level: match[2] === "2" ? 2 : 1 };
}

export function isResellerAccount(account: ResellerAccount): boolean {
  const table = plain(account.priceTable);
  if (table && table !== plain(COUNTER_TABLE)) return true;
  const tier = categoryTier(account.category);
  return tier !== null && RESELLER_ONLY_TIERS.has(tier.tier);
}

/** Segmento da categoria do produto (nome ou slug); null = fora de Offset e Comunicação Visual. */
export function segmentOf(productCategory: string | null | undefined): ResellerSegment | null {
  if (!productCategory) return null;
  const slug = categorySlug(productCategory);
  for (const segment of Object.keys(SEGMENT_CATEGORIES) as ResellerSegment[]) {
    if (SEGMENT_CATEGORIES[segment].includes(slug)) return segment;
  }
  return null;
}

/** A tabela já é da categoria (ex.: "REVENDA OURO")? Então o desconto da categoria já está no preço. */
export function tableIncludesTier(priceTable: string | null | undefined): boolean {
  return /(^|[^a-z])(prata|ouro|diamante)(?![a-z])/.test(plain(priceTable));
}

/** Desconto da categoria de revenda (Prata/Ouro) para a categoria do produto. 0 = sem desconto extra. */
export function resellerDiscountRate(account: ResellerAccount, productCategory: string | null | undefined): number {
  if (!isResellerAccount(account) || !segmentOf(productCategory) || tableIncludesTier(account.priceTable)) return 0;
  const tier = categoryTier(account.category);
  if (tier?.tier === "prata" || tier?.tier === "ouro") return TIER_DISCOUNTS[tier.tier][tier.level];
  return 0;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Aplica o desconto nos preços econômico e expresso (arredonda em centavos). */
export function applyResellerDiscount(variations: Variation[], rate: number): Variation[] {
  if (!(rate > 0) || rate >= 1) return variations;
  return variations.map((variation) => ({
    ...variation,
    p: round2(variation.p * (1 - rate)),
    ...(variation.pe !== undefined ? { pe: round2(variation.pe * (1 - rate)) } : {}),
  }));
}

/** Texto do benefício da categoria para a conta e o checkout ("Prata nível 2: 5% em Offset e Comunicação Visual"). */
export function describeResellerBenefit(account: ResellerAccount): string | null {
  if (!isResellerAccount(account)) return null;
  const tier = categoryTier(account.category);
  if ((tier?.tier === "prata" || tier?.tier === "ouro") && !tableIncludesTier(account.priceTable)) {
    const rate = TIER_DISCOUNTS[tier.tier][tier.level];
    const name = tier.tier === "prata" ? "Prata" : "Ouro";
    return `${name} nível ${tier.level}: ${Math.round(rate * 100)}% de desconto em ${SEGMENT_LABELS.offset} e ${SEGMENT_LABELS["comunicacao-visual"]}, sobre a tabela de revenda.`;
  }
  return "Preços da tabela de revenda em todo o site.";
}

const num = (value: unknown): number => {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Produto da API → variação no formato do catálogo (mesmo mapeamento do scripts/sync-catalog.mjs). */
export function variationsFromApi(rows: ApiProduto[] | null | undefined): Variation[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && Number.isInteger(Number(row.id)) && Number(row.id) > 0)
    .map((row) => {
      const economico = num(row.preco?.economico);
      const expresso = row.preco?.expresso === undefined || row.preco?.expresso === null ? economico : num(row.preco.expresso);
      return {
        id: Number(row.id),
        p: economico,
        pe: expresso,
        q: num(row.quantidade) || 1,
        d: typeof row.prazo?.economico === "number" ? row.prazo.economico : null,
        de: typeof row.prazo?.expresso === "number" ? row.prazo.expresso : null,
        v: row.variacoes && typeof row.variacoes === "object" ? row.variacoes : {},
        // Faixa de quantidade da linha (a tabela de revenda vem completa da API).
        ...(num(row.qtde_minima) > 0 ? { mn: num(row.qtde_minima) } : {}),
        ...(num(row.qtde_maxima) > 0 ? { mx: num(row.qtde_maxima) } : {}),
      };
    });
}
