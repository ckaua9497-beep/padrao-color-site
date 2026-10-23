import { test } from "node:test";
import assert from "node:assert/strict";
import { artesParaProducao, type ItemComArte } from "./artes-producao.ts";

const itens: ItemComArte[] = [
  { nome: "Caneca", arteArquivo: "0-abc.png", arteNome: "logo loja.png" },
  { nome: "Camiseta", arteArquivo: null, arteNome: null },
  { nome: "Boné", arteArquivo: "2-sumiu.pdf", arteNome: "bone.pdf" },
];
const banco: Record<string, Uint8Array> = { "0-abc.png": new Uint8Array([1, 2, 3]) };
const ler = async (arquivo: string) => banco[arquivo] ?? null;

test("sobe cada arte guardada e devolve os anexos por item; sem arte ou arte sumida fica pendente", async () => {
  const enviados: { name: string; size: number }[] = [];
  const result = await artesParaProducao(itens, {
    ler,
    subir: async (file) => {
      enviados.push({ name: file.name, size: file.bytes.byteLength });
      return { url: "https://cdn.test/uploads-clientes/logoloja1.png", nome: "logoloja1.png" };
    },
  });
  assert.ok(result.ok);
  assert.deepEqual(enviados, [{ name: "logo loja.png", size: 3 }], "com o nome que o comprador deu");
  assert.deepEqual(result.arquivos, [[{ url: "https://cdn.test/uploads-clientes/logoloja1.png", nome: "logoloja1.png", kind: "arquivo" }], [], []]);
  assert.deepEqual(result.pendentes, ["Camiseta", "Boné"]);
});

test("envio desligado: nada sobe e todo item vai pendente", async () => {
  const result = await artesParaProducao(itens, { ler, subir: null });
  assert.ok(result.ok);
  assert.deepEqual(result.arquivos, [[], [], []]);
  assert.equal(result.pendentes.length, 3);
});

test("falha no Bunny para o envio à produção", async () => {
  const result = await artesParaProducao(itens, {
    ler,
    subir: async () => {
      throw new Error("503");
    },
  });
  assert.equal(result.ok, false);
  assert.match(!result.ok ? result.message : "", /Caneca/);
});
