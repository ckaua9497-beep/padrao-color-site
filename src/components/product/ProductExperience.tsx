"use client";

import { track } from "@/lib/tracking";
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import Mockup3D from "@/components/mockup/Mockup3D";
import { MockupSkeleton } from "@/components/mockup/MockupSkeleton";
import type { CaptureFn } from "@/components/mockup/MockupViewer";
import { DEFAULT_ART, artFamily, facesWithArt, hasArtContent, ledColorName, neonTextBox, withMono, releaseSource, retainSources, styleLabel, thumbnailOf, type ArtSettings } from "@/components/mockup/art";
import { IntakeError, intakeImage } from "@/components/mockup/image-intake";
import { autoFitArt, fitAreaFor, needsAreaRefit, restoreBackground } from "./auto-fit";
import { keepArtFiles, uploadedFileOf } from "./art-source";
import { artSummary } from "./art-summary";
import { useCart } from "@/components/cart/CartProvider";
import { IconClock, IconCube, IconTruck } from "@/components/icons";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { OptionGroup } from "@/components/ui/OptionGroup";
import { Price } from "@/components/ui/Price";
import QtyStepper from "@/components/ui/QtyStepper";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cx } from "@/components/ui/cx";
import type { CustomSize, InfoBlock, SizeChartRow, Variation } from "@/lib/catalog";
import { avisosDoProduto } from "@/lib/avisos-produto";
import { ARQUIVO_UNICO, anexosDeProducao, customizacaoDa, recebeArte, type Customizacao } from "@/lib/customizacao";
import { acabamentosDa, cotarAcabamentos, resumoAcabamentos, type Acabamento, type AcabamentoEscolhido } from "@/lib/acabamentos";
import { useCustomerVariations } from "@/lib/customer";
import { formatBRL, leadLabel, quantityLabel } from "@/lib/format";
import { nomeFrete, prazoFrete, type OpcaoFrete } from "@/lib/frete";
import { formatSize, mockupSpec, normalizeName } from "@/lib/mockup";
import { rotulosDosLados, superficieDaPeca, superficiesDe, temVerso } from "@/lib/superficies";
import { PROCESSO_INFO, arquivoServe, monoDo, processoDa } from "@/lib/processo";
import { contornoDo } from "@/lib/contorno";
import { desenhoDe, resumoLed } from "@/lib/led-linhas";
import { novoAceite } from "@/lib/termos-arte";
import { destinoDoVerniz, tiposDoVerniz, vernizResumo } from "@/lib/verniz";
import { orientacaoDe, orientacaoLivre, orientar, type Orientacao } from "@/lib/orientacao";
import { artArea, artAspect } from "@/lib/mockup-kinds";
import { describePanel, hasBackPanel, orientPages, pagesFor, panelFor, parametricPage, pieceKey, piecesOf, printsBack, ruleOf, type ProductTemplate, type TemplatePage } from "@/lib/templates";
import {
  areaQuote,
  areaRules,
  chooseOption,
  cleanOptionLabel,
  defaultSize,
  displayOrder,
  fitsLimits,
  formatArea,
  hasExpress,
  optionKeys,
  parseMeasure,
  quote,
  sizeError,
  sizePresets,
  sizeSummary,
  sizeTotal,
  speedQuote,
  stepValues,
  unitLimits,
  usesArea,
  type Selection,
  type SizeCounts,
  type Speed,
} from "@/lib/pricing";
import { ArtStep } from "./ArtStep";
import { AcabamentosStep } from "./AcabamentosStep";
import DeliverySpeed from "./DeliverySpeed";
import PreviewModal from "./PreviewModal";
import SizeBreakdown from "./SizeBreakdown";
import SizeInput, { type SizeText } from "./SizeInput";
import NeonSizeStep from "./NeonSizeStep";
import TemplateDownload from "./TemplateDownload";
import { fitToTemplate, madeForTemplate, needsRefit, printFileName, printSheets, type Gabarito, type GabaritoSide } from "./gabarito/jobs";
import { FotoProduto } from "@/components/FotoProduto";

export type ClientProduct = {
  /** ID do catálogo ("35", "tags"): baixa o gabarito em /api/gabarito/[id]. Sem ele, vale o slug. */
  id?: string;
  /** Grupo da API (vai no pedido junto com o ID da variação). */
  groupId?: number;
  slug: string;
  name: string;
  category: string;
  categorySlug: string;
  image: string;
  images: string[];
  options: Record<string, string[]>;
  variations: Variation[];
  price: number;
  priceQty: number;
  leadDays: number | null;
  isNew: boolean;
  bestSeller: boolean;
  /** Grade de tamanhos de vestuário e medidas por tamanho (API). */
  sizes?: string[] | null;
  sizeChart?: SizeChartRow[] | null;
  /** Medida livre: preço por m² (banner, adesivo, papel, lona, tecido). */
  customSize?: CustomSize | null;
  /** LED Neon montado pelo cliente (Frase/Logotipo): cobrança mínima de 0,25 m² por peça. */
  neon?: "frase" | "logo";
  template?: string | null;
  /** Gabarito oficial com as medidas (folhas, sangria, corte e segurança) para encaixar a arte. */
  printTemplate?: ProductTemplate | null;
  summary?: string;
  info?: InfoBlock[];
  /** Customização de cada variação (modo da arte, anexos aceitos, criação de arte): ver customizacaoDa. */
  customizacoes?: Customizacao[];
  /** Acabamentos extras das variações (serrilha, furo, laminação…): ver acabamentosDa. */
  acabamentos?: Acabamento[];
  /** Quantidade mínima e máxima de peças (qtde_minima/qtde_maxima da API). */
  minQty?: number;
  maxQty?: number;
  /** "site" = produto novo da API própria: o pedido é fechado pelo atendimento. */
  source?: "padrao" | "site";
};

const MAX_UPLOAD_MB = 25;
/** Teto da medida usada no 3D (a faixa vai até 50 m; o modelo não precisa passar disso). */
const MAX_MODEL_CM = 5000;

const roundMoney = (value: number) => Math.round(value * 100) / 100;
const fmtCm = (cm: number) => cm.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const daysText = (days: number | null) => (days ? `${days} ${days === 1 ? "dia útil" : "dias úteis"}` : "");

function initialSelection(product: ClientProduct): Selection {
  const cheapest = [...product.variations].sort((a, b) => a.p - b.p)[0];
  const selection: Selection = {};
  for (const key of optionKeys(product.options)) {
    selection[key] = cheapest?.v[key] ?? product.options[key][0];
  }
  return selection;
}

/** Medida inicial do m²: a primeira medida rápida do tipo de peça que cabe nos limites. */
function initialSize(product: ClientProduct): SizeText {
  if (!product.customSize) return { width: "", height: "" };
  const spec = mockupSpec(product, initialSelection(product));
  const [width, height] = defaultSize(spec.kind, spec.variant, product.customSize);
  return { width: String(width), height: String(height) };
}

/** Grade inicial: 1 peça no tamanho do meio quando o produto aceita pedido pequeno; senão começa vazia. */
function initialCounts(product: ClientProduct): SizeCounts {
  const sizes = product.sizes ?? [];
  if (!sizes.length || (product.minQty ?? 1) > 1) return {};
  const middle = sizes.find((s) => /^m$/i.test(s.trim())) ?? sizes[Math.floor(sizes.length / 2)];
  return { [middle]: 1 };
}

function StepTitle({ n, total, title }: { n: number; total: number; title: string }) {
  return (
    <p className="mb-2.5 flex items-center gap-2 text-[15px] font-bold">
      <span className="grid size-5 place-items-center rounded-full bg-ink text-[11px] text-white">{n}</span>
      {title}
      <span className="text-caption font-normal text-muted">
        · passo {n} de {total}
      </span>
    </p>
  );
}

export { artSummary };

/**
 * `pix` e `allowArtLater`: só nas lojas da multiloja, que dão desconto no PIX e recebem a arte depois, na página do
 * pedido. A loja principal não tem nenhum dos dois (revisão da Padrão de 25/10/2026).
 */
export default function ProductExperience({ product, pix = false, allowArtLater = false }: { product: ClientProduct; pix?: boolean; allowArtLater?: boolean }) {
  const keys = useMemo(() => optionKeys(product.options), [product.options]);
  const [selection, setSelection] = useState<Selection>(() => initialSelection(product));
  const [size, setSize] = useState<SizeText>(() => initialSize(product));
  // Frase em LED: largura escolhida (cm) e a caixa do texto medida no canvas (proporção e linhas de tubo).
  const [neonWidth, setNeonWidth] = useState("60");
  const [neonBox, setNeonBox] = useState<{ aspect: number; lines: number } | null>(null);
  // Lado da arte em edição (camisa, almofada, cama pet): o mockup 3D vira para ele.
  // Superfície em edição: "front", "back" ou o id da extra (miolo, lâmina, aba…). O 3D vira ou abre nela.
  const [artSide, setArtSide] = useState("front");
  // Orientação escolhida (crachá, canvas e banners de medida definida); null = a da opção.
  const [orientation, setOrientation] = useState<Orientacao | null>(null);
  const [counts, setCounts] = useState<SizeCounts>(() => initialCounts(product));
  const [speed, setSpeed] = useState<Speed>("economico");
  // Depois de uma tentativa de compra, medida e grade mostram todos os erros (inclusive campo vazio).
  const [attempted, setAttempted] = useState(false);
  const [art, setArt] = useState<ArtSettings>(DEFAULT_ART);
  const [artName, setArtName] = useState<string | null>(null);
  // Arquivo sem prévia (AI, CDR, PDF que o navegador não abre): vai para a produção como foi enviado.
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  // Arquivos para a produção da variação, por tipo de anexo: o arquivo único ou os separados (frente, verso, verniz, faca…).
  const [extraFiles, setExtraFiles] = useState<Record<string, File>>({});
  // Acabamentos extras escolhidos (os que a variação atual não aceita ficam de fora no cálculo).
  const [finishing, setFinishing] = useState<AcabamentoEscolhido[]>([]);
  // "Enviar arte depois" (só multiloja).
  const [artLater, setArtLater] = useState(false);
  const [artMissing, setArtMissing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [qty, setQty] = useState(() => Math.max(1, product.priceQty <= 1 ? (product.minQty ?? 1) : 1));
  const [tab, setTab] = useState<"3d" | "fotos">("3d");
  const [photo, setPhoto] = useState(0);
  const [preview, setPreview] = useState(false);
  const [pageShot, setPageShot] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const captureRef = useRef<CaptureFn | null>(null);
  const { add } = useCart();
  // Revendedor logado vê a tabela de revenda; conta comum segue no preço de balcão.
  const { variations, reseller } = useCustomerVariations(product, product.variations);

  const price = useMemo(
    () => quote(variations, selection, { price: product.price, qty: product.priceQty, leadDays: product.leadDays }, keys.length),
    [variations, product.price, product.priceQty, product.leadDays, selection, keys.length],
  );

  // Prazo: econômico (padrão) ou expresso, quando a API informa um expresso diferente.
  const expressAvailable = hasExpress(price);
  const expressChosen = expressAvailable && speed === "expresso";
  const chosen = speedQuote(price, expressChosen ? "expresso" : "economico");

  // Variação do catálogo (limites próprios da medida, m² ou preço fixo): a da tabela de revenda tem o mesmo ID.
  const catalogVariation = product.variations.find((v) => v.id === price.variation?.id) ?? price.variation;
  // Medida livre: preço por m² × área cobrada (a API não calcula m²; o valor vai no precoTotal do pedido), com os limites
  // da variação escolhida e o mínimo de 1 m² no item (0,25 m² por peça no LED).
  const areaMode = usesArea(product.options, selection, product.customSize, catalogVariation);
  // "Crie sua Frase em Led Neon" (290): a largura é escolhida e a altura sai da proporção do texto (neonTextBox), como no
  // site atual; cobra área × preço do m² com o mínimo de 0,25 m² (revisão da Padrão de 25/10/2026).
  const neonFrase = product.neon === "frase";
  const neonAspect = neonBox?.aspect ?? 2.5;
  const neonLines = neonBox?.lines ?? 1;
  const neonWidthCm = neonFrase ? parseMeasure(neonWidth) : 0;
  const measured = areaMode || neonFrase;
  const rules = areaRules(product, catalogVariation, { lines: neonLines });
  const widthCm = neonFrase ? neonWidthCm : parseMeasure(size.width);
  const heightCm = neonFrase ? (neonWidthCm ? Math.round((neonWidthCm / neonAspect) * 10) / 10 : 0) : parseMeasure(size.height);

  // Quantidade fora da grade: unidades (preço por unidade, com o mínimo da API) ou pacotes ("por 1.000 un.").
  const perUnit = !measured && price.qty <= 1;
  // A faixa da variação escolhida (Caderno "De 11 até 100" = 11 a 100) vale no lugar da do produto.
  const tier = unitLimits(product, price.variation);
  const minQty = perUnit ? tier.min : 1;
  // A Frase em LED é um letreiro só (sem quantidade).
  const maxQty = neonFrase ? 1 : perUnit ? Math.max(minQty, Math.min(tier.max || 999, 999)) : 99;
  const quantity = Math.min(maxQty, Math.max(minQty, qty));

  const area = (areaMode && product.customSize) || neonFrase ? areaQuote(chosen.price, widthCm, heightCm, rules, quantity) : null;

  // O 3D acompanha a medida (banner e papel de parede em escala), sem refazer o modelo a cada tecla.
  const modelWidth = useDeferredValue(widthCm);
  const modelHeight = useDeferredValue(heightCm);
  const baseSpec = useMemo(() => mockupSpec(product, selection), [product, selection]);
  // Variação com outros limites de medida (PS "Até 15x21cm"): a medida que não cabe vai para a primeira medida rápida
  // que cabe nos limites novos. Ajuste durante o render (estado derivado), só quando os limites mudam.
  const limitsKey = areaMode ? JSON.stringify(rules.limits) : "";
  const [sizedFor, setSizedFor] = useState(limitsKey);
  if (sizedFor !== limitsKey) {
    setSizedFor(limitsKey);
    if (areaMode && !fitsLimits(widthCm, heightCm, rules.limits)) {
      const [w, h] = defaultSize(baseSpec.kind, baseSpec.variant, rules.limits);
      setSize({ width: String(w), height: String(h) });
    }
  }
  // Horizontal ou vertical (revisão da Padrão de 25/10/2026): a peça gira no 3D e o gabarito acompanha a proporção.
  // Formato quadrado (canvas 25x25) não tem o que girar.
  const canOrient =
    baseSpec.widthCm !== baseSpec.heightCm &&
    orientacaoLivre({ kind: baseSpec.kind, variant: baseSpec.variant, name: normalizeName(product.name), medidaLivre: measured, options: product.options });
  const naturalOrientation = orientacaoDe(baseSpec.widthCm, baseSpec.heightCm);
  // Sem useMemo: o React Compiler memoriza.
  const spec = (() => {
    const oriented = canOrient ? orientar(baseSpec, orientation) : baseSpec;
    if (!measured || !modelWidth || !modelHeight) return oriented === baseSpec ? baseSpec : { ...oriented, label: formatSize(oriented.widthCm, oriented.heightCm) };
    const w = Math.min(modelWidth, MAX_MODEL_CM);
    const h = Math.min(modelHeight, MAX_MODEL_CM);
    return { ...baseSpec, widthCm: w, heightCm: h, label: formatSize(w, h) };
  })();
  const family = artFamily(spec.kind);

  // Customização da variação escolhida: sem personalização e neon de modelo pronto não recebem arte (a do editor é
  // só simulação); os arquivos para a produção são os tipos de anexo que a variação aceita (arquivo único ou separados).
  const custom = customizacaoDa(product, catalogVariation);
  const modeloPronto = custom.modo === "neon-modelo" && !spec.blank;
  const semArte = spec.blank || !recebeArte(custom);
  const producao = semArte ? [] : anexosDeProducao(custom);
  // Arquivos enviados no bloco de produção (só os tipos da variação atual).
  const productionFiles = Object.fromEntries(Object.entries(extraFiles).filter(([tipo]) => producao.includes(tipo)));
  const singleFile = productionFiles[ARQUIVO_UNICO] ?? null;
  const presets = areaMode ? sizePresets(baseSpec.kind, baseSpec.variant, rules.limits) : [];

  // Vestuário com grade: quantidade por tamanho; o total respeita o mínimo/máximo do produto.
  const sizes = product.sizes ?? [];
  const apparel = sizes.length > 0;
  const units = apparel ? sizeTotal(counts) : 0;
  const gridError = apparel ? sizeError(units, product.minQty ?? 1, product.maxQty ?? 0) : null;

  // Área de arte do mockup (produtos sem gabarito ou com o editor na área): o tratador encaixa a imagem nela.
  const fitArea = fitAreaFor(spec);
  const transparentBase = fitArea.transparentBase;

  // Processo que limita a arte (P&B, laser, talhamento, DTF): a prévia, o 3D e o PDF saem como a produção faz.
  const processo = semArte ? null : processoDa({ kind: spec.kind, name: normalizeName(product.name), selection });
  // Contorno automático (lona com corte especial, quadro com LED): a faca ou o caminho do LED saem do desenho.
  const contorno = semArte ? null : contornoDo({ kind: spec.kind, variant: spec.variant, name: normalizeName(product.name) });
  // Verniz localizado: a máscara sai da arte (ArtSettings.varnish) para os tipos de anexo de verniz da variação.
  const vernizTipos = spec.spotVarnish && !semArte ? tiposDoVerniz(destinoDoVerniz(producao)) : [];
  const automaticFiles = [...(contorno ? [contorno.anexo] : []), ...vernizTipos];
  const semFundo = contorno !== null;
  const renderArt = useMemo(() => {
    const painted = withMono(art, monoDo(processo));
    // DTF e contorno automático: a imagem vai sem o retângulo de fundo (aplicação localizada, corte no desenho).
    return processo === "dtf" || semFundo ? { ...painted, background: "rgba(0,0,0,0)" } : painted;
  }, [art, processo, semFundo]);
  // Verso pela cor e pelo tipo de peça (4/1, 4/4, "frente e verso", camisa, almofada, wind banner…), com ou sem gabarito.
  const versoPelaCor = !semArte && temVerso({ kind: spec.kind, variant: spec.variant, name: normalizeName(product.name), selection, anexos: custom.anexos });
  // Gabarito oficial da seleção: folhas (no tamanho de referência, nas camisas), painel da frente e do verso.
  const printTemplate = product.printTemplate ?? null;
  const refSize = apparel ? (sizes.find((s) => (counts[s] ?? 0) > 0) ?? sizes[Math.floor(sizes.length / 2)]) : null;
  // Sem useMemo: o React Compiler memoriza (e a grade de tamanhos muda a cada render).
  const gabarito = ((): Gabarito | null => {
    // Neon é montado em tubo de LED a partir de vetor: não há arquivo de impressão a encaixar.
    if (!printTemplate || semArte || family === "neon") return null;
    const aspect = artAspect(spec);
    // Medida livre: a regra do gabarito (ou a margem das folhas de medida fixa) aplicada à medida digitada.
    const rule = areaMode ? (printTemplate.parametric ?? ruleOf(printTemplate.pages)) : null;
    const custom = rule ? parametricPage(rule, widthCm, heightCm) : null;
    // Gabarito deitado para peça em pé (ou o contrário): as folhas giram para a orientação da peça.
    const orient = (list: TemplatePage[]) => (custom ? list : orientPages(list, aspect));
    const pages = orient(custom ? [custom] : printTemplate.parametric ? [] : pagesFor(printTemplate, selection, refSize));
    if (!pages.length) return null;
    // Camisas: uma folha por tamanho com peças na grade.
    let printPages: TemplatePage[] = pages;
    if (apparel && printTemplate.bySize) {
      const chosen = sizes.filter((s) => (counts[s] ?? 0) > 0).flatMap((s) => pagesFor(printTemplate, selection, s));
      if (chosen.length) printPages = orient(chosen.filter((p, i) => chosen.findIndex((q) => q.id === p.id) === i));
    }
    const side = (which: "front" | "back") => {
      const ref = panelFor(pages, which);
      // O editor trabalha no molde (é ele que vai para a impressão); "fit" só por curadoria: a composição
      // feita na área do mockup é encaixada no gabarito depois.
      // Chinelo com região (dedos, meio, calcanhar): o editor usa a faixa da região, não o molde da palmilha.
      const region = spec.kind === "flipflop" && art.region && art.region !== "inteira";
      return ref ? { ref, frame: printTemplate.editor !== "fit" && !region } : null;
    };
    // Gabarito que é só um adesivo/área da peça (garrafa, copo): o texto automático usa a área toda, não a
    // janela frontal do mockup.
    const front = side("front");
    const area = artArea(spec);
    const frontWindow = front && front.ref.panel.cut.w / 10 < area.widthCm * 0.6 ? 1 : undefined;
    // Gabarito da volta inteira (caneca, copo, garrafa): o logo entra na parte da frente, como sem gabarito.
    const fitWindow = frontWindow === 1 ? undefined : fitArea.frontWindow;
    // Verso: a peça de verso do gabarito; num gabarito de folha única "frente e verso" (cartaz, cartão de PVC), a mesma
    // peça da frente. Superfícies extras: cada peça do gabarito que tem a sua (miolo, lâminas, abas, lados).
    const withBack = versoPelaCor || (printsBack(selection) && hasBackPanel(pages));
    const backSide = withBack ? (hasBackPanel(pages) ? side("back") : front) : null;
    const faces: NonNullable<Gabarito["faces"]> = {};
    for (const page of pages) {
      for (const piece of piecesOf(page)) {
        const id = superficieDaPeca(page, piece);
        if (!id || id === "front" || id === "back" || faces[id]) continue;
        faces[id] = { ref: { page: piece.view, panel: piece.panel, index: piece.panelIndex, piece }, frame: printTemplate.editor !== "fit" };
      }
    }
    return { pages, printPages, front, back: backSide, faces, aspect, kind: spec.kind, transparent: artFamily(spec.kind) === "apparel", frontWindow, fitWindow };
  })();
  const frontFacts = gabarito?.front ? describePanel(gabarito.front.ref.panel) : null;
  const verso = versoPelaCor || Boolean(gabarito?.back);
  // Superfícies com arte própria: frente, verso (4/1, 4/4, peças de duas faces) e as extras do gabarito.
  const surfaces = semArte ? [] : superficiesDe({ pages: gabarito?.pages ?? [], verso, ...rotulosDosLados(spec.kind, spec.variant) });
  const surfaceLabels = Object.fromEntries(surfaces.map((s) => [s.id, s.label]));
  // A superfície escolhida sumiu (outra variação): o 3D volta para a frente.
  const shownSide = surfaces.some((s) => s.id === artSide) ? artSide : "front";

  // Imagem no encaixe automático encaixada noutra peça (troca de medida/tamanho/formato, ou um envio que
  // terminou depois da troca): refaz o encaixe na peça atual — no gabarito, se o lado tem um; senão, na área do
  // mockup. Ajuste durante o render (estado derivado, sem efeito): só quando a peça ou o encaixe mudam.
  const refitKey = `${gabarito?.front ? pieceKey(gabarito.front.ref.piece) : ""}|${gabarito?.back ? pieceKey(gabarito.back.ref.piece) : ""}|${fitArea.aspect.toFixed(4)}|${art.templateFit?.piece ?? ""}|${art.back?.templateFit?.piece ?? ""}`;
  const [fittedFor, setFittedFor] = useState(refitKey);
  if (fittedFor !== refitKey) {
    setFittedFor(refitKey);
    const frontSide = gabarito?.front ?? null;
    const backSide = gabarito?.back ?? null;
    const textOnly = (a: ArtSettings): ArtSettings => ({ ...a, layout: a.layout?.text ? { text: a.layout.text } : null });
    const stale = (a: ArtSettings, side: GabaritoSide | null) => (side?.frame ? needsRefit(a, side) : needsAreaRefit(a, fitArea));
    const refit = (a: ArtSettings, side: GabaritoSide | null) =>
      side?.frame ? fitToTemplate(textOnly(a), side, { transparentBase, frontWindow: gabarito?.fitWindow }) : autoFitArt(a, fitArea, a.templateFit?.chosen);
    if (stale(art, frontSide) || (art.back && stale(art.back, backSide))) {
      setArt((a) => {
        const front = stale(a, frontSide) ? refit(a, frontSide) : a;
        return front.back && stale(front.back, backSide) ? { ...front, back: { ...refit(front.back, backSide), back: null } } : front;
      });
    }
  }

  // Frase em LED: mede a caixa do texto (no próximo quadro e de novo quando as fontes terminam de carregar).
  useEffect(() => {
    if (product.neon !== "frase") return;
    let alive = true;
    const measure = () => {
      if (alive) setNeonBox(neonTextBox({ text: art.text, subtext: art.subtext, style: art.style, font: art.font }));
    };
    const frame = requestAnimationFrame(measure);
    document.fonts?.ready.then(measure).catch(() => undefined);
    document.fonts?.addEventListener?.("loadingdone", measure);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      document.fonts?.removeEventListener?.("loadingdone", measure);
    };
  }, [product.neon, art.text, art.subtext, art.style, art.font]);

  // As imagens da arte (frente, verso e outras superfícies) ficam registradas enquanto estão em uso; a trocada é liberada.
  const owner = useId();
  const faceSources = useMemo(() => Object.values(art.faces ?? {}).map((face) => face.src), [art.faces]);
  useEffect(() => {
    retainSources(owner, [art.src, art.back?.src, ...faceSources]);
  }, [owner, art.src, art.back?.src, faceSources]);
  useEffect(() => () => retainSources(owner, []), [owner]);
  // Rastreamento: produto visto (funil e produtos vencedores).
  useEffect(() => {
    track("produto_view", { p: product.slug, val: product.price });
  }, [product.slug, product.price]);

  // Preço de uma peça (m²) ou de um conjunto da tabela; o total multiplica pela quantidade ou pelas peças da grade.
  const unitPrice = area ? area.price : chosen.price;
  // Acabamentos extras da variação: o preço segue as peças do item (milheiro, unidade ou fixo) e o prazo soma.
  const finishes = acabamentosDa(product, catalogVariation);
  const pieces = apparel ? units : area || perUnit ? quantity : quantity * price.qty;
  const chosenFinishes = finishing.filter((f) => finishes.some((a) => a.id === f.id));
  const finishQuote = cotarAcabamentos(finishes, chosenFinishes, pieces) ?? { itens: [], total: 0, prazo: 0 };
  const leadDays = chosen.leadDays ? chosen.leadDays + finishQuote.prazo : chosen.leadDays;
  // Medida livre: o total do item vem pronto (o mínimo de 1 m² vale no item inteiro, não por peça).
  const total = roundMoney((area ? area.total : unitPrice * (apparel ? units : quantity)) + finishQuote.total);
  const display =
    area && !area.error
      ? { value: area.price, unit: neonFrase ? "pelo letreiro" : "por peça" }
      : area
        ? { value: chosen.price, unit: "por m²" }
        : { value: chosen.price, unit: apparel ? "por peça" : quantityLabel(price.qty) };
  // Preço de cada ritmo na mesma unidade do preço exibido (peça na medida escolhida, m², peça ou conjunto).
  const speedPrice = (value: number) => (area && !area.error ? areaQuote(value, widthCm, heightCm, rules, quantity).price : value);
  const totalLabel = apparel
    ? `${units.toLocaleString("pt-BR")} ${units === 1 ? "peça" : "peças"}`
    : area
      ? `${quantity > 1 ? `${quantity} × ` : ""}${neonFrase ? "letreiro" : "peça"} de ${fmtCm(widthCm)} × ${fmtCm(heightCm)} cm`
      : perUnit
        ? `${quantity.toLocaleString("pt-BR")} ${quantity === 1 ? "unidade" : "unidades"}`
        : `${quantity > 1 ? `${quantity} × ` : ""}${quantityLabel(price.qty).replace("por ", "")}`;

  // Passos numerados: opções, medida (m²), tamanhos (vestuário) e arte.
  const sizeStep = keys.length + 1;
  const gridStep = keys.length + (measured ? 2 : 1);
  const finishStep = keys.length + (measured ? 1 : 0) + (apparel ? 1 : 0) + 1;
  // Variação sem personalização não tem o passo da arte.
  const artStep = finishStep + (finishes.length ? 1 : 0);
  const totalSteps = semArte ? artStep - 1 : artStep;
  // Variação sem personalização (produto liso, neon pronto): só as fotos, sem o 3D. A peça é vendida como na foto
  // (revisão da Padrão de 25/10/2026, "Mockups 3d para produtos sem personalização: recomendo não exibir").
  // Grupo novo da API sem modelo 3D (o tipo caiu no "fallback": nem nome nem categoria conhecidos) também fica só nas
  // fotos até ganhar um modelo.
  const show3d = !semArte && spec.source !== "fallback";
  const view = show3d ? tab : "fotos";

  // Linhas extras do carrinho. "Medida" segue o formato das páginas de festa e kit ("200 × 150 cm"), para o
  // carrinho e o checkout tratarem toda linha por m² igual; a área cobrada aparece só na pré-visualização.
  const extras: [string, string][] = [
    ...(area ? [["Medida", `${fmtCm(widthCm)} × ${fmtCm(heightCm)} cm`] as [string, string]] : []),
    ...(apparel ? [["Tamanhos", sizeSummary(sizes, counts) || "nenhum"] as [string, string]] : []),
    ...(finishQuote.itens.length ? [["Acabamentos", resumoAcabamentos(finishQuote.itens)] as [string, string]] : []),
    ...(processo ? [["Processo", PROCESSO_INFO[processo].titulo] as [string, string]] : []),
    ...(canOrient ? [["Orientação", (orientation ?? naturalOrientation) === "vertical" ? "Vertical" : "Horizontal"] as [string, string]] : []),
    ...(expressAvailable ? [["Prazo", `${expressChosen ? "Expresso" : "Econômico"}${leadDays ? ` · ${daysText(leadDays)}` : ""}`] as [string, string]] : []),
  ];
  const avisos = avisosDoProduto(product.groupId);
  const previewExtras: [string, string][] = [
    ...extras,
    ...(area ? [["Área cobrada", formatArea(area.billedArea)] as [string, string]] : []),
    ...avisos.map((aviso) => ["Atenção", aviso] as [string, string]),
  ];

  // Produto vendido sem impressão: a arte é só simulação e não trava o pedido.
  const typedArt = art.text.trim().length > 0 || art.subtext.trim().length > 0;
  // Quadro com LED: as linhas desenhadas com o pincel já são a arte (acrílico só com o LED).
  const ledDrawn = contorno?.tipo === "led" && desenhoDe(art).linhas.length > 0;
  const hasArt = semArte || artLater || Boolean(artName) || typedArt || ledDrawn || facesWithArt(art).length > 0 || Object.keys(productionFiles).length > 0;

  // Escolher um valor ajusta os passos seguintes para uma combinação que existe na API.
  const choose = (key: string, value: string) => setSelection((s) => chooseOption(keys, variations, s, key, value));
  // Termos de envio de arte (src/lib/termos-arte.ts): o aceite vai com o item para o carrinho e o pedido.
  const [termosAceitos, setTermosAceitos] = useState(false);
  const [termosFaltando, setTermosFaltando] = useState(false);
  const updateArt = (update: (art: ArtSettings) => ArtSettings) => {
    setArt(update);
    setArtMissing(false);
  };

  // Um canvas WebGL por vez: com o modal aberto, a página mostra o último quadro do 3D.
  const openPreview = () => {
    setPageShot(captureRef.current?.() ?? null);
    setPreview(true);
  };

  // Cada envio ganha um número: o resultado de um envio anterior que termina depois não sobrescreve o último.
  const uploadSeq = useRef(0);
  // `raw`: "Usar a imagem original" (sem corte de margem nem remoção de fundo).
  const onFile = async (file: File | undefined, { raw = false }: { raw?: boolean } = {}) => {
    if (!file) return;
    // Grande demais: avisa sem cancelar um envio que ainda está em andamento.
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setUploadError(`O arquivo tem mais de ${MAX_UPLOAD_MB} MB. Envie uma versão menor.`);
      return;
    }
    if (!arquivoServe(processo, file.name)) {
      setUploadError("Para o talhamento na madeira, envie arte vetorial (SVG, PDF, AI, CDR ou EPS) ou escreva o texto.");
      return;
    }
    const seq = ++uploadSeq.current;
    setUploadError(null);
    const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    // Sem prévia (AI, CDR, TIFF…): vai anexado ao pedido; o 3D segue com a arte de exemplo.
    const attach = (message: string | null) => {
      setArtName(file.name);
      setAttachedFile(file);
      setArt((a) => ({ ...a, src: null, templateFit: null }));
      setArtLater(false);
      setArtMissing(false);
      setUploadError(message);
    };
    setUploading(true);
    try {
      // PDF: a primeira página aparece no 3D e entra no gabarito pela medida real da página. Imagem: passa pelo
      // tratador automático (orientação, SVG, transparência, margem, fundo branco em camisa/sacola, prévia nítida).
      // Arquivo já feito no gabarito (pelos pixels do original) entra como veio, sem corte nem remoção de fundo.
      const frontSide = gabarito?.front ?? null;
      const src = pdf
        ? (await (await import("./gabarito/pdf-artwork")).readPdfArtwork(file)).src
        : (await intakeImage(file, { removeWhite: transparentBase || contorno?.tipo === "led", treat: !raw, madeForTemplate: frontSide?.frame ? (px, vector) => madeForTemplate(frontSide, px, vector) : null })).src;
      if (seq !== uploadSeq.current) {
        releaseSource(src);
        return;
      }
      // Arquivo novo: a posição e o fundo automático da imagem anterior não valem. No gabarito ele entra
      // encaixado nele; sem gabarito, o tratador encaixa na área do mockup (foto preenche, logo inteiro). Se a
      // peça mudou durante o envio, o re-encaixe acima corrige na hora.
      setArt((a) => {
        const fresh: ArtSettings = { ...restoreBackground(a), src, zoom: 1, offsetX: 0, offsetY: 0, layout: a.layout?.text ? { text: a.layout.text } : null, templateFit: null };
        return frontSide?.frame ? fitToTemplate(fresh, frontSide, { transparentBase, frontWindow: gabarito?.fitWindow }) : autoFitArt(fresh, fitArea);
      });
      setArtName(file.name);
      setAttachedFile(null);
      setArtMissing(false);
      setTab("3d");
    } catch (error) {
      if (seq !== uploadSeq.current) return;
      if (error instanceof IntakeError && error.attach) attach(error.message);
      else if (pdf) attach(null); // PDF que o navegador não lê: segue anexado pelo nome, como antes.
      else setUploadError(error instanceof IntakeError ? error.message : "Não conseguimos ler essa imagem. Tente PNG, JPG, WEBP ou SVG.");
    } finally {
      if (seq === uploadSeq.current) setUploading(false);
    }
  };

  const goTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });

  const addToCart = async () => {
    if (area?.error || gridError) {
      setAttempted(true);
      setPreview(false);
      goTo(area?.error ? "passo-medida" : "passo-tamanhos");
      return;
    }
    if (!hasArt) {
      setArtMissing(true);
      setPreview(false);
      goTo("passo-arte");
      return;
    }
    // Todo produto personalizado pede o aceite dos termos de envio de arte.
    if (!semArte && !termosAceitos) {
      setTermosFaltando(true);
      setPreview(false);
      goTo("termos-arte");
      return;
    }
    setAdding(true);
    let thumb: string | null = null;
    try {
      const shot = show3d ? captureRef.current?.() : null;
      if (shot) thumb = await thumbnailOf(shot, 360);
      else if (art.src) thumb = await thumbnailOf(art.src, 360);
    } catch {
      thumb = null;
    }
    // Arquivo de impressão no gabarito (PDF no tamanho real): fica no navegador e segue com o pedido.
    let printFile: { id: string; name: string } | null = null;
    // Só quando a composição é do cliente: arquivo anexado que o site não lê (CDR, AI) vai como foi enviado.
    const ownArt = Boolean(art.src || art.back?.src) || (!artName && hasArtContent(art)) || hasArtContent(art.back) || facesWithArt(art).length > 0 || ledDrawn;
    if (gabarito && !artLater && ownArt && !singleFile) {
      try {
        const [{ buildPrintPdf }, { savePrintFile }] = await Promise.all([import("./gabarito/print-file"), import("./gabarito/print-store")]);
        const sheets = printSheets(gabarito, renderArt);
        const blob = await buildPrintPdf(sheets, { title: `${product.name} — arte no gabarito`, variant: family === "neon" ? "neon" : "front", label: product.name, transparent: gabarito.transparent });
        const id = crypto.randomUUID();
        const name = printFileName(product.slug);
        const summary = frontFacts ? `${frontFacts.final}${frontFacts.bleed ? ` · sangria ${frontFacts.bleed}` : ""}` : "";
        if (await savePrintFile(id, blob, { name, product: product.name, pages: sheets.length, summary })) printFile = { id, name };
      } catch {
        printFile = null;
      }
    }
    // Arquivos que o cliente enviou: ficam no navegador até o checkout mandar para o Bunny. O arquivo único vai sozinho
    // (no lugar da arte montada); senão, a frente e o verso do editor (ou os arquivos próprios deles) e os separados.
    const manualFront = productionFiles["Impressão Frente"];
    const manualBack = productionFiles["Impressão Verso"];
    // Faca de corte ou posição do LED feita do contorno da arte, quando o cliente não mandou a dele nem o arquivo único.
    let autoContorno: File | null = null;
    let ledResumo: string | null = null;
    if (contorno && !semArte && !artLater && !singleFile && !productionFiles[contorno.anexo] && ownArt) {
      try {
        const { arquivoDeContorno, arquivoDeLed } = await import("./contorno-arquivo");
        if (contorno.tipo === "led") {
          // Linhas de LED (contorno e pincel), cada uma com a sua cor: o resumo vai junto no pedido.
          const led = await arquivoDeLed(renderArt, spec, contorno, product.name, product.slug);
          autoContorno = led?.file ?? null;
          ledResumo = led ? resumoLed(led.linhas, ledColorName) : null;
        } else autoContorno = await arquivoDeContorno(renderArt, spec, contorno, product.name, product.slug);
      } catch {
        autoContorno = null;
      }
    }
    // Máscaras de verniz localizado feitas da arte, nos tipos que o cliente não mandou.
    let autoVerniz: { file: File; tipo: string }[] = [];
    if (vernizTipos.length && !artLater && !singleFile && ownArt) {
      try {
        const { arquivosDeVerniz } = await import("./verniz-arquivo");
        autoVerniz = await arquivosDeVerniz({ art: renderArt, spec, gabarito, anexos: producao, enviados: productionFiles, label: product.name, slug: product.slug });
      } catch {
        autoVerniz = [];
      }
    }
    const artFiles =
      semArte || artLater
        ? []
        : await keepArtFiles(
            singleFile
              ? [{ file: singleFile, kind: "extra" as const, tipo: ARQUIVO_UNICO }]
              : [
                  manualFront ? { file: manualFront, kind: "extra" as const, tipo: "Impressão Frente" } : { file: art.src ? uploadedFileOf(art.src) : artName ? attachedFile : null, kind: "arquivo" as const },
                  manualBack ? { file: manualBack, kind: "extra" as const, tipo: "Impressão Verso" } : { file: uploadedFileOf(art.back?.src), kind: "verso" as const },
                  ...producao.filter((tipo) => tipo !== ARQUIVO_UNICO && tipo !== "Impressão Frente" && tipo !== "Impressão Verso").map((tipo) => ({ file: productionFiles[tipo], kind: "extra" as const, tipo })),
                  // A variação que não lista o tipo recebe o arquivo como "Arquivo Único" (attachmentType).
                  ...(autoContorno && contorno ? [{ file: autoContorno, kind: "extra" as const, tipo: contorno.anexo }] : []),
                  ...autoVerniz.map(({ file, tipo }) => ({ file, kind: "extra" as const, tipo })),
                ],
            product.name,
          );
    add({
      slug: product.slug,
      name: product.name,
      image: product.image,
      preview: thumb,
      printFile,
      artFiles: artFiles.length ? artFiles : null,
      options: {
        ...Object.fromEntries(keys.map((k) => [cleanOptionLabel(k), selection[k]])),
        ...Object.fromEntries(extras),
        ...(!semArte && !artLater ? artSummary(art, family, surfaceLabels) : {}),
        ...(autoContorno && contorno ? { [contorno.anexo]: contorno.tipo === "led" ? "automática" : `automática · ${String(contorno.margemCm).replace(".", ",")} cm do desenho` } : {}),
        ...(ledResumo ? { "Linhas de LED": ledResumo } : {}),
        ...(vernizTipos.length && !semArte && !artLater ? { "Verniz localizado": autoVerniz.length ? `${vernizResumo(art.varnish)} · máscara automática` : vernizResumo(art.varnish) } : {}),
        // Só a medida do gabarito: o PDF fica no navegador do cliente (não vai junto do pedido).
        ...(printFile && frontFacts ? { Gabarito: `${frontFacts.final}${frontFacts.bleed ? ` · sangria ${frontFacts.bleed}` : ""}` } : {}),
      },
      // Mesmo contrato do pedido (lib/orders.ts): quantity = lotes da variação (q unidades cada), unitPrice = preço de um lote.
      // Medida livre: 1 peça por lote, já com a área. Vestuário: quantity = total de peças; a divisão vai em "Tamanhos".
      unitPrice,
      setQty: area ? 1 : price.qty,
      quantity: apparel ? units : quantity,
      leadDays,
      ...(finishQuote.itens.length ? { acabamentos: finishQuote.itens.map((item) => ({ id: item.acabamento.id, qtd: item.qtd })), acabamentosPreco: finishQuote.total } : {}),
      groupId: product.groupId,
      variationId: price.variation?.id,
      ...(area ? { widthCm, heightCm } : {}),
      express: expressChosen,
      ...(!semArte ? { termosArte: novoAceite(new Date()) } : {}),
      // O carrinho mostra "Arte: …"; null = enviar depois (só multiloja).
      artName: modeloPronto ? "modelo pronto" : semArte ? "produto sem impressão" : artLater ? null : singleFile ? `${singleFile.name} · arquivo único` : (artName ?? (typedArt ? `texto no mockup · estilo ${styleLabel(art.style).toLowerCase()}` : ledDrawn ? "linhas de LED desenhadas no editor" : Object.keys(productionFiles).length ? "arquivos para a produção" : null)),
    });
    setAdding(false);
    setPreview(false);
  };

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] xl:gap-14">
      {/* Preso ao rolar: o quadro do 3D encolhe em telas baixas (notebooks) para a barra dele não sair da tela. */}
      <div className="lg:sticky lg:top-painel lg:self-start lg:[--lado:min(100%,calc(100dvh-var(--spacing-painel)-7.5rem))]">
        {show3d && (
          <SegmentedControl
            label="Visualização do produto"
            className="mb-3"
            value={tab}
            onChange={setTab}
            options={[
              {
                value: "3d",
                label: (
                  <>
                    <IconCube className="size-4" /> Mockup 3D
                  </>
                ),
              },
              { value: "fotos", label: "Fotos" },
            ]}
          />
        )}
        {view === "3d" ? (
          preview ? (
            <div className="aspect-square w-full overflow-hidden rounded-card bg-mist lg:mx-auto lg:w-(--lado)">
              {pageShot ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pageShot} alt="" className="size-full object-cover" />
              ) : (
                <MockupSkeleton />
              )}
            </div>
          ) : (
            <Mockup3D spec={spec} art={renderArt} label={product.name} captureRef={captureRef} fallbackImage={product.image} side={shownSide === "back" ? "back" : "front"} face={shownSide !== "front" && shownSide !== "back" ? shownSide : null} className="aspect-square w-full lg:mx-auto lg:w-(--lado)" />
          )
        ) : (
          <div className="flex gap-3 lg:mx-auto lg:w-[min(100%,calc(var(--lado)+4.75rem))]">
            <div className="flex w-16 shrink-0 flex-col gap-2">
              {product.images.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  aria-label={`Foto ${i + 1} de ${product.images.length}`}
                  aria-pressed={photo === i}
                  onClick={() => setPhoto(i)}
                  className={cx("relative aspect-square overflow-hidden rounded-thumb bg-mist ring-offset-2", photo === i ? "ring-2 ring-ink" : "ring-1 ring-line")}
                >
                  <FotoProduto src={src} alt="" sizes="64px" respiro="p-1" estudio="cobrir" />
                </button>
              ))}
            </div>
            {/* self-start: com muitas fotos, a coluna de miniaturas passa da altura do quadro, que continua quadrado como o 3D. */}
            <div className="relative aspect-square flex-1 self-start overflow-hidden rounded-card bg-mist">
              <FotoProduto src={product.images[photo] ?? product.image} alt={product.name} sizes="(max-width: 1024px) 90vw, 560px" priority />
            </div>
          </div>
        )}
        {show3d && (
          <p className="mt-3 text-caption text-muted">
            Mockup ilustrativo gerado com a sua arte{area && !area.error ? `, na medida ${fmtCm(widthCm)} × ${fmtCm(heightCm)} cm` : ""}. A cor impressa segue o arquivo enviado.
          </p>
        )}
        {/* Gabarito logo abaixo da foto/3D, em destaque (revisão da Padrão de 25/10/2026). */}
        {product.template && !semArte && (
          <TemplateDownload
            productId={product.id ?? product.slug}
            template={product.template}
            name={product.name}
            facts={frontFacts ? [`Tamanho final ${frontFacts.final}`, frontFacts.bleed ? `sangria ${frontFacts.bleed}` : "sem sangria", frontFacts.safe ? `segurança ${frontFacts.safe}` : null].filter((f): f is string => Boolean(f)) : null}
            className="mt-4 lg:mx-auto lg:w-(--lado)"
          />
        )}
      </div>

      <div>
        <div className="flex flex-wrap gap-2">
          {show3d && <Badge tone="brand">Mockup 3D grátis</Badge>}
          {reseller && <Badge tone="new">Preço de revendedor</Badge>}
          {modeloPronto ? <Badge tone="neutral">Modelo pronto</Badge> : semArte && <Badge tone="neutral">Vendido sem impressão</Badge>}
          {product.bestSeller && <Badge tone="dark">Mais vendido</Badge>}
          {product.isNew && <Badge tone="new">Lançamento</Badge>}
        </div>
        <h1 className="mt-3 text-title font-normal">{product.name}</h1>
        {product.summary && <p className="mt-2 max-w-xl text-[17px] leading-relaxed text-ink/75">{product.summary}</p>}
        <Price className="mt-4" size="pdp" value={display.value} from={!price.exact} unit={display.unit} pix={pix} live />
        {leadLabel(leadDays) && (
          <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-ink/80">
            <IconClock className="size-4 text-coral-700" /> {leadLabel(leadDays)}
            {expressChosen && <span className="text-muted">· expresso</span>}
          </p>
        )}
        {avisos.map((aviso) => (
          <p key={aviso} role="note" className="mt-3 max-w-xl rounded-control bg-coral-50 px-3 py-2 text-sm font-semibold text-coral-700">
            {aviso}
          </p>
        ))}
        {product.source === "site" && <p className="mt-2 text-caption text-muted">Produto novo: monte a arte e o orçamento aqui; o pedido é fechado com o nosso atendimento.</p>}

        <ol className="mt-8 space-y-6">
          {keys.map((key, i) => {
            // Só os valores que combinam com os passos anteriores (quantidades em ordem crescente).
            const values = displayOrder(key, stepValues(key, keys, product.options, variations, selection));
            return (
              <li key={key} className="motion-safe:animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                <StepTitle n={i + 1} total={totalSteps} title={cleanOptionLabel(key)} />
                <OptionGroup
                  label={cleanOptionLabel(key)}
                  value={selection[key]}
                  onChange={(value) => choose(key, value)}
                  options={values.map((value) => ({ value }))}
                />
              </li>
            );
          })}

          {area && neonFrase && (
            <li id="passo-medida" className="scroll-mt-painel">
              <StepTitle n={sizeStep} total={totalSteps} title="Tamanho do letreiro" />
              <NeonSizeStep width={neonWidth} onWidth={setNeonWidth} heightCm={heightCm} aspect={neonAspect} lines={neonLines} limits={rules.limits ?? { minWidth: 0, maxWidth: 0, minHeight: 0, maxHeight: 0, minArea: 0, maxArea: 0 }} quote={area} pricePerM2={chosen.price} showErrors={attempted} />
            </li>
          )}

          {area && product.customSize && (
            <li id="passo-medida" className="scroll-mt-painel">
              <StepTitle n={sizeStep} total={totalSteps} title="Medida (largura × altura)" />
              <SizeInput value={size} onChange={setSize} limits={rules.limits ?? product.customSize} rules={rules} quantity={quantity} presets={presets} quote={area} pricePerM2={chosen.price} showErrors={attempted} />
            </li>
          )}

          {apparel && (
            <li id="passo-tamanhos" className="scroll-mt-painel">
              <StepTitle n={gridStep} total={totalSteps} title="Tamanhos e quantidades" />
              <SizeBreakdown
                sizes={sizes}
                counts={counts}
                onChange={setCounts}
                sizeChart={product.sizeChart ?? null}
                minQty={product.minQty ?? 1}
                maxQty={product.maxQty ?? 0}
                total={units}
                error={gridError}
                showError={attempted}
              />
            </li>
          )}

          {finishes.length > 0 && (
            <AcabamentosStep step={finishStep} total={totalSteps} disponiveis={finishes} escolhidos={chosenFinishes} onChange={setFinishing} unidades={pieces} />
          )}

          {canOrient && !semArte && (
            <li>
              <p className="mb-2.5 text-[15px] font-bold">
                Orientação da arte <span className="text-caption font-normal text-muted">· na horizontal ou na vertical, como preferir</span>
              </p>
              <OptionGroup
                label="Orientação da arte"
                value={orientation ?? naturalOrientation}
                onChange={(value) => setOrientation(value === "vertical" ? "vertical" : "horizontal")}
                options={[
                  { value: "horizontal", label: "Horizontal" },
                  { value: "vertical", label: "Vertical" },
                ]}
              />
            </li>
          )}

          {/* Variação sem personalização (produto liso, neon pronto): sem configuração de arte. */}
          {!semArte && (
            <ArtStep
              step={artStep}
              family={family}
              spec={spec}
              surfaces={surfaces}
              processo={processo}
              contorno={contorno}
              automaticFiles={automaticFiles}
              onSide={setArtSide}
              extraTypes={producao}
              extraFiles={extraFiles}
              onExtraFile={(tipo, file) =>
                setExtraFiles((files) => {
                  const rest = { ...files };
                  delete rest[tipo];
                  return file ? { ...rest, [tipo]: file } : rest;
                })
              }
              art={art}
              onArt={updateArt}
              artName={artName}
              onFile={onFile}
              uploadError={uploadError}
              uploading={uploading}
              uploadOnly={product.neon === "logo"}
              {...(allowArtLater
                ? {
                    artLater,
                    onArtLater: (value: boolean) => {
                      setArtLater(value);
                      if (value) setArtMissing(false);
                    },
                  }
                : {})}
              missing={artMissing}
              termos={{
                aceito: termosAceitos,
                onAceito: (value) => {
                  setTermosAceitos(value);
                  if (value) setTermosFaltando(false);
                },
                faltando: termosFaltando,
              }}
              kind={spec.kind}
              aspect={artAspect(spec)}
              ledColors={spec.ledColors}
              label={product.name}
              sizes={product.sizes ?? null}
              sizeChart={product.sizeChart ?? null}
              gabarito={gabarito}
              slug={product.slug}
            />
          )}
        </ol>

        {expressAvailable && (
          <div className="mt-8">
            <DeliverySpeed
              value={expressChosen ? "expresso" : "economico"}
              onChange={setSpeed}
              economic={{ price: speedPrice(price.price), days: price.leadDays }}
              express={{ price: speedPrice(price.expressPrice ?? price.price), days: price.expressDays ?? price.leadDays }}
              unit={display.unit}
            />
          </div>
        )}

        <div className="mt-8 rounded-card bg-mist p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="tabular-nums">
              <p className="text-caption text-muted">Total · {totalLabel}</p>
              <p className="text-2xl font-black">{formatBRL(total)}</p>
            </div>
            {/* Em telas estreitas o botão desce para a linha de baixo e ocupa a largura toda. */}
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              {!apparel && !neonFrase && (
                <QtyStepper
                  value={quantity}
                  onChange={setQty}
                  min={minQty}
                  max={maxQty}
                  label={perUnit ? "Quantidade de unidades" : area ? "Quantidade de peças" : "Quantidade de pedidos"}
                />
              )}
              {show3d && (
                <Button variant="preview" size="md" className="grow px-5 sm:grow-0" onClick={openPreview} icon={<IconCube className="size-5" />}>
                  Pré-visualizar
                </Button>
              )}
            </div>
          </div>
          {perUnit && minQty > 1 && <p className="mt-2 text-caption text-muted">Pedido mínimo de {minQty.toLocaleString("pt-BR")} unidades.</p>}
          <Button variant="buy" size="lg" block className="mt-4" loading={adding} onClick={addToCart}>
            {adding ? "Adicionando…" : "Adicionar ao carrinho"}
          </Button>
        </div>

        <CepLookup leadDays={leadDays} groupId={product.groupId} variationId={price.variation?.id} quantity={apparel ? units : quantity} />
      </div>

      {preview && (
        <PreviewModal
          onClose={() => setPreview(false)}
          onAdd={addToCart}
          adding={adding}
          spec={spec}
          art={renderArt}
          name={product.name}
          fallbackImage={product.image}
          captureRef={captureRef}
          summary={[...keys.map((k) => [cleanOptionLabel(k), selection[k]] as [string, string]), ...previewExtras]}
          artDetails={semArte ? {} : artSummary(art, family, surfaceLabels)}
          total={formatBRL(total)}
        />
      )}
    </div>
  );
}

type CepResult =
  | { ok: true; place: string; opcoes: OpcaoFrete[] | null; semMedida: boolean }
  | { ok: false; error: string };

/**
 * "Calcular entrega": a cidade do CEP (ViaCEP) e as formas de entrega da API de frete da Padrão (/api/frete), com a
 * embalagem da variação escolhida e a quantidade. É uma estimativa: o frete do pedido é combinado no checkout.
 */
function CepLookup({ leadDays, groupId, variationId, quantity }: { leadDays: number | null; groupId?: number; variationId?: number; quantity: number }) {
  const [cep, setCep] = useState("");
  const [result, setResult] = useState<CepResult | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) {
      setResult({ ok: false, error: "Digite os 8 números do CEP." });
      return;
    }
    setLoading(true);
    try {
      const [place, freight] = await Promise.all([
        fetch(`https://viacep.com.br/ws/${digits}/json/`)
          .then((res) => res.json() as Promise<{ erro?: unknown; localidade?: string; uf?: string }>)
          .catch(() => null),
        groupId
          ? fetch("/api/frete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ cep: digits, groupId, variationId, quantity }),
            })
              .then(async (res) => ({ ok: res.ok, data: (await res.json().catch(() => ({}))) as { opcoes?: OpcaoFrete[]; semMedida?: boolean } }))
              .catch(() => null)
          : Promise.resolve(null),
      ]);
      if (!place || place.erro) {
        setResult({ ok: false, error: place ? "CEP não encontrado." : "Não foi possível consultar o CEP agora." });
        return;
      }
      setResult({ ok: true, place: `${place.localidade}/${place.uf}`, opcoes: freight?.ok ? (freight.data.opcoes ?? []) : null, semMedida: Boolean(freight?.data.semMedida) });
    } finally {
      setLoading(false);
    }
  };

  const production = leadLabel(leadDays) ?? "Produção conforme o produto";
  const message = result
    ? result.ok
      ? result.opcoes?.length
        ? `Entrega para ${result.place}. ${production}; o prazo de cada forma de entrega conta depois que o pedido fica pronto.`
        : result.semMedida
          ? `Entrega para ${result.place}. ${production}; o frete deste produto é combinado com o atendimento.`
          : result.opcoes
            ? `Nenhuma transportadora entrega este produto em ${result.place}. Fale com o atendimento.`
            : `Entrega para ${result.place}. ${production}; o frete é combinado na finalização do pedido.`
      : result.error
    : null;

  return (
    <div className="mt-6">
      <label htmlFor="cep" className="mb-2 block text-sm font-bold">
        Calcular entrega
      </label>
      <div className="flex gap-2">
        <div className="flex h-12 flex-1 items-center gap-2 rounded-control border border-line-strong bg-white px-3 focus-within:border-ink sm:max-w-[240px]">
          <IconTruck className="size-5 text-muted" />
          <input
            id="cep"
            inputMode="numeric"
            autoComplete="postal-code"
            value={cep}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, "").slice(0, 8);
              setCep(d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d);
            }}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
            placeholder="Digite seu CEP"
            className="w-full bg-transparent text-[15px] placeholder:text-muted focus-visible:outline-none"
          />
        </div>
        <Button variant="dark" size="sm" loading={loading} onClick={lookup} className="h-12">
          {loading ? "Consultando…" : "Calcular"}
        </Button>
      </div>
      {message && (
        <p role={result?.ok ? "status" : "alert"} className={cx("mt-2 text-sm", result?.ok ? "text-ink/80" : "font-semibold text-coral-700")}>
          {message}
        </p>
      )}
      {result?.ok && result.opcoes && result.opcoes.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-control border border-line bg-white sm:max-w-md">
          {result.opcoes.map((option) => (
            <li key={option.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block font-semibold">{nomeFrete(option)}</span>
                <span className="text-caption text-muted">{prazoFrete(option)}</span>
              </span>
              <span className="shrink-0 font-bold tabular-nums">{formatBRL(option.preco)}</span>
            </li>
          ))}
        </ul>
      )}
      <a href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noreferrer" className="mt-1 inline-block text-caption text-muted underline underline-offset-2">
        Não sei meu CEP
      </a>
    </div>
  );
}
