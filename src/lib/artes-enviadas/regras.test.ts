import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApiPedidoItem } from "../api/types";
import { arquivosRecebidos, artesDosItens, casarItens, estadoDaArte, temArtes } from "./regras.ts";

const CDN = "https://padrao-color.b-cdn.net/uploads-clientes/";

test("o que o site guarda de cada item: a imagem no gabarito e os arquivos, na ordem do pedido", () => {
  const artes = artesDosItens([
    {
      name: "Cartão de Visita",
      variationId: 501,
      previa: { url: `${CDN}cartaogabarito1.jpg`, nome: "cartaogabarito1.jpg" },
      files: [
        { url: `${CDN}cartao1.pdf`, nome: "cartao1.pdf", kind: "pdf" },
        { url: `${CDN}logo1.png`, nome: "logo1.png", kind: "arquivo" },
        { url: `${CDN}faca1.pdf`, nome: "faca1.pdf", kind: "extra", tipo: "Faca de Corte" },
      ],
    },
    { name: "Caneta lisa", variationId: 77, files: [] },
  ]);
  assert.deepEqual(artes[0], {
    variacao: 501,
    nome: "Cartão de Visita",
    gabarito: { url: `${CDN}cartaogabarito1.jpg`, nome: "cartaogabarito1.jpg" },
    enviados: [
      { nome: "cartao1.pdf", url: `${CDN}cartao1.pdf`, tipo: "Arte no gabarito (PDF)" },
      { nome: "logo1.png", url: `${CDN}logo1.png`, tipo: "Arte enviada" },
      { nome: "faca1.pdf", url: `${CDN}faca1.pdf`, tipo: "Faca de Corte" },
    ],
  });
  assert.equal(temArtes(artes[1]), false, "item sem arte fica vazio, mas guarda a posição");
});

const itemApi = (pedido: number, produto: number) => ({ pedido, produto: { id: produto, descricao: "", quantidade: 1, arquivos: [] } }) as Pick<ApiPedidoItem, "pedido" | "produto">;

test("item do GET /pedidos casa pela variação e, sem ela, pela posição", () => {
  const guardados = artesDosItens([
    { name: "A", variationId: 10, files: [] },
    { name: "B", variationId: 20, files: [] },
    { name: "C", variationId: undefined, files: [] },
  ]);
  const casados = casarItens([itemApi(902, 20), itemApi(901, 10), itemApi(903, 99)], guardados);
  assert.equal(casados.get(901)?.nome, "A");
  assert.equal(casados.get(902)?.nome, "B");
  assert.equal(casados.get(903)?.nome, "C", "sem variação guardada, vale a posição");
  const outro = casarItens([itemApi(1, 10), itemApi(2, 55)], artesDosItens([{ name: "A", variationId: 10, files: [] }, { name: "B", variationId: 20, files: [] }]));
  assert.equal(outro.has(2), false, "variação diferente na mesma posição não casa");
});

test("situação da arte pelo texto da situação do item", () => {
  assert.equal(estadoDaArte({ descricao: "Aguardando aprovação" }).estado, "analise");
  assert.equal(estadoDaArte({ descricao: "Problema na arte", reenvia_arte: "Sim" }).estado, "recusada");
  assert.equal(estadoDaArte({ descricao: "Pendente", reenvia_arte: "Sim" }).estado, "recusada");
  assert.equal(estadoDaArte({ descricao: "Arte aprovada" }).estado, "aprovada");
  assert.equal(estadoDaArte({ descricao: "Em produção" }).estado, "aprovada");
  assert.equal(estadoDaArte({ descricao: "Cancelado" }).estado, "cancelada");
  assert.equal(estadoDaArte({ descricao: "Novo" }).estado, "analise", "sem pista, fica em análise");
});

test("arquivos que a Padrão recebeu: só links http(s), nome de reserva", () => {
  const recebidos = arquivosRecebidos({ produto: { id: 1, descricao: "", quantidade: 1, arquivos: [{ nome: "arte-final.pdf", url: "https://img.padraocolor.com.br/a.pdf", tipo: "Arquivo Único" }, { url: "javascript:alert(1)" }, "lixo"] } });
  assert.deepEqual(recebidos, [
    { nome: "arte-final.pdf", url: "https://img.padraocolor.com.br/a.pdf", tipo: "Arquivo Único" },
    { nome: "arquivo", url: "", tipo: "" },
  ]);
});
