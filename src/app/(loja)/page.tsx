import Image from "next/image";
import Link from "next/link";
import HeroSlider, { type HeroSlide } from "@/components/home/HeroSlider";
import Showcase3D, { type DemoProduct } from "@/components/home/Showcase3D";
import Faq from "@/components/home/Faq";
import ProductCard from "@/components/ProductCard";
import Rail from "@/components/Rail";
import { Marker, Reveal, WordReveal } from "@/components/motion";
import { IconArrow, IconCube, IconUpload, IconLayers, IconTruck } from "@/components/icons";
import { CATALOG_STATS, getCategories, getFeatured, getProducts, getProductsByCategory, toSummary, type Product } from "@/lib/catalog";
import { imageUrl, spectrumAt } from "@/lib/format";

function find(name: string): Product {
  const products = getProducts();
  return products.find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? products.find((p) => p.name.toLowerCase().includes(name.toLowerCase())) ?? products[0];
}

const SHOWCASES = [
  { slug: "cartoes-de-visita-e-postais", title: ["Cartões que", "abrem portas"], cta: "Escolher cartão", product: "Cartão de Visita com Verniz Local e Lam. Fosca 9x5cm" },
  { slug: "banner-e-lonas", title: ["Sua marca em", "tamanho grande"], cta: "Escolher banner", product: "Banner 60x90cm" },
  { slug: "vestuario", title: ["Uniforme com a", "cara da sua marca"], cta: "Escolher camisa", product: "Camisa de Algodão" },
  { slug: "casa-e-decoracao", title: ["Decoração com", "a sua foto"], cta: "Escolher peça", product: "Quadro Decorativo em Acrílico" },
  { slug: "brindes-e-presentes", title: ["Brindes que", "ficam na memória"], cta: "Escolher brinde", product: "Caneca de Cerâmica Personalizada" },
];

const FAQ = [
  {
    q: "O mockup 3D é igual ao produto final?",
    a: "O mockup mostra proporção, medidas, verso e acabamento escolhidos, com a sua arte aplicada. Ele é uma simulação: cores na tela variam conforme o monitor, e a impressão segue o arquivo enviado em CMYK.",
  },
  {
    q: "Que arquivo devo enviar?",
    a: "Para a prévia em 3D use PNG, JPG ou WEBP. Para produção, prefira PDF em alta resolução (300 dpi), no tamanho final, em CMYK e com 3 mm de sangria nas bordas.",
  },
  {
    q: "Qual é o prazo de produção?",
    a: "Cada produto mostra o prazo da configuração escolhida, em dias úteis, logo abaixo do preço. O prazo de entrega aparece na finalização da compra, depois de informar o CEP.",
  },
  {
    q: "Posso enviar a arte depois de comprar?",
    a: "Pode. Na página do produto marque “Enviar arte depois” e a nossa equipe entra em contato pelo WhatsApp ou e-mail para receber o arquivo.",
  },
];

export default function HomePage() {
  const categories = getCategories();
  const featured = getFeatured().slice(0, 16).map(toSummary);

  const card = find("Cartão de Visita com Verniz Local e Lam. Fosca 9x5cm");
  const banner = find("Banner 60x90cm");
  const mug = find("Caneca de Cerâmica Personalizada");
  const neon = find("Led Neon Personalizado - Logotipo");
  const shirt = find("Camisa de Algodão");
  const cushion = find("Almofada Quadrada");
  const acrylic = find("Quadro Decorativo em Acrílico");
  const sticker = find("Adesivo em Vinil");

  const slides: HeroSlide[] = [
    {
      light: "sua marca,",
      bold: "impressa",
      tail: "do seu jeito.",
      text: "Cartões, banners, brindes e vestuário com a sua arte. Configure, veja em 3D e peça online.",
      cta: "Começar agora",
      href: "/produtos",
      tone: "#fbeee6",
      accent: "#ff463a",
      images: [card.image, mug.image, sticker.image],
    },
    {
      light: "comunicação",
      bold: "visual",
      tail: "que aparece.",
      text: "Banners, lonas, placas e LED neon para fachada, evento e ponto de venda.",
      cta: "Ver comunicação visual",
      href: "/categoria/banner-e-lonas",
      tone: "#e3f2fb",
      accent: "#0888c8",
      images: [banner.image, neon.image, acrylic.image],
    },
    {
      light: "veja em",
      bold: "3D",
      tail: "antes de imprimir.",
      text: "Envie o seu logo e gire o produto em todos os ângulos antes de fechar o pedido.",
      cta: "Testar o mockup 3D",
      href: "/#mockup-3d",
      tone: "#f3f6dc",
      accent: "#7d9100",
      images: [shirt.image, cushion.image, card.image],
    },
  ];

  const demos: DemoProduct[] = [
    { tab: "Cartão de visita", product: card },
    { tab: "Caneca", product: mug },
    { tab: "Camiseta", product: shirt },
    { tab: "Banner", product: banner },
    { tab: "Almofada", product: cushion },
    { tab: "LED neon", product: neon },
  ].map(({ tab, product }) => ({ tab, slug: product.slug, name: product.name, category: product.category, categorySlug: product.categorySlug, image: product.image, options: product.options }));

  const promos = [
    { title: ["LED neon", "personalizado"], href: "/categoria/led-neon", image: neon.image, tone: "#1d1b2b", dark: true },
    { title: ["Adesivos e", "rótulos"], href: "/categoria/adesivos-e-rotulos", image: sticker.image, tone: "#fef8d4", dark: false },
    { title: ["Photobook com", "as suas fotos"], href: "/categoria/photobook", image: getProductsByCategory("photobook")[0]?.image ?? card.image, tone: "#fce4f0", dark: false },
  ];

  const steps = [
    { Icon: IconLayers, title: "Escolha o produto", text: `São ${CATALOG_STATS.products} produtos em ${CATALOG_STATS.categories} categorias, de cartão de visita a LED neon.` },
    { Icon: IconUpload, title: "Configure e envie a arte", text: "Papel, acabamento, formato e quantidade. O preço muda na hora a cada escolha." },
    { Icon: IconCube, title: "Confira em 3D", text: "Gire o produto, veja frente e verso e as medidas reais antes de pagar." },
    { Icon: IconTruck, title: "Receba pronto", text: "Produção em dias úteis informada em cada produto e entrega calculada pelo CEP." },
  ];

  return (
    <>
      <HeroSlider slides={slides} stats={{ products: CATALOG_STATS.products, minLeadDays: CATALOG_STATS.minLeadDays }} />

      <section className="relative z-10 mx-auto -mt-28 max-w-[1300px] px-4 md:px-10">
        <div className="rounded-panel bg-white p-4 shadow-[0_20px_60px_rgba(0,0,0,0.08)] md:p-6">
          <Rail label="Categorias" itemClassName="w-[46%] sm:w-[30%] md:w-[18%] lg:w-[calc((100%-8*12px)/9)]" gapClassName="gap-3">
            {categories.map((c, i) => (
              <Link key={c.slug} href={`/categoria/${c.slug}`} className="group block">
                <span className="relative block aspect-square overflow-hidden rounded-card" style={{ background: spectrumAt(i).soft }}>
                  <Image src={imageUrl(c.image)} alt="" fill sizes="160px" className="object-contain p-3 transition-transform duration-500 ease-card group-hover:scale-110" />
                </span>
                <span className="mt-2 block text-center text-[14px] font-bold leading-tight">{c.name}</span>
              </Link>
            ))}
          </Rail>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-5 pb-8 pt-16 md:px-10 xl:px-[70px]">
        <Reveal className="mb-6 flex items-end justify-between gap-4">
          <h2 className="text-3xl font-bold tracking-[-0.02em] md:text-[40px]">Mais pedidos</h2>
          <Link href="/produtos" className="hidden items-center gap-2 text-[15px] font-bold hover:text-coral md:flex">
            Ver todos <IconArrow className="size-5" />
          </Link>
        </Reveal>
        <Rail label="Produtos em destaque" itemClassName="w-[70%] sm:w-[40%] md:w-[30%] lg:w-[calc((100%-4*16px)/5)]">
          {featured.map((p, i) => (
            <ProductCard key={p.slug} product={p} tone={spectrumAt(i).soft} priority={i < 5} />
          ))}
        </Rail>
      </section>

      {SHOWCASES.map((s, i) => {
        const products = getProductsByCategory(s.slug).slice(0, 10).map(toSummary);
        const hero = find(s.product);
        const tone = spectrumAt(i + 2);
        const flip = i % 2 === 1;
        return (
          <section key={s.slug} className={`grid md:min-h-[560px] md:grid-cols-2 ${i % 2 === 0 ? "bg-mist" : "bg-fog"}`}>
            <div className={`relative flex min-h-[420px] items-center overflow-hidden px-8 py-14 md:px-16 ${flip ? "md:order-2" : ""}`} style={{ background: tone.soft }}>
              <Image src={imageUrl(hero.image)} alt="" width={600} height={600} className="absolute -right-10 bottom-0 w-[78%] max-w-[520px] object-contain drop-shadow-[0_30px_40px_rgba(0,0,0,0.15)] md:-right-6" />
              <div className="relative max-w-[340px]">
                <h2 className="text-[clamp(40px,4.6vw,58px)] font-bold leading-[1.05] tracking-[-0.02em] text-white">
                  <Marker color="#0a0a0a">
                    {s.title[0]}
                    <br />
                    {s.title[1]}
                  </Marker>
                </h2>
                <Link href={`/categoria/${s.slug}`} className="mt-8 inline-flex h-13 items-center rounded-full bg-white px-8 text-[17px] font-bold shadow-card transition-transform duration-300 ease-button hover:scale-105">
                  {s.cta}
                </Link>
              </div>
            </div>
            <Reveal side className={`flex items-center px-5 py-12 md:px-10 ${flip ? "md:order-1" : ""}`}>
              <Rail label={s.title.join(" ")} dots autoplay={5000} arrows="none" className="w-full" itemClassName="w-[66%] sm:w-[45%] lg:w-[calc((100%-2*16px)/3)]">
                {products.map((p) => (
                  <ProductCard key={p.slug} product={p} />
                ))}
              </Rail>
            </Reveal>
          </section>
        );
      })}

      <section className="mx-auto grid max-w-[1440px] gap-6 px-5 py-16 md:grid-cols-3 md:px-10 xl:px-[70px]">
        {promos.map((p, i) => (
          <Reveal key={p.href} delay={i * 120}>
            <Link href={p.href} className="group relative flex aspect-[11/10] flex-col justify-start overflow-hidden rounded-card p-8 md:aspect-[11/10]" style={{ background: p.tone }}>
              <Image src={imageUrl(p.image)} alt="" width={600} height={600} className="absolute -bottom-6 -right-6 w-[72%] object-contain transition-transform duration-700 ease-card group-hover:scale-105" />
              <h3 className={`relative text-[clamp(28px,2.8vw,40px)] font-bold leading-[1.05] ${p.dark ? "text-white" : "text-ink"}`}>
                {p.title[0]}
                <br />
                {p.title[1]}
              </h3>
              <span className="relative mt-6 inline-flex w-fit items-center rounded-full bg-white px-6 py-3 text-[15px] font-bold text-ink shadow-card">Escolher modelo</span>
            </Link>
          </Reveal>
        ))}
      </section>

      <section className="bg-ink px-5 py-20 text-white md:px-10 xl:px-[70px]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-10 md:flex-row md:items-center md:justify-between">
          <WordReveal text="Escolha, envie a sua arte, veja em 3D e receba pronto para usar." className="max-w-3xl text-[clamp(30px,3.4vw,44px)] font-bold leading-[1.1]" />
          <Link href="/produtos" className="inline-flex h-14 shrink-0 items-center rounded-full bg-white px-9 text-lg font-bold text-ink transition-colors duration-300 hover:bg-coral hover:text-white">
            Fazer meu pedido
          </Link>
        </div>
      </section>

      <Showcase3D demos={demos} />

      <section className="bg-fog py-20">
        <div className="mx-auto grid max-w-[1440px] gap-10 px-5 md:px-10 lg:grid-cols-[360px_1fr] xl:px-[70px]">
          <Reveal>
            <h2 className="text-[clamp(40px,4.4vw,56px)] font-bold leading-[1.02] tracking-[-0.02em]">Como funciona</h2>
            <p className="mt-4 text-lg text-ink/75">Do produto à entrega, tudo pelo site.</p>
            <Link href="/produtos" className="mt-8 inline-flex h-12 items-center gap-3 rounded-control bg-ink px-8 text-sm font-bold text-white transition-colors hover:bg-coral">
              Escolher produto <IconArrow className="size-4" />
            </Link>
          </Reveal>
          <Rail label="Etapas do pedido" itemClassName="w-[80%] sm:w-[48%] xl:w-[calc((100%-3*16px)/4)]">
            {steps.map(({ Icon, title, text }, i) => (
              <article key={title} className="flex h-full flex-col rounded-panel bg-white p-9">
                <span className="grid size-14 place-items-center rounded-full" style={{ background: spectrumAt(i).soft }}>
                  <Icon className="size-7" />
                </span>
                <p className="mt-8 text-sm font-bold text-coral">Passo {i + 1}</p>
                <h3 className="mt-1 text-xl font-bold">{title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-ink/70">{text}</p>
              </article>
            ))}
          </Rail>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#1b1d22] py-24 text-white">
        <div className="pointer-events-none absolute inset-0 grid grid-cols-4 gap-4 opacity-[0.16] md:grid-cols-8">
          {getFeatured()
            .slice(0, 16)
            .map((p) => (
              <div key={p.slug} className="relative aspect-square">
                <Image src={imageUrl(p.image)} alt="" fill sizes="160px" className="object-contain" />
              </div>
            ))}
        </div>
        <div className="relative mx-auto max-w-[1440px] px-5 text-center md:px-10">
          <Reveal>
            <h2 className="mx-auto max-w-3xl text-[clamp(36px,4.4vw,56px)] font-bold leading-[1.05]">Qualidade de gráfica, agilidade de loja online.</h2>
            <div className="mx-auto mt-12 grid max-w-3xl grid-cols-3 gap-6">
              {[
                [String(CATALOG_STATS.products), "produtos"],
                [String(CATALOG_STATS.categories), "categorias"],
                [`${CATALOG_STATS.minLeadDays} ${CATALOG_STATS.minLeadDays === 1 ? "dia" : "dias"}`, "produção mínima"],
              ].map(([value, label], i) => (
                <div key={label}>
                  <p className="text-[clamp(36px,5vw,64px)] font-black" style={{ color: spectrumAt(i).solid }}>
                    {value}
                  </p>
                  <p className="text-sm uppercase tracking-widest text-white/60">{label}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-cloud py-20 md:py-24">
        <h2 className="mb-12 text-center text-[clamp(32px,3.6vw,44px)]">
          <strong className="font-bold">Perguntas</strong> frequentes
        </h2>
        <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-5 md:grid-cols-2 md:px-10">
          <Faq items={FAQ} />
          <Reveal className="relative aspect-square overflow-hidden rounded-card bg-white">
            <div className="absolute inset-0 grid grid-cols-2 gap-3 p-6">
              {[card, mug, shirt, banner].map((p, i) => (
                <div key={p.slug} className="relative overflow-hidden rounded-control" style={{ background: spectrumAt(i + 1).soft }}>
                  <Image src={imageUrl(p.image)} alt="" fill sizes="280px" className="object-contain p-4" />
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
