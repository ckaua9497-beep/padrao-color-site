import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApiProduto } from "./api/types";
import { novosCategorias, novosGrupos, novosIndice, novosProdutos, novosRecurso, type NovoGrupo, type NovosFonte } from "./novos-api.ts";

/* API própria dos produtos novos (/api/novos): mesmo formato e mesmos filtros da API da Padrão. */

const grupo = (id: number, nome: string, tags = ""): NovoGrupo => ({
  id,
  tipo: 1,
  nome,
  origem: 2,
  id_categoria: "900000",
  categoria: "Produtos Novos",
  imagem: `/produtos-novos/${id}.webp`,
  gabarito: "",
  meta_title: nome,
  meta_description: "",
  descricao: "",
  tags,
  informacao: [],
  resumo: "",
  lancamento: "Sim",
  mais_vendido: "Não",
  preco: 10,
  veja_tambem: [],
  parametros: { atributos: [{ id: "formato", nome: "Formato", visivel: true, valores: [{ id: "a", nome: "3x6,5 cm" }] }] },
});

const produto = (id: number, grupoNome: string, variacoes: Record<string, string>, economico: number): ApiProduto => ({
  id,
  nome: `${grupoNome} ${id}`,
  origem: 2,
  categoria: "Produtos Novos",
  grupo: grupoNome,
  informa_medida: 0,
  customizacao: { tipo: 1, web2print: "Não" },
  quantidade_tamanho: "Não",
  quantidade: variacoes.Quantidade?.split(" ")[0].replace(".", "") ?? "1",
  qtde_minima: "1",
  qtde_maxima: "0",
  imagem_1: "",
  imagem_2: "",
  imagem_3: "",
  imagem_4: "",
  preco: { economico, expresso: economico },
  prazo: { hora_envio: "", economico: 4, expresso: 4 },
  variacoes,
  tipos_anexo: [{ nome: "PDF" }],
});

const fonte: NovosFonte = {
  meta: { atualizadoEm: "2026-10-07" },
  categorias: [{ id: 900000, nome: "Produtos Novos", imagem: "", banner: "", banner_mobile: "", meta_title: "", meta_description: "" }],
  grupos: [grupo(900001, "Adesivo para Fechar Sacola", "adesivo, lacre"), grupo(900002, "Totem Elíptico", "totem, display")],
  produtos: [
    produto(9001001, "Adesivo para Fechar Sacola", { Formato: "3x6,5 cm (cantos retos)", Quantidade: "250 unidades" }, 54.33),
    produto(9001002, "Adesivo para Fechar Sacola", { Formato: "3x6,5 cm (cantos retos)", Quantidade: "1.250 unidades" }, 180),
    produto(9001003, "Adesivo para Fechar Sacola", { Formato: "4,8x10,6 cm (cantos retos)", Quantidade: "250 unidades" }, 70),
    produto(9002001, "Totem Elíptico", { Formato: "50x150 cm", Quantidade: "1 unidades" }, 98.59),
  ],
};

test("recursos: índice, /categorias, /grupos e /produtos; o resto não existe", () => {
  assert.equal(novosRecurso(undefined), null);
  assert.equal(novosRecurso([]), null);
  assert.equal(novosRecurso(["produtos"]), "produtos");
  assert.equal(novosRecurso(["GRUPOS"]), "grupos");
  assert.equal(novosRecurso(["pedidos"]), undefined);
  assert.equal(novosRecurso(["produtos", "x"]), undefined);
});

test("filtros da API da Padrão: id, nome ou slug, sem acento", () => {
  assert.equal(novosCategorias(fonte, { categoria: "produtos-novos" }).length, 1);
  assert.equal(novosCategorias(fonte, { grupo: "totem eliptico" }).length, 1);
  assert.equal(novosCategorias(fonte, { grupo: "caneca" }).length, 0);
  assert.deepEqual(novosGrupos(fonte, { id: "900002" }).map((g) => g.nome), ["Totem Elíptico"]);
  assert.deepEqual(novosGrupos(fonte, { tag: "LACRE" }).map((g) => g.id), [900001]);
  assert.equal(novosProdutos(fonte, { id_grupo: "900001" }).length, 3);
  assert.equal(novosProdutos(fonte, { grupo: "Totem Elíptico" }).length, 1);
  assert.equal(novosProdutos(fonte, { id_produto: "9001003" })[0].preco.economico, 70);
  assert.equal(novosProdutos(fonte, { id_categoria: "900000" }).length, 4);
  assert.equal(novosProdutos(fonte, { id_grupo: "999" }).length, 0);
});

test("qualquer opção da variação filtra /produtos; quantidade compara o número inteiro", () => {
  assert.deepEqual(novosProdutos(fonte, { id_grupo: "900001", Quantidade: "250" }).map((p) => p.id), [9001001, 9001003]);
  assert.deepEqual(novosProdutos(fonte, { quantidade: "1.250" }).map((p) => p.id), [9001002]);
  assert.deepEqual(novosProdutos(fonte, { formato: "4,8x10,6" }).map((p) => p.id), [9001003]);
  assert.deepEqual(novosProdutos(fonte, { Formato: "cantos retos", Quantidade: "250" }).map((p) => p.id), [9001001, 9001003]);
  assert.equal(novosProdutos(fonte, { Cor: "branca" }).length, 0, "opção que o produto não tem");
});

test("ajuste único de preço vale para grupos e variações", () => {
  const ajustada = { ...fonte, meta: { ...fonte.meta, ajustePreco: 1.1 } };
  assert.equal(novosProdutos(ajustada, { id_produto: "9001001" })[0].preco.economico, 59.76);
  assert.equal(novosGrupos(ajustada, { id: "900001" })[0].preco, 11);
  assert.equal(novosProdutos(fonte, { id_produto: "9001001" })[0].preco.economico, 54.33, "a fonte não muda");
});

test("índice: todos os produtos com opções, parâmetros e o link das variações", () => {
  const indice = novosIndice(fonte, "https://loja.exemplo/api/novos");
  assert.equal(indice.grupos.length, 2);
  const adesivo = indice.grupos[0];
  assert.equal(adesivo.variacoes, 3);
  assert.deepEqual(adesivo.opcoes.Quantidade, ["250 unidades", "1.250 unidades"]);
  assert.equal(adesivo.parametros.atributos[0].nome, "Formato");
  assert.equal(adesivo.produtos, "https://loja.exemplo/api/novos/produtos?id_grupo=900001");
  assert.equal(indice.recursos.produtos.url, "https://loja.exemplo/api/novos/produtos");
});
