"use client";

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { IconClock, IconCube } from "@/components/icons";
import Mockup3D from "@/components/mockup/Mockup3D";
import type { CaptureFn } from "@/components/mockup/MockupViewer";
import { DEFAULT_ART, canvasFor, loadArtFont, loadImage, paintArt, releaseSource, retainSources, styleLabel, thumbnailOf, type ArtSettings } from "@/components/mockup/art";
import { IntakeError, intakeImage } from "@/components/mockup/image-intake";
import { keepArtFiles, uploadedFileOf } from "@/components/product/art-source";
import { artSummary } from "@/components/product/art-summary";
import { ArtStep } from "@/components/product/ArtStep";
import { autoFitArt, fitAreaFor, needsAreaRefit, restoreBackground } from "@/components/product/auto-fit";
import { Button } from "@/components/ui/Button";
import { OptionGroup } from "@/components/ui/OptionGroup";
import { Price } from "@/components/ui/Price";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TextField } from "@/components/ui/TextField";
import { cx } from "@/components/ui/cx";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import { useCustomerVariations } from "@/lib/customer";
import {
  DEFAULT_REALISM,
  EDIT_MAX_SIDE,
  MAX_PHOTOS,
  MIN_PHOTO_SIDE,
  defaultQuad,
  facadeCartOptions,
  facadeLabel,
  facadeQuote,
  facadeSize,
  formatArea,
  formatMeasureInput,
  formatPixels,
  measureError,
  parseMeasure,
  photoFileError,
  printSize,
  ratioLabel,
  type FacadeMaterial,
  type Quad,
  type Realism,
  type Unit,
} from "@/lib/facade";
import { formatBRL, leadLabel } from "@/lib/format";
import { sceneSpec } from "@/lib/mockup";
import { KIND_INFO, artAspect } from "@/lib/mockup-kinds";
import { chooseOption, optionKeys, quote, type Selection } from "@/lib/pricing";
import { createDemoPhoto, exportSimulation, loadImageElement, readImageFile, simulationThumbnail, type SceneArt, type SimulationInput } from "./canvas";
import { FacadeStage } from "./FacadeStage";
import { IconCorners, IconDownload, IconEye, IconLock, IconReset } from "./icons";
import { MaterialPanel } from "./MaterialPanel";
import { Notice, StepTitle } from "./parts";
import { PhotoDropzone, PhotoTray, type Photo } from "./PhotoPanel";
import { RealismPanel } from "./RealismPanel";

/** Placa da fachada antes de a medida ser informada (3,6 × 1,2 m, a medida padrão do mockup). */
const [DEFAULT_W, DEFAULT_H] = KIND_INFO.storefront.defaultSize;
/** Nome da peça nas prévias do editor e no 3D (semente dos ornamentos dos estilos). */
const LABEL = "Fachada";
const MAX_UPLOAD_MB = 25;
/** Arte de exemplo da fachada: fundo azul e letra branca, para a placa aparecer de longe no mockup. */
const FACADE_ART: ArtSettings = { ...DEFAULT_ART, background: "#0888c8", textColor: "#ffffff" };

type View = "3d" | "foto";

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Web to print das fachadas: a arte da placa é criada no editor (estilos, texto, fontes e cores) ou enviada
 * pronta, e aparece na hora no mockup 3D de uma fachada de loja ou, se o cliente quiser, em perspectiva na
 * foto da loja dele (quatro cantos). Medida, material por m² e carrinho. Tudo roda no navegador: fotos e
 * arte não saem do aparelho.
 */
export default function FacadeStudio({ materials }: { materials: FacadeMaterial[] }) {
  const { add } = useCart();
  // URLs blob das fotos criadas aqui: revogadas ao remover e ao sair da página.
  const ownedUrls = useRef<Set<string>>(new Set());
  const summaryRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<CaptureFn | null>(null);
  const previewRef = useRef<HTMLElement>(null);
  const [view, setView] = useState<View>("3d");
  // Celular e tablet em pé: a prévia 3D fica presa no topo enquanto o cliente edita a arte (a placa muda à vista).
  const compact = useMediaQuery("(max-width: 1023px) and (min-height: 600px)");
  // Placa de perto no 3D (> 0): cada clique num estilo pede de novo; 0 = a loja toda.
  const [focus, setFocus] = useState(0);
  const viewerRef = useRef<HTMLDivElement>(null);
  const focusTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (focusTimer.current) window.clearTimeout(focusTimer.current);
    },
    [],
  );

  // Fotos da loja e marcação de cada uma
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [quads, setQuads] = useState<Record<string, Quad>>({});
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [loadedPhoto, setLoadedPhoto] = useState<{ url: string; image: HTMLImageElement } | null>(null);

  // Medida da fachada
  const [unit, setUnit] = useState<Unit>("m");
  const [widthText, setWidthText] = useState("");
  const [heightText, setHeightText] = useState("");
  const [touched, setTouched] = useState({ width: false, height: false });

  // Arte (editor web to print ou arquivo do cliente)
  const [art, setArt] = useState<ArtSettings>(FACADE_ART);
  const [artName, setArtName] = useState<string | null>(null);
  // Arquivo sem prévia (AI, CDR, EPS): vai para a produção como foi enviado.
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [artMissing, setArtMissing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Simulação na foto
  const [realism, setRealism] = useState<Realism>(DEFAULT_REALISM);
  const [compare, setCompare] = useState(false);
  const [guides, setGuides] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Material e pedido
  const [materialSlug, setMaterialSlug] = useState(materials[0]?.slug ?? "");
  const [selections, setSelections] = useState<Record<string, Selection>>(() => Object.fromEntries(materials.map((m) => [m.slug, m.selection])));
  const [attempted, setAttempted] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const owned = ownedUrls.current;
    return () => {
      owned.forEach((url) => URL.revokeObjectURL(url));
      owned.clear();
    };
  }, []);

  // A imagem da arte fica registrada enquanto está em uso; a trocada é liberada.
  const owner = useId();
  useEffect(() => {
    retainSources(owner, [art.src]);
  }, [owner, art.src]);
  useEffect(() => () => retainSources(owner, []), [owner]);

  const active = photos.find((p) => p.id === activeId) ?? null;
  const activeUrl = active?.url ?? null;
  useEffect(() => {
    if (!activeUrl) return;
    let alive = true;
    loadImageElement(activeUrl)
      .then((image) => {
        if (alive) setLoadedPhoto({ url: activeUrl, image });
      })
      .catch(() => {
        if (alive) setPhotoError("Não conseguimos abrir essa foto. Envie outra em JPG, PNG ou WEBP.");
      });
    return () => {
      alive = false;
    };
  }, [activeUrl]);
  const photoImage = loadedPhoto && loadedPhoto.url === activeUrl ? loadedPhoto.image : null;

  // ---------------------------------------------------------------------------------- medida e 3D
  const size = facadeSize(widthText, heightText, unit);
  const widthError = measureError(widthText, unit);
  const heightError = measureError(heightText, unit);
  // O mockup acompanha a medida (placa em escala), sem refazer o modelo a cada tecla.
  const modelW = useDeferredValue(size?.w ?? DEFAULT_W);
  const modelH = useDeferredValue(size?.h ?? DEFAULT_H);
  const spec = useMemo(() => sceneSpec("storefront", modelW, modelH), [modelW, modelH]);
  const facadeAspect = (size?.w ?? DEFAULT_W) / (size?.h ?? DEFAULT_H);

  // Imagem no encaixe automático e a fachada mudou de proporção: refaz o encaixe na placa nova (estado
  // derivado, sem efeito; só quando a proporção muda).
  const fitArea = fitAreaFor(spec);
  const refitKey = fitArea.aspect.toFixed(4);
  const [fittedFor, setFittedFor] = useState(refitKey);
  if (fittedFor !== refitKey) {
    setFittedFor(refitKey);
    if (needsAreaRefit(art, fitArea)) setArt((a) => autoFitArt(a, fitArea, a.templateFit?.chosen));
  }

  // ---------------------------------------------------------------------------------- arte na foto
  // A simulação na foto usa a mesma arte do editor, pintada na proporção da fachada.
  const [painted, setPainted] = useState<{ canvas: HTMLCanvasElement; key: string } | null>(null);
  const paintKey = `${JSON.stringify(art)}|${facadeAspect.toFixed(4)}`;
  useEffect(() => {
    if (view !== "foto") return;
    let alive = true;
    (async () => {
      await loadArtFont({ ...art, kind: "storefront" }).catch(() => undefined);
      const image = art.src ? await loadImage(art.src).catch(() => null) : null;
      if (!alive) return;
      const canvas = canvasFor(facadeAspect, 1600);
      paintArt(canvas, "front", { ...art, kind: "storefront", ledColors: art.ledColors ?? undefined, aspect: facadeAspect }, image, LABEL);
      setPainted({ canvas, key: paintKey });
    })();
    return () => {
      alive = false;
    };
  }, [view, art, facadeAspect, paintKey]);

  // Calculada só a partir do estado: a cena da foto (e o desenho do palco) muda apenas quando algo visível muda.
  const scene = useMemo<SceneArt>(
    () => ({
      design: painted?.canvas ?? null,
      designKey: painted?.key ?? "exemplo",
      designW: painted?.canvas.width ?? 0,
      designH: painted?.canvas.height ?? 0,
      aspect: facadeAspect,
      fit: "cover",
      background: art.background,
      light: realism.light,
      brightness: realism.brightness,
      edges: realism.edges,
      title: "SUA ARTE AQUI",
      subtitle: size ? facadeLabel(size.w, size.h) : "Informe a medida da fachada",
    }),
    [painted, facadeAspect, art.background, realism, size],
  );

  // ---------------------------------------------------------------------------------- material e preço
  const material = materials.find((m) => m.slug === materialSlug) ?? materials[0];
  // Revendedor logado vê a tabela de revenda; conta comum segue no preço de balcão.
  const { variations } = useCustomerVariations(material, material.variations);
  const keys = optionKeys(material.options);
  const selection = selections[material.slug] ?? material.selection;
  const perM2 = quote(variations, selection, { price: material.price, qty: 1, leadDays: material.leadDays }, keys.length);
  const priced = size ? facadeQuote(perM2.price, size.w, size.h, material.customSize) : null;

  // Marcação guardada só depois que o cliente mexe; antes disso, a inicial segue a medida digitada.
  const quad = active ? (quads[active.id] ?? active.preset ?? defaultQuad(active.width / active.height, facadeAspect)) : null;

  const simulation = (): SimulationInput | null => (active && photoImage && quad ? { photo: photoImage, photoW: active.width, photoH: active.height, art: scene, quad, showDesign: true } : null);

  // ---------------------------------------------------------------------------------- fotos
  const addPhotos = async (files: File[]) => {
    if (files.length === 0) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setPhotoError(`Você já enviou ${MAX_PHOTOS} fotos. Remova uma para enviar outra.`);
      return;
    }
    setPhotoBusy(true);
    setPhotoError(null);
    const errors: string[] = [];
    const fresh: Photo[] = [];
    for (const file of files.slice(0, room)) {
      const problem = photoFileError(file);
      if (problem) {
        errors.push(problem);
        continue;
      }
      try {
        const image = await readImageFile(file, EDIT_MAX_SIDE, false);
        ownedUrls.current.add(image.url);
        fresh.push({ ...image, id: crypto.randomUUID(), name: file.name });
      } catch {
        errors.push(`Não conseguimos abrir “${file.name}”. Envie em JPG, PNG ou WEBP.`);
      }
    }
    if (files.length > room) errors.push(`O limite é de ${MAX_PHOTOS} fotos: ${files.length - room} ficaram de fora.`);
    if (fresh.length > 0) {
      // Sem marcação guardada: o retângulo inicial acompanha a medida até o cliente mexer nos cantos.
      setPhotos((current) => [...current, ...fresh]);
      setActiveId(fresh[0].id);
    }
    setPhotoError(errors.length > 0 ? errors.join(" ") : null);
    setPhotoBusy(false);
  };

  const loadDemo = async () => {
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const demo = await createDemoPhoto();
      const url = URL.createObjectURL(demo.blob);
      ownedUrls.current.add(url);
      const photo: Photo = { id: crypto.randomUUID(), name: "Fachada de exemplo", url, width: demo.width, height: demo.height, naturalWidth: demo.width, naturalHeight: demo.height, preset: demo.quad };
      setPhotos((current) => [...current, photo]);
      setActiveId(photo.id);
    } catch {
      setPhotoError("Não conseguimos montar a foto de exemplo neste navegador. Envie uma foto da sua loja.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = (id: string) => {
    const photo = photos.find((p) => p.id === id);
    if (!photo) return;
    URL.revokeObjectURL(photo.url);
    ownedUrls.current.delete(photo.url);
    const rest = photos.filter((p) => p.id !== id);
    setPhotos(rest);
    setQuads((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    if (activeId === id) setActiveId(rest[rest.length - 1]?.id ?? null);
    setPhotoError(null);
  };

  const setQuad = (next: Quad) => {
    if (active) setQuads((current) => ({ ...current, [active.id]: next }));
  };

  // Volta à marcação inicial (a da foto de exemplo ou o retângulo centrado na proporção da medida).
  const resetQuad = () => {
    if (!active) return;
    const id = active.id;
    setQuads((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  // ---------------------------------------------------------------------------------- arte
  // Clique num estilo: a placa de perto, com os refletores acendendo. No celular o 3D fica bem acima do
  // editor: a página sobe até ele primeiro, para a aproximação acontecer à vista.
  const showSign = () => {
    if (focusTimer.current) window.clearTimeout(focusTimer.current);
    const node = viewerRef.current;
    const rect = node?.getBoundingClientRect();
    const hidden = rect ? rect.bottom < 120 || rect.top > window.innerHeight - 120 : false;
    if (!node || !hidden || view !== "3d") {
      setFocus((n) => n + 1);
      return;
    }
    const instant = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ behavior: instant ? "auto" : "smooth", block: "center" });
    focusTimer.current = window.setTimeout(() => setFocus((n) => n + 1), instant ? 0 : 450);
  };

  const updateArt = (update: (a: ArtSettings) => ArtSettings) => {
    setArt(update);
    setArtMissing(false);
  };

  // Cada envio ganha um número: o resultado de um envio anterior que termina depois não sobrescreve o último.
  const uploadSeq = useRef(0);
  // `raw`: "Usar a imagem original" (sem corte de margem nem remoção de fundo).
  const onFile = async (file: File | undefined, { raw = false }: { raw?: boolean } = {}) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setUploadError(`O arquivo tem mais de ${MAX_UPLOAD_MB} MB. Envie uma versão menor.`);
      return;
    }
    const seq = ++uploadSeq.current;
    setUploadError(null);
    const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    // Sem prévia (AI, CDR, TIFF…): vai como arte final do pedido; o 3D segue com a arte do editor.
    const attach = (message: string | null) => {
      setArtName(file.name);
      setAttachedFile(file);
      setArt((a) => ({ ...a, src: null, templateFit: null }));
      setArtMissing(false);
      setUploadError(message);
    };
    setUploading(true);
    try {
      // PDF: a primeira página aparece na placa. Imagem: passa pelo tratador automático (orientação, SVG,
      // margem, prévia nítida) e é encaixada na placa da fachada.
      const src = pdf ? (await (await import("@/components/product/gabarito/pdf-artwork")).readPdfArtwork(file)).src : (await intakeImage(file, { removeWhite: false, treat: !raw })).src;
      if (seq !== uploadSeq.current) {
        releaseSource(src);
        return;
      }
      setArt((a) => autoFitArt({ ...restoreBackground(a), src, zoom: 1, offsetX: 0, offsetY: 0, layout: a.layout?.text ? { text: a.layout.text } : null, templateFit: null }, fitArea));
      setArtName(file.name);
      setAttachedFile(null);
      setArtMissing(false);
    } catch (error) {
      if (seq !== uploadSeq.current) return;
      if (error instanceof IntakeError && error.attach) attach(error.message);
      else if (pdf) attach(null);
      else setUploadError(error instanceof IntakeError ? error.message : "Não conseguimos ler essa imagem. Tente PNG, JPG, WEBP ou SVG.");
    } finally {
      if (seq === uploadSeq.current) setUploading(false);
    }
  };

  // ---------------------------------------------------------------------------------- medida
  const changeUnit = (next: string) => {
    if (next !== "m" && next !== "cm") return;
    if (next === unit) return;
    // Converte o que já foi digitado: 3,5 m vira 350 cm.
    const convert = (text: string) => {
      const cm = parseMeasure(text, unit);
      return cm === null ? text : formatMeasureInput(cm, next);
    };
    setWidthText(convert(widthText));
    setHeightText(convert(heightText));
    setUnit(next);
  };

  // ---------------------------------------------------------------------------------- pedido
  const typedArt = art.text.trim().length > 0 || art.subtext.trim().length > 0;
  const hasArt = Boolean(artName) || typedArt;
  const problems: string[] = [];
  if (!size) problems.push("Informe a largura e a altura da fachada (passo 1).");
  else if (priced?.error) problems.push(`${material.label}: ${priced.error.replace(/\.$/, "")}. Escolha outro material ou fale com a equipe para dividir a fachada em partes.`);
  if (!hasArt) problems.push("Escreva o texto da fachada no editor, ou envie a sua arte (passo 2).");

  const addToCart = async () => {
    setAttempted(true);
    if (!hasArt) setArtMissing(true);
    if (problems.length > 0 || !size || !priced) {
      // No celular o meio da tela fica embaixo da prévia presa no topo: o resumo vai para o pé da tela.
      summaryRef.current?.scrollIntoView({ behavior: "smooth", block: compact ? "end" : "center" });
      return;
    }
    setAdding(true);
    await nextFrame();
    let preview: string | null = null;
    try {
      const shot = view === "3d" ? captureRef.current?.() : null;
      preview = shot ? await thumbnailOf(shot, 360) : simulationThumbnail(simulation(), scene);
    } catch {
      preview = null;
    }
    // O arquivo que o cliente enviou fica no navegador até o checkout mandar para o Bunny.
    const artFiles = await keepArtFiles([{ file: art.src ? uploadedFileOf(art.src) : artName ? attachedFile : null, kind: "arquivo" }], material.name);
    add({
      slug: material.slug,
      name: `Fachada · ${material.name}`,
      artFiles: artFiles.length ? artFiles : null,
      image: material.image,
      preview,
      options: {
        ...facadeCartOptions({
          widthCm: size.w,
          heightCm: size.h,
          material: material.label,
          selection,
          billedArea: priced.billedArea,
          rotated: priced.rotated,
        }),
        ...artSummary(art, "sign"),
      },
      unitPrice: priced.price,
      setQty: 1,
      quantity: 1,
      leadDays: perM2.leadDays,
      // O carrinho mostra "Arte: …" (o botão só chega aqui com arte: arquivo ou texto).
      artName: artName ?? (typedArt ? `texto no editor · estilo ${styleLabel(art.style).toLowerCase()}` : null),
      groupId: material.groupId,
      variationId: perM2.variation?.id,
      // Peça girada vai no sentido do material; a medida real da fachada fica nas opções.
      ...printSize(size.w, size.h, priced.rotated),
    });
    setAdding(false);
  };

  const download = async () => {
    const input = simulation();
    if (!input || !active) return;
    setExporting(true);
    setExportError(null);
    await nextFrame();
    try {
      const blob = await exportSimulation(input);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `simulacao-fachada-${active.name.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-").slice(0, 40) || "loja"}.png`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      setExportError("Não foi possível gerar a imagem agora. Tente de novo.");
    } finally {
      setExporting(false);
    }
  };

  // Trocar 3D e foto: a prévia da foto não fica presa no topo; se ela ficou acima da tela, a página volta até ela.
  const changeView = (next: View) => {
    setView(next);
    requestAnimationFrame(() => {
      const node = previewRef.current;
      if (node && node.getBoundingClientRect().top < 0) node.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
  };

  const smallPhoto = active && Math.max(active.naturalWidth, active.naturalHeight) < MIN_PHOTO_SIDE;
  const showWidthError = (touched.width || attempted) && Boolean(widthText.trim() || attempted);
  const showHeightError = (touched.height || attempted) && Boolean(heightText.trim() || attempted);
  const lead = leadLabel(perM2.leadDays);

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] xl:gap-14">
      <section
        ref={previewRef}
        aria-labelledby="fachada-visualizacao"
        className={cx(
          "min-w-0 scroll-mt-painel",
          // O 3D acompanha a edição: preso ao lado no computador e no topo no celular. A foto (cantos, fotos e ajustes) rola com a página.
          view === "3d" && "lg:sticky lg:top-painel lg:self-start",
          view === "3d" && compact && "sticky top-topo z-20 -mx-5 border-b border-line bg-white px-5 pb-3 pt-3 md:-mx-10 md:px-10",
        )}
      >
        <h3 id="fachada-visualizacao" className="sr-only">
          Visualização da fachada
        </h3>
        <div className="mb-3 flex items-center justify-between gap-2">
          <SegmentedControl
            label="Como ver a fachada"
            value={view}
            onChange={changeView}
            options={[
              {
                value: "3d",
                label: (
                  <>
                    <IconCube className="size-4" />
                    <span className="sm:hidden">3D</span>
                    <span className="hidden sm:inline">Mockup 3D</span>
                  </>
                ),
              },
              {
                value: "foto",
                label: (
                  <>
                    <span className="sm:hidden">Na sua foto</span>
                    <span className="hidden sm:inline">Na foto da sua loja</span>
                  </>
                ),
              },
            ]}
          />
          {view === "3d" && (
            <button
              type="button"
              aria-pressed={focus > 0}
              onClick={() => setFocus((n) => (n > 0 ? 0 : 1))}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-white px-4 text-sm font-semibold transition-colors duration-200 hover:border-ink"
            >
              <IconEye className="size-4" />
              <span className="sm:hidden">{focus > 0 ? "Loja toda" : "Placa de perto"}</span>
              <span className="hidden sm:inline">{focus > 0 ? "Ver a loja toda" : "Ver a placa de perto"}</span>
            </button>
          )}
        </div>

        {view === "3d" ? (
          <>
            <div ref={viewerRef} className="scroll-mt-painel">
              <Mockup3D
                spec={spec}
                art={art}
                label={LABEL}
                captureRef={captureRef}
                focus={focus}
                // No computador a prévia presa cabe na tela abaixo do topo (--spacing-painel), com os botões de cima (52 px),
                // a legenda (52 px) e 16 px de folga; no celular, um terço dela.
                className={cx("w-full lg:aspect-auto lg:h-[clamp(20rem,calc(100dvh-var(--spacing-painel)-7.5rem),40rem)]", compact ? "h-[34svh]" : "aspect-[4/3]")}
              />
            </div>
            <p className={cx("mt-3 text-caption text-muted", compact && "hidden")}>
              {focus > 0 ? "A placa de frente, com os refletores acesos. " : "Clique num estilo do passo 2 para ver a placa de frente, com os refletores acesos. "}
              A placa sai na medida {size ? <strong className="font-semibold text-ink">{facadeLabel(size.w, size.h)}</strong> : "padrão de 3,6 × 1,2 m até você informar a sua"}.
            </p>
          </>
        ) : (
          <>
            <p className="mb-3 flex flex-wrap items-baseline gap-x-2 text-[15px] font-bold">
              Foto da loja
              <span className="w-full text-caption font-normal text-muted sm:w-auto">
                <span aria-hidden className="hidden sm:inline">· </span>
                {active ? "arraste os 4 cantos até as bordas da fachada" : "foto de frente, com a fachada inteira"}
              </span>
            </p>
            {active && quad ? (
              <>
                <FacadeStage key={active.id} photo={active} image={photoImage} art={scene} quad={quad} onQuad={setQuad} showDesign={!compare} guides={guides} />
                {smallPhoto && (
                  <Notice tone="warn" className="mt-3">
                    Foto pequena ({formatPixels(active.naturalWidth, active.naturalHeight)}): a simulação pode ficar borrada. Se puder, envie uma de pelo menos {MIN_PHOTO_SIDE} px.
                  </Notice>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" icon={<IconReset className="size-4" />} onClick={resetQuad}>
                    Recomeçar marcação
                  </Button>
                  <Button variant="outline" size="sm" aria-pressed={compare} icon={<IconEye className="size-4" />} onClick={() => setCompare((value) => !value)}>
                    Ver foto original
                  </Button>
                  <Button variant="outline" size="sm" aria-pressed={guides} icon={<IconCorners className="size-4" />} onClick={() => setGuides((value) => !value)}>
                    Mostrar cantos
                  </Button>
                  <Button variant="dark" size="sm" loading={exporting} disabled={!photoImage} icon={<IconDownload className="size-4" />} onClick={download}>
                    {exporting ? "Gerando PNG…" : "Baixar simulação"}
                  </Button>
                </div>
                {exportError && (
                  <Notice tone="error" role="alert" className="mt-3">
                    {exportError}
                  </Notice>
                )}
                <PhotoTray photos={photos} activeId={active.id} onSelect={setActiveId} onRemove={removePhoto} onFiles={addPhotos} busy={photoBusy} />
                <RealismPanel realism={realism} onChange={setRealism} />
              </>
            ) : (
              <PhotoDropzone onFiles={addPhotos} onDemo={loadDemo} busy={photoBusy} />
            )}
            {photoError && (
              <Notice tone="error" role="alert" className="mt-3">
                {photoError}
              </Notice>
            )}
          </>
        )}
      </section>

      <div className="min-w-0">
        <ol className="grid gap-10">
          <li>
            <StepTitle n={1} hint="da placa que vai na fachada">
              Medida da fachada
            </StepTitle>
            <div className="grid gap-3">
              <OptionGroup
                label="Unidade da medida"
                value={unit}
                onChange={changeUnit}
                options={[
                  { value: "m", label: "Metros" },
                  { value: "cm", label: "Centímetros" },
                ]}
              />
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label={`Largura (${unit})`}
                  value={widthText}
                  onChange={setWidthText}
                  onBlur={() => setTouched((t) => ({ ...t, width: true }))}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={unit === "m" ? "Ex.: 4" : "Ex.: 400"}
                  error={showWidthError ? widthError : null}
                />
                <TextField
                  label={`Altura (${unit})`}
                  value={heightText}
                  onChange={setHeightText}
                  onBlur={() => setTouched((t) => ({ ...t, height: true }))}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={unit === "m" ? "Ex.: 1,2" : "Ex.: 120"}
                  error={showHeightError ? heightError : null}
                />
              </div>
              {size ? (
                <p className="text-sm text-ink/80">
                  Fachada de <strong>{facadeLabel(size.w, size.h)}</strong> · {formatArea((size.w * size.h) / 10_000)} · proporção {ratioLabel(size.w / size.h)}
                </p>
              ) : (
                <p className="text-caption text-muted">Meça a faixa do letreiro, a platibanda ou o vidro que vai receber a fachada. O preço é por m² do material.</p>
              )}
            </div>
          </li>

          <ArtStep
            heading={
              <StepTitle n={2} hint="aparece na placa do 3D">
                Arte da fachada
              </StepTitle>
            }
            family="sign"
            art={art}
            onArt={updateArt}
            artName={artName}
            onFile={onFile}
            uploadError={uploadError}
            uploading={uploading}
            missing={artMissing}
            kind="storefront"
            aspect={artAspect(spec)}
            label={LABEL}
            spec={spec}
            onStylePick={showSign}
          />

          <li>
            <StepTitle n={3} hint="vendido por m²">
              Material
            </StepTitle>
            <MaterialPanel
              materials={materials}
              material={material}
              onMaterial={setMaterialSlug}
              variations={variations}
              selection={selection}
              // A troca ajusta as outras opções para uma combinação que existe (como na página do produto).
              onOption={(key, value) => setSelections((current) => ({ ...current, [material.slug]: chooseOption(optionKeys(material.options), variations, current[material.slug] ?? material.selection, key, value) }))}
              size={size}
            />
          </li>
        </ol>

        <div ref={summaryRef} className="mt-10 scroll-mt-painel rounded-card bg-mist p-5">
          {size && priced && !priced.error ? (
            <>
              <p className="text-caption text-muted">
                Fachada de {facadeLabel(size.w, size.h)} · {material.label}
              </p>
              <Price className="mt-1" size="pdp" value={priced.price} unit="pela fachada" live />
              <dl className="mt-4 grid gap-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Preço por m²</dt>
                  <dd className="font-semibold tabular-nums">{formatBRL(perM2.price)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Área cobrada</dt>
                  <dd className="text-right font-semibold tabular-nums">
                    {formatArea(priced.billedArea)}
                    {priced.billedArea > priced.area && <span className="block text-caption font-normal text-muted">mínimo do material</span>}
                  </dd>
                </div>
                {priced.rotated && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Produção</dt>
                    <dd className="text-right">Impressa girada para caber no material</dd>
                  </div>
                )}
              </dl>
              {lead && (
                <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-ink/80">
                  <IconClock className="size-4 text-coral-700" /> {lead}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-ink/80">
              {size && priced?.error ? (
                <>
                  <strong>{material.label}</strong>: {priced.error} Escolha outro material para esta medida.
                </>
              ) : (
                <>
                  Informe a medida para ver o preço. <strong>{material.label}</strong> sai por {formatBRL(perM2.price)} o m².
                </>
              )}
            </p>
          )}

          <div role="alert">
            {attempted && problems.length > 0 && (
              <ul className="mt-4 grid gap-1.5 rounded-control bg-coral-50 px-4 py-3 text-sm font-semibold text-coral-700">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}
          </div>

          <Button variant="buy" size="lg" block className="mt-4" loading={adding} onClick={addToCart}>
            {adding ? "Adicionando…" : "Adicionar ao carrinho"}
          </Button>
          <p className="mt-3 flex items-start gap-2 text-caption text-muted">
            <IconLock className="mt-0.5 size-4 shrink-0" />
            A foto da loja fica só no seu navegador. O arquivo da arte vai junto do pedido, quando você finaliza a compra, e a equipe confere antes de imprimir.
          </p>
        </div>
      </div>
    </div>
  );
}
