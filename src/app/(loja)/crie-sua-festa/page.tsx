import type { Metadata } from "next";
import Link from "next/link";
import Faq from "@/components/home/Faq";
import ListingBanner from "@/components/listing/ListingBanner";
import PartyBuilder from "@/components/party/PartyBuilder";
import { PartyBoundary } from "@/components/party/PartyBoundary";
import { PARTY_FAQ } from "@/components/party/party-faq";
import { catalogoVivo } from "@/lib/catalogo-vivo";
import { produtosComMidia } from "@/lib/midia";
import { midiaDoSite } from "@/lib/midia-servidor";
import { KITS, resolvePartyItems } from "@/lib/party";

/*
 * Crie Sua Festa: montagem livre com os produtos de festa pré-definidos (src/lib/party.ts). O cliente
 * conta sobre a festa uma vez e escolhe os itens à la carte; o Monte Seu Kit é a versão com composição
 * fechada dos mesmos produtos.
 */

// Catálogo em tempo real (src/lib/catalogo-vivo.ts): só produtos ativos, com os dados de agora; refeita a cada 10 min.
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Crie Sua Festa",
  description:
    "Monte a sua festa item por item: painel, mesa, convites, lembrancinhas e camisetas com o mesmo tema, as mesmas cores e os seus textos. Preço calculado na hora, inclusive por m², e prévia em 3D.",
};

export default async function CrieSuaFestaPage() {
  const items = resolvePartyItems(produtosComMidia((await catalogoVivo()).getProducts(), await midiaDoSite()));
  const images = ["cilindros", "neon-happy-birthday", "sacola-mochila"]
    .map((id) => items.find((item) => item.id === id)?.product.image)
    .filter((src): src is string => Boolean(src));

  return (
    <div className="container-site pb-20">
      <ListingBanner
        title="Crie Sua Festa"
        subtitle={`Conte sobre a festa uma vez e escolha, item por item, entre ${items.length} produtos de festa: todos saem com o mesmo tema, as mesmas cores e os seus textos.`}
        images={images}
        tone="var(--color-magenta-50)"
        crumbs={[{ href: "/", label: "Início" }, { label: "Crie Sua Festa" }]}
      />

      <p className="mb-10 max-w-3xl text-sm text-ink/80">
        Aqui a montagem é livre: você decide o que entra e quanto. Prefere uma combinação pronta? Os{" "}
        <Link href="/monte-seu-kit" className="font-semibold underline underline-offset-4">
          {KITS.length} kits do Monte Seu Kit
        </Link>{" "}
        já vêm com os itens escolhidos.
      </p>

      <PartyBuilder items={items} />

      <div className="mt-20">
        <PartyBoundary current="festa" />
      </div>

      <section aria-labelledby="festa-duvidas" className="mt-16">
        <h2 id="festa-duvidas" className="mb-6 text-section font-bold">
          Dúvidas sobre a festa
        </h2>
        <Faq items={PARTY_FAQ} />
      </section>
    </div>
  );
}
