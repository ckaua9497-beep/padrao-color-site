"use client";

import Link from "next/link";
import { cx } from "@/components/ui/cx";
import { useCustomer } from "@/lib/customer";
import { IconUsuario } from "./icones";

/**
 * Entrada da conta no topo, com o ícone de usuário do Figma: leva ao login para visitante e à conta para quem está
 * logado (ponto verde; azul para revendedor). Enquanto a sessão carrega, aponta para /conta (o servidor manda para
 * o login se precisar).
 */
export function ContaLink({ className }: { className?: string }) {
  const customer = useCustomer();
  const loading = customer.status === "loading";
  const logged = customer.status === "customer" || customer.status === "reseller";
  const reseller = customer.status === "reseller";
  const name = logged ? (customer.name?.split(" ")[0] ?? "") : "";
  const label = logged ? `Minha conta${name ? ` (${name}${reseller ? ", revendedor" : ""})` : ""}` : loading ? "Minha conta" : "Entrar ou criar conta";
  return (
    <Link
      href={logged || loading ? "/conta" : "/conta/entrar"}
      className={cx("relative grid size-11 shrink-0 place-items-center rounded-full transition-colors duration-200 hover:bg-ink/5", className)}
      aria-label={label}
      title={label}
    >
      <IconUsuario className="size-[26px] lg:size-[34px]" />
      {logged && <span aria-hidden className={cx("absolute right-1 top-1 size-2.5 rounded-full ring-2 ring-white", reseller ? "bg-preview" : "bg-lime-700")} />}
    </Link>
  );
}
