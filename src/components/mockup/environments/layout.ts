// Planta de cada sala em metros: onde ficam os móveis e as âncoras em que a peça entra. TS puro: o
// mesmo cálculo serve para desenhar a sala (Room.tsx) e para posicionar a peça (placement.ts).

import type { RoomEnvironment, RoomId, Spot } from "./presets";

/** Nomes dos objetos da sala que o posicionamento ajusta depois de medir a peça. */
export const ROOM_DROP = "room-drop";
export const ROOM_CONTACT = "room-contact";
export const ROOM_SHELF = "room-shelf";

/** Comprimento das paredes laterais, do chão e do teto para a frente: a câmera nunca chega ao fim. */
const ROOM_DEPTH = 12;

export type Vec3 = [number, number, number];
/** Caixa em metros da sala (para o enquadramento). */
export type BoxM = { min: Vec3; max: Vec3 };

/**
 * Ponto de entrada da peça. `y` é a altura da superfície (assento, tampo, cama, chão) ou, na parede,
 * o limite de baixo da peça (acima do móvel); `z` é o plano de encosto (parede = 0, encosto do sofá,
 * travesseiros) ou a borda de trás no chão; `eye` é a altura ideal do centro na parede.
 */
export type Anchor = {
  x: number;
  y: number;
  z: number;
  eye?: number;
  /** Altura do topo da janela (cortina) ou do varão (toalha). */
  top?: number;
  /** Profundidade (z) do centro de uma almofada de corpo deitada no assento ou na cama. */
  lie?: number;
  /** Altura onde a almofada de corpo deita (edredom), quando é outra que `y`. */
  lieY?: number;
  /** Móveis que dão a escala no enquadramento (sofá embaixo do quadro). */
  context: BoxM;
};

/** Medidas reais dos móveis (m). `seatTop`: face de cima da almofada do assento. */
export const SOFA = { width: 2.2, depth: 0.95, seat: 0.45, seatTop: 0.465, back: 0.86, arm: 0.62, armWidth: 0.17, legs: 0.09 };
/** Das costas do sofá até a frente das almofadas do encosto, na altura de uma almofada encostada. */
export const SOFA_BACKREST = 0.37;
export const ARMCHAIR = { width: 0.86, depth: 0.86 };
/**
 * `mattress`: topo do colchão (onde as almofadas apoiam, na frente dos travesseiros); `top`: topo do
 * edredom; `pillowFront`: da cabeceira até a frente dos travesseiros, na altura de uma almofada.
 */
export const BED = { width: 1.6, length: 2.05, mattress: 0.55, top: 0.6, headboard: 1.15, headboardDepth: 0.1, pillowFront: 0.25 };
export const NIGHTSTAND = { width: 0.5, depth: 0.4, height: 0.55 };
export const SIDE_TABLE = { radius: 0.24, height: 0.55 };
export const DESK = { width: 1.4, depth: 0.7, height: 0.75 };
export const BOOKCASE = { width: 0.8, depth: 0.32, height: 1.9 };
export const COUNTER = { width: 2, depth: 0.6, height: 1.05 };
export const BENCH = { width: 1.25, depth: 0.42, height: 0.46 };
export const SIDEBOARD = { width: 1.6, depth: 0.45, height: 0.78 };
export const DINING = { width: 1.6, depth: 0.9, height: 0.76 };
export const KITCHEN_RUN = { depth: 0.6, height: 0.9, length: 2.6 };
export const VANITY = { width: 0.9, depth: 0.48, height: 0.85 };

export type WindowSpec = {
  /** Parede da janela: a da esquerda (luz lateral) ou a do fundo (cortina). */
  wall: "left" | "back";
  /** Centro ao longo da parede: z na da esquerda, x na do fundo. */
  center: number;
  width: number;
  bottom: number;
  top: number;
  /** Cortinas leves (voil) nas laterais. */
  sheers: boolean;
};

export type Item = { x: number; z: number; yaw?: number };

export type RoomLayout = {
  room: RoomId;
  width: number;
  height: number;
  /** Comprimento das paredes laterais e do chão para a frente (a câmera nunca chega ao fim). */
  depth: number;
  window: WindowSpec | null;
  /** Quadro decorativo na parede principal (centro e tamanho), quando a parede é livre. */
  wallArt: { x: number; y: number; w: number; h: number } | null;
  /** Tapete decorativo (centro e tamanho no chão). */
  rug: { x: number; z: number; w: number; d: number } | null;
  items: {
    sofa?: Item;
    armchair?: Item;
    sideTable?: Item;
    plant?: Item & { height: number };
    floorLamp?: Item;
    bed?: Item;
    nightstands?: Item[];
    desk?: Item;
    chair?: Item;
    bookcase?: Item;
    counter?: Item;
    bench?: Item;
    slats?: { x0: number; x1: number };
    sideboard?: Item;
    dining?: Item;
    diningChairs?: Item[];
    kitchenRun?: Item;
    pendant?: Item;
    vanity?: Item;
  };
  anchors: Partial<Record<Spot, Anchor>>;
};

function box(min: Vec3, max: Vec3): BoxM {
  return { min, max };
}

/** Caixa do móvel encostado na parede (x central, costas em z0). */
function backed(x: number, z0: number, width: number, depth: number, height: number): BoxM {
  return box([x - width / 2, 0, z0], [x + width / 2, height, z0 + depth]);
}

function wallBox(env: RoomEnvironment): BoxM {
  return box([-env.width / 2 + 0.3, 0, 0], [env.width / 2 - 0.3, env.height, 0.4]);
}

function living(env: RoomEnvironment): RoomLayout {
  const { width, height } = env;
  const curtain = env.placement.spot === "window";
  const sofaX = 0.15;
  const sofaZ = 0.08;
  const sofa = backed(sofaX, sofaZ, SOFA.width, SOFA.depth, SOFA.back);
  const tableX = sofaX + SOFA.width / 2 + 0.38;
  const sideTable: Item = { x: tableX, z: 0.4 };
  const plant = { x: sofaX - SOFA.width / 2 - 0.5, z: 0.45, height: 1.55 };
  const tableBox = box([tableX - 0.3, 0, 0.1], [tableX + 0.3, SIDE_TABLE.height + 0.5, 0.7]);
  if (curtain) {
    // Cortina: a janela vem para a parede do fundo e o sofá sai da frente; poltrona ao lado. A janela
    // acompanha a cortina (um pouco menor), para ela cobrir o vão como na vida real.
    const windowX = -0.35;
    const winTop = 2.15;
    const winW = Math.min(Math.max(env.product.w - 0.3, 0.9), 2.2);
    const winBottom = Math.max(0.3, winTop - Math.max(env.product.h - 0.28, 0.8));
    const win: WindowSpec = { wall: "back", center: windowX, width: winW, bottom: winBottom, top: winTop, sheers: false };
    const chairX = windowX + 1.75;
    return {
      room: "living",
      width,
      height,
      depth: ROOM_DEPTH,
      window: win,
      wallArt: null,
      rug: { x: windowX + 0.4, z: 1.6, w: 2.2, d: 1.5 },
      items: {
        armchair: { x: chairX, z: 0.55, yaw: -0.45 },
        plant: { x: windowX - 1.45, z: 0.45, height: 1.5 },
        floorLamp: { x: chairX + 0.62, z: 0.3 },
      },
      anchors: {
        window: { x: windowX, y: 0, z: 0, top: win.top, context: box([windowX - 1.2, 0, 0], [chairX + 0.5, win.top + 0.2, 1]) },
      },
    };
  }
  return {
    room: "living",
    width,
    height,
    depth: ROOM_DEPTH,
    window: { wall: "left", center: 1.85, width: 1.5, bottom: 0.08, top: 2.3, sheers: true },
    wallArt: env.hide.wallArt ? null : { x: sofaX, y: 1.6, w: 0.95, h: 0.68 },
    rug: env.hide.rug ? null : { x: sofaX, z: sofaZ + SOFA.depth + 0.65, w: 2.4, d: 1.6 },
    items: {
      sofa: { x: sofaX, z: sofaZ },
      sideTable,
      plant,
    },
    anchors: {
      wall: { x: sofaX, y: SOFA.back + 0.22, z: 0, eye: 1.5, context: sofa },
      paper: { x: sofaX, y: 0, z: 0, context: wallBox(env) },
      seat: { x: sofaX - 0.48, y: SOFA.seatTop, z: sofaZ + SOFA_BACKREST, lie: sofaZ + SOFA_BACKREST + 0.3, context: sofa },
      floor: { x: sofaX, y: 0, z: sofaZ + SOFA.depth + 0.14, context: sofa },
      // Na frente do tampo: o abajur fica atrás.
      top: { x: tableX - 0.05, y: SIDE_TABLE.height, z: 0.47, context: tableBox },
    },
  };
}

function bedroom(env: RoomEnvironment): RoomLayout {
  const { width, height } = env;
  const headZ = 0.02;
  const front = headZ + BED.headboardDepth;
  const standX = BED.width / 2 + 0.16 + NIGHTSTAND.width / 2;
  const wide = env.hide.bed ? standX + 0.25 : standX;
  const bed = box([-BED.width / 2 - 0.1, 0, headZ], [BED.width / 2 + 0.1, BED.headboard, front + BED.length]);
  return {
    room: "bedroom",
    width,
    height,
    depth: ROOM_DEPTH,
    window: { wall: "left", center: 1.75, width: 1.3, bottom: 0.85, top: 2.2, sheers: true },
    wallArt: env.hide.wallArt ? null : { x: 0, y: 1.72, w: 1.1, h: 0.5 },
    rug: env.hide.rug ? null : { x: 0, z: front + BED.length * 0.62, w: 2.5, d: 1.8 },
    items: {
      bed: env.hide.bed ? undefined : { x: 0, z: headZ },
      nightstands: [
        { x: -wide, z: 0.04 },
        { x: wide, z: 0.04 },
      ],
      plant: { x: -width / 2 + 0.55, z: 0.5, height: 1.3 },
    },
    anchors: {
      wall: { x: 0, y: BED.headboard + 0.2, z: 0, eye: 1.6, context: box([-BED.width / 2, BED.top, headZ], [BED.width / 2, BED.headboard, front + 0.9]) },
      paper: { x: 0, y: 0, z: 0, context: wallBox(env) },
      bed: { x: 0, y: BED.mattress, z: headZ + BED.pillowFront, lie: front + 0.95, lieY: BED.top, context: bed },
      floor: { x: 0, y: 0, z: front + BED.length + 0.16, context: bed },
      top: { x: -wide, y: NIGHTSTAND.height, z: 0.22, context: box([-wide - 0.4, 0, 0], [-wide + 0.6, 1.2, 0.6]) },
      bedframe: { x: 0, y: 0, z: headZ, context: box([-wide - 0.3, 0, 0], [wide + 0.3, 1.2, 1.2]) },
    },
  };
}

function office(env: RoomEnvironment): RoomLayout {
  const { width, height } = env;
  const deskX = 0.1;
  const deskZ = 0.03;
  const desk = backed(deskX, deskZ, DESK.width, DESK.depth, DESK.height + 0.45);
  return {
    room: "office",
    width,
    height,
    depth: ROOM_DEPTH,
    window: { wall: "left", center: 1.6, width: 1.4, bottom: 0.9, top: 2.2, sheers: true },
    wallArt: env.hide.wallArt ? null : { x: deskX, y: 1.62, w: 0.8, h: 0.6 },
    rug: null,
    items: {
      desk: { x: deskX, z: deskZ },
      // Com quadro de mesa, a cadeira fica afastada para o lado (não tapa a peça).
      chair: env.placement.spot === "top" ? { x: deskX + 0.72, z: deskZ + DESK.depth + 0.42, yaw: 0.95 } : { x: deskX + 0.12, z: deskZ + DESK.depth + 0.38, yaw: 0.35 },
      bookcase: { x: Math.min(width / 2 - BOOKCASE.width / 2 - 0.25, 1.65), z: 0.02 },
      plant: { x: deskX - DESK.width / 2 - 0.45, z: 0.4, height: 1.35 },
    },
    anchors: {
      wall: { x: deskX, y: DESK.height + 0.45, z: 0, eye: 1.55, context: desk },
      paper: { x: deskX, y: 0, z: 0, context: wallBox(env) },
      top: { x: deskX - 0.12, y: DESK.height, z: deskZ + 0.26, context: desk },
    },
  };
}

function store(env: RoomEnvironment): RoomLayout {
  const { width, height } = env;
  const counterZ = 0.75;
  const counter = backed(0, counterZ, COUNTER.width, COUNTER.depth, COUNTER.height);
  // Painel de ripas à direita, sem ficar atrás de uma peça larga (faixa de 3 m).
  const onWall = env.placement.spot === "wall";
  const slatsX0 = Math.max(Math.min(1.2, width / 2 - 1.6), onWall ? env.product.w / 2 + 0.3 : 0);
  const slatsX1 = width / 2 - 0.25;
  const slats = env.hide.wallDecor || slatsX1 - slatsX0 < 0.6 ? undefined : { x0: slatsX0, x1: slatsX1 };
  return {
    room: "store",
    width,
    height,
    depth: ROOM_DEPTH,
    window: { wall: "left", center: 2.3, width: 2.8, bottom: 0.04, top: 2.6, sheers: false },
    wallArt: null,
    rug: null,
    items: {
      counter: { x: 0, z: counterZ },
      bench: { x: -width / 2 + 0.95, z: 0.05 },
      plant: { x: width / 2 - 0.55, z: 0.5, height: 1.7 },
      slats,
    },
    anchors: {
      wall: { x: 0, y: COUNTER.height + 0.3, z: 0, eye: 1.7, context: counter },
      paper: { x: 0, y: 0, z: 0, context: wallBox(env) },
      top: { x: -0.5, y: COUNTER.height, z: counterZ + 0.3, context: counter },
      floor: { x: 0, y: 0, z: counterZ + COUNTER.depth + 0.18, context: counter },
      stand: { x: Math.min(1.7, width / 2 - 1.1), y: 0, z: 0.25, context: box([0.4, 0, 0], [width / 2 - 0.3, 2.1, 1]) },
    },
  };
}

function kitchen(env: RoomEnvironment): RoomLayout {
  const { width, height } = env;
  const boardX = -0.1;
  const tableX = 0.2;
  const tableZ = 1.75;
  const sideboard = backed(boardX, 0.02, SIDEBOARD.width, SIDEBOARD.depth, SIDEBOARD.height);
  return {
    room: "kitchen",
    width,
    height,
    depth: ROOM_DEPTH,
    // Janela depois da bancada (o azulejo da bancada não cobre o vidro).
    window: { wall: "left", center: KITCHEN_RUN.length + 0.75, width: 1, bottom: 0.95, top: 2.1, sheers: false },
    wallArt: env.hide.wallArt ? null : { x: boardX, y: 1.5, w: 0.7, h: 0.5 },
    rug: null,
    items: {
      sideboard: { x: boardX, z: 0.02 },
      dining: env.hide.table ? undefined : { x: tableX, z: tableZ },
      diningChairs: env.hide.table
        ? undefined
        : [
            { x: tableX - 0.42, z: tableZ - 0.62, yaw: 0 },
            { x: tableX + 0.42, z: tableZ - 0.62, yaw: 0 },
          ],
      kitchenRun: { x: -width / 2, z: 0 },
      pendant: { x: tableX, z: tableZ },
      plant: { x: width / 2 - 0.6, z: 0.45, height: 1.4 },
    },
    anchors: {
      paper: { x: boardX, y: 0, z: 0, context: wallBox(env) },
      wall: { x: boardX, y: SIDEBOARD.height + 0.3, z: 0, eye: 1.5, context: sideboard },
      table: { x: tableX, y: 0, z: tableZ, context: sideboard },
    },
  };
}

function bathroom(env: RoomEnvironment): RoomLayout {
  const { width, height } = env;
  const vanityX = -0.55;
  const towelX = 0.72;
  return {
    room: "bathroom",
    width,
    height,
    depth: ROOM_DEPTH,
    window: { wall: "left", center: 1.25, width: 0.8, bottom: 1.6, top: 2.2, sheers: false },
    wallArt: null,
    rug: null,
    items: {
      vanity: { x: vanityX, z: 0.02 },
      plant: { x: width / 2 - 0.42, z: 0.35, height: 0.85 },
    },
    anchors: {
      towel: { x: towelX, y: 1.2, z: 0, context: box([vanityX - VANITY.width / 2, 0, 0], [towelX + 0.45, 1.95, VANITY.depth]) },
    },
  };
}

const LAYOUTS: Record<RoomId, (env: RoomEnvironment) => RoomLayout> = { living, bedroom, office, store, kitchen, bathroom };

export function roomLayout(env: RoomEnvironment): RoomLayout {
  return LAYOUTS[env.preset.id](env);
}
