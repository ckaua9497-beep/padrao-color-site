import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductCard from "@/components/ProductCard";
import Rail from "@/components/Rail";
import { IconCube, IconShield, IconTruck } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { getCategory } from "@/lib/catalog";
import { imageUrl, spectrumAt } from "@/lib/format";
import { whatsappLink } from "@/lib/multiloja/core";
import { PIX_DISCOUNT } from "@/lib/pricing";
import { lojaCategorias, lojaDoHost, lojaItens, lojaSummary } from "@/lib/multiloja/tenant";

export default async function VitrineHome(props: PageProps<"/vitrine/[host]">) {
  const { host } = await props.params;
  const loja = lojaDoHost(host);
  if (!loja) notFound();

  const items = lojaItens(loja.id, loja.margemPadrao);
  const categories = lojaCategorias(items, loja.categoriasDestaque);
  const featured = [...items.filter((i) => i.featured), ...items.filter((i) => !i.featured)].slice(0, 12).map(lojaSummary);

  const benefits = [
    { Icon: IconCube, title: "Veja em 3D", text: "Monte com sua arte antes de comprar" },
    { Icon: IconShield, title: `${Math.round(PIX_DISCOUNT * 100)}% off no PIX`, text: "Desconto aplicado no pagamento" },
    { Icon: IconTruck, title: "Entrega para todo o Brasil", text: "Produção profissional, com acompanhamento" },
  ];

  return (
    <>
      {loja.banners.length > 0 ? (
        <section aria-label="Destaques da loja" className="container-site pt-6">
          <Rail label="Banners" arrows={loja.banners.length > 1 ? "overlay" : "none"} dots={loja.banners.length > 1} autoplay={loja.banners.length > 1 ? 6000 : undefined} itemClassName="w-full">
            {loja.banners.map((banner, i) => {
              const img = (
                <Image src={banner.src} alt={banner.alt} width={1920} height={640} unoptimized priority={i === 0} className="aspect-[3/1] w-full rounded-panel object-cover max-md:aspect-[16/9]" />
              );
              return banner.href ? (
                <Link key={banner.src} href={banner.href} className="block">
                  {img}
                </Link>
              ) : (
                <div key={banner.src}>{img}</div>
              );
            })}
          </Rail>
        </section>
      ) : (
        <section className="bg-coral-50">
          <div className="container-site py-16 md:py-24">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral-700">Produtos personalizados</p>
            <h1 className="mt-3 max-w-3xl text-display">{loja.nome}</h1>
            {loja.slogan && <p className="mt-4 max-w-2xl text-lead text-ink/75">{loja.slogan}</p>}
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="/produtos" size="lg">
                Ver produtos
              </Button>
              {loja.whatsapp && (
                <Button href={whatsappLink(loja.whatsapp, `Olá! Vim pela loja ${loja.nome}.`)} variant="outline" size="lg" target="_blank" rel="noreferrer">
                  Falar no WhatsApp
                </Button>
              )}
            </div>
          </div>
        </section>
      )}

      <section aria-label="Vantagens" className="container-site pt-8">
        <ul className="grid gap-3 sm:grid-cols-3">
          {benefits.map(({ Icon, title, text }, i) => (
            <li key={title} className="flex items-center gap-3 rounded-card bg-mist p-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-full" style={{ background: spectrumAt(i + 1).soft }}>
                <Icon aria-hidden className="size-5" />
              </span>
              <span className="text-caption leading-tight">
                <span className="block text-[15px] font-bold">{title}</span>
                {text}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {items.length === 0 ? (
        <section className="container-site py-24 text-center">
          <h2 className="text-title">Em breve, novidades por aqui.</h2>
          <p className="mt-3 text-muted">A loja está separando os produtos. Volte daqui a pouco!</p>
        </section>
      ) : (
        <>
          {categories.length > 1 && (
            <section className="container-site pt-14" aria-labelledby="categorias">
              <SectionHeading title={<span id="categorias">Categorias</span>} />
              <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {categories.slice(0, 12).map((c, i) => {
                  const image = getCategory(c.slug)?.image;
                  return (
                    <li key={c.slug}>
                      <Link href={`/produtos?categoria=${c.slug}`} className="group flex h-full flex-col items-center gap-3 rounded-card p-4 text-center transition-shadow hover:shadow-card" style={{ background: spectrumAt(i).soft }}>
                        {image && <Image src={imageUrl(image)} alt="" width={120} height={120} className="aspect-square w-20 object-contain transition-transform duration-400 group-hover:scale-105 motion-reduce:transition-none" />}
                        <span className="text-[15px] font-bold leading-tight">{c.name}</span>
                        <span className="text-caption text-muted">
                          {c.count} {c.count === 1 ? "produto" : "produtos"}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="container-site py-14" aria-labelledby="destaques">
            <SectionHeading title={<span id="destaques">Destaques da loja</span>} action={items.length > featured.length ? { href: "/produtos", label: "Ver todos" } : undefined} />
            <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
              {featured.map((p, i) => (
                <li key={p.slug}>
                  <ProductCard product={p} tone={spectrumAt(i).soft} priority={i < 4} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {loja.sobre && (
        <section className="bg-mist" aria-labelledby="sobre-loja">
          <div className="container-site grid gap-6 py-14 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h2 id="sobre-loja" className="text-title">
                Quem somos
              </h2>
              <p className="mt-3 line-clamp-5 max-w-3xl whitespace-pre-line text-body text-ink/80">{loja.sobre}</p>
            </div>
            <Button href="/sobre" variant="outline" size="sm">
              Conhecer a loja
            </Button>
          </div>
        </section>
      )}
    </>
  );
}
