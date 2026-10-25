import { test } from "node:test";
import assert from "node:assert/strict";
import { isArtFileUrl, parseUploadedFiles } from "../art-files.ts";
import { MAX_TENTATIVAS, anexosGuardados, classificarFalha, esperaMinutos, isEtapaFila, nomeGuardado, pastaGuardados, protocoloDe, trocarAnexos } from "./regras.ts";

test("a espera cresce a cada tentativa e para em 1 hora", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 8, 30].map(esperaMinutos),
    [1, 2, 5, 10, 20, 30, 60, 60, 60],
  );
  assert.ok(MAX_TENTATIVAS > 24);
});

test("protocolo e etapas", () => {
  assert.equal(protocoloDe(42), "PF-00042");
  assert.equal(protocoloDe(123456), "PF-123456");
  assert.equal(isEtapaFila("conferir"), true);
  assert.equal(isEtapaFila("pago"), false);
});

test("consulta (GET) sem conexão ou bloqueada volta para a fila; recusa vai para conferir", () => {
  assert.equal(classificarFalha("consulta", { status: 503, reached: false }), "sem-conexao");
  assert.equal(classificarFalha("consulta", { status: 502, reached: true }), "sem-conexao");
  assert.equal(classificarFalha("consulta", { status: 403, reached: true }), "sem-conexao");
  assert.equal(classificarFalha("consulta", { status: 429, reached: true }), "sem-conexao");
  assert.equal(classificarFalha("consulta", null), "sem-conexao");
  assert.equal(classificarFalha("consulta", { status: 401, reached: true }), "recusado");
});

test("gerarpedido só volta para a fila quando nada saiu", () => {
  assert.equal(classificarFalha("pedido", { status: 503, reached: false }), "sem-conexao");
  assert.equal(classificarFalha("pedido", { status: 422, reached: true }), "recusado");
  // Pode ter criado o pedido: a equipe confere antes de reenviar.
  assert.equal(classificarFalha("pedido", { status: 500, reached: true }), "incerto");
  assert.equal(classificarFalha("pedido", { status: 504, reached: "maybe" }), "incerto");
  assert.equal(classificarFalha("pedido", null), "incerto");
});

test("o nome guardado é aceito como arquivo da arte na pasta do site", () => {
  const nome = nomeGuardado("Cartão de Visita (final) muito comprido com um nome enorme demais para caber.pdf", "0123456789abcdef9999", 1792922254231);
  assert.ok(nome.startsWith("0123456789abcdef"));
  assert.ok(nome.endsWith("1792922254231.pdf"));
  assert.ok(nome.length <= 84, `${nome.length}`);
  const pasta = pastaGuardados("http://localhost:3100/");
  assert.equal(pasta, "http://localhost:3100/api/pedidos/arquivo/");
  assert.equal(isArtFileUrl(pasta + nome, pasta), true);
  const bunny = "https://padrao-color.b-cdn.net/uploads-clientes/";
  const files = parseUploadedFiles(
    [
      { url: pasta + nome, nome, kind: "arquivo" },
      { url: `${bunny}Logo1.png`, nome: "Logo1.png", kind: "pdf" },
      { url: "https://outro.site/x.png", nome: "x.png", kind: "arquivo" },
    ],
    [bunny, pasta],
  );
  assert.deepEqual(
    files.map((f) => f.nome),
    [nome, "Logo1.png"],
  );
});

test("anexos guardados no site são trocados pelas URLs do Bunny sem alterar o original", () => {
  const pasta = "https://site/api/pedidos/arquivo/";
  const payload = {
    produtos: [
      { arte: { anexos: [{ url: `${pasta}abc1.pdf`, nome: "abc1.pdf", tipoArquivo: "Arquivo Único" }] } },
      { arte: { anexos: [{ url: "https://cdn/x/Logo2.png", nome: "Logo2.png", tipoArquivo: "Arquivo Único" }] } },
    ],
  };
  assert.deepEqual(anexosGuardados(payload, pasta), [`${pasta}abc1.pdf`]);
  const novo = trocarAnexos(payload, { [`${pasta}abc1.pdf`]: { url: "https://cdn/x/abc12.pdf", nome: "abc12.pdf" } });
  assert.equal(novo.produtos[0].arte.anexos[0].url, "https://cdn/x/abc12.pdf");
  assert.equal(novo.produtos[0].arte.anexos[0].nome, "abc12.pdf");
  assert.equal(payload.produtos[0].arte.anexos[0].url, `${pasta}abc1.pdf`);
});
