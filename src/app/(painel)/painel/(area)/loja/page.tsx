import type { Metadata } from "next";
import { headers } from "next/headers";
import LojaForm from "@/components/painel/LojaForm";
import { getCategories } from "@/lib/catalog";
import { requirePainel } from "@/lib/multiloja/auth";
import { rootDomain } from "@/lib/multiloja/tenant";

export const metadata: Metadata = { title: "Dados da loja" };

export default async function PainelLoja() {
  const { loja } = await requirePainel();
  const root = rootDomain();
  const port = root === "localhost" ? /:(\d+)$/.exec((await headers()).get("host") ?? "")?.[1] : undefined;
  return (
    <div className="space-y-6">
      <h1 className="text-title">Dados da loja</h1>
      <LojaForm
        loja={{
          nome: loja.nome,
          slogan: loja.slogan,
          sobre: loja.sobre,
          subdominio: loja.subdominio,
          whatsapp: loja.whatsapp,
          telefone: loja.telefone,
          emailContato: loja.emailContato,
          redes: loja.redes,
          margemPadrao: loja.margemPadrao,
          categoriasDestaque: loja.categoriasDestaque,
        }}
        categories={getCategories().map((c) => ({ slug: c.slug, name: c.name }))}
        domainSuffix={`.${root}${port ? `:${port}` : ""}`}
      />
    </div>
  );
}
