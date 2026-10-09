import type { Metadata } from "next";
import ProductManager, { type ManagerRow } from "@/components/painel/ProductManager";
import { getProducts } from "@/lib/catalog";
import { requirePainel } from "@/lib/multiloja/auth";
import { MARGIN_MAX, MARGIN_MIN, PLAN_INFO, basePrice } from "@/lib/multiloja/core";
import { listLojaProdutos } from "@/lib/multiloja/repo";
import { baseFactor } from "@/lib/multiloja/tenant";

export const metadata: Metadata = { title: "Produtos e margens" };

export default async function PainelProdutos() {
  const { loja } = await requirePainel();
  const factor = baseFactor();
  const active = new Map(listLojaProdutos(loja.id).map((row) => [row.produtoId, row]));

  const rows: ManagerRow[] = getProducts()
    .filter((p) => p.price > 0)
    .map((p) => {
      const own = active.get(p.id);
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        categorySlug: p.categorySlug,
        image: p.image,
        base: basePrice(p.price, factor),
        qty: p.priceQty,
        perM2: Boolean(p.customSize),
        active: Boolean(own),
        margin: own?.margem ?? null,
        featured: own?.destaque ?? false,
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR"));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-title">Produtos e margens</h1>
        <p className="mt-1 max-w-3xl text-muted">
          Ative o que quer vender. O preço na loja é o preço base da Padrão Color mais a sua margem ({MARGIN_MIN}% a {MARGIN_MAX}%). Produto sem margem própria usa a margem padrão da loja.
        </p>
      </div>
      <ProductManager rows={rows} defaultMargin={loja.margemPadrao} maxActive={PLAN_INFO[loja.plano].maxProducts} planName={PLAN_INFO[loja.plano].name} />
    </div>
  );
}
