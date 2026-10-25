import { test } from "node:test";
import assert from "node:assert/strict";
import { anexosComplementares, anexosDeProducao, camposVisiveis, CUSTOMIZACAO_PADRAO, customizacaoDa, customizacaoDaLinha, perfisDeCustomizacao, recebeArte, semImpressaoPeloNome } from "./customizacao.ts";

const linha = (tipo: number, anexos: string[] | null, criacao: [number, string] = [1, "34.90"], extra: Record<string, unknown> = {}) => ({
  customizacao: { tipo, web2print: "Não", criacao_arte: { tipo: String(criacao[0]), preco: criacao[1] }, ...extra },
  tipos_anexo: anexos?.map((nome) => ({ nome })) ?? undefined,
  variacoes: {},
});

test("regra 1: sem personalização não pede arte, anexo nem criação, mesmo que a API mande", () => {
  const c = customizacaoDaLinha(linha(0, ["Arquivo Único"], [1, "34.90"]), "Base Redonda p/ Wind Banner");
  assert.deepEqual(c, { modo: "nenhuma", anexos: [], criacao: null, web2print: false });
  assert.equal(recebeArte(c), false);
});

test("regra 2: neon de modelo pronto não aceita arquivo nem criação", () => {
  const c = customizacaoDaLinha(linha(3, ["Arquivo Único", "Posição do Led"]), "Led Neon Avengers");
  assert.deepEqual(c, { modo: "neon-modelo", anexos: [], criacao: null, web2print: false });
  assert.deepEqual(anexosComplementares(c), []);
  const escrita = { ...linha(3, ["Arquivo Único"]), variacoes: { Observação: "Modelo Não Personalizável" } };
  assert.equal(customizacaoDaLinha(escrita, "Led Neon Escrita 'Personalize Seu Led'").modo, "neon-modelo", "não vira sem impressão");
});

test("regra 3: personalizado sem tipos de anexo aceita Arquivo Único", () => {
  assert.deepEqual(customizacaoDaLinha(linha(1, null, [3, "54.90"]), "Kit Executivo").anexos, ["Arquivo Único"]);
});

test("regra 4: nome ou valor inteiro de opção sem impressão; parte de um valor não conta", () => {
  assert.equal(customizacaoDaLinha(linha(1, null), "Lona s/ Impressão").modo, "nenhuma");
  assert.equal(semImpressaoPeloNome("Caneca Mágica", { Tipo: "Produto sem Personalização" }), true);
  assert.equal(semImpressaoPeloNome("Lona", { "Tipo de Serviço": "Sem Impressão" }), true);
  assert.equal(semImpressaoPeloNome("Kit Executivo", { Caixa: "preta sem personalização" }), false, "a caixa é lisa, o kit é personalizado");
  assert.equal(semImpressaoPeloNome("Caneca Personalizada com Glitter na Base", {}), false);
});

test("regra 5: criação com o preço da variação; tipo 0 = não oferece", () => {
  assert.equal(customizacaoDaLinha(linha(1, ["Arquivo Único"], [2, "44.90"]), "Impressão em Acrílico").criacao, 44.9);
  assert.equal(customizacaoDaLinha(linha(1, ["Arquivo Único"], [0, "34.90"]), "Caneca").criacao, null);
});

test("regra 6: anexos da própria variação; complementares são os que não são a arte", () => {
  const c = customizacaoDaLinha(linha(1, ["Arquivo Único", "Impressão Frente", "Faca de Corte", "Máscara de Branco"]), "Adesivo em Vinil");
  assert.deepEqual(c.anexos, ["Arquivo Único", "Impressão Frente", "Faca de Corte", "Máscara de Branco"]);
  assert.deepEqual(anexosComplementares(c), ["Faca de Corte", "Máscara de Branco"]);
});

test("regra 7: web2print só com template", () => {
  assert.equal(customizacaoDaLinha(linha(1, null, [1, "34.90"], { web2print: "Sim" }), "Imã").web2print, false);
  assert.equal(customizacaoDaLinha(linha(1, null, [1, "34.90"], { web2print: "Sim", template_web2print: "739b8e" }), "Banner").web2print, true);
});

test("perfis: os distintos, o mais comum primeiro, com o índice de cada linha", () => {
  const { perfis, indices } = perfisDeCustomizacao(
    [linha(0, null), linha(1, ["Arquivo Único"]), linha(1, ["Arquivo Único"])],
    "Caneca C/ Glitter",
  );
  assert.equal(perfis.length, 2);
  assert.equal(perfis[0].modo, "arquivo");
  assert.deepEqual(indices, [1, 0, 0]);
  assert.equal(customizacaoDa({ customizacoes: perfis }, { cz: 1 }).modo, "nenhuma");
  assert.equal(customizacaoDa({ customizacoes: perfis }, {}).modo, "arquivo", "sem cz = perfil 0");
  assert.equal(customizacaoDa({}, { cz: 1 }), CUSTOMIZACAO_PADRAO);
});

test("linha sem customização (erro da API): arte do cliente em arquivo único", () => {
  assert.deepEqual(customizacaoDaLinha({}, "Caneca Personalizada com Glitter na Base"), { modo: "arquivo", anexos: ["Arquivo Único"], criacao: null, web2print: false });
});

test("arquivos para a produção: arquivo único ou separados, um escondendo o outro (revisão da Padrão de 25/10/2026)", () => {
  const cartao = { ...CUSTOMIZACAO_PADRAO, anexos: ["Arquivo Único", "Impressão Frente", "Impressão Verso", "Verniz Local Frente"] };
  assert.deepEqual(anexosDeProducao(cartao), ["Arquivo Único", "Impressão Frente", "Impressão Verso", "Verniz Local Frente"]);
  assert.deepEqual(anexosDeProducao({ ...CUSTOMIZACAO_PADRAO, anexos: ["Arquivo Único"] }), [], "só o arquivo único: a arte do editor já é ele");
  assert.deepEqual(anexosDeProducao({ ...CUSTOMIZACAO_PADRAO, anexos: ["Impressão Frente", "Impressão Verso"] }), ["Arquivo Único", "Impressão Frente", "Impressão Verso"], "o arquivo único sempre é opção");
  assert.deepEqual(anexosDeProducao({ ...CUSTOMIZACAO_PADRAO, modo: "nenhuma", anexos: ["Arquivo Único", "Impressão Frente"] }), []);
  const tipos = anexosDeProducao(cartao);
  assert.deepEqual(camposVisiveis(tipos, {}), tipos);
  assert.deepEqual(camposVisiveis(tipos, { "Arquivo Único": true }), ["Arquivo Único"]);
  assert.deepEqual(camposVisiveis(tipos, { "Impressão Verso": true }), ["Impressão Frente", "Impressão Verso", "Verniz Local Frente"]);
});
