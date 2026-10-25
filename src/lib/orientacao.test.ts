import { test } from "node:test";
import assert from "node:assert/strict";
import { orientacaoDe, orientacaoLivre, orientar } from "./orientacao.ts";

test("crachá, canvas e banner de medida definida escolhem a orientação", () => {
  const base = { variant: null, medidaLivre: false, options: { Formato: ["8,5x5,4 cm"] } };
  assert.equal(orientacaoLivre({ ...base, kind: "badge", name: "cracha" }), true);
  assert.equal(orientacaoLivre({ ...base, kind: "badge", name: "credencial" }), false, "a credencial tem formato próprio");
  assert.equal(orientacaoLivre({ ...base, kind: "canvas", name: "quadro decorativo em canvas" }), true);
  assert.equal(orientacaoLivre({ ...base, kind: "banner", name: "banner 60x90" }), true);
  assert.equal(orientacaoLivre({ ...base, kind: "banner", variant: "mini", name: "mini banner" }), false);
  assert.equal(orientacaoLivre({ ...base, kind: "banner", name: "banner medida personalizada", medidaLivre: true }), false);
  assert.equal(orientacaoLivre({ ...base, kind: "banner", name: "banner", options: { Formato: ["0,80x1,20m (vertical)", "1,20x0,80m (horizontal)"] } }), false, "a opção já traz a orientação");
  assert.equal(orientacaoLivre({ ...base, kind: "card", name: "cartao de visita" }), false);
});

test("orientar troca largura e altura só quando precisa", () => {
  const badge = { widthCm: 8.5, heightCm: 5.4 };
  assert.equal(orientacaoDe(8.5, 5.4), "horizontal");
  assert.deepEqual(orientar(badge, "vertical"), { widthCm: 5.4, heightCm: 8.5 });
  assert.equal(orientar(badge, "horizontal"), badge);
  assert.equal(orientar(badge, null), badge);
  assert.deepEqual(orientar({ widthCm: 30, heightCm: 30 }, "vertical"), { widthCm: 30, heightCm: 30 });
});
