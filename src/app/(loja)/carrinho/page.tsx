import type { Metadata } from "next";
import CartPageView from "@/components/cart/CartPageView";

export const metadata: Metadata = { title: "Carrinho" };

export default function CartPage() {
  return (
    <div className="bg-[#f9f9f9]">
      <div className="mx-auto max-w-[1300px] px-5 py-12 md:px-10">
        <h1 className="mb-8 text-[clamp(32px,3.4vw,44px)] font-bold tracking-[-0.02em]">Carrinho</h1>
        <CartPageView />
      </div>
    </div>
  );
}
