import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import type { Variation } from "./catalog";
import { mockupSpec } from "./mockup.ts";
import { NOVOS_RANGES, novosProdutos, type NovosFonte } from "./novos-api.ts";

/*
 * Produtos novos da API própria (src/data/novos/fonte.json → npm run sync:novos → catalog-novos.json): IDs na
 * faixa reservada e sem colisão com a Padrão, preços, o catálogo sincronizado igual à API, o modelo 3D certo e as
 * fotos de catálogo no padrão do site (600×600, WebP com alfa).
 */

type Product = {
  slug: string;
  groupId: number;
  name: string;
  categorySlug: string;
  image: string;
  images: string[];
  options: Record<string, string[]>;
  variations: Variation[];
  source?: string;
};

const read = <T>(path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;
const fonte = read<NovosFonte>("../data/novos/fonte.json");
const novos = read<{ categories: { slug: string; count: number }[]; products: Product[] }>("../data/catalog-novos.json");
const padrao = read<{ products: Product[] }>("../data/catalog.json");

test("IDs na faixa reservada, sem colisão com a Padrão nem entre si", () => {
  const [g0, g1] = NOVOS_RANGES.grupo;
  const [v0, v1] = NOVOS_RANGES.produto;
  const padraoGroups = new Set(padrao.products.map((p) => p.groupId));
  const padraoVariations = new Set(padrao.products.flatMap((p) => p.variations.map((v) => v.id)));
  const seen = new Set<number>();
  for (const grupo of fonte.grupos) {
    assert.ok(grupo.id >= g0 && grupo.id <= g1, `grupo ${grupo.id}`);
    assert.ok(!padraoGroups.has(grupo.id), `grupo ${grupo.id} já existe na Padrão`);
    assert.equal(grupo.id_categoria, String(NOVOS_RANGES.categoria));
  }
  for (const row of fonte.produtos) {
    assert.ok(row.id >= v0 && row.id <= v1, `variação ${row.id}`);
    assert.ok(!padraoVariations.has(row.id), `variação ${row.id} já existe na Padrão`);
    assert.ok(!seen.has(row.id), `variação ${row.id} repetida`);
    seen.add(row.id);
  }
});

test("toda variação tem preço, prazo e as mesmas opções do grupo; o grupo mostra o menor preço", () => {
  for (const grupo of fonte.grupos) {
    const rows = novosProdutos(fonte, { id_grupo: String(grupo.id) });
    assert.ok(rows.length > 0, grupo.nome);
    const keys = JSON.stringify(Object.keys(rows[0].variacoes));
    for (const row of rows) {
      assert.ok(row.preco.economico > 0 && row.preco.expresso >= row.preco.economico, `${row.id} preço`);
      assert.ok(row.prazo.economico > 0, `${row.id} prazo`);
      assert.equal(JSON.stringify(Object.keys(row.variacoes)), keys, `${row.id} opções`);
    }
    assert.equal(grupo.preco, Math.min(...rows.map((r) => r.preco.economico)), `${grupo.nome} preço do grupo`);
    assert.ok(grupo.parametros.atributos.length > 0, `${grupo.nome} parâmetros`);
  }
});

test("catalog-novos.json é a API sincronizada (rode npm run sync:novos depois de mexer na fonte)", () => {
  assert.deepEqual(
    novos.products.map((p) => p.groupId),
    fonte.grupos.map((g) => g.id),
  );
  for (const product of novos.products) {
    const rows = fonte.produtos.filter((r) => r.grupo === product.name);
    assert.equal(product.source, "site");
    assert.equal(product.categorySlug, "produtos-novos");
    assert.deepEqual(
      product.variations.map((v) => [v.id, v.p]),
      rows.map((r) => [r.id, r.preco.economico]),
      product.name,
    );
  }
  assert.deepEqual(novos.categories.map((c) => [c.slug, c.count]), [["produtos-novos", fonte.grupos.length]]);
});

test("cada produto novo tem o modelo 3D próprio (nenhum cai no genérico)", () => {
  const expected: Record<number, string> = {
    900001: "sticker:bag-seal",
    900002: "sticker:seal",
    900003: "box:carton",
    900004: "totem:-",
    900005: "box:carton-bag",
    900006: "bag:plastic",
    900007: "bag:kraft-sack",
    900008: "box:panettone",
    900009: "box:carton",
    900010: "hangtag:jewelry",
    900011: "panel:door-hook",
    900012: "box:basket",
    900013: "box:basket",
  };
  for (const product of novos.products) {
    const spec = mockupSpec(product, {});
    assert.equal(`${spec.kind}:${spec.variant ?? "-"}`, expected[product.groupId], product.name);
    assert.equal(spec.source, "name", product.name);
  }
  // Medida em cm com três números (L x A x P): o "m" de "cm" não vira metro.
  const bemCasado = mockupSpec(novos.products.find((p) => p.groupId === 900009) as Product, {});
  assert.deepEqual([bemCasado.widthCm, bemCasado.heightCm, bemCasado.depthCm], [5.5, 3.4, 5.5]);
});

/** Largura, altura e alfa de um WebP pelo cabeçalho (VP8X). */
function webpInfo(buf: Buffer): { w: number; h: number; alpha: boolean } | null {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP" || buf.toString("ascii", 12, 16) !== "VP8X") return null;
  return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3), alpha: (buf[20] & 0x10) !== 0 };
}

test("fotos de catálogo no padrão do site: 600×600, WebP com fundo transparente (npm run fotos:novos)", () => {
  for (const product of novos.products) {
    for (const image of product.images) {
      const file = new URL(`../../public${image}`, import.meta.url);
      assert.ok(existsSync(file), `${product.name}: falta ${image}`);
      const info = webpInfo(readFileSync(file));
      assert.ok(info, `${image}: não é WebP VP8X`);
      assert.deepEqual(info, { w: 600, h: 600, alpha: true }, image);
    }
  }
});
