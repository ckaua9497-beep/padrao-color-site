import { getImageProps } from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { imageUrl } from "@/lib/format";
import type { Banner, ImagemSite } from "@/lib/midia";

/*
 * Imagem de um banner do admin: a do celular abaixo de 768 px (quando existe) e a do computador acima, otimizadas
 * pelo next/image. A proporção de cada tela fica reservada no CSS (--ar-m / --ar-d), então a página não pula quando a
 * imagem carrega. `forcar` mostra uma das duas sem depender da largura da tela (prévia do admin).
 */

export type Tela = "desktop" | "mobile";

const ratio = (img: ImagemSite) => `${img.w} / ${img.h}`;

/** Variáveis de proporção para o contêiner (aspect-(--ar-m) md:aspect-(--ar-d)). */
export function proporcoes(base: Pick<Banner, "desktop" | "mobile">, forcar?: Tela): CSSProperties {
  const mobile = base.mobile ?? base.desktop;
  const d = forcar === "mobile" ? mobile : base.desktop;
  const m = forcar === "desktop" ? base.desktop : mobile;
  return { "--ar-d": ratio(d), "--ar-m": ratio(m) } as CSSProperties;
}

type Props = { banner: Banner; forcar?: Tela; sizes: string; prioridade?: boolean; className?: string };

export function BannerImagem({ banner, forcar, sizes, prioridade = false, className }: Props) {
  const carga = prioridade ? ({ loading: "eager", fetchPriority: "high" } as const) : ({ loading: "lazy" } as const);
  const props = (img: ImagemSite) => getImageProps({ alt: banner.alt, src: imageUrl(img.src), width: img.w, height: img.h, sizes, quality: 90, ...carga }).props;
  const unica = forcar === "mobile" ? (banner.mobile ?? banner.desktop) : forcar === "desktop" || !banner.mobile ? banner.desktop : null;
  if (unica) {
    return (
      <picture>
        <img {...props(unica)} alt={banner.alt} className={className} />
      </picture>
    );
  }
  const { srcSet: largo } = props(banner.desktop);
  const { srcSet: estreito, ...rest } = props(banner.mobile ?? banner.desktop);
  return (
    <picture>
      <source media="(min-width: 48rem)" srcSet={largo} sizes={sizes} />
      <img {...rest} srcSet={estreito} alt={banner.alt} className={className} />
    </picture>
  );
}

/** Banner clicável: caminho do site pelo Link do Next; endereço de fora (ou "nova aba") por <a>. Sem link, um bloco. */
export function BannerLink({ banner, className, style, children }: { banner: Banner; className?: string; style?: CSSProperties; children: ReactNode }) {
  if (!banner.href) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }
  const interno = banner.href.startsWith("/");
  if (interno && !banner.novaAba) {
    return (
      <Link href={banner.href} className={className} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <a href={banner.href} className={className} style={style} {...(banner.novaAba ? { target: "_blank", rel: "noopener noreferrer" } : { rel: "noopener" })}>
      {children}
      {banner.novaAba && <span className="sr-only"> (abre em nova aba)</span>}
    </a>
  );
}
