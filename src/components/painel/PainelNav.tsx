"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { IconClose, IconMenu } from "@/components/icons";
import { cx } from "@/components/ui/cx";
import { sair } from "@/app/(painel)/painel/actions";

const LINKS = [
  { href: "/painel", label: "Início" },
  { href: "/painel/produtos", label: "Produtos e margens" },
  { href: "/painel/loja", label: "Dados da loja" },
  { href: "/painel/aparencia", label: "Aparência" },
  { href: "/painel/conta", label: "Minha conta" },
];

/** Menu lateral do painel (vira gaveta no celular). */
export default function PainelNav({ storeName, storeUrl, ownerName }: { storeName: string; storeUrl: string; ownerName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav aria-label="Painel" className="flex flex-col gap-1">
      {LINKS.map((link) => {
        const active = link.href === "/painel" ? pathname === "/painel" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cx("rounded-control px-4 py-3 text-[15px] font-bold transition-colors", active ? "bg-ink text-white" : "hover:bg-mist")}
          >
            {link.label}
          </Link>
        );
      })}
      <a href={storeUrl} target="_blank" rel="noreferrer" className="mt-3 rounded-control border border-line px-4 py-3 text-[15px] font-bold hover:border-ink">
        Ver minha loja ↗
      </a>
      <form action={sair} className="mt-1">
        <button type="submit" className="w-full rounded-control px-4 py-3 text-left text-[15px] font-semibold text-muted hover:bg-mist hover:text-ink">
          Sair
        </button>
      </form>
    </nav>
  );

  return (
    <>
      <div className="flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:hidden">
        <p className="min-w-0 truncate font-bold">{storeName}</p>
        <button type="button" onClick={() => setOpen(true)} aria-label="Abrir menu do painel" aria-expanded={open} className="grid size-11 place-items-center rounded-full hover:bg-mist">
          <IconMenu aria-hidden className="size-6" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-drawer bg-overlay lg:hidden" onClick={() => setOpen(false)}>
          <div className="h-full w-[min(320px,85vw)] overflow-y-auto bg-white p-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Menu do painel">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-bold">{storeName}</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar menu" className="grid size-11 place-items-center rounded-full hover:bg-mist">
                <IconClose aria-hidden className="size-5" />
              </button>
            </div>
            {nav}
          </div>
        </div>
      )}

      <aside className="hidden w-64 shrink-0 border-r border-line bg-white p-5 lg:block">
        <div className="sticky top-5">
          <p className="truncate text-lg font-black">{storeName}</p>
          <p className="mb-6 truncate text-caption text-muted">{ownerName}</p>
          {nav}
        </div>
      </aside>
    </>
  );
}
