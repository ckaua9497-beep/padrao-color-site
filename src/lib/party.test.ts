import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Product } from "./catalog";
import {
  KITS,
  MAX_QTY,
  PARTY_PALETTES,
  PARTY_PRODUCTS,
  PARTY_ROLES,
  PARTY_TYPES,
  businessDaysBetween,
  choiceValues,
  compatibleVariations,
  defaultConfig,
  findProduct,
  getPartyProductDef,
  kitQuote,
  optionKeyFor,
  partyBundle,
  partyItem,
  partyOptions,
  emptyDetails,
  priceItem,
  resolveKitItems,
  resolvePartyItems,
  resolveSelection,
  sizeLimits,
  slugify,
  type PartyProductDef,
} from "./party.ts";
import type { Selection } from "./pricing.ts";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8")) as { products: Product[] };

function productOf(def: PartyProductDef): Product {
  const product = findProduct(catalog.products, def.ref);
  assert.ok(product, `${def.id}: produto ${JSON.stringify(def.ref)} não existe em catalog.json`);
  return product;
}

/** Cada rótulo do preset existe no produto, o valor também, e há variação com preço que respeita tudo. */
function assertPreset(where: string, product: Product, preset: Selection) {
  for (const [label, value] of Object.entries(preset)) {
    const key = optionKeyFor(product.options, label);
    assert.ok(key, `${where}: opção "${label}" não existe em ${product.name}`);
    assert.ok(product.options[key].includes(value), `${where}: "${value}" não é valor de "${label}" em ${product.name}`);
  }
  assert.ok(compatibleVariations(product, preset).length > 0, `${where}: nenhuma variação com preço para ${JSON.stringify(preset)} em ${product.name}`);
}

function hex(color: string): [number, number, number] {
  assert.match(color, /^#[0-9a-f]{6}$/i, `cor inválida: ${color}`);
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function contrast(a: string, b: string): number {
  const lum = (color: string) => {
    const [r, g, bl] = hex(color).map((v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("produtos de festa: ids únicos e papéis válidos", () => {
  const ids = PARTY_PRODUCTS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "id repetido em PARTY_PRODUCTS");
  const roles = new Set(PARTY_ROLES.map((r) => r.id));
  for (const def of PARTY_PRODUCTS) assert.ok(roles.has(def.role), `${def.id}: papel ${def.role} inválido`);
  for (const role of roles) assert.ok(PARTY_PRODUCTS.some((p) => p.role === role), `papel ${role} sem produto`);
});

test("produtos de festa: toda referência existe em catalog.json", () => {
  for (const def of PARTY_PRODUCTS) productOf(def);
  assert.equal(resolvePartyItems(catalog.products).length, PARTY_PRODUCTS.length);
});

test("medida (m²) só nos produtos com customSize, e todo produto por m² tem medida sugerida dentro dos limites", () => {
  for (const def of PARTY_PRODUCTS) {
    const product = productOf(def);
    if (!product.customSize) {
      assert.equal(def.size, undefined, `${def.id}: ${product.name} não é vendido por m² e não pode ter medida`);
      continue;
    }
    assert.ok(def.size, `${def.id}: ${product.name} é vendido por m² e precisa de medida sugerida`);
    const limits = sizeLimits(product.customSize);
    assert.ok(def.size.widthCm >= limits.minWidthCm && def.size.widthCm <= limits.maxWidthCm, `${def.id}: largura fora do limite`);
    assert.ok(def.size.heightCm >= limits.minHeightCm && def.size.heightCm <= limits.maxHeightCm, `${def.id}: altura fora do limite`);
    const priced = priceItem(partyItem(def, product), defaultConfig({ qty: def.qty, size: def.size }));
    assert.equal(priced.error, null, `${def.id}: ${priced.error}`);
    assert.ok(priced.lines[0].area && priced.lines[0].area.area > 0, `${def.id}: área zerada`);
  }
});

test("Crie Sua Festa cobre banner, adesivo, papel, lona e tecido por m²", () => {
  const m2 = PARTY_PRODUCTS.map((def) => productOf(def)).filter((p) => p.customSize);
  for (const family of [/banner/i, /adesivo|r[oó]tulo/i, /papel/i, /lona/i, /tecido/i]) {
    assert.ok(
      m2.some((p) => family.test(p.name)),
      `nenhum produto por m² de ${family}`,
    );
  }
});

test("presets, opção da montagem e peças existem no catálogo", () => {
  for (const def of PARTY_PRODUCTS) {
    const product = productOf(def);
    if (def.preset) assertPreset(def.id, product, def.preset);
    for (const part of def.parts ?? []) assertPreset(`${def.id} (${part.label})`, product, { ...def.preset, ...part.preset });
    if (def.choice) {
      assert.equal(def.parts, undefined, `${def.id}: item com peças não tem opção na montagem`);
      const choice = choiceValues(product, def.choice, def.preset ?? {});
      assert.ok(choice, `${def.id}: opção "${def.choice}" não existe em ${product.name}`);
      assert.ok(choice.values.length >= 2, `${def.id}: "${def.choice}" tem um valor só, não precisa ser trocada`);
      const current = resolveSelection(product, def.preset ?? {})[choice.key];
      assert.ok(choice.values.includes(current), `${def.id}: valor inicial "${current}" fora das opções`);
    }
    if (def.askSizes) assert.ok(product.sizes?.length, `${def.id}: ${product.name} não tem grade de tamanhos`);
  }
});

test("quantidade sugerida respeita os limites do produto e o preço sai do catálogo", () => {
  for (const def of PARTY_PRODUCTS) {
    const product = productOf(def);
    const item = partyItem(def, product);
    const priced = priceItem(item, defaultConfig(item));
    assert.equal(priced.qty, def.qty, `${def.id}: quantidade ${def.qty} fora de ${priced.limits.min}–${priced.limits.max}`);
    assert.ok(def.qty >= 1 && def.qty <= MAX_QTY);
    assert.ok(priced.total > 0, `${def.id}: total zerado`);
    assert.equal(priced.error, null);
    for (const line of priced.lines) {
      assert.ok(line.variationId, `${def.id}: sem variação (ID do produto na API) para o pedido`);
      assert.ok(product.variations.some((v) => v.id === line.variationId));
    }
  }
});

test("trio de cilindros vira três itens, um por formato", () => {
  const def = getPartyProductDef("cilindros");
  assert.ok(def);
  const priced = priceItem(partyItem(def, productOf(def)), { qty: 1 });
  assert.equal(priced.lines.length, 3);
  assert.equal(new Set(priced.lines.map((l) => l.variationId)).size, 3);
});

test("tipos de festa: paleta, sugestões e kit existem", () => {
  const ids = PARTY_TYPES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const type of PARTY_TYPES) {
    assert.ok(PARTY_PALETTES.some((p) => p.id === type.palette), `${type.id}: paleta ${type.palette}`);
    assert.ok(type.suggested.length >= 4, `${type.id}: poucas sugestões`);
    for (const id of type.suggested) assert.ok(getPartyProductDef(id), `${type.id}: sugestão ${id} não existe`);
    if (type.kit) assert.ok(KITS.some((k) => k.slug === type.kit), `${type.id}: kit ${type.kit} não existe`);
  }
});

test("paletas: cores válidas e texto da arte legível sobre o fundo", () => {
  const ids = PARTY_PALETTES.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const palette of PARTY_PALETTES) {
    assert.ok(palette.colors.length >= 3, `${palette.id}: poucas cores`);
    palette.colors.forEach(hex);
    const ratio = contrast(palette.ink, palette.background);
    assert.ok(ratio >= 4.5, `${palette.id}: contraste ${ratio.toFixed(2)}:1`);
  }
});

test("exatamente 10 kits, com slug de URL e composição válida", () => {
  assert.equal(KITS.length, 10);
  const slugs = KITS.map((k) => k.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const kit of KITS) {
    assert.match(kit.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(PARTY_TYPES.some((t) => t.id === kit.partyType), `${kit.slug}: tipo ${kit.partyType}`);
    assert.ok(PARTY_PALETTES.some((p) => p.id === kit.palette), `${kit.slug}: paleta ${kit.palette}`);
    assert.ok(kit.items.length >= 6, `${kit.slug}: kit com poucos itens`);
    assert.ok(
      kit.items.some((entry) => entry.item === kit.cover),
      `${kit.slug}: a capa ${kit.cover} não está na composição`,
    );
    for (const entry of kit.items) {
      const def = getPartyProductDef(entry.item);
      assert.ok(def, `${kit.slug}: item ${entry.item} não é um produto de festa`);
      const product = productOf(def);
      if (entry.size) assert.ok(product.customSize, `${kit.slug}/${entry.item}: medida em produto que não é por m²`);
      if (entry.preset) assertPreset(`${kit.slug}/${entry.item}`, product, { ...def.preset, ...entry.preset });
    }
    const items = resolveKitItems(kit, catalog.products);
    assert.equal(items.length, kit.items.length);
    assert.equal(new Set(items.map((i) => i.key)).size, items.length);
    for (const item of items) {
      const priced = priceItem(item, defaultConfig(item));
      assert.equal(priced.qty, item.qty, `${kit.slug}/${item.id}: quantidade ${item.qty} fora de ${priced.limits.min}–${priced.limits.max}`);
      assert.equal(priced.error, null, `${kit.slug}/${item.id}: ${priced.error}`);
      if (item.product.customSize) assert.ok(item.size, `${kit.slug}/${item.id}: produto por m² sem medida`);
    }
    const quote = kitQuote(items);
    assert.ok(quote.total > 0, `${kit.slug}: total zerado`);
    assert.ok(quote.leadDays && quote.leadDays > 0);
  }
});

test("opções da festa no carrinho e bundle", () => {
  const details = emptyDetails(PARTY_TYPES[0], { name: " Alice ", theme: "Safari", age: "5 anos", date: "2026-11-15", phrase: "Vem comemorar comigo!" });
  const options = partyOptions(details, { Formato: "45x60 cm" });
  assert.equal(options.Festa, "Alice");
  assert.equal(options.Tema, "Safari");
  assert.equal(options["Texto da arte"], "Vem comemorar comigo!");
  assert.equal(options["Data da festa"], "15/11/2026");
  assert.equal(Object.keys(options)[0], "Formato");
  assert.deepEqual(partyBundle("Festa da Alice!"), { id: "festa-festa-da-alice", name: "Crie Sua Festa" });
  assert.equal(partyBundle("  ").id, "festa");
  assert.equal(slugify("Ana & Pedro"), "ana-e-pedro");
});

test("dias úteis até a festa", () => {
  // 2026-10-02 é sexta-feira: até a sexta seguinte são 5 dias úteis.
  assert.equal(businessDaysBetween(new Date(2026, 9, 2), new Date(2026, 9, 9)), 5);
  assert.equal(businessDaysBetween(new Date(2026, 9, 9), new Date(2026, 9, 2)), 0);
  assert.equal(businessDaysBetween(new Date(2026, 9, 2), new Date(2026, 9, 4)), 0);
});
