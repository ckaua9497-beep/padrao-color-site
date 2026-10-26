import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApiEndereco } from "./api/types";
import { emailDoCliente, nascimentoDoCliente, rotaDoCliente, saldoDaConta } from "./cliente.ts";

// Dados fictícios no formato do GET /cliente real (rota pelo nome da cor, taxa só no endereço de entrega).
const endereco = (patch: Partial<ApiEndereco> = {}): ApiEndereco => ({ logradouro: "Rua A", numero: "1", bairro: "Centro", cidade: "Rio de Janeiro", estado: "RJ", cep: "20000-000", ...patch });

test("rota pelo nome da cor, com a taxa do endereço de entrega", () => {
  const cliente = { endereco_cadastro: endereco({ rota: "VERDE" }), endereco_entrega: endereco({ rota: "VERDE", taxa_rota: 17 }), pagamento_antecipado: "S" };
  assert.deepEqual(rotaDoCliente(cliente), { tipo: "rota", nome: "Rota Verde", cor: "#2e9e44", taxa: 17, cobradaNoPedido: true });
  const naRetirada = rotaDoCliente({ ...cliente, pagamento_antecipado: "N" });
  assert.equal(naRetirada.tipo === "rota" && naRetirada.cobradaNoPedido, false, "pagamento na retirada: a taxa não entra no pedido");
});

test("rota com nome composto, sem cor conhecida ou só no cadastro", () => {
  assert.deepEqual(rotaDoCliente({ endereco_entrega: endereco({ rota: "AZUL CLARO", taxa_rota: "12,50" as unknown as number }), endereco_cadastro: endereco(), pagamento_antecipado: "S" }), {
    tipo: "rota",
    nome: "Rota Azul Claro",
    cor: "#1e66f5",
    taxa: 12.5,
    cobradaNoPedido: true,
  });
  const semCor = rotaDoCliente({ endereco_entrega: endereco({ rota: "Rota Norte" }), endereco_cadastro: endereco(), pagamento_antecipado: "S" });
  assert.deepEqual(semCor, { tipo: "rota", nome: "Rota Norte", cor: null, taxa: 0, cobradaNoPedido: true });
  const soCadastro = rotaDoCliente({ endereco_entrega: endereco(), endereco_cadastro: endereco({ rota: "AMARELA" }), pagamento_antecipado: "S" });
  assert.equal(soCadastro.tipo === "rota" && soCadastro.nome, "Rota Amarela");
});

test("sem rota no cadastro: transportadora", () => {
  assert.deepEqual(rotaDoCliente({ endereco_entrega: endereco(), endereco_cadastro: endereco(), pagamento_antecipado: "S" }), { tipo: "transportadora" });
  assert.deepEqual(rotaDoCliente({ endereco_entrega: endereco({ rota: "TRANSPORTADORA" }), endereco_cadastro: endereco(), pagamento_antecipado: "N" }), { tipo: "transportadora" });
});

test("saldo em conta_corrente.credito (formato atual) ou saldo (antigo)", () => {
  assert.equal(saldoDaConta({ credito: 295.1, bloqueado: 0 } as never), 295.1);
  assert.equal(saldoDaConta({ saldo: -40, bloqueado: 0 } as never), -40);
  assert.equal(saldoDaConta({ credito: 0 } as never), 0, "zero é saldo, não ausência");
  assert.equal(saldoDaConta(null), null);
  assert.equal(saldoDaConta({}), null);
});

test("e-mail do cadastro quando o principal vem vazio; nascimento DD/MM/AAAA", () => {
  assert.equal(emailDoCliente({ email: "", email_cadastro: "contato@exemplo.com.br" }), "contato@exemplo.com.br");
  assert.equal(emailDoCliente({ email: "ana@exemplo.com", email_cadastro: "outro@exemplo.com" }), "ana@exemplo.com");
  assert.equal(nascimentoDoCliente({ nascimento: "05/03/1990" }), "1990-03-05");
  assert.equal(nascimentoDoCliente({ nascimento: "31/02/1990" }), "");
  assert.equal(nascimentoDoCliente({}), "");
});
