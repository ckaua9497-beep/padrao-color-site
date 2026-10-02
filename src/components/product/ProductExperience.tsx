"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import Mockup3D from "@/components/mockup/Mockup3D";
import { MockupSkeleton } from "@/components/mockup/MockupSkeleton";
import type { CaptureFn } from "@/components/mockup/MockupViewer";
import { ART_BACKGROUNDS, ART_FONTS, DEFAULT_ART, TEXT_COLORS, artFamily, fileToDataUrl, styleLabel, thumbnailOf, type ArtFamily, type ArtSettings } from "@/components/mockup/art";
import { useCart } from "@/components/cart/CartProvider";
import { IconClock, IconCube, IconTruck } from "@/components/icons";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { OptionGroup } from "@/components/ui/OptionGroup";
import { Price } from "@/components/ui/Price";
import QtyStepper from "@/components/ui/QtyStepper";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cx } from "@/components/ui/cx";
import type { Variation } from "@/lib/catalog";
import { formatBRL, imageUrl, leadLabel, quantityLabel } from "@/lib/format";
import { mockupSpec } from "@/lib/mockup";
import { artAspect } from "@/lib/mockup-kinds";
import { availableValues, cleanOptionLabel, optionKeys, quote, type Selection } from "@/lib/pricing";
import { ArtStep } from "./ArtStep";
import PreviewModal from "./PreviewModal";

export type ClientProduct = {
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
};

const MAX_UPLOAD_MB = 25;

function initialSelection(product: ClientProduct): Selection {
  const cheapest = [...product.variations].sort((a, b) => a.p - b.p)[0];
  const selection: Selection = {};
  for (const key of optionKeys(product.options)) {
    selection[key] = cheapest?.v[key] ?? product.options[key][0];
  }
  return selection;
}

/**
 * Texto, subtexto, estilo, fonte e cores da arte, para o carrinho e o resumo do pedido.
 * `family` (opcional) acrescenta o fundo quando ele é impresso (não vale para estampa e neon).
 */
export function artSummary(art: ArtSettings, family?: ArtFamily): Record<string, string> {
  // Só o subtexto escrito: o mockup mostra ele como texto principal, e o resumo também.
  const typed = art.text.trim();
  const typedSub = (art.subtext ?? "").trim();
  const text = typed || typedSub;
  const subtext = typed ? typedSub : "";
  if (!text) return {};
  const colorName = (value: string) => TEXT_COLORS.find((c) => c.value === value)?.label ?? ART_BACKGROUNDS.find((b) => b.value === value)?.label ?? value;
  const printsBackground = !art.src && family !== undefined && family !== "apparel" && family !== "neon";
  return {
    ...(text ? { "Texto da arte": text } : {}),
    ...(subtext ? { Subtexto: subtext } : {}),
    Estilo: styleLabel(art.style),
    Fonte: ART_FONTS[art.font]?.label ?? ART_FONTS.figtree.label,
    ...(family === "neon" ? {} : { "Cor do texto": colorName(art.textColor) }),
    ...(printsBackground ? { Fundo: colorName(art.background) } : {}),
  };
}

export default function ProductExperience({ product }: { product: ClientProduct }) {
  const keys = useMemo(() => optionKeys(product.options), [product.options]);
  const [selection, setSelection] = useState<Selection>(() => initialSelection(product));
  const [art, setArt] = useState<ArtSettings>(DEFAULT_ART);
  const [artName, setArtName] = useState<string | null>(null);
  const [artLater, setArtLater] = useState(false);
  const [artMissing, setArtMissing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<"3d" | "fotos">("3d");
  const [photo, setPhoto] = useState(0);
  const [preview, setPreview] = useState(false);
  const [pageShot, setPageShot] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const captureRef = useRef<CaptureFn | null>(null);
  const { add } = useCart();

  const price = useMemo(
    () => quote(product.variations, selection, { price: product.price, qty: product.priceQty, leadDays: product.leadDays }, keys.length),
    [product, selection, keys.length],
  );
  const spec = useMemo(() => mockupSpec(product, selection), [product, selection]);
  const family = artFamily(spec.kind);
  const total = price.price * qty;
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

  const addToCart = async () => {
    if (!hasArt) {
      setArtMissing(true);
      setPreview(false);
      document.getElementById("passo-arte")?.scrollIntoView({ behavior: "smooth", block: "center" });
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
      options: { ...Object.fromEntries(keys.map((k) => [cleanOptionLabel(k), selection[k]])), ...(!spec.blank && !artLater ? artSummary(art, family) : {}) },
      unitPrice: price.price,
      setQty: price.qty,
      quantity: qty,
      leadDays: price.leadDays,
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
            <Mockup3D spec={spec} art={art} label={product.name} captureRef={captureRef} fallbackImage={product.image} className="aspect-square w-full" />
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
        <p className="mt-3 text-caption text-muted">Mockup ilustrativo gerado com a sua arte. A cor impressa segue o arquivo enviado.</p>
      </div>

      <div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="brand">Mockup 3D grátis</Badge>
          {spec.blank && <Badge tone="neutral">Vendido sem impressão</Badge>}
          {product.bestSeller && <Badge tone="dark">Mais vendido</Badge>}
          {product.isNew && <Badge tone="new">Lançamento</Badge>}
        </div>
        <h1 className="mt-3 text-title font-normal">{product.name}</h1>
        <Price className="mt-3" size="pdp" value={price.price} from={!price.exact} unit={quantityLabel(price.qty)} live />
        {leadLabel(price.leadDays) && (
          <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-ink/80">
            <IconClock className="size-4 text-coral-700" /> {leadLabel(price.leadDays)}
          </p>
        )}

        <ol className="mt-8 space-y-6">
          {keys.map((key, i) => {
            const available = availableValues(key, product.options, product.variations, selection);
            return (
              <li key={key} className="motion-safe:animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                <p className="mb-2.5 flex items-center gap-2 text-[15px] font-bold">
                  <span className="grid size-5 place-items-center rounded-full bg-ink text-[11px] text-white">{i + 1}</span>
                  {cleanOptionLabel(key)}
                  <span className="text-caption font-normal text-muted">
                    · opção {i + 1} de {keys.length + 1}
                  </span>
                </p>
                <OptionGroup
                  label={cleanOptionLabel(key)}
                  value={selection[key]}
                  onChange={(value) => choose(key, value)}
                  options={product.options[key].map((value) => ({ value, available: available.has(value) }))}
                />
              </li>
            );
          })}

          <ArtStep
            step={keys.length + 1}
            family={family}
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
          />
        </ol>

        <div className="mt-8 rounded-card bg-mist p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="tabular-nums">
              <p className="text-caption text-muted">
                Total · {qty > 1 ? `${qty} × ` : ""}
                {quantityLabel(price.qty).replace("por ", "")}
              </p>
              <p className="text-2xl font-black">{formatBRL(total)}</p>
            </div>
            <div className="flex items-center gap-2">
              <QtyStepper value={qty} onChange={setQty} label="Quantidade de pedidos" />
              <Button variant="preview" size="md" className="px-5" onClick={openPreview} icon={<IconCube className="size-5" />}>
                Pré-visualizar
              </Button>
            </div>
          </div>
          <Button variant="buy" size="lg" block className="mt-4" loading={adding} onClick={addToCart}>
            {adding ? "Adicionando…" : "Adicionar ao carrinho"}
          </Button>
        </div>

        <CepLookup leadDays={price.leadDays} />
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
          summary={keys.map((k) => [cleanOptionLabel(k), selection[k]] as [string, string])}
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
