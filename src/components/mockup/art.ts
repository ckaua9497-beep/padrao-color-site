import type { MockupKind } from "@/lib/mockup-kinds";
import { printQuality, type ImageAnalysis } from "@/lib/image-prep";
import type { LedDesenho } from "@/lib/led-linhas";
import { ART_FONTS, canvasFont, fontFamilyOf, isScriptFont, type ArtFont } from "./fonts";

/** Estilos de layout dos templates de texto. */
export type ArtStyle = "classico" | "moderno" | "retro" | "minimal" | "vibrante" | "elegante";

/** O que o cliente configura no passo "Sua arte". */
export type ArtSettings = {
  /** Produto liso (variação sem personalização): o mockup mostra a peça sem arte nem texto de exemplo. */
  plain?: boolean;
  /** Imagem enviada (data URL), ou null para usar o template. */
  src: string | null;
  fit: "cover" | "contain";
  rotation: 0 | 90 | 180 | 270;
  /** 1 = tamanho do encaixe; até 2,5. */
  zoom: number;
  /** Deslocamento da imagem em fração da área (-0,5 a 0,5). */
  offsetX: number;
  offsetY: number;
  background: string;
  /** Texto da arte (aparece no mockup). */
  text: string;
  font: ArtFont;
  textColor: string;
  /** Layout do template (hierarquia, ornamentos e paleta). */
  style: ArtStyle;
  /** Linha secundária opcional: cargo, contato, @perfil, data. */
  subtext: string;
  /**
   * Posição livre (web-to-print): onde o cliente colocou o texto e a imagem na área de impressão.
   * null/ausente = layout automático do template.
   */
  layout?: ArtLayout | null;
  /** Arte do verso (camisas: logo nas costas; almofadas: verso). null/ausente = sem arte própria no verso. */
  back?: ArtSettings | null;
  /**
   * Artes das outras superfícies do produto (src/lib/superficies.ts), pelo id: as lâminas do photobook, o miolo da
   * agenda, as abas do porta passaporte, os lados da caixa acrílica, as mangas da camisa, as partes do short… Sem a
   * superfície aqui, a peça sai na cor do fundo (como antes).
   */
  faces?: Record<string, ArtSettings> | null;
  /**
   * Processo que limita a cor (src/lib/processo.ts): "gray" = impressão P&B (tons de cinza); "black" = um tom só, na
   * gravação a laser e no talhamento (o escuro vira a gravação, o claro some). Aplicado no fim do paintArt: vale igual no
   * 3D, no editor e no PDF.
   */
  mono?: "gray" | "black" | null;
  /**
   * Verniz localizado (cartão, postal, marcador, lona, adesivo…): o que leva verniz nesta arte. "tudo" (padrão) = imagem
   * e texto, sem o fundo; "imagem" ou "texto" = só essa camada. A máscara sai daqui (varnishMask).
   */
  varnish?: Varnish | null;
  /**
   * Pinta a máscara do verniz em vez da arte: as camadas de `varnish` numa cor e o resto na outra. "black" = arquivo da
   * produção (preto onde vai verniz, branco no resto); "white" = brilho do 3D (clearcoatMap: branco onde vai verniz).
   */
  varnishMask?: "black" | "white" | null;
  /** Cores de LED escolhidas pelo cliente no neon (sobrepõem a cor da opção do produto). */
  ledColors?: string[] | null;
  /**
   * Linhas de LED do quadro acrílico com neon (src/lib/led-linhas.ts), só na frente: o contorno automático do desenho
   * (ligado ou não, com a cor de cada laço) e as linhas do pincel, uma cor por linha.
   */
  led?: LedDesenho | null;
  /** Chinelo: região personalizada ("inteira", "dedos", "meio", "calcanhar"). */
  region?: string | null;
  /** Camisa: manequim no tamanho escolhido e no tipo de corpo (medidas em cm da tabela da API). */
  mannequin?: MannequinSettings | null;
  /**
   * Como a imagem enviada entrou no gabarito oficial (encaixe automático no envio): "sheet" = era a folha
   * inteira do gabarito, "bleed" = já tinha a sangria, "trim" = tamanho final sem sangria (bordas estendidas),
   * "other" = outra proporção (cobre a sangria). `src` = imagem a que o encaixe se refere.
   */
  templateFit?: TemplateFit | null;
};

/**
 * Encaixe automático da imagem (gabarito ou área do mockup). Além do reconhecimento e da posição: o modo
 * (preenchendo a área ou inteira), quanto ficou de fora, se a resolução limitou o tamanho, o modo pedido pelo
 * cliente ("Preencher a área" / "Imagem inteira") e o fundo que o tratador pôs (cor da borda da arte) junto com
 * o fundo que estava antes (volta quando entra outra imagem ou o modo vira "preencher").
 */
export type TemplateFit = {
  match: "sheet" | "bleed" | "trim" | "other";
  src: string;
  placement?: LayerPlacement;
  piece?: string;
  mode?: "fill" | "whole";
  cropLoss?: number;
  limitedByDpi?: boolean;
  chosen?: "fill" | "whole";
  background?: string | null;
  userBackground?: string;
};

/**
 * Posição de um elemento em fração da área de impressão: x/y = centro (0..1); scale 1 = encaixe máximo
 * (cabe inteiro sem girar, sem distorcer); rotation em graus, sentido horário. O paintArt limita à área
 * (clampPlacement): o elemento nunca passa da borda — exceto a imagem encaixada num gabarito
 * (`ArtLayout.overflow`), que pode cobrir a sangria ou ser a folha inteira do gabarito.
 */
export type LayerPlacement = { x: number; y: number; scale: number; rotation: number };

/**
 * `overflow`: a imagem pode passar da área (a área é o corte do gabarito; o que passa vai para a sangria
 * e o resto é aparado). O texto continua sempre inteiro dentro da área.
 */
export type ArtLayout = { text?: LayerPlacement | null; image?: LayerPlacement | null; overflow?: boolean };

export type BodyType = "magro" | "medio" | "cheio";

export type MannequinSettings = {
  size: string;
  body: BodyType;
  /** Medidas da peça no tamanho escolhido (Tabela de Medidas da API), quando houver. */
  widthCm?: number | null;
  lengthCm?: number | null;
};

export const DEFAULT_ART: ArtSettings = {
  src: null,
  // Imagem inteira dentro da área (sem cortar nem passar do limite); "cover" fica só para artes antigas.
  fit: "contain",
  rotation: 0,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  background: "#ffffff",
  text: "",
  font: "figtree",
  textColor: "#000000",
  style: "classico",
  subtext: "",
};

/**
 * Contexto de render que o visualizador e os modelos acrescentam à arte.
 * `kind`: tipo da peça (escolhe o template). `ledColors`: cores do LED já resolvidas (neon).
 * `surface`: cor da peça por baixo da estampa (tecido escuro pede texto claro; no chinelo, a cor fora da região).
 * `opaque`: estampa que cobre o painel inteiro (sublimação de ponta a ponta) — o modelo de vestuário
 * pinta o fundo em vez de deixá-lo transparente para o tecido aparecer.
 * `frontWindow`: fração da largura que fica de frente para a câmera (template e legenda automáticos);
 * substitui a janela padrão do tipo (garrafa térmica: a faixa de 60% já é frente e laterais).
 * `sample`: false = sem texto de exemplo quando o cliente não escreveu nada (verso).
 * `aspect`: proporção real da área (largura ÷ altura). O template escolhe o formato (faixa, largo, quadrado…) por ela, e
 * não pelo canvas: em pixels a proporção sai arredondada, e uma placa de 3,6 × 1,2 m (3:1, bem no limite da faixa)
 * virava "faixa" na textura do 3D e "largo" no editor 2D, com a arte montada de outro jeito.
 */
export type Varnish = "tudo" | "imagem" | "texto";

export type ArtRender = ArtSettings & {
  kind?: MockupKind;
  ledColors?: string[];
  surface?: string;
  opaque?: boolean;
  frontWindow?: number;
  sample?: boolean;
  aspect?: number;
  /** A peça tem verniz localizado (spec.spotVarnish): a textura do 3D ganha a máscara do brilho. */
  spotVarnish?: boolean;
  /** Só uma camada (máscara do verniz): a imagem ou o texto, sem o fundo. */
  paintOnly?: "imagem" | "texto";
};

/** A arte tem algo do cliente (texto, subtexto ou imagem)? Verso vazio = sem impressão no verso. */
export function hasArtContent(art: ArtSettings | null | undefined): boolean {
  return Boolean(art && (art.src || art.text.trim() || (art.subtext ?? "").trim()));
}

/** Verso novo: mesmo estilo, fonte e cores da frente, sem texto nem imagem. */
export function blankBack(front: ArtSettings): ArtSettings {
  return { ...DEFAULT_ART, style: front.style, font: front.font, textColor: front.textColor, background: front.background };
}

/**
 * Arte de uma superfície: "front" = a própria arte, "back" = o verso e as demais em `faces` (vazias saem como o verso
 * novo, com o estilo da frente). Sem `faces`/`back` aninhados, para a superfície não carregar as outras.
 */
export function surfaceArt(art: ArtSettings, id: string): ArtSettings {
  if (id === "front") return art;
  const own = id === "back" ? art.back : art.faces?.[id];
  return { ...(own ?? blankBack(art)), back: null, faces: null };
}

/** A arte com o processo (`mono`) em todas as superfícies, para pintar (a arte guardada fica sem ele). */
export function withMono<T extends ArtSettings>(art: T, mono: ArtSettings["mono"]): T {
  if (!mono) return art;
  const faces = art.faces ? Object.fromEntries(Object.entries(art.faces).map(([id, face]) => [id, { ...face, mono }])) : art.faces;
  return { ...art, mono, ...(art.back ? { back: { ...art.back, mono } } : {}), ...(faces ? { faces } : {}) };
}

/** A arte com a superfície `id` trocada pelo resultado de `update`. */
export function withSurfaceArt(art: ArtSettings, id: string, update: (current: ArtSettings) => ArtSettings): ArtSettings {
  if (id === "front") return update(art);
  const next = { ...update(surfaceArt(art, id)), back: null, faces: null };
  return id === "back" ? { ...art, back: next } : { ...art, faces: { ...(art.faces ?? {}), [id]: next } };
}

/** Ids das superfícies extras com arte (texto ou imagem), na ordem em que foram montadas. */
export function facesWithArt(art: ArtSettings): string[] {
  return Object.entries(art.faces ?? {})
    .filter(([, face]) => hasArtContent(face))
    .map(([id]) => id);
}

// ---------------------------------------------------------------------------
// Neon, chinelo e garrafa térmica

/** Cores de LED do neon (os mesmos tons que lib/mockup.ts lê nas opções do produto). */
export const LED_COLORS = [
  { value: "#eaf6ff", label: "Branco frio" },
  { value: "#ffd9a0", label: "Branco quente" },
  { value: "#ff2a3d", label: "Vermelho" },
  { value: "#ff7a1a", label: "Laranja" },
  { value: "#ffb21a", label: "Âmbar" },
  { value: "#ffe14a", label: "Amarelo" },
  { value: "#39ff7a", label: "Verde" },
  { value: "#5fe3ff", label: "Azul gelo" },
  { value: "#2f6bff", label: "Azul" },
  { value: "#ff4fd8", label: "Rosa" },
  { value: "#a64dff", label: "Roxo" },
] as const;

/** Até três cores de LED: uma por linha do texto (a seguinte acende o subtexto e os extras do estilo). */
export const LED_MAX = 3;

/** Nome da cor de LED (a cor padrão dos produtos sem opção também tem nome). */
export function ledColorName(value: string): string {
  const key = value.trim().toLowerCase();
  if (key === "#38e1ff") return "Azul gelo";
  return LED_COLORS.find((c) => c.value === key)?.label ?? value;
}

export type FlipflopRegion = "inteira" | "dedos" | "meio" | "calcanhar";

/** Chinelo: regiões da palmilha, medidas do calcanhar (0) até a ponta dos dedos (1). */
export const FLIPFLOP_REGIONS: readonly { value: FlipflopRegion; label: string; from: number; to: number }[] = [
  { value: "inteira", label: "Peça inteira", from: 0, to: 1 },
  { value: "dedos", label: "Dedos", from: 0.66, to: 1 },
  { value: "meio", label: "Meio", from: 0.33, to: 0.67 },
  { value: "calcanhar", label: "Calcanhar", from: 0, to: 0.34 },
];

export function flipflopRegion(region: string | null | undefined) {
  return FLIPFLOP_REGIONS.find((r) => r.value === region) ?? FLIPFLOP_REGIONS[0];
}

/** Proporção da área de arte da região escolhida (a palmilha inteira tem `aspect`). */
export function regionAspect(aspect: number, region: string | null | undefined): number {
  const r = flipflopRegion(region);
  return aspect / Math.max(0.05, r.to - r.from);
}

/**
 * Garrafa térmica: a faixa cobre 60% da volta (≈216°); destes, ~60% (≈130°) ficam de frente para a
 * câmera — é onde o template e a legenda automática se apoiam. O cliente pode levar o texto até as laterais.
 */
export const THERMAL_WINDOW = 0.6;

// ---------------------------------------------------------------------------
// Posição livre (editor 2D)

/** Elemento posicionado pelo cliente: em scale 1 cabe inteiro na área (encaixe máximo), sem girar. */
export type LayerInfo = {
  /** Posição efetiva: a do cliente (já limitada à área) ou a equivalente do layout automático. */
  placement: LayerPlacement;
  /** Tamanho em scale 1, sem giro, em fração da largura e da altura da área. */
  base: { w: number; h: number };
  /** true quando o cliente posicionou o elemento (art.layout). */
  free: boolean;
};

/** O que o paintArt desenhou: caixa do texto e da imagem, para o editor 2D pôr as alças. */
export type PaintInfo = { text: LayerInfo | null; image: LayerInfo | null };

/** Menor escala aceita (fração do encaixe máximo). */
export const MIN_LAYER_SCALE = 0.06;

const DEG = Math.PI / 180;

/** Giro em graus, normalizado em (-180, 180]. */
export function normalizeRotation(deg: number): number {
  const r = (((Number.isFinite(deg) ? deg : 0) % 360) + 360) % 360;
  return r > 180 ? r - 360 : r;
}

/** Tamanho que cabe inteiro (contain) para um conteúdo de proporção `content` numa área de proporção `area`. */
export function containBase(content: number, area: number): { w: number; h: number } {
  const c = Number.isFinite(content) && content > 0 ? content : 1;
  const a = Number.isFinite(area) && area > 0 ? area : 1;
  return c >= a ? { w: 1, h: a / c } : { w: c / a, h: 1 };
}

/** Caixa (largura e altura, em fração da área) do elemento girado. `aspect` = largura ÷ altura da área. */
export function layerExtent(base: { w: number; h: number }, scale: number, rotation: number, aspect: number): { w: number; h: number } {
  const t = rotation * DEG;
  const c = Math.abs(Math.cos(t));
  const s = Math.abs(Math.sin(t));
  // Em unidades físicas com a altura da área = 1.
  const pw = base.w * aspect;
  const ph = base.h;
  return { w: ((pw * c + ph * s) * scale) / aspect, h: (pw * s + ph * c) * scale };
}

/** Maior escala em que o elemento girado ainda cabe inteiro na área. */
export function maxLayerScale(base: { w: number; h: number }, rotation: number, aspect: number): number {
  const e = layerExtent(base, 1, rotation, aspect);
  return Math.min(1 / Math.max(e.w, 1e-6), 1 / Math.max(e.h, 1e-6));
}

/** Maior escala da imagem encaixada num gabarito (folha inteira de um gabarito com muitas peças). */
export const MAX_OVERFLOW_SCALE = 60;

/**
 * Mantém o elemento inteiro dentro da área: limita a escala (no giro atual) e depois o centro.
 * `overflow` (imagem num gabarito): pode passar da área, mas continua cobrindo parte dela.
 */
export function clampPlacement(p: LayerPlacement, base: { w: number; h: number }, aspect: number, overflow = false): LayerPlacement {
  const rotation = normalizeRotation(p.rotation);
  if (overflow) {
    const wanted = Number.isFinite(p.scale) ? p.scale : 1;
    const scale = Math.min(MAX_OVERFLOW_SCALE, Math.max(MIN_LAYER_SCALE, wanted));
    const e = layerExtent(base, scale, rotation, aspect);
    // O centro pode sair da área, mas um pedaço (2%) da imagem sempre fica sobre ela.
    const keep = (v: number, half: number) => Math.min(1 + half - 0.02, Math.max(-half + 0.02, Number.isFinite(v) ? v : 0.5));
    return { x: keep(p.x, e.w / 2), y: keep(p.y, e.h / 2), scale, rotation };
  }
  const max = maxLayerScale(base, rotation, aspect);
  const wanted = Number.isFinite(p.scale) ? p.scale : 1;
  const scale = Math.min(max, Math.max(Math.min(MIN_LAYER_SCALE, max), wanted));
  const e = layerExtent(base, scale, rotation, aspect);
  const fit = (v: number, half: number) => (half >= 0.5 ? 0.5 : Math.min(1 - half, Math.max(half, Number.isFinite(v) ? v : 0.5)));
  return { x: fit(p.x, e.w / 2), y: fit(p.y, e.h / 2), scale, rotation };
}

/** Grava a posição livre de um elemento na arte (`overflow`: imagem encaixada num gabarito pode passar da área). */
export function withPlacement(art: ArtSettings, layer: "text" | "image", placement: LayerPlacement | null, overflow?: boolean): ArtSettings {
  const layout: ArtLayout = { ...(art.layout ?? {}), [layer]: placement };
  if (overflow !== undefined) layout.overflow = overflow || undefined;
  return { ...art, layout: layout.text || layout.image ? layout : null };
}

// Arquivo original das imagens enviadas (o 3D usa a cópia reduzida): medida em pixels úteis para a resolução,
// o arquivo para gerar o de impressão (o original, ou o original já tratado: margem cortada, fundo removido;
// no SVG, o vetor) e, no PDF, a medida física da página (mm). `analysis`: o que o tratador automático viu.
type SourceInfo = {
  w: number;
  h: number;
  file?: Blob;
  kind?: "image" | "pdf" | "svg";
  mm?: { w: number; h: number } | null;
  alpha?: boolean;
  /** Vetor (SVG): imprime nítido em qualquer tamanho; o arquivo de impressão é rasterizado no tamanho final. */
  vector?: boolean;
  analysis?: ImageAnalysis;
  /** O que o tratador automático mudou na imagem (para contar ao cliente). */
  treatment?: { trimmed: boolean; backgroundRemoved: boolean };
  /** O arquivo como o cliente enviou ("usar a imagem original", sem corte nem remoção de fundo). */
  original?: File;
};
const SOURCES = new Map<string, SourceInfo>();
/** Imagens em uso agora, por dono (página do produto, vitrine): o despejo nunca tira uma delas. */
const IN_USE = new Map<string, Set<string>>();
const inUse = (src: string) => [...IN_USE.values()].some((set) => set.has(src));

/** Libera uma imagem que saiu de uso: depois de um minuto (pintura e PDF em andamento terminam), se ninguém voltou a usar. */
export function releaseSource(src: string | null | undefined) {
  if (!src) return;
  setTimeout(() => {
    if (inUse(src)) return;
    SOURCES.delete(src);
    if (src.startsWith("blob:")) URL.revokeObjectURL(src);
  }, 60_000);
}

/** Registra o original de uma prévia (URL blob: ou data URL); acima de 12, sai a mais antiga que não está em uso. */
export function registerSource(src: string, info: SourceInfo) {
  SOURCES.set(src, info);
  if (SOURCES.size > 12) {
    const oldest = [...SOURCES.keys()].find((key) => key !== src && !inUse(key));
    if (oldest) {
      SOURCES.delete(oldest);
      if (oldest.startsWith("blob:")) setTimeout(() => !inUse(oldest) && URL.revokeObjectURL(oldest), 60_000);
    }
  }
}

/**
 * As imagens que um dono usa agora (frente e verso da arte). As que ele largou (troca, remoção, saída da
 * página: `srcs` vazio) são liberadas se ninguém mais usa.
 */
export function retainSources(owner: string, srcs: readonly (string | null | undefined)[]) {
  const next = new Set(srcs.filter((src): src is string => Boolean(src)));
  const before = IN_USE.get(owner);
  if (next.size) IN_USE.set(owner, next);
  else IN_USE.delete(owner);
  before?.forEach((src) => {
    if (!next.has(src)) releaseSource(src);
  });
}

/** Pixels úteis do original de uma imagem enviada (image-intake.ts); null se não houver registro. */
export function sourceSizeOf(src: string | null | undefined): { w: number; h: number } | null {
  const info = src ? SOURCES.get(src) : undefined;
  return info ? { w: info.w, h: info.h } : null;
}

/** Arquivo original (imagem ou PDF) e medida física (PDF) de uma arte enviada; null se não houver. */
export function sourceOf(src: string | null | undefined): SourceInfo | null {
  return src ? (SOURCES.get(src) ?? null) : null;
}

/**
 * Qualidade de impressão pela resolução efetiva (pontos por polegada na medida colocada) e pelo tamanho da
 * peça (lado maior em cm): lona e banner, vistos de longe, ficam bons com menos pontos que um cartão.
 */
export function dpiQuality(dpi: number, longCm = 0): "baixa" | "ok" | "ótima" {
  return printQuality(dpi, longCm);
}

export type ArtFamily = "card" | "wrap" | "apparel" | "sign" | "badge" | "neon" | "home";

const FAMILY: Record<MockupKind, ArtFamily> = {
  card: "card",
  sheet: "sign",
  folded: "sign",
  sticker: "badge",
  panel: "sign",
  acrylic: "sign",
  keychain: "badge",
  neon: "neon",
  canvas: "sign",
  mat: "home",
  rug: "home",
  coaster: "badge",
  board: "badge",
  banner: "sign",
  lightbox: "sign",
  rollup: "sign",
  totem: "sign",
  flag: "sign",
  hardware: "sign",
  storefront: "sign",
  cloth: "home",
  mug: "wrap",
  tumbler: "wrap",
  bottle: "wrap",
  tshirt: "apparel",
  cap: "apparel",
  apron: "apparel",
  bandana: "apparel",
  cushion: "home",
  petbed: "home",
  book: "sign",
  tent: "sign",
  bag: "apparel",
  box: "sign",
  paperpack: "sign",
  wallcalendar: "sign",
  passport: "badge",
  hangtag: "badge",
  bookmark: "sign",
  puzzle: "home",
  ruler: "wrap",
  phonestand: "badge",
  wobbler: "badge",
  sock: "home",
  shorts: "apparel",
  swimsuit: "home",
  flipflop: "home",
  pen: "wrap",
  fan: "sign",
  lanyard: "wrap",
  badge: "card",
  wristband: "wrap",
  backpack: "apparel",
  drawstring: "apparel",
  cooler: "apparel",
  duffel: "apparel",
  sleepmask: "home",
  neckpillow: "home",
  lapdesk: "home",
  towel: "home",
  curtain: "home",
  bedding: "home",
  tablecloth: "home",
  wallpaper: "home",
  magnet: "badge",
  cylinder: "sign",
};

export function artFamily(kind: MockupKind | undefined): ArtFamily {
  return kind ? (FAMILY[kind] ?? "sign") : "sign";
}

/** Texto de exemplo de cada família, enquanto o cliente não escreve o dele. */
export const SAMPLE_TEXT: Record<ArtFamily, string> = {
  card: "Seu Nome",
  wrap: "Sua frase aqui",
  apparel: "Sua marca",
  sign: "Sua marca aqui",
  badge: "Sua marca",
  neon: "Sua frase",
  home: "Seu nome",
};

/** Subtexto de exemplo (só aparece enquanto o cliente não escreveu nada). */
export const SAMPLE_SUBTEXT: Record<ArtFamily, string> = {
  card: "Cargo · (21) 99999-0000",
  wrap: "@seuperfil",
  apparel: "Desde 2026",
  sign: "(21) 99999-0000 · @suamarca",
  badge: "@suamarca",
  neon: "",
  home: "Lar doce lar",
};

/** Limite de caracteres do "Texto da arte" por família. */
export const TEXT_LIMIT: Record<ArtFamily, number> = {
  card: 32,
  wrap: 40,
  apparel: 24,
  sign: 48,
  badge: 22,
  neon: 28,
  home: 24,
};

/** Limite de caracteres do subtexto por família. */
export const SUBTEXT_LIMIT: Record<ArtFamily, number> = {
  card: 40,
  wrap: 32,
  apparel: 24,
  sign: 48,
  badge: 24,
  neon: 24,
  home: 28,
};

export const TEXT_COLORS = [
  { value: "#000000", label: "Preto" },
  { value: "#ffffff", label: "Branco" },
  { value: "#ff463a", label: "Coral" },
  { value: "#0888c8", label: "Azul" },
  { value: "#f8e028", label: "Amarelo" },
  { value: "#b0c818", label: "Verde" },
  { value: "#e02888", label: "Magenta" },
  { value: "#e02018", label: "Vermelho" },
  { value: "#f0a000", label: "Âmbar" },
  { value: "#18b0e8", label: "Ciano" },
  { value: "#282e34", label: "Grafite" },
  { value: "#b8862b", label: "Dourado" },
  { value: "#f6f1e7", label: "Creme" },
];

/** Fundos curados do template, cada um com a cor de texto que combina (contraste bom). */
export const ART_BACKGROUNDS = [
  { value: "#ffffff", label: "Branco", ink: "#000000" },
  { value: "#f6f1e7", label: "Papel", ink: "#000000" },
  { value: "#fef8d4", label: "Sol claro", ink: "#000000" },
  { value: "#def3fc", label: "Céu", ink: "#0888c8" },
  { value: "#fce4f0", label: "Rosa", ink: "#e02888" },
  { value: "#f8e028", label: "Amarelo", ink: "#000000" },
  { value: "#f0a000", label: "Âmbar", ink: "#000000" },
  { value: "#ff463a", label: "Coral", ink: "#ffffff" },
  { value: "#e02018", label: "Vermelho", ink: "#ffffff" },
  { value: "#e02888", label: "Magenta", ink: "#ffffff" },
  { value: "#18b0e8", label: "Ciano", ink: "#000000" },
  { value: "#0888c8", label: "Azul", ink: "#ffffff" },
  { value: "#b0c818", label: "Lima", ink: "#000000" },
  { value: "#282e34", label: "Grafite", ink: "#f6f1e7" },
  { value: "#17171c", label: "Noite", ink: "#b8862b" },
  { value: "#000000", label: "Preto", ink: "#ffffff" },
];

/** Estilos do template: nome, descrição curta e a fonte sugerida ao escolher o estilo. */
export const ART_STYLES: readonly { value: ArtStyle; label: string; hint: string; font: ArtFont }[] = [
  { value: "classico", label: "Clássico", hint: "Centralizado, filete coral e faixa de cores", font: "figtree" },
  { value: "moderno", label: "Moderno", hint: "Grade suíça e blocos geométricos", font: "unbounded" },
  { value: "retro", label: "Retrô", hint: "Raios de sol, letra com volume e faixas anos 70", font: "fraunces" },
  { value: "minimal", label: "Minimal", hint: "Muito respiro e traço fino", font: "figtree" },
  { value: "vibrante", label: "Vibrante", hint: "Adesivo, confete e todas as cores", font: "righteous" },
  { value: "elegante", label: "Elegante", hint: "Moldura fina, dourado e ornamentos", font: "playfair" },
];

const STYLE_KEYS = new Set<string>(ART_STYLES.map((s) => s.value));

/** Estilo válido (artes antigas sem o campo caem no clássico). */
export function styleOf(style: string | undefined): ArtStyle {
  return style && STYLE_KEYS.has(style) ? (style as ArtStyle) : "classico";
}

export function styleLabel(style: string | undefined): string {
  const key = styleOf(style);
  return ART_STYLES.find((s) => s.value === key)?.label ?? "Clássico";
}

const C = {
  red: "#e02018",
  amber: "#f0a000",
  sun: "#f8e028",
  lime: "#b0c818",
  cyan: "#18b0e8",
  blue: "#0888c8",
  magenta: "#e02888",
  coral: "#ff463a",
  ink: "#000000",
  gold: "#b8862b",
  paleGold: "#d9b45a",
} as const;

const SPECTRUM = [C.red, C.amber, C.sun, C.lime, C.cyan, C.blue, C.magenta];

export function fontFamily(): string {
  return fontFamilyOf("figtree");
}

export type ArtVariant = "front" | "gray" | "blank" | "neon";

function canvasFor(aspect: number, longSide = 1024) {
  const canvas = document.createElement("canvas");
  const safe = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  if (safe >= 1) {
    canvas.width = longSide;
    canvas.height = Math.max(64, Math.round(longSide / safe));
  } else {
    canvas.height = longSide;
    canvas.width = Math.max(64, Math.round(longSide * safe));
  }
  return canvas;
}

// ---------------------------------------------------------------------------
// Cor

function parseHex(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(color: string): number {
  const [r, g, b] = (parseHex(color) ?? [128, 128, 128]).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG entre duas cores hex (1 a 21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Preto ou branco, o que lê melhor sobre o fundo. */
export function readableInk(bg: string): string {
  return contrastRatio("#000000", bg) >= contrastRatio("#ffffff", bg) ? "#000000" : "#ffffff";
}

function rgba(color: string, a: number): string {
  const rgb = parseHex(color);
  return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})` : color;
}

function mix(a: string, b: string, t: number): string {
  const x = parseHex(a) ?? [128, 128, 128];
  const y = parseHex(b) ?? [128, 128, 128];
  const out = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Primeira cor da lista com contraste mínimo contra todas as referências; senão a de maior contraste. */
function pick(candidates: readonly string[], against: readonly string[], min: number): string {
  let best = candidates[0];
  let bestScore = -1;
  for (const color of candidates) {
    const score = Math.min(...against.map((ref) => contrastRatio(color, ref)));
    if (score >= min) return color;
    if (score > bestScore) {
      best = color;
      bestScore = score;
    }
  }
  return best;
}

/** Aleatório determinístico (mesma peça = mesmo confete a cada repintura). */
function seeded(seedText: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let t = h >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Tipografia

type Type = {
  font: ArtFont;
  /** Peso nas fontes variáveis. */
  weight?: number;
  italic?: boolean;
  /** Espaçamento entre letras, em em. */
  tracking?: number;
  caps?: boolean;
  lineHeight?: number;
};

type Fit = { lines: string[]; size: number; lh: number; type: Type };

type Paint = {
  fill: string;
  /** Contorno por fora (adesivo). */
  stroke?: string;
  strokeW?: number;
  /** Volume: cópias deslocadas na diagonal, em em. */
  extrude?: string;
  depth?: number;
  /** Sombra projetada sólida (deslocada), em em. */
  drop?: string;
  dropOffset?: number;
  /** Sombra suave. */
  shadow?: string;
  shadowBlur?: number;
};

const NO_FIT: Fit = { lines: [], size: 0, lh: 1, type: { font: "figtree" } };

function trackingPx(type: Type, size: number): number {
  return isScriptFont(type.font) ? 0 : (type.tracking ?? 0) * size;
}

function setType(ctx: CanvasRenderingContext2D, type: Type, size: number) {
  ctx.font = canvasFont(type.font, size, type.italic, type.weight);
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${Math.round(trackingPx(type, size) * 10) / 10}px`;
}

function wrapWords(ctx: CanvasRenderingContext2D, words: string[], maxW: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (!current || ctx.measureText(attempt).width <= maxW) current = attempt;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function widest(ctx: CanvasRenderingContext2D, lines: string[]): number {
  let max = 0;
  for (const line of lines) max = Math.max(max, ctx.measureText(line).width);
  return max;
}

/** Quebra o texto em até `maxLines` linhas equilibradas e acha o maior corpo que cabe na caixa. */
function fitText(ctx: CanvasRenderingContext2D, raw: string, type: Type, boxW: number, boxH: number, maxSize: number, maxLines: number): Fit {
  const text = type.caps && !isScriptFont(type.font) ? raw.toLocaleUpperCase("pt-BR") : raw;
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lh = type.lineHeight ?? 1.08;
  if (!words.length || !(boxW > 2) || !(boxH > 2) || !(maxSize > 1)) return { ...NO_FIT, lh, type };
  let size = Math.max(4, Math.min(maxSize, boxH / (lh * 0.92)));
  let lines = [words.join(" ")];
  for (;;) {
    setType(ctx, type, size);
    lines = wrapWords(ctx, words, boxW);
    const height = (lines.length - 1) * size * lh + size * 0.92;
    if (lines.length <= Math.max(1, maxLines) && widest(ctx, lines) <= boxW && height <= boxH) break;
    if (size <= 4) {
      if (lines.length > maxLines) lines = [...lines.slice(0, Math.max(1, maxLines) - 1), lines.slice(Math.max(1, maxLines) - 1).join(" ")];
      break;
    }
    size = Math.max(4, size - Math.max(0.5, size * 0.06));
  }
  // Equilibra as linhas: estreita a caixa enquanto o número de linhas não muda.
  if (lines.length > 1) {
    let narrow = widest(ctx, lines);
    for (let i = 0; i < 8; i += 1) {
      const tryW = narrow * 0.93;
      const next = wrapWords(ctx, words, tryW);
      const nextW = widest(ctx, next);
      if (next.length !== lines.length || nextW > tryW + 0.5) break;
      lines = next;
      narrow = nextW;
    }
  }
  return { lines, size, lh, type };
}

function blockHeight(fit: Fit): number {
  return fit.lines.length ? (fit.lines.length - 1) * fit.size * fit.lh + fit.size * 0.92 : 0;
}

function fitWidth(ctx: CanvasRenderingContext2D, fit: Fit): number {
  if (!fit.lines.length) return 0;
  setType(ctx, fit.type, fit.size);
  return widest(ctx, fit.lines) - trackingPx(fit.type, fit.size);
}

type Align = "left" | "center" | "right";

/** Caixa do texto desenhado (com contorno, volume e sombra) somada à caixa do bloco. */
function growTextBox(ctx: CanvasRenderingContext2D, layer: LayerControl, fit: Fit, ax: number, cy: number, align: Align, paint: Paint) {
  const size = fit.size;
  const step = size * fit.lh;
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const line of fit.lines) {
    const lw = ctx.measureText(line).width;
    const left = align === "center" ? ax - lw / 2 : align === "right" ? ax - lw : ax;
    x0 = Math.min(x0, left);
    x1 = Math.max(x1, left + lw);
  }
  const half = ((fit.lines.length - 1) * step) / 2 + size * 0.62;
  const extra = size * ((paint.stroke ? (paint.strokeW ?? 0.14) / 2 : 0) + (paint.extrude ? (paint.depth ?? 0.07) : 0) + (paint.drop ? (paint.dropOffset ?? 0.07) : 0) + (paint.shadow ? (paint.shadowBlur ?? 0.1) * 0.5 : 0));
  growBox(layer, x0 - extra, cy - half - extra, x1 - x0 + extra * 2, half * 2 + extra * 2);
}

function drawFit(ctx: CanvasRenderingContext2D, fit: Fit, x: number, cy: number, align: Align, paint: Paint, layer: LayerControl | null = null) {
  if (!fit.lines.length) return;
  ctx.save();
  setType(ctx, fit.type, fit.size);
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  // O espaçamento entra depois da última letra: compensa para centralizar de verdade.
  const track = trackingPx(fit.type, fit.size);
  const ax = x + (align === "center" ? track / 2 : align === "right" ? track : 0);
  if (layer?.marked) growTextBox(ctx, layer, fit, ax, cy, align, paint);
  const step = fit.size * fit.lh;
  const size = fit.size;
  fit.lines.forEach((line, i) => {
    const y = cy + (i - (fit.lines.length - 1) / 2) * step;
    if (paint.drop) {
      const d = (paint.dropOffset ?? 0.07) * size;
      ctx.fillStyle = paint.drop;
      ctx.strokeStyle = paint.drop;
      if (paint.stroke) {
        ctx.lineWidth = (paint.strokeW ?? 0.14) * size;
        ctx.strokeText(line, ax + d, y + d);
      }
      ctx.fillText(line, ax + d, y + d);
    }
    if (paint.extrude) {
      const depth = (paint.depth ?? 0.07) * size;
      const steps = Math.min(12, Math.max(2, Math.ceil(depth / Math.max(1, size * 0.012))));
      ctx.fillStyle = paint.extrude;
      for (let k = steps; k >= 1; k -= 1) ctx.fillText(line, ax + (depth * k) / steps, y + (depth * k) / steps);
    }
    if (paint.stroke) {
      ctx.strokeStyle = paint.stroke;
      ctx.lineWidth = (paint.strokeW ?? 0.14) * size;
      ctx.strokeText(line, ax, y);
    }
    if (paint.shadow) {
      ctx.shadowColor = paint.shadow;
      ctx.shadowBlur = (paint.shadowBlur ?? 0.1) * size;
      ctx.shadowOffsetY = size * 0.03;
    }
    ctx.fillStyle = paint.fill;
    ctx.fillText(line, ax, y);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  });
  ctx.restore();
}

/** Texto em arco (selos): `bottom` lê da esquerda para a direita por baixo, com as letras em pé. */
function arcText(ctx: CanvasRenderingContext2D, raw: string, cx: number, cy: number, r: number, maxSize: number, maxSpan: number, type: Type, color: string, bottom: boolean, layer: LayerControl | null = null) {
  const text = type.caps && !isScriptFont(type.font) ? raw.toLocaleUpperCase("pt-BR") : raw;
  const chars = [...text.trim()];
  if (!chars.length || r <= 0) return;
  ctx.save();
  let size = maxSize;
  ctx.font = canvasFont(type.font, size, type.italic, type.weight);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  const measure = () => {
    const gap = trackingPx(type, size);
    const widths = chars.map((c) => ctx.measureText(c).width + gap);
    return { widths, total: widths.reduce((a, b) => a + b, 0) - gap };
  };
  let { widths, total } = measure();
  if (total / r > maxSpan) {
    size = Math.max(4, size * ((maxSpan * r) / total));
    ctx.font = canvasFont(type.font, size, type.italic, type.weight);
    ({ widths, total } = measure());
  }
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const center = bottom ? Math.PI / 2 : -Math.PI / 2;
  let angle = bottom ? center + total / r / 2 : center - total / r / 2;
  chars.forEach((char, i) => {
    const half = (widths[i] - trackingPx(type, size)) / 2 / r;
    const theta = bottom ? angle - half : angle + half;
    if (layer?.marked) growBox(layer, cx + r * Math.cos(theta) - size * 0.6, cy + r * Math.sin(theta) - size * 0.6, size * 1.2, size * 1.2);
    ctx.save();
    ctx.translate(cx + r * Math.cos(theta), cy + r * Math.sin(theta));
    ctx.rotate(bottom ? theta - Math.PI / 2 : theta + Math.PI / 2);
    ctx.fillText(char, 0, 0);
    ctx.restore();
    angle = bottom ? angle - widths[i] / r : angle + widths[i] / r;
  });
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Cena: tudo o que um estilo precisa para desenhar

type Shape = "strip" | "wide" | "square" | "tall" | "pole";
type Box = { x: number; y: number; w: number; h: number };

type Scene = {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  unit: number;
  shape: Shape;
  family: ArtFamily;
  text: string;
  sub: string;
  font: ArtFont;
  ink: string;
  /** Cor do fundo (ou a de contraste com o texto, quando o fundo é o tecido). */
  bg: string;
  /** Contorno e placas: a cor que mais contrasta com o texto. */
  paper: string;
  accent: string;
  accent2: string;
  transparent: boolean;
  rng: () => number;
  /** Separação entre o quadro do estilo e o bloco de texto (posição livre); null = desenho direto. */
  layer: LayerControl | null;
};

/*
 * Bloco de texto móvel. Cada estilo desenha o quadro (fundo, padrões, molduras) e, a partir de uma marca,
 * o bloco: o texto e o que acompanha o texto (placa, selo, fita, divisor, estrelas). A marca é o primeiro
 * stack()/inline() ou um begin(s, caixa) explícito antes de uma placa/selo.
 * - "auto": desenha tudo e mede o bloco (caixa em coordenadas da área).
 * - "frame": desenha só o que vem antes da marca (o quadro fica parado).
 * - "block": desenha só o que vem depois da marca, com o mapeamento da caixa automática para a posição do
 *   cliente aplicado sobre a transformação em uso (texto continua vetorial, sem perder nitidez).
 */
type LayerControl = {
  phase: "auto" | "frame" | "block";
  /** Contexto real (o da cena pode ser o proxy). */
  ctx: CanvasRenderingContext2D;
  /** Transformação no início da área (região do chinelo) e a sua inversa. */
  base: DOMMatrix;
  inverse: DOMMatrix;
  marked: boolean;
  /** Profundidade de save() (proxy) e a do momento da marca. */
  depth: number;
  markDepth: number;
  /** Mapeamento do bloco, em coordenadas do canvas (fase "block"). */
  mapping: DOMMatrix | null;
  /** Caixa do bloco em coordenadas da área (fases "auto" e "frame"). */
  box: { x0: number; y0: number; x1: number; y1: number } | null;
  /** O bloco tem placa/selo (begin com caixa): a caixa já cobre os ornamentos, sem folga extra. */
  container: boolean;
};

function layerControl(ctx: CanvasRenderingContext2D, phase: LayerControl["phase"]): LayerControl {
  const base = ctx.getTransform();
  return { phase, ctx, base, inverse: base.inverse(), marked: false, depth: 0, markDepth: 0, mapping: null, box: null, container: false };
}

/** Soma à caixa do bloco um retângulo no referencial em uso (convertido para coordenadas da área). */
function growBox(layer: LayerControl, x: number, y: number, w: number, h: number) {
  if (layer.phase === "block" || !(w > 0) || !(h > 0)) return;
  const m = layer.inverse.multiply(layer.ctx.getTransform());
  for (const [px, py] of [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
  ]) {
    const p = m.transformPoint(new DOMPoint(px, py));
    const box = layer.box;
    if (!box) layer.box = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    else {
      box.x0 = Math.min(box.x0, p.x);
      box.y0 = Math.min(box.y0, p.y);
      box.x1 = Math.max(box.x1, p.x);
      box.y1 = Math.max(box.y1, p.y);
    }
  }
}

function applyMapping(layer: LayerControl) {
  if (layer.mapping) layer.ctx.setTransform(layer.mapping.multiply(layer.ctx.getTransform()));
}

/**
 * Começo do bloco de texto. Sem caixa: marca no primeiro texto. Com caixa: placa/selo que acompanha o
 * texto (entra na caixa do bloco e se move com ele).
 */
function begin(s: Scene, rect?: Box) {
  const layer = s.layer;
  if (!layer) return;
  if (!layer.marked) {
    layer.marked = true;
    layer.markDepth = layer.depth;
    if (layer.phase === "block") applyMapping(layer);
  }
  if (rect) {
    layer.container = true;
    growBox(layer, rect.x, rect.y, rect.w, rect.h);
  }
}

const DRAW_CALLS = new Set<PropertyKey>(["fill", "stroke", "fillRect", "strokeRect", "fillText", "strokeText", "drawImage", "putImageData", "clearRect"]);
const noop = () => undefined;

/** Contexto que cala os desenhos fora da fase (quadro ou bloco) e reaplica o mapeamento após restore(). */
function layerContext(layer: LayerControl): CanvasRenderingContext2D {
  const ctx = layer.ctx;
  if (layer.phase === "auto") return ctx;
  const bound = new Map<PropertyKey, unknown>();
  return new Proxy(ctx, {
    get(target, key) {
      if (key === "save") {
        return () => {
          layer.depth += 1;
          target.save();
        };
      }
      if (key === "restore") {
        return () => {
          target.restore();
          layer.depth = Math.max(0, layer.depth - 1);
          // Voltou a um estado salvo antes da marca: o mapeamento do bloco precisa valer de novo.
          if (layer.phase === "block" && layer.marked && layer.depth < layer.markDepth) {
            layer.markDepth = layer.depth;
            applyMapping(layer);
          }
        };
      }
      if (DRAW_CALLS.has(key) && (layer.phase === "frame" ? layer.marked : !layer.marked)) return noop;
      const value: unknown = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      let fn = bound.get(key);
      if (!fn) {
        fn = (value as (...args: unknown[]) => unknown).bind(target);
        bound.set(key, fn);
      }
      return fn;
    },
    set: (target, key, value) => Reflect.set(target, key, value, target),
  });
}

function shapeOf(aspect: number): Shape {
  if (aspect >= 3) return "strip";
  if (aspect >= 1.35) return "wide";
  if (aspect > 0.74) return "square";
  if (aspect >= 0.4) return "tall";
  return "pole";
}

const MAX_LINES: Record<Shape, number> = { strip: 1, wide: 2, square: 3, tall: 4, pole: 5 };

const ACCENTS: Record<ArtStyle, { primary: readonly string[]; secondary: readonly string[] }> = {
  classico: { primary: [C.coral, C.red, C.amber, C.sun], secondary: [C.ink, "#ffffff"] },
  moderno: { primary: [C.blue, C.cyan, C.magenta, C.sun], secondary: [C.cyan, C.sun, C.magenta, C.blue] },
  retro: { primary: [C.amber, C.sun, C.red], secondary: [C.red, C.magenta, C.amber, C.blue] },
  minimal: { primary: [C.coral, C.red, C.sun], secondary: [C.ink, "#ffffff"] },
  vibrante: { primary: [C.magenta, C.cyan, C.sun], secondary: [C.magenta, C.blue, C.red, C.cyan] },
  elegante: { primary: [C.gold, C.paleGold, C.amber], secondary: [C.ink, "#ffffff"] },
};

type SceneOpts = { transparent: boolean; sample: boolean; surface?: string; layer?: LayerControl | null };

function makeScene(ctx: CanvasRenderingContext2D, w: number, h: number, art: ArtRender, label: string, opts: SceneOpts): Scene {
  const family = artFamily(art.kind);
  const style = styleOf(art.style);
  let text = art.text.trim();
  let sub = (art.subtext ?? "").trim();
  // Só o subtexto escrito: ele vira o texto principal (nunca mistura com o texto de exemplo).
  if (!text && sub) {
    text = sub;
    sub = "";
  }
  if (!text && opts.sample) {
    text = SAMPLE_TEXT[family];
    sub = SAMPLE_SUBTEXT[family];
  }
  let ink = art.textColor;
  // Estampa direto no tecido: texto escuro em peça escura (ou claro em clara) troca para o que aparece.
  if (opts.transparent && opts.surface && contrastRatio(ink, opts.surface) < 2.2) ink = readableInk(opts.surface);
  const bg = opts.transparent ? (opts.surface ?? readableInk(ink)) : art.background;
  // Texto invisível (mesma cor do fundo) vira preto ou branco.
  if (!opts.transparent && contrastRatio(ink, bg) < 1.35) ink = readableInk(bg);
  const accents = ACCENTS[style];
  const accent = pick(accents.primary, [bg], 1.7);
  const accent2 = pick(accents.secondary, [bg, ink, accent], 1.3);
  const layer = opts.layer ?? null;
  return {
    ctx: layer ? layerContext(layer) : ctx,
    w,
    h,
    unit: Math.min(w, h),
    shape: shapeOf(art.aspect && Number.isFinite(art.aspect) && art.aspect > 0 ? art.aspect : w / h),
    family,
    text,
    sub,
    font: ART_FONTS[art.font] ? art.font : "figtree",
    ink,
    bg,
    paper: readableInk(ink),
    accent,
    accent2,
    transparent: opts.transparent,
    rng: seeded(`${label}|${style}|${family}`),
    layer,
  };
}

type StackOpts = {
  box: Box;
  main: Type;
  sub: Type;
  mainMax: number;
  maxLines: number;
  mainPaint: Paint;
  subPaint: Paint;
  align?: Align;
  valign?: "top" | "center" | "bottom";
  /** Corpo máximo do subtexto em relação ao texto principal. */
  subRatio?: number;
  subLines?: number;
  /** Espaço entre os blocos, em em do texto principal. */
  gap?: number;
  /** Ornamento entre o texto e o subtexto (altura em px). */
  dividerH?: number;
  divider?: (x: number, y: number, mainW: number) => void;
  /** Placa atrás do subtexto (fita, pílula, bloco); recebe também a largura do texto principal. */
  subPlate?: (x: number, y: number, w: number, h: number, mainW: number) => void;
  /** O estilo desenha o subtexto em outro lugar (arco do selo). */
  noSub?: boolean;
};

type Placed = { top: number; bottom: number; mainBottom: number; mainW: number; size: number; left: number; right: number };

/** Texto principal + ornamento + subtexto empilhados e centralizados na caixa. */
function stack(s: Scene, o: StackOpts): Placed {
  const { ctx } = s;
  const { box } = o;
  begin(s);
  const layer = s.layer;
  const align = o.align ?? "center";
  const subText = o.noSub ? "" : s.sub;
  const dividerH = o.divider ? (o.dividerH ?? 0) : 0;
  const subShare = subText ? 0.3 : 0;
  const mainF = fitText(ctx, s.text, o.main, box.w, Math.max(4, box.h * (1 - subShare) - dividerH), o.mainMax, o.maxLines);
  const mainH = blockHeight(mainF);
  const plate = Boolean(o.subPlate);
  let subF = NO_FIT;
  if (subText) {
    const subMax = Math.max(4, Math.max(mainF.size, 12) * (o.subRatio ?? 0.34));
    subF = fitText(ctx, subText, o.sub, box.w * (plate ? 0.8 : 1), Math.max(4, box.h * subShare * (plate ? 0.6 : 1)), subMax, o.subLines ?? 1);
  }
  const gap = Math.max(mainF.size, 12) * (o.gap ?? 0.3);
  const subH = subF.lines.length ? blockHeight(subF) + (plate ? subF.size * 0.95 : 0) : 0;
  const total = mainH + (dividerH ? gap + dividerH : 0) + (subH ? gap + subH : 0);
  const top = o.valign === "top" ? box.y : o.valign === "bottom" ? box.y + box.h - total : box.y + (box.h - total) / 2;
  const anchor = align === "left" ? box.x : align === "right" ? box.x + box.w : box.x + box.w / 2;
  const mainW = fitWidth(ctx, mainF);
  drawFit(ctx, mainF, anchor, top + mainH / 2, align, o.mainPaint, layer);
  let y = top + mainH;
  if (dividerH && o.divider) {
    y += gap;
    if (layer?.marked) {
      // Divisores (filete, losangos) podem ser mais largos que um nome curto.
      const dw = Math.max(mainW, s.unit * 0.26);
      growBox(layer, align === "left" ? anchor : align === "right" ? anchor - dw : anchor - dw / 2, y - dividerH, dw, dividerH * 3);
    }
    o.divider(anchor, y + dividerH / 2, mainW);
    y += dividerH;
  }
  if (subH) {
    y += gap;
    const cy = y + subH / 2;
    if (o.subPlate) {
      const pad = subF.size * 0.85;
      const sw = fitWidth(ctx, subF) + pad * 2;
      const sx = align === "left" ? anchor : align === "right" ? anchor - sw : anchor - sw / 2;
      // A placa (fita, pílula) entra inteira na caixa do bloco, com as pontas da fita.
      if (layer?.marked) growBox(layer, sx - subH * 0.7, y, sw + subH * 1.4, subH * 1.25);
      o.subPlate(sx, y, sw, subH, mainW);
      drawFit(ctx, subF, align === "left" ? anchor + pad : align === "right" ? anchor - pad : anchor, cy, align, o.subPaint, layer);
    } else {
      drawFit(ctx, subF, anchor, cy, align, o.subPaint, layer);
    }
    y += subH;
  }
  const left = align === "left" ? anchor : align === "right" ? anchor - mainW : anchor - mainW / 2;
  return { top, bottom: y, mainBottom: top + mainH, mainW, size: mainF.size, left, right: left + mainW };
}

type InlineOpts = {
  box: Box;
  main: Type;
  sub: Type;
  mainPaint: Paint;
  subPaint: Paint;
  /** "spread": texto à esquerda, subtexto encostado à direita. */
  align?: "center" | "left" | "spread";
  /** Separador entre os dois: largura em em e o desenho no espaço reservado. */
  sep?: { width: number; draw: (x0: number, x1: number, cy: number, size: number) => void };
  subPlate?: (x: number, y: number, w: number, h: number) => void;
  mainMax?: number;
};

/** Faixas compridas (caneta, régua, pulseira, cordão): tudo numa linha só. */
function inline(s: Scene, o: InlineOpts): { left: number; right: number; cy: number; size: number } {
  const { ctx } = s;
  const { box } = o;
  begin(s);
  const layer = s.layer;
  const hasSub = Boolean(s.sub);
  const mainMax = Math.min(o.mainMax ?? box.h * 0.7, box.h * 0.8);
  // Divide a largura pela proporção natural dos dois textos (subtexto longo não vira miniatura).
  let share = 1;
  if (hasSub) {
    setType(ctx, o.main, 100);
    const mainNat = ctx.measureText(s.text).width;
    setType(ctx, o.sub, 46);
    const subNat = ctx.measureText(s.sub).width;
    share = Math.min(0.8, Math.max(0.5, mainNat / Math.max(1, mainNat + subNat)));
  }
  const mainF = fitText(ctx, s.text, o.main, box.w * (hasSub ? share - 0.06 : 1), box.h, mainMax, 1);
  const subF = hasSub ? fitText(ctx, s.sub, o.sub, box.w * (1 - share - 0.06), box.h * 0.6, Math.max(4, mainF.size * 0.46), 1) : NO_FIT;
  const mainW = fitWidth(ctx, mainF);
  const pad = subF.size * 0.85;
  const subW = subF.lines.length ? fitWidth(ctx, subF) + (o.subPlate ? pad * 2 : 0) : 0;
  const gap = mainF.size * 0.42;
  const sepW = subW && o.sep ? o.sep.width * mainF.size : 0;
  const cy = box.y + box.h / 2;
  const total = mainW + (subW ? gap + sepW + (sepW ? gap : 0) + subW : 0);
  const spread = o.align === "spread" && subW > 0;
  const x0 = o.align === "left" || spread ? box.x : box.x + (box.w - total) / 2;
  drawFit(ctx, mainF, x0, cy, "left", o.mainPaint, layer);
  let x = x0 + mainW;
  if (subW) {
    const subX = spread ? box.x + box.w - subW : x + gap + sepW + (sepW ? gap : 0);
    if (o.sep) o.sep.draw(x + gap, subX - (sepW ? gap : 0), cy, mainF.size);
    if (o.subPlate) {
      const ph = blockHeight(subF) + subF.size * 0.95;
      if (layer?.marked) growBox(layer, subX, cy - ph / 2, subW, ph);
      o.subPlate(subX, cy - ph / 2, subW, ph);
      drawFit(ctx, subF, subX + pad, cy, "left", o.subPaint, layer);
    } else {
      drawFit(ctx, subF, subX, cy, "left", o.subPaint, layer);
    }
    x = subX + subW;
  }
  return { left: x0, right: x, cy, size: mainF.size };
}

// ---------------------------------------------------------------------------
// Ornamentos

/** Os quatro cartões coloridos do símbolo da Padrão, usados como "logo de exemplo". */
function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const cardW = size;
  const cardH = size * 0.62;
  ["#e02018", "#f8e028", "#18b0e8", "#b0c818"].forEach((color, i) => {
    ctx.save();
    ctx.translate(x + i * cardW * 0.08, y + i * cardH * 0.12);
    ctx.rotate((-8 + i * 4) * (Math.PI / 180));
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(0, 0, cardW, cardH, cardH * 0.18);
    ctx.fill();
    ctx.restore();
  });
}

/** Largura e altura aproximadas do símbolo desenhado com `size`. */
const MARK_W = 1.3;
const MARK_H = 1.15;

function spectrumBand(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  SPECTRUM.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + (w / SPECTRUM.length) * i, y, w / SPECTRUM.length + 1, h);
  });
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.7, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.7, y);
  ctx.closePath();
  ctx.fill();
}

function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number, points: number, rotation = 0) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 ? inner : outer;
    const a = rotation - Math.PI / 2 + (i * Math.PI) / points;
    ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
  }
  ctx.closePath();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  starPath(ctx, x, y, r, r * 0.45, 5);
  ctx.fill();
}

/** Raios de sol alternados a partir de um ponto. */
function sunburst(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, rays: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < rays; i += 1) {
    const a0 = (i * Math.PI * 2) / rays;
    const a1 = a0 + Math.PI / rays;
    ctx.moveTo(x, y);
    ctx.lineTo(x + radius * Math.cos(a0), y + radius * Math.sin(a0));
    ctx.lineTo(x + radius * Math.cos(a1), y + radius * Math.sin(a1));
    ctx.closePath();
  }
  ctx.fill();
}

/** Três faixas finas paralelas (vermelho, âmbar, amarelo) — o "anos 70". */
function retroStripes(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, vertical = false) {
  const colors = [C.red, C.amber, C.sun];
  const band = (vertical ? w : h) / 3.4;
  colors.forEach((color, i) => {
    ctx.fillStyle = color;
    if (vertical) ctx.fillRect(x + i * band * 1.2, y, band, h);
    else ctx.fillRect(x, y + i * band * 1.2, w, band);
  });
}

/** Fita com pontas recortadas (subtexto do retrô). */
function ribbon(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  const tail = h * 0.7;
  const dark = mix(color, "#000000", 0.28);
  ctx.fillStyle = dark;
  for (const side of [-1, 1]) {
    const edge = side < 0 ? x : x + w;
    ctx.beginPath();
    ctx.moveTo(edge, y + h * 0.22);
    ctx.lineTo(edge + side * tail, y + h * 0.22);
    ctx.lineTo(edge + side * tail * 0.62, y + h * 0.72);
    ctx.lineTo(edge + side * tail, y + h * 1.22);
    ctx.lineTo(edge - side * h * 0.2, y + h * 1.22);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Pílula sólida (subtexto do vibrante). */
function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
}

/** Ramo de louro ao longo de um arco (de `from` a `to`, em radianos). */
function laurel(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, from: number, to: number, leaf: number, color: string) {
  const n = Math.max(4, Math.round((Math.abs(to - from) * r) / (leaf * 1.25)));
  const dir = Math.sign(to - from) || 1;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = leaf * 0.14;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r, from, to, dir < 0);
  ctx.stroke();
  for (let i = 1; i <= n; i += 1) {
    const theta = from + ((to - from) * i) / n;
    const px = cx + r * Math.cos(theta);
    const py = cy + r * Math.sin(theta);
    const tangent = theta + (dir * Math.PI) / 2;
    const scale = 0.55 + 0.45 * Math.sin((Math.PI * i) / (n + 1));
    for (const side of [-1, 1]) {
      const a = tangent + side * 0.62;
      ctx.beginPath();
      ctx.ellipse(px + Math.cos(a) * leaf * 0.5 * scale, py + Math.sin(a) * leaf * 0.5 * scale, leaf * 0.55 * scale, leaf * 0.2 * scale, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Arabesco em S com ponto na ponta (elegante). */
function flourish(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, dir: 1 | -1, color: string, lw: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x + dir * len * 0.3, y - len * 0.2, x + dir * len * 0.55, y + len * 0.2, x + dir * len * 0.82, y);
  ctx.quadraticCurveTo(x + dir * len * 0.95, y - len * 0.1, x + dir * len, y - len * 0.02);
  ctx.stroke();
  circle(ctx, x + dir * len, y - len * 0.02, lw * 1.6);
  ctx.fillStyle = color;
  ctx.fill();
  diamond(ctx, x, y, lw * 2.4, color);
}

/** Linha — losango — linha (divisor do elegante). */
function diamondRule(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, color: string, lw: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x - width / 2, y);
  ctx.lineTo(x - lw * 4, y);
  ctx.moveTo(x + lw * 4, y);
  ctx.lineTo(x + width / 2, y);
  ctx.stroke();
  diamond(ctx, x, y, lw * 2.6, color);
}

/** Moldura dupla fina com losangos nos cantos. */
function doubleFrame(ctx: CanvasRenderingContext2D, box: Box, gap: number, lw: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.lineWidth = lw * 0.45;
  ctx.strokeRect(box.x + gap, box.y + gap, box.w - gap * 2, box.h - gap * 2);
  for (const [px, py] of [
    [box.x + gap, box.y + gap],
    [box.x + box.w - gap, box.y + gap],
    [box.x + gap, box.y + box.h - gap],
    [box.x + box.w - gap, box.y + box.h - gap],
  ]) {
    diamond(ctx, px, py, gap * 0.75, color);
  }
}

function squiggle(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, angle: number, color: string, lw: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i <= 12; i += 1) {
    const t = i / 12;
    ctx.lineTo(-len / 2 + t * len, Math.sin(t * Math.PI * 3) * len * 0.12);
  }
  ctx.stroke();
  ctx.restore();
}

/** Ponto dentro da elipse central (onde fica o texto)? */
function inCenter(x: number, y: number, w: number, h: number, rx: number, ry: number) {
  const dx = (x - w / 2) / (w * rx);
  const dy = (y - h / 2) / (h * ry);
  return dx * dx + dy * dy < 1;
}

/** Placa central dos padrões "home": proporção que funciona em toalha, almofada, meia ou passadeira. */
function plateBox(s: Scene): Box {
  const { w, h, shape } = s;
  const size: Record<Shape, [number, number]> = { strip: [0.56, 0.7], wide: [0.6, 0.52], square: [0.74, 0.46], tall: [0.84, 0.32], pole: [0.86, 0.3] };
  const [fw, fh] = size[shape];
  return { x: (w * (1 - fw)) / 2, y: (h * (1 - fh)) / 2, w: w * fw, h: h * fh };
}

function inset(box: Box, px: number, py = px): Box {
  return { x: box.x + px, y: box.y + py, w: Math.max(4, box.w - px * 2), h: Math.max(4, box.h - py * 2) };
}

// ---------------------------------------------------------------------------
// Estilos

function paintClassico(s: Scene) {
  const { ctx, w, h, unit, shape, family } = s;
  const main: Type = { font: s.font, lineHeight: 1.04 };
  const sub: Type = { font: "figtree", weight: 700, caps: true, tracking: 0.16 };
  const mainPaint: Paint = { fill: s.ink };
  const subPaint: Paint = { fill: rgba(s.ink, 0.72) };
  const ruleW = unit * 0.11;
  const centerRule = (x: number, y: number) => {
    ctx.fillStyle = s.accent;
    ctx.fillRect(x - ruleW / 2, y - unit * 0.006, ruleW, unit * 0.012);
  };
  const leftRule = (x: number, y: number) => {
    ctx.fillStyle = s.accent;
    ctx.fillRect(x, y - unit * 0.006, ruleW, unit * 0.012);
  };
  const lines = MAX_LINES[shape];

  if (family === "apparel" || (family === "badge" && shape === "square")) {
    // Selo: aro duplo, texto no miolo, subtexto em arco embaixo e estrelas em cima.
    const cx = w / 2;
    const cy = h / 2;
    const r = unit * (family === "badge" ? 0.42 : 0.46);
    // Na estampa o selo inteiro acompanha o texto; no adesivo/chaveiro o aro é a própria peça.
    if (family === "apparel") begin(s, { x: cx - r * 1.02, y: cy - r * 1.02, w: r * 2.04, h: r * 2.04 });
    ctx.strokeStyle = s.ink;
    ctx.lineWidth = unit * 0.022;
    circle(ctx, cx, cy, r);
    ctx.stroke();
    ctx.strokeStyle = family === "badge" ? s.accent : s.ink;
    ctx.lineWidth = unit * 0.008;
    circle(ctx, cx, cy, r * 0.8);
    ctx.stroke();
    const placed = stack(s, { box: { x: cx - r * 0.66, y: cy - r * 0.52, w: r * 1.32, h: r * 0.96 }, main, sub, mainMax: r * 0.44, maxLines: 3, mainPaint, subPaint, noSub: true });
    spectrumBand(ctx, cx - r * 0.3, Math.min(cy + r * 0.62, placed.bottom + r * 0.08), r * 0.6, unit * 0.018);
    for (const k of [-1, 0, 1]) {
      const a = -Math.PI / 2 + k * 0.32;
      star(ctx, cx + r * 0.9 * Math.cos(a), cy + r * 0.9 * Math.sin(a), r * (k ? 0.04 : 0.055), s.accent);
    }
    if (s.sub) arcText(ctx, s.sub, cx, cy, r * 0.9, r * 0.11, Math.PI * 0.82, sub, s.ink, true, s.layer);
    else for (const k of [-1, 1]) star(ctx, cx + r * 0.9 * Math.cos(Math.PI / 2 + k * 0.2), cy + r * 0.9 * Math.sin(Math.PI / 2 + k * 0.2), r * 0.04, s.ink);
    return;
  }

  if (family === "home") {
    // Confete do espectro espalhado e uma placa com o nome.
    const count = Math.min(140, Math.round((w * h) / (unit * unit * 0.012)));
    for (let i = 0; i < count; i += 1) {
      const x = s.rng() * w;
      const y = s.rng() * h;
      ctx.fillStyle = rgba(SPECTRUM[i % SPECTRUM.length], 0.55);
      circle(ctx, x, y, unit * (0.01 + s.rng() * 0.022));
      ctx.fill();
    }
    const plate = plateBox(s);
    begin(s, plate);
    ctx.fillStyle = s.bg;
    ctx.strokeStyle = s.ink;
    ctx.lineWidth = unit * 0.006;
    ctx.beginPath();
    ctx.roundRect(plate.x, plate.y, plate.w, plate.h, unit * 0.04);
    ctx.fill();
    ctx.stroke();
    stack(s, { box: inset(plate, plate.w * 0.08, plate.h * 0.14), main, sub, mainMax: unit * 0.24, maxLines: Math.max(2, lines), mainPaint, subPaint, divider: centerRule, dividerH: unit * 0.012 });
    return;
  }

  const pad = unit * 0.09;
  const band = unit * 0.055;
  if (shape === "strip") {
    spectrumBand(ctx, 0, h - h * 0.09, w, h * 0.09);
    const size = h * 0.42;
    drawMark(ctx, pad, (h - size * MARK_H) / 2 - h * 0.04, size);
    if (family === "wrap") drawMark(ctx, w - pad - size * MARK_W, (h - size * MARK_H) / 2 - h * 0.04, size);
    const left = pad * 2 + size * MARK_W;
    const right = family === "wrap" ? left : pad;
    inline(s, {
      box: { x: left, y: h * 0.08, w: w - left - right, h: h * 0.76 },
      main,
      sub,
      mainPaint,
      subPaint,
      align: family === "wrap" ? "center" : "left",
      sep: { width: 0.35, draw: (x0, x1, cy, sz) => {
        ctx.fillStyle = s.accent;
        ctx.fillRect(x0, cy - sz * 0.03, Math.max(1, x1 - x0), sz * 0.06);
      } },
    });
    return;
  }

  if (family === "card" && shape !== "tall" && shape !== "pole") {
    // Cartão deitado: símbolo à esquerda, nome alinhado à esquerda, filete e contato.
    const size = Math.min(unit * 0.3, w * 0.18);
    drawMark(ctx, pad, (h - size * MARK_H) / 2 - band / 2, size);
    const textX = pad * 2 + size * MARK_W;
    stack(s, { box: { x: textX, y: pad, w: w - textX - pad, h: h - pad * 2 - band }, main, sub, mainMax: unit * 0.22, maxLines: 2, mainPaint, subPaint, align: "left", divider: leftRule, dividerH: unit * 0.012, subLines: 2 });
    spectrumBand(ctx, 0, h - band, w, band);
    return;
  }

  if (family === "badge") {
    // Chaveiro, ímã, tag: moldura arredondada fina.
    const frame = inset({ x: 0, y: 0, w, h }, unit * 0.07);
    ctx.strokeStyle = s.ink;
    ctx.lineWidth = unit * 0.02;
    ctx.beginPath();
    ctx.roundRect(frame.x, frame.y, frame.w, frame.h, unit * 0.1);
    ctx.stroke();
    const placed = stack(s, { box: inset(frame, unit * 0.08), main, sub, mainMax: unit * 0.26, maxLines: lines, mainPaint, subPaint, divider: centerRule, dividerH: unit * 0.012, subLines: 2 });
    spectrumBand(ctx, w / 2 - unit * 0.15, Math.min(frame.y + frame.h - unit * 0.06, placed.bottom + unit * 0.05), unit * 0.3, unit * 0.025);
    return;
  }

  // Placa, banner, impresso, caneca, crachá em pé: símbolo, título, filete, subtexto e faixa.
  spectrumBand(ctx, 0, h - band, w, band);
  let top = pad;
  if (family === "wrap" && shape === "wide") {
    const size = unit * 0.28;
    drawMark(ctx, w * 0.05, h * 0.36, size);
    drawMark(ctx, w * 0.95 - size * MARK_W, h * 0.36, size);
    stack(s, { box: { x: w * 0.05 + size * MARK_W + pad, y: pad, w: w * 0.9 - (size * MARK_W + pad) * 2, h: h - pad * 2 - band }, main, sub, mainMax: unit * 0.34, maxLines: 2, mainPaint, subPaint, divider: centerRule, dividerH: unit * 0.012 });
    return;
  }
  const size = shape === "pole" ? w * 0.4 : unit * 0.17;
  drawMark(ctx, w / 2 - (size * MARK_W) / 2, top, size);
  top += size * MARK_H + pad * 0.5;
  stack(s, { box: { x: pad, y: top, w: w - pad * 2, h: h - top - pad - band }, main, sub, mainMax: unit * 0.24, maxLines: lines, mainPaint, subPaint, divider: centerRule, dividerH: unit * 0.012, subLines: shape === "tall" || shape === "pole" ? 2 : 1 });
}

function paintModerno(s: Scene) {
  const { ctx, w, h, unit, shape, family } = s;
  const main: Type = { font: s.font, tracking: -0.01, lineHeight: 1.0 };
  const sub: Type = { font: "figtree", weight: 600, caps: true, tracking: 0.22 };
  const mainPaint: Paint = { fill: s.ink };
  const subPaint: Paint = { fill: rgba(s.ink, 0.7) };
  const a1 = s.accent;
  const a2 = s.accent2;
  const pad = unit * 0.1;
  const bar = unit * 0.022;
  const lines = MAX_LINES[shape];
  const squares = (x: number, y: number, size: number) => {
    [a1, a2, s.ink].forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(x + i * size * 1.45, y, size, size);
    });
  };
  const sideBar = (placed: Placed) => {
    ctx.fillStyle = a1;
    ctx.fillRect(placed.left - bar * 2.6, placed.top, bar, placed.bottom - placed.top);
  };

  if (shape === "strip" && family !== "home") {
    // Bloco inclinado na ponta, texto alinhado à esquerda e subtexto encostado à direita.
    ctx.fillStyle = a1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(h * 1.15, 0);
    ctx.lineTo(h * 0.8, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = a2;
    ctx.fillRect(h * 0.28, h * 0.36, h * 0.28, h * 0.28);
    ctx.fillStyle = a1;
    ctx.fillRect(w - h * 0.16, h * 0.18, h * 0.06, h * 0.64);
    const x = h * 1.35;
    inline(s, {
      box: { x, y: h * 0.1, w: w - x - h * 0.4, h: h * 0.8 },
      main,
      sub,
      mainPaint,
      subPaint,
      align: "spread",
      sep: { width: 0.8, draw: (x0, x1, cy) => {
        ctx.fillStyle = rgba(s.ink, 0.25);
        ctx.fillRect(x0, cy, Math.max(1, x1 - x0), Math.max(1, h * 0.012));
      } },
    });
    return;
  }

  if (family === "apparel") {
    // Etiqueta: texto empilhado à esquerda e o subtexto vazado num bloco de cor.
    const box = { x: w * 0.1, y: h * 0.12, w: w * 0.8, h: h * 0.76 };
    const placed = stack(s, {
      box,
      main,
      sub: { ...sub, weight: 700 },
      mainMax: unit * 0.3,
      maxLines: Math.max(3, lines),
      mainPaint,
      subPaint: { fill: readableInk(a1) },
      align: "left",
      subRatio: 0.3,
      gap: 0.2,
      subPlate: (x, y, pw, ph, mainW) => {
        ctx.fillStyle = a1;
        ctx.fillRect(x, y, Math.max(pw, mainW * 0.6), ph);
      },
    });
    ctx.fillStyle = a2;
    circle(ctx, placed.right + placed.size * 0.18, placed.top + placed.size * 0.12, placed.size * 0.11);
    ctx.fill();
    if (!s.sub) {
      ctx.fillStyle = a1;
      ctx.fillRect(placed.left, placed.mainBottom + placed.size * 0.18, placed.mainW * 0.45, placed.size * 0.12);
    }
    return;
  }

  if (family === "badge") {
    // Faixa de cor embaixo com o subtexto vazado; ponto e fio em cima.
    const split = s.sub ? h * 0.7 : h * 0.8;
    ctx.fillStyle = a1;
    ctx.fillRect(0, split, w, h - split);
    ctx.fillStyle = a2;
    circle(ctx, w * 0.5, h * 0.17, unit * 0.04);
    ctx.fill();
    stack(s, { box: { x: w * 0.14, y: h * 0.24, w: w * 0.72, h: split - h * 0.3 }, main, sub, mainMax: unit * 0.28, maxLines: lines, mainPaint, subPaint, noSub: true });
    if (s.sub) {
      const f = fitText(ctx, s.sub, sub, w * 0.66, (h - split) * 0.4, unit * 0.07, 1);
      drawFit(ctx, f, w / 2, split + (h - split) * 0.42, "center", { fill: readableInk(a1) }, s.layer);
    }
    return;
  }

  if (family === "home") {
    // Grade geométrica (círculos, meias-luas, quadrados) e placa reta com o nome.
    const cell = unit * 0.2;
    const cols = Math.min(40, Math.ceil(w / cell));
    const rows = Math.min(40, Math.ceil(h / cell));
    const colors = [a1, a2, s.ink];
    for (let i = 0; i < cols; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        const kind = Math.floor(s.rng() * 5);
        const color = colors[(i + j) % colors.length];
        const x = i * cell;
        const y = j * cell;
        ctx.fillStyle = rgba(color, 0.16);
        ctx.beginPath();
        if (kind === 0) ctx.arc(x + cell / 2, y + cell / 2, cell * 0.38, 0, Math.PI * 2);
        else if (kind === 1) ctx.arc(x + cell / 2, y + cell / 2, cell * 0.4, Math.PI * Math.floor(s.rng() * 4) * 0.5, Math.PI * Math.floor(s.rng() * 4) * 0.5 + Math.PI);
        else if (kind === 2) {
          ctx.moveTo(x, y);
          ctx.arc(x, y, cell * 0.9, 0, Math.PI / 2);
        } else if (kind === 3) ctx.rect(x + cell * 0.3, y + cell * 0.3, cell * 0.4, cell * 0.4);
        ctx.fill();
      }
    }
    const plate = plateBox(s);
    begin(s, plate);
    ctx.fillStyle = s.bg;
    ctx.fillRect(plate.x, plate.y, plate.w, plate.h);
    ctx.fillStyle = a1;
    ctx.fillRect(plate.x, plate.y + plate.h - unit * 0.018, plate.w, unit * 0.018);
    const placed = stack(s, { box: inset(plate, plate.w * 0.1, plate.h * 0.14), main, sub, mainMax: unit * 0.24, maxLines: Math.max(2, lines), mainPaint, subPaint, align: "left" });
    sideBar(placed);
    return;
  }

  if (family === "wrap" && shape === "wide") {
    // Caneca e copo: formas nas laterais, texto centralizado de frente para a câmera.
    ctx.fillStyle = a1;
    circle(ctx, 0, h * 0.5, h * 0.36);
    ctx.fill();
    ctx.fillStyle = a2;
    ctx.save();
    ctx.translate(w, h * 0.5);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-h * 0.22, -h * 0.22, h * 0.44, h * 0.44);
    ctx.restore();
    const placed = stack(s, { box: { x: h * 0.5, y: pad, w: w - h, h: h - pad * 2 }, main, sub, mainMax: unit * 0.34, maxLines: 2, mainPaint, subPaint, divider: (x, y) => {
      ctx.fillStyle = a1;
      ctx.fillRect(x - unit * 0.07, y - unit * 0.008, unit * 0.14, unit * 0.016);
    }, dividerH: unit * 0.016 });
    squares(placed.right - unit * 0.12, Math.min(h - pad * 0.6, placed.bottom + unit * 0.06), unit * 0.03);
    return;
  }

  if (shape === "wide") {
    // Grade suíça: texto à esquerda, círculo grande cortado no canto direito.
    ctx.fillStyle = a1;
    circle(ctx, w - unit * 0.08, unit * 0.1, unit * (family === "card" ? 0.46 : 0.5));
    ctx.fill();
    ctx.fillStyle = a2;
    circle(ctx, w - unit * 0.5, unit * 0.62, unit * 0.1);
    ctx.fill();
    const left = pad + bar * 2.6;
    const placed = stack(s, { box: { x: left, y: pad, w: w * 0.6 - left, h: h - pad * 2 }, main, sub, mainMax: unit * 0.26, maxLines: 2, mainPaint, subPaint, align: "left", valign: family === "card" ? "center" : "bottom", subLines: 2 });
    sideBar(placed);
    squares(w - pad - unit * 0.13, h - pad - unit * 0.03, unit * 0.03);
    return;
  }

  // Quadrado e em pé: círculo no alto à direita, texto na metade de baixo, alinhado à esquerda.
  const r = shape === "square" ? unit * 0.34 : w * 0.44;
  ctx.fillStyle = a1;
  circle(ctx, w - r * 0.35, r * 0.4, r);
  ctx.fill();
  ctx.fillStyle = a2;
  circle(ctx, w - r * 1.25, r * 1.2, r * 0.18);
  ctx.fill();
  squares(pad, pad, unit * 0.035);
  // O texto começa abaixo do círculo: frase longa não invade a forma.
  const top = shape === "square" ? r * 1.45 : r * 1.6;
  const left = pad + bar * 2.6;
  const placed = stack(s, { box: { x: left, y: top, w: w - left - pad, h: h - top - pad }, main, sub, mainMax: unit * 0.26, maxLines: lines, mainPaint, subPaint, align: "left", valign: "bottom", subLines: 2 });
  sideBar(placed);
}

function paintRetro(s: Scene) {
  const { ctx, w, h, unit, shape, family } = s;
  const main: Type = { font: s.font, caps: true, tracking: 0.02, lineHeight: 0.98 };
  const sub: Type = { font: "figtree", weight: 800, caps: true, tracking: 0.12 };
  const extrude = pick([s.accent2, C.red, C.magenta, C.amber], [s.ink], 1.4);
  const mainPaint: Paint = { fill: s.ink, extrude, depth: 0.075 };
  const ribbonColor = pick([C.amber, C.red, C.sun], [s.bg], 1.3);
  const subPaint: Paint = { fill: readableInk(ribbonColor) };
  const plate = (x: number, y: number, pw: number, ph: number) => ribbon(ctx, x, y, pw, ph, ribbonColor);
  const dark = luminance(s.bg) < 0.25;
  const rays = rgba(s.accent, dark ? 0.22 : 0.16);
  const pad = unit * 0.1;
  const lines = MAX_LINES[shape];

  if (shape === "strip" && family !== "home") {
    retroStripes(ctx, 0, 0, w, h * 0.16);
    retroStripes(ctx, 0, h * 0.84, w, h * 0.16);
    inline(s, {
      box: { x: h * 0.5, y: h * 0.2, w: w - h, h: h * 0.6 },
      main,
      sub,
      mainPaint,
      subPaint: { fill: s.ink },
      sep: { width: 0.6, draw: (x0, x1, cy, size) => star(ctx, (x0 + x1) / 2, cy, size * 0.2, extrude) },
    });
    return;
  }

  if (family === "apparel") {
    // Pôr do sol listrado (as listas vazadas mostram o tecido), letra com volume e fita.
    const cx = w / 2;
    const r = unit * 0.34;
    const cy = h * 0.4;
    begin(s, { x: cx - r, y: cy - r, w: r * 2, h: r * 2 });
    ctx.save();
    circle(ctx, cx, cy, r);
    ctx.clip();
    const zones = [C.sun, C.amber, C.red];
    zones.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(cx - r, cy - r + (i * 2 * r) / 3, r * 2, (2 * r) / 3 + 1);
    });
    ctx.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 4; i += 1) {
      const y = cy + r * (0.12 + i * 0.22);
      ctx.fillRect(cx - r, y, r * 2, r * (0.05 + i * 0.025));
    }
    ctx.restore();
    stack(s, { box: { x: w * 0.06, y: h * 0.5, w: w * 0.88, h: h * 0.46 }, main, sub, mainMax: unit * 0.24, maxLines: 2, mainPaint, subPaint, subPlate: plate, subRatio: 0.32 });
    return;
  }

  if (family === "badge" && shape === "square") {
    const cx = w / 2;
    const cy = h / 2;
    const r = unit * 0.44;
    ctx.save();
    circle(ctx, cx, cy, r);
    ctx.clip();
    sunburst(ctx, cx, cy, r, 24, rays);
    ctx.restore();
    ctx.strokeStyle = s.ink;
    ctx.lineWidth = unit * 0.02;
    circle(ctx, cx, cy, r);
    ctx.stroke();
    for (const k of [-1, 0, 1]) star(ctx, cx + k * r * 0.26, cy - r * 0.68 + Math.abs(k) * r * 0.05, r * 0.06, extrude);
    stack(s, { box: { x: cx - r * 0.78, y: cy - r * 0.5, w: r * 1.56, h: r * 1.15 }, main, sub, mainMax: r * 0.42, maxLines: 3, mainPaint, subPaint, subPlate: plate, subRatio: 0.32 });
    return;
  }

  if (family === "home") {
    // Ondas quentes em faixas e uma placa-pílula com o nome.
    const colors = [C.red, C.amber, C.sun];
    const step = unit * 0.09;
    const rowsN = Math.min(48, Math.ceil(h / step) + 1);
    const wave = unit * 0.25;
    const segs = Math.min(120, Math.ceil(w / (unit * 0.02)));
    ctx.lineWidth = unit * 0.035;
    ctx.lineCap = "round";
    for (let j = 0; j < rowsN; j += 1) {
      ctx.strokeStyle = rgba(colors[j % 3], 0.32);
      ctx.beginPath();
      for (let i = 0; i <= segs; i += 1) {
        const x = (i / segs) * w;
        ctx.lineTo(x, j * step + Math.sin((x / wave) * Math.PI * 2 + j * 0.8) * unit * 0.02);
      }
      ctx.stroke();
    }
    const box = plateBox(s);
    begin(s, box);
    ctx.fillStyle = s.bg;
    ctx.strokeStyle = s.ink;
    ctx.lineWidth = unit * 0.008;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, Math.min(box.h, box.w) / 2);
    ctx.fill();
    ctx.stroke();
    stack(s, { box: inset(box, box.w * 0.12, box.h * 0.16), main, sub, mainMax: unit * 0.22, maxLines: Math.max(2, lines), mainPaint, subPaint: { fill: rgba(s.ink, 0.75) } });
    return;
  }

  if (family === "card" && shape === "wide") {
    // Cartão: listras verticais na esquerda e raios saindo do canto.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    sunburst(ctx, 0, h, Math.hypot(w, h), 30, rays);
    ctx.restore();
    retroStripes(ctx, pad * 0.7, 0, unit * 0.12, h, true);
    const left = pad * 0.7 + unit * 0.2;
    stack(s, { box: { x: left, y: pad, w: w - left - pad, h: h - pad * 2 }, main, sub, mainMax: unit * 0.26, maxLines: 2, mainPaint, subPaint, subPlate: plate, subRatio: 0.3 });
    return;
  }

  // Placa, caneca, crachá, chaveiro em pé: raios de sol, listras em cima e embaixo, estrelas.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  sunburst(ctx, w / 2, h * 0.56, Math.hypot(w, h), 28, rays);
  ctx.restore();
  const stripeH = unit * 0.07;
  retroStripes(ctx, 0, unit * 0.04, w, stripeH);
  retroStripes(ctx, 0, h - unit * 0.04 - stripeH, w, stripeH);
  const box = { x: pad, y: unit * 0.04 + stripeH + pad * 0.6, w: w - pad * 2, h: h - (unit * 0.04 + stripeH + pad * 0.6) * 2 };
  const placed = stack(s, { box: shape === "wide" ? inset(box, unit * 0.12, 0) : box, main, sub, mainMax: unit * 0.26, maxLines: lines, mainPaint, subPaint, subPlate: plate, subRatio: 0.3, subLines: 1 });
  // Estrelas ladeando o título só quando cabem inteiras na arte.
  const starR = placed.size * 0.16;
  if ((shape === "wide" || shape === "square") && placed.left - placed.size * 0.45 - starR > 0 && placed.right + placed.size * 0.5 + starR < w) {
    const y = placed.top + placed.size * 0.45;
    star(ctx, placed.left - placed.size * 0.45, y, starR, extrude);
    star(ctx, placed.right + placed.size * 0.5, y, starR, extrude);
  }
}

function paintMinimal(s: Scene) {
  const { ctx, w, h, unit, shape, family } = s;
  const main: Type = { font: s.font, weight: 500, tracking: 0.02, lineHeight: 1.12 };
  const sub: Type = { font: "figtree", weight: 500, caps: true, tracking: 0.32 };
  const mainPaint: Paint = { fill: s.ink };
  const subPaint: Paint = { fill: rgba(s.ink, 0.6) };
  const hair = Math.max(1, unit * 0.004);
  const dot = (x: number, y: number, r = unit * 0.014) => {
    ctx.fillStyle = s.accent;
    circle(ctx, x, y, r);
    ctx.fill();
  };
  const hairline = (x: number, y: number) => {
    ctx.fillStyle = rgba(s.ink, 0.5);
    ctx.fillRect(x - unit * 0.04, y - hair / 2, unit * 0.08, hair);
  };
  const lines = MAX_LINES[shape];
  const pad = unit * 0.16;

  if (shape === "strip" && family !== "home") {
    dot(h * 0.45, h / 2, h * 0.07);
    inline(s, {
      box: { x: h * 0.8, y: h * 0.18, w: w - h * 1.25, h: h * 0.64 },
      main,
      sub,
      mainPaint,
      subPaint,
      mainMax: h * 0.48,
      align: "spread",
      sep: { width: 1, draw: (x0, x1, cy) => {
        ctx.fillStyle = rgba(s.ink, 0.35);
        ctx.fillRect(x0, cy - hair / 2, Math.max(1, x1 - x0), hair);
      } },
    });
    return;
  }

  if (family === "home") {
    // Fios diagonais quase invisíveis e o nome num respiro liso.
    ctx.strokeStyle = rgba(s.ink, 0.07);
    ctx.lineWidth = hair;
    const step = unit * 0.08;
    const count = Math.min(160, Math.ceil((w + h) / step));
    ctx.beginPath();
    for (let i = 0; i < count; i += 1) {
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step - h, h);
    }
    ctx.stroke();
    const box = plateBox(s);
    begin(s, box);
    ctx.fillStyle = s.bg;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    const placed = stack(s, { box: inset(box, box.w * 0.1, box.h * 0.16), main, sub, mainMax: unit * 0.18, maxLines: Math.max(2, lines), mainPaint, subPaint, divider: hairline, dividerH: hair, gap: 0.45 });
    dot(w / 2, placed.top - unit * 0.05);
    return;
  }

  if (family === "badge") {
    ctx.strokeStyle = rgba(s.ink, 0.5);
    ctx.lineWidth = hair;
    ctx.beginPath();
    if (shape === "square") ctx.ellipse(w / 2, h / 2, w * 0.43, h * 0.43, 0, 0, Math.PI * 2);
    else ctx.roundRect(unit * 0.07, unit * 0.07, w - unit * 0.14, h - unit * 0.14, unit * 0.08);
    ctx.stroke();
    const placed = stack(s, { box: inset({ x: 0, y: 0, w, h }, unit * 0.2), main, sub, mainMax: unit * 0.2, maxLines: lines, mainPaint, subPaint, divider: hairline, dividerH: hair, gap: 0.45 });
    dot(w / 2, placed.top - unit * 0.06);
    return;
  }

  if (family === "card") {
    // Cartão: nome embaixo à esquerda, ponto coral no canto oposto.
    dot(w - pad * 0.7, pad * 0.7, unit * 0.022);
    ctx.fillStyle = rgba(s.ink, 0.35);
    ctx.fillRect(pad * 0.7, pad * 0.7, unit * 0.12, hair);
    stack(s, { box: { x: pad * 0.7, y: h * 0.3, w: w * 0.8, h: h * 0.7 - pad * 0.7 }, main, sub, mainMax: unit * 0.18, maxLines: lines, mainPaint, subPaint, align: "left", valign: "bottom", gap: 0.5, subLines: 2 });
    return;
  }

  // Placa, caneca, estampa: tudo centralizado com muito respiro.
  const box = family === "apparel" ? inset({ x: 0, y: 0, w, h }, unit * 0.1) : inset({ x: 0, y: 0, w, h }, Math.max(pad, w * 0.14), pad);
  const placed = stack(s, { box, main, sub, mainMax: unit * (family === "apparel" ? 0.22 : 0.2), maxLines: lines, mainPaint, subPaint, divider: hairline, dividerH: hair, gap: 0.5, subLines: shape === "tall" || shape === "pole" ? 2 : 1 });
  dot(w / 2, placed.top - unit * 0.06);
}

function paintVibrante(s: Scene) {
  const { ctx, w, h, unit, shape, family } = s;
  const main: Type = { font: s.font, weight: 900, lineHeight: 1.0 };
  const sub: Type = { font: "figtree", weight: 800, tracking: 0.04 };
  const mainPaint: Paint = { fill: s.ink, stroke: s.paper, strokeW: 0.16, drop: s.accent2, dropOffset: 0.07 };
  const subPaint: Paint = { fill: s.paper };
  const plate = (x: number, y: number, pw: number, ph: number) => pill(ctx, x, y, pw, ph, s.ink);
  const lines = MAX_LINES[shape];
  const tilted = (angle: number, draw: () => void) => {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angle);
    ctx.translate(-w / 2, -h / 2);
    draw();
    ctx.restore();
  };
  const blobs = (count: number, rMin: number, rMax: number) => {
    for (let i = 0; i < count; i += 1) {
      const t = s.rng();
      const per = 2 * (w + h);
      const d = t * per;
      const x = d < w ? d : d < w + h ? w : d < 2 * w + h ? 2 * w + h - d : 0;
      const y = d < w ? 0 : d < w + h ? d - w : d < 2 * w + h ? h : per - d;
      ctx.fillStyle = SPECTRUM[(i * 3) % SPECTRUM.length];
      circle(ctx, x, y, unit * (rMin + s.rng() * (rMax - rMin)));
      ctx.fill();
    }
  };
  const confetti = (count: number, avoidX: number, avoidY: number, alpha = 1) => {
    for (let i = 0; i < count; i += 1) {
      const x = s.rng() * w;
      const y = s.rng() * h;
      if (inCenter(x, y, w, h, avoidX, avoidY)) continue;
      const color = rgba(SPECTRUM[i % SPECTRUM.length], alpha);
      const kind = i % 4;
      const size = unit * (0.02 + s.rng() * 0.025);
      if (kind === 0) {
        ctx.fillStyle = color;
        circle(ctx, x, y, size * 0.6);
        ctx.fill();
      } else if (kind === 1) squiggle(ctx, x, y, size * 3, s.rng() * Math.PI, color, unit * 0.012);
      else if (kind === 2) {
        ctx.fillStyle = color;
        starPath(ctx, x, y, size, size * 0.5, 3, s.rng() * Math.PI);
        ctx.fill();
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = unit * 0.01;
        circle(ctx, x, y, size * 0.7);
        ctx.stroke();
      }
    }
  };

  if (shape === "strip" && family !== "home") {
    // Listras diagonais do espectro nas duas pontas.
    const end = Math.min(w * 0.16, h * 2.2);
    for (const x0 of [0, w - end]) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, 0, end, h);
      ctx.clip();
      const bandW = h * 0.32;
      for (let i = -Math.ceil(h / bandW); i * bandW < end + h; i += 1) {
        ctx.fillStyle = SPECTRUM[(i + 70) % SPECTRUM.length];
        ctx.beginPath();
        ctx.moveTo(x0 + i * bandW, h);
        ctx.lineTo(x0 + i * bandW + h, 0);
        ctx.lineTo(x0 + (i + 1) * bandW + h, 0);
        ctx.lineTo(x0 + (i + 1) * bandW, h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    inline(s, { box: { x: end + h * 0.25, y: h * 0.1, w: w - end * 2 - h * 0.5, h: h * 0.8 }, main, sub, mainPaint, subPaint, subPlate: plate });
    return;
  }

  if (family === "apparel") {
    // Bolhas de cor sobrepostas atrás do texto-adesivo.
    const cx = w / 2;
    const cy = h * 0.46;
    const r = unit * 0.36;
    begin(s, { x: cx - r * 1.06, y: cy - r * 0.88, w: r * 2.1, h: r * 1.82 });
    [
      [C.magenta, -0.5, -0.2],
      [C.sun, 0.48, -0.32],
      [C.cyan, 0.05, 0.38],
    ].forEach(([color, dx, dy]) => {
      ctx.fillStyle = color as string;
      circle(ctx, cx + (dx as number) * r, cy + (dy as number) * r, r * 0.56);
      ctx.fill();
    });
    tilted(-0.06, () => stack(s, { box: { x: w * 0.06, y: h * 0.18, w: w * 0.88, h: h * 0.7 }, main, sub, mainMax: unit * 0.3, maxLines: 3, mainPaint, subPaint, subPlate: plate, subRatio: 0.3 }));
    return;
  }

  if (family === "badge") {
    // Estrela de adesivo em duas camadas atrás do texto.
    const cx = w / 2;
    const cy = h / 2;
    const r = unit * 0.46;
    const front = pick([C.sun, C.cyan, C.lime, C.amber, C.magenta], [s.ink], 3);
    ctx.fillStyle = s.accent === front ? C.magenta : s.accent;
    starPath(ctx, cx, cy, r, r * 0.84, 18, 0.09);
    ctx.fill();
    ctx.fillStyle = front;
    starPath(ctx, cx, cy, r * 0.92, r * 0.78, 18);
    ctx.fill();
    tilted(-0.07, () => stack(s, { box: { x: cx - r * 0.66, y: cy - r * 0.55, w: r * 1.32, h: r * 1.1 }, main, sub, mainMax: r * 0.46, maxLines: Math.max(2, Math.min(3, lines)), mainPaint, subPaint, subPlate: plate, subRatio: 0.32 }));
    return;
  }

  if (family === "home") {
    confetti(Math.min(170, Math.round((w * h) / (unit * unit * 0.01))), 0.3, 0.22, 0.85);
    tilted(-0.04, () => stack(s, { box: inset(plateBox(s), unit * 0.02), main, sub, mainMax: unit * 0.26, maxLines: Math.max(2, lines), mainPaint, subPaint, subPlate: plate, subRatio: 0.3 }));
    return;
  }

  // Placa, caneca, cartão: bolhas nas bordas, confete e o texto-adesivo levemente inclinado.
  blobs(family === "card" ? 6 : 9, 0.1, family === "card" ? 0.2 : 0.24);
  confetti(family === "card" ? 10 : 18, 0.42, 0.38);
  const pad = unit * 0.14;
  const box = family === "wrap" && shape === "wide" ? { x: w * 0.18, y: pad, w: w * 0.64, h: h - pad * 2 } : inset({ x: 0, y: 0, w, h }, pad);
  tilted(shape === "pole" ? -0.02 : -0.05, () => stack(s, { box, main, sub, mainMax: unit * 0.3, maxLines: lines, mainPaint, subPaint, subPlate: plate, subRatio: 0.3 }));
}

function paintElegante(s: Scene) {
  const { ctx, w, h, unit, shape, family } = s;
  const main: Type = { font: s.font, tracking: 0.01, lineHeight: 1.1 };
  const sub: Type = { font: "playfair", weight: 400, italic: true, tracking: 0.02 };
  const gold = s.accent;
  const mainPaint: Paint = { fill: s.ink };
  const subPaint: Paint = { fill: rgba(s.ink, 0.78) };
  const lw = Math.max(1, unit * 0.006);
  const divider = (x: number, y: number) => diamondRule(ctx, x, y, unit * 0.24, gold, lw * 0.7);
  const lines = MAX_LINES[shape];

  if (shape === "strip" && family !== "home") {
    // Fios duplos dourados em cima e embaixo, losangos nas pontas.
    for (const y of [h * 0.1, h * 0.86]) {
      ctx.fillStyle = gold;
      ctx.fillRect(h * 0.3, y, w - h * 0.6, Math.max(1, h * 0.018));
      ctx.fillRect(h * 0.3, y + h * 0.04, w - h * 0.6, Math.max(1, h * 0.008));
    }
    diamond(ctx, h * 0.3, h / 2, h * 0.12, gold);
    diamond(ctx, w - h * 0.3, h / 2, h * 0.12, gold);
    inline(s, { box: { x: h * 0.65, y: h * 0.2, w: w - h * 1.3, h: h * 0.6 }, main, sub, mainPaint, subPaint, sep: { width: 0.4, draw: (x0, x1, cy, size) => diamond(ctx, (x0 + x1) / 2, cy, size * 0.12, gold) } });
    return;
  }

  if (family === "apparel" || (family === "badge" && shape === "square")) {
    // Brasão: coroa de louros dourada, losango no alto, texto no miolo.
    const cx = w / 2;
    const cy = h / 2;
    const r = unit * (family === "badge" ? 0.38 : 0.42);
    if (family === "badge") {
      ctx.strokeStyle = gold;
      ctx.lineWidth = lw * 1.4;
      circle(ctx, cx, cy, unit * 0.46);
      ctx.stroke();
      ctx.lineWidth = lw * 0.5;
      circle(ctx, cx, cy, unit * 0.43);
      ctx.stroke();
    }
    const leaf = r * 0.16;
    // A coroa de louros acompanha o texto; no adesivo, o aro duplo de cima fica como moldura.
    begin(s, { x: cx - r - leaf, y: cy - r - leaf, w: (r + leaf) * 2, h: (r + leaf) * 2 });
    laurel(ctx, cx, cy, r, Math.PI * 0.6, Math.PI * 1.32, leaf, gold);
    laurel(ctx, cx, cy, r, Math.PI * 0.4, -Math.PI * 0.32, leaf, gold);
    diamond(ctx, cx, cy - r, r * 0.07, gold);
    stack(s, { box: { x: cx - r * 0.7, y: cy - r * 0.62, w: r * 1.4, h: r * 1.24 }, main, sub, mainMax: r * 0.42, maxLines: 3, mainPaint, subPaint, divider, dividerH: lw * 4, subRatio: 0.36 });
    return;
  }

  if (family === "home") {
    // Treliça de losangos com pontos e placa com moldura dupla.
    const step = unit * 0.14;
    ctx.strokeStyle = rgba(gold, 0.3);
    ctx.lineWidth = lw * 0.6;
    const count = Math.min(120, Math.ceil((w + h) / step) + 1);
    ctx.beginPath();
    for (let i = -count; i <= count; i += 1) {
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step + h, h);
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step - h, h);
    }
    ctx.stroke();
    const box = plateBox(s);
    begin(s, box);
    ctx.fillStyle = s.bg;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    doubleFrame(ctx, inset(box, unit * 0.02), unit * 0.018, lw, gold);
    stack(s, { box: inset(box, box.w * 0.1, box.h * 0.16), main, sub, mainMax: unit * 0.22, maxLines: Math.max(2, lines), mainPaint, subPaint, divider, dividerH: lw * 4 });
    return;
  }

  if (family === "wrap" && shape === "wide") {
    // Caneca: fios no alto e embaixo, arabescos dos dois lados do texto.
    for (const y of [h * 0.08, h * 0.9]) {
      ctx.fillStyle = gold;
      ctx.fillRect(0, y, w, lw);
      ctx.fillRect(0, y + lw * 2.2, w, lw * 0.5);
    }
    const placed = stack(s, { box: { x: w * 0.2, y: h * 0.16, w: w * 0.6, h: h * 0.68 }, main, sub, mainMax: unit * 0.32, maxLines: 2, mainPaint, subPaint, divider, dividerH: lw * 4 });
    const y = placed.top + placed.size * 0.5;
    const len = Math.min(w * 0.16, unit * 0.36);
    if (s.layer?.marked) growBox(s.layer, placed.left - placed.size * 0.25 - len, y - len * 0.3, placed.right - placed.left + placed.size * 0.5 + len * 2, len * 0.6);
    flourish(ctx, placed.left - placed.size * 0.25, y, len, -1, gold, lw);
    flourish(ctx, placed.right + placed.size * 0.25, y, len, 1, gold, lw);
    return;
  }

  // Placa, cartão, chaveiro: moldura dupla com losangos; monograma quando a peça é em pé.
  const frame = inset({ x: 0, y: 0, w, h }, unit * 0.05);
  doubleFrame(ctx, frame, unit * 0.02, lw, gold);
  let top = frame.y + unit * 0.1;
  if ((shape === "tall" || shape === "pole") && family !== "badge") {
    const r = Math.min(unit * 0.14, h * 0.07);
    const cx = w / 2;
    const cy = top + r;
    ctx.strokeStyle = gold;
    ctx.lineWidth = lw;
    circle(ctx, cx, cy, r);
    ctx.stroke();
    const letter = [...s.text.trim()][0] ?? "";
    const f = fitText(ctx, letter, { font: s.font }, r * 1.2, r * 1.2, r * 1.15, 1);
    drawFit(ctx, f, cx, cy + r * 0.04, "center", { fill: gold });
    top = cy + r + unit * 0.08;
  }
  const box = { x: frame.x + unit * 0.1, y: top, w: frame.w - unit * 0.2, h: frame.y + frame.h - unit * 0.1 - top };
  stack(s, { box, main, sub, mainMax: unit * 0.24, maxLines: lines, mainPaint, subPaint, divider, dividerH: lw * 4, subLines: shape === "tall" || shape === "pole" ? 2 : 1 });
}

const PAINTERS: Record<ArtStyle, (s: Scene) => void> = {
  classico: paintClassico,
  moderno: paintModerno,
  retro: paintRetro,
  minimal: paintMinimal,
  vibrante: paintVibrante,
  elegante: paintElegante,
};

/**
 * Caneca, copo e garrafa: a faixa dá quase a volta toda, mas só ~130° ficam de frente para a câmera.
 * O template e a legenda automática vão nessa janela central (fração da largura da faixa); o resto fica
 * com o fundo. O texto posicionado pelo cliente pode ir para qualquer ponto da faixa.
 */
const FRONT_WINDOW: Partial<Record<MockupKind, number>> = { mug: 0.38, tumbler: 0.38, bottle: 0.38 };

/** Fração da largura usada pelo template e pela legenda automática (1 = a área toda). */
function windowShare(art: ArtRender): number {
  const share = art.frontWindow ?? (art.kind ? FRONT_WINDOW[art.kind] : undefined);
  return share && share > 0 && share < 1 ? share : 1;
}

type Painter = (s: Scene) => void;

/**
 * Desenha um template (ou a legenda sobre a imagem) com o bloco de texto. Sem posição livre: desenha
 * como sempre e mede o bloco, que vira a posição automática do editor 2D. Com posição livre: desenha o
 * quadro parado e depois o bloco levado até a posição do cliente, sempre inteiro dentro da área.
 */
function drawBlock(ctx: CanvasRenderingContext2D, w: number, h: number, art: ArtRender, label: string, painter: Painter, opts: Omit<SceneOpts, "layer">, placement: LayerPlacement | null): LayerInfo | null {
  const ww = Math.round(w * windowShare(art));
  const ox = Math.round((w - ww) / 2);
  const run = (layer: LayerControl, clip: boolean) => {
    ctx.save();
    ctx.translate(ox, 0);
    if (clip && ww < w) {
      ctx.beginPath();
      ctx.rect(0, 0, ww, h);
      ctx.clip();
    }
    painter(makeScene(ctx, ww, h, art, label, { ...opts, layer }));
    ctx.restore();
  };
  // Caixa e mapeamento no referencial da área (antes da janela frontal).
  const first = layerControl(ctx, placement ? "frame" : "auto");
  run(first, true);
  const box = first.box;
  if (!box) return null;
  // Folga para o que acompanha o texto e não entra na medida (estrelas, contorno, brilho); placa e
  // selo já cobrem o próprio desenho.
  const pad = first.container ? 1 : Math.min(box.x1 - box.x0, box.y1 - box.y0) * 0.05 + 1;
  const bw = box.x1 - box.x0 + pad * 2;
  const bh = box.y1 - box.y0 + pad * 2;
  if (!(bw > 1) || !(bh > 1)) return null;
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  // Escala em que o bloco cabe inteiro na área (scale 1 do cliente).
  const fit = Math.min(w / bw, h / bh);
  const base = { w: (bw * fit) / w, h: (bh * fit) / h };
  if (!placement) return { placement: { x: cx / w, y: cy / h, scale: 1 / fit, rotation: 0 }, base, free: false };
  const p = clampPlacement(placement, base, w / h);
  const local = new DOMMatrix()
    .translate(p.x * w, p.y * h)
    .rotate(p.rotation)
    .scale(fit * p.scale)
    .translate(-cx, -cy);
  const second = layerControl(ctx, "block");
  second.mapping = second.base.multiply(local).multiply(second.inverse);
  run(second, false);
  return { placement: p, base, free: true };
}

/** Template do estilo (sem imagem), já com o texto do cliente. */
function paintTemplate(ctx: CanvasRenderingContext2D, w: number, h: number, art: ArtRender, label: string, placement: LayerPlacement | null, fill: Rect): LayerInfo | null {
  const family = artFamily(art.kind);
  // Estampa de tecido: fundo transparente (o tecido aparece).
  const transparent = family === "apparel" && !art.opaque;
  const surface = transparent ? art.surface : undefined;
  const sample = art.sample !== false;
  if (!transparent) {
    ctx.fillStyle = makeScene(ctx, w, h, art, label, { transparent, sample }).bg;
    ctx.fillRect(fill.x, fill.y, fill.w, fill.h);
  }
  return drawBlock(ctx, w, h, art, label, PAINTERS[styleOf(art.style)], { transparent, sample, surface }, placement);
}

/**
 * Imagem enviada: na posição do cliente (inteira dentro da área, sem distorcer) ou no encaixe automático
 * (fit, zoom, deslocamento e giro de 90°). Devolve a caixa para o editor 2D.
 */
function paintImage(ctx: CanvasRenderingContext2D, w: number, h: number, image: HTMLImageElement, art: ArtSettings, placement: LayerPlacement | null): LayerInfo {
  const iw = Math.max(1, image.naturalWidth);
  const ih = Math.max(1, image.naturalHeight);
  const aspect = w / h;
  const base = containBase(iw / ih, aspect);
  // Redução/ampliação suave (sem serrilhado nem moiré na textura do 3D e no editor).
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (placement) {
    const p = clampPlacement(placement, base, aspect, Boolean(art.layout?.overflow));
    const dw = base.w * w * p.scale;
    const dh = base.h * h * p.scale;
    ctx.save();
    ctx.translate(p.x * w, p.y * h);
    ctx.rotate(p.rotation * DEG);
    ctx.drawImage(image, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
    return { placement: p, base, free: true };
  }
  const rotated = art.rotation === 90 || art.rotation === 270;
  const rw = rotated ? ih : iw;
  const rh = rotated ? iw : ih;
  const fitScale = art.fit === "cover" ? Math.max(w / rw, h / rh) : Math.min(w / rw, h / rh);
  const scale = fitScale * (Number.isFinite(art.zoom) && art.zoom > 0 ? art.zoom : 1);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.save();
  ctx.translate(w / 2 + art.offsetX * w, h / 2 + art.offsetY * h);
  ctx.rotate(art.rotation * DEG);
  ctx.drawImage(image, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  return { placement: { x: 0.5 + art.offsetX, y: 0.5 + art.offsetY, scale: dw / (base.w * w), rotation: normalizeRotation(art.rotation) }, base, free: false };
}

/** Texto do cliente por cima da imagem enviada, no tratamento do estilo escolhido (automático: embaixo). */
function paintCaption(s: Scene, style: ArtStyle) {
  const { ctx, w, h } = s;
  if (!s.text && !s.sub) return;
  if (!s.text) s.text = s.sub;
  if (s.text === s.sub) s.sub = "";
  const strip = s.shape === "strip";
  const box: Box = strip ? { x: w * 0.52, y: h * 0.12, w: w * 0.44, h: h * 0.76 } : { x: w * 0.07, y: h * 0.68, w: w * 0.86, h: h * 0.26 };
  const main: Type = { font: s.font, caps: style === "retro", lineHeight: 1.02 };
  const sub: Type = style === "elegante" ? { font: "playfair", italic: true } : { font: "figtree", weight: 700, caps: true, tracking: 0.14 };
  const soft: Paint = { fill: s.ink, shadow: "rgba(0,0,0,0.38)", shadowBlur: 0.14 };
  const base = { box, main, sub, mainMax: s.unit * 0.16, maxLines: strip ? 1 : 2, subRatio: 0.38 };
  ctx.save();
  switch (style) {
    case "moderno": {
      const plate = { x: box.x - s.unit * 0.03, y: box.y, w: box.w + s.unit * 0.06, h: box.h };
      begin(s, plate);
      ctx.fillStyle = rgba(s.accent, 0.94);
      ctx.fillRect(plate.x, plate.y, plate.w, plate.h);
      const ink = readableInk(s.accent);
      stack(s, { ...base, box: inset(box, s.unit * 0.02), align: "left", mainPaint: { fill: ink }, subPaint: { fill: rgba(ink, 0.8) } });
      break;
    }
    case "retro": {
      const color = pick([C.amber, C.red, C.sun], [s.ink], 1.6);
      stack(s, { ...base, mainPaint: { fill: s.ink, extrude: pick([C.red, C.magenta], [s.ink], 1.4), depth: 0.07 }, subPaint: { fill: readableInk(color) }, subPlate: (x, y, pw, ph) => ribbon(ctx, x, y, pw, ph, color) });
      break;
    }
    case "vibrante":
      stack(s, { ...base, mainPaint: { fill: s.ink, stroke: s.paper, strokeW: 0.18, drop: s.accent2, dropOffset: 0.06 }, subPaint: { fill: s.paper }, subPlate: (x, y, pw, ph) => pill(ctx, x, y, pw, ph, s.ink) });
      break;
    case "minimal":
      stack(s, { ...base, mainMax: s.unit * 0.12, main: { ...main, weight: 500 }, mainPaint: { fill: s.ink, shadow: "rgba(0,0,0,0.25)", shadowBlur: 0.1 }, subPaint: { fill: s.ink, shadow: "rgba(0,0,0,0.25)", shadowBlur: 0.2 }, gap: 0.4 });
      break;
    case "elegante":
      stack(s, { ...base, mainPaint: soft, subPaint: soft, divider: (x, y) => diamondRule(ctx, x, y, s.unit * 0.2, s.accent, Math.max(1, s.unit * 0.004)), dividerH: s.unit * 0.02 });
      break;
    default:
      stack(s, { ...base, mainPaint: soft, subPaint: soft });
  }
  ctx.restore();
}

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Área de arte inteira (ou a região do chinelo): imagem e legenda, ou o template; cada um na sua posição.
 * `fill`: retângulo do fundo no referencial da área (com sangria, maior que a área).
 */
function paintArea(ctx: CanvasRenderingContext2D, w: number, h: number, art: ArtRender, image: HTMLImageElement | null, label: string, info: PaintInfo, fill: Rect = { x: 0, y: 0, w, h }) {
  const layout = art.layout ?? null;
  if (image) {
    ctx.fillStyle = art.background;
    ctx.fillRect(fill.x, fill.y, fill.w, fill.h);
    if (art.paintOnly !== "texto") info.image = paintImage(ctx, w, h, image, art, layout?.image ?? null);
    if (art.paintOnly !== "imagem" && (art.text.trim() || (art.subtext ?? "").trim())) {
      const style = styleOf(art.style);
      info.text = drawBlock(ctx, w, h, art, label, (s) => paintCaption(s, style), { transparent: true, sample: false }, layout?.text ?? null);
    }
    return;
  }
  if (art.paintOnly === "imagem") return;
  info.text = paintTemplate(ctx, w, h, art, label, layout?.text ?? null, fill);
}

// ---------------------------------------------------------------------------
// Neon

type NeonLook = {
  font: ArtFont;
  weight?: number;
  caps?: boolean;
  tracking?: number;
  /** Espessura do tubo e do núcleo branco (em em) e força do brilho. */
  tube: number;
  core: number;
  glow: number;
  extra?: "frame" | "double" | "swash" | "underline";
  /** Uma cor por palavra (vibrante). */
  perWord?: boolean;
};

/** Cada estilo muda a letra do tubo, a espessura e o brilho; as cores vêm do LED escolhido. */
const NEON_LOOK: Record<ArtStyle, NeonLook> = {
  classico: { font: "neon", tube: 0.085, core: 0.03, glow: 1 },
  moderno: { font: "unbounded", weight: 500, tube: 0.05, core: 0.018, glow: 0.75, tracking: 0.02, extra: "frame" },
  retro: { font: "righteous", caps: true, tube: 0.075, core: 0.026, glow: 1.1, extra: "double" },
  minimal: { font: "neon", tube: 0.045, core: 0.016, glow: 0.55, tracking: 0.06, extra: "underline" },
  vibrante: { font: "pacifico", tube: 0.09, core: 0.032, glow: 1.35, perWord: true },
  elegante: { font: "greatvibes", tube: 0.055, core: 0.02, glow: 0.8, extra: "swash" },
};

function neonStroke(ctx: CanvasRenderingContext2D, draw: () => void, color: string, width: number, core: number, glow: number, unit: number) {
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  for (const blur of [0.12, 0.06, 0.02]) {
    ctx.shadowBlur = unit * blur * glow;
    draw();
  }
  ctx.shadowBlur = 0;
  ctx.lineWidth = core;
  ctx.strokeStyle = "#ffffff";
  draw();
}

/**
 * Caixa natural do letreiro de neon com o texto do cliente (a mesma tipografia, subtexto, extras e folga do tubo que o
 * drawNeon usa): `aspect` = largura ÷ altura e `lines` = linhas de tubo (texto + subtexto). O "Crie sua Frase em Led
 * Neon" (290) é medido assim, como no site atual, em que o sistema mede a caixa do texto: o cliente escolhe a largura e a
 * altura sai da proporção. Só no navegador (mede no canvas); sem document, devolve 2:1.
 */
export function neonTextBox(art: Pick<ArtSettings, "text" | "subtext" | "style" | "font">): { aspect: number; lines: number } {
  const fallback = { aspect: 2, lines: 1 };
  if (typeof document === "undefined") return fallback;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return fallback;
  const look = NEON_LOOK[styleOf(art.style)];
  const typed = art.text.trim();
  const typedSub = (art.subtext ?? "").trim();
  const text = typed || typedSub || SAMPLE_TEXT.neon;
  const subText = typed ? typedSub : "";
  const font: ArtFont = art.font === "figtree" ? look.font : art.font;
  const type: Type = { font, weight: font === look.font ? look.weight : undefined, caps: look.caps, tracking: look.tracking, lineHeight: 1.12 };
  const size = 100;
  const caps = (value: string, t: Type) => (t.caps && !isScriptFont(t.font) ? value.toLocaleUpperCase("pt-BR") : value);
  setType(ctx, type, size);
  const mainW = widest(ctx, [caps(text, type)]) - trackingPx(type, size);
  const mainH = size * 0.92;
  const subType: Type = { font: "neon", caps: true, tracking: 0.18 };
  const subSize = size * 0.4;
  let subW = 0;
  if (subText) {
    setType(ctx, subType, subSize);
    subW = widest(ctx, [caps(subText, subType)]) - trackingPx(subType, subSize);
  }
  const subH = subText ? subSize * 0.92 : 0;
  const gap = size * 0.32;
  const total = mainH + (subH ? gap + subH : 0);
  let halfW = Math.max(mainW, subW) / 2;
  let extent = total;
  if (look.extra === "frame") {
    halfW = Math.max(halfW, (mainW + size * 0.9) / 2);
    extent = Math.max(total, total + size * 0.7);
  } else if (look.extra && !subH) extent = mainH + gap * 0.5 + size * 0.45;
  const pad = size * look.tube + size * 0.04;
  const bw = halfW * 2 + pad * 2 + (look.extra === "double" ? size * 0.06 : 0);
  const bh = extent + pad * 2;
  return { aspect: bw > 0 && bh > 0 ? bw / bh : fallback.aspect, lines: subText ? 2 : 1 };
}

function drawNeon(ctx: CanvasRenderingContext2D, w: number, h: number, image: HTMLImageElement | null, art: ArtRender, info: PaintInfo) {
  ctx.clearRect(0, 0, w, h);
  const unit = Math.min(w, h);
  const colors = art.ledColors?.length ? art.ledColors : ["#ff4fd8", "#38e1ff"];
  const look = NEON_LOOK[styleOf(art.style)];
  const layout = art.layout ?? null;
  const aspect = w / h;
  if (image) {
    const iw = Math.max(1, image.naturalWidth);
    const ih = Math.max(1, image.naturalHeight);
    const base = containBase(iw / ih, aspect);
    // Automático: centralizada, com folga para o brilho.
    const auto: LayerPlacement = { x: 0.5, y: 0.5, scale: (Math.min((w * 0.86) / iw, (h * 0.8) / ih) * iw) / (base.w * w), rotation: 0 };
    const p = layout?.image ? clampPlacement(layout.image, base, aspect) : auto;
    info.image = { placement: p, base, free: Boolean(layout?.image) };
    const dw = base.w * w * p.scale;
    const dh = base.h * h * p.scale;
    ctx.save();
    ctx.translate(p.x * w, p.y * h);
    ctx.rotate(p.rotation * DEG);
    ctx.shadowColor = colors[0];
    ctx.shadowBlur = unit * 0.06 * look.glow;
    for (let i = 0; i < 3; i += 1) ctx.drawImage(image, -dw / 2, -dh / 2, dw, dh);
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(image, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
    return;
  }
  const typed = art.text.trim();
  const typedSub = (art.subtext ?? "").trim();
  // Só o subtexto escrito: ele vira o tubo principal.
  const text = typed || typedSub || SAMPLE_TEXT.neon;
  const subText = typed ? typedSub : "";
  // Fonte "Moderna" (padrão) vira a letra de tubo do estilo; as demais são escolha do cliente.
  const font: ArtFont = art.font === "figtree" ? look.font : art.font;
  const type: Type = { font, weight: font === look.font ? look.weight : undefined, caps: look.caps, tracking: look.tracking, lineHeight: 1.12 };
  const mainF = fitText(ctx, text, type, w * (look.extra === "frame" ? 0.76 : 0.86), h * (subText ? 0.56 : look.extra ? 0.68 : 0.8), unit * 0.34, 2);
  const subF = subText ? fitText(ctx, subText, { font: "neon", caps: true, tracking: 0.18 }, w * 0.74, h * 0.16, Math.max(4, mainF.size * 0.4), 1) : NO_FIT;
  const mainH = blockHeight(mainF);
  const subH = blockHeight(subF);
  const gap = mainF.size * 0.32;
  const total = mainH + (subH ? gap + subH : 0);
  const top = (h - total) / 2;
  const step = mainF.size * mainF.lh;
  const size = mainF.size;
  const below = top + mainH + gap * 0.5;

  // Caixa do letreiro (tubos, moldura e extras do estilo, com folga para o tubo e o brilho).
  setType(ctx, subF.type, Math.max(1, subF.size));
  const subW = subH ? widest(ctx, subF.lines) - trackingPx(subF.type, subF.size) : 0;
  setType(ctx, type, size);
  const track = trackingPx(type, size);
  const mainW = widest(ctx, mainF.lines) - track;
  const fw = Math.min(w * 0.94, mainW + size * 0.9);
  const fh = Math.min(h * 0.94, total + size * 0.7);
  let halfW = Math.max(mainW, subW) / 2;
  let y0 = top;
  let y1 = top + total;
  if (look.extra === "frame") {
    halfW = Math.max(halfW, fw / 2);
    y0 = Math.min(y0, h / 2 - fh / 2);
    y1 = Math.max(y1, h / 2 + fh / 2);
  } else if (look.extra && !subH) y1 = Math.max(y1, below + size * 0.45);
  const pad = size * look.tube + unit * 0.02;
  const bw = halfW * 2 + pad * 2 + (look.extra === "double" ? size * 0.06 : 0);
  const bh = y1 - y0 + pad * 2;
  const cx = w / 2;
  const cy = (y0 + y1) / 2;
  const fit = Math.min(w / bw, h / bh);
  const base = { w: (bw * fit) / w, h: (bh * fit) / h };
  let placement: LayerPlacement = { x: cx / w, y: cy / h, scale: 1 / fit, rotation: 0 };

  ctx.save();
  if (layout?.text) {
    // Posição do cliente: o letreiro inteiro é levado até lá (os tubos continuam vetoriais).
    placement = clampPlacement(layout.text, base, aspect);
    const m = new DOMMatrix()
      .translate(placement.x * w, placement.y * h)
      .rotate(placement.rotation)
      .scale(fit * placement.scale)
      .translate(-cx, -cy);
    ctx.setTransform(ctx.getTransform().multiply(m));
  }
  info.text = { placement, base, free: Boolean(layout?.text) };
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  setType(ctx, type, size);
  let wordIndex = 0;
  mainF.lines.forEach((line, i) => {
    const y = top + mainH / 2 + (i - (mainF.lines.length - 1) / 2) * step;
    const color = colors[i % colors.length];
    if (look.extra === "double") {
      // Contorno deslocado em outra cor, como letreiro de lanchonete.
      const second = colors[(i + 1) % colors.length];
      neonStroke(ctx, () => ctx.strokeText(line, w / 2 + track / 2 + size * 0.06, y + size * 0.06), second, size * look.tube * 0.6, size * look.core * 0.6, look.glow * 0.6, unit);
    }
    if (look.perWord) {
      const words = line.split(" ");
      const lineW = ctx.measureText(line).width;
      const space = ctx.measureText(" ").width;
      let x = w / 2 - lineW / 2;
      ctx.textAlign = "left";
      for (const word of words) {
        const ww = ctx.measureText(word).width;
        const wordColor = colors[wordIndex % colors.length];
        const at = x;
        neonStroke(ctx, () => ctx.strokeText(word, at, y), wordColor, size * look.tube, size * look.core, look.glow, unit);
        x += ww + space;
        wordIndex += 1;
      }
      ctx.textAlign = "center";
    } else {
      neonStroke(ctx, () => ctx.strokeText(line, w / 2 + track / 2, y, w * 0.94), color, size * look.tube, size * look.core, look.glow, unit);
    }
  });

  // Uma cor por linha; a seguinte acende o subtexto e os extras do estilo (moldura, sublinhado).
  const accent = colors[mainF.lines.length % colors.length];
  if (look.extra === "frame") {
    neonStroke(
      ctx,
      () => {
        ctx.beginPath();
        ctx.roundRect(w / 2 - fw / 2, h / 2 - fh / 2, fw, fh, size * 0.25);
        ctx.stroke();
      },
      accent,
      size * look.tube,
      size * look.core,
      look.glow,
      unit,
    );
  } else if (look.extra === "underline" && !subH) {
    neonStroke(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(w / 2 - mainW * 0.3, below + size * 0.12);
        ctx.lineTo(w / 2 + mainW * 0.3, below + size * 0.12);
        ctx.stroke();
      },
      accent,
      size * look.tube,
      size * look.core,
      look.glow,
      unit,
    );
  } else if (look.extra === "swash" && !subH) {
    neonStroke(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(w / 2 - mainW * 0.45, below + size * 0.1);
        ctx.bezierCurveTo(w / 2 - mainW * 0.1, below + size * 0.38, w / 2 + mainW * 0.15, below - size * 0.08, w / 2 + mainW * 0.45, below + size * 0.14);
        ctx.stroke();
      },
      colors[0],
      size * look.tube,
      size * look.core,
      look.glow,
      unit,
    );
  } else if (look.extra === "double" && !subH) {
    neonStroke(
      ctx,
      () => {
        ctx.beginPath();
        ctx.arc(w / 2, below - size * 1.4, size * 1.7, Math.PI * 0.36, Math.PI * 0.64);
        ctx.stroke();
      },
      accent,
      size * look.tube * 0.7,
      size * look.core * 0.7,
      look.glow,
      unit,
    );
  }
  if (subH) {
    setType(ctx, subF.type, subF.size);
    const y = top + mainH + gap + subH / 2;
    const line = subF.lines[0] ?? "";
    const subTrack = trackingPx(subF.type, subF.size);
    neonStroke(ctx, () => ctx.strokeText(line, w / 2 + subTrack / 2, y, w * 0.9), accent, subF.size * 0.09, subF.size * 0.035, look.glow * 0.7, unit);
  }
  ctx.restore();
}

/**
 * Sangria em volta da área (frações da largura e da altura da área). Com ela o canvas é a caixa da
 * sangria: a área (corte do gabarito) fica no meio, o fundo cobre tudo e, onde a arte não chega até a
 * borda da sangria, a última linha de pixels da área é esticada (`extend`, padrão: sim) — assim o corte
 * nunca deixa filete branco.
 */
export type PaintBleed = { left: number; top: number; right: number; bottom: number };

/**
 * Pinta a arte no canvas da peça e devolve onde ficaram o texto e a imagem (o editor 2D põe as alças ali).
 * No chinelo com região escolhida, a arte vai só na faixa da região (dedos, meio ou calcanhar) e o resto
 * da palmilha fica na cor da peça; a posição livre (art.layout) é relativa à região.
 * `opts.bleed`: o canvas inclui a sangria do gabarito em volta da área (arquivo de impressão e editor).
 */
export function paintArt(canvas: HTMLCanvasElement, variant: ArtVariant, art: ArtRender, image: HTMLImageElement | null, label: string, opts?: { bleed?: PaintBleed | null; extend?: boolean }): PaintInfo {
  if (art.varnishMask) return paintVarnishMask(canvas, variant, art, image, label, opts);
  const info: PaintInfo = { text: null, image: null };
  const ctx = canvas.getContext("2d");
  if (!ctx) return info;
  const { width: w, height: h } = canvas;
  if (!w || !h) return info;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  ctx.clearRect(0, 0, w, h);
  if (variant === "neon") {
    drawNeon(ctx, w, h, image, art, info);
    return info;
  }
  if (variant === "blank" || art.plain) {
    // Peça lisa: a cor dela (tecido, chinelo) ou o branco da face sem impressão.
    ctx.fillStyle = art.plain && art.surface && /^#[0-9a-f]{3,8}$/i.test(art.surface) ? art.surface : "#fafafa";
    ctx.fillRect(0, 0, w, h);
    return info;
  }
  const region = art.kind === "flipflop" ? flipflopRegion(art.region) : null;
  if (region && region.value !== "inteira") {
    // O topo do canvas é a ponta dos dedos (mesmo UV da palmilha).
    const top = Math.round((1 - region.to) * h);
    const height = Math.max(1, Math.round((1 - region.from) * h) - top);
    ctx.fillStyle = art.surface && /^#[0-9a-f]{3,8}$/i.test(art.surface) ? art.surface : "#fafaf8";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(0, top);
    ctx.beginPath();
    ctx.rect(0, 0, w, height);
    ctx.clip();
    // A faixa da região tem a proporção dela (não a da palmilha inteira).
    paintArea(ctx, w, height, { ...art, aspect: undefined }, image, label, info);
    ctx.restore();
  } else if (opts?.bleed) {
    const b = opts.bleed;
    const aw = w / (1 + b.left + b.right);
    const ah = h / (1 + b.top + b.bottom);
    const ax = b.left * aw;
    const ay = b.top * ah;
    ctx.save();
    ctx.translate(ax, ay);
    paintArea(ctx, aw, ah, art, image, label, info, { x: -ax, y: -ay, w, h });
    ctx.restore();
    // Estampa de tecido sem fundo (DTF): nada a estender, o tecido aparece em volta.
    const transparent = artFamily(art.kind) === "apparel" && !art.opaque && (!image || art.background === "rgba(0,0,0,0)");
    if (opts.extend !== false && !transparent) extendEdges(ctx, canvas, { x: ax, y: ay, w: aw, h: ah }, uncoveredSides(info.image, { x: ax, y: ay, w: aw, h: ah }, w, h, Boolean(image)));
  } else {
    paintArea(ctx, w, h, art, image, label, info);
  }
  if (variant === "gray" || art.mono === "gray") {
    const data = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < data.data.length; i += 4) {
      const lum = data.data[i] * 0.299 + data.data[i + 1] * 0.587 + data.data[i + 2] * 0.114;
      data.data[i] = data.data[i + 1] = data.data[i + 2] = lum;
    }
    ctx.putImageData(data, 0, 0);
  } else if (art.mono === "black") {
    // Um tom só (laser, talhamento): o que é escuro vira a gravação em preto; o claro (e o fundo) some.
    const data = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < data.data.length; i += 4) {
      const lum = data.data[i] * 0.299 + data.data[i + 1] * 0.587 + data.data[i + 2] * 0.114;
      const ink = lum < 150 && data.data[i + 3] > 40;
      data.data[i] = data.data[i + 1] = data.data[i + 2] = 0;
      data.data[i + 3] = ink ? 255 : 0;
    }
    ctx.putImageData(data, 0, 0);
  }
  return info;
}

/**
 * Máscara do verniz localizado: as camadas de art.varnish (sem o fundo, na mesma posição da arte) numa cor só e o resto
 * na outra. A camada escolhida que não existe (só a imagem, numa arte só de texto) vira "tudo".
 */
function paintVarnishMask(canvas: HTMLCanvasElement, variant: ArtVariant, art: ArtRender, image: HTMLImageElement | null, label: string, opts?: { bleed?: PaintBleed | null; extend?: boolean }): PaintInfo {
  const hasText = Boolean(art.text.trim() || (art.subtext ?? "").trim());
  const only = art.varnish === "imagem" && image ? "imagem" : art.varnish === "texto" && hasText ? "texto" : undefined;
  const ink = art.varnishMask === "white" ? 255 : 0;
  const info = paintArt(canvas, variant === "neon" ? "neon" : "front", { ...art, varnishMask: null, mono: null, background: "rgba(0,0,0,0)", paintOnly: only }, image, label, opts);
  const ctx = canvas.getContext("2d");
  if (!ctx || !canvas.width || !canvas.height) return info;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = data.data[i + 3] > 40 ? ink : 255 - ink;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return info;
}

/** Lados da sangria que a imagem não alcança (sem imagem, todos: o template termina na borda da área). */
function uncoveredSides(layer: LayerInfo | null, area: Rect, w: number, h: number, hasImage: boolean) {
  const all = { left: true, top: true, right: true, bottom: true };
  if (!hasImage || !layer) return all;
  const { placement: p, base } = layer;
  const e = layerExtent(base, p.scale, p.rotation, area.w / area.h);
  const cx = area.x + p.x * area.w;
  const cy = area.y + p.y * area.h;
  const hw = (e.w * area.w) / 2;
  const hh = (e.h * area.h) / 2;
  const tol = 0.5;
  return { left: cx - hw > tol, top: cy - hh > tol, right: cx + hw < w - tol, bottom: cy + hh < h - tol };
}

/** Estica a última linha/coluna de pixels da área até a borda da sangria (os cantos saem das linhas esticadas). */
function extendEdges(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, area: Rect, sides: { left: boolean; top: boolean; right: boolean; bottom: boolean }) {
  const W = canvas.width;
  const H = canvas.height;
  // Só pixels inteiramente dentro da área: a coluna da borda (fracionária) mistura arte e fundo e desbotaria
  // a sangria inteira. A coluna parcial fica dentro da faixa reescrita.
  const x0 = Math.max(0, Math.ceil(area.x - 1e-6));
  const y0 = Math.max(0, Math.ceil(area.y - 1e-6));
  const x1 = Math.min(W, Math.floor(area.x + area.w + 1e-6));
  const y1 = Math.min(H, Math.floor(area.y + area.h + 1e-6));
  if (x1 - x0 < 2 || y1 - y0 < 2) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  if (sides.left && x0 > 0) ctx.drawImage(canvas, x0, y0, 1, y1 - y0, 0, y0, x0, y1 - y0);
  if (sides.right && x1 < W) ctx.drawImage(canvas, x1 - 1, y0, 1, y1 - y0, x1, y0, W - x1, y1 - y0);
  if (sides.top && y0 > 0) ctx.drawImage(canvas, 0, y0, W, 1, 0, 0, W, y0);
  if (sides.bottom && y1 < H) ctx.drawImage(canvas, 0, y1 - 1, W, 1, 0, y1, W, H - y1);
  ctx.restore();
}

/** Fontes que um estilo usa além da escolhida pelo cliente (subtexto e letra do neon). */
function styleFonts(style: ArtStyle, kind: MockupKind | undefined): { font: ArtFont; italic?: boolean }[] {
  const list: { font: ArtFont; italic?: boolean }[] = [];
  if (style === "elegante") list.push({ font: "playfair", italic: true });
  if (!kind || artFamily(kind) === "neon") list.push({ font: NEON_LOOK[style].font });
  return list;
}

/** Garante que a fonte da arte (e as do estilo) estão carregadas antes de pintar no canvas. */
export async function loadArtFont(art: Pick<ArtSettings, "font" | "text"> & Partial<Pick<ArtRender, "style" | "subtext" | "kind">>): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const sample = `${art.text.trim()} ${(art.subtext ?? "").trim()}`.trim() || "Aa";
  const style = styleOf(art.style);
  const fonts = [{ font: art.font }, { font: "neon" as ArtFont }, ...styleFonts(style, art.kind)];
  await Promise.all(fonts.map((f) => document.fonts.load(canvasFont(f.font, 64, f.italic), sample))).catch(() => undefined);
}

export function shapeMask(canvas: HTMLCanvasElement, path: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = "#000";
  path(ctx, canvas.width, canvas.height);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

export function featherPath(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.08);
  ctx.quadraticCurveTo(w * 0.05, 0, w * 0.45, 0);
  ctx.bezierCurveTo(w * 1.05, h * 0.02, w * 1.02, h * 0.45, w * 0.82, h * 0.78);
  ctx.quadraticCurveTo(w * 0.7, h * 0.96, w * 0.42, h);
  ctx.closePath();
}

/** Wind banner modelo faca: topo inclinado e borda de fuga reta. */
export function knifePath(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.14);
  ctx.lineTo(w * 0.72, 0);
  ctx.quadraticCurveTo(w, 0, w, h * 0.1);
  ctx.lineTo(w * 0.86, h);
  ctx.closePath();
}

/** Wind banner modelo gota: bulbo arredondado em cima, afinando para baixo. */
export function dropPath(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.3);
  ctx.bezierCurveTo(0, -h * 0.05, w * 1.05, -h * 0.02, w * 0.92, h * 0.36);
  ctx.quadraticCurveTo(w * 0.8, h * 0.75, w * 0.32, h);
  ctx.closePath();
}

/** Wind banner modelo vela: borda de ataque curva, base reta. */
export function sailPath(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, 0);
  ctx.quadraticCurveTo(w * 0.95, h * 0.12, w, h);
  ctx.closePath();
}

export function roundPath(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
}

export function heartPath(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(w / 2, h * 0.95);
  ctx.bezierCurveTo(w * -0.1, h * 0.55, w * 0.1, h * -0.05, w / 2, h * 0.25);
  ctx.bezierCurveTo(w * 0.9, h * -0.05, w * 1.1, h * 0.55, w / 2, h * 0.95);
  ctx.closePath();
}

export { canvasFor, ART_FONTS };

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export async function thumbnailOf(src: string, maxSide = 320): Promise<string> {
  const image = await loadImage(src);
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}
