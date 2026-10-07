import type { CustomSize, Variation } from "./catalog";

export type Selection = Record<string, string>;

export type Quote = {
  /** Preço no prazo econômico (por m² quando o produto tem medida livre). */
  price: number;
  qty: number;
  leadDays: number | null;
  exact: boolean;
  /** Variação escolhida (o `id` é o produto da API que vai no pedido). */
  variation: Variation | null;
  /** Preço e prazo no expresso, quando a API informa. */
  expressPrice: number | null;
  expressDays: number | null;
};

export function optionKeys(options: Record<string, string[]>): string[] {
  return Object.keys(options).sort((a, b) => {
    const na = /^\d+/.exec(a)?.[0];
    const nb = /^\d+/.exec(b)?.[0];
    if (na && nb) return Number(na) - Number(nb);
    return 0;
  });
}

export function cleanOptionLabel(key: string): string {
  return key.replace(/^\d+\s*-\s*/, "");
}

function matches(variation: Variation, selection: Selection): number {
  let hits = 0;
  for (const [key, value] of Object.entries(selection)) {
    if (variation.v[key] === undefined) continue;
    if (variation.v[key] !== value) return -1;
    hits += 1;
  }
  return hits;
}

export function quote(
  variations: Variation[],
  selection: Selection,
  fallback: { price: number; qty: number; leadDays: number | null },
  totalKeys: number,
): Quote {
  let best: Variation | null = null;
  let bestHits = -1;
  for (const variation of variations) {
    const hits = matches(variation, selection);
    if (hits < 0) continue;
    if (hits > bestHits || (hits === bestHits && best && variation.p < best.p)) {
      best = variation;
      bestHits = hits;
    }
  }
  if (!best) {
    return { ...fallback, exact: false, variation: null, expressPrice: null, expressDays: null };
  }
  const chosen = Object.keys(selection).length;
  const exact = chosen > 0 && chosen >= totalKeys;
  return {
    price: best.p,
    qty: best.q || 1,
    leadDays: best.d ?? fallback.leadDays,
    exact,
    variation: best,
    expressPrice: best.pe && best.pe > 0 ? best.pe : null,
    expressDays: best.de ?? null,
  };
}

// ---------------------------------------------------------------------------------- medida livre (m²)

export type AreaQuote = {
  /** Área pedida em m². */
  area: number;
  /** Área cobrada (respeita a área mínima do produto). */
  billedArea: number;
  price: number;
  /** Mensagem quando a medida sai dos limites do produto; null = medida válida. */
  error: string | null;
};

const fmtM = (m: number) => `${m.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m`;

/**
 * Preço de produto vendido por m² (banner, adesivo, papel, lona, tecido): preço da variação (formato 1x1)
 * × área. A API não calcula m²: o site calcula e manda o valor no `precoTotal` do pedido.
 */
export function areaQuote(pricePerM2: number, widthCm: number, heightCm: number, limits?: CustomSize | null): AreaQuote {
  const w = Math.max(0, widthCm) / 100;
  const h = Math.max(0, heightCm) / 100;
  const area = Math.round(w * h * 10_000) / 10_000;
  let error: string | null = null;
  if (!w || !h) error = "Informe largura e altura.";
  else if (limits) {
    if (limits.maxWidth && w > limits.maxWidth) error = `Largura máxima: ${fmtM(limits.maxWidth)}.`;
    else if (limits.maxHeight && h > limits.maxHeight) error = `Altura máxima: ${fmtM(limits.maxHeight)}.`;
    else if (limits.minWidth && w < limits.minWidth) error = `Largura mínima: ${fmtM(limits.minWidth)}.`;
    else if (limits.minHeight && h < limits.minHeight) error = `Altura mínima: ${fmtM(limits.minHeight)}.`;
    else if (limits.maxArea && area > limits.maxArea) error = `Área máxima: ${limits.maxArea.toLocaleString("pt-BR")} m².`;
  }
  const billedArea = Math.max(area, limits?.minArea ?? 0);
  return { area, billedArea, price: Math.round(pricePerM2 * billedArea * 100) / 100, error };
}

export function availableValues(
  key: string,
  options: Record<string, string[]>,
  variations: Variation[],
  selection: Selection,
): Set<string> {
  const others = Object.fromEntries(Object.entries(selection).filter(([k]) => k !== key));
  const seen = new Set<string>();
  for (const variation of variations) {
    if (matches(variation, others) < 0) continue;
    const value = variation.v[key];
    if (value) seen.add(value);
  }
  if (seen.size === 0) return new Set(options[key]);
  return seen;
}

/** Desconto no PIX sobre o preço de tabela (padrao-loja/BRIEFING.md). */
export const PIX_DISCOUNT = 0.05;

export function pixPrice(value: number): number {
  return Math.round(value * (1 - PIX_DISCOUNT) * 100) / 100;
}
