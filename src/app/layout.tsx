import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { CartProvider } from "@/components/cart/CartProvider";
import { CustomerProvider } from "@/lib/customer";
import "./globals.css";

// Figtree é variável (300–900): um arquivo só, sem lista de pesos.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Padrão Color | Gráfica online com mockup 3D",
    template: "%s | Padrão Color",
  },
  description:
    "Gráfica e comunicação visual: cartões, banners, brindes, vestuário e LED neon. Configure, envie sua arte e veja o produto em 3D antes de imprimir.",
};

// As animações de entrada só escondem o conteúdo quando há JS para mostrá-lo: isso fica no CSS
// (@media (scripting: enabled), em globals.css), sem script no <head>.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${figtree.variable} h-full antialiased`} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <CustomerProvider>
          <CartProvider>{children}</CartProvider>
        </CustomerProvider>
      </body>
    </html>
  );
}
