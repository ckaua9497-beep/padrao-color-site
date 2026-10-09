import { PALETTE_KEYS, isPalette, type PaletteKey } from "./core.ts";

/*
 * Tema da vitrine do lojista (editor "Personalizar loja"): estilo, cabeçalho, seções da página inicial e rodapé.
 * Fica em JSON no banco (lojas.tema = publicado, lojas.tema_rascunho = em edição). Módulo puro e testado: tipos,
 * modelos prontos, seções prontas e a validação de tudo o que chega do navegador (parseTema), que devolve sempre
 * um tema válido: o que vier fora do padrão volta para o valor seguro.
 */

// ---------------------------------------------------------------------------------- opções de estilo

export const FONTES = {
  figtree: { nome: "Padrão", descricao: "Limpa e direta (Figtree)" },
  fraunces: { nome: "Elegante", descricao: "Serifa clássica (Fraunces)" },
  grotesk: { nome: "Moderna", descricao: "Geométrica (Space Grotesk)" },
  nunito: { nome: "Amigável", descricao: "Arredondada (Nunito)" },
  oswald: { nome: "Impacto", descricao: "Condensada (Oswald)" },
} as const;
export type FonteKey = keyof typeof FONTES;

/** Raios dos cartões, campos e painéis (substituem os tokens do design system na loja). */
export const CANTOS = {
  retos: { nome: "Retos", card: "4px", control: "4px", panel: "6px", thumb: "3px" },
  suaves: { nome: "Suaves", card: "15px", control: "12px", panel: "20px", thumb: "10px" },
  redondos: { nome: "Redondos", card: "26px", control: "18px", panel: "32px", thumb: "16px" },
} as const;
export type CantosKey = keyof typeof CANTOS;

export const BOTOES = { pilula: "Pílula", reto: "Retangular" } as const;
export type BotoesKey = keyof typeof BOTOES;

/** Fundo da página. "marca" usa o tom bem claro da cor da loja. */
export const FUNDOS = { branco: { nome: "Branco", cor: "#ffffff" }, creme: { nome: "Creme", cor: "#faf6ef" }, cinza: { nome: "Cinza claro", cor: "#f4f5f7" }, marca: { nome: "Tom da marca", cor: "" } } as const;
export type FundoKey = keyof typeof FUNDOS;

export const CARDS = { sombra: "Sombra leve", borda: "Contorno", plano: "Sem borda" } as const;
export type CardsKey = keyof typeof CARDS;

export const CABECALHOS = {
  classico: { nome: "Clássico", descricao: "Logo à esquerda, busca no meio e categorias embaixo" },
  centralizado: { nome: "Centralizado", descricao: "Logo no centro, categorias embaixo" },
  compacto: { nome: "Compacto", descricao: "Uma linha só, com as categorias ao lado do logo" },
} as const;
export type CabecalhoKey = keyof typeof CABECALHOS;

export const RODAPES = { escuro: "Escuro", claro: "Claro", marca: "Cor da marca" } as const;
export type RodapeKey = keyof typeof RODAPES;

export const ICONES = { cubo: "3D", caminhao: "Entrega", escudo: "Segurança", relogio: "Prazo", presente: "Presente", camadas: "Qualidade", whatsapp: "WhatsApp", loja: "Loja", check: "Confirmado" } as const;
export type IconeKey = keyof typeof ICONES;

// ---------------------------------------------------------------------------------- seções

type Base = { id: string; visivel: boolean };

export type Slide = { src: string; alt: string; href: string | null };

export type SecaoHero = Base & {
  tipo: "hero";
  /** esquerda: texto e imagem lado a lado; centro: tudo centralizado; fundo: imagem cobrindo a faixa. */
  layout: "esquerda" | "centro" | "fundo";
  fundo: "suave" | "branco" | "cor" | "escuro";
  selo: string;
  titulo: string;
  texto: string;
  botao: string;
  link: string;
  /** Segundo botão: WhatsApp da loja, página "Sobre" ou nenhum. */
  botao2: "whatsapp" | "sobre" | "nenhum";
  imagem: string | null;
};
export type SecaoBanners = Base & { tipo: "banners"; slides: Slide[]; altura: "baixa" | "media" | "alta" };
export type SecaoVantagens = Base & { tipo: "vantagens"; estilo: "cartoes" | "linha"; itens: { icone: IconeKey; titulo: string; texto: string }[] };
export type SecaoCategorias = Base & { tipo: "categorias"; titulo: string; estilo: "cartoes" | "circulos" | "pilulas"; quantidade: 6 | 12 };
export type SecaoProdutos = Base & {
  tipo: "produtos";
  titulo: string;
  subtitulo: string;
  fonte: "destaques" | "novidades" | "categoria" | "escolhidos";
  categoria: string | null;
  escolhidos: string[];
  quantidade: 4 | 8 | 12;
  verTodos: boolean;
};
export type SecaoChamada = Base & { tipo: "chamada"; titulo: string; texto: string; botao: string; acao: "whatsapp" | "link"; link: string; fundo: "cor" | "escuro" | "suave" };
export type SecaoTexto = Base & { tipo: "texto"; titulo: string; texto: string; alinhamento: "esquerda" | "centro"; imagem: string | null; botaoSobre: boolean };
export type SecaoDepoimentos = Base & { tipo: "depoimentos"; titulo: string; itens: { nome: string; local: string; texto: string }[] };
export type SecaoPerguntas = Base & { tipo: "perguntas"; titulo: string; itens: { pergunta: string; resposta: string }[] };

export type Secao = SecaoHero | SecaoBanners | SecaoVantagens | SecaoCategorias | SecaoProdutos | SecaoChamada | SecaoTexto | SecaoDepoimentos | SecaoPerguntas;
export type SecaoTipo = Secao["tipo"];

export const SECAO_NOME: Record<SecaoTipo, string> = {
  hero: "Destaque principal",
  banners: "Banners",
  vantagens: "Vantagens",
  categorias: "Categorias",
  produtos: "Vitrine de produtos",
  chamada: "Chamada",
  texto: "Texto e imagem",
  depoimentos: "Depoimentos",
  perguntas: "Perguntas frequentes",
};

export type Tema = {
  v: 1;
  /** Modelo de onde o tema partiu (só para mostrar no editor). */
  modelo: ModeloKey | "personalizado";
  marca: { logo: string | null };
  estilo: { paleta: PaletteKey; fonte: FonteKey; cantos: CantosKey; botoes: BotoesKey; fundo: FundoKey; cards: CardsKey };
  cabecalho: { estilo: CabecalhoKey; aviso: string; busca: boolean; categorias: boolean };
  secoes: Secao[];
  rodape: { estilo: RodapeKey };
};

export const MAX_SECOES = 20;
export const LIMITES = { titulo: 90, texto: 600, textoLongo: 2000, botao: 30, selo: 40, aviso: 120, alt: 120, nome: 60, slides: 5, vantagens: 4, depoimentos: 6, perguntas: 10, escolhidos: 24 } as const;

/** Dados da loja que preenchem os textos dos modelos e das seções prontas. */
export type LojaInfo = { lojaId: number; nome: string; slogan: string; sobre: string; logo: string | null; paleta: PaletteKey; banners: Slide[] };

let counter = 0;
/** Id curto para uma seção nova (único dentro do tema). */
export function secaoId(): string {
  counter = (counter + 1) % 1296;
  return `s${Date.now().toString(36).slice(-5)}${counter.toString(36).padStart(2, "0")}${Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------------- seções prontas

const VANTAGENS_PADRAO: SecaoVantagens["itens"] = [
  { icone: "cubo", titulo: "Veja em 3D", texto: "Monte com sua arte antes de comprar" },
  { icone: "escudo", titulo: "5% off no Pix", texto: "Desconto aplicado no pagamento" },
  { icone: "caminhao", titulo: "Entrega para todo o Brasil", texto: "Produção profissional, com acompanhamento" },
];

const PERGUNTAS_PADRAO: SecaoPerguntas["itens"] = [
  { pergunta: "Como envio a minha arte?", resposta: "Na página do produto você monta com a sua imagem ou texto e vê tudo em 3D. Se preferir, envie a arte depois, pela página do pedido." },
  { pergunta: "Qual o prazo de produção?", resposta: "Cada produto mostra o prazo na própria página. Ele começa a contar depois do pagamento e da arte aprovada." },
  { pergunta: "Quais as formas de pagamento?", resposta: "Pix (com desconto), boleto e cartão de crédito em até 6 vezes, numa página segura." },
  { pergunta: "Vocês entregam na minha cidade?", resposta: "Entregamos para todo o Brasil. O frete aparece antes de você finalizar o pedido." },
];

const DEPOIMENTOS_PADRAO: SecaoDepoimentos["itens"] = [
  { nome: "Mariana", local: "São Paulo, SP", texto: "Ficou exatamente como eu vi na prévia em 3D. Chegou rápido e bem embalado!" },
  { nome: "Rafael", local: "Belo Horizonte, MG", texto: "Pedi as camisetas da equipe e a qualidade da estampa surpreendeu todo mundo." },
  { nome: "Juliana", local: "Curitiba, PR", texto: "Atendimento atencioso pelo WhatsApp e o presente fez o maior sucesso." },
];

export type SecaoPronta = { chave: string; nome: string; descricao: string; criar: (info: LojaInfo) => Secao };

/** Biblioteca de seções prontas: o lojista escolhe uma e só troca os textos. */
export const SECOES_PRONTAS: SecaoPronta[] = [
  {
    chave: "hero",
    nome: "Destaque principal",
    descricao: "Título grande, frase e botão para os produtos",
    criar: (info) => ({ id: secaoId(), visivel: true, tipo: "hero", layout: "esquerda", fundo: "suave", selo: "Produtos personalizados", titulo: info.nome, texto: info.slogan || "Escolha o produto, coloque a sua arte e veja em 3D antes de pedir.", botao: "Ver produtos", link: "/produtos", botao2: "whatsapp", imagem: null }),
  },
  { chave: "banners", nome: "Carrossel de banners", descricao: "Até 5 imagens horizontais que passam sozinhas", criar: (info) => ({ id: secaoId(), visivel: true, tipo: "banners", slides: info.banners.slice(0, LIMITES.slides), altura: "media" }) },
  { chave: "vantagens", nome: "Vantagens da loja", descricao: "Três motivos para comprar com você", criar: () => ({ id: secaoId(), visivel: true, tipo: "vantagens", estilo: "cartoes", itens: VANTAGENS_PADRAO.map((i) => ({ ...i })) }) },
  { chave: "categorias", nome: "Categorias", descricao: "Atalhos para as categorias que você vende", criar: () => ({ id: secaoId(), visivel: true, tipo: "categorias", titulo: "Categorias", estilo: "cartoes", quantidade: 6 }) },
  { chave: "destaques", nome: "Produtos em destaque", descricao: "Os produtos que você marcou como destaque", criar: () => ({ id: secaoId(), visivel: true, tipo: "produtos", titulo: "Destaques da loja", subtitulo: "", fonte: "destaques", categoria: null, escolhidos: [], quantidade: 8, verTodos: true }) },
  { chave: "novidades", nome: "Novidades", descricao: "Os últimos produtos que você ativou", criar: () => ({ id: secaoId(), visivel: true, tipo: "produtos", titulo: "Novidades", subtitulo: "Acabaram de chegar na loja", fonte: "novidades", categoria: null, escolhidos: [], quantidade: 4, verTodos: true }) },
  { chave: "categoria", nome: "Produtos de uma categoria", descricao: "Uma vitrine só com uma categoria, ex.: camisetas", criar: () => ({ id: secaoId(), visivel: true, tipo: "produtos", titulo: "Escolha a categoria", subtitulo: "", fonte: "categoria", categoria: null, escolhidos: [], quantidade: 4, verTodos: true }) },
  { chave: "escolhidos", nome: "Produtos escolhidos", descricao: "Você escolhe um por um quais aparecem", criar: () => ({ id: secaoId(), visivel: true, tipo: "produtos", titulo: "Mais pedidos", subtitulo: "", fonte: "escolhidos", categoria: null, escolhidos: [], quantidade: 4, verTodos: false }) },
  { chave: "whatsapp", nome: "Chamada para o WhatsApp", descricao: "Faixa colorida com botão para falar com você", criar: () => ({ id: secaoId(), visivel: true, tipo: "chamada", titulo: "Ficou com alguma dúvida?", texto: "Fale com a gente pelo WhatsApp: ajudamos a escolher o produto e a montar a sua arte.", botao: "Chamar no WhatsApp", acao: "whatsapp", link: "/produtos", fundo: "cor" }) },
  { chave: "chamada", nome: "Chamada com botão", descricao: "Uma frase forte e um botão para uma página da loja", criar: () => ({ id: secaoId(), visivel: true, tipo: "chamada", titulo: "Presentes que ninguém esquece", texto: "Personalize em poucos minutos e veja o resultado em 3D.", botao: "Ver produtos", acao: "link", link: "/produtos", fundo: "escuro" }) },
  { chave: "texto", nome: "Quem somos", descricao: "Conte a sua história, com uma foto se quiser", criar: (info) => ({ id: secaoId(), visivel: true, tipo: "texto", titulo: "Quem somos", texto: info.sobre || `A ${info.nome} cria produtos personalizados com a sua cara, com prévia em 3D e produção profissional.`, alinhamento: "esquerda", imagem: null, botaoSobre: true }) },
  { chave: "depoimentos", nome: "Depoimentos", descricao: "O que os clientes falam da loja (troque pelos seus)", criar: () => ({ id: secaoId(), visivel: true, tipo: "depoimentos", titulo: "Quem comprou, recomenda", itens: DEPOIMENTOS_PADRAO.map((i) => ({ ...i })) }) },
  { chave: "perguntas", nome: "Perguntas frequentes", descricao: "Respostas para as dúvidas mais comuns", criar: () => ({ id: secaoId(), visivel: true, tipo: "perguntas", titulo: "Perguntas frequentes", itens: PERGUNTAS_PADRAO.map((i) => ({ ...i })) }) },
];

const pronta = (chave: string, info: LojaInfo, patch: Record<string, unknown> = {}): Secao => ({ ...(SECOES_PRONTAS.find((s) => s.chave === chave) as SecaoPronta).criar(info), ...patch }) as Secao;

/** Abertura da loja: os banners que o lojista já tem, ou o destaque com o nome da loja. */
const abertura = (info: LojaInfo, hero: Record<string, unknown> = {}): Secao => (info.banners.length ? pronta("banners", info) : pronta("hero", info, hero));

// ---------------------------------------------------------------------------------- modelos prontos

export type Modelo = { nome: string; descricao: string; paleta: PaletteKey; criar: (info: LojaInfo) => Omit<Tema, "v" | "modelo" | "marca"> };

export const MODELOS = {
  classico: {
    nome: "Clássico",
    descricao: "Equilibrado e direto: destaque, vantagens, categorias e produtos.",
    paleta: "coral",
    criar: (info) => ({
      estilo: { paleta: info.paleta, fonte: "figtree", cantos: "suaves", botoes: "pilula", fundo: "branco", cards: "sombra" },
      cabecalho: { estilo: "classico", aviso: "", busca: true, categorias: true },
      secoes: [abertura(info), pronta("vantagens", info), pronta("categorias", info), pronta("destaques", info), pronta("texto", info)],
      rodape: { estilo: "escuro" },
    }),
  },
  boutique: {
    nome: "Boutique",
    descricao: "Elegante, com serifa e fundo creme. Bom para presentes e papelaria.",
    paleta: "grafite",
    criar: (info) => ({
      estilo: { paleta: info.paleta, fonte: "fraunces", cantos: "retos", botoes: "reto", fundo: "creme", cards: "plano" },
      cabecalho: { estilo: "centralizado", aviso: "Frete para todo o Brasil · 5% off no Pix", busca: false, categorias: true },
      secoes: [
        abertura(info, { layout: "centro", fundo: "branco", selo: "Feito para você" }),
        pronta("destaques", info, { titulo: "A coleção", quantidade: 8 }),
        pronta("texto", info, { alinhamento: "centro", titulo: "Nossa história" }),
        pronta("depoimentos", info),
      ],
      rodape: { estilo: "claro" },
    }),
  },
  vibrante: {
    nome: "Vibrante",
    descricao: "Colorido e arredondado, com chamada para o WhatsApp. Bom para influenciadores.",
    paleta: "rosa",
    criar: (info) => ({
      estilo: { paleta: info.paleta, fonte: "nunito", cantos: "redondos", botoes: "pilula", fundo: "branco", cards: "sombra" },
      cabecalho: { estilo: "classico", aviso: "", busca: true, categorias: true },
      secoes: [
        abertura(info, { fundo: "cor", selo: "Novidade" }),
        pronta("categorias", info, { estilo: "circulos" }),
        pronta("novidades", info, { quantidade: 8 }),
        pronta("whatsapp", info, { fundo: "suave" }),
        pronta("perguntas", info),
      ],
      rodape: { estilo: "marca" },
    }),
  },
  minimalista: {
    nome: "Minimalista",
    descricao: "Produtos em primeiro plano, contornos finos e tipografia moderna.",
    paleta: "grafite",
    criar: (info) => ({
      estilo: { paleta: info.paleta, fonte: "grotesk", cantos: "retos", botoes: "reto", fundo: "branco", cards: "borda" },
      cabecalho: { estilo: "compacto", aviso: "", busca: true, categorias: true },
      secoes: [
        pronta("hero", info, { layout: "centro", fundo: "branco", selo: "", botao2: "nenhum" }),
        pronta("destaques", info, { titulo: "Produtos", quantidade: 12 }),
        pronta("categorias", info, { estilo: "pilulas", quantidade: 12, titulo: "Navegue por categoria" }),
        pronta("texto", info, { titulo: "Sobre", botaoSobre: false }),
      ],
      rodape: { estilo: "claro" },
    }),
  },
  impacto: {
    nome: "Impacto",
    descricao: "Títulos fortes e contraste alto. Bom para marcas de roupa e eventos.",
    paleta: "laranja",
    criar: (info) => ({
      estilo: { paleta: info.paleta, fonte: "oswald", cantos: "retos", botoes: "reto", fundo: "branco", cards: "plano" },
      cabecalho: { estilo: "classico", aviso: "Lançamento na loja: confira as novidades", busca: true, categorias: true },
      secoes: [
        pronta("hero", info, { fundo: "escuro", selo: "Edição limitada", layout: "esquerda" }),
        pronta("novidades", info, { titulo: "Acabou de chegar", quantidade: 8 }),
        pronta("chamada", info),
        pronta("categorias", info, { estilo: "cartoes" }),
      ],
      rodape: { estilo: "escuro" },
    }),
  },
  empresas: {
    nome: "Empresas e brindes",
    descricao: "Sério e organizado, com perguntas frequentes e orçamento pelo WhatsApp.",
    paleta: "marinho",
    criar: (info) => ({
      estilo: { paleta: info.paleta, fonte: "grotesk", cantos: "suaves", botoes: "reto", fundo: "cinza", cards: "borda" },
      cabecalho: { estilo: "classico", aviso: "Orçamento rápido para empresas pelo WhatsApp", busca: true, categorias: true },
      secoes: [
        pronta("hero", info, { selo: "Brindes corporativos", texto: info.slogan || "Brindes e materiais com a marca da sua empresa, com prévia em 3D e produção profissional." }),
        pronta("vantagens", info, { estilo: "linha" }),
        pronta("categorias", info),
        pronta("destaques", info, { titulo: "Mais pedidos pelas empresas" }),
        pronta("whatsapp", info, { titulo: "Precisa de um orçamento?", botao: "Pedir orçamento" }),
        pronta("perguntas", info),
      ],
      rodape: { estilo: "escuro" },
    }),
  },
  festas: {
    nome: "Festas e eventos",
    descricao: "Alegre e acolhedor, com depoimentos. Bom para festas, chás e lembrancinhas.",
    paleta: "roxo",
    criar: (info) => ({
      estilo: { paleta: info.paleta, fonte: "nunito", cantos: "redondos", botoes: "pilula", fundo: "marca", cards: "sombra" },
      cabecalho: { estilo: "centralizado", aviso: "Lembrancinhas personalizadas para a sua festa", busca: false, categorias: true },
      secoes: [
        abertura(info, { layout: "centro", fundo: "branco", selo: "Para a sua festa" }),
        pronta("categorias", info, { estilo: "circulos" }),
        pronta("destaques", info, { titulo: "Os queridinhos" }),
        pronta("depoimentos", info),
        pronta("perguntas", info),
      ],
      rodape: { estilo: "marca" },
    }),
  },
} satisfies Record<string, Modelo>;

export type ModeloKey = keyof typeof MODELOS;
export const MODELO_KEYS = Object.keys(MODELOS) as ModeloKey[];

/** Aplica um modelo pronto. `paleta`: cor a usar (a do lojista, ou a sugerida pelo modelo). */
export function aplicarModelo(chave: ModeloKey, info: LojaInfo, opcoes: { paleta?: PaletteKey; logo?: string | null } = {}): Tema {
  const modelo = MODELOS[chave];
  const base = modelo.criar(info);
  return { v: 1, modelo: chave, marca: { logo: opcoes.logo === undefined ? info.logo : opcoes.logo }, ...base, estilo: { ...base.estilo, paleta: opcoes.paleta ?? info.paleta } };
}

/** Tema de quem nunca abriu o editor: o modelo clássico com o que a loja já tinha (cor, logo, banners, textos). */
export function temaInicial(info: LojaInfo): Tema {
  return aplicarModelo("classico", info);
}

// ---------------------------------------------------------------------------------- validação

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number, fallback = ""): string => (typeof v === "string" ? v.replace(/\s+$/u, "").slice(0, max) : fallback);
const line = (v: unknown, max: number, fallback = ""): string => text(v, max, fallback).replace(/[\r\n\t]+/g, " ");
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const keys = <T extends Record<string, unknown>>(o: T) => Object.keys(o) as (keyof T & string)[];

/** Link de botão: só páginas da própria loja (/produtos, /produto/…, /sobre…), nunca um site de fora. */
export function safeLink(v: unknown, fallback = "/produtos"): string {
  return typeof v === "string" && /^\/(?!\/)[\w\-/?=&%.]{0,200}$/.test(v) ? v : fallback;
}

/** Imagem do tema: só as enviadas pela própria loja (guardadas no banco). */
export function safeImage(v: unknown, lojaId: number): string | null {
  return typeof v === "string" && new RegExp(`^/api/multiloja/arquivo/${lojaId}/[a-z0-9-]{8,64}\\.(png|jpg|webp)$`).test(v) ? v : null;
}

function parseSecao(raw: unknown, lojaId: number, seen: Set<string>): Secao | null {
  if (!isRecord(raw)) return null;
  let id = typeof raw.id === "string" && /^[a-z0-9-]{1,24}$/.test(raw.id) ? raw.id : secaoId();
  if (seen.has(id)) id = secaoId();
  seen.add(id);
  const base = { id, visivel: bool(raw.visivel, true) };
  const items = (v: unknown, max: number) => (Array.isArray(v) ? v.filter(isRecord).slice(0, max) : []);
  switch (raw.tipo) {
    case "hero":
      return {
        ...base,
        tipo: "hero",
        layout: oneOf(raw.layout, ["esquerda", "centro", "fundo"], "esquerda"),
        fundo: oneOf(raw.fundo, ["suave", "branco", "cor", "escuro"], "suave"),
        selo: line(raw.selo, LIMITES.selo),
        titulo: line(raw.titulo, LIMITES.titulo),
        texto: text(raw.texto, LIMITES.texto),
        botao: line(raw.botao, LIMITES.botao),
        link: safeLink(raw.link),
        botao2: oneOf(raw.botao2, ["whatsapp", "sobre", "nenhum"], "nenhum"),
        imagem: safeImage(raw.imagem, lojaId),
      };
    case "banners":
      return {
        ...base,
        tipo: "banners",
        altura: oneOf(raw.altura, ["baixa", "media", "alta"], "media"),
        slides: items(raw.slides, LIMITES.slides).flatMap((s) => {
          const src = safeImage(s.src, lojaId);
          return src ? [{ src, alt: line(s.alt, LIMITES.alt), href: s.href ? safeLink(s.href, "") || null : null }] : [];
        }),
      };
    case "vantagens":
      return {
        ...base,
        tipo: "vantagens",
        estilo: oneOf(raw.estilo, ["cartoes", "linha"], "cartoes"),
        itens: items(raw.itens, LIMITES.vantagens).map((i) => ({ icone: oneOf(i.icone, keys(ICONES), "check"), titulo: line(i.titulo, 50), texto: line(i.texto, 90) })),
      };
    case "categorias":
      return {
        ...base,
        tipo: "categorias",
        titulo: line(raw.titulo, LIMITES.titulo),
        estilo: oneOf(raw.estilo, ["cartoes", "circulos", "pilulas"], "cartoes"),
        quantidade: raw.quantidade === 12 ? 12 : 6,
      };
    case "produtos":
      return {
        ...base,
        tipo: "produtos",
        titulo: line(raw.titulo, LIMITES.titulo),
        subtitulo: line(raw.subtitulo, 140),
        fonte: oneOf(raw.fonte, ["destaques", "novidades", "categoria", "escolhidos"], "destaques"),
        categoria: typeof raw.categoria === "string" && /^[a-z0-9-]{1,80}$/.test(raw.categoria) ? raw.categoria : null,
        escolhidos: Array.isArray(raw.escolhidos) ? [...new Set(raw.escolhidos.filter((x): x is string => typeof x === "string" && /^[\w-]{1,40}$/.test(x)))].slice(0, LIMITES.escolhidos) : [],
        quantidade: raw.quantidade === 4 || raw.quantidade === 12 ? raw.quantidade : 8,
        verTodos: bool(raw.verTodos, true),
      };
    case "chamada":
      return {
        ...base,
        tipo: "chamada",
        titulo: line(raw.titulo, LIMITES.titulo),
        texto: text(raw.texto, LIMITES.texto),
        botao: line(raw.botao, LIMITES.botao),
        acao: oneOf(raw.acao, ["whatsapp", "link"], "link"),
        link: safeLink(raw.link),
        fundo: oneOf(raw.fundo, ["cor", "escuro", "suave"], "cor"),
      };
    case "texto":
      return {
        ...base,
        tipo: "texto",
        titulo: line(raw.titulo, LIMITES.titulo),
        texto: text(raw.texto, LIMITES.textoLongo),
        alinhamento: oneOf(raw.alinhamento, ["esquerda", "centro"], "esquerda"),
        imagem: safeImage(raw.imagem, lojaId),
        botaoSobre: bool(raw.botaoSobre, true),
      };
    case "depoimentos":
      return {
        ...base,
        tipo: "depoimentos",
        titulo: line(raw.titulo, LIMITES.titulo),
        itens: items(raw.itens, LIMITES.depoimentos).map((i) => ({ nome: line(i.nome, LIMITES.nome), local: line(i.local, LIMITES.nome), texto: text(i.texto, 400) })),
      };
    case "perguntas":
      return {
        ...base,
        tipo: "perguntas",
        titulo: line(raw.titulo, LIMITES.titulo),
        itens: items(raw.itens, LIMITES.perguntas).map((i) => ({ pergunta: line(i.pergunta, 160), resposta: text(i.resposta, 800) })),
      };
    default:
      return null;
  }
}

/**
 * Tema válido a partir de qualquer coisa (JSON do banco ou do editor). `fallback` completa o que faltar; sem ele,
 * o modelo clássico. Imagens só da própria loja, links só internos, textos com limite, no máximo 20 seções.
 */
export function parseTema(raw: unknown, info: LojaInfo, fallback?: Tema): Tema {
  const base = fallback ?? temaInicial(info);
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return base;
    }
  }
  if (!isRecord(value) || value.v !== 1) return base;
  const estilo = isRecord(value.estilo) ? value.estilo : {};
  const cabecalho = isRecord(value.cabecalho) ? value.cabecalho : {};
  const rodape = isRecord(value.rodape) ? value.rodape : {};
  const marca = isRecord(value.marca) ? value.marca : {};
  const seen = new Set<string>();
  const secoes = Array.isArray(value.secoes) ? value.secoes.slice(0, MAX_SECOES).flatMap((s) => parseSecao(s, info.lojaId, seen) ?? []) : base.secoes;
  return {
    v: 1,
    modelo: oneOf(value.modelo, [...MODELO_KEYS, "personalizado"], "personalizado"),
    marca: { logo: "logo" in marca ? safeImage(marca.logo, info.lojaId) : base.marca.logo },
    estilo: {
      paleta: typeof estilo.paleta === "string" && isPalette(estilo.paleta) ? estilo.paleta : base.estilo.paleta,
      fonte: oneOf(estilo.fonte, keys(FONTES), base.estilo.fonte),
      cantos: oneOf(estilo.cantos, keys(CANTOS), base.estilo.cantos),
      botoes: oneOf(estilo.botoes, keys(BOTOES), base.estilo.botoes),
      fundo: oneOf(estilo.fundo, keys(FUNDOS), base.estilo.fundo),
      cards: oneOf(estilo.cards, keys(CARDS), base.estilo.cards),
    },
    cabecalho: {
      estilo: oneOf(cabecalho.estilo, keys(CABECALHOS), base.cabecalho.estilo),
      aviso: line(cabecalho.aviso, LIMITES.aviso),
      busca: bool(cabecalho.busca, base.cabecalho.busca),
      categorias: bool(cabecalho.categorias, base.cabecalho.categorias),
    },
    secoes,
    rodape: { estilo: oneOf(rodape.estilo, keys(RODAPES), base.rodape.estilo) },
  };
}

/** Imagens que o tema usa (para apagar do banco as que ninguém usa mais). */
export function imagensDoTema(tema: Tema): string[] {
  const out = new Set<string>();
  if (tema.marca.logo) out.add(tema.marca.logo);
  for (const s of tema.secoes) {
    if ((s.tipo === "hero" || s.tipo === "texto") && s.imagem) out.add(s.imagem);
    if (s.tipo === "banners") for (const slide of s.slides) out.add(slide.src);
  }
  return [...out];
}

export { PALETTE_KEYS };

// ---------------------------------------------------------------------------------- produtos de uma seção

export type ProdutoDaLoja = { id: string; categorySlug: string; featured: boolean; ativadoEm: string };

/**
 * Produtos que uma vitrine de produtos mostra: destaques (os marcados primeiro), novidades (últimos ativados),
 * uma categoria, ou os escolhidos um por um (na ordem escolhida). Só produtos ativos na loja.
 */
export function produtosDaSecao<T extends ProdutoDaLoja>(secao: Pick<SecaoProdutos, "fonte" | "categoria" | "escolhidos" | "quantidade">, produtos: T[]): T[] {
  switch (secao.fonte) {
    case "novidades":
      return [...produtos].sort((a, b) => b.ativadoEm.localeCompare(a.ativadoEm)).slice(0, secao.quantidade);
    case "categoria":
      return secao.categoria ? produtos.filter((p) => p.categorySlug === secao.categoria).slice(0, secao.quantidade) : [];
    case "escolhidos": {
      const byId = new Map(produtos.map((p) => [p.id, p]));
      return secao.escolhidos.flatMap((id) => byId.get(id) ?? []).slice(0, secao.quantidade);
    }
    default:
      return [...produtos.filter((p) => p.featured), ...produtos.filter((p) => !p.featured)].slice(0, secao.quantidade);
  }
}
