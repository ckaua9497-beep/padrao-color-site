import type { Banner, Midia, MidiaCategoria, MidiaProduto } from "./midia.ts";

/*
 * Imagens padrão do site, do Figma "LOJA ONLINE - PADRAOCOLOR" (outubro de 2026): fotos de produto (600 × 804, fundo
 * cinza), fotos redondas das categorias da página inicial, os banners do carrossel do topo e o banner largo "Cartões
 * de visita e postais". Os arquivos ficam em public/site/. Os banners (Figma: 1280 × 400 e 1080 × 1350), as categorias
 * e o contorno laranja foram ampliados 2× com super-resolução (Real-ESRGAN x4plus): banners de 2560 × 800 no
 * computador e 2160 × 2700 no celular, nítidos em telas largas e de alta densidade.
 *
 * Elas ficam por baixo do que o admin salva (/admin/site): o que estiver no banco ganha (`comPadrao`, em midia.ts),
 * e apagar o registro no admin faz o padrão voltar. Puro (sem DOM nem banco) e testado.
 */

const foto = (...arquivos: string[]): MidiaProduto => ({ imagens: arquivos.map((a) => `/site/produtos/${a}.webp`), manterApi: true });

/** Fotos dos produtos, pelo id do catálogo (os destaques e os mais vendidos da vitrine da Padrão). */
const PRODUTOS: Record<string, MidiaProduto> = {
  "348": foto("348"), // Panfleto 15x21cm
  "470": foto("470", "470-2"), // Cartão de Visita com Verniz Local e Lam. Fosca 9x5cm
  "289": foto("289"), // Led Neon Personalizado - Logotipo
  "379": foto("379"), // Folha DTF U.V.
  "480": foto("480"), // Banner Roll Up Retrátil (foto do roll-up)
  "35": foto("35"), // Banner - Medida Personalizada (lona pendurada, tubete e corda)
  "378": foto("378"), // Quadro Decorativo em Acrílico
  "148": foto("148"), // Almofada Quadrada
  "182": foto("182"), // Marcador de Livro
  "136": foto("136"), // Quadro Mosaico
  "85": foto("85"), // Bandeira
  "97": foto("97"), // Avental Profissional
  "261": foto("261"), // Sublimação em Tecido
  "84": foto("84"), // Impressão em Acrílico
  "452": foto("452"), // Camisa em Dryfit de 01 à 10 unidades
  "453": foto("452"), // … de 11 à 100 (mesma camisa)
  "454": foto("452"), // … a partir de 101
  "5": foto("5"), // Camisa de Algodão
  "329": foto("329"), // Banner 60x90cm
  "74": foto("74"), // Photobook 15x15cm
  "248": foto("248"), // Cartão de Visita
  // Folhetos: a pilha com um folheto em pé, em perspectiva (pedido da Padrão em 25/10/2026), renderizada com a arte
  // das fotos do Figma no mesmo cinza de estúdio.
  "349": foto("349"), // Folheto 10x14cm
  "351": foto("351"), // Folheto 10x15cm
  "33": foto("33"), // Lona c/ Bainha e Ilhós
  "386": foto("386"), // Wind Banner Retangular
};

const categoria = (slug: string): MidiaCategoria => ({ imagem: `/site/categorias/${slug}.webp`, banner: null, bannerMobile: null });

/** Fotos redondas (fundo transparente fora do círculo) das 5 categorias em destaque. */
const CATEGORIAS: Record<string, MidiaCategoria> = {
  "cartoes-de-visita-e-postais": categoria("cartoes-de-visita-e-postais"),
  suprimentos: categoria("suprimentos"),
  "banner-e-lonas": categoria("banner-e-lonas"),
  restaurantes: categoria("restaurantes"),
  folhetos: categoria("folhetos"),
};

const banner = (id: string, arquivo: string, alt: string, href: string, novaAba = false, linha: number | null = null): Banner => ({
  id,
  desktop: { src: `/site/banners/${arquivo}.webp`, w: 2560, h: 800 },
  mobile: { src: `/site/banners/${arquivo}-mobile.webp`, w: 2160, h: 2700 },
  alt,
  href,
  novaAba,
  ativo: true,
  inicio: null,
  fim: null,
  ...(linha ? { linha } : {}),
});

/**
 * Carrossel do topo, na ordem do componente do Figma (01, 03, 05, 04, 02). Os links de System Color e da Tabela
 * Política vêm dos banners atuais da Padrão (storefront.json, "System Color" e "Política 2026").
 */
const TOPO: Banner[] = [
  banner("padrao-topo-01", "hero-01-sua-marca-impressa", "Sua marca impressa do seu jeito: cartões, banners, brindes e muito mais. Começar agora.", "/produtos"),
  banner(
    "padrao-topo-03",
    "hero-03-system-color",
    "Atenção: para voltar a usar o System Color, baixe e instale o programa novamente. Baixe aqui.",
    "https://drive.google.com/file/d/1xho2GGzLJKlsahzsiouWh5-dekXQcNba/view?usp=sharing",
    true,
  ),
  banner("padrao-topo-05", "hero-05-adesivo-microperfurado", "Promoção: adesivo microperfurado 80 × 40 por R$ 8,90. Personalize agora.", "/produto/521-adesivo-microperfurado-promocional"),
  banner(
    "padrao-topo-04",
    "hero-04-tabela-politica-2026",
    "Tabela Política 2026 já disponível no System Color. Acesse o passo a passo.",
    "https://drive.google.com/file/d/1ZtsuMrOJFMf_Xso8suw0hnsZ-7ags_dI/view?usp=drive_link",
    true,
  ),
  banner("padrao-topo-02", "hero-02-novas-linhas-suprimentos", "Novas linhas de suprimentos: canecas, garrafas, lonas e acessórios a partir de R$ 9,49.", "/categoria/suprimentos"),
];

/** Banner largo depois de "Mais vendidos". */
const MEIO: Banner[] = [
  banner(
    "padrao-meio-cartoes",
    "vitrine-cartoes-de-visita-e-postais",
    "Cartões de visita e postais: impressões de alta qualidade para destacar a sua marca.",
    "/categoria/cartoes-de-visita-e-postais",
    false,
    1,
  ),
];

export const MIDIA_PADRAO: Midia = {
  produtos: PRODUTOS,
  categorias: CATEGORIAS,
  banners: { "inicio-topo": TOPO, "inicio-meio": MEIO },
};
