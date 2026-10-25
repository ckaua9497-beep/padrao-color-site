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
  surfaceArt,
  withMono,
  withSurfaceArt,
  type ArtFamily,
  type ArtRender,
  type ArtSettings,
  type ArtStyle,
  type ArtVariant,
  type FlipflopRegion,
  type Varnish,
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
import { ArtEditor2D, type LedEditor } from "./art-editor/ArtEditor2D";
import { GabaritoPanel } from "./gabarito/GabaritoPanel";
import { fitToTemplate, madeForTemplate, type Gabarito } from "./gabarito/jobs";
import { IntakeError, intakeImage } from "@/components/mockup/image-intake";
import { ART_ACCEPT } from "@/lib/image-prep";
import { uploadProblem } from "@/lib/art-files";
import { ARQUIVO_UNICO, camposVisiveis } from "@/lib/customizacao";
import type { Superficie } from "@/lib/superficies";
import { PROCESSO_INFO, acceptDo, corServe, monoDo, type Processo } from "@/lib/processo";
import type { Contorno } from "@/lib/contorno";
import { autoFitArt, fitAreaFor, fitModeOf, fitReport, restoreBackground, type FitArea } from "./auto-fit";
import { LedColorPicker } from "./art-editor/LedColorPicker";
import { LedLinesPanel } from "./art-editor/LedLinesPanel";
import { useLedContour } from "./art-editor/use-led-contour";
import { MannequinPanel } from "./art-editor/MannequinPanel";
import { TermosArte } from "./TermosArte";
import { LED_BORDA_CM } from "@/lib/contorno";
import { LED_COR_PADRAO, adicionarTraco, desenhoDe, finalizarLinha, linhasDeLed, type LedDesenho } from "@/lib/led-linhas";

type Props = {
  /** Grade de tamanhos e medidas da camisa (manequim proporcional). */
  sizes?: string[] | null;
  sizeChart?: SizeChartRow[] | null;
  /** Número do passo na página; sem ele (editor de um item do kit), o título vem sem número. */
  step?: number;
  family: ArtFamily;
  /** Produto vendido sem impressão: a arte serve só para simular, não é exigida. */
  blank?: boolean;
  /**
   * Campos de "Arquivos para a produção" da variação (anexosDeProducao: o arquivo único e os separados da API) e os já
   * escolhidos, por tipo de anexo.
   */
  extraTypes?: readonly string[];
  extraFiles?: Record<string, File>;
  onExtraFile?: (tipo: string, file: File | null) => void;
  art: ArtSettings;
  onArt: (update: (art: ArtSettings) => ArtSettings) => void;
  artName: string | null;
  /** `raw`: "Usar a imagem original" (sem corte de margem nem remoção de fundo). */
  onFile: (file: File | undefined, options?: { raw?: boolean }) => void;
  uploadError: string | null;
  uploading: boolean;
  /**
   * Só envio de arquivo, sem o editor de texto: LED Neon Logotipo (289), que é um desenho do cliente (regra do site
   * atual: "não há simulador; o cliente envia o arquivo da arte").
   */
  uploadOnly?: boolean;
  /** "Enviar arte depois": só nas lojas da multiloja, que recebem a arte na página do pedido. Sem `onArtLater`, some. */
  artLater?: boolean;
  onArtLater?: (value: boolean) => void;
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
  spec?: Pick<MockupSpec, "kind" | "widthCm" | "heightCm" | "thermal" | "variant" | "baseColor" | "back" | "spotVarnish">;
  /**
   * Superfícies com arte própria (src/lib/superficies.ts): frente, verso e as extras do gabarito (miolo, lâminas,
   * abas, lados…). Sem a lista, vale a regra antiga: frente e verso nas peças de duas faces e no gabarito com verso.
   */
  surfaces?: readonly Superficie[];
  /**
   * Processo que limita a arte (src/lib/processo.ts): P&B só em cinza, laser e talhamento num tom só (e talhamento só
   * vetor), DTF sem fundo. Mostra o aviso e filtra as cores, o fundo e os arquivos aceitos.
   */
  processo?: Processo | null;
  /**
   * Contorno automático (src/lib/contorno.ts): faca da lona com corte especial ou caminho do LED do quadro. Mostra o
   * aviso, tira o fundo da arte e marca o anexo dele como automático nos arquivos para a produção.
   */
  contorno?: Contorno | null;
  /** Anexos que o site faz sozinho quando o cliente não manda (faca, posição do LED, máscara de verniz). */
  automaticFiles?: readonly string[];
  /** Superfície em edição ("front", "back" ou o id da extra): a página vira o mockup 3D para ela. */
  onSide?: (side: string) => void;
  /** Gabarito oficial da seleção (medidas, sangria, corte e segurança): o editor e o PDF seguem ele. */
  gabarito?: Gabarito | null;
  /** Slug do produto (nome do PDF de impressão). */
  slug?: string;
  /** Clique num estilo (na fachada, a câmera vai de frente para a placa e os refletores acendem). */
  onStylePick?: (style: ArtStyle) => void;
  /** Título no lugar do "Sua arte" padrão (a fachada usa o mesmo título numerado dos outros passos). */
  heading?: ReactNode;
  /**
   * Aceite dos termos de envio de arte (src/lib/termos-arte.ts), obrigatório em todo produto personalizado: sem ele,
   * a página não adiciona ao carrinho. Sem a prop (kit, fachada), o aceite fica para o checkout.
   */
  termos?: { aceito: boolean; onAceito: (aceito: boolean) => void; faltando: boolean } | null;
};

type Mode = "texto" | "imagem";
type SurfaceUpload = { name: string | null; error: string | null; busy: boolean };
const NO_UPLOAD: SurfaceUpload = { name: null, error: null, busy: false };

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
 * Passo "Sua arte": estilo, texto e subtexto (aparecem no mockup na hora) ou imagem enviada. Inclui o
 * editor 2D da área de impressão (posição livre), frente e verso nas camisas e
 * almofadas, manequim proporcional na camisa, região do chinelo, faixa de 60% da garrafa térmica e as
 * cores e letras do neon.
 */
export function ArtStep({ step, family, blank = false, extraTypes = [], extraFiles = {}, onExtraFile, art, onArt, artName, onFile, uploadError, uploading, uploadOnly = false, artLater = false, onArtLater, missing, kind, aspect, ledColors, label = "", sizes, sizeChart, spec, surfaces, processo = null, contorno = null, automaticFiles = [], onSide, gabarito = null, slug = "", onStylePick, heading, termos = null }: Props) {
  const pieceKind = kind ?? FAMILY_SAMPLE[family].kind;
  // Superfícies: a lista da página; sem ela, frente e verso nas peças de duas faces e no gabarito com verso/costas.
  const twoSided = TWO_SIDED.includes(pieceKind) || Boolean(gabarito?.back);
  const list: readonly Superficie[] = surfaces?.length ? surfaces : twoSided ? [{ id: "front", label: "Frente" }, { id: "back", label: "Verso" }] : [{ id: "front", label: "Frente" }];
  const [picked, setPicked] = useState("front");
  // A superfície escolhida sumiu (outra variação): volta para a frente.
  const side = list.some((s) => s.id === picked) ? picked : "front";
  const isFront = side === "front";
  const back = side === "back";
  const sideInfo = list.find((s) => s.id === side) ?? list[0];
  const [modes, setModes] = useState<Record<string, Mode>>(() => ({ front: art.src ? "imagem" : "texto", back: art.back?.src ? "imagem" : "texto" }));
  // Enquanto o cliente não escolhe a fonte, cada estilo traz a sua.
  const [fontTouched, setFontTouched] = useState(art.font !== DEFAULT_ART.font);
  const [uploads, setUploads] = useState<Record<string, SurfaceUpload>>({});
  const sideUpload = uploads[side] ?? NO_UPLOAD;
  const setSideUpload = (id: string, update: (u: SurfaceUpload) => SurfaceUpload) => setUploads((all) => ({ ...all, [id]: update(all[id] ?? NO_UPLOAD) }));

  // Superfície ainda vazia: mesmo estilo, fonte e cores da frente (identidade estável para o editor).
  const sideArt = useMemo(() => surfaceArt(art, side), [side, art]);
  // Processo: a prévia (estilos, editor, gabarito) já sai em cinza ou num tom só; a arte guardada fica sem ele.
  const mono = monoDo(processo);
  const shownArt = useMemo(() => (mono ? { ...sideArt, mono } : sideArt), [sideArt, mono]);
  const shownAll = useMemo(() => withMono(art, mono), [art, mono]);
  // Laser, talhamento e DTF não imprimem fundo.
  // O contorno automático sai do desenho sem fundo.
  const noBackground = processo === "laser" || processo === "talhamento" || processo === "dtf" || contorno !== null;
  const onSideArt = (update: (a: ArtSettings) => ArtSettings) => onArt((a) => withSurfaceArt(a, side, update));
  const mode: Mode = uploadOnly ? "imagem" : (modes[side] ?? (sideArt.src ? "imagem" : "texto"));
  const setMode = (value: Mode) => setModes((m) => ({ ...m, [side]: value }));
  const hasSurfaceArt = (id: string) => (id === "front" ? hasArtContent(art) : hasArtContent(id === "back" ? art.back : art.faces?.[id]));
  const pickSide = (value: string) => {
    setPicked(value);
    onSide?.(value);
  };

  // Quadro acrílico com LED (contorno "led"): a arte é impressa em U.V. no acrílico (texto com cor e fonte de
  // impressão, não letra de tubo) e o LED são as linhas do painel "Linhas de LED", só na frente.
  const ledFrame = contorno?.tipo === "led";
  const neon = family === "neon" && !ledFrame;
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
  const sideGabarito = isFront ? (gabarito?.front ?? null) : back ? (gabarito?.back ?? null) : (gabarito?.faces?.[side] ?? null);
  // Chinelo: só a palmilha inteira usa o molde; região (dedos, meio, calcanhar) usa a faixa dela.
  const templatePanel = sideGabarito?.frame && !neon && (!region || region.value === "inteira") ? sideGabarito.ref.panel : null;
  const stageAspect = templatePanel ? templatePanel.cut.w / templatePanel.cut.h : editorAspect;
  const stageCm = templatePanel ? { widthCm: templatePanel.cut.w / 10, heightCm: templatePanel.cut.h / 10 } : areaCm;
  const previewExtra: Partial<ArtRender> = { frontWindow, surface, sample: isFront };

  // Linhas de LED do quadro: o contorno automático (traçado da arte sem fundo, como no 3D) e as do pincel.
  const ledMedida = areaCm ?? { widthCm: 50, heightCm: 50 };
  const ledCorPadrao = ledColors?.[0] ?? LED_COR_PADRAO;
  const ledArt = useMemo<ArtRender>(() => ({ ...art, back: null, faces: null, ledColors: undefined, background: "rgba(0,0,0,0)", kind: pieceKind, aspect: baseAspect }), [art, pieceKind, baseAspect]);
  const ledContour = useLedContour(ledArt, label, baseAspect, ledMedida.widthCm, ledFrame);
  const desenho = desenhoDe(art);
  const ledLinhas = ledFrame ? linhasDeLed(desenho, ledContour?.lacos ?? null, ledContour?.cheio ?? false, ledMedida, ledCorPadrao) : [];
  const [ledPincel, setLedPincel] = useState(false);
  const [ledCor, setLedCor] = useState<string | null>(null);
  const [ledDestaque, setLedDestaque] = useState<string | null>(null);
  const corDoPincel = ledCor ?? ledCorPadrao;
  const onLed = (update: (d: LedDesenho) => LedDesenho) =>
    onArt((a) => {
      const next = update(desenhoDe(a));
      // Sempre fica pelo menos uma linha de LED: sem nenhuma do pincel, o contorno automático volta.
      return { ...a, led: !next.auto && next.linhas.length === 0 ? { ...next, auto: true } : next };
    });
  const ledEditor: LedEditor | null =
    ledFrame && isFront
      ? {
          linhas: ledLinhas,
          emAndamento: desenho.emAndamento,
          destaque: ledDestaque,
          pincel: ledPincel,
          cor: desenho.linhas.find((l) => l.id === desenho.emAndamento)?.cor ?? corDoPincel,
          borda: { x: LED_BORDA_CM / ledMedida.widthCm, y: LED_BORDA_CM / ledMedida.heightCm },
          onTraco: (pontos) => {
            setLedDestaque(null);
            onLed((d) => adicionarTraco(d, pontos, corDoPincel, ledMedida, LED_BORDA_CM, () => crypto.randomUUID().slice(0, 8)));
          },
          onFinalizar: () => onLed((d) => finalizarLinha(d, ledMedida)),
        }
      : null;

  const pickStyle = (value: ArtStyle) => {
    const suggested = ART_STYLES.find((s) => s.value === value)?.font ?? DEFAULT_ART.font;
    onSideArt((a) => ({ ...a, style: value, font: fontTouched || neon ? a.font : suggested }));
    onStylePick?.(value);
  };

  // Área de arte do mockup: o tratador encaixa a imagem nela quando a peça não tem gabarito.
  const fitArea: FitArea | null = spec ? fitAreaFor(spec) : null;
  const sideFit = templatePanel ? null : fitArea;

  // Imagem do verso e das outras superfícies: lida aqui (a da frente vai pelo onFile da página, que também anexa o
  // PDF ao pedido). Cada envio ganha um número: um envio anterior que termina depois não sobrescreve o último.
  const surfaceSeq = useRef(0);
  const onBackFile = async (file: File | undefined, { raw = false }: { raw?: boolean } = {}) => {
    if (!file) return;
    const target = side;
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setSideUpload(target, (u) => ({ ...u, error: `O arquivo tem mais de ${MAX_UPLOAD_MB} MB. Envie uma versão menor.` }));
      return;
    }
    const seq = ++surfaceSeq.current;
    const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    setSideUpload(target, (u) => ({ ...u, error: null, busy: true }));
    try {
      // Superfície no gabarito: arquivo feito nele entra como veio; os outros, encaixados nele. Sem gabarito, o
      // tratador encaixa na área do mockup.
      const backSide = sideGabarito;
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
      if (seq !== surfaceSeq.current) {
        releaseSource(src);
        return;
      }
      onArt((all) =>
        withSurfaceArt(all, target, (a) => {
          const fresh: ArtSettings = { ...restoreBackground(a), src, zoom: 1, offsetX: 0, offsetY: 0, layout: a.layout?.text ? { text: a.layout.text } : null, templateFit: null };
          if (backSide?.frame) return fitToTemplate(fresh, backSide, { transparentBase: fitArea?.transparentBase ?? apparel, frontWindow: gabarito?.fitWindow });
          return fitArea ? autoFitArt(fresh, fitArea) : fresh;
        }),
      );
      setSideUpload(target, () => ({ name: file.name, error: null, busy: false }));
    } catch (error) {
      if (seq !== surfaceSeq.current) return;
      const message =
        error instanceof IntakeError ? error.message : pdf ? "Não conseguimos ler esse PDF. Tente exportar de novo ou envie PNG/JPG." : "Não conseguimos ler essa imagem. Tente PNG, JPG, WEBP ou SVG.";
      setSideUpload(target, (u) => ({ ...u, error: message, busy: false }));
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

  const upload = !isFront
    ? {
        name: sideArt.src ? (sideUpload.name ?? `Imagem: ${sideInfo.label.toLowerCase()}`) : null,
        error: sideUpload.error,
        busy: sideUpload.busy,
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

      {processo && (
        <p role="note" className="mb-3 rounded-control bg-mist px-3 py-2 text-caption text-ink">
          <strong>{PROCESSO_INFO[processo].titulo}.</strong> {PROCESSO_INFO[processo].texto}
        </p>
      )}

      {contorno && (
        <p role="note" className="mb-3 rounded-control bg-mist px-3 py-2 text-caption text-ink">
          <strong>{contorno.titulo}.</strong> {contorno.texto}
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
        {list.length > 1 && list.length <= 3 && !list.some((s) => s.pagina) && (
          <SegmentedControl
            label="Superfície da arte"
            value={side}
            onChange={pickSide}
            options={list.map((s) => ({
              value: s.id,
              label: (
                <>
                  {s.label}
                  {s.id !== "front" && hasSurfaceArt(s.id) && (
                    <>
                      <IconCheck className="size-3.5" strokeWidth={2.6} />
                      <span className="sr-only">(com arte)</span>
                    </>
                  )}
                </>
              ),
            }))}
          />
        )}
        {!uploadOnly && (
          <SegmentedControl
            label="Como montar a arte"
            value={mode}
            onChange={setMode}
            options={[
              { value: "texto", label: "Escrever texto" },
              { value: "imagem", label: "Enviar imagem" },
            ]}
          />
        )}
      </div>
      {uploadOnly && <p className="mt-2 text-caption text-muted">O logotipo é um desenho seu: envie o arquivo (de preferência em vetor: PDF, AI, CDR ou SVG). A prévia em 3D é ilustrativa.</p>}
      {(list.length > 3 || list.some((s) => s.pagina)) && (
        <div className="mt-3">
          <p className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 text-[15px] font-bold">
            Onde vai a arte
            <span className="text-caption font-normal text-muted">
              {list.filter((s) => hasSurfaceArt(s.id)).length} de {list.length} com arte
            </span>
          </p>
          <OptionGroup
            label="Superfície da arte"
            value={side}
            onChange={pickSide}
            options={list.map((s) => ({ value: s.id, label: hasSurfaceArt(s.id) ? `${s.label} ✓` : s.label }))}
          />
        </div>
      )}
      {back && (
        <p className="mt-2 text-caption text-muted">
          {pieceKind === "tshirt" ? "Logo ou texto nas costas" : "Arte do verso"}: vazio, o verso sai sem impressão.
          {spec && spec.back !== "blank" ? " A opção escolhida inclui impressão no verso." : ""}
        </p>
      )}
      {!isFront && !back && <p className="mt-2 text-caption text-muted">Arte de “{sideInfo.label}”: vazio, essa parte sai na cor do fundo.</p>}

      <div className={cx("mt-4 grid gap-5 rounded-card p-4 ring-1 transition-colors", missing && isFront ? "bg-coral-50 ring-coral-700" : "bg-white ring-line")}>
        {mode === "texto" ? (
          <div className="grid gap-5">
            <div>
              <p className="mb-2 flex items-baseline justify-between gap-3 text-[15px] font-bold">
                Estilo
                <span className="text-caption font-normal text-muted">{styleInfo.hint}</span>
              </p>
              <StylePicker
                art={shownArt}
                family={ledFrame ? "sign" : family}
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
              label={isFront ? "Texto da arte" : back ? "Texto do verso" : `Texto: ${sideInfo.label.toLowerCase()}`}
              value={sideArt.text}
              onChange={(text) => onSideArt((a) => ({ ...a, text }))}
              maxLength={TEXT_LIMIT[family]}
              placeholder={isFront ? SAMPLE_TEXT[family] : "Ex.: nome ou número"}
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

            {!neon && !apparel && !noBackground && (
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
                  options={ART_BACKGROUNDS.filter((b) => corServe(processo, b.value)).map((b) => ({ value: b.value, label: b.label, color: b.value }))}
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
                  options={TEXT_COLORS.filter((c) => corServe(processo, c.value)).map((c) => ({ value: c.value, label: c.label, color: c.value }))}
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
            art={shownArt}
            onArt={onSideArt}
            name={upload.name}
            error={upload.error}
            busy={upload.busy}
            onFile={upload.onFile}
            accept={acceptDo(processo) ?? upload.accept}
            hint={processo === "talhamento" ? "SVG, PDF, AI, CDR ou EPS (vetor) · ou arraste aqui" : upload.hint}
            canChooseBackground={!neon && !apparel && !noBackground}
            removable={!isFront}
            styleName={styleInfo.label}
            report={fitReport(sideArt, sideFit)}
            fitControls={fitControls}
            onOriginal={original ? () => upload.onFile(original, { raw: true }) : null}
          />
        )}

        <div className="border-t border-line pt-5">
          <ArtEditor2D
            art={shownArt}
            onArt={onSideArt}
            kind={pieceKind}
            family={family}
            variant={neon ? "neon" : "front"}
            aspect={stageAspect}
            areaCm={stageCm}
            surface={surface}
            ledColors={effectiveLeds}
            frontWindow={templatePanel ? gabarito?.frontWindow : frontWindow}
            sample={isFront}
            label={label}
            sideLabel={list.length > 1 ? sideInfo.label : undefined}
            template={templatePanel}
            onAutoFit={onAutoFit}
            led={ledEditor}
          />
        </div>

        {ledEditor && (
          <div className="border-t border-line pt-5">
            <LedLinesPanel
              desenho={desenho}
              onDesenho={onLed}
              linhas={ledLinhas}
              contorno={ledContour}
              medida={ledMedida}
              corPadrao={ledCorPadrao}
              pincel={ledPincel}
              onPincel={(on) => {
                setLedPincel(on);
                if (on) setLedDestaque(null);
                // Desligar o pincel finaliza a linha em andamento.
                else onLed((d) => finalizarLinha(d, ledMedida));
              }}
              cor={corDoPincel}
              onCor={setLedCor}
              destaque={ledDestaque}
              onDestaque={setLedDestaque}
            />
          </div>
        )}

        {gabarito && !blank && (
          <div className="border-t border-line pt-5">
            <GabaritoPanel gabarito={gabarito} art={shownAll} side={side} variant={neon ? "neon" : "front"} label={label} slug={slug} attachedOnly={Boolean(artName && !art.src)} />
          </div>
        )}
      </div>

      {spec?.spotVarnish && !blank && !neon && <VarnishPicker art={sideArt} onArt={onSideArt} sideLabel={list.length > 1 ? sideInfo.label : null} />}

      {showMannequin && <MannequinPanel art={art} onArt={onArt} sizes={sizes} sizeChart={sizeChart} />}

      {!blank && !artLater && extraTypes.length > 0 && onExtraFile && <ProductionFiles types={extraTypes} files={extraFiles} onFile={onExtraFile} automatic={automaticFiles} editorFront={art.src ? artName : null} editorBack={art.back?.src ? (uploads.back?.name ?? "imagem do verso") : null} />}

      {blank ? (
        <p className="mt-3 text-caption text-muted">A arte não vai impressa: ela mostra como o produto fica depois que você personalizar.</p>
      ) : (
        onArtLater && (
          <label className="mt-3 flex items-center gap-2.5 text-sm">
            <input type="checkbox" checked={artLater} onChange={(event) => onArtLater(event.target.checked)} className="size-4 accent-coral-700" />
            Enviar arte depois (a equipe entra em contato)
          </label>
        )
      )}
      {!blank && termos && <TermosArte id="termos-arte" className="mt-4" aceito={termos.aceito} onAceito={termos.onAceito} faltando={termos.faltando} />}
      {missing && (
        <p role="alert" className="mt-2 text-sm font-semibold text-coral-700">
          {uploadOnly ? "Envie o arquivo do logotipo para continuar." : onArtLater ? "Escreva um texto, envie a arte ou marque “Enviar arte depois” para continuar." : "Escreva um texto ou envie a arte para continuar."}
        </p>
      )}
    </li>
  );
}

/** Arquivos prontos para a produção: PDF, imagens, PSD, AI, CDR, EPS e SVG (o servidor confere a extensão e o tamanho). */
const PRODUCTION_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.svg,.tif,.tiff,.psd,.ai,.eps,.cdr,.zip,.rar";

/**
 * "Arquivos para a produção" (revisão da Padrão de 25/10/2026, "Anexo de Arquivos"): para quem já tem a arte pronta.
 * Um arquivo único com todas as páginas ou um arquivo por parte (frente, verso, verniz, faca…), conforme a variação
 * aceita na API. Enviar o arquivo único esconde os separados e enviar um separado esconde o único (camposVisiveis). Sem
 * arquivo próprio na frente ou no verso, vale a imagem enviada no editor acima.
 */
const VARNISH_OPTIONS: { value: Varnish; label: string }[] = [
  { value: "tudo", label: "Imagem e texto" },
  { value: "imagem", label: "Só a imagem" },
  { value: "texto", label: "Só o texto" },
];

/**
 * Verniz localizado: o que leva verniz na arte do lado em edição. A máscara para a produção sai daqui (o cliente ainda
 * pode mandar a dele em "Arquivos para a produção") e o brilho aparece no 3D.
 */
function VarnishPicker({ art, onArt, sideLabel }: { art: ArtSettings; onArt: (update: (art: ArtSettings) => ArtSettings) => void; sideLabel: string | null }) {
  const image = Boolean(art.src);
  const text = Boolean(art.text.trim() || (art.subtext ?? "").trim());
  return (
    <div className="mt-4 rounded-card bg-white p-4 ring-1 ring-line">
      <p className="text-[15px] font-bold">
        Verniz localizado {sideLabel && <span className="font-normal text-muted">· {sideLabel.toLowerCase()}</span>}
      </p>
      <p className="mt-1 text-caption text-muted">O verniz dá brilho só onde você escolher; o resto fica fosco. A máscara de verniz é feita a partir da sua arte.</p>
      {image && text ? (
        <OptionGroup className="mt-3" label="Onde vai o verniz" value={art.varnish ?? "tudo"} onChange={(value) => onArt((a) => ({ ...a, varnish: value as Varnish }))} options={VARNISH_OPTIONS} />
      ) : (
        <p className="mt-2 text-sm">{image ? "O verniz vai na imagem (o fundo fica sem)." : "O verniz vai no texto e nos enfeites da arte (o fundo fica sem)."}</p>
      )}
    </div>
  );
}

function ProductionFiles({
  types,
  files,
  onFile,
  automatic,
  editorFront,
  editorBack,
}: {
  types: readonly string[];
  files: Record<string, File>;
  onFile: (tipo: string, file: File | null) => void;
  /** Anexos que o site faz sozinho a partir da arte (faca de corte, posição do LED, máscara de verniz) quando o cliente não envia. */
  automatic: readonly string[];
  editorFront: string | null;
  editorBack: string | null;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const pick = (tipo: string, file: File | undefined) => {
    if (!file) return;
    const problem = uploadProblem(file.name, file.size);
    setErrors((e) => ({ ...e, [tipo]: problem ?? "" }));
    if (!problem) onFile(tipo, file);
  };
  const visible = camposVisiveis(types, files);
  const single = visible.filter((tipo) => tipo === ARQUIVO_UNICO);
  const separate = visible.filter((tipo) => tipo !== ARQUIVO_UNICO);
  const fromEditor = (tipo: string) => (tipo === "Impressão Frente" ? editorFront : tipo === "Impressão Verso" ? editorBack : null);
  const row = (tipo: string) => {
    const file = files[tipo];
    const editor = !file ? fromEditor(tipo) : null;
    const auto = !file && automatic.includes(tipo);
    return (
      <li key={tipo} className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-36 text-sm font-semibold">{tipo === ARQUIVO_UNICO ? "Arquivo único" : tipo}</span>
        {file ? (
          <>
            <span className="min-w-0 flex-1 truncate text-sm text-muted">{file.name}</span>
            <Button variant="link" size="sm" onClick={() => onFile(tipo, null)}>
              Remover
            </Button>
          </>
        ) : (
          <>
            {editor && <span className="min-w-0 flex-1 truncate text-sm text-muted">a imagem enviada acima ({editor})</span>}
            {auto && <span className="min-w-0 flex-1 truncate text-sm text-muted">feito automaticamente a partir da sua arte</span>}
            <label className="cursor-pointer text-sm font-bold text-coral-700 underline-offset-2 hover:underline">
              {editor ? "Trocar" : auto ? "Enviar a sua" : "Enviar arquivo"}
              <input type="file" accept={PRODUCTION_ACCEPT} className="sr-only" onChange={(event) => pick(tipo, event.target.files?.[0])} />
            </label>
          </>
        )}
        {errors[tipo] && (
          <p role="alert" className="w-full text-caption font-semibold text-coral-700">
            {errors[tipo]}
          </p>
        )}
      </li>
    );
  };
  return (
    <div className="mt-4 rounded-card bg-white p-4 ring-1 ring-line">
      <p className="text-[15px] font-bold">
        Arquivos para a produção <span className="font-normal text-muted">· opcionais</span>
      </p>
      <p className="mt-1 text-caption text-muted">
        Já tem a arte pronta? Envie um arquivo único com todas as páginas ou um arquivo para cada parte (PDF, JPG, PNG, PSD, AI, CDR, EPS ou SVG).
        {files[ARQUIVO_UNICO] ? " O arquivo único vai para a produção no lugar da arte montada acima." : ""}
      </p>
      {single.length > 0 && <ul className="mt-3 grid gap-2">{single.map(row)}</ul>}
      {single.length > 0 && separate.length > 0 && <p className="my-2 text-center text-sm font-bold text-coral-700">ou</p>}
      {separate.length > 0 && <ul className={cx("grid gap-2", !single.length && "mt-3")}>{separate.map(row)}</ul>}
    </div>
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
