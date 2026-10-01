import Link from "next/link";
import Logo from "@/components/Logo";
import { IconFacebook, IconInstagram, IconLinkedin, IconTiktok, IconYoutube } from "@/components/icons";
import { Marquee } from "@/components/motion";
import { STORE, getCategories } from "@/lib/catalog";

export default function SiteFooter() {
  const top = getCategories().slice(0, 8);
  const social = [
    { href: STORE.social.instagram, label: "Instagram", Icon: IconInstagram },
    { href: STORE.social.facebook, label: "Facebook", Icon: IconFacebook },
    { href: STORE.social.youtube, label: "YouTube", Icon: IconYoutube },
    { href: STORE.social.linkedin, label: "LinkedIn", Icon: IconLinkedin },
    { href: STORE.social.tiktok, label: "TikTok", Icon: IconTiktok },
  ];
  return (
    <footer className="overflow-hidden bg-ink text-white">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-5 pb-10 pt-20 md:px-10 lg:grid-cols-[1.1fr_1fr_1fr] xl:px-[70px]">
        <div>
          <Logo onDark />
          <h3 className="mt-8 max-w-sm text-3xl font-bold leading-tight">
            Sua arte, impressa do jeito que você viu em 3D.
          </h3>
          <Link href="/produtos" className="mt-8 inline-flex h-12 items-center rounded-control bg-coral px-7 font-bold transition-colors duration-300 hover:bg-coral-600">
            Começar meu pedido
          </Link>
          <div className="mt-10 flex gap-2">
            {social.map(({ href, label, Icon }) => (
              <a key={label} href={href} target="_blank" rel="noreferrer" aria-label={label} className="grid size-10 place-items-center rounded-full bg-white/10 transition-colors hover:bg-coral">
                <Icon className="size-[18px]" />
              </a>
            ))}
          </div>
        </div>

        <nav aria-label="Categorias">
          <p className="text-sm font-semibold uppercase tracking-widest text-white/40">Categorias</p>
          <ul className="mt-5 space-y-3">
            {top.map((c) => (
              <li key={c.slug}>
                <Link href={`/categoria/${c.slug}`} className="text-lg font-bold text-white/55 transition-colors hover:text-white">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-white/40">Atendimento</p>
          <ul className="mt-5 space-y-3 text-lg font-bold">
            <li>
              <a href={STORE.whatsapp} target="_blank" rel="noreferrer" className="text-white/55 transition-colors hover:text-white">
                WhatsApp
              </a>
            </li>
            <li>
              <a href={STORE.phoneHref} className="text-white/55 transition-colors hover:text-white">
                {STORE.phone}
              </a>
            </li>
            <li>
              <a href={`mailto:${STORE.email}`} className="text-white/55 transition-colors hover:text-white">
                {STORE.email}
              </a>
            </li>
            <li>
              <a href={STORE.blog} target="_blank" rel="noreferrer" className="text-white/55 transition-colors hover:text-white">
                Blog da Padrão
              </a>
            </li>
          </ul>
          <p className="mt-8 text-[13px] leading-relaxed text-white/45">
            {STORE.address}
            <br />
            {STORE.hours}
            <br />
            {STORE.legal}
          </p>
        </div>
      </div>

      <Marquee
        slow
        className="select-none pb-6"
        itemClassName="pr-10"
        items={["Padrão Color", "Gráfica e Comunicação Visual", "Mockup 3D", "Sua marca impressa"].map((t) => (
          <span key={t} className="text-outline whitespace-nowrap text-[clamp(64px,9vw,135px)] font-normal leading-none">
            {t} <span className="text-coral [-webkit-text-stroke:0]">•</span>
          </span>
        ))}
      />
      <p className="border-t border-white/10 py-5 text-center text-[13px] text-white/40">
        Padrão Color © {new Date().getFullYear()}. Todos os direitos reservados.
      </p>
    </footer>
  );
}
