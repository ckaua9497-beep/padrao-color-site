import "server-only";

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { efiConfig, paymentProvider, publicUrl, type EfiConfig, type ProviderName } from "./config";
import type { PaymentData } from "./repo-vendas";

/*
 * Cobrança dos pedidos da multiloja.
 *
 * - "simulado" (desenvolvimento): gera um Pix de mentira e a página do pedido mostra "Simular pagamento".
 *   Nenhum dinheiro passa por aqui.
 * - "efi": Pix pela API Pix da Efí (cobrança imediata, QR Code e copia e cola; exige o certificado .p12) e
 *   cartão pelo link de pagamento da API de Cobranças da Efí (página segura da Efí, o site não toca no número
 *   do cartão). A confirmação vem por webhook e é sempre conferida de novo na própria Efí.
 *   ATENÇÃO: integração escrita pela documentação pública da Efí e ainda não testada no sandbox; validar com as
 *   credenciais de homologação antes de ligar MULTILOJA_PAGAMENTO=efi.
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
export type ChargeStatus = "pago" | "pendente" | "expirado";

const PIX_EXPIRES_SEC = 60 * 60;

// ---------------------------------------------------------------------------------- simulado

function simulatedPix(input: ChargeInput): Charge {
  const id = `sim-${randomBytes(8).toString("hex")}`;
  return {
    id,
    data: {
      pixCode: `00020126SIMULADO-${input.codigo}-${input.total.toFixed(2)}-NAO-PAGUE-ESTE-CODIGO`,
      expiresAt: new Date(Date.now() + PIX_EXPIRES_SEC * 1000).toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------------- Efí: transporte

type HttpResult = { status: number; body: unknown };

function httpJson(url: string, { method = "GET", headers = {}, body, pfx, passphrase }: { method?: string; headers?: Record<string, string>; body?: unknown; pfx?: Buffer; passphrase?: string }): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body);
    const req = httpsRequest(
      url,
      {
        method,
        pfx,
        passphrase,
        timeout: 20_000,
        headers: { Accept: "application/json", ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}), ...headers },
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
    req.on("timeout", () => req.destroy(new Error("Efí não respondeu a tempo")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const tokens = new Map<string, { token: string; until: number }>();

let certCache: Buffer | null = null;
function certificate(config: EfiConfig): Buffer {
  certCache ??= readFileSync(config.certPath);
  return certCache;
}

const pixBase = (c: EfiConfig) => (c.sandbox ? "https://pix-h.api.efipay.com.br" : "https://pix.api.efipay.com.br");
const chargesBase = (c: EfiConfig) => (c.sandbox ? "https://cobrancas-h.api.efipay.com.br" : "https://cobrancas.api.efipay.com.br");

async function efiToken(config: EfiConfig, api: "pix" | "cobrancas"): Promise<string> {
  const cached = tokens.get(api);
  if (cached && cached.until > Date.now()) return cached.token;
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const res =
    api === "pix"
      ? await httpJson(`${pixBase(config)}/oauth/token`, { method: "POST", headers: { Authorization: `Basic ${basic}` }, body: { grant_type: "client_credentials" }, pfx: certificate(config), passphrase: config.certPassword })
      : await httpJson(`${chargesBase(config)}/v1/authorize`, { method: "POST", headers: { Authorization: `Basic ${basic}` }, body: { grant_type: "client_credentials" } });
  const body = res.body as { access_token?: string; expires_in?: number } | null;
  if (res.status !== 200 || !body?.access_token) throw new Error(`Efí recusou a autenticação (${res.status}).`);
  tokens.set(api, { token: body.access_token, until: Date.now() + Math.max(60, (body.expires_in ?? 3600) - 60) * 1000 });
  return body.access_token;
}

// ---------------------------------------------------------------------------------- Efí: Pix

async function efiPix(config: EfiConfig, input: ChargeInput): Promise<Charge> {
  const token = await efiToken(config, "pix");
  const auth = { Authorization: `Bearer ${token}` };
  const doc = input.cliente.documento.replace(/\D/g, "");
  const cob = await httpJson(`${pixBase(config)}/v2/cob`, {
    method: "POST",
    headers: auth,
    pfx: certificate(config),
    passphrase: config.certPassword,
    body: {
      calendario: { expiracao: PIX_EXPIRES_SEC },
      devedor: doc.length === 14 ? { cnpj: doc, nome: input.cliente.nome.slice(0, 200) } : { cpf: doc, nome: input.cliente.nome.slice(0, 200) },
      valor: { original: input.total.toFixed(2) },
      chave: config.pixKey,
      solicitacaoPagador: input.descricao.slice(0, 140),
      infoAdicionais: [{ nome: "Pedido", valor: input.codigo }],
    },
  });
  const body = cob.body as { txid?: string; loc?: { id?: number }; pixCopiaECola?: string } | null;
  if (cob.status >= 300 || !body?.txid) throw new Error(`Efí não criou a cobrança Pix (${cob.status}).`);
  let pixImage: string | undefined;
  if (body.loc?.id) {
    const qr = await httpJson(`${pixBase(config)}/v2/loc/${body.loc.id}/qrcode`, { headers: auth, pfx: certificate(config), passphrase: config.certPassword });
    const image = (qr.body as { imagemQrcode?: string } | null)?.imagemQrcode;
    if (qr.status === 200 && typeof image === "string" && image.startsWith("data:image/")) pixImage = image;
  }
  return { id: body.txid, data: { pixCode: body.pixCopiaECola, pixImage, expiresAt: new Date(Date.now() + PIX_EXPIRES_SEC * 1000).toISOString() } };
}

async function efiPixStatus(config: EfiConfig, txid: string): Promise<ChargeStatus> {
  const token = await efiToken(config, "pix");
  const res = await httpJson(`${pixBase(config)}/v2/cob/${encodeURIComponent(txid)}`, { headers: { Authorization: `Bearer ${token}` }, pfx: certificate(config), passphrase: config.certPassword });
  const status = (res.body as { status?: string } | null)?.status;
  if (status === "CONCLUIDA") return "pago";
  if (status === "REMOVIDA_PELO_USUARIO_RECEBEDOR" || status === "REMOVIDA_PELO_PSP") return "expirado";
  return "pendente";
}

// ---------------------------------------------------------------------------------- Efí: cartão (link de pagamento)

async function efiCard(config: EfiConfig, input: ChargeInput): Promise<Charge> {
  const token = await efiToken(config, "cobrancas");
  const base = publicUrl();
  const expire = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const res = await httpJson(`${chargesBase(config)}/v1/charge/one-step/link`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: {
      items: [{ name: input.descricao.slice(0, 255), value: Math.round(input.total * 100), amount: 1 }],
      metadata: { custom_id: input.codigo, ...(base ? { notification_url: `${base}/api/multiloja/pagamento/efi/cartao` } : {}) },
      settings: { payment_method: "credit_card", expire_at: expire, request_delivery_address: false },
    },
  });
  const data = (res.body as { data?: { charge_id?: number; payment_url?: string } } | null)?.data;
  if (res.status >= 300 || !data?.charge_id || !data.payment_url) throw new Error(`Efí não criou o link de pagamento (${res.status}).`);
  return { id: `cartao-${data.charge_id}`, data: { checkoutUrl: data.payment_url } };
}

async function efiCardStatus(config: EfiConfig, chargeId: string): Promise<ChargeStatus> {
  const token = await efiToken(config, "cobrancas");
  const res = await httpJson(`${chargesBase(config)}/v1/charge/${encodeURIComponent(chargeId.replace(/^cartao-/, ""))}`, { headers: { Authorization: `Bearer ${token}` } });
  const status = (res.body as { data?: { status?: string } } | null)?.data?.status;
  if (status === "paid" || status === "settled") return "pago";
  if (status === "canceled" || status === "expired") return "expirado";
  return "pendente";
}

/** Notificação do cartão (token do POST da Efí) → códigos de pedido e situação atual de cada um. */
export async function efiCardNotification(notificationToken: string): Promise<{ codigo: string; chargeId: string }[]> {
  const config = efiConfig();
  if (!config) return [];
  const token = await efiToken(config, "cobrancas");
  const res = await httpJson(`${chargesBase(config)}/v1/notification/${encodeURIComponent(notificationToken)}`, { headers: { Authorization: `Bearer ${token}` } });
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
  if (provider !== "efi") return "pendente";
  const config = efiConfig();
  if (!config) return "pendente";
  return chargeId.startsWith("cartao-") ? efiCardStatus(config, chargeId) : efiPixStatus(config, chargeId);
}
