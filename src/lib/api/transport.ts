import { Agent as HttpAgent, request as httpRequest } from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import { rootCertificates } from "node:tls";
import { LETS_ENCRYPT_CHAIN } from "./tls-chain.ts";

/*
 * Transporte HTTP da API Padrão Color (usado por client.ts; sem "server-only" para os testes rodarem com
 * node --test contra servidores locais). Conexão própria (node:https) em vez do fetch: o servidor da API não
 * envia o certificado intermediário, e só assim dá para pôr a cadeia da Let's Encrypt na lista de confiança.
 *
 * - keepAlive reaproveita a conexão; a conexão parada fecha em `idleMs` (o nginx da API fecha em 65-75 s sem
 *   avisar: reaproveitar depois disso dá ECONNRESET).
 * - `timeoutMs` vale para a conexão (TCP + handshake TLS) e, depois dela, como tempo máximo sem nenhum byte da
 *   API (não é a duração total).
 * - Conexão velha (ECONNRESET/EPIPE num socket reaproveitado): o pedido não chegou ao servidor; quem pode
 *   repetir (GET, login) repete uma vez numa conexão nova garantida.
 */

export type RawResponse = { status: number; text: string };

/** Erro de rede de uma conexão reaproveitada que o servidor já tinha fechado (o pedido não chegou a ele). */
const STALE_SOCKET = new Set(["ECONNRESET", "EPIPE"]);

/** Sem conexão com o host (fora do ar, bloqueio de firewall, DNS): não é lentidão. */
const UNREACHABLE = new Set(["ETIMEDOUT", "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "ENOTFOUND", "EAI_AGAIN"]);

/** Conexão derrubada. Antes de conectar (TCP + TLS) numa conexão nova = o host recusou (firewall com RST). */
const RESET = new Set(["ECONNRESET", "EPIPE"]);

export type Transport = {
  /** Uma requisição; rejeita com o erro de rede/TLS (TimeoutError com `connecting` no tempo esgotado). */
  send: (url: URL, method: string, headers: Record<string, string>, body: string | undefined, timeoutMs: number, fresh?: boolean) => Promise<RawResponse>;
  /** send() com uma repetição numa conexão nova quando o socket reaproveitado estava morto (só se `retriable`). */
  request: (url: URL, method: string, headers: Record<string, string>, body: string | undefined, timeoutMs: number, retriable: boolean) => Promise<RawResponse>;
  destroy: () => void;
};

export function createTransport({ idleMs = 10_000, ca = [...rootCertificates, ...LETS_ENCRYPT_CHAIN] }: { idleMs?: number; ca?: string[] } = {}): Transport {
  const httpsAgent = new HttpsAgent({ keepAlive: true, timeout: idleMs, ca });
  const httpAgent = new HttpAgent({ keepAlive: true, timeout: idleMs });
  // A repetição vai numa conexão nova garantida: quando o servidor fecha várias ociosas de uma vez (reload do
  // nginx), o pool ainda tem outras conexões mortas. Mesma cadeia de certificados (agent: false a perderia).
  const freshHttpsAgent = new HttpsAgent({ keepAlive: false, ca });
  const freshHttpAgent = new HttpAgent({ keepAlive: false });

  const send: Transport["send"] = (url, method, headers, body, timeoutMs, fresh = false) =>
    new Promise((resolve, reject) => {
      const secure = url.protocol === "https:";
      // TCP conectado e, em HTTPS, handshake TLS concluído (ou conexão reaproveitada). Antes disso nada chegou à API.
      let connected = false;
      // timeout na própria requisição (não req.setTimeout): só assim ele vale desde a conexão; senão, enquanto
      // conecta, manda o timeout de conexão parada do agente (idleMs) e um servidor lento cai antes da hora.
      const options = {
        method,
        headers: body === undefined ? headers : { ...headers, "Content-Length": String(Buffer.byteLength(body)) },
        agent: fresh ? (secure ? freshHttpsAgent : freshHttpAgent) : secure ? httpsAgent : httpAgent,
        timeout: timeoutMs,
      };
      const req = (secure ? httpsRequest : httpRequest)(url, options, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      });
      // Tempo esgotado ainda conectando (TCP ou handshake TLS) = servidor fora do ar ou bloqueando, não lentidão.
      const expire = () => req.destroy(Object.assign(new Error("Tempo esgotado"), { name: "TimeoutError", connecting: !connected }));
      // Prazo próprio da conexão: o timer do socket não serve aqui. Com o handshake parado, o Node adia o primeiro
      // disparo (o pedido fica na fila do TLS) e o erro só sairia em 2x timeoutMs, como se fosse lentidão.
      const connectDeadline = setTimeout(expire, timeoutMs);
      req.on("socket", (socket) => {
        const ready = () => {
          connected = true;
          clearTimeout(connectDeadline);
        };
        if (req.reusedSocket) ready();
        else socket.once(secure ? "secureConnect" : "connect", ready);
      });
      req.on("close", () => clearTimeout(connectDeadline));
      req.on("timeout", expire);
      req.on("error", (error) => reject(Object.assign(error, { reusedSocket: req.reusedSocket, connected })));
      if (body !== undefined) req.write(body);
      req.end();
    });

  const request: Transport["request"] = (url, method, headers, body, timeoutMs, retriable) =>
    send(url, method, headers, body, timeoutMs).catch((error: { code?: string; reusedSocket?: boolean }) => {
      if (retriable && error?.reusedSocket && STALE_SOCKET.has(error.code ?? "")) return send(url, method, headers, body, timeoutMs, true);
      throw error;
    });

  return {
    send,
    request,
    destroy: () => [httpsAgent, httpAgent, freshHttpsAgent, freshHttpAgent].forEach((agent) => agent.destroy()),
  };
}

export type NetworkFailure = {
  /** Host sem conexão (fora do ar, bloqueio, DNS, handshake que não termina). */
  unreachable: boolean;
  /** Conexão nova derrubada antes do handshake: firewall recusando, se repetir (uma vez só pode ser acaso). */
  refused: boolean;
  /** Conectou, mas a API ficou sem mandar nada por timeoutMs. */
  timedOut: boolean;
  /** O pedido pode ter chegado à API? false = falhou antes de conectar; "maybe" = caiu depois de conectar. */
  sent: false | "maybe";
  /** Código cru do erro (ECONNRESET, UNABLE_TO_VERIFY_LEAF_SIGNATURE…). */
  code: string;
};

/**
 * Classifica o erro de send(). Erro de certificado não é "sem conexão" (fica com o código cru, ex.:
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE → atualizar tls-chain.ts), mas também não chegou à API.
 */
export function classifyNetworkError(error: unknown): NetworkFailure {
  const failure = (error ?? {}) as { name?: string; code?: string; message?: string; connecting?: boolean; connected?: boolean };
  const timeout = failure.name === "TimeoutError" || failure.name === "AbortError";
  const raw = failure.code ?? "";
  // connected vem do send(); sem ele (erro de outra origem) vale o que o código diz sozinho.
  const beforeConnect = failure.connected === false || (timeout && failure.connecting === true);
  const unreachable = beforeConnect ? timeout || UNREACHABLE.has(raw) : failure.connected === undefined && UNREACHABLE.has(raw);
  const refused = beforeConnect && !timeout && RESET.has(raw);
  const code = timeout ? (unreachable ? "tempo esgotado ao conectar" : "tempo esgotado") : raw || failure.message || "erro de rede";
  return { unreachable, refused, timedOut: timeout && !unreachable, sent: beforeConnect || unreachable ? false : "maybe", code };
}

export type Limiter = {
  /** Vaga para uma chamada; false = o prazo acabou esperando na fila (ou a fila foi esvaziada). */
  acquire: (waitMs: number) => Promise<boolean>;
  release: () => void;
  /** Tira todo mundo da fila (acquire → false): o host caiu e não adianta esperar vaga. */
  drain: () => void;
  readonly active: number;
  readonly waiting: number;
};

/** Fila de chamadas simultâneas (por processo). */
export function createLimiter(max: number): Limiter {
  let active = 0;
  type Waiter = { take: () => void; give: () => void };
  const queue: Waiter[] = [];
  return {
    acquire(waitMs) {
      if (active < max) {
        active += 1;
        return Promise.resolve(true);
      }
      return new Promise((resolve) => {
        const waiter: Waiter = {
          take: () => {
            clearTimeout(timer);
            active += 1;
            resolve(true);
          },
          give: () => {
            clearTimeout(timer);
            resolve(false);
          },
        };
        const timer = setTimeout(() => {
          const index = queue.indexOf(waiter);
          if (index >= 0) queue.splice(index, 1);
          resolve(false);
        }, waitMs);
        queue.push(waiter);
      });
    },
    release() {
      active = Math.max(0, active - 1);
      queue.shift()?.take();
    },
    drain() {
      queue.splice(0).forEach((waiter) => waiter.give());
    },
    get active() {
      return active;
    },
    get waiting() {
      return queue.length;
    },
  };
}
