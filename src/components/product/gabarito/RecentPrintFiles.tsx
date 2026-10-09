"use client";

import { useSyncExternalStore } from "react";
import { keptPrintFiles, type KeptPrintFile } from "./print-store";
import { PrintFileLink } from "./PrintFileLink";

const EMPTY: KeptPrintFile[] = [];
let cache: { raw: string | null; list: KeptPrintFile[] } = { raw: null, list: EMPTY };

/** Lê a lista do localStorage só quando o texto muda (snapshot estável para o useSyncExternalStore). */
function snapshot(): KeptPrintFile[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem("padrao-color-arquivos-pedidos");
  } catch {
    raw = null;
  }
  if (raw !== cache.raw) cache = { raw, list: raw ? keptPrintFiles() : EMPTY };
  return cache.list;
}

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

/**
 * "Arte no gabarito dos seus pedidos": os PDFs gerados no site para os pedidos recentes, guardados neste
 * navegador por alguns dias — é o arquivo que o cliente envia se a Padrão Color pedir a arte.
 */
export function RecentPrintFiles({ className }: { className?: string }) {
  const files = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  if (!files.length) return null;
  return (
    <section aria-labelledby="arquivos-recentes" className={className}>
      <div className="rounded-card border border-line-strong bg-white p-5">
        <h2 id="arquivos-recentes" className="text-[15px] font-bold">
          Arte no gabarito dos seus pedidos
        </h2>
        <p className="mt-1 text-caption text-muted">PDFs gerados no site, guardados neste navegador por 14 dias. Se a Padrão Color pedir a arte de um pedido, envie o arquivo dele.</p>
        <ul className="mt-3 grid gap-2">
          {files.map((file) => (
            <li key={file.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
              <span>
                <span className="font-semibold">{file.product}</span>
                {file.order ? <span className="text-muted"> · pedido nº {file.order}</span> : null}
              </span>
              <PrintFileLink file={file} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
