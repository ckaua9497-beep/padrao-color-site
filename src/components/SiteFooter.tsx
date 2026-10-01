import Link from "next/link";
import Logo from "@/components/Logo";
import { IconFacebook, IconInstagram, IconLinkedin, IconTiktok, IconYoutube } from "@/components/icons";
import { Marquee } from "@/components/motion";
import { Button } from "@/components/ui/Button";
import { getCategories } from "@/lib/catalog";
import { STORE } from "@/lib/store";

// Sobre o preto, rótulos e textos pequenos ficam em branco a 60% ou mais (≥ 7:1).
const LINK = "text-white/60 transition-colors hover:text-white";

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
    <footer className="on-dark overflow-hidden bg-ink text-white">
      <div className="container-site grid gap-12 pb-10 pt-20 lg:grid-cols-[1.1fr_1fr_1fr]">
        <div>
          <Logo onDark />
          <p className="mt-8 max-w-sm text-title font-bold">Sua arte, impressa do jeito que você viu em 3D.</p>
          <Button href="/produtos" variant="buy" size="md" className="mt-8">
            Começar meu pedido
          </Button>
          <ul className="mt-10 flex gap-2">
            {social.map(({ href, label, Icon }) => (
              <li key={label}>
                <a href={href} target="_blank" rel="noreferrer" aria-label={label} className="grid size-11 place-items-center rounded-full bg-white/10 transition-colors hover:bg-coral hover:text-ink">
                  <Icon aria-hidden className="size-[18px]" />
                </a>
              </li>
            ))}
          </ul>
        </div>

        <nav aria-labelledby="rodape-categorias">
          <h2 id="rodape-categorias" className="text-sm font-semibold uppercase tracking-widest text-white/60">
            Categorias
          </h2>
          <ul className="mt-5 space-y-3">
            {top.map((c) => (
              <li key={c.slug}>
                <Link href={`/categoria/${c.slug}`} className={`text-lg font-bold ${LINK}`}>
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/60">Atendimento</h2>
          <ul className="mt-5 space-y-3 text-lg font-bold">
            <li>
              <a href={STORE.whatsapp} target="_blank" rel="noreferrer" className={LINK}>
                WhatsApp
              </a>
            </li>
            <li>
              <a href={STORE.phoneHref} className={LINK}>
                {STORE.phone}
              </a>
            </li>
            <li>
              <a href={`mailto:${STORE.email}`} className={LINK}>
                {STORE.email}
              </a>
            </li>
            <li>
              <a href={STORE.blog} target="_blank" rel="noreferrer" className={LINK}>
                Blog da Padrão
              </a>
            </li>
          </ul>
          <p className="mt-8 text-caption text-white/60">
            {STORE.address}
            <br />
            {STORE.hours}
            <br />
            {STORE.legal}
          </p>
        </div>
      </div>

      <div aria-hidden>
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
      </div>
      <p className="border-t border-white/10 py-5 text-center text-caption text-white/60">Padrão Color © {new Date().getFullYear()}. Todos os direitos reservados.</p>
    </footer>
  );
}
