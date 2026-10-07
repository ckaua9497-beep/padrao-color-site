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

/** "1,5" ou "1.5" → 1,5; vazio ou inválido → 0. */
export function parseMeasure(text: string): number {
  const value = Number(text.trim().replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

const FORMAT_KEY = /formato|tamanho|medida/i;
const CUSTOM_VALUE = /personaliz/i;

/**
 * O preço da seleção é por m²? Vale para todo produto com medida livre, exceto quando ele também vende
 * formatos fixos com preço por peça (Faixa "2,00x0,60m", PS "Até 15x21cm") e um deles está escolhido:
 * aí o m² só vale na opção "Personalize a sua Medida"/"Personalizado".
 */
export function usesArea(options: Record<string, string[]>, selection: Selection, customSize: CustomSize | null | undefined): boolean {
  if (!customSize) return false;
  const key = Object.keys(options).find((k) => FORMAT_KEY.test(cleanOptionLabel(k)) && options[k].some((v) => CUSTOM_VALUE.test(v)));
  if (!key) return true;
  return CUSTOM_VALUE.test(selection[key] ?? "");
}

/** Medida em cm dentro dos limites do produto (limites em metros; 0 = sem limite). */
export function fitsLimits(widthCm: number, heightCm: number, limits: CustomSize | null | undefined): boolean {
  if (!limits) return widthCm > 0 && heightCm > 0;
  return areaQuote(1, widthCm, heightCm, limits).error === null;
}

// Medidas rápidas por tipo de peça (cm). O subtipo vence o tipo ("strip" = faixa, "mini" = mini banner).
const PRESETS: Record<string, [number, number][]> = {
  strip: [[200, 60], [300, 70], [300, 80], [400, 80], [500, 100]],
  mini: [[30, 40], [40, 60], [50, 70], [60, 80]],
  banner: [[60, 90], [80, 120], [90, 120], [100, 150], [120, 200]],
  lightbox: [[50, 70], [70, 100], [100, 150], [150, 200]],
  sticker: [[10, 10], [20, 20], [30, 30], [50, 50], [100, 100]],
  wallpaper: [[100, 250], [200, 250], [300, 270], [400, 270]],
  // Tecido: o rolo limita um dos lados (1,45 m na sublimação, 1,55 m no U.V.); a lista cobre os dois sentidos.
  cloth: [[100, 100], [145, 100], [100, 145], [150, 100], [200, 145], [145, 200], [300, 145]],
  neon: [[50, 50], [70, 50], [100, 60], [150, 80]],
  panel: [[30, 20], [40, 30], [60, 40], [100, 50], [120, 60]],
  acrylic: [[30, 20], [40, 30], [60, 40], [90, 60]],
  sheet: [[20, 30], [30, 45], [60, 90], [100, 100]],
};
const FALLBACK_PRESETS: [number, number][] = [[50, 50], [100, 50], [100, 100], [150, 100]];

/** Até 5 medidas rápidas que cabem nos limites do produto. */
export function sizePresets(kind: string, variant: string | null, limits: CustomSize | null | undefined): [number, number][] {
  const list = (variant ? PRESETS[variant] : undefined) ?? PRESETS[kind] ?? FALLBACK_PRESETS;
  return list.filter(([w, h]) => fitsLimits(w, h, limits)).slice(0, 5);
}

/** Medida inicial: a primeira rápida que cabe; senão 100 × 100 cm ajustado aos limites. */
export function defaultSize(kind: string, variant: string | null, limits: CustomSize | null | undefined): [number, number] {
  const preset = sizePresets(kind, variant, limits)[0];
  if (preset) return preset;
  const clamp = (value: number, min = 0, max = 0) => {
    const atLeast = Math.max(value, min * 100);
    return Math.round(max ? Math.min(atLeast, max * 100) : atLeast);
  };
  return [clamp(100, limits?.minWidth, limits?.maxWidth), clamp(100, limits?.minHeight, limits?.maxHeight)];
}

const fmtArea = (m2: number) => `${m2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`;

/** Resumo dos limites para o cliente: "Largura até 2 m · altura até 50 m · cobrança mínima de 0,5 m²". */
export function limitsHint(limits: CustomSize | null | undefined): string | null {
  if (!limits) return null;
  const range = (label: string, min: number, max: number) => {
    if (min && max) return `${label} de ${fmtM(min)} a ${fmtM(max)}`;
    if (max) return `${label} até ${fmtM(max)}`;
    if (min) return `${label} a partir de ${fmtM(min)}`;
    return null;
  };
  const parts = [
    range("largura", limits.minWidth, limits.maxWidth),
    range("altura", limits.minHeight, limits.maxHeight),
    limits.maxArea ? `área até ${fmtArea(limits.maxArea)}` : null,
    limits.minArea ? `cobrança mínima de ${fmtArea(limits.minArea)}` : null,
  ].filter(Boolean) as string[];
  if (!parts.length) return null;
  const text = parts.join(" · ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatArea(m2: number): string {
  return fmtArea(m2);
}

// ---------------------------------------------------------------------------------- grade de tamanhos

export type SizeCounts = Record<string, number>;

export function sizeTotal(counts: SizeCounts): number {
  return Object.values(counts).reduce((sum, n) => sum + (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0), 0);
}

/** "P×2, M×3" na ordem da grade (só os tamanhos pedidos). */
export function sizeSummary(sizes: string[], counts: SizeCounts): string {
  return sizes
    .filter((size) => (counts[size] ?? 0) > 0)
    .map((size) => `${size}×${counts[size]}`)
    .join(", ");
}

/** Erro da grade quando o total sai do mínimo/máximo do produto; null = pode pedir. */
export function sizeError(total: number, minQty: number, maxQty: number): string | null {
  const min = Math.max(1, minQty);
  if (total < min) {
    return min > 1 ? `Este produto é vendido a partir de ${min.toLocaleString("pt-BR")} peças. Faltam ${(min - total).toLocaleString("pt-BR")}.` : "Escolha a quantidade de pelo menos um tamanho.";
  }
  if (maxQty && total > maxQty) return `Este produto vai até ${maxQty.toLocaleString("pt-BR")} peças. Para mais, escolha a versão para lotes maiores.`;
  return null;
}

// ---------------------------------------------------------------------------------- prazo

export type Speed = "economico" | "expresso";

/** O expresso só aparece quando a API informa e ele muda o preço ou o prazo. */
export function hasExpress(q: Pick<Quote, "price" | "leadDays" | "expressPrice" | "expressDays">): boolean {
  if (q.expressPrice === null && q.expressDays === null) return false;
  const price = q.expressPrice ?? q.price;
  const days = q.expressDays ?? q.leadDays;
  return price !== q.price || days !== q.leadDays;
}

/** Preço (por m² quando for medida livre) e prazo no ritmo escolhido. */
export function speedQuote(q: Quote, speed: Speed): { price: number; leadDays: number | null } {
  if (speed === "expresso" && hasExpress(q)) return { price: q.expressPrice ?? q.price, leadDays: q.expressDays ?? q.leadDays };
  return { price: q.price, leadDays: q.leadDays };
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
