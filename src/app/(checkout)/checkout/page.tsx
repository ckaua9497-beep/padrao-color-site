import type { Metadata } from "next";
import { connection } from "next/server";
import CheckoutView from "@/components/cart/CheckoutView";
import { ordersEnabled } from "@/lib/api/checkout";

export const metadata: Metadata = { title: "Finalizar compra", robots: { index: false, follow: false } };

export default async function CheckoutPage() {
  // Lido a cada requisição: ligar/desligar PADRAO_ORDERS_ENABLED não exige novo build.
  await connection();
  return <CheckoutView ordersEnabled={ordersEnabled()} />;
}
