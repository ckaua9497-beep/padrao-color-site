// Lê os gabaritos de todos os produtos e grava as medidas reais em src/data/templates.json.
// Uso: npm run sync:templates [-- --refresh] [-- --only=269,466] [-- --debug=<pasta>]
//
// Fonte: o campo `template` de src/data/catalog.json (URL .zip/.rar/.pdf em img.padraocolor.com.br, o mesmo
// arquivo de padraocolor.com.br/gabaritos). Rode depois do sync:catalog. É só GET em arquivo público.
//
// Cada arquivo baixado fica em .cache/gabaritos/ (fora do git); --refresh baixa de novo. Dos pacotes, valem
// os PDFs (o .ai só quando a pasta não tem o PDF; os .cdr e .psd não são lidos). Cada página do PDF é lida
// num worker (o WASM do MuPDF não devolve memória entre arquivos grandes).
//
// Convenção de cores dos gabaritos da Padrão (folha "Orientações de Envio"):
//   ciano   = sangria (o fundo da arte vai até ela)        preto   = linha de corte
//   laranja = proteção das informações (área de segurança) verde   = linha de costura
//   magenta/vermelho = marcas (bolso, logo, zíper…)        cinza   = dobra/vinco
//
// Saída: src/data/templates.json
//   templates[key] = { url, files[], pages[] }; cada página = folha do gabarito com os painéis (sangria,
//   corte com forma e caminho SVG em mm, área de segurança, costura, marcas) e o rótulo vindo da pasta/arquivo.
//   products[id]   = { template, pages: ids das folhas que valem, byOption: opção → valor → folhas }
// A curadoria (src/data/template-curation.json) corrige rótulos, lados, tamanhos e casos que a cor não resolve.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const PT_MM = 25.4 / 72;
/** Mude quando o leitor de páginas (worker) mudar: invalida o cache de leitura. */
const READER_VERSION = 2;
const round1 = (v) => Math.round(v * 10) / 10;

// ===================================================================================== worker (MuPDF)

/** Cor do traço → papel na convenção da Padrão. CMYK direto; RGB vira CMYK ingênuo. */
function roleOf(colorspace, color) {
  let c;
  let m;
  let y;
  let k;
  const name = colorspace;
  if (/separation/i.test(name)) return /cut|corte|faca/i.test(name) ? "cut" : "other";
  if (color.length === 4) [c, m, y, k] = color;
  else if (color.length === 3) {
    const [r, g, b] = color;
    k = 1 - Math.max(r, g, b);
    const d = 1 - k || 1;
    c = (1 - r - k) / d;
    m = (1 - g - k) / d;
    y = (1 - b - k) / d;
  } else if (color.length === 1) {
    // Cinza (DeviceGray): 0 = preto.
    k = 1 - color[0];
    c = m = y = 0;
  } else return "other";
  const chroma = Math.max(c, m, y) - Math.min(c, m, y);
  if (k >= 0.7 || (c > 0.55 && m > 0.5 && y > 0.45 && k > 0.45)) return "cut";
  if (chroma < 0.15 && (k >= 0.15 || (c + m + y) / 3 >= 0.25)) return "fold";
  if (c >= 0.6 && m <= 0.3 && y <= 0.2 && k < 0.3) return "bleed";
  if (c >= 0.55 && y >= 0.55 && m <= 0.3) return "sew";
  if (c <= 0.15 && m >= 0.35 && m <= 0.8 && y >= 0.7 && k < 0.2) return "safe";
  if (m >= 0.75 && c <= 0.4 && k < 0.3) return y >= 0.6 ? "red" : "magenta";
  return "other";
}

async function runWorker() {
  const mupdf = await import("mupdf");
  const { file, debugDir, debugName } = workerData;
  const out = { pages: [], error: null };
  try {
    const doc = mupdf.Document.openDocument(readFileSync(file), "application/pdf");
    const count = doc.countPages();
    for (let i = 0; i < count; i += 1) {
      const page = doc.loadPage(i);
      const b = page.getBounds();
      const ox = b[0];
      const oy = b[1];
      const sheet = { w: round1((b[2] - b[0]) * PT_MM), h: round1((b[3] - b[1]) * PT_MM) };
      const strokes = [];
      const texts = [];
      const fills = [];
      let images = 0;
      let imageArea = 0;
      let layer = null;
      const toMM = (ctm, x, y) => [round1((x * ctm[0] + y * ctm[2] + ctm[4] - ox) * PT_MM), round1((x * ctm[1] + y * ctm[3] + ctm[5] - oy) * PT_MM)];
      // Caminho em mm: o `d` do SVG, os pontos de ancoragem, os pontos da curva (caixa exata: a Bézier passa
      // além das âncoras) e os trechos retos (as heurísticas de forma olham onde eles ficam).
      const pathData = (path, ctm) => {
        const parts = [];
        const pts = [];
        const ext = [];
        const lines = [];
        let sub = 0;
        let last = null;
        let start = null;
        path.walk({
          moveTo(x, y) {
            const p = toMM(ctm, x, y);
            pts.push(p);
            ext.push(p);
            parts.push(`M${p[0]} ${p[1]}`);
            sub += 1;
            last = p;
            start = p;
          },
          lineTo(x, y) {
            const p = toMM(ctm, x, y);
            pts.push(p);
            ext.push(p);
            parts.push(`L${p[0]} ${p[1]}`);
            if (last && lines.length < 64) lines.push([...last, ...p]);
            last = p;
          },
          curveTo(x1, y1, x2, y2, x3, y3) {
            const a = toMM(ctm, x1, y1);
            const c = toMM(ctm, x2, y2);
            const p = toMM(ctm, x3, y3);
            const p0 = last ?? p;
            for (let i = 1; i < 16; i += 1) {
              const t = i / 16;
              const u = 1 - t;
              const k0 = u * u * u;
              const k1 = 3 * u * u * t;
              const k2 = 3 * u * t * t;
              const k3 = t * t * t;
              ext.push([k0 * p0[0] + k1 * a[0] + k2 * c[0] + k3 * p[0], k0 * p0[1] + k1 * a[1] + k2 * c[1] + k3 * p[1]]);
            }
            pts.push(p);
            ext.push(p);
            parts.push(`C${a[0]} ${a[1]} ${c[0]} ${c[1]} ${p[0]} ${p[1]}`);
            curves += 1;
            last = p;
          },
          closePath() {
            parts.push("Z");
            closed += 1;
            if (last && start && (last[0] !== start[0] || last[1] !== start[1]) && lines.length < 64) lines.push([...last, ...start]);
            last = start;
          },
        });
        return { d: parts.join(""), pts, ext, lines, sub };
      };
      let curves = 0;
      let closed = 0;
      const device = new mupdf.Device({
        beginLayer(name) {
          layer = name;
        },
        endLayer() {
          layer = null;
        },
        strokePath(path, stroke, ctm, colorspace, color) {
          curves = 0;
          closed = 0;
          const { d, pts, ext, lines, sub } = pathData(path, ctm);
          if (pts.length < 2) return;
          const xs = ext.map((p) => p[0]);
          const ys = ext.map((p) => p[1]);
          const bbox = { x: round1(Math.min(...xs)), y: round1(Math.min(...ys)), w: round1(Math.max(...xs) - Math.min(...xs)), h: round1(Math.max(...ys) - Math.min(...ys)) };
          const role = roleOf(colorspace.getName(), color);
          strokes.push({
            role,
            color: color.map((v) => Math.round(v * 100) / 100),
            cs: colorspace.getName().replace(/^Device/, ""),
            lw: round1(stroke.getLineWidth() * Math.hypot(ctm[0], ctm[1]) * PT_MM * 10) / 10,
            dashed: Boolean(stroke.getDashes()?.length),
            layer,
            bbox,
            points: pts.length,
            curves,
            closed,
            sub,
            d,
            // Trechos retos e âncoras (só em formas pequenas): retângulo arredondado × recorte de roupa.
            lines: pts.length <= 40 ? lines.map((l) => l.map(round1)) : undefined,
            anchors: pts.length <= 40 ? pts : undefined,
          });
        },
        fillPath(path, evenOdd, ctm, colorspace, color) {
          // Só a caixa: textos convertidos em curva (rótulos "FRENTE", "TAMANHO M"…) e áreas cheias.
          const pts = [];
          path.walk({
            moveTo: (x, y) => pts.push(toMM(ctm, x, y)),
            lineTo: (x, y) => pts.push(toMM(ctm, x, y)),
            curveTo: (a, bb, c, d, x, y) => pts.push(toMM(ctm, x, y)),
          });
          if (!pts.length) return;
          const xs = pts.map((p) => p[0]);
          const ys = pts.map((p) => p[1]);
          fills.push({ color: color.map((v) => Math.round(v * 100) / 100), layer, bbox: { x: Math.min(...xs), y: Math.min(...ys), w: round1(Math.max(...xs) - Math.min(...xs)), h: round1(Math.max(...ys) - Math.min(...ys)) } });
        },
        fillText(text, ctm) {
          let s = "";
          let x0 = Infinity;
          let y0 = Infinity;
          text.walk({
            showGlyph(font, trm, glyph, unicode) {
              s += String.fromCodePoint(unicode > 0 ? unicode : 32);
              const p = toMM(ctm, trm[4], trm[5]);
              x0 = Math.min(x0, p[0]);
              y0 = Math.min(y0, p[1]);
            },
          });
          if (s.trim()) texts.push({ s: s.replace(/\s+/g, " ").trim(), x: round1(x0), y: round1(y0), layer });
        },
        fillImage(image, ctm) {
          images += 1;
          imageArea += Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]) * PT_MM * PT_MM;
        },
      });
      try {
        page.run(device, mupdf.Matrix.identity);
      } finally {
        try {
          device.close();
        } catch {}
        device.destroy();
      }

      let preview = null;
      if (debugDir) {
        const scale = Math.min(4, 1100 / Math.max(b[2] - b[0], b[3] - b[1]));
        const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
        preview = `${debugName}-p${i + 1}.png`;
        writeFileSync(join(debugDir, preview), pix.asPNG());
        pix.destroy();
      }
      page.destroy();
      out.pages.push({ index: i, sheet, strokes, fills: summarizeFills(fills), texts, images, imageCover: round1(imageArea / (sheet.w * sheet.h || 1)), preview });
    }
    doc.destroy();
  } catch (error) {
    out.error = String(error?.message ?? error);
  }
  parentPort.postMessage(out);
}

/** Preenchimentos agrupados por cor (as caixas dos rótulos em curva ficam juntas). */
function summarizeFills(fills) {
  const groups = new Map();
  for (const f of fills) {
    const key = f.color.join(",");
    const g = groups.get(key) ?? { color: f.color, count: 0, boxes: [] };
    g.count += 1;
    if (g.boxes.length < 400) g.boxes.push(f.bbox);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ color: g.color, count: g.count, bbox: unionBox(g.boxes) }));
}

function unionBox(boxes) {
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: round1(x0), y: round1(y0), w: round1(x1 - x0), h: round1(y1 - y0) };
}

// ===================================================================================== principal

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  const refresh = args.includes("--refresh");
  // --reextract[=chave,chave]: reabre os pacotes já baixados (sem baixar de novo), todos ou só esses.
  const reextractArg = args.find((a) => a === "--reextract" || a.startsWith("--reextract="));
  const reextract = reextractArg ? (reextractArg.includes("=") ? reextractArg.slice(12).split(",").filter(Boolean) : true) : false;
  const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",").filter(Boolean) ?? null;
  const debugArg = args.find((a) => a.startsWith("--debug="))?.slice(8) ?? null;
  const debugDir = debugArg ? resolve(debugArg) : null;
  if (debugDir) mkdirSync(debugDir, { recursive: true });

  const catalog = JSON.parse(readFileSync(resolve(root, "src/data/catalog.json"), "utf8"));
  const curationPath = resolve(root, "src/data/template-curation.json");
  const curation = existsSync(curationPath) ? JSON.parse(readFileSync(curationPath, "utf8")) : { templates: {}, products: {} };
  const cacheDir = resolve(root, ".cache/gabaritos");
  mkdirSync(cacheDir, { recursive: true });

  // Um gabarito pode servir a vários produtos (faixas de quantidade do mesmo item).
  const byUrl = new Map();
  for (const product of catalog.products) {
    if (!product.template) continue;
    const list = byUrl.get(product.template) ?? [];
    list.push(product);
    byUrl.set(product.template, list);
  }
  // Chave = nome do arquivo; dois arquivos com o mesmo nome limpo ganham sufixo (ordem do catálogo).
  const usedKeys = new Set();
  const entries = [...byUrl.entries()].map(([url, products]) => {
    let key = templateKey(url);
    for (let n = 2; usedKeys.has(key); n += 1) key = `${templateKey(url)}-${n}`;
    usedKeys.add(key);
    return { url, products: only ? products.filter((p) => only.includes(p.id)) : products, key };
  }).filter((entry) => entry.products.length);
  console.log(`gabaritos: ${entries.length} arquivos para ${entries.reduce((n, e) => n + e.products.length, 0)} produtos`);

  // 1) download (cache). Um arquivo que falha não derruba os outros: vira problema no relatório.
  const problems = [];
  const failed = new Map();
  await mapLimit(entries, 6, async (entry) => {
    entry.archive = join(cacheDir, `${entry.key}${extname(new URL(encodeURI(entry.url)).pathname).toLowerCase()}`);
    if (!refresh && existsSync(entry.archive) && statSync(entry.archive).size > 0) return;
    try {
      const res = await fetchRetry(encodeURI(entry.url));
      writeFileSync(entry.archive, Buffer.from(await res.arrayBuffer()));
      entry.fresh = true;
    } catch (error) {
      failed.set(entry.key, `download: ${error.message}`);
    }
  }, "download");

  // 2) extrai só PDF/AI (e .rar dentro do pacote) para .cache/gabaritos/<key>/
  const { unzipSync } = await import("fflate");
  const { createExtractorFromFile } = await import("node-unrar-js");
  const wanted = (name) => /\.(pdf|ai|rar|zip)$/i.test(name) && !/__macosx/i.test(name);
  async function expand(archive, dir) {
    mkdirSync(dir, { recursive: true });
    const ext = extname(archive).toLowerCase();
    if (ext === ".pdf") {
      writeFileSync(join(dir, basename(archive)), readFileSync(archive));
    } else if (ext === ".zip") {
      const files = unzipSync(readFileSync(archive), { filter: (f) => wanted(fixZipName(f.name)) || /\.cdr$/i.test(f.name) });
      for (const [raw, data] of Object.entries(files)) {
        const name = fixZipName(raw);
        if (name.endsWith("/")) continue;
        const target = join(dir, name);
        mkdirSync(dirname(target), { recursive: true });
        if (/\.cdr$/i.test(name)) {
          // CorelDRAW X4+: o pacote traz a prévia da página; só ela é guardada (medidas vêm da curadoria).
          try {
            const inner = unzipSync(data, { filter: (f) => /previews\/page\d*\.png$/i.test(f.name) });
            for (const [pn, png] of Object.entries(inner)) writeFileSync(`${target}.${basename(pn)}`, png);
          } catch {}
          writeFileSync(`${target}.cdr-only`, "");
          continue;
        }
        writeFileSync(target, data);
      }
    } else if (ext === ".rar") {
      const extractor = await createExtractorFromFile({ filepath: archive, targetPath: dir });
      const extracted = extractor.extract({ files: (h) => wanted(h.name.replace(/\\/g, "/")) });
      for (const _ of extracted.files) void _;
    }
    // .rar/.zip dentro do pacote (ex.: uma lona por medida): sempre reabertos junto com o pacote.
    for (const nested of walk(dir).filter((f) => /\.(rar|zip)$/i.test(f))) {
      const sub = nested.replace(/\.(rar|zip)$/i, "");
      rmSync(sub, { recursive: true, force: true });
      await expand(nested, sub);
    }
  }
  await mapLimit(entries, 3, async (entry) => {
    entry.dir = join(cacheDir, entry.key);
    if (failed.has(entry.key)) return;
    // Pasta pronta = tem o marcador ".ok" (uma extração interrompida não conta como feita).
    const again = entry.fresh || reextract === true || (Array.isArray(reextract) && reextract.includes(entry.key));
    if (!again && existsSync(join(entry.dir, ".ok"))) return;
    try {
      rmSync(entry.dir, { recursive: true, force: true });
      await expand(entry.archive, entry.dir);
      writeFileSync(join(entry.dir, ".ok"), "");
    } catch (error) {
      failed.set(entry.key, `extração: ${error.message}`);
    }
  }, "extração");
  for (const [key, why] of failed) problems.push(`${key}: ${why}`);

  // 3) lê as páginas (worker por arquivo)
  const docs = [];
  for (const entry of entries) {
    const all = walk(entry.dir);
    const pdfs = all.filter((f) => /\.pdf$/i.test(f));
    const stem = (f) => f.replace(/\.(pdf|ai)$/i, "").toLowerCase();
    const pdfStems = new Set(pdfs.map(stem));
    const ais = all.filter((f) => /\.ai$/i.test(f) && !pdfStems.has(stem(f)));
    entry.files = [...pdfs, ...ais]
      .filter((f) => !/orienta[cç][oõ]es|orientacoes|leia[- _]?me/i.test(basename(f)))
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    entry.cdrOnly = all.filter((f) => f.endsWith(".cdr-only")).map((f) => relative(entry.dir, f).replace(/\.cdr-only$/, "").replace(/\\/g, "/"));
    entry.instructions = [...pdfs, ...ais].filter((f) => /orienta/i.test(basename(f))).length > 0;
    for (const file of entry.files) docs.push({ entry, file });
  }
  // Leitura guardada por arquivo (tamanho + data + versão do leitor): rodar de novo só para aplicar a
  // curadoria leva segundos. --debug sempre relê (gera as prévias).
  const parsedDir = join(cacheDir, "_lido");
  mkdirSync(parsedDir, { recursive: true });
  await mapLimit(docs, 4, async (doc) => {
    const rel = relative(doc.entry.dir, doc.file).replace(/\\/g, "/");
    const debugName = `${doc.entry.key}--${rel.replace(/[^\w.-]+/g, "_")}`.slice(0, 150);
    // Chave pelo conteúdo: reabrir o pacote (arquivo novo no disco, mesmo conteúdo) não obriga a reler.
    const hash = createHash("sha1").update(readFileSync(doc.file)).digest("hex").slice(0, 16);
    const cached = join(parsedDir, `${slugId(doc.entry.key).slice(0, 60)}-${hash}-v${READER_VERSION}.json`);
    if (!debugDir && !refresh && existsSync(cached)) doc.result = JSON.parse(readFileSync(cached, "utf8"));
    else {
      doc.result = await inWorker({ file: doc.file, debugDir, debugName });
      if (!doc.result.error) writeFileSync(cached, JSON.stringify(doc.result));
    }
    doc.rel = rel;
  }, "páginas");

  // 4) monta folhas e painéis
  const templates = {};
  for (const entry of entries) {
    const pages = [];
    for (const doc of docs.filter((d) => d.entry === entry)) {
      if (doc.result.error) {
        problems.push(`${entry.key} ${doc.rel}: ${doc.result.error}`);
        continue;
      }
      for (const page of doc.result.pages) {
        const built = buildPage(doc.rel, page, doc.result.pages.length);
        if (built) pages.push(built);
      }
    }
    // Ids estáveis e únicos dentro do gabarito.
    const seen = new Map();
    for (const page of pages) {
      const n = (seen.get(page.id) ?? 0) + 1;
      seen.set(page.id, n);
      if (n > 1) page.id = `${page.id}-${n}`;
    }
    const cur = curation.templates?.[entry.key];
    // Folhas manuais primeiro: a curadoria das folhas (faces, rótulos) vale para elas também.
    for (const extra of cur?.addPages ?? []) pages.push(manualPage(extra));
    applyTemplateCuration(pages, cur);
    templates[entry.key] = {
      url: entry.url,
      files: entry.files.map((f) => relative(entry.dir, f).replace(/\\/g, "/")),
      cdrOnly: entry.cdrOnly.length ? entry.cdrOnly : undefined,
      note: cur?.note,
      parametric: cur?.parametric ?? undefined,
      editor: cur?.editor ?? undefined,
      pages: pages.filter((p) => !p.ignore),
    };
    if (!templates[entry.key].pages.length && !cur?.parametric) problems.push(`${entry.key}: nenhuma folha com linhas de sangria/corte (${entry.url})`);
  }

  // 5) produto → folhas (opções com medida, nome do produto, curadoria)
  const products = {};
  for (const entry of entries) {
    for (const product of entry.products) {
      products[product.id] = mapProduct(product, entry.key, templates[entry.key], curation.products?.[product.id]);
    }
  }

  const output = { generatedAt: new Date().toISOString(), source: "catalog.json → campo template (img.padraocolor.com.br/padraocolor/imagens/gabaritos)", templates, products };
  const outPath = resolve(root, "src/data/templates.json");
  if (only && existsSync(outPath)) {
    // Execução parcial: atualiza só os gabaritos pedidos.
    const prev = JSON.parse(readFileSync(outPath, "utf8"));
    Object.assign(prev.templates, templates);
    Object.assign(prev.products, products);
    prev.generatedAt = output.generatedAt;
    writeFileSync(outPath, `${JSON.stringify(prev, null, 1)}\n`);
  } else writeFileSync(outPath, `${JSON.stringify(output, null, 1)}\n`);
  if (debugDir) {
    const raw = docs.map((d) => ({ key: d.entry.key, file: d.rel, products: d.entry.products.map((p) => `${p.id} ${p.name}`), result: d.result }));
    writeFileSync(join(debugDir, "raw.json"), JSON.stringify(raw));
  }

  const pageCount = Object.values(templates).reduce((n, t) => n + t.pages.length, 0);
  const unmatched = Object.entries(products).filter(([, p]) => p.unmatched?.length);
  console.log(`folhas: ${pageCount} · produtos: ${Object.keys(products).length} · com opção sem folha: ${unmatched.length}`);
  for (const p of problems) console.warn(`  ! ${p}`);
  console.log(`src/data/templates.json gravado`);
}

// ===================================================================================== folhas e painéis

const contains = (outer, inner, slack = 1) =>
  inner.x >= outer.x - slack && inner.y >= outer.y - slack && inner.x + inner.w <= outer.x + outer.w + slack && inner.y + inner.h <= outer.y + outer.h + slack;
const area = (b) => b.w * b.h;
const center = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const inside = (b, p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

/** Forma do corte: retângulo, retângulo de cantos redondos, elipse/círculo ou recorte livre. */
function shapeOf(stroke) {
  if (!stroke) return "rect";
  const { points, curves, sub, bbox } = stroke;
  const straight = points - curves - sub;
  if (sub !== 1) return "custom";
  const tol = Math.max(0.4, Math.min(bbox.w, bbox.h) * 0.01);
  const near = (v, a) => Math.abs(v - a) <= tol;
  const onEdge = ([x, y]) => near(x, bbox.x) || near(x, bbox.x + bbox.w) || near(y, bbox.y) || near(y, bbox.y + bbox.h);
  // Trechos retos sobre as bordas da caixa, na horizontal ou na vertical (retângulo e cantos redondos).
  const boxy = (stroke.lines ?? []).every(([x1, y1, x2, y2]) => (near(y1, y2) && (near(y1, bbox.y) || near(y1, bbox.y + bbox.h))) || (near(x1, x2) && (near(x1, bbox.x) || near(x1, bbox.x + bbox.w))) || Math.hypot(x2 - x1, y2 - y1) < tol * 2);
  if (curves === 0 && points <= 6) return boxy ? "rect" : "custom";
  // Elipse/círculo em Bézier: só curvas (4 a 8), âncoras sobre as bordas da caixa.
  if (curves >= 4 && curves <= 8 && straight <= 1 && (stroke.anchors ?? []).every(onEdge)) return "ellipse";
  // Cantos arredondados: 4 curvas (às vezes 8) alternando com 4 retas, todas sobre as bordas.
  if ((curves === 4 || curves === 8) && straight >= 3 && straight <= 5 && boxy && stroke.lines && (stroke.anchors ?? []).every(onEdge)) return "rounded";
  return "custom";
}

function buildPage(rel, page, pageCount) {
  const strokes = page.strokes.filter((s) => s.bbox.w + s.bbox.h > 2);
  const lines = (role) => strokes.filter((s) => s.role === role);
  const bleeds = lines("bleed").filter((s) => s.bbox.w > 5 && s.bbox.h > 5).sort((a, b) => area(b.bbox) - area(a.bbox));
  const cuts = lines("cut").filter((s) => s.bbox.w > 3 && s.bbox.h > 3);
  const safes = lines("safe").filter((s) => s.bbox.w > 2 && s.bbox.h > 2);
  if (!bleeds.length && !cuts.length) return null; // página de instruções ou de exemplo

  // Painéis: cada sangria externa; sem sangria, cada corte externo (a folha toda faz de sangria).
  const outer = (list) => list.filter((s, i) => !list.some((o, j) => j !== i && area(o.bbox) > area(s.bbox) && contains(o.bbox, s.bbox, 0.5)));
  let frames = outer(bleeds).map((s) => ({ bleed: s.bbox, bleedStroke: s }));
  const outerCuts = outer(cuts.slice().sort((a, b) => area(b.bbox) - area(a.bbox)));
  if (!frames.length) {
    frames = outerCuts.length === 1 ? [{ bleed: { x: 0, y: 0, w: page.sheet.w, h: page.sheet.h }, bleedStroke: null, implicit: true }] : outerCuts.map((s) => ({ bleed: s.bbox, bleedStroke: null, implicit: true }));
  } else {
    // Peças só com corte, fora de qualquer sangria (alças, tiras): viram painéis sem sangria. Quadradinhos
    // de até 3 cm (marcas de canto) e traços abertos ficam de fora.
    for (const c of outerCuts) {
      if (frames.some((f) => inside(f.bleed, center(c.bbox)))) continue;
      if (!c.closed || Math.min(c.bbox.w, c.bbox.h) < 8 || area(c.bbox) < 400) continue;
      if (c.bbox.w <= 40 && c.bbox.h <= 40 && Math.abs(c.bbox.w - c.bbox.h) < 2) continue;
      // Marcas de canto e de registro saem da folha; peça de verdade fica dentro dela.
      if (!contains({ x: 0, y: 0, w: page.sheet.w, h: page.sheet.h }, c.bbox, 2)) continue;
      frames.push({ bleed: c.bbox, bleedStroke: null, implicit: true });
    }
  }
  // Cada traço vai para um painel só: o menor cuja sangria contém o centro dele (caixas de peças recortadas se sobrepõem).
  const owner = (s) => frames.filter((f) => inside(f.bleed, center(s.bbox)) && contains(f.bleed, s.bbox, 3)).sort((a, b) => area(a.bleed) - area(b.bleed))[0];
  const pick = (list, frame) => list.filter((s) => owner(s) === frame);
  const panels = frames
    .map((frame) => {
      const safeLines = pick(safes, frame);
      // Furos (fenda do crachá, argola do chaveiro, furo do calendário): corte pequeno dentro de outro corte
      // ou da área de segurança. Viram marca; sem outro corte, a peça é o próprio quadro (sangria = corte).
      const allCuts = pick(cuts, frame).sort((a, b) => area(b.bbox) - area(a.bbox));
      const safeUnion = unionBox(safeLines.map((s) => s.bbox));
      const isHole = (s, i) =>
        area(s.bbox) < area(frame.bleed) * 0.2 && ((i > 0 && allCuts.slice(0, i).some((o) => contains(o.bbox, s.bbox, 0.5))) || (safeUnion && contains(safeUnion, s.bbox, 1)));
      const holes = allCuts.filter(isHole);
      const cutLines = allCuts.filter((s, i) => !isHole(s, i));
      const sewLines = pick(lines("sew"), frame);
      const marks = [...holes.map((s) => ({ role: "hole", s })), ...["magenta", "red", "fold", "other"].flatMap((role) => pick(lines(role), frame).map((s) => ({ role, s })))];
      const cutBox = unionBox(cutLines.map((s) => s.bbox));
      const mainCut = cutLines.slice().sort((a, b) => area(b.bbox) - area(a.bbox))[0];
      const safeBox = unionBox(safeLines.map((s) => s.bbox));
      const mainSafe = safeLines.slice().sort((a, b) => area(b.bbox) - area(a.bbox))[0];
      const cut = cutBox ?? frame.bleed;
      // Área de segurança em partes (uma por face, separadas por dobras): cada traço externo ou subcaminho.
      const safeParts = safeLines.length ? outer(safeLines.flatMap((s) => (s.sub > 1 ? subpathBoxes(s.d).map((bbox) => ({ bbox })) : [{ bbox: s.bbox }])).filter((s) => s.bbox.w > 2 && s.bbox.h > 2)).map((s) => s.bbox) : [];
      const panel = {
        bleed: frame.bleed,
        implicitBleed: frame.implicit || undefined,
        cut: { ...cut, shape: cutLines.length > 1 ? (cutLines.every((s) => shapeOf(s) === "rect") ? "rect" : "custom") : shapeOf(mainCut), d: cutLines.length && (shapeOf(mainCut) !== "rect" || cutLines.length > 1) ? cutLines.map((s) => s.d).join("") : undefined },
        safe: safeBox ? { ...safeBox, shape: shapeOf(mainSafe), d: safeLines.length > 1 || shapeOf(mainSafe) !== "rect" ? safeLines.map((s) => s.d).join("") : undefined, parts: safeParts.length > 1 ? safeParts.sort((a, b) => a.y - b.y || a.x - b.x) : undefined } : null,
        sew: sewLines.length ? sewLines.map((s) => s.d).join("") : undefined,
        marks: marks.length ? marks.slice(0, 40).map(({ role, s }) => ({ role, bbox: s.bbox, d: s.d.length < 4000 ? s.d : undefined, dashed: s.dashed || undefined })) : undefined,
      };
      const faces = facesOf(panel, strokes);
      return faces ? { ...panel, faces } : panel;
    })
    .sort((a, b) => (Math.abs(a.bleed.y - b.bleed.y) > 20 ? a.bleed.y - b.bleed.y : a.bleed.x - b.bleed.x));

  const folder = rel.split("/").slice(0, -1);
  const fileLabel = cleanLabel(basename(rel).replace(/\.(pdf|ai)$/i, ""));
  const labelParts = [...folder.map(cleanLabel).filter((f) => f && !/^gabarito$/i.test(f)), fileLabel];
  const label = [...new Set(labelParts)].join(" · ");
  const dims = parseDims(label);
  const id = slugId(`${folder.join("-")}-${fileLabel}${pageCount > 1 ? `-p${page.index + 1}` : ""}`);
  return {
    id,
    file: rel,
    page: page.index + 1,
    label,
    nameDims: dims ?? undefined,
    sheet: page.sheet,
    texts: page.texts.length ? page.texts.map((t) => t.s).slice(0, 12) : undefined,
    panels: panels.map((p) => ({ ...p, metrics: metricsOf(p) })),
  };
}

/** Interseção de duas caixas (null quando não se tocam): a segurança de uma face é o pedaço dela. */
function intersectBox(a, b) {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 - x0 > 1 && y1 - y0 > 1 ? { x: round1(x0), y: round1(y0), w: round1(x1 - x0), h: round1(y1 - y0) } : null;
}

/** Caixas de cada subcaminho de um `d` (M…Z), contando os pontos de controle. */
function subpathBoxes(d) {
  return d
    .split(/(?=M)/)
    .map((part) => part.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [])
    .filter((nums) => nums.length >= 4)
    .map((nums) => {
      const xs = nums.filter((_, i) => i % 2 === 0);
      const ys = nums.filter((_, i) => i % 2 === 1);
      return { x: round1(Math.min(...xs)), y: round1(Math.min(...ys)), w: round1(Math.max(...xs) - Math.min(...xs)), h: round1(Math.max(...ys) - Math.min(...ys)) };
    });
}

/**
 * Faces de uma peça contínua: linhas retas de dobra (magenta "dobra do tecido", cinza de vinco) ou divisórias
 * pretas que atravessam a peça de ponta a ponta. Almofada e bolsa trazem frente e verso no mesmo tecido;
 * folder e cardápio, as dobras. A curadoria diz o lado e o giro de cada face.
 */
function facesOf(panel, strokes) {
  const { cut, bleed } = panel;
  const straight = strokes.filter((s) => ["magenta", "fold", "cut", "red", "other"].includes(s.role) && s.curves === 0 && s.points <= 3 && (s.bbox.w < 1 || s.bbox.h < 1));
  const xs = [];
  const ys = [];
  const within = (v, a, b) => v >= a - 3 && v <= b + 3;
  for (const l of straight) {
    const b = l.bbox;
    if (b.h < 1 && b.w >= cut.w * 0.85 && within(b.x, bleed.x, bleed.x + bleed.w) && within(b.x + b.w, bleed.x, bleed.x + bleed.w)) {
      const y = b.y + b.h / 2;
      if (y > cut.y + 5 && y < cut.y + cut.h - 5) ys.push(y);
    }
    if (b.w < 1 && b.h >= cut.h * 0.85 && within(b.y, bleed.y, bleed.y + bleed.h) && within(b.y + b.h, bleed.y, bleed.y + bleed.h)) {
      const x = b.x + b.w / 2;
      if (x > cut.x + 5 && x < cut.x + cut.w - 5) xs.push(x);
    }
  }
  const uniq = (list) => list.sort((a, b) => a - b).filter((v, i, arr) => i === 0 || v - arr[i - 1] > 1.5);
  const cx = [cut.x, ...uniq(xs), cut.x + cut.w];
  const cy = [cut.y, ...uniq(ys), cut.y + cut.h];
  const count = (cx.length - 1) * (cy.length - 1);
  if (count < 2 || count > 9) return undefined;
  const parts = panel.safe?.parts ?? (panel.safe ? [panel.safe] : []);
  const faces = [];
  for (let j = 0; j + 1 < cy.length; j += 1) {
    for (let i = 0; i + 1 < cx.length; i += 1) {
      const box = { x: round1(cx[i]), y: round1(cy[j]), w: round1(cx[i + 1] - cx[i]), h: round1(cy[j + 1] - cy[j]) };
      const mine = parts.map((p) => intersectBox(p, box)).filter(Boolean);
      faces.push({ box, safe: mine.length ? unionBox(mine) : null });
    }
  }
  return faces;
}

/** Medidas que o cliente entende: tamanho final, sangria e margem de segurança (mm). */
function metricsOf(panel) {
  const { bleed, cut, safe } = panel;
  const m = (a, b) => round1(Math.max(0, a - b));
  return {
    finalMm: { w: cut.w, h: cut.h },
    bleedMm: { top: m(cut.y, bleed.y), right: m(bleed.x + bleed.w, cut.x + cut.w), bottom: m(bleed.y + bleed.h, cut.y + cut.h), left: m(cut.x, bleed.x) },
    safeMm: safe ? { top: m(safe.y, cut.y), right: m(cut.x + cut.w, safe.x + safe.w), bottom: m(cut.y + cut.h, safe.y + safe.h), left: m(safe.x, cut.x) } : null,
  };
}

function cleanLabel(s) {
  return s
    .replace(/_/g, " ")
    .replace(/c[oó]pia de seguran[cç]a de/gi, "")
    .replace(/^\s*-?\s*gabarito\s*[-:]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugId(s) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/gabarito/g, "")
    .replace(/[^a-z0-9,]+/g, "-")
    .replace(/,/g, "_")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/** "21x29,7cm", "100x0,30cm" (sic), "0,20x0,30m", "57x100cm" → {w,h} em mm. */
export function parseDims(text) {
  const m = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×]\s*(\d+(?:[.,]\d+)?))?\s*(mm|cm|m)?\b/i.exec(text);
  if (!m) return null;
  const n = (v) => Number(v.replace(",", "."));
  const unit = (m[4] ?? "cm").toLowerCase();
  const f = unit === "mm" ? 1 : unit === "m" ? 1000 : 10;
  return { w: round1(n(m[1]) * f), h: round1(n(m[2]) * f), d: m[3] ? round1(n(m[3]) * f) : undefined };
}

function manualPage(p) {
  const bleed = p.bleedMm ?? 0;
  const W = p.finalMm.w + 2 * bleed;
  const H = p.finalMm.h + 2 * bleed;
  const safe = p.safeMm ?? null;
  const panel = {
    bleed: { x: 0, y: 0, w: W, h: H },
    cut: { x: bleed, y: bleed, w: p.finalMm.w, h: p.finalMm.h, shape: "rect" },
    safe: safe == null ? null : { x: bleed + safe, y: bleed + safe, w: p.finalMm.w - 2 * safe, h: p.finalMm.h - 2 * safe, shape: "rect" },
  };
  return { id: p.id, file: p.file ?? null, page: 1, label: p.label, manual: true, sheet: { w: W, h: H }, panels: [{ ...panel, metrics: metricsOf(panel) }], side: p.side, size: p.size, part: p.part };
}

function applyTemplateCuration(pages, cur) {
  if (!cur?.pages) return;
  for (const fix of cur.pages) {
    const page = pages.find((p) => p.id === fix.id);
    if (!page) {
      console.warn(`  ! curadoria: a folha ${fix.id} não existe mais`);
      continue;
    }
    for (const key of ["label", "side", "size", "part", "ignore", "match", "note", "span"]) if (fix[key] !== undefined) page[key] = fix[key];
    if (fix.panels) {
      // Painel pela posição (`at` = centro do corte, em mm): continua certo se o extrator achar uma peça nova.
      const used = new Set();
      fix.panels.forEach((pf, i) => {
        if (!pf) return;
        let panel = page.panels[i];
        if (pf.at) {
          const [x, y] = pf.at;
          const dist = (p) => Math.hypot(p.cut.x + p.cut.w / 2 - x, p.cut.y + p.cut.h / 2 - y);
          const best = page.panels.filter((p) => !used.has(p)).sort((a, b) => dist(a) - dist(b))[0];
          panel = best && dist(best) <= Math.max(15, Math.min(best.cut.w, best.cut.h) * 0.25) ? best : undefined;
          // Mesma quantidade de peças: a ordem vale (o corte mudou de lugar, por exemplo um furo que deixou de ser corte).
          if (!panel && page.panels.length === fix.panels.length && !used.has(page.panels[i])) panel = page.panels[i];
        }
        if (!panel && pf.at) console.warn(`  ! curadoria: ${page.id} sem painel perto de ${pf.at.join(",")}`);
        if (!panel) return;
        used.add(panel);
        for (const key of ["name", "side", "ignore"]) if (pf[key] !== undefined) panel[key] = pf[key];
        // Faces desenhadas à mão (dobra que não atravessa a peça, costura que separa frente e verso): caixa em mm.
        if (pf.setFaces?.length) {
          const parts = panel.safe?.parts ?? (panel.safe ? [panel.safe] : []);
          panel.faces = pf.setFaces.map((f) => {
            const box = { x: f.box[0], y: f.box[1], w: f.box[2], h: f.box[3] };
            const mine = f.safe ? [{ x: f.safe[0], y: f.safe[1], w: f.safe[2], h: f.safe[3] }] : parts.map((p) => intersectBox(p, box)).filter(Boolean);
            return { box, safe: mine.length ? unionBox(mine) : null, name: f.name, side: f.side, rotate: f.rotate };
          });
        }
        // Faces da peça contínua (mesma ordem do extrator: de cima para baixo, da esquerda para a direita).
        else if (pf.faces && panel.faces) {
          pf.faces.forEach((ff, j) => {
            const face = panel.faces[j];
            if (!face || !ff) return;
            for (const key of ["name", "side", "rotate", "ignore"]) if (ff[key] !== undefined) face[key] = ff[key];
          });
        }
        if (pf.noFaces) delete panel.faces;
      });
      page.panels = page.panels.filter((p) => !p.ignore);
    }
  }
}

// ===================================================================================== produto → folhas

const DIM_KEYS = /tamanho|formato|medida|dimens|modelo|tipo/i;

function mapProduct(product, key, template, cur) {
  const all = template?.pages ?? [];
  const result = { template: key, pages: all.map((p) => p.id) };
  if (cur?.pages) result.pages = cur.pages.filter((id) => all.some((p) => p.id === id));
  const pages = all.filter((p) => result.pages.includes(p.id));
  // Grade de tamanhos (camisas): a curadoria marca o tamanho de cada folha.
  if (cur?.bySize) result.bySize = cur.bySize;
  else if (product.sizes?.length && pages.some((p) => p.size)) {
    const bySize = {};
    for (const size of product.sizes) {
      const hit = pages.filter((p) => p.size && sameSizeLabel(p.size, size)).map((p) => p.id);
      if (hit.length) bySize[size] = hit;
    }
    if (Object.keys(bySize).length) result.bySize = bySize;
    const missing = product.sizes.filter((size) => !bySize[size]);
    if (missing.length) result.unmatched = missing.map((m) => `tamanho ${m}`);
  }
  if (cur?.byOption) {
    result.byOption = cur.byOption;
    return result;
  }
  if (pages.length <= 1) return result;

  // Opções com medida: liga cada valor às folhas cujo corte (ou a medida do nome) bate.
  const tolerance = (a) => Math.max(2, a * 0.02);
  const close = (a, b) => Math.abs(a - b) <= tolerance(Math.max(a, b));
  const fits = (dims, page) => {
    const sizes = [page.nameDims, ...page.panels.map((p) => p.metrics.finalMm)].filter(Boolean);
    return sizes.some((s) => (close(s.w, dims.w) && close(s.h, dims.h)) || (close(s.w, dims.h) && close(s.h, dims.w)));
  };
  const byOption = {};
  const unmatched = [];
  for (const [optionKey, values] of Object.entries(product.options ?? {})) {
    if (!DIM_KEYS.test(optionKey)) continue;
    const map = {};
    for (const value of values) {
      const dims = parseDims(value);
      if (!dims) continue;
      const hit = pages.filter((p) => fits(dims, p)).map((p) => p.id);
      // Sem folha para a medida = lista vazia (a página fica sem gabarito, em vez de usar a folha de outra medida).
      map[value] = hit;
      if (!hit.length) unmatched.push(`${optionKey}: ${value}`);
    }
    if (Object.keys(map).length) byOption[optionKey] = map;
  }
  if (Object.keys(byOption).length) result.byOption = byOption;
  else {
    // Sem opção de medida: o nome do produto escolhe a folha ("Almofada Quadrada 40x40cm").
    const dims = parseDims(product.name);
    const hit = dims ? pages.filter((p) => fits(dims, p)).map((p) => p.id) : [];
    if (hit.length) result.pages = hit;
  }
  if (unmatched.length) result.unmatched = [...(result.unmatched ?? []), ...unmatched];
  return result;
}

// ===================================================================================== utilitários

/** "Tam: P" = "P"; "6 Anos" = "6 anos"; "P (30-34)" = "P". */
function sameSizeLabel(a, b) {
  const n = (s) =>
    String(s)
      .toLowerCase()
      .replace(/^tam(anho)?\s*:?\s*/, "")
      .replace(/\s*\(.*\)\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
  return n(a) === n(b);
}

function templateKey(url) {
  const name = decodeURI(new URL(encodeURI(url)).pathname.split("/").pop() ?? url);
  return slugId(name.replace(/\.(zip|rar|pdf)$/i, "").replace(/^gabarito[_ -]*/i, "")) || "gabarito";
}

/** Página de código 850 (Windows em português), bytes 0x80–0xFF. */
const CP850 =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´\u00ad±‗¾¶§÷¸°¨·¹³²■\u00a0";

/**
 * Nome de arquivo do ZIP. O fflate entrega o nome certo quando o ZIP marca UTF-8 e, sem a marca, lê os bytes
 * como Latin-1. Bytes que formam UTF-8 válido = UTF-8 sem a marca. Senão, só quando aparecem letras que um
 * nome em português não teria (Æ, ß, Ý, espaço rígido, controles C1) o nome é CP850 (ZIP feito no Windows):
 * "ImÆ de Geladeira" → "Imã de Geladeira"; "Cabeça", já certo, fica como está.
 */
const CP850_HINT = /[\u0080-\u009f\u00a0-\u00a6\u00b5-\u00b7\u00c6\u00d0\u00d2\u00d6\u00dd-\u00df\u00e4\u00e5\u00f0\u00f8\u00fe\u00ff]/;
function fixZipName(name) {
  if (!/[\u0080-\u00ff]/.test(name) || /[^\u0000-\u00ff]/.test(name)) return name;
  const bytes = Uint8Array.from([...name].map((ch) => ch.charCodeAt(0)));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    if (!CP850_HINT.test(name)) return name;
    return [...name].map((ch) => (ch.charCodeAt(0) >= 0x80 ? CP850[ch.charCodeAt(0) - 0x80] : ch)).join("");
  }
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

async function fetchRetry(url, retries = 3) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
      if (!res.ok) throw new Error(`${res.status}`);
      return res;
    } catch (error) {
      if (attempt >= retries) throw new Error(`${url}: ${error.message}`);
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

async function mapLimit(items, limit, fn, label) {
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
        done += 1;
        if (done % 10 === 0 || done === items.length) process.stdout.write(`\r  ${label}: ${done}/${items.length}   `);
      }
    }),
  );
  process.stdout.write("\n");
}

function inWorker(data) {
  return new Promise((resolvePromise) => {
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: data, resourceLimits: { maxOldGenerationSizeMb: 2048 } });
    let settled = false;
    worker.once("message", (msg) => {
      settled = true;
      resolvePromise(msg);
      worker.terminate();
    });
    worker.once("error", (error) => {
      if (!settled) resolvePromise({ pages: [], error: String(error?.message ?? error) });
    });
    worker.once("exit", (code) => {
      if (!settled) resolvePromise({ pages: [], error: `worker saiu com ${code}` });
    });
  });
}

// Fim do módulo: as constantes acima já existem quando main/worker rodam.
if (!isMainThread) await runWorker();
else await main();
