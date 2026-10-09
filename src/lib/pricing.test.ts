import { test } from "node:test";
import assert from "node:assert/strict";
import type { CustomSize, Variation } from "./catalog";
import {
  areaQuote,
  defaultSize,
  fitsLimits,
  hasExpress,
  limitsHint,
  parseMeasure,
  quote,
  sizeError,
  sizePresets,
  sizeSummary,
  sizeTotal,
  speedQuote,
  unitLimits,
  usesArea,
} from "./pricing.ts";

const NO_LIMITS: CustomSize = { minWidth: 0, maxWidth: 0, minHeight: 0, maxHeight: 0, minArea: 0, maxArea: 0 };
// Banner - Medida Personalizada (grupo 35): até 2 m de largura, 50 m de altura, cobrança mínima de 0,5 m².
const BANNER: CustomSize = { ...NO_LIMITS, maxWidth: 2, maxHeight: 50, minArea: 0.5 };
// Led Neon Personalizado - Logotipo (grupo 289).
const NEON: CustomSize = { ...NO_LIMITS, minWidth: 0.5, maxWidth: 1.8, minHeight: 0.5, maxHeight: 0.98 };
// Mini Banner (grupo 36): área até 0,5 m².
const MINI: CustomSize = { ...NO_LIMITS, maxArea: 0.5 };
// Sublimação em Tecido (grupo 261): o rolo limita a altura em 1,45 m.
const FABRIC: CustomSize = { ...NO_LIMITS, maxHeight: 1.45 };

test("areaQuote: preço por m² × área", () => {
  const q = areaQuote(62.16, 100, 50, NO_LIMITS);
  assert.equal(q.area, 0.5);
  assert.equal(q.billedArea, 0.5);
  assert.equal(q.price, 31.08);
  assert.equal(q.error, null);
});

test("areaQuote: área mínima cobrada e limites", () => {
  const small = areaQuote(48.72, 30, 30, BANNER);
  assert.equal(small.area, 0.09);
  assert.equal(small.billedArea, 0.5);
  assert.equal(small.price, 24.36);
  assert.match(areaQuote(48.72, 250, 100, BANNER).error ?? "", /Largura máxima/);
  assert.match(areaQuote(2589.51, 40, 60, NEON).error ?? "", /Largura mínima/);
  assert.match(areaQuote(63.41, 100, 100, MINI).error ?? "", /Área máxima/);
  assert.match(areaQuote(10, 0, 50, NO_LIMITS).error ?? "", /largura e altura/);
});

test("usesArea: medida livre, exceto formato fixo escolhido", () => {
  const faixa = { Formato: ["Personalize a sua Medida", "2,00x0,60m", "3,00x0,80m"], Mídia: ["Lona Brilho"] };
  assert.equal(usesArea(faixa, { Formato: "Personalize a sua Medida" }, NO_LIMITS), true);
  assert.equal(usesArea(faixa, { Formato: "2,00x0,60m" }, NO_LIMITS), false);
  // Banner - Medida Personalizada: o único "Formato" não é escolha de medida fixa.
  assert.equal(usesArea({ Formato: ["0,20x0,30m"] }, { Formato: "0,20x0,30m" }, BANNER), true);
  assert.equal(usesArea({ "4 - Tipo de Serviço": ["Solvente"] }, {}, NO_LIMITS), true);
  assert.equal(usesArea(faixa, { Formato: "Personalize a sua Medida" }, null), false);
});

test("sizePresets: só medidas dentro dos limites", () => {
  for (const [w, h] of sizePresets("neon", null, NEON)) assert.ok(w >= 50 && h >= 50 && w <= 180 && h <= 98, `${w}x${h}`);
  for (const [w, h] of sizePresets("banner", "mini", MINI)) assert.ok((w * h) / 10_000 <= 0.5, `${w}x${h}`);
  const fabric = sizePresets("cloth", null, FABRIC);
  assert.ok(fabric.length >= 3);
  for (const [, h] of fabric) assert.ok(h <= 145);
  assert.ok(sizePresets("banner", "strip", { ...NO_LIMITS, maxWidth: 50, maxHeight: 2 }).every(([w, h]) => w > h));
  assert.ok(sizePresets("desconhecido", null, null).length > 0);
});

test("defaultSize: primeira medida rápida ou 100 × 100 ajustado", () => {
  assert.deepEqual(defaultSize("banner", null, BANNER), [60, 90]);
  const [w, h] = defaultSize("banner", null, { ...NO_LIMITS, minWidth: 3, minHeight: 2.5 });
  assert.deepEqual([w, h], [300, 250]);
  assert.ok(fitsLimits(w, h, { ...NO_LIMITS, minWidth: 3, minHeight: 2.5 }));
});

test("limitsHint e parseMeasure", () => {
  assert.equal(limitsHint(NO_LIMITS), null);
  assert.match(limitsHint(BANNER) ?? "", /^Largura até 2 m · altura até 50 m · cobrança mínima de 0,5 m²$/);
  assert.equal(parseMeasure("1,5"), 1.5);
  assert.equal(parseMeasure(" 90 "), 90);
  assert.equal(parseMeasure("abc"), 0);
  assert.equal(parseMeasure("-3"), 0);
});

test("grade de tamanhos: total, resumo e mínimo do produto", () => {
  const counts = { P: 2, M: 3, G: 0, GG: 1.7 };
  assert.equal(sizeTotal(counts), 6);
  assert.equal(sizeSummary(["P", "M", "G", "GG"], { P: 2, M: 3, G: 0 }), "P×2, M×3");
  assert.match(sizeError(5, 101, 999_999_999) ?? "", /a partir de 101 peças\. Faltam 96/);
  assert.match(sizeError(0, 1, 10) ?? "", /pelo menos um tamanho/);
  assert.match(sizeError(12, 1, 10) ?? "", /até 10 peças/);
  assert.equal(sizeError(101, 101, 999_999_999), null);
});

test("expresso: só quando muda preço ou prazo", () => {
  const variations: Variation[] = [
    { id: 1, p: 44.8, pe: 44.8, q: 1, d: 5, de: 4, v: { Acabamento: "Viés Branco" } },
    { id: 2, p: 5.02, pe: 5.12, q: 1, d: 2, de: 1, v: { Acabamento: "Viés Preto" } },
    { id: 3, p: 10, pe: 10, q: 1, d: 2, de: 2, v: { Acabamento: "Viés Azul" } },
  ];
  const fallback = { price: 0, qty: 1, leadDays: null };
  const sameprice = quote(variations, { Acabamento: "Viés Branco" }, fallback, 1);
  assert.equal(hasExpress(sameprice), true);
  assert.deepEqual(speedQuote(sameprice, "expresso"), { price: 44.8, leadDays: 4 });
  assert.deepEqual(speedQuote(sameprice, "economico"), { price: 44.8, leadDays: 5 });
  const pricier = quote(variations, { Acabamento: "Viés Preto" }, fallback, 1);
  assert.deepEqual(speedQuote(pricier, "expresso"), { price: 5.12, leadDays: 1 });
  const same = quote(variations, { Acabamento: "Viés Azul" }, fallback, 1);
  assert.equal(hasExpress(same), false);
  assert.deepEqual(speedQuote(same, "expresso"), { price: 10, leadDays: 2 });
});

test("unitLimits: a faixa da variação ou a do produto", () => {
  assert.deepEqual(unitLimits({ minQty: 1, maxQty: 10 }, { mn: 11, mx: 100 }), { min: 11, max: 100 });
  assert.deepEqual(unitLimits({ minQty: 1, maxQty: 10 }, {}), { min: 1, max: 10 });
  assert.deepEqual(unitLimits({ minQty: 5, maxQty: 0 }, null), { min: 5, max: 0 });
  assert.deepEqual(unitLimits({ minQty: 0 }, { mn: 251 }), { min: 251, max: 0 });
});
