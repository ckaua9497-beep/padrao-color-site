// Manequim da camisa: corpo pelo tamanho e pelo tipo de corpo, caimento e sugestão de tamanho.
// TS puro (sem React nem three): o passo "Sua arte" e o modelo 3D (models/textile.tsx) usam as mesmas contas.

import type { BodyType, MannequinSettings } from "@/components/mockup/art";
import type { SizeChartRow } from "@/lib/catalog";

/*
 * SUPOSIÇÃO (a API não tem tabela de tamanho × peso): a "Tabela de Medidas" da API traz, por tamanho,
 * a largura da camisa (meio tórax, peça deitada) e o comprimento (do ombro à barra), mas nada liga o
 * tamanho ao corpo de quem veste. O corpo do manequim vem das tabelas abaixo:
 * - adulto com altura fixa de 175 cm; infantil com a altura média da idade do tamanho ("8 anos" → 128 cm);
 * - circunferências de tórax, cintura e quadril (cm) em três corpos — "mais magro", "intermediário" e
 *   "mais cheio" —, aproximadas de tabelas de vestuário (adulto) e de curvas de crescimento (infantil);
 * - caimento pela folga no tórax (2 × largura da camisa − tórax do corpo): justa abaixo de 6 cm,
 *   ideal de 6 a 18 cm e folgada acima de 18 cm.
 */

export type Girth = { chest: number; waist: number; hip: number };

export type MannequinBody = Girth & { body: BodyType; kid: boolean; age: number | null; heightCm: number };

export const BODY_TYPES: readonly { value: BodyType; label: string }[] = [
  { value: "magro", label: "Mais magro" },
  { value: "medio", label: "Intermediário" },
  { value: "cheio", label: "Mais cheio" },
];

export const ADULT_HEIGHT_CM = 175;

/** Adulto (175 cm): tórax, cintura e quadril por tipo de corpo. */
export const ADULT_GIRTH: Record<BodyType, Girth> = {
  magro: { chest: 86, waist: 72, hip: 88 },
  medio: { chest: 96, waist: 84, hip: 98 },
  cheio: { chest: 110, waist: 104, hip: 112 },
};

/** Infantil "intermediário" por idade: altura e circunferências (cm). */
const KID_MEDIUM: readonly ({ age: number; height: number } & Girth)[] = [
  { age: 2, height: 88, chest: 52, waist: 50, hip: 53 },
  { age: 4, height: 103, chest: 55, waist: 52, hip: 57 },
  { age: 6, height: 116, chest: 58, waist: 54, hip: 61 },
  { age: 8, height: 128, chest: 63, waist: 57, hip: 66 },
  { age: 10, height: 140, chest: 68, waist: 61, hip: 72 },
  { age: 12, height: 152, chest: 74, waist: 65, hip: 79 },
  { age: 14, height: 162, chest: 80, waist: 69, hip: 85 },
  { age: 16, height: 168, chest: 86, waist: 73, hip: 90 },
];

/** Infantil: o tipo de corpo multiplica as medidas do intermediário. */
const KID_FACTOR: Record<BodyType, Girth> = {
  magro: { chest: 0.92, waist: 0.9, hip: 0.93 },
  medio: { chest: 1, waist: 1, hip: 1 },
  cheio: { chest: 1.12, waist: 1.18, hip: 1.12 },
};

/** Grade usada quando o produto não traz a Tabela de Medidas (a mesma das camisas e abadás da API). */
export const DEFAULT_SIZE_CHART: readonly SizeChartRow[] = [
  { size: "6 anos", widthCm: 35, lengthCm: 49 },
  { size: "8 anos", widthCm: 38, lengthCm: 52 },
  { size: "10 anos", widthCm: 41, lengthCm: 56 },
  { size: "12 anos", widthCm: 43, lengthCm: 58 },
  { size: "P", widthCm: 50, lengthCm: 68 },
  { size: "M", widthCm: 54, lengthCm: 71 },
  { size: "G", widthCm: 57, lengthCm: 76 },
  { size: "GG", widthCm: 63, lengthCm: 84 },
  { size: "XG", widthCm: 68, lengthCm: 88 },
];

/** Folga no tórax (cm) que separa justa / ideal / folgada. */
export const FIT_RANGE = { tight: 6, loose: 18 } as const;
const IDEAL_EASE = 12;

export type Fit = "folgada" | "ideal" | "justa";

export function sizeKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Idade do tamanho infantil ("8 Anos" → 8); null nos tamanhos adultos. */
export function kidAge(size: string): number | null {
  const match = /(\d{1,2})\s*anos?\b/.exec(sizeKey(size));
  return match ? Number(match[1]) : null;
}

export type SizeRow = { size: string; widthCm: number; lengthCm: number; kid: boolean };

/**
 * Tamanhos do manequim: a grade do produto com as medidas da Tabela de Medidas da API; tamanho sem
 * medida própria usa a grade padrão; sem grade nenhuma, a grade padrão inteira.
 */
export function sizeRows(sizes: readonly string[] | null | undefined, chart: readonly SizeChartRow[] | null | undefined): SizeRow[] {
  const standard = new Map(DEFAULT_SIZE_CHART.map((row) => [sizeKey(row.size), row] as const));
  const own = new Map<string, SizeChartRow>();
  for (const row of chart ?? []) if (row.widthCm > 0 && row.lengthCm > 0) own.set(sizeKey(row.size), row);
  const labels = sizes?.length ? sizes : chart?.length ? chart.map((row) => row.size) : DEFAULT_SIZE_CHART.map((row) => row.size);
  const rows: SizeRow[] = [];
  const seen = new Set<string>();
  for (const label of labels) {
    const key = sizeKey(label);
    const measures = own.get(key) ?? standard.get(key);
    if (seen.has(key) || !measures) continue;
    seen.add(key);
    rows.push({ size: label, widthCm: measures.widthCm, lengthCm: measures.lengthCm, kid: kidAge(label) !== null });
  }
  if (rows.length) return rows;
  return DEFAULT_SIZE_CHART.map((row) => ({ size: row.size, widthCm: row.widthCm, lengthCm: row.lengthCm, kid: kidAge(row.size) !== null }));
}

export function rowOf(rows: readonly SizeRow[], size: string): SizeRow | null {
  const key = sizeKey(size);
  return rows.find((row) => sizeKey(row.size) === key) ?? null;
}

/** Tamanho inicial do manequim: M, senão o do meio da grade adulta. */
export function defaultSize(rows: readonly SizeRow[]): string {
  const medium = rows.find((row) => sizeKey(row.size) === "m");
  if (medium) return medium.size;
  const adult = rows.filter((row) => !row.kid);
  const list = adult.length ? adult : rows;
  return list[Math.floor((list.length - 1) / 2)]?.size ?? "M";
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Corpo do manequim: adulto de 175 cm ou a criança da idade do tamanho, no tipo de corpo escolhido. */
export function bodyFor(size: string, body: BodyType): MannequinBody {
  const age = kidAge(size);
  if (age === null) return { ...ADULT_GIRTH[body], body, kid: false, age: null, heightCm: ADULT_HEIGHT_CM };
  const clamped = Math.min(16, Math.max(2, age));
  let i = 0;
  while (i < KID_MEDIUM.length - 2 && KID_MEDIUM[i + 1].age < clamped) i += 1;
  const a = KID_MEDIUM[i];
  const b = KID_MEDIUM[i + 1];
  const t = Math.min(1, Math.max(0, (clamped - a.age) / (b.age - a.age)));
  const f = KID_FACTOR[body];
  return {
    chest: lerp(a.chest, b.chest, t) * f.chest,
    waist: lerp(a.waist, b.waist, t) * f.waist,
    hip: lerp(a.hip, b.hip, t) * f.hip,
    body,
    kid: true,
    age: clamped,
    heightCm: lerp(a.height, b.height, t),
  };
}

/** Folga no tórax (cm): circunferência da camisa (2 × largura) menos o tórax do corpo. */
export function easeOf(widthCm: number, body: MannequinBody): number {
  return widthCm * 2 - body.chest;
}

export function fitOf(ease: number): Fit {
  if (ease < FIT_RANGE.tight) return "justa";
  if (ease > FIT_RANGE.loose) return "folgada";
  return "ideal";
}

/** Tamanho com o caimento mais perto do ideal (≈12 cm de folga) para o corpo, no mesmo grupo (adulto ou infantil). */
export function suggestSize(rows: readonly SizeRow[], body: MannequinBody): string | null {
  let best: SizeRow | null = null;
  let bestScore = Infinity;
  for (const row of rows) {
    if (row.kid !== body.kid) continue;
    const ease = easeOf(row.widthCm, body);
    // Justa só entra se nada folgar: prefere a menor das que vestem bem.
    const score = ease < FIT_RANGE.tight ? 1000 + (FIT_RANGE.tight - ease) : Math.abs(ease - IDEAL_EASE);
    if (score < bestScore) {
      best = row;
      bestScore = score;
    }
  }
  return best?.size ?? null;
}

/** Manequim num tamanho e corpo, com as medidas da grade (vão para o 3D). */
export function mannequinFor(rows: readonly SizeRow[], size: string, body: BodyType): MannequinSettings {
  const row = rowOf(rows, size);
  return { size, body, widthCm: row?.widthCm ?? null, lengthCm: row?.lengthCm ?? null };
}

/** Manequim efetivo: undefined = padrão (M, intermediário); null = sem manequim. */
export function effectiveMannequin(m: MannequinSettings | null | undefined, rows: readonly SizeRow[]): MannequinSettings | null {
  if (m === null) return null;
  if (m) return m;
  return mannequinFor(rows, defaultSize(rows), "medio");
}

/** Medidas da camisa e corpo para o modelo 3D (sem grade: tabela padrão; tamanho desconhecido: M). */
export function dressFor(size: string, body: BodyType, widthCm?: number | null, lengthCm?: number | null): { widthCm: number; lengthCm: number; body: MannequinBody } {
  const standard = DEFAULT_SIZE_CHART.find((row) => sizeKey(row.size) === sizeKey(size)) ?? DEFAULT_SIZE_CHART[5];
  return {
    widthCm: widthCm && widthCm > 0 ? widthCm : standard.widthCm,
    lengthCm: lengthCm && lengthCm > 0 ? lengthCm : standard.lengthCm,
    body: bodyFor(size, body),
  };
}

// ---------------------------------------------------------------------------- figura 3D

/** Meia largura e meia profundidade (cm) de uma seção elíptica do tronco. */
export type Section = { a: number; b: number };

export type Figure = {
  heightCm: number;
  /** Alturas em cm a partir do chão: ponto alto do ombro (de onde se mede a camisa), axila, cintura, quadril, gancho. */
  hps: number;
  armpit: number;
  waist: number;
  hip: number;
  crotch: number;
  shoulderHalf: number;
  /** Seção do tronco numa altura (cm do chão). */
  section: (y: number) => Section;
  neck: { a: number; b: number; length: number };
  head: { w: number; h: number; d: number };
  arm: { root: number; end: number };
};

/** Meia largura de uma elipse com essa circunferência e razão profundidade/largura (Ramanujan). */
function halfWidth(circumference: number, ratio: number): number {
  return circumference / (Math.PI * (3 * (1 + ratio) - Math.sqrt((3 + ratio) * (1 + 3 * ratio))));
}

/** Corpo estilizado do manequim (tronco, pescoço, cabeça e braços) nas medidas do corpo escolhido. */
export function figureOf(body: MannequinBody): Figure {
  const H = body.heightCm;
  // 0 = 2 anos … 1 = adulto (cabeça proporcionalmente maior na criança).
  const grown = body.kid ? Math.min(1, Math.max(0, ((body.age ?? 8) - 2) / 14)) : 1;
  const build = body.body === "magro" ? 0.93 : body.body === "cheio" ? 1.1 : 1;
  const headH = body.kid ? lerp(17.5, 22, grown) : 22.5;
  const neckLength = body.kid ? lerp(4.5, 7, grown) : 8;
  const hps = H - headH - neckLength;
  const armpit = hps - 0.1 * H;
  const waist = 0.6 * H;
  const hip = 0.505 * H;
  const crotch = 0.465 * H;
  const shoulderHalf = (body.kid ? 0.112 : 0.118) * H * (body.body === "cheio" ? 1.04 : body.body === "magro" ? 0.97 : 1);

  const chestRatio = body.kid ? 0.78 : 0.68;
  const waistRatio = body.body === "cheio" ? 0.86 : body.kid ? 0.82 : 0.74;
  const hipRatio = body.kid ? 0.78 : 0.72;
  const ca = halfWidth(body.chest, chestRatio);
  const wa = halfWidth(body.waist, waistRatio);
  const ha = halfWidth(body.hip, hipRatio);
  const chest: Section = { a: ca, b: ca * chestRatio };
  const nodes: [number, Section][] = [
    [0.3 * H, { a: ha * 0.86, b: ha * hipRatio * 0.86 }],
    [crotch, { a: ha * 0.97, b: ha * hipRatio * 0.96 }],
    [hip, { a: ha, b: ha * hipRatio }],
    [waist, { a: wa, b: wa * waistRatio }],
    [armpit - 0.02 * H, chest],
    [armpit + 0.03 * H, { a: Math.max(ca, shoulderHalf * 0.96), b: chest.b * 0.95 }],
    [hps - 0.025 * H, { a: shoulderHalf, b: chest.b * 0.85 }],
    [H, { a: shoulderHalf, b: chest.b * 0.7 }],
  ];
  const section = (y: number): Section => {
    if (y <= nodes[0][0]) return nodes[0][1];
    for (let i = 1; i < nodes.length; i += 1) {
      const [y1, s1] = nodes[i];
      if (y <= y1) {
        const [y0, s0] = nodes[i - 1];
        const t = (y - y0) / Math.max(1e-6, y1 - y0);
        const k = t * t * (3 - 2 * t);
        return { a: lerp(s0.a, s1.a, k), b: lerp(s0.b, s1.b, k) };
      }
    }
    return nodes[nodes.length - 1][1];
  };
  const neckA = (body.kid ? lerp(4.2, 5.6, grown) : 6) * build;
  return {
    heightCm: H,
    hps,
    armpit,
    waist,
    hip,
    crotch,
    shoulderHalf,
    section,
    neck: { a: neckA, b: neckA * 0.92, length: neckLength },
    head: { w: headH * 0.66, h: headH, d: headH * 0.82 },
    arm: { root: (body.kid ? lerp(3, 4.3, grown) : 4.8) * build, end: (body.kid ? lerp(2.7, 3.9, grown) : 4.2) * build },
  };
}
