import type { Metadata } from "next";
import CheckoutView from "@/components/cart/CheckoutView";

export const metadata: Metadata = { title: "Finalizar compra" };

export default function CheckoutPage() {
  return <CheckoutView />;
}
