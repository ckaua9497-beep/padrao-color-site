import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "./rate-limit.ts";

test("bloqueia depois do máximo e libera na janela seguinte", () => {
  const limiter = createRateLimiter({ max: 3, windowMs: 60_000 });
  const t0 = 1_000_000;
  assert.equal(limiter.hit("ip", t0).ok, true);
  assert.equal(limiter.hit("ip", t0 + 1).ok, true);
  assert.equal(limiter.hit("ip", t0 + 2).remaining, 0);
  const blocked = limiter.hit("ip", t0 + 3);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterSec, 60);
  assert.equal(limiter.hit("outro", t0 + 3).ok, true, "chaves independentes");
  assert.equal(limiter.hit("ip", t0 + 60_001).ok, true, "janela nova");
});

test("reset libera a chave (login certo zera as tentativas)", () => {
  const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });
  limiter.hit("user", 0);
  assert.equal(limiter.hit("user", 1).ok, false);
  limiter.reset("user");
  assert.equal(limiter.hit("user", 2).ok, true);
});

test("memória limitada: com muitas chaves descarta as antigas", () => {
  const limiter = createRateLimiter({ max: 1, windowMs: 60_000, maxKeys: 10 });
  for (let i = 0; i < 50; i += 1) limiter.hit(`k${i}`, i);
  assert.equal(limiter.hit("k0", 100).ok, true, "k0 foi descartada");
});
