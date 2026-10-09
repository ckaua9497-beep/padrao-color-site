import type { NextRequest } from "next/server";
import { catalogProduct, quantityLimits, variationQuantityLimits } from "@/lib/api/prices";

/**
 * GET /api/precos/limites?grupos=1,2,3 → { limits: { "<grupo>": { minQty, maxQty, variations? } } }
 * Limites de quantidade dos produtos do carrinho (catálogo, iguais para todo cliente: pode ir para cache).
 * `variations`: faixa própria de cada variação que tem uma (id → [mínimo, máximo]).
 */
export function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("grupos") ?? "";
  const ids = [...new Set(raw.split(",").map((value) => value.trim()))].filter((value) => /^\d{1,9}$/.test(value)).slice(0, 60);
  const limits: Record<string, { minQty: number; maxQty: number; variations?: Record<string, [number, number]> }> = {};
  for (const id of ids) {
    const product = catalogProduct(Number(id));
    if (!product) continue;
    const variations = variationQuantityLimits(product);
    limits[id] = { ...quantityLimits(product), ...(variations ? { variations } : {}) };
  }
  return Response.json({ limits }, { headers: { "Cache-Control": "public, max-age=600" } });
}
