import { cx } from "@/components/ui/cx";
import { PALETTES } from "@/lib/multiloja/core";
import { CANTOS, FUNDOS, type Secao, type Tema } from "@/lib/multiloja/tema";
import { FONTE_FAMILIA } from "@/components/vitrine/loja/estilo";

/*
 * Miniatura de um tema (modelos prontos do editor): desenho esquemático da página com a cor, a fonte dos títulos,
 * os cantos e o fundo de verdade. Decorativa (aria-hidden): o nome e a descrição do modelo ficam no cartão.
 */

const DARK = "var(--color-ink-soft)";

function Bloco({ secao, p, radius }: { secao: Secao; p: (typeof PALETTES)[keyof typeof PALETTES]; radius: string }) {
  const r = { borderRadius: radius };
  switch (secao.tipo) {
    case "hero": {
      const bg = secao.fundo === "cor" ? p.dark : secao.fundo === "escuro" ? DARK : secao.fundo === "suave" ? p.soft : "var(--color-paper)";
      const dark = secao.fundo === "cor" || secao.fundo === "escuro" || secao.layout === "fundo";
      return (
        <div className={cx("flex items-center gap-2 px-2.5 py-3", secao.layout !== "esquerda" && "flex-col text-center")} style={{ background: secao.layout === "fundo" ? `linear-gradient(135deg, ${DARK}, ${p.dark})` : bg }}>
          <div className="min-w-0 flex-1">
            <p className="font-titulo text-[11px] font-bold leading-none" style={{ color: dark ? "var(--color-paper)" : DARK }}>
              Sua loja
            </p>
            <span className="mx-auto mt-1.5 block h-1 w-12 rounded-full" style={{ background: dark ? "rgb(255 255 255 / .5)" : "rgb(0 0 0 / .15)", marginInline: secao.layout === "esquerda" ? 0 : undefined }} />
            <span className="mt-1.5 inline-block h-2.5 w-9 rounded-full" style={{ background: dark ? "var(--color-paper)" : p.main }} />
          </div>
          {secao.layout === "esquerda" && <span className="h-9 w-12 shrink-0" style={{ ...r, background: dark ? "rgb(255 255 255 / .2)" : p.tint }} />}
        </div>
      );
    }
    case "banners":
      return (
        <div className="px-2 pt-2">
          <div className="h-8" style={{ ...r, background: `linear-gradient(120deg, ${p.tint}, ${p.main})` }} />
        </div>
      );
    case "vantagens":
      return (
        <div className="grid grid-cols-3 gap-1 px-2 pt-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-3 bg-white" style={{ ...r, boxShadow: "0 0 0 1px rgb(0 0 0 / .06)" }} />
          ))}
        </div>
      );
    case "categorias":
      return (
        <div className="flex justify-center gap-1 px-2 pt-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={secao.estilo === "circulos" ? "size-4 rounded-full" : secao.estilo === "pilulas" ? "h-2.5 w-6 rounded-full border" : "h-4 w-5"} style={{ ...(secao.estilo === "cartoes" ? r : {}), background: secao.estilo === "pilulas" ? "var(--color-paper)" : p.soft, borderColor: "rgb(0 0 0 / .15)" }} />
          ))}
        </div>
      );
    case "produtos":
      return (
        <div className="grid grid-cols-4 gap-1 px-2 pt-2">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="flex flex-col gap-0.5 bg-white p-0.5" style={{ ...r, boxShadow: "0 0 0 1px rgb(0 0 0 / .06)" }}>
              <span className="aspect-square" style={{ ...r, background: "var(--color-mist)" }} />
              <span className="mx-auto h-0.5 w-3 rounded-full" style={{ background: p.dark }} />
            </span>
          ))}
        </div>
      );
    case "chamada":
      return (
        <div className="px-2 pt-2">
          <div className="flex h-5 items-center justify-between px-1.5" style={{ ...r, background: secao.fundo === "cor" ? p.dark : secao.fundo === "escuro" ? DARK : p.soft }}>
            <span className="h-1 w-10 rounded-full" style={{ background: secao.fundo === "suave" ? "rgb(0 0 0 / .2)" : "rgb(255 255 255 / .6)" }} />
            <span className="h-2 w-5 rounded-full" style={{ background: secao.fundo === "suave" ? p.main : "var(--color-paper)" }} />
          </div>
        </div>
      );
    case "texto":
    case "perguntas":
      return (
        <div className="space-y-0.5 px-3 pt-2">
          {[10, 9, 7].map((w, i) => (
            <span key={i} className="block h-0.5 rounded-full bg-black/15" style={{ width: `${w * 8}%` }} />
          ))}
        </div>
      );
    case "depoimentos":
      return (
        <div className="grid grid-cols-3 gap-1 px-2 pt-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-4 bg-white px-0.5 text-[7px] font-bold leading-none" style={{ ...r, color: p.main, boxShadow: "0 0 0 1px rgb(0 0 0 / .06)" }}>
              “
            </span>
          ))}
        </div>
      );
  }
}

export default function Miniatura({ tema, className }: { tema: Tema; className?: string }) {
  const p = PALETTES[tema.estilo.paleta];
  const radius = CANTOS[tema.estilo.cantos].thumb;
  const bg = tema.estilo.fundo === "marca" ? p.soft : FUNDOS[tema.estilo.fundo].cor;
  const footer = tema.rodape.estilo === "claro" ? "var(--color-fog)" : tema.rodape.estilo === "marca" ? p.dark : "var(--color-ink-soft)";
  const center = tema.cabecalho.estilo === "centralizado";
  const visible = tema.secoes.filter((s) => s.visivel).slice(0, 5);
  return (
    <div aria-hidden className={cx("flex h-44 flex-col overflow-hidden border border-line", className)} style={{ background: bg, ["--font-titulo" as string]: FONTE_FAMILIA[tema.estilo.fonte] }}>
      {tema.cabecalho.aviso && <span className="h-1.5 shrink-0" style={{ background: p.dark }} />}
      <div className={cx("flex h-5 shrink-0 items-center gap-1 border-b border-black/5 bg-white px-2", center && "justify-center")}>
        <span className="size-2.5 rounded-sm" style={{ background: p.main }} />
        <span className="h-1 w-6 rounded-full bg-black/25" />
        {!center && <span className="ml-auto h-1.5 w-8 rounded-full bg-black/10" />}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden pb-1">
        {visible.map((s) => (
          <Bloco key={s.id} secao={s} p={p} radius={radius} />
        ))}
      </div>
      <span className="h-3 shrink-0" style={{ background: footer }} />
    </div>
  );
}
