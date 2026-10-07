import Image, { getImageProps } from "next/image";
import { Breadcrumb, type Crumb } from "@/components/ui/Breadcrumb";
import { imageUrl } from "@/lib/format";

const SPOTS = [
  { right: "4%", top: "8%", width: "42%" },
  { right: "40%", bottom: "-6%", width: "36%" },
  { right: "-4%", bottom: "-10%", width: "30%" },
];

// Banners de categoria e de tipo de negócio da API: 1440 × 355 px, com o nome já desenhado na arte.
const BANNER_W = 1440;
const BANNER_H = 355;

type Props = {
  title: string;
  subtitle: string;
  crumbs: Crumb[];
  /** Banner da API (desktop e, quando houver, celular). Sem ele, o topo é o bloco colorido com fotos. */
  banner?: { desktop: string; mobile?: string | null } | null;
  images?: string[];
  tone?: string;
};

function BannerArt({ desktop, mobile }: { desktop: string; mobile?: string | null }) {
  const common = { alt: "", width: BANNER_W, height: BANNER_H, sizes: "(min-width: 1440px) 1300px, 100vw", loading: "eager" as const, fetchPriority: "high" as const };
  if (!mobile || mobile === desktop) {
    return <Image {...common} alt="" src={imageUrl(desktop)} className="h-auto w-full" />;
  }
  const {
    props: { srcSet: wide },
  } = getImageProps({ ...common, src: imageUrl(desktop) });
  const {
    props: { srcSet: narrow, ...rest },
  } = getImageProps({ ...common, src: imageUrl(mobile) });
  return (
    <picture className="block">
      <source media="(min-width: 48rem)" srcSet={wide} sizes={common.sizes} />
      <img {...rest} srcSet={narrow} alt="" className="h-auto w-full" />
    </picture>
  );
}

export default function ListingBanner({ title, subtitle, crumbs, banner, images = [], tone = "var(--color-mist)" }: Props) {
  if (banner?.desktop) {
    return (
      <>
        <div className="mt-6 overflow-hidden rounded-card bg-mist">
          <BannerArt desktop={banner.desktop} mobile={banner.mobile} />
        </div>
        <Breadcrumb items={crumbs} className="mt-6" />
        <div className="mb-8 mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-title font-bold">{title}</h1>
          <p className="text-[15px] text-muted">{subtitle}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="relative mt-8 flex min-h-[220px] items-center overflow-hidden rounded-card px-8 py-10 md:min-h-[260px] md:px-14" style={{ background: tone }}>
        <div className="relative z-10 max-w-xl">
          <h1 className="text-display">{title}</h1>
          <p className="mt-3 text-lead text-ink/75">{subtitle}</p>
        </div>
        <div className="absolute inset-y-0 right-0 hidden w-1/2 md:block">
          {/* Sem repetir a mesma foto (produtos irmãos da API dividem a imagem, ex.: abadá 1–100 e 101+). */}
          {[...new Set(images)].slice(0, 3).map((src, i) => (
            <Image key={src} src={imageUrl(src)} alt="" width={300} height={300} className="absolute object-contain drop-shadow-pop" style={SPOTS[i]} />
          ))}
        </div>
      </div>
      <Breadcrumb items={crumbs} className="my-6" />
    </>
  );
}
