"use client";

import dynamic from "next/dynamic";
import type { CatalogPhotoProps } from "./CatalogPhoto";

// Só no navegador: a estampa e a foto usam canvas e WebGL.
const CatalogPhoto = dynamic(() => import("./CatalogPhoto"), { ssr: false });

export default function CatalogPhotoClient(props: CatalogPhotoProps) {
  return <CatalogPhoto {...props} />;
}
