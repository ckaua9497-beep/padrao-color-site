import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Lê os tokens direto do CSS para que o teste acompanhe qualquer mudança de valor.
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const colors = new Map<string, string>();
for (const match of css.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{3,8})\s*;/gi)) colors.set(match[1], match[2].toLowerCase());

const WHITE = "#ffffff";

function color(name: string): string {
  if (name.startsWith("#")) return name;
  const value = colors.get(name);
  assert.ok(value, `token --color-${name} não encontrado em globals.css`);
  return value;
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

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(color(a)), luminance(color(b))].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Cor `fg` com opacidade `alpha` sobre `bg` (como bg-preview/10). */
function over(fg: string, alpha: number, bg: string): string {
  const top = rgb(color(fg));
  const base = rgb(color(bg));
  return `#${top.map((c, i) => Math.round(c * alpha + base[i] * (1 - alpha)).toString(16).padStart(2, "0")).join("")}`;
}

const AA = 4.5;
const LARGE = 3;

test("tokens de identidade seguem o BRIEFING", () => {
  assert.equal(color("ink"), "#000000");
  assert.equal(color("ink-soft"), "#141414");
  assert.equal(color("coral"), "#ff463a");
  assert.equal(color("coral-600"), "#e03a30");
  assert.equal(color("mist"), "#f4f4f4");
  assert.equal(color("fog"), "#ededed");
  assert.equal(color("cloud"), "#f0f2f6");
  assert.match(css, /--radius-card:\s*15px;/);
  assert.match(css, /--radius-control:\s*12px;/);
  assert.match(css, /--spacing-header:\s*92px;/);
  assert.match(css, /--shadow-header:\s*0 3px 45px rgb\(0 0 0 \/ 0\.15\);/);
});

const PAIRS: [string, string, string, number][] = [
  ["texto sobre papel", "ink", "paper", AA],
  ["texto secundário sobre papel", "muted", "paper", AA],
  ["texto secundário sobre a faixa B", "muted", "mist", AA],
  ["texto secundário sobre a faixa A", "muted", "fog", AA],
  ["texto secundário sobre o FAQ", "muted", "cloud", AA],
  ["texto secundário sobre o checkout", "muted", "page-checkout", AA],
  ["coral escuro (texto pequeno, PIX, erro) sobre papel", "coral-700", "paper", AA],
  ["coral escuro sobre coral-50", "coral-700", "coral-50", AA],
  ["branco sobre coral escuro", WHITE, "coral-700", AA],
  ["preto sobre coral (selos, barra de aviso)", "ink", "coral", AA],
  ["branco sobre coral, só texto ≥ 19px bold", WHITE, "coral", LARGE],
  ["branco sobre o hover do coral, só texto grande", WHITE, "coral-600", LARGE],
  ["preço coral sobre papel, só texto ≥ 19px bold", "coral", "paper", LARGE],
  ["preview sobre papel", "preview", "paper", AA],
  ["branco sobre preview (hover)", WHITE, "preview", AA],
  ["subtle, só texto grande e ícones", "subtle", "paper", LARGE],
  ["eyebrow coral sobre preto", "coral", "ink", AA],
];

for (const [label, fg, bg, min] of PAIRS) {
  test(`contraste: ${label} ≥ ${min}:1`, () => {
    const ratio = contrast(fg, bg);
    assert.ok(ratio >= min, `${label}: ${ratio.toFixed(2)}:1`);
  });
}

test("preview passa AA também sobre o próprio fundo a 10%", () => {
  assert.ok(contrast("preview", over("preview", 0.1, WHITE)) >= AA);
});

test("branco sobre coral não passa AA em texto pequeno (por isso a regra dos 19px bold)", () => {
  assert.ok(contrast(WHITE, "coral") < AA);
});
