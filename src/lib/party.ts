import type { CustomSize, Product, Variation } from "./catalog";
import type { AreaQuote, Selection } from "./pricing.ts";
import { areaQuote, cleanOptionLabel, optionKeys, quote, unitLimits } from "./pricing.ts";

/*
 * Festas e kits (checklist "Festas e kits").
 *
 * Fronteira entre aba, kit e produto avulso (a crítica do checklist pedia isso):
 * - Crie Sua Festa (/crie-sua-festa): montagem livre. O cliente escolhe, item por item e na quantidade
 *   que quiser, qualquer um dos produtos de festa pré-definidos (PARTY_PRODUCTS). Todos compartilham o
 *   mesmo tema, as mesmas cores e os mesmos textos.
 * - Monte Seu Kit — Festas (/monte-seu-kit): kits prontos (KITS) com composição fechada, feitos com esses
 *   mesmos produtos. O cliente escreve os textos uma vez e ajusta quantidades e medidas, mas não troca
 *   os itens (para isso existe o Crie Sua Festa).
 * - Produto avulso: a página do produto continua sendo o lugar do ajuste fino (papel, acabamento…).
 *
 * A API não tem endpoint de kit nem calcula m²: o site soma os itens (preço do catálogo, item a item,
 * sem desconto de kit) e cada item vai para o carrinho como um produto comum, marcado com o `bundle`
 * da festa ou do kit.
 *
 * Módulo puro (sem React e sem o alias @/): roda no `node --test` (party.test.ts).
 */

/** Teto da quantidade de pedidos por item (o mesmo do carrinho). */
export const MAX_QTY = 99;
/** Teto da medida quando o produto por m² não informa limite: 50 m. */
export const MAX_SIDE_CM = 5000;

export const PARTY_BUNDLE_NAME = "Crie Sua Festa";

// ------------------------------------------------------------------------------------------- tipos

/** Produto do catálogo: ID do grupo na API (estável) ou slug (produto derivado, como "tags"). */
export type ProductRef = { groupId: number } | { slug: string };

export type Size = { widthCm: number; heightCm: number };

export type PartyRoleId = "decoracao" | "mesa" | "convites" | "lembrancinhas" | "recordacoes" | "vestuario";

/** Peça de um conjunto (ex.: as três capas do trio de cilindros). Cada peça vira um item no carrinho. */
export type PartyPart = { label: string; preset: Selection };

/** Produto pré-definido para a festa. Opções em `preset` e `choice` usam o rótulo limpo ("Formato"). */
export type PartyProductDef = {
  id: string;
  ref: ProductRef;
  role: PartyRoleId;
  /** Nome do item na festa ("Painel principal em lona"). */
  title: string;
  /** Para que serve na festa. */
  hint: string;
  /** Quantidade sugerida: unidades, ou pacotes quando o produto é vendido em lote (48 adesivos…). */
  qty: number;
  /** Medida sugerida em cm. Só nos produtos por m² (customSize), onde é obrigatória. */
  size?: Size;
  /** Opções pré-escolhidas; o resto fica na variação mais em conta. */
  preset?: Selection;
  /** Opção que o cliente troca na própria montagem (formato, quantidade, tamanho…). */
  choice?: string;
  parts?: PartyPart[];
  /** Pede a grade de tamanhos (P, M, G…) num campo de texto. */
  askSizes?: boolean;
};

export type PartyArtStyle = "classico" | "moderno" | "retro" | "minimal" | "vibrante" | "elegante";

export type PartyType = {
  id: string;
  label: string;
  /** Rótulo e exemplo do campo de nome. */
  nameLabel: string;
  namePlaceholder: string;
  /** Exemplo do campo "Idade ou marco". */
  agePlaceholder: string;
  phrasePlaceholder: string;
  /** Sugestões de tema. */
  themes: string[];
  /** Paleta e estilo de arte sugeridos. */
  palette: string;
  style: PartyArtStyle;
  /** Itens sugeridos (ids de PARTY_PRODUCTS). */
  suggested: string[];
  /** Kit pronto da mesma ocasião. */
  kit?: string;
};

export type PartyPalette = {
  id: string;
  label: string;
  /** Cores mostradas no seletor. */
  colors: string[];
  /** Fundo e texto da arte (contraste mínimo de 3:1, validado no teste). */
  background: string;
  ink: string;
};

/** Item de um kit: aponta para um produto de festa e pode trocar quantidade, medida, opções e nome. */
export type KitItemDef = { item: string; qty?: number; size?: Size; preset?: Selection; title?: string };

export type KitDef = {
  slug: string;
  name: string;
  /** Tipo de festa (PARTY_TYPES): rótulos dos campos e estilo da arte. */
  partyType: string;
  tagline: string;
  description: string;
  /** Para quantas pessoas a composição foi pensada. */
  audience: string;
  theme: string;
  palette: string;
  phrase: string;
  /** Item cuja foto é a capa do kit. */
  cover: string;
  items: KitItemDef[];
};

// ------------------------------------------------------------------------------------------- dados

export const PARTY_ROLES: readonly { id: PartyRoleId; label: string }[] = [
  { id: "decoracao", label: "Painel e decoração" },
  { id: "mesa", label: "Mesa" },
  { id: "convites", label: "Convites" },
  { id: "lembrancinhas", label: "Lembrancinhas" },
  { id: "recordacoes", label: "Recordações" },
  { id: "vestuario", label: "Camisetas e acessórios" },
];

/**
 * Produtos de festa pré-definidos (catálogo real). Os por m² — painéis, faixa, banner, pôster e rótulos —
 * levam medida sugerida e são calculados com `areaQuote` (largura × altura, respeitando os limites).
 */
export const PARTY_PRODUCTS: readonly PartyProductDef[] = [
  // Painel e decoração
  {
    id: "painel-lona",
    ref: { groupId: 33 },
    role: "decoracao",
    title: "Painel principal em lona",
    hint: "Fundo da mesa do bolo, com bainha e ilhós para pendurar.",
    qty: 1,
    size: { widthCm: 200, heightCm: 150 },
    preset: { Acabamento: "Bainha e Ilhós" },
  },
  {
    id: "painel-tecido",
    ref: { groupId: 322 },
    role: "decoracao",
    title: "Painel principal em tecido",
    hint: "Tecido sublimado com tubete e corda: leve e sem reflexo nas fotos.",
    qty: 1,
    size: { widthCm: 140, heightCm: 200 },
    preset: { Modelo: "Banner (Acima de 50cm²)" },
  },
  {
    id: "faixa",
    ref: { groupId: 37 },
    role: "decoracao",
    title: "Faixa decorativa",
    hint: "Para a frente da mesa, o portão ou a entrada da quadrilha.",
    qty: 1,
    size: { widthCm: 300, heightCm: 60 },
    preset: { Formato: "Personalize a sua Medida" },
  },
  {
    id: "banner-boas-vindas",
    ref: { groupId: 35 },
    role: "decoracao",
    title: "Banner de boas-vindas",
    hint: "Recebe os convidados na entrada, com tubete e corda.",
    qty: 1,
    size: { widthCm: 60, heightCm: 90 },
  },
  {
    id: "poster-fotos",
    ref: { groupId: 150 },
    role: "decoracao",
    title: "Pôster de fotos",
    hint: "Papel fotográfico para a foto do homenageado ou o mural de memórias.",
    qty: 1,
    size: { widthCm: 60, heightCm: 90 },
  },
  {
    id: "neon-happy-birthday",
    ref: { groupId: 301 },
    role: "decoracao",
    title: "Letreiro neon Happy Birthday",
    hint: "LED neon de 85×55 cm para brilhar atrás do bolo.",
    qty: 1,
  },
  {
    id: "neon-love",
    ref: { groupId: 302 },
    role: "decoracao",
    title: "Letreiro neon Love",
    hint: "LED neon de 45×25 cm para a mesa dos noivos ou o cantinho das fotos.",
    qty: 1,
  },
  {
    id: "neon-boy-or-girl",
    ref: { groupId: 308 },
    role: "decoracao",
    title: "Letreiro neon Boy or Girl",
    hint: "LED neon de 55×37 cm, em rosa e azul, para o chá revelação.",
    qty: 1,
  },
  {
    id: "neon-feliz-natal",
    ref: { groupId: 312 },
    role: "decoracao",
    title: "Letreiro neon Feliz Natal",
    hint: "LED neon de 60×40 cm para a ceia ou a vitrine.",
    qty: 1,
    choice: "Cor dos Leds",
  },
  {
    id: "neon-cerveja",
    ref: { groupId: 310 },
    role: "decoracao",
    title: "Letreiro neon Caneca de Cerveja",
    hint: "LED neon de 36×54 cm para o bar do churrasco.",
    qty: 1,
  },
  {
    id: "wind-banner",
    ref: { groupId: 525 },
    role: "decoracao",
    title: "Wind banner",
    hint: "Bandeira com base e haste para sinalizar a entrada do evento.",
    qty: 1,
    choice: "Tamanho",
  },
  {
    id: "roll-up",
    ref: { groupId: 480 },
    role: "decoracao",
    title: "Banner roll-up",
    hint: "Estrutura retrátil de 80×200 cm que monta em segundos.",
    qty: 1,
  },
  {
    id: "almofada",
    ref: { groupId: 148 },
    role: "decoracao",
    title: "Almofadas decorativas",
    hint: "Para o sofá, o cantinho das fotos ou de presente.",
    qty: 2,
    preset: { Mídia: "Microfibra com Elastano", Formato: "40x40cm" },
    choice: "Formato",
  },

  // Mesa
  {
    id: "cilindros",
    ref: { groupId: 157 },
    role: "mesa",
    title: "Capas para trio de cilindros",
    hint: "Três capas em helanca (P, M e G) para os cilindros da mesa. A estrutura não vem junto.",
    qty: 1,
    parts: [
      { label: "P", preset: { Formato: "35x40 cm" } },
      { label: "M", preset: { Formato: "45x60 cm" } },
      { label: "G", preset: { Formato: "53x80 cm" } },
    ],
  },
  {
    id: "toalha-mesa",
    ref: { groupId: 146 },
    role: "mesa",
    title: "Toalha da mesa principal",
    hint: "Oxford sublimado de 1,45×1,45 m com a estampa da festa.",
    qty: 1,
  },
  {
    id: "display-mesa",
    ref: { groupId: 93 },
    role: "mesa",
    title: "Plaquinhas de mesa",
    hint: "Displays de 14,5×45 cm para cardápio, número da mesa ou hashtag.",
    qty: 1,
    preset: { "Kit com": "10 unidades" },
    choice: "Kit com",
  },
  {
    id: "jogo-americano",
    ref: { groupId: 126 },
    role: "mesa",
    title: "Jogos americanos",
    hint: "Tecido sublimado de 30×44 cm para a mesa dos convidados.",
    qty: 6,
    choice: "Modelo",
  },
  {
    id: "guardanapo",
    ref: { groupId: 99 },
    role: "mesa",
    title: "Guardanapos de tecido",
    hint: "Oxford de 45×45 cm, em kits com 2 unidades.",
    qty: 5,
  },
  {
    id: "porta-copo",
    ref: { groupId: 105 },
    role: "mesa",
    title: "Porta-copos",
    hint: "Emborrachados de 9×9 cm. Pedido mínimo de 12.",
    qty: 12,
    choice: "Modelo",
  },
  {
    id: "tabua-carne",
    ref: { groupId: 139 },
    role: "mesa",
    title: "Tábua de carne",
    hint: "Madeira de 40×27 cm com a arte fresada.",
    qty: 1,
    choice: "Mídia",
  },

  // Convites
  {
    id: "convites",
    ref: { groupId: 347 },
    role: "convites",
    title: "Convites 10×15 cm",
    hint: "Couchê 170 g, em pacotes de 100 ou 200.",
    qty: 1,
    preset: { Papel: "Couchê 170g/m²", Quantidade: "100" },
    choice: "Quantidade",
  },
  {
    id: "convites-longos",
    ref: { groupId: 354 },
    role: "convites",
    title: "Convites 10×21 cm",
    hint: "Formato alongado e elegante, em couchê 170 g, a partir de 120 unidades.",
    qty: 1,
    preset: { Papel: "Couchê 170g/m²", Quantidade: "120 unidades" },
    choice: "Quantidade",
  },

  // Lembrancinhas
  {
    id: "adesivos-redondos",
    ref: { groupId: 528 },
    role: "lembrancinhas",
    title: "Adesivos redondos de 5 cm",
    hint: "Para fechar saquinhos, caixinhas e potes de doces.",
    qty: 1,
    preset: { Mídia: "Papel Adesivo 130g", Quantidade: "96 unidades" },
    choice: "Quantidade",
  },
  {
    id: "rotulos",
    ref: { groupId: 267 },
    role: "lembrancinhas",
    title: "Rótulos para lembrancinhas",
    hint: "Folha em BOPP na medida, com corte especial: em 30×40 cm cabem cerca de 48 rótulos de 5×5 cm.",
    qty: 1,
    size: { widthCm: 30, heightCm: 40 },
    preset: { Mídia: "BOPP Branco", Acabamento: "Corte Especial" },
  },
  {
    id: "tags",
    ref: { slug: "tags" },
    role: "lembrancinhas",
    title: "Tags de agradecimento",
    hint: "Com furo para cordão, para pendurar nas lembrancinhas.",
    qty: 1,
    preset: { Formato: "4,8x4,8 cm (Redonda)", Quantidade: "50 unidades" },
    choice: "Quantidade",
  },
  {
    id: "sacolinha-tecido",
    ref: { groupId: 71 },
    role: "lembrancinhas",
    title: "Sacolinhas surpresa",
    hint: "Oxford sublimado com a arte da festa.",
    qty: 10,
    preset: { Formato: "20x25 cm" },
    choice: "Formato",
  },
  {
    id: "sacola-mochila",
    ref: { groupId: 50 },
    role: "lembrancinhas",
    title: "Mochilinhas surpresa",
    hint: "Sacola mochila com cordão, a favorita das festas infantis. Mínimo de 6.",
    qty: 10,
    preset: { Modelo: "Simples", Formato: "30x40 cm" },
    choice: "Formato",
  },
  {
    id: "caneca",
    ref: { groupId: 63 },
    role: "lembrancinhas",
    title: "Canecas personalizadas",
    hint: "Porcelana de 375 ml para padrinhos, avós e convidados especiais.",
    qty: 6,
  },
  {
    id: "foto-ima",
    ref: { groupId: 73 },
    role: "lembrancinhas",
    title: "Ímãs com foto",
    hint: "Foto ímã de 9×15 cm, em pacotes a partir de 10.",
    qty: 1,
    preset: { Quantidade: "25" },
    choice: "Quantidade",
  },
  {
    id: "marcador",
    ref: { groupId: 182 },
    role: "lembrancinhas",
    title: "Marcadores de lembrança",
    hint: "Lembrancinha clássica de batizado e formatura, com 5×18 cm.",
    qty: 1,
    preset: { Papel: "Couchê 250g/m²", Quantidade: "48 unidades" },
    choice: "Quantidade",
  },
  {
    id: "ventarola",
    ref: { groupId: 178 },
    role: "lembrancinhas",
    title: "Leques para os convidados",
    hint: "Ventarolas de 25×20 cm para os dias quentes e a pista de dança.",
    qty: 1,
    preset: { Formato: "25x20 cm", Quantidade: "50" },
    choice: "Quantidade",
  },
  {
    id: "chinelo",
    ref: { groupId: 62 },
    role: "lembrancinhas",
    title: "Chinelos para a pista",
    hint: "Sublimados, do infantil ao adulto. Um tamanho por item: para outros tamanhos, ajuste na página do produto.",
    qty: 10,
    preset: { Tamanho: "Adulto (37-38)" },
    choice: "Tamanho",
  },
  {
    id: "ecobag",
    ref: { groupId: 48 },
    role: "lembrancinhas",
    title: "Ecobags",
    hint: "Sacola de tecido para brindes e materiais do evento.",
    qty: 20,
    choice: "Formato",
  },
  {
    id: "caneta",
    ref: { groupId: 229 },
    role: "lembrancinhas",
    title: "Canetas personalizadas",
    hint: "Brinde para palestras e treinamentos. Pedido mínimo de 8.",
    qty: 50,
    choice: "Cor",
  },

  // Recordações
  {
    id: "quadro-assinaturas",
    ref: { groupId: 375 },
    role: "recordacoes",
    title: "Quadro de assinaturas",
    hint: "Canvas com a arte da festa para os convidados deixarem recados.",
    qty: 1,
    preset: { Formato: "30x45 cm" },
    choice: "Formato",
  },
  {
    id: "photobook",
    ref: { groupId: 74 },
    role: "recordacoes",
    title: "Álbum de fotos",
    hint: "Photobook de 15×15 cm para guardar os melhores momentos.",
    qty: 1,
    preset: { "Número de Páginas": "24" },
    choice: "Número de Páginas",
  },

  // Camisetas e acessórios
  {
    id: "camisetas",
    ref: { groupId: 455 },
    role: "vestuario",
    title: "Camisetas da família",
    hint: "Helanca sublimada com a arte da festa, até 10 peças por item.",
    qty: 4,
    choice: "Acabamento",
    askSizes: true,
  },
  {
    id: "avental",
    ref: { groupId: 121 },
    role: "vestuario",
    title: "Avental do churrasqueiro",
    hint: "Córdoba sublimado, com bolso, adulto ou infantil.",
    qty: 1,
    preset: { Modelo: "Com Bolso", Formato: "Adulto (60x80 cm)" },
    choice: "Formato",
  },
  {
    id: "pulseiras",
    ref: { groupId: 160 },
    role: "vestuario",
    title: "Pulseiras de identificação",
    hint: "Pacotes com 50, para controle de acesso ou para identificar as crianças.",
    qty: 1,
    preset: { "Tipo de Serviço": "Digital", Mídia: "Tyvek" },
    choice: "Cor da Pulseira",
  },
];

/** Paletas da festa. Hex só aqui: a interface aplica por `style`, nunca em className. */
export const PARTY_PALETTES: readonly PartyPalette[] = [
  { id: "colorida", label: "Colorida", colors: ["#f8e028", "#18b0e8", "#e02888", "#b0c818"], background: "#fef8d4", ink: "#c41e78" },
  { id: "rosa-dourado", label: "Rosa e dourado", colors: ["#fce4f0", "#e8789f", "#b8862b"], background: "#fce4f0", ink: "#a3195b" },
  { id: "azul-bebe", label: "Azul bebê", colors: ["#def3fc", "#7cc4ef", "#1f2f5c"], background: "#def3fc", ink: "#1f2f5c" },
  { id: "lilas-menta", label: "Lilás e menta", colors: ["#efe4fa", "#8e6bbf", "#9bd36a"], background: "#efe4fa", ink: "#5b3f8a" },
  { id: "branco-dourado", label: "Branco e dourado", colors: ["#ffffff", "#f6f1e7", "#b8862b"], background: "#f6f1e7", ink: "#7a5a1c" },
  { id: "verde-areia", label: "Verde e areia", colors: ["#e8dcc4", "#2f9e5b", "#6b4a33"], background: "#e8dcc4", ink: "#1f5c3a" },
  { id: "preto-dourado", label: "Preto e dourado", colors: ["#17171c", "#b8862b", "#f6f1e7"], background: "#17171c", ink: "#d9b45a" },
  { id: "azul-marinho", label: "Azul-marinho e prata", colors: ["#1f2f5c", "#c9ccd1", "#ffffff"], background: "#1f2f5c", ink: "#ffffff" },
  { id: "arraia", label: "Arraiá", colors: ["#f8e028", "#e02018", "#2f9e5b", "#2a6fdb"], background: "#f8e028", ink: "#b3150f" },
  { id: "natal", label: "Vermelho e verde", colors: ["#e02018", "#1f5c3a", "#f6f1e7"], background: "#b3150f", ink: "#ffffff" },
  { id: "boteco", label: "Boteco", colors: ["#f0a000", "#6b4a33", "#1c1c1e"], background: "#f0a000", ink: "#000000" },
  { id: "grafite-coral", label: "Grafite e coral", colors: ["#282e34", "#ff463a", "#ffffff"], background: "#282e34", ink: "#ffffff" },
];

export const PARTY_TYPES: readonly PartyType[] = [
  {
    id: "aniversario-infantil",
    label: "Aniversário infantil",
    nameLabel: "Nome do aniversariante",
    namePlaceholder: "Ex.: Alice",
    agePlaceholder: "Ex.: 5 anos",
    phrasePlaceholder: "Ex.: Vem comemorar comigo!",
    themes: ["Safari", "Fundo do mar", "Princesas", "Super-heróis", "Dinossauros", "Unicórnio"],
    palette: "colorida",
    style: "vibrante",
    suggested: ["painel-lona", "cilindros", "toalha-mesa", "convites", "adesivos-redondos", "tags", "sacola-mochila", "camisetas"],
    kit: "aniversario-infantil",
  },
  {
    id: "aniversario-adulto",
    label: "Aniversário adulto",
    nameLabel: "Nome do aniversariante",
    namePlaceholder: "Ex.: Marcos",
    agePlaceholder: "Ex.: 40 anos",
    phrasePlaceholder: "Ex.: 40 anos bem vividos",
    themes: ["Boteco", "Anos 80", "Tropical", "Neon party", "Minimalista"],
    palette: "preto-dourado",
    style: "moderno",
    suggested: ["painel-tecido", "neon-happy-birthday", "toalha-mesa", "display-mesa", "convites", "caneca", "tags"],
  },
  {
    id: "cha-de-bebe",
    label: "Chá de bebê / revelação",
    nameLabel: "Nome do bebê ou da família",
    namePlaceholder: "Ex.: Bebê Souza",
    agePlaceholder: "Ex.: Chegando em março",
    phrasePlaceholder: "Ex.: Menino ou menina?",
    themes: ["Ursinho", "Nuvens", "Safari baby", "Bailarina", "Menino ou menina?"],
    palette: "azul-bebe",
    style: "minimal",
    suggested: ["painel-tecido", "neon-boy-or-girl", "cilindros", "toalha-mesa", "convites", "adesivos-redondos", "tags", "caneca"],
    kit: "cha-de-bebe",
  },
  {
    id: "batizado",
    label: "Batizado",
    nameLabel: "Nome de quem será batizado",
    namePlaceholder: "Ex.: Miguel",
    agePlaceholder: "Ex.: 1 aninho",
    phrasePlaceholder: "Ex.: Hoje é dia de bênção",
    themes: ["Anjinhos", "Pombinha da paz", "Floral delicado", "Clássico branco"],
    palette: "branco-dourado",
    style: "elegante",
    suggested: ["painel-tecido", "toalha-mesa", "convites", "marcador", "foto-ima", "sacolinha-tecido", "tags", "caneca"],
    kit: "batizado",
  },
  {
    id: "15-anos",
    label: "15 anos",
    nameLabel: "Nome da debutante",
    namePlaceholder: "Ex.: Valentina",
    agePlaceholder: "Ex.: 15 anos",
    phrasePlaceholder: "Ex.: Meus 15 anos",
    themes: ["Paris", "Jardim encantado", "Hollywood", "Neon party", "Baile de máscaras"],
    palette: "rosa-dourado",
    style: "elegante",
    suggested: ["painel-tecido", "poster-fotos", "quadro-assinaturas", "display-mesa", "convites-longos", "ventarola", "chinelo", "photobook"],
    kit: "15-anos",
  },
  {
    id: "casamento",
    label: "Casamento",
    nameLabel: "Nome dos noivos",
    namePlaceholder: "Ex.: Ana & Pedro",
    agePlaceholder: "Ex.: 10 anos juntos",
    phrasePlaceholder: "Ex.: O amor está no ar",
    themes: ["Rústico", "Clássico", "Praia", "Boho", "Industrial"],
    palette: "verde-areia",
    style: "elegante",
    suggested: ["neon-love", "painel-tecido", "quadro-assinaturas", "display-mesa", "guardanapo", "convites-longos", "ventarola", "chinelo", "photobook"],
    kit: "casamento",
  },
  {
    id: "festa-junina",
    label: "Festa junina",
    nameLabel: "Nome do arraiá",
    namePlaceholder: "Ex.: Arraiá da Escola Sol",
    agePlaceholder: "Ex.: 3ª edição",
    phrasePlaceholder: "Ex.: Arraiá bão demais!",
    themes: ["Arraiá", "Caipira", "Quadrilha", "São João"],
    palette: "arraia",
    style: "retro",
    suggested: ["faixa", "banner-boas-vindas", "toalha-mesa", "convites", "adesivos-redondos", "sacolinha-tecido", "ventarola", "camisetas"],
    kit: "festa-junina",
  },
  {
    id: "formatura",
    label: "Formatura",
    nameLabel: "Turma ou nome do formando",
    namePlaceholder: "Ex.: Medicina UFRJ 2026",
    agePlaceholder: "Ex.: Turma 2026",
    phrasePlaceholder: "Ex.: Missão cumprida!",
    themes: ["Black tie", "Clássico", "Tropical", "Neon"],
    palette: "azul-marinho",
    style: "elegante",
    suggested: ["painel-lona", "faixa", "quadro-assinaturas", "display-mesa", "caneca", "pulseiras", "photobook", "convites"],
    kit: "formatura",
  },
  {
    id: "evento-corporativo",
    label: "Evento corporativo",
    nameLabel: "Nome do evento ou da empresa",
    namePlaceholder: "Ex.: Convenção de Vendas 2026",
    agePlaceholder: "Ex.: 10 anos de empresa",
    phrasePlaceholder: "Ex.: Bem-vindos!",
    themes: ["Convenção", "Lançamento", "Feira", "Workshop"],
    palette: "grafite-coral",
    style: "moderno",
    suggested: ["wind-banner", "roll-up", "banner-boas-vindas", "display-mesa", "pulseiras", "ecobag", "caneta", "caneca"],
    kit: "evento-corporativo",
  },
  {
    id: "confraternizacao",
    label: "Churrasco / confraternização",
    nameLabel: "Nome do encontro",
    namePlaceholder: "Ex.: Churrasco da Turma",
    agePlaceholder: "Ex.: 5º encontro",
    phrasePlaceholder: "Ex.: Bora brindar!",
    themes: ["Boteco", "Churrasco", "Futebol", "Fim de ano"],
    palette: "boteco",
    style: "retro",
    suggested: ["neon-cerveja", "faixa", "avental", "tabua-carne", "porta-copo", "caneca", "camisetas", "jogo-americano"],
    kit: "churrasco",
  },
  {
    id: "natal",
    label: "Natal e fim de ano",
    nameLabel: "Família ou empresa",
    namePlaceholder: "Ex.: Família Oliveira",
    agePlaceholder: "Ex.: 2026",
    phrasePlaceholder: "Ex.: Feliz Natal e um próspero Ano-Novo!",
    themes: ["Natal clássico", "Natal nórdico", "Réveillon"],
    palette: "natal",
    style: "classico",
    suggested: ["neon-feliz-natal", "toalha-mesa", "jogo-americano", "guardanapo", "almofada", "sacolinha-tecido", "tags", "convites", "caneca"],
    kit: "natal",
  },
  {
    id: "outra",
    label: "Outra comemoração",
    nameLabel: "Nome do homenageado ou do evento",
    namePlaceholder: "Ex.: Bodas de Prata",
    agePlaceholder: "Ex.: 25 anos",
    phrasePlaceholder: "Ex.: Obrigado por celebrar com a gente",
    themes: ["Tropical", "Clássico", "Colorido", "Minimalista"],
    palette: "colorida",
    style: "classico",
    suggested: ["painel-lona", "toalha-mesa", "convites", "adesivos-redondos", "tags", "caneca"],
  },
];

/** Os 10 kits prontos. Valor = soma dos itens (calculado item a item, sem desconto de kit). */
export const KITS: readonly KitDef[] = [
  {
    slug: "aniversario-infantil",
    name: "Kit Aniversário Infantil",
    partyType: "aniversario-infantil",
    tagline: "Mesa do bolo completa e mochilinhas surpresa para a criançada.",
    description:
      "Painel em lona, trio de cilindros e toalha montam a mesa do bolo. Convites, adesivos, tags e mochilinhas cuidam dos convidados, e as camisetas vestem a família. Tudo com o nome, a idade e o tema do aniversariante.",
    audience: "Para cerca de 20 crianças",
    theme: "Safari",
    palette: "colorida",
    phrase: "Vem comemorar comigo!",
    cover: "cilindros",
    items: [
      { item: "painel-lona", size: { widthCm: 200, heightCm: 150 } },
      { item: "cilindros" },
      { item: "toalha-mesa" },
      { item: "convites" },
      { item: "adesivos-redondos" },
      { item: "tags", preset: { Quantidade: "25 unidades" } },
      { item: "sacola-mochila", qty: 20 },
      { item: "camisetas", qty: 3 },
    ],
  },
  {
    slug: "cha-de-bebe",
    name: "Kit Chá de Bebê e Revelação",
    partyType: "cha-de-bebe",
    tagline: "Painel em tecido, letreiro Boy or Girl e mimos para os convidados.",
    description:
      "O letreiro neon Boy or Girl e o painel em tecido fazem o cenário da revelação; cilindros e toalha completam a mesa. Convites, adesivos e tags levam o nome do bebê, e as canecas ficam de lembrança para os papais.",
    audience: "Para cerca de 30 convidados",
    theme: "Ursinho",
    palette: "azul-bebe",
    phrase: "Menino ou menina?",
    cover: "neon-boy-or-girl",
    items: [
      { item: "painel-tecido", size: { widthCm: 140, heightCm: 200 } },
      { item: "neon-boy-or-girl" },
      { item: "cilindros" },
      { item: "toalha-mesa" },
      { item: "convites" },
      { item: "adesivos-redondos" },
      { item: "tags" },
      { item: "caneca", qty: 2, title: "Canecas para os papais" },
    ],
  },
  {
    slug: "batizado",
    name: "Kit Batizado",
    partyType: "batizado",
    tagline: "Lembranças delicadas para a cerimônia e a recepção.",
    description:
      "Painel em tecido e toalha para a recepção, convites para a família e lembrancinhas que duram: marcadores, ímãs com foto e sacolinhas. As canecas são o mimo dos padrinhos.",
    audience: "Para cerca de 40 convidados",
    theme: "Anjinhos",
    palette: "branco-dourado",
    phrase: "Hoje é dia de bênção",
    cover: "sacolinha-tecido",
    items: [
      { item: "painel-tecido", size: { widthCm: 140, heightCm: 200 } },
      { item: "toalha-mesa" },
      { item: "convites" },
      { item: "marcador" },
      { item: "foto-ima" },
      { item: "sacolinha-tecido", qty: 20 },
      { item: "tags" },
      { item: "caneca", qty: 2, title: "Canecas para os padrinhos" },
    ],
  },
  {
    slug: "15-anos",
    name: "Kit 15 Anos",
    partyType: "15-anos",
    tagline: "Do painel aos leques da pista, tudo com o nome da debutante.",
    description:
      "Painel em tecido e pôster de fotos montam o cenário; o quadro de assinaturas e o álbum guardam a festa. Plaquinhas de mesa, convites, leques e tags completam a noite.",
    audience: "Para cerca de 100 convidados",
    theme: "Paris",
    palette: "rosa-dourado",
    phrase: "Meus 15 anos",
    cover: "ventarola",
    items: [
      { item: "painel-tecido", size: { widthCm: 140, heightCm: 200 } },
      { item: "poster-fotos", size: { widthCm: 60, heightCm: 90 } },
      { item: "quadro-assinaturas" },
      { item: "display-mesa", preset: { "Kit com": "26 unidades" } },
      { item: "convites-longos" },
      { item: "ventarola" },
      { item: "tags", preset: { Quantidade: "125 unidades" } },
      { item: "photobook" },
    ],
  },
  {
    slug: "casamento",
    name: "Kit Casamento",
    partyType: "casamento",
    tagline: "Recepção com a assinatura dos noivos: neon, mesa posta e lembranças.",
    description:
      "O letreiro Love e o painel em tecido fazem o cantinho das fotos. Quadro de assinaturas, plaquinhas e guardanapos vestem as mesas; convites, leques, tags e o álbum de fotos completam o grande dia.",
    audience: "Para cerca de 100 convidados",
    theme: "Rústico",
    palette: "verde-areia",
    phrase: "O amor está no ar",
    cover: "neon-love",
    items: [
      { item: "neon-love" },
      { item: "painel-tecido", size: { widthCm: 140, heightCm: 200 } },
      { item: "quadro-assinaturas" },
      { item: "display-mesa", preset: { "Kit com": "26 unidades" } },
      { item: "guardanapo", qty: 5 },
      { item: "convites-longos", preset: { Quantidade: "210 unidades" } },
      { item: "ventarola" },
      { item: "tags", preset: { Quantidade: "125 unidades" } },
      { item: "photobook" },
    ],
  },
  {
    slug: "festa-junina",
    name: "Kit Festa Junina",
    partyType: "festa-junina",
    tagline: "Arraiá completo: faixa, mesa caipira e lembrancinhas.",
    description:
      "Faixa e banner anunciam o arraiá, a toalha veste a mesa de quitutes e as sacolinhas levam paçoca e pé de moleque. Convites, adesivos, leques e as camisetas da quadrilha seguem o mesmo tema.",
    audience: "Para cerca de 50 pessoas",
    theme: "Arraiá",
    palette: "arraia",
    phrase: "Arraiá bão demais!",
    cover: "faixa",
    items: [
      { item: "faixa", size: { widthCm: 300, heightCm: 60 } },
      { item: "banner-boas-vindas", size: { widthCm: 60, heightCm: 90 } },
      { item: "toalha-mesa" },
      { item: "convites" },
      { item: "adesivos-redondos" },
      { item: "sacolinha-tecido", qty: 20 },
      { item: "ventarola", preset: { Quantidade: "25" } },
      { item: "camisetas", qty: 4, title: "Camisetas da quadrilha" },
    ],
  },
  {
    slug: "formatura",
    name: "Kit Formatura",
    partyType: "formatura",
    tagline: "A turma em destaque: painel, faixa e recordações da festa.",
    description:
      "Painel em lona de 3 m e faixa para a foto da turma, quadro de assinaturas grande para os recados, plaquinhas de mesa, pulseiras de acesso, canecas de lembrança, convites e o álbum da festa.",
    audience: "Para uma turma de até 30 formandos",
    theme: "Black tie",
    palette: "azul-marinho",
    phrase: "Missão cumprida!",
    cover: "quadro-assinaturas",
    items: [
      { item: "painel-lona", size: { widthCm: 300, heightCm: 200 } },
      { item: "faixa", size: { widthCm: 300, heightCm: 60 } },
      { item: "quadro-assinaturas", preset: { Formato: "100x50 cm" } },
      { item: "display-mesa", preset: { "Kit com": "26 unidades" } },
      { item: "caneca", qty: 10 },
      { item: "pulseiras" },
      { item: "photobook", preset: { "Número de Páginas": "36" } },
      { item: "convites" },
    ],
  },
  {
    slug: "evento-corporativo",
    name: "Kit Evento Corporativo",
    partyType: "evento-corporativo",
    tagline: "Sinalização da entrada ao palco e brindes com a marca da empresa.",
    description:
      "Dois wind banners na entrada, roll-up e banner de boas-vindas no credenciamento, plaquinhas nas mesas e pulseiras de acesso. Ecobags, canetas e canecas levam a marca para casa.",
    audience: "Para cerca de 50 participantes",
    theme: "Convenção",
    palette: "grafite-coral",
    phrase: "Bem-vindos!",
    cover: "roll-up",
    items: [
      { item: "wind-banner", qty: 2 },
      { item: "roll-up" },
      { item: "banner-boas-vindas", size: { widthCm: 80, heightCm: 120 } },
      { item: "display-mesa", preset: { "Kit com": "26 unidades" } },
      { item: "pulseiras" },
      { item: "ecobag", qty: 20 },
      { item: "caneta", qty: 50 },
      { item: "caneca", qty: 10 },
    ],
  },
  {
    slug: "churrasco",
    name: "Kit Churrasco e Confraternização",
    partyType: "confraternizacao",
    tagline: "Bar com neon, avental do churrasqueiro e porta-copos para a galera.",
    description:
      "O letreiro neon de caneca de cerveja ilumina o bar e a faixa dá nome ao encontro. Avental e tábua de carne são do churrasqueiro; porta-copos, jogos americanos, canecas e camisetas são da galera.",
    audience: "Para cerca de 12 pessoas",
    theme: "Boteco",
    palette: "boteco",
    phrase: "Bora brindar!",
    cover: "neon-cerveja",
    items: [
      { item: "neon-cerveja" },
      { item: "faixa", size: { widthCm: 200, heightCm: 50 } },
      { item: "avental" },
      { item: "tabua-carne" },
      { item: "porta-copo", qty: 12 },
      { item: "jogo-americano", qty: 6 },
      { item: "caneca", qty: 6 },
      { item: "camisetas", qty: 6, title: "Camisetas da galera" },
    ],
  },
  {
    slug: "natal",
    name: "Kit Natal e Fim de Ano",
    partyType: "natal",
    tagline: "Ceia decorada, presentes embalados e cartões com a sua mensagem.",
    description:
      "Letreiro Feliz Natal, toalha, jogos americanos e guardanapos para a ceia; almofadas para a sala. Sacolas e etiquetas embalam os presentes, os cartões levam a sua mensagem e as canecas viram presente.",
    audience: "Para uma ceia de até 12 pessoas",
    theme: "Natal clássico",
    palette: "natal",
    phrase: "Feliz Natal e um próspero Ano-Novo!",
    cover: "neon-feliz-natal",
    items: [
      { item: "neon-feliz-natal" },
      { item: "toalha-mesa" },
      { item: "jogo-americano", qty: 6 },
      { item: "guardanapo", qty: 3 },
      { item: "almofada", qty: 2 },
      { item: "sacolinha-tecido", qty: 6, preset: { Formato: "40x40 cm" }, title: "Sacolas de presente" },
      { item: "tags", title: "Etiquetas de presente" },
      { item: "convites", title: "Cartões de Natal" },
      { item: "caneca", qty: 4 },
    ],
  },
];

export function getKit(slug: string): KitDef | undefined {
  return KITS.find((k) => k.slug === slug);
}

export function getPartyType(id: string): PartyType {
  return PARTY_TYPES.find((t) => t.id === id) ?? PARTY_TYPES[0];
}

export function getPalette(id: string): PartyPalette {
  return PARTY_PALETTES.find((p) => p.id === id) ?? PARTY_PALETTES[0];
}

export function getPartyProductDef(id: string): PartyProductDef | undefined {
  return PARTY_PRODUCTS.find((p) => p.id === id);
}

// ------------------------------------------------------------------------------------------- produto

/** Dados do produto que a montagem usa no navegador (preço, medida e mockup). */
export type PartyProduct = {
  slug: string;
  groupId?: number;
  name: string;
  image: string;
  categorySlug: string;
  options: Record<string, string[]>;
  variations: Variation[];
  price: number;
  priceQty: number;
  leadDays: number | null;
  customSize: CustomSize | null;
  minQty: number;
  maxQty: number;
  sizes: string[] | null;
};

/** Item pronto para a tela: definição (com o que o kit troca) + produto do catálogo. */
export type PartyItem = {
  /** Única na lista (no kit, o mesmo produto pode aparecer mais de uma vez). */
  key: string;
  id: string;
  role: PartyRoleId;
  title: string;
  hint: string;
  qty: number;
  size: Size | null;
  preset: Selection;
  choice: string | null;
  parts: PartyPart[] | null;
  askSizes: boolean;
  product: PartyProduct;
};

type CatalogLike = Pick<Product, "id" | "slug" | "groupId">;

export function findProduct<T extends CatalogLike>(products: readonly T[], ref: ProductRef): T | undefined {
  if ("slug" in ref) return products.find((p) => p.slug === ref.slug);
  // Pelo grupo da API; o "Tags" derivado tem id próprio e só entra pelo slug.
  return products.find((p) => p.groupId === ref.groupId && p.id === String(ref.groupId));
}

export function toPartyProduct(p: Product): PartyProduct {
  return {
    slug: p.slug,
    groupId: p.groupId,
    name: p.name,
    image: p.image,
    categorySlug: p.categorySlug,
    options: p.options,
    variations: p.variations,
    price: p.price,
    priceQty: p.priceQty,
    leadDays: p.leadDays,
    customSize: p.customSize ?? null,
    minQty: p.minQty ?? 1,
    maxQty: p.maxQty ?? MAX_QTY,
    sizes: p.sizes ?? null,
  };
}

export function partyItem(def: PartyProductDef, product: Product, override?: KitItemDef, key: string = def.id): PartyItem {
  return {
    key,
    id: def.id,
    role: def.role,
    title: override?.title ?? def.title,
    hint: def.hint,
    qty: override?.qty ?? def.qty,
    size: override?.size ?? def.size ?? null,
    preset: { ...(def.preset ?? {}), ...(override?.preset ?? {}) },
    choice: def.choice ?? null,
    parts: def.parts ?? null,
    askSizes: def.askSizes ?? false,
    product: toPartyProduct(product),
  };
}

/** Lista do Crie Sua Festa (produtos que sumirem do catálogo ficam de fora). */
export function resolvePartyItems(products: readonly Product[]): PartyItem[] {
  return PARTY_PRODUCTS.flatMap((def) => {
    const product = findProduct(products, def.ref);
    return product ? [partyItem(def, product)] : [];
  });
}

/** Composição do kit, na ordem do kit. */
export function resolveKitItems(kit: KitDef, products: readonly Product[]): PartyItem[] {
  return kit.items.flatMap((entry, index) => {
    const def = getPartyProductDef(entry.item);
    const product = def ? findProduct(products, def.ref) : undefined;
    return def && product ? [partyItem(def, product, entry, `${entry.item}-${index}`)] : [];
  });
}

// ------------------------------------------------------------------------------------------- opções

function norm(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Rótulo limpo → chave real da opção ("Formato" → "02 - Formato"). */
export function optionKeyFor(options: Record<string, string[]>, label: string): string | undefined {
  const wanted = norm(label);
  return Object.keys(options).find((key) => norm(cleanOptionLabel(key)) === wanted);
}

/** Preset em rótulos limpos → seleção com as chaves reais. Rótulo ou valor que não existe fica de fora. */
export function presetSelection(options: Record<string, string[]>, preset: Selection): Selection {
  const out: Selection = {};
  for (const [label, value] of Object.entries(preset)) {
    const key = optionKeyFor(options, label);
    if (key && options[key].includes(value)) out[key] = value;
  }
  return out;
}

function compatible(variation: Variation, wanted: Selection): boolean {
  return Object.entries(wanted).every(([key, value]) => variation.v[key] === undefined || variation.v[key] === value);
}

function hits(variation: Variation, wanted: Selection): number {
  return Object.entries(wanted).filter(([key, value]) => variation.v[key] === value).length;
}

/** Variações com preço que respeitam o preset. */
export function compatibleVariations(product: Pick<PartyProduct, "options" | "variations">, preset: Selection): Variation[] {
  const wanted = presetSelection(product.options, preset);
  return product.variations.filter((v) => v.p > 0 && compatible(v, wanted));
}

/** Seleção completa: a variação mais em conta que respeita o preset (as opções em aberto ficam nela). */
export function resolveSelection(product: Pick<PartyProduct, "options" | "variations">, preset: Selection): Selection {
  const wanted = presetSelection(product.options, preset);
  const priced = product.variations.filter((v) => v.p > 0);
  const pool = priced.filter((v) => compatible(v, wanted));
  let best: Variation | null = null;
  for (const v of pool.length ? pool : priced) {
    if (!best) {
      best = v;
      continue;
    }
    const a = hits(v, wanted);
    const b = hits(best, wanted);
    if (a > b || (a === b && v.p < best.p)) best = v;
  }
  return { ...(best?.v ?? {}), ...wanted };
}

/** Valores da opção trocada na montagem que têm preço com o resto do preset, na ordem do catálogo. */
export function choiceValues(product: Pick<PartyProduct, "options" | "variations">, choice: string, preset: Selection): { key: string; values: string[] } | null {
  const key = optionKeyFor(product.options, choice);
  if (!key) return null;
  const fixed = Object.fromEntries(Object.entries(presetSelection(product.options, preset)).filter(([k]) => k !== key));
  const seen = new Set<string>();
  for (const v of product.variations) {
    if (v.p > 0 && compatible(v, fixed) && v.v[key]) seen.add(v.v[key]);
  }
  const values = product.options[key].filter((value) => seen.has(value));
  return values.length ? { key, values } : null;
}

/** Opções com mais de um valor possível que a montagem não fixa: nesse caso o preço vale "a partir de". */
export function openOptions(product: Pick<PartyProduct, "options" | "variations">, preset: Selection, fixedLabels: string[] = []): string[] {
  const wanted = presetSelection(product.options, preset);
  const fixed = new Set(fixedLabels.map((label) => optionKeyFor(product.options, label)).filter((key): key is string => Boolean(key)));
  const pool = product.variations.filter((v) => v.p > 0 && compatible(v, wanted));
  return optionKeys(product.options).filter((key) => {
    if (fixed.has(key) || key in wanted) return false;
    return new Set(pool.map((v) => v.v[key]).filter(Boolean)).size > 1;
  });
}

/** Opções da seleção com rótulo limpo, na ordem do produto ("Formato: 45x60 cm"). */
export function selectionSummary(options: Record<string, string[]>, selection: Selection): [string, string][] {
  return optionKeys(options)
    .filter((key) => selection[key])
    .map((key) => [cleanOptionLabel(key).replace(/:$/, ""), selection[key]]);
}

// ------------------------------------------------------------------------------------------- preço

export type ItemConfig = { qty: number; choice?: string | null; widthCm?: number; heightCm?: number };

export type PricedLine = {
  /** Peça do conjunto (P, M, G…), ou null. */
  label: string | null;
  selection: Selection;
  /** Preço de um pedido: um pacote (setQty unidades) ou uma peça na medida (m²). */
  unitPrice: number;
  setQty: number;
  qty: number;
  total: number;
  leadDays: number | null;
  variationId?: number;
  area: AreaQuote | null;
  /** Preço do m² da variação (só nos produtos por m²). */
  pricePerM2: number | null;
  /** Ainda há opções em aberto: o preço é o da configuração mais em conta. */
  open: boolean;
};

export type PricedItem = {
  lines: PricedLine[];
  qty: number;
  limits: { min: number; max: number };
  /** Medida usada no cálculo (produtos por m²). */
  size: Size | null;
  total: number;
  leadDays: number | null;
  open: boolean;
  error: string | null;
};

export type SizeLimits = { minWidthCm: number; maxWidthCm: number; minHeightCm: number; maxHeightCm: number; minArea: number; maxArea: number };

const round2 = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Limites da quantidade de pedidos. Produto vendido por unidade: mínimo e máximo da faixa da variação (Caderno
 * "De 11 até 100") ou do produto, até `ceiling` (MAX_QTY na festa; o Monte Seu Kit vai até 999, como o
 * carrinho). Vendido em pacote (setQty > 1): a quantidade conta pacotes, de 1 a MAX_QTY.
 */
export function qtyLimits(product: Pick<PartyProduct, "minQty" | "maxQty">, setQty: number, ceiling = MAX_QTY, variation?: Pick<Variation, "mn" | "mx"> | null): { min: number; max: number } {
  if (setQty > 1) return { min: 1, max: MAX_QTY };
  const units = unitLimits(product, variation);
  const min = clamp(units.min, 1, ceiling);
  const max = clamp(units.max || ceiling, min, ceiling);
  return { min, max };
}

/** Limites da medida em cm (0 na API = sem limite: vale MAX_SIDE_CM). */
export function sizeLimits(customSize: CustomSize): SizeLimits {
  const cm = (meters: number, fallback: number) => (meters > 0 ? Math.round(meters * 100) : fallback);
  return {
    minWidthCm: cm(customSize.minWidth, 1),
    maxWidthCm: cm(customSize.maxWidth, MAX_SIDE_CM),
    minHeightCm: cm(customSize.minHeight, 1),
    maxHeightCm: cm(customSize.maxHeight, MAX_SIDE_CM),
    minArea: customSize.minArea,
    maxArea: customSize.maxArea,
  };
}

/** Preset do item com o valor escolhido na montagem. */
export function itemPreset(item: Pick<PartyItem, "preset" | "choice">, choiceValue?: string | null): Selection {
  return item.choice && choiceValue ? { ...item.preset, [item.choice]: choiceValue } : item.preset;
}

/** Configuração inicial do item (quantidade e medida sugeridas). */
export function defaultConfig(item: Pick<PartyItem, "qty" | "size">): ItemConfig {
  return { qty: item.qty, choice: null, widthCm: item.size?.widthCm, heightCm: item.size?.heightCm };
}

function maxLead(days: (number | null)[]): number | null {
  const known = days.filter((d): d is number => typeof d === "number" && d > 0);
  return known.length ? Math.max(...known) : null;
}

/**
 * Preço do item: variação do catálogo (`quote`) e, nos produtos por m², `areaQuote` com largura × altura.
 * Cada peça do conjunto vira uma linha; o total multiplica pela quantidade de pedidos. `ceiling`: teto da
 * quantidade de pedidos (qtyLimits).
 */
export function priceItem(item: Pick<PartyItem, "product" | "parts" | "preset" | "choice">, config: ItemConfig, ceiling = MAX_QTY): PricedItem {
  const { product } = item;
  const keys = optionKeys(product.options);
  const fallback = { price: product.price, qty: product.priceQty, leadDays: product.leadDays };
  const base = itemPreset(item, config.choice);
  const specs = item.parts ? item.parts.map((part) => ({ label: part.label, preset: { ...base, ...part.preset } })) : [{ label: null, preset: base }];
  const fixed = item.choice ? [item.choice] : [];
  const width = Number.isFinite(config.widthCm) ? (config.widthCm as number) : 0;
  const height = Number.isFinite(config.heightCm) ? (config.heightCm as number) : 0;

  const drafts = specs.map((spec) => {
    const selection = resolveSelection(product, spec.preset);
    const q = quote(product.variations, selection, fallback, keys.length);
    const area = product.customSize ? areaQuote(q.price, width, height, product.customSize) : null;
    return { spec, selection, q, area };
  });

  const setQty = product.customSize ? 1 : (drafts[0]?.q.qty ?? 1);
  const limits = qtyLimits(product, setQty, ceiling, drafts[0]?.q.variation);
  const qty = clamp(Math.round(config.qty) || limits.min, limits.min, limits.max);

  const lines: PricedLine[] = drafts.map(({ spec, selection, q, area }) => {
    const unitPrice = area ? area.price : q.price;
    return {
      label: spec.label,
      selection,
      unitPrice,
      setQty: area ? 1 : q.qty,
      qty,
      total: round2(unitPrice * qty),
      leadDays: q.leadDays,
      variationId: q.variation?.id,
      area,
      pricePerM2: area ? q.price : null,
      open: openOptions(product, spec.preset, fixed).length > 0,
    };
  });

  let error = lines.find((line) => line.area?.error)?.area?.error ?? null;
  if (!error && product.customSize && (width > MAX_SIDE_CM || height > MAX_SIDE_CM)) error = `Medida máxima: ${MAX_SIDE_CM / 100} m de cada lado.`;

  return {
    lines,
    qty,
    limits,
    size: product.customSize ? { widthCm: width, heightCm: height } : null,
    total: round2(lines.reduce((sum, line) => sum + line.total, 0)),
    leadDays: maxLead(lines.map((line) => line.leadDays)),
    open: lines.some((line) => line.open),
    error,
  };
}

/** Soma de itens já calculados: total, maior prazo e se algum preço é "a partir de". */
export function sumPriced(priced: Pick<PricedItem, "total" | "leadDays" | "open" | "lines">[]): { total: number; leadDays: number | null; open: boolean; lines: number } {
  return {
    total: round2(priced.reduce((sum, p) => sum + p.total, 0)),
    leadDays: maxLead(priced.map((p) => p.leadDays)),
    open: priced.some((p) => p.open),
    lines: priced.reduce((sum, p) => sum + p.lines.length, 0),
  };
}

/** Valor do kit com as quantidades e medidas sugeridas (item a item, sem desconto). */
export function kitQuote(items: PartyItem[]) {
  return sumPriced(items.map((item) => priceItem(item, defaultConfig(item))));
}

const fmtNumber = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** "200 × 150 cm". */
export function measureLabel(size: Size): string {
  return `${fmtNumber(size.widthCm)} × ${fmtNumber(size.heightCm)} cm`;
}

/** Quanto vem do item: "200 × 150 cm", "P, M e G", "96 un.", "20 un.". */
export function amountLabel(item: Pick<PartyItem, "parts">, priced: PricedItem): string {
  const times = priced.qty > 1 ? `${priced.qty} × ` : "";
  if (item.parts) return times + item.parts.map((part) => part.label).join(", ").replace(/, ([^,]*)$/, " e $1");
  if (priced.size) return times + measureLabel(priced.size);
  const setQty = priced.lines[0]?.setQty ?? 1;
  return `${(priced.qty * setQty).toLocaleString("pt-BR")} un.`;
}

// ------------------------------------------------------------------------------------------- festa

/** O que o cliente conta sobre a festa (escrito uma vez, vale para todos os itens). */
export type PartyDetails = {
  type: string;
  theme: string;
  name: string;
  age: string;
  /** AAAA-MM-DD (campo de data), ou vazio. */
  date: string;
  palette: string;
  phrase: string;
};

export function emptyDetails(type: PartyType, overrides: Partial<PartyDetails> = {}): PartyDetails {
  return { type: type.id, theme: "", name: "", age: "", date: "", palette: type.palette, phrase: "", ...overrides };
}

/** "2026-11-15" → "15/11/2026". */
export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso.trim();
}

/** Opções da festa que vão em cada item do carrinho (o "Texto da arte" aparece no checkout). */
export function partyOptions(details: PartyDetails, extra: Record<string, string> = {}): Record<string, string> {
  const type = getPartyType(details.type);
  const entries: [string, string][] = [
    ...Object.entries(extra),
    ["Festa", details.name.trim()],
    ["Tipo de festa", type.label],
    ["Tema", details.theme.trim()],
    ["Idade ou marco", details.age.trim()],
    ["Data da festa", details.date ? formatDate(details.date) : ""],
    ["Paleta", getPalette(details.palette).label],
    ["Texto da arte", details.phrase.trim()],
  ];
  return Object.fromEntries(entries.filter(([, value]) => value));
}

/** Linha "Arte: …" do carrinho: a equipe monta a arte com o tema, as cores e os textos da festa. */
export function partyArtName(details: PartyDetails): string {
  const type = getPartyType(details.type);
  const theme = details.theme.trim();
  return `arte da festa · ${theme ? `tema ${theme}` : type.label.toLowerCase()} · paleta ${getPalette(details.palette).label.toLowerCase()}`;
}

/** Slug para URLs e IDs ("Festa da Alice!" → "festa-da-alice"). */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** Bundle do carrinho da festa montada no Crie Sua Festa. */
export function partyBundle(name: string): { id: string; name: string } {
  const slug = slugify(name);
  return { id: slug ? `festa-${slug}` : "festa", name: PARTY_BUNDLE_NAME };
}

/** Dias úteis (seg. a sex.) depois de `from` até `to`, inclusive. Feriados não entram na conta. */
export function businessDaysBetween(from: Date, to: Date): number {
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const end = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  if (end <= start) return 0;
  let days = 0;
  for (let t = start + 86_400_000; t <= end; t += 86_400_000) {
    const weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
  }
  return days;
}
