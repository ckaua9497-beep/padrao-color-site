import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { formatPhone, SOCIAL_LABEL, whatsappLink, type SocialKey } from "@/lib/multiloja/core";
import { lojaDoHost } from "@/lib/multiloja/tenant";

export const metadata: Metadata = { title: "Sobre a loja" };

export default async function VitrineSobre(props: PageProps<"/vitrine/[host]/sobre">) {
  const { host } = await props.params;
  const loja = await lojaDoHost(host);
  if (!loja) notFound();
  const socials = Object.entries(loja.redes) as [SocialKey, string][];

  return (
    <div className="container-site max-w-3xl py-14">
      <h1 className="text-section font-bold">{loja.nome}</h1>
      {loja.slogan && <p className="mt-3 text-lead text-muted">{loja.slogan}</p>}
      <p className="mt-8 whitespace-pre-line text-body leading-relaxed text-ink/85">{loja.sobre || "Produtos personalizados com prévia em 3D, produzidos com qualidade profissional e entregues em todo o Brasil."}</p>

      <section className="mt-12 rounded-panel bg-mist p-6 md:p-8" aria-labelledby="contato">
        <h2 id="contato" className="text-xl font-bold">
          Fale com a loja
        </h2>
        <ul className="mt-4 space-y-2 text-[15px]">
          {loja.whatsapp && <li>WhatsApp: {formatPhone(loja.whatsapp)}</li>}
          {loja.telefone && <li>Telefone: {formatPhone(loja.telefone)}</li>}
          {loja.emailContato && (
            <li>
              E-mail:{" "}
              <a href={`mailto:${loja.emailContato}`} className="underline underline-offset-2">
                {loja.emailContato}
              </a>
            </li>
          )}
          {socials.map(([key, href]) => (
            <li key={key}>
              {SOCIAL_LABEL[key]}:{" "}
              <a href={href} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2">
                {href.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "")}
              </a>
            </li>
          ))}
        </ul>
        {loja.whatsapp && (
          <Button href={whatsappLink(loja.whatsapp, `Olá! Vim pela loja ${loja.nome}.`)} target="_blank" rel="noreferrer" size="md" className="mt-6">
            Chamar no WhatsApp
          </Button>
        )}
      </section>

      <p className="mt-10 text-caption text-muted">Os produtos desta loja são produzidos e entregues pela Padrão Color, gráfica parceira.</p>
    </div>
  );
}
