"use client";

import { CardModel, StickerModel, BookModel, TentModel, SheetModel } from "./paper";
import { PanelModel, AcrylicModel, CanvasModel, MatModel, BoxModel } from "./rigid";
import { NeonModel, BannerModel, RollupModel, FlagModel } from "./signage";
import { ClothModel, TshirtModel, CapModel, CushionModel, BagModel } from "./textile";
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
    case "keychain":
      return <AcrylicModel {...props} />;
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
    case "lightbox":
      return <BannerModel {...props} />;
    case "rollup":
      return <RollupModel {...props} />;
    case "flag":
    case "hardware":
      return <FlagModel {...props} />;
    case "cloth":
    case "apron":
    case "bandana":
      return <ClothModel {...props} />;
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
    case "petbed":
      return <CushionModel {...props} />;
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
