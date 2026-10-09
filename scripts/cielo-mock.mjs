/*
 * Simulador local da Cielo (só desenvolvimento), seguindo docs.cielo.com.br:
 *   API E-commerce: POST /api3/1/sales/ (Pix Cielo2 e Boleto) · GET /api3/1/sales/{PaymentId} · PUT /api3/1/sales/{id}/void
 *   Link de Pagamento: POST /link/api/public/v2/token · POST /link/api/public/v1/products/ ·
 *                      GET /link/api/public/v1/products/{id}/payments · PUT /link/api/public/v2/orders/{n}/void
 *
 *   node scripts/cielo-mock.mjs        (porta 3198; ou CIELO_MOCK_PORT)
 *
 * No site (.env.development.local): MULTILOJA_CIELO_MOCK_URL=http://localhost:3198 e a Cielo configurada no admin.
 * Atalhos para pagar: POST /mock/pagar/<PaymentId> (Pix ou boleto) e GET /mock/link/<id do link> ("página da Cielo").
 * Para onde avisar (o que na Cielo de verdade se cadastra no portal):
 *   POST /mock/config {"apiUrl": "...", "linkUrl": "...", "segredo": "..."}
 */
import { randomUUID, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.CIELO_MOCK_PORT ?? 3198);
const BASE = `http://localhost:${PORT}`;
const sales = new Map();
const links = new Map();
let notify = { apiUrl: null, linkUrl: null, segredo: null };
const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
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

const merchantOk = (req) => /^[0-9a-f-]{36}$/i.test(req.headers.merchantid ?? "") && (req.headers.merchantkey ?? "").length >= 10;

async function notifyApi(paymentId) {
  if (!notify.apiUrl) return log("sem URL de notificação da API: nada a avisar");
  const res = await fetch(notify.apiUrl, { method: "POST", headers: { "Content-Type": "application/json", ...(notify.segredo ? { "X-Multiloja-Segredo": notify.segredo } : {}) }, body: JSON.stringify({ PaymentId: paymentId, ChangeType: 1 }) }).catch((e) => ({ status: `erro ${e.message}` }));
  log(`Post de Notificação → ${res.status}`);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const path = url.pathname;
  const method = req.method;
  const body = method === "GET" ? null : await readBody(req);
  log(method, path);
  let m;

  // ------------------------------------------------------------------ API E-commerce
  if (path.startsWith("/api3/")) {
    if (!merchantOk(req)) return send(res, 401);
    if (method === "POST" && path === "/api3/1/sales/") {
      const p = body?.Payment;
      if (!body?.MerchantOrderId || /[^A-Za-z0-9]/.test(body.MerchantOrderId) || !p?.Type || !Number.isInteger(p.Amount)) return send(res, 400, [{ Code: 126, Message: "MerchantOrderId/Payment inválidos" }]);
      const id = randomUUID();
      if (p.Type === "Pix") {
        if (p.Provider !== "Cielo2") return send(res, 400, [{ Code: 422, Message: "Provider deve ser Cielo2" }]);
        if (!body.Customer?.Name || /[^A-Za-z ]/.test(body.Customer.Name)) return send(res, 400, [{ Code: 401, Message: "Customer.Name só com letras" }]);
        const sale = { MerchantOrderId: body.MerchantOrderId, Customer: body.Customer, Payment: { PaymentId: id, Type: "Pix", Provider: "Cielo2", Amount: p.Amount, Status: 12, QrCodeBase64Image: PNG_1PX, QrCodeString: `00020101021226CIELO${randomBytes(10).toString("hex")}5204000053039865406${(p.Amount / 100).toFixed(2)}`, ReturnCode: "0", ReturnMessage: "QRCode gerado com sucesso" } };
        sales.set(id, sale);
        return send(res, 201, sale);
      }
      if (p.Type === "Boleto") {
        const a = body.Customer?.Address;
        if (!p.Provider || !a?.ZipCode || !a.Street || !a.Number || !a.District || !a.State) return send(res, 400, [{ Code: 101, Message: "Boleto: Provider e endereço obrigatórios" }]);
        const digits = String(Date.now()).slice(-10);
        const sale = { MerchantOrderId: body.MerchantOrderId, Customer: body.Customer, Payment: { PaymentId: id, Type: "Boleto", Provider: p.Provider, Amount: p.Amount, Status: 1, Url: `${BASE}/mock/boleto/${id}`, DigitableLine: `00190.00009 01234.567890 ${digits.slice(0, 5)}.${digits.slice(5)}0 1 9999000000${String(p.Amount).padStart(4, "0")}`, BarCodeNumber: `0019${digits}`, ExpirationDate: p.ExpirationDate } };
        sales.set(id, sale);
        return send(res, 201, sale);
      }
      return send(res, 400, [{ Code: 126, Message: `Tipo ${p.Type} não simulado` }]);
    }
    if (method === "GET" && (m = /^\/api3\/1\/sales\/([0-9a-f-]{36})$/i.exec(path))) {
      const sale = sales.get(m[1]);
      return sale ? send(res, 200, sale) : send(res, 404);
    }
    if (method === "PUT" && (m = /^\/api3\/1\/sales\/([0-9a-f-]{36})\/void$/i.exec(path))) {
      const sale = sales.get(m[1]);
      if (!sale) return send(res, 404);
      if (sale.Payment.Type === "Boleto") return send(res, 400, [{ Code: 308, Message: "Boleto não pode ser cancelado" }]);
      const wasPaid = sale.Payment.Status === 2;
      sale.Payment.Status = wasPaid ? 2 : 13;
      log(wasPaid ? `devolução do Pix ${m[1]} agendada` : `QR ${m[1]} removido`);
      return send(res, 200, { Status: sale.Payment.Status, ReasonCode: wasPaid ? 8 : 0, ReasonMessage: wasPaid ? "Scheduled" : "Successful", ReturnCode: "0", ReturnMessage: wasPaid ? "Devolução solicitada com sucesso" : "QRCode removido" });
    }
  }

  // ------------------------------------------------------------------ Link de Pagamento
  if (method === "POST" && path === "/link/api/public/v2/token") {
    if (!/^Basic .+/.test(req.headers.authorization ?? "")) return send(res, 401, { error: "invalid_client" });
    return send(res, 200, { access_token: `mock-link-${randomBytes(8).toString("hex")}`, token_type: "bearer", expires_in: 1199 });
  }
  if (path.startsWith("/link/") && !/^Bearer mock-link-/.test(req.headers.authorization ?? "")) return send(res, 401, { message: "unauthorized" });
  if (method === "POST" && path === "/link/api/public/v1/products/") {
    if (!body?.name || !Number.isInteger(body.price) || !body.type || !body.shipping?.type || /[^A-Za-z0-9]/.test(body.OrderNumber ?? "")) return send(res, 400, { message: "name/price/type/shipping/OrderNumber inválidos" });
    const id = randomUUID();
    links.set(id, { id, OrderNumber: body.OrderNumber, price: body.price, orders: [] });
    return send(res, 201, { id, shortUrl: `${BASE}/mock/link/${id}`, type: body.type, price: body.price, name: body.name });
  }
  if (method === "GET" && (m = /^\/link\/api\/public\/v1\/products\/([0-9a-f-]{36})\/payments$/i.exec(path))) {
    const link = links.get(m[1]);
    if (!link) return send(res, 404, { message: "link não encontrado" });
    return send(res, 200, { productId: link.id, orders: link.orders.map((o) => ({ orderNumber: o.orderNumber, payment: { price: link.price, status: o.status } })) });
  }
  if (method === "PUT" && (m = /^\/link\/api\/public\/v2\/orders\/(\w+)\/void$/.exec(path))) {
    const link = [...links.values()].find((l) => l.orders.some((o) => o.orderNumber === m[1]));
    if (!link) return send(res, 404, { message: "pedido não encontrado" });
    link.orders.find((o) => o.orderNumber === m[1]).status = "Voided";
    log(`cartão ${m[1]} cancelado`);
    return send(res, 200, { status: 5 });
  }

  // ------------------------------------------------------------------ atalhos
  if (method === "POST" && path === "/mock/config") {
    notify = { apiUrl: body?.apiUrl ?? null, linkUrl: body?.linkUrl ?? null, segredo: body?.segredo ?? null };
    return send(res, 200, { ok: true });
  }
  if (method === "POST" && (m = /^\/mock\/pagar\/([0-9a-f-]{36})$/i.exec(path))) {
    const sale = sales.get(m[1]);
    if (!sale) return send(res, 404, { erro: "PaymentId desconhecido" });
    sale.Payment.Status = 2;
    if (sale.Payment.Type === "Pix") sale.Payment.EndToEndId = `E${randomBytes(15).toString("hex")}`;
    log(`${sale.Payment.Type} ${m[1]} pago`);
    await notifyApi(m[1]);
    return send(res, 200, { ok: true });
  }
  if (method === "GET" && (m = /^\/mock\/link\/([0-9a-f-]{36})$/i.exec(path))) {
    const link = links.get(m[1]);
    if (!link) return send(res, 404, { erro: "link desconhecido" });
    const orderNumber = randomBytes(16).toString("hex");
    link.orders.push({ orderNumber, status: "Paid" });
    log(`link ${m[1]} pago (${orderNumber})`);
    if (notify.linkUrl) {
      const r = await fetch(notify.linkUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `checkout_cielo_order_number=${orderNumber}&order_number=${link.OrderNumber}&payment_status=2&amount=${link.price}` }).catch((e) => ({ status: `erro ${e.message}` }));
      log(`notificação do link → ${r.status}`);
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(`<!doctype html><meta charset="utf-8"><title>Cielo (simulador)</title><body style="font-family:sans-serif;padding:40px"><h1>Pagamento aprovado (simulador da Cielo)</h1><p>Pedido ${link.OrderNumber}. Pode voltar à loja.</p></body>`);
  }
  if (method === "GET" && path === "/") return send(res, 200, { simulador: "cielo", vendas: sales.size, links: links.size, notify: { ...notify, segredo: notify.segredo ? "•••" : null } });

  send(res, 404, { erro: "rota não simulada", rota: `${method} ${path}` });
});

server.listen(PORT, () => log(`Simulador da Cielo em ${BASE}`));
