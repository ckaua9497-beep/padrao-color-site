import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Admin da multiloja", template: "%s | Admin da multiloja" },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return <div className="flex min-h-full flex-1 flex-col bg-page-checkout">{children}</div>;
}
