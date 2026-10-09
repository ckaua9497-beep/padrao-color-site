import { Fraunces, Nunito, Oswald, Space_Grotesk } from "next/font/google";
import { PALETTES, paletteVars } from "@/lib/multiloja/core";
import { CANTOS, FUNDOS, type FonteKey, type Tema } from "@/lib/multiloja/tema";

/*
 * Estilo do tema da loja em CSS: cor da marca, raios, fonte dos títulos e fundo viram variáveis em :root (valem
 * também para o carrinho e os diálogos, que abrem fora da vitrine); cartões, botões e fonte vão em atributos
 * data-* do invólucro .loja-tema (regras em globals.css). Fontes sem preload: cada loja baixa só a que usa.
 */

const fraunces = Fraunces({ subsets: ["latin"], display: "swap", preload: false });
const grotesk = Space_Grotesk({ subsets: ["latin"], display: "swap", preload: false });
const nunito = Nunito({ subsets: ["latin"], display: "swap", preload: false });
const oswald = Oswald({ subsets: ["latin"], display: "swap", preload: false });

export const FONTE_FAMILIA: Record<FonteKey, string> = {
  figtree: "var(--font-figtree), ui-sans-serif, system-ui, sans-serif",
  fraunces: fraunces.style.fontFamily,
  grotesk: grotesk.style.fontFamily,
  nunito: nunito.style.fontFamily,
  oswald: oswald.style.fontFamily,
};

export function temaVars(tema: Tema): Record<string, string> {
  const cantos = CANTOS[tema.estilo.cantos];
  return {
    ...paletteVars(tema.estilo.paleta),
    "--radius-card": cantos.card,
    "--radius-control": cantos.control,
    "--radius-panel": cantos.panel,
    "--radius-thumb": cantos.thumb,
    "--font-titulo": FONTE_FAMILIA[tema.estilo.fonte],
    "--loja-fundo": tema.estilo.fundo === "marca" ? PALETTES[tema.estilo.paleta].soft : FUNDOS[tema.estilo.fundo].cor,
  };
}

/** `:root{…}` com as variáveis do tema (vai num <style> da vitrine e da prévia). */
export function temaCss(tema: Tema): string {
  return `:root{${Object.entries(temaVars(tema))
    .map(([name, value]) => `${name}:${value}`)
    .join(";")}}`;
}

export function temaAttrs(tema: Tema): Record<string, string> {
  return { "data-cards": tema.estilo.cards, "data-botoes": tema.estilo.botoes, "data-fonte": tema.estilo.fonte };
}
