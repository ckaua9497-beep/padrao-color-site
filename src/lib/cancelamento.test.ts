import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApiPedido, ApiPedidoItem } from "./api/types";
import { estornoDe, itemCancelavel, janelaDeCancelamento, momentoDaCompra, motivoSemCancelamento, textoDoEstorno } from "./cancelamento.ts";

const item = (pedido: number, total: number, descricao = "Aguardando arte"): ApiPedidoItem =>
  ({ pedido, valor: { produto: total, criacao_arte: 0, tratamento_profissional: 0, frete: 0, total }, situacao: { id: 1, status: "", descricao, texto: "", defeito: "", reenvia_arte: "Não" } }) as ApiPedidoItem;

const compra = (patch: Partial<ApiPedido> = {}): ApiPedido =>
  ({
    compra: 900,
    data: "08/10/2026",
    hora: "14:20:00",
    envio: "",
    multiloja: "Não",
    itens: [item(1, 60), item(2, 40)],
    pagamento: { id: "", autorizacao: "", tipo: "PIX", parcelas: "1", status: "Aprovado" },
    nota_fiscal: { numero: "", chave: "", link: "" },
    frete: 0,
    valor_total: 100,
    credito_usado: 0,
    valor_cupom: 0,
    valor_pago: 100,
    ...patch,
  }) as ApiPedido;

// 08/10/2026 14:20 em Brasília = 17:20 UTC.
const COMPRA = Date.UTC(2026, 9, 8, 17, 20);

test("hora da compra em Brasília e o prazo de 15 minutos", () => {
  assert.equal(momentoDaCompra({ data: "08/10/2026", hora: "14:20:00" }), COMPRA);
  assert.equal(momentoDaCompra({ data: "08/10/2026", hora: "14:20" }), COMPRA, "hora sem segundos");
  assert.equal(momentoDaCompra({ data: "31/02/2026", hora: "14:20" }), null);
  assert.equal(momentoDaCompra({ data: "", hora: "" }), null);

  const aberta = janelaDeCancelamento(compra(), COMPRA + 14 * 60_000);
  assert.deepEqual(aberta, { aberta: true, ate: COMPRA + 15 * 60_000, ateHora: "14:35", itens: [1, 2] });
  assert.equal(janelaDeCancelamento(compra(), COMPRA + 15 * 60_000).aberta, false, "aos 15 min em ponto já fechou");
  assert.equal(janelaDeCancelamento(compra({ data: "", hora: "" }), COMPRA).aberta, false, "sem data legível não abre");
  assert.equal(janelaDeCancelamento(compra({ multiloja: "Sim" }), COMPRA).aberta, false, "compra da multiloja cancela pela loja");
});

test("só os itens que ainda podem ser cancelados entram", () => {
  assert.equal(itemCancelavel({ descricao: "Em produção" }), true);
  assert.equal(itemCancelavel({ descricao: "Cancelado" }), false);
  assert.equal(itemCancelavel({ descricao: "Expedido", status: "Em rota de entrega" }), false);
  const janela = janelaDeCancelamento(compra({ itens: [item(1, 60, "Cancelado"), item(2, 40)] }), COMPRA);
  assert.deepEqual(janela.itens, [2]);
  const nenhum = janelaDeCancelamento(compra({ itens: [item(1, 60, "Cancelado")] }), COMPRA);
  assert.equal(nenhum.aberta, false);
  assert.match(motivoSemCancelamento(compra(), nenhum), /não tem mais itens/);
  assert.match(motivoSemCancelamento(compra(), janelaDeCancelamento(compra(), COMPRA + 20 * 60_000)), /terminou às 14:35/);
});

test("estorno de acordo com o valor pago: crédito volta para a conta, o resto pela forma de pagamento", () => {
  const mista = compra({ valor_total: 100, credito_usado: 30, valor_cupom: 10, valor_pago: 60 });
  assert.deepEqual(estornoDe(mista, [1, 2]), { credito: 30, pagamento: 60, total: 90, forma: "PIX" }, "a compra inteira devolve tudo o que foi pago");
  assert.deepEqual(estornoDe(mista, [2]), { credito: 12, pagamento: 24, total: 36, forma: "PIX" }, "o item de R$ 40 leva 40% do crédito e do pago");
  assert.deepEqual(estornoDe(compra({ credito_usado: 100, valor_pago: 0, pagamento: { id: "", autorizacao: "", tipo: "Crédito", parcelas: "1", status: "" } }), [1]).credito, 60, "só crédito");
  assert.equal(estornoDe(compra({ valor_pago: 0 }), [1, 2]).total, 0, "nada pago ainda");
  const semValores = compra({ itens: [item(1, 0), item(2, 0)], credito_usado: 10, valor_pago: 0 });
  assert.equal(estornoDe(semValores, [1]).credito, 5, "sem valor nos itens, divide por igual");
});

test("texto do estorno", () => {
  assert.deepEqual(textoDoEstorno({ credito: 0, pagamento: 0, total: 0, forma: "PIX" }), ["Nenhum valor foi pago ainda: não há estorno."]);
  const [credito, pago] = textoDoEstorno({ credito: 12, pagamento: 24, total: 36, forma: "PIX" });
  assert.match(credito, /R\$\s?12,00 voltam automaticamente como crédito Padrão Color/);
  assert.match(pago, /R\$\s?24,00 pagos via PIX são estornados/);
});
