import { test } from "node:test";
import assert from "node:assert/strict";
import { mapGroup, neonMode, normalizeOptionValues, optionKey, variationSize, type ApiRow } from "./catalog-map.ts";

const row = (id: number, variacoes: Record<string, string>, extra: Partial<ApiRow> = {}): ApiRow => ({
  id,
  variacoes,
  preco: { economico: 10 + id, expresso: 12 + id },
  prazo: { hora_envio: "18:00:00", economico: 2, expresso: 1 },
  quantidade: "1",
  qtde_minima: "1",
  qtde_maxima: "999999999",
  customizacao: { tipo: 1, web2print: "Não" },
  tipos_anexo: [{ nome: "Arquivo Único" }],
  ...extra,
});

test("grafias da mesma opção: maiúsculas, gr/g e 'unidades' contam como iguais", () => {
  assert.equal(optionKey("4/0 (Colorido só Frente)"), optionKey("4/0 (colorido só frente)"));
  assert.equal(optionKey("Papel Supremo 250gr"), optionKey("Papel Supremo 250g"));
  assert.equal(optionKey("1008"), optionKey("1008 unidades"));
  assert.notEqual(optionKey("96 unidades"), optionKey("1008"));
  assert.notEqual(optionKey("4/0 (colorido só frente)"), optionKey("4/1 (frente colorido e verso em tons de cinza)"));
});

test("Imã de Geladeira (177): as grafias repetidas viram a mais comum do grupo", () => {
  const rows = normalizeOptionValues([
    row(48, { Cor: "4/0 (Colorido só Frente)", Mídia: "Papel Supremo 250gr", Quantidade: "1000" }),
    row(50, { Cor: "4/0 (colorido só frente)", Mídia: "Papel Supremo 250g", Quantidade: "2000" }),
    row(369, { Cor: "4/0 (colorido só frente)", Mídia: "Papel Couchê 250g", Quantidade: "96 unidades" }),
    row(3193, { Cor: "4/0 (Colorido só Frente)", Mídia: "Papel Couchê 250gr", Quantidade: "1008" }),
    row(3195, { Cor: "4/0 (colorido só frente)", Mídia: "Papel Couchê 250g", Quantidade: "1008 unidades" }),
  ]);
  assert.deepEqual(new Set(rows.map((r) => r.variacoes?.Cor)), new Set(["4/0 (colorido só frente)"]));
  // Supremo empata (1 × 1): vale a grafia que aparece primeiro; Couchê "250g" ganha por 2 × 1.
  assert.deepEqual(new Set(rows.map((r) => r.variacoes?.["Mídia"])), new Set(["Papel Supremo 250gr", "Papel Couchê 250g"]));
  assert.deepEqual(new Set(rows.map((r) => r.variacoes?.Quantidade)), new Set(["1000", "2000", "96 unidades", "1008"]), "1008 e 1008 unidades empatam: fica a primeira");
  const product = mapGroup({ id: 177, nome: "Imã de Geladeira", categoria: "Promocional" }, [
    row(48, { Cor: "4/0 (Colorido só Frente)", Quantidade: "1008" }),
    row(50, { Cor: "4/0 (colorido só frente)", Quantidade: "1008 unidades" }),
    row(51, { Cor: "4/0 (colorido só frente)", Quantidade: "96 unidades" }),
  ]);
  assert.deepEqual(product.options.Cor, ["4/0 (colorido só frente)"]);
  assert.equal(product.options.Quantidade.length, 2, "1008 e 1008 unidades juntam; 96 unidades fica");
  assert.equal(product.variations[0].id, 48, "o ID da variação (que vai no pedido) não muda");
});

test("medida livre: limites próprios da variação e preço fixo num grupo misto", () => {
  const base = { minWidth: 0, maxWidth: 1.95, minHeight: 0, maxHeight: 0.95, minArea: 0, maxArea: 0 };
  const m2 = (extra: Partial<ApiRow>) => row(1, {}, { informa_medida: 1, largura_minima: "0", largura_maxima: "1,95", altura_minima: "0", altura_maxima: "0,95", tamanho_minimo: "0", tamanho_maximo: "0", ...extra });
  assert.deepEqual(variationSize(m2({}), base), {}, "igual ao do produto: nada a guardar");
  assert.deepEqual(variationSize(m2({ largura_maxima: "0,15", altura_maxima: "0,21" }), base), { lm: [0, 0.15, 0, 0.21, 0, 0] }, "Impressão em PS 'Até 15x21cm'");
  assert.deepEqual(variationSize(row(2, {}, { informa_medida: 0 }), base), { a: 0 }, "Faixa de preço fixo");
  assert.deepEqual(variationSize(row(2, {}, { informa_medida: 0 }), null), {}, "produto sem medida livre");
});

test("LED montado pelo cliente: modo e 'a partir de' na área mínima de 0,25 m²", () => {
  const frase = (id: number, preco: number) => row(id, { Formato: preco > 2300 ? "Até 50cm" : "Acima de 50cm" }, { customizacao: { tipo: 2, web2print: "Não" }, preco: { economico: preco, expresso: preco } });
  assert.equal(neonMode([frase(1, 2419)]), "frase");
  assert.equal(neonMode([row(1, {}, { customizacao: { tipo: 4, web2print: "Não" }, informa_medida: 1 })]), "logo");
  assert.equal(neonMode([row(1, {}, { customizacao: { tipo: 4, web2print: "Não" }, informa_medida: 0 })]), null, "Led Neon Número (298): peça de preço fixo");
  assert.equal(neonMode([row(1, {})]), null);
  const product = mapGroup({ id: 290, nome: "Crie sua Frase em Led Neon", categoria: "Led Neon" }, [frase(11340, 2419), frase(11342, 2242)]);
  assert.equal(product.neon, "frase");
  assert.equal(product.price, 560.5, "0,25 × R$ 2.242");
  assert.equal(product.priceQty, 1);
});
