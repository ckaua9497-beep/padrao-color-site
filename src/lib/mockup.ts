import type { Selection } from "./pricing";
import { KIND_INFO, type MockupKind } from "./mockup-kinds.ts";
import { MOCKUP_OVERRIDES } from "./mockup-overrides.ts";

export type { MockupKind } from "./mockup-kinds.ts";

export type MockupShape = "rect" | "round" | "heart";
export type FlagStyle = "pena" | "faca" | "gota" | "vela" | "rect";

/** De onde veio o tipo: override por slug, regra de nome, padrão da categoria ou nada (fallback). */
export type KindSource = "override" | "name" | "category" | "fallback";

export type MockupSpec = {
  kind: MockupKind;
  source: KindSource;
  printable: boolean;
  widthCm: number;
  heightCm: number;
  depthCm: number;
  shape: MockupShape;
  finish: "matte" | "satin" | "gloss";
  clearcoat: number;
  back: "blank" | "same" | "gray";
  baseColor: string;
  innerColor: string;
  /** Alça, tampa ou base em outra cor; null usa o padrão do modelo. */
  accentColor: string | null;
  metal: "none" | "silver" | "gold" | "rose";
  glass: boolean;
  glitter: boolean;
  ledColors: string[];
  sleeveless: boolean;
  longSleeve: boolean;
  collar: "crew" | "polo";
  grommets: boolean;
  flagStyle: FlagStyle;
  folds: 0 | 1 | 2;
  label: string;
};

export type MockupProduct = {
  slug?: string;
  name: string;
  categorySlug?: string;
  options: Record<string, string[]>;
};

type Rule = { kind: MockupKind; test: RegExp };

// Testadas na ordem contra o nome sem acento e em minúsculas (ver normalizeName).
// Regras mais específicas vêm antes: "porta copo" antes de "copo", "base … wind banner" antes de "wind banner".
const RULES: Rule[] = [
  { kind: "neon", test: /\bneon\b/ },
  { kind: "hardware", test: /\b(base|haste)\b.*\bwind banner\b/ },
  { kind: "rollup", test: /\broll ?up\b/ },
  { kind: "flag", test: /\bwind (banner|ball)\b|\bbandeira\b/ },
  { kind: "coaster", test: /\bporta (copo|jarra)\b|\bsousplat\b/ },
  { kind: "bottle", test: /\bgarrafa\b|\bsqueeze\b/ },
  { kind: "tumbler", test: /\bcopo\b|\btravel mug\b/ },
  { kind: "mug", test: /\bcaneca\b|\bxicara\b/ },
  { kind: "cap", test: /\bbone\b/ },
  { kind: "bandana", test: /\bbandana\b/ },
  { kind: "apron", test: /\bavental\b/ },
  { kind: "petbed", test: /\bcama pet\b/ },
  { kind: "tshirt", test: /\bcamisa\b|\bregata\b|\babada\b|\bcolete\b|\bpijama\b|\bbody\b/ },
  { kind: "cushion", test: /\balmofada\b|\bfronha\b|\bkit soneca\b|\bmascara de dormir\b/ },
  { kind: "tent", test: /\bcalendario de mesa\b|\bdisplay de mesa de papel\b/ },
  { kind: "book", test: /\bphotobook\b|\bagenda\b|\bcaderno\b|\bplanner\b|\bbloco\b/ },
  { kind: "folded", test: /^pasta\b|\bfolder\b|\bdobras?\b/ },
  {
    kind: "bag",
    test: /\bbolsa\b|\bsacola\b|\becobag\b|\bmochila\b|\bnecessaire\b|\blancheira\b|\bcooler\b|\bestojo\b|\bporta passaporte\b/,
  },
  { kind: "box", test: /\bcaixa\b|\bsolapa\b|\bkit (cinema|executivo)\b/ },
  { kind: "lightbox", test: /\bbacklight\b/ },
  { kind: "banner", test: /\bbanner\b|\blona\b|\bfaixa\b/ },
  { kind: "canvas", test: /\bcanvas\b/ },
  { kind: "keychain", test: /\bchaveiro\b/ },
  { kind: "acrylic", test: /\bacrilico\b/ },
  { kind: "rug", test: /\btapete\b|\bcapacho\b/ },
  { kind: "board", test: /\btabua\b/ },
  { kind: "mat", test: /\bmouse ?pad\b|\bjogo americano\b/ },
  {
    kind: "cloth",
    test: /\btoalha\b|\bpano\b|\blencol\b|\bcortina\b|\bcanga\b|\btecido\b|\bguardanapo\b|\bmeia\b|\bshort\b|\bmaio\b|\bcapa de corte\b|\bcapa p\/ cilindro\b|\bcordao\b/,
  },
  {
    kind: "panel",
    test: /\bps\b|\bpvc expandido\b|\bxps\b|\bpolionda\b|\bquadro\b|\bplaca\b|\bdisplay\b|\bporteiro\b|\bwobbler\b|\bmosaico\b|\bcracha\b|\bcredencial\b|\bregua\b|\bsuporte p\/ celular\b|\bquebra cabeca\b/,
  },
  { kind: "sticker", test: /\badesivo\b|\brotulo\b|\bima\b|\bdtf\b|\bmanta\b|\betiqueta\b|\bpulseira\b/ },
  { kind: "card", test: /\bcartao de (visita|pvc)\b|\btag\b|\bmarcador\b|\bcalendario de bolso\b/ },
];

// Usado quando nenhuma regra de nome casa (cartões postais, folhetos, impressões…).
const CATEGORY_DEFAULT: Record<string, MockupKind> = {
  "cartoes-de-visita-e-postais": "sheet",
  folhetos: "sheet",
  impressoes: "sheet",
  calendarios: "sheet",
  escritorio: "sheet",
  restaurantes: "sheet",
  promocional: "sheet",
  "adesivos-e-rotulos": "sticker",
  "banner-e-lonas": "banner",
  "comunicacao-visual": "panel",
  "led-neon": "neon",
  vestuario: "tshirt",
  texteis: "cloth",
  "bolsas-e-mochilas": "bag",
  photobook: "book",
  embalagens: "box",
};

/** Sem acento, minúsculas e espaços simples: "Boné" → "bone". */
export function normalizeName(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function resolveKind(product: { slug?: string; name: string; categorySlug?: string }): { kind: MockupKind; source: KindSource } {
  const override = product.slug ? MOCKUP_OVERRIDES[product.slug]?.kind : undefined;
  if (override) return { kind: override, source: "override" };
  const name = normalizeName(product.name);
  const rule = RULES.find((r) => r.test.test(name));
  if (rule) return { kind: rule.kind, source: "name" };
  const byCategory = product.categorySlug ? CATEGORY_DEFAULT[product.categorySlug] : undefined;
  if (byCategory) return { kind: byCategory, source: "category" };
  return { kind: "sheet", source: "fallback" };
}

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

/** Chave da opção sem o prefixo numérico ("2 - Cor" → "cor"), normalizada. */
function optionKey(key: string): string {
  return normalizeName(key).replace(/^\d+ - /, "").replace(/:$/, "");
}

function pick(selection: Selection, options: Record<string, string[]>, pattern: RegExp): string | undefined {
  const key = Object.keys(options).find((k) => pattern.test(optionKey(k)));
  if (!key) return undefined;
  return selection[key] ?? options[key]?.[0];
}

type Palette = [RegExp, string][];

// Cores de peça (tecido, cerâmica, plástico). Padrões mais específicos primeiro.
const COLOR_WORDS: Palette = [
  [/\bazul (escuro|marinho)\b|\bmarinho\b/, "#1f2f5c"],
  [/\bazul claro\b|\bceleste\b/, "#7cc4ef"],
  [/\bazul royal\b|\broyal\b/, "#2449b8"],
  [/\bazul\b/, "#2a6fdb"],
  [/\bverde escuro\b|\bmusgo\b/, "#1f5c3a"],
  [/\bverde claro\b|\bverde limao\b/, "#9bd36a"],
  [/\bverde\b/, "#2f9e5b"],
  [/\bvermelh\w*/, "#d7262b"],
  [/\bvinho\b|\bbordo\b/, "#6d1a2a"],
  [/\brose gold\b/, "#e9a99b"],
  [/\brosa claro\b/, "#f6c3d5"],
  [/\brosa\b|\bpink\b/, "#e8789f"],
  [/\blilas\b|\broxo\b|\bpurpura\b/, "#8e6bbf"],
  [/\blaranja\b/, "#f08a24"],
  [/\bamarel\w*/, "#f4c51f"],
  [/\bbege\b|\bareia\b|\bcru\b/, "#e8dcc4"],
  [/\bmarrom\b/, "#6b4a33"],
  [/\bcinza\b|\bgrafite\b/, "#9a9a9e"],
  [/\bdourad\w*/, "#d4af37"],
  [/\bpratead\w*|\bprata\b/, "#c9ccd1"],
  [/\bcobre\b/, "#b87333"],
  [/\bpret\w*|\bblack\b/, "#1c1c1e"],
  [/\bbranc\w*/, "#ffffff"],
];

// Cores de LED são saturadas e claras; não reaproveitam a paleta de peças.
const LED_WORDS: Palette = [
  [/\bbranco quente\b/, "#ffd9a0"],
  [/\bbranco frio\b|\bbranco\b/, "#eaf6ff"],
  [/\bvermelh\w*/, "#ff2a3d"],
  [/\blaranja\b/, "#ff7a1a"],
  [/\bamarelo ambar\b|\bambar\b/, "#ffb21a"],
  [/\bamarel\w*/, "#ffe14a"],
  [/\bverde\b/, "#39ff7a"],
  [/\bazul claro\b|\bciano\b|\bgelo\b/, "#5fe3ff"],
  [/\bazul\b/, "#2f6bff"],
  [/\brosa\b|\bpink\b/, "#ff4fd8"],
  [/\broxo\b|\blilas\b|\bvioleta\b/, "#a64dff"],
];

export const DEFAULT_LED_COLORS = ["#ff4fd8", "#38e1ff"];

/** Cores citadas no texto, na ordem em que aparecem ("Branca com tampa preta" → branco, preto). */
export function colorsIn(text: string, palette: Palette = COLOR_WORDS): string[] {
  const found: { index: number; length: number; color: string }[] = [];
  palette.forEach(([pattern, color]) => {
    for (const match of text.matchAll(new RegExp(pattern.source, "g"))) {
      found.push({ index: match.index ?? 0, length: match[0].length, color });
    }
  });
  found.sort((a, b) => a.index - b.index || b.length - a.length);
  const colors: string[] = [];
  let end = -1;
  for (const hit of found) {
    if (hit.index < end) continue;
    colors.push(hit.color);
    end = hit.index + hit.length;
  }
  return colors;
}

function metalFrom(text: string): MockupSpec["metal"] {
  if (/\brose gold\b/.test(text) || (/\brose\b/.test(text) && /cromad/.test(text))) return "rose";
  if (/\bdourad/.test(text)) return "gold";
  if (/cromad|\bprata\b|\binox\b|\baluminio\b/.test(text)) return "silver";
  return "none";
}

const NOT_PRINTABLE = /\bs\/ impressao\b|\bsem impressao\b|\bs\/ personalizacao\b|\bsem personalizacao\b|\bnao personalizavel\b|\bpct\b|\bpacote\b|\bcaneta p\/ porcelana\b/;
const SHAPED_KINDS: MockupKind[] = ["cushion", "sticker", "mat", "coaster", "keychain", "card", "petbed"];
const PAINTABLE_METAL: MockupKind[] = ["bottle", "tumbler"];

export function mockupSpec(product: MockupProduct, selection: Selection): MockupSpec {
  const { kind, source } = resolveKind(product);
  const info = KIND_INFO[kind];
  const [dw, dh, dd] = info.defaultSize;
  const name = normalizeName(product.name);

  const chosen = Object.entries(product.options).map(([k, values]) => ({
    key: optionKey(k),
    value: normalizeName(selection[k] ?? values[0] ?? ""),
  }));
  const allValues = chosen.map((c) => c.value).join(" | ");

  const sizeText =
    pick(selection, product.options, /^(formato|tamanho da arte|formato da arte)/) ??
    pick(selection, product.options, /^tamanho$/) ??
    product.name;
  const parsed = parseSize(sizeText) ?? parseSize(product.name);
  let [widthCm, heightCm] = parsed ?? [dw, dh];
  if (kind === "banner" && /faixa/.test(name) && heightCm > widthCm) [widthCm, heightCm] = [heightCm, widthCm];

  let finish: MockupSpec["finish"] = "satin";
  if (/fosc/.test(allValues)) finish = "matte";
  if (/brilho|glossy|cromad/.test(allValues)) finish = "gloss";

  let clearcoat = 0;
  if (/verniz total|uv total|u\.v\. total/.test(allValues)) clearcoat = 1;
  else if (/verniz local|uv local/.test(allValues)) clearcoat = 0.55;
  if (finish === "gloss") clearcoat = Math.max(clearcoat, 0.7);

  // "Cor" pode ser a carga de impressão (4/0, 4/4) ou a cor da peça.
  const printColors = pick(selection, product.options, /^cor( da impressao)?$/) ?? "";
  let back: MockupSpec["back"] = kind === "card" || kind === "sheet" || kind === "folded" ? "same" : "blank";
  if (/4\/0/.test(printColors)) back = "blank";
  if (/4\/1/.test(printColors)) back = "gray";
  if (/4\/4/.test(printColors) || /\bdupla face\b/.test(name)) back = "same";

  const colorValue = chosen.find(
    (c) => /^cor( d[aoe]s? (caneca|garrafa|bone|camisa|pulseira|estrutura))?$|^cor base$/.test(c.key) && !/\d\/\d/.test(c.value),
  )?.value;
  const bodyColors = colorValue ? colorsIn(colorValue) : [];
  const plastic = /plastic/.test(name) || /plastic/.test(allValues);
  const coloredInterior = kind === "mug" && /\binterior\b/.test(name);

  let baseColor = "#ffffff";
  if (bodyColors.length && !coloredInterior) baseColor = bodyColors[0];
  else if (!bodyColors.length && (kind === "tshirt" || kind === "cap" || kind === "bag")) baseColor = colorsIn(name)[0] ?? "#ffffff";
  if (kind === "mug" && /\bmagica\b/.test(name) && !bodyColors.length) baseColor = "#1c1c1e";
  if ((kind === "mat" || kind === "rug") && !bodyColors.length) baseColor = "#2b2b2b";

  const innerMatch = /\binterior (?:colorido )?([a-z]+(?: (?:claro|escuro))?)/.exec(name) ?? /\binterior ([a-z]+)/.exec(colorValue ?? "");
  let innerColor = innerMatch ? colorsIn(innerMatch[1])[0] : undefined;
  if (!innerColor && coloredInterior) innerColor = bodyColors[0];
  if (!innerColor && kind === "mug" && bodyColors.length > 1) innerColor = bodyColors[1];
  innerColor ??= baseColor === "#1c1c1e" ? "#1c1c1e" : "#ffffff";

  let accentColor: string | null = null;
  if (coloredInterior) accentColor = innerColor;
  else if (bodyColors.length > 1 && (kind === "bottle" || kind === "tumbler")) accentColor = bodyColors[1];
  const lid = pick(selection, product.options, /^cor da tampa$/);
  if (lid) accentColor = colorsIn(normalizeName(lid))[0] ?? accentColor;
  if (/\bbambu\b/.test(name)) accentColor = "#c9a46c";

  let metal: MockupSpec["metal"] = plastic ? "none" : metalFrom(name);
  if (colorValue && ((kind === "mug" && /cromad/.test(name)) || PAINTABLE_METAL.includes(kind))) {
    const fromValue = metalFrom(colorValue);
    if (fromValue !== "none") metal = fromValue;
    else if (bodyColors.length && PAINTABLE_METAL.includes(kind)) metal = "none";
  }
  const glitter = /\bglitter\b/.test(name) || /\bglitter\b/.test(colorValue ?? "");
  // "branca com base dourada": só a base é metálica.
  const baseBand = /\bbase (dourad\w*|pratead\w*|prata)\b/.exec(colorValue ?? "");
  if (baseBand) {
    accentColor = colorsIn(baseBand[1])[0] ?? accentColor;
    metal = "none";
  } else if (glitter && metal === "none") {
    metal = metalFrom(`${name} ${colorValue ?? ""}`);
  }
  const glass = /\bvidro\b|\bchopp\b|\bjatead/.test(name) || (kind === "box" && /\bacrilic/.test(name));

  const ledValue = pick(selection, product.options, /^cor(es)? d[oa]s? leds?$/) ?? (kind === "neon" ? colorValue : undefined);
  const ledFound = ledValue ? colorsIn(normalizeName(ledValue), LED_WORDS) : [];
  const ledColors = ledFound.length ? ledFound : DEFAULT_LED_COLORS;

  const thickness = /(\d+(?:[.,]\d+)?)\s*mm/.exec(allValues);
  const depthCm = thickness ? Number(thickness[1].replace(",", ".")) / 10 : dd;

  const shapeText = `${name} | ${allValues}`;
  let shape: MockupShape = "rect";
  let circle = false;
  if (/\bcoracao\b/.test(shapeText)) shape = "heart";
  else if (/\bredond[ao]s?\b|\bcircular\b/.test(shapeText) || (kind === "coaster" && /\bsousplat\b/.test(name))) {
    shape = "round";
    circle = true;
  } else if (/\boval\b/.test(shapeText)) shape = "round";
  if (!SHAPED_KINDS.includes(kind)) shape = "rect";
  if (shape === "round" && circle) heightCm = widthCm = Math.max(widthCm, heightCm);

  let flagStyle: FlagStyle = "pena";
  if (/\bfaca\b/.test(name)) flagStyle = "faca";
  else if (/\bgota\b/.test(name)) flagStyle = "gota";
  else if (/\bvela\b/.test(name)) flagStyle = "vela";
  else if (/\bretangular\b/.test(name) || (/\bbandeira\b/.test(name) && !/\bwind\b/.test(name))) flagStyle = "rect";

  const folds: MockupSpec["folds"] = /\b2 dobras\b/.test(name) ? 2 : /\bdobras?\b/.test(name) || kind === "folded" ? 1 : 0;

  const override = product.slug ? MOCKUP_OVERRIDES[product.slug] : undefined;
  const printable = info.printable && override?.printable !== false && !NOT_PRINTABLE.test(name) && !NOT_PRINTABLE.test(allValues);

  return {
    kind,
    source,
    printable,
    widthCm,
    heightCm,
    depthCm,
    shape,
    finish,
    clearcoat,
    back,
    baseColor,
    innerColor,
    accentColor,
    metal,
    glass,
    glitter,
    ledColors,
    sleeveless: /\bregata\b|\babada\b|\bcolete\b/.test(name),
    longSleeve: /\bmanga (comprida|longa)\b|\bpijama\b/.test(name),
    collar: /\bpolo\b/.test(name) ? "polo" : "crew",
    grommets: /\bilhos\b|\bfaixa\b/.test(name) || /\bilhos\b/.test(allValues),
    flagStyle,
    folds,
    label: formatSize(widthCm, heightCm),
  };
}

export function formatSize(w: number, h: number): string {
  const fmt = (v: number) =>
    v >= 100
      ? `${(v / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m`
      : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} cm`;
  return `${fmt(w)} × ${fmt(h)}`;
}
