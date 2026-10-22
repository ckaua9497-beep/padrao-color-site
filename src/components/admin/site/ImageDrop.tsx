"use client";

import { useId, useRef, useState } from "react";
import { enviarImagemSite } from "@/app/(admin)/admin/site-actions";
import { IconUpload } from "@/components/icons";
import { cx } from "@/components/ui/cx";
import type { ImagemSite } from "@/lib/midia";

/*
 * Área de soltar imagem do admin → Site: arrastar arquivos (ou clicar e escolher) envia cada imagem para o servidor
 * (uma por vez, para caber no limite de envio) e devolve a imagem guardada com largura e altura.
 */

type Props = {
  tipo: "produto" | "categoria" | "banner";
  onEnviada: (imagem: ImagemSite) => void;
  titulo: string;
  dica?: string;
  multiplo?: boolean;
  compacto?: boolean;
  disabled?: boolean;
  className?: string;
};

export function ImageDrop({ tipo, onEnviada, titulo, dica, multiplo = false, compacto = false, disabled = false, className }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const dicaId = useId();
  const [sobre, setSobre] = useState(false);
  const [enviando, setEnviando] = useState<{ atual: number; total: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async (files: File[]) => {
    const lista = (multiplo ? files : files.slice(0, 1)).filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name));
    if (!lista.length) {
      if (files.length) setErro("Envie imagens PNG, JPG ou WebP.");
      return;
    }
    setErro(null);
    const erros: string[] = [];
    for (const [i, file] of lista.entries()) {
      setEnviando({ atual: i + 1, total: lista.length });
      const form = new FormData();
      form.set("arquivo", file);
      form.set("tipo", tipo);
      const r = await enviarImagemSite(form).catch(() => ({ ok: false as const, erro: "Falha de conexão. Tente de novo." }));
      if (r.ok) onEnviada(r.imagem);
      else erros.push(lista.length > 1 ? `${file.name}: ${r.erro}` : r.erro);
    }
    setEnviando(null);
    if (erros.length) setErro(erros.join(" "));
  };

  const ocupado = disabled || enviando !== null;
  return (
    <div className={className}>
      <button
        type="button"
        disabled={ocupado}
        aria-describedby={dica ? dicaId : undefined}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          if (ocupado) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setSobre(true);
        }}
        onDragLeave={() => setSobre(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSobre(false);
          if (!ocupado) void enviar([...e.dataTransfer.files]);
        }}
        className={cx(
          "flex w-full flex-col items-center justify-center gap-1 rounded-card border-2 border-dashed text-center transition-colors disabled:cursor-wait",
          compacto ? "min-h-20 px-3 py-3" : "min-h-32 px-4 py-6",
          sobre ? "border-ink bg-mist" : "border-line-strong bg-white hover:border-ink hover:bg-page-checkout",
        )}
      >
        <IconUpload className={cx("text-muted", compacto ? "size-5" : "size-6")} />
        <span className={cx("font-bold", compacto ? "text-[13px]" : "text-[14px]")} aria-live="polite">
          {enviando ? `Enviando ${enviando.total > 1 ? `${enviando.atual} de ${enviando.total}` : "a imagem"}…` : titulo}
        </span>
        {dica && (
          <span id={dicaId} className="text-caption text-muted">
            {dica}
          </span>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple={multiplo}
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          void enviar(files);
        }}
      />
      {erro && (
        <p role="alert" className="mt-2 text-caption font-semibold text-coral-700">
          {erro}
        </p>
      )}
    </div>
  );
}
