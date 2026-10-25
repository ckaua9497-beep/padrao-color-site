// Chrome sem janela pelo protocolo DevTools (CDP), para as fotos de catálogo (fotos-produtos.mjs) e as fotos de
// conferência dos modelos 3D (mockup-shots.mjs). Usa o Google Chrome instalado (CHROME_PATH para outro caminho) com o
// WebGL em software (swiftshader), que roda igual em qualquer máquina.
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Abre o Chrome e devolve `navigate`, `evaluate` (valor da expressão, com await), `errors` (exceções da página desde o
 * último navigate) e `close`. Escala 3: o canvas do 3D sai com resolução de sobra para recortar e reduzir.
 */
export async function openChrome({ width = 1800, height = 1200, scale = 3 } = {}) {
  const port = 9900 + Math.floor(Math.random() * 90);
  const profile = join(tmpdir(), `padrao-chrome-${port}`);
  mkdirSync(profile, { recursive: true });
  const chrome = spawn(
    CHROME,
    ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--hide-scrollbars", `--window-size=${width},${height}`, "about:blank"],
    { stdio: "ignore" },
  );
  let wsUrl;
  for (let i = 0; i < 80 && !wsUrl; i += 1) {
    try {
      wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl;
    } catch {}
    if (!wsUrl) await sleep(250);
  }
  if (!wsUrl) {
    chrome.kill();
    throw new Error(`Não consegui abrir o Chrome em ${CHROME} (defina CHROME_PATH).`);
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    } else if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails?.exception?.description?.slice(0, 300) ?? "erro");
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      id += 1;
      pending.set(id, r);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  return {
    errors,
    evaluate,
    async navigate(url) {
      errors.length = 0;
      await send("Page.navigate", { url });
    },
    async close() {
      ws.close();
      chrome.kill();
      await sleep(300);
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {}
    },
  };
}

/**
 * Abre uma página de /design-system/fotos e espera a foto (data-foto="pronta" e window.__foto). Devolve o WebP em
 * data URL, ou o estado em que parou ("aguardando", "erro") quando não sai foto em `timeoutMs`.
 */
export async function catalogPhoto(browser, url, timeoutMs = 120_000) {
  await browser.navigate(url);
  let state = "aguardando";
  for (let waited = 0; waited < timeoutMs && state === "aguardando"; waited += 500) {
    await sleep(500);
    state = (await browser.evaluate(`document.querySelector('[data-foto]')?.dataset.foto ?? 'aguardando'`)) ?? "aguardando";
  }
  const data = state === "pronta" ? await browser.evaluate("window.__foto ?? null") : null;
  return data?.startsWith("data:image/webp;base64,") ? { ok: true, data } : { ok: false, state };
}
