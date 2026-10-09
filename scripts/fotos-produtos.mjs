// Fotos de catálogo dos produtos novos (API própria, src/data/novos/fonte.json): o mockup 3D de cada produto com a
// estampa da marca, fotografado com fundo transparente em 600×600 WebP, como as fotos do site oficial.
//
// Uso (com o site no ar, `npm run dev`):
//   npm run fotos:novos                       todas as fotos
//   npm run fotos:novos -- --only=900006      só um grupo
//   npm run fotos:novos -- --base=http://localhost:3100
//
// Precisa do Google Chrome (CHROME_PATH para outro caminho). Cada foto abre /design-system/fotos?… num Chrome sem
// janela, espera o 3D e grava o arquivo que o grupo/variação cita em `imagem`, `imagem_1` e `imagem_2`.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const BASE = flag("base") ?? "http://localhost:3100";
const ONLY = flag("only")?.split(",").map(Number);
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

/**
 * Por grupo: cor da estampa (token do espectro), modo ("pattern" chapado; "mark" = 1 cor, para serigrafia) e as
 * três fotos (principal, 2 e 3): giro da câmera em graus, opções escolhidas e variação do desenho.
 */
const PLAN = {
  900001: { cor: "coral", shots: [{}, { giro: 25, seed: 11 }, { giro: -25, seed: 23 }] },
  900002: { cor: "blue", shots: [{}, { giro: 25, op: "Formato:4,2x12,2 cm", seed: 11 }, { giro: -25, seed: 23 }] },
  900003: { cor: "magenta", shots: [{}, { giro: 25, seed: 11 }, { giro: -25, seed: 23 }] },
  900004: { cor: "cyan", shots: [{}, { giro: 25, op: "Formato:70x170 cm (largura x altura)", seed: 11 }, { giro: -25, op: "Formato:70x194 cm (largura x altura)", seed: 23 }] },
  900005: { cor: "amber", shots: [{}, { giro: 25, op: "Formato:M - 13x18,5x7,2 cm", seed: 11 }, { giro: -25, seed: 23 }] },
  900006: { cor: "coral", modo: "mark", shots: [{ op: "Cor:Branca;Alça:Alça vazada" }, { giro: 25, op: "Cor:Preta;Alça:Alça fixa (fita)", cor: "sun" }, { giro: -25, op: "Cor:Branca;Alça:Alça fixa (fita)", cor: "blue" }] },
  900007: { cor: "ink", modo: "mark", shots: [{}, { giro: 25, cor: "coral" }, { giro: -25, cor: "blue" }] },
  900008: { cor: "red", shots: [{}, { giro: 25, op: "Formato:15,5x22,2x15,5 cm (chanfrada, 500 g)", seed: 11 }, { giro: -25, seed: 23 }] },
  900009: { cor: "blue", shots: [{}, { giro: 25, seed: 11 }, { giro: -25, seed: 23 }] },
  900010: { cor: "magenta", shots: [{}, { giro: 25, op: "Formato:5x8 cm", seed: 11 }, { giro: -25, seed: 23 }] },
  900011: { cor: "blue", shots: [{}, { giro: 25, seed: 11 }, { giro: -25, seed: 23 }] },
  900012: { cor: "lime", shots: [{}, { giro: 25, seed: 11 }, { giro: -25, seed: 23 }] },
  900013: { cor: "coral", shots: [{}, { giro: 25, seed: 11 }, { giro: -25, seed: 23 }] },
};

const fonte = JSON.parse(readFileSync(resolve(root, "src/data/novos/fonte.json"), "utf8"));
const officialSlug = (value) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s/g, "-");

const jobs = [];
for (const grupo of fonte.grupos) {
  if (ONLY && !ONLY.includes(grupo.id)) continue;
  const plan = PLAN[grupo.id];
  if (!plan) {
    console.warn(`sem plano de fotos para o grupo ${grupo.id} (${grupo.nome})`);
    continue;
  }
  const row = fonte.produtos.find((p) => p.grupo === grupo.nome);
  const files = [grupo.imagem, row?.imagem_1, row?.imagem_2].filter((f) => f && f.startsWith("/"));
  plan.shots.forEach((shot, i) => {
    if (!files[i]) return;
    const query = new URLSearchParams({
      p: `${grupo.id}-${officialSlug(grupo.nome)}`,
      cor: shot.cor ?? plan.cor,
      modo: shot.modo ?? plan.modo ?? "pattern",
      seed: String(shot.seed ?? 7),
      giro: String(shot.giro ?? 0),
      ...(shot.op ? { op: shot.op } : {}),
    });
    jobs.push({ name: `${grupo.id} ${grupo.nome} #${i + 1}`, url: `${BASE}/design-system/fotos?${query}`, file: resolve(root, "public", files[i].slice(1)) });
  });
}
if (!jobs.length) {
  console.error("Nada para fotografar.");
  process.exit(1);
}

const port = 9900 + Math.floor(Math.random() * 90);
const profile = join(tmpdir(), `padrao-fotos-${port}`);
mkdirSync(profile, { recursive: true });
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--hide-scrollbars", "--window-size=1800,1200", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 80 && !wsUrl; i += 1) {
  try {
    wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl;
  } catch {}
  if (!wsUrl) await sleep(250);
}
if (!wsUrl) {
  console.error(`Não consegui abrir o Chrome em ${CHROME} (defina CHROME_PATH).`);
  chrome.kill();
  process.exit(1);
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
let errors = [];
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
// Escala 2: a foto sai de um canvas com o dobro de pixels e é reduzida para 600×600 (bordas suaves).
await send("Emulation.setDeviceMetricsOverride", { width: 1800, height: 1200, deviceScaleFactor: 2, mobile: false });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

let failed = 0;
for (const job of jobs) {
  errors = [];
  const started = Date.now();
  await send("Page.navigate", { url: job.url });
  let state = "aguardando";
  for (let i = 0; i < 240 && state === "aguardando"; i += 1) {
    await sleep(500);
    state = (await evaluate(`document.querySelector('[data-foto]')?.dataset.foto ?? 'aguardando'`)) ?? "aguardando";
  }
  const data = state === "pronta" ? await evaluate("window.__foto ?? null") : null;
  if (!data?.startsWith("data:image/webp;base64,")) {
    failed += 1;
    console.log(`✖ ${job.name}: ${state}${errors.length ? ` · ${errors[0]}` : ""}`);
    continue;
  }
  mkdirSync(dirname(job.file), { recursive: true });
  writeFileSync(job.file, Buffer.from(data.slice(data.indexOf(",") + 1), "base64"));
  console.log(`✔ ${job.name} → ${job.file.slice(root.length + 1)} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
}
ws.close();
chrome.kill();
await sleep(300);
try {
  rmSync(profile, { recursive: true, force: true });
} catch {}
process.exit(failed ? 1 : 0);
