import Link from "next/link";
import { IconFacebook, IconInstagram, IconLinkedin, IconTiktok, IconWhatsApp, IconYoutube } from "@/components/icons";
import { SOCIAL_LABEL, type SocialKey } from "@/lib/multiloja/core";
import type { RodapeKey } from "@/lib/multiloja/tema";

type Props = {
  name: string;
  year: number;
  about: string;
  whatsapp: { href: string; label: string } | null;
  phone: string | null;
  email: string | null;
  socials: Partial<Record<SocialKey, string>>;
  /** Formato escolhido no "Personalizar loja". */
  estilo?: RodapeKey;
};

const SOCIAL_ICONS: Partial<Record<SocialKey, typeof IconInstagram>> = {
  instagram: IconInstagram,
  tiktok: IconTiktok,
  youtube: IconYoutube,
  facebook: IconFacebook,
  linkedin: IconLinkedin,
};

// Texto sempre legível: claro sobre o escuro e a cor da marca (tom escuro da paleta), escuro sobre o claro.
const TONES: Record<RodapeKey, { root: string; sub: string; label: string; social: string; border: string }> = {
  escuro: { root: "bg-ink-soft text-white", sub: "text-white/75", label: "text-white/60", social: "bg-white/10 hover:bg-white hover:text-ink", border: "border-white/10" },
  marca: { root: "bg-coral-700 text-white", sub: "text-white/90", label: "text-white/80", social: "bg-white/15 hover:bg-white hover:text-ink", border: "border-white/20" },
  claro: { root: "border-t border-line bg-mist text-ink", sub: "text-ink/75", label: "text-muted", social: "bg-white hover:bg-ink hover:text-white", border: "border-line" },
};

export default function VitrineFooter({ name, year, about, whatsapp, phone, email, socials, estilo = "escuro" }: Props) {
  const socialEntries = Object.entries(socials) as [SocialKey, string][];
  const tone = TONES[estilo];
  return (
    <footer className={`mt-auto ${tone.root}`}>
      <div className="container-site grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="font-titulo text-xl font-black">{name}</p>
          {about && <p className={`mt-3 line-clamp-4 max-w-md text-[15px] leading-relaxed ${tone.sub}`}>{about}</p>}
          {socialEntries.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-2" aria-label="Redes sociais">
              {socialEntries.map(([key, href]) => {
                const Icon = SOCIAL_ICONS[key];
                return (
                  <li key={key}>
                    <a href={href} target="_blank" rel="noreferrer" aria-label={SOCIAL_LABEL[key]} title={SOCIAL_LABEL[key]} className={`grid size-11 place-items-center rounded-full text-sm font-bold transition-colors ${tone.social}`}>
                      {Icon ? <Icon aria-hidden className="size-5" /> : SOCIAL_LABEL[key].charAt(0)}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <nav aria-label="Loja">
          <p className={`text-sm font-bold uppercase tracking-wider ${tone.label}`}>Loja</p>
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
          <p className={`text-sm font-bold uppercase tracking-wider ${tone.label}`}>Atendimento</p>
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
      <div className={`border-t ${tone.border}`}>
        <p className={`container-site py-5 text-caption ${tone.label}`}>
          © {year} {name}. Produção e entrega pela Padrão Color, gráfica parceira desta loja.
        </p>
      </div>
    </footer>
  );
}
