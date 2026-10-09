import "server-only";

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { efiConfig, efiWebhookSecret, paymentProvider, publicUrl, type EfiConfig, type ProviderName } from "./config";
import type { PaymentData } from "./repo-vendas";

/*
 * Cobrança dos pedidos da multiloja.
 *
 * - "simulado" (desenvolvimento): gera um Pix de mentira e a página do pedido mostra "Simular pagamento".
 *   Nenhum dinheiro passa por aqui.
 * - "efi": Pix pela API Pix da Efí (cobrança imediata, QR Code e copia e cola; exige o certificado .p12) e cartão
 *   pelo link de pagamento da API de Cobranças (página segura da Efí; o site não toca no número do cartão).
 *   A confirmação vem por webhook e é sempre conferida de novo na própria Efí.
 *
 * Rotas e formatos conferidos com a documentação (dev.efipay.com.br) e com o SDK oficial
 * (github.com/efipay/sdk-node-apis-efi, src/constants/endpoints.ts) em 2026-10-08:
 *   Pix (mTLS): POST /oauth/token · POST /v2/cob · GET /v2/cob/:txid · GET /v2/loc/:id/qrcode ·
 *               PUT|GET /v2/webhook/:chave (x-skip-mtls-checking) · PUT /v2/pix/:e2eId/devolucao/:id
 *   Cobranças (sem certificado): POST /v1/authorize · POST /v1/charge/one-step/link · GET /v1/charge/:id ·
 *               GET /v1/notification/:token · POST /v1/charge/card/:id/refund
 */

export type ChargeInput = {
  codigo: string;
  total: number;
  cliente: { nome: string; documento: string; email: string };
  descricao: string;
  /** Endereço da página do pedido (volta do cartão). */
  returnUrl: string;
};

export type Charge = { id: string; data: PaymentData };
export type ChargeStatus = { status: "pago" | "pendente" | "expirado"; e2eId?: string };

const PIX_EXPIRES_SEC = 60 * 60;

export class EfiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: string,
  ) {
    super(message);
    this.name = "EfiError";
  }
}

// ---------------------------------------------------------------------------------- simulado

function simulatedPix(input: ChargeInput): Charge {
  return {
    id: `sim-${randomBytes(8).toString("hex")}`,
    data: {
      pixCode: `00020126SIMULADO-${input.codigo}-${input.total.toFixed(2)}-NAO-PAGUE-ESTE-CODIGO`,
      expiresAt: new Date(Date.now() + PIX_EXPIRES_SEC * 1000).toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------------- Efí: transporte

type HttpResult = { status: number; body: unknown };

function httpJson(
  url: string,
  { method = "GET", headers = {}, body, pfx }: { method?: string; headers?: Record<string, string>; body?: unknown; pfx?: Buffer },
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    // http: só o simulador local (scripts/efi-mock.mjs); a Efí de verdade é sempre https.
    const send = url.startsWith("http://") ? httpRequest : httpsRequest;
    const req = send(
      url,
      {
        method,
        // Certificado .p12 da Efí: sem senha (o SDK oficial usa passphrase vazia).
        ...(pfx ? { pfx, passphrase: efiConfig()?.certPassword ?? "" } : {}),
        timeout: 20_000,
        headers: { Accept: "application/json", ...(payload ? { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(payload)) } : {}), ...headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed: unknown = text;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch {
            // resposta não JSON: fica o texto
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("a Efí não respondeu a tempo")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Mensagem de erro da Efí (Pix: {nome, mensagem}; Cobranças: {error, error_description}) sem dados sensíveis. */
function efiDetail(body: unknown): string {
  if (!body || typeof body !== "object") return typeof body === "string" ? body.slice(0, 200) : "";
  const b = body as Record<string, unknown>;
  const parts = [b.nome, b.mensagem, b.error, b.error_description, b.title, b.detail].filter((v) => typeof v === "string") as string[];
  return parts.join(" — ").slice(0, 300);
}

function fail(what: string, res: HttpResult): never {
  throw new EfiError(`${what} (HTTP ${res.status})`, res.status, efiDetail(res.body));
}

let certCache: { key: string; pfx: Buffer } | null = null;
function certificate(config: EfiConfig): Buffer {
  const key = config.certBase64 ? `b64:${config.certBase64.length}` : `file:${config.certPath}`;
  if (certCache?.key !== key) {
    // turbopackIgnore: o caminho do certificado só existe em execução.
    const pfx = config.certBase64 ? Buffer.from(config.certBase64, "base64") : readFileSync(/* turbopackIgnore: true */ config.certPath);
    certCache = { key, pfx };
  }
  return certCache.pfx;
}

/** Simulador local da Efí (scripts/efi-mock.mjs) para testar o fluxo inteiro sem credenciais. Nunca em produção. */
function mockUrl(): string | null {
  const url = process.env.MULTILOJA_EFI_MOCK_URL?.trim();
  return url && process.env.NODE_ENV !== "production" ? url.replace(/\/$/, "") : null;
}

/** Ligado ao simulador local em vez da Efí (aviso no admin). */
export function efiMockActive(): boolean {
  return mockUrl() !== null;
}

const pixBase = (c: EfiConfig) => (mockUrl() ? `${mockUrl()}/pix` : c.sandbox ? "https://pix-h.api.efipay.com.br" : "https://pix.api.efipay.com.br");
const chargesBase = (c: EfiConfig) => (mockUrl() ? `${mockUrl()}/cobrancas` : c.sandbox ? "https://cobrancas-h.api.efipay.com.br" : "https://cobrancas.api.efipay.com.br");

const tokens = new Map<string, { token: string; until: number }>();

async function efiToken(config: EfiConfig, api: "pix" | "cobrancas"): Promise<string> {
  const cacheKey = `${api}:${config.sandbox ? "h" : "p"}:${config.clientId}`;
  const cached = tokens.get(cacheKey);
  if (cached && cached.until > Date.now()) return cached.token;
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const res =
    api === "pix"
      ? await httpJson(`${pixBase(config)}/oauth/token`, { method: "POST", headers: { Authorization: `Basic ${basic}` }, body: { grant_type: "client_credentials" }, pfx: certificate(config) })
      : await httpJson(`${chargesBase(config)}/v1/authorize`, { method: "POST", headers: { Authorization: `Basic ${basic}` }, body: { grant_type: "client_credentials" } });
  const body = res.body as { access_token?: string; expires_in?: number } | null;
  if (res.status !== 200 || !body?.access_token) fail(`A Efí recusou a autenticação da API ${api === "pix" ? "Pix" : "de Cobranças"}`, res);
  // Pix: 3600 s; Cobranças: 600 s. Renova um minuto antes.
  tokens.set(cacheKey, { token: body.access_token, until: Date.now() + Math.max(60, (body.expires_in ?? 600) - 60) * 1000 });
  return body.access_token;
}

async function pixCall(config: EfiConfig, path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<HttpResult> {
  const token = await efiToken(config, "pix");
  return httpJson(`${pixBase(config)}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers }, pfx: certificate(config) });
}

async function chargesCall(config: EfiConfig, path: string, init: { method?: string; body?: unknown } = {}): Promise<HttpResult> {
  const token = await efiToken(config, "cobrancas");
  return httpJson(`${chargesBase(config)}${path}`, { ...init, headers: { Authorization: `Bearer ${token}` } });
}

// ---------------------------------------------------------------------------------- Efí: Pix

async function efiPix(config: EfiConfig, input: ChargeInput): Promise<Charge> {
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

async function efiPixStatus(config: EfiConfig, txid: string): Promise<ChargeStatus> {
  const res = await pixCall(config, `/v2/cob/${encodeURIComponent(txid)}`);
  if (res.status !== 200) fail("A Efí não informou a cobrança Pix", res);
  const body = res.body as { status?: string; pix?: { endToEndId?: string }[] } | null;
  if (body?.status === "CONCLUIDA") return { status: "pago", e2eId: body.pix?.[0]?.endToEndId };
  if (body?.status === "REMOVIDA_PELO_USUARIO_RECEBEDOR" || body?.status === "REMOVIDA_PELO_PSP") return { status: "expirado" };
  return { status: "pendente" };
}

/** URL do webhook Pix: segredo na query (a Efí devolve igual) e ?ignorar= para ela não acrescentar /pix. */
function pixWebhookUrl(): string | null {
  const base = publicUrl();
  const secret = efiWebhookSecret();
  return base && secret ? `${base}/api/multiloja/pagamento/efi/pix?hmac=${encodeURIComponent(secret)}&ignorar=` : null;
}

// ---------------------------------------------------------------------------------- Efí: cartão (link de pagamento)

async function efiCard(config: EfiConfig, input: ChargeInput): Promise<Charge> {
  const base = publicUrl();
  const secret = efiWebhookSecret();
  const expire = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const res = await chargesCall(config, "/v1/charge/one-step/link", {
    method: "POST",
    body: {
      items: [{ name: input.descricao.slice(0, 255), value: Math.round(input.total * 100), amount: 1 }],
      customer: { email: input.cliente.email },
      metadata: {
        custom_id: input.codigo,
        ...(base && secret ? { notification_url: `${base}/api/multiloja/pagamento/efi/cartao?hmac=${encodeURIComponent(secret)}` } : {}),
      },
      settings: { payment_method: "credit_card", expire_at: expire, request_delivery_address: false },
    },
  });
  const data = (res.body as { data?: { charge_id?: number; payment_url?: string } } | null)?.data;
  if (res.status >= 300 || !data?.charge_id || !data.payment_url) fail("A Efí não criou o link de pagamento do cartão", res);
  return { id: `cartao-${data.charge_id}`, data: { checkoutUrl: data.payment_url } };
}

const cardId = (chargeId: string) => chargeId.replace(/^cartao-/, "");

async function efiCardStatus(config: EfiConfig, chargeId: string): Promise<ChargeStatus> {
  const res = await chargesCall(config, `/v1/charge/${encodeURIComponent(cardId(chargeId))}`);
  if (res.status !== 200) fail("A Efí não informou a cobrança do cartão", res);
  const status = (res.body as { data?: { status?: string } } | null)?.data?.status;
  if (status === "paid" || status === "settled" || status === "approved") return { status: "pago" };
  if (status === "canceled" || status === "expired" || status === "unpaid") return { status: "expirado" };
  return { status: "pendente" };
}

/** Notificação do cartão (token do POST da Efí) → pedido (custom_id) e cobrança de cada evento. */
export async function efiCardNotification(notificationToken: string): Promise<{ codigo: string; chargeId: string }[]> {
  const config = efiConfig();
  if (!config) return [];
  const res = await chargesCall(config, `/v1/notification/${encodeURIComponent(notificationToken)}`);
  if (res.status !== 200) fail("A Efí não informou a notificação", res);
  const events = (res.body as { data?: { custom_id?: string; identifiers?: { charge_id?: number } }[] } | null)?.data ?? [];
  return events.flatMap((e) => (e.custom_id && e.identifiers?.charge_id ? [{ codigo: e.custom_id, chargeId: `cartao-${e.identifiers.charge_id}` }] : []));
}

// ---------------------------------------------------------------------------------- interface

export function activeProvider(): ProviderName | null {
  const provider = paymentProvider();
  if (provider === "efi" && !efiConfig()) return null;
  return provider;
}

export async function createCharge(method: "pix" | "cartao", input: ChargeInput): Promise<{ provider: ProviderName; charge: Charge }> {
  const provider = activeProvider();
  if (!provider) throw new Error("Pagamento online desligado.");
  if (provider === "simulado") {
    return { provider, charge: method === "pix" ? simulatedPix(input) : { id: `sim-${randomBytes(8).toString("hex")}`, data: { checkoutUrl: input.returnUrl } } };
  }
  const config = efiConfig() as EfiConfig;
  return { provider, charge: method === "pix" ? await efiPix(config, input) : await efiCard(config, input) };
}

/** Situação da cobrança direto no provedor (o webhook só avisa; quem confirma é esta consulta). */
export async function chargeStatus(provider: string, chargeId: string): Promise<ChargeStatus> {
  if (provider !== "efi") return { status: "pendente" };
  const config = efiConfig();
  if (!config) return { status: "pendente" };
  return chargeId.startsWith("cartao-") ? efiCardStatus(config, chargeId) : efiPixStatus(config, chargeId);
}

export type RefundResult = { ok: true; message: string } | { ok: false; message: string };

/**
 * Devolve o pagamento de um pedido cancelado: Pix por devolução (PUT /v2/pix/:e2eId/devolucao/:id, total) e
 * cartão por reembolso total (POST /v1/charge/card/:id/refund). Simulado: nada a devolver.
 */
export async function refundCharge(pedido: { codigo: string; total: number; pagamentoProvedor: string; pagamentoId: string | null; pagamento: PaymentData }): Promise<RefundResult> {
  if (pedido.pagamentoProvedor !== "efi") return { ok: true, message: "Pagamento de teste: nada a devolver." };
  const config = efiConfig();
  if (!config || !pedido.pagamentoId) return { ok: false, message: "Efí não configurada ou cobrança sem identificador." };
  if (pedido.pagamentoId.startsWith("cartao-")) {
    const res = await chargesCall(config, `/v1/charge/card/${encodeURIComponent(cardId(pedido.pagamentoId))}/refund`, { method: "POST", body: {} });
    if (res.status >= 300) return { ok: false, message: `A Efí recusou o reembolso do cartão: ${efiDetail(res.body) || res.status}` };
    return { ok: true, message: "Reembolso do cartão em processamento na Efí." };
  }
  // e2eId: guardado na confirmação; se faltar, consulta a cobrança.
  const e2eId = pedido.pagamento.e2eId ?? (await efiPixStatus(config, pedido.pagamentoId)).e2eId;
  if (!e2eId) return { ok: false, message: "A Efí não mostrou o Pix recebido desta cobrança." };
  const id = `dev${pedido.codigo.replace(/[^A-Za-z0-9]/g, "")}`.slice(0, 35);
  const res = await pixCall(config, `/v2/pix/${encodeURIComponent(e2eId)}/devolucao/${id}`, { method: "PUT", body: { valor: pedido.total.toFixed(2) } });
  const status = (res.body as { status?: string } | null)?.status;
  if (res.status >= 300 || status === "NAO_REALIZADO") return { ok: false, message: `A Efí não fez a devolução do Pix: ${efiDetail(res.body) || res.status}` };
  return { ok: true, message: status === "DEVOLVIDO" ? "Pix devolvido ao cliente." : "Devolução do Pix em processamento na Efí." };
}

// ---------------------------------------------------------------------------------- diagnóstico (admin)

export type Check = { label: string; ok: boolean; detail: string };

/** Confere a configuração e a conexão com as duas APIs da Efí, e o webhook do Pix. */
export async function efiDiagnostics(): Promise<{ sandbox: boolean | null; checks: Check[]; webhookUrl: string | null; registeredWebhook: string | null }> {
  const config = efiConfig();
  const checks: Check[] = [];
  const env = (name: string) => Boolean(process.env[name]?.trim());
  checks.push({ label: "MULTILOJA_PAGAMENTO=efi", ok: process.env.MULTILOJA_PAGAMENTO?.trim().toLowerCase() === "efi", detail: "Liga a Efí nas lojas (sem isso fica simulado ou desligado)." });
  checks.push({ label: "Client ID e Client Secret", ok: env("MULTILOJA_EFI_CLIENT_ID") && env("MULTILOJA_EFI_CLIENT_SECRET"), detail: "Da aplicação criada no painel da Efí (API Pix + API de Emissão de Cobranças)." });
  checks.push({ label: "Certificado .p12", ok: env("MULTILOJA_EFI_CERTIFICADO") || env("MULTILOJA_EFI_CERTIFICADO_BASE64"), detail: "Do mesmo ambiente (homologação ou produção) das credenciais." });
  checks.push({ label: "Chave Pix da conta", ok: env("MULTILOJA_EFI_CHAVE_PIX"), detail: "Chave cadastrada na conta Efí que recebe." });
  checks.push({ label: "URL pública e segredo do webhook", ok: Boolean(publicUrl() && efiWebhookSecret()), detail: "MULTILOJA_URL_PUBLICA (https) e MULTILOJA_EFI_WEBHOOK_SEGREDO." });
  if (!config) return { sandbox: null, checks, webhookUrl: pixWebhookUrl(), registeredWebhook: null };

  const attempt = async (label: string, fn: () => Promise<string>) => {
    try {
      checks.push({ label, ok: true, detail: await fn() });
    } catch (error) {
      checks.push({ label, ok: false, detail: error instanceof EfiError ? `${error.message}${error.detail ? `: ${error.detail}` : ""}` : error instanceof Error ? error.message : "erro" });
    }
  };
  await attempt("Certificado legível", async () => `${certificate(config).length} bytes`);
  await attempt("Autenticação na API Pix", async () => (await efiToken(config, "pix"), "token recebido"));
  await attempt("Autenticação na API de Cobranças (cartão)", async () => (await efiToken(config, "cobrancas"), "token recebido"));

  let registeredWebhook: string | null = null;
  await attempt("Webhook do Pix cadastrado", async () => {
    const res = await pixCall(config, `/v2/webhook/${encodeURIComponent(config.pixKey)}`);
    if (res.status === 404) throw new Error("nenhum webhook cadastrado para a chave");
    if (res.status !== 200) fail("A Efí não informou o webhook", res);
    registeredWebhook = (res.body as { webhookUrl?: string } | null)?.webhookUrl ?? null;
    const expected = pixWebhookUrl();
    if (expected && registeredWebhook !== expected) throw new Error("cadastrado com outra URL: cadastre de novo");
    return "ok";
  });
  // O segredo não aparece no admin.
  const hide = (url: string | null) => (url ? url.replace(/hmac=[^&]+/, "hmac=•••") : null);
  return { sandbox: config.sandbox, checks, webhookUrl: hide(pixWebhookUrl()), registeredWebhook: hide(registeredWebhook) };
}

/** Cadastra (ou troca) o webhook do Pix da chave, sem exigir mTLS do nosso servidor (validação por segredo + IP). */
export async function registerPixWebhook(): Promise<RefundResult> {
  const config = efiConfig();
  const url = pixWebhookUrl();
  if (!config || !url) return { ok: false, message: "Configure a Efí, MULTILOJA_URL_PUBLICA e MULTILOJA_EFI_WEBHOOK_SEGREDO." };
  if (!url.startsWith("https://") && !mockUrl()) return { ok: false, message: "A Efí só aceita webhook em https." };
  try {
    const res = await pixCall(config, `/v2/webhook/${encodeURIComponent(config.pixKey)}`, { method: "PUT", body: { webhookUrl: url }, headers: { "x-skip-mtls-checking": "true" } });
    if (res.status >= 300) return { ok: false, message: `A Efí recusou o webhook: ${efiDetail(res.body) || res.status}` };
    return { ok: true, message: "Webhook do Pix cadastrado. A Efí manda um aviso de teste para confirmar." };
  } catch (error) {
    return { ok: false, message: error instanceof EfiError ? `${error.message}: ${error.detail}` : "Não foi possível falar com a Efí." };
  }
}

/** Pix de teste (só em homologação): de R$ 0,01 a R$ 10,00 a Efí confirma sozinha e chama o webhook. */
export async function sandboxTestPix(): Promise<{ ok: true; txid: string; pixCode?: string; pixImage?: string } | { ok: false; message: string }> {
  const config = efiConfig();
  if (!config) return { ok: false, message: "Efí não configurada." };
  if (!config.sandbox) return { ok: false, message: "O Pix de teste só roda em homologação (MULTILOJA_EFI_SANDBOX=true)." };
  try {
    const charge = await efiPix(config, { codigo: "TESTE", total: 1, cliente: { nome: "Teste Homologacao", documento: "52998224725", email: "teste@exemplo.com" }, descricao: "Teste da integração multiloja", returnUrl: "" });
    return { ok: true, txid: charge.id, pixCode: charge.data.pixCode, pixImage: charge.data.pixImage };
  } catch (error) {
    return { ok: false, message: error instanceof EfiError ? `${error.message}: ${error.detail}` : error instanceof Error ? error.message : "erro" };
  }
}
