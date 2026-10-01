import { Bebas_Neue, Pacifico, Playfair_Display, Tilt_Neon } from "next/font/google";

// Fontes do "Texto da arte". preload: false — só baixam quando o cliente escolhe a fonte.
const bebas = Bebas_Neue({ weight: "400", subsets: ["latin"], preload: false, display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], preload: false, display: "swap" });
const pacifico = Pacifico({ weight: "400", subsets: ["latin"], preload: false, display: "swap" });
const tiltNeon = Tilt_Neon({ subsets: ["latin"], preload: false, display: "swap" });

export const ART_FONTS = {
  figtree: { label: "Moderna", weight: 800, family: null },
  bebas: { label: "Condensada", weight: 400, family: bebas.style.fontFamily },
  playfair: { label: "Elegante", weight: 700, family: playfair.style.fontFamily },
  pacifico: { label: "Manuscrita", weight: 400, family: pacifico.style.fontFamily },
  neon: { label: "Neon", weight: 400, family: tiltNeon.style.fontFamily },
} as const;

export type ArtFont = keyof typeof ART_FONTS;

export const ART_FONT_KEYS = Object.keys(ART_FONTS) as ArtFont[];

/** Família CSS da fonte; a Figtree é a fonte do site (variável --font-figtree). */
export function fontFamilyOf(font: ArtFont): string {
  const family = ART_FONTS[font].family;
  if (family) return family;
  if (typeof document === "undefined") return "Arial, sans-serif";
  return getComputedStyle(document.body).fontFamily || "Arial, sans-serif";
}

/** String para ctx.font e document.fonts.load. */
export function canvasFont(font: ArtFont, sizePx: number, italic = false): string {
  return `${italic ? "italic " : ""}${ART_FONTS[font].weight} ${Math.round(sizePx)}px ${fontFamilyOf(font)}`;
}
