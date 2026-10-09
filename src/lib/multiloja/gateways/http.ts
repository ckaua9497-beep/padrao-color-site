import "server-only";

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

/* Transporte JSON dos gateways (node:https; http só para os simuladores locais em desenvolvimento). */

export type HttpResult = { status: number; body: unknown };

export type HttpInit = {
  method?: string;
  headers?: Record<string, string>;
  /** Objeto vira JSON; string vai como está (form). */
  body?: unknown;
  /** Certificado cliente (mTLS) e senha. */
  pfx?: Buffer;
  passphrase?: string;
  timeoutMs?: number;
};

export function httpJson(url: string, { method = "GET", headers = {}, body, pfx, passphrase = "", timeoutMs = 20_000 }: HttpInit = {}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body);
    const contentType = typeof body === "string" ? "application/x-www-form-urlencoded" : "application/json";
    const send = url.startsWith("http://") ? httpRequest : httpsRequest;
    const req = send(
      url,
      {
        method,
        ...(pfx ? { pfx, passphrase } : {}),
        timeout: timeoutMs,
        headers: { Accept: "application/json", ...(payload ? { "Content-Type": contentType, "Content-Length": String(Buffer.byteLength(payload)) } : {}), ...headers },
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
    req.on("timeout", () => req.destroy(new Error("o gateway não respondeu a tempo")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Simulador local (MULTILOJA_<GATEWAY>_MOCK_URL), nunca em produção. */
export function mockBase(envName: string): string | null {
  const url = process.env[envName]?.trim();
  return url && process.env.NODE_ENV !== "production" ? url.replace(/\/$/, "") : null;
}
