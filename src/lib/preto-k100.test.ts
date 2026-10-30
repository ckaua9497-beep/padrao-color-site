import { test } from "node:test";
import assert from "node:assert/strict";
import { opacidadeDoPreto } from "./preto-k100.ts";

test("preto do texto: o preto da paleta e quase-pretos neutros vão em K100", () => {
  assert.equal(opacidadeDoPreto("#000000"), 1);
  assert.equal(opacidadeDoPreto("#000"), 1);
  assert.equal(opacidadeDoPreto("#141414"), 1);
  assert.equal(opacidadeDoPreto("#17171c"), 1, "Noite: neutro o bastante");
  assert.equal(opacidadeDoPreto("rgb(0, 0, 0)"), 1);
  assert.equal(opacidadeDoPreto("rgba(0, 0, 0, 0.7)"), 0.7, "subtexto do modelo: preto a 70%");
  assert.equal(opacidadeDoPreto("#000000b3"), 0xb3 / 255);
});

test("preto do texto: cor, cinza claro, transparente e gradiente ficam na imagem", () => {
  for (const cor of ["#282e34", "#0888c8", "#ffffff", "#333333", "#300000", "rgba(0, 0, 0, 0)", "transparent", "", "red"]) {
    assert.equal(opacidadeDoPreto(cor), null, cor);
  }
  assert.equal(opacidadeDoPreto({}), null, "CanvasGradient/CanvasPattern");
  assert.equal(opacidadeDoPreto(null), null);
});
