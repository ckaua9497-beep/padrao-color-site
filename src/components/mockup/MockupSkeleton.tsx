import type { CSSProperties } from "react";

/*
 * Fundo de estúdio ("ciclorama infinito") compartilhado pelo viewer 3D, pelo skeleton e pelo snapshot.
 * Uma única descrição gera o CSS (com os tokens do design system via var()) e a pintura no canvas 2D
 * (os mesmos tokens lidos do :root), então a foto do carrinho tem o mesmo fundo da tela.
 */

/** Token do design system (`paper`, `mist`…) ou hex, opcionalmente misturado com outra cor e com transparência. */
export type Tone = { color: string; mix?: string; amount?: number; alpha?: number };
/** Elipse radial: centro e raios em % da largura/altura; paradas de 0 a 1. */
export type BackdropLayer = { at: [number, number]; radius: [number, number]; stops: [number, Tone][] };
/** Camadas de baixo para cima sobre a cor de base. */
export type Backdrop = { base: Tone; layers: BackdropLayer[] };

const HEX = /^#[0-9a-f]{6}$/i;
const DEFAULT_GLOW = ["#ff4fd8", "#38e1ff"];

/** Valores dos tokens caso o CSS ainda não tenha carregado (mesmos de globals.css). */
const TOKEN_FALLBACK: Record<string, string> = {
  paper: "#ffffff",
  mist: "#f4f4f4",
  fog: "#ededed",
  line: "#e5e5e8",
  "line-strong": "#cccccc",
  night: "#17171c",
  graphite: "#282e34",
  ink: "#000000",
  "peach-50": "#fbeee6",
};

/**
 * Cena clara: parede branca quente no centro, névoa nas bordas, cantos levemente mais escuros e uma poça
 * de luz no chão onde a sombra de contato pousa. Cena escura (neon): noite profunda com o brilho das cores do LED.
 */
export function studioBackdrop(dark: boolean, glow: readonly string[] = []): Backdrop {
  if (!dark) {
    return {
      base: { color: "mist", mix: "fog", amount: 0.35 },
      layers: [
        {
          at: [50, 40],
          radius: [82, 72],
          stops: [
            [0, { color: "paper", mix: "peach-50", amount: 0.32 }],
            [0.42, { color: "paper", mix: "mist", amount: 0.45 }],
            [1, { color: "mist", alpha: 0 }],
          ],
        },
        {
          at: [50, 46],
          radius: [92, 88],
          stops: [
            [0.55, { color: "line", alpha: 0 }],
            [1, { color: "line", alpha: 0.85 }],
          ],
        },
        {
          at: [50, 74],
          radius: [52, 15],
          stops: [
            [0, { color: "paper", alpha: 0.9 }],
            [1, { color: "paper", alpha: 0 }],
          ],
        },
      ],
    };
  }
  const colors = glow.filter((c) => HEX.test(c));
  const a = colors[0] ?? DEFAULT_GLOW[0];
  const b = colors[1] ?? colors[0] ?? DEFAULT_GLOW[1];
  return {
    base: { color: "night", mix: "ink", amount: 0.4 },
    layers: [
      {
        at: [50, 44],
        radius: [80, 70],
        stops: [
          [0, { color: "night", mix: "graphite", amount: 0.4 }],
          [0.6, { color: "night" }],
          [1, { color: "night", alpha: 0 }],
        ],
      },
      {
        at: [34, 50],
        radius: [46, 42],
        stops: [
          [0, { color: a, alpha: 0.2 }],
          [1, { color: a, alpha: 0 }],
        ],
      },
      {
        at: [66, 52],
        radius: [46, 42],
        stops: [
          [0, { color: b, alpha: 0.15 }],
          [1, { color: b, alpha: 0 }],
        ],
      },
      {
        at: [50, 76],
        radius: [48, 13],
        stops: [
          [0, { color: "paper", alpha: 0.07 }],
          [1, { color: "paper", alpha: 0 }],
        ],
      },
    ],
  };
}

const pct = (value: number) => `${Math.round(value * 1000) / 10}%`;
// Com fallback: um token ausente invalidaria o `background` inteiro (fundo transparente), não só a camada.
const cssRef = (color: string) => (color.startsWith("#") ? color : `var(--color-${color}, ${TOKEN_FALLBACK[color] ?? "transparent"})`);

function toneCss({ color, mix, amount = 0, alpha = 1 }: Tone): string {
  let out = cssRef(color);
  if (mix && amount > 0) out = `color-mix(in srgb, ${out}, ${cssRef(mix)} ${pct(amount)})`;
  if (alpha < 1) out = `color-mix(in srgb, ${out} ${pct(alpha)}, transparent)`;
  return out;
}

/** `background` em CSS: camadas de cima para baixo e a cor de base por último. */
export function backdropCss(backdrop: Backdrop): string {
  const layers = [...backdrop.layers]
    .reverse()
    .map(({ at, radius, stops }) => `radial-gradient(${radius[0]}% ${radius[1]}% at ${at[0]}% ${at[1]}%, ${stops.map(([o, t]) => `${toneCss(t)} ${pct(o)}`).join(", ")})`);
  return [...layers, toneCss(backdrop.base)].join(", ");
}

type Rgb = [number, number, number];

function parseHex(value: string): Rgb | null {
  const hex = value.trim();
  if (/^#[0-9a-f]{3}$/i.test(hex)) return [1, 2, 3].map((i) => parseInt(hex[i] + hex[i], 16)) as Rgb;
  if (!HEX.test(hex)) return null;
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

function resolveRgb(color: string, style: CSSStyleDeclaration | null): Rgb {
  if (color.startsWith("#")) return parseHex(color) ?? [0, 0, 0];
  const live = style?.getPropertyValue(`--color-${color}`) ?? "";
  return parseHex(live) ?? parseHex(TOKEN_FALLBACK[color] ?? "") ?? [0, 0, 0];
}

function toneCanvas({ color, mix, amount = 0, alpha = 1 }: Tone, style: CSSStyleDeclaration | null): string {
  let rgb = resolveRgb(color, style);
  if (mix && amount > 0) {
    const other = resolveRgb(mix, style);
    rgb = rgb.map((v, i) => v + (other[i] - v) * amount) as Rgb;
  }
  const [r, g, b] = rgb.map((v) => Math.round(v));
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

/** Pinta o mesmo fundo num canvas 2D (snapshot do carrinho e "Baixar imagem"). */
export function paintBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number, backdrop: Backdrop, root?: Element): void {
  if (width <= 0 || height <= 0) return;
  const style = root && typeof getComputedStyle === "function" ? getComputedStyle(root) : null;
  ctx.save();
  ctx.fillStyle = toneCanvas(backdrop.base, style);
  ctx.fillRect(0, 0, width, height);
  for (const { at, radius, stops } of backdrop.layers) {
    const cx = (at[0] / 100) * width;
    const cy = (at[1] / 100) * height;
    const rx = (radius[0] / 100) * width;
    const ry = (radius[1] / 100) * height;
    if (rx <= 0 || ry <= 0) continue;
    ctx.save();
    // Gradiente circular de raio 1 esticado na elipse, como o radial-gradient do CSS.
    ctx.translate(cx, cy);
    ctx.scale(rx, ry);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    stops.forEach(([offset, tone]) => gradient.addColorStop(Math.max(0, Math.min(1, offset)), toneCanvas(tone, style)));
    ctx.fillStyle = gradient;
    ctx.fillRect(-cx / rx, -cy / ry, width / rx, height / ry);
    ctx.restore();
  }
  ctx.restore();
}

const LIGHT_BACKDROP = backdropCss(studioBackdrop(false));
const DARK_BACKDROP = backdropCss(studioBackdrop(true));

const KEYFRAMES = `
@keyframes mockup-shimmer { from { transform: translateX(-130%) skewX(-12deg); } to { transform: translateX(230%) skewX(-12deg); } }
@keyframes mockup-spectrum { from { background-position: 0% 50%; } to { background-position: 200% 50%; } }
@keyframes mockup-breathe { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5%); } }
@keyframes mockup-breathe-shadow { 0%, 100% { transform: scaleX(1); opacity: 1; } 50% { transform: scaleX(0.86); opacity: 0.7; } }
`;

const SPECTRUM: CSSProperties = {
  backgroundImage:
    "linear-gradient(90deg, var(--color-red), var(--color-amber), var(--color-sun), var(--color-lime), var(--color-cyan), var(--color-blue), var(--color-magenta), var(--color-red))",
  backgroundSize: "200% 100%",
};

/**
 * Placeholder do mockup 3D: o mesmo fundo de estúdio do viewer (a troca é uma dissolução), uma peça "fantasma"
 * flutuando com brilho passando e a faixa do espectro da marca correndo. Sem animação com reduced motion.
 */
export function MockupSkeleton({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  return (
    <div
      className={`relative grid size-full place-items-center overflow-hidden rounded-card ${dark ? "bg-night text-white/70" : "bg-mist text-muted"} ${className}`}
      style={{ background: dark ? DARK_BACKDROP : LIGHT_BACKDROP }}
    >
      <style href="padrao-mockup-skeleton" precedence="default">
        {KEYFRAMES}
      </style>
      <div className="flex w-full flex-col items-center gap-5" role="status" aria-live="polite">
        <div className="relative flex w-[34%] max-w-44 flex-col items-center" aria-hidden>
          <div className="w-full motion-safe:animate-[mockup-breathe_3.2s_ease-in-out_infinite]">
            <div
              className={`relative aspect-[4/5] w-full overflow-hidden rounded-thumb ring-1 ${
                dark ? "bg-white/5 ring-white/10" : "bg-white/70 shadow-card ring-ink/5"
              }`}
            >
              {/* "Arte" fantasma: o espectro da marca bem suave dentro da peça. */}
              <div className="absolute inset-[12%] overflow-hidden rounded-md opacity-25 motion-safe:animate-[mockup-spectrum_4s_linear_infinite]" style={SPECTRUM} />
              <div className={`absolute inset-x-[12%] bottom-[9%] h-1.5 rounded-full ${dark ? "bg-white/10" : "bg-ink/5"}`} />
              <div
                className={`absolute inset-y-0 left-0 w-1/2 motion-safe:animate-[mockup-shimmer_1.9s_cubic-bezier(0.4,0,0.2,1)_infinite] ${
                  dark ? "bg-linear-to-r from-transparent via-white/10 to-transparent" : "bg-linear-to-r from-transparent via-white/80 to-transparent"
                }`}
              />
            </div>
          </div>
          <div
            className={`mt-3 h-3 w-[78%] rounded-[50%] blur-[3px] motion-safe:animate-[mockup-breathe-shadow_3.2s_ease-in-out_infinite] ${
              dark ? "bg-black/50" : "bg-ink/10"
            }`}
          />
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="block h-1 w-20 overflow-hidden rounded-full motion-safe:animate-[mockup-spectrum_2.4s_linear_infinite]" style={SPECTRUM} aria-hidden />
          <span className="text-micro font-medium tracking-wide">Montando o mockup 3D…</span>
        </div>
      </div>
    </div>
  );
}
