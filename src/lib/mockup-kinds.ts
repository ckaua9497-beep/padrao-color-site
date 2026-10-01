// Registro único dos tipos de mockup 3D. TS puro (sem React) para poder ser
// testado com `node --test`; os componentes 3D ficam em components/mockup.

export const MOCKUP_KINDS = [
  "card",
  "sheet",
  "folded",
  "sticker",
  "panel",
  "acrylic",
  "keychain",
  "neon",
  "canvas",
  "mat",
  "rug",
  "coaster",
  "board",
  "banner",
  "lightbox",
  "rollup",
  "flag",
  "hardware",
  "cloth",
  "mug",
  "tumbler",
  "bottle",
  "tshirt",
  "cap",
  "apron",
  "bandana",
  "cushion",
  "petbed",
  "book",
  "tent",
  "bag",
  "box",
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
  /** O tipo recebe arte. */
  printable: boolean;
  scene: "light" | "dark";
};

export const KIND_INFO: Record<MockupKind, KindInfo> = {
  card: { label: "Cartão", defaultSize: [9, 5, 0.04], sizeIsArtArea: false, dims: true, printable: true, scene: "light" },
  sheet: { label: "Impresso", defaultSize: [15, 21, 0.02], sizeIsArtArea: false, dims: true, printable: true, scene: "light" },
  folded: { label: "Folder dobrado", defaultSize: [21, 29.7, 0.02], sizeIsArtArea: false, dims: false, printable: true, scene: "light" },
  sticker: { label: "Adesivo", defaultSize: [10, 10, 0.02], sizeIsArtArea: false, dims: true, printable: true, scene: "light" },
  panel: { label: "Placa", defaultSize: [40, 30, 0.5], sizeIsArtArea: false, dims: true, printable: true, scene: "light" },
  acrylic: { label: "Acrílico", defaultSize: [30, 20, 0.3], sizeIsArtArea: false, dims: true, printable: true, scene: "light" },
  keychain: { label: "Chaveiro", defaultSize: [5, 5, 0.3], sizeIsArtArea: false, dims: true, printable: true, scene: "light" },
  neon: { label: "LED neon", defaultSize: [60, 30, 0.5], sizeIsArtArea: false, dims: true, printable: true, scene: "dark" },
  canvas: { label: "Quadro canvas", defaultSize: [40, 30, 3], sizeIsArtArea: false, dims: true, printable: true, scene: "light" },
  mat: { label: "Mouse pad / jogo americano", defaultSize: [24, 20, 0.4], sizeIsArtArea: false, dims: true, printable: true, scene: "light" },
  rug: { label: "Tapete", defaultSize: [60, 40, 0.7], sizeIsArtArea: false, dims: true, printable: true, scene: "light" },
  coaster: { label: "Porta-copos", defaultSize: [10, 10, 0.4], sizeIsArtArea: false, dims: true, printable: true, scene: "light" },
  board: { label: "Tábua", defaultSize: [30, 20, 1.5], sizeIsArtArea: false, dims: true, printable: true, scene: "light" },
  banner: { label: "Banner", defaultSize: [60, 90, 0.05], sizeIsArtArea: false, dims: true, printable: true, scene: "light" },
  lightbox: { label: "Backlight", defaultSize: [60, 90, 5], sizeIsArtArea: false, dims: true, printable: true, scene: "light" },
  rollup: { label: "Roll-up", defaultSize: [80, 200, 0.05], sizeIsArtArea: false, dims: true, printable: true, scene: "light" },
  flag: { label: "Bandeira / wind banner", defaultSize: [70, 240, 0.05], sizeIsArtArea: false, dims: false, printable: true, scene: "light" },
  hardware: { label: "Base e haste", defaultSize: [70, 240, 0.05], sizeIsArtArea: false, dims: false, printable: false, scene: "light" },
  cloth: { label: "Têxtil", defaultSize: [50, 70, 0.1], sizeIsArtArea: false, dims: false, printable: true, scene: "light" },
  mug: { label: "Caneca", defaultSize: [20, 8.5, 8], sizeIsArtArea: true, dims: false, printable: true, scene: "light" },
  tumbler: { label: "Copo", defaultSize: [22, 10, 7], sizeIsArtArea: true, dims: false, printable: true, scene: "light" },
  bottle: { label: "Garrafa", defaultSize: [20, 14, 7], sizeIsArtArea: true, dims: false, printable: true, scene: "light" },
  tshirt: { label: "Camiseta", defaultSize: [21, 28, 0], sizeIsArtArea: true, dims: false, printable: true, scene: "light" },
  cap: { label: "Boné", defaultSize: [12, 6, 0], sizeIsArtArea: true, dims: false, printable: true, scene: "light" },
  apron: { label: "Avental", defaultSize: [25, 30, 0], sizeIsArtArea: true, dims: false, printable: true, scene: "light" },
  bandana: { label: "Bandana", defaultSize: [50, 50, 0], sizeIsArtArea: false, dims: false, printable: true, scene: "light" },
  cushion: { label: "Almofada", defaultSize: [40, 40, 12], sizeIsArtArea: false, dims: false, printable: true, scene: "light" },
  petbed: { label: "Cama pet", defaultSize: [65, 55, 15], sizeIsArtArea: false, dims: false, printable: true, scene: "light" },
  book: { label: "Caderno / agenda", defaultSize: [20, 20, 2], sizeIsArtArea: false, dims: false, printable: true, scene: "light" },
  tent: { label: "Display de mesa", defaultSize: [20, 15, 8], sizeIsArtArea: false, dims: false, printable: true, scene: "light" },
  bag: { label: "Bolsa / sacola", defaultSize: [35, 40, 10], sizeIsArtArea: false, dims: false, printable: true, scene: "light" },
  box: { label: "Caixa", defaultSize: [20, 15, 10], sizeIsArtArea: false, dims: false, printable: true, scene: "light" },
};

/**
 * Proporção (largura ÷ altura) do canvas de arte. A medida da spec já é a área de arte nos
 * tipos com sizeIsArtArea (caneca 20 × 8,5 cm, camiseta no formato DTF…) e a peça inteira nos demais.
 */
export function artAspect(spec: { widthCm: number; heightCm: number }): number {
  return spec.widthCm / spec.heightCm;
}
