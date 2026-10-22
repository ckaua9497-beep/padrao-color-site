import { Bebas_Neue, Comfortaa, Fraunces, Great_Vibes, Pacifico, Playfair_Display, Righteous, Sacramento, Tilt_Neon, Unbounded, Yellowtail } from "next/font/google";

// Fontes do "Texto da arte". preload: false — só baixam quando o cliente escolhe a fonte (ou o estilo pede).
const bebas = Bebas_Neue({ weight: "400", subsets: ["latin"], preload: false, display: "swap" });
// Com itálico: o subtexto do estilo Elegante usa a Playfair inclinada.
const playfair = Playfair_Display({ subsets: ["latin"], style: ["normal", "italic"], preload: false, display: "swap" });
const pacifico = Pacifico({ weight: "400", subsets: ["latin"], preload: false, display: "swap" });
const tiltNeon = Tilt_Neon({ subsets: ["latin"], preload: false, display: "swap" });
// Variáveis (um arquivo cobre todos os pesos). Sem eixos extras: o canvas não controla variações além do peso.
const fraunces = Fraunces({ subsets: ["latin"], preload: false, display: "swap" });
const unbounded = Unbounded({ subsets: ["latin"], preload: false, display: "swap" });
const greatVibes = Great_Vibes({ weight: "400", subsets: ["latin"], preload: false, display: "swap" });
const righteous = Righteous({ weight: "400", subsets: ["latin"], preload: false, display: "swap" });
// Letras de tubo do neon: arredondada (traço contínuo), manuscrita fina e letreiro anos 50.
const comfortaa = Comfortaa({ subsets: ["latin"], preload: false, display: "swap" });
const sacramento = Sacramento({ weight: "400", subsets: ["latin"], preload: false, display: "swap" });
const yellowtail = Yellowtail({ weight: "400", subsets: ["latin"], preload: false, display: "swap" });

type FontInfo = {
  label: string;
  weight: number;
  /** null = Figtree, a fonte do site. */
  family: string | null;
  /** Faixa de pesos da fonte variável; ausente = peso único. */
  weights?: readonly [number, number];
  /** Caligráfica: nunca vira caixa alta nem ganha espaçamento entre letras. */
  script?: boolean;
};

export const ART_FONTS = {
  figtree: { label: "Moderna", weight: 800, family: null, weights: [300, 900] },
  bebas: { label: "Condensada", weight: 400, family: bebas.style.fontFamily },
  playfair: { label: "Elegante", weight: 700, family: playfair.style.fontFamily, weights: [400, 900] },
  pacifico: { label: "Manuscrita", weight: 400, family: pacifico.style.fontFamily, script: true },
  neon: { label: "Neon", weight: 400, family: tiltNeon.style.fontFamily },
  fraunces: { label: "Retrô", weight: 800, family: fraunces.style.fontFamily, weights: [100, 900] },
  unbounded: { label: "Larga", weight: 700, family: unbounded.style.fontFamily, weights: [200, 900] },
  greatvibes: { label: "Caligrafia", weight: 400, family: greatVibes.style.fontFamily, script: true },
  righteous: { label: "Display", weight: 400, family: righteous.style.fontFamily },
  comfortaa: { label: "Arredondada", weight: 500, family: comfortaa.style.fontFamily, weights: [300, 700] },
  sacramento: { label: "Fina", weight: 400, family: sacramento.style.fontFamily, script: true },
  yellowtail: { label: "Letreiro", weight: 400, family: yellowtail.style.fontFamily, script: true },
} as const satisfies Record<string, FontInfo>;

export type ArtFont = keyof typeof ART_FONTS;

export const ART_FONT_KEYS = Object.keys(ART_FONTS) as ArtFont[];

/** Fontes do "Texto da arte" nas peças impressas. */
export const TEXT_FONT_KEYS: readonly ArtFont[] = ["figtree", "bebas", "playfair", "pacifico", "neon", "fraunces", "unbounded", "greatvibes", "righteous"];

/**
 * "Letras" do neon: "figtree" é a letra de tubo do estilo; as demais têm traço contínuo e funcionam
 * como tubo de LED (sem serifa fina nem contraste alto).
 */
export const NEON_FONT_KEYS: readonly ArtFont[] = ["figtree", "neon", "comfortaa", "sacramento", "yellowtail", "pacifico", "greatvibes", "righteous", "unbounded"];

function info(font: ArtFont): FontInfo {
  return ART_FONTS[font] ?? ART_FONTS.figtree;
}

/** Família CSS da fonte; a Figtree vem do next/font (variável --font-figtree, a fonte do site é outra). */
export function fontFamilyOf(font: ArtFont): string {
  const family = info(font).family;
  if (family) return family;
  if (typeof document === "undefined") return "Arial, sans-serif";
  const figtree = getComputedStyle(document.documentElement).getPropertyValue("--font-figtree").trim();
  return figtree ? `${figtree}, Arial, sans-serif` : "Arial, sans-serif";
}

/** A fonte é caligráfica (sem caixa alta, sem espaçamento). */
export function isScriptFont(font: ArtFont): boolean {
  return Boolean(info(font).script);
}

/** Peso efetivo: o pedido, dentro da faixa da fonte variável; o peso único nas demais. */
export function fontWeightOf(font: ArtFont, weight?: number): number {
  const data = info(font);
  if (weight === undefined || !data.weights) return data.weight;
  return Math.min(data.weights[1], Math.max(data.weights[0], Math.round(weight)));
}

/** String para ctx.font e document.fonts.load. `weight` só vale nas fontes variáveis. */
export function canvasFont(font: ArtFont, sizePx: number, italic = false, weight?: number): string {
  return `${italic ? "italic " : ""}${fontWeightOf(font, weight)} ${Math.max(1, Math.round(sizePx))}px ${fontFamilyOf(font)}`;
}
