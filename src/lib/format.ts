const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(value: number): string {
  return brl.format(value);
}

export function quantityLabel(qty: number): string {
  if (!qty || qty <= 1) return "por unidade";
  return `por ${qty.toLocaleString("pt-BR")} un.`;
}

export function leadLabel(days: number | null | undefined): string | null {
  if (!days) return null;
  return days === 1 ? "Produção em 1 dia útil" : `Produção em ${days} dias úteis`;
}

export function imageUrl(src: string): string {
  return encodeURI(decodeURI(src));
}

export const SPECTRUM = [
  { solid: "#f8e028", soft: "#fef8d4" },
  { solid: "#18b0e8", soft: "#def3fc" },
  { solid: "#b0c818", soft: "#f1f6d6" },
  { solid: "#e02888", soft: "#fce4f0" },
  { solid: "#f0a000", soft: "#fdefd2" },
  { solid: "#0888c8", soft: "#ddeef8" },
  { solid: "#e02018", soft: "#fde3e1" },
] as const;

export function spectrumAt(index: number) {
  return SPECTRUM[((index % SPECTRUM.length) + SPECTRUM.length) % SPECTRUM.length];
}
