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

// Cores do símbolo da Padrão (tokens do globals.css) para fundos de card e ícones.
export const SPECTRUM = [
  { solid: "var(--color-sun)", soft: "var(--color-sun-50)" },
  { solid: "var(--color-cyan)", soft: "var(--color-cyan-50)" },
  { solid: "var(--color-lime)", soft: "var(--color-lime-50)" },
  { solid: "var(--color-magenta)", soft: "var(--color-magenta-50)" },
  { solid: "var(--color-amber)", soft: "var(--color-amber-50)" },
  { solid: "var(--color-blue)", soft: "var(--color-blue-50)" },
  { solid: "var(--color-red)", soft: "var(--color-red-50)" },
] as const;

export function spectrumAt(index: number) {
  return SPECTRUM[((index % SPECTRUM.length) + SPECTRUM.length) % SPECTRUM.length];
}
