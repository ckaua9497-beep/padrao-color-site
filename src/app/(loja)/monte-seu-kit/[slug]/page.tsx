import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconCheck, IconClock } from "@/components/icons";
import KitConfigurator from "@/components/party/KitConfigurator";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Price } from "@/components/ui/Price";
import { getProducts } from "@/lib/catalog";
import { imageUrl } from "@/lib/format";
import { KITS, amountLabel, defaultConfig, getKit, getPalette, getPartyType, kitQuote, priceItem, resolveKitItems } from "@/lib/party";

/*
 * Página do kit: composição fechada (os itens não mudam), textos escritos uma vez, quantidades e medidas
 * ajustáveis e "Adicionar kit ao carrinho" com o bundle do kit.
 */

type Props = { params: Promise<{ slug: string }> };

// Só os 10 kits de src/lib/party.ts; qualquer outro slug é 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return KITS.map((kit) => ({ slug: kit.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const kit = getKit(slug);
  if (!kit) return {};
  const cover = resolveKitItems(kit, getProducts()).find((item) => item.id === kit.cover);
  return {
    title: kit.name,
    description: `${kit.tagline} ${kit.audience}. Valor calculado item a item.`,
    openGraph: { title: kit.name, description: kit.tagline, images: cover ? [{ url: imageUrl(cover.product.image) }] : undefined },
  };
}

export default async function KitPage({ params }: Props) {
  const { slug } = await params;
  const kit = getKit(slug);
  if (!kit) notFound();
  const items = resolveKitItems(kit, getProducts());
  const cover = items.find((item) => item.id === kit.cover) ?? items[0];
  if (!cover) notFound();
  const quote = kitQuote(items);
  const [first, second] = getPalette(kit.palette).colors;
  const type = getPartyType(kit.partyType);
  const others = KITS.filter((k) => k.slug !== kit.slug);

  return (
    <div className="container-site pb-20 pt-8">
      <Breadcrumb
        className="mb-6"
        items={[
          { href: "/", label: "Início" },
          { href: "/monte-seu-kit", label: "Monte Seu Kit" },
          { label: kit.name },
        ]}
      />

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center xl:gap-14">
        <div className="relative aspect-[4/3] overflow-hidden rounded-card" style={{ background: `linear-gradient(150deg, ${first}55 0%, ${second ?? first}55 100%)` }}>
          <Image src={imageUrl(cover.product.image)} alt={`${cover.title}, um dos itens do ${kit.name}`} fill loading="eager" sizes="(max-width: 1024px) 90vw, 640px" className="object-contain p-8" />
        </div>
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral-700">Monte Seu Kit — Festas</p>
          <h1 className="mt-3 text-display">{kit.name}</h1>
          <p className="mt-4 text-lead text-ink/80">{kit.tagline}</p>
          <p className="mt-3 text-body text-ink/75">{kit.description}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Badge tone="dark">{items.length} itens</Badge>
            <Badge tone="neutral">{type.label}</Badge>
            <Badge tone="pix">{kit.audience}</Badge>
          </div>
          <Price className="mt-6" size="pdp" value={quote.total} from />
          <p className="mt-2 text-caption text-muted">Valor calculado item a item, com os preços do catálogo e sem desconto de kit, para a composição sugerida.</p>
          {quote.leadDays && (
            <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-ink/80">
              <IconClock className="size-4 text-coral-700" /> Produção em até {quote.leadDays} {quote.leadDays === 1 ? "dia útil" : "dias úteis"}
            </p>
          )}
          <Button href="#personalizar" variant="buy" size="md" className="mt-6">
            Personalizar o kit
          </Button>
        </div>
      </section>

      <section aria-labelledby="kit-composicao" className="mt-14 rounded-card bg-mist p-5 sm:p-8">
        <h2 id="kit-composicao" className="text-xl font-bold">
          O que vem no kit
        </h2>
        <ul className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.key} className="flex gap-2">
              <IconCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-coral-700" strokeWidth={2.4} />
              <span>
                <span className="font-semibold">{item.title}</span> · {amountLabel(item, priceItem(item, defaultConfig(item)))}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div id="personalizar" className="mt-14 scroll-mt-32">
        <KitConfigurator
          kit={{ slug: kit.slug, name: kit.name, partyType: kit.partyType, theme: kit.theme, palette: kit.palette, phrase: kit.phrase, cover: kit.cover }}
          items={items}
        />
      </div>

      <section aria-labelledby="outros-kits" className="mt-20 border-t border-line pt-10">
        <h2 id="outros-kits" className="text-title font-bold">
          Outros kits de festa
        </h2>
        <ul className="mt-5 flex flex-wrap gap-2">
          {others.map((other) => (
            <li key={other.slug}>
              <Link href={`/monte-seu-kit/${other.slug}`} className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-semibold ring-1 ring-line-strong transition-colors hover:ring-ink">
                {other.name}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-ink/80">
          Prefere escolher item por item?{" "}
          <Link href="/crie-sua-festa" className="font-semibold underline underline-offset-4">
            Crie Sua Festa
          </Link>{" "}
          com os mesmos produtos.
        </p>
      </section>
    </div>
  );
}
