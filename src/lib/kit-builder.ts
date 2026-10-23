import type { Product, Variation } from "./catalog";
import { formatSize, mockupSpec, type MockupSpec } from "./mockup.ts";
import type { Selection } from "./pricing.ts";
import { cleanOptionLabel, optionKeys, unitLimits } from "./pricing.ts";
import {
  MAX_QTY,
  PARTY_PALETTES,
  choiceValues,
  compatibleVariations,
  findProduct,
  formatDate,
  itemPreset,
  priceItem,
  sizeLimits,
  slugify,
  sumPriced,
  toPartyProduct,
  type PartyPalette,
  type PartyProduct,
  type PricedItem,
  type ProductRef,
  type Size,
} from "./party.ts";

/*
 * Monte Seu Kit do seu jeito (/monte-seu-kit/montar): um assistente pergunta para que é o kit, quantos kits e
 * quanto investir por kit, sugere produtos reais do catálogo dentro do orçamento e deixa trocar, tirar e buscar
 * qualquer outro produto. O valor sai item a item, como nas festas (party.ts), mas na quantidade do pedido
 * inteiro: unidades por kit × kits, na faixa de preço certa (Caderno "De 11 até 100", camiseta 11–100), no
 * pacote que sai mais em conta (adesivos em cartelas de 48, 96, 288…) e com o mínimo de cada produto.
 *
 * Módulo puro (sem React e sem o alias @/): roda no `node --test` (kit-builder.test.ts).
 */

/** Kits por montagem (o carrinho aceita até 999 unidades por item vendido por unidade). */
export const MAX_KITS = 999;
/** Teto de pedidos por item: o do carrinho para produto vendido por unidade (pacote e m² seguem em 99). */
export const KIT_CEILING = 999;

// ------------------------------------------------------------------------------------------- tipos

/** Produto que o assistente sugere. Opções em `preset` e `choice` usam o rótulo limpo ("Formato"). */
export type KitProductDef = {
  id: string;
  ref: ProductRef;
  /**
   * Faixas em produtos separados (Camisa em Dryfit "de 01 à 10", "de 11 à 100", "a partir de 101"): o produto
   * do pedido é o da faixa que contém as unidades do kit inteiro.
   */
  tiers?: { from: number; groupId: number }[];
  title: string;
  hint: string;
  /** Quantidade sugerida por kit: unidades, ou pacotes quando `perPerson`. */
  perKit: number;
  /** Cada kit leva o próprio pacote (cartões de visita com o nome da pessoa): 1 pacote por kit. */
  perPerson?: boolean;
  /** Unidades que vêm em cada pedido quando o catálogo vende o pacote como 1 (cordão: 10 por pedido). */
  pack?: number;
  preset?: Selection;
  /** Opção que o cliente troca no próprio kit (cor, formato, tamanho do pacote…). */
  choice?: string;
  /** Pede a grade de tamanhos (P, M, G…) num campo de texto. */
  askSizes?: boolean;
  size?: Size;
};

/** Produto sugerido num objetivo: pode trocar a quantidade por kit e o nome mostrado. */
export type KitCandidate = { item: string; essential?: boolean; perKit?: number; title?: string; hint?: string };

export type KitIcon = "users" | "gift" | "badge" | "tag" | "store" | "heart" | "balloon";

/** Para que é o kit (primeira pergunta do assistente). */
export type KitGoal = {
  id: string;
  label: string;
  /** Nome do kit montado ("Kit boas-vindas"): título do kit e grupo do carrinho. */
  name: string;
  /** Nome curto do objetivo ("Boas-vindas"). */
  short: string;
  description: string;
  icon: KitIcon;
  /** Quem recebe cada kit, no singular e no plural ("pessoa", "pessoas"). */
  unit: [string, string];
  defaultKits: number;
  /** Escala das faixas de orçamento: brinde por pessoa ou material de um negócio. */
  scale: "pessoa" | "negocio";
  /** Em ordem de prioridade; os essenciais entram primeiro. */
  candidates: KitCandidate[];
  /** Montagem própria em outra página (festas). */
  href?: string;
};

export type KitBudget = { id: string; label: string; min: number; max: number | null };

// ------------------------------------------------------------------------------------------- dados

/** Produtos que o assistente sugere (catálogo real). */
export const KIT_PRODUCTS: readonly KitProductDef[] = [
  // Vestir
  {
    id: "camiseta",
    ref: { groupId: 452 },
    tiers: [
      { from: 1, groupId: 452 },
      { from: 11, groupId: 453 },
      { from: 101, groupId: 454 },
    ],
    title: "Camiseta dryfit",
    hint: "Leve, não amassa e é estampada inteira em sublimação",
    perKit: 1,
    choice: "Acabamento",
    askSizes: true,
  },
  {
    id: "camiseta-algodao",
    ref: { groupId: 5 },
    title: "Camiseta de algodão",
    hint: "Malha de algodão com a estampa na frente",
    perKit: 1,
    preset: { "Cor da Camisa": "Branca", "Formato DTF": "21x28cm", "Tamanho da Camisa": "Tam: M" },
    choice: "Cor da Camisa",
    askSizes: true,
  },
  { id: "bone", ref: { groupId: 14 }, title: "Boné", hint: "Estampa de 12 × 6 cm na frente", perKit: 1, preset: { Modelo: "Telado", "Cor do Boné": "Preto" }, choice: "Cor do Boné" },
  // Beber
  { id: "caneca", ref: { groupId: 63 }, title: "Caneca de porcelana", hint: "375 ml, com a arte em volta", perKit: 1 },
  { id: "caneca-magica", ref: { groupId: 367 }, title: "Caneca mágica", hint: "A arte aparece quando a bebida está quente", perKit: 1 },
  { id: "copo-termico", ref: { groupId: 186 }, title: "Copo térmico", hint: "Inox 500 ml com gravação a laser", perKit: 1, preset: { Cor: "Preto" }, choice: "Cor" },
  { id: "garrafa-aluminio", ref: { groupId: 397 }, title: "Garrafa de alumínio", hint: "500 ml, com mosquetão", perKit: 1, preset: { "Cor da Garrafa": "Branca" }, choice: "Cor da Garrafa" },
  { id: "garrafa-termica", ref: { groupId: 396 }, title: "Garrafa térmica", hint: "Inox 500 ml, mantém a bebida gelada ou quente", perKit: 1, preset: { Cor: "Preta" }, choice: "Cor" },
  // Escrever
  {
    id: "caderno",
    ref: { groupId: 197 },
    title: "Caderno",
    hint: "20 × 28 cm, capa dura com a sua arte",
    perKit: 1,
    preset: { Acabamento: "Capa Dura Paraná com Wire-o Lateral", "Número de Páginas": "1 Matéria (96 Páginas)" },
    choice: "Número de Páginas",
  },
  {
    id: "bloco",
    ref: { groupId: 236 },
    title: "Bloco de anotações",
    hint: "100 folhas pautadas com a capa personalizada",
    perKit: 1,
    preset: { Formato: "15x21cm", Acabamento: "Capa Soft C2S 250g com Wire-o no Topo" },
    choice: "Formato",
  },
  { id: "agenda", ref: { groupId: 230 }, title: "Agenda 2026", hint: "15 × 21 cm, capa dura, 252 páginas", perKit: 1, preset: { Acabamento: "Capa Dura com Wire-o Lateral" } },
  { id: "caneta", ref: { groupId: 229 }, title: "Caneta com logo", hint: "Impressão U.V. no corpo da caneta", perKit: 1, preset: { Modelo: "Sem Emborrachamento", Cor: "Preta" }, choice: "Cor" },
  // Levar
  { id: "ecobag", ref: { groupId: 48 }, title: "Ecobag", hint: "Tecido com a estampa inteira", perKit: 1, preset: { "Mídia": "Oxford" }, choice: "Formato" },
  { id: "sacola-mochila", ref: { groupId: 50 }, title: "Sacola mochila", hint: "Com cordão, para levar o kit", perKit: 1, preset: { Formato: "30x40 cm" }, choice: "Formato" },
  { id: "mochila", ref: { groupId: 54 }, title: "Mochila", hint: "Microfibra 43 × 30 cm", perKit: 1, preset: { Modelo: "Adulto", Tamanho: "43x30cm", "Cor Base": "Preta" }, choice: "Cor Base" },
  // Antiga Sacola Presente em Tecido (71): desde 23/10/2026 é a variação 40x40 da Sacola Mochila (50).
  { id: "sacola-presente", ref: { groupId: 50 }, title: "Sacola de presente", hint: "Tecido oxford para entregar o kit", perKit: 1, preset: { Formato: "40x40 cm" }, choice: "Formato" },
  { id: "sacola-papel", ref: { groupId: 222 }, title: "Sacola de papel", hint: "15 × 22 cm com alça de corda", perKit: 1 },
  // Identificar
  { id: "cracha", ref: { groupId: 243 }, title: "Crachá com nome", hint: "PVC 8,5 × 5,4 cm, um com o nome de cada pessoa", perKit: 1, preset: { Cor: "4/0 (colorido só frente)" }, choice: "Cor" },
  { id: "cordao", ref: { groupId: 240 }, title: "Cordão para crachá", hint: "Fita de 2 cm com a sua estampa", perKit: 1, pack: 10, preset: { Acabamento: "com Jacaré e Argola" } },
  {
    id: "cartao-visita",
    ref: { groupId: 248 },
    title: "Cartões de visita",
    hint: "Cada pessoa recebe o pacote com o próprio nome",
    perKit: 1,
    perPerson: true,
    preset: { Papel: "Couchê 250g", Formato: "9x5 cm", Cor: "4/4 (frente e verso coloridos)", Quantidade: "120 unidades" },
    choice: "Quantidade",
  },
  // Mesa e escritório
  { id: "mouse-pad", ref: { groupId: 67 }, title: "Mouse pad", hint: "22 × 17,5 cm para a mesa", perKit: 1, preset: { "Mídia": "Retangular" } },
  { id: "suporte-celular", ref: { groupId: 187 }, title: "Suporte para celular", hint: "Deixa o celular de pé na mesa", perKit: 1 },
  { id: "calendario-mesa", ref: { groupId: 28 }, title: "Calendário de mesa", hint: "22,8 × 12 cm, a marca na mesa o ano todo", perKit: 1, preset: { "Mídia": "Papel Duplex 250g" } },
  { id: "chaveiro", ref: { groupId: 398 }, title: "Chaveiro de acrílico", hint: "Com a sua arte dos dois lados do acrílico", perKit: 1, preset: { Formato: "5x5cm Quadrado com Pontas Arredondadas" }, choice: "Formato" },
  // Papelaria e divulgação
  { id: "adesivo", ref: { groupId: 528 }, title: "Adesivos redondos", hint: "5 cm, em cartela, para colar onde quiser", perKit: 10, preset: { "Mídia": "Vinil Brilho 130g" } },
  { id: "cartao-agradecimento", ref: { groupId: 347 }, title: "Cartão de agradecimento", hint: "10 × 15 cm para uma mensagem", perKit: 1, preset: { Papel: "Couchê 170g/m²", Cor: "4/4 (colorido frente e verso)" } },
  { id: "tag", ref: { groupId: 180 }, title: "Tags", hint: "Para pendurar no produto ou no presente", perKit: 100 },
  { id: "ima-geladeira", ref: { groupId: 177 }, title: "Ímã de geladeira", hint: "O telefone da casa na geladeira do cliente", perKit: 500 },
  { id: "banner", ref: { groupId: 329 }, title: "Banner 60 × 90 cm", hint: "Para a vitrine ou o balcão", perKit: 1, preset: { "Mídia": "Lona Fosca" } },
  // Loja e restaurante
  { id: "cardapio", ref: { groupId: 112 }, title: "Cardápio", hint: "21 × 29,7 cm, frente e verso", perKit: 25 },
  { id: "jogo-americano", ref: { groupId: 126 }, title: "Jogo americano", hint: "Tecido 30 × 44 cm", perKit: 10, preset: { Modelo: "Modelo Simples" } },
  { id: "avental", ref: { groupId: 97 }, title: "Avental", hint: "Com bolso, tamanho adulto", perKit: 2 },
  { id: "porta-copo", ref: { groupId: 105 }, title: "Porta-copos", hint: "Emborrachado, 9 × 9 cm", perKit: 24, preset: { Modelo: "Redondo" }, choice: "Modelo" },
  { id: "display-mesa", ref: { groupId: 401 }, title: "Display de mesa", hint: "PS 15 × 21 cm para o cardápio ou o QR code", perKit: 6 },
  // Presente
  { id: "almofada", ref: { groupId: 148 }, title: "Almofada", hint: "Com a foto ou a arte que você quiser", perKit: 1, preset: { Formato: "40x40cm" }, choice: "Formato" },
  { id: "quebra-cabeca", ref: { groupId: 69 }, title: "Quebra-cabeça", hint: "28 × 19,5 cm com uma foto", perKit: 1 },
  { id: "quadro", ref: { groupId: 375 }, title: "Quadro em canvas", hint: "Com moldura de madeira", perKit: 1, preset: { Formato: "21x30 cm" }, choice: "Formato" },
  { id: "photobook", ref: { groupId: 74 }, title: "Photobook", hint: "15 × 15 cm com as fotos que você escolher", perKit: 1, preset: { "Número de Páginas": "24" }, choice: "Número de Páginas" },
];

/** Para que é o kit, com os produtos de cada um em ordem de prioridade. */
export const KIT_GOALS: readonly KitGoal[] = [
  {
    id: "boas-vindas",
    label: "Boas-vindas para a equipe",
    name: "Kit boas-vindas",
    short: "Boas-vindas",
    description: "Para receber quem chega: camiseta, caneca, caderno e o que mais combinar com a empresa.",
    icon: "users",
    unit: ["pessoa", "pessoas"],
    defaultKits: 10,
    scale: "pessoa",
    candidates: [
      { item: "camiseta", essential: true },
      { item: "caneca", essential: true },
      { item: "caderno", essential: true },
      { item: "caneta" },
      { item: "garrafa-aluminio" },
      { item: "cracha" },
      { item: "cordao" },
      { item: "ecobag" },
      { item: "mouse-pad" },
      { item: "adesivo", perKit: 6 },
      { item: "cartao-visita" },
      { item: "bone" },
      { item: "agenda" },
      { item: "mochila" },
      { item: "chaveiro" },
    ],
  },
  {
    id: "clientes",
    label: "Presente para clientes",
    name: "Kit de presente para clientes",
    short: "Clientes",
    description: "Brindes úteis, que ficam na mesa e lembram a sua marca o ano todo.",
    icon: "gift",
    unit: ["cliente", "clientes"],
    defaultKits: 25,
    scale: "pessoa",
    candidates: [
      { item: "garrafa-termica", essential: true },
      { item: "bloco", essential: true },
      { item: "caneta", essential: true },
      { item: "sacola-presente" },
      { item: "cartao-agradecimento" },
      { item: "calendario-mesa" },
      { item: "caneca" },
      { item: "copo-termico" },
      { item: "chaveiro" },
      { item: "mouse-pad" },
      { item: "suporte-celular" },
      { item: "ecobag" },
    ],
  },
  {
    id: "evento",
    label: "Evento, feira ou congresso",
    name: "Kit do participante",
    short: "Evento",
    description: "O kit do participante: identificação, sacola, bloco e caneta, e o que mais ele leva para casa.",
    icon: "badge",
    unit: ["participante", "participantes"],
    defaultKits: 50,
    scale: "pessoa",
    candidates: [
      { item: "cracha", essential: true },
      { item: "cordao", essential: true },
      { item: "sacola-mochila", essential: true },
      { item: "bloco", essential: true },
      { item: "caneta", essential: true },
      { item: "cartao-agradecimento", title: "Programação do evento", hint: "10 × 15 cm, frente e verso" },
      { item: "garrafa-aluminio" },
      { item: "camiseta" },
      { item: "bone" },
      { item: "adesivo", perKit: 4 },
      { item: "chaveiro" },
    ],
  },
  {
    id: "marca",
    label: "Lançamento da marca",
    name: "Kit de lançamento da marca",
    short: "Marca",
    description: "O começo com cara de marca: cartões, adesivos, sacolas e tags para os primeiros pedidos.",
    icon: "tag",
    unit: ["kit", "kits"],
    defaultKits: 1,
    scale: "negocio",
    candidates: [
      { item: "cartao-visita", essential: true, hint: "Pacotes para quem atende os clientes" },
      { item: "adesivo", essential: true, perKit: 250, hint: "Para fechar a embalagem e colar no produto" },
      { item: "sacola-papel", essential: true, perKit: 50 },
      { item: "tag", perKit: 100 },
      { item: "banner" },
      { item: "camiseta", perKit: 2, title: "Camiseta do uniforme" },
      { item: "caneca", perKit: 2 },
      { item: "ima-geladeira", perKit: 500 },
    ],
  },
  {
    id: "loja",
    label: "Loja, restaurante ou delivery",
    name: "Kit da loja",
    short: "Loja",
    description: "A marca no balcão, na mesa e na entrega: cardápio, avental, adesivos e sacolas.",
    icon: "store",
    unit: ["loja", "lojas"],
    defaultKits: 1,
    scale: "negocio",
    candidates: [
      { item: "cardapio", essential: true },
      { item: "avental", essential: true },
      { item: "adesivo", essential: true, perKit: 250, title: "Adesivos para lacrar a entrega" },
      { item: "ima-geladeira" },
      { item: "sacola-papel", perKit: 50 },
      { item: "jogo-americano" },
      { item: "porta-copo" },
      { item: "display-mesa" },
      { item: "camiseta", perKit: 4, title: "Camiseta do uniforme" },
      { item: "banner" },
    ],
  },
  {
    id: "presente",
    label: "Presente especial",
    name: "Presente especial",
    short: "Presente",
    description: "Um presente feito sob medida, para alguém especial ou para a família toda.",
    icon: "heart",
    unit: ["presente", "presentes"],
    defaultKits: 1,
    scale: "pessoa",
    candidates: [
      { item: "caneca", essential: true },
      { item: "almofada", essential: true },
      { item: "sacola-presente", essential: true },
      { item: "quebra-cabeca" },
      { item: "quadro" },
      { item: "caneca-magica" },
      { item: "photobook" },
      { item: "chaveiro" },
      { item: "camiseta-algodao" },
      { item: "copo-termico" },
    ],
  },
  {
    id: "festa",
    label: "Festa",
    name: "Festa",
    short: "Festa",
    description: "Convites, painel e lembrancinhas: as festas têm um montador só delas.",
    icon: "balloon",
    unit: ["festa", "festas"],
    defaultKits: 1,
    scale: "pessoa",
    candidates: [],
    href: "/crie-sua-festa",
  },
];

/** Faixas de orçamento por kit: brinde por pessoa ou material de um negócio. */
export const KIT_BUDGETS: Record<KitGoal["scale"], readonly KitBudget[]> = {
  pessoa: [
    { id: "ate-50", label: "Até R$ 50", min: 0, max: 50 },
    { id: "50-100", label: "R$ 50 a R$ 100", min: 50, max: 100 },
    { id: "100-200", label: "R$ 100 a R$ 200", min: 100, max: 200 },
    { id: "mais-200", label: "Acima de R$ 200", min: 200, max: null },
    { id: "livre", label: "Ainda não sei", min: 0, max: null },
  ],
  negocio: [
    { id: "ate-300", label: "Até R$ 300", min: 0, max: 300 },
    { id: "300-600", label: "R$ 300 a R$ 600", min: 300, max: 600 },
    { id: "600-1000", label: "R$ 600 a R$ 1.000", min: 600, max: 1000 },
    { id: "mais-1000", label: "Acima de R$ 1.000", min: 1000, max: null },
    { id: "livre", label: "Ainda não sei", min: 0, max: null },
  ],
};

/** Atalhos da pergunta "quantos kits". */
export const KIT_COUNTS: readonly number[] = [1, 10, 25, 50, 100];

/** Cores da marca (as paletas sóbrias das festas). */
export const KIT_PALETTES: readonly PartyPalette[] = ["grafite-coral", "azul-marinho", "preto-dourado", "verde-areia", "branco-dourado", "colorida", "rosa-dourado", "lilas-menta", "azul-bebe"]
  .map((id) => PARTY_PALETTES.find((palette) => palette.id === id))
  .filter((palette): palette is PartyPalette => Boolean(palette));

export function getKitGoal(id: string | null | undefined): KitGoal | undefined {
  return KIT_GOALS.find((goal) => goal.id === id);
}

export function getKitProductDef(id: string): KitProductDef | undefined {
  return KIT_PRODUCTS.find((def) => def.id === id);
}

export function budgetsFor(goal: KitGoal | undefined): readonly KitBudget[] {
  return KIT_BUDGETS[goal?.scale ?? "pessoa"];
}

export function getBudget(goal: KitGoal | undefined, id: string | null | undefined): KitBudget | undefined {
  return budgetsFor(goal).find((budget) => budget.id === id);
}

// ------------------------------------------------------------------------------------------- itens

/** Item do kit na tela: o produto (e as faixas dele) + o que o kit sugere. */
export type KitItem = {
  /** Única no kit. */
  key: string;
  /** Produto sugerido (KIT_PRODUCTS) ou "busca". */
  id: string;
  title: string;
  hint: string;
  perKit: number;
  perPerson: boolean;
  pack: number;
  size: Size | null;
  preset: Selection;
  choice: string | null;
  askSizes: boolean;
  parts: null;
  product: PartyProduct;
  /** Produto de cada faixa (o do pedido é o da faixa que contém as unidades). */
  tiers: { from: number; product: PartyProduct }[] | null;
  /** Veio da busca no catálogo (não das sugestões do objetivo). */
  searched: boolean;
};

/** Medida sugerida de um produto por m²: 1 × 1 m, dentro dos limites dele. */
export function defaultKitSize(product: Pick<PartyProduct, "customSize">): Size | null {
  if (!product.customSize) return null;
  const limits = sizeLimits(product.customSize);
  const fit = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  return { widthCm: fit(100, limits.minWidthCm, limits.maxWidthCm), heightCm: fit(100, limits.minHeightCm, limits.maxHeightCm) };
}

export function kitItemFromDef(def: KitProductDef, products: readonly Product[]): KitItem | null {
  const base = findProduct(products, def.ref);
  if (!base) return null;
  const tiers = (def.tiers ?? []).flatMap((tier) => {
    const product = findProduct(products, { groupId: tier.groupId });
    return product ? [{ from: tier.from, product: toPartyProduct(product) }] : [];
  });
  const product = toPartyProduct(base);
  return {
    key: def.id,
    id: def.id,
    title: def.title,
    hint: def.hint,
    perKit: def.perKit,
    perPerson: Boolean(def.perPerson),
    pack: def.pack ?? 1,
    size: def.size ?? defaultKitSize(product),
    preset: def.preset ?? {},
    choice: def.choice ?? null,
    askSizes: Boolean(def.askSizes),
    parts: null,
    product,
    tiers: tiers.length > 1 ? tiers.sort((a, b) => a.from - b.from) : null,
    searched: false,
  };
}

/** Os produtos sugeridos em algum objetivo, já com o catálogo (produtos que sumirem ficam de fora). */
export function resolveKitCatalog(products: readonly Product[]): KitItem[] {
  const used = new Set(KIT_GOALS.flatMap((goal) => goal.candidates.map((candidate) => candidate.item)));
  return KIT_PRODUCTS.filter((def) => used.has(def.id)).flatMap((def) => {
    const item = kitItemFromDef(def, products);
    return item ? [item] : [];
  });
}

/** O item com o que o objetivo troca (nome, dica e quantidade por kit). */
export function candidateItem(item: KitItem, candidate: KitCandidate | undefined): KitItem {
  if (!candidate) return item;
  return { ...item, title: candidate.title ?? item.title, hint: candidate.hint ?? item.hint, perKit: candidate.perKit ?? item.perKit };
}

/** Opção que vale trocar num produto da busca: cor, tamanho, formato, capacidade… (nunca a faixa de quantidade). */
export function guessChoice(product: Pick<PartyProduct, "options" | "variations">): string | null {
  for (const key of optionKeys(product.options)) {
    const label = cleanOptionLabel(key).replace(/:$/, "");
    if (/quantidade|kit com/i.test(label)) continue;
    if (!/^(cor|tamanho|formato|capacidade|modelo|m[ií]dia|papel)/i.test(label)) continue;
    const values = choiceValues(product, label, {});
    if (values && values.values.length > 1) return label;
  }
  return null;
}

/** Produto trazido pela busca: uma unidade por kit, na configuração mais em conta. */
export function searchedKitItem(product: PartyProduct, hint: string): KitItem {
  return {
    key: `busca-${product.slug}`,
    id: "busca",
    title: product.name,
    hint,
    perKit: 1,
    perPerson: false,
    pack: 1,
    size: defaultKitSize(product),
    preset: {},
    choice: guessChoice(product),
    askSizes: Boolean(product.sizes?.length),
    parts: null,
    product,
    tiers: null,
    searched: true,
  };
}

// ------------------------------------------------------------------------------------------- preço

/** O que o cliente ajusta em cada item. Medidas como texto: o campo aceita apagar e redigitar. */
export type KitLine = { perKit: number; choice: string | null; width: string; height: string; sizes: string };

export function initialLine(item: Pick<KitItem, "perKit" | "size">): KitLine {
  return { perKit: item.perKit, choice: null, width: item.size ? String(item.size.widthCm) : "", height: item.size ? String(item.size.heightCm) : "", sizes: "" };
}

/** "150", "1,5", " 90 " → cm (0 quando vazio ou inválido). */
export function parseCm(text: string): number {
  const value = Number(text.replace(",", ".").trim());
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Item como o preço e o carrinho esperam: o produto da faixa e a variação escolhida (todas as opções). */
export type PlannedItem = { product: PartyProduct; parts: null; preset: Selection; choice: null };

export type KitPlan = {
  item: PlannedItem;
  priced: PricedItem;
  /** Unidades que os kits pedem e as que vão no pedido (pacote fechado, mínimo do produto). */
  needed: number;
  ordered: number;
  /** Unidades em cada pedido (pacote do catálogo, cordão com 10…). */
  lot: number;
  /** Valor do item dividido pelos kits. */
  perKit: number;
  error: string | null;
  /** Avisos curtos para a tela ("Faixa de 11 a 100 unidades", "1 pacote de 288, sobram 38"). */
  notes: string[];
};

const clampInt = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value) || min));
const round2 = (value: number) => Math.round(value * 100) / 100;
const fmt = (value: number) => value.toLocaleString("pt-BR");

/** Seleção da variação com os rótulos limpos ("02 - Formato" → "Formato"), como o preset espera. */
function labeled(selection: Selection): Selection {
  return Object.fromEntries(Object.entries(selection).map(([key, value]) => [cleanOptionLabel(key).replace(/:$/, ""), value]));
}

/** Produto da faixa (camisa 11–100) que contém as unidades do kit. */
export function tierProduct(item: Pick<KitItem, "product" | "tiers">, units: number): PartyProduct {
  if (!item.tiers?.length) return item.product;
  let chosen = item.tiers[0].product;
  for (const tier of item.tiers) if (units >= tier.from) chosen = tier.product;
  return chosen;
}

/**
 * Variação para a quantidade. Vendido em pacote ("lot"): o pacote que sai mais em conta para as unidades (e, no
 * empate, o que sobra menos), sem passar de MAX_QTY pacotes. Vendido por unidade ("unit"): a faixa que contém as
 * unidades (Caderno "De 11 até 100"); sem nenhuma, a mais próxima; na faixa, a mais em conta.
 */
export function pickVariation(product: Pick<PartyProduct, "options" | "variations" | "minQty" | "maxQty">, preset: Selection, units: number, mode: "lot" | "unit"): Variation | null {
  const pool = compatibleVariations(product, preset);
  if (!pool.length) return null;
  if (mode === "lot") {
    let best: Variation | null = null;
    let bestCost = Infinity;
    let bestWaste = Infinity;
    for (const variation of pool) {
      const q = Math.max(1, variation.q || 1);
      const lots = Math.max(1, Math.ceil(units / q));
      if (lots > MAX_QTY) continue;
      const cost = round2(lots * variation.p);
      const waste = lots * q - units;
      if (cost < bestCost || (cost === bestCost && waste < bestWaste)) {
        best = variation;
        bestCost = cost;
        bestWaste = waste;
      }
    }
    // Nenhum pacote cobre em até 99 pedidos: o maior pacote (o limite aparece no aviso do item).
    return best ?? pool.reduce((a, b) => ((b.q || 1) > (a.q || 1) ? b : a));
  }
  const distance = (variation: Variation) => {
    const limits = unitLimits(product, variation);
    if (units < limits.min) return limits.min - units;
    if (limits.max > 0 && units > limits.max) return units - limits.max;
    return 0;
  };
  const nearest = Math.min(...pool.map(distance));
  return pool.filter((variation) => distance(variation) === nearest).reduce((a, b) => (b.p < a.p ? b : a));
}

/** "Faixa de 11 a 100 unidades", "A partir de 101 unidades"; null sem faixa própria. */
function tierNote(min: number, max: number): string {
  if (max > 0 && max < 999_999) return `Faixa de ${fmt(min)} a ${fmt(max)} unidades`;
  return `Faixa a partir de ${fmt(min)} unidades`;
}

/**
 * Preço do item para os kits: unidades por kit × kits (ou um pacote por kit, nos cartões com o nome de cada
 * pessoa), no produto da faixa, na variação da faixa ou no pacote mais em conta, com o mínimo do produto.
 */
export function planKitItem(item: KitItem, line: KitLine, kits: number): KitPlan {
  const count = clampInt(kits, 1, MAX_KITS);
  const perKit = clampInt(line.perKit, 1, KIT_CEILING);
  const preset = itemPreset(item, line.choice);
  const notes: string[] = [];
  const product = tierProduct(item, perKit * count);
  const pool = compatibleVariations(product, preset);
  const lotSale = !product.customSize && pool.some((variation) => (variation.q || 1) > 1);
  const pack = item.pack > 1 ? item.pack : 1;

  let variation: Variation | null;
  let orders: number;
  let needed: number;
  if (product.customSize) {
    // Peças na medida (m²): uma por unidade.
    needed = perKit * count;
    orders = needed;
    variation = pool.length ? pool.reduce((a, b) => (b.p < a.p ? b : a)) : null;
  } else if (lotSale && item.perPerson) {
    // Um pacote (ou mais) para cada kit, no tamanho de pacote escolhido.
    variation = pool.reduce((a, b) => (b.p < a.p ? b : a));
    orders = perKit * count;
    needed = orders * Math.max(1, variation.q || 1);
  } else if (!pool.length) {
    // Combinação que não existe no catálogo: o preço cai na variação mais em conta (priceItem).
    needed = perKit * count;
    orders = needed;
    variation = null;
  } else if (lotSale) {
    needed = perKit * count;
    variation = pickVariation(product, preset, needed, "lot");
    orders = Math.max(1, Math.ceil(needed / Math.max(1, variation?.q || 1)));
  } else {
    needed = perKit * count;
    orders = Math.ceil(needed / pack);
    variation = pickVariation(product, preset, orders, "unit");
  }

  const planned: PlannedItem = { product, parts: null, preset: variation ? labeled(variation.v) : preset, choice: null };
  const priced = priceItem(planned, { qty: orders, choice: null, widthCm: parseCm(line.width), heightCm: parseCm(line.height) }, KIT_CEILING);
  const setQty = priced.lines[0]?.setQty ?? 1;
  const lot = product.customSize ? 1 : lotSale ? setQty : pack;
  const ordered = priced.qty * lot;

  let error = priced.error;
  if (!error && orders > priced.limits.max) {
    error = lotSale
      ? `Até ${fmt(priced.limits.max)} pacotes por pedido. Diminua a quantidade ou fale com a gente.`
      : `Até ${fmt(priced.limits.max * pack)} unidades por pedido neste produto (o kit pede ${fmt(needed)}). Diminua os kits ou troque o item.`;
  }

  if (!lotSale && !product.customSize) {
    const own = variation && (variation.mn !== undefined || variation.mx !== undefined);
    if (own || item.tiers) {
      const limits = unitLimits(product, variation);
      notes.push(tierNote(limits.min, limits.max));
    }
  }
  if (lotSale && !item.perPerson) notes.push(`${fmt(priced.qty)} ${priced.qty === 1 ? "pacote" : "pacotes"} de ${fmt(setQty)}`);
  if (pack > 1) notes.push(`${fmt(priced.qty)} ${priced.qty === 1 ? "pedido" : "pedidos"} de ${fmt(pack)} unidades`);
  if (!error && ordered > needed) notes.push(priced.qty > orders ? `Pedido mínimo de ${fmt(priced.limits.min * lot)} (sobram ${fmt(ordered - needed)})` : `Sobram ${fmt(ordered - needed)}`);

  return { item: planned, priced, needed, ordered, lot, perKit: round2(priced.total / count), error, notes };
}

/** Teto da medida usada no 3D (a faixa do m² vai até 50 m; o modelo não precisa passar disso). */
const MAX_MODEL_CM = 5000;

/** Peça do mockup 3D do item: a variação do pedido e, nos produtos por m², a medida digitada. */
export function kitItemSpec(plan: Pick<KitPlan, "item" | "priced">): MockupSpec {
  const { slug, name, categorySlug, options } = plan.item.product;
  const spec = mockupSpec({ slug, name, categorySlug, options }, plan.priced.lines[0]?.selection ?? {});
  const size = plan.priced.size;
  if (!size || size.widthCm <= 0 || size.heightCm <= 0) return spec;
  const widthCm = Math.min(size.widthCm, MAX_MODEL_CM);
  const heightCm = Math.min(size.heightCm, MAX_MODEL_CM);
  return { ...spec, widthCm, heightCm, label: formatSize(widthCm, heightCm) };
}

/** Soma dos itens: por kit, total, maior prazo e se algum item tem problema. */
export function kitTotals(plans: readonly KitPlan[], kits: number): { perKit: number; total: number; leadDays: number | null; errors: number } {
  const sum = sumPriced(plans.map((plan) => plan.priced));
  return { perKit: round2(sum.total / clampInt(kits, 1, MAX_KITS)), total: sum.total, leadDays: sum.leadDays, errors: plans.filter((plan) => plan.error).length };
}

/**
 * Pré-seleção do assistente: os essenciais do objetivo e, na ordem de prioridade, os extras que cabem no
 * orçamento por kit. Essenciais acima do orçamento saem do mais caro para o mais barato (ficam pelo menos
 * dois). Sem teto, entram os essenciais e dois extras (ou extras até chegar ao piso da faixa).
 */
export function suggestPicks(goal: KitGoal, perKit: Record<string, number | null>, budget: KitBudget | null | undefined): string[] {
  const usable = goal.candidates.filter((candidate) => typeof perKit[candidate.item] === "number");
  const price = (id: string) => perKit[id] ?? 0;
  let picks = usable.filter((candidate) => candidate.essential).map((candidate) => candidate.item);
  const extras = usable.filter((candidate) => !candidate.essential).map((candidate) => candidate.item);
  const sum = () => picks.reduce((total, id) => total + price(id), 0);
  const max = budget?.max ?? null;
  if (max !== null) {
    while (picks.length > 2 && sum() > max) {
      const priciest = picks.reduce((a, b) => (price(b) > price(a) ? b : a));
      picks = picks.filter((id) => id !== priciest);
    }
    for (const id of extras) if (sum() + price(id) <= max) picks.push(id);
  } else if (budget && budget.min > 0) {
    for (const id of extras) {
      if (sum() >= budget.min) break;
      picks.push(id);
    }
  } else {
    picks.push(...extras.slice(0, 2));
  }
  if (!picks.length && usable[0]) picks.push(usable[0].item);
  return picks;
}

/** Valor por kit em relação ao orçamento escolhido. */
export function budgetStatus(perKit: number, budget: KitBudget | null | undefined): { tone: "ok" | "over" | "under"; diff: number } | null {
  if (!budget || (budget.max === null && budget.min <= 0)) return null;
  if (budget.max !== null && perKit > budget.max + 0.004) return { tone: "over", diff: round2(perKit - budget.max) };
  if (perKit < budget.min - 0.004) return { tone: "under", diff: round2(budget.min - perKit) };
  return { tone: "ok", diff: 0 };
}

// ------------------------------------------------------------------------------------------- marca e carrinho

/** O que o cliente conta sobre a marca (vale para todos os itens). */
export type KitDetails = { brand: string; phrase: string; date: string; palette: string };

export function emptyKitDetails(): KitDetails {
  return { brand: "", phrase: "", date: "", palette: KIT_PALETTES[0]?.id ?? "grafite-coral" };
}

/**
 * De onde vem a arte de um item: a arte do kit (o logo ou o nome da marca, encaixados na área de cada peça), a
 * arte própria que o cliente montou só para ele, ou o arquivo que ele manda depois do pedido.
 */
export type KitArtMode = "kit" | "own" | "later";

/** "25 pessoas", "1 kit". */
export function unitsLabel(count: number, unit: [string, string]): string {
  return `${fmt(count)} ${count === 1 ? unit[0] : unit[1]}`;
}

/**
 * Opções do kit em cada item do carrinho e o grupo do carrinho. A arte (logo, texto, estilo, verso…) vai em cada
 * item, porque cada peça tem a dela.
 */
export function kitCartContext(goal: KitGoal, kits: number, details: KitDetails): { options: Record<string, string>; bundle: { id: string; name: string } } {
  const brand = details.brand.trim();
  const entries: [string, string][] = [
    ["Kit", goal.label],
    ["Kits", unitsLabel(kits, goal.unit)],
    ["Marca", brand],
    ["Entrega desejada", details.date ? formatDate(details.date) : ""],
  ];
  const slug = slugify(brand);
  return {
    options: Object.fromEntries(entries.filter(([, value]) => value)),
    bundle: { id: `kit-${goal.id}${slug ? `-${slug}` : ""}`, name: `${goal.name} · ${unitsLabel(kits, goal.unit)}` },
  };
}

// ------------------------------------------------------------------------------------------- busca

/** Entrada do índice leve da busca (/produtos/indice.json). */
export type SearchEntry = { s: string; n: string; c: string; i: string; p: number; q: number; g?: number; t?: string; m?: 1 };

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Produtos que têm todas as palavras no nome, na categoria ou nas tags (sem acento), com o nome começando pelo
 * termo primeiro e depois os que têm as palavras no nome.
 */
export function searchCatalog(entries: readonly SearchEntry[], term: string, limit = 12): SearchEntry[] {
  const needle = normalizeText(term);
  if (needle.length < 2) return [];
  const words = needle.split(" ");
  const scored: { entry: SearchEntry; score: number; name: string }[] = [];
  for (const entry of entries) {
    const name = normalizeText(entry.n);
    const haystack = `${name} ${normalizeText(entry.c)} ${normalizeText(entry.t ?? "")}`;
    if (!words.every((word) => haystack.includes(word))) continue;
    const score = name.startsWith(needle) ? 0 : words.every((word) => name.includes(word)) ? 1 : 2;
    scored.push({ entry, score, name });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((hit) => hit.entry);
}
