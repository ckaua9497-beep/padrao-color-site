import { test } from "node:test";
import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import { rootCertificates } from "node:tls";
import { LETS_ENCRYPT_CHAIN } from "./tls-chain.ts";

/*
 * A cadeia embutida (tls-chain.ts) é o que faz o site falar com a API: o host lab.padraocolor.com não envia o
 * intermediário da Let's Encrypt. Sem rede: confere que cada intermediário sobe até uma raiz que o Node já
 * conhece e que nada vence nos próximos 60 dias.
 */

const certs = LETS_ENCRYPT_CHAIN.map((pem) => new X509Certificate(pem));
const roots = rootCertificates.map((pem) => new X509Certificate(pem));

test("a cadeia da Let's Encrypt fecha numa raiz do Node (YR1–YR3 e YE1–YE3)", () => {
  for (const name of ["YR1", "YR2", "YR3", "YE1", "YE2", "YE3"]) {
    let cert = certs.find((c) => c.subject.includes(`CN=${name}`));
    assert.ok(cert, `${name} está na cadeia`);
    for (let depth = 0; depth < 4 && cert; depth += 1) {
      const issuer: X509Certificate | undefined = certs.find((c) => c.subject === cert?.issuer && c !== cert);
      const root = roots.find((r) => r.subject === cert?.issuer);
      if (root) {
        assert.ok(cert.verify(root.publicKey), `${name}: assinatura confere com ${root.subject.replace(/\n/g, ", ")}`);
        cert = undefined;
        break;
      }
      assert.ok(issuer, `${name}: emissor de ${cert.subject.replace(/\n/g, ", ")} está na cadeia`);
      assert.ok(cert.verify(issuer.publicKey), `${name}: assinatura de ${cert.subject.replace(/\n/g, ", ")}`);
      cert = issuer;
    }
    assert.equal(cert, undefined, `${name} chega a uma raiz do Node`);
  }
});

test("nenhum certificado da cadeia vence nos próximos 60 dias", () => {
  const limit = Date.now() + 60 * 86_400_000;
  for (const cert of certs) assert.ok(new Date(cert.validTo).getTime() > limit, `${cert.subject.replace(/\n/g, ", ")} vence em ${cert.validTo}`);
});
