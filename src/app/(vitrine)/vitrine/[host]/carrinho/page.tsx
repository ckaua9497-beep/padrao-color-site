import type { Metadata } from "next";
import CartPageView from "@/components/cart/CartPageView";
import { freteApi } from "@/lib/frete-api";

export const metadata: Metadata = { title: "Carrinho", robots: { index: false } };

export default function VitrineCarrinho() {
  return (
    <div className="bg-page-cart">
      <div className="container-site py-12">
        <h1 className="mb-8 text-section font-bold">Carrinho</h1>
        <CartPageView
          resellerHint={false}
          pix
          deliveryNote={freteApi() ? "Calculado no checkout pelo CEP: você escolhe a forma de entrega." : "O valor do frete aparece no checkout."}
        />
      </div>
    </div>
  );
}
