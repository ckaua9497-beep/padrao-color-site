import "server-only";

import { randomUUID } from "node:crypto";
import { cieloConfig, publicUrl, type CieloConfig } from "../config";
import type { PaymentKind } from "../core";
import { GatewayError, type Charge, type ChargeInput, type ChargeStatus, type Check, type Gateway, type OrderPayment } from "./types";
import { httpJson, mockBase, type HttpResult } from "./http";

/*
 * Cielo (docs.cielo.com.br, conferido em 2026-10-08):
 * - API E-commerce Cielo (MerchantId + MerchantKey nos cabeçalhos): Pix (Provider "Cielo2", obrigatório para
 *   integrações novas desde 01/09/2025) e boleto (Provider do banco: Bradesco2, BancoDoBrasil3; "Simulado" no sandbox).
 *     POST {api}/1/sales/ · GET {apiquery}/1/sales/{PaymentId} · PUT {api}/1/sales/{PaymentId}/void
 *   Aviso: "Post de Notificação" {PaymentId, ChangeType} com o cabeçalho secreto configurado no portal Cielo; o site
 *   sempre consulta a venda antes de mudar o pedido.
 * - Link de Pagamento Cielo (ClientId + ClientSecret, OAuth): cartão na página segura da Cielo (até 6x).
 *     POST /api/public/v2/token · POST /api/public/v1/products/ · GET /api/public/v1/products/{id}/payments ·
 *     PUT /api/public/v2/orders/{checkout_cielo_order_number}/void
 *   Não tem sandbox: testa-se com o "Modo Teste" da loja na conta de produção. A notificação de mudança de status
 *   não tem autenticação (só o segredo na URL que a Padrão cadastra); o site consulta antes de mudar o pedido.
 * IDs gravados no pedido: Pix/boleto = PaymentId (GUID); cartão = "link-<id do link>".
 * O número do pedido vai sem hífen (a Cielo só aceita letras e números): ML-7F3K2Q → ML7F3K2Q.
 */

const mock = () => mockBase("MULTILOJA_CIELO_MOCK_URL");

export function cieloMockActive(): boolean {
  return mock() !== null;
}

const apiBase = (c: CieloConfig) => (mock() ? `${mock()}/api3` : c.sandbox ? "https://apisandbox.cieloecommerce.cielo.com.br" : "https://api.cieloecommerce.cielo.com.br");
const queryBase = (c: CieloConfig) => (mock() ? `${mock()}/api3` : c.sandbox ? "https://apiquerysandbox.cieloecommerce.cielo.com.br" : "https://apiquery.cieloecommerce.cielo.com.br");
const linkBase = () => (mock() ? `${mock()}/link` : "https://cieloecommerce.cielo.com.br");

/** "ML-7F3K2Q" → "ML7F3K2Q" (MerchantOrderId / OrderNumber só com letras e números). */
export const cieloOrderNumber = (codigo: string) => codigo.replace(/[^A-Za-z0-9]/g, "").slice(0, 20);
/** "ML7F3K2Q" → "ML-7F3K2Q". */
export const codigoFromCielo = (orderNumber: string) => (/^ML[2-9A-HJKMNP-Z]{6}$/.test(orderNumber) ? `ML-${orderNumber.slice(2)}` : orderNumber);

/** Nome só com letras e espaços (o Pix da Cielo recusa acentos e símbolos no nome). */
const plainName = (name: string, max: number) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** Campo de objeto sem diferenciar maiúsculas (os exemplos da Cielo variam: QrCodeBase64Image / QrcodeBase64Image). */
function pick<T = unknown>(obj: unknown, name: string): T | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const lower = name.toLowerCase();
  const key = Object.keys(obj).find((k) => k.toLowerCase() === lower);
  return key ? ((obj as Record<string, unknown>)[key] as T) : undefined;
}

function detail(body: unknown): string {
  if (Array.isArray(body)) return body.map((e) => `${pick(e, "Code") ?? ""} ${pick(e, "Message") ?? ""}`.trim()).join("; ").slice(0, 300);
  if (body && typeof body === "object") return String(pick(body, "message") ?? pick(body, "error_description") ?? pick(body, "ReturnMessage") ?? "").slice(0, 300);
  return typeof body === "string" ? body.slice(0, 200) : "";
}

function fail(what: string, res: HttpResult): never {
  throw new GatewayError(`${what} (HTTP ${res.status})`, res.status, detail(res.body));
}

async function requireConfig(): Promise<CieloConfig> {
  const config = await cieloConfig();
  if (!config) throw new GatewayError("Cielo não configurada", 0, "");
  return config;
}

const apiHeaders = (c: CieloConfig) => ({ MerchantId: c.merchantId, MerchantKey: c.merchantKey, RequestId: randomUUID() });

// ---------------------------------------------------------------------------------- API E-commerce: Pix e boleto

function customer(input: ChargeInput, maxName: number) {
  const doc = input.cliente.documento.replace(/\D/g, "");
  return { Name: plainName(input.cliente.nome, maxName), Identity: doc, IdentityType: doc.length === 14 ? "CNPJ" : "CPF" };
}

async function createPix(config: CieloConfig, input: ChargeInput): Promise<Charge> {
  const res = await httpJson(`${apiBase(config)}/1/sales/`, {
    method: "POST",
    headers: apiHeaders(config),
    body: {
      MerchantOrderId: cieloOrderNumber(input.codigo),
      Customer: customer(input, 60),
      Payment: { Type: "Pix", Provider: "Cielo2", Amount: Math.round(input.total * 100), QrCode: { Expiration: 3600 } },
    },
  });
  const payment = pick(res.body, "Payment");
  const paymentId = pick<string>(payment, "PaymentId");
  const qr = pick<string>(payment, "QrCodeString");
  if (res.status >= 300 || !paymentId || !qr) fail("A Cielo não gerou o Pix", res);
  const image = pick<string>(payment, "QrCodeBase64Image");
  return {
    id: paymentId,
    data: { pixCode: qr, pixImage: image ? (image.startsWith("data:") ? image : `data:image/png;base64,${image}`) : undefined, expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
  };
}

async function createBoleto(config: CieloConfig, input: ChargeInput): Promise<Charge> {
  if (!config.boletoProvider) throw new GatewayError("Informe o banco do boleto (Provider) nas configurações da Cielo", 0, "");
  const bb = config.boletoProvider.startsWith("BancoDoBrasil");
  const e = input.entrega;
  // BB: endereço todo em maiúsculas sem acento, até 60 caracteres somados; Bradesco: limites próprios.
  const text = (value: string, max: number) => {
    const plain = value.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return (bb ? plain.toUpperCase().replace(/[^A-Z0-9 '-]/g, " ") : plain).replace(/\s+/g, " ").trim().slice(0, max);
  };
  const due = new Date(Date.now() + input.boletoDias * 86_400_000).toISOString().slice(0, 10);
  const res = await httpJson(`${apiBase(config)}/1/sales/`, {
    method: "POST",
    headers: apiHeaders(config),
    body: {
      MerchantOrderId: cieloOrderNumber(input.codigo),
      Customer: {
        ...customer(input, bb ? 60 : 34),
        Address: {
          Street: text(e.logradouro, bb ? 30 : 70),
          Number: text(e.numero || "SN", 10),
          Complement: text(e.complemento, bb ? 10 : 50),
          ZipCode: e.cep.replace(/\D/g, ""),
          District: text(e.bairro || "Centro", bb ? 15 : 50),
          City: text(e.cidade, bb ? 18 : 50),
          State: e.estado,
          Country: "BRA",
        },
      },
      Payment: {
        Type: "Boleto",
        Amount: Math.round(input.total * 100),
        Provider: config.boletoProvider,
        ExpirationDate: due,
        Instructions: "Não receber após o vencimento.",
        Demonstrative: `Pedido ${input.codigo}`,
      },
    },
  });
  const payment = pick(res.body, "Payment");
  const paymentId = pick<string>(payment, "PaymentId");
  if (res.status >= 300 || !paymentId) fail("A Cielo não emitiu o boleto", res);
  const line = pick<string>(payment, "DigitableLine") ?? pick<string>(payment, "BarCodeNumber") ?? "";
  return { id: paymentId, data: { boletoLine: line || "Abra o boleto pelo link", boletoUrl: pick<string>(payment, "Url"), boletoExpiresAt: due } };
}

async function saleStatus(config: CieloConfig, paymentId: string): Promise<ChargeStatus> {
  const res = await httpJson(`${queryBase(config)}/1/sales/${encodeURIComponent(paymentId)}`, { headers: apiHeaders(config) });
  if (res.status !== 200) fail("A Cielo não informou a venda", res);
  const payment = pick(res.body, "Payment");
  const status = Number(pick(payment, "Status"));
  if (status === 2) return { status: "pago", e2eId: pick<string>(payment, "EndToEndId") };
  if (status === 3 || status === 10 || status === 11 || status === 13) return { status: "expirado" };
  return { status: "pendente" };
}

// ---------------------------------------------------------------------------------- Link de Pagamento: cartão

const linkTokens = new Map<string, { token: string; until: number }>();

async function linkToken(config: CieloConfig): Promise<string> {
  const cached = linkTokens.get(config.clientId);
  if (cached && cached.until > Date.now()) return cached.token;
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const res = await httpJson(`${linkBase()}/api/public/v2/token`, { method: "POST", headers: { Authorization: `Basic ${basic}` }, body: "grant_type=client_credentials" });
  const token = pick<string>(res.body, "access_token");
  if (res.status !== 200 || !token) fail("A Cielo recusou as credenciais do Link de Pagamento", res);
  const expires = Number(pick(res.body, "expires_in")) || 1199;
  linkTokens.set(config.clientId, { token, until: Date.now() + Math.max(60, expires - 60) * 1000 });
  return token;
}

const hasLink = (c: CieloConfig | null) => Boolean(c?.clientId && c.clientSecret);

async function createCardLink(config: CieloConfig, input: ChargeInput): Promise<Charge> {
  const token = await linkToken(config);
  const expiration = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
  const res = await httpJson(`${linkBase()}/api/public/v1/products/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: {
      OrderNumber: cieloOrderNumber(input.codigo),
      type: "Payment",
      name: input.descricao.slice(0, 128),
      price: Math.round(input.total * 100),
      expirationDate: expiration,
      maxNumberOfInstallments: "6",
      quantity: 1,
      shipping: { type: "WithoutShipping" },
      customLinkConfiguration: { paymentTypes: [{ type: "CreditCard" }] },
    },
  });
  const id = pick<string>(res.body, "id");
  const url = pick<string>(res.body, "shortUrl");
  if (res.status >= 300 || !id || !url) fail("A Cielo não criou o link de pagamento", res);
  return { id: `link-${id}`, data: { checkoutUrl: url } };
}

async function linkStatus(config: CieloConfig, chargeId: string): Promise<ChargeStatus & { orderNumber?: string }> {
  const token = await linkToken(config);
  const res = await httpJson(`${linkBase()}/api/public/v1/products/${encodeURIComponent(chargeId.replace(/^link-/, ""))}/payments`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status !== 200) fail("A Cielo não informou o link de pagamento", res);
  const orders = (pick<unknown[]>(res.body, "orders") ?? []).map((o) => ({ orderNumber: pick<string>(o, "orderNumber"), status: String(pick(pick(o, "payment"), "status") ?? "") }));
  const paid = orders.find((o) => o.status === "Paid" || o.status === "Authorized");
  if (paid) return { status: "pago", orderNumber: paid.orderNumber };
  return { status: "pendente" };
}

// ---------------------------------------------------------------------------------- gateway

export const cieloGateway: Gateway = {
  name: "cielo",
  label: "Cielo",
  // Cartão só com as credenciais do Link de Pagamento.
  async methods(): Promise<readonly PaymentKind[]> {
    return hasLink(await cieloConfig()) ? ["pix", "boleto", "cartao"] : ["pix", "boleto"];
  },
  configured: async () => (await cieloConfig()) !== null,

  async create(method, input) {
    const config = await requireConfig();
    if (method === "pix") return createPix(config, input);
    if (method === "boleto") return createBoleto(config, input);
    if (!hasLink(config)) throw new GatewayError("Cartão na Cielo precisa das credenciais do Link de Pagamento", 0, "");
    return createCardLink(config, input);
  },

  async status(chargeId) {
    const config = await requireConfig();
    return chargeId.startsWith("link-") ? linkStatus(config, chargeId) : saleStatus(config, chargeId);
  },

  async refund(order: OrderPayment) {
    const config = await requireConfig();
    if (!order.pagamentoId) return { ok: false, message: "Cobrança sem identificador." };
    if (order.formaPagamento === "boleto") return { ok: false, message: "Boleto pago não tem estorno pela API da Cielo: devolva por transferência e cancele de novo." };
    if (order.pagamentoId.startsWith("link-")) {
      const { orderNumber } = await linkStatus(config, order.pagamentoId);
      if (!orderNumber) return { ok: false, message: "A Cielo não mostrou a transação do cartão." };
      const token = await linkToken(config);
      const res = await httpJson(`${linkBase()}/api/public/v2/orders/${encodeURIComponent(orderNumber)}/void`, { method: "PUT", headers: { Authorization: `Bearer ${token}` } });
      return res.status < 300 ? { ok: true, message: "Cancelamento do cartão pedido à Cielo." } : { ok: false, message: `A Cielo recusou o cancelamento: ${detail(res.body) || res.status}` };
    }
    // Pix: devolução assíncrona (precisa de saldo na conta Pix Cielo).
    const res = await httpJson(`${apiBase(config)}/1/sales/${encodeURIComponent(order.pagamentoId)}/void`, { method: "PUT", headers: apiHeaders(config) });
    if (res.status >= 300) return { ok: false, message: `A Cielo recusou a devolução do Pix: ${detail(res.body) || res.status}` };
    return { ok: true, message: "Devolução do Pix pedida à Cielo (assíncrona; confira no portal)." };
  },

  async void(order: OrderPayment) {
    const config = await requireConfig();
    if (!order.pagamentoId) return { ok: true, message: "Sem cobrança aberta." };
    if (order.formaPagamento === "pix") {
      const res = await httpJson(`${apiBase(config)}/1/sales/${encodeURIComponent(order.pagamentoId)}/void`, { method: "PUT", headers: apiHeaders(config) });
      return res.status < 300 ? { ok: true, message: "QR Code do Pix removido na Cielo." } : { ok: false, message: `A Cielo não removeu o Pix: ${detail(res.body) || res.status}` };
    }
    return { ok: true, message: order.formaPagamento === "boleto" ? "Boleto vence sozinho (a Cielo não cancela boleto pela API)." : "O link do cartão vence sozinho em 3 dias." };
  },

  async diagnostics() {
    const config = await cieloConfig();
    const checks: Check[] = [
      { label: "MerchantId e MerchantKey (API E-commerce)", ok: Boolean(config), detail: "Site Cielo → E-commerce → Gestão API E-commerce. Pix e boleto saem por aqui." },
      { label: "Banco do boleto (Provider)", ok: Boolean(config?.boletoProvider), detail: "Bradesco2 (status automático) ou BancoDoBrasil3 (baixa manual no portal); sandbox: Simulado." },
      { label: "Credenciais do Link de Pagamento (cartão)", ok: hasLink(config), detail: "Site Cielo → E-commerce → Link de Pagamento → Configurações → Credenciais de API." },
      { label: "URL pública e segredo dos avisos", ok: Boolean(publicUrl() && config?.webhookSecret), detail: "Gerado ao salvar a Cielo; cadastre as URLs abaixo no portal da Cielo." },
    ];
    if (!config) return checks;
    try {
      // Consulta uma venda que não existe: 404 = credenciais aceitas; 401 = credenciais erradas.
      const res = await httpJson(`${queryBase(config)}/1/sales/00000000-0000-0000-0000-000000000000`, { headers: apiHeaders(config) });
      checks.push(
        res.status === 401 || res.status === 403
          ? { label: "Acesso à API E-commerce", ok: false, detail: res.status === 403 ? "IP do servidor fora da lista de IPs confiáveis da Cielo" : "MerchantId/MerchantKey recusados" }
          : { label: "Acesso à API E-commerce", ok: true, detail: `credenciais aceitas (${config.sandbox ? "sandbox" : "produção"})` },
      );
    } catch (error) {
      checks.push({ label: "Acesso à API E-commerce", ok: false, detail: error instanceof Error ? error.message : "erro" });
    }
    if (hasLink(config)) {
      try {
        await linkToken(config);
        checks.push({ label: "Acesso ao Link de Pagamento", ok: true, detail: "token recebido (sem sandbox: use o Modo Teste da loja)" });
      } catch (error) {
        checks.push({ label: "Acesso ao Link de Pagamento", ok: false, detail: error instanceof GatewayError ? `${error.message}: ${error.detail}` : "erro" });
      }
    }
    return checks;
  },
};

/** URLs que a Padrão cadastra no portal da Cielo (com o segredo). */
export async function cieloNotificationUrls(): Promise<{ api: string | null; link: string | null; header: string }> {
  const base = publicUrl();
  const secret = (await cieloConfig())?.webhookSecret;
  return {
    api: base ? `${base}/api/multiloja/pagamento/cielo` : null,
    link: base && secret ? `${base}/api/multiloja/pagamento/cielo/link?hmac=${encodeURIComponent(secret)}` : null,
    header: "X-Multiloja-Segredo",
  };
}
