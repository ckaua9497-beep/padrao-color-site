// Ambientes do viewer 3D: catálogo de salas, regras de onde cada produto entra e o contrato da foto
// de referência (futura). TS puro, sem React nem three: dá para testar com `node --test`.
//
// Convenção das salas (metros): parede do fundo no plano z = 0 olhando para +z, chão em y = 0, x = 0
// no meio da parede. A câmera fica do lado aberto (+z). O viewer escala a sala inteira para a escala
// do modelo (unidades por cm × 100), então a peça mantém a luz e a animação do estúdio.

import type { MockupSpec } from "@/lib/mockup";
import type { RoomSurface } from "../viewer-hooks";
import { KIND_INFO } from "../../../lib/mockup-kinds.ts";

export type RoomId = "living" | "bedroom" | "office" | "store" | "kitchen" | "bathroom";

/** Onde a peça entra na sala. */
export type Spot =
  /** Quadro, neon, backlight, banner: na parede principal, acima do móvel e na altura do olhar. */
  | "wall"
  /** Papel de parede: cobre exatamente largura × altura da parede principal, a partir do chão. */
  | "paper"
  /** Cortina: no varão sobre a janela da parede principal. */
  | "window"
  /** Toalha: no porta-toalha da parede, na altura de uso. */
  | "towel"
  /** Quadro e display de mesa: em cima do móvel (aparador, escrivaninha, balcão, criado-mudo). */
  | "top"
  /** Almofada: no assento do sofá, encostada no encosto. */
  | "seat"
  /** Almofada: na cama, encostada nos travesseiros (a de corpo fica deitada). */
  | "bed"
  /** Tapete e cama pet: no chão, à frente do móvel principal. */
  | "floor"
  /** Roll-up: em pé no chão, ao lado do balcão. */
  | "stand"
  /** Lençol (traz a própria cama) e toalha de mesa (traz a mesa): no lugar do móvel. */
  | "bedframe"
  | "table";

export type Placement = {
  spot: Spot;
  /** O que o modelo recebe no SceneContext (pose sem o 3/4 do estúdio). */
  surface: RoomSurface;
  /** Giro extra da peça na sala (rad), depois de desfeito o 3/4 do estúdio. */
  yaw: number;
  /**
   * Referência da peça: `origin` = origem do modelo (arte centrada: quadro, neon, toalha no varão);
   * `box` = caixa medida (cortina, tapete, papel de parede).
   */
  pivot: "origin" | "box";
  /** Almofada de corpo: deitada no assento ou na cama. */
  lying?: boolean;
  /** Desvio lateral (m) a partir da âncora (cama pet ao lado, não no meio do tapete). */
  shift?: number;
};

/**
 * Foto de referência de um ambiente. As fotos ainda não foram escolhidas: hoje toda sala é
 * procedural (paredes, piso e móveis em escala real). Quando houver foto, o preset ganha `photo` e o
 * viewer pode trocar a sala procedural pela imagem:
 *
 * 1. A foto vira o fundo do palco (como o ciclorama do estúdio) e a câmera fica travada no ponto de
 *    vista da foto (sem órbita; só zoom leve).
 * 2. `wall.quad` marca na foto, em pixels, os quatro cantos de um retângulo da parede principal de
 *    medida real conhecida `wall.sizeM` (largura × altura em metros), em sentido horário a partir do
 *    canto superior esquerdo. Com `fovDeg` (campo de visão vertical da foto), os quatro pontos dão a
 *    pose da câmera por homografia/PnP: a parede vira o plano z = 0 da sala, em metros, a mesma
 *    convenção das salas procedurais. `wall.origin` é o ponto do retângulo que vira x = 0, y = 0.
 * 3. Cada ponto de `spots` diz onde a peça entra (em metros, no plano da parede ou do chão), igual
 *    às âncoras procedurais; a peça entra na escala real da spec (widthCm × heightCm) e ganha a
 *    sombra macia na parede. `occluders` recorta móveis da foto que ficam na frente da peça.
 * 4. Peças de chão usam `floorY` (linha do rodapé na foto, em px) para conferir a calibragem.
 *
 * Enquanto `photo` estiver ausente, nada muda: a sala procedural continua sendo usada.
 */
export type PhotoBackdrop = {
  /** Caminho da imagem em /public (ex.: "/ambientes/sala-01.jpg"). */
  src: string;
  /** Largura e altura da foto em px. */
  size: [number, number];
  /** Campo de visão vertical da câmera da foto, em graus. */
  fovDeg: number;
  wall: {
    quad: [[number, number], [number, number], [number, number], [number, number]];
    sizeM: [number, number];
    /** Canto inferior esquerdo do retângulo, em metros da sala (x, y). */
    origin: [number, number];
  };
  /** Pontos de entrada por tipo de lugar, em metros da sala. */
  spots: Partial<Record<Spot, { x: number; y: number; z?: number }>>;
  /** Polígonos (px) de móveis que ficam na frente da peça (sofá na frente do quadro). */
  occluders?: [number, number][][];
  floorY?: number;
};

export type FloorStyle = "oak" | "ash" | "walnut" | "concrete" | "tile";

export type EnvironmentPreset = {
  id: RoomId;
  /** Nome no seletor e no rótulo do snapshot. */
  label: string;
  /** Medidas mínimas (m): largura da parede do fundo e pé-direito. A sala cresce com a peça. */
  size: { width: number; height: number };
  palette: {
    wall: string;
    /** Parede da cena noturna (neon). */
    nightWall: string;
    trim: string;
    floor: FloorStyle;
    /** Estofado principal (sofá, cabeceira, banco). */
    fabric: string;
    /** Madeira dos móveis. */
    wood: string;
    /** Cor de destaque (manta, vaso, livro). */
    accent: string;
  };
  photo?: PhotoBackdrop;
};

export const PRESETS: Record<RoomId, EnvironmentPreset> = {
  living: {
    id: "living",
    label: "Sala de estar",
    size: { width: 5.4, height: 2.7 },
    palette: { wall: "#e8e2d8", nightWall: "#24252b", trim: "#f5f2ec", floor: "oak", fabric: "#c8bfb2", wood: "#a87c55", accent: "#8f9d86" },
  },
  bedroom: {
    id: "bedroom",
    label: "Quarto",
    size: { width: 4.8, height: 2.7 },
    palette: { wall: "#dde1d8", nightWall: "#20232b", trim: "#f5f3ee", floor: "ash", fabric: "#d6cdc0", wood: "#b48a62", accent: "#c79a7e" },
  },
  office: {
    id: "office",
    label: "Escritório",
    size: { width: 4.6, height: 2.7 },
    palette: { wall: "#e3e1dc", nightWall: "#1f2127", trim: "#f4f3f0", floor: "walnut", fabric: "#3e4248", wood: "#c49a6c", accent: "#5f7f95" },
  },
  store: {
    id: "store",
    label: "Recepção / loja",
    size: { width: 5.8, height: 3 },
    palette: { wall: "#ebe8e3", nightWall: "#1c1d22", trim: "#f2f0ec", floor: "concrete", fabric: "#b9a48d", wood: "#b88a5c", accent: "#d9714e" },
  },
  kitchen: {
    id: "kitchen",
    label: "Cozinha",
    size: { width: 5, height: 2.7 },
    palette: { wall: "#eeeae3", nightWall: "#22242a", trim: "#f6f4ef", floor: "tile", fabric: "#d8cfc2", wood: "#b08560", accent: "#6f8a6b" },
  },
  bathroom: {
    id: "bathroom",
    label: "Banheiro",
    size: { width: 3.4, height: 2.6 },
    palette: { wall: "#ece8e1", nightWall: "#202329", trim: "#f6f4f0", floor: "tile", fabric: "#d9d2c6", wood: "#a9805a", accent: "#7d9a8c" },
  },
};

const WALL_ROOMS: RoomId[] = ["living", "bedroom", "office", "store"];

/** Salas em que o tipo faz sentido, na ordem do seletor (a primeira é a padrão). Vazio = só estúdio. */
export function roomsFor(spec: Pick<MockupSpec, "kind" | "variant">): RoomId[] {
  const { kind, variant } = spec;
  switch (kind) {
    case "canvas":
      return WALL_ROOMS;
    case "acrylic":
      if (variant === "desk") return ["office", "living", "store"];
      if (variant === "calendar") return ["office", "store"];
      return WALL_ROOMS;
    case "panel":
      if (variant === "door-sign" || variant === "pet-tag") return [];
      if (variant === "desk") return ["office", "living", "bedroom"];
      return WALL_ROOMS;
    case "neon":
      return ["living", "bedroom", "store", "office"];
    case "wallpaper":
      return ["living", "bedroom", "office", "store", "kitchen"];
    case "cushion":
      return variant === "body" ? ["bedroom", "living"] : ["living", "bedroom"];
    case "petbed":
      return ["living", "bedroom"];
    case "rug":
      return variant === "doormat" ? ["store"] : ["living", "bedroom"];
    case "curtain":
      return ["living"];
    case "towel":
      return variant === "beach" || variant === "canga" ? [] : ["bathroom"];
    case "bedding":
      return ["bedroom"];
    case "tablecloth":
      return variant === "picnic" ? [] : ["kitchen"];
    case "banner":
      return variant === "mini" ? [] : ["store"];
    case "lightbox":
      return ["store"];
    case "rollup":
      return ["store"];
    default:
      return [];
  }
}

/** Onde a peça entra nesta sala. */
export function placementFor(spec: Pick<MockupSpec, "kind" | "variant">, room: RoomId): Placement {
  const { kind, variant } = spec;
  const wall: Placement = { spot: "wall", surface: "wall", yaw: 0, pivot: "origin" };
  switch (kind) {
    case "acrylic":
      return variant === "desk" || variant === "calendar" ? { spot: "top", surface: "top", yaw: 0.3, pivot: "box" } : wall;
    case "panel":
      return variant === "desk" ? { spot: "top", surface: "top", yaw: 0.3, pivot: "box" } : wall;
    case "wallpaper":
      return { spot: "paper", surface: "wall", yaw: 0, pivot: "box" };
    case "cushion": {
      const lying = variant === "body";
      return room === "bedroom" ? { spot: "bed", surface: "bed", yaw: 0, pivot: "box", lying } : { spot: "seat", surface: "seat", yaw: 0, pivot: "box", lying };
    }
    case "petbed":
      return { spot: "floor", surface: "floor", yaw: 0.35, pivot: "box", shift: 0.62 };
    case "rug":
      return { spot: "floor", surface: "floor", yaw: 0, pivot: "box" };
    case "curtain":
      return { spot: "window", surface: "wall", yaw: 0, pivot: "box" };
    case "towel":
      return { spot: "towel", surface: "wall", yaw: 0, pivot: "origin" };
    case "bedding":
      // A cama do lençol tem a cabeceira em -x: girar -90° encosta a cabeceira na parede.
      return { spot: "bedframe", surface: "floor", yaw: -Math.PI / 2, pivot: "box" };
    case "tablecloth":
      return { spot: "table", surface: "floor", yaw: 0, pivot: "box" };
    case "rollup":
      return { spot: "stand", surface: "floor", yaw: 0.3, pivot: "box" };
    default:
      return wall;
  }
}

export type RoomView = {
  /** Giro (rad) e altura (rad) da vista inicial em volta do centro do enquadramento. */
  azimuth: number;
  elevation: number;
  /** Quanto o cliente pode girar para cada lado (rad). */
  range: number;
  minPolar: number;
  maxPolar: number;
};

const VIEWS: Record<Spot, { azimuth: number; elevation: number }> = {
  wall: { azimuth: 0.24, elevation: 0.05 },
  paper: { azimuth: 0.2, elevation: 0.04 },
  window: { azimuth: 0.2, elevation: 0.05 },
  towel: { azimuth: 0.22, elevation: 0.08 },
  top: { azimuth: 0.3, elevation: 0.2 },
  seat: { azimuth: 0.26, elevation: 0.17 },
  bed: { azimuth: 0.3, elevation: 0.34 },
  floor: { azimuth: 0.24, elevation: 0.62 },
  stand: { azimuth: 0.3, elevation: 0.06 },
  bedframe: { azimuth: 0.5, elevation: 0.42 },
  table: { azimuth: 0.32, elevation: 0.42 },
};

function viewFor(placement: Placement): RoomView {
  const base = VIEWS[placement.spot];
  const elevation = placement.lying ? 0.52 : base.elevation;
  const home = Math.PI / 2 - elevation;
  return {
    azimuth: base.azimuth,
    elevation,
    range: 0.5,
    minPolar: Math.max(0.3, home - 0.5),
    maxPolar: Math.min(Math.PI / 2 + 0.1, home + 0.3),
  };
}

/** O que a peça substitui ou ocupa na sala. */
export type RoomHide = {
  /** O lençol traz a própria cama. */
  bed: boolean;
  /** A toalha de mesa traz a própria mesa. */
  table: boolean;
  /** Tapete decorativo (some quando o produto é tapete). */
  rug: boolean;
  /** Quadro decorativo da parede (some quando a parede é do produto). */
  wallArt: boolean;
  /** Painel de ripas e prateleiras da parede principal (papel de parede cobre a parede). */
  wallDecor: boolean;
  /** Almofadas decorativas do sofá/cama (uma some quando o produto é almofada). */
  cushions: boolean;
};

export type RoomEnvironment = {
  /** Muda quando a sala, a regra ou o tamanho da sala mudam (refaz o enquadramento). */
  key: string;
  preset: EnvironmentPreset;
  placement: Placement;
  /** Cena escura (neon): parede escura e luz de abajur. */
  night: boolean;
  /** Largura da parede do fundo e pé-direito (m), já com espaço para a peça. */
  width: number;
  height: number;
  /** Medida real da peça (m), da spec. */
  product: { w: number; h: number };
  hide: RoomHide;
  view: RoomView;
};

function metres(cm: number, fallback: number) {
  return Number.isFinite(cm) && cm > 0 ? cm / 100 : fallback;
}

/** Ambiente pronto para o viewer: sala, regra da peça, medidas ajustadas e vista. */
export function environmentFor(spec: Pick<MockupSpec, "kind" | "variant" | "widthCm" | "heightCm">, room: RoomId): RoomEnvironment {
  const preset = PRESETS[room];
  const placement = placementFor(spec, room);
  const w = metres(spec.widthCm, 0.4);
  const h = metres(spec.heightCm, 0.4);
  let width = preset.size.width;
  let height = preset.size.height;
  if (placement.spot === "paper") {
    // O papel cobre W × H a partir do chão; o resto da parede continua pintado.
    width = Math.max(width, w + 1.4);
    height = Math.max(height, h);
  } else if (placement.spot === "wall" || placement.spot === "window") {
    width = Math.max(width, w + 1.8);
    height = Math.max(height, h + (placement.spot === "window" ? 0.3 : 1.15));
  }
  width = Math.round(width * 100) / 100;
  height = Math.round(height * 100) / 100;
  const onWall = placement.spot === "wall" || placement.spot === "paper" || placement.spot === "window";
  const hide: RoomHide = {
    bed: placement.spot === "bedframe",
    table: placement.spot === "table",
    rug: spec.kind === "rug" || placement.spot === "bedframe",
    wallArt: onWall || placement.spot === "stand",
    wallDecor: placement.spot === "paper",
    cushions: placement.spot === "seat" || placement.spot === "bed",
  };
  const night = KIND_INFO[spec.kind]?.scene === "dark";
  return {
    key: `${room}|${placement.spot}|${placement.lying ? 1 : 0}|${width}|${height}|${night ? 1 : 0}`,
    preset,
    placement,
    night,
    width,
    height,
    product: { w, h },
    hide,
    view: viewFor(placement),
  };
}

/** Fundo CSS/snapshot da cena de ambiente: a cor da parede (aparece só nas bordas e durante a troca). */
export function roomBackdropColor(env: RoomEnvironment): string {
  return env.night ? env.preset.palette.nightWall : env.preset.palette.wall;
}
