import { buttonClass } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";

/** Extensão do arquivo do gabarito (zip, rar, pdf…). */
export function templateExtension(url: string): string {
  return (/\.([a-z0-9]{2,4})$/i.exec(url.trim())?.[1] ?? "zip").toLowerCase();
}

/**
 * Cartão "Gabarito do produto": baixa pela rota /api/gabarito/[id] (nome de arquivo amigável, só do servidor da Padrão).
 * Fica logo abaixo da foto/3D e em destaque (revisão da Padrão de 25/10/2026: "mover o download de gabarito para logo
 * abaixo da foto / mockup do produto e colocar com um destaque").
 */
export default function TemplateDownload({
  productId,
  template,
  name,
  facts = null,
  className,
}: {
  productId: string;
  template: string;
  name: string;
  /** Medidas reais do gabarito na seleção atual ("Tamanho final 9 × 5 cm", "sangria 2 mm"…). */
  facts?: string[] | null;
  className?: string;
}) {
  const ext = templateExtension(template);
  return (
    <div className={cx("flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card bg-coral-50 p-4 ring-1 ring-coral-100", className)}>
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-coral-700">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
          <path d="M14 3v5h5M12 11v6m0 0-2.5-2.5M12 17l2.5-2.5" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold">Gabarito do produto</p>
        <p className="text-caption text-muted">{facts?.length ? `${facts.join(" · ")}. Monte a arte em cima dele ou envie a sua: nós encaixamos.` : "Medidas, sangria e área de segurança para montar a arte."}</p>
      </div>
      <a href={`/api/gabarito/${encodeURIComponent(productId)}`} download className={buttonClass({ variant: "dark", size: "sm" })} aria-label={`Baixar gabarito de ${name} (arquivo .${ext})`}>
        Baixar gabarito .{ext}
      </a>
    </div>
  );
}
