import { ART_STYLES, DEFAULT_ART, type ArtSettings } from "@/components/mockup/art";
import { formatDate, getPalette, getPartyType, type PartyDetails } from "@/lib/party";

/**
 * Arte da prévia (mockup 3D e foto): nome em destaque e frase embaixo (ou idade e data), no estilo do tipo
 * de festa e nas cores da paleta. Sem nome ainda, mostra o exemplo do campo para dar a ideia.
 */
export function partyArt(details: PartyDetails): ArtSettings {
  const type = getPartyType(details.type);
  const palette = getPalette(details.palette);
  const font = ART_STYLES.find((s) => s.value === type.style)?.font ?? DEFAULT_ART.font;
  const sample = type.namePlaceholder.replace(/^Ex\.:\s*/, "");
  const when = [details.age.trim(), details.date ? formatDate(details.date) : ""].filter(Boolean).join(" · ");
  return {
    ...DEFAULT_ART,
    text: details.name.trim() || sample,
    subtext: details.phrase.trim() || when,
    style: type.style,
    font,
    background: palette.background,
    textColor: palette.ink,
  };
}
