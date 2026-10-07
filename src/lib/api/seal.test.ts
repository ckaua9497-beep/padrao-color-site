import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveKey, seal, unseal } from "./seal.ts";

const KEY = deriveKey("x".repeat(64));

test("lacra e abre a sessão", () => {
  const data = { token: "jwt.abc.def", id: 575, name: "Cliente", exp: 1_900_000_000 };
  const sealed = seal(data, KEY);
  const raw = Buffer.from(sealed, "base64url").toString("latin1");
  assert.ok(!raw.includes("jwt.abc.def") && !raw.includes("Cliente"), "o conteúdo não aparece no cookie");
  assert.deepEqual(unseal(sealed, KEY), data);
  assert.notEqual(seal(data, KEY), sealed, "IV aleatório: cada lacre é diferente");
});

test("cookie alterado, de outra chave ou lixo não abre", () => {
  const sealed = seal({ id: 1 }, KEY);
  const bytes = Buffer.from(sealed, "base64url");
  bytes[bytes.length - 1] ^= 1;
  assert.equal(unseal(bytes.toString("base64url"), KEY), null, "dados alterados");
  assert.equal(unseal(sealed, deriveKey("y".repeat(64))), null, "outra chave");
  assert.equal(unseal(sealed.slice(0, 20), KEY), null, "truncado");
  assert.equal(unseal("não é um lacre", KEY), null);
  assert.equal(unseal("", KEY), null);
  assert.equal(unseal("a".repeat(5000), KEY), null, "grande demais");
});

test("segredo curto é recusado", () => {
  assert.throws(() => deriveKey("curto"), /32 caracteres/);
  assert.throws(() => deriveKey(""), /32 caracteres/);
});
