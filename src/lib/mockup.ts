import type { Selection } from "./pricing";

export type MockupKind =
  | "card"
  | "sheet"
  | "sticker"
  | "panel"
  | "acrylic"
  | "neon"
  | "canvas"
  | "mat"
  | "banner"
  | "rollup"
  | "flag"
  | "cloth"
  | "mug"
  | "tumbler"
  | "bottle"
  | "tshirt"
  | "cap"
  | "cushion"
  | "book"
  | "tent"
  | "bag"
  | "box";

export type MockupShape = "rect" | "round" | "heart";

export type MockupSpec = {
  kind: MockupKind;
  widthCm: number;
  heightCm: number;
  depthCm: number;
  shape: MockupShape;
  finish: "matte" | "satin" | "gloss";
  clearcoat: number;
  back: "blank" | "same" | "gray";
  baseColor: string;
  innerColor: string;
  metal: "none" | "silver" | "gold" | "rose";
  sleeveless: boolean;
  grommets: boolean;
  flagStyle: "feather" | "rect";
  stack: number;
  label: string;
};

type Rule = { kind: MockupKind; test: RegExp };

const RULES: Rule[] = [
  { kind: "neon", test: /led neon/ },
  { kind: "rollup", test: /roll ?up/ },
  { kind: "flag", test: /wind banner|bandeira|wind ball/ },
  { kind: "tumbler", test: /copo|travel mug|chopp/ },
  { kind: "mug", test: /caneca|x[ií]cara/ },
  { kind: "bottle", test: /garrafa|squeeze/ },
  { kind: "cap", test: /bon[eé]\b/ },
  { kind: "tshirt", test: /camisa|regata|abad[aá]|colete|pijama|\bbody\b|bandana pet/ },
  { kind: "cushion", test: /almofada|fronha|cama pet|kit soneca|m[aá]scara de dormir/ },
  { kind: "tent", test: /calend[aá]rio de mesa|display de mesa de papel/ },
  { kind: "book", test: /photobook|agenda|caderno|planner|bloco/ },
  { kind: "bag", test: /bolsa|sacola|ecobag|mochila|necessaire|lancheira|cooler|estojo|porta passaporte/ },
  { kind: "box", test: /caixa|solapa|kit cinema|kit executivo/ },
  { kind: "banner", test: /banner|lona|faixa|backlight/ },
  { kind: "canvas", test: /canvas/ },
  { kind: "acrylic", test: /acr[ií]lico|chaveiro/ },
  { kind: "mat", test: /mouse ?pad|jogo americano|tapete|capacho|porta jarra|porta copo|sousplat|t[aá]bua/ },
  { kind: "cloth", test: /toalha|pano|len[cç]ol|cortina|canga|tecido|guardanapo|avental|bandana|meia|short|mai[oô]|capa de corte|capa p\/ cilindro/ },
  { kind: "sticker", test: /adesivo|r[oó]tulo|im[aã]|dtf|manta|etiqueta|pulseira/ },
  { kind: "panel", test: /\bps\b|pvc expandido|xps|polionda|quadro|placa|display|porteiro|wobbler|mosaico|cr[aá]ch[aá]|credencial|r[eé]gua|suporte p\/ celular|quebra cabe[cç]a/ },
  { kind: "card", test: /cart[aã]o de visita|cart[aã]o de pvc|\btag\b|marcador|calend[aá]rio de bolso/ },
  { kind: "sheet", test: /.*/ },
];

const DEFAULT_SIZE: Record<MockupKind, [number, number, number]> = {
  card: [9, 5, 0.04],
  sheet: [15, 21, 0.02],
  sticker: [10, 10, 0.02],
  panel: [40, 30, 0.5],
  acrylic: [30, 20, 0.3],
  neon: [60, 30, 0.5],
  canvas: [40, 30, 3],
  mat: [24, 20, 0.4],
  banner: [60, 90, 0.05],
  rollup: [80, 200, 0.05],
  flag: [70, 240, 0.05],
  cloth: [50, 70, 0.1],
  mug: [20, 9.5, 8],
  tumbler: [22, 15, 7],
  bottle: [20, 22, 7],
  tshirt: [21, 28, 0],
  cap: [14, 10, 0],
  cushion: [40, 40, 12],
  book: [20, 20, 2],
  tent: [20, 15, 8],
  bag: [35, 40, 10],
  box: [20, 15, 10],
};

function parseSize(text: string): [number, number] | null {
  const lower = text.toLowerCase();
  if (/\ba4\b/.test(lower)) return [21, 29.7];
  if (/\ba3\b/.test(lower)) return [29.7, 42];
  const match = /(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*(cm|m)?/.exec(lower);
  if (!match) return null;
  let a = Number(match[1].replace(",", "."));
  let b = Number(match[2].replace(",", "."));
  const unitMeters = match[3] === "m" || (!match[3] && /m\b/.test(lower.slice(match.index)) && a < 10 && b < 10);
  if (unitMeters) {
    a *= 100;
    b *= 100;
  }
  if (!a || !b) return null;
  return [a, b];
}

function pick(selection: Selection, options: Record<string, string[]>, pattern: RegExp): string | undefined {
  const key = Object.keys(options).find((k) => pattern.test(k));
  if (!key) return undefined;
  return selection[key] ?? options[key]?.[0];
}

const COLOR_WORDS: [RegExp, string][] = [
  [/preta|preto|black/, "#1c1c1e"],
  [/azul/, "#2a6fdb"],
  [/vermelh/, "#d7262b"],
  [/amarel/, "#f4c51f"],
  [/verde/, "#2f9e5b"],
  [/rosa|ros[eê]/, "#e8789f"],
  [/cinza/, "#9a9a9e"],
];

function colorFrom(text: string | undefined, fallback: string): string {
  if (!text) return fallback;
  const lower = text.toLowerCase();
  for (const [pattern, color] of COLOR_WORDS) if (pattern.test(lower)) return color;
  return fallback;
}

export function mockupSpec(
  product: { name: string; category: string; options: Record<string, string[]> },
  selection: Selection,
): MockupSpec {
  const name = product.name.toLowerCase();
  const kind = RULES.find((rule) => rule.test.test(name))?.kind ?? "sheet";
  const [dw, dh, dd] = DEFAULT_SIZE[kind];

  const sizeText =
    pick(selection, product.options, /^(\d+ - )?(formato|tamanho da arte|formato da arte)/i) ??
    pick(selection, product.options, /^(\d+ - )?tamanho$/i) ??
    product.name;
  const parsed = parseSize(sizeText) ?? parseSize(product.name);
  let [widthCm, heightCm] = parsed ?? [dw, dh];

  if (kind === "banner" && /faixa/.test(name) && heightCm > widthCm) [widthCm, heightCm] = [heightCm, widthCm];
  if ((kind === "mug" || kind === "tumbler" || kind === "bottle" || kind === "tshirt" || kind === "cap") && !parsed) {
    [widthCm, heightCm] = [dw, dh];
  }

  const allValues = Object.entries(product.options)
    .map(([k, values]) => selection[k] ?? values[0])
    .join(" ")
    .toLowerCase();

  let finish: MockupSpec["finish"] = "satin";
  if (/fosc/.test(allValues)) finish = "matte";
  if (/brilho|glossy|cromad/.test(allValues)) finish = "gloss";

  let clearcoat = 0;
  if (/verniz total|uv total/.test(allValues)) clearcoat = 1;
  else if (/verniz local|uv local/.test(allValues)) clearcoat = 0.55;
  if (finish === "gloss") clearcoat = Math.max(clearcoat, 0.7);

  const color = pick(selection, product.options, /^(\d+ - )?cor( da impress[aã]o)?$/i) ?? "";
  let back: MockupSpec["back"] = kind === "card" || kind === "sheet" ? "same" : "blank";
  if (/4\/0/.test(color)) back = "blank";
  if (/4\/1/.test(color)) back = "gray";
  if (/4\/4/.test(color)) back = "same";

  const shirtColor = pick(selection, product.options, /cor da camisa|cor$/i);
  let baseColor = "#ffffff";
  if (kind === "tshirt" || kind === "cap" || kind === "bag") baseColor = colorFrom(shirtColor ?? name, "#ffffff");
  if (kind === "mug" && /m[aá]gica|preta/.test(name)) baseColor = "#1c1c1e";
  if (kind === "mat") baseColor = "#2b2b2b";

  const innerMatch = /interior (?:colorido )?(\w+)/.exec(name);
  const innerColor = colorFrom(innerMatch?.[1], baseColor === "#1c1c1e" ? "#1c1c1e" : "#ffffff");

  let metal: MockupSpec["metal"] = "none";
  if (/dourad/.test(name)) metal = "gold";
  else if (/ros[eê]/.test(name) && /cromad/.test(name)) metal = "rose";
  else if (/cromad|prata|inox|alum[ií]nio/.test(name)) metal = "silver";

  const thickness = /(\d+(?:[.,]\d+)?)\s*mm/.exec(allValues);
  const depthCm = thickness ? Number(thickness[1].replace(",", ".")) / 10 : dd;

  let shape: MockupShape = "rect";
  if (/redond|bola/.test(name) || (kind === "mat" && /porta copo|sousplat/.test(name))) shape = "round";
  if (/cora[cç][aã]o/.test(name)) shape = "heart";
  if (shape !== "rect" && kind !== "cushion" && kind !== "sticker" && kind !== "mat") shape = "rect";
  if (shape === "round") heightCm = widthCm = Math.max(widthCm, heightCm);

  const stack = kind === "sheet" ? 3 : kind === "card" ? 2 : 1;
  const flagStyle: MockupSpec["flagStyle"] = /bandeira/.test(name) && !/wind/.test(name) ? "rect" : "feather";

  return {
    kind,
    widthCm,
    heightCm,
    depthCm,
    shape,
    finish,
    clearcoat,
    back,
    baseColor,
    innerColor,
    metal,
    sleeveless: /regata|abad[aá]|colete/.test(name),
    grommets: /ilh[oó]s|faixa/.test(name) || /ilh[oó]s/.test(allValues),
    flagStyle,
    stack,
    label: formatSize(widthCm, heightCm),
  };
}

export function formatSize(w: number, h: number): string {
  const fmt = (v: number) => (v >= 100 ? `${(v / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m` : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} cm`);
  return `${fmt(w)} × ${fmt(h)}`;
}

export function artAspect(spec: MockupSpec): number {
  switch (spec.kind) {
    case "mug":
      return 2.35;
    case "tumbler":
    case "bottle":
      return 2.2;
    case "tshirt":
      return 0.78;
    case "cap":
      return 1.6;
    default:
      return spec.widthCm / spec.heightCm;
  }
}

export const FLAT_KINDS: MockupKind[] = ["card", "sheet", "sticker", "panel", "acrylic", "neon", "canvas", "mat", "banner"];
