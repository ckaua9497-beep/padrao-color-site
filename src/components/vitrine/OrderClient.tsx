"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ART_EXTENSIONS, ART_MAX_MB } from "@/lib/api/validation";

/* Partes interativas da página do pedido: espera do pagamento, Pix, simulação (dev) e envio de arte. */

/** Enquanto o pagamento não chega, consulta o pedido a cada 5 s e atualiza a página quando muda. */
export function PaymentWatcher({ codigo, token, status }: { codigo: string; token: string; status: string }) {
  const router = useRouter();
  useEffect(() => {
    if (status !== "aguardando_pagamento") return;
    const id = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const res = await fetch(`/api/multiloja/pedido/${codigo}?t=${encodeURIComponent(token)}`, { cache: "no-store" }).catch(() => null);
      const data = (await res?.json().catch(() => null)) as { status?: string } | null;
      if (data?.status && data.status !== status) router.refresh();
    }, 5000);
    return () => window.clearInterval(id);
  }, [codigo, token, status, router]);
  return null;
}

export function PixBox({ code, image, expiresAt, simulated, codigo, token }: { code: string; image?: string; expiresAt?: string; simulated: boolean; codigo: string; token: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [simulating, setSimulating] = useState(false);
  return (
    <div className="grid gap-5 md:grid-cols-[220px_1fr] md:items-center">
      <div className="grid aspect-square w-full max-w-[220px] place-items-center rounded-card border border-line bg-white p-3">
        {image ? (
          <Image src={image} alt="QR Code do Pix" width={200} height={200} unoptimized className="size-full" />
        ) : (
          <p className="px-3 text-center text-caption text-muted">{simulated ? "QR Code de teste (ambiente de desenvolvimento)" : "Use o código copia e cola ao lado"}</p>
        )}
      </div>
      <div className="min-w-0 space-y-3">
        <p className="text-[15px]">Abra o app do seu banco, escolha Pix e leia o QR Code ou cole o código:</p>
        <p className="break-all rounded-control bg-mist p-3 font-mono text-[13px]">{code}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2500);
              } catch {
                window.prompt("Copie o código Pix:", code);
              }
            }}
          >
            <span aria-live="polite">{copied ? "Código copiado!" : "Copiar código Pix"}</span>
          </Button>
          {simulated && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={simulating}
              onClick={async () => {
                setSimulating(true);
                await fetch("/api/multiloja/pagamento/simular", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo, token }) }).catch(() => undefined);
                router.refresh();
                setSimulating(false);
              }}
            >
              Simular pagamento (teste)
            </Button>
          )}
        </div>
        {expiresAt && <p className="text-caption text-muted">O código vale até {new Date(expiresAt).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}.</p>}
      </div>
    </div>
  );
}

/** Envio (ou troca) da arte de um item. */
export function ArtUpload({ codigo, token, posicao, hasArt }: { codigo: string; token: string; posicao: number; hasArt: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; message: string | null; ok: boolean }>({ busy: false, message: null, ok: false });
  const inputId = `arte-${posicao}`;
  return (
    <div className="mt-2">
      <label htmlFor={inputId} className="inline-flex h-9 cursor-pointer items-center rounded-full border border-line-strong px-4 text-[13px] font-bold hover:border-ink">
        {state.busy ? "Enviando…" : hasArt ? "Trocar arte" : "Enviar arte"}
      </label>
      <input
        id={inputId}
        type="file"
        className="sr-only"
        accept={ART_EXTENSIONS.map((e) => `.${e}`).join(",")}
        disabled={state.busy}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setState({ busy: true, message: null, ok: false });
          const form = new FormData();
          form.append("arquivo", file);
          const res = await fetch(`/api/multiloja/pedido/${codigo}/arte?t=${encodeURIComponent(token)}&item=${posicao}`, { method: "POST", body: form }).catch(() => null);
          const data = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
          setState({ busy: false, ok: Boolean(data?.ok), message: data?.ok ? "Arte recebida." : (data?.error ?? "Não foi possível enviar. Tente de novo.") });
          if (data?.ok) router.refresh();
        }}
      />
      <p className="mt-1 text-[12px] text-muted">
        PDF, PNG, JPG, AI, CDR… até {ART_MAX_MB} MB.{" "}
        {state.message && (
          <span role="status" className={state.ok ? "font-semibold text-ink" : "font-semibold text-coral-700"}>
            {state.message}
          </span>
        )}
      </p>
    </div>
  );
}

/** Gera outra cobrança (Pix vencido, link expirado ou cobrança que não abriu) e recarrega a página. */
export function RenewCharge({ codigo, token, label }: { codigo: string; token: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch(`/api/multiloja/pedido/${codigo}/cobranca?t=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => null);
          const data = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
          if (data?.ok) router.refresh();
          else setError(data?.error ?? "Não foi possível gerar agora. Tente de novo.");
          setBusy(false);
        }}
      >
        {label}
      </Button>
      {error && (
        <p role="alert" className="text-caption font-semibold text-coral-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** Botão de teste: marca o pedido como pago (só gateway "simulado", só fora de produção). */
export function SimulatePayment({ codigo, token }: { codigo: string; token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/multiloja/pagamento/simular", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo, token }) }).catch(() => undefined);
        router.refresh();
        setBusy(false);
      }}
    >
      Simular pagamento (teste)
    </Button>
  );
}

/** Boleto: linha digitável para copiar, PDF e vencimento (e o Pix do boleto, quando o gateway manda). */
export function BoletoBox({ line, url, expiresAt, simulated, codigo, token }: { line: string; url?: string; expiresAt?: string; simulated: boolean; codigo: string; token: string }) {
  const [copied, setCopied] = useState(false);
  const due = expiresAt ? new Date(`${expiresAt.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : null;
  return (
    <div className="space-y-3">
      <p className="text-[15px]">Pague no app do banco (código de barras) ou em lotéricas e agências{due ? ` até ${due}` : ""}.</p>
      <p className="break-all rounded-control bg-mist p-3 font-mono text-[14px] tracking-wide">{line}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(line.replace(/\D/g, ""));
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2500);
            } catch {
              window.prompt("Copie a linha digitável:", line);
            }
          }}
        >
          <span aria-live="polite">{copied ? "Linha copiada!" : "Copiar linha digitável"}</span>
        </Button>
        {url && (
          <Button href={url} target="_blank" rel="noreferrer" variant="outline" size="sm">
            Abrir boleto (PDF)
          </Button>
        )}
        {simulated && <SimulatePayment codigo={codigo} token={token} />}
      </div>
      <p className="text-caption text-muted">O banco avisa o pagamento em até 2 dias úteis; esta página atualiza sozinha.</p>
    </div>
  );
}
