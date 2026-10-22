import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChargeInput } from "./types";
import { cobrancasDoAviso, erroPagarme, pedidoPixPagarme, pixCriado, situacaoPagarme, telefonePagarme } from "./pagarme-dados.ts";

// Dados de mentira (documento fora do padrão de CPF real; nada sai daqui).
const input: ChargeInput = {
  codigo: "ML-7F3K2Q",
  total: 82.52,
  cliente: { nome: "  Maria da Silva  ", email: "maria@exemplo.com", telefone: "(21) 99999-0000", documento: "000.000.000-00" },
  entrega: { cep: "20040-020", logradouro: "Rua do Ouvidor", numero: "50", complemento: "Sala 2", bairro: "Centro", cidade: "Rio de Janeiro", estado: "RJ" },
  descricao: "Pedido ML-7F3K2Q — Ateliê Demo",
  returnUrl: "",
  boletoDias: 3,
};

test("telefone: DDD e número, sem o 55; inválido vira null", () => {
  assert.deepEqual(telefonePagarme("(21) 99999-0000"), { country_code: "55", area_code: "21", number: "999990000" });
  assert.deepEqual(telefonePagarme("+55 11 3333-4444"), { country_code: "55", area_code: "11", number: "33334444" });
  assert.equal(telefonePagarme("9999"), null);
});

test("pedido Pix: um item com o total em centavos, cliente completo e Pix com validade", () => {
  const body = pedidoPixPagarme(input, 1800);
  assert.equal(body.code, "ML-7F3K2Q");
  assert.deepEqual(body.items, [{ code: "ML-7F3K2Q", description: "Pedido ML-7F3K2Q — Ateliê Demo", amount: 8252, quantity: 1 }]);
  assert.equal(body.customer.name, "Maria da Silva");
  assert.equal(body.customer.type, "individual");
  assert.equal(body.customer.document_type, "CPF");
  assert.equal(body.customer.document, "00000000000");
  assert.deepEqual(body.customer.phones, { mobile_phone: { country_code: "55", area_code: "21", number: "999990000" } });
  assert.deepEqual(body.customer.address, { line_1: "50, Rua do Ouvidor, Centro", line_2: "Sala 2", zip_code: "20040020", city: "Rio de Janeiro", state: "RJ", country: "BR" });
  assert.deepEqual(body.payments, [{ payment_method: "pix", pix: { expires_in: 1800, additional_information: [{ name: "Pedido", value: "ML-7F3K2Q" }] } }]);
  // CNPJ: empresa.
  const empresa = pedidoPixPagarme({ ...input, cliente: { ...input.cliente, documento: "00.000.000/0000-00" } });
  assert.equal(empresa.customer.type, "company");
  assert.equal(empresa.customer.document_type, "CNPJ");
});

test("resposta do pedido: cobrança, copia e cola, imagem e validade; recusa vira erro com a mensagem da Pagar.me", () => {
  const ok = pixCriado({
    id: "or_56GXnk6T0eU88qMm",
    status: "pending",
    charges: [{ id: "ch_K2rJ5nlHwTE4qRDP", status: "pending", last_transaction: { status: "waiting_payment", qr_code: "00020101021226…", qr_code_url: "https://api.pagar.me/core/v5/transactions/tran_x/qrcode?payment_method=pix", expires_at: "2026-10-09T22:00:00Z" } }],
  });
  assert.deepEqual(ok, { pedidoId: "or_56GXnk6T0eU88qMm", cobrancaId: "ch_K2rJ5nlHwTE4qRDP", qrCode: "00020101021226…", qrUrl: "https://api.pagar.me/core/v5/transactions/tran_x/qrcode?payment_method=pix", expiraEm: "2026-10-09T22:00:00Z" });
  const recusado = pixCriado({ id: "or_x", status: "failed", charges: [{ id: "ch_K2rJ5nlHwTE4qRDP", status: "failed", last_transaction: { status: "failed", gateway_response: { code: "400", errors: [{ message: "Pix não habilitado" }] } } }] });
  assert.equal(recusado.erro, "Pix não habilitado");
  assert.equal(erroPagarme({ message: "The request is invalid.", errors: { "order.customer.phones": ["The phones field is required."] } }), "The request is invalid. — order.customer.phones: The phones field is required.");
});

test("situação da cobrança: paga (com o e2e do Pix), aberta ou cancelada/falhou", () => {
  assert.deepEqual(situacaoPagarme({ status: "paid", last_transaction: { end_to_end_id: "E123" } }), { status: "pago", e2eId: "E123" });
  assert.deepEqual(situacaoPagarme({ status: "overpaid" }), { status: "pago" });
  assert.deepEqual(situacaoPagarme({ status: "pending" }), { status: "pendente" });
  assert.deepEqual(situacaoPagarme({ status: "processing" }), { status: "pendente" });
  assert.deepEqual(situacaoPagarme({ status: "canceled" }), { status: "expirado" });
  assert.deepEqual(situacaoPagarme({ status: "failed" }), { status: "expirado" });
  assert.deepEqual(situacaoPagarme(null), { status: "pendente" });
});

test("aviso: cobranças de charge.* (data) e de order.* (data.charges), sem repetir nem aceitar id estranho", () => {
  assert.deepEqual(cobrancasDoAviso({ type: "charge.paid", data: { id: "ch_K2rJ5nlHwTE4qRDP", status: "paid" } }), ["ch_K2rJ5nlHwTE4qRDP"]);
  assert.deepEqual(cobrancasDoAviso({ type: "order.paid", data: { id: "or_56GXnk6T0eU88qMm", charges: [{ id: "ch_K2rJ5nlHwTE4qRDP" }, { id: "ch_K2rJ5nlHwTE4qRDP" }] } }), ["ch_K2rJ5nlHwTE4qRDP"]);
  assert.deepEqual(cobrancasDoAviso({ type: "charge.paid", data: { id: "../../etc" } }), []);
  assert.deepEqual(cobrancasDoAviso("lixo"), []);
});
