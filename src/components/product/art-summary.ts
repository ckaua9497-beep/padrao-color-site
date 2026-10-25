import { ART_BACKGROUNDS, ART_FONTS, TEXT_COLORS, flipflopRegion, hasArtContent, ledColorName, styleLabel, type ArtFamily, type ArtSettings } from "@/components/mockup/art";
import { ART_BACK_KEY, ART_FACES_KEY, ART_LED_KEY, ART_POSITION_KEY, ART_REGION_KEY } from "./art-editor/summary-keys";

// Resumo da arte para o carrinho, o modal de pré-visualização e o pedido (frente web-to-print).

// Chaves do verso, do LED, da região e da posição nas opções do item (o carrinho lê o verso por elas).
export { ART_BACK_KEY, ART_FACES_KEY, ART_LED_KEY, ART_POSITION_KEY, ART_REGION_KEY } from "./art-editor/summary-keys";

/** Texto do verso, a imagem, ou os dois (null = sem arte no verso). */
export function backSummary(back: ArtSettings | null | undefined): string | null {
  if (!back || !hasArtContent(back)) return null;
  const text = back.text.trim() || (back.subtext ?? "").trim();
  if (back.src && text) return `imagem + texto “${text}”`;
  if (back.src) return "imagem";
  return `texto “${text}”`;
}

/** Nomes das cores de LED na ordem das linhas ("Rosa + Azul gelo"). */
export function ledSummary(colors: readonly string[] | null | undefined): string | null {
  return colors?.length ? colors.map(ledColorName).join(" + ") : null;
}

/**
 * Texto, subtexto, estilo, fonte e cores da arte, para o carrinho e o resumo do pedido.
 * `family` (opcional) acrescenta o fundo quando ele é impresso (não vale para estampa e neon).
 * Também entram o verso (camisas e almofadas), as cores de LED escolhidas (neon), a região do
 * chinelo e a posição livre do editor.
 */
export function artSummary(art: ArtSettings, family?: ArtFamily, surfaceLabels?: Readonly<Record<string, string>>): Record<string, string> {
  // Só o subtexto escrito: o mockup mostra ele como texto principal, e o resumo também.
  const typed = art.text.trim();
  const typedSub = (art.subtext ?? "").trim();
  const text = typed || typedSub;
  const subtext = typed ? typedSub : "";
  const colorName = (value: string) => TEXT_COLORS.find((c) => c.value === value)?.label ?? ART_BACKGROUNDS.find((b) => b.value === value)?.label ?? value;
  const printsBackground = !art.src && family !== undefined && family !== "apparel" && family !== "neon";
  const leds = family === "neon" || family === undefined ? ledSummary(art.ledColors) : null;
  const region = art.region && art.region !== "inteira" ? flipflopRegion(art.region).label : null;
  const back = backSummary(art.back);
  // Superfícies extras com arte, com o nome da página (sem a lista de nomes, o id).
  const faces =
    Object.entries(art.faces ?? {})
      .map(([id, face]) => {
        const what = backSummary(face);
        return what ? `${surfaceLabels?.[id] ?? id}: ${what}` : null;
      })
      .filter(Boolean)
      .join(" · ") || null;
  // A imagem no encaixe automático (tratador ou gabarito) não conta como posição ajustada pelo cliente.
  const fit = art.templateFit;
  const image = art.layout?.image;
  const autoImage = Boolean(image && fit?.placement && fit.src === art.src && Math.abs(image.x - fit.placement.x) < 1e-3 && Math.abs(image.y - fit.placement.y) < 1e-3 && Math.abs(image.scale - fit.placement.scale) / Math.max(1e-6, fit.placement.scale) < 1e-3);
  const free = Boolean(art.layout?.text || (image && !autoImage));
  return {
    ...(text ? { "Texto da arte": text } : {}),
    ...(subtext ? { Subtexto: subtext } : {}),
    ...(text ? { Estilo: styleLabel(art.style), Fonte: ART_FONTS[art.font]?.label ?? ART_FONTS.figtree.label } : {}),
    ...(text && family !== "neon" ? { "Cor do texto": colorName(art.textColor) } : {}),
    ...(text && printsBackground ? { Fundo: colorName(art.background) } : {}),
    ...(leds ? { [ART_LED_KEY]: leds } : {}),
    ...(region ? { [ART_REGION_KEY]: region } : {}),
    ...(free ? { [ART_POSITION_KEY]: "ajustada no editor" } : {}),
    ...(back ? { [ART_BACK_KEY]: back } : {}),
    ...(faces ? { [ART_FACES_KEY]: faces } : {}),
  };
}
