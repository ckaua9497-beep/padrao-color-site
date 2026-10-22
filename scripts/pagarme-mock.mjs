/*
 * Simulador local da Pagar.me, API v5 (só desenvolvimento), no formato de docs.pagar.me:
 *   POST /core/v5/orders (Pix) · GET /core/v5/orders/{id} · GET /core/v5/orders?page&size · GET /core/v5/charges/{id} ·
 *   DELETE /core/v5/charges/{id} (cancela o Pix em aberto ou devolve o pago)
 * Autenticação básica com a chave secreta (sk_test_… ou sk_…) como usuário e senha vazia.
 *
 *   node scripts/pagarme-mock.mjs      (porta 3195; ou PAGARME_MOCK_PORT)
 *
 * No site (.env.development.local): MULTILOJA_PAGARME_MOCK_URL=http://localhost:3195 e, no admin → Pagamentos, qualquer
 * chave sk_test_… de mentira. Como o simulador da própria Pagar.me: Pix de até R$ 500 é pago sozinho depois de
 * PAGARME_MOCK_PAGA_EM segundos (padrão 8; 0 = só pelo atalho) e acima de R$ 500 falha.
 * Atalho: POST /mock/pagar/<ch_…> paga na hora. Avisos (webhooks): POST /mock/config {"url": "<URL do webhook do admin>"}.
 */
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.PAGARME_MOCK_PORT ?? 3195);
const BASE = `http://localhost:${PORT}`;
const PAGA_EM = Number(process.env.PAGARME_MOCK_PAGA_EM ?? 8);
const orders = new Map();
const charges = new Map();
let webhookUrl = null;
// QR Code de mentira (PNG 1×1).
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);
const id = (prefix) => `${prefix}_${randomBytes(12).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 16).padEnd(16, "x")}`;
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body === undefined ? "" : type === "application/json" ? JSON.stringify(body) : body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
}

/** Autenticação básica: usuário = chave secreta (sk_…), senha vazia. */
function authorized(req) {
  const basic = /^Basic\s+(.+)$/i.exec(req.headers.authorization ?? "")?.[1];
  const [user, pass] = basic ? Buffer.from(basic, "base64").toString("utf8").split(":") : [];
  return /^sk_(test_)?[A-Za-z0-9]{8,}$/.test(user ?? "") && !pass;
}

/** Erros de validação no formato da Pagar.me ({message, errors: {campo: [...]}}). */
function validate(body) {
  const errors = {};
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) errors["order.items"] = ["The items field is required."];
  items.forEach((item, i) => {
    if (!(Number.isInteger(item?.amount) && item.amount > 0)) errors[`order.items[${i}].amount`] = ["The field amount must be greater than zero."];
  });
  const payment = body?.payments?.[0];
  if (payment?.payment_method !== "pix") errors["order.payments[0].payment_method"] = ["O simulador só cobra Pix."];
  if (!(Number.isInteger(payment?.pix?.expires_in) || payment?.pix?.expires_at)) errors["order.payments[0].pix.expires_in"] = ["The expires_in field is required."];
  const c = body?.customer ?? {};
  if (!c.name) errors["order.customer.name"] = ["The name field is required."];
  if (!c.email) errors["order.customer.email"] = ["The email field is required."];
  if (!/^(\d{11}|\d{14})$/.test(c.document ?? "")) errors["order.customer.document"] = ["The document field is not a valid number."];
  if (!c.phones?.mobile_phone?.area_code || !c.phones?.mobile_phone?.number) errors["order.customer.phones"] = ["The phones field is required for pix."];
  return Object.keys(errors).length ? { message: "The request is invalid.", errors } : null;
}

async function notify(type, data) {
  if (!webhookUrl) return log(`sem URL de webhook: ${type} não avisado`);
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: id("hook"), account: { id: "acc_simulador", name: "Simulador" }, type, created_at: now(), data }),
  }).catch((error) => ({ status: `erro ${error.message}` }));
  log(`webhook ${type} → ${res.status}`);
}

const chargeView = (charge) => ({ ...charge, order: { id: charge.order_id, code: charge.code, status: orders.get(charge.order_id)?.status } });
const orderView = (order) => ({ ...order, charges: order.charge_ids.map((cid) => charges.get(cid)) });

function pay(charge) {
  if (charge.status !== "pending") return false;
  charge.status = "paid";
  charge.paid_at = now();
  charge.paid_amount = charge.amount;
  charge.updated_at = now();
  charge.last_transaction = { ...charge.last_transaction, status: "paid", end_to_end_id: `E${randomBytes(15).toString("hex").slice(0, 31).toUpperCase()}` };
  const order = orders.get(charge.order_id);
  order.status = "paid";
  log(`Pix ${charge.id} pago (${(charge.amount / 100).toFixed(2)})`);
  notify("charge.paid", chargeView(charge)).then(() => notify("order.paid", orderView(order)));
  return true;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const path = url.pathname;
  const method = req.method;
  log(method, path);
  let m;

  if (path.startsWith("/core/v5/")) {
    if (!authorized(req)) return send(res, 401, { message: "Authorization has been denied for this request." });

    if (method === "POST" && path === "/core/v5/orders") {
      const body = await readJson(req);
      if (!body) return send(res, 400, { message: "The request is invalid." });
      const invalid = validate(body);
      if (invalid) return send(res, 422, invalid);
      const amount = body.items.reduce((sum, item) => sum + item.amount * (item.quantity ?? 1), 0);
      const pix = body.payments[0].pix;
      const expiresAt = pix.expires_at ?? new Date(Date.now() + pix.expires_in * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
      const order = { id: id("or"), code: body.code ?? null, amount, currency: "BRL", closed: true, status: "pending", customer: { id: id("cus"), name: body.customer.name, email: body.customer.email, type: body.customer.type }, created_at: now(), updated_at: now(), charge_ids: [] };
      const tran = id("tran");
      const recusado = amount > 50_000;
      const charge = {
        id: id("ch"),
        code: order.code,
        amount,
        status: recusado ? "failed" : "pending",
        currency: "BRL",
        payment_method: "pix",
        order_id: order.id,
        created_at: now(),
        updated_at: now(),
        last_transaction: {
          id: tran,
          transaction_type: "pix",
          amount,
          status: recusado ? "failed" : "waiting_payment",
          success: !recusado,
          ...(recusado
            ? { gateway_response: { code: "400", errors: [{ message: "Simulador: Pix acima de R$ 500,00 falha." }] } }
            : { qr_code: `00020101021226820014br.gov.bcb.pix2560simulador.pagar.me/pix/${tran}5204000053039865406${(amount / 100).toFixed(2)}5802BR5925PADRAO COLOR SIMULADOR6009SAO PAULO62070503***6304ABCD`, qr_code_url: `${BASE}/mock/qrcode/${tran}`, expires_at: expiresAt }),
        },
      };
      order.status = recusado ? "failed" : "pending";
      order.charge_ids.push(charge.id);
      orders.set(order.id, order);
      charges.set(charge.id, charge);
      log(`pedido ${order.id} (${order.code}) · Pix ${charge.id} ${recusado ? "RECUSADO" : "aguardando"} (${(amount / 100).toFixed(2)})`);
      if (!recusado && PAGA_EM > 0) setTimeout(() => pay(charge), PAGA_EM * 1000);
      return send(res, 200, orderView(order));
    }

    if (method === "GET" && path === "/core/v5/orders") {
      const size = Math.max(1, Math.min(30, Number(url.searchParams.get("size")) || 10));
      const list = [...orders.values()].slice(-size).reverse().map(orderView);
      return send(res, 200, { data: list, paging: { total: orders.size } });
    }

    if (method === "GET" && (m = path.match(/^\/core\/v5\/orders\/(or_\w+)$/))) {
      const order = orders.get(m[1]);
      return order ? send(res, 200, orderView(order)) : send(res, 404, { message: "Order not found" });
    }

    if ((m = path.match(/^\/core\/v5\/charges\/(ch_\w+)$/))) {
      const charge = charges.get(m[1]);
      if (!charge) return send(res, 404, { message: "Charge not found" });
      if (method === "GET") return send(res, 200, chargeView(charge));
      if (method === "DELETE") {
        const order = orders.get(charge.order_id);
        if (charge.status === "paid") {
          charge.status = "canceled";
          charge.canceled_amount = charge.amount;
          charge.last_transaction = { ...charge.last_transaction, status: "refunded" };
          log(`Pix ${charge.id} devolvido`);
          notify("charge.refunded", chargeView(charge));
        } else if (charge.status === "pending") {
          charge.status = "canceled";
          charge.last_transaction = { ...charge.last_transaction, status: "canceled" };
          order.status = "canceled";
          log(`Pix ${charge.id} cancelado`);
          notify("order.canceled", orderView(order));
        } else {
          return send(res, 422, { message: `Charge can't be canceled (status ${charge.status}).` });
        }
        charge.updated_at = now();
        return send(res, 200, chargeView(charge));
      }
    }
    return send(res, 404, { message: "Not found" });
  }

  if (method === "GET" && path.startsWith("/mock/qrcode/")) return send(res, 200, PNG_1PX, "image/png");

  if (method === "POST" && (m = path.match(/^\/mock\/pagar\/(ch_\w+)$/))) {
    const charge = charges.get(m[1]);
    if (!charge) return send(res, 404, { message: "Cobrança não encontrada" });
    return pay(charge) ? send(res, 200, chargeView(charge)) : send(res, 409, { message: `Cobrança ${charge.status}` });
  }

  if (method === "POST" && path === "/mock/config") {
    const body = await readJson(req);
    webhookUrl = typeof body?.url === "string" && /^https?:\/\//.test(body.url) ? body.url : null;
    log(webhookUrl ? `webhooks vão para ${webhookUrl.replace(/hmac=[^&]+/, "hmac=•••")}` : "webhooks desligados");
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { message: "Not found" });
});

server.listen(PORT, () => log(`Simulador da Pagar.me em ${BASE} (Pix pago sozinho em ${PAGA_EM || "—"} s)`));
