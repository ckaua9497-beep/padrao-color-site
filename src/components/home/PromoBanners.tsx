import type { CSSProperties } from "react";
import { cx } from "@/components/ui/cx";
import { linhasDeFaixas, type Banner } from "@/lib/midia";
import { BannerImagem, BannerLink, proporcoes, type Tela } from "./BannerImagem";

/*
 * Faixas promocionais da página inicial (admin → Site → Banners → Faixas; sem faixa salva, o banner largo "Cartões de
 * visita e postais" do Figma). As faixas da mesma linha dividem a largura com a mesma altura: cada uma ocupa a parte
 * proporcional à sua imagem (como os "botões" do site atual: Revendedor largo ao lado de Blog e Neon). No celular, uma
 * embaixo da outra. Cantos retos, como no Figma (1063 px de largura no quadro de 1280; segue o conteúdo até 1300 px).
 */

export default function PromoBanners({ banners, forcar, className }: { banners: Banner[]; forcar?: Tela; className?: string }) {
  if (!banners.length) return null;
  const celular = forcar === "mobile";
  return (
    <div className={cx("space-y-4", className)}>
      {linhasDeFaixas(banners).map((linha) => {
        const soma = linha.reduce((s, b) => s + b.desktop.w / b.desktop.h, 0);
        return (
          <div key={linha[0].id} className={cx("flex gap-4", celular ? "flex-col" : "flex-col md:flex-row")}>
            {linha.map((b) => {
              const parte = b.desktop.w / b.desktop.h;
              return (
                <BannerLink key={b.id} banner={b} className={cx("group block min-w-0", !celular && "md:[flex:var(--parte)_1_0%]")} style={{ "--parte": parte } as CSSProperties}>
                  <span className="relative block aspect-(--ar-m) overflow-hidden bg-foto md:aspect-(--ar-d)" style={proporcoes(b, forcar)}>
                    <BannerImagem
                      banner={b}
                      forcar={forcar}
                      sizes={`(min-width: 1280px) ${Math.round((1300 * parte) / soma)}px, (min-width: 768px) ${Math.round((100 * parte) / soma)}vw, 100vw`}
                      className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-card group-hover:scale-[1.02]"
                    />
                  </span>
                </BannerLink>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
