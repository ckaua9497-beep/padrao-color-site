"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { IconUpload, IconWhatsApp } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { cx } from "@/components/ui/cx";
import { ART_EXTENSIONS, ART_MAX_MB, artFileProblem } from "@/lib/api/validation";
import { HORA_LIMITE } from "@/lib/dias-uteis";
import { STORE } from "@/lib/store";
import { postForm, postJson } from "./client-api";
import { FormAlert } from "./FormBits";

const CANCEL_REASONS = ["Desisti da compra", "Escolhi o produto ou a opção errada", "Vou mandar outra arte em um novo pedido", "O prazo não me atende", "Outro motivo"] as const;

const sizeLabel = (bytes: number) => `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;

/** Previsão do item e a que vale se a arte chegar agora (fora do expediente: dias-uteis.ts). */
export type ResendForecast = { previsao: string; novaPrevisao: string | null };

/** Reenviar arte (quando a Padrão pede) → POST /api/pedidos/[pedido]/arte. */
function ResendArt({ order, forecast, onDone }: { order: number; forecast: ResendForecast | null; onDone: (message: string) => void }) {
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
      <p className="text-caption text-muted">
        Arte reenviada até as {HORA_LIMITE}h de um dia útil mantém a previsão. Depois disso, ou em dia não útil, ela conta a partir do próximo dia útil e a previsão aumenta 1 dia útil.
      </p>
      {forecast?.novaPrevisao && (
        <FormAlert tone="info">
          Enviando agora, a previsão passa de {forecast.previsao} para {forecast.novaPrevisao}.
        </FormAlert>
      )}
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

/** O que o diálogo de cancelamento cancela: um item (/api/pedidos/[pedido]/cancelar) ou a compra inteira. */
type CancelTarget = { url: string; title: string; intro: string; confirm: string; keep: string };

/** Cancelamento com motivo, estorno e confirmação. */
function CancelDialog({ target, refund, until, open, onClose, onDone }: { target: CancelTarget; refund: string[]; until: string | null; open: boolean; onClose: () => void; onDone: (message: string) => void }) {
  const [reason, setReason] = useState<string>(CANCEL_REASONS[0]);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const detailsId = useId();
  const groupName = useId();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (reason === "Outro motivo" && details.trim().length < 3) {
      setError("Conte o motivo do cancelamento.");
      return;
    }
    setBusy(true);
    setError(null);
    const motivo = [reason, details.trim()].filter(Boolean).join(": ").slice(0, 300);
    const reply = await postJson<{ message?: string }>(target.url, { motivo });
    setBusy(false);
    if (!reply.ok) {
      setError(reply.error);
      return;
    }
    onDone(reply.data.message ?? "Cancelado.");
  };

  return (
    <Dialog open={open} onClose={onClose} label={target.title} className="max-w-lg p-6 md:p-8">
      <form onSubmit={submit} noValidate>
        <h2 className="text-xl font-bold">{target.title}</h2>
        <p className="mt-2 text-sm text-muted">
          {target.intro}
          {until ? ` Dá para cancelar pelo site até as ${until}.` : ""}
        </p>
        <div className="mt-4 rounded-thumb bg-mist p-3 text-sm">
          <p className="font-bold">Estorno</p>
          <ul className="mt-1 space-y-1">
            {refund.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <fieldset className="mt-5 space-y-2">
          <legend className="text-[15px] font-bold">Motivo</legend>
          {CANCEL_REASONS.map((value) => (
            <label key={value} className={cx("flex items-center gap-3 rounded-thumb border p-3 text-sm transition-colors", reason === value ? "border-ink bg-mist" : "border-line")}>
              <input type="radio" name={groupName} checked={reason === value} onChange={() => setReason(value)} className="size-4 accent-ink" />
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
            {target.confirm}
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            {target.keep}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Prazo de cancelamento ainda aberto: fecha sozinho no fim dos 15 min (a rota confere de novo). */
function useStillOpen(until: number | null): boolean {
  const [open, setOpen] = useState(until !== null);
  useEffect(() => {
    if (until === null) return;
    const id = window.setTimeout(() => setOpen(false), Math.max(0, until - Date.now()));
    return () => window.clearTimeout(id);
  }, [until]);
  return open && until !== null;
}

/** Cancelamento que o servidor liberou: fim do prazo (ms e hora em Brasília) e as frases do estorno. */
export type CancelWindow = { until: number; untilTime: string | null; refund: string[] };

/**
 * Faixa da compra em /conta/pedidos: "Cancelar compra" enquanto o prazo de 15 min está aberto. Fica sempre montada
 * (cancel null fora do prazo) para a mensagem do cancelamento continuar depois do router.refresh().
 */
export function PurchaseCancel({ purchase, items, cancel }: { purchase: number; items: string[]; cancel: CancelWindow | null }) {
  const router = useRouter();
  const open = useStillOpen(cancel?.until ?? null);
  const [dialog, setDialog] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (message)
    return (
      <FormAlert tone="success" className="mx-5 mt-4 md:mx-6">
        {message}
      </FormAlert>
    );
  if (!open || !cancel) return null;
  const target: CancelTarget = {
    url: `/api/pedidos/compra/${purchase}/cancelar`,
    title: `Cancelar a compra nº ${purchase}?`,
    intro: items.length > 1 ? `Os ${items.length} itens que ainda não saíram (${items.join(", ")}) não entram em produção.` : `${items[0] ? `“${items[0]}” ` : "O item "}não entra em produção.`,
    confirm: "Cancelar compra",
    keep: "Manter compra",
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-sun-50 px-5 py-3 text-sm md:px-6">
      <p>
        Mudou de ideia? Você pode cancelar {items.length > 1 ? "a compra inteira ou só um item" : "esta compra"}
        {cancel.untilTime ? ` até as ${cancel.untilTime}` : ""}.
      </p>
      <Button variant="outline" size="sm" onClick={() => setDialog(true)}>
        Cancelar compra
      </Button>
      <CancelDialog
        target={target}
        refund={cancel.refund}
        until={cancel.untilTime}
        open={dialog}
        onClose={() => setDialog(false)}
        onDone={(text) => {
          setMessage(text);
          setDialog(false);
          router.refresh();
        }}
      />
    </div>
  );
}

/**
 * Ações de um pedido (item da compra) em /conta/pedidos. `tratamento`: o WhatsApp do setor de tratamento de arquivos
 * (#PROBLEMANOPEDIDO), em todo item que não foi cancelado.
 */
export function OrderActions({ order, jobName, resend, cancel, tratamento }: { order: number; jobName: string; resend: ResendForecast | false; cancel: CancelWindow | null; tratamento: boolean }) {
  const router = useRouter();
  const [artOpen, setArtOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canCancel = useStillOpen(cancel?.until ?? null);

  const finish = (text: string) => {
    setMessage(text);
    setArtOpen(false);
    setCancelOpen(false);
    router.refresh();
  };

  if (!resend && !canCancel && !tratamento && !message) return null;
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {resend && (
          <Button variant={artOpen ? "dark" : "buy"} size="sm" onClick={() => setArtOpen((open) => !open)} aria-expanded={artOpen}>
            Reenviar arte
          </Button>
        )}
        {canCancel && (
          <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}>
            Cancelar este item
          </Button>
        )}
        {tratamento && (
          <Button href={STORE.whatsappTratamento} target="_blank" rel="noreferrer" variant="outline" size="sm">
            <IconWhatsApp aria-hidden className="size-4" />
            Falar com o tratamento
          </Button>
        )}
      </div>
      {artOpen && <ResendArt order={order} forecast={resend || null} onDone={finish} />}
      {message && (
        <FormAlert tone="success" className="mt-3">
          {message}
        </FormAlert>
      )}
      {cancel && canCancel && (
        <CancelDialog
          target={{
            url: `/api/pedidos/${order}/cancelar`,
            title: `Cancelar o pedido ${order}?`,
            intro: `${jobName ? `“${jobName}” ` : "Este item "}não entra em produção. Os outros itens da compra continuam.`,
            confirm: "Cancelar este item",
            keep: "Manter item",
          }}
          refund={cancel.refund}
          until={cancel.untilTime}
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          onDone={finish}
        />
      )}
    </div>
  );
}
