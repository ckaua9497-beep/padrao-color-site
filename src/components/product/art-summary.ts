import { ART_BACKGROUNDS, ART_FONTS, TEXT_COLORS, styleLabel, type ArtFamily, type ArtSettings } from "@/components/mockup/art";

// Resumo da arte para o carrinho, o modal de pré-visualização e o pedido (frente web-to-print).

/**
 * Texto, subtexto, estilo, fonte e cores da arte, para o carrinho e o resumo do pedido.
 * `family` (opcional) acrescenta o fundo quando ele é impresso (não vale para estampa e neon).
 */
export function artSummary(art: ArtSettings, family?: ArtFamily): Record<string, string> {
  // Só o subtexto escrito: o mockup mostra ele como texto principal, e o resumo também.
  const typed = art.text.trim();
  const typedSub = (art.subtext ?? "").trim();
  const text = typed || typedSub;
  const subtext = typed ? typedSub : "";
  if (!text) return {};
  const colorName = (value: string) => TEXT_COLORS.find((c) => c.value === value)?.label ?? ART_BACKGROUNDS.find((b) => b.value === value)?.label ?? value;
  const printsBackground = !art.src && family !== undefined && family !== "apparel" && family !== "neon";
  return {
    ...(text ? { "Texto da arte": text } : {}),
    ...(subtext ? { Subtexto: subtext } : {}),
    Estilo: styleLabel(art.style),
    Fonte: ART_FONTS[art.font]?.label ?? ART_FONTS.figtree.label,
    ...(family === "neon" ? {} : { "Cor do texto": colorName(art.textColor) }),
    ...(printsBackground ? { Fundo: colorName(art.background) } : {}),
  };
}
