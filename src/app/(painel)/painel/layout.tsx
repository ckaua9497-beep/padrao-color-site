import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Painel do lojista", template: "%s | Painel do lojista" },
  robots: { index: false, follow: false },
};

export default function PainelRootLayout({ children }: LayoutProps<"/painel">) {
  return <div className="flex min-h-full flex-1 flex-col bg-page-checkout">{children}</div>;
}
