"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { IconCheck, IconUpload } from "@/components/icons";
import {
  ART_BACKGROUNDS,
  ART_FONTS,
  ART_STYLES,
  DEFAULT_ART,
  FLIPFLOP_REGIONS,
  SAMPLE_SUBTEXT,
  SAMPLE_TEXT,
  SUBTEXT_LIMIT,
  TEXT_COLORS,
  TEXT_LIMIT,
  THERMAL_WINDOW,
  blankBack,
  contrastRatio,
  flipflopRegion,
  hasArtContent,
  loadArtFont,
  loadImage,
  paintArt,
  readableInk,
  regionAspect,
  releaseSource,
  sourceOf,
  styleOf,
  type ArtFamily,
  type ArtRender,
  type ArtSettings,
  type ArtStyle,
  type ArtVariant,
  type FlipflopRegion,
} from "@/components/mockup/art";
import { NEON_FONT_KEYS, TEXT_FONT_KEYS, type ArtFont } from "@/components/mockup/fonts";
import { Button } from "@/components/ui/Button";
import { OptionGroup } from "@/components/ui/OptionGroup";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TextField } from "@/components/ui/TextField";
import { cx } from "@/components/ui/cx";
import type { SizeChartRow } from "@/lib/catalog";
import { normalizeName, variantOf, type MockupSpec } from "@/lib/mockup";
import { artArea, type MockupKind } from "@/lib/mockup-kinds";
import { ArtEditor2D } from "./art-editor/ArtEditor2D";
import { GabaritoPanel } from "./gabarito/GabaritoPanel";
import { fitToTemplate, madeForTemplate, type Gabarito } from "./gabarito/jobs";
import { IntakeError, intakeImage } from "@/components/mockup/image-intake";
import { ART_ACCEPT } from "@/lib/image-prep";
import { autoFitArt, fitAreaFor, fitModeOf, fitReport, restoreBackground, type FitArea } from "./auto-fit";
import { LedColorPicker } from "./art-editor/LedColorPicker";
import { MannequinPanel } from "./art-editor/MannequinPanel";

type Props = {
  /** Grade de tamanhos e medidas da camisa (manequim proporcional). */
  sizes?: string[] | null;
  sizeChart?: SizeChartRow[] | null;
  /** Número do passo na página; sem ele (editor de um item do kit), o título vem sem número. */
  step?: number;
  family: ArtFamily;
  /** Produto vendido sem impressão: a arte serve só para simular, não é exigida. */
  blank?: boolean;
  art: ArtSettings;
  onArt: (update: (art: ArtSettings) => ArtSettings) => void;
  artName: string | null;
  /** `raw`: "Usar a imagem original" (sem corte de margem nem remoção de fundo). */
  onFile: (file: File | undefined, options?: { raw?: boolean }) => void;
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
  /**
   * Spec do mockup (opcional): medida da área em cm (régua e resolução no editor), garrafa térmica
   * (faixa de 60%), cor da peça (fundo da estampa) e subtipo da camisa (manequim).
   */
  spec?: Pick<MockupSpec, "kind" | "widthCm" | "heightCm" | "thermal" | "variant" | "baseColor" | "back">;
  /** Lado em edição (Frente | Verso): a página vira o mockup 3D para ele. */
  onSide?: (side: Side) => void;
  /** Gabarito oficial da seleção (medidas, sangria, corte e segurança): o editor e o PDF seguem ele. */
  gabarito?: Gabarito | null;
  /** Slug do produto (nome do PDF de impressão). */
  slug?: string;
  /** Clique num estilo (na fachada, a câmera vai de frente para a placa e os refletores acendem). */
  onStylePick?: (style: ArtStyle) => void;
  /** Título no lugar do "Sua arte" padrão (a fachada usa o mesmo título numerado dos outros passos). */
  heading?: ReactNode;
};

type Side = "front" | "back";
type Mode = "texto" | "imagem";

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

/** Peças com arte própria na frente e no verso: camisas (logo nas costas), almofada e cama pet. */
const TWO_SIDED: readonly MockupKind[] = ["tshirt", "cushion", "petbed"];
/** Camisas que vestem o manequim (body de bebê e pijama com calça dobrada ficam sem). */
const NO_MANNEQUIN_VARIANTS = new Set(["body", "pajama"]);
const MAX_UPLOAD_MB = 25;

/**
 * Passo "Sua arte": estilo, texto e subtexto (aparecem no mockup na hora) ou imagem enviada, ou enviar
 * depois. Inclui o editor 2D da área de impressão (posição livre), frente e verso nas camisas e
 * almofadas, manequim proporcional na camisa, região do chinelo, faixa de 60% da garrafa térmica e as
 * cores e letras do neon.
 */
export function ArtStep({ step, family, blank = false, art, onArt, artName, onFile, uploadError, uploading, artLater, onArtLater, missing, kind, aspect, ledColors, label = "", sizes, sizeChart, spec, onSide, gabarito = null, slug = "", onStylePick, heading }: Props) {
  const pieceKind = kind ?? FAMILY_SAMPLE[family].kind;
  // Frente e verso: as peças de duas faces e os produtos cujo gabarito tem verso/costas.
  const twoSided = TWO_SIDED.includes(pieceKind) || Boolean(gabarito?.back);
  const [side, setSide] = useState<Side>("front");
  const back = twoSided && side === "back";
  const [modes, setModes] = useState<Record<Side, Mode>>(() => ({ front: art.src ? "imagem" : "texto", back: art.back?.src ? "imagem" : "texto" }));
  // Enquanto o cliente não escolhe a fonte, cada estilo traz a sua.
  const [fontTouched, setFontTouched] = useState(art.font !== DEFAULT_ART.font);
  const [backUpload, setBackUpload] = useState<{ name: string | null; error: string | null; busy: boolean }>({ name: null, error: null, busy: false });

  // Verso ainda vazio: mesmo estilo, fonte e cores da frente (identidade estável para o editor).
  const sideArt = useMemo(() => (back ? (art.back ?? blankBack(art)) : art), [back, art]);
  const onSideArt = (update: (a: ArtSettings) => ArtSettings) => {
    if (back) onArt((a) => ({ ...a, back: { ...update(a.back ?? blankBack(a)), back: null } }));
    else onArt(update);
  };
  const mode = modes[side === "back" && twoSided ? "back" : "front"];
  const setMode = (value: Mode) => setModes((m) => ({ ...m, [back ? "back" : "front"]: value }));

  const neon = family === "neon";
  const apparel = family === "apparel";
  const style = styleOf(sideArt.style);
  const styleInfo = ART_STYLES.find((s) => s.value === style) ?? ART_STYLES[0];
  const lowContrast = !neon && !apparel && contrastRatio(sideArt.textColor, sideArt.background) < 2.5;
  const suggestedInk = ART_BACKGROUNDS.find((b) => b.value === sideArt.background)?.ink ?? readableInk(sideArt.background);

  // Área de impressão: proporção (região do chinelo, 60% da térmica) e medida em cm quando a spec vem.
  const baseAspect = aspect ?? FAMILY_SAMPLE[family].aspect;
  const flipflop = pieceKind === "flipflop";
  const region = flipflop ? flipflopRegion(art.region) : null;
  const editorAspect = region ? regionAspect(baseAspect, region.value) : baseAspect;
  const area = spec ? artArea(spec) : null;
  const areaCm = area && region ? { widthCm: area.widthCm, heightCm: area.heightCm * (region.to - region.from) } : area;
  // Sem a spec, as mesmas regras de nome de lib/mockup.ts (garrafa térmica e subtipo da camisa).
  const productName = normalizeName(label);
  const thermal = spec ? spec.thermal : pieceKind === "bottle" && /\btermic|\binox\b/.test(productName);
  const pieceVariant = spec ? spec.variant : variantOf(pieceKind, productName);
  const frontWindow = thermal ? THERMAL_WINDOW : undefined;
  const surface = spec?.baseColor;
  const effectiveLeds = art.ledColors?.length ? art.ledColors : ledColors;
  const showMannequin = pieceKind === "tshirt" && !NO_MANNEQUIN_VARIANTS.has(pieceVariant ?? "");
  // Gabarito do lado em edição: com proporção compatível, o editor trabalha no corte do painel (com sangria).
  const sideGabarito = back ? (gabarito?.back ?? null) : (gabarito?.front ?? null);
  // Chinelo: só a palmilha inteira usa o molde; região (dedos, meio, calcanhar) usa a faixa dela.
  const templatePanel = sideGabarito?.frame && !neon && (!region || region.value === "inteira") ? sideGabarito.ref.panel : null;
  const stageAspect = templatePanel ? templatePanel.cut.w / templatePanel.cut.h : editorAspect;
  const stageCm = templatePanel ? { widthCm: templatePanel.cut.w / 10, heightCm: templatePanel.cut.h / 10 } : areaCm;
  const previewExtra: Partial<ArtRender> = { frontWindow, surface, sample: !back };

  const pickStyle = (value: ArtStyle) => {
    const suggested = ART_STYLES.find((s) => s.value === value)?.font ?? DEFAULT_ART.font;
    onSideArt((a) => ({ ...a, style: value, font: fontTouched || neon ? a.font : suggested }));
    onStylePick?.(value);
  };

  // Área de arte do mockup: o tratador encaixa a imagem nela quando a peça não tem gabarito.
  const fitArea: FitArea | null = spec ? fitAreaFor(spec) : null;
  const sideFit = templatePanel ? null : fitArea;

  // Imagem do verso: lida aqui (a da frente vai pelo onFile da página, que também anexa PDF ao pedido).
  // Cada envio ganha um número: um envio anterior que termina depois não sobrescreve o último.
  const backSeq = useRef(0);
  const onBackFile = async (file: File | undefined, { raw = false }: { raw?: boolean } = {}) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setBackUpload((u) => ({ ...u, error: `O arquivo tem mais de ${MAX_UPLOAD_MB} MB. Envie uma versão menor.` }));
      return;
    }
    const seq = ++backSeq.current;
    const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    setBackUpload((u) => ({ ...u, error: null, busy: true }));
    try {
      // Verso no gabarito: arquivo feito nele entra como veio; os outros, encaixados nele. Sem gabarito, o
      // tratador encaixa na área do mockup.
      const backSide = gabarito?.back ?? null;
      const src = pdf
        ? (await (await import("./gabarito/pdf-artwork")).readPdfArtwork(file)).src
        : (
            await intakeImage(file, {
              removeWhite: fitArea?.transparentBase ?? apparel,
              treat: !raw,
              madeForTemplate: backSide?.frame ? (px, vector) => madeForTemplate(backSide, px, vector) : null,
              attachable: false,
            })
          ).src;
      if (seq !== backSeq.current) {
        releaseSource(src);
        return;
      }
      onSideArt((a) => {
        const fresh: ArtSettings = { ...restoreBackground(a), src, zoom: 1, offsetX: 0, offsetY: 0, layout: a.layout?.text ? { text: a.layout.text } : null, templateFit: null };
        if (backSide?.frame) return fitToTemplate(fresh, backSide, { transparentBase: fitArea?.transparentBase ?? apparel, frontWindow: gabarito?.fitWindow });
        return fitArea ? autoFitArt(fresh, fitArea) : fresh;
      });
      setBackUpload({ name: file.name, error: null, busy: false });
    } catch (error) {
      if (seq !== backSeq.current) return;
      const message =
        error instanceof IntakeError ? error.message : pdf ? "Não conseguimos ler esse PDF. Tente exportar de novo ou envie PNG/JPG." : "Não conseguimos ler essa imagem. Tente PNG, JPG, WEBP ou SVG.";
      setBackUpload((u) => ({ ...u, error: message, busy: false }));
    }
  };

  // Imagem tratada (margem cortada ou fundo tirado): o cliente pode voltar ao arquivo como enviou.
  const source = sourceOf(sideArt.src);
  const original = source?.original && (source.treatment?.trimmed || source.treatment?.backgroundRemoved) ? source.original : null;
  // "Preencher a área" / "Imagem inteira": só com a análise do tratador (o PDF não tem).
  const fitControls =
    sideFit && sideArt.src && source?.analysis ? { mode: fitModeOf(sideArt), onMode: (mode: "fill" | "whole") => onSideArt((a) => autoFitArt(a, sideFit, mode)) } : null;
  // "Voltar ao encaixe automático": no gabarito, o encaixe no molde; sem ele, o do tratador na área do mockup.
  const onAutoFit = templatePanel
    ? () => onSideArt((a) => fitToTemplate({ ...a, layout: a.layout?.text ? { text: a.layout.text } : null }, sideGabarito, { transparentBase: fitArea?.transparentBase ?? apparel, frontWindow: gabarito?.fitWindow }))
    : fitControls && sideFit
      ? () => onSideArt((a) => autoFitArt({ ...a, layout: null }, sideFit))
      : null;

  const upload = back
    ? {
        name: sideArt.src ? (backUpload.name ?? "Imagem do verso") : null,
        error: backUpload.error,
        busy: backUpload.busy,
        onFile: onBackFile,
        accept: ART_ACCEPT,
        hint: gabarito ? "PNG, JPG, WEBP, SVG ou PDF · encaixamos no gabarito · ou arraste aqui" : "PNG, JPG, WEBP, SVG ou PDF · ajustamos na peça · ou arraste aqui",
      }
    : {
        name: artName,
        error: uploadError,
        busy: uploading,
        onFile,
        accept: ART_ACCEPT,
        hint: gabarito ? "PNG, JPG, WEBP, SVG ou PDF · encaixamos no gabarito e mostramos em 3D · ou arraste aqui" : "PNG, JPG, WEBP, SVG ou PDF · ajustamos na peça e mostramos em 3D · ou arraste aqui",
      };

  return (
    <li id="passo-arte" className="scroll-mt-painel">
      {heading ?? (
        <p className="mb-3 flex items-center gap-2 text-[15px] font-bold">
          {step !== undefined && <span className="grid size-5 place-items-center rounded-full bg-ink text-[11px] text-white">{step}</span>}
          {blank ? "Simule a sua arte" : "Sua arte"}
          <span className="text-caption font-normal text-muted">{blank ? "· o produto é vendido sem impressão" : "· aparece no mockup 3D"}</span>
        </p>
      )}

      {thermal && (
        <p className="mb-3 rounded-control bg-cyan-50 px-3 py-2 text-caption font-semibold text-ink">
          Área personalizável: 60% da garrafa (frente e laterais). A parte de trás fica na cor da garrafa.
        </p>
      )}

      {flipflop && (
        <div className="mb-4">
          <p className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 text-[15px] font-bold">
            Região personalizada
            <span className="text-caption font-normal text-muted">{region?.value === "inteira" ? "a arte cobre a palmilha toda" : "o resto da palmilha fica na cor da peça"}</span>
          </p>
          <OptionGroup
            label="Região do chinelo com a arte"
            value={region?.value ?? "inteira"}
            onChange={(value) => onArt((a) => ({ ...a, region: value as FlipflopRegion }))}
            options={FLIPFLOP_REGIONS.map((r) => ({ value: r.value, label: r.label }))}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {twoSided && (
          <SegmentedControl
            label="Lado da arte"
            value={side}
            onChange={(value) => {
              setSide(value);
              onSide?.(value);
            }}
            options={[
              { value: "front", label: "Frente" },
              {
                value: "back",
                label: (
                  <>
                    Verso
                    {hasArtContent(art.back) && (
                      <>
                        <IconCheck className="size-3.5" strokeWidth={2.6} />
                        <span className="sr-only">(com arte)</span>
                      </>
                    )}
                  </>
                ),
              },
            ]}
          />
        )}
        <SegmentedControl
          label="Como montar a arte"
          value={mode}
          onChange={setMode}
          options={[
            { value: "texto", label: "Escrever texto" },
            { value: "imagem", label: "Enviar imagem" },
          ]}
        />
      </div>
      {back && (
        <p className="mt-2 text-caption text-muted">
          {pieceKind === "tshirt" ? "Logo ou texto nas costas" : "Arte do verso"}: vazio, o verso sai sem impressão.
          {spec && spec.back !== "blank" ? " A opção escolhida inclui impressão no verso." : ""}
        </p>
      )}

      <div className={cx("mt-4 grid gap-5 rounded-card p-4 ring-1 transition-colors", missing && !back ? "bg-coral-50 ring-coral-700" : "bg-white ring-line")}>
        {mode === "texto" ? (
          <div className="grid gap-5">
            <div>
              <p className="mb-2 flex items-baseline justify-between gap-3 text-[15px] font-bold">
                Estilo
                <span className="text-caption font-normal text-muted">{styleInfo.hint}</span>
              </p>
              <StylePicker
                art={sideArt}
                family={family}
                kind={pieceKind}
                aspect={editorAspect}
                ledColors={effectiveLeds}
                label={label}
                extra={previewExtra}
                fontFor={(value) => (fontTouched || neon ? sideArt.font : (ART_STYLES.find((s) => s.value === value)?.font ?? sideArt.font))}
                onPick={pickStyle}
              />
            </div>

            <TextField
              label={back ? "Texto do verso" : "Texto da arte"}
              value={sideArt.text}
              onChange={(text) => onSideArt((a) => ({ ...a, text }))}
              maxLength={TEXT_LIMIT[family]}
              placeholder={back ? "Ex.: nome ou número" : SAMPLE_TEXT[family]}
              hint={sideArt.src ? "Aparece por cima da imagem; arraste no editor abaixo para mudar o lugar." : "Aparece no mockup na hora. Arraste no editor abaixo para posicionar."}
              autoComplete="off"
            />
            <TextField
              label="Texto secundário (opcional)"
              value={sideArt.subtext}
              onChange={(subtext) => onSideArt((a) => ({ ...a, subtext }))}
              maxLength={SUBTEXT_LIMIT[family]}
              placeholder={SAMPLE_SUBTEXT[family] || "Ex.: @seuperfil"}
              hint="Cargo, contato, @perfil ou data, em letra menor."
              autoComplete="off"
            />

            {neon && (
              <LedColorPicker
                value={effectiveLeds?.length ? effectiveLeds : ["#ff4fd8", "#38e1ff"]}
                custom={Boolean(art.ledColors?.length)}
                onChange={(colors) => onArt((a) => ({ ...a, ledColors: colors }))}
              />
            )}

            <div>
              <p className="mb-2 text-[15px] font-bold">
                {neon ? "Letras" : "Fonte"}{" "}
                <span className="font-normal text-muted">· {neon && sideArt.font === "figtree" ? "a letra de tubo do estilo" : ART_FONTS[sideArt.font].label}</span>
              </p>
              <OptionGroup
                label={neon ? "Letras do neon" : "Fonte do texto"}
                value={sideArt.font}
                onChange={(font) => {
                  setFontTouched(true);
                  onSideArt((a) => ({ ...a, font: font as ArtFont }));
                }}
                options={(neon ? NEON_FONT_KEYS : TEXT_FONT_KEYS).map((key) => ({
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
                  Fundo <span className="font-normal text-muted">· {ART_BACKGROUNDS.find((b) => b.value === sideArt.background)?.label ?? "Personalizado"}</span>
                </p>
                <OptionGroup
                  label="Cor de fundo da arte"
                  variant="swatch"
                  value={sideArt.background}
                  onChange={(background) =>
                    onSideArt((a) => {
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
                  Cor do texto <span className="font-normal text-muted">· {TEXT_COLORS.find((c) => c.value === sideArt.textColor)?.label ?? "Personalizada"}</span>
                </p>
                <OptionGroup
                  label="Cor do texto"
                  variant="swatch"
                  value={sideArt.textColor}
                  onChange={(textColor) => onSideArt((a) => ({ ...a, textColor }))}
                  options={TEXT_COLORS.map((c) => ({ value: c.value, label: c.label, color: c.value }))}
                />
                {apparel && <p className="mt-2 text-caption text-muted">A estampa sai sem fundo: escolha uma cor que contraste com o tecido.</p>}
                {lowContrast && (
                  <p role="status" className="mt-2 flex flex-wrap items-center gap-x-2 text-caption font-semibold text-coral-700">
                    Pouco contraste: o texto fica difícil de ler nesse fundo.
                    <Button variant="link" size="sm" className="min-h-6 text-caption" onClick={() => onSideArt((a) => ({ ...a, textColor: suggestedInk }))}>
                      Usar a cor sugerida
                    </Button>
                  </p>
                )}
              </div>
            )}
            {neon && <p className="text-caption text-muted">O estilo muda a espessura do tubo, o brilho e os extras (moldura, sublinhado); as letras e as cores são suas.</p>}
          </div>
        ) : (
          <ImagePanel
            art={sideArt}
            onArt={onSideArt}
            name={upload.name}
            error={upload.error}
            busy={upload.busy}
            onFile={upload.onFile}
            accept={upload.accept}
            hint={upload.hint}
            canChooseBackground={!neon && !apparel}
            removable={back}
            styleName={styleInfo.label}
            report={fitReport(sideArt, sideFit)}
            fitControls={fitControls}
            onOriginal={original ? () => upload.onFile(original, { raw: true }) : null}
          />
        )}

        <div className="border-t border-line pt-5">
          <ArtEditor2D
            art={sideArt}
            onArt={onSideArt}
            kind={pieceKind}
            family={family}
            variant={neon ? "neon" : "front"}
            aspect={stageAspect}
            areaCm={stageCm}
            surface={surface}
            ledColors={effectiveLeds}
            frontWindow={templatePanel ? gabarito?.frontWindow : frontWindow}
            sample={!back}
            label={label}
            sideLabel={twoSided ? (back ? "Verso" : "Frente") : undefined}
            template={templatePanel}
            onAutoFit={onAutoFit}
          />
        </div>

        {gabarito && !blank && (
          <div className="border-t border-line pt-5">
            <GabaritoPanel gabarito={gabarito} art={art} side={back ? "back" : "front"} variant={neon ? "neon" : "front"} label={label} slug={slug} attachedOnly={Boolean(artName && !art.src)} />
          </div>
        )}
      </div>

      {showMannequin && <MannequinPanel art={art} onArt={onArt} sizes={sizes} sizeChart={sizeChart} />}

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

type ImagePanelProps = {
  art: ArtSettings;
  onArt: (update: (art: ArtSettings) => ArtSettings) => void;
  name: string | null;
  error: string | null;
  busy: boolean;
  onFile: (file: File | undefined, options?: { raw?: boolean }) => void;
  accept: string;
  hint: string;
  canChooseBackground: boolean;
  removable: boolean;
  styleName: string;
  /** O que o tratador automático fez com a imagem ("Ajustada automaticamente: …"). */
  report?: string | null;
  /** Peça sem gabarito: alternar entre preencher a área e a imagem inteira. */
  fitControls?: { mode: "fill" | "whole"; onMode: (mode: "fill" | "whole") => void } | null;
  /** Envia de novo o arquivo como o cliente mandou (sem corte de margem nem remoção de fundo). */
  onOriginal?: (() => void) | null;
};

/** Envio da imagem (clique ou arraste) e o fundo atrás dela; a posição fica no editor 2D. */
function ImagePanel({ art, onArt, name, error, busy, onFile, accept, hint, canChooseBackground, removable, styleName, report = null, fitControls = null, onOriginal = null }: ImagePanelProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onFile(event.dataTransfer.files?.[0]);
      }}
    >
      {name ? (
        <div className="flex flex-wrap items-center gap-4">
          <span className="relative size-16 shrink-0 overflow-hidden rounded-thumb bg-mist">
            {art.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={art.src} alt="" className="size-full object-contain" />
            ) : (
              <span className="grid size-full place-items-center text-[11px] font-bold text-muted">PDF</span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="text-caption text-muted" aria-live="polite">
              {art.src ? (report ?? (art.layout?.overflow ? "Encaixada no gabarito e aplicada no mockup 3D" : "Aplicada no mockup 3D, inteira dentro da área")) : "Arquivo anexado ao pedido; a prévia 3D usa a arte de exemplo"}
            </p>
          </div>
          <Button variant="link" size="sm" onClick={() => fileInput.current?.click()}>
            Trocar
          </Button>
          {onOriginal && !busy && (
            <Button variant="link" size="sm" onClick={onOriginal}>
              Usar a imagem original
            </Button>
          )}
          {removable && art.src && (
            <Button variant="link" size="sm" onClick={() => onArt((a) => ({ ...a, src: null, layout: a.layout?.text ? { text: a.layout.text } : null }))}>
              Remover
            </Button>
          )}
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
          <span className="text-[15px] font-bold">{busy ? "Lendo a imagem…" : "Enviar arte"}</span>
          <span className="text-caption text-muted">{hint}</span>
        </button>
      )}
      <input ref={fileInput} type="file" accept={accept} className="sr-only" tabIndex={-1} onChange={(event) => onFile(event.target.files?.[0])} />
      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-coral-700">
          {error}
        </p>
      )}

      {art.src && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {fitControls && (
            <SegmentedControl
              label="Encaixe da imagem"
              value={fitControls.mode}
              onChange={fitControls.onMode}
              options={[
                { value: "fill", label: "Preencher a área" },
                { value: "whole", label: "Imagem inteira" },
              ]}
            />
          )}
          {canChooseBackground && (
            <label className="flex h-11 items-center gap-2 rounded-full border border-line-strong pl-4 pr-1.5 text-[15px] font-bold">
              Fundo
              <input type="color" value={art.background} onChange={(event) => onArt((a) => ({ ...a, background: event.target.value }))} className="size-8 rounded-full border-0 bg-transparent" />
            </label>
          )}
          <p className="text-caption text-muted">Quer um texto por cima da imagem? Escreva em “Escrever texto”: ele entra no estilo {styleName.toLowerCase()}.</p>
        </div>
      )}
    </div>
  );
}

type PickerProps = {
  art: ArtSettings;
  family: ArtFamily;
  kind: MockupKind;
  aspect: number;
  ledColors?: string[];
  label: string;
  /** Contexto extra das prévias (janela frontal da térmica, cor da peça, verso sem texto de exemplo). */
  extra?: Partial<ArtRender>;
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
export function StylePicker({ art, family, kind, aspect, ledColors, label, extra, fontFor, onPick, compact = false }: PickerProps) {
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
        const preview: ArtRender = { ...art, ...extra, back: null, region: null, style: style.value, font: fontFor(style.value), kind, ledColors, aspect };
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
  const key = [
    art.style,
    art.font,
    art.text,
    art.subtext,
    art.background,
    art.textColor,
    art.kind,
    art.ledColors?.join(","),
    art.src,
    art.fit,
    art.rotation,
    art.zoom,
    art.offsetX,
    art.offsetY,
    art.frontWindow,
    art.surface,
    art.sample,
    JSON.stringify(art.layout ?? null),
  ].join("|");
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
