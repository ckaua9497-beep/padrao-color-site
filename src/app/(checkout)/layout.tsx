import Link from "next/link";
import Image from "next/image";
import { IconShield } from "@/components/icons";

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-page-checkout">
      <header className="on-dark bg-ink">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-5">
          <Link href="/" aria-label="Voltar para a loja" className="rounded-thumb bg-white px-2.5 py-1.5">
            <Image src="/logo-padrao-color.png" alt="Padrão Color" width={272} height={111} className="h-8 w-auto" />
          </Link>
          <span className="flex items-center gap-2 text-[13px] font-semibold text-lime">
            <IconShield aria-hidden className="size-6" /> Compra segura
          </span>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="py-8 text-center text-[13px] text-muted">Padrão Color © {new Date().getFullYear()}. Todos os direitos reservados.</footer>
    </div>
  );
}
