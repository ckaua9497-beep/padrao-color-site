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
  "flag",
  "hardware",
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
};

const k = (label: string, defaultSize: [number, number, number], dims: boolean, sizeIsArtArea = false, scene: KindInfo["scene"] = "light"): KindInfo => ({
  label,
  defaultSize,
  sizeIsArtArea,
  dims,
  scene,
});

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
  flag: k("Bandeira / wind banner", [70, 240, 0.05], false),
  hardware: k("Base e haste", [70, 240, 0.05], false),

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

/**
 * Proporção (largura ÷ altura) do canvas de arte. A medida da spec já é a área de arte nos
 * tipos com sizeIsArtArea (caneca 20 × 8,5 cm, camiseta no formato DTF…) e a peça inteira nos demais.
 */
export function artAspect(spec: { widthCm: number; heightCm: number }): number {
  return spec.widthCm / spec.heightCm;
}
