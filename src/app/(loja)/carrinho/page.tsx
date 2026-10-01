import type { Metadata } from "next";
import CartPageView from "@/components/cart/CartPageView";

export const metadata: Metadata = { title: "Carrinho" };

export default function CartPage() {
  return (
    <div className="bg-page-cart">
      <div className="container-site py-12">
        <h1 className="mb-8 text-section font-bold">Carrinho</h1>
        <CartPageView />
      </div>
    </div>
  );
}
