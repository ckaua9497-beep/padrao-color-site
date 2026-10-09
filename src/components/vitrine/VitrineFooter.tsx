import Link from "next/link";
import { IconFacebook, IconInstagram, IconLinkedin, IconTiktok, IconWhatsApp, IconYoutube } from "@/components/icons";
import { SOCIAL_LABEL, type SocialKey } from "@/lib/multiloja/core";

type Props = {
  name: string;
  year: number;
  about: string;
  whatsapp: { href: string; label: string } | null;
  phone: string | null;
  email: string | null;
  socials: Partial<Record<SocialKey, string>>;
};

const SOCIAL_ICONS: Partial<Record<SocialKey, typeof IconInstagram>> = {
  instagram: IconInstagram,
  tiktok: IconTiktok,
  youtube: IconYoutube,
  facebook: IconFacebook,
  linkedin: IconLinkedin,
};

export default function VitrineFooter({ name, year, about, whatsapp, phone, email, socials }: Props) {
  const socialEntries = Object.entries(socials) as [SocialKey, string][];
  return (
    <footer className="mt-auto bg-ink-soft text-white">
      <div className="container-site grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="text-xl font-black">{name}</p>
          {about && <p className="mt-3 line-clamp-4 max-w-md text-[15px] leading-relaxed text-white/75">{about}</p>}
          {socialEntries.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-2" aria-label="Redes sociais">
              {socialEntries.map(([key, href]) => {
                const Icon = SOCIAL_ICONS[key];
                return (
                  <li key={key}>
                    <a href={href} target="_blank" rel="noreferrer" aria-label={SOCIAL_LABEL[key]} title={SOCIAL_LABEL[key]} className="grid size-11 place-items-center rounded-full bg-white/10 text-sm font-bold hover:bg-white hover:text-ink">
                      {Icon ? <Icon aria-hidden className="size-5" /> : SOCIAL_LABEL[key].charAt(0)}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <nav aria-label="Loja">
          <p className="text-sm font-bold uppercase tracking-wider text-white/60">Loja</p>
          <ul className="mt-4 space-y-2.5 text-[15px]">
            <li>
              <Link href="/produtos" className="hover:underline">
                Todos os produtos
              </Link>
            </li>
            <li>
              <Link href="/sobre" className="hover:underline">
                Sobre a loja
              </Link>
            </li>
            <li>
              <Link href="/carrinho" className="hover:underline">
                Carrinho
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-white/60">Atendimento</p>
          <ul className="mt-4 space-y-2.5 text-[15px]">
            {whatsapp && (
              <li>
                <a href={whatsapp.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:underline">
                  <IconWhatsApp aria-hidden className="size-4.5" /> {whatsapp.label}
                </a>
              </li>
            )}
            {phone && <li>Telefone: {phone}</li>}
            {email && (
              <li>
                <a href={`mailto:${email}`} className="break-all hover:underline">
                  {email}
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="container-site py-5 text-caption text-white/60">
          © {year} {name}. Produção e entrega pela Padrão Color, gráfica parceira desta loja.
        </p>
      </div>
    </footer>
  );
}
