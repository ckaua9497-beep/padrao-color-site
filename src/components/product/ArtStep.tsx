"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { IconCheck, IconUpload } from "@/components/icons";
import {
  ART_BACKGROUNDS,
  ART_FONTS,
  ART_STYLES,
  DEFAULT_ART,
  SAMPLE_SUBTEXT,
  SAMPLE_TEXT,
  SUBTEXT_LIMIT,
  TEXT_COLORS,
  TEXT_LIMIT,
  contrastRatio,
  loadArtFont,
  loadImage,
  paintArt,
  readableInk,
  styleOf,
  type ArtFamily,
  type ArtRender,
  type ArtSettings,
  type ArtStyle,
  type ArtVariant,
} from "@/components/mockup/art";
import { ART_FONT_KEYS, type ArtFont } from "@/components/mockup/fonts";
import { Button } from "@/components/ui/Button";
import { OptionGroup } from "@/components/ui/OptionGroup";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TextField } from "@/components/ui/TextField";
import { cx } from "@/components/ui/cx";
import type { SizeChartRow } from "@/lib/catalog";
import type { MockupKind } from "@/lib/mockup-kinds";

type Props = {
  /** Grade de tamanhos e medidas da camisa (manequim proporcional). */
  sizes?: string[] | null;
  sizeChart?: SizeChartRow[] | null;
  step: number;
  family: ArtFamily;
  /** Produto vendido sem impressão: a arte serve só para simular, não é exigida. */
  blank?: boolean;
  art: ArtSettings;
  onArt: (update: (art: ArtSettings) => ArtSettings) => void;
  artName: string | null;
  onFile: (file: File | undefined) => void;
  uploadError: string | null;
  uploading: boolean;
  artLater: boolean;
  onArtLater: (value: boolean) => void;
  missing: boolean;
  /** Tipo da peça e proporção da área de arte: as prévias dos estilos saem no formato real. */
  kind?: MockupKind;
  aspect?: number;
  ledColors?: string[];
  /** Nome do produto (semente dos ornamentos, igual ao do mockup). */
  label?: string;
};

/** Peça e proporção usadas nas prévias quando a página não informa o tipo. */
const FAMILY_SAMPLE: Record<ArtFamily, { kind: MockupKind; aspect: number }> = {
  card: { kind: "card", aspect: 1.75 },
  wrap: { kind: "mug", aspect: 2.35 },
  apparel: { kind: "tshirt", aspect: 0.85 },
  sign: { kind: "banner", aspect: 1.5 },
  badge: { kind: "sticker", aspect: 1 },
  neon: { kind: "neon", aspect: 1.6 },
  home: { kind: "cushion", aspect: 1 },
};

/** Passo "Sua arte": estilo, texto e subtexto (aparecem no mockup na hora) ou imagem enviada, ou enviar depois. */
export function ArtStep({ step, family, blank = false, art, onArt, artName, onFile, uploadError, uploading, artLater, onArtLater, missing, kind, aspect, ledColors, label = "" }: Props) {
  const [mode, setMode] = useState<"texto" | "imagem">(art.src ? "imagem" : "texto");
  // Enquanto o cliente não escolhe a fonte, cada estilo traz a sua.
  const [fontTouched, setFontTouched] = useState(art.font !== DEFAULT_ART.font);
  const fileInput = useRef<HTMLInputElement>(null);
  const neon = family === "neon";
  const apparel = family === "apparel";
  const style = styleOf(art.style);
  const styleInfo = ART_STYLES.find((s) => s.value === style) ?? ART_STYLES[0];
  const lowContrast = !neon && !apparel && contrastRatio(art.textColor, art.background) < 2.5;
  const suggestedInk = ART_BACKGROUNDS.find((b) => b.value === art.background)?.ink ?? readableInk(art.background);

  const pickStyle = (value: ArtStyle) => {
    const suggested = ART_STYLES.find((s) => s.value === value)?.font ?? DEFAULT_ART.font;
    onArt((a) => ({ ...a, style: value, font: fontTouched || neon ? a.font : suggested }));
  };

  return (
    <li id="passo-arte" className="scroll-mt-32">
      <p className="mb-3 flex items-center gap-2 text-[15px] font-bold">
        <span className="grid size-5 place-items-center rounded-full bg-ink text-[11px] text-white">{step}</span>
        {blank ? "Simule a sua arte" : "Sua arte"}
        <span className="text-caption font-normal text-muted">{blank ? "· o produto é vendido sem impressão" : "· aparece no mockup 3D"}</span>
      </p>

      <SegmentedControl
        label="Como montar a arte"
        value={mode}
        onChange={setMode}
        options={[
          { value: "texto", label: "Escrever texto" },
          { value: "imagem", label: "Enviar imagem" },
        ]}
      />

      <div className={cx("mt-4 rounded-card p-4 ring-1 transition-colors", missing ? "bg-coral-50 ring-coral-700" : "bg-white ring-line")}>
        {mode === "texto" ? (
          <div className="grid gap-5">
            <div>
              <p className="mb-2 flex items-baseline justify-between gap-3 text-[15px] font-bold">
                Estilo
                <span className="text-caption font-normal text-muted">{styleInfo.hint}</span>
              </p>
              <StylePicker
                art={art}
                family={family}
                kind={kind ?? FAMILY_SAMPLE[family].kind}
                aspect={aspect ?? FAMILY_SAMPLE[family].aspect}
                ledColors={ledColors}
                label={label}
                fontFor={(value) => (fontTouched || neon ? art.font : (ART_STYLES.find((s) => s.value === value)?.font ?? art.font))}
                onPick={pickStyle}
              />
            </div>

            <TextField
              label="Texto da arte"
              value={art.text}
              onChange={(text) => onArt((a) => ({ ...a, text }))}
              maxLength={TEXT_LIMIT[family]}
              placeholder={SAMPLE_TEXT[family]}
              hint={art.src ? "Aparece por cima da imagem, na parte de baixo." : "Aparece no mockup na hora. Você também pode enviar uma imagem."}
              autoComplete="off"
            />
            <TextField
              label="Texto secundário (opcional)"
              value={art.subtext}
              onChange={(subtext) => onArt((a) => ({ ...a, subtext }))}
              maxLength={SUBTEXT_LIMIT[family]}
              placeholder={SAMPLE_SUBTEXT[family] || "Ex.: @seuperfil"}
              hint="Cargo, contato, @perfil ou data, em letra menor."
              autoComplete="off"
            />

            <div>
              <p className="mb-2 text-[15px] font-bold">
                Fonte <span className="font-normal text-muted">· {neon && art.font === "figtree" ? "a letra de tubo do estilo" : ART_FONTS[art.font].label}</span>
              </p>
              <OptionGroup
                label="Fonte do texto"
                value={art.font}
                onChange={(font) => {
                  setFontTouched(true);
                  onArt((a) => ({ ...a, font: font as ArtFont }));
                }}
                options={ART_FONT_KEYS.map((key) => ({
                  value: key,
                  label: (
                    <span className="block text-[17px] leading-tight" style={{ fontFamily: ART_FONTS[key].family ?? "var(--font-figtree)", fontWeight: ART_FONTS[key].weight }}>
                      {neon && key === "figtree" ? "Do estilo" : ART_FONTS[key].label}
                    </span>
                  ),
                }))}
              />
            </div>

            {!neon && !apparel && (
              <div>
                <p className="mb-2 text-[15px] font-bold">
                  Fundo <span className="font-normal text-muted">· {ART_BACKGROUNDS.find((b) => b.value === art.background)?.label ?? "Personalizado"}</span>
                </p>
                <OptionGroup
                  label="Cor de fundo da arte"
                  variant="swatch"
                  value={art.background}
                  onChange={(background) =>
                    onArt((a) => {
                      const pair = ART_BACKGROUNDS.find((b) => b.value === background);
                      // Troca o texto junto quando a cor atual some no fundo novo.
                      const textColor = contrastRatio(a.textColor, background) < 3 ? (pair?.ink ?? readableInk(background)) : a.textColor;
                      return { ...a, background, textColor };
                    })
                  }
                  options={ART_BACKGROUNDS.map((b) => ({ value: b.value, label: b.label, color: b.value }))}
                />
              </div>
            )}

            {!neon && (
              <div>
                <p className="mb-2 text-[15px] font-bold">
                  Cor do texto <span className="font-normal text-muted">· {TEXT_COLORS.find((c) => c.value === art.textColor)?.label ?? "Personalizada"}</span>
                </p>
                <OptionGroup
                  label="Cor do texto"
                  variant="swatch"
                  value={art.textColor}
                  onChange={(textColor) => onArt((a) => ({ ...a, textColor }))}
                  options={TEXT_COLORS.map((c) => ({ value: c.value, label: c.label, color: c.value }))}
                />
                {apparel && <p className="mt-2 text-caption text-muted">A estampa sai sem fundo: escolha uma cor que contraste com o tecido.</p>}
                {lowContrast && (
                  <p role="status" className="mt-2 flex flex-wrap items-center gap-x-2 text-caption font-semibold text-coral-700">
                    Pouco contraste: o texto fica difícil de ler nesse fundo.
                    <Button variant="link" size="sm" className="min-h-6 text-caption" onClick={() => onArt((a) => ({ ...a, textColor: suggestedInk }))}>
                      Usar a cor sugerida
                    </Button>
                  </p>
                )}
              </div>
            )}
            {neon && <p className="text-caption text-muted">No neon, a cor vem da opção de LED escolhida acima; o estilo muda a letra, a espessura do tubo e o brilho.</p>}
          </div>
        ) : (
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              onFile(event.dataTransfer.files?.[0]);
            }}
          >
            {artName ? (
              <div className="flex flex-wrap items-center gap-4">
                <span className="relative size-16 shrink-0 overflow-hidden rounded-thumb bg-mist">
                  {art.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={art.src} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center text-[11px] font-bold text-muted">PDF</span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{artName}</p>
                  <p className="text-caption text-muted">{art.src ? "Aplicada no mockup 3D" : "Arquivo anexado ao pedido; a prévia 3D usa a arte de exemplo"}</p>
                </div>
                <Button variant="link" size="sm" onClick={() => fileInput.current?.click()}>
                  Trocar
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-control border-2 border-dashed border-line-strong py-6 text-center transition-colors hover:border-ink"
              >
                <span className="grid size-12 place-items-center rounded-full bg-coral-50 text-coral-700">
                  <IconUpload className="size-6" />
                </span>
                <span className="text-[15px] font-bold">{uploading ? "Lendo a imagem…" : "Enviar arte"}</span>
                <span className="text-caption text-muted">PNG, JPG ou WEBP aparecem em 3D · PDF também é aceito · ou arraste aqui</span>
              </button>
            )}
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="sr-only" tabIndex={-1} onChange={(event) => onFile(event.target.files?.[0])} />
            {uploadError && (
              <p role="alert" className="mt-3 text-sm font-semibold text-coral-700">
                {uploadError}
              </p>
            )}

            {art.src && (
              <div className="mt-4 grid gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <SegmentedControl
                    label="Encaixe da imagem"
                    value={art.fit}
                    onChange={(fit) => onArt((a) => ({ ...a, fit, zoom: 1, offsetX: 0, offsetY: 0 }))}
                    options={[
                      { value: "cover", label: "Preencher" },
                      { value: "contain", label: "Ajustar" },
                    ]}
                  />
                  <Button variant="outline" size="sm" onClick={() => onArt((a) => ({ ...a, rotation: ((a.rotation + 90) % 360) as ArtSettings["rotation"] }))}>
                    Girar 90°
                  </Button>
                  <label className="flex h-11 items-center gap-2 rounded-full border border-line-strong pl-4 pr-1.5 text-[15px] font-bold">
                    Fundo
                    <input type="color" value={art.background} onChange={(event) => onArt((a) => ({ ...a, background: event.target.value }))} className="size-8 rounded-full border-0 bg-transparent" />
                  </label>
                </div>
                <Slider label="Zoom" value={art.zoom} min={1} max={2.5} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(zoom) => onArt((a) => ({ ...a, zoom }))} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Slider label="Horizontal" value={art.offsetX} min={-0.5} max={0.5} step={0.01} format={(v) => `${Math.round(v * 100)}`} onChange={(offsetX) => onArt((a) => ({ ...a, offsetX }))} />
                  <Slider label="Vertical" value={art.offsetY} min={-0.5} max={0.5} step={0.01} format={(v) => `${Math.round(v * 100)}`} onChange={(offsetY) => onArt((a) => ({ ...a, offsetY }))} />
                </div>
                <p className="text-caption text-muted">Quer um texto por cima da imagem? Escreva em “Escrever texto”: ele entra no estilo {styleInfo.label.toLowerCase()}.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {blank ? (
        <p className="mt-3 text-caption text-muted">A arte não vai impressa: ela mostra como o produto fica depois que você personalizar.</p>
      ) : (
        <label className="mt-3 flex items-center gap-2.5 text-sm">
          <input type="checkbox" checked={artLater} onChange={(event) => onArtLater(event.target.checked)} className="size-4 accent-coral-700" />
          Enviar arte depois (a equipe entra em contato)
        </label>
      )}
      {missing && (
        <p role="alert" className="mt-2 text-sm font-semibold text-coral-700">
          Escreva um texto, envie a arte ou marque “Enviar arte depois” para continuar.
        </p>
      )}
    </li>
  );
}

type PickerProps = {
  art: ArtSettings;
  family: ArtFamily;
  kind: MockupKind;
  aspect: number;
  ledColors?: string[];
  label: string;
  /** Fonte que cada estilo usaria (a sugerida, enquanto o cliente não escolhe outra). */
  fontFor: (style: ArtStyle) => ArtFont;
  onPick: (style: ArtStyle) => void;
  /** Versão compacta (vitrine da home, fundo escuro). */
  compact?: boolean;
};

/**
 * Seletor de estilo com prévias vivas: cada opção é a arte do cliente pintada com o mesmo
 * paintArt do mockup, no formato real da peça. Radiogroup com foco itinerante.
 */
export function StylePicker({ art, family, kind, aspect, ledColors, label, fontFor, onPick, compact = false }: PickerProps) {
  const [fontsVersion, setFontsVersion] = useState(0);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState<{ src: string; image: HTMLImageElement } | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const group = useRef<HTMLDivElement>(null);
  const fontKey = ART_STYLES.map((s) => fontFor(s.value)).join(",");
  const selected = styleOf(art.style);
  const selectedIndex = Math.max(0, ART_STYLES.findIndex((s) => s.value === selected));
  const neon = family === "neon";
  const variant: ArtVariant = neon ? "neon" : "front";
  const lightInk = contrastRatio(art.textColor, "#ffffff") < 2;

  // Só baixa as fontes dos estilos quando o seletor aparece na tela.
  useEffect(() => {
    const node = group.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // As fontes chegam sob demanda: repinta as prévias quando as dos seis estilos terminarem de baixar.
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    const fonts = fontKey.split(",") as ArtFont[];
    Promise.all(ART_STYLES.map((s, i) => loadArtFont({ font: fonts[i] ?? "figtree", text: "Aa", style: s.value, kind }))).then(() => alive && setFontsVersion((v) => v + 1));
    return () => {
      alive = false;
    };
  }, [visible, fontKey, kind]);

  useEffect(() => {
    if (!art.src) return;
    let alive = true;
    const src = art.src;
    loadImage(src)
      .then((image) => alive && setLoaded({ src, image }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [art.src]);
  const image = art.src && loaded?.src === art.src ? loaded.image : null;

  const select = (index: number) => {
    const next = (index + ART_STYLES.length) % ART_STYLES.length;
    onPick(ART_STYLES[next].value);
    refs.current[next]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const keys: Record<string, number> = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: ART_STYLES.length - 1 };
    if (!(event.key in keys)) return;
    event.preventDefault();
    select(keys[event.key]);
  };

  const backdrop = neon ? "bg-night" : family === "apparel" ? (lightInk ? "bg-graphite" : "bg-mist") : compact ? "bg-white/10" : "bg-mist";

  return (
    <div ref={group} role="radiogroup" aria-label="Estilo da arte" className={cx("grid gap-2", compact ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-3")}>
      {ART_STYLES.map((style, index) => {
        const active = style.value === selected;
        const preview: ArtRender = { ...art, style: style.value, font: fontFor(style.value), kind, ledColors };
        return (
          <button
            key={style.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${style.label}: ${style.hint}`}
            tabIndex={index === selectedIndex ? 0 : -1}
            onClick={() => onPick(style.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cx(
              "relative grid gap-1.5 rounded-control p-1.5 text-left transition-shadow duration-200",
              compact
                ? active
                  ? "bg-white/10 ring-2 ring-white"
                  : "ring-1 ring-white/25 hover:ring-white/60"
                : active
                  ? "bg-white ring-2 ring-ink"
                  : "bg-white ring-1 ring-line hover:ring-ink/40",
            )}
          >
            <span className={cx("relative block aspect-[4/3] overflow-hidden rounded-thumb", backdrop)}>
              <StyleThumb art={preview} variant={variant} aspect={aspect} image={image} label={label} version={fontsVersion} shadow={!neon && family !== "apparel"} />
            </span>
            <span className={cx("px-1 text-[13px] font-semibold leading-tight", compact && "text-white")}>{style.label}</span>
            {active && (
              <span className={cx("absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full", compact ? "bg-white text-ink" : "bg-ink text-white")}>
                <IconCheck className="size-3.5" strokeWidth={2.6} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Miniatura do estilo: repinta com atraso curto para não travar a digitação. */
function StyleThumb({ art, variant, aspect, image, label, version, shadow }: { art: ArtRender; variant: ArtVariant; aspect: number; image: HTMLImageElement | null; label: string; version: number; shadow: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const safe = Number.isFinite(aspect) && aspect > 0 ? Math.min(12, Math.max(0.08, aspect)) : 1;
  const width = safe >= 1 ? 320 : Math.max(24, Math.round(320 * safe));
  const height = safe >= 1 ? Math.max(24, Math.round(320 / safe)) : 320;
  // Encaixa a peça na moldura 4:3 com largura e altura explícitas (em % da moldura): não depende
  // de max-height em item de grid, que não limita e cortaria as peças quadradas ou em pé.
  const frame = 4 / 3;
  const fill = 88;
  const box = safe >= frame ? { width: `${fill}%`, height: `${(fill * frame) / safe}%` } : { width: `${(fill * safe) / frame}%`, height: `${fill}%` };
  // Chave estável do que aparece na prévia: evita repintar quando nada visível mudou.
  const key = [art.style, art.font, art.text, art.subtext, art.background, art.textColor, art.kind, art.ledColors?.join(","), art.src, art.fit, art.rotation, art.zoom, art.offsetX, art.offsetY].join("|");
  const artRef = useRef(art);
  useEffect(() => {
    artRef.current = art;
  });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const id = window.setTimeout(() => paintArt(canvas, variant, artRef.current, image, label), 90);
    return () => window.clearTimeout(id);
  }, [key, variant, image, label, version, width, height]);

  return <canvas ref={ref} width={width} height={height} aria-hidden style={box} className={cx("absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2", shadow && "shadow-sm")} />;
}

function Slider({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      <span className="flex justify-between">
        {label}
        <span className="font-normal tabular-nums text-muted">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-ink" />
    </label>
  );
}
