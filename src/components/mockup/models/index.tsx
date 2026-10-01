"use client";

import type { ComponentType } from "react";
import type { MockupKind } from "@/lib/mockup-kinds";
import { CardModel, StickerModel, BookModel, TentModel, SheetModel, FoldedModel } from "./paper";
import { PanelModel, AcrylicModel, KeychainModel, CanvasModel, MatModel, CoasterModel, BoxModel } from "./rigid";
import { NeonModel, BannerModel, LightboxModel, RollupModel, FlagModel, HardwareModel } from "./signage";
import { ApronModel, BagModel, BandanaModel, CapModel, ClothModel, CushionModel, PetBedModel, TshirtModel } from "./textile";
import { MugModel, TumblerModel, BottleModel } from "./drinkware";
import { FlipflopModel, PenModel, FanModel, LanyardModel, BadgeModel, WristbandModel } from "./accessories";
import { PaperpackModel, WallCalendarModel, PassportModel, HangtagModel, BookmarkModel } from "./stationery";
import { SockModel, ShortsModel, SwimsuitModel } from "./apparel";
import { PuzzleModel, RulerModel, PhoneStandModel, WobblerModel } from "./desk";
import { SleepMaskModel, NeckPillowModel, LapDeskModel } from "./comfort";
import { BackpackModel, DrawstringModel, CoolerModel, DuffelModel } from "./bags";
import { TowelModel, CurtainModel, BeddingModel, TableclothModel } from "./linens";
import { WallpaperModel, MagnetModel, CylinderModel } from "./interior";
import type { ModelProps } from "./shared";

export type { ModelProps } from "./shared";

/** Um componente por tipo. O Record obriga todo kind novo do registro a ganhar um modelo. */
const MODELS: Record<MockupKind, ComponentType<ModelProps>> = {
  card: CardModel,
  sheet: SheetModel,
  folded: FoldedModel,
  sticker: StickerModel,
  book: BookModel,
  tent: TentModel,
  panel: PanelModel,
  acrylic: AcrylicModel,
  keychain: KeychainModel,
  canvas: CanvasModel,
  mat: MatModel,
  rug: MatModel,
  board: MatModel,
  coaster: CoasterModel,
  box: BoxModel,
  neon: NeonModel,
  banner: BannerModel,
  lightbox: LightboxModel,
  rollup: RollupModel,
  flag: FlagModel,
  hardware: HardwareModel,
  mug: MugModel,
  tumbler: TumblerModel,
  bottle: BottleModel,
  tshirt: TshirtModel,
  cap: CapModel,
  apron: ApronModel,
  bandana: BandanaModel,
  cloth: ClothModel,
  cushion: CushionModel,
  petbed: PetBedModel,
  bag: BagModel,
  flipflop: FlipflopModel,
  pen: PenModel,
  fan: FanModel,
  lanyard: LanyardModel,
  badge: BadgeModel,
  wristband: WristbandModel,
  paperpack: PaperpackModel,
  wallcalendar: WallCalendarModel,
  passport: PassportModel,
  hangtag: HangtagModel,
  bookmark: BookmarkModel,
  sock: SockModel,
  shorts: ShortsModel,
  swimsuit: SwimsuitModel,
  puzzle: PuzzleModel,
  ruler: RulerModel,
  phonestand: PhoneStandModel,
  wobbler: WobblerModel,
  sleepmask: SleepMaskModel,
  neckpillow: NeckPillowModel,
  lapdesk: LapDeskModel,
  backpack: BackpackModel,
  drawstring: DrawstringModel,
  cooler: CoolerModel,
  duffel: DuffelModel,
  towel: TowelModel,
  curtain: CurtainModel,
  bedding: BeddingModel,
  tablecloth: TableclothModel,
  wallpaper: WallpaperModel,
  magnet: MagnetModel,
  cylinder: CylinderModel,
};

export function MockupModel(props: ModelProps) {
  const Model = MODELS[props.spec.kind] ?? SheetModel;
  return <Model {...props} />;
}
