import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import ColunaRodape from "@/components/footer/ColunaRodape";
import { IconeEmail, IconeFacebook, IconeInstagram, IconeLinkedin, IconeLocal, IconeTelefone, IconeTiktok, IconeYoutube } from "@/components/footer/icones";
import { STORE } from "@/lib/store";

/*
 * Rodapé do Figma (captura do rodapé do padraocolor.com.br): fundo branco, quatro colunas (Institucional, Informações,
 * Comercial e Contato) e a faixa cinza com os direitos, o CNPJ e as redes em laranja.
 * Os links institucionais levam às páginas do site oficial (endereços conferidos com resposta 200 em 15/10/2026) e
 * abrem na mesma aba; só o blog abre em outra.
 */

const OFICIAL = "https://padraocolor.com.br";

type LinkRodape = { label: string; href: string; /** Blog: abre em outra aba. */ novaAba?: boolean };

const COLUNAS: { titulo: string; links: LinkRodape[] }[] = [
  {
    titulo: "Institucional",
    links: [
      { label: "Sobre Nós", href: `${OFICIAL}/institucional/sobre-nos` },
      { label: "Política de Privacidade", href: `${OFICIAL}/institucional/politica-de-privacidade` },
      { label: "Nossas Lojas", href: `${OFICIAL}/institucional/nossas-lojas` },
      { label: "Contatos", href: `${OFICIAL}/institucional/contato` },
      { label: "Faça Parte da Nossa Equipe", href: `${OFICIAL}/institucional/faca-parte-de-nossa-equipe` },
    ],
  },
  {
    titulo: "Informações",
    links: [
      { label: "Central de Ajuda", href: `${OFICIAL}/ajuda` },
      { label: "Dicas e Tutoriais", href: `${STORE.blog}?cat=7`, novaAba: true },
      // No site oficial, "Pontos de retirada" leva à mesma página de "Nossas Lojas".
      { label: "Pontos de retirada", href: `${OFICIAL}/institucional/nossas-lojas` },
      { label: "Downloads", href: `${OFICIAL}/institucional/downloads` },
      { label: "Glossário", href: `${OFICIAL}/institucional/glossario` },
      { label: "Gabaritos", href: "/gabaritos" },
      { label: "Criação de Arte", href: `${OFICIAL}/institucional/criacao-de-arte` },
      { label: "Tratamento de Arquivo", href: `${OFICIAL}/institucional/tratamento-de-arquivo` },
      { label: "Normas de Envio de Arte", href: `${OFICIAL}/institucional/normas-de-envio-de-arte` },
      { label: "Blog", href: STORE.blog, novaAba: true },
    ],
  },
  {
    titulo: "Comercial",
    links: [
      { label: "Venda Corporativa", href: `${OFICIAL}/institucional/venda-corporativa` },
      { label: "Seja um Fornecedor", href: `${OFICIAL}/institucional/seja-um-fornecedor` },
      { label: "Seja um Revendedor", href: `${OFICIAL}/institucional/seja-um-revendedor` },
      { label: "Entrega Personalizada", href: `${OFICIAL}/institucional/entrega-personalizada` },
      { label: "Categorias de Revendedor", href: `${OFICIAL}/institucional/categorias-de-revendedor` },
    ],
  },
];

const REDES: { href: string; label: string; Icone: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { href: STORE.social.youtube, label: "YouTube", Icone: IconeYoutube },
  { href: STORE.social.facebook, label: "Facebook", Icone: IconeFacebook },
  { href: STORE.social.instagram, label: "Instagram", Icone: IconeInstagram },
  { href: STORE.social.linkedin, label: "LinkedIn", Icone: IconeLinkedin },
  { href: STORE.social.tiktok, label: "TikTok", Icone: IconeTiktok },
];

// Celular e tablet: linhas de 44 px (alvo de toque). A partir de lg (mouse), a lista compacta do Figma.
const LINK = "flex min-h-11 items-center text-[14px] leading-5 text-muted transition-colors hover:text-ink hover:underline underline-offset-2 lg:min-h-0";

function LinkDoRodape({ label, href, novaAba }: LinkRodape) {
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={LINK}>
        {label}
      </Link>
    );
  }
  return (
    <a href={href} className={LINK} {...(novaAba ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {label}
      {novaAba && <span className="sr-only"> (abre em outra aba)</span>}
    </a>
  );
}

export default function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="container-site grid pb-8 pt-2 md:grid-cols-2 md:gap-x-8 md:gap-y-10 md:pt-10 lg:grid-cols-4 lg:pb-8">
        {COLUNAS.map((coluna) => (
          <ColunaRodape key={coluna.titulo} titulo={coluna.titulo}>
            <ul className="lg:space-y-1.5">
              {coluna.links.map((link) => (
                <li key={link.label}>
                  <LinkDoRodape {...link} />
                </li>
              ))}
            </ul>
          </ColunaRodape>
        ))}

        <div className="pt-6 md:pt-0">
          <h2 className="text-[15px] font-semibold leading-5 text-ink">Contato</h2>
          <ul className="mt-2 text-[14px] leading-5 text-muted md:mt-3 lg:space-y-1.5">
            <li>
              <a href={STORE.phoneHref} className="flex min-h-11 items-center gap-2.5 transition-colors hover:text-ink lg:min-h-0">
                <IconeTelefone aria-hidden className="size-4 shrink-0 text-coral" />
                {STORE.phone}
              </a>
            </li>
            <li>
              <a href={`mailto:${STORE.email}`} className="flex min-h-11 items-center gap-2.5 break-all transition-colors hover:text-ink lg:min-h-0">
                <IconeEmail aria-hidden className="size-4 shrink-0 text-coral" />
                {STORE.email}
              </a>
            </li>
            <li className="flex gap-2.5 pt-2 lg:pt-0">
              <IconeLocal aria-hidden className="mt-0.5 size-4 shrink-0 text-coral" />
              <address className="not-italic">
                {STORE.address}
                <br />
                Horário de Atendimento:
                <br />
                {STORE.hours}
              </address>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-line bg-mist">
        {/*
          Embaixo e à esquerda fica o WhatsApp flutuante (56 px a 20 px da borda, até x = 76). Abaixo de xl a margem
          lateral é menor que isso: a faixa ganha 96 px embaixo para o texto ficar acima do botão no fim da página, sem
          recuo (alinhado com as colunas). A partir de xl a margem é de 108 px e o texto já passa ao lado dele.
        */}
        <div className="container-site flex flex-col gap-3 pb-24 pt-5 md:flex-row md:items-center md:justify-between md:gap-8 md:pt-6 xl:pb-6">
          <div>
            <p className="text-[14px] leading-5 text-ink">Padrão Color - Todos os Direitos Reservados</p>
            <p className="mt-1 text-micro leading-4 text-muted">CNPJ: 14.572.530/0001-19 - Razão Social: APEL GRAFICA E EDITORA LTDA</p>
          </div>
          <ul className="-ml-3 flex md:ml-0 md:-mr-3 lg:-mr-1.5">
            {REDES.map(({ href, label, Icone }) => (
              <li key={label}>
                <a href={href} aria-label={label} className="grid size-11 place-items-center text-coral transition-colors hover:text-coral-700 lg:size-8">
                  <Icone aria-hidden className="size-5 lg:size-[18px]" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
