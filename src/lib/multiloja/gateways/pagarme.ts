import "server-only";

import { pagarmeConfig, publicUrl, type PagarmeConfig } from "../config";
import type { PaymentKind } from "../core";
import { GatewayError, type Charge, type ChargeInput, type ChargeStatus, type Check, type Gateway, type GatewayResult, type OrderPayment } from "./types";
import { httpJson, mockBase, type HttpResult } from "./http";
import { erroPagarme, isChargeId, pedidoPixPagarme, PIX_EXPIRA_SEG, pixCriado, situacaoPagarme } from "./pagarme-dados";

/*
 * Pagar.me, API v5 (docs.pagar.me, conferido em 2026-10-09): só Pix. Base https://api.pagar.me/core/v5, autenticação
 * básica com a chave secreta como usuário e senha vazia; a mesma URL serve teste e produção (sk_test_… cai no
 * simulador da Pagar.me: Pix de até R$ 500 é pago sozinho em segundos, acima disso falha).
 *   POST /orders · GET /charges/{id} · DELETE /charges/{id} (cancela o Pix em aberto ou devolve o pago) · GET /orders
 * ID gravado no pedido: a cobrança (ch_…). Os avisos chegam em /api/multiloja/pagamento/pagarme e o site sempre
 * consulta a cobrança antes de mudar o pedido. Dados e regras puros em pagarme-dados.ts.
 */

const mock = () => mockBase("MULTILOJA_PAGARME_MOCK_URL");

export function pagarmeMockActive(): boolean {
  return mock() !== null;
}

const apiBase = () => (mock() ? `${mock()}/core/v5` : "https://api.pagar.me/core/v5");
const auth = (c: PagarmeConfig) => ({ Authorization: `Basic ${Buffer.from(`${c.secretKey}:`).toString("base64")}` });

function fail(what: string, res: HttpResult): never {
  throw new GatewayError(`${what} (HTTP ${res.status})`, res.status, erroPagarme(res.body));
}

async function requireConfig(): Promise<PagarmeConfig> {
  const config = await pagarmeConfig();
  if (!config) throw new GatewayError("Pagar.me não configurada", 0, "");
  return config;
}

/**
 * Imagem do QR Code guardada no pedido (data:image/…), para a página não depender do link da Pagar.me. O link é
 * público; vai sem a chave. Sem imagem, o cliente usa o copia e cola.
 */
async function qrImage(url: string | undefined): Promise<string | undefined> {
  if (!url || !(url.startsWith("https://") || (mock() !== null && url.startsWith(mock() as string)))) return undefined;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!res.ok || !/^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(type)) return undefined;
    const bytes = Buffer.from(await res.arrayBuffer());
    return bytes.length > 0 && bytes.length <= 300_000 ? `data:${type};base64,${bytes.toString("base64")}` : undefined;
  } catch {
    return undefined;
  }
}

async function createPix(config: PagarmeConfig, input: ChargeInput): Promise<Charge> {
  const res = await httpJson(`${apiBase()}/orders`, { method: "POST", headers: auth(config), body: pedidoPixPagarme(input) });
  if (res.status >= 300) fail("A Pagar.me não criou o Pix", res);
  const pix = pixCriado(res.body);
  if (pix.erro || !pix.cobrancaId || !pix.qrCode) throw new GatewayError("A Pagar.me não gerou o Pix", res.status, pix.erro ?? "");
  const expira = pix.expiraEm ? new Date(pix.expiraEm) : null;
  return {
    id: pix.cobrancaId,
    data: {
      pixCode: pix.qrCode,
      pixImage: await qrImage(pix.qrUrl),
      expiresAt: expira && !Number.isNaN(expira.getTime()) ? expira.toISOString() : new Date(Date.now() + PIX_EXPIRA_SEG * 1000).toISOString(),
    },
  };
}

async function readCharge(config: PagarmeConfig, chargeId: string): Promise<unknown> {
  if (!isChargeId(chargeId)) throw new GatewayError("Cobrança da Pagar.me inválida", 0, "");
  const res = await httpJson(`${apiBase()}/charges/${encodeURIComponent(chargeId)}`, { headers: auth(config) });
  if (res.status !== 200) fail("A Pagar.me não informou a cobrança", res);
  return res.body;
}

async function deleteCharge(config: PagarmeConfig, chargeId: string): Promise<HttpResult> {
  return httpJson(`${apiBase()}/charges/${encodeURIComponent(chargeId)}`, { method: "DELETE", headers: auth(config) });
}

/** URL dos avisos (webhook) que a Padrão cadastra no painel da Pagar.me, com o segredo. */
export async function pagarmeWebhookUrl(): Promise<string | null> {
  const base = publicUrl();
  const secret = (await pagarmeConfig())?.webhookSecret;
  return base && secret ? `${base}/api/multiloja/pagamento/pagarme?hmac=${encodeURIComponent(secret)}` : null;
}

export const pagarmeGateway: Gateway = {
  name: "pagarme",
  label: "Pagar.me",
  methods: async (): Promise<readonly PaymentKind[]> => ["pix"],
  configured: async () => (await pagarmeConfig()) !== null,

  async create(method: PaymentKind, input: ChargeInput) {
    if (method !== "pix") throw new GatewayError("A Pagar.me só cobra Pix nesta integração", 0, "");
    return createPix(await requireConfig(), input);
  },

  async status(chargeId: string): Promise<ChargeStatus> {
    return situacaoPagarme(await readCharge(await requireConfig(), chargeId));
  },

  async refund(order: OrderPayment): Promise<GatewayResult> {
    const config = await requireConfig();
    if (!order.pagamentoId) return { ok: false, message: "Cobrança sem identificador." };
    const res = await deleteCharge(config, order.pagamentoId);
    if (res.status >= 300) return { ok: false, message: `A Pagar.me recusou a devolução do Pix: ${erroPagarme(res.body) || res.status}` };
    return { ok: true, message: "Devolução do Pix pedida à Pagar.me (confira no painel dela)." };
  },

  async void(order: OrderPayment): Promise<GatewayResult> {
    const config = await requireConfig();
    if (!order.pagamentoId) return { ok: true, message: "Sem cobrança aberta." };
    // O DELETE também devolve um Pix pago: confere antes, para a mensagem dizer o que aconteceu.
    const current = situacaoPagarme(await readCharge(config, order.pagamentoId));
    if (current.status === "expirado") return { ok: true, message: "O Pix já estava cancelado na Pagar.me." };
    const res = await deleteCharge(config, order.pagamentoId);
    if (res.status >= 300) return { ok: false, message: `A Pagar.me não cancelou o Pix: ${erroPagarme(res.body) || res.status}` };
    return current.status === "pago" ? { ok: true, message: "O Pix já tinha sido pago: devolução pedida à Pagar.me." } : { ok: true, message: "Pix cancelado na Pagar.me." };
  },

  async diagnostics(): Promise<Check[]> {
    const config = await pagarmeConfig();
    const checks: Check[] = [
      {
        label: "Chave secreta da API (sk_…)",
        ok: Boolean(config),
        detail: config ? (config.teste ? "chave de teste: Pix de até R$ 500 é pago sozinho pelo simulador da Pagar.me" : "chave de produção: cobranças de verdade") : "No painel da Pagar.me, nas chaves de API (a secreta começa com sk_).",
      },
      { label: "URL pública e segredo dos avisos", ok: Boolean(publicUrl() && config?.webhookSecret), detail: "Gerado ao salvar a Pagar.me; cadastre a URL abaixo nos webhooks do painel dela." },
    ];
    if (!config) return checks;
    try {
      // Lista um pedido só: 200 = chave aceita; 401 = chave recusada.
      const res = await httpJson(`${apiBase()}/orders?page=1&size=1`, { headers: auth(config) });
      checks.push(
        res.status === 401 || res.status === 403
          ? { label: "Acesso à API", ok: false, detail: "chave recusada pela Pagar.me" }
          : res.status < 300
            ? { label: "Acesso à API", ok: true, detail: `chave aceita (${config.teste ? "teste" : "produção"})` }
            : { label: "Acesso à API", ok: false, detail: `a Pagar.me respondeu HTTP ${res.status}` },
      );
    } catch (error) {
      checks.push({ label: "Acesso à API", ok: false, detail: error instanceof Error ? error.message : "erro" });
    }
    return checks;
  },
};
