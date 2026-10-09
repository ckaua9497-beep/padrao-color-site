/*
 * Simulador local da Efí, para testar a integração da multiloja sem credenciais (só desenvolvimento).
 *
 *   node scripts/efi-mock.mjs            (porta 3199; ou EFI_MOCK_PORT)
 *
 * No site (.env.development.local): MULTILOJA_PAGAMENTO=efi, MULTILOJA_EFI_MOCK_URL=http://localhost:3199,
 * credenciais e chave Pix quaisquer, MULTILOJA_EFI_CERTIFICADO_BASE64 qualquer, MULTILOJA_URL_PUBLICA=http://localhost:3100
 * e MULTILOJA_EFI_WEBHOOK_SEGREDO.
 *
 * Imita as rotas e respostas da documentação da Efí (API Pix e API de Cobranças), inclusive o comportamento da
 * homologação: Pix de R$ 0,01 a R$ 10,00 é confirmado sozinho e o webhook é chamado. Para valores maiores:
 *   POST /mock/pagar/<txid>          → paga a cobrança Pix e chama o webhook
 *   GET  /mock/checkout/<charge_id>  → "página da Efí" do cartão (ou link do boleto): paga e manda a notificação
 * Não confere mTLS nem certificado (isso só existe na Efí de verdade).
 */
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.EFI_MOCK_PORT ?? 3199);
const BASE = `http://localhost:${PORT}`;
const cobs = new Map();
const charges = new Map();
const notifications = new Map();
let webhook = null;
let locSeq = 1000;
let chargeSeq = 5000;

const PNG_1PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const alnum = (n) => randomBytes(n).toString("hex").slice(0, n);
const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return text;
  }
}

const bearer = (req) => /^Bearer mock-/.test(req.headers.authorization ?? "");
const basic = (req) => /^Basic .+/.test(req.headers.authorization ?? "");

async function notifyPix(cob) {
  if (!webhook) return log("webhook Pix não cadastrado: nada a avisar");
  const body = { pix: [{ endToEndId: cob.pix[0].endToEndId, txid: cob.txid, chave: cob.chave, valor: cob.valor.original, horario: new Date().toISOString() }] };
  const res = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch((e) => ({ status: `erro ${e.message}` }));
  log(`webhook Pix → ${res.status}`);
}

function payCob(cob) {
  cob.status = "CONCLUIDA";
  cob.pix = [{ endToEndId: `E${alnum(31)}`, txid: cob.txid, valor: cob.valor.original, horario: new Date().toISOString() }];
  log(`Pix ${cob.txid} pago (R$ ${cob.valor.original})`);
  return notifyPix(cob);
}

async function payCharge(charge) {
  charge.status = "paid";
  const token = alnum(32);
  notifications.set(token, { charge_id: charge.charge_id, custom_id: charge.custom_id });
  log(`cartão ${charge.charge_id} pago`);
  if (!charge.notification_url) return log("sem notification_url: nada a avisar");
  const res = await fetch(charge.notification_url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `notification=${token}` }).catch((e) => ({ status: `erro ${e.message}` }));
  log(`notificação cartão → ${res.status}`);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const path = url.pathname;
  const method = req.method;
  const body = method === "GET" ? null : await readBody(req);
  log(method, path);
  let m;

  // ------------------------------------------------------------------ API Pix
  if (method === "POST" && path === "/pix/oauth/token") {
    if (!basic(req) || body?.grant_type !== "client_credentials") return send(res, 401, { error: "invalid_client", error_description: "credenciais inválidas" });
    return send(res, 200, { access_token: `mock-pix-${alnum(16)}`, token_type: "Bearer", expires_in: 3600, scope: "cob.read cob.write webhook.read webhook.write pix.read pix.write" });
  }
  if (path.startsWith("/pix/") && !bearer(req)) return send(res, 401, { nome: "acesso_negado", mensagem: "token ausente" });

  if (method === "POST" && path === "/pix/v2/cob") {
    const original = body?.valor?.original;
    if (!/^\d+\.\d{2}$/.test(original ?? "") || !body?.chave) return send(res, 400, { nome: "valor_invalido", mensagem: "valor.original ou chave inválidos" });
    if (body.devedor && !((body.devedor.cpf || body.devedor.cnpj) && body.devedor.nome)) return send(res, 400, { nome: "documento_bloqueado", mensagem: "devedor precisa de CPF/CNPJ e nome" });
    const cob = { txid: alnum(32), status: "ATIVA", calendario: { criacao: new Date().toISOString(), expiracao: body.calendario?.expiracao ?? 86400 }, valor: { original }, chave: body.chave, loc: { id: ++locSeq, tipoCob: "cob" }, pixCopiaECola: `00020101021226MOCKEFI${alnum(20)}5204000053039865406${original}` };
    cobs.set(cob.txid, cob);
    // Homologação: até R$ 10,00 confirma sozinho.
    if (Number(original) >= 0.01 && Number(original) <= 10) setTimeout(() => payCob(cob), 2000);
    return send(res, 201, cob);
  }
  if (method === "GET" && (m = /^\/pix\/v2\/loc\/(\d+)\/qrcode$/.exec(path))) {
    const cob = [...cobs.values()].find((c) => String(c.loc.id) === m[1]);
    return cob ? send(res, 200, { qrcode: cob.pixCopiaECola, imagemQrcode: PNG_1PX }) : send(res, 404, { nome: "location_nao_encontrada" });
  }
  if (method === "GET" && (m = /^\/pix\/v2\/cob\/([a-zA-Z0-9]{26,35})$/.exec(path))) {
    const cob = cobs.get(m[1]);
    return cob ? send(res, 200, cob) : send(res, 404, { nome: "cobranca_nao_encontrada" });
  }
  if (method === "PATCH" && (m = /^\/pix\/v2\/cob\/([a-zA-Z0-9]{26,35})$/.exec(path))) {
    const cob = cobs.get(m[1]);
    if (!cob) return send(res, 404, { nome: "cobranca_nao_encontrada" });
    if (body?.status === "REMOVIDA_PELO_USUARIO_RECEBEDOR" && cob.status === "ATIVA") cob.status = "REMOVIDA_PELO_USUARIO_RECEBEDOR";
    log(`Pix ${cob.txid} → ${cob.status}`);
    return send(res, 200, cob);
  }
  if ((m = /^\/pix\/v2\/webhook\/(.+)$/.exec(path))) {
    if (method === "GET") return webhook ? send(res, 200, { webhookUrl: webhook, chave: decodeURIComponent(m[1]), criacao: new Date().toISOString() }) : send(res, 404, { nome: "webhook_nao_encontrado" });
    if (method === "PUT") {
      if (!body?.webhookUrl) return send(res, 400, { nome: "json_invalido", mensagem: "webhookUrl obrigatório" });
      if (req.headers["x-skip-mtls-checking"] !== "true") log("aviso: cadastro sem x-skip-mtls-checking (a Efí exigiria mTLS no servidor)");
      // A Efí acrescenta /pix, a não ser que a URL tenha ?ignorar=
      webhook = body.webhookUrl.includes("ignorar=") ? body.webhookUrl : `${body.webhookUrl}/pix`;
      // A Efí manda um aviso de teste no cadastro.
      fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((r) => log(`aviso de teste → ${r.status}`), () => log("aviso de teste falhou"));
      return send(res, 200, { webhookUrl: body.webhookUrl });
    }
  }
  if (method === "PUT" && (m = /^\/pix\/v2\/pix\/([^/]+)\/devolucao\/([a-zA-Z0-9]{1,35})$/.exec(path))) {
    const cob = [...cobs.values()].find((c) => c.pix?.[0]?.endToEndId === m[1]);
    if (!cob) return send(res, 404, { nome: "pix_nao_encontrado" });
    if (!/^\d+\.\d{2}$/.test(body?.valor ?? "") || Number(body.valor) > Number(cob.valor.original)) return send(res, 400, { nome: "valor_devolucao_atingido" });
    log(`devolução ${m[2]} de R$ ${body.valor}`);
    return send(res, 201, { id: m[2], rtrId: `D${alnum(31)}`, valor: body.valor, horario: { solicitacao: new Date().toISOString() }, status: "EM_PROCESSAMENTO" });
  }

  // ------------------------------------------------------------------ API de Cobranças
  if (method === "POST" && path === "/cobrancas/v1/authorize") {
    if (!basic(req) || body?.grant_type !== "client_credentials") return send(res, 401, { error: "invalid_client" });
    return send(res, 200, { access_token: `mock-cob-${alnum(16)}`, token_type: "Bearer", expires_in: 600 });
  }
  if (path.startsWith("/cobrancas/") && !bearer(req)) return send(res, 401, { error: "unauthorized" });
  if (method === "POST" && path === "/cobrancas/v1/charge/one-step/link") {
    const item = body?.items?.[0];
    if (!item?.name || !Number.isInteger(item.value) || body?.settings?.payment_method !== "credit_card") return send(res, 400, { code: 3500034, error: "validation_error", error_description: "items/settings inválidos" });
    const charge = { charge_id: ++chargeSeq, status: "link", total: item.value * (item.amount ?? 1), custom_id: body.metadata?.custom_id ?? null, notification_url: body.metadata?.notification_url ?? null };
    charges.set(String(charge.charge_id), charge);
    return send(res, 200, { code: 200, data: { ...charge, payment_url: `${BASE}/mock/checkout/${charge.charge_id}`, payment_method: "credit_card", expire_at: body.settings.expire_at, created_at: new Date().toISOString() } });
  }
  if (method === "POST" && path === "/cobrancas/v1/charge/one-step") {
    const item = body?.items?.[0];
    const billet = body?.payment?.banking_billet;
    const c = billet?.customer;
    if (!item?.name || !Number.isInteger(item.value) || !billet?.expire_at || !c?.name || !(c.cpf || c.juridical_person?.cnpj) || !c.phone_number) {
      return send(res, 400, { code: 3500034, error: "validation_error", error_description: "boleto: items/customer/expire_at inválidos" });
    }
    const charge = { charge_id: ++chargeSeq, status: "waiting", total: item.value * (item.amount ?? 1), custom_id: body.metadata?.custom_id ?? null, notification_url: body.metadata?.notification_url ?? null };
    charges.set(String(charge.charge_id), charge);
    const digits = String(charge.charge_id).padStart(10, "0");
    return send(res, 200, {
      code: 200,
      data: {
        ...charge,
        payment: "banking_billet",
        barcode: `36490.00019 00002.${digits.slice(0, 5)} ${digits.slice(5)}0.000000 1 9999000000${String(charge.total).padStart(4, "0")}`,
        link: `${BASE}/mock/checkout/${charge.charge_id}`,
        billet_link: `${BASE}/mock/checkout/${charge.charge_id}`,
        pdf: { charge: `${BASE}/mock/boleto/${charge.charge_id}.pdf` },
        expire_at: billet.expire_at,
        pix: { qrcode: `00020101021226BOLIX${charge.charge_id}`, qrcode_image: PNG_1PX },
      },
    });
  }
  if (method === "PUT" && (m = /^\/cobrancas\/v1\/charge\/(\d+)\/cancel$/.exec(path))) {
    const charge = charges.get(m[1]);
    if (!charge) return send(res, 404, { code: 3500010, error: "charge_not_found" });
    if (!["new", "waiting", "unpaid", "link"].includes(charge.status)) return send(res, 400, { code: 3500020, error: "charge_cannot_be_canceled" });
    charge.status = "canceled";
    log(`cobrança ${charge.charge_id} cancelada`);
    return send(res, 200, { code: 200 });
  }
  if (method === "GET" && (m = /^\/cobrancas\/v1\/charge\/(\d+)$/.exec(path))) {
    const charge = charges.get(m[1]);
    return charge ? send(res, 200, { code: 200, data: { charge_id: charge.charge_id, status: charge.status, total: charge.total, custom_id: charge.custom_id } }) : send(res, 404, { code: 3500010, error: "charge_not_found" });
  }
  if (method === "GET" && (m = /^\/cobrancas\/v1\/notification\/(\w+)$/.exec(path))) {
    const n = notifications.get(m[1]);
    if (!n) return send(res, 404, { code: 404, error: "notification_not_found" });
    return send(res, 200, { code: 200, data: [{ id: 1, type: "charge", custom_id: n.custom_id, status: { current: "paid", previous: "link" }, identifiers: { charge_id: n.charge_id }, created_at: new Date().toISOString() }] });
  }
  if (method === "POST" && (m = /^\/cobrancas\/v1\/charge\/card\/(\d+)\/refund$/.exec(path))) {
    const charge = charges.get(m[1]);
    if (!charge || charge.status !== "paid") return send(res, 400, { code: 3500039, error: "charge_not_paid" });
    charge.status = "refunded";
    return send(res, 200, { code: 200, data: "Reembolso em processamento" });
  }

  // ------------------------------------------------------------------ atalhos do simulador
  if (method === "POST" && (m = /^\/mock\/pagar\/(\w+)$/.exec(path))) {
    const cob = cobs.get(m[1]);
    if (!cob) return send(res, 404, { erro: "txid desconhecido" });
    await payCob(cob);
    return send(res, 200, { ok: true });
  }
  if (method === "GET" && (m = /^\/mock\/checkout\/(\d+)$/.exec(path))) {
    const charge = charges.get(m[1]);
    if (!charge) return send(res, 404, { erro: "cobrança desconhecida" });
    await payCharge(charge);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(`<!doctype html><meta charset="utf-8"><title>Efí (simulador)</title><body style="font-family:sans-serif;padding:40px"><h1>Pagamento aprovado (simulador da Efí)</h1><p>Cobrança ${charge.charge_id} — pedido ${charge.custom_id}. Pode voltar à loja.</p></body>`);
  }
  if (method === "GET" && path === "/") return send(res, 200, { simulador: "efi", cobs: cobs.size, charges: charges.size, webhook });

  send(res, 404, { nome: "rota_nao_simulada", mensagem: `${method} ${path}` });
});

server.listen(PORT, () => log(`Simulador da Efí em ${BASE}`));
