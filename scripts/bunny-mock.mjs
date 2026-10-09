/*
 * Simulador local do Bunny Storage + CDN (só desenvolvimento), no formato da API de Storage da Bunny:
 *   PUT /{zona}/{pasta}/{arquivo}   grava o arquivo (exige o cabeçalho AccessKey) → 201
 *   GET /cdn/{pasta}/{arquivo}      serve o arquivo, como a URL pública da CDN
 *
 *   node scripts/bunny-mock.mjs      (porta 3196; ou BUNNY_MOCK_PORT)
 *
 * No site (.env.development.local):
 *   BUNNY_ACCESS_KEY=qualquer-chave-de-teste
 *   BUNNY_STORAGE_URL=http://localhost:3196/padraocolor
 *   BUNNY_CDN_URL=http://localhost:3196/cdn
 *   BUNNY_UPLOAD_FOLDER=uploads-clientes
 * Os arquivos ficam em .data/bunny-mock/ (fora do git). Nada sai do computador.
 */
import { createServer } from "node:http";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.BUNNY_MOCK_PORT ?? 3196);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".data", "bunny-mock");
const MAX_BYTES = 80 * 1024 * 1024;
const TYPES = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml", gif: "image/gif" };
const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);
/** Pasta e nome sem ".." nem barras extras: o simulador não escreve fora da própria pasta. */
const SAFE = /^[A-Za-z0-9_-]{1,60}\/[A-Za-z0-9._-]{1,120}$/;

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (req.method === "PUT") {
    // /{zona}/{pasta}/{arquivo}
    if (!req.headers.accesskey) return send(res, 401, { HttpCode: 401, Message: "Unauthorized" });
    const path = parts.slice(1).join("/");
    if (parts.length !== 3 || !SAFE.test(path)) return send(res, 400, { HttpCode: 400, Message: "Invalid path" });
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BYTES) return send(res, 413, { HttpCode: 413, Message: "Too large" });
      chunks.push(chunk);
    }
    const target = join(ROOT, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, Buffer.concat(chunks));
    log(`PUT ${path} · ${(size / 1024).toFixed(1)} KB · ${req.headers["content-type"] ?? "?"}`);
    return send(res, 201, { HttpCode: 201, Message: "File uploaded." });
  }
  if (req.method === "GET" && parts[0] === "cdn") {
    const path = parts.slice(1).join("/");
    if (!SAFE.test(path)) return send(res, 404, { HttpCode: 404, Message: "Not found" });
    const target = join(ROOT, path);
    try {
      statSync(target);
    } catch {
      return send(res, 404, { HttpCode: 404, Message: "Not found" });
    }
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    res.writeHead(200, { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Access-Control-Allow-Origin": "*" });
    return res.end(readFileSync(target));
  }
  send(res, 404, { HttpCode: 404, Message: "Not found" });
}).listen(PORT, () => log(`Bunny (simulador) em http://localhost:${PORT} · arquivos em ${ROOT}`));
