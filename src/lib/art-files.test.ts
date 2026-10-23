import { test } from "node:test";
import assert from "node:assert/strict";
import { artFileName, artPublicBase, attachmentType, isArtFileUrl, orderAttachments, parseUploadedFiles, uploadProblem } from "./art-files.ts";

const BASE = artPublicBase("https://padrao-color.b-cdn.net/", "/uploads-clientes/");

test("nome do arquivo no Bunny: sem acento, espaço nem símbolo, com o momento do envio", () => {
  assert.equal(artFileName("cartao visita.pdf", 1742572800), "cartaovisita1742572800.pdf");
  assert.equal(artFileName("Banner 80x120 (teste) 2026.JPG", 1791545356518), "Banner80x120teste20261791545356518.jpg");
  assert.equal(artFileName("Cartão de Visita — Ana & Cia.pdf", 7), "CartaodeVisitaAnaCia7.pdf");
  assert.equal(artFileName("###.png", 5), "arte5.png");
  assert.equal(artFileName("sem-extensao", 9), "semextensao9.bin");
  assert.ok(artFileName(`${"x".repeat(300)}.ai`, 1).length <= 60 + 1 + 3);
});

test("formato e tamanho aceitos no envio", () => {
  assert.equal(uploadProblem("logo.cdr", 1000), null);
  assert.equal(uploadProblem("arte.PDF", 1000), null);
  assert.match(uploadProblem("virus.exe", 1000) ?? "", /Formato/);
  assert.match(uploadProblem("vazio.pdf", 0) ?? "", /vazio/);
  assert.match(uploadProblem("enorme.pdf", 61 * 1024 * 1024) ?? "", /MB/);
});

test("só URLs da pasta pública com nome gerado aqui", () => {
  assert.equal(BASE, "https://padrao-color.b-cdn.net/uploads-clientes/");
  assert.ok(isArtFileUrl(`${BASE}cartaovisita1742572800.pdf`, BASE));
  assert.ok(!isArtFileUrl("https://outro.site/uploads-clientes/a1.pdf", BASE));
  assert.ok(!isArtFileUrl(`${BASE}../segredo/a1.pdf`, BASE));
  assert.ok(!isArtFileUrl(`${BASE}a b.pdf`, BASE));
  assert.ok(!isArtFileUrl(`${BASE}x.pdf`, ""));
});

test("arquivos do item vindos do navegador: válidos, sem repetir, no máximo doze", () => {
  const ok = { url: `${BASE}logo1.png`, nome: "logo1.png", kind: "arquivo" };
  const files = parseUploadedFiles(
    [ok, ok, { url: "https://x.com/a.png", nome: "a.png", kind: "arquivo" }, { url: `${BASE}b2.pdf`, nome: "outro.pdf", kind: "pdf" }, { url: `${BASE}c3.pdf`, nome: "c3.pdf", kind: "zip" }, "lixo"],
    BASE,
  );
  assert.deepEqual(files, [ok]);
  assert.deepEqual(parseUploadedFiles(null, BASE), []);
  const many = Array.from({ length: 20 }, (_, i) => ({ url: `${BASE}f${i}.pdf`, nome: `f${i}.pdf`, kind: "pdf" }));
  assert.equal(parseUploadedFiles(many, BASE).length, 12);
});

test("complementar: só com o tipo de anexo; vai com o próprio tipo quando a variação aceita", () => {
  const faca = { url: `${BASE}faca1.pdf`, nome: "faca1.pdf", kind: "extra", tipo: "Faca de Corte" };
  assert.deepEqual(parseUploadedFiles([faca, { url: `${BASE}x2.pdf`, nome: "x2.pdf", kind: "extra" }], BASE), [faca]);
  assert.equal(attachmentType("extra", ["Arquivo Único", "Faca de Corte"], "Faca de Corte"), "Faca de Corte");
  assert.equal(attachmentType("extra", ["Arquivo Único"], "Faca de Corte"), "Arquivo Único", "tipo que a variação não aceita");
  const files = [{ url: `${BASE}faca1.pdf`, nome: "faca1.pdf", kind: "extra" as const, tipo: "Faca de Corte" }, { url: `${BASE}logo2.png`, nome: "logo2.png", kind: "arquivo" as const }];
  assert.deepEqual(
    orderAttachments(files, ["Arquivo Único", "Impressão Frente", "Faca de Corte"]).map((a) => [a.nome, a.tipoArquivo]),
    [
      ["logo2.png", "Arquivo Único"],
      ["faca1.pdf", "Faca de Corte"],
    ],
  );
  assert.deepEqual(orderAttachments(files, [], { semArquivo: true }), [], "variação sem personalização: nenhum anexo");
});

test("tipo do anexo segue o que o produto aceita na API", () => {
  assert.equal(attachmentType("pdf", ["Arquivo Único"]), "Arquivo Único");
  assert.equal(attachmentType("arquivo", []), "Arquivo Único");
  assert.equal(attachmentType("arquivo", ["Impressão Frente", "Impressão Verso"]), "Impressão Frente");
  assert.equal(attachmentType("verso", ["Impressão Frente", "Impressão Verso"]), "Impressão Verso");
  assert.equal(attachmentType("verso", ["Arquivo Único"]), "Arquivo Único");
  assert.equal(attachmentType("arquivo", ["Capa", "Miolo"]), "Capa");
  const anexos = orderAttachments(
    [
      { url: `${BASE}verso1.png`, nome: "verso1.png", kind: "verso" },
      { url: `${BASE}logo2.png`, nome: "logo2.png", kind: "arquivo" },
      { url: `${BASE}gabarito3.pdf`, nome: "gabarito3.pdf", kind: "pdf" },
    ],
    ["Impressão Frente", "Impressão Verso"],
  );
  assert.deepEqual(
    anexos.map((a) => [a.nome, a.tipoArquivo]),
    [
      ["gabarito3.pdf", "Impressão Frente"],
      ["logo2.png", "Impressão Frente"],
      ["verso1.png", "Impressão Verso"],
    ],
  );
});
