"use client";

import { useState } from "react";
import { IconDownload } from "@/components/facade/icons";
import { cx } from "@/components/ui/cx";
import { downloadPrintFile } from "./print-store";

/** "Arte no gabarito (PDF)": baixa o arquivo de impressão guardado neste navegador. */
export function PrintFileLink({ file, className }: { file: { id: string; name: string }; className?: string }) {
  const [missing, setMissing] = useState(false);
  return (
    <span className={cx("inline-flex flex-wrap items-center gap-x-2 text-caption", className)}>
      <button
        type="button"
        onClick={async () => setMissing(!(await downloadPrintFile(file.id)))}
        className="inline-flex min-h-6 items-center gap-1 font-semibold text-preview underline underline-offset-2 hover:no-underline"
      >
        <IconDownload aria-hidden className="size-3.5" />
        Arte no gabarito (PDF)<span className="sr-only">: {file.name}</span>
      </button>
      {/* Sempre montado: o leitor de tela anuncia quando o arquivo não existe mais. */}
      <span role="status" className="text-coral-700">
        {missing ? "não está mais neste navegador" : ""}
      </span>
    </span>
  );
}
