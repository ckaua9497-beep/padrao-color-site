"use client";

import Link from "next/link";
import { cx } from "@/components/ui/cx";
import { useCustomer } from "@/lib/customer";

/**
 * Entrada da conta no topo (ícone, ao lado do carrinho): leva ao login para visitante e à conta para quem está
 * logado (ponto verde; azul para revendedor). Enquanto a sessão carrega, aponta para /conta (o servidor manda
 * para o login se precisar).
 */
export function AccountLink({ className }: { className?: string }) {
  const customer = useCustomer();
  const loading = customer.status === "loading";
  const logged = customer.status === "customer" || customer.status === "reseller";
  const reseller = customer.status === "reseller";
  const name = logged ? (customer.name?.split(" ")[0] ?? "") : "";
  const label = logged ? `Minha conta${name ? ` (${name}${reseller ? ", revendedor" : ""})` : ""}` : loading ? "Minha conta" : "Entrar ou criar conta";
  return (
    <Link
      href={logged || loading ? "/conta" : "/conta/entrar"}
      className={cx("relative grid size-11 place-items-center rounded-full transition-colors hover:bg-mist", className)}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 24 24" className="size-5.5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" strokeLinecap="round" />
      </svg>
      {logged && <span aria-hidden className={cx("absolute right-2 top-2 size-2 rounded-full ring-2 ring-white", reseller ? "bg-preview" : "bg-lime-700")} />}
    </Link>
  );
}
