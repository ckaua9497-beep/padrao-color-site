import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createServer as createTcpServer, type Server as TcpServer, type Socket } from "node:net";
import { classifyNetworkError, createLimiter, createTransport } from "./transport.ts";

/*
 * Transporte da API (transport.ts) contra servidores locais: nada aqui fala com a API real (o firewall dela
 * bloqueia o IP de quem abre conexões demais). Prazos curtos, nas proporções de produção (idle < timeout).
 */

const listen = (server: Server | TcpServer) =>
  new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port)));

const close = (server: Server | TcpServer) => new Promise<void>((resolve) => server.close(() => resolve()));

/** Servidor HTTP que responde "ok" depois de `?d=` ms e conta os pedidos que chegaram ao handler. */
async function slowServer() {
  let hits = 0;
  const server = createServer((req, res) => {
    hits += 1;
    const delay = Number(new URL(req.url ?? "/", "http://x").searchParams.get("d") ?? 0);
    setTimeout(() => res.end("ok"), delay);
  });
  server.keepAliveTimeout = 60_000;
  const port = await listen(server);
  return { server, base: `http://127.0.0.1:${port}`, hits: () => hits };
}

async function failure(promise: Promise<unknown>): Promise<{ error: Record<string, unknown>; ms: number }> {
  const started = Date.now();
  try {
    await promise;
  } catch (error) {
    return { error: error as Record<string, unknown>, ms: Date.now() - started };
  }
  throw new Error("a chamada deveria ter falhado");
}

test("classifica falhas de rede: sem conexão, sem resposta, se o pedido pode ter saído e o resto com o código cru", () => {
  const timeout = (connecting: boolean) => Object.assign(new Error("Tempo esgotado"), { name: "TimeoutError", connecting, connected: !connecting });
  assert.deepEqual(classifyNetworkError(timeout(true)), { unreachable: true, refused: false, timedOut: false, sent: false, code: "tempo esgotado ao conectar" });
  assert.deepEqual(classifyNetworkError(timeout(false)), { unreachable: false, refused: false, timedOut: true, sent: "maybe", code: "tempo esgotado" });
  for (const code of ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH"]) {
    const failure = classifyNetworkError(Object.assign(new Error(code), { code, connected: false }));
    assert.equal(failure.unreachable, true, code);
    assert.equal(failure.sent, false, code);
  }
  // Conexão nova derrubada antes do handshake = recusa (o client só trata como bloqueio se repetir).
  assert.deepEqual(classifyNetworkError(Object.assign(new Error("x"), { code: "ECONNRESET", connected: false })), { unreachable: false, refused: true, timedOut: false, sent: false, code: "ECONNRESET" });
  // Depois de conectar, a mesma queda pode ter levado o pedido junto.
  assert.deepEqual(classifyNetworkError(Object.assign(new Error("x"), { code: "ECONNRESET", connected: true })), { unreachable: false, refused: false, timedOut: false, sent: "maybe", code: "ECONNRESET" });
  // Certificado: não é "fora do ar" (vai para o log com o código), mas também não chegou à API.
  assert.deepEqual(classifyNetworkError(Object.assign(new Error("x"), { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE", connected: false })), { unreachable: false, refused: false, timedOut: false, sent: false, code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" });
  // Erro de outra origem (sem o connected do send): vale o código sozinho.
  assert.equal(classifyNetworkError(Object.assign(new Error("x"), { code: "ECONNREFUSED" })).unreachable, true);
  assert.equal(classifyNetworkError(null).code, "erro de rede");
});

test("fila de chamadas: no máximo N ao mesmo tempo, na ordem, e quem espera demais desiste", async () => {
  const limiter = createLimiter(2);
  assert.equal(await limiter.acquire(1_000), true);
  assert.equal(await limiter.acquire(1_000), true);
  const third = limiter.acquire(1_000);
  const gaveUp = limiter.acquire(50);
  assert.equal(limiter.waiting, 2);
  assert.equal(await gaveUp, false, "esgotou o prazo na fila");
  assert.equal(limiter.waiting, 1, "quem desistiu sai da fila");
  limiter.release();
  assert.equal(await third, true);
  assert.equal(limiter.active, 2);
  limiter.release();
  limiter.release();
  assert.equal(limiter.active, 0);
});

test("fila de chamadas: drain tira todo mundo da fila na hora (host caiu)", async () => {
  const limiter = createLimiter(1);
  assert.equal(await limiter.acquire(1_000), true);
  const waiting = [limiter.acquire(5_000), limiter.acquire(5_000)];
  const started = Date.now();
  limiter.drain();
  assert.deepEqual(await Promise.all(waiting), [false, false]);
  assert.ok(Date.now() - started < 100);
  assert.equal(limiter.waiting, 0);
  limiter.release();
  assert.equal(await limiter.acquire(10), true, "a vaga volta a valer depois");
});

test("resposta mais lenta que a conexão ociosa do agente (e dentro do prazo) chega", async () => {
  const { server, base } = await slowServer();
  const transport = createTransport({ idleMs: 150 });
  try {
    const first = await transport.send(new URL(`${base}/?d=400`), "GET", {}, undefined, 1_500);
    assert.equal(first.text, "ok");
    // Mesma conexão reaproveitada: continua valendo o prazo da requisição, não o idle do agente.
    const reused = await transport.send(new URL(`${base}/?d=400`), "GET", {}, undefined, 1_500);
    assert.equal(reused.text, "ok");
  } finally {
    transport.destroy();
    server.closeAllConnections();
    await close(server);
  }
});

test("API que conecta e não responde: tempo esgotado no prazo, como lentidão (connecting = false)", async () => {
  const { server, base } = await slowServer();
  const transport = createTransport({ idleMs: 150 });
  try {
    const { error, ms } = await failure(transport.send(new URL(`${base}/?d=5000`), "GET", {}, undefined, 400));
    assert.equal(error.name, "TimeoutError");
    assert.equal(error.connecting, false);
    assert.ok(ms >= 350 && ms < 1_000, `saiu em ${ms} ms`);
  } finally {
    transport.destroy();
    server.closeAllConnections();
    await close(server);
  }
});

test("HTTPS com o handshake TLS parado: sem conexão no prazo (não em 2x, nem como lentidão)", async () => {
  // Aceita o TCP e nunca responde ao ClientHello (firewall/proxy travado depois do accept).
  const sockets = new Set<Socket>();
  const server = createTcpServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
  });
  const port = await listen(server);
  const transport = createTransport({ idleMs: 150 });
  try {
    const { error, ms } = await failure(transport.send(new URL(`https://127.0.0.1:${port}/x`), "POST", {}, "{}", 700));
    assert.equal(error.name, "TimeoutError");
    assert.equal(error.connecting, true, "ainda conectando = sem conexão");
    assert.ok(ms >= 650 && ms < 1250, `saiu em ${ms} ms (o timer do socket sozinho levaria ~1400 ms)`);
    assert.equal(classifyNetworkError(error).unreachable, true);
  } finally {
    transport.destroy();
    sockets.forEach((socket) => socket.destroy());
    await close(server);
  }
});

test("HTTPS derrubado antes do handshake (firewall recusando): recusa, e o pedido não saiu", async () => {
  const server = createTcpServer((socket) => socket.destroy());
  const port = await listen(server);
  const transport = createTransport();
  try {
    const { error } = await failure(transport.send(new URL(`https://127.0.0.1:${port}/gerarpedido`), "POST", {}, "{}", 2_000));
    assert.equal(error.connected, false);
    const classified = classifyNetworkError(error);
    assert.equal(classified.refused, true, `código ${String(error.code)}`);
    assert.equal(classified.sent, false);
  } finally {
    transport.destroy();
    await close(server);
  }
});

test("conexão TCP que nunca completa: vale o prazo da requisição, não o idle do agente", async (t) => {
  // 10.255.255.1 não é roteável: na maioria das redes o SYN se perde. Se a rede responder (RST/ICMP), não há
  // como simular a conexão pendurada aqui e o teste é pulado.
  const transport = createTransport({ idleMs: 150 });
  try {
    const { error, ms } = await failure(transport.send(new URL("http://10.255.255.1/"), "GET", {}, undefined, 700));
    if (error.name !== "TimeoutError") {
      t.skip(`a rede respondeu ${String(error.code)}: sem conexão pendurada para testar`);
      return;
    }
    assert.equal(error.connecting, true);
    assert.ok(ms >= 650 && ms < 1_200, `saiu em ${ms} ms (o idle do agente cortaria em ~150 ms)`);
  } finally {
    transport.destroy();
  }
});

test("porta fechada: erro imediato classificado como sem conexão", async () => {
  const server = createTcpServer();
  const port = await listen(server);
  await close(server);
  const transport = createTransport();
  try {
    const { error, ms } = await failure(transport.send(new URL(`http://127.0.0.1:${port}/`), "GET", {}, undefined, 2_000));
    assert.equal(error.code, "ECONNREFUSED");
    assert.ok(ms < 1_000);
    assert.equal(classifyNetworkError(error).unreachable, true);
  } finally {
    transport.destroy();
  }
});

test("servidor fecha várias conexões ociosas de uma vez: GET repete numa conexão nova; POST de pedido não repete", async () => {
  const { server, base, hits } = await slowServer();
  const transport = createTransport({ idleMs: 30_000 });
  try {
    // Três conexões no pool (pedidos em paralelo) e o servidor fecha todas, como num reload do nginx.
    await Promise.all([1, 2, 3].map(() => transport.send(new URL(`${base}/?d=30`), "GET", {}, undefined, 2_000)));
    server.closeIdleConnections();
    const before = hits();
    const reply = await transport.request(new URL(`${base}/?d=0`), "GET", {}, undefined, 2_000, true);
    assert.equal(reply.text, "ok");
    assert.equal(hits() - before, 1, "o pedido chegou uma vez ao servidor");

    await Promise.all([1, 2, 3].map(() => transport.send(new URL(`${base}/?d=30`), "GET", {}, undefined, 2_000)));
    server.closeIdleConnections();
    const { error } = await failure(transport.request(new URL(`${base}/gerarpedido`), "POST", {}, "{}", 2_000, false));
    assert.equal(error.reusedSocket, true, "falhou na conexão velha e não repetiu");
  } finally {
    transport.destroy();
    server.closeAllConnections();
    await close(server);
  }
});
