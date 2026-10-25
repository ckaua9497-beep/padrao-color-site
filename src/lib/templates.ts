import { cleanOptionLabel, type Selection } from "./pricing.ts";

/*
 * Gabaritos oficiais (src/data/templates.json, gerado por `npm run sync:templates`) e o encaixe da arte neles.
 *
 * Tudo em milímetros, nas coordenadas da folha do gabarito (origem no canto de cima à esquerda, y para baixo).
 * Uma folha (página do PDF) tem um ou mais painéis: cada painel é uma peça a imprimir, com
 *   - bleed: a caixa da sangria (o fundo da arte vai até ela),
 *   - cut:   a linha de corte (tamanho final; retângulo, cantos redondos, elipse ou recorte livre),
 *   - safe:  a área de segurança (textos e logos ficam dentro dela).
 * Camisas trazem uma folha por tamanho; bolsas e coolers, vários painéis (frente, costas, laterais…).
 *
 * O encaixe do arquivo do cliente:
 *   - "sheet": o arquivo é a folha inteira do gabarito (o cliente montou a arte em cima dele) → entra 1:1;
 *   - "bleed": o arquivo tem o tamanho com sangria → ocupa a caixa da sangria;
 *   - "trim":  o arquivo tem o tamanho final, sem sangria → ocupa o corte e as bordas são estendidas até a sangria;
 *   - "other": outra proporção → cobre a sangria (preencher) ou fica inteiro na área de segurança (caber).
 * Este módulo é puro (testável com node --test): sem JSX, sem "@/", só tipos de fora.
 */

export type Mm = { w: number; h: number };
export type Box = { x: number; y: number; w: number; h: number };
export type Sides = { top: number; right: number; bottom: number; left: number };
export type PanelShape = "rect" | "rounded" | "ellipse" | "custom";
export type PanelSide = "front" | "back" | "other";

export type TemplatePanel = {
  /** Nome do painel na curadoria ("Frente", "Costas", "Lateral direita"…). */
  name?: string;
  side?: PanelSide;
  bleed: Box;
  /** true quando o gabarito não desenha a sangria (a folha ou o corte fazem esse papel). */
  implicitBleed?: boolean;
  /** Corte: caixa + forma; `d` = caminho SVG em mm (coordenadas da folha) quando não é retângulo simples. */
  cut: Box & { shape: PanelShape; d?: string };
  /** Área de segurança; `parts` quando ela vem em pedaços (um por face, separados por dobras). */
  safe: (Box & { shape: PanelShape; d?: string; parts?: Box[] }) | null;
  /** Linha de costura (caminho SVG em mm). */
  sew?: string;
  /** Marcas do gabarito (bolso, logo, zíper, dobra…). */
  marks?: { role: string; bbox: Box; d?: string; dashed?: boolean }[];
  metrics: { finalMm: Mm; bleedMm: Sides; safeMm: Sides | null };
  /**
   * Peça contínua dividida por dobras (almofada e bolsa com frente e verso no mesmo tecido, folder): as
   * faces, de cima para baixo e da esquerda para a direita. Com lado na curadoria, cada face recebe a arte
   * do seu lado, girada como no gabarito (`rotate`, sentido horário: 180 = de cabeça para baixo).
   */
  faces?: TemplateFace[];
};

export type TemplateFace = { box: Box; safe: Box | null; name?: string; side?: PanelSide; rotate?: 0 | 90 | 180 | 270; ignore?: boolean };

export type TemplatePage = {
  id: string;
  label: string;
  /** Arquivo e página de origem (dentro do pacote do gabarito). */
  file?: string | null;
  page?: number;
  sheet: Mm;
  panels: TemplatePanel[];
  side?: PanelSide;
  /** Tamanho da grade (P, M, G, 6 Anos…) quando o gabarito tem uma folha por tamanho. */
  size?: string;
  /** Parte do produto (capa, miolo, lombada, alça…). */
  part?: string;
  manual?: boolean;
  note?: string;
  /** Uma arte só atravessa todas as peças da folha (quadro mosaico): o editor trabalha na união delas. */
  span?: boolean;
  /** Folha girada 90° para a orientação da peça (rotatePage); o PDF volta para a posição do gabarito. */
  rotated?: boolean;
};

/** Gabarito de um produto, como a página do produto recebe. */
export type ProductTemplate = {
  key: string;
  url: string;
  note?: string;
  /** Produto de medida livre: o gabarito é a regra (sangria e segurança) aplicada à medida digitada. */
  parametric?: { bleedMm: number; safeMm: number } | null;
  /**
   * Curadoria: "cut" = o editor trabalha sempre no molde (capa de envolver, faixa), mesmo com a área do
   * mockup em outra proporção; "fit" = sempre na área do mockup, com a composição encaixada no PDF.
   */
  editor?: "cut" | "fit";
  pages: TemplatePage[];
  /** opção → valor → folhas (ex.: "Tamanho" → "21,0x29,7 cm" → ["21x29_7cm-…"]). */
  byOption?: Record<string, Record<string, string[]>>;
  /** tamanho da grade → folhas (camisas: uma folha por tamanho). */
  bySize?: Record<string, string[]>;
};

export type ArtworkMatch = "sheet" | "bleed" | "trim" | "other";
export type FitMode = "auto" | "cover" | "contain";

// ---------------------------------------------------------------------------------------------- folhas

/**
 * Folhas que valem para a seleção atual (opções com medida e, nas camisas, o tamanho). Valor de uma opção
 * mapeada que não tem folha (o arquivo do gabarito não traz aquela medida) = sem gabarito: lista vazia.
 */
export function pagesFor(template: ProductTemplate, selection: Selection, size?: string | null): TemplatePage[] {
  let ids: string[] | null = null;
  for (const [key, map] of Object.entries(template.byOption ?? {})) {
    const value = selection[key];
    if (!value) continue;
    const hit = map[value] ?? [];
    ids = ids ? ids.filter((id) => hit.includes(id)) : [...hit];
  }
  if (size && template.bySize) {
    const hit = template.bySize[size] ?? template.bySize[normalizeSize(size)];
    if (hit) ids = ids ? ids.filter((id) => hit.includes(id)) : [...hit];
  }
  return ids ? template.pages.filter((p) => ids.includes(p.id)) : template.pages;
}

/**
 * A seleção imprime o verso? Só a opção de cor/impressão decide ("4/0", "só frente" = não). Acabamentos como
 * "UV Total 1/0" (verniz) não contam.
 */
export function printsBack(selection: Selection): boolean {
  return !Object.entries(selection).some(([key, v]) => {
    const k = cleanOptionLabel(key).toLowerCase();
    if (!/^cor(es)?\b|impress|lados|frente/.test(k) || /uv|verniz|lamina/i.test(v)) return false;
    return /\b\d\s*\/\s*0\b/.test(v) || /s[oó]\s+frente|somente\s+(a\s+)?frente|apenas\s+(a\s+)?frente|sem\s+verso/i.test(v);
  });
}

/** "Tam: P", "P (30-34)" → "P"; "6 anos" → "6 Anos". */
export function normalizeSize(size: string): string {
  const s = size.replace(/^tam(anho)?\s*:?\s*/i, "").replace(/\s*\(.*\)\s*$/, "").trim();
  return s.replace(/\banos?\b/i, (m) => m[0].toUpperCase() + m.slice(1).toLowerCase());
}

/** Lado do painel: o da curadoria, o da folha, ou frente quando é o primeiro. */
export function sideOf(page: TemplatePage, panel: TemplatePanel, index: number): PanelSide {
  if (panel.side) return panel.side;
  // Peça sem rótulo numa folha que já tem peças marcadas (alça, tira, pé do display): não recebe a arte —
  // nem quando a folha inteira tem lado.
  if (page.panels.some((p) => p.side === "front" || p.side === "back")) return "other";
  if (page.side) return page.side;
  return index === 0 ? "front" : "other";
}

/**
 * Peça que recebe arte: um painel inteiro ou uma face de painel (peça contínua com dobras).
 * `panel` é o painel "de pé" que o editor e a pintura usam (na face: o recorte dela, girado para ficar em
 * pé, em coordenadas próprias); `view` é a folha desse painel. `at` é a caixa da sangria da peça na folha
 * real e `rotate`, o giro (horário) com que a arte entra nela.
 */
export type Piece = {
  page: TemplatePage;
  panelIndex: number;
  faceIndex: number | null;
  panel: TemplatePanel;
  view: TemplatePage;
  at: Box;
  rotate: 0 | 90 | 180 | 270;
  side: PanelSide;
  name?: string;
};

/** Medidas do painel (tamanho final, sangria e segurança por lado), como o extrator calcula. */
export function metricsFor(bleed: Box, cut: Box, safe: Box | null): TemplatePanel["metrics"] {
  const m = (a: number, b: number) => round1(Math.max(0, a - b));
  return {
    finalMm: { w: cut.w, h: cut.h },
    bleedMm: { top: m(cut.y, bleed.y), right: m(bleed.x + bleed.w, cut.x + cut.w), bottom: m(bleed.y + bleed.h, cut.y + cut.h), left: m(cut.x, bleed.x) },
    safeMm: safe ? { top: m(safe.y, cut.y), right: m(cut.x + cut.w, safe.x + safe.w), bottom: m(cut.y + cut.h, safe.y + safe.h), left: m(safe.x, cut.x) } : null,
  };
}

/** Faces usadas como peças: só quando a curadoria disse o lado de alguma. */
function usesFaces(panel: TemplatePanel): boolean {
  return Boolean(panel.faces?.some((f) => f.side && !f.ignore));
}

/**
 * Folha da máscara de verniz localizado (cartão, postal, marcador com verniz local): o campo `part` do gabarito diz
 * "verniz", "verniz local" ou "máscara verniz". Não é superfície de arte nem entra no arquivo de impressão; a máscara
 * sai da arte do cliente (product/verniz-arquivo.ts). O nome da folha não serve: "Máscara de Dormir" é produto.
 */
export function folhaDeVerniz(page: Pick<TemplatePage, "part">): boolean {
  return /\bverniz\b/i.test(page.part ?? "");
}

/** Peças de uma folha: os painéis inteiros e, nas peças contínuas com dobras, cada face. */
export function piecesOf(page: TemplatePage): Piece[] {
  if (page.span && page.panels.length > 1) return [spanPiece(page)];
  const pieces: Piece[] = [];
  page.panels.forEach((panel, panelIndex) => {
    if (!usesFaces(panel)) {
      pieces.push({ page, panelIndex, faceIndex: null, panel, view: page, at: panel.bleed, rotate: 0, side: sideOf(page, panel, panelIndex), name: panel.name });
      return;
    }
    const { cut, bleed } = panel;
    const faces = panel.faces ?? [];
    // Margem de sangria do painel em cada lado (aplicada às bordas externas das faces).
    const margin = { left: Math.max(0, cut.x - bleed.x), top: Math.max(0, cut.y - bleed.y), right: Math.max(0, bleed.x + bleed.w - (cut.x + cut.w)), bottom: Math.max(0, bleed.y + bleed.h - (cut.y + cut.h)) };
    const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 1;
    faces.forEach((face, faceIndex) => {
      if (face.ignore) return;
      const f = face.box;
      // Borda de dobra = encosta noutra face; ali a arte termina na própria dobra. Borda externa (mesmo dentro
      // da caixa do corte, num recorte em L) ganha a sangria do painel.
      const others = faces.filter((o, j) => j !== faceIndex && !o.ignore).map((o) => o.box);
      const foldLeft = others.some((o) => Math.abs(o.x + o.w - f.x) < 1 && overlap(o.y, o.y + o.h, f.y, f.y + f.h));
      const foldRight = others.some((o) => Math.abs(o.x - (f.x + f.w)) < 1 && overlap(o.y, o.y + o.h, f.y, f.y + f.h));
      const foldTop = others.some((o) => Math.abs(o.y + o.h - f.y) < 1 && overlap(o.x, o.x + o.w, f.x, f.x + f.w));
      const foldBottom = others.some((o) => Math.abs(o.y - (f.y + f.h)) < 1 && overlap(o.x, o.x + o.w, f.x, f.x + f.w));
      const x0 = foldLeft ? f.x : Math.max(bleed.x, f.x - margin.left);
      const y0 = foldTop ? f.y : Math.max(bleed.y, f.y - margin.top);
      const x1 = foldRight ? f.x + f.w : Math.min(bleed.x + bleed.w, f.x + f.w + margin.right);
      const y1 = foldBottom ? f.y + f.h : Math.min(bleed.y + bleed.h, f.y + f.h + margin.bottom);
      const at = { x: x0, y: y0, w: round1(x1 - x0), h: round1(y1 - y0) };
      const local = (b: Box): Box => ({ x: round1(b.x - at.x), y: round1(b.y - at.y), w: b.w, h: b.h });
      const fCut = local(f);
      const fSafe = face.safe ? local(face.safe) : null;
      const fBleed = { x: 0, y: 0, w: at.w, h: at.h };
      const virtual: TemplatePanel = {
        name: face.name,
        side: face.side,
        bleed: fBleed,
        implicitBleed: panel.implicitBleed,
        cut: { ...fCut, shape: "rect" },
        safe: fSafe ? { ...fSafe, shape: "rect" } : null,
        metrics: metricsFor(fBleed, fCut, fSafe),
      };
      let view: TemplatePage = { id: `${page.id}#${panelIndex}.${faceIndex}`, label: face.name ?? page.label, sheet: { w: at.w, h: at.h }, panels: [virtual] };
      // De pé no editor: desfaz o giro da face no gabarito.
      const rotate = face.rotate ?? 0;
      for (let turn = 0; turn < ((4 - rotate / 90) % 4); turn += 1) view = rotatePage(view);
      pieces.push({ page, panelIndex, faceIndex, panel: view.panels[0], view, at, rotate, side: face.side ?? "other", name: face.name });
    });
  });
  return pieces;
}

/**
 * Mosaico: uma peça virtual com a união das placas — corte com o contorno de cada placa (os vãos aparecem
 * no editor) e a segurança em partes (uma por placa). No arquivo, cada placa recebe o pedaço dela.
 */
function spanPiece(page: TemplatePage): Piece {
  const union = (boxes: Box[]): Box => {
    const x0 = Math.min(...boxes.map((b) => b.x));
    const y0 = Math.min(...boxes.map((b) => b.y));
    const x1 = Math.max(...boxes.map((b) => b.x + b.w));
    const y1 = Math.max(...boxes.map((b) => b.y + b.h));
    return { x: round1(x0), y: round1(y0), w: round1(x1 - x0), h: round1(y1 - y0) };
  };
  const bleed = union(page.panels.map((p) => p.bleed));
  const cut = union(page.panels.map((p) => p.cut));
  const safes = page.panels.flatMap((p) => (p.safe ? [p.safe] : []));
  const rectPath = (b: Box) => `M${b.x} ${b.y}L${b.x + b.w} ${b.y}L${b.x + b.w} ${b.y + b.h}L${b.x} ${b.y + b.h}Z`;
  // Segurança: uma linha por placa (a caixa única cobriria os vãos entre elas).
  const safe = safes.length ? { ...union(safes), shape: "custom" as const, d: safes.map((b) => b.d ?? rectPath(b)).join(""), parts: safes.map(({ x, y, w, h }) => ({ x, y, w, h })) } : null;
  const outline = page.panels.map((p) => p.cut.d ?? rectPath(p.cut)).join("");
  const panel: TemplatePanel = {
    name: "Arte inteira (todas as placas)",
    side: "front",
    bleed,
    // Placas retangulares: o contorno (d) desenha cada uma; a forma não é "corte especial".
    cut: { ...cut, shape: page.panels.every((p) => p.cut.shape === "rect") ? "rect" : "custom", d: outline },
    safe,
    metrics: metricsFor(bleed, cut, safe),
  };
  return { page, panelIndex: -1, faceIndex: null, panel, view: { ...page, panels: [panel], span: false }, at: bleed, rotate: 0, side: page.side ?? "front", name: panel.name };
}

export type PanelRef = { page: TemplatePage; panel: TemplatePanel; index: number; piece: Piece };

/** Identidade estável de uma peça (folha, painel e face), para saber se a seleção trocou de peça. */
export function pieceKey(piece: Piece): string {
  return `${piece.page.id}#${piece.panelIndex}.${piece.faceIndex ?? "-"}${piece.page.rotated ? "r" : ""}`;
}

/** Peça que recebe a arte de um lado (frente/verso) entre as folhas da seleção. */
export function panelFor(pages: TemplatePage[], side: "front" | "back"): PanelRef | null {
  const ref = (piece: Piece): PanelRef => ({ page: piece.view, panel: piece.panel, index: piece.panelIndex, piece });
  for (const page of pages) {
    const piece = piecesOf(page).find((p) => p.side === side);
    if (piece) return ref(piece);
  }
  const first = pages[0] ? piecesOf(pages[0])[0] : undefined;
  return side === "front" && first ? ref(first) : null;
}

/** true quando o gabarito tem peça própria para o verso/costas. */
export function hasBackPanel(pages: TemplatePage[]): boolean {
  return pages.some((page) => piecesOf(page).some((p) => p.side === "back"));
}

/**
 * Regra de sangria e segurança de um gabarito com medidas fixas, para a medida livre do mesmo produto
 * (banner e faixa vendidos nos tamanhos do gabarito ou "personalize a sua medida"): a menor margem da frente.
 */
export function ruleOf(pages: TemplatePage[]): { bleedMm: number; safeMm: number } | null {
  const front = panelFor(pages, "front");
  if (!front) return null;
  const { bleedMm, safeMm } = front.panel.metrics;
  const min = (s: Sides | null) => (s ? Math.min(s.top, s.right, s.bottom, s.left) : 0);
  return { bleedMm: front.panel.implicitBleed ? 0 : min(bleedMm), safeMm: min(safeMm) };
}

/** Folha de um produto de medida livre: a medida digitada com a regra de sangria e segurança do gabarito. */
export function parametricPage(rule: { bleedMm: number; safeMm: number }, widthCm: number, heightCm: number): TemplatePage | null {
  if (!(widthCm > 0 && heightCm > 0)) return null;
  const w = round1(widthCm * 10);
  const h = round1(heightCm * 10);
  const b = rule.bleedMm;
  const s = rule.safeMm;
  const cut = { x: b, y: b, w, h };
  const safe = s > 0 && w > 2 * s && h > 2 * s ? { x: b + s, y: b + s, w: w - 2 * s, h: h - 2 * s, shape: "rect" as const } : null;
  const bleed = { x: 0, y: 0, w: w + 2 * b, h: h + 2 * b };
  const panel: TemplatePanel = {
    bleed,
    implicitBleed: b === 0 || undefined,
    cut: { ...cut, shape: "rect" },
    safe,
    metrics: { finalMm: { w, h }, bleedMm: { top: b, right: b, bottom: b, left: b }, safeMm: safe ? { top: s, right: s, bottom: s, left: s } : null },
  };
  return { id: `medida-${w}x${h}`, label: `Medida ${formatMm(w)} × ${formatMm(h)}`, sheet: { w: bleed.w, h: bleed.h }, panels: [panel], manual: true };
}

// ---------------------------------------------------------------------------------------------- orientação

/**
 * Folha girada 90° no sentido horário (gabarito desenhado deitado para um produto em pé, ou o contrário).
 * O editor e a prévia usam a folha girada; o PDF de impressão volta a arte para a posição original do
 * gabarito (`rotated`). Ponto (x, y) → (H − y, x), com H = altura da folha original.
 */
export function rotatePage(page: TemplatePage): TemplatePage & { rotated: true } {
  const H = page.sheet.h;
  const box = <B extends Box>(b: B): B => ({ ...b, x: round1(H - (b.y + b.h)), y: b.x, w: b.h, h: b.w });
  const d = (path?: string) => (path ? rotatePath(path, H) : undefined);
  const sides = (s: Sides): Sides => ({ top: s.left, right: s.top, bottom: s.right, left: s.bottom });
  const panels = page.panels.map((p) => ({
    ...p,
    bleed: box(p.bleed),
    cut: { ...box(p.cut), d: d(p.cut.d) },
    safe: p.safe ? { ...box(p.safe), d: d(p.safe.d), parts: p.safe.parts?.map(box) } : null,
    sew: d(p.sew),
    marks: p.marks?.map((m) => ({ ...m, bbox: box(m.bbox), d: d(m.d) })),
    metrics: { finalMm: { w: p.metrics.finalMm.h, h: p.metrics.finalMm.w }, bleedMm: sides(p.metrics.bleedMm), safeMm: p.metrics.safeMm ? sides(p.metrics.safeMm) : null },
    // A face girada junto com a folha passa a ter a arte girada 90° a mais (sentido horário).
    faces: p.faces?.map((f) => ({ ...f, box: box(f.box), safe: f.safe ? box(f.safe) : null, rotate: (((f.rotate ?? 0) + 90) % 360) as TemplateFace["rotate"] })),
  }));
  return { ...page, sheet: { w: page.sheet.h, h: page.sheet.w }, panels, rotated: true };
}

/** Gira um caminho SVG (comandos absolutos M, L, C e Z, como o extrator grava) 90° no sentido horário. */
export function rotatePath(d: string, sheetH: number): string | undefined {
  if (/[^MLCZmlcz\d\s.,eE+-]/.test(d) || /[mlcz]/.test(d)) return undefined;
  const out: string[] = [];
  const re = /([MLCZ])([^MLCZ]*)/g;
  for (let m = re.exec(d); m; m = re.exec(d)) {
    const nums = m[2].trim() ? m[2].trim().split(/[\s,]+/).map(Number) : [];
    const pts: string[] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push(`${round1(sheetH - nums[i + 1])} ${nums[i]}`);
    out.push(m[1] + pts.join(" "));
  }
  return out.join("");
}

/** Caixa de uma folha girada (rotatePage) de volta às coordenadas da folha original. */
export function unrotateBox(b: Box, rotatedSheet: Mm): Box {
  // Original: x = y', y = H − (x' + w'), com H = largura da folha girada.
  return { x: b.y, y: rotatedSheet.w - (b.x + b.w), w: b.h, h: b.w };
}

/**
 * Orienta as folhas para a peça: se o gabarito está deitado e a peça em pé (ou o contrário), gira todas.
 * `aspect` = largura ÷ altura da área do mockup.
 */
export function orientPages(pages: TemplatePage[], aspect: number): TemplatePage[] {
  if (!(aspect > 0) || !pages.length) return pages;
  // Só conta a orientação quando a peça claramente pede uma (quadrados ficam como estão).
  // A orientação é a da peça que recebe a arte (a frente), não a da primeira peça da folha (barra, alça).
  const mainCut = (page: TemplatePage) => (panelFor([page], "front") ?? (piecesOf(page)[0] ? { panel: piecesOf(page)[0].panel } : null))?.panel.cut;
  const flipped = (page: TemplatePage) => {
    // Face de peça contínua já fica de pé pela curadoria (o giro da folha não muda a face).
    if ((panelFor([page], "front")?.piece.faceIndex ?? null) !== null) return false;
    const cut = mainCut(page);
    if (!cut) return false;
    const a = cut.w / cut.h;
    return aspectGap(1 / a, aspect) + 0.05 < aspectGap(a, aspect);
  };
  const wrong = pages.filter(flipped);
  if (!wrong.length) return pages;
  const right = pages.filter((p) => !flipped(p));
  // O gabarito já traz a versão na outra orientação (pastas "horizontal" e "vertical"): fica só a certa.
  const twin = (p: TemplatePage) => {
    const c = mainCut(p);
    // Os desenhos horizontal e vertical da mesma peça às vezes diferem 1 ou 2 mm (ex.: 309×88 e 90×300).
    return Boolean(c) && right.some((q) => {
      const o = mainCut(q);
      return o && c && Math.abs(o.w - c.h) <= Math.max(3, c.h * 0.04) && Math.abs(o.h - c.w) <= Math.max(3, c.w * 0.04);
    });
  };
  if (right.length && wrong.every(twin)) return right;
  // Todas deitadas para a peça em pé (ou o contrário): gira as que estão na outra orientação.
  return right.length ? pages : pages.map(rotatePage);
}

// ---------------------------------------------------------------------------------------------- encaixe

const round1 = (v: number) => Math.round(v * 10) / 10;
const aspectOf = (m: Mm) => (m.h > 0 ? m.w / m.h : 1);
/** Diferença relativa entre duas proporções (0 = iguais). */
export function aspectGap(a: number, b: number): number {
  return Math.abs(Math.log(Math.max(1e-6, a) / Math.max(1e-6, b)));
}

/** Resoluções comuns de exportação: desempatam "com sangria" × "sem sangria" quando a proporção é igual. */
const COMMON_DPI = [72, 96, 100, 120, 150, 200, 240, 254, 300, 350, 400, 450, 600, 720, 1200];
function dpiFitness(px: number, mm: number): number {
  if (!(mm > 0)) return Infinity;
  const dpi = px / (mm / 25.4);
  return Math.min(...COMMON_DPI.map((d) => Math.abs(dpi - d) / d));
}

/** Tolerância de proporção (1,2%) e de medida física (1,5 mm ou 1,5%). */
const ASPECT_TOL = 0.012;
const closeMm = (a: number, b: number) => Math.abs(a - b) <= Math.max(1.5, 0.015 * Math.max(a, b));
const sameSize = (a: Mm, b: Mm) => closeMm(a.w, b.w) && closeMm(a.h, b.h);

/**
 * Como o arquivo do cliente se relaciona com o gabarito.
 * `physical` = medida real do arquivo em mm quando se sabe (PDF: tamanho da página); senão, só a proporção.
 */
export function matchArtwork(px: Mm, page: TemplatePage, panel: TemplatePanel, physical?: Mm | null): ArtworkMatch {
  const bleed = { w: panel.bleed.w, h: panel.bleed.h };
  const cut = { w: panel.cut.w, h: panel.cut.h };
  const sheetDiffers = page.panels.length > 1 || !sameSize(page.sheet, bleed);
  if (physical && physical.w > 0 && physical.h > 0) {
    if (sheetDiffers && sameSize(physical, page.sheet)) return "sheet";
    if (sameSize(physical, bleed)) return "bleed";
    if (sameSize(physical, cut)) return "trim";
  }
  const a = aspectOf(px);
  const fitsBleed = aspectGap(a, aspectOf(bleed)) <= ASPECT_TOL;
  const fitsCut = aspectGap(a, aspectOf(cut)) <= ASPECT_TOL;
  const fitsSheet = sheetDiffers && aspectGap(a, aspectOf(page.sheet)) <= ASPECT_TOL;
  if (fitsSheet && !fitsBleed && !fitsCut) return "sheet";
  if (fitsBleed && fitsCut) {
    // Mesma proporção (peça quadrada, sangria proporcional): a resolução "redonda" decide; na dúvida, com sangria.
    return dpiFitness(px.w, cut.w) < dpiFitness(px.w, bleed.w) && dpiFitness(px.w, cut.w) < 0.01 ? "trim" : "bleed";
  }
  if (fitsBleed) return "bleed";
  if (fitsCut) return "trim";
  if (fitsSheet) return "sheet";
  return "other";
}

/** Onde a imagem inteira fica (mm, coordenadas da folha) no modo escolhido. */
export function placeArtwork(mode: FitMode, match: ArtworkMatch, px: Mm, page: TemplatePage, panel: TemplatePanel): Box {
  if (mode === "auto") {
    if (match === "sheet") return { x: 0, y: 0, w: page.sheet.w, h: page.sheet.h };
    if (match === "bleed") return { ...panel.bleed };
    if (match === "trim") return { x: panel.cut.x, y: panel.cut.y, w: panel.cut.w, h: panel.cut.h };
    return coverBox(px, panel.bleed);
  }
  if (mode === "cover") return coverBox(px, panel.bleed);
  return containBox(px, safeBoxOf(panel));
}

/** Onde texto e logo ficam seguros: a área de segurança (a maior parte, quando ela vem dividida) ou o corte. */
export function safeBoxOf(panel: TemplatePanel): Box {
  const parts = panel.safe?.parts;
  if (parts?.length) return parts.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
  return panel.safe ?? panel.cut;
}

/** Menor caixa na proporção da imagem que cobre `box`, centrada nela. */
export function coverBox(px: Mm, box: Box): Box {
  const s = Math.max(box.w / Math.max(1, px.w), box.h / Math.max(1, px.h));
  const w = px.w * s;
  const h = px.h * s;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/** Maior caixa na proporção da imagem que cabe em `box`, centrada nela. */
export function containBox(px: Mm, box: Box): Box {
  const s = Math.min(box.w / Math.max(1, px.w), box.h / Math.max(1, px.h));
  const w = px.w * s;
  const h = px.h * s;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/** true quando a imagem não chega até a sangria em algum lado (as bordas precisam ser estendidas ou ficam com o fundo). */
export function leavesBleedUncovered(rect: Box, bleed: Box): boolean {
  const e = 0.05;
  return rect.x > bleed.x + e || rect.y > bleed.y + e || rect.x + rect.w < bleed.x + bleed.w - e || rect.y + rect.h < bleed.y + bleed.h - e;
}

/** Parte da imagem (0–1, em área) que fica fora da sangria e é descartada. */
export function croppedShare(rect: Box, bleed: Box): number {
  const ix = Math.max(0, Math.min(rect.x + rect.w, bleed.x + bleed.w) - Math.max(rect.x, bleed.x));
  const iy = Math.max(0, Math.min(rect.y + rect.h, bleed.y + bleed.h) - Math.max(rect.y, bleed.y));
  const total = rect.w * rect.h;
  return total > 0 ? Math.max(0, 1 - (ix * iy) / total) : 0;
}

/** Resolução efetiva (pontos por polegada) da imagem na caixa em que foi colocada. */
export function dpiAt(px: Mm, rect: Box): number {
  if (!(rect.w > 0 && rect.h > 0)) return 0;
  return Math.min(px.w / (rect.w / 25.4), px.h / (rect.h / 25.4));
}

/** Pixels para imprimir uma caixa em mm numa resolução. */
export function pixelsFor(box: Mm, dpi: number): Mm {
  return { w: Math.max(1, Math.round((box.w / 25.4) * dpi)), h: Math.max(1, Math.round((box.h / 25.4) * dpi)) };
}

// ---------------------------------------------------------------------------------------------- editor 2D

/** Encaixe "contain" (scale 1 do editor) de um conteúdo de proporção `content` numa área de proporção `area`. */
function containFraction(content: number, area: number): Mm {
  const c = Number.isFinite(content) && content > 0 ? content : 1;
  const a = Number.isFinite(area) && area > 0 ? area : 1;
  return c >= a ? { w: 1, h: a / c } : { w: c / a, h: 1 };
}

/** Caixa da imagem (mm da folha) → posição do editor, que trabalha em frações da caixa de corte. */
export function placementFromBox(rect: Box, cut: Box, imageAspect: number): { x: number; y: number; scale: number; rotation: number } {
  const base = containFraction(imageAspect, cut.w / cut.h);
  return {
    x: (rect.x + rect.w / 2 - cut.x) / cut.w,
    y: (rect.y + rect.h / 2 - cut.y) / cut.h,
    scale: rect.w / Math.max(1e-6, base.w * cut.w),
    rotation: 0,
  };
}

/** Posição do editor (frações da caixa de corte, sem giro) → caixa da imagem em mm da folha. */
export function boxFromPlacement(p: { x: number; y: number; scale: number }, cut: Box, imageAspect: number): Box {
  const base = containFraction(imageAspect, cut.w / cut.h);
  const w = base.w * cut.w * p.scale;
  const h = base.h * cut.h * p.scale;
  return { x: cut.x + p.x * cut.w - w / 2, y: cut.y + p.y * cut.h - h / 2, w, h };
}

/**
 * Encaixe automático de um arquivo recém-enviado: reconhece se ele já está no gabarito (folha inteira, com
 * sangria, tamanho final) e devolve a posição do editor (frações do corte) — ou cobre a sangria.
 */
export function autoPlacement(px: Mm, physical: Mm | null | undefined, page: TemplatePage, panel: TemplatePanel, mode: FitMode = "auto") {
  const match = matchArtwork(px, page, panel, physical);
  const rect = placeArtwork(mode, match, px, page, panel);
  return { match, rect, placement: placementFromBox(rect, panel.cut, px.w / Math.max(1, px.h)) };
}

/**
 * Do gabarito como ele é baixado (folha na orientação original) para o referencial da peça no editor:
 * giro total (quartos de volta, sentido horário) e o mapa de caixas. Folha girada para a peça (rotatePage)
 * dá 1 quarto; face de peça contínua soma os giros que a deixam de pé.
 */
export function pieceFrame(piece: Piece): { turns: number; original: Mm; toView: (b: Box) => Box } {
  const page = piece.page;
  const rotated = Boolean(page.rotated);
  const original = rotated ? { w: page.sheet.h, h: page.sheet.w } : page.sheet;
  const face = piece.faceIndex !== null;
  const n = face ? (4 - piece.rotate / 90) % 4 : 0;
  const turn = (b: Box, frameH: number): Box => ({ x: frameH - (b.y + b.h), y: b.x, w: b.h, h: b.w });
  const toView = (start: Box): Box => {
    let b = start;
    let frameH = original.h;
    if (rotated) {
      b = turn(b, frameH);
      frameH = original.w;
    }
    if (face) {
      b = { x: b.x - piece.at.x, y: b.y - piece.at.y, w: b.w, h: b.h };
      let fw = piece.at.w;
      let fh = piece.at.h;
      for (let i = 0; i < n; i += 1) {
        b = turn(b, fh);
        [fw, fh] = [fh, fw];
      }
      void fw;
    }
    return b;
  };
  return { turns: ((rotated ? 1 : 0) + n) % 4, original, toView };
}

/** Posição do editor para uma imagem que aparece na caixa `visual` girada `rotation` graus (horário). */
export function placementFromVisual(visual: Box, cut: Box, imageAspect: number, rotation: number, cover = false) {
  const odd = Math.abs(rotation) % 180 === 90;
  const upright = odd ? { x: visual.x + (visual.w - visual.h) / 2, y: visual.y + (visual.h - visual.w) / 2, w: visual.h, h: visual.w } : visual;
  const placement = placementFromBox(upright, cut, imageAspect);
  if (cover) {
    // Caixa reconhecida (folha, sangria, corte) com proporção quase igual: cobre a caixa inteira (corta no
    // máximo a tolerância), em vez de casar só a largura e deixar um filete em cima ou embaixo.
    const base = containFraction(imageAspect, cut.w / cut.h);
    placement.scale = Math.max(upright.w / Math.max(1e-6, base.w * cut.w), upright.h / Math.max(1e-6, base.h * cut.h));
  }
  return { ...placement, rotation: ((rotation % 360) + 360) % 360 > 180 ? (rotation % 360) - 360 : rotation % 360 };
}

/**
 * Encaixe automático de um arquivo numa peça (painel inteiro, face ou mosaico), reconhecendo o arquivo
 * feito em cima do gabarito baixado: a folha inteira (na orientação original) entra 1:1 com o giro da peça;
 * o tamanho com sangria ou final, na orientação da peça ou na original (girado 90°); senão cobre a sangria.
 * `rect` é a caixa da imagem como aparece no editor (frações do corte da peça).
 */
export function autoPlacementFor(piece: Piece, px: Mm, physical?: Mm | null, mode: FitMode = "auto", vector = false): { match: ArtworkMatch; rect: Box; placement: { x: number; y: number; scale: number; rotation: number } } {
  const { panel } = piece;
  const aspect = px.w / Math.max(1, px.h);
  const { turns, original, toView } = pieceFrame(piece);
  const result = (match: ArtworkMatch, rect: Box, rotation: number) => ({ match, rect, placement: placementFromVisual(rect, panel.cut, aspect, rotation, match !== "other") });
  if (mode !== "auto") return result("other", placeArtwork(mode, "other", px, piece.view, panel), 0);
  const bleed = { w: panel.bleed.w, h: panel.bleed.h };
  const cut = { w: panel.cut.w, h: panel.cut.h };
  // Sem medida física, o arquivo só conta como "feito no gabarito" (folha, sangria, tamanho final, girado ou
  // não) se a resolução for plausível nessa medida: um logo de 180 px na proporção do banner não é a arte final
  // de 60 × 90 cm (seria esticado a 5 dpi). A folha inteira se mede pela folha; sangria e tamanho final, pela
  // peça. Vetor (SVG) é nítido em qualquer medida.
  const plausible = (size: Mm) => Boolean(physical) || vector || plausibleArtwork(px, size);
  if (!plausible(bleed)) return result("other", coverBox(px, panel.bleed), 0);
  // 1) A folha inteira do gabarito, como foi baixada (vários painéis, ou folha maior que a peça).
  const sheetDiffers = piecesOf(piece.page).length > 1 || piece.page.panels.length > 1 || !(sameSize(original, bleed) || sameSize(original, { w: bleed.h, h: bleed.w }));
  const fitsSheet = physical ? sameSize(physical, original) : aspectGap(aspect, original.w / original.h) <= ASPECT_TOL;
  if (sheetDiffers && fitsSheet && plausible(piece.page.sheet)) return result("sheet", toView({ x: 0, y: 0, w: original.w, h: original.h }), turns * 90);
  // 2) Com sangria ou no tamanho final, na orientação da peça.
  const straight = matchArtwork(px, { ...piece.view, panels: [panel] }, panel, physical);
  if (straight === "bleed" || straight === "trim") return result(straight, placeArtwork("auto", straight, px, piece.view, panel), 0);
  // 3) Idem na outra orientação: o gabarito baixado estava deitado (peça girada para editar) ou o gabarito traz
  // as versões horizontal e vertical e o cliente montou na outra. É a mesma peça: entra girada 90°.
  {
    const swapped = (m: Mm): Mm => ({ w: m.h, h: m.w });
    const sb = swapped(bleed);
    const sc = swapped(cut);
    const turned = physical ? (sameSize(physical, sb) ? "bleed" : sameSize(physical, sc) ? "trim" : null) : aspectGap(aspect, sb.w / sb.h) <= ASPECT_TOL ? "bleed" : aspectGap(aspect, sc.w / sc.h) <= ASPECT_TOL ? "trim" : null;
    if (turned && !(sameSize(bleed, sb) || aspectGap(bleed.w / bleed.h, sb.w / sb.h) <= ASPECT_TOL)) {
      const box = turned === "bleed" ? panel.bleed : panel.cut;
      return result(turned, { x: box.x, y: box.y, w: box.w, h: box.h }, turns % 2 === 1 ? turns * 90 : (turns * 90 + 90) % 360);
    }
  }
  return result("other", coverBox(px, panel.bleed), 0);
}

/** Resolução plausível para uma arte final dessa medida (peças grandes, vistas de longe, aceitam menos pontos). */
export function plausibleArtwork(px: Mm, sheet: Mm): boolean {
  const longMm = Math.max(sheet.w, sheet.h);
  if (!(longMm > 0)) return true;
  const dpi = Math.max(px.w, px.h) / (longMm / 25.4);
  return dpi >= (longMm >= 1000 ? 25 : longMm >= 400 ? 50 : 72);
}

/** Sangria em frações da caixa de corte (o editor pinta a área com essa margem em volta). */
export function bleedFractions(panel: TemplatePanel): Sides {
  const { bleed, cut } = panel;
  return {
    left: Math.max(0, cut.x - bleed.x) / cut.w,
    top: Math.max(0, cut.y - bleed.y) / cut.h,
    right: Math.max(0, bleed.x + bleed.w - (cut.x + cut.w)) / cut.w,
    bottom: Math.max(0, bleed.y + bleed.h - (cut.y + cut.h)) / cut.h,
  };
}

// ---------------------------------------------------------------------------------------------- texto

/** 90 → "9 cm"; 297 → "29,7 cm"; 2 → "2 mm"; 1200 → "1,2 m". */
export function formatMm(mm: number): string {
  const n = (v: number, d: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: d });
  if (mm >= 1000) return `${n(mm / 1000, 2)} m`;
  if (mm >= 10) return `${n(Math.round(mm) / 10, 1)} cm`;
  return `${n(mm, 1)} mm`;
}

/**
 * Margem uniforme ("3 mm"), a menor delas ("a partir de 2 mm") quando os lados diferem, ou
 * "até 3 mm, só em alguns lados" quando algum lado não tem margem.
 */
export function formatSides(s: Sides | null): string | null {
  if (!s) return null;
  const values = [s.top, s.right, s.bottom, s.left].map(round1);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max <= 0) return null;
  if (max - min <= 0.6) return formatMm(round1((min + max) / 2));
  return min < 0.3 ? `até ${formatMm(max)}, só em alguns lados` : `a partir de ${formatMm(min)}`;
}

/** Resumo do painel para o cliente: tamanho final, sangria, segurança e forma do corte. */
export function describePanel(panel: TemplatePanel): { final: string; bleed: string | null; safe: string | null; shape: string | null } {
  const { finalMm, bleedMm, safeMm } = panel.metrics;
  const shape = panel.cut.shape === "ellipse" ? (Math.abs(finalMm.w - finalMm.h) < 1 ? "corte redondo" : "corte oval") : panel.cut.shape === "rounded" ? "cantos arredondados" : panel.cut.shape === "custom" ? "corte especial" : null;
  // Sangria implícita (a folha ou o quadro fazem de sangria) conta quando é maior que o corte.
  return { final: `${formatMm(finalMm.w)} × ${formatMm(finalMm.h)}`, bleed: formatSides(bleedMm), safe: formatSides(safeMm), shape };
}
