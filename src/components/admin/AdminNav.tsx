"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentType, type SVGProps } from "react";
import { sairAdmin } from "@/app/(admin)/admin/actions";
import { IconCard, IconChart, IconClose, IconGauge, IconLogout, IconMenu, IconReceipt, IconStorefront, IconWallet } from "@/components/icons";
import { Drawer } from "@/components/ui/Drawer";
import { cx } from "@/components/ui/cx";

/*
 * Menu lateral do admin, agrupado pelo trabalho: operação do dia (pedidos para produzir, saques para pagar), a rede
 * de lojas e a configuração. Os números do lado são a fila de cada área. No celular vira gaveta.
 * Assinatura: a tira de cor C·M·Y·K das folhas impressas, embaixo da marca.
 */

export type AdminNavCounts = { produzir: number; saques: number; lojas: number };

type Item = { href: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>>; count?: (c: AdminNavCounts) => number; urgent?: boolean };

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Operação",
    items: [
      { href: "/admin", label: "Visão geral", icon: IconGauge },
      { href: "/admin/pedidos", label: "Pedidos", icon: IconReceipt, count: (c) => c.produzir, urgent: true },
      { href: "/admin/saques", label: "Saques", icon: IconWallet, count: (c) => c.saques, urgent: true },
    ],
  },
  {
    label: "Rede",
    items: [
      { href: "/admin/lojas", label: "Lojas", icon: IconStorefront, count: (c) => c.lojas },
      { href: "/admin/analises", label: "Análises", icon: IconChart },
    ],
  },
  { label: "Configuração", items: [{ href: "/admin/pagamentos", label: "Pagamentos", icon: IconCard }] },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

function ColorBar() {
  return (
    <span aria-hidden className="flex h-1 w-full overflow-hidden rounded-full">
      <span className="flex-1 bg-cyan" />
      <span className="flex-1 bg-magenta" />
      <span className="flex-1 bg-sun" />
      <span className="flex-1 bg-ink" />
    </span>
  );
}

function NavBody({ name, counts, gateway, onNavigate }: { name: string; counts: AdminNavCounts; gateway: { label: string; live: boolean }; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-5 pt-6">
        <Link href="/admin" onClick={onNavigate} className="block rounded-thumb outline-offset-4">
          <Image src="/logo-padrao-color.png" alt="Padrão Color" width={272} height={111} className="h-9 w-auto" priority />
          <span className="mt-2 block text-[13px] font-bold">Multiloja · Admin</span>
        </Link>
        <div className="mt-4">
          <ColorBar />
        </div>
      </div>

      <nav aria-label="Admin" className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const count = item.count?.(counts) ?? 0;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "flex h-10 items-center gap-3 rounded-thumb px-3 text-[14px] transition-colors duration-150",
                        active ? "bg-ink font-bold text-white" : "font-semibold text-ink-soft hover:bg-mist",
                      )}
                    >
                      <Icon className={cx("size-[18px] shrink-0", active ? "text-white" : "text-muted")} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {count > 0 && (
                        <span
                          className={cx(
                            "min-w-6 rounded-full px-1.5 text-center text-[12px] font-bold leading-5 tabular-nums",
                            active ? "bg-white/15 text-white" : item.urgent ? "bg-coral-50 text-coral-700" : "text-muted",
                          )}
                        >
                          {count}
                          <span className="sr-only">{item.urgent ? " para resolver" : ""}</span>
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="space-y-3 border-t border-line px-5 py-4">
        <Link href="/admin/pagamentos" onClick={onNavigate} className="flex items-center gap-2 text-[13px] text-muted hover:text-ink">
          <span aria-hidden className={cx("size-2 shrink-0 rounded-full", gateway.live ? "bg-lime-700" : "bg-sun")} />
          <span className="truncate">
            Pagamento: <strong className="font-semibold text-ink">{gateway.label}</strong>
          </span>
        </Link>
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[13px] font-semibold">{name}</p>
          <form action={sairAdmin}>
            <button type="submit" className="flex h-9 items-center gap-1.5 rounded-thumb px-2.5 text-[13px] font-semibold text-muted transition-colors hover:bg-mist hover:text-ink">
              <IconLogout className="size-4" />
              Sair
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function AdminNav(props: { name: string; counts: AdminNavCounts; gateway: { label: string; live: boolean } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-line bg-white lg:block">
        <NavBody {...props} />
      </aside>

      <div className="sticky top-0 z-header flex items-center justify-between border-b border-line bg-white px-4 py-2.5 lg:hidden">
        <Link href="/admin" className="flex items-center gap-2.5">
          <Image src="/logo-padrao-color.png" alt="Padrão Color" width={272} height={111} className="h-7 w-auto" priority />
          <span className="text-[13px] font-bold">Admin</span>
        </Link>
        <button type="button" onClick={() => setOpen(true)} aria-label="Abrir menu do admin" aria-expanded={open} className="grid size-11 place-items-center rounded-full hover:bg-mist">
          <IconMenu className="size-6" />
        </button>
      </div>

      <Drawer open={open} onClose={() => setOpen(false)} label="Menu do admin" side="left" width="w-[300px]">
        <button type="button" onClick={() => setOpen(false)} aria-label="Fechar menu" className="absolute right-3 top-3 z-10 grid size-11 place-items-center rounded-full hover:bg-mist">
          <IconClose className="size-5" />
        </button>
        <NavBody {...props} onNavigate={() => setOpen(false)} />
      </Drawer>
    </>
  );
}
