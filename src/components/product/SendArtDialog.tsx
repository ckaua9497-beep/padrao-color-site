"use client";

import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { IconBrush, IconCheck, IconCube, IconUpload } from "@/components/icons";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/TextField";
import { cx } from "@/components/ui/cx";
import { ART_UPLOAD_MAX_MB, fileExtension } from "@/lib/art-files";
import { ARQUIVO_UNICO, camposVisiveis } from "@/lib/customizacao";
import { formatBRL } from "@/lib/format";

/** Arquivos prontos para a produção: PDF, imagens, PSD, AI, CDR, EPS e SVG (o servidor confere a extensão e o tamanho). */
export const PRODUCTION_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.svg,.tif,.tiff,.psd,.ai,.eps,.cdr,.zip,.rar";

/** Pedido de criação de arte: o que o cliente quer e as referências (logo, fotos). */
export type ArtRequest = { briefing: string; references: File[] };

/** Nome da arte (nome do trabalho no pedido) e observação para a produção. */
export type ArtDetails = { title: string; note: string; onTitle: (value: string) => void; onNote: (value: string) => void };

/** Criação de arte pela equipe da Padrão: o preço da variação (API) e o pedido atual (null = não pediu). */
export type ArtCreation = { price: number; request: ArtRequest | null; onRequest: (request: ArtRequest | null) => void };

export type SendTab = "enviar" | "criar";

type Files = Readonly<Record<string, File>>;

type Common = {
  /** Tipos de anexo da variação (anexosDeProducao): o arquivo único primeiro e os separados da API. */
  types: readonly string[];
  files: Files;
  /** Anexos que o site faz sozinho a partir da arte quando o cliente não manda (faca, posição do LED, máscara de verniz). */
  automatic: readonly string[];
  /** Frente e verso montados no site (nome da imagem ou "texto"), mostrados quando não há arquivo próprio deles. */
  editorFront: string | null;
  editorBack: string | null;
};

const NOTE_LIMIT = 500;
const BRIEFING_LIMIT = 1000;
const MAX_REFERENCES = 5;
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "svg", "gif", "avif", "bmp"]);

const label = (tipo: string) => (tipo === ARQUIVO_UNICO ? "Arquivo único" : tipo);
const sizeOf = (file: File) => (file.size >= 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`);

/** URL da miniatura de um arquivo de imagem (uma por arquivo, guardada enquanto o arquivo existir). */
const thumbs = new WeakMap<File, string>();
function thumbOf(file: File): string | null {
  if (!IMAGE_EXT.has(fileExtension(file.name))) return null;
  let url = thumbs.get(file);
  if (!url) {
    url = URL.createObjectURL(file);
    thumbs.set(file, url);
  }
  return url;
}

/** Separador "ou" entre as opções do envio. */
function Or() {
  return (
    <p className="my-5 flex items-center gap-3 text-sm font-bold text-coral-700" aria-hidden>
      <span className="h-px flex-1 bg-line" />
      ou
      <span className="h-px flex-1 bg-line" />
    </p>
  );
}

/**
 * Os arquivos de produção da variação: o arquivo único (enviado, esconde os separados) ou um arquivo para cada parte
 * (enviado um, esconde o único; camposVisiveis). No "Selecione a arte" e no envio rápido. `idPrefixo` separa os ids
 * quando os dois estão na página.
 */
export function ArquivosParaProducao({
  types,
  files,
  onFile,
  check,
  automatic,
  editorFront,
  editorBack,
  idPrefixo = "envio",
}: Common & { onFile: (tipo: string, file: File | null) => void; check: (file: File) => string | null; idPrefixo?: string }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const visible = camposVisiveis(types, files);
  const single = visible.includes(ARQUIVO_UNICO);
  const separate = visible.filter((tipo) => tipo !== ARQUIVO_UNICO);
  const pick = (tipo: string, file: File | undefined) => {
    if (!file) return;
    const problem = check(file);
    setErrors((e) => ({ ...e, [tipo]: problem ?? "" }));
    if (!problem) onFile(tipo, file);
  };
  const fromEditor = (tipo: string) => (tipo === "Impressão Frente" ? editorFront : tipo === "Impressão Verso" ? editorBack : null);
  return (
    <>
      {single && (
        <section className="mt-4" aria-labelledby={`${idPrefixo}-unico`}>
          <p id={`${idPrefixo}-unico`} className="flex flex-wrap items-center gap-2 text-[15px] font-bold">
            Arquivo único {!files[ARQUIVO_UNICO] && separate.length > 0 && <Badge tone="pix">Mais prático</Badge>}
          </p>
          <p className="mt-1 text-caption text-muted">Um arquivo com a arte completa: todas as páginas e partes. Ele vai sozinho para a produção.</p>
          <FileTile tipo={ARQUIVO_UNICO} file={files[ARQUIVO_UNICO] ?? null} onPick={pick} onRemove={() => onFile(ARQUIVO_UNICO, null)} error={errors[ARQUIVO_UNICO]} big />
        </section>
      )}

      {single && separate.length > 0 && <Or />}

      {separate.length > 0 && (
        <section className={cx(!single && "mt-4")} aria-labelledby={`${idPrefixo}-separados`}>
          <p id={`${idPrefixo}-separados`} className="text-[15px] font-bold">
            Um arquivo para cada parte
          </p>
          <p className="mt-1 text-caption text-muted">Cada arquivo vai para a produção como a parte dele.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {separate.map((tipo) => (
              <div key={tipo}>
                <p className="text-sm font-semibold">{label(tipo)}</p>
                <FileTile
                  tipo={tipo}
                  file={files[tipo] ?? null}
                  note={!files[tipo] ? (automatic.includes(tipo) ? "Feito automaticamente a partir da sua arte" : fromEditor(tipo) ? `Vai a arte montada no site (${fromEditor(tipo)})` : null) : null}
                  onPick={pick}
                  onRemove={() => onFile(tipo, null)}
                  error={errors[tipo]}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** Nome da arte (nome do trabalho) e observação, que vão no pedido. */
export function DetalhesDaArte({ details, className }: { details: ArtDetails; className?: string }) {
  return (
    <div className={cx("grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]", className)}>
      <TextField label="Nome da arte" value={details.title} onChange={details.onTitle} maxLength={60} placeholder="Ex.: Cartão Padaria Doce Pão" hint="Opcional: ajuda a achar o pedido depois." autoComplete="off" />
      <TextArea label="Observação" value={details.note} onChange={details.onNote} maxLength={NOTE_LIMIT} rows={3} placeholder="Observações sobre a arte (opcional)" />
    </div>
  );
}

type SendArtProps = Common & {
  open: boolean;
  onClose: () => void;
  /** Aba ao abrir: o envio, ou a criação quando ela já foi pedida. */
  initialTab: SendTab;
  /** Produto e preço do item agora (cabeçalho). */
  productName: string;
  priceLabel?: string | null;
  /** Guarda (ou tira, com null) o arquivo de um tipo; a página mostra a frente e o verso no 3D. */
  onFile: (tipo: string, file: File | null) => void;
  /** Confere o arquivo antes de guardar (formato, tamanho e o processo, como o talhamento só em vetor). */
  check: (file: File) => string | null;
  /**
   * "Montar a arte aqui no site": a imagem vai para o editor (encaixe, posição e 3D) e o arquivo de impressão sai dele.
   * Sem a função, a opção some (só arquivos prontos).
   */
  onEditorImage?: ((file: File) => void) | null;
  editorAccept: string;
  /**
   * Foto do mockup 3D da página com a arte (PNG sem fundo), para destacar a arte no produto; null quando a peça não tem
   * 3D. `previewKey` muda quando a arte da frente ou do verso muda (nova foto) e `previewImage` é a arte da frente lida.
   */
  snapMockup?: (() => string | null) | null;
  previewKey: string;
  previewImage: string | null;
  details?: ArtDetails | null;
  creation?: ArtCreation | null;
};

/**
 * "Selecione a arte" (pedido de 25/10/2026): enviar a arte pronta ou pedir a criação à equipe.
 * - Envio: os arquivos de produção vêm primeiro. O arquivo único vai sozinho para a produção e, enviado, esconde as
 *   outras opções; os separados (Impressão Frente, verniz, faca…) vão um por tipo e escondem o único
 *   (camposVisiveis). Por último, e só sem arquivo de produção, montar a arte no site com uma imagem.
 * - A arte aparece em destaque ao lado: no mockup 3D do produto quando o arquivo é lido (PDF, JPG, PNG, SVG), senão a
 *   miniatura ou o tipo do arquivo.
 * - Criação: o pedido do cliente e as referências; o preço da variação soma no item.
 */
export function SendArtDialog(props: SendArtProps) {
  return (
    <Dialog open={props.open} onClose={props.onClose} label="Selecione a arte" className="max-w-[980px]">
      <SendArtContent {...props} />
    </Dialog>
  );
}

function SendArtContent({
  onClose,
  initialTab,
  productName,
  priceLabel,
  types,
  files,
  onFile,
  check,
  onEditorImage,
  editorAccept,
  automatic,
  editorFront,
  editorBack,
  snapMockup,
  previewKey,
  previewImage,
  details,
  creation,
}: SendArtProps) {
  const [tab, setTab] = useState<SendTab>(creation ? initialTab : "enviar");
  const sent = types.some((tipo) => files[tipo]);

  // Criação: rascunho do pedido (vale ao clicar em "Solicitar criação").
  const [briefing, setBriefing] = useState(creation?.request?.briefing ?? "");
  const [references, setReferences] = useState<File[]>(creation?.request?.references ?? []);
  const [refError, setRefError] = useState<string | null>(null);
  const addReferences = (list: FileList | null | undefined) => {
    const picked = Array.from(list ?? []);
    const problem = picked.map((file) => check(file)).find(Boolean) ?? null;
    setRefError(problem);
    if (problem) return;
    setReferences((current) => [...current, ...picked].slice(0, MAX_REFERENCES));
  };
  const briefingOk = briefing.trim().length >= 10;

  const tabs: { value: SendTab; title: string; text: string; icon: ReactNode }[] = [
    { value: "enviar", title: "Enviar minha arte", text: "Arquivo pronto para a produção", icon: <IconUpload className="size-5" /> },
    ...(creation ? [{ value: "criar" as const, title: "Solicitar criação de arte", text: `+ ${formatBRL(creation.price)} · nossa equipe cria para você`, icon: <IconBrush className="size-5" /> }] : []),
  ];

  return (
    <div className="flex max-h-[calc(100dvh-2rem)] flex-col md:max-h-[calc(100dvh-4.5rem)]">
      {/* relative: os campos de arquivo escondidos (sr-only, absolutos) ficam presos aqui; sem isso eles esticam o painel do
          Dialog, que ganha uma segunda rolagem e leva o título e o rodapé junto. */}
      <div className="relative overflow-y-auto px-5 pb-6 pt-6 md:px-8 md:pt-8">
        <p className="text-micro font-bold uppercase tracking-[0.18em] text-coral-700">Sua arte</p>
        <h2 className="mt-1 text-title font-bold">Selecione a arte</h2>
        <p className="mt-1 text-muted">
          {productName}
          {priceLabel ? ` · ${priceLabel}` : ""}
        </p>

        {tabs.length > 1 && (
          <div role="radiogroup" aria-label="Como vem a arte" className="mt-5 grid gap-3 sm:grid-cols-2">
            {tabs.map((t) => {
              const active = tab === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={`${t.title}: ${t.text}`}
                  onClick={() => setTab(t.value)}
                  className={cx(
                    "flex items-center gap-3 rounded-card p-4 text-left transition-shadow",
                    active ? "bg-coral-50 ring-2 ring-coral-700" : "bg-white ring-1 ring-line hover:ring-ink/40",
                  )}
                >
                  <span className={cx("grid size-11 shrink-0 place-items-center rounded-full", active ? "bg-coral-700 text-white" : "bg-mist text-ink")}>{t.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold">{t.title}</span>
                    <span className="block text-caption text-muted">{t.text}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {tab === "enviar" ? (
          <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0">
              <p className="text-caption text-muted">
                A arte vai para a produção exatamente como você enviar. PDF, JPG, PNG, PSD, AI, CDR, EPS ou SVG, até {ART_UPLOAD_MAX_MB} MB por arquivo.
              </p>

              <ArquivosParaProducao types={types} files={files} onFile={onFile} check={check} automatic={automatic} editorFront={editorFront} editorBack={editorBack} />

              {onEditorImage && !sent && (
                <>
                  <Or />
                  <section className="rounded-card bg-mist p-4" aria-labelledby="envio-montar">
                    <p id="envio-montar" className="text-[15px] font-bold">
                      Montar a arte aqui no site
                    </p>
                    <p className="mt-1 text-caption text-muted">Envie só uma imagem (logo ou foto): encaixamos na peça, você ajusta a posição e vê no 3D. O arquivo de impressão sai daqui.</p>
                    <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-white px-4 text-[15px] font-bold transition-colors hover:border-ink">
                      <IconUpload className="size-4" />
                      Enviar imagem para montar
                      <input
                        type="file"
                        accept={editorAccept}
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (file) onEditorImage(file);
                        }}
                      />
                    </label>
                  </section>
                </>
              )}
            </div>

            <ArtPreview files={files} types={types} snapMockup={snapMockup} previewKey={previewKey} previewImage={previewImage} />
          </div>
        ) : (
          creation && (
            <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0">
                <TextArea
                  label="O que vai na arte"
                  value={briefing}
                  onChange={setBriefing}
                  maxLength={BRIEFING_LIMIT}
                  rows={6}
                  placeholder="Ex.: logo da empresa no centro, o nome “Padaria Doce Pão” embaixo, cores azul e branco, estilo moderno."
                  hint="Conte o texto, as cores e o estilo. Quanto mais detalhe, melhor."
                />
                <div className="mt-5">
                  <p className="text-[15px] font-bold">
                    Logo, fotos ou referências <span className="font-normal text-muted">· opcional, até {MAX_REFERENCES}</span>
                  </p>
                  <label
                    className="mt-2 flex cursor-pointer flex-col items-center gap-2 rounded-control border-2 border-dashed border-line-strong py-5 text-center transition-colors hover:border-ink"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      addReferences(event.dataTransfer.files);
                    }}
                  >
                    <span className="grid size-10 place-items-center rounded-full bg-coral-50 text-coral-700">
                      <IconUpload className="size-5" />
                    </span>
                    <span className="text-[15px] font-bold">Adicionar arquivos</span>
                    <span className="text-caption text-muted">clique ou arraste aqui</span>
                    <input
                      type="file"
                      multiple
                      accept={PRODUCTION_ACCEPT}
                      className="sr-only"
                      onChange={(event) => {
                        addReferences(event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  {refError && (
                    <p role="alert" className="mt-2 text-caption font-semibold text-coral-700">
                      {refError}
                    </p>
                  )}
                  {references.length > 0 && (
                    <ul className="mt-3 grid gap-2">
                      {references.map((file, i) => (
                        <li key={`${file.name}:${i}`} className="flex items-center gap-3 rounded-control bg-white p-2 ring-1 ring-line">
                          <FileThumb file={file} className="size-10" />
                          <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                          <Button variant="link" size="sm" onClick={() => setReferences((list) => list.filter((_, k) => k !== i))}>
                            Remover
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <aside className="h-fit rounded-card bg-mist p-5">
                <span className="grid size-11 place-items-center rounded-full bg-coral-700 text-white">
                  <IconBrush className="size-5" />
                </span>
                <p className="mt-3 text-[15px] font-bold">Criação de arte</p>
                <p className="mt-1 text-amount text-ink">{formatBRL(creation.price)}</p>
                <p className="mt-2 text-caption text-muted">Somado ao item. A equipe de criação da Padrão monta a arte a partir do que você contar aqui e fala com você pelos dados da sua conta.</p>
              </aside>
            </div>
          )
        )}

        {details && <DetalhesDaArte details={details} className="mt-6 border-t border-line pt-6" />}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line bg-white px-5 py-4 md:px-8">
        {tab === "criar" && creation ? (
          <>
            <Button
              variant="buy"
              disabled={!briefingOk}
              onClick={() => {
                creation.onRequest({ briefing: briefing.trim(), references });
                onClose();
              }}
            >
              {creation.request ? "Salvar o pedido de criação" : `Solicitar criação · ${formatBRL(creation.price)}`}
            </Button>
            {creation.request && (
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  creation.onRequest(null);
                  setTab("enviar");
                }}
              >
                Cancelar a criação
              </Button>
            )}
            {!briefingOk && <p className="text-caption text-muted">Conte o que vai na arte para pedir a criação.</p>}
          </>
        ) : (
          <>
            <Button variant={sent ? "buy" : "outline"} size={sent ? "md" : "sm"} onClick={onClose}>
              {sent ? "Concluir" : "Voltar"}
            </Button>
            {sent && <p className="text-caption text-muted">Você pode trocar ou tirar os arquivos depois.</p>}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * A arte em destaque: o mockup 3D do produto com ela (foto da página, tirada depois que a textura carrega), ou a
 * miniatura do arquivo da frente, ou o tipo do arquivo quando o navegador não lê (AI, CDR, PSD).
 */
function ArtPreview({ files, types, snapMockup, previewKey, previewImage }: { files: Files; types: readonly string[]; snapMockup?: (() => string | null) | null; previewKey: string; previewImage: string | null }) {
  const [shot, setShot] = useState<{ key: string; src: string | null }>({ key: "", src: null });
  useEffect(() => {
    if (!snapMockup || !previewKey) return;
    // A textura da arte carrega depois do envio: duas fotos, a segunda já com a arte certa.
    const timers = [700, 1600].map((ms) => window.setTimeout(() => setShot({ key: previewKey, src: snapMockup() }), ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [snapMockup, previewKey]);
  const mockup = shot.key === previewKey ? shot.src : null;
  const sentList = types.filter((tipo) => files[tipo]);
  const main = files[ARQUIVO_UNICO] ?? files["Impressão Frente"] ?? null;
  const mainThumb = main ? thumbOf(main) : null;
  const artThumb = (previewKey ? previewImage : null) ?? mainThumb;
  const image = mockup ?? artThumb;
  return (
    <aside className="h-fit md:sticky md:top-0">
      <div className="relative grid aspect-square place-items-center overflow-hidden rounded-card bg-[radial-gradient(circle_at_50%_40%,var(--color-white),var(--color-mist))] ring-1 ring-line">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={mockup ? "Sua arte no produto" : "Prévia da sua arte"} className={cx("size-full", mockup ? "object-contain p-2" : "object-contain p-6 drop-shadow-md")} />
        ) : main ? (
          <span className="grid place-items-center gap-2 text-center">
            <span className="grid size-16 place-items-center rounded-thumb bg-white text-lg font-black uppercase text-ink shadow-cartao">{fileExtension(main.name) || "arq"}</span>
            <span className="max-w-52 text-caption text-muted">Sem prévia para este formato. Ele vai para a produção do mesmo jeito.</span>
          </span>
        ) : (
          <span className="grid place-items-center gap-2 px-6 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-white text-coral-700 shadow-cartao">
              <IconCube className="size-6" />
            </span>
            <span className="text-sm font-bold">Sua arte aparece aqui</span>
            <span className="text-caption text-muted">Com PDF, JPG, PNG ou SVG, mostramos a arte no produto.</span>
          </span>
        )}
        {mockup && <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-micro font-bold text-ink shadow-ponto">No produto</span>}
        {/* No mockup a arte pode ficar pequena (área de impressão da peça): ela também aparece inteira no canto. */}
        {mockup && artThumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artThumb} alt="Sua arte" className="absolute bottom-3 right-3 size-20 rounded-thumb bg-white object-contain p-1 shadow-cartao ring-1 ring-line" />
        )}
      </div>
      {sentList.length > 0 && (
        <ul className="mt-3 grid gap-2">
          {sentList.map((tipo) => (
            <li key={tipo} className="flex items-center gap-2.5 rounded-control bg-white p-2 ring-1 ring-line">
              <FileThumb file={files[tipo]} className="size-9" />
              <span className="min-w-0 flex-1">
                <span className="block text-caption font-bold leading-tight">{label(tipo)}</span>
                <span className="block truncate text-caption text-muted">{files[tipo].name}</span>
              </span>
              <IconCheck className="size-4 shrink-0 text-ink" strokeWidth={2.6} />
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

/** Miniatura do arquivo: a imagem quando é imagem; senão o tipo (PDF, AI, CDR…). */
function FileThumb({ file, className }: { file: File; className?: string }) {
  const url = thumbOf(file);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={cx("shrink-0 rounded-thumb bg-mist object-contain", className)} />
  ) : (
    <span className={cx("grid shrink-0 place-items-center rounded-thumb bg-ink text-[10px] font-black uppercase text-white", className)}>{fileExtension(file.name) || "arq"}</span>
  );
}

type TileProps = {
  tipo: string;
  file: File | null;
  /** O que vale sem arquivo (automático ou a arte montada no site). */
  note?: string | null;
  onPick: (tipo: string, file: File | undefined) => void;
  onRemove: () => void;
  error?: string;
  big?: boolean;
};

/** Envio de um arquivo (clique ou arraste); com o arquivo, a miniatura, o nome, o tamanho, "Trocar" e "Remover". */
function FileTile({ tipo, file, note = null, onPick, onRemove, error, big = false }: TileProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const errorId = useId();
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    onPick(tipo, event.dataTransfer.files?.[0]);
  };
  return (
    <div className="mt-2">
      {file ? (
        <div className="flex items-center gap-3 rounded-control bg-white p-3 ring-2 ring-ink">
          <FileThumb file={file} className={big ? "size-14" : "size-11"} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{file.name}</span>
            <span className="block text-caption text-muted">{sizeOf(file)}</span>
            <span className="mt-0.5 flex gap-3">
              <Button variant="link" size="sm" className="min-h-6 text-caption" onClick={() => input.current?.click()}>
                Trocar
              </Button>
              <Button variant="link" size="sm" className="min-h-6 text-caption" onClick={onRemove}>
                Remover
              </Button>
            </span>
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
          aria-describedby={error ? errorId : undefined}
          className={cx(
            "flex w-full flex-col items-center gap-1.5 rounded-control border-2 border-dashed px-3 text-center transition-colors",
            big ? "py-8" : "py-5",
            over ? "border-coral-700 bg-coral-50" : "border-line-strong bg-white hover:border-ink",
          )}
        >
          <span className={cx("grid place-items-center rounded-full bg-coral-50 text-coral-700", big ? "size-12" : "size-9")}>
            <IconUpload className={big ? "size-6" : "size-4"} />
          </span>
          <span className={cx("font-bold", big ? "text-[15px]" : "text-sm")}>{big ? "Arraste o arquivo ou clique para escolher" : "Enviar arquivo"}</span>
          <span className="text-caption text-muted">{note ?? "PDF, JPG, PNG, PSD, AI, CDR"}</span>
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={PRODUCTION_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const picked = event.target.files?.[0];
          event.target.value = "";
          onPick(tipo, picked);
        }}
      />
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-caption font-semibold text-coral-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** Texto em várias linhas com o contador, no mesmo visual do TextField. */
function TextArea({ label: title, value, onChange, maxLength, rows, placeholder, hint }: { label: string; value: string; onChange: (value: string) => void; maxLength: number; rows: number; placeholder?: string; hint?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between gap-3 text-[15px] font-bold">
        <span>{title}</span>
        <span className="text-caption font-normal tabular-nums text-muted" aria-hidden>
          ({value.length}|{maxLength})
        </span>
      </label>
      <textarea
        id={id}
        value={value}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={hint ? `${id}-dica` : undefined}
        className="w-full resize-y rounded-control border border-line bg-white px-[18px] py-3.5 text-body transition-colors placeholder:text-muted focus:border-ink"
      />
      {hint && (
        <p id={`${id}-dica`} className="mt-1.5 text-caption text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

type SummaryProps = Common & {
  /** Abre o "Selecione a arte" para trocar os arquivos. */
  onChange: () => void;
  /** Tira todos os arquivos de produção (volta para montar a arte no site). */
  onClear: () => void;
};

/**
 * Arte enviada para a produção, no passo da arte: os arquivos de cada tipo (e o que o site faz sozinho), com "Trocar
 * arquivos" e "Montar no site". Com o arquivo único, só ele aparece.
 */
export function ProductionSummary({ types, files, automatic, editorFront, editorBack, onChange, onClear }: SummaryProps) {
  const single = files[ARQUIVO_UNICO] ?? null;
  const rows = camposVisiveis(types, files).filter((tipo) => single || tipo !== ARQUIVO_UNICO);
  const fromEditor = (tipo: string) => (tipo === "Impressão Frente" ? editorFront : tipo === "Impressão Verso" ? editorBack : null);
  return (
    <div className="mt-4 rounded-card bg-white p-4 ring-2 ring-ink">
      <p className="flex flex-wrap items-center gap-2 text-[15px] font-bold">
        <span className="grid size-5 place-items-center rounded-full bg-ink text-white">
          <IconCheck className="size-3" strokeWidth={2.8} />
        </span>
        Arte enviada para a produção
      </p>
      <p className="mt-1 text-caption text-muted">
        {single ? "O arquivo único vai sozinho para a produção, como você enviou." : "Estes arquivos vão para a produção como você enviou."} A prévia em 3D é ilustrativa.
      </p>
      <ul className="mt-3 grid gap-2">
        {rows.map((tipo) => {
          const file = files[tipo];
          const note = !file ? (automatic.includes(tipo) ? "feito automaticamente a partir da sua arte" : fromEditor(tipo) ? `a arte montada no site (${fromEditor(tipo)})` : "sem arquivo") : null;
          return (
            <li key={tipo} className="flex items-center gap-3">
              {file ? <FileThumb file={file} className="size-10" /> : <span className="size-10 shrink-0 rounded-thumb border border-dashed border-line-strong" aria-hidden />}
              <span className="min-w-0 flex-1">
                <span className="block text-caption font-bold leading-tight">{label(tipo)}</span>
                <span className={cx("block truncate text-sm", file ? "text-ink" : "text-muted")}>{file ? file.name : note}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        <Button variant="link" size="sm" onClick={onChange}>
          Trocar arquivos
        </Button>
        <Button variant="link" size="sm" onClick={onClear}>
          Montar a arte no site
        </Button>
      </div>
    </div>
  );
}

/** Criação de arte pedida, no passo da arte: o pedido, as referências e o preço, com "Alterar" e "Cancelar". */
export function CreationSummary({ creation, onChange }: { creation: ArtCreation & { request: ArtRequest }; onChange: () => void }) {
  return (
    <div className="mt-4 rounded-card bg-white p-4 ring-2 ring-coral-700">
      <p className="flex flex-wrap items-center gap-2 text-[15px] font-bold">
        <span className="grid size-6 place-items-center rounded-full bg-coral-700 text-white">
          <IconBrush className="size-3.5" />
        </span>
        Criação de arte solicitada
        <span className="font-normal text-muted">· + {formatBRL(creation.price)} no item</span>
      </p>
      <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm">{creation.request.briefing}</p>
      {creation.request.references.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {creation.request.references.map((file, i) => (
            <li key={`${file.name}:${i}`} className="flex items-center gap-2 rounded-full bg-mist py-1 pl-1 pr-3 text-caption">
              <FileThumb file={file} className="size-6 rounded-full" />
              <span className="max-w-40 truncate">{file.name}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        <Button variant="link" size="sm" onClick={onChange}>
          Alterar o pedido
        </Button>
        <Button variant="link" size="sm" onClick={() => creation.onRequest(null)}>
          Cancelar a criação
        </Button>
      </div>
    </div>
  );
}
