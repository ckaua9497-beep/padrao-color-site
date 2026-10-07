"use client";

import Image from "next/image";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import Mockup3D from "@/components/mockup/Mockup3D";
import { MockupSkeleton } from "@/components/mockup/MockupSkeleton";
import type { CaptureFn } from "@/components/mockup/MockupViewer";
import { DEFAULT_ART, artFamily, fileToDataUrl, styleLabel, thumbnailOf, type ArtSettings } from "@/components/mockup/art";
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
import { useCustomerVariations } from "@/lib/customer";
import { formatBRL, imageUrl, leadLabel, quantityLabel } from "@/lib/format";
import { formatSize, mockupSpec } from "@/lib/mockup";
import { artAspect } from "@/lib/mockup-kinds";
import {
  areaQuote,
  availableValues,
  cleanOptionLabel,
  defaultSize,
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
  usesArea,
  type Selection,
  type SizeCounts,
  type Speed,
} from "@/lib/pricing";
import { ArtStep } from "./ArtStep";
import DeliverySpeed from "./DeliverySpeed";
import PreviewModal from "./PreviewModal";
import SizeBreakdown from "./SizeBreakdown";
import SizeInput, { type SizeText } from "./SizeInput";
import TemplateDownload from "./TemplateDownload";

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
  template?: string | null;
  summary?: string;
  info?: InfoBlock[];
  attachments?: string[];
  artCreationPrice?: number | null;
  /** Quantidade mínima e máxima de peças (qtde_minima/qtde_maxima da API). */
  minQty?: number;
  maxQty?: number;
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

export default function ProductExperience({ product }: { product: ClientProduct }) {
  const keys = useMemo(() => optionKeys(product.options), [product.options]);
  const [selection, setSelection] = useState<Selection>(() => initialSelection(product));
  const [size, setSize] = useState<SizeText>(() => initialSize(product));
  // Lado da arte em edição (camisa, almofada, cama pet): o mockup 3D vira para ele.
  const [artSide, setArtSide] = useState<"front" | "back">("front");
  const [counts, setCounts] = useState<SizeCounts>(() => initialCounts(product));
  const [speed, setSpeed] = useState<Speed>("economico");
  // Depois de uma tentativa de compra, medida e grade mostram todos os erros (inclusive campo vazio).
  const [attempted, setAttempted] = useState(false);
  const [art, setArt] = useState<ArtSettings>(DEFAULT_ART);
  const [artName, setArtName] = useState<string | null>(null);
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

  // Medida livre: preço por m² × área cobrada (a API não calcula m²; o valor vai no precoTotal do pedido).
  const areaMode = usesArea(product.options, selection, product.customSize);
  const widthCm = parseMeasure(size.width);
  const heightCm = parseMeasure(size.height);
  const area = areaMode && product.customSize ? areaQuote(chosen.price, widthCm, heightCm, product.customSize) : null;

  // O 3D acompanha a medida (banner e papel de parede em escala), sem refazer o modelo a cada tecla.
  const modelWidth = useDeferredValue(widthCm);
  const modelHeight = useDeferredValue(heightCm);
  const baseSpec = useMemo(() => mockupSpec(product, selection), [product, selection]);
  const spec = useMemo(() => {
    if (!areaMode || !modelWidth || !modelHeight) return baseSpec;
    const w = Math.min(modelWidth, MAX_MODEL_CM);
    const h = Math.min(modelHeight, MAX_MODEL_CM);
    return { ...baseSpec, widthCm: w, heightCm: h, label: formatSize(w, h) };
  }, [baseSpec, areaMode, modelWidth, modelHeight]);
  const family = artFamily(spec.kind);
  const presets = areaMode ? sizePresets(baseSpec.kind, baseSpec.variant, product.customSize) : [];

  // Vestuário com grade: quantidade por tamanho; o total respeita o mínimo/máximo do produto.
  const sizes = product.sizes ?? [];
  const apparel = sizes.length > 0;
  const units = apparel ? sizeTotal(counts) : 0;
  const gridError = apparel ? sizeError(units, product.minQty ?? 1, product.maxQty ?? 0) : null;

  // Quantidade fora da grade: unidades (preço por unidade, com o mínimo da API) ou pacotes ("por 1.000 un.").
  const perUnit = !areaMode && price.qty <= 1;
  const minQty = perUnit ? Math.max(1, product.minQty ?? 1) : 1;
  const maxQty = perUnit ? Math.max(minQty, Math.min(product.maxQty || 999, 999)) : 99;
  const quantity = Math.min(maxQty, Math.max(minQty, qty));

  // Preço de uma peça (m²) ou de um conjunto da tabela; o total multiplica pela quantidade ou pelas peças da grade.
  const unitPrice = area ? area.price : chosen.price;
  const total = roundMoney(unitPrice * (apparel ? units : quantity));
  const display =
    area && !area.error
      ? { value: area.price, unit: "por peça" }
      : area
        ? { value: chosen.price, unit: "por m²" }
        : { value: chosen.price, unit: apparel ? "por peça" : quantityLabel(price.qty) };
  // Preço de cada ritmo na mesma unidade do preço exibido (peça na medida escolhida, m², peça ou conjunto).
  const speedPrice = (value: number) => (area && !area.error ? areaQuote(value, widthCm, heightCm, product.customSize).price : value);
  const totalLabel = apparel
    ? `${units.toLocaleString("pt-BR")} ${units === 1 ? "peça" : "peças"}`
    : area
      ? `${quantity > 1 ? `${quantity} × ` : ""}peça de ${fmtCm(widthCm)} × ${fmtCm(heightCm)} cm`
      : perUnit
        ? `${quantity.toLocaleString("pt-BR")} ${quantity === 1 ? "unidade" : "unidades"}`
        : `${quantity > 1 ? `${quantity} × ` : ""}${quantityLabel(price.qty).replace("por ", "")}`;

  // Passos numerados: opções, medida (m²), tamanhos (vestuário) e arte.
  const sizeStep = keys.length + 1;
  const gridStep = keys.length + (areaMode ? 2 : 1);
  const artStep = keys.length + (areaMode ? 1 : 0) + (apparel ? 1 : 0) + 1;

  // Linhas extras do carrinho. "Medida" segue o formato das páginas de festa e kit ("200 × 150 cm"), para o
  // carrinho e o checkout tratarem toda linha por m² igual; a área cobrada aparece só na pré-visualização.
  const extras: [string, string][] = [
    ...(area ? [["Medida", `${fmtCm(widthCm)} × ${fmtCm(heightCm)} cm`] as [string, string]] : []),
    ...(apparel ? [["Tamanhos", sizeSummary(sizes, counts) || "nenhum"] as [string, string]] : []),
    ...(expressAvailable ? [["Prazo", `${expressChosen ? "Expresso" : "Econômico"}${chosen.leadDays ? ` · ${daysText(chosen.leadDays)}` : ""}`] as [string, string]] : []),
  ];
  const previewExtras: [string, string][] = [...extras, ...(area ? [["Área cobrada", formatArea(area.billedArea)] as [string, string]] : [])];

  // Produto vendido sem impressão: a arte é só simulação e não trava o pedido.
  const typedArt = art.text.trim().length > 0 || art.subtext.trim().length > 0;
  const hasArt = spec.blank || artLater || Boolean(artName) || typedArt;

  const choose = (key: string, value: string) => setSelection((s) => ({ ...s, [key]: value }));
  const updateArt = (update: (art: ArtSettings) => ArtSettings) => {
    setArt(update);
    setArtMissing(false);
  };

  // Um canvas WebGL por vez: com o modal aberto, a página mostra o último quadro do 3D.
  const openPreview = () => {
    setPageShot(captureRef.current?.() ?? null);
    setPreview(true);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setUploadError(`O arquivo tem mais de ${MAX_UPLOAD_MB} MB. Envie uma versão menor ou marque “Enviar arte depois”.`);
      return;
    }
    if (!file.type.startsWith("image/")) {
      // PDF e outros: vão anexados ao pedido; o 3D segue com a arte de exemplo.
      setArtName(file.name);
      setArt((a) => ({ ...a, src: null }));
      setArtLater(false);
      setArtMissing(false);
      return;
    }
    setUploading(true);
    try {
      const src = await fileToDataUrl(file);
      setArt((a) => ({ ...a, src, zoom: 1, offsetX: 0, offsetY: 0 }));
      setArtName(file.name);
      setArtMissing(false);
      setTab("3d");
    } catch {
      setUploadError("Não conseguimos ler essa imagem. Tente PNG, JPG ou WEBP.");
    } finally {
      setUploading(false);
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
    setAdding(true);
    let thumb: string | null = null;
    try {
      const shot = captureRef.current?.();
      if (shot) thumb = await thumbnailOf(shot, 360);
      else if (art.src) thumb = await thumbnailOf(art.src, 360);
    } catch {
      thumb = null;
    }
    add({
      slug: product.slug,
      name: product.name,
      image: product.image,
      preview: thumb,
      options: {
        ...Object.fromEntries(keys.map((k) => [cleanOptionLabel(k), selection[k]])),
        ...Object.fromEntries(extras),
        ...(!spec.blank && !artLater ? artSummary(art, family) : {}),
      },
      // Mesmo contrato do pedido (lib/orders.ts): quantity = lotes da variação (q unidades cada), unitPrice = preço de um lote.
      // Medida livre: 1 peça por lote, já com a área. Vestuário: quantity = total de peças; a divisão vai em "Tamanhos".
      unitPrice,
      setQty: area ? 1 : price.qty,
      quantity: apparel ? units : quantity,
      leadDays: chosen.leadDays,
      groupId: product.groupId,
      variationId: price.variation?.id,
      ...(area ? { widthCm, heightCm } : {}),
      express: expressChosen,
      // O carrinho mostra "Arte: …"; null vira "enviar depois".
      artName: spec.blank ? "produto sem impressão" : artLater ? null : (artName ?? (typedArt ? `texto no mockup · estilo ${styleLabel(art.style).toLowerCase()}` : null)),
    });
    setAdding(false);
    setPreview(false);
  };

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] xl:gap-14">
      <div className="lg:sticky lg:top-28 lg:self-start">
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
        {tab === "3d" ? (
          preview ? (
            <div className="aspect-square w-full overflow-hidden rounded-card bg-mist">
              {pageShot ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pageShot} alt="" className="size-full object-cover" />
              ) : (
                <MockupSkeleton />
              )}
            </div>
          ) : (
            <Mockup3D spec={spec} art={art} label={product.name} captureRef={captureRef} fallbackImage={product.image} side={artSide} className="aspect-square w-full" />
          )
        ) : (
          <div className="flex gap-3">
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
                  <Image src={imageUrl(src)} alt="" fill sizes="64px" className="object-contain p-1" />
                </button>
              ))}
            </div>
            <div className="relative aspect-square flex-1 overflow-hidden rounded-card bg-mist">
              <Image src={imageUrl(product.images[photo] ?? product.image)} alt={product.name} fill sizes="(max-width: 1024px) 90vw, 560px" className="object-contain p-6" loading="eager" />
            </div>
          </div>
        )}
        <p className="mt-3 text-caption text-muted">
          Mockup ilustrativo gerado com a sua arte{area && !area.error ? `, na medida ${fmtCm(widthCm)} × ${fmtCm(heightCm)} cm` : ""}. A cor impressa segue o arquivo enviado.
        </p>
      </div>

      <div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="brand">Mockup 3D grátis</Badge>
          {reseller && <Badge tone="new">Preço de revendedor</Badge>}
          {spec.blank && <Badge tone="neutral">Vendido sem impressão</Badge>}
          {product.bestSeller && <Badge tone="dark">Mais vendido</Badge>}
          {product.isNew && <Badge tone="new">Lançamento</Badge>}
          {areaMode && <Badge tone="neutral">Medida sob medida</Badge>}
        </div>
        <h1 className="mt-3 text-title font-normal">{product.name}</h1>
        {product.summary && <p className="mt-2 max-w-xl text-[17px] leading-relaxed text-ink/75">{product.summary}</p>}
        <Price className="mt-4" size="pdp" value={display.value} from={!price.exact} unit={display.unit} live />
        {leadLabel(chosen.leadDays) && (
          <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-ink/80">
            <IconClock className="size-4 text-coral-700" /> {leadLabel(chosen.leadDays)}
            {expressChosen && <span className="text-muted">· expresso</span>}
          </p>
        )}

        <ol className="mt-8 space-y-6">
          {keys.map((key, i) => {
            const available = availableValues(key, product.options, variations, selection);
            return (
              <li key={key} className="motion-safe:animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                <StepTitle n={i + 1} total={artStep} title={cleanOptionLabel(key)} />
                <OptionGroup
                  label={cleanOptionLabel(key)}
                  value={selection[key]}
                  onChange={(value) => choose(key, value)}
                  options={product.options[key].map((value) => ({ value, available: available.has(value) }))}
                />
              </li>
            );
          })}

          {area && product.customSize && (
            <li id="passo-medida" className="scroll-mt-32">
              <StepTitle n={sizeStep} total={artStep} title="Medida (largura × altura)" />
              <SizeInput value={size} onChange={setSize} limits={product.customSize} presets={presets} quote={area} pricePerM2={chosen.price} showErrors={attempted} />
            </li>
          )}

          {apparel && (
            <li id="passo-tamanhos" className="scroll-mt-32">
              <StepTitle n={gridStep} total={artStep} title="Tamanhos e quantidades" />
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

          <ArtStep
            step={artStep}
            family={family}
            spec={spec}
            onSide={setArtSide}
            blank={spec.blank}
            art={art}
            onArt={updateArt}
            artName={artName}
            onFile={onFile}
            uploadError={uploadError}
            uploading={uploading}
            artLater={artLater}
            onArtLater={(value) => {
              setArtLater(value);
              if (value) setArtMissing(false);
            }}
            missing={artMissing}
            kind={spec.kind}
            aspect={artAspect(spec)}
            ledColors={spec.ledColors}
            label={product.name}
            sizes={product.sizes ?? null}
            sizeChart={product.sizeChart ?? null}
          />
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
              {!apparel && (
                <QtyStepper
                  value={quantity}
                  onChange={setQty}
                  min={minQty}
                  max={maxQty}
                  label={perUnit ? "Quantidade de unidades" : area ? "Quantidade de peças" : "Quantidade de pedidos"}
                />
              )}
              <Button variant="preview" size="md" className="grow px-5 sm:grow-0" onClick={openPreview} icon={<IconCube className="size-5" />}>
                Pré-visualizar
              </Button>
            </div>
          </div>
          {perUnit && minQty > 1 && <p className="mt-2 text-caption text-muted">Pedido mínimo de {minQty.toLocaleString("pt-BR")} unidades.</p>}
          <Button variant="buy" size="lg" block className="mt-4" loading={adding} onClick={addToCart}>
            {adding ? "Adicionando…" : "Adicionar ao carrinho"}
          </Button>
        </div>

        {product.template && <TemplateDownload productId={product.id ?? product.slug} template={product.template} name={product.name} className="mt-4" />}

        <CepLookup leadDays={chosen.leadDays} />
      </div>

      {preview && (
        <PreviewModal
          onClose={() => setPreview(false)}
          onAdd={addToCart}
          adding={adding}
          spec={spec}
          art={art}
          name={product.name}
          fallbackImage={product.image}
          captureRef={captureRef}
          summary={[...keys.map((k) => [cleanOptionLabel(k), selection[k]] as [string, string]), ...previewExtras]}
          artDetails={artSummary(art, family)}
          total={formatBRL(total)}
        />
      )}
    </div>
  );
}

function CepLookup({ leadDays }: { leadDays: number | null }) {
  const [cep, setCep] = useState("");
  const [result, setResult] = useState<{ ok: true; place: string } | { ok: false; error: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) {
      setResult({ ok: false, error: "Digite os 8 números do CEP." });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data.erro) setResult({ ok: false, error: "CEP não encontrado." });
      else setResult({ ok: true, place: `${data.localidade}/${data.uf}` });
    } catch {
      setResult({ ok: false, error: "Não foi possível consultar o CEP agora." });
    } finally {
      setLoading(false);
    }
  };

  const message = result
    ? result.ok
      ? `Entrega para ${result.place}. ${leadLabel(leadDays) ?? "Produção conforme o produto"}; o frete é calculado na finalização da compra.`
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
      <a href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noreferrer" className="mt-1 inline-block text-caption text-muted underline underline-offset-2">
        Não sei meu CEP
      </a>
    </div>
  );
}
