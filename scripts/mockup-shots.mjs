// Fotos de conferência dos modelos 3D: o mockup de um produto fotografado de vários ângulos (a mesma página das fotos de
// catálogo, /design-system/fotos), mais uma folha de contato com todos os ângulos lado a lado. É a conferência de todo
// modelo mexido: comparar a folha com as fotos do produto real antes de commitar.
//
// Uso (com o site no ar, `npm run dev`):
//   npm run shots -- --p=55                          produto pelo ID do catálogo (ou pelo slug)
//   npm run shots -- --p=55,45 --giros=0,35,-35,90,180
//   npm run shots -- --p=245 --op="Cor:4/4 (colorido frente e verso)"
//   npm run shots -- --p=55 --saida=C:/caminho/das/fotos --tam=700 --base=http://localhost:3100
//
// Grava <saida>/<slug>/<giro>.webp e <saida>/<slug>/folha.webp (padrão de <saida>: <tmp>/padrao-shots).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogPhoto, openChrome } from "./lib/chrome-cdp.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const BASE = flag("base") ?? "http://localhost:3100";
const TAM = Number(flag("tam") ?? 700) || 700;
const SAIDA = resolve(flag("saida") ?? join(tmpdir(), "padrao-shots"));
const GIROS = (flag("giros") ?? "0,35,-35,90,180").split(",").map(Number).filter(Number.isFinite);
const OP = flag("op");
const COR = flag("cor") ?? "coral";

const read = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
// Os produtos novos (API própria) entram também: as páginas de QA seguem mostrando os modelos deles.
const products = [...read("src/data/catalog.json").products, ...read("src/data/catalog-novos.json").products];
const wanted = (flag("p") ?? "").split(",").map((v) => v.trim()).filter(Boolean);
if (!wanted.length) {
  console.error('Diga o produto: npm run shots -- --p=55 (ID do catálogo ou slug; vários separados por vírgula).');
  process.exit(1);
}
const targets = [];
for (const key of wanted) {
  const product = products.find((p) => p.id === key || p.slug === key);
  if (!product) console.warn(`produto não encontrado: ${key}`);
  else targets.push(product);
}
if (!targets.length) process.exit(1);

let browser;
try {
  browser = await openChrome({ width: 1800, height: 1200, scale: 2 });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

/** Folha de contato desenhada na própria página: até 3 colunas, fundo cinza claro, o ângulo no canto de cada foto. */
async function contactSheet(shots, title) {
  const cell = TAM;
  return browser.evaluate(`(async () => {
    const shots = ${JSON.stringify(shots)};
    const cols = Math.min(3, shots.length), rows = Math.ceil(shots.length / cols), cell = ${cell}, head = 56;
    const canvas = document.createElement("canvas");
    canvas.width = cols * cell; canvas.height = rows * cell + head;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#e7e7e9"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111"; ctx.font = "bold 26px sans-serif"; ctx.fillText(${JSON.stringify(title)}, 16, 38);
    for (const [i, shot] of shots.entries()) {
      const img = new Image(); img.src = shot.data; await img.decode();
      const x = (i % cols) * cell, y = head + Math.floor(i / cols) * cell;
      ctx.strokeStyle = "#cfcfd3"; ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      const s = Math.min((cell - 24) / img.width, (cell - 24) / img.height);
      ctx.drawImage(img, x + (cell - img.width * s) / 2, y + (cell - img.height * s) / 2, img.width * s, img.height * s);
      ctx.fillStyle = "#111"; ctx.font = "bold 20px sans-serif"; ctx.fillText(shot.giro + "°", x + 12, y + 28);
    }
    return canvas.toDataURL("image/webp", 0.9);
  })()`);
}

const save = (file, dataUrl) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
};

let failed = 0;
for (const product of targets) {
  const shots = [];
  for (const giro of GIROS) {
    const query = new URLSearchParams({ p: product.slug, cor: COR, modo: "pattern", seed: "7", giro: String(giro), tam: String(TAM), ...(OP ? { op: OP } : {}) });
    const photo = await catalogPhoto(browser, `${BASE}/design-system/fotos?${query}`);
    if (!photo.ok) {
      failed += 1;
      console.log(`✖ ${product.slug} ${giro}°: ${photo.state}${browser.errors.length ? ` · ${browser.errors[0]}` : ""}`);
      continue;
    }
    save(join(SAIDA, product.slug, `${giro}.webp`), photo.data);
    shots.push({ giro, data: photo.data });
  }
  if (shots.length) {
    const sheet = await contactSheet(shots, `${product.name}${OP ? ` · ${OP}` : ""}`);
    if (sheet) {
      const file = join(SAIDA, product.slug, "folha.webp");
      save(file, sheet);
      console.log(`✔ ${product.slug}: ${shots.length} ângulos → ${file}`);
    }
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
