import Link from "next/link";
import type { ReactNode } from "react";
import Logo from "@/components/Logo";

/** Moldura das telas de entrar e criar loja. */
export default function AuthShell({ title, subtitle, children, aside }: { title: string; subtitle: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="container-site flex h-20 items-center justify-between">
        <Logo />
        <Link href="/" className="text-[15px] font-semibold underline-offset-4 hover:underline">
          Voltar ao site
        </Link>
      </header>
      <div className="container-site grid flex-1 items-start gap-10 py-8 lg:grid-cols-[1fr_440px] lg:py-14">
        <div className="mx-auto w-full max-w-xl rounded-panel bg-white p-6 shadow-panel md:p-10 lg:mx-0">
          <h1 className="text-title">{title}</h1>
          <p className="mt-2 text-[15px] text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
        {aside}
      </div>
    </div>
  );
}
