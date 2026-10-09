import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { IconCheck } from "@/components/icons";
import AuthShell from "@/components/painel/AuthShell";
import SignupForm from "@/components/painel/SignupForm";
import { MARGIN_MIN, PLAN_INFO } from "@/lib/multiloja/core";
import { getPainel } from "@/lib/multiloja/auth";
import { rootDomain } from "@/lib/multiloja/tenant";
import { signupOpen } from "@/lib/multiloja/config";
import Link from "next/link";
import { STORE } from "@/lib/store";

export const metadata: Metadata = { title: "Criar minha loja" };

export default async function PainelCadastro() {
  if (await getPainel()) redirect("/painel");
  if (!(await signupOpen())) {
    return (
      <AuthShell title="Cadastro por convite" subtitle="As lojas da multiloja são abertas pela equipe da Padrão Color.">
        <p className="text-[15px]">
          Quer ter a sua loja?{" "}
          <a href={STORE.whatsapp} target="_blank" rel="noreferrer" className="font-bold underline underline-offset-4">
            Fale com a Padrão Color no WhatsApp
          </a>
          . Já tem acesso?
        </p>
        <Link href="/painel/entrar" className="mt-4 inline-block font-bold underline underline-offset-4">
          Entrar no painel
        </Link>
      </AuthShell>
    );
  }
  const root = rootDomain();
  const port = root === "localhost" ? /:(\d+)$/.exec((await headers()).get("host") ?? "")?.[1] : undefined;
  const suffix = `.${root}${port ? `:${port}` : ""}`;

  const perks = [
    "Mais de 350 produtos da Padrão Color para escolher",
    "Você define a margem: o lucro de cada venda é seu",
    "Cliente vê o produto em 3D com a arte dele",
    "Produção, embalagem e entrega pela Padrão Color",
    "Sua marca, sua cor e seu endereço na internet",
  ];

  return (
    <AuthShell
      title="Crie sua loja"
      subtitle="Para influenciadores, fornecedores e revendedores. Leva 2 minutos e começa grátis."
      aside={
        <aside className="rounded-panel bg-ink p-8 text-white">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral">Multiloja Padrão Color</p>
          <p className="mt-3 text-2xl font-bold leading-tight">Venda produtos personalizados sem estoque e sem máquina.</p>
          <ul className="mt-6 space-y-3">
            {perks.map((perk) => (
              <li key={perk} className="flex gap-3 text-[15px] leading-snug text-white/85">
                <IconCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-coral" />
                {perk}
              </li>
            ))}
          </ul>
          <p className="mt-8 text-caption text-white/60">
            Plano {PLAN_INFO.gratis.name}: {PLAN_INFO.gratis.blurb.toLowerCase()}. Margem mínima de {MARGIN_MIN}% sobre o preço base.
          </p>
        </aside>
      }
    >
      <SignupForm domainSuffix={suffix} />
    </AuthShell>
  );
}
