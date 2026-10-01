import type { Variation } from "./catalog";

export type Selection = Record<string, string>;

export type Quote = {
  price: number;
  qty: number;
  leadDays: number | null;
  exact: boolean;
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
    return { ...fallback, exact: false };
  }
  const chosen = Object.keys(selection).length;
  const exact = chosen > 0 && chosen >= totalKeys;
  return { price: best.p, qty: best.q || 1, leadDays: best.d ?? fallback.leadDays, exact };
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

export function cheapestFor(variations: Variation[], key: string, value: string): number | null {
  let min: number | null = null;
  for (const variation of variations) {
    if (variation.v[key] !== value) continue;
    if (min === null || variation.p < min) min = variation.p;
  }
  return min;
}
