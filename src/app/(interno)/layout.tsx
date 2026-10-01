import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";

export const metadata: Metadata = {
  title: { default: "Design system", template: "%s | Design system Padrão Color" },
  robots: { index: false, follow: false },
};

const LINKS = [
  { href: "/design-system", label: "Design system" },
  { href: "/design-system/mockups", label: "Mockups 3D" },
];

export default function InternoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-line bg-white">
        <div className="container-site flex h-16 items-center justify-between gap-6">
          <Logo />
          <nav aria-label="Seções internas" className="flex gap-1 text-sm font-semibold">
            {LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-full px-4 py-2 hover:bg-mist">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </>
  );
}
