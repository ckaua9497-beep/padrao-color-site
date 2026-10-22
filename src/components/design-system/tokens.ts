// Leitura dos tokens do globals.css e matemática de contraste WCAG (mesma ideia de src/lib/tokens.test.ts).
// TS puro: o design system lê o CSS no servidor e passa o texto para cá.

export type Token = {
  /** Nome sem o "--" ("color-coral", "text-display--line-height"). */
  name: string;
  value: string;
  /** Comentário no fim da linha ("6,3:1 sobre branco: texto secundário"). */
  note: string | null;
  /** Último comentário de linha inteira antes do token ("Neutros", "Raios"…). */
  group: string;
};

const LINE_COMMENT = /^\/\*\s*(.+?)\s*\*\/$/;
const DECLARATION = /^--([\w-]+):\s*(.+?);\s*(?:\/\*\s*(.+?)\s*\*\/)?$/;

/** Tokens do bloco `@theme`, na ordem do arquivo. Ignora os @keyframes aninhados. */
export function parseTheme(css: string): Token[] {
  const start = css.search(/@theme\b[^{]*\{/);
  if (start < 0) return [];
  const tokens: Token[] = [];
  let depth = 0;
  let group = "Geral";
  let begun = false;
  for (const raw of css.slice(start).split(/\r?\n/)) {
    const line = raw.trim();
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;
    if (begun && depth === 1) {
      const comment = LINE_COMMENT.exec(line);
      // Só a primeira frase, sem parênteses: "Papéis. Branco sobre coral…" → "Papéis".
      if (comment) group = comment[1].split(/[.:]/)[0].replace(/\s*\([^)]*\)/g, "").trim();
      const decl = DECLARATION.exec(line);
      if (decl) tokens.push({ name: decl[1], value: decl[2].trim(), note: decl[3] ?? null, group });
    }
    depth += opens - closes;
    if (opens > 0) begun = true;
    if (begun && depth <= 0) break;
  }
  return tokens;
}

/** Resolve `var(--color-x)` encadeado até um valor literal. */
export function resolveValue(value: string, tokens: Map<string, string>, guard = 0): string {
  const ref = /^var\(--([\w-]+)\)$/.exec(value.trim());
  if (!ref || guard > 8) return value;
  const next = tokens.get(ref[1]);
  return next ? resolveValue(next, tokens, guard + 1) : value;
}

export function isHex(value: string): boolean {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}

function rgb(hex: string): [number, number, number] {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const linear = (channel: number) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** Razão de contraste WCAG 2.x entre duas cores hex. */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

export const AA = 4.5;
export const AA_LARGE = 3;

export type Grade = "AAA" | "AA" | "AA grande" | "Falha";

export function grade(ratio: number): Grade {
  if (ratio >= 7) return "AAA";
  if (ratio >= AA) return "AA";
  if (ratio >= AA_LARGE) return "AA grande";
  return "Falha";
}

/** "4,52:1" no formato brasileiro. */
export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2).replace(".", ",")}:1`;
}

/** Pares texto/fundo aprovados (os mesmos que src/lib/tokens.test.ts garante). */
export const APPROVED_PAIRS: { label: string; fg: string; bg: string; min: number }[] = [
  { label: "Texto sobre papel", fg: "ink", bg: "paper", min: AA },
  { label: "Texto secundário sobre papel", fg: "muted", bg: "paper", min: AA },
  { label: "Texto secundário sobre a faixa B", fg: "muted", bg: "mist", min: AA },
  { label: "Texto secundário sobre a faixa A", fg: "muted", bg: "fog", min: AA },
  { label: "Texto secundário sobre o FAQ", fg: "muted", bg: "cloud", min: AA },
  { label: "Texto secundário sobre o checkout", fg: "muted", bg: "page-checkout", min: AA },
  { label: "Coral escuro (texto pequeno, PIX, erro)", fg: "coral-700", bg: "paper", min: AA },
  { label: "Coral escuro sobre coral-50 (selo PIX)", fg: "coral-700", bg: "coral-50", min: AA },
  { label: "Branco sobre coral escuro", fg: "paper", bg: "coral-700", min: AA },
  { label: "Preto sobre coral (selos, barra de aviso)", fg: "ink", bg: "coral", min: AA },
  { label: "Branco sobre coral — só ≥ 19px bold", fg: "paper", bg: "coral", min: AA_LARGE },
  { label: "Branco sobre o hover do coral — só texto grande", fg: "paper", bg: "coral-600", min: AA_LARGE },
  { label: "Preço coral sobre papel — só ≥ 19px bold", fg: "coral", bg: "paper", min: AA_LARGE },
  { label: "Preview sobre papel", fg: "preview", bg: "paper", min: AA },
  { label: "Branco sobre preview (hover)", fg: "paper", bg: "preview", min: AA },
  { label: "Subtle — só texto grande e ícones", fg: "subtle", bg: "paper", min: AA_LARGE },
  { label: "Eyebrow coral sobre preto", fg: "coral", bg: "ink", min: AA },
  { label: "Texto secundário sobre a faixa cinza da vitrine", fg: "muted", bg: "vitrine", min: AA },
  { label: "Laranja sobre a faixa cinza da vitrine — só texto grande", fg: "coral", bg: "vitrine", min: AA_LARGE },
  { label: "Laranja sobre a faixa escura", fg: "coral", bg: "night", min: AA },
  { label: "Branco sobre a faixa escura", fg: "paper", bg: "night", min: AA },
];

/** Agrupa tokens de papel tipográfico: "text-display" + "text-display--line-height"… */
export type TypeRole = { name: string; size: string; lineHeight: string | null; letterSpacing: string | null; weight: string | null; note: string | null };

export function typeRoles(tokens: Token[]): TypeRole[] {
  const roles = new Map<string, TypeRole>();
  for (const token of tokens) {
    if (!token.name.startsWith("text-")) continue;
    const [base, modifier] = token.name.split("--");
    const role = roles.get(base) ?? { name: base, size: "", lineHeight: null, letterSpacing: null, weight: null, note: null };
    if (!modifier) {
      role.size = token.value;
      role.note = token.note;
    } else if (modifier === "line-height") role.lineHeight = token.value;
    else if (modifier === "letter-spacing") role.letterSpacing = token.value;
    else if (modifier === "font-weight") role.weight = token.value;
    roles.set(base, role);
  }
  return [...roles.values()].filter((r) => r.size);
}

/** Pontos de controle de um `cubic-bezier(...)`; null quando o valor é outra coisa. */
export function bezierOf(value: string): [number, number, number, number] | null {
  const match = /^cubic-bezier\(([^)]+)\)$/.exec(value.trim());
  if (!match) return null;
  const points = match[1].split(",").map((n) => Number(n.trim()));
  return points.length === 4 && points.every(Number.isFinite) ? (points as [number, number, number, number]) : null;
}
