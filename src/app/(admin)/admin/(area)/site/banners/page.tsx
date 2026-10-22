import type { Metadata } from "next";
import BannersEditor from "@/components/admin/site/BannersEditor";
import { PageHeader, Sheet } from "@/components/admin/ui";
import { IconExternal } from "@/components/icons";
import { buttonClass } from "@/components/ui/Button";
import { LUGARES, LUGARES_BANNER } from "@/lib/midia";
import { MIDIA_PADRAO } from "@/lib/midia-padrao";
import { hojeEmBrasilia, midiaAtual } from "@/lib/midia-servidor";

export const metadata: Metadata = { title: "Banners do site" };

/**
 * Banners da página inicial do site da Padrão (carrossel do topo e faixas promocionais). Lugar sem lista salva abre
 * com os banners padrão do site (os do Figma), que são os que a página inicial mostra enquanto isso.
 */
export default async function AdminBanners() {
  const midia = await midiaAtual();
  const hoje = hojeEmBrasilia();
  return (
    <div className="space-y-6">
      <PageHeader
        group="Site Padrão Color"
        title="Banners"
        description="Banners da página inicial do site. Arraste para mudar a ordem, troque as imagens do computador e do celular, ponha link e período no ar. Enquanto nada é salvo, valem os banners padrão do site. A prévia mostra como fica; “Salvar e publicar” manda para o site na hora."
        actions={
          <a href="/" target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "outline", size: "sm" })}>
            Ver o site <IconExternal aria-hidden className="size-4" />
            <span className="sr-only">(abre em nova aba)</span>
          </a>
        }
      />
      {LUGARES.map((lugar) => (
        <Sheet key={lugar} id={lugar} title={LUGARES_BANNER[lugar].nome} description={LUGARES_BANNER[lugar].descricao}>
          <BannersEditor lugar={lugar} salvos={midia.banners[lugar]} padrao={MIDIA_PADRAO.banners[lugar]} hoje={hoje} />
        </Sheet>
      ))}
    </div>
  );
}
