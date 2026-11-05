import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CNAES_REVENDA,
  QUESTIONARIO_REVENDA,
  camposDoPerfil,
  codigoCnae,
  decisaoDaRevenda,
  formatarCnae,
  lerConsultaCnpj,
  lerRespostas,
  questionarioErros,
  textoDaRevenda,
} from "./revenda.ts";

test("lista de CNAEs: os 33 códigos da lista da Padrão, de 7 dígitos e sem repetir", () => {
  const codigos = CNAES_REVENDA.map((cnae) => cnae.codigo);
  assert.equal(codigos.length, 33);
  assert.ok(codigos.every((codigo) => /^\d{7}$/.test(codigo)));
  assert.equal(new Set(codigos).size, codigos.length);
  for (const codigo of ["1811301", "1812100", "1813001", "1813003", "1819199", "2230203", "3299002", "7490101", "4753900", "5812300", "1412602"]) assert.ok(codigos.includes(codigo), codigo);
});

test("código da CNAE em qualquer formato", () => {
  assert.equal(codigoCnae(1813001), "1813001");
  assert.equal(codigoCnae("1813-0/01"), "1813001");
  assert.equal(codigoCnae("18.13-0-01"), "1813001");
  assert.equal(codigoCnae(111301), "0111301", "agricultura: o número perde o zero da frente");
  assert.equal(codigoCnae(0), null, "a BrasilAPI manda 0 quando não há secundária");
  assert.equal(codigoCnae("abc"), null);
  assert.equal(formatarCnae("1813001"), "1813-0/01");
});

test("consulta da BrasilAPI: atividade principal, secundárias e situação", () => {
  const consulta = lerConsultaCnpj({
    cnae_fiscal: 4761003,
    cnaes_secundarios: [{ codigo: 1813001, descricao: "Impressão de material para uso publicitário" }, { codigo: 0, descricao: "" }, { codigo: 4761003 }],
    descricao_situacao_cadastral: "ATIVA",
  });
  assert.deepEqual(consulta, { ativa: true, situacao: "ATIVA", cnaes: ["4761003", "1813001"] });
  assert.equal(lerConsultaCnpj({ message: "CNPJ inválido" }), null);
  assert.equal(lerConsultaCnpj(null), null);
  assert.equal(lerConsultaCnpj({ cnae_fiscal: 1813001, descricao_situacao_cadastral: "BAIXADA" })?.ativa, false);
});

test("revendedor: CNPJ ativo com CNAE da lista é aprovado; o resto vai para a avaliação", () => {
  const grafica = { ativa: true, situacao: "ATIVA", cnaes: ["4761003", "1813001"] };
  const aprovado = decisaoDaRevenda("pj", grafica);
  assert.equal(aprovado.situacao, "aprovado");
  assert.deepEqual(aprovado.cnaes, ["1813001"], "a secundária também vale");
  assert.equal(decisaoDaRevenda("pf", grafica).situacao, "analise", "CPF sempre em análise");
  assert.equal(decisaoDaRevenda("pj", null).situacao, "analise", "sem resposta da Receita");
  assert.equal(decisaoDaRevenda("pj", { ...grafica, ativa: false, situacao: "BAIXADA" }).situacao, "analise", "CNPJ que não está ativo");
  const banco = decisaoDaRevenda("pj", { ativa: true, situacao: "ATIVA", cnaes: ["6422100"] });
  assert.equal(banco.situacao, "analise");
  assert.match(banco.motivo, /6422-1\/00/);
});

test("questionário: só as perguntas conhecidas, opção da lista, obrigatórias", () => {
  const respostas = lerRespostas({ tempo: "De 1 a 3 anos", atendimento: "não é opção", produtos: "  Banners  ", extra: "x", volume: 5 });
  assert.deepEqual(respostas, { tempo: "De 1 a 3 anos", produtos: "Banners" });
  assert.deepEqual(Object.keys(questionarioErros(respostas)).sort(), ["atendimento", "volume"]);
  const completas = Object.fromEntries(QUESTIONARIO_REVENDA.filter((p) => p.obrigatoria).map((p) => [p.id, p.tipo === "opcao" ? p.opcoes[0] : "Cartões"]));
  assert.deepEqual(questionarioErros(lerRespostas(completas)), {});
});

test("campos do perfil no cadastro da API (provisórios)", () => {
  assert.deepEqual(camposDoPerfil("cliente"), { perfil: "CLIENTE FINAL" });
  const decisao = decisaoDaRevenda("pj", { ativa: true, situacao: "ATIVA", cnaes: ["1813001"] });
  const campos = camposDoPerfil("revendedor", decisao, { tempo: "Mais de 3 anos", produtos: "Banners" });
  assert.equal(campos.perfil, "REVENDEDOR");
  assert.equal(campos.revenda?.situacao, "APROVADO");
  assert.deepEqual(campos.revenda?.cnaes, ["1813-0/01"]);
  assert.deepEqual(campos.revenda?.questionario.respostas, [
    { pergunta: "Há quanto tempo você revende produtos gráficos?", resposta: "Mais de 3 anos" },
    { pergunta: "Quais produtos você mais vende?", resposta: "Banners" },
  ]);
  assert.equal(camposDoPerfil("revendedor", decisaoDaRevenda("pf", null)).revenda?.situacao, "EM ANALISE");
  assert.match(textoDaRevenda(decisao), /aprovado.*1813-0\/01/);
  assert.match(textoDaRevenda({ situacao: "analise", cnaes: [] }), /avaliação/);
});
