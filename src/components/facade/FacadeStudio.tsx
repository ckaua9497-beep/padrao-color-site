"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { IconClock } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { OptionGroup } from "@/components/ui/OptionGroup";
import { Price } from "@/components/ui/Price";
import { TextField } from "@/components/ui/TextField";
import { useCustomerVariations } from "@/lib/customer";
import {
  DEFAULT_REALISM,
  DPI_MIN,
  EDIT_MAX_SIDE,
  MAX_PHOTOS,
  MIN_PHOTO_SIDE,
  aspectCheck,
  classifyDesign,
  defaultQuad,
  designFileError,
  effectiveDpi,
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
  resolutionLevel,
  type FacadeMaterial,
  type FitMode,
  type Quad,
  type Realism,
  type Unit,
} from "@/lib/facade";
import { formatBRL, leadLabel } from "@/lib/format";
import { optionKeys, quote, type Selection } from "@/lib/pricing";
import { createDemoPhoto, exportSimulation, loadImageElement, readImageFile, simulationThumbnail, type SceneArt, type SimulationInput } from "./canvas";
import { DesignPanel, type Design } from "./DesignPanel";
import { FacadeStage } from "./FacadeStage";
import { IconCorners, IconDownload, IconEye, IconLock, IconReset } from "./icons";
import { MaterialPanel } from "./MaterialPanel";
import { Notice, StepTitle } from "./parts";
import { PhotoDropzone, PhotoTray, type Photo } from "./PhotoPanel";
import { RealismPanel } from "./RealismPanel";

/** Proporção usada antes de a medida ser informada e sem design: fachada típica 3:1. */
const FALLBACK_ASPECT = 3;

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Web to print das fachadas: fotos da loja, marcação dos quatro cantos, design em perspectiva,
 * medida, material por m² e carrinho. Tudo roda no navegador: fotos e design não saem do aparelho.
 */
export default function FacadeStudio({ materials }: { materials: FacadeMaterial[] }) {
  const { add } = useCart();
  // URLs blob criadas aqui: revogadas ao remover e ao sair da página.
  const ownedUrls = useRef<Set<string>>(new Set());
  const summaryRef = useRef<HTMLDivElement>(null);

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

  // Design
  const [design, setDesign] = useState<Design | null>(null);
  const [loadedDesign, setLoadedDesign] = useState<{ url: string; image: HTMLImageElement } | null>(null);
  const [productionFile, setProductionFile] = useState<string | null>(null);
  const [designError, setDesignError] = useState<string | null>(null);
  const [designBusy, setDesignBusy] = useState(false);
  const [artLater, setArtLater] = useState(false);
  const [fit, setFit] = useState<FitMode>("cover");
  const [background, setBackground] = useState("#ffffff");

  // Simulação
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

  const designUrl = design?.url ?? null;
  useEffect(() => {
    if (!designUrl) return;
    let alive = true;
    loadImageElement(designUrl)
      .then((image) => {
        if (alive) setLoadedDesign({ url: designUrl, image });
      })
      .catch(() => {
        if (alive) setDesignError("Não conseguimos abrir esse design. Exporte de novo em PNG ou JPG.");
      });
    return () => {
      alive = false;
    };
  }, [designUrl]);
  const designImage = loadedDesign && loadedDesign.url === designUrl ? loadedDesign.image : null;

  // ---------------------------------------------------------------------------------- cena
  // Calculada só a partir do estado: a cena (e o desenho do palco) muda apenas quando algo visível muda.
  const art = useMemo<SceneArt>(() => {
    const facade = facadeSize(widthText, heightText, unit);
    const ready = designImage !== null && design !== null;
    return {
      design: designImage,
      designKey: ready ? design.id : "exemplo",
      designW: ready ? design.width : 0,
      designH: ready ? design.height : 0,
      aspect: facade ? facade.w / facade.h : design ? design.naturalWidth / design.naturalHeight : FALLBACK_ASPECT,
      fit,
      background,
      light: realism.light,
      brightness: realism.brightness,
      edges: realism.edges,
      title: "SUA ARTE AQUI",
      subtitle: facade ? facadeLabel(facade.w, facade.h) : "Informe a medida da fachada",
    };
  }, [designImage, design, widthText, heightText, unit, fit, background, realism]);

  // ---------------------------------------------------------------------------------- medida
  const widthError = measureError(widthText, unit);
  const heightError = measureError(heightText, unit);
  const size = facadeSize(widthText, heightText, unit);
  const facadeAspect = art.aspect;

  // ---------------------------------------------------------------------------------- material e preço
  const material = materials.find((m) => m.slug === materialSlug) ?? materials[0];
  // Revendedor logado vê a tabela de revenda; conta comum segue no preço de balcão.
  const { variations } = useCustomerVariations(material, material.variations);
  const keys = optionKeys(material.options);
  const selection = selections[material.slug] ?? material.selection;
  const perM2 = quote(variations, selection, { price: material.price, qty: 1, leadDays: material.leadDays }, keys.length);
  const priced = size ? facadeQuote(perM2.price, size.w, size.h, material.customSize) : null;

  // ---------------------------------------------------------------------------------- resolução e proporção
  const dpi = design && size ? effectiveDpi(design.naturalWidth, design.naturalHeight, size.w / 100, size.h / 100, fit) : null;
  const level = dpi !== null ? resolutionLevel(dpi) : null;
  const aspect = design && size ? aspectCheck(design.naturalWidth, design.naturalHeight, size.w, size.h) : null;

  // Marcação guardada só depois que o cliente mexe; antes disso, a inicial segue a medida digitada.
  const quad = active ? (quads[active.id] ?? active.preset ?? defaultQuad(active.width / active.height, facadeAspect)) : null;

  const simulation = (): SimulationInput | null => (active && photoImage && quad ? { photo: photoImage, photoW: active.width, photoH: active.height, art, quad, showDesign: true } : null);

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

  // ---------------------------------------------------------------------------------- design
  const onDesignFile = async (file: File | undefined) => {
    if (!file) return;
    setDesignError(null);
    const problem = designFileError(file);
    if (problem) {
      setDesignError(problem);
      return;
    }
    if (classifyDesign(file.name, file.type) === "production") {
      setProductionFile(file.name);
      setArtLater(true);
      return;
    }
    setDesignBusy(true);
    try {
      const image = await readImageFile(file, EDIT_MAX_SIDE, file.type !== "image/jpeg");
      ownedUrls.current.add(image.url);
      if (design) {
        URL.revokeObjectURL(design.url);
        ownedUrls.current.delete(design.url);
      }
      setDesign({ ...image, id: crypto.randomUUID(), name: file.name, type: file.type, bytes: file.size });
    } catch {
      setDesignError(`Não conseguimos abrir “${file.name}”. Exporte de novo em PNG ou JPG.`);
    } finally {
      setDesignBusy(false);
    }
  };

  const removeDesign = () => {
    if (!design) return;
    URL.revokeObjectURL(design.url);
    ownedUrls.current.delete(design.url);
    setDesign(null);
    setDesignError(null);
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
  const problems: string[] = [];
  if (!size) problems.push("Informe a largura e a altura da fachada (passo 2).");
  else if (priced?.error) problems.push(`${material.label}: ${priced.error.replace(/\.$/, "")}. Escolha outro material ou fale com a equipe para dividir a fachada em partes.`);
  if (!artLater) {
    if (!design) {
      problems.push(
        productionFile
          ? `“${productionFile}” não abre no simulador: marque “Vou enviar a arte final depois” (passo 3).`
          : "Envie o design da fachada ou marque “Vou enviar a arte final depois” (passo 3).",
      );
    } else if (level === "baixa" && dpi !== null) {
      problems.push(`O design fica com ${Math.round(dpi)} DPI na medida da fachada (mínimo ${DPI_MIN}). Envie um arquivo maior ou marque “Vou enviar a arte final depois”.`);
    }
  }

  const addToCart = async () => {
    setAttempted(true);
    if (problems.length > 0 || !size || !priced) {
      summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setAdding(true);
    await nextFrame();
    let preview: string | null = null;
    try {
      preview = simulationThumbnail(simulation(), art);
    } catch {
      preview = null;
    }
    add({
      slug: material.slug,
      name: `Fachada · ${material.name}`,
      image: material.image,
      preview,
      options: facadeCartOptions({
        widthCm: size.w,
        heightCm: size.h,
        material: material.label,
        selection,
        billedArea: priced.billedArea,
        rotated: priced.rotated,
        design: design ? { name: design.name, dpi, fit, background, matches: aspect?.matches ?? true } : null,
        productionFile,
        artLater,
      }),
      unitPrice: priced.price,
      setQty: 1,
      quantity: 1,
      leadDays: perM2.leadDays,
      artName: artLater ? null : (design?.name ?? null),
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

  const smallPhoto = active && Math.max(active.naturalWidth, active.naturalHeight) < MIN_PHOTO_SIDE;
  const showWidthError = (touched.width || attempted) && Boolean(widthText.trim() || attempted);
  const showHeightError = (touched.height || attempted) && Boolean(heightText.trim() || attempted);
  const lead = leadLabel(perM2.leadDays);

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] xl:gap-14">
      <section aria-labelledby="fachada-passo-1" className="min-w-0 lg:sticky lg:top-28 lg:self-start">
        <StepTitle n={1} id="fachada-passo-1" hint={active ? "arraste os 4 cantos até as bordas da fachada" : "foto de frente, com a fachada inteira"}>
          Foto da loja
        </StepTitle>

        {active && quad ? (
          <>
            <FacadeStage key={active.id} photo={active} image={photoImage} art={art} quad={quad} onQuad={setQuad} showDesign={!compare} guides={guides} />
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
      </section>

      <div className="min-w-0">
        <ol className="grid gap-10">
          <li>
            <StepTitle n={2} hint="da área que recebe a fachada">
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

          <li>
            <StepTitle n={3} hint="PNG, JPG ou WEBP para simular">
              Design da fachada
            </StepTitle>
            <DesignPanel
              design={design}
              productionFile={productionFile}
              busy={designBusy}
              error={designError}
              onFile={onDesignFile}
              onRemove={removeDesign}
              onRemoveProduction={() => setProductionFile(null)}
              size={size}
              dpi={dpi}
              level={level}
              aspect={aspect}
              fit={fit}
              onFit={setFit}
              background={background}
              onBackground={setBackground}
              artLater={artLater}
              onArtLater={setArtLater}
            />
          </li>

          <li>
            <StepTitle n={4} hint="vendido por m²">
              Material
            </StepTitle>
            <MaterialPanel
              materials={materials}
              material={material}
              onMaterial={setMaterialSlug}
              variations={variations}
              selection={selection}
              onOption={(key, value) => setSelections((current) => ({ ...current, [material.slug]: { ...(current[material.slug] ?? material.selection), [key]: value } }))}
              size={size}
            />
          </li>
        </ol>

        <div ref={summaryRef} className="mt-10 scroll-mt-32 rounded-card bg-mist p-5">
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
            Fotos e design ficam só no seu navegador: nada é enviado agora. O arquivo final vai depois do pedido, pelo WhatsApp ou pelo reenvio de arte, e a equipe confere antes de
            imprimir.
          </p>
        </div>
      </div>
    </div>
  );
}
