import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Product } from "./catalog";
import {
  KIT_BUDGETS,
  KIT_GOALS,
  KIT_PALETTES,
  KIT_PRODUCTS,
  budgetStatus,
  candidateItem,
  getBudget,
  getKitGoal,
  guessChoice,
  initialLine,
  kitCartContext,
  kitItemFromDef,
  kitItemSpec,
  kitTotals,
  normalizeText,
  planKitItem,
  resolveKitCatalog,
  searchCatalog,
  searchedKitItem,
  suggestPicks,
  tierProduct,
  type KitItem,
  type SearchEntry,
} from "./kit-builder.ts";
import { compatibleVariations, findProduct, toPartyProduct } from "./party.ts";
import { unitLimits } from "./pricing.ts";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8")) as { products: Product[] };
const items = resolveKitCatalog(catalog.products);
const byId = new Map(items.map((item) => [item.id, item]));

function itemOf(id: string): KitItem {
  const item = byId.get(id);
  assert.ok(item, `${id}: não resolveu no catálogo`);
  return item;
}

test("todo produto sugerido existe no catálogo e o preset dele tem variação com preço", () => {
  for (const def of KIT_PRODUCTS) {
    const item = kitItemFromDef(def, catalog.products);
    assert.ok(item, `${def.id}: produto ${JSON.stringify(def.ref)} não existe em catalog.json`);
    for (const product of [item.product, ...(item.tiers ?? []).map((tier) => tier.product)]) {
      assert.ok(compatibleVariations(product, item.preset).length > 0, `${def.id} (${product.name}): preset sem variação com preço`);
    }
    if (def.tiers) assert.equal(item.tiers?.length, def.tiers.length, `${def.id}: faixa sem produto`);
  }
});

test("todo objetivo aponta para produtos sugeridos, com essenciais e sem repetir", () => {
  const ids = new Set(KIT_PRODUCTS.map((def) => def.id));
  for (const goal of KIT_GOALS) {
    if (goal.href) continue;
    assert.ok(goal.candidates.some((candidate) => candidate.essential), `${goal.id}: sem essenciais`);
    const seen = new Set<string>();
    for (const candidate of goal.candidates) {
      assert.ok(ids.has(candidate.item), `${goal.id}: ${candidate.item} não existe`);
      assert.ok(!seen.has(candidate.item), `${goal.id}: ${candidate.item} repetido`);
      seen.add(candidate.item);
    }
  }
  assert.ok(KIT_PALETTES.length >= 6);
});

test("faixa de quantidade na variação: 25 cadernos saem na faixa de 11 a 100", () => {
  const caderno = itemOf("caderno");
  const plan = planKitItem(caderno, initialLine(caderno), 25);
  assert.equal(plan.error, null);
  assert.equal(plan.priced.qty, 25);
  const product = findProduct(catalog.products, { groupId: 197 });
  const variation = product?.variations.find((v) => v.id === plan.priced.lines[0].variationId);
  assert.ok(variation, "variação do pedido");
  assert.deepEqual(unitLimits(product as Product, variation), { min: 11, max: 100 });
  assert.ok(plan.notes.includes("Faixa de 11 a 100 unidades"), plan.notes.join(" | "));
  // Com 5 kits, a faixa é a de 1 a 10 (mais cara por unidade).
  const small = planKitItem(caderno, initialLine(caderno), 5);
  assert.ok(small.priced.lines[0].unitPrice > plan.priced.lines[0].unitPrice);
});

test("faixa em produtos separados: a camiseta troca de produto com a quantidade", () => {
  const camiseta = itemOf("camiseta");
  assert.equal(tierProduct(camiseta, 5).groupId, 452);
  assert.equal(tierProduct(camiseta, 25).groupId, 453);
  assert.equal(tierProduct(camiseta, 150).groupId, 454);
  const plan = planKitItem(camiseta, initialLine(camiseta), 25);
  assert.equal(plan.error, null);
  assert.equal(plan.item.product.groupId, 453);
  assert.equal(plan.priced.qty, 25);
});

test("pacote mais em conta: os adesivos saem no pacote que cobre as unidades pelo menor preço", () => {
  const adesivo = itemOf("adesivo");
  const line = { ...initialLine(adesivo), perKit: 250 };
  const plan = planKitItem(adesivo, line, 1);
  assert.equal(plan.error, null);
  assert.ok(plan.ordered >= 250);
  // Nenhum outro tamanho de pacote cobre 250 unidades por menos.
  for (const variation of compatibleVariations(adesivo.product, adesivo.preset)) {
    const lots = Math.ceil(250 / variation.q);
    assert.ok(plan.priced.total <= Math.round(lots * variation.p * 100) / 100 + 0.001, `pacote de ${variation.q} sairia por menos`);
  }
  assert.ok(plan.notes.some((note) => /pacotes? de/.test(note)), plan.notes.join(" | "));
});

test("um pacote por pessoa: cartões de visita com o nome de cada uma", () => {
  const cartao = itemOf("cartao-visita");
  const plan = planKitItem(cartao, initialLine(cartao), 25);
  assert.equal(plan.priced.qty, 25);
  assert.equal(plan.lot, 120);
  assert.equal(plan.needed, 25 * 120);
});

test("mínimo do produto e pacote de cordões", () => {
  const caneta = itemOf("caneta");
  const pens = planKitItem(caneta, initialLine(caneta), 3);
  assert.equal(pens.priced.qty, 8);
  assert.equal(pens.ordered, 8);
  assert.ok(pens.notes.some((note) => note.startsWith("Pedido mínimo de 8")), pens.notes.join(" | "));

  const cordao = itemOf("cordao");
  const cords = planKitItem(cordao, initialLine(cordao), 25);
  assert.equal(cords.priced.qty, 3);
  assert.equal(cords.ordered, 30);
  assert.ok(cords.notes.includes("Sobram 5"), cords.notes.join(" | "));
});

test("crachá: a faixa da quantidade escolhe o preço", () => {
  const cracha = itemOf("cracha");
  const one = planKitItem(cracha, initialLine(cracha), 1);
  const many = planKitItem(cracha, initialLine(cracha), 25);
  assert.equal(one.error, null);
  assert.equal(many.error, null);
  assert.ok(many.priced.lines[0].unitPrice < one.priced.lines[0].unitPrice);
});

test("acima do máximo do produto vira erro no item, sem passar do limite", () => {
  const chaveiro = itemOf("chaveiro");
  const plan = planKitItem(chaveiro, { ...initialLine(chaveiro), perKit: 2 }, 600);
  // 1.200 unidades: passa do teto do carrinho (999) e vira aviso.
  assert.ok(plan.error, "esperava erro de quantidade");
  assert.ok(plan.priced.qty <= 999);
});

test("sugestão do assistente respeita o orçamento por kit", () => {
  const goal = getKitGoal("boas-vindas");
  assert.ok(goal);
  const perKit = Object.fromEntries(goal.candidates.map((candidate) => {
    const item = candidateItem(itemOf(candidate.item), candidate);
    return [candidate.item, planKitItem(item, initialLine(item), 25).perKit];
  }));
  const tight = getBudget(goal, "ate-50");
  const picks = suggestPicks(goal, perKit, tight);
  const sum = picks.reduce((total, id) => total + (perKit[id] ?? 0), 0);
  assert.ok(picks.length >= 2);
  assert.ok(sum <= 50 || picks.length === 2, `soma ${sum}`);
  const free = suggestPicks(goal, perKit, getBudget(goal, "livre"));
  assert.equal(free.length, goal.candidates.filter((c) => c.essential).length + 2);
  // Essenciais acima do teto: sai o mais caro, não o último da lista (a caneta barata fica).
  const evento = getKitGoal("evento");
  assert.ok(evento);
  const eventPerKit = Object.fromEntries(evento.candidates.map((candidate) => {
    const item = candidateItem(itemOf(candidate.item), candidate);
    return [candidate.item, planKitItem(item, initialLine(item), 50).perKit];
  }));
  const eventPicks = suggestPicks(evento, eventPerKit, getBudget(evento, "ate-50"));
  assert.ok(eventPicks.includes("caneta") && eventPicks.includes("cracha"), eventPicks.join(", "));
  assert.ok(!eventPicks.includes("sacola-mochila"), eventPicks.join(", "));
  const wide = suggestPicks(goal, perKit, getBudget(goal, "100-200"));
  assert.ok(wide.length > picks.length);
  assert.ok(wide.reduce((total, id) => total + (perKit[id] ?? 0), 0) <= 200);
});

test("totais, orçamento e carrinho", () => {
  const caneca = itemOf("caneca");
  const plans = [planKitItem(caneca, initialLine(caneca), 10)];
  const totals = kitTotals(plans, 10);
  assert.equal(totals.total, plans[0].priced.total);
  assert.equal(totals.perKit, Math.round((plans[0].priced.total / 10) * 100) / 100);
  const budget = KIT_BUDGETS.pessoa.find((b) => b.id === "ate-50");
  assert.deepEqual(budgetStatus(60, budget), { tone: "over", diff: 10 });
  assert.deepEqual(budgetStatus(40, budget), { tone: "ok", diff: 0 });
  assert.deepEqual(budgetStatus(30, KIT_BUDGETS.pessoa.find((b) => b.id === "50-100")), { tone: "under", diff: 20 });
  assert.equal(budgetStatus(30, KIT_BUDGETS.pessoa.find((b) => b.id === "livre")), null);

  const goal = getKitGoal("boas-vindas");
  assert.ok(goal);
  const context = kitCartContext(goal, 25, { brand: "Café Aurora", phrase: "Bem-vindo ao time", date: "2026-11-20", palette: "grafite-coral" });
  assert.deepEqual(context.bundle, { id: "kit-boas-vindas-cafe-aurora", name: "Kit boas-vindas · 25 pessoas" });
  // A arte vai em cada item (artSummary da peça), não no contexto do kit.
  assert.deepEqual(context.options, { Kit: "Boas-vindas para a equipe", Kits: "25 pessoas", Marca: "Café Aurora", "Entrega desejada": "20/11/2026" });
});

test("peça 3D de cada item: a variação do pedido e a medida dos produtos por m²", () => {
  const kinds: Record<string, string> = { camiseta: "tshirt", caneca: "mug", caderno: "book", caneta: "pen", cracha: "badge", cordao: "lanyard", "cartao-visita": "card", ecobag: "bag" };
  for (const [id, kind] of Object.entries(kinds)) {
    const item = itemOf(id);
    assert.equal(kitItemSpec(planKitItem(item, initialLine(item), 25)).kind, kind, id);
  }
  const lona = findProduct(catalog.products, { groupId: 35 });
  assert.ok(lona?.customSize);
  const m2 = searchedKitItem(toPartyProduct(lona), "Banner e Lonas");
  const plan = planKitItem(m2, { ...initialLine(m2), width: "80", height: "120" }, 1);
  assert.equal(plan.error, null);
  const spec = kitItemSpec(plan);
  assert.equal(spec.widthCm, 80);
  assert.equal(spec.heightCm, 120);
  assert.equal(spec.label, "80 cm × 1,2 m");
});

test("busca no catálogo sem acento e produto da busca", () => {
  const entries: SearchEntry[] = [
    { s: "243-cracha", n: "Crachá", c: "Comunicação Visual", i: "", p: 11.58, q: 1 },
    { s: "63-caneca", n: "Caneca de Cerâmica Personalizada", c: "Brindes & Presentes", i: "", p: 41.2, q: 1 },
    { s: "404-caneca-colher", n: "Caneca de Cerâmica c/ Colher", c: "Brindes & Presentes", i: "", p: 36.1, q: 1 },
    { s: "1-x", n: "Porta Caneca", c: "Casa", i: "", p: 10, q: 1 },
  ];
  assert.deepEqual(searchCatalog(entries, "cracha").map((e) => e.s), ["243-cracha"]);
  assert.deepEqual(searchCatalog(entries, "caneca").map((e) => e.s), ["404-caneca-colher", "63-caneca", "1-x"]);
  assert.deepEqual(searchCatalog(entries, "c"), []);
  assert.equal(normalizeText("Crachá & Cordão!"), "cracha cordao");

  const mochila = findProduct(catalog.products, { groupId: 54 });
  assert.ok(mochila);
  const item = searchedKitItem(toPartyProduct(mochila), "Bolsas e Mochilas");
  assert.equal(item.key, `busca-${mochila.slug}`);
  assert.ok(item.choice && !/quantidade/i.test(item.choice));
  const banner = findProduct(catalog.products, { groupId: 35 });
  assert.ok(banner?.customSize);
  const m2 = searchedKitItem(toPartyProduct(banner), "Banner e Lonas");
  assert.ok(m2.size && m2.size.widthCm > 0);
  const plan = planKitItem(m2, initialLine(m2), 2);
  assert.equal(plan.error, null);
  assert.equal(plan.priced.qty, 2);
  assert.equal(guessChoice(toPartyProduct(findProduct(catalog.products, { groupId: 63 }) as Product)), null);
});
