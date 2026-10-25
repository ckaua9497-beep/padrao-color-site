// Fotos de catálogo dos produtos novos (API própria, src/data/novos/fonte.json): o mockup 3D de cada produto com a
// estampa da marca, fotografado com fundo transparente em WebP quadrado de 1200 px (o dobro das fotos de 600 px do site
// oficial: nítido na página do produto em telas de alta densidade).
//
// Uso (com o site no ar, `npm run dev`):
//   npm run fotos:novos                       todas as fotos
//   npm run fotos:novos -- --only=900006      só um grupo
//   npm run fotos:novos -- --base=http://localhost:3100
//   npm run fotos:novos -- --tam=600              outro tamanho (lado, em px)
//
// Precisa do Google Chrome (CHROME_PATH para outro caminho). Cada foto abre /design-system/fotos?… num Chrome sem
// janela, espera o 3D e grava o arquivo que o grupo/variação cita em `imagem`, `imagem_1` e `imagem_2`.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogPhoto, openChrome } from "./lib/chrome-cdp.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const BASE = flag("base") ?? "http://localhost:3100";
const ONLY = flag("only")?.split(",").map(Number);
const TAM = Number(flag("tam") ?? 1200) || 1200;

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
      tam: String(TAM),
      ...(shot.op ? { op: shot.op } : {}),
    });
    jobs.push({ name: `${grupo.id} ${grupo.nome} #${i + 1}`, url: `${BASE}/design-system/fotos?${query}`, file: resolve(root, "public", files[i].slice(1)) });
  });
}
if (!jobs.length) {
  console.error("Nada para fotografar.");
  process.exit(1);
}

// Escala 3: o canvas do 3D (900 px de largura na página) sai com 2700 px e a foto é reduzida para TAM × TAM (bordas
// suaves; sobra resolução mesmo depois do recorte em volta do produto).
let browser;
try {
  browser = await openChrome({ width: 1800, height: 1200, scale: 3 });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

let failed = 0;
for (const job of jobs) {
  const started = Date.now();
  const photo = await catalogPhoto(browser, job.url);
  if (!photo.ok) {
    failed += 1;
    console.log(`✖ ${job.name}: ${photo.state}${browser.errors.length ? ` · ${browser.errors[0]}` : ""}`);
    continue;
  }
  mkdirSync(dirname(job.file), { recursive: true });
  writeFileSync(job.file, Buffer.from(photo.data.slice(photo.data.indexOf(",") + 1), "base64"));
  console.log(`✔ ${job.name} → ${job.file.slice(root.length + 1)} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
}
await browser.close();
process.exit(failed ? 1 : 0);
