/*
 * Simulador local da API de frete da Padrão (só desenvolvimento), no formato de
 *   POST https://padraocolor.com.br/api/v2/melhor-envio/freight/calculate   (cabeçalho x-api-key)
 *   { to: { postal_code }, products: [{ id, width, height, length, weight, insurance_value, quantity }] }
 * → { environment, services: [{ id, name, company, price, deliveryTime, deliveryRange }], unavailable: [] }
 *
 *   node scripts/frete-mock.mjs      (porta 3197; ou FRETE_MOCK_PORT)
 *
 * No site (.env.development.local): PADRAO_FRETE_URL=http://localhost:3197/api/v2/melhor-envio/freight/calculate e
 * PADRAO_FRETE_API_KEY=qualquer-chave-de-teste. Os preços são inventados, mas seguem a lógica de verdade: peso cubado
 * (C×L×A ÷ 6000), distância pelo primeiro dígito do CEP, SEDEX caro e rápido, Loggi Ponto barato e o PAC sem atender
 * trechos longos.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.FRETE_MOCK_PORT ?? 3197);
const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);

const SERVICES = [
  { id: 34, name: "Loggi Ponto", company: { id: 14, name: "Loggi" }, base: 9.9, perKg: 2.4, days: [3, 5] },
  { id: 2, name: "SEDEX", company: { id: 1, name: "Correios" }, base: 11.5, perKg: 4.1, days: [1, 3] },
  { id: 31, name: "Express", company: { id: 14, name: "Loggi" }, base: 12.2, perKg: 3.6, days: [1, 3] },
  { id: 4, name: ".Com", company: { id: 2, name: "Jadlog" }, base: 13.1, perKg: 3.2, days: [3, 5] },
  { id: 1, name: "PAC", company: { id: 1, name: "Correios" }, base: 8.4, perKg: 2.1, days: [5, 8], maxDistance: 2 },
];

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  if (req.method !== "POST" || !req.url?.startsWith("/api/v2/melhor-envio/freight/calculate")) return send(res, 404, { message: "Not found" });
  if (!req.headers["x-api-key"]) return send(res, 401, { message: "Unauthorized" });
  const chunks = [];
  for await (const c of req) chunks.push(c);
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return send(res, 400, { message: "JSON inválido" });
  }
  const cep = String(body?.to?.postal_code ?? "").replace(/\D/g, "");
  const products = Array.isArray(body?.products) ? body.products : [];
  if (cep.length !== 8 || !products.length) return send(res, 422, { message: "Informe o CEP e os produtos." });
  const weight = products.reduce((sum, p) => sum + Math.max(Number(p.weight) || 0, (Number(p.width) * Number(p.height) * Number(p.length)) / 6000 || 0) * (Number(p.quantity) || 1), 0);
  const distance = Math.abs(Number(cep[0]) - 2);
  const services = [];
  const unavailable = [];
  for (const s of SERVICES) {
    if (s.maxDistance !== undefined && distance > s.maxDistance) {
      unavailable.push({ id: s.id, name: s.name, company: s.company, error: "Transportadora não atende este trecho." });
      continue;
    }
    const price = Math.round((s.base + s.perKg * weight + distance * 1.7) * 100) / 100;
    services.push({ id: s.id, name: s.name, company: s.company, price, listPrice: price, discount: 0, currency: "R$", deliveryTime: s.days[1] + distance, deliveryRange: { min: s.days[0] + distance, max: s.days[1] + distance } });
  }
  services.sort((a, b) => a.price - b.price);
  log(`cotação para ${cep}: ${products.length} produto(s), ${weight.toFixed(2)} kg → ${services.length} serviço(s)`);
  send(res, 200, { environment: "mock", services, unavailable });
}).listen(PORT, () => log(`API de frete (simulador) em http://localhost:${PORT}/api/v2/melhor-envio/freight/calculate`));
