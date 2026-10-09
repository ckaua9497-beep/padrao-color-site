"use client";

import { useEffect, useId, useRef, useState } from "react";
import Mockup3D from "@/components/mockup/Mockup3D";
import type { CaptureFn } from "@/components/mockup/MockupViewer";
import { artFamily, hasArtContent, releaseSource, retainSources, thumbnailOf, type ArtSettings } from "@/components/mockup/art";
import { IntakeError } from "@/components/mockup/image-intake";
import { ArtStep } from "@/components/product/ArtStep";
import { autoFitArt, fitAreaFor, restoreBackground } from "@/components/product/auto-fit";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { artAspect } from "@/lib/mockup-kinds";
import type { PartyProduct } from "@/lib/party";
import { photoKey, type ItemView, type KitShot } from "./kit-art";
import { MAX_UPLOAD_MB, isPdf, readArtwork, tooBig } from "./kit-upload";

/** O que o editor devolve: a arte montada, o arquivo enviado só para o item e "enviar arte depois". */
export type ItemArtDraft = { art: ArtSettings; artName: string | null; later: boolean; file: File | null };

type Props = {
  title: string;
  /** O produto do pedido (o da faixa, na camiseta). */
  product: Pick<PartyProduct, "name" | "image" | "slug" | "sizes">;
  view: ItemView;
  /** Nome do logo do kit: a imagem que o item recebeu aparece no editor como a imagem atual. */
  logoName: string | null;
  onSave: (draft: ItemArtDraft, shot: KitShot | null) => void;
  onClose: () => void;
};

/**
 * Editor da arte de um item do kit: o mesmo passo "Sua arte" da página de produto (estilo, texto, imagem, editor
 * 2D, frente e verso, manequim) com o 3D da peça ao lado. Começa com a arte do kit encaixada no item; o que o
 * cliente muda vale só para ele. "Usar a arte do kit" volta para a arte comum.
 */
export function KitArtEditor({ title, product, view, logoName, onSave, onClose }: Props) {
  const { spec } = view;
  const [art, setArt] = useState<ArtSettings>(view.art);
  const [artName, setArtName] = useState<string | null>(view.mode === "own" ? view.ownName : null);
  // Arquivo sem prévia (AI, CDR) enviado só para o item.
  const [attachedFile, setAttachedFile] = useState<File | null>(view.mode === "own" ? (view.ownFile ?? null) : null);
  const [later, setLater] = useState(view.mode === "later");
  const [side, setSide] = useState<"front" | "back">("front");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const captureRef = useRef<CaptureFn | null>(null);
  const family = artFamily(spec.kind);
  const fitArea = fitAreaFor(spec);
  // Igual à arte do kit (nada mudou ou "Usar a arte do kit"): o item segue a arte comum.
  const sameAsKit = !artName && JSON.stringify(art) === JSON.stringify(view.shared);
  // O logo do kit (ainda não trocado aqui) aparece como a imagem atual, com "Trocar".
  const shownName = artName ?? (art.src && art.src === view.shared.src && logoName ? `${logoName} (logo do kit)` : null);

  // As imagens do rascunho ficam registradas enquanto o editor está aberto.
  const owner = useId();
  useEffect(() => {
    retainSources(owner, [art.src, art.back?.src]);
  }, [owner, art.src, art.back?.src]);
  useEffect(() => () => retainSources(owner, []), [owner]);

  const updateArt = (update: (current: ArtSettings) => ArtSettings) => {
    setArt(update);
    setMissing(false);
  };

  // Cada envio ganha um número: o resultado de um envio anterior que termina depois não sobrescreve o último.
  const uploadSeq = useRef(0);
  const onFile = async (file: File | undefined, { raw = false }: { raw?: boolean } = {}) => {
    if (!file) return;
    if (tooBig(file)) {
      setUploadError(`O arquivo tem mais de ${MAX_UPLOAD_MB} MB. Envie uma versão menor ou marque “Enviar arte depois”.`);
      return;
    }
    const seq = ++uploadSeq.current;
    setUploadError(null);
    setUploading(true);
    try {
      const { src } = await readArtwork(file, { removeWhite: fitArea.transparentBase, raw });
      if (seq !== uploadSeq.current) {
        releaseSource(src);
        return;
      }
      // Arquivo novo: a posição e o fundo automático da imagem anterior não valem; o tratador encaixa na área.
      setArt((a) => autoFitArt({ ...restoreBackground(a), src, zoom: 1, offsetX: 0, offsetY: 0, layout: a.layout?.text ? { text: a.layout.text } : null, templateFit: null }, fitArea));
      setArtName(file.name);
      setAttachedFile(null);
      setLater(false);
      setMissing(false);
    } catch (error) {
      if (seq !== uploadSeq.current) return;
      if ((error instanceof IntakeError && error.attach) || isPdf(file)) {
        // Sem prévia (AI, CDR, PDF que o navegador não abre): vai anexado ao pedido pelo nome.
        setArtName(file.name);
        setAttachedFile(file);
        setArt((a) => ({ ...a, src: null, templateFit: null }));
        setLater(false);
        setMissing(false);
        setUploadError(error instanceof IntakeError ? error.message : null);
      } else {
        setUploadError(error instanceof IntakeError ? error.message : "Não conseguimos ler essa imagem. Tente PNG, JPG, WEBP, SVG ou PDF.");
      }
    } finally {
      if (seq === uploadSeq.current) setUploading(false);
    }
  };

  const backToKit = () => {
    uploadSeq.current += 1;
    setUploading(false);
    setUploadError(null);
    setArt(view.shared);
    setArtName(null);
    setAttachedFile(null);
    setLater(false);
    setMissing(false);
  };

  const save = async () => {
    if (!spec.blank && !later && !hasArtContent(art) && !artName) {
      setMissing(true);
      return;
    }
    setSaving(true);
    let shot: KitShot | null = null;
    try {
      const frame = captureRef.current?.();
      if (frame) shot = { key: photoKey(spec, art), src: await thumbnailOf(frame, 360) };
    } catch {
      shot = null;
    }
    setSaving(false);
    onSave({ art, artName, later, file: attachedFile }, shot);
  };

  const intro =
    view.mode === "own"
      ? "Este item tem arte própria: o que você muda na arte do kit não entra nele."
      : "Começa com a arte do kit. O que você mudar aqui vale só para este item; os outros continuam com a arte do kit.";

  return (
    <Dialog open onClose={onClose} label={`Personalizar ${title}`} className="grid max-w-[1180px] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* No celular o título vem antes do 3D (o botão de fechar fica sobre o painel, não sobre o "Ver verso"). */}
      <div className="px-5 pb-4 pr-16 pt-5 sm:px-7 sm:pr-16 md:col-start-2 md:row-start-1 md:pr-7 md:pt-7">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral-700">Personalizar item</p>
        <h2 className="mt-1 text-title font-bold">{title}</h2>
        <p className="mt-2 text-sm text-ink/75">{intro}</p>
      </div>
      <div className="bg-mist md:sticky md:top-0 md:col-start-1 md:row-span-2 md:row-start-1 md:self-start">
        <Mockup3D spec={spec} art={art} label={product.name} captureRef={captureRef} fallbackImage={product.image} side={side} className="aspect-square w-full" />
        <p className="px-5 py-3 text-caption text-muted">Gire e aproxime para conferir. A foto deste ângulo vai para o carrinho.</p>
      </div>
      <div className="flex min-w-0 flex-col px-5 pb-5 pt-5 sm:px-7 sm:pb-7 md:col-start-2 md:row-start-2 md:pt-2">
        <ol>
          <ArtStep
            family={family}
            spec={spec}
            onSide={setSide}
            blank={spec.blank}
            art={art}
            onArt={updateArt}
            artName={shownName}
            onFile={onFile}
            uploadError={uploadError}
            uploading={uploading}
            artLater={later}
            onArtLater={(value) => {
              setLater(value);
              if (value) setMissing(false);
            }}
            missing={missing}
            kind={spec.kind}
            aspect={artAspect(spec)}
            ledColors={spec.ledColors}
            label={product.name}
            sizes={product.sizes}
            sizeChart={null}
            slug={product.slug}
          />
        </ol>
        <div className="sticky bottom-0 -mx-5 mt-6 flex flex-wrap items-center gap-2 border-t border-line bg-white px-5 py-4 sm:-mx-7 sm:px-7">
          {(!sameAsKit || later || view.mode !== "kit") && (
            <Button variant="outline" size="sm" onClick={backToKit} disabled={sameAsKit && !later}>
              Usar a arte do kit
            </Button>
          )}
          <Button variant="dark" size="md" className="ml-auto" loading={saving} onClick={save}>
            Salvar este item
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
