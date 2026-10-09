"use client";

import { useId } from "react";
import { cx } from "@/components/ui/cx";
import type { Box, TemplatePage, TemplatePanel } from "@/lib/templates";

/** Caminho SVG do corte (ou da área de segurança): o desenhado no gabarito, ou o retângulo/elipse da caixa. */
export function outlinePath(shape: Box & { shape: string; d?: string }): string {
  if (shape.d) return shape.d;
  const { x, y, w, h } = shape;
  if (shape.shape === "ellipse") {
    const rx = w / 2;
    const ry = h / 2;
    return `M${x} ${y + ry}A${rx} ${ry} 0 1 0 ${x + w} ${y + ry}A${rx} ${ry} 0 1 0 ${x} ${y + ry}Z`;
  }
  return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
}

/** Linhas do gabarito de um painel, nas cores da legenda da Padrão (ciano, preto, laranja e verde). */
export function PanelLines({ panel, bleed = true, safe = true, label }: { panel: TemplatePanel; bleed?: boolean; safe?: boolean; label?: string }) {
  const stroke = { vectorEffect: "non-scaling-stroke" as const, fill: "none" };
  const cut = outlinePath(panel.cut);
  return (
    <g>
      {bleed && !panel.implicitBleed && (
        <rect x={panel.bleed.x} y={panel.bleed.y} width={panel.bleed.w} height={panel.bleed.h} {...stroke} className="stroke-cyan" strokeWidth={1.25} strokeDasharray="5 3" />
      )}
      {safe && panel.safe && !panel.safe.d && panel.safe.parts?.length
        ? panel.safe.parts.map((b, i) => <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} {...stroke} className="stroke-amber" strokeWidth={1.25} strokeDasharray="4 3" />)
        : safe && panel.safe && <path d={outlinePath(panel.safe)} {...stroke} className="stroke-amber" strokeWidth={1.25} strokeDasharray="4 3" />}
      {panel.sew && <path d={panel.sew} {...stroke} className="stroke-lime-700" strokeWidth={1} strokeDasharray="1.5 2.5" />}
      {panel.marks?.map((m, i) =>
        m.d ? <path key={i} d={m.d} {...stroke} className={m.role === "hole" ? "stroke-ink" : m.role === "fold" ? "stroke-subtle" : "stroke-magenta"} strokeWidth={1} strokeDasharray={m.dashed || m.role === "fold" ? "3 2" : undefined} /> : null,
      )}
      {/* Corte: traço claro por baixo para aparecer sobre qualquer arte. */}
      <path d={cut} {...stroke} className="stroke-paper" strokeWidth={3} strokeOpacity={0.85} />
      <path d={cut} {...stroke} className="stroke-ink" strokeWidth={1.25} />
      {label && (
        <text
          x={panel.cut.x + panel.cut.w / 2}
          y={panel.cut.y + panel.cut.h / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-ink/60 font-bold uppercase"
          style={{ fontSize: Math.max(4, Math.min(panel.cut.w, panel.cut.h) * 0.09) }}
        >
          {label}
        </text>
      )}
    </g>
  );
}

type Props = {
  page: TemplatePage;
  /** Arte de cada painel (data URL que cobre a caixa da sangria), por índice; ausente = folha em branco. */
  images?: (string | null | undefined)[];
  /** Painel em destaque (os outros ficam esmaecidos). */
  active?: number | null;
  /** Escreve o nome dos painéis sem arte (Frente, Costas, Lateral…). */
  names?: boolean;
  /** Véu branco sobre o que fica fora do corte (o que a guilhotina/faca descarta). */
  veil?: boolean;
  className?: string;
  title: string;
};

/** Folha do gabarito em SVG (escala real em mm): arte de cada painel por baixo e as linhas por cima. */
export function TemplateSheet({ page, images, active = null, names = true, veil = true, className, title }: Props) {
  const id = `folha${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const { w, h } = page.sheet;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={title} className={cx("block h-auto w-full", className)} preserveAspectRatio="xMidYMid meet">
      <defs>
        {page.panels.map((panel, i) => (
          <clipPath key={i} id={`${id}-b${i}`}>
            <rect x={panel.bleed.x} y={panel.bleed.y} width={panel.bleed.w} height={panel.bleed.h} />
          </clipPath>
        ))}
        {veil && (
          <mask id={`${id}-veil`}>
            <rect x={0} y={0} width={w} height={h} fill="white" />
            {/* Cada contorno do corte separado: a união não depende do sentido dos subcaminhos. */}
            {page.panels.flatMap((panel, i) =>
              outlinePath(panel.cut)
                .split(/(?=M)/)
                .filter((d) => d.trim().length > 1)
                .map((d, j) => <path key={`${i}-${j}`} d={d} fill="black" />),
            )}
          </mask>
        )}
      </defs>
      <rect x={0} y={0} width={w} height={h} className="fill-paper" />
      {page.panels.map((panel, i) => {
        const src = images?.[i];
        return src ? (
          <image key={i} href={src} x={panel.bleed.x} y={panel.bleed.y} width={panel.bleed.w} height={panel.bleed.h} preserveAspectRatio="none" clipPath={`url(#${id}-b${i})`} />
        ) : (
          <rect key={i} x={panel.cut.x} y={panel.cut.y} width={panel.cut.w} height={panel.cut.h} className="fill-mist" />
        );
      })}
      {veil && <rect x={0} y={0} width={w} height={h} className="fill-paper" fillOpacity={0.6} mask={`url(#${id}-veil)`} />}
      {page.panels.map((panel, i) => (
        <g key={i} opacity={active === null || active === i ? 1 : 0.45}>
          <PanelLines panel={panel} label={names && !images?.[i] ? panel.name : undefined} />
        </g>
      ))}
    </svg>
  );
}

/** Legenda das linhas (mesmas cores do gabarito e da folha de orientações da Padrão). */
export function TemplateLegend({ sew = false, className }: { sew?: boolean; className?: string }) {
  const items: [string, string][] = [
    ["bg-ink", "Corte"],
    ["bg-cyan", "Sangria"],
    ["bg-amber", "Área de segurança"],
    ...(sew ? ([["bg-lime-700", "Costura"]] as [string, string][]) : []),
  ];
  return (
    <ul className={cx("flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted", className)}>
      {items.map(([dot, text]) => (
        <li key={text} className="flex items-center gap-1.5">
          <span aria-hidden className={cx("size-2.5 rounded-full", dot)} />
          {text}
        </li>
      ))}
    </ul>
  );
}
