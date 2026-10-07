"use client";

import Link from "next/link";
import { cx } from "@/components/ui/cx";
import { useCustomer } from "@/lib/customer";

/** Entrada da conta no topo: "Entrar" para visitante, primeiro nome para quem está logado. */
export function AccountLink({ className }: { className?: string }) {
  const customer = useCustomer();
  const logged = customer.status === "customer" || customer.status === "reseller";
  const label = logged ? (customer.name?.split(" ")[0] ?? "Minha conta") : "Entrar";
  return (
    <Link
      href={logged ? "/conta" : "/conta/entrar"}
      className={cx("flex h-11 items-center gap-2 rounded-full px-3 text-[15px] font-bold transition-colors hover:bg-mist", className)}
      aria-label={logged ? `Minha conta (${label})` : "Entrar ou criar conta"}
    >
      <svg viewBox="0 0 24 24" className="size-5.5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" strokeLinecap="round" />
      </svg>
      <span className="hidden 2xl:inline">{label}</span>
    </Link>
  );
}
