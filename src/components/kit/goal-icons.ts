import type { ComponentType, SVGProps } from "react";
import { IconBadge, IconBalloon, IconGift, IconHeart, IconStorefront, IconTag, IconUsers } from "@/components/icons";
import type { KitIcon } from "@/lib/kit-builder";

/** Ícone de cada objetivo do Monte Seu Kit (assistente e página do Monte Seu Kit). */
export const GOAL_ICONS: Record<KitIcon, ComponentType<SVGProps<SVGSVGElement>>> = {
  users: IconUsers,
  gift: IconGift,
  badge: IconBadge,
  tag: IconTag,
  store: IconStorefront,
  heart: IconHeart,
  balloon: IconBalloon,
};
