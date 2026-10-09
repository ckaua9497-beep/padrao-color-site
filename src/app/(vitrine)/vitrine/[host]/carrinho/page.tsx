import type { Metadata } from "next";
import CartPageView from "@/components/cart/CartPageView";

export const metadata: Metadata = { title: "Carrinho", robots: { index: false } };

export default function VitrineCarrinho() {
  return (
    <div className="bg-page-cart">
      <div className="container-site py-12">
        <h1 className="mb-8 text-section font-bold">Carrinho</h1>
        <CartPageView resellerHint={false} />
      </div>
    </div>
  );
}
