"use client";

import { useMemo } from "react";
import Mockup3D from "@/components/mockup/Mockup3D";
import { DEFAULT_ART, type ArtSettings, type BodyType } from "@/components/mockup/art";
import { mockupSpec, type MockupProduct } from "@/lib/mockup";

export type TeeLabQuery = {
  size: string;
  body: BodyType;
  ghost: boolean;
  side: "front" | "back";
  text: string;
  back: string;
  color: string | null;
  print: string | null;
};

/**
 * Bancada de QA da camiseta (interna): um visualizador grande com tamanho, corpo, manequim, lado e
 * textos vindos da URL, para fotografar as combinações em sequência.
 */
export default function TeeLab({ product, query }: { product: MockupProduct & { slug: string; image?: string }; query: TeeLabQuery }) {
  const selection = useMemo(() => {
    const out: Record<string, string> = {};
    if (query.color) {
      const key = Object.keys(product.options).find((k) => /cor/i.test(k));
      const value = key ? product.options[key].find((v) => v.toLowerCase().includes(query.color!.toLowerCase())) : undefined;
      if (key && value) out[key] = value;
    }
    if (query.print) {
      const key = Object.keys(product.options).find((k) => /formato/i.test(k));
      const value = key ? product.options[key].find((v) => v.includes(query.print!)) : undefined;
      if (key && value) out[key] = value;
    }
    return out;
  }, [product.options, query.color, query.print]);
  const spec = useMemo(() => mockupSpec(product, selection), [product, selection]);
  const art = useMemo<ArtSettings>(
    () => ({
      ...DEFAULT_ART,
      text: query.text,
      mannequin: query.ghost ? null : { size: query.size, body: query.body, widthCm: null, lengthCm: null },
      back: query.back ? { ...DEFAULT_ART, text: query.back } : null,
    }),
    [query],
  );
  return (
    <div className="w-[820px] max-w-full">
      <Mockup3D spec={spec} art={art} label={product.name} fallbackImage={product.image} side={query.side} className="aspect-square w-full" />
    </div>
  );
}
