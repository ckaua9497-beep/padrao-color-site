"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sairAdmin } from "@/app/(admin)/admin/actions";
import { cx } from "@/components/ui/cx";

const LINKS = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/analises", label: "Análises" },
  { href: "/admin/pedidos", label: "Pedidos" },
  { href: "/admin/lojas", label: "Lojas" },
  { href: "/admin/saques", label: "Saques" },
  { href: "/admin/pagamentos", label: "Pagamentos" },
];

export default function AdminNav({ name, pendingWithdrawals }: { name: string; pendingWithdrawals: number }) {
  const pathname = usePathname();
  return (
    <header className="border-b border-line bg-ink text-white">
      <div className="container-site flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
        <p className="font-black">Multiloja · Admin</p>
        <nav aria-label="Admin" className="flex flex-1 flex-wrap gap-1">
          {LINKS.map((link) => {
            const active = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
            return (
              <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={cx("rounded-full px-4 py-2 text-[15px] font-bold", active ? "bg-white text-ink" : "hover:bg-white/10")}>
                {link.label}
                {link.href === "/admin/saques" && pendingWithdrawals > 0 && <span className="ml-1.5 rounded-full bg-coral px-2 text-[12px] text-ink">{pendingWithdrawals}</span>}
              </Link>
            );
          })}
        </nav>
        <span className="text-caption text-white/70">{name}</span>
        <form action={sairAdmin}>
          <button type="submit" className="rounded-full px-3 py-2 text-[14px] font-semibold hover:bg-white/10">
            Sair
          </button>
        </form>
      </div>
    </header>
  );
}
