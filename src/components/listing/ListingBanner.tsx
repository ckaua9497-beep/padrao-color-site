import Image from "next/image";
import Link from "next/link";
import { imageUrl } from "@/lib/format";

export default function ListingBanner({ title, subtitle, images, tone, crumbs }: { title: string; subtitle: string; images: string[]; tone: string; crumbs: { href?: string; label: string }[] }) {
  return (
    <>
      <div className="relative mt-8 flex min-h-[220px] items-center overflow-hidden rounded-card px-8 py-10 md:min-h-[260px] md:px-14" style={{ background: tone }}>
        <div className="relative z-10 max-w-xl">
          <h1 className="text-[clamp(40px,5vw,64px)] font-bold leading-none tracking-[-0.02em]">{title}</h1>
          <p className="mt-3 text-lg text-ink/70">{subtitle}</p>
        </div>
        <div className="absolute inset-y-0 right-0 hidden w-1/2 md:block">
          {images.slice(0, 3).map((src, i) => (
            <Image
              key={src}
              src={imageUrl(src)}
              alt=""
              width={300}
              height={300}
              priority
              className="absolute object-contain drop-shadow-[0_20px_30px_rgba(0,0,0,0.15)]"
              style={[{ right: "4%", top: "8%", width: "42%" }, { right: "40%", bottom: "-6%", width: "36%" }, { right: "-4%", bottom: "-10%", width: "30%" }][i]}
            />
          ))}
        </div>
      </div>
      <nav aria-label="Trilha" className="my-6 flex flex-wrap items-center gap-2 text-[14px] text-ink/70">
        {crumbs.map((c, i) => (
          <span key={c.label} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden>›</span>}
            {c.href ? (
              <Link href={c.href} className="hover:text-ink">
                {c.label}
              </Link>
            ) : (
              <span className="text-subtle">{c.label}</span>
            )}
          </span>
        ))}
      </nav>
    </>
  );
}
