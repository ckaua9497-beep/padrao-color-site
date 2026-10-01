import Image from "next/image";
import { Breadcrumb, type Crumb } from "@/components/ui/Breadcrumb";
import { imageUrl } from "@/lib/format";

const SPOTS = [
  { right: "4%", top: "8%", width: "42%" },
  { right: "40%", bottom: "-6%", width: "36%" },
  { right: "-4%", bottom: "-10%", width: "30%" },
];

export default function ListingBanner({ title, subtitle, images, tone, crumbs }: { title: string; subtitle: string; images: string[]; tone: string; crumbs: Crumb[] }) {
  return (
    <>
      <div className="relative mt-8 flex min-h-[220px] items-center overflow-hidden rounded-card px-8 py-10 md:min-h-[260px] md:px-14" style={{ background: tone }}>
        <div className="relative z-10 max-w-xl">
          <h1 className="text-display">{title}</h1>
          <p className="mt-3 text-lead text-ink/75">{subtitle}</p>
        </div>
        <div className="absolute inset-y-0 right-0 hidden w-1/2 md:block">
          {images.slice(0, 3).map((src, i) => (
            <Image key={src} src={imageUrl(src)} alt="" width={300} height={300} className="absolute object-contain drop-shadow-pop" style={SPOTS[i]} />
          ))}
        </div>
      </div>
      <Breadcrumb items={crumbs} className="my-6" />
    </>
  );
}
