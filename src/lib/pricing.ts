import type { CustomSize, Variation } from "./catalog";

export type Selection = Record<string, string>;

/**
 * Mínimo e máximo de unidades: a faixa da variação (Caderno "De 11 até 100" → 11 a 100), ou a do produto.
 * `max` 0 = sem máximo.
 */
export function unitLimits(product: { minQty?: number | null; maxQty?: number | null }, variation?: { mn?: number; mx?: number } | null): { min: number; max: number } {
  const min = Math.max(1, Math.round(variation?.mn ?? product.minQty ?? 1) || 1);
  const max = Math.max(0, Math.round(variation?.mx ?? product.maxQty ?? 0) || 0);
  return { min, max: max > 0 ? Math.max(min, max) : 0 };
}

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

/** Opção que escolhe a medida ou o formato ("Formato", "Tamanho", "Medida"). */
const FORMAT_KEY = /formato|tamanho|medida/i;

/**
 * Área mínima cobrada por item nos produtos por m² (revisão da Padrão de 25/10/2026: "Produtos por m² - Todos possuem
 * o valor mínimo de 1m2"). Vale uma vez no item, sobre a área de todas as peças, e não por peça.
 */
export const AREA_MIN_ITEM_M2 = 1;
/** LED Neon montado pelo cliente (Frase e Logotipo): cobrança mínima de 0,25 m² por peça, sem o mínimo de 1 m² do item. */
export const NEON_MIN_AREA_M2 = 0.25;

/** Limites (metros) e mínimos de cobrança de um item por m². */
export type AreaRules = {
  limits: CustomSize | null;
  /** Área mínima cobrada por peça (tamanho_minimo da API; 0,25 m² no LED). */
  minPieceM2: number;
  /** Área mínima cobrada no item inteiro (1 m²; 0 no LED). */
  minItemM2: number;
};

/** Limites da medida livre da variação: os próprios dela (`lm`, ex.: PS "Até 15x21cm") ou os do produto. */
export function sizeLimitsOf(customSize: CustomSize | null | undefined, variation?: Pick<Variation, "lm"> | null): CustomSize | null {
  if (!customSize) return null;
  const lm = variation?.lm;
  return lm ? { minWidth: lm[0], maxWidth: lm[1], minHeight: lm[2], maxHeight: lm[3], minArea: lm[4], maxArea: lm[5] } : customSize;
}

/**
 * "Crie sua Frase em Led Neon" (290), regras de medida do site atual: largura de 15 a 198 cm; altura de pelo menos 15 cm
 * por linha (+3 cm com mais de uma linha) e abaixo de 98 cm; a opção Formato "Até 50cm" vai até 50 cm de largura e
 * "Acima de 50cm" começa nos 50 cm. Acima de 175 cm de largura, o letreiro só sai retirado na loja de São João de Meriti.
 */
export const NEON_FRASE = { minWidthCm: 15, maxWidthCm: 198, splitWidthCm: 50, lineHeightCm: 15, extraLinesCm: 3, maxHeightCm: 98, pickupOnlyAboveCm: 175 } as const;

/** Altura mínima do letreiro: 15 cm por linha, mais 3 cm quando tem mais de uma. */
export function neonFraseMinHeightCm(lines: number): number {
  const n = Math.max(1, Math.round(lines) || 1);
  return n * NEON_FRASE.lineHeightCm + (n > 1 ? NEON_FRASE.extraLinesCm : 0);
}

/** Valor da opção de formato/tamanho da variação ("Até 50cm", "Acima de 50cm"). */
function formatOf(variation: Partial<Pick<Variation, "v">> | null | undefined): string {
  const entry = Object.entries(variation?.v ?? {}).find(([key]) => FORMAT_KEY.test(cleanOptionLabel(key)));
  return entry?.[1] ?? "";
}

/** Limites (metros) da Frase em LED para o formato escolhido e o número de linhas. */
export function neonFraseLimits(format: string, lines = 1): CustomSize {
  const upTo = /at[eé]\s*50/i.test(format);
  const above = /acima\s*de\s*50/i.test(format);
  return {
    minWidth: (above ? NEON_FRASE.splitWidthCm : NEON_FRASE.minWidthCm) / 100,
    maxWidth: (upTo ? NEON_FRASE.splitWidthCm : NEON_FRASE.maxWidthCm) / 100,
    minHeight: neonFraseMinHeightCm(lines) / 100,
    maxHeight: NEON_FRASE.maxHeightCm / 100,
    minArea: 0,
    maxArea: 0,
  };
}

/**
 * Regras de cobrança por m² do produto na variação escolhida (limites do SKU, mínimos da peça e do item). Na Frase em
 * LED, os limites saem do formato e de `lines` (as linhas de tubo do texto).
 */
export function areaRules(product: { customSize?: CustomSize | null; neon?: "frase" | "logo" }, variation?: (Pick<Variation, "lm"> & Partial<Pick<Variation, "v">>) | null, { lines = 1 }: { lines?: number } = {}): AreaRules {
  if (product.neon === "frase") return { limits: neonFraseLimits(formatOf(variation), lines), minPieceM2: NEON_MIN_AREA_M2, minItemM2: 0 };
  const limits = sizeLimitsOf(product.customSize, variation);
  if (product.neon) return { limits, minPieceM2: Math.max(limits?.minArea ?? 0, NEON_MIN_AREA_M2), minItemM2: 0 };
  return { limits, minPieceM2: limits?.minArea ?? 0, minItemM2: AREA_MIN_ITEM_M2 };
}

/** Regras de um item por m² só com os limites (materiais da fachada, conferências): mínimo de 1 m² no item. */
export function plainAreaRules(limits: CustomSize | null | undefined): AreaRules {
  return { limits: limits ?? null, minPieceM2: limits?.minArea ?? 0, minItemM2: AREA_MIN_ITEM_M2 };
}

export type AreaQuote = {
  /** Área pedida de uma peça, em m². */
  area: number;
  /** Área cobrada de uma peça (respeita a área mínima da peça). */
  billedArea: number;
  /** Área cobrada no item inteiro: peças × área da peça, no mínimo a do item (1 m²). */
  billedTotal: number;
  /** Total do item (só o produto): preço do m² × área cobrada no item. */
  total: number;
  /** Preço de uma peça para exibir (total ÷ peças). */
  price: number;
  /** O mínimo do item (1 m²) subiu o total. */
  itemMinimum: boolean;
  /** Mensagem quando a medida sai dos limites do produto; null = medida válida. */
  error: string | null;
};

const fmtM = (m: number) => `${m.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m`;

/**
 * Preço de produto vendido por m² (banner, adesivo, papel, lona, tecido, LED): preço da variação (formato 1x1) × área
 * cobrada, com `qty` peças iguais. A peça cobra no mínimo `minPieceM2` e o item, no mínimo `minItemM2` (1 m² uma vez
 * no item). A API não calcula m²: o site calcula e manda o valor no `precoTotal` do pedido.
 */
export function areaQuote(pricePerM2: number, widthCm: number, heightCm: number, rules: AreaRules, qty = 1): AreaQuote {
  const { limits } = rules;
  const pieces = Math.max(1, Math.round(qty) || 1);
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
  const billedArea = Math.max(area, rules.minPieceM2);
  const pieceTotal = Math.round(billedArea * pieces * 10_000) / 10_000;
  const billedTotal = Math.max(pieceTotal, rules.minItemM2);
  const total = Math.round(pricePerM2 * billedTotal * 100) / 100;
  return { area, billedArea, billedTotal, total, price: Math.round((total / pieces) * 100) / 100, itemMinimum: billedTotal > pieceTotal, error };
}

/** "1,5" ou "1.5" → 1,5; vazio ou inválido → 0. */
export function parseMeasure(text: string): number {
  const value = Number(text.trim().replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

const CUSTOM_VALUE = /personaliz/i;

/**
 * O preço da seleção é por m²? Com a variação escolhida, vale o que a API diz dela (`informa_medida`: a variação de
 * preço fixo de um grupo misto, como a Faixa "2,00x0,60m", vem com `a: 0`). Sem variação, o critério antigo: num
 * produto que também vende formatos fixos, o m² só vale na opção "Personalize a sua Medida"/"Personalizado".
 */
export function usesArea(options: Record<string, string[]>, selection: Selection, customSize: CustomSize | null | undefined, variation?: Pick<Variation, "a"> | null): boolean {
  if (!customSize) return false;
  if (variation) return variation.a !== 0;
  const key = Object.keys(options).find((k) => FORMAT_KEY.test(cleanOptionLabel(k)) && options[k].some((v) => CUSTOM_VALUE.test(v)));
  if (!key) return true;
  return CUSTOM_VALUE.test(selection[key] ?? "");
}

/** Medida em cm dentro dos limites do produto (limites em metros; 0 = sem limite). */
export function fitsLimits(widthCm: number, heightCm: number, limits: CustomSize | null | undefined): boolean {
  if (!limits) return widthCm > 0 && heightCm > 0;
  return areaQuote(1, widthCm, heightCm, plainAreaRules(limits)).error === null;
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

/**
 * Resumo dos limites para o cliente: "Largura até 2 m · altura até 50 m · cobrança mínima de 0,5 m² por peça · mínimo
 * de 1 m² no pedido". Com as regras do item, inclui os mínimos de cobrança.
 */
export function limitsHint(limits: CustomSize | null | undefined, rules?: Pick<AreaRules, "minPieceM2" | "minItemM2">): string | null {
  if (!limits && !rules) return null;
  const range = (label: string, min: number, max: number) => {
    if (min && max) return `${label} de ${fmtM(min)} a ${fmtM(max)}`;
    if (max) return `${label} até ${fmtM(max)}`;
    if (min) return `${label} a partir de ${fmtM(min)}`;
    return null;
  };
  const minPiece = rules ? rules.minPieceM2 : (limits?.minArea ?? 0);
  const parts = [
    limits ? range("largura", limits.minWidth, limits.maxWidth) : null,
    limits ? range("altura", limits.minHeight, limits.maxHeight) : null,
    limits?.maxArea ? `área até ${fmtArea(limits.maxArea)}` : null,
    minPiece ? `cobrança mínima de ${fmtArea(minPiece)} por peça` : null,
    rules?.minItemM2 ? `mínimo de ${fmtArea(rules.minItemM2)} no pedido` : null,
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

/*
 * Opções em passos: a API só tem algumas combinações (Cartão de Visita: 44 de 384), então cada passo mostra só os
 * valores que combinam com os passos anteriores, e escolher um valor ajusta os passos seguintes para uma variação
 * que existe. A seleção na tela é sempre a de uma variação real (o preço, o carrinho e o pedido batem).
 */

/** Variações que combinam com a seleção dos passos antes de `key` (na ordem de `keys`). */
function compatibleBefore(key: string, keys: readonly string[], variations: readonly Variation[], selection: Selection): Variation[] {
  const before = Object.fromEntries(keys.slice(0, Math.max(0, keys.indexOf(key))).filter((k) => selection[k] !== undefined).map((k) => [k, selection[k]]));
  return variations.filter((variation) => matches(variation, before) >= 0);
}

/** Valores do passo `key` que existem com o que foi escolhido nos passos anteriores, na ordem das opções. */
export function stepValues(key: string, keys: readonly string[], options: Record<string, string[]>, variations: readonly Variation[], selection: Selection): string[] {
  const seen = new Set(compatibleBefore(key, keys, variations, selection).map((variation) => variation.v[key]).filter(Boolean));
  const values = options[key] ?? [];
  return seen.size ? values.filter((value) => seen.has(value)) : values;
}

/**
 * Seleção depois de escolher `value` no passo `key`: a variação com esse valor que mantém mais passos (os primeiros
 * pesam mais; no empate, a mais barata). Os passos que mudam são os que não combinam com a escolha.
 */
export function chooseOption(keys: readonly string[], variations: readonly Variation[], selection: Selection, key: string, value: string): Selection {
  let best: Variation | null = null;
  let bestScore = -1;
  for (const variation of variations) {
    if (variation.v[key] !== undefined && variation.v[key] !== value) continue;
    let score = 0;
    keys.forEach((k, i) => {
      if (k !== key && variation.v[k] !== undefined && variation.v[k] === selection[k]) score += 2 ** (keys.length - i);
    });
    if (score > bestScore || (score === bestScore && best && variation.p > 0 && (best.p <= 0 || variation.p < best.p))) {
      best = variation;
      bestScore = score;
    }
  }
  const next: Selection = { ...selection, [key]: value };
  if (!best) return next;
  for (const k of keys) if (k !== key && best.v[k] !== undefined) next[k] = best.v[k];
  return next;
}

/** Ordem de exibição: quantidades pelo número (120, 210, 300, 1000); as outras opções como a API manda. */
export function displayOrder(key: string, values: readonly string[]): string[] {
  if (!/quantidade|tiragem/i.test(cleanOptionLabel(key))) return [...values];
  const lead = (value: string) => {
    const match = /^\s*(\d[\d.]*)/.exec(value);
    return match ? Number(match[1].replace(/\./g, "")) : NaN;
  };
  if (!values.every((value) => Number.isFinite(lead(value)))) return [...values];
  return [...values].sort((a, b) => lead(a) - lead(b));
}

/**
 * Desconto no PIX sobre o preço de tabela: só nas lojas da multiloja. A loja principal deixou de dar o desconto
 * (revisão da Padrão de 25/10/2026, "Observações Site Novo").
 */
export const PIX_DISCOUNT = 0.05;

export function pixPrice(value: number): number {
  return Math.round(value * (1 - PIX_DISCOUNT) * 100) / 100;
}
