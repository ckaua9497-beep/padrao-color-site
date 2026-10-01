"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import Mockup3D from "@/components/mockup/Mockup3D";
import type { CaptureFn } from "@/components/mockup/MockupViewer";
import { DEFAULT_ART, fileToDataUrl, thumbnailOf, type ArtSettings } from "@/components/mockup/art";
import { useCart } from "@/components/cart/CartProvider";
import QtyStepper from "@/components/cart/QtyStepper";
import { IconClock, IconCube, IconTruck, IconUpload } from "@/components/icons";
import type { Variation } from "@/lib/catalog";
import { formatBRL, imageUrl, leadLabel, quantityLabel } from "@/lib/format";
import { mockupSpec } from "@/lib/mockup";
import { availableValues, cleanOptionLabel, optionKeys, quote, type Selection } from "@/lib/pricing";
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

function initialSelection(product: ClientProduct): Selection {
  const cheapest = [...product.variations].sort((a, b) => a.p - b.p)[0];
  const selection: Selection = {};
  for (const key of optionKeys(product.options)) {
    selection[key] = cheapest?.v[key] ?? product.options[key][0];
  }
  return selection;
}

export default function ProductExperience({ product }: { product: ClientProduct }) {
  const keys = useMemo(() => optionKeys(product.options), [product.options]);
  const [selection, setSelection] = useState<Selection>(() => initialSelection(product));
  const [art, setArt] = useState<ArtSettings>(DEFAULT_ART);
  const [artName, setArtName] = useState<string | null>(null);
  const [artLater, setArtLater] = useState(false);
  const [artError, setArtError] = useState(false);
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<"3d" | "fotos">("3d");
  const [photo, setPhoto] = useState(0);
  const [preview, setPreview] = useState(false);
  const [adding, setAdding] = useState(false);
  const captureRef = useRef<CaptureFn | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { add } = useCart();

  const price = useMemo(
    () => quote(product.variations, selection, { price: product.price, qty: product.priceQty, leadDays: product.leadDays }, keys.length),
    [product, selection, keys.length],
  );
  const spec = useMemo(() => mockupSpec(product, selection), [product, selection]);
  const total = price.price * qty;

  const choose = (key: string, value: string) => setSelection((s) => ({ ...s, [key]: value }));

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setArtName(file.name);
      setArt(DEFAULT_ART);
      setArtLater(false);
      setArtError(false);
      return;
    }
    const src = await fileToDataUrl(file);
    setArt((a) => ({ ...a, src }));
    setArtName(file.name);
    setArtError(false);
    setTab("3d");
  };

  const addToCart = async () => {
    if (!artName && !artLater) {
      setArtError(true);
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
      options: Object.fromEntries(keys.map((k) => [cleanOptionLabel(k), selection[k]])),
      unitPrice: price.price,
      setQty: price.qty,
      quantity: qty,
      leadDays: price.leadDays,
      artName: artLater ? null : artName,
    });
    setAdding(false);
    setPreview(false);
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] xl:gap-14">
      <div className="lg:sticky lg:top-28 lg:self-start">
        <div className="mb-3 inline-flex rounded-full bg-mist p-1">
          {(["3d", "fotos"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${tab === t ? "bg-ink text-white" : "text-ink/70 hover:text-ink"}`}
            >
              {t === "3d" ? <IconCube className="size-4" /> : null}
              {t === "3d" ? "Mockup 3D" : "Fotos"}
            </button>
          ))}
        </div>
        {tab === "3d" ? (
          <Mockup3D spec={spec} art={art} label={product.name} captureRef={captureRef} className="aspect-square w-full" />
        ) : (
          <div className="flex gap-3">
            <div className="flex w-16 shrink-0 flex-col gap-2">
              {product.images.map((src, i) => (
                <button key={src} type="button" onClick={() => setPhoto(i)} className={`relative aspect-square overflow-hidden rounded-[10px] bg-mist ring-offset-2 ${photo === i ? "ring-2 ring-ink" : "ring-1 ring-line"}`}>
                  <Image src={imageUrl(src)} alt="" fill sizes="64px" className="object-contain p-1" />
                </button>
              ))}
            </div>
            <div className="relative aspect-square flex-1 overflow-hidden rounded-card bg-mist">
              <Image src={imageUrl(product.images[photo] ?? product.image)} alt={product.name} fill sizes="(max-width: 1024px) 90vw, 560px" className="object-contain p-6" priority />
            </div>
          </div>
        )}
        <p className="mt-3 text-[12px] text-muted">Mockup ilustrativo gerado com a sua arte. A cor impressa segue o arquivo enviado.</p>
      </div>

      <div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-[6px] bg-coral px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white">Mockup 3D grátis</span>
          {product.bestSeller && <span className="rounded-[6px] bg-ink px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white">Mais vendido</span>}
          {product.isNew && <span className="rounded-[6px] bg-cyan px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white">Lançamento</span>}
        </div>
        <h1 className="mt-3 text-[clamp(26px,2.4vw,32px)] font-semibold leading-tight tracking-[-0.01em]">{product.name}</h1>
        <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
          {!price.exact && <span className="pb-1 text-sm text-muted">a partir de</span>}
          <span className="text-[32px] font-black leading-none text-coral">{formatBRL(price.price)}</span>
          <span className="pb-1 text-sm text-muted">{quantityLabel(price.qty)}</span>
        </div>
        {leadLabel(price.leadDays) && (
          <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-ink/80">
            <IconClock className="size-4 text-coral" /> {leadLabel(price.leadDays)}
          </p>
        )}

        <ol className="mt-8 space-y-6">
          {keys.map((key, i) => {
            const values = product.options[key];
            const available = availableValues(key, product.options, product.variations, selection);
            return (
              <li key={key} className="animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                <p className="mb-2.5 flex items-center gap-2 text-[15px] font-bold">
                  <span className="grid size-5 place-items-center rounded-full bg-ink text-[11px] text-white">{i + 1}</span>
                  {cleanOptionLabel(key)}
                  <span className="text-[12px] font-normal text-muted">
                    · opção {i + 1} de {keys.length + 1}
                  </span>
                </p>
                <div role="radiogroup" aria-label={cleanOptionLabel(key)} className="flex flex-wrap gap-2">
                  {values.map((value) => {
                    const selected = selection[key] === value;
                    const dim = !available.has(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => choose(key, value)}
                        className={`min-h-11 rounded-control bg-white px-3.5 py-2 text-left text-[14px] leading-snug transition-all duration-200 ${
                          selected ? "font-semibold shadow-[0_0_0_2px_#0a0a0a]" : "shadow-[0_0_0_1px_#e5e5e5] hover:shadow-[0_0_0_1px_#a3a3a3]"
                        } ${dim && !selected ? "text-subtle" : ""}`}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}

          <li id="passo-arte" className="scroll-mt-32">
            <p className="mb-2.5 flex items-center gap-2 text-[15px] font-bold">
              <span className="grid size-5 place-items-center rounded-full bg-ink text-[11px] text-white">{keys.length + 1}</span>
              Sua arte
              <span className="text-[12px] font-normal text-muted">· aparece no mockup 3D</span>
            </p>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onFile(e.dataTransfer.files?.[0]);
              }}
              className={`rounded-control border-2 border-dashed p-5 transition-colors ${artError ? "border-coral bg-coral-50" : "border-line-strong bg-white"}`}
            >
              {artName ? (
                <div className="flex flex-wrap items-center gap-4">
                  <span className="relative size-16 shrink-0 overflow-hidden rounded-[10px] bg-mist">
                    {art.src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={art.src} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="grid size-full place-items-center text-[11px] font-bold text-muted">PDF</span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{artName}</p>
                    <p className="text-[12px] text-muted">{art.src ? "Aplicada no mockup 3D" : "Arquivo anexado ao pedido; a prévia 3D usa a arte de exemplo"}</p>
                  </div>
                  <button type="button" onClick={() => fileInput.current?.click()} className="text-sm font-semibold underline underline-offset-2 hover:text-coral">
                    Trocar
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fileInput.current?.click()} className="flex w-full flex-col items-center gap-2 py-3 text-center">
                  <span className="grid size-12 place-items-center rounded-full bg-coral-50 text-coral">
                    <IconUpload className="size-6" />
                  </span>
                  <span className="text-[15px] font-bold">Enviar arte</span>
                  <span className="text-[12px] text-muted">PNG, JPG ou WEBP para ver em 3D · PDF também é aceito · ou arraste aqui</span>
                </button>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </div>

            {art.src && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {(["cover", "contain"] as const).map((fit) => (
                  <button
                    key={fit}
                    type="button"
                    onClick={() => setArt((a) => ({ ...a, fit }))}
                    className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${art.fit === fit ? "bg-ink text-white" : "bg-mist hover:bg-fog"}`}
                  >
                    {fit === "cover" ? "Preencher" : "Ajustar"}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setArt((a) => ({ ...a, rotation: (((a.rotation + 90) % 360) as ArtSettings["rotation"]) }))}
                  className="rounded-full bg-mist px-3.5 py-1.5 text-[13px] font-semibold hover:bg-fog"
                >
                  Girar 90°
                </button>
                <label className="flex items-center gap-2 rounded-full bg-mist py-1 pl-3.5 pr-1.5 text-[13px] font-semibold">
                  Fundo
                  <input type="color" value={art.background} onChange={(e) => setArt((a) => ({ ...a, background: e.target.value }))} className="size-7 cursor-pointer rounded-full border-0 bg-transparent" />
                </label>
              </div>
            )}

            <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={artLater}
                onChange={(e) => {
                  setArtLater(e.target.checked);
                  if (e.target.checked) setArtError(false);
                }}
                className="size-4 accent-coral"
              />
              Enviar arte depois (a equipe entra em contato)
            </label>
            {artError && <p className="mt-2 text-sm font-semibold text-coral-700">Envie a arte ou marque “Enviar arte depois” para continuar.</p>}
          </li>
        </ol>

        <div className="mt-8 rounded-card bg-mist p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[13px] text-muted">Total · {qty > 1 ? `${qty} × ` : ""}{quantityLabel(price.qty).replace("por ", "")}</p>
              <p className="text-2xl font-black">{formatBRL(total)}</p>
            </div>
            <QtyStepper value={qty} onChange={setQty} label="Quantidade de pedidos" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setPreview(true)}
              className="flex h-13 items-center justify-center gap-2 rounded-control border border-blue bg-blue/10 text-[17px] font-semibold text-blue transition-colors duration-300 hover:bg-blue hover:text-white"
            >
              <IconCube className="size-5" /> Pré-visualizar
            </button>
            <button
              type="button"
              onClick={addToCart}
              disabled={adding}
              className="flex h-13 items-center justify-center rounded-control bg-coral text-[17px] font-bold text-white transition-colors duration-300 hover:bg-coral-600 disabled:opacity-60"
            >
              {adding ? "Adicionando…" : "Adicionar ao carrinho"}
            </button>
          </div>
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
          captureRef={captureRef}
          summary={keys.map((k) => [cleanOptionLabel(k), selection[k]])}
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
      <p className="mb-2 text-sm font-bold">Calcular entrega</p>
      <div className="flex gap-2">
        <label className="flex h-12 flex-1 items-center gap-2 rounded-control border border-line-strong bg-white px-3 sm:max-w-[240px]">
          <IconTruck className="size-5 text-muted" />
          <input
            inputMode="numeric"
            value={cep}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, "").slice(0, 8);
              setCep(d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d);
            }}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
            placeholder="Digite seu CEP"
            aria-label="CEP"
            className="w-full bg-transparent text-[15px] outline-none"
          />
        </label>
        <button type="button" onClick={lookup} disabled={loading} className="h-12 rounded-control bg-ink px-5 text-sm font-bold text-white transition-colors hover:bg-coral disabled:opacity-60">
          {loading ? "Consultando…" : "Calcular"}
        </button>
      </div>
      {message && <p className={`mt-2 text-sm ${result?.ok ? "text-ink/80" : "text-coral-700"}`}>{message}</p>}
      <a href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12px] text-muted underline underline-offset-2">
        Não sei meu CEP
      </a>
    </div>
  );
}
