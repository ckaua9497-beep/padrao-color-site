"use client";

import { CardModel, StickerModel, BookModel, TentModel, SheetModel } from "./paper";
import { PanelModel, AcrylicModel, KeychainModel, CanvasModel, MatModel, BoxModel } from "./rigid";
import { NeonModel, BannerModel, LightboxModel, RollupModel, FlagModel } from "./signage";
import { ApronModel, BagModel, BandanaModel, CapModel, ClothModel, CushionModel, PetBedModel, TshirtModel } from "./textile";
import { MugModel, TumblerModel, BottleModel } from "./drinkware";
import type { ModelProps } from "./shared";

export type { ModelProps } from "./shared";

export function MockupModel(props: ModelProps) {
  switch (props.spec.kind) {
    case "card":
      return <CardModel {...props} />;
    case "sticker":
      return <StickerModel {...props} />;
    case "panel":
      return <PanelModel {...props} />;
    case "acrylic":
      return <AcrylicModel {...props} />;
    case "keychain":
      return <KeychainModel {...props} />;
    case "neon":
      return <NeonModel {...props} />;
    case "canvas":
      return <CanvasModel {...props} />;
    case "mat":
    case "rug":
    case "coaster":
    case "board":
      return <MatModel {...props} />;
    case "banner":
      return <BannerModel {...props} />;
    case "lightbox":
      return <LightboxModel {...props} />;
    case "rollup":
      return <RollupModel {...props} />;
    case "flag":
    case "hardware":
      return <FlagModel {...props} />;
    case "cloth":
      return <ClothModel {...props} />;
    case "apron":
      return <ApronModel {...props} />;
    case "bandana":
      return <BandanaModel {...props} />;
    case "mug":
      return <MugModel {...props} />;
    case "tumbler":
      return <TumblerModel {...props} />;
    case "bottle":
      return <BottleModel {...props} />;
    case "tshirt":
      return <TshirtModel {...props} />;
    case "cap":
      return <CapModel {...props} />;
    case "cushion":
      return <CushionModel {...props} />;
    case "petbed":
      return <PetBedModel {...props} />;
    case "book":
      return <BookModel {...props} />;
    case "tent":
      return <TentModel {...props} />;
    case "bag":
      return <BagModel {...props} />;
    case "box":
      return <BoxModel {...props} />;
    default:
      return <SheetModel {...props} />;
  }
}
