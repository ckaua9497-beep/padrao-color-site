// Registro único dos tipos de mockup 3D. TS puro (sem React) para poder ser
// testado com `node --test`; os componentes 3D ficam em components/mockup.

export const MOCKUP_KINDS = [
  // Papelaria e impressos
  "card",
  "sheet",
  "folded",
  "sticker",
  "book",
  "tent",
  "paperpack",
  "wallcalendar",
  "passport",
  "hangtag",
  "bookmark",
  // Placas, acrílico e objetos rígidos
  "panel",
  "acrylic",
  "keychain",
  "canvas",
  "mat",
  "rug",
  "coaster",
  "board",
  "box",
  "puzzle",
  "ruler",
  "phonestand",
  "wobbler",
  // Comunicação visual
  "neon",
  "banner",
  "lightbox",
  "rollup",
  "totem",
  "flag",
  "hardware",
  "storefront",
  // Bebidas
  "mug",
  "tumbler",
  "bottle",
  // Vestuário e acessórios
  "tshirt",
  "cap",
  "apron",
  "bandana",
  "sock",
  "shorts",
  "swimsuit",
  "flipflop",
  "pen",
  "fan",
  "lanyard",
  "badge",
  "wristband",
  // Bolsas
  "bag",
  "backpack",
  "drawstring",
  "cooler",
  "duffel",
  // Casa, têxteis e conforto
  "cloth",
  "cushion",
  "petbed",
  "sleepmask",
  "neckpillow",
  "lapdesk",
  "towel",
  "curtain",
  "bedding",
  "tablecloth",
  "wallpaper",
  "magnet",
  "cylinder",
] as const;

export type MockupKind = (typeof MOCKUP_KINDS)[number];

export type KindInfo = {
  /** Nome em português, usado na galeria de QA e no design system. */
  label: string;
  /** Largura, altura e profundidade em cm quando o produto não informa a medida. */
  defaultSize: [number, number, number];
  /** A medida mostrada é a área de arte (caneca, camiseta…), não o tamanho da peça. */
  sizeIsArtArea: boolean;
  /** O modelo desenha cotas de medida. */
  dims: boolean;
  scene: "light" | "dark";
  /**
   * Peça vista só de frente (a fachada): sem giro automático e órbita limitada em volta da frente.
   * `range`: giro máximo para cada lado; `minPolar`/`maxPolar`: ângulo da câmera a partir do alto (radianos).
   */
  orbit?: { range: number; minPolar: number; maxPolar: number };
};

const k = (label: string, defaultSize: [number, number, number], dims: boolean, sizeIsArtArea = false, scene: KindInfo["scene"] = "light"): KindInfo => ({
  label,
  defaultSize,
  sizeIsArtArea,
  dims,
  scene,
});

/**
 * Tipos usados só por uma página própria, sem produto do catálogo: a fachada de loja do simulador de
 * fachadas (/fachadas). Ficam de fora da conferência "todo tipo tem produto".
 */
export const PAGE_KINDS: readonly MockupKind[] = ["storefront"];

// Todo tipo recebe arte: produtos vendidos sem impressão (blank) mostram a arte como simulação.
export const KIND_INFO: Record<MockupKind, KindInfo> = {
  card: k("Cartão", [9, 5, 0.04], true),
  sheet: k("Impresso", [15, 21, 0.02], true),
  folded: k("Folder dobrado", [21, 29.7, 0.02], false),
  sticker: k("Adesivo", [10, 10, 0.02], true),
  book: k("Caderno / agenda", [20, 20, 2], false),
  tent: k("Display de mesa", [20, 15, 8], false),
  paperpack: k("Pacote de papel", [21, 29.7, 2], false),
  wallcalendar: k("Calendário de parede", [30, 42, 0.05], true),
  passport: k("Porta-passaporte", [10, 14, 0.5], false),
  hangtag: k("Tag", [5, 9, 0.05], true),
  bookmark: k("Marcador de livro", [5, 18, 0.03], true),

  panel: k("Placa", [40, 30, 0.5], true),
  acrylic: k("Acrílico", [30, 20, 0.3], true),
  keychain: k("Chaveiro", [5, 5, 0.3], true),
  canvas: k("Quadro canvas", [40, 30, 3], true),
  mat: k("Mouse pad / jogo americano", [24, 20, 0.4], true),
  rug: k("Tapete", [60, 40, 0.7], true),
  coaster: k("Porta-copos", [10, 10, 0.4], true),
  board: k("Tábua", [30, 20, 1.5], true),
  box: k("Caixa", [20, 15, 10], false),
  puzzle: k("Quebra-cabeça", [28, 19, 0.2], true),
  ruler: k("Régua", [30, 3.5, 0.2], true),
  phonestand: k("Suporte de celular", [8, 12, 0.3], false),
  wobbler: k("Wobbler", [10, 10, 0.05], false),

  neon: k("LED neon", [60, 30, 0.5], true, false, "dark"),
  banner: k("Banner", [60, 90, 0.05], true),
  lightbox: k("Backlight", [60, 90, 5], true),
  rollup: k("Roll-up", [80, 200, 0.05], true),
  totem: k("Totem de chão", [70, 170, 30], true),
  flag: k("Bandeira / wind banner", [70, 240, 0.05], false),
  hardware: k("Base e haste", [70, 240, 0.05], false),
  // Medida = a placa da fachada (3:1); o prédio cresce em volta dela.
  storefront: { ...k("Fachada de loja", [360, 120, 6], true), orbit: { range: 0.7, minPolar: 1.02, maxPolar: 1.66 } },

  mug: k("Caneca", [20, 8.5, 8], false, true),
  tumbler: k("Copo", [22, 10, 7], false, true),
  bottle: k("Garrafa", [20, 14, 7], false, true),

  tshirt: k("Camiseta", [21, 28, 0], false, true),
  cap: k("Boné", [12, 6, 0], false, true),
  apron: k("Avental", [25, 30, 0], false, true),
  bandana: k("Bandana", [50, 50, 0], false),
  sock: k("Meia", [18, 22, 0], false, true),
  shorts: k("Short", [30, 25, 0], false, true),
  swimsuit: k("Maiô", [25, 35, 0], false, true),
  flipflop: k("Chinelo", [10, 26, 2], false),
  pen: k("Caneta", [5, 0.9, 1], false, true),
  fan: k("Ventarola", [20, 20, 0.05], true),
  lanyard: k("Cordão de crachá", [90, 2, 0.1], false),
  badge: k("Crachá", [5.4, 8.6, 0.08], true),
  wristband: k("Pulseira de identificação", [25, 2.5, 0.02], false),

  bag: k("Bolsa / sacola", [35, 40, 10], false),
  backpack: k("Mochila", [30, 42, 14], false),
  drawstring: k("Sacola mochila", [33, 42, 0.5], false),
  cooler: k("Cooler / lancheira", [26, 20, 18], false),
  duffel: k("Bolsa esportiva", [45, 25, 25], false),

  cloth: k("Têxtil", [50, 70, 0.1], false),
  cushion: k("Almofada", [40, 40, 12], false),
  petbed: k("Cama pet", [65, 55, 15], false),
  sleepmask: k("Máscara de dormir", [20, 9, 1.5], false),
  neckpillow: k("Almofada de pescoço", [30, 28, 10], false),
  lapdesk: k("Almofada para notebook", [45, 33, 8], false),
  towel: k("Toalha", [50, 90, 0.6], false),
  curtain: k("Cortina", [140, 220, 0.1], false),
  bedding: k("Lençol", [140, 200, 0.1], false),
  tablecloth: k("Toalha de mesa", [140, 140, 0.1], false),
  wallpaper: k("Papel de parede", [100, 250, 0.05], true),
  magnet: k("Ímã de geladeira", [7, 10, 0.08], true),
  cylinder: k("Capa de cilindro", [40, 60, 40], false),
};

/** O que artArea/artAspect leem da spec (kind, thermal e variant são opcionais: medidas soltas também servem). */
export type ArtAreaSpec = { widthCm: number; heightCm: number; kind?: MockupKind; thermal?: boolean; variant?: string | null };

/** Garrafa térmica (spec.thermal): a área personalizável cobre 60% da volta, centrada na frente (frente e laterais). */
export const THERMAL_SHARE = 0.6;

/**
 * Parede onde a faixa de arte da garrafa térmica assenta, por subtipo: raio e altura útil em cm.
 * São as medidas dos modelos 3D (models/bottles.tsx): o editor 2D e o 3D usam a mesma proporção.
 */
const THERMAL_WALLS = {
  classic: { radiusCm: 3.5, heightCm: 16.5 },
  cola: { radiusCm: 3.3, heightCm: 13.8 },
  kid: { radiusCm: 3.3, heightCm: 10.9 },
  thermoCup: { radiusCm: 3.6, heightCm: 15.9 },
  sports: { radiusCm: 3.65, heightCm: 14 },
  plastic: { radiusCm: 3.5, heightCm: 9.6 },
} as const;

export function thermalWall(variant: string | null | undefined): { radiusCm: number; heightCm: number } {
  const v = variant ?? "";
  if (v === "cola") return THERMAL_WALLS.cola;
  if (v === "bunny" || v === "dog") return THERMAL_WALLS.kid;
  if (v === "thermo-cup") return THERMAL_WALLS.thermoCup;
  if (v === "kids") return THERMAL_WALLS.plastic;
  if (v.startsWith("sports")) return THERMAL_WALLS.sports;
  return THERMAL_WALLS.classic;
}

/** Chinelo: palmilha na medida da spec, com os limites do modelo 3D (largura 6–14 cm, comprimento 16–32 cm). */
export function flipflopSize(spec: { widthCm: number; heightCm: number }): { widthCm: number; heightCm: number } {
  const small = Math.min(spec.widthCm, spec.heightCm);
  const large = Math.max(spec.widthCm, spec.heightCm);
  return {
    widthCm: Math.min(14, Math.max(6, Number.isFinite(small) ? small : 10)),
    heightCm: Math.min(32, Math.max(16, Number.isFinite(large) ? large : 26)),
  };
}

/**
 * Medida da área de arte em cm: na garrafa térmica, a faixa de 60% da volta (altura da spec limitada à
 * parede); no chinelo, a palmilha; nos demais, a medida da spec (área de arte ou a peça inteira).
 */
export function artArea(spec: ArtAreaSpec): { widthCm: number; heightCm: number } {
  if (spec.thermal) {
    const wall = thermalWall(spec.variant);
    const height = spec.heightCm > 0 ? Math.min(spec.heightCm, wall.heightCm) : wall.heightCm;
    return { widthCm: THERMAL_SHARE * 2 * Math.PI * wall.radiusCm, heightCm: height };
  }
  if (spec.kind === "flipflop") return flipflopSize(spec);
  return { widthCm: spec.widthCm, heightCm: spec.heightCm };
}

/**
 * Proporção (largura ÷ altura) do canvas de arte. A medida da spec já é a área de arte nos
 * tipos com sizeIsArtArea (caneca 20 × 8,5 cm, camiseta no formato DTF…) e a peça inteira nos demais.
 * Garrafa térmica: 60% da circunferência ÷ altura da faixa. Chinelo: a palmilha do modelo.
 */
export function artAspect(spec: ArtAreaSpec): number {
  const area = artArea(spec);
  return area.widthCm / area.heightCm;
}
