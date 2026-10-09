import "server-only";

import { readFileSync } from "node:fs";
import { efiConfig, efiWebhookSecret, publicUrl, type EfiConfig } from "../config";
import type { PaymentKind } from "../core";
import { GatewayError, type Charge, type ChargeInput, type ChargeStatus, type Check, type Gateway, type GatewayResult, type OrderPayment } from "./types";
import { httpJson, mockBase, type HttpInit, type HttpResult } from "./http";

/*
 * Efí (efipay.com.br): Pix pela API Pix (cobrança imediata, QR e copia e cola; mTLS com o certificado .p12),
 * boleto e cartão pela API de Cobranças (sem certificado). O cartão vai para a página segura da Efí (link de
 * pagamento): o site não toca no número do cartão.
 *
 * Rotas conferidas com dev.efipay.com.br e com o SDK oficial (github.com/efipay/sdk-node-apis-efi,
 * src/constants/endpoints.ts) em 2026-10-08:
 *   Pix: POST /oauth/token · POST /v2/cob · GET|PATCH /v2/cob/:txid · GET /v2/loc/:id/qrcode ·
 *        PUT|GET /v2/webhook/:chave (x-skip-mtls-checking) · PUT /v2/pix/:e2eId/devolucao/:id
 *   Cobranças: POST /v1/authorize · POST /v1/charge/one-step (boleto) · POST /v1/charge/one-step/link (cartão) ·
 *        GET /v1/charge/:id · PUT /v1/charge/:id/cancel · GET /v1/notification/:token · POST /v1/charge/card/:id/refund
 * IDs gravados no pedido: Pix = txid; boleto = "boleto-<charge_id>"; cartão = "cartao-<charge_id>".
 */

const PIX_EXPIRES_SEC = 60 * 60;
const mockUrl = () => mockBase("MULTILOJA_EFI_MOCK_URL");

export function efiMockActive(): boolean {
  return mockUrl() !== null;
}

/** Mensagem de erro da Efí (Pix: {nome, mensagem}; Cobranças: {error, error_description}) sem dados sensíveis. */
function detail(body: unknown): string {
  if (!body || typeof body !== "object") return typeof body === "string" ? body.slice(0, 200) : "";
  const b = body as Record<string, unknown>;
  const parts = [b.nome, b.mensagem, b.error, b.error_description, b.title, b.detail].filter((v) => typeof v === "string") as string[];
  return parts.join(" — ").slice(0, 300);
}

function fail(what: string, res: HttpResult): never {
  throw new GatewayError(`${what} (HTTP ${res.status})`, res.status, detail(res.body));
}

let certCache: { key: string; pfx: Buffer } | null = null;
function certificate(config: EfiConfig): Buffer {
  const key = config.certBase64 ? `b64:${config.certBase64.length}:${config.certBase64.slice(-16)}` : `file:${config.certPath}`;
  if (certCache?.key !== key) {
    // turbopackIgnore: o caminho do certificado só existe em execução.
    const pfx = config.certBase64 ? Buffer.from(config.certBase64, "base64") : readFileSync(/* turbopackIgnore: true */ config.certPath);
    certCache = { key, pfx };
  }
  return certCache.pfx;
}

const pixBase = (c: EfiConfig) => (mockUrl() ? `${mockUrl()}/pix` : c.sandbox ? "https://pix-h.api.efipay.com.br" : "https://pix.api.efipay.com.br");
const chargesBase = (c: EfiConfig) => (mockUrl() ? `${mockUrl()}/cobrancas` : c.sandbox ? "https://cobrancas-h.api.efipay.com.br" : "https://cobrancas.api.efipay.com.br");

const tokens = new Map<string, { token: string; until: number }>();

async function token(config: EfiConfig, api: "pix" | "cobrancas"): Promise<string> {
  const cacheKey = `${api}:${config.sandbox ? "h" : "p"}:${config.clientId}`;
  const cached = tokens.get(cacheKey);
  if (cached && cached.until > Date.now()) return cached.token;
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const res =
    api === "pix"
      ? await httpJson(`${pixBase(config)}/oauth/token`, { method: "POST", headers: { Authorization: `Basic ${basic}` }, body: { grant_type: "client_credentials" }, pfx: certificate(config), passphrase: config.certPassword })
      : await httpJson(`${chargesBase(config)}/v1/authorize`, { method: "POST", headers: { Authorization: `Basic ${basic}` }, body: { grant_type: "client_credentials" } });
  const body = res.body as { access_token?: string; expires_in?: number } | null;
  if (res.status !== 200 || !body?.access_token) fail(`A Efí recusou a autenticação da API ${api === "pix" ? "Pix" : "de Cobranças"}`, res);
  // Pix: 3600 s; Cobranças: 600 s. Renova um minuto antes.
  tokens.set(cacheKey, { token: body.access_token, until: Date.now() + Math.max(60, (body.expires_in ?? 600) - 60) * 1000 });
  return body.access_token;
}

async function pixCall(config: EfiConfig, path: string, init: HttpInit = {}): Promise<HttpResult> {
  const bearer = await token(config, "pix");
  return httpJson(`${pixBase(config)}${path}`, { ...init, headers: { Authorization: `Bearer ${bearer}`, ...init.headers }, pfx: certificate(config), passphrase: config.certPassword });
}

async function chargesCall(config: EfiConfig, path: string, init: HttpInit = {}): Promise<HttpResult> {
  const bearer = await token(config, "cobrancas");
  return httpJson(`${chargesBase(config)}${path}`, { ...init, headers: { Authorization: `Bearer ${bearer}`, ...init.headers } });
}

async function requireConfig(): Promise<EfiConfig> {
  const config = await efiConfig();
  if (!config) throw new GatewayError("Efí não configurada", 0, "");
  return config;
}

/** URL das notificações da API de Cobranças (boleto e cartão), com o segredo. */
async function chargesNotificationUrl(): Promise<string | null> {
  const base = publicUrl();
  const secret = await efiWebhookSecret();
  return base && secret ? `${base}/api/multiloja/pagamento/efi/cartao?hmac=${encodeURIComponent(secret)}` : null;
}

/** URL do webhook Pix: segredo na query (a Efí devolve igual) e ?ignorar= para ela não acrescentar /pix. */
export async function pixWebhookUrl(): Promise<string | null> {
  const base = publicUrl();
  const secret = await efiWebhookSecret();
  return base && secret ? `${base}/api/multiloja/pagamento/efi/pix?hmac=${encodeURIComponent(secret)}&ignorar=` : null;
}

// ---------------------------------------------------------------------------------- cobranças

async function createPix(config: EfiConfig, input: ChargeInput): Promise<Charge> {
  const doc = input.cliente.documento.replace(/\D/g, "");
  const nome = input.cliente.nome.slice(0, 200);
  const cob = await pixCall(config, "/v2/cob", {
    method: "POST",
    body: {
      calendario: { expiracao: PIX_EXPIRES_SEC },
      devedor: doc.length === 14 ? { cnpj: doc, nome } : { cpf: doc, nome },
      valor: { original: input.total.toFixed(2) },
      chave: config.pixKey,
      solicitacaoPagador: input.descricao.slice(0, 140),
      infoAdicionais: [{ nome: "Pedido", valor: input.codigo }],
    },
  });
  const body = cob.body as { txid?: string; loc?: { id?: number }; pixCopiaECola?: string } | null;
  if (cob.status >= 300 || !body?.txid) fail("A Efí não criou a cobrança Pix", cob);
  let pixImage: string | undefined;
  if (body.loc?.id) {
    const qr = await pixCall(config, `/v2/loc/${body.loc.id}/qrcode`);
    const image = (qr.body as { imagemQrcode?: string } | null)?.imagemQrcode;
    if (qr.status === 200 && typeof image === "string" && image.startsWith("data:image/")) pixImage = image;
  }
  return { id: body.txid, data: { pixCode: body.pixCopiaECola, pixImage, expiresAt: new Date(Date.now() + PIX_EXPIRES_SEC * 1000).toISOString() } };
}

async function createBoleto(config: EfiConfig, input: ChargeInput): Promise<Charge> {
  const doc = input.cliente.documento.replace(/\D/g, "");
  const notification = await chargesNotificationUrl();
  const expire = new Date(Date.now() + input.boletoDias * 86_400_000).toISOString().slice(0, 10);
  const e = input.entrega;
  const res = await chargesCall(config, "/v1/charge/one-step", {
    method: "POST",
    body: {
      items: [{ name: input.descricao.slice(0, 255), value: Math.round(input.total * 100), amount: 1 }],
      metadata: { custom_id: input.codigo, ...(notification ? { notification_url: notification } : {}) },
      payment: {
        banking_billet: {
          customer: {
            name: input.cliente.nome.slice(0, 255),
            ...(doc.length === 14 ? { juridical_person: { corporate_name: input.cliente.nome.slice(0, 255), cnpj: doc } } : { cpf: doc }),
            email: input.cliente.email,
            phone_number: input.cliente.telefone.replace(/\D/g, ""),
            address: { street: e.logradouro, number: e.numero || "S/N", neighborhood: e.bairro || "Centro", zipcode: e.cep, city: e.cidade, state: e.estado, ...(e.complemento ? { complement: e.complemento } : {}) },
          },
          expire_at: expire,
          message: `Pedido ${input.codigo}`.slice(0, 80),
        },
      },
    },
  });
  const data = (res.body as { data?: { charge_id?: number; barcode?: string; link?: string; billet_link?: string; pdf?: { charge?: string }; expire_at?: string; pix?: { qrcode?: string; qrcode_image?: string } } } | null)?.data;
  if (res.status >= 300 || !data?.charge_id || !data.barcode) fail("A Efí não emitiu o boleto", res);
  return {
    id: `boleto-${data.charge_id}`,
    data: {
      boletoLine: data.barcode,
      boletoUrl: data.pdf?.charge ?? data.billet_link ?? data.link,
      boletoExpiresAt: data.expire_at ?? expire,
      // "Bolix": o boleto da Efí também traz um Pix que quita o mesmo boleto.
      pixCode: data.pix?.qrcode,
      pixImage: data.pix?.qrcode_image?.startsWith("data:image/") ? data.pix.qrcode_image : undefined,
    },
  };
}

async function createCard(config: EfiConfig, input: ChargeInput): Promise<Charge> {
  const notification = await chargesNotificationUrl();
  const expire = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const res = await chargesCall(config, "/v1/charge/one-step/link", {
    method: "POST",
    body: {
      items: [{ name: input.descricao.slice(0, 255), value: Math.round(input.total * 100), amount: 1 }],
      customer: { email: input.cliente.email },
      metadata: { custom_id: input.codigo, ...(notification ? { notification_url: notification } : {}) },
      settings: { payment_method: "credit_card", expire_at: expire, request_delivery_address: false },
    },
  });
  const data = (res.body as { data?: { charge_id?: number; payment_url?: string } } | null)?.data;
  if (res.status >= 300 || !data?.charge_id || !data.payment_url) fail("A Efí não criou o link de pagamento do cartão", res);
  return { id: `cartao-${data.charge_id}`, data: { checkoutUrl: data.payment_url } };
}

const chargeNumber = (chargeId: string) => chargeId.replace(/^(cartao|boleto)-/, "");
const isChargesApi = (chargeId: string) => /^(cartao|boleto)-\d+$/.test(chargeId);

async function pixStatus(config: EfiConfig, txid: string): Promise<ChargeStatus> {
  const res = await pixCall(config, `/v2/cob/${encodeURIComponent(txid)}`);
  if (res.status !== 200) fail("A Efí não informou a cobrança Pix", res);
  const body = res.body as { status?: string; pix?: { endToEndId?: string }[] } | null;
  if (body?.status === "CONCLUIDA") return { status: "pago", e2eId: body.pix?.[0]?.endToEndId };
  if (body?.status === "REMOVIDA_PELO_USUARIO_RECEBEDOR" || body?.status === "REMOVIDA_PELO_PSP") return { status: "expirado" };
  return { status: "pendente" };
}

async function chargeApiStatus(config: EfiConfig, chargeId: string): Promise<ChargeStatus> {
  const res = await chargesCall(config, `/v1/charge/${encodeURIComponent(chargeNumber(chargeId))}`);
  if (res.status !== 200) fail("A Efí não informou a cobrança", res);
  const status = (res.body as { data?: { status?: string } } | null)?.data?.status;
  if (status === "paid" || status === "settled" || status === "approved") return { status: "pago" };
  if (status === "canceled" || status === "expired" || status === "unpaid") return { status: "expirado" };
  return { status: "pendente" };
}

/** Notificação da API de Cobranças (token do POST da Efí) → pedido (custom_id) e cobrança de cada evento. */
export async function efiChargeNotification(notificationToken: string): Promise<{ codigo: string; chargeNumber: string }[]> {
  const config = await requireConfig();
  const res = await chargesCall(config, `/v1/notification/${encodeURIComponent(notificationToken)}`);
  if (res.status !== 200) fail("A Efí não informou a notificação", res);
  const events = (res.body as { data?: { custom_id?: string; identifiers?: { charge_id?: number } }[] } | null)?.data ?? [];
  return events.flatMap((e) => (e.custom_id && e.identifiers?.charge_id ? [{ codigo: e.custom_id, chargeNumber: String(e.identifiers.charge_id) }] : []));
}

// ---------------------------------------------------------------------------------- webhook do Pix e testes

export async function registerPixWebhook(): Promise<GatewayResult> {
  const config = await efiConfig();
  const url = await pixWebhookUrl();
  if (!config || !url) return { ok: false, message: "Configure a Efí, a URL pública (MULTILOJA_URL_PUBLICA) e o segredo do webhook." };
  if (!url.startsWith("https://") && !mockUrl()) return { ok: false, message: "A Efí só aceita webhook em https." };
  try {
    const res = await pixCall(config, `/v2/webhook/${encodeURIComponent(config.pixKey)}`, { method: "PUT", body: { webhookUrl: url }, headers: { "x-skip-mtls-checking": "true" } });
    if (res.status >= 300) return { ok: false, message: `A Efí recusou o webhook: ${detail(res.body) || res.status}` };
    return { ok: true, message: "Webhook do Pix cadastrado. A Efí manda um aviso de teste para confirmar." };
  } catch (error) {
    return { ok: false, message: error instanceof GatewayError ? `${error.message}: ${error.detail}` : "Não foi possível falar com a Efí." };
  }
}

/** Pix de teste (só em homologação): de R$ 0,01 a R$ 10,00 a Efí confirma sozinha e chama o webhook. */
export async function sandboxTestPix(): Promise<{ ok: true; txid: string; pixCode?: string; pixImage?: string } | { ok: false; message: string }> {
  const config = await efiConfig();
  if (!config) return { ok: false, message: "Efí não configurada." };
  if (!config.sandbox) return { ok: false, message: "O Pix de teste só roda em homologação." };
  try {
    const charge = await createPix(config, {
      codigo: "TESTE",
      total: 1,
      cliente: { nome: "Teste Homologacao", documento: "52998224725", email: "teste@exemplo.com", telefone: "21999999999" },
      entrega: { cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "" },
      descricao: "Teste da integração multiloja",
      returnUrl: "",
      boletoDias: 3,
    });
    return { ok: true, txid: charge.id, pixCode: charge.data.pixCode, pixImage: charge.data.pixImage };
  } catch (error) {
    return { ok: false, message: error instanceof GatewayError ? `${error.message}: ${error.detail}` : error instanceof Error ? error.message : "erro" };
  }
}

// ---------------------------------------------------------------------------------- gateway

export const efiGateway: Gateway = {
  name: "efi",
  label: "Efí",
  methods: async () => ["pix", "boleto", "cartao"],
  configured: async () => (await efiConfig()) !== null,

  async create(method: PaymentKind, input: ChargeInput) {
    const config = await requireConfig();
    if (method === "pix") return createPix(config, input);
    if (method === "boleto") return createBoleto(config, input);
    return createCard(config, input);
  },

  async status(chargeId: string) {
    const config = await requireConfig();
    return isChargesApi(chargeId) ? chargeApiStatus(config, chargeId) : pixStatus(config, chargeId);
  },

  async refund(order: OrderPayment) {
    const config = await requireConfig();
    if (!order.pagamentoId) return { ok: false, message: "Cobrança sem identificador." };
    if (order.pagamentoId.startsWith("boleto-")) {
      // Boleto não tem estorno pela API: a devolução é por transferência.
      return { ok: false, message: "Boleto pago não tem estorno automático: devolva por Pix/transferência pelo painel da Efí e cancele de novo marcando a nota." };
    }
    if (order.pagamentoId.startsWith("cartao-")) {
      const res = await chargesCall(config, `/v1/charge/card/${encodeURIComponent(chargeNumber(order.pagamentoId))}/refund`, { method: "POST", body: {} });
      if (res.status >= 300) return { ok: false, message: `A Efí recusou o reembolso do cartão: ${detail(res.body) || res.status}` };
      return { ok: true, message: "Reembolso do cartão em processamento na Efí." };
    }
    const e2eId = order.pagamento.e2eId ?? (await pixStatus(config, order.pagamentoId)).e2eId;
    if (!e2eId) return { ok: false, message: "A Efí não mostrou o Pix recebido desta cobrança." };
    const id = `dev${order.codigo.replace(/[^A-Za-z0-9]/g, "")}`.slice(0, 35);
    const res = await pixCall(config, `/v2/pix/${encodeURIComponent(e2eId)}/devolucao/${id}`, { method: "PUT", body: { valor: order.total.toFixed(2) } });
    const status = (res.body as { status?: string } | null)?.status;
    if (res.status >= 300 || status === "NAO_REALIZADO") return { ok: false, message: `A Efí não fez a devolução do Pix: ${detail(res.body) || res.status}` };
    return { ok: true, message: status === "DEVOLVIDO" ? "Pix devolvido ao cliente." : "Devolução do Pix em processamento na Efí." };
  },

  async void(order: OrderPayment) {
    const config = await requireConfig();
    if (!order.pagamentoId) return { ok: true, message: "Sem cobrança aberta." };
    if (isChargesApi(order.pagamentoId)) {
      const res = await chargesCall(config, `/v1/charge/${encodeURIComponent(chargeNumber(order.pagamentoId))}/cancel`, { method: "PUT" });
      return res.status < 300 ? { ok: true, message: "Cobrança cancelada na Efí." } : { ok: false, message: `A Efí não cancelou a cobrança: ${detail(res.body) || res.status}` };
    }
    const res = await pixCall(config, `/v2/cob/${encodeURIComponent(order.pagamentoId)}`, { method: "PATCH", body: { status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" } });
    return res.status < 300 ? { ok: true, message: "Pix cancelado na Efí." } : { ok: false, message: `A Efí não cancelou o Pix: ${detail(res.body) || res.status}` };
  },

  async diagnostics() {
    const config = await efiConfig();
    const webhookSecret = await efiWebhookSecret();
    const webhookUrl = await pixWebhookUrl();
    const checks: Check[] = [
      { label: "Credenciais (Client ID e Secret)", ok: Boolean(config?.clientId && config.clientSecret), detail: "Da aplicação no painel da Efí, com as APIs Pix e Emissão de Cobranças." },
      { label: "Certificado .p12", ok: Boolean(config?.certPath || config?.certBase64), detail: "Do mesmo ambiente (homologação ou produção) das credenciais." },
      { label: "Chave Pix da conta", ok: Boolean(config?.pixKey), detail: "Chave cadastrada na conta Efí que recebe." },
      { label: "URL pública e segredo dos avisos", ok: Boolean(publicUrl() && webhookSecret), detail: "MULTILOJA_URL_PUBLICA e o segredo (gerado ao salvar a Efí)." },
    ];
    if (!config) return checks;
    const attempt = async (label: string, fn: () => Promise<string>) => {
      try {
        checks.push({ label, ok: true, detail: await fn() });
      } catch (error) {
        checks.push({ label, ok: false, detail: error instanceof GatewayError ? `${error.message}${error.detail ? `: ${error.detail}` : ""}` : error instanceof Error ? error.message : "erro" });
      }
    };
    await attempt("Certificado legível", async () => `${certificate(config).length} bytes`);
    await attempt("Autenticação na API Pix", async () => (await token(config, "pix"), "token recebido"));
    await attempt("Autenticação na API de Cobranças (boleto e cartão)", async () => (await token(config, "cobrancas"), "token recebido"));
    await attempt("Webhook do Pix cadastrado", async () => {
      const res = await pixCall(config, `/v2/webhook/${encodeURIComponent(config.pixKey)}`);
      if (res.status === 404) throw new Error("nenhum webhook cadastrado para a chave: use o botão abaixo");
      if (res.status !== 200) fail("A Efí não informou o webhook", res);
      const registered = (res.body as { webhookUrl?: string } | null)?.webhookUrl ?? null;
      if (webhookUrl && registered !== webhookUrl) throw new Error("cadastrado com outra URL: cadastre de novo");
      return "ok";
    });
    return checks;
  },
};
