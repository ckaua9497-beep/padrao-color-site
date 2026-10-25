import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aplicarGrupo, categoriasDoCatalogo, montarCatalogo } from "./catalogo-grupos.ts";
import type { Category, Product } from "./catalog";
import type { GroupLike } from "./catalog-map.ts";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8")) as { categories: Category[]; products: Product[] };
const byGroup = (id: number) => catalog.products.find((p) => p.groupId === id)!;

/** Linha de GET /grupos a partir do produto do sync (o que a API devolveria hoje para ele). */
function grupoDe(p: Product, extra: Partial<GroupLike> = {}): GroupLike {
  return { id: p.groupId!, nome: p.name, categoria: p.category, id_categoria: String(p.categoryId ?? ""), imagem: p.image, descricao: p.description, ...extra };
}

test("grupo fora de /grupos sai; os outros ficam na ordem do sync", () => {
  const tres = [byGroup(269), byGroup(180), byGroup(41)];
  const grupos = [grupoDe(tres[0]), grupoDe(tres[2])];
  const out = montarCatalogo(tres, grupos, () => undefined);
  assert.deepEqual(
    out.map((p) => p.groupId),
    [269, 41],
  );
});

test("dados do grupo lidos agora por cima do produto do sync; variações e preço continuam", () => {
  const p = byGroup(269);
  const novo = aplicarGrupo(p, grupoDe(p, { nome: "Nome Novo do Grupo", descricao: "Descrição nova", imagem: "https://img.padraocolor.com.br/padraocolor/imagens/nova.webp" }));
  assert.equal(novo.name, "Nome Novo do Grupo");
  assert.equal(novo.slug, "269-nome-novo-do-grupo");
  assert.equal(novo.description, "Descrição nova");
  assert.equal(novo.image, "https://img.padraocolor.com.br/padraocolor/imagens/nova.webp");
  assert.equal(novo.images[0], novo.image);
  assert.equal(novo.price, p.price);
  assert.equal(novo.variations, p.variations);
});

test("produto montado das variações de agora vale no lugar do sync; grupo novo entra quando elas chegam", () => {
  const p = byGroup(269);
  const vivo = { ...p, price: p.price + 1 };
  const novoGrupo: GroupLike = { id: 999001, nome: "Produto Novo", categoria: "Brindes" };
  const semVariacoes = montarCatalogo([p], [grupoDe(p), novoGrupo], (id) => (id === 269 ? vivo : undefined));
  assert.deepEqual(
    semVariacoes.map((x) => [x.groupId, x.price]),
    [[269, p.price + 1]],
  );
  const chegou = { ...p, id: "999001", groupId: 999001, slug: "999001-produto-novo", name: "Produto Novo", category: "Brindes", categorySlug: "brindes" };
  const comNovo = montarCatalogo([p], [grupoDe(p), novoGrupo], (id) => (id === 999001 ? chegou : undefined));
  assert.deepEqual(
    comNovo.map((x) => x.groupId),
    [269, 999001],
  );
});

test("categorias refeitas pelos produtos ativos: some a vazia, entra a nova", () => {
  const estaticas = catalog.categories;
  const primeira = estaticas[0];
  const daPrimeira = catalog.products.filter((p) => p.categorySlug === primeira.slug);
  const out = categoriasDoCatalogo(estaticas, daPrimeira.slice(0, 1));
  assert.equal(out.length, 1);
  assert.equal(out[0].slug, primeira.slug);
  assert.equal(out[0].count, 1);
  const nova = { ...daPrimeira[0], category: "Categoria Nova", categorySlug: "categoria-nova", categoryId: 999 };
  const comNova = categoriasDoCatalogo(estaticas, [daPrimeira[0], nova]);
  assert.deepEqual(
    comNova.map((c) => [c.slug, c.count]),
    [
      [primeira.slug, 1],
      ["categoria-nova", 1],
    ],
  );
  assert.equal(comNova[1].name, "Categoria Nova");
});
