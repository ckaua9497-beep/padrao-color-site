"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { IconUpload } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { cx } from "@/components/ui/cx";
import { ART_EXTENSIONS, ART_MAX_MB, artFileProblem } from "@/lib/api/validation";
import { postForm, postJson } from "./client-api";
import { FormAlert } from "./FormBits";

const CANCEL_REASONS = ["Desisti da compra", "Escolhi o produto ou a opção errada", "Vou mandar outra arte em um novo pedido", "O prazo não me atende", "Outro motivo"] as const;

const sizeLabel = (bytes: number) => `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;

/** Reenviar arte (quando a Padrão pede) → POST /api/pedidos/[pedido]/arte. */
function ResendArt({ order, onDone }: { order: number; onDone: (message: string) => void }) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = (picked: File | undefined) => {
    setError(null);
    if (!picked) {
      setFile(null);
      return;
    }
    const problem = artFileProblem(picked.name, picked.size);
    if (problem) {
      setFile(null);
      setError(problem);
      return;
    }
    setFile(picked);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setError("Escolha o arquivo da arte.");
      return;
    }
    setBusy(true);
    const form = new FormData();
    form.append("arquivo", file);
    const reply = await postForm<{ message?: string }>(`/api/pedidos/${order}/arte`, form);
    setBusy(false);
    if (!reply.ok) {
      setError(reply.error);
      return;
    }
    onDone(reply.data.message ?? "Arte enviada.");
  };

  return (
    <form onSubmit={submit} noValidate className="mt-3 space-y-3 rounded-control bg-mist p-4">
      <label htmlFor={inputId} className="flex cursor-pointer flex-wrap items-center gap-3 rounded-control border border-dashed border-line-strong bg-white p-4 text-sm hover:border-ink">
        <IconUpload aria-hidden className="size-5 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{file ? file.name : "Escolher arquivo da arte"}</span>
          <span className="text-caption text-muted">
            {file ? sizeLabel(file.size) : `${ART_EXTENSIONS.map((e) => e.toUpperCase()).join(", ")} · até ${ART_MAX_MB} MB`}
          </span>
        </span>
        <input
          id={inputId}
          type="file"
          className="sr-only"
          accept={ART_EXTENSIONS.map((e) => `.${e}`).join(",")}
          onChange={(event) => choose(event.target.files?.[0])}
        />
      </label>
      {error && <FormAlert>{error}</FormAlert>}
      <Button type="submit" variant="dark" size="sm" loading={busy} disabled={!file}>
        {busy ? "Enviando… arquivos grandes podem levar alguns minutos" : "Enviar arte"}
      </Button>
    </form>
  );
}

/** Cancelar pedido com motivo e confirmação → POST /api/pedidos/[pedido]/cancelar. */
function CancelOrder({ order, jobName, open, onClose, onDone }: { order: number; jobName: string; open: boolean; onClose: () => void; onDone: (message: string) => void }) {
  const [reason, setReason] = useState<string>(CANCEL_REASONS[0]);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const detailsId = useId();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (reason === "Outro motivo" && details.trim().length < 3) {
      setError("Conte o motivo do cancelamento.");
      return;
    }
    setBusy(true);
    setError(null);
    const motivo = [reason, details.trim()].filter(Boolean).join(": ").slice(0, 300);
    const reply = await postJson<{ message?: string }>(`/api/pedidos/${order}/cancelar`, { motivo });
    setBusy(false);
    if (!reply.ok) {
      setError(reply.error);
      return;
    }
    onDone(reply.data.message ?? "Pedido cancelado.");
  };

  return (
    <Dialog open={open} onClose={onClose} label={`Cancelar o pedido ${order}`} className="max-w-lg p-6 md:p-8">
      <form onSubmit={submit} noValidate>
        <h2 className="text-xl font-bold">Cancelar o pedido {order}?</h2>
        <p className="mt-2 text-sm text-muted">
          {jobName ? `“${jobName}”. ` : ""}Pedidos que já entraram em produção podem não ser cancelados: nesse caso a Padrão Color avisa o motivo.
        </p>
        <fieldset className="mt-5 space-y-2">
          <legend className="text-[15px] font-bold">Motivo</legend>
          {CANCEL_REASONS.map((value) => (
            <label key={value} className={cx("flex items-center gap-3 rounded-thumb border p-3 text-sm transition-colors", reason === value ? "border-ink bg-mist" : "border-line")}>
              <input type="radio" name={`motivo-${order}`} checked={reason === value} onChange={() => setReason(value)} className="size-4 accent-ink" />
              {value}
            </label>
          ))}
        </fieldset>
        <label htmlFor={detailsId} className="mt-4 block text-[15px] font-bold">
          Detalhes {reason === "Outro motivo" ? "" : "(opcional)"}
        </label>
        <textarea
          id={detailsId}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          maxLength={200}
          rows={3}
          className="mt-1.5 w-full rounded-control border border-line bg-white p-3 text-body focus:border-ink"
        />
        {error && <FormAlert className="mt-3">{error}</FormAlert>}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="submit" variant="dark" size="sm" loading={busy}>
            Cancelar pedido
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Manter pedido
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Ações de um pedido (item da compra) em /conta/pedidos. */
export function OrderActions({ order, jobName, canResendArt, canCancel }: { order: number; jobName: string; canResendArt: boolean; canCancel: boolean }) {
  const router = useRouter();
  const [artOpen, setArtOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const finish = (text: string) => {
    setMessage(text);
    setArtOpen(false);
    setCancelOpen(false);
    router.refresh();
  };

  if (!canResendArt && !canCancel && !message) return null;
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {canResendArt && (
          <Button variant={artOpen ? "dark" : "buy"} size="sm" onClick={() => setArtOpen((open) => !open)} aria-expanded={artOpen}>
            Reenviar arte
          </Button>
        )}
        {canCancel && (
          <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}>
            Cancelar pedido
          </Button>
        )}
      </div>
      {artOpen && <ResendArt order={order} onDone={finish} />}
      {message && (
        <FormAlert tone="success" className="mt-3">
          {message}
        </FormAlert>
      )}
      {canCancel && <CancelOrder order={order} jobName={jobName} open={cancelOpen} onClose={() => setCancelOpen(false)} onDone={finish} />}
    </div>
  );
}
