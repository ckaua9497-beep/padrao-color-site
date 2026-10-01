import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { CartProvider } from "@/components/cart/CartProvider";
import "./globals.css";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: {
    default: "Padrão Color | Gráfica online com mockup 3D",
    template: "%s | Padrão Color",
  },
  description:
    "Gráfica e comunicação visual: cartões, banners, brindes, vestuário e LED neon. Configure, envie sua arte e veja o produto em 3D antes de imprimir.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${figtree.variable} h-full antialiased`} data-scroll-behavior="smooth">
      <body className="flex min-h-full flex-col">
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
